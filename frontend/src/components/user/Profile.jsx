import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Navbar from "../Navbar";
import HeatMapProfile from "./HeatMap";
import { useAuth } from "../../authContext";
import { API_URL } from "../../config";
import "./Profile.css";

const Profile = () => {
  const [userDetails, setUserDetails] = useState({ username: "username" });
  const [repos, setRepos] = useState([]);
  const { setCurrentUser } = useAuth();

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId) return;

    axios
      .get(`${API_URL}/userProfile/${userId}`)
      .then((res) => setUserDetails(res.data))
      .catch((err) => console.error("Cannot fetch user details:", err));

    axios
      .get(`${API_URL}/repo/user/${userId}`)
      .then((res) => setRepos(res.data.repositories || []))
      .catch(() => setRepos([]));
  }, []);

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    setCurrentUser(null);
    window.location.href = "/auth";
  };

  return (
    <>
      <Navbar />
      <div className="page profile-page">
        <aside className="user-profile-section">
          <div className="profile-image">{userDetails.username?.[0]?.toUpperCase()}</div>
          <h2 className="profile-name">{userDetails.username}</h2>
          <p className="muted profile-email">{userDetails.email}</p>
          <button className="btn btn-block">Follow</button>
          <div className="follower muted">
            <span><strong>10</strong> followers</span>
            <span>·</span>
            <span><strong>3</strong> following</span>
          </div>
          <button className="btn btn-danger btn-block" onClick={logout}>Log out</button>
        </aside>

        <section className="profile-main">
          <HeatMapProfile />

          <h3 className="section-title">Repositories <span className="pill">{repos.length}</span></h3>
          <div className="repo-grid">
            {repos.length === 0 && <p className="muted">No repositories yet.</p>}
            {repos.map((repo) => (
              <div className="repo card" key={repo._id}>
                <div className="repo-card-top">
                  <Link to={`/repo/${repo._id}`} className="repo-name">{repo.name}</Link>
                  <span className="pill">{repo.visibility ? "Public" : "Private"}</span>
                </div>
                <p className="description">{repo.description || "No description provided."}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
};

export default Profile;
