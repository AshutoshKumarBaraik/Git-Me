export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const authHeader = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};
