import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../authContext";
import { API_URL } from "../../config";
import logo from "../../assets/github-mark-white.svg";
import "./auth.css";

const Signup = () => {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setCurrentUser } = useAuth();
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/signup`, { email, password, username });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      setCurrentUser(res.data.userId);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <img className="auth-logo" src={logo} alt="Git-Me" />
      <h1 className="auth-title">Create your account</h1>

      <form className="auth-card card" onSubmit={handleSignup}>
        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="username">Username</label>
        <input id="username" className="input" type="text" autoComplete="username" required
          value={username} onChange={(e) => setUsername(e.target.value)} />

        <label htmlFor="email">Email address</label>
        <input id="email" className="input" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="new-password" required minLength={6}
          value={password} onChange={(e) => setPassword(e.target.value)} />

        <button className="btn btn-primary btn-block" disabled={loading} type="submit">
          {loading ? "Creating account…" : "Sign up"}
        </button>
      </form>

      <div className="auth-alt card">
        Already have an account? <Link to="/auth">Sign in</Link>
      </div>
    </div>
  );
};

export default Signup;
