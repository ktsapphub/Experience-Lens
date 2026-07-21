import { Link } from "react-router-dom";
import { Map } from "lucide-react";

/**
 * Shared header for authenticated pages (History, Config).
 * Navigation lives in the FloatingMenu now; this component keeps the
 * brand + logo and reserves the right side for children (page actions).
 */
export default function Header({ children }) {
  return (
    <header className="border-b border-border bg-card sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
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

          {children}
        </div>
      </div>
    </header>
  );
}
