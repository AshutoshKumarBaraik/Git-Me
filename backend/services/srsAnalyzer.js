/**
 * SRS implementation analyzer.
 *
 * Reads the SRS (e.g. SRS.md) of a repository, extracts every requirement and
 * decides for each one whether it is IMPLEMENTED, PARTIAL or NOT IMPLEMENTED
 * by looking at the project's code.
 *
 *  1. parseRequirements()  - pure function, turns SRS markdown into a list.
 *  2. heuristicStatus()    - offline keyword-coverage match against the code.
 *  3. verifyWithLLM()      - (OpenRouter) the model reads the requirement and
 *                            the best matching code and confirms / corrects it.
 *
 * Without an API key only steps 1-2 run (clearly marked as "estimated").
 */
const vectorStore = require("./vectorStore");
const { tokenize } = require("./embeddings");
const { askLLMJson, hasKey } = require("./llm");

const MAX_REQUIREMENTS = 80;
const BATCH_SIZE = 10;
const NON_CODE = /\.(md|markdown|txt|docx?|rst)$/i;

/* ------------------------------------------------------------------ */
/* 1. parsing                                                          */
/* ------------------------------------------------------------------ */

const ID_RE = /^((?:FR|NFR|REQ|UC|US|SRS|F|R)[-_ ]?\d+(?:\.\d+)*)\s*[:.)\-–—]?\s*(.*)$/i;
const SHALL_RE = /\b(shall|must|should be able to|will allow|will provide|needs? to)\b/i;
const FEATURE_HEADING_RE = /(feature|functional|requirement|module|capabilit|use case|user stor|scope|function)/i;
const NFR_HEADING_RE = /(non[-\s]?functional|performance|security|reliab|usab|quality|constraint|maintain|portab)/i;
const SKIP_HEADING_RE = /(introduction|purpose|glossary|definition|reference|revision|history|overview|assumption|table of contents|appendix|stakeholder)/i;

function cleanLine(raw) {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/^[\s>]*(?:[-+•]|\d+[.)])\s+/, "")
    .replace(/^\s*\[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseRequirements(srsText) {
  const lines = String(srsText || "").replace(/\r\n/g, "\n").split("\n");
  const found = [];
  const seen = new Set();
  let heading = "";
  let headingKind = "neutral"; // feature | nfr | skip | neutral
  let inCode = false;

  const push = (id, text, kind) => {
    text = text.trim();
    if (text.length < 8) return;
    const key = normKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const isNfr = kind === "nfr" || /^NFR/i.test(id || "");
    found.push({ id: id ? id.toUpperCase().replace(/[_ ]/g, "-") : null, text, section: heading, type: isNfr ? "non-functional" : "functional" });
  };

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      heading = cleanLine(h[2]);
      headingKind = NFR_HEADING_RE.test(heading) ? "nfr" : SKIP_HEADING_RE.test(heading) ? "skip" : FEATURE_HEADING_RE.test(heading) ? "feature" : "neutral";
      continue;
    }

    // markdown table row:  | FR-1 | Login | Users can sign in |
    if (/^\s*\|/.test(raw)) {
      if (/^\s*\|[\s:|-]+\|?\s*$/.test(raw)) continue; // separator row
      const cells = raw.split("|").map(cleanLine).filter(Boolean);
      if (!cells.length) continue;
      const idm = ID_RE.exec(cells[0]);
      if (idm && /\d/.test(cells[0])) {
        const rest = [idm[2], ...cells.slice(1)].filter(Boolean);
        // skip header-like rows ("ID | Requirement | Priority")
        push(idm[1], rest.join(" — "), headingKind);
      }
      continue;
    }

    const line = cleanLine(raw);
    if (!line) continue;

    const idm = ID_RE.exec(line);
    if (idm && idm[2] && /\d/.test(idm[1])) {
      push(idm[1], idm[2], headingKind);
      continue;
    }
    if (headingKind === "skip") continue;
    if (SHALL_RE.test(line) && line.split(" ").length >= 4) {
      push(null, line, headingKind);
      continue;
    }
    // plain bullets under a "Features / Functional requirements" style heading
    const isBullet = /^\s*(?:[-*+•]|\d+[.)])\s+/.test(raw);
    if (isBullet && (headingKind === "feature" || headingKind === "nfr") && line.split(" ").length >= 2) {
      push(null, line, headingKind);
    }
  }

  // auto-number the ones without an explicit id
  let f = 0;
  let n = 0;
  const used = new Set(found.map((r) => r.id).filter(Boolean));
  for (const r of found) {
    if (r.id) continue;
    let id;
    do id = r.type === "non-functional" ? `NFR-${++n}` : `FR-${++f}`;
    while (used.has(id));
    used.add(id);
    r.id = id;
  }
  return found.slice(0, MAX_REQUIREMENTS);
}

/** Next free functional-requirement id, so suggestions continue the SRS numbering. */
function nextRequirementId(reqs) {
  let max = 0;
  for (const r of reqs) {
    const m = /^FR-(\d+)$/.exec(r.id || "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `FR-${max + 1}`;
}

/* ------------------------------------------------------------------ */
/* 2. offline heuristic                                                */
/* ------------------------------------------------------------------ */

const GENERIC = new Set(
  "system shall must should will user users able allow allows provide provides support supports feature features application app software ability option options page screen need needs using use used via per also each every any all new existing data information".split(
    " ",
  ),
);

/** Cheap stemmer: first 5 letters, so create/created/creation or register/registration line up. */
function stem(t) {
  return t.slice(0, 5);
}

function keywords(text) {
  return [...new Set(tokenize(text).filter((t) => !GENERIC.has(t)).map(stem).filter((t) => t.length > 2))];
}

/** One token-set per code file (docs/README are not evidence of implementation). */
function buildFileIndex(codeChunks) {
  const files = new Map();
  for (const c of codeChunks) {
    if (NON_CODE.test(c.source) || c.source.startsWith("(")) continue;
    let f = files.get(c.source);
    if (!f) {
      f = { source: c.source, tokens: new Set(keywords(c.source)), chunks: [] };
      files.set(c.source, f);
    }
    keywords(c.text).forEach((t) => f.tokens.add(t));
    f.chunks.push(c);
  }
  return [...files.values()];
}

function heuristicStatus(req, fileIndex) {
  const kws = keywords(`${req.text} ${req.section || ""}`.slice(0, 400));
  const own = keywords(req.text);
  const reqKw = own.length ? own : kws;
  if (!reqKw.length || !fileIndex.length) {
    return { status: "not_implemented", confidence: "low", score: 0, files: [], reason: "No matching code found." };
  }
  const scored = fileIndex
    .map((f) => ({ f, hit: reqKw.filter((k) => f.tokens.has(k)) }))
    .filter((x) => x.hit.length)
    .sort((a, b) => b.hit.length - a.hit.length)
    .slice(0, 3);

  const covered = new Set();
  scored.slice(0, 2).forEach((x) => x.hit.forEach((k) => covered.add(k)));
  const score = covered.size / reqKw.length;
  const status = score >= 0.6 ? "implemented" : score >= 0.34 ? "partial" : "not_implemented";
  const files = scored.map((x) => x.f.source);
  return {
    status,
    confidence: reqKw.length >= 3 ? "medium" : "low",
    score: Math.round(score * 100) / 100,
    files,
    reason: files.length
      ? `Keyword match ${Math.round(score * 100)}% (${[...covered].slice(0, 6).join(", ")}) in ${files.slice(0, 2).join(", ")}.`
      : "No matching code found.",
    _best: scored[0]?.f,
    _kw: reqKw,
  };
}

/** Best snippet(s) of the best file, for showing the LLM. */
function evidenceSnippets(h, max = 2, len = 450) {
  if (!h._best) return [];
  const kw = new Set(h._kw);
  return h._best.chunks
    .map((c) => ({ c, s: keywords(c.text).filter((t) => kw.has(t)).length }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map(({ c }) => `[${c.source}]\n${c.text.slice(0, len)}`);
}

/* ------------------------------------------------------------------ */
/* 3. LLM verification (OpenRouter)                                    */
/* ------------------------------------------------------------------ */

const VERIFY_SYSTEM = `You are a strict software auditor. For each requirement from a Software Requirements Specification (SRS) decide whether the project's code implements it.
Use ONLY the file list and code excerpts provided. Status values:
- "implemented": the code clearly does what the requirement says
- "partial": some of it exists, or it exists but a key part is missing
- "not_implemented": no evidence in the code
Be conservative: no evidence in the excerpts means "not_implemented" (the excerpts are only the best keyword matches, so also use the file list as a hint).
Reply with ONLY a JSON array, no prose, one object per requirement:
[{"id":"FR-1","status":"implemented|partial|not_implemented","reason":"one short sentence","files":["file names that prove it"]}]`;

async function verifyBatch(batch, allFiles) {
  const body = batch
    .map(
      ({ req, h }) =>
        `### ${req.id} — ${req.text}\nOffline guess: ${h.status}\nCode excerpts:\n${evidenceSnippets(h).join("\n---\n") || "(none found)"}`,
    )
    .join("\n\n");
  const out = await askLLMJson({
    system: VERIFY_SYSTEM,
    messages: [{ role: "user", content: `Project files: ${allFiles.slice(0, 120).join(", ")}\n\n${body}` }],
    maxTokens: 2500,
  });
  return Array.isArray(out) ? out : out.results || out.requirements || [];
}

const STATUSES = new Set(["implemented", "partial", "not_implemented"]);

async function verifyWithLLM(items, allFiles) {
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
  const settled = await Promise.allSettled(batches.map((b) => verifyBatch(b, allFiles)));
  let verified = 0;
  let lastError = null;
  settled.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      lastError = r.reason?.message || String(r.reason);
      return;
    }
    for (const v of r.value) {
      const item = batches[i].find((x) => x.req.id === v?.id);
      if (!item || !STATUSES.has(v.status)) continue;
      item.final = {
        status: v.status,
        confidence: "high",
        reason: String(v.reason || "").slice(0, 300) || item.h.reason,
        files: Array.isArray(v.files) && v.files.length ? v.files.map(String).slice(0, 4) : item.h.files,
      };
      verified++;
    }
  });
  return { verified, lastError };
}

/* ------------------------------------------------------------------ */
/* orchestration + cache                                               */
/* ------------------------------------------------------------------ */

const cache = new Map(); // repoId -> { sig, ai, result }

function signature(repo) {
  const commits = repo.content || [];
  return `${commits.length}:${commits[commits.length - 1]?.commitID || ""}`;
}

function summarise(requirements) {
  const counts = { implemented: 0, partial: 0, not_implemented: 0 };
  for (const r of requirements) counts[r.status]++;
  const total = requirements.length;
  const percent = total ? Math.round(((counts.implemented + counts.partial * 0.5) / total) * 100) : 0;
  return { total, ...counts, percent };
}

/**
 * @param {object} repo     Repository document
 * @param {{useAI?: boolean, force?: boolean}} opts
 * @returns {Promise<null | {srsFiles, requirements, summary, verifiedBy, warning?}>}
 *          null when the repo has no SRS (or no requirements could be read from it)
 */
async function analyzeRepo(repo, { useAI = false, force = false } = {}) {
  const sig = signature(repo);
  const wantAI = useAI && hasKey();
  const hit = cache.get(String(repo._id));
  if (!force && hit && hit.sig === sig && (hit.ai || !wantAI)) return hit.result;

  const srsDocs = await vectorStore.getAllSrsText(repo._id);
  if (!srsDocs.length) return null;

  const seen = new Set();
  const requirements = [];
  for (const d of srsDocs) {
    for (const r of parseRequirements(d.text)) {
      const key = normKey(r.text);
      if (seen.has(key)) continue;
      seen.add(key);
      requirements.push({ ...r, srsFile: d.source });
    }
  }
  if (!requirements.length) {
    return { srsFiles: srsDocs.map((d) => d.source), requirements: [], summary: summarise([]), verifiedBy: "none" };
  }

  const codeChunks = await vectorStore.getCodeChunks(repo._id);
  const fileIndex = buildFileIndex(codeChunks);
  const allFiles = fileIndex.map((f) => f.source);
  const items = requirements.map((req) => ({ req, h: heuristicStatus(req, fileIndex) }));

  let verifiedBy = "heuristic";
  let warning;
  if (wantAI) {
    const { verified, lastError } = await verifyWithLLM(items, allFiles);
    if (verified) verifiedBy = verified === items.length ? "ai" : "ai+heuristic";
    if (lastError) warning = `AI check failed for some requirements (${lastError.slice(0, 120)}); those use the offline estimate.`;
  }

  const out = items.map(({ req, h, final }) => {
    const f = final || h;
    return {
      id: req.id,
      text: req.text,
      type: req.type,
      section: req.section,
      status: f.status,
      confidence: f.confidence,
      reason: f.reason,
      files: f.files || [],
    };
  });

  const result = {
    srsFiles: srsDocs.map((d) => d.source),
    requirements: out,
    summary: summarise(out),
    verifiedBy,
    nextId: nextRequirementId(out),
    ...(warning ? { warning } : {}),
  };
  cache.set(String(repo._id), { sig, ai: verifiedBy.startsWith("ai"), result });
  return result;
}

/* ------------------------------------------------------------------ */
/* presentation                                                        */
/* ------------------------------------------------------------------ */

const ICON = { implemented: "✅", partial: "🟡", not_implemented: "❌" };

function formatReport(a) {
  const s = a.summary;
  if (!s.total) {
    return `I found **${a.srsFiles.join(", ")}** but could not extract individual requirements from it.\n\nTip: write requirements as lines like \`FR-1: The system shall …\` or as bullets under a **Functional Requirements** heading.`;
  }
  const group = (status) => a.requirements.filter((r) => r.status === status);
  const line = (r) => {
    const where = r.files?.length ? ` — _${r.files.slice(0, 2).join(", ")}_` : "";
    const why = r.status === "implemented" ? "" : r.reason ? `\n  ${r.reason}` : "";
    return `- **${r.id}** ${r.text.length > 140 ? r.text.slice(0, 137) + "…" : r.text}${where}${why}`;
  };
  const section = (status, title) => {
    const g = group(status);
    return g.length ? `### ${ICON[status]} ${title} (${g.length})\n${g.map(line).join("\n")}` : "";
  };

  const basis =
    a.verifiedBy === "heuristic"
      ? "\n\n> ℹ️ Estimated from keyword matching only. Add `OPENROUTER_API_KEY` on the server for an AI-verified check."
      : a.verifiedBy === "ai+heuristic"
        ? "\n\n> ℹ️ Mostly AI-verified; a few items use the offline estimate."
        : "";
  const warn = a.warning ? `\n\n> ⚠️ ${a.warning}` : "";

  return [
    `## SRS implementation status — ${a.srsFiles[0]}`,
    `**${s.percent}% done** · ✅ ${s.implemented} implemented · 🟡 ${s.partial} partial · ❌ ${s.not_implemented} not implemented (of ${s.total} requirements)`,
    section("implemented", "Implemented"),
    section("partial", "Partially implemented"),
    section("not_implemented", "Not implemented yet"),
    "Ask me to **suggest features** and I'll propose the missing ones (and new ideas) in SRS format you can paste straight into your SRS.",
  ]
    .filter(Boolean)
    .join("\n\n") + basis + warn;
}

/** Offline stand-in for "suggest features": the SRS requirements that are still open, in SRS format. */
function offlineSuggestions(a) {
  const open = a.requirements.filter((r) => r.status !== "implemented").slice(0, 6);
  if (!open.length) return "Every requirement in your SRS looks implemented. 🎉 Add `OPENROUTER_API_KEY` on the server and I can suggest brand-new features online.";
  const items = open.map((r, i) => {
    const title = r.text.length > 70 ? r.text.slice(0, 67) + "…" : r.text;
    return `### ${i + 1}. ${title}  ·  Priority: ${r.status === "partial" ? "Medium" : "High"}\n- **Requirement:** \`${r.id}: ${/shall/i.test(r.text) ? r.text : "The system shall " + r.text.charAt(0).toLowerCase() + r.text.slice(1)}\`\n- **Status in SRS:** ${r.status === "partial" ? "Partially implemented" : "Listed but not implemented"}${r.files?.length ? `\n- **Where it fits:** ${r.files.slice(0, 2).join(", ")}` : ""}`;
  });
  return `These SRS requirements are still open — build them next:\n\n${items.join("\n\n")}`;
}

/** Compact version for the LLM system prompt. */
function promptBlock(a) {
  if (!a || !a.requirements.length) return "";
  const lines = a.requirements.map(
    (r) => `- ${r.id} [${r.status.toUpperCase()}] ${r.text.slice(0, 160)}${r.files?.length ? ` (files: ${r.files.slice(0, 2).join(", ")})` : ""}`,
  );
  return `\n\n## SRS requirement status (${a.verifiedBy === "heuristic" ? "estimated" : "AI-verified"}; ${a.summary.percent}% done)\n${lines.join("\n")}\nNext free requirement id: ${a.nextId}`;
}

module.exports = { parseRequirements, analyzeRepo, formatReport, offlineSuggestions, promptBlock, nextRequirementId, heuristicStatus, buildFileIndex };
