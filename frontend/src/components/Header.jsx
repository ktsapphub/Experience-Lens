import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Map, Search, Clock, Settings } from "lucide-react";

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
                  MapData Collector
                </h1>
                <p className="text-xs text-muted-foreground">Smart Google Maps Location Scraper</p>
              </div>
            </Link>
            
            {/* Navigation */}
            <nav className="flex items-center gap-1 ml-4">
              <Link to="/">
                <Button 
                  variant={isActive('/') ? 'secondary' : 'ghost'} 
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
            </nav>
          </div>
          
          {children}
        </div>
      </div>
    </header>
  );
}
