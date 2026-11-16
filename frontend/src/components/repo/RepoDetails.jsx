import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import Navbar from "../Navbar";
import RepoChatbot from "./RepoChatbot";
import { API_URL } from "../../config";
import "./repoDetails.css";

const AVATAR = "https://github.githubassets.com/images/gravatars/gravatar-user-420.png";
const HIDDEN_FILES = new Set(["commit.json"]);

const RepoDetails = () => {
  const { id } = useParams();
  const [result, setResult] = useState({ id: null, repo: null, notFound: false });
  const [chatOpen, setChatOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  useEffect(() => {
    axios
      .get(`${API_URL}/repo/${id}`)
      .then((res) => setResult({ id, repo: res.data.repository, notFound: false }))
      .catch((err) => {
        console.error("Failed to fetch repository details:", err);
        setResult({ id, repo: null, notFound: true });
      });
  }, [id]);

  // Results belong to the id they were fetched for, so navigating shows "Loading…"
  const repo = result.id === id ? result.repo : null;
  const notFound = result.id === id && result.notFound;

  // Latest version of every file across all pushed commits
  const files = useMemo(() => {
    const map = new Map();
    (repo?.content || []).forEach((commit) => {
      (commit.files || []).forEach((f) => {
        if (!HIDDEN_FILES.has(f.name)) map.set(f.name, { ...f, commitID: commit.commitID });
      });
    });
    return [...map.values()];
  }, [repo]);

  const visibleFiles = files.filter((f) => f.name.toLowerCase().includes(fileFilter.toLowerCase()));
  const hasSRS = files.some((f) => /(^|[/_\-. ])srs([/_\-. ]|$)|software[_\-. ]*requirement/i.test(f.name));
  const latestCommit = repo?.content?.length ? repo.content[repo.content.length - 1] : null;
  const ownerName = repo?.owner?.username || "unknown";

  const openFile = async (file) => {
    setSelectedFile(file);
    setFileContent("Loading…");
    try {
      const res = await fetch(file.s3Url);
      setFileContent(await res.text());
    } catch (err) {
      console.error(err);
      setFileContent("Error loading file content.");
    }
  };

  if (!repo) {
    return (
      <>
        <Navbar />
        <div className="page">
          <p className="muted">{notFound ? "Repository not found." : "Loading…"}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />

      <div className="repo-tabs">
        <div className="repo-tabs-container">
          <div className="repo-title">
            <img src={AVATAR} alt="" />
            <span className="owner">{ownerName}</span>
            <span className="muted">/</span>
            <strong className="repo-name-link">{repo.name}</strong>
            <span className="badge">{repo.visibility ? "Public" : "Private"}</span>
          </div>
          <div className="repo-actions">
            <button className="btn btn-sm">⭐ Star <span className="count">0</span></button>
            <button className="btn btn-sm">🍴 Fork <span className="count">0</span></button>
          </div>
        </div>

        <nav className="repo-nav-links" aria-label="Repository">
          <button className="tab active">{"<>"} Code</button>
          <button className="tab">⊙ Issues</button>
          <button className="tab">ᛘ Pull requests</button>
          <button className="tab assistant-tab" onClick={() => setChatOpen(true)}>✦ Assistant</button>
        </nav>
      </div>

      <div className="page repo-details-container">
        <div className="repo-main-col">
          {!hasSRS && files.length > 0 && (
            <div className="srs-hint">
              <span>📄 No SRS file in this repo. Optional — the assistant can draft one for you.</span>
              <button className="btn btn-sm" onClick={() => setChatOpen(true)}>Ask assistant</button>
            </div>
          )}

          <div className="file-controls">
            <button className="btn btn-sm">🔀 main</button>
            <input
              className="input file-filter"
              placeholder="Go to file"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
            />
          </div>

          <div className="file-explorer">
            <div className="file-explorer-header">
              <div className="commit-info">
                <img src={AVATAR} alt="" />
                <strong>{ownerName}</strong>
                <span className="commit-msg">{repo.description || "Updated via CLI push"}</span>
              </div>
              <div className="commit-meta">
                <span className="commit-hash">{latestCommit ? latestCommit.commitID.substring(0, 7) : "0000000"}</span>
                <span><strong>{repo.content?.length || 0}</strong> commits</span>
              </div>
            </div>

            {selectedFile ? (
              <div className="code-viewer-container">
                <div className="code-viewer-header">
                  <button className="btn btn-sm" onClick={() => setSelectedFile(null)}>← Back</button>
                  <span>{selectedFile.name}</span>
                </div>
                <pre className="code-content">{fileContent}</pre>
              </div>
            ) : visibleFiles.length === 0 ? (
              <div className="empty-repo">
                {files.length === 0 ? (
                  <>
                    <p>This repository is empty.</p>
                    <code>node index.js remote add http://localhost:3000/repo/{ownerName}/{repo.name}</code>
                  </>
                ) : (
                  "No files match your filter."
                )}
              </div>
            ) : (
              visibleFiles.map((file) => (
                <div className="file-row" key={file.name}>
                  <div className="file-name">
                    📄{" "}
                    <a href="#open" onClick={(e) => { e.preventDefault(); openFile(file); }}>{file.name}</a>
                  </div>
                  <div className="file-message">{file.commitID.substring(0, 7)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <aside className="repo-side-col">
          <div className="side-section">
            <h3>About</h3>
            <p className="repo-desc">{repo.description || "No description provided."}</p>
            <ul className="side-stats">
              <li>⭐ 0 stars</li>
              <li>👁️ 0 watching</li>
              <li>🍴 0 forks</li>
            </ul>
          </div>
          <hr className="divider" />
          <div className="side-section">
            <h3>Assistant</h3>
            <p className="empty-text">Get feature recommendations, an SRS draft and project gap analysis.</p>
            <button className="btn btn-sm" onClick={() => setChatOpen(true)}>✦ Open assistant</button>
          </div>
          <hr className="divider" />
          <div className="side-section">
            <h3>Contributors <span className="badge">1</span></h3>
            <div className="contributor-list">
              <img src={AVATAR} alt="" />
              <span>{ownerName}</span>
            </div>
          </div>
        </aside>
      </div>

      <RepoChatbot repoId={repo._id} repoName={repo.name} open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
};

export default RepoDetails;
