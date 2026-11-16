import { Link, NavLink } from "react-router-dom";
import logo from "../assets/github-mark-white.svg";
import "./Navbar.css";

const Navbar = () => {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <img src={logo} alt="Git-Me logo" />
          <span>Git-Me</span>
        </Link>

        <nav className="topbar-links" aria-label="Main">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/create">New repository</NavLink>
          <NavLink to="/profile">Profile</NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
