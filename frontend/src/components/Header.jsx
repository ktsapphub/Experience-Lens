import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Map, Search, Clock, Settings, LogIn, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function AuthNav() {
  const { user, logout } = useAuth();
  if (user === null) return null;
  if (user === false) {
    return (
      <Link to="/login">
        <Button variant="ghost" size="sm" className="text-sm" data-testid="nav-login">
          <LogIn className="w-4 h-4 mr-1" />
          Sign in
        </Button>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1 pl-2 ml-2 border-l border-border" data-testid="nav-user">
      <div className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <UserIcon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline truncate max-w-[140px]" title={user.email}>{user.email}</span>
      </div>
      <Button variant="ghost" size="sm" className="text-sm" onClick={logout} data-testid="nav-logout">
        <LogOut className="w-4 h-4 mr-1" />
        Logout
      </Button>
    </div>
  );
}

export default function Header({ children }) {
  const location = useLocation();
  
  const isActive = (path) => location.pathname === path;

  return (
    <header className="border-b border-border bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Map className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                  Experience Lens
                </h1>
                <p className="text-xs text-muted-foreground">Discover places through a sharper lens.</p>
              </div>
            </Link>
            
            <nav className="flex items-center gap-1 ml-4">
              <Link to="/search">
                <Button 
                  variant={isActive('/search') ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-sm"
                >
                  <Search className="w-4 h-4 mr-1" />
                  Search
                </Button>
              </Link>
              <Link to="/history">
                <Button 
                  variant={isActive('/history') ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-sm"
                >
                  <Clock className="w-4 h-4 mr-1" />
                  History
                </Button>
              </Link>
              <Link to="/config">
                <Button 
                  variant={isActive('/config') ? 'secondary' : 'ghost'} 
                  size="sm" 
                  className="text-sm"
                >
                  <Settings className="w-4 h-4 mr-1" />
                  Config
                </Button>
              </Link>
              <AuthNav />
            </nav>
          </div>
          
          {children}
        </div>
      </div>
    </header>
  );
}
