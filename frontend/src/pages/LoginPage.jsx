import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Map, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("Welcome back");
      } else {
        await register(email, password);
        toast.success("Account created");
      }
      navigate(from, { replace: true });
    } catch (err) {
      const msg = formatApiErrorDetail(err.response?.data?.detail) || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-secondary/30 to-background px-6">
      <Card className="w-full max-w-md p-8 border-border shadow-lg" data-testid="login-card">
        <Link to="/" className="flex items-center gap-3 mb-8 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Map className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
              MapData Collector
            </h1>
            <p className="text-xs text-muted-foreground">Smart Google Maps Location Scraper</p>
          </div>
        </Link>

        <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
          {mode === "login" ? "Sign in" : "Create an account"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {mode === "login"
            ? "Access your search history and configuration."
            : "Get started in seconds."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" data-testid="auth-form">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="h-11"
              data-testid="email-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              className="h-11"
              data-testid="password-input"
            />
          </div>

          {error && (
            <div
              className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-3"
              data-testid="auth-error"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-primary hover:bg-primary/90"
            data-testid="submit-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </>
            ) : (
              <>
                {mode === "login" ? <LogIn className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                {mode === "login" ? "Sign in" : "Create account"}
              </>
            )}
          </Button>
        </form>

        <div className="text-center mt-6 text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className="text-primary hover:underline font-medium"
                data-testid="switch-to-register"
              >
                Create one
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className="text-primary hover:underline font-medium"
                data-testid="switch-to-login"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
