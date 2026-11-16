/**
 * Vector store backed by MongoDB (the database the project already uses).
 *
 *  - RepoChunk    -> project knowledge (code, README, SRS)
 *  - ChatMessage  -> per-user, per-repository chat memory
 *
 * Similarity search is done with cosine similarity over the stored
 * embeddings. That is plenty for per-repo data volumes. If you move to
 * MongoDB Atlas, replace `topK()` with an Atlas `$vectorSearch` aggregation
 * on the `embedding` field - nothing else has to change.
 */
const ChatMessage = require("../models/chatMessageModel");
const RepoChunk = require("../models/repoChunkModel");
const { embed, cosine } = require("./embeddings");

function topK(items, queryVec, k, minScore = 0.05) {
  return items
    .map((item) => ({ item, score: cosine(queryVec, item.embedding) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/* ---------- project knowledge ---------- */

async function replaceRepoChunks(repoId, chunks) {
  await RepoChunk.deleteMany({ repository: repoId });
  if (!chunks.length) return 0;
  const docs = chunks.map((c) => ({
    repository: repoId,
    source: c.source,
    commitID: c.commitID,
    chunkIndex: c.chunkIndex,
    isSRS: !!c.isSRS,
    text: c.text,
    embedding: embed(`${c.source}\n${c.text}`),
  }));
  await RepoChunk.insertMany(docs);
  return docs.length;
}

async function countRepoChunks(repoId) {
  return RepoChunk.countDocuments({ repository: repoId });
}

async function searchRepoChunks(repoId, query, k = 6) {
  const all = await RepoChunk.find({ repository: repoId, isSRS: false }).lean();
  return topK(all, embed(query), k).map((r) => ({ ...r.item, score: r.score }));
}

async function getSrsChunks(repoId, limit = 6) {
  return RepoChunk.find({ repository: repoId, isSRS: true })
    .sort({ source: 1, chunkIndex: 1 })
    .limit(limit)
    .lean();
}

/** Every SRS chunk in document order (the analyzer needs the WHOLE SRS, not a sample). */
async function getAllSrsText(repoId) {
  const chunks = await RepoChunk.find({ repository: repoId, isSRS: true })
    .sort({ source: 1, chunkIndex: 1 })
    .select("source chunkIndex text")
    .lean();
  const bySource = new Map();
  for (const c of chunks) bySource.set(c.source, (bySource.get(c.source) || "") + c.text + "\n");
  return [...bySource.entries()].map(([source, text]) => ({ source, text }));
}

/** All non-SRS chunks without their embeddings (used to look for implemented features). */
async function getCodeChunks(repoId) {
  return RepoChunk.find({ repository: repoId, isSRS: false })
    .select("source chunkIndex text")
    .sort({ source: 1, chunkIndex: 1 })
    .lean();
}

async function listIndexedFiles(repoId) {
  return RepoChunk.distinct("source", { repository: repoId });
}

/* ---------- chat memory ---------- */

async function saveMessage({ repoId, userId, role, content, sources = [] }) {
  return ChatMessage.create({
    repository: repoId,
    user: userId,
    role,
    content,
    sources,
    embedding: embed(content),
  });
}

async function getHistory(repoId, userId, limit = 100) {
  const msgs = await ChatMessage.find({ repository: repoId, user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("-embedding")
    .lean();
  return msgs.reverse();
}

/** Semantically similar older messages of this user's chat in this repo. */
async function searchMemory(repoId, userId, query, k = 4, excludeRecent = 6) {
  const msgs = await ChatMessage.find({ repository: repoId, user: userId })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  const older = msgs.slice(excludeRecent); // recent ones are sent verbatim anyway
  return topK(older, embed(query), k, 0.15)
    .map((r) => r.item)
    .reverse();
}

async function clearHistory(repoId, userId) {
  const r = await ChatMessage.deleteMany({ repository: repoId, user: userId });
  return r.deletedCount;
}

async function deleteRepoData(repoId) {
  await Promise.all([
    RepoChunk.deleteMany({ repository: repoId }),
    ChatMessage.deleteMany({ repository: repoId }),
  ]);
}

module.exports = {
  replaceRepoChunks,
  countRepoChunks,
  searchRepoChunks,
  getSrsChunks,
  getAllSrsText,
  getCodeChunks,
  listIndexedFiles,
  saveMessage,
  getHistory,
  searchMemory,
  clearHistory,
  deleteRepoData,
};
