import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

// Always send cookies with axios so the httpOnly auth cookie flows on every request.
// httpOnly + SameSite=Lax provides XSS resistance — JS cannot read the token.
axios.defaults.withCredentials = true;

export function AuthProvider({ children }) {
  // null = checking, false = unauthenticated, object = authenticated user
  const [user, setUser] = useState(null);

  // Re-read the session (role + run countdown). Cookie is sent automatically.
  const refresh = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      setUser(res.data);
      return res.data;
    } catch {
      setUser(false);
      return false;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Update just the run countdown after a search or a request, without another round trip.
  const setRuns = useCallback((runs) => {
    if (runs) setUser((u) => (u ? { ...u, runs } : u));
  }, []);

  const login = useCallback(async (email, password) => {
    await axios.post(`${API}/auth/login`, { email, password });
    return refresh();
  }, [refresh]);

  const register = useCallback(async (email, password) => {
    await axios.post(`${API}/auth/register`, { email, password });
    return refresh();
  }, [refresh]);

  // Keyword reset: sets the new password and signs the user in.
  const resetPassword = useCallback(async (email, keyword, newPassword) => {
    await axios.post(`${API}/auth/reset-password`, { email, keyword, new_password: newPassword });
    return refresh();
  }, [refresh]);

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
    <AuthContext.Provider value={{ user, login, register, logout, refresh, setRuns, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
