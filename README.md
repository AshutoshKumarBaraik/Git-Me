# Git-Me

A mini GitHub clone: CLI (init / add / commit / push to S3) + Express/MongoDB API + React dashboard,
now with a **per-repository AI assistant** for feature recommendations.

## Run

```bash
# backend
cd backend && cp .env.example .env   # fill in values
npm install
node index.js start

# frontend
cd frontend && npm install
npm run dev                          # set VITE_API_URL in .env if the API isn't on :3000
```

## Repository chatbot

Open any repository and click **✦ Assistant** (tab, sidebar button or floating button).

* **SRS implementation status:** the bot reads every requirement in `SRS.md` (`FR-1: The system shall …`, "shall" sentences,
  tables, or bullets under a *Functional Requirements* heading) and checks the code to mark each one
  ✅ implemented, 🟡 partial or ❌ not implemented. Ask *"which SRS features are implemented?"* or click
  **✅ Implemented vs pending**. With an API key the model verifies each requirement against the code; without one
  a keyword-matching estimate is shown (and labelled as such). Results are cached per commit.
* **Online feature suggestions:** powered by [OpenRouter](https://openrouter.ai). Suggestions come in a fixed format
  (priority, effort, an SRS-style `FR-n: The system shall …` line, acceptance criteria, where it fits) and end with a
  block you can paste straight into your SRS.
* **Feature recommendations**, SRS drafts, gap analysis and roadmaps.
* **SRS is optional.** If a file like `SRS.md`, `software_requirements.md` or `requirements.md` is pushed, it is
  detected and used as primary context; otherwise the bot works from your code + description and can draft an SRS.
* **Vector database:** project files (chunked) and every chat message are embedded and stored in MongoDB
  (`repochunks` and `chatmessages` collections). Chats are scoped per **user + repository**, so each person has an
  individual conversation. Relevant older messages are retrieved by similarity (long-term memory) in addition
  to the last few messages.
* On every `push`, the repo is re-indexed in the background. `POST /chat/:repoId/reindex` forces it.
* Set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`) in `backend/.env` for online AI answers.
  Without it the bot runs in a basic offline mode. `ANTHROPIC_API_KEY` still works as a fallback provider.

### API (all require `Authorization: Bearer <token>`)

| Method | Route | Purpose |
|---|---|---|
| POST | `/chat/:repoId/message` | `{ message }` -> AI reply (saves both messages + embeddings) |
| GET | `/chat/:repoId/history` | the logged-in user's saved conversation |
| DELETE | `/chat/:repoId/history` | clear it |
| GET | `/chat/:repoId/status` | SRS found?, indexed chunks, AI enabled? |
| GET | `/chat/:repoId/features` | every SRS requirement with status `implemented` / `partial` / `not_implemented` (`?refresh=1` re-checks) |
| POST | `/chat/:repoId/reindex` | rebuild the repo index |

### Swapping the vector backend
`backend/services/vectorStore.js` is the only file that touches vectors. Similarity is cosine over embeddings stored
in MongoDB. For Atlas Vector Search / Qdrant / Chroma, replace `topK()` and the save/search functions there.
`backend/services/embeddings.js` is a local hashing embedder; swap `embed()` for a neural embedding model for better
semantic matching (keep `DIM` in sync).
