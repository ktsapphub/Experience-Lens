import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  ChevronDown,
  ChevronRight,
  Clock,
  MapPin,
  Navigation,
  Building2,
  Trash2,
  ExternalLink,
  Search,
  Mountain,
  Sparkles,
  Palette,
  Music,
  UtensilsCrossed,
  RefreshCw
} from "lucide-react";
import Header from "@/components/Header";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Category icons mapping
const CATEGORY_ICONS = {
  thrill_seeking: Mountain,
  super_chill: Sparkles,
  creative: Palette,
  pure_entertainment: Music,
  foodie: UtensilsCrossed
};

const CATEGORY_COLORS = {
  thrill_seeking: "bg-orange-500",
  super_chill: "bg-emerald-500",
  creative: "bg-violet-500",
  pure_entertainment: "bg-pink-500",
  foodie: "bg-amber-500"
};

const CATEGORY_NAMES = {
  thrill_seeking: "Thrill Seeking",
  super_chill: "Super Chill",
  creative: "Creative",
  pure_entertainment: "Pure Entertainment",
  foodie: "Foodie"
};

const SEARCH_METHOD_LABELS = {
  location: "City / Zip",
  region: "US Region",
  specific: "Specific Places"
};

function HistoryEntry({ entry, onDelete }) {
  const [isOpen, setIsOpen] = useState(false);
  const CategoryIcon = CATEGORY_ICONS[entry.category] || MapPin;
  
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getSearchLocation = () => {
    if (entry.region) return entry.region.replace('_', ' ').toUpperCase();
    if (entry.location) return entry.location;
    if (entry.location_names?.length > 0) return entry.location_names.join(', ');
    return 'N/A';
  };

  const openGoogleSearch = (name, address) => {
    const query = encodeURIComponent(`${name} ${address}`);
    window.open(`https://www.google.com/search?q=${query}`, '_blank');
  };

  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {isOpen ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
                
                <div className={`w-10 h-10 rounded-lg ${CATEGORY_COLORS[entry.category]} flex items-center justify-center`}>
                  <CategoryIcon className="w-5 h-5 text-white" />
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{CATEGORY_NAMES[entry.category]}</span>
                    <Badge variant="outline" className="text-xs">
                      {SEARCH_METHOD_LABELS[entry.search_method] || entry.search_method}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {entry.results_count} results
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    <span>{formatDate(entry.timestamp)}</span>
                    <span className="mx-1">•</span>
                    <MapPin className="w-3 h-3" />
                    <span>{getSearchLocation()}</span>
                  </div>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(entry.id);
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {/* Search Details */}
            <div className="mb-4 p-3 bg-secondary/30 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Search Parameters</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <p className="font-medium">{CATEGORY_NAMES[entry.category]}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Method:</span>
                  <p className="font-medium">{SEARCH_METHOD_LABELS[entry.search_method]}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>
                  <p className="font-medium">{entry.location || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Region:</span>
                  <p className="font-medium">{entry.region ? entry.region.replace('_', ' ') : 'N/A'}</p>
                </div>
              </div>
              {entry.location_names?.length > 0 && (
                <div className="mt-2">
                  <span className="text-muted-foreground text-sm">Specific Locations:</span>
                  <p className="font-medium text-sm">{entry.location_names.join(', ')}</p>
                </div>
              )}
            </div>
            
            {/* Results List */}
            <div>
              <h4 className="text-sm font-medium mb-3">Results ({entry.results?.length || 0} locations)</h4>
              <div className="max-h-96 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">#</th>
                      <th className="text-left p-3 font-medium">Location Name</th>
                      <th className="text-left p-3 font-medium">Address</th>
                      <th className="text-left p-3 font-medium w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.results?.map((result, idx) => (
                      <tr key={idx} className="border-t hover:bg-secondary/20">
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-medium">{result.name}</td>
                        <td className="p-3 text-muted-foreground">{result.address}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openGoogleSearch(result.name, result.address)}
                              className="h-7 px-2 text-xs"
                              title="Search on Google"
                            >
                              <Search className="w-3 h-3 mr-1" />
                              Verify
                            </Button>
                            {result.website && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(result.website, '_blank')}
                                className="h-7 px-2 text-xs"
                                title="Open website"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(!entry.results || entry.results.length === 0) && (
                  <div className="p-8 text-center text-muted-foreground">
                    No results stored for this search
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/history?limit=100`);
      setHistory(response.data.history || []);
    } catch (error) {
      console.error("Error fetching history:", error);
      toast.error("Failed to load search history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (historyId) => {
    try {
      await axios.delete(`${API}/history/${historyId}`);
      setHistory(prev => prev.filter(h => h.id !== historyId));
      toast.success("History entry deleted");
    } catch (error) {
      console.error("Error deleting history:", error);
      toast.error("Failed to delete entry");
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to clear all search history?")) return;
    
    try {
      await axios.delete(`${API}/history`);
      setHistory([]);
      toast.success("All history cleared");
    } catch (error) {
      console.error("Error clearing history:", error);
      toast.error("Failed to clear history");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-1" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              Search History
            </h1>
            <p className="text-muted-foreground">
              View past searches and verify results
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchHistory} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {history.length > 0 && (
              <Button variant="destructive" onClick={handleClearAll}>
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </div>

        {/* History List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 bg-secondary rounded w-1/3"></div>
                  <div className="h-3 bg-secondary rounded w-1/2"></div>
                </div>
              </Card>
            ))}
          </div>
        ) : history.length > 0 ? (
          <div>
            {history.map((entry) => (
              <HistoryEntry 
                key={entry.id} 
                entry={entry} 
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Search History</h3>
            <p className="text-muted-foreground">
              Your search history will appear here after you perform searches.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
