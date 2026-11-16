const mongoose = require("mongoose");
const Repository = require("../models/repoModel");
const vectorStore = require("../services/vectorStore");
const { indexRepository, latestFiles, isSrsFile } = require("../services/repoIndexer");
const { askLLM, hasKey, provider, offlineAnswer } = require("../services/llm");
const srsAnalyzer = require("../services/srsAnalyzer");

/** "which features are implemented / pending / missing in my SRS?" */
function isStatusQuestion(message) {
  const m = message.toLowerCase();
  const about = /(srs|requirement|spec|feature)/.test(m);
  const asks = /(implemented|unimplemented|not implemented|not yet|pending|remaining|completed|status|progress|\bdone\b|missing|left to|to do|todo|coverage|checklist)/.test(m);
  return about && asks && !/(suggest|recommend|new feature|idea|enhanc|improve)/.test(m);
}

const SUGGESTION_FORMAT = `When you suggest features, ALWAYS use exactly this format for each one (so the user can paste it into the SRS), ordered by priority:

### <n>. <Feature title>  ·  Priority: High|Medium|Low  ·  Effort: S|M|L
- **Why:** one sentence on the user/business value
- **Requirement:** \`<next free FR id>: The system shall …\` (one testable "shall" statement)
- **Acceptance criteria:**
  - Given … when … then …
  - (2-3 criteria)
- **Where it fits:** existing files/modules it would touch, or "new module"
- **Status in SRS:** Not in SRS yet | Listed but not implemented | Partially implemented

Continue the requirement numbering from the "Next free requirement id" given below. Suggest 3-6 features unless asked otherwise.
Put features that are already listed in the SRS but NOT implemented first, then genuinely new enhancements. Never suggest something already marked IMPLEMENTED.
End with a fenced \`\`\`markdown block containing all suggested requirements as SRS lines ready to paste.`;

function validRepo(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function loadRepo(req, res) {
  const { repoId } = req.params;
  if (!validRepo(repoId)) {
    res.status(400).json({ error: "Invalid repository ID!" });
    return null;
  }
  const repo = await Repository.findById(repoId);
  if (!repo) {
    res.status(404).json({ error: "Repository not found!" });
    return null;
  }
  return repo;
}

/** Index the repo if nothing is indexed yet (first chat after a push). */
async function ensureIndexed(repo) {
  const count = await vectorStore.countRepoChunks(repo._id);
  if (count === 0 && (repo.content?.length || repo.description)) {
    await indexRepository(repo);
  }
}

function buildSystemPrompt(repo, files, hasSRS, srsChunks, chunks, analysis) {
  const srsBlock = srsChunks.length
    ? `\n\n## SRS (Software Requirements Specification) from the repository\n${srsChunks
        .map((c) => `[${c.source}]\n${c.text}`)
        .join("\n---\n")}`
    : "\n\n(No SRS file was found in this repository. Base your advice on the code and description. If helpful, offer to draft an SRS.)";

  const codeBlock = chunks.length
    ? `\n\n## Relevant project excerpts\n${chunks.map((c) => `[${c.source}]\n${c.text}`).join("\n---\n")}`
    : "";

  return `You are the Git-Me assistant embedded in the repository "${repo.name}".
Your main job is FEATURE RECOMMENDATION: suggest concrete, prioritised features and improvements for this project, explain why each matters, and give a rough effort level (S/M/L). You can also generate or improve an SRS document, find gaps, and suggest roadmaps.
Rules:
- Ground answers in the repository context below; mention file names when relevant.
- Be concise, use Markdown (short headings, bullet lists).
- Never invent files or features that are not in the context; if you're unsure, say so.
- If an SRS exists, make sure recommendations are consistent with it and point out requirements that are not implemented yet. Use the "SRS requirement status" list below as the source of truth for what is implemented, partial or not implemented.

${SUGGESTION_FORMAT}

Repository: ${repo.name}
Description: ${repo.description || "(none)"}
Visibility: ${repo.visibility ? "public" : "private"}
Commits pushed: ${repo.content?.length || 0}
Files: ${files.slice(0, 60).join(", ") || "(none pushed yet)"}
SRS present: ${hasSRS ? "yes" : "no"}${srsAnalyzer.promptBlock(analysis)}${srsBlock}${codeBlock}`;
}

/* POST /chat/:repoId/message  { message } */
async function sendMessage(req, res) {
  try {
    const repo = await loadRepo(req, res);
    if (!repo) return;
    const userId = req.userId;
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({ error: "Message is required!" });
    if (message.length > 4000) return res.status(400).json({ error: "Message is too long (max 4000 characters)." });

    await ensureIndexed(repo);

    const files = latestFiles(repo).map((f) => f.name);
    const hasSRS = files.some(isSrsFile);

    // 1) retrieve project knowledge  2) retrieve this user's relevant past chat
    const [chunks, srsChunks, memory, recent] = await Promise.all([
      vectorStore.searchRepoChunks(repo._id, message, 6),
      vectorStore.getSrsChunks(repo._id, 6),
      vectorStore.searchMemory(repo._id, userId, message, 4),
      vectorStore.getHistory(repo._id, userId, 6),
    ]);

    const sources = [...new Set([...srsChunks.map((c) => c.source), ...chunks.map((c) => c.source)])];

    // Which SRS requirements are implemented? (cached per commit; AI-verified when a key is set)
    const statusQuestion = hasSRS && isStatusQuestion(message);
    let analysis = null;
    if (hasSRS) {
      try {
        analysis = await srsAnalyzer.analyzeRepo(repo, { useAI: statusQuestion });
      } catch (err) {
        console.error("SRS analysis failed:", err.message);
      }
    }

    let reply;
    let mode = "ai";
    let llmError = null;
    if (statusQuestion && analysis) {
      // Deterministic, structured answer built from the analysis (no free-form guessing).
      reply = srsAnalyzer.formatReport(analysis);
      mode = analysis.verifiedBy === "heuristic" ? "offline" : "ai";
    } else if (hasKey()) {
      const memoryNote = memory.length
        ? `Earlier in this user's conversation (retrieved by similarity):\n${memory
            .map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
            .join("\n")}\n\n---\n`
        : "";
      try {
        reply = await askLLM({
          system: buildSystemPrompt(repo, files, hasSRS, srsChunks, chunks, analysis),
          messages: [
            ...recent.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: memoryNote + message },
          ],
        });
      } catch (err) {
        console.error("LLM error:", err.message);
        mode = "offline";
        llmError = err.message;
      }
    } else {
      mode = "offline";
    }

    if (mode === "offline" || !reply) {
      mode = "offline";
      reply = offlineAnswer({
        message,
        repo,
        files,
        hasSRS,
        context: [...srsChunks, ...chunks].map((c) => c.text).join("\n"),
      });
      if (analysis?.requirements?.length && !/\bsrs\b|requirement spec/i.test(message)) {
        reply =
          srsAnalyzer.offlineSuggestions(analysis) +
          "\n\n> ℹ️ Offline mode — set `OPENROUTER_API_KEY` on the server for AI feature ideas with acceptance criteria.";
      }
      if (llmError) reply += `\n\n> ⚠️ The online AI request failed, so this is an offline answer. (${llmError.slice(0, 140)})`;
    }

    await vectorStore.saveMessage({ repoId: repo._id, userId, role: "user", content: message });
    const saved = await vectorStore.saveMessage({
      repoId: repo._id,
      userId,
      role: "assistant",
      content: reply,
      sources,
    });

    res.json({
      reply,
      sources,
      mode,
      message: { _id: saved._id, role: "assistant", content: reply, sources, createdAt: saved.createdAt },
    });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Chat failed. Please try again." });
  }
}

/* GET /chat/:repoId/history */
async function getHistory(req, res) {
  try {
    const repo = await loadRepo(req, res);
    if (!repo) return;
    const messages = await vectorStore.getHistory(repo._id, req.userId, 100);
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load chat history." });
  }
}

/* DELETE /chat/:repoId/history */
async function clearHistory(req, res) {
  try {
    const repo = await loadRepo(req, res);
    if (!repo) return;
    const deleted = await vectorStore.clearHistory(repo._id, req.userId);
    res.json({ message: "Chat cleared.", deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not clear chat." });
  }
}

/* GET /chat/:repoId/status */
async function getStatus(req, res) {
  try {
    const repo = await loadRepo(req, res);
    if (!repo) return;
    const files = latestFiles(repo).map((f) => f.name);
    const chunks = await vectorStore.countRepoChunks(repo._id);
    res.json({
      hasSRS: files.some(isSrsFile),
      srsFiles: files.filter(isSrsFile),
      fileCount: files.length,
      indexedChunks: chunks,
      aiEnabled: hasKey(),
      provider: provider(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load status." });
  }
}

/* GET /chat/:repoId/features[?refresh=1]  -> SRS requirements with implemented / partial / not_implemented */
async function getFeatureStatus(req, res) {
  try {
    const repo = await loadRepo(req, res);
    if (!repo) return;
    await ensureIndexed(repo);
    const analysis = await srsAnalyzer.analyzeRepo(repo, { useAI: true, force: req.query.refresh === "1" });
    if (!analysis) return res.json({ hasSRS: false, requirements: [], summary: null });
    res.json({ hasSRS: true, ...analysis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not analyse the SRS." });
  }
}

/* POST /chat/:repoId/reindex */
async function reindex(req, res) {
  try {
    const repo = await loadRepo(req, res);
    if (!repo) return;
    const result = await indexRepository(repo);
    res.json({ message: "Repository re-indexed.", ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Re-index failed." });
  }
}

module.exports = { sendMessage, getHistory, clearHistory, getStatus, getFeatureStatus, reindex };
