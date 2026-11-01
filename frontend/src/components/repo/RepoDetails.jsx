import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams, Link } from "react-router-dom";
import Navbar from "../Navbar";
import "./repoDetails.css";

const RepoDetails = () => {
  const { id } = useParams();
  const [repo, setRepo] = useState(null);
  
  // New state for the code viewer
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");

  useEffect(() => {
    const fetchRepo = async () => {
      try {
        const response = await axios.get(`http://localhost:3000/repo/${id}`);
        setRepo(response.data.repository);
      } catch (err) {
        console.error("Failed to fetch repository details:", err);
      }
    };
    fetchRepo();
  }, [id]);

  // Function to fetch and display file text
  const fetchFileContent = async (file) => {
    setSelectedFile(file);
    setFileContent("Loading...");
    try {
      const response = await fetch(file.s3Url);
      const text = await response.text();
      setFileContent(text);
    } catch (err) {
      console.error(err);
      setFileContent("Error loading file content.");
    }
  };

  if (!repo) {
    return (
      <>
        <Navbar />
        <div className="repo-details-wrapper">
          <h2>Loading...</h2>
        </div>
      </>
    );
  }

  const latestCommit = repo.content && repo.content.length > 0 
    ? repo.content[repo.content.length - 1] 
    : null;

  return (
    <>
      <Navbar />
      
      <div className="repo-tabs">
        <div className="repo-tabs-container">
          <div className="repo-title">
            <img src="https://github.githubassets.com/images/gravatars/gravatar-user-420.png" alt="avatar" />
            <a href="#" className="owner">{repo.owner?.username || "AshutoshKumarBaraik"}</a>
            <span>/</span>
            <a href="#" className="repo-name-link">{repo.name}</a>
            <span className="badge">{repo.visibility ? "Public" : "Private"}</span>
          </div>
          <div className="repo-actions">
            <button>📌 Pin</button>
            <button>👁️ Watch <span className="count">0</span></button>
            <button>🍴 Fork <span className="count">0</span></button>
            <button>⭐ Star <span className="count">0</span></button>
          </div>
        </div>
        <nav className="repo-nav-links">
          <a href="#" className="active">{"<>"} Code</a>
          <a href="#">⊙ Issues</a>
          <a href="#">ᛘ Pull requests</a>
          <a href="#">▶ Actions</a>
          <a href="#">🗂️ Projects</a>
          <a href="#">🛡️ Security</a>
          <a href="#">📈 Insights</a>
          <a href="#">⚙️ Settings</a>
        </nav>
      </div>

      <div className="repo-details-wrapper">
        <div className="repo-details-container">
          
          <div className="repo-main-col">
            <div className="file-controls">
              <div className="branch-selector">
                <button className="branch-btn">🔀 main <span>▼</span></button>
                <span className="branch-info"><strong>1</strong> Branch <strong>0</strong> Tags</span>
              </div>
              <div className="file-actions">
                <div className="search-file">
                  <input type="text" placeholder="Go to file" />
                </div>
                <button className="add-file-btn">Add file <span>▼</span></button>
                <button className="code-btn">{"<>"} Code <span>▼</span></button>
              </div>
            </div>

            <div className="file-explorer">
              <div className="file-explorer-header">
                <div className="commit-info">
                  <img src="https://github.githubassets.com/images/gravatars/gravatar-user-420.png" alt="avatar" />
                  <strong>{repo.owner?.username || "AshutoshKumarBaraik"}</strong>
                  <span className="commit-msg">{repo.description || "Updated via CLI push"}</span>
                </div>
                <div className="commit-meta">
                  <span className="commit-hash">{latestCommit ? latestCommit.commitID.substring(0, 7) : "0000000"}</span>
                  <span className="commit-time">· just now</span>
                  <span className="commit-count"><strong>{repo.content?.length || 0}</strong> Commits</span>
                </div>
              </div>

              <div className="file-list">
                {/* --- TOGGLE BETWEEN FILE LIST AND CODE VIEWER --- */}
                {selectedFile ? (
                  <div className="code-viewer-container">
                    <div className="code-viewer-header">
                      <button className="back-btn" onClick={() => setSelectedFile(null)}>⬅ Back</button>
                      <span>{selectedFile.name}</span>
                    </div>
                    <pre className="code-content">{fileContent}</pre>
                  </div>
                ) : (
                  !latestCommit || latestCommit.files.length === 0 ? (
                    <div className="empty-repo">This repository is empty.</div>
                  ) : (
                    latestCommit.files.map((file, index) => (
                      <div className="file-row" key={index}>
                        <div className="file-name">
                          📄 <a href="#" onClick={(e) => { e.preventDefault(); fetchFileContent(file); }}>{file.name}</a>
                        </div>
                        <div className="file-message">
                          <span>{repo.description || "Add project files"}</span>
                        </div>
                        <div className="file-time">
                          <span>just now</span>
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>
          </div>

          <div className="repo-side-col">
            <div className="side-section">
              <h3>About</h3>
              <p className="repo-desc">{repo.description || "No description, website, or topics provided."}</p>
              <ul className="side-stats">
                <li>📈 Activity</li>
                <li>⭐ 0 stars</li>
                <li>👁️ 0 watching</li>
                <li>🍴 0 forks</li>
              </ul>
            </div>
            
            <hr className="divider" />
            
            <div className="side-section">
              <h3>Releases</h3>
              <p className="empty-text">No releases published</p>
              <a href="#" className="link-text">Create a new release</a>
            </div>

            <hr className="divider" />

            <div className="side-section">
              <h3>Packages</h3>
              <p className="empty-text">No packages published</p>
              <a href="#" className="link-text">Publish your first package</a>
            </div>

            <hr className="divider" />

            <div className="side-section">
              <h3>Contributors <span className="badge count">1</span></h3>
              <div className="contributor-list">
                <img src="https://github.githubassets.com/images/gravatars/gravatar-user-420.png" alt="avatar" />
                <span>{repo.owner?.username || "AshutoshKumarBaraik"}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default RepoDetails;