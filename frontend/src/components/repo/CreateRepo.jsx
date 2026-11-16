import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Navbar from "../Navbar";
import { API_URL } from "../../config";
import "./createRepo.css";

const CreateRepo = () => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ownerId = localStorage.getItem("userId");
    if (!ownerId) return navigate("/auth");

    setError("");
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/repo/create`, {
        name: name.trim(),
        description,
        visibility: isPublic,
        owner: ownerId,
        content: [],
        issues: [],
      });
      if (res.status === 201) navigate(`/repo/${res.data.repositoryID}`);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create repository");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="create-repo-wrapper">
        <div className="create-repo-container">
          <div className="create-repo-header">
            <h2>Create a new repository</h2>
            <p>A repository contains all project files, including the revision history. Push an optional <code>SRS.md</code> and the assistant will use it to recommend features.</p>
          </div>

          <form onSubmit={handleSubmit} className="create-repo-form">
            {error && <div className="form-error" role="alert">{error}</div>}

            <div className="input-group">
              <label htmlFor="repo-name">Repository name <span className="required">*</span></label>
              <input id="repo-name" className="input" type="text" required
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="input-group">
              <label htmlFor="description">Description <span className="optional">(optional)</span></label>
              <input id="description" className="input" type="text"
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <hr className="divider" />

            <div className="visibility-group">
              <label className="radio-option" htmlFor="public">
                <input type="radio" id="public" name="visibility"
                  checked={isPublic} onChange={() => setIsPublic(true)} />
                <span>
                  <strong>Public</strong>
                  <small>Anyone on the internet can see this repository. You choose who can commit.</small>
                </span>
              </label>

              <label className="radio-option" htmlFor="private">
                <input type="radio" id="private" name="visibility"
                  checked={!isPublic} onChange={() => setIsPublic(false)} />
                <span>
                  <strong>Private</strong>
                  <small>You choose who can see and commit to this repository.</small>
                </span>
              </label>
            </div>

            <hr className="divider" />

            <button type="submit" className="btn btn-primary create-submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create repository"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateRepo;
