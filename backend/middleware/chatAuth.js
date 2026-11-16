const jwt = require("jsonwebtoken");

/** Verifies the JWT issued at login and exposes the user id as req.userId. */
module.exports = function chatAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please log in to use the assistant." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET_KEY);
    if (!payload.id) throw new Error("no id");
    req.userId = String(payload.id);
    next();
  } catch (err) {
    res.status(401).json({ error: "Your session expired. Please log in again." });
  }
};
