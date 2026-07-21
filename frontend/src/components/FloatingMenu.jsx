import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Search,
  Clock,
  Settings,
  LogIn,
  LogOut,
  User as UserIcon,
  Compass,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
function NavItem({ path, label, icon: Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(path)}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-secondary"
      }`}
      data-testid={`menu-nav-${path.replace('/', '') || 'home'}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

/**
 * Floating hamburger menu — a fixed-position round button in the top-left.
 * On click, opens a Shadcn Sheet drawer with primary navigation. Available
 * on every page, always accessible regardless of scroll position.
 */
export default function FloatingMenu() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;
  const isLanding = location.pathname === "/";
  const isAuthenticated = !!user && user !== false;

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate("/");
  };

  // Landing page, not signed in → render only a compact "Sign in" button.
  // The hamburger menu is intentionally hidden until the user is authenticated.
  if (isLanding && !isAuthenticated) {
    return (
      <Link
        to="/login"
        className="fixed top-4 right-4 z-50 inline-flex items-center gap-2 px-4 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all text-sm font-medium"
        data-testid="landing-signin-btn"
      >
        <LogIn className="w-4 h-4" />
        Sign in
      </Link>
    );
  }

  // Auth-check still in progress on the landing page → render nothing to
  // avoid a flash of the wrong control.
  if (isLanding && user === null) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all"
        data-testid="floating-menu-btn"
      >
        <Menu className="w-5 h-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72 p-0 flex flex-col" data-testid="floating-menu-panel">
          <SheetHeader className="p-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
            <SheetTitle className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                <Compass className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-base font-semibold">Experience Lens</div>
                <div className="text-[11px] text-muted-foreground font-normal">Discover places through a sharper lens.</div>
              </div>
            </SheetTitle>
            <SheetDescription className="sr-only">Primary navigation</SheetDescription>
          </SheetHeader>

          <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
            <NavItem path="/" label="Home" icon={Compass} active={isActive("/")} onClick={go} />
            <NavItem path="/search" label="Search" icon={Search} active={isActive("/search")} onClick={go} />
            <NavItem path="/history" label="History" icon={Clock} active={isActive("/history")} onClick={go} />
            <NavItem path="/config" label="Config" icon={Settings} active={isActive("/config")} onClick={go} />
          </nav>

          <div className="border-t border-border p-4">
            {user === false && (
              <Button
                variant="default"
                className="w-full justify-start"
                onClick={() => go("/login")}
                data-testid="menu-signin"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign in
              </Button>
            )}
            {user && user !== false && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span className="truncate">{user.email}</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleLogout}
                  data-testid="menu-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
