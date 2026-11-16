/**
 * LLM access + an offline fallback so the chatbot still answers when no API
 * key is configured.
 *
 * Provider order:
 *   1. OpenRouter (OPENROUTER_API_KEY)  - OpenAI-compatible chat completions
 *   2. Anthropic  (ANTHROPIC_API_KEY)   - Messages API (legacy / optional)
 *   3. offline heuristics               - no key at all
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function provider() {
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function hasKey() {
  return !!provider();
}

/** Messages must start with "user" and alternate roles. */
function normalise(messages) {
  const out = [];
  for (const m of messages) {
    if (!m.content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function askOpenRouter({ system, messages, maxTokens, temperature }) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      // optional headers OpenRouter uses for attribution
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:5173",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Git-Me",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "system", content: system }, ...normalise(messages)],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`OpenRouter error: ${JSON.stringify(data.error).slice(0, 300)}`);
  return String(data.choices?.[0]?.message?.content || "").trim();
}

async function askAnthropic({ system, messages, maxTokens, temperature }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: maxTokens,
      temperature,
      system,
      messages: normalise(messages),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function askLLM({ system, messages, maxTokens = 1800, temperature = 0.4 }) {
  const p = provider();
  if (!p) throw new Error("No LLM API key configured");
  const args = { system, messages, maxTokens, temperature };
  return p === "openrouter" ? askOpenRouter(args) : askAnthropic(args);
}

/** Ask the model for JSON and parse it (tolerates ```json fences / stray prose). */
async function askLLMJson({ system, messages, maxTokens = 3000 }) {
  const text = await askLLM({ system, messages, maxTokens, temperature: 0.1 });
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[\[{]/);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("Model did not return JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

/* ---------------- offline fallback ---------------- */

const FEATURE_CHECKS = [
  { name: "User authentication", re: /(jwt|passport|bcrypt|login|signup|oauth|session)/i, tip: "Add sign-up / login with hashed passwords and token-based sessions." },
  { name: "Automated tests", re: /(jest|mocha|vitest|pytest|unittest|describe\(|it\(|\.test\.|\.spec\.)/i, tip: "Add unit and integration tests, and run them on every push." },
  { name: "CI/CD pipeline", re: /(github\/workflows|jenkins|gitlab-ci|circleci|dockerfile|docker-compose)/i, tip: "Add a CI pipeline (lint + test + build) and a Dockerfile for repeatable deploys." },
  { name: "Input validation", re: /(joi|zod|yup|express-validator|validate)/i, tip: "Validate all request payloads on the server (e.g. with Zod or Joi)." },
  { name: "Error handling & logging", re: /(winston|pino|morgan|logger|try\s*\{|catch\s*\()/i, tip: "Centralise error handling and add structured request logging." },
  { name: "API documentation", re: /(swagger|openapi|postman)/i, tip: "Publish OpenAPI/Swagger docs so the API is easy to consume." },
  { name: "Search & filtering", re: /(search|filter|query)/i, tip: "Add search, filtering and pagination for lists." },
  { name: "Notifications", re: /(socket\.io|websocket|notification|email|nodemailer)/i, tip: "Add real-time or email notifications for important events." },
  { name: "Role-based access control", re: /(role|permission|authorize|isAdmin)/i, tip: "Add roles / permissions (owner, collaborator, viewer)." },
  { name: "Rate limiting & security headers", re: /(rate-?limit|helmet)/i, tip: "Add rate limiting and security headers (e.g. helmet)." },
];

function srsTemplate(repo, files, contextText) {
  const feats = FEATURE_CHECKS.filter((f) => f.re.test(contextText)).map((f) => f.name);
  return `# Software Requirements Specification — ${repo.name}

## 1. Introduction
**Purpose:** ${repo.description || "Describe what this software does and who it is for."}
**Scope:** Features and boundaries of the system.
**Files detected:** ${files.slice(0, 12).join(", ") || "none yet"}

## 2. Overall Description
- **Users:** (e.g. developers, admins, end users)
- **Operating environment:** (web browser, Node.js server, database)
- **Assumptions & constraints:** (tech stack, deadlines, hosting)

## 3. Functional Requirements
${feats.length ? feats.map((f, i) => `- FR-${i + 1}: The system shall provide **${f}**.`).join("\n") : "- FR-1: (list each feature as a \"The system shall…\" statement)"}

## 4. Non-Functional Requirements
- **Performance:** key pages respond in under 2 seconds.
- **Security:** passwords hashed, input validated, HTTPS in production.
- **Reliability:** graceful error handling, backups of the database.
- **Usability:** responsive UI, clear error messages.

## 5. Future Enhancements
Ask me for *feature recommendations* to fill this in.`;
}

function offlineAnswer({ message, repo, files, hasSRS, context }) {
  const text = `${context}\n${files.join(" ")}`;
  const wantsSrs = /\bsrs\b|requirement spec|software requirement/i.test(message);
  const note =
    "\n\n> ℹ️ Offline mode — set `OPENROUTER_API_KEY` on the server for full AI answers.";

  if (wantsSrs) {
    return `Here's a starting **SRS draft** based on what I can see in the repository:\n\n${srsTemplate(repo, files, text)}${note}`;
  }

  const missing = FEATURE_CHECKS.filter((f) => !f.re.test(text)).slice(0, 6);
  const present = FEATURE_CHECKS.filter((f) => f.re.test(text)).map((f) => f.name);
  let out = `Here are feature recommendations for **${repo.name}**`;
  out += hasSRS ? " (I found your SRS and used it as context):" : " (no SRS file found — I used your code and description):";
  out += "\n\n";
  if (present.length) out += `**Already covered:** ${present.join(", ")}\n\n`;
  out += "**Suggested next features**\n";
  out += missing.length
    ? missing.map((f) => `- **${f.name}** — ${f.tip}`).join("\n")
    : "- Your project covers the common basics. Tell me about your target users and I can suggest more specific features.";
  if (!hasSRS) out += `\n\n💡 Tip: ask me to *"generate an SRS draft"* and commit it as \`SRS.md\` — I'll then use it to give sharper recommendations.`;
  return out + note;
}

module.exports = { askLLM, askLLMJson, hasKey, provider, offlineAnswer, FEATURE_CHECKS };
