/**
 * Local, dependency-free text embeddings (feature hashing).
 *
 * Words and word-bigrams are hashed into a fixed-size vector which is then
 * L2-normalised, so cosine similarity == dot product. It needs no API key and
 * works offline. To use a neural embedding model later, only replace
 * `embed()` below (keep the output a normalised number[]; set DIM to match).
 */
const DIM = 384;

const STOP = new Set(
  "a an the and or but if then else of to in on at by for with from as is are was were be been being this that these those it its i you we they he she them our your my not no do does did can could should would will just so than too very into out up down over under again".split(
    " ",
  ),
);

function hash(str) {
  // FNV-1a 32 bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function embed(text) {
  const vec = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const h = hash(tokens[i]);
    vec[h % DIM] += (h & 0x80000000) === 0 ? 1 : -1;
    if (i < tokens.length - 1) {
      const hb = hash(tokens[i] + "_" + tokens[i + 1]);
      vec[hb % DIM] += ((hb & 0x80000000) === 0 ? 1 : -1) * 0.5;
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

module.exports = { embed, cosine, tokenize, DIM };
