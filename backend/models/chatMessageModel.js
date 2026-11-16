const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * One chat message (user or assistant) + its embedding vector.
 * Messages are scoped to (repository, user), so every person gets an
 * individual conversation per repository.
 */
const ChatMessageSchema = new Schema({
  repository: { type: Schema.Types.ObjectId, ref: "Repository", required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  embedding: { type: [Number], default: [] },
  sources: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

ChatMessageSchema.index({ repository: 1, user: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
