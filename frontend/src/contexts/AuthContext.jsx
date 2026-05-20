import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

// Always send cookies with axios so the httpOnly auth cookie flows on every request.
// httpOnly + SameSite=Lax provides XSS resistance — JS cannot read the token.
axios.defaults.withCredentials = true;

export function AuthProvider({ children }) {
  // null = checking, false = unauthenticated, object = authenticated user
  const [user, setUser] = useState(null);

  // Verify existing session on mount (cookie is sent automatically).
  useEffect(() => {
    axios
      .get(`${API}/auth/me`)
      .then((res) => setUser(res.data))
      .catch(() => setUser(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (email, password) => {
    const res = await axios.post(`${API}/auth/register`, { email, password });
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (err) {
      // Network may fail (offline, server down) — we still want to drop the
      // client-side user state so the UI reflects the logout immediately.
      console.warn("Logout request failed; clearing client state anyway:", err?.message || err);
    }
    setUser(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
