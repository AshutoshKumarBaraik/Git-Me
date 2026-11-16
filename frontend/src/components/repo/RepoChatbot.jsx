import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import Markdown from "./Markdown";
import { API_URL, authHeader } from "../../config";
import "./RepoChatbot.css";

const QUICK_PROMPTS = [
  { label: "✅ Implemented vs pending", text: "Which SRS features are implemented and which are not implemented yet?" },
  { label: "💡 Suggest features", text: "Suggest new features I should add next, in SRS format with acceptance criteria." },
  { label: "📄 Generate SRS draft", text: "Generate an SRS (Software Requirements Specification) draft for this project." },
  { label: "🔍 Find gaps", text: "What gaps or missing pieces do you see in this project (security, testing, docs, UX)?" },
  { label: "🗺️ Build a roadmap", text: "Create a prioritised 3-step roadmap for this project." },
];

const RepoChatbot = ({ repoId, repoName, open, onOpenChange }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const api = useCallback(
    (path, opts = {}) =>
      axios({ url: `${API_URL}/chat/${repoId}${path}`, headers: authHeader(), ...opts }),
    [repoId],
  );

  // Load this user's saved conversation + repo status the first time it opens
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const [h, s] = await Promise.all([api("/history"), api("/status")]);
        if (cancelled) return;
        setMessages(h.data.messages || []);
        setStatus(s.data);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || "Could not load the assistant.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, api]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError("");
    setInput("");
    setMessages((m) => [...m, { _id: `tmp-${Date.now()}`, role: "user", content }]);
    setSending(true);
    try {
      const res = await api("/message", { method: "POST", data: { message: content } });
      setMessages((m) => [...m, res.data.message]);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!window.confirm("Delete this conversation for this repository?")) return;
    try {
      await api("/history", { method: "DELETE" });
      setMessages([]);
    } catch (err) {
      setError(err.response?.data?.error || "Could not clear the chat.");
    }
  };

  const reindex = async () => {
    try {
      await api("/reindex", { method: "POST" });
      const s = await api("/status");
      setStatus(s.data);
    } catch (err) {
      setError(err.response?.data?.error || "Re-index failed.");
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => onOpenChange(true)} aria-label="Open repository assistant">
        <span className="chat-fab-icon">✦</span>
        <span className="chat-fab-label">Ask assistant</span>
      </button>
    );
  }

  return (
    <aside className="chat-panel" role="dialog" aria-label="Repository assistant">
      <header className="chat-head">
        <div className="chat-head-title">
          <span className="chat-avatar">✦</span>
          <div>
            <strong>Repo assistant</strong>
            <small>{repoName}</small>
          </div>
        </div>
        <div className="chat-head-actions">
          <button className="icon-btn" onClick={reindex} title="Re-read repository files">↻</button>
          <button className="icon-btn" onClick={clearChat} title="Clear conversation">🗑</button>
          <button className="icon-btn" onClick={() => onOpenChange(false)} title="Close" aria-label="Close">✕</button>
        </div>
      </header>

      {status && (
        <div className={`chat-banner ${status.hasSRS ? "ok" : "warn"}`}>
          {status.hasSRS
            ? `✓ SRS found (${status.srsFiles[0]}) — recommendations follow it.`
            : "No SRS file found. I'll work from your code and description — or ask me to draft one."}
          {!status.aiEnabled && <div className="chat-banner-sub">Offline mode: add OPENROUTER_API_KEY on the server for online AI answers.</div>}
        </div>
      )}

      <div className="chat-body">
        {messages.length === 0 && !error && (
          <div className="chat-empty">
            <p>👋 Hi! I can check which SRS features of <strong>{repoName}</strong> are implemented, suggest new features in SRS format, draft an SRS, and find gaps.</p>
            <p className="muted">Your conversation is saved privately to your account for this repository.</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m._id} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">
              {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
              {m.role === "assistant" && m.sources?.length > 0 && (
                <div className="chat-sources">
                  {m.sources.slice(0, 5).map((s) => (
                    <span key={s} className="chat-source">{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="chat-msg assistant">
            <div className="chat-bubble typing" aria-label="Assistant is typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        {error && <div className="chat-error" role="alert">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-quick">
        {QUICK_PROMPTS.map((q) => (
          <button key={q.label} onClick={() => send(q.text)} disabled={sending}>{q.label}</button>
        ))}
      </div>

      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          maxLength={4000}
          placeholder="Ask about features, requirements, next steps…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="btn btn-primary" onClick={() => send()} disabled={sending || !input.trim()}>Send</button>
      </div>
    </aside>
  );
};

export default RepoChatbot;
