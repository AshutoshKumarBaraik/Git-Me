const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * A chunk of a repository file (or of the SRS) with its embedding vector.
 * This is the "project knowledge" the chatbot retrieves from.
 */
const RepoChunkSchema = new Schema({
  repository: { type: Schema.Types.ObjectId, ref: "Repository", required: true, index: true },
  source: { type: String, required: true }, // file name
  commitID: { type: String },
  chunkIndex: { type: Number, default: 0 },
  isSRS: { type: Boolean, default: false },
  text: { type: String, required: true },
  embedding: { type: [Number], default: [] },
});

module.exports = mongoose.model("RepoChunk", RepoChunkSchema);
