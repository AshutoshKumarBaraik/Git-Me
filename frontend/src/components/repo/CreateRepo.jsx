import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Navbar from "../Navbar"; // Adjust path if Navbar is located elsewhere
import "./createRepo.css";

const CreateRepo = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ownerId = localStorage.getItem("userId");

    if (!ownerId) {
      alert("User not authenticated. Please log in.");
      return window.location.href = "/auth";
    }

    try {
      // Assuming your backend routes are prefixed with /repo
      const response = await axios.post("http://localhost:3000/repo/create", {
        name: name,
        description: description,
        visibility: isPublic, 
        owner: ownerId,
        content: [],
        issues: []
      });

      if (response.status === 201) {
        // Redirect back to profile after successful creation
        navigate("/profile");
      }
    } catch (error) {
      console.error("Error creating repository:", error);
      alert(error.response?.data?.error || "Failed to create repository");
    }
  };

  return (
    <>
      <Navbar />
      <div className="create-repo-wrapper">
        <div className="create-repo-container">
          <div className="create-repo-header">
            <h2>Create a new repository</h2>
            <p>A repository contains all project files, including the revision history. Already have a project repository elsewhere?</p>
          </div>

          <form onSubmit={handleSubmit} className="create-repo-form">
            <div className="input-group">
              <label htmlFor="repo-name">Repository name <span className="required">*</span></label>
              <input
                id="repo-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="dark-input"
              />
            </div>

            <div className="input-group">
              <label htmlFor="description">Description <span className="optional">(optional)</span></label>
              <input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="dark-input"
              />
            </div>

            <hr className="divider" />

            <div className="visibility-group">
              <div className="radio-option">
                <input
                  type="radio"
                  id="public"
                  name="visibility"
                  checked={isPublic === true}
                  onChange={() => setIsPublic(true)}
                />
                <label htmlFor="public">
                  <strong>Public</strong>
                  <span>Anyone on the internet can see this repository. You choose who can commit.</span>
                </label>
              </div>

              <div className="radio-option">
                <input
                  type="radio"
                  id="private"
                  name="visibility"
                  checked={isPublic === false}
                  onChange={() => setIsPublic(false)}
                />
                <label htmlFor="private">
                  <strong>Private</strong>
                  <span>You choose who can see and commit to this repository.</span>
                </label>
              </div>
            </div>

            <hr className="divider" />

            <button type="submit" className="create-submit-btn">
              Create repository
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateRepo;