import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" data-testid="auth-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user === false) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return children;
}
