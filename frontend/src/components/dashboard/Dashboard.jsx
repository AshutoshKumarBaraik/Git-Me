import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Dashboard.css";
import Navbar from "../Navbar";

const Dashboard = () => {
  let [repositories, setRepositories] = useState([]);
  let [searchQuery, setSearchQuery] = useState("");
  let [suggestedRepositories, setSuggestedRepositories] = useState([]);

  // 1. FIXED: Changed "" to [] so searchResults starts as an array.
  // This prevents the .map() crash on the very first render.
  let [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const userId = localStorage.getItem("userId");

    const fetchRepositories = async () => {
      try {
        const response = await fetch(
          `http://localhost:3000/repo/user/${userId}`,
        );
        const data = await response.json();

        // Already correct: Ensures it defaults to an array
        setRepositories(data.repositories || []);
      } catch (err) {
        console.error("Error while fetching repositories : ", err);
      }
    };

    const fetchSuggestedRepositories = async () => {
      try {
        const response = await fetch(`http://localhost:3000/repo/all`);
        const data = await response.json();

        // ADD THIS LINE TO DEBUG:
        console.log("Raw Suggested Data:", data);

        setSuggestedRepositories(data.repositories || []);
      } catch (err) {
        console.error("Error while fetching repositories : ", err);
      }
    };

    fetchRepositories();
    fetchSuggestedRepositories();
  }, []);

  useEffect(() => {
    if (searchQuery == "") {
      setSearchResults(repositories);
    } else {
      const filteredRepo = repositories.filter((repo) =>
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setSearchResults(filteredRepo);
    }
  }, [searchQuery, repositories, suggestedRepositories]);

  return (
    <>
      <Navbar />
      <section id="dashboard">
        <aside>
          <h3>Suggested Repositories</h3>
          {suggestedRepositories?.map((repo) => {
            return (
              <div key={repo._id || repo.name}>
                <Link to={`/repo/${repo._id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <h4 style={{ cursor: "pointer" }}>{repo.name}</h4>
                </Link>
                {/* <h4>{repo.description}</h4> */}
              </div>
            );
          })}
        </aside>
        <main>
          <h2>Your Repositories</h2>
          <div id="search">
            <input
              type="text"
              value={searchQuery}
              placeholder="Search..."
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {searchResults.map((repo) => {
            return (
              <div key={repo._id}>
                <Link to={`/repo/${repo._id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <h4 style={{ cursor: "pointer" }}>{repo.name}</h4>
                </Link>
                {/* <h4>{repo.description}</h4> */}
              </div>
            );
          })}
        </main>
        <aside>
          <h3>Upcoming Events</h3>
          <ul>
            <li>
              <p>Tech Conference - Dec 15</p>
            </li>
            <li>
              <p>Developer Meetup - Dec 25</p>
            </li>
            <li>
              <p>React Summit - Jan 5</p>
            </li>
          </ul>
        </aside>
      </section>
    </>
  );
};

export default Dashboard;