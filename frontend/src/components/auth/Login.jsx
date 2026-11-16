import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../authContext";
import { API_URL } from "../../config";
import logo from "../../assets/github-mark-white.svg";
import "./auth.css";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setCurrentUser } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setLoading(true);
      const res = await axios.post(`${API_URL}/login`, { email, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("userId", res.data.userId);
      setCurrentUser(res.data.userId);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <img className="auth-logo" src={logo} alt="Git-Me" />
      <h1 className="auth-title">Sign in to Git-Me</h1>

      <form className="auth-card card" onSubmit={handleLogin}>
        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="email">Email address</label>
        <input id="email" className="input" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="password">Password</label>
        <input id="password" className="input" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />

        <button className="btn btn-primary btn-block" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="auth-alt card">
        New to Git-Me? <Link to="/signup">Create an account</Link>
      </div>
    </div>
  );
};

export default Login;
