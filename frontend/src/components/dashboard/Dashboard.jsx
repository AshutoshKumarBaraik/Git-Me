import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import Navbar from "../Navbar";
import { API_URL } from "../../config";
import "./Dashboard.css";

const RepoLink = ({ repo, showOwner }) => (
  <Link to={`/repo/${repo._id}`} className="repo-link">
    <span className="repo-link-name">
      {showOwner && repo.owner?.username ? `${repo.owner.username} / ` : ""}
      {repo.name}
    </span>
    {repo.description && <span className="repo-link-desc">{repo.description}</span>}
  </Link>
);

const Dashboard = () => {
  const [repositories, setRepositories] = useState([]);
  const [suggested, setSuggested] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = localStorage.getItem("userId");

    const load = async () => {
      try {
        const [mine, all] = await Promise.all([
          fetch(`${API_URL}/repo/user/${userId}`).then((r) => r.json()),
          fetch(`${API_URL}/repo/all`).then((r) => r.json()),
        ]);
        setRepositories(mine.repositories || []);
        setSuggested((all.repositories || []).filter((r) => r.visibility !== false));
      } catch (err) {
        console.error("Error while fetching repositories:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const results = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? repositories.filter((r) => r.name.toLowerCase().includes(q)) : repositories;
  }, [searchQuery, repositories]);

  return (
    <>
      <Navbar />
      <div className="page dashboard">
        <aside className="dash-col dash-side card">
          <h3>Explore repositories</h3>
          {suggested.length === 0 && <p className="muted small">Nothing to explore yet.</p>}
          {suggested.slice(0, 12).map((repo) => (
            <RepoLink key={repo._id} repo={repo} showOwner />
          ))}
        </aside>

        <main className="dash-col dash-main">
          <div className="dash-head">
            <h2>Your repositories</h2>
            <Link to="/create" className="btn btn-primary">New</Link>
          </div>
          <input
            className="input"
            type="search"
            value={searchQuery}
            placeholder="Find a repository…"
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="repo-list">
            {loading && <p className="muted">Loading…</p>}
            {!loading && results.length === 0 && (
              <div className="empty card">
                <p>{searchQuery ? "No repositories match your search." : "You don't have any repositories yet."}</p>
                {!searchQuery && <Link to="/create" className="btn btn-primary">Create your first repository</Link>}
              </div>
            )}
            {results.map((repo) => (
              <div className="repo-card card" key={repo._id}>
                <div className="repo-card-top">
                  <Link to={`/repo/${repo._id}`} className="repo-card-name">{repo.name}</Link>
                  <span className="pill">{repo.visibility ? "Public" : "Private"}</span>
                </div>
                <p className="muted small">{repo.description || "No description provided."}</p>
              </div>
            ))}
          </div>
        </main>

        <aside className="dash-col dash-side card">
          <h3>Upcoming events</h3>
          <ul className="events">
            <li><strong>Tech Conference</strong><span>Dec 15</span></li>
            <li><strong>Developer Meetup</strong><span>Dec 25</span></li>
            <li><strong>React Summit</strong><span>Jan 5</span></li>
          </ul>
        </aside>
      </div>
    </>
  );
};

export default Dashboard;
