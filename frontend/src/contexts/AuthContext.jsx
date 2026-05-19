import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const TOKEN_KEY = "mdc_access_token";

const AuthContext = createContext(null);

// Attach Authorization header from localStorage on every axios request
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function AuthProvider({ children }) {
  // null = checking, false = unauthenticated, object = authenticated user
  const [user, setUser] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(false);
  }, []);

  // Verify existing token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(false);
      return;
    }
    axios
      .get(`${API}/auth/me`)
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(false);
      });
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem(TOKEN_KEY, res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (email, password) => {
    const res = await axios.post(`${API}/auth/register`, { email, password });
    localStorage.setItem(TOKEN_KEY, res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
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
