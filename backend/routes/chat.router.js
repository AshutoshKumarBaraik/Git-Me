const express = require("express");
const chatController = require("../controllers/chatController");
const chatAuth = require("../middleware/chatAuth");

const chatRouter = express.Router();

chatRouter.use("/chat", chatAuth);
chatRouter.post("/chat/:repoId/message", chatController.sendMessage);
chatRouter.get("/chat/:repoId/history", chatController.getHistory);
chatRouter.delete("/chat/:repoId/history", chatController.clearHistory);
chatRouter.get("/chat/:repoId/status", chatController.getStatus);
chatRouter.get("/chat/:repoId/features", chatController.getFeatureStatus);
chatRouter.post("/chat/:repoId/reindex", chatController.reindex);

module.exports = chatRouter;
