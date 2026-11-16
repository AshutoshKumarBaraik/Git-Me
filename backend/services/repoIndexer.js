/**
 * Reads the files of a repository (latest version of each file across all
 * pushed commits, from S3), splits them into chunks and stores them in the
 * vector store. An SRS file is detected automatically but is OPTIONAL: the
 * chatbot works with or without one.
 */
const { s3, S3_BUCKET } = require("../config/aws-config");
const vectorStore = require("./vectorStore");

const MAX_FILE_BYTES = 200 * 1024;
const MAX_CHUNKS = 400;
const CHUNK_CHARS = 900;
const SKIP_FILES = new Set(["commit.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|mp3|mp4|mov|woff2?|ttf|eot|exe|dll|bin|class|jar)$/i;
const SRS_NAME =
  /(^|[\/_\-. ])srs([\/_\-. ]|$)|software[_\-. ]*requirement|requirements?[_\-. ]*(spec|document)|(^|\/)requirements\.(md|docx?)$/i;

function isSrsFile(name) {
  return SRS_NAME.test(name);
}

/** Latest version of every file, newest commit wins. */
function latestFiles(repo) {
  const map = new Map();
  for (const commit of repo.content || []) {
    for (const f of commit.files || []) {
      if (!f || !f.name || SKIP_FILES.has(f.name)) continue;
      map.set(f.name, { name: f.name, s3Url: f.s3Url, commitID: commit.commitID });
    }
  }
  return [...map.values()];
}

async function readFileText(file) {
  try {
    const key = decodeURIComponent(new URL(file.s3Url).pathname.slice(1));
    const obj = await s3.getObject({ Bucket: S3_BUCKET, Key: key }).promise();
    return obj.Body.toString("utf-8");
  } catch (_) {
    // bucket might be public: fall back to a plain HTTP request
    try {
      const res = await fetch(file.s3Url);
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      return null;
    }
  }
}

function chunkText(text) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let buf = "";
  for (const line of lines) {
    if (buf.length + line.length + 1 > CHUNK_CHARS && buf.trim()) {
      chunks.push(buf.trim());
      // small overlap: keep the last line for context
      buf = line + "\n";
    } else {
      buf += line + "\n";
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

async function indexRepository(repo) {
  // SRS files first: they must never be cut off by the MAX_CHUNKS cap.
  const files = latestFiles(repo)
    .filter((f) => !BINARY_EXT.test(f.name))
    .sort((a, b) => Number(isSrsFile(b.name)) - Number(isSrsFile(a.name)));
  const chunks = [];

  for (const file of files) {
    if (chunks.length >= MAX_CHUNKS) break;
    const text = await readFileText(file);
    if (!text || text.length > MAX_FILE_BYTES || text.includes("\u0000")) continue;
    const srs = isSrsFile(file.name);
    chunkText(text).forEach((t, i) => {
      if (chunks.length < MAX_CHUNKS)
        chunks.push({ source: file.name, commitID: file.commitID, chunkIndex: i, isSRS: srs, text: t });
    });
  }

  // Always index the repo description so the bot works for tiny/empty repos.
  if (repo.description) {
    chunks.push({
      source: "(repository description)",
      chunkIndex: 0,
      isSRS: false,
      text: `Repository "${repo.name}": ${repo.description}`,
    });
  }

  const count = await vectorStore.replaceRepoChunks(repo._id, chunks);
  return { files: files.length, chunks: count, hasSRS: files.some((f) => isSrsFile(f.name)) };
}

module.exports = { indexRepository, latestFiles, isSrsFile };
