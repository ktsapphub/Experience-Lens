import { useState, useCallback, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Search, 
  Download, 
  MapPin, 
  Globe, 
  Instagram, 
  Star,
  Loader2,
  Mountain,
  Sparkles,
  Palette,
  Music,
  UtensilsCrossed,
  ExternalLink,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Map,
  Navigation,
  Building2,
  Check,
  CheckSquare,
  Square,
  Trash2,
  Eye,
  Clock,
  Settings
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import HistoryPage from "@/pages/HistoryPage";
import ConfigPage from "@/pages/ConfigPage";

// Helper to get seen locations from localStorage
const getSeenLocations = () => {
  try {
    const seen = localStorage.getItem('seenLocations');
    return seen ? new Set(JSON.parse(seen)) : new Set();
  } catch {
    return new Set();
  }
};

// Helper to save seen locations to localStorage
const saveSeenLocations = (ids) => {
  try {
    localStorage.setItem('seenLocations', JSON.stringify([...ids]));
  } catch {
    // Ignore localStorage errors
  }
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Category configuration with tooltips
const CATEGORIES = [
  { 
    id: "thrill_seeking", 
    name: "Thrill Seeking", 
    description: "High-energy, adrenaline, competitive experiences",
    icon: Mountain,
    color: "bg-orange-500",
    lightColor: "bg-orange-100 text-orange-800 border-orange-200",
    tooltip: {
      title: "Thrill Seeking Experiences",
      description: "High-energy, adrenaline-driven, competitive, or challenge-based activities that feel like an event.",
      keywords: ["escape room", "go kart", "rock climbing gym", "zipline"]
    }
  },
  { 
    id: "super_chill", 
    name: "Super Chill", 
    description: "Wellness, scenery, casual exploration",
    icon: Sparkles,
    color: "bg-emerald-500",
    lightColor: "bg-green-100 text-green-800 border-green-200",
    tooltip: {
      title: "Super Chill Experiences",
      description: "Low-pressure, relaxed-pace activities focused on wellness, scenery, casual play, or easy exploration.",
      keywords: ["spa", "botanical garden", "yoga studio", "scenic cruise"]
    }
  },
  { 
    id: "creative", 
    name: "Creative", 
    description: "Hands-on making, artistic expression",
    icon: Palette,
    color: "bg-violet-500",
    lightColor: "bg-purple-100 text-purple-800 border-purple-200",
    tooltip: {
      title: "Creative Experiences",
      description: "Hands-on making, artistic expression, interactive exhibits, or photo-forward experiences.",
      keywords: ["paint and sip", "pottery class", "immersive art", "candle making"]
    }
  },
  { 
    id: "pure_entertainment", 
    name: "Pure Entertainment", 
    description: "Shows, performances, spectacles",
    icon: Music,
    color: "bg-pink-500",
    lightColor: "bg-pink-100 text-pink-800 border-pink-200",
    tooltip: {
      title: "Pure Entertainment Experiences",
      description: "Sit-back-and-enjoy experiences such as shows, games, spectacles, or ticketed venues.",
      keywords: ["comedy club", "concert venue", "live music", "theater"]
    }
  },
  { 
    id: "foodie", 
    name: "Foodie", 
    description: "Tastings, dining, culinary experiences",
    icon: UtensilsCrossed,
    color: "bg-amber-500",
    lightColor: "bg-amber-100 text-amber-800 border-amber-200",
    tooltip: {
      title: "Foodie Experiences",
      description: "Food and drink as the main event, including tastings, pairings, ambiance dining, or curated culinary experiences.",
      keywords: ["rooftop bar", "winery", "cooking class", "speakeasy"]
    }
  }
];

// US Regions configuration
const US_REGIONS = {
  northeast: {
    name: "Northeast",
    states: ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont", "New Jersey", "New York", "Pennsylvania"]
  },
  southeast: {
    name: "Southeast",
    states: ["Alabama", "Florida", "Georgia", "Kentucky", "Mississippi", "North Carolina", "South Carolina", "Tennessee", "Virginia", "West Virginia", "Maryland", "Delaware", "DC"]
  },
  midwest: {
    name: "Midwest",
    states: ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"]
  },
  southwest: {
    name: "Southwest",
    states: ["Arizona", "Arkansas", "Louisiana", "New Mexico", "Oklahoma", "Texas"]
  },
  west_coast: {
    name: "West Coast",
    states: ["California", "Oregon", "Washington", "Nevada", "Idaho", "Montana", "Utah", "Wyoming", "Colorado", "Alaska", "Hawaii"]
  }
};

// Fallback images for categories
const CATEGORY_IMAGES = {
  thrill_seeking: "https://images.unsplash.com/photo-1613456806102-6d5ef869f75e?w=600&h=400&fit=crop",
  super_chill: "https://images.unsplash.com/photo-1633526543913-d30e3c230d1f?w=600&h=400&fit=crop",
  creative: "https://images.unsplash.com/photo-1720176472643-731fc581b10e?w=600&h=400&fit=crop",
  pure_entertainment: "https://images.unsplash.com/photo-1740459057005-65f000db582f?w=600&h=400&fit=crop",
  foodie: "https://images.unsplash.com/photo-1757358957218-67e771ec07bb?w=600&h=400&fit=crop"
};

// Location Card Component
function LocationCard({ place, index, isSelected, onSelect, isNew, onRemove, onImageError }) {
  const [imageError, setImageError] = useState({});
  const category = CATEGORIES.find(c => c.id === place.category);
  const CategoryIcon = category?.icon || MapPin;
  
  const mainImage = place.photos?.[0]?.url || CATEGORY_IMAGES[place.category];
  
  // Check if description is missing
  const isMissingDescription = !place.description || place.description.trim() === "";
  
  const handleImageError = (idx, photoUrl) => {
    setImageError(prev => ({ ...prev, [idx]: true }));
    // Report failed image to parent for export filtering
    if (onImageError && photoUrl) {
      onImageError(place.id, photoUrl);
    }
  };

  return (
    <Card 
      className={`stagger-item card-hover border-r border-b border-border rounded-none relative ${isSelected ? 'ring-2 ring-primary ring-inset' : ''} ${isMissingDescription ? 'ring-2 ring-yellow-400 ring-inset' : ''}`}
      style={{ animationDelay: `${index * 0.05}s` }}
      data-testid={`location-card-${index}`}
    >
      {/* Missing Description Warning */}
      {isMissingDescription && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-400 text-yellow-900 rounded-full shadow-sm">
            No Description
          </span>
        </div>
      )}

      {/* Selection Checkbox */}
      <div 
        className="absolute top-3 left-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(place.id)}
          className="h-5 w-5 bg-white/90 backdrop-blur-sm border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          data-testid={`select-location-${index}`}
        />
      </div>

      {/* New/Seen Badge */}
      <div className="absolute top-3 left-12 z-10">
        {isNew ? (
          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500 text-white rounded-full shadow-sm">
            New
          </span>
        ) : (
          <span className="px-2 py-0.5 text-xs font-medium bg-gray-500/80 text-white rounded-full shadow-sm flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Seen
          </span>
        )}
      </div>

      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(place.id);
        }}
        className="absolute top-3 right-12 z-10 p-1.5 bg-white/90 backdrop-blur-sm rounded-full hover:bg-red-100 hover:text-red-600 transition-colors shadow-sm"
        title="Remove from results"
        data-testid={`remove-location-${index}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="relative h-48 bg-secondary overflow-hidden">
        {imageError.main ? (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <ImageOff className="w-8 h-8 text-muted-foreground" />
          </div>
        ) : (
          <img
            src={mainImage}
            alt={place.name}
            className="w-full h-full object-cover"
            onError={() => handleImageError('main', place.photos?.[0]?.url)}
            loading="lazy"
          />
        )}
        {place.rating && (
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span className="text-sm font-medium">{place.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {place.photos?.length > 1 && (
        <div className="grid grid-cols-3 gap-px bg-border">
          {place.photos.slice(1, 4).map((photo, idx) => (
            <div key={idx} className="h-16 bg-secondary">
              {imageError[`thumb-${idx}`] ? (
                <div className="w-full h-full flex items-center justify-center bg-secondary">
                  <ImageOff className="w-4 h-4 text-muted-foreground" />
                </div>
              ) : (
                <img
                  src={photo.url}
                  alt={`${place.name} ${idx + 2}`}
                  className="w-full h-full object-cover"
                  onError={() => handleImageError(`thumb-${idx}`, photo.url)}
                  loading="lazy"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <CardContent className="p-5 space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg leading-tight line-clamp-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            {place.name}
          </h3>
          <Badge variant="outline" className={`text-xs ${category?.lightColor || ''}`}>
            <CategoryIcon className="w-3 h-3 mr-1" />
            {category?.name || place.category}
          </Badge>
        </div>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{place.address}</span>
        </div>

        {place.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {place.description}
          </p>
        )}

        <div className="text-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
          {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {place.website && (
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              data-testid={`website-link-${index}`}
            >
              <Globe className="w-3 h-3" />
              Website
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {place.instagram && (
            <a
              href={place.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-pink-600 hover:underline"
              data-testid={`instagram-link-${index}`}
            >
              <Instagram className="w-3 h-3" />
              Instagram
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading Skeleton Component
function LoadingSkeleton() {
  return (
    <div className="loading-grid border-t border-l border-border">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="loading-card">
          <div className="skeleton h-48 w-full mb-4 rounded"></div>
          <div className="space-y-3">
            <div className="skeleton h-6 w-3/4 rounded"></div>
            <div className="skeleton h-4 w-1/4 rounded"></div>
            <div className="skeleton h-4 w-full rounded"></div>
            <div className="skeleton h-4 w-2/3 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Empty State Component
function EmptyState() {
  return (
    <div className="empty-state py-32">
      <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6">
        <Search className="w-10 h-10 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
        No locations yet
      </h3>
      <p className="text-muted-foreground max-w-md">
        Select a category and search method to discover amazing places
      </p>
    </div>
  );
}

// Pagination Component
function Pagination({ page, totalPages, onPageChange, disabled }) {
  const pages = [];
  const maxVisiblePages = 5;
  
  let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }
  
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-2 py-8" data-testid="pagination">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        data-testid="pagination-prev"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Previous
      </Button>
      
      <div className="flex items-center gap-1">
        {startPage > 1 && (
          <>
            <Button variant={page === 1 ? "default" : "outline"} size="sm" onClick={() => onPageChange(1)} disabled={disabled} className="w-10">1</Button>
            {startPage > 2 && <span className="px-2 text-muted-foreground">...</span>}
          </>
        )}
        {pages.map((p) => (
          <Button key={p} variant={page === p ? "default" : "outline"} size="sm" onClick={() => onPageChange(p)} disabled={disabled} className="w-10" data-testid={`pagination-page-${p}`}>{p}</Button>
        ))}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
            <Button variant={page === totalPages ? "default" : "outline"} size="sm" onClick={() => onPageChange(totalPages)} disabled={disabled} className="w-10">{totalPages}</Button>
          </>
        )}
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        data-testid="pagination-next"
      >
        Next
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

// Search Page Component
function SearchPage() {
  const [category, setCategory] = useState("");
  const [searchTab, setSearchTab] = useState("location");
  const [location, setLocation] = useState("");
  const [region, setRegion] = useState("");
  const [locationNames, setLocationNames] = useState([{ name: "", state: "" }]);
  const [places, setPlaces] = useState([]);
  const [allPlaces, setAllPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [removedIds, setRemovedIds] = useState(new Set());
  const [seenLocations, setSeenLocations] = useState(() => getSeenLocations());
  const [failedImages, setFailedImages] = useState({}); // Track failed image URLs per place
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0
  });

  // Track failed image URLs
  const handleImageError = useCallback((placeId, imageUrl) => {
    setFailedImages(prev => {
      const placeFailures = prev[placeId] || new Set();
      placeFailures.add(imageUrl);
      return { ...prev, [placeId]: placeFailures };
    });
  }, []);

  // Filter out removed locations
  const visiblePlaces = places.filter(p => !removedIds.has(p.id));
  const visibleAllPlaces = allPlaces.filter(p => !removedIds.has(p.id));

  // Remove a location from results
  const removeLocation = (placeId) => {
    setRemovedIds(prev => new Set([...prev, placeId]));
    // Also remove from selection if selected
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(placeId);
      return newSet;
    });
    toast.success("Location removed from results");
  };

  // Undo all removals
  const undoRemovals = () => {
    setRemovedIds(new Set());
    toast.success("All removed locations restored");
  };

  // Toggle selection of a single place
  const toggleSelection = (placeId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(placeId)) {
        newSet.delete(placeId);
      } else {
        newSet.add(placeId);
      }
      return newSet;
    });
  };

  // Select all visible places
  const selectAllVisible = () => {
    const allIds = new Set(visiblePlaces.map(p => p.id));
    setSelectedIds(allIds);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Select all from all pages
  const selectAll = () => {
    const allIds = new Set(visibleAllPlaces.map(p => p.id));
    setSelectedIds(allIds);
  };

  // Mark locations as seen when search completes
  const markAsSeen = useCallback((placeIds) => {
    setSeenLocations(prev => {
      const newSeen = new Set([...prev, ...placeIds]);
      saveSeenLocations(newSeen);
      return newSeen;
    });
  }, []);

  const addLocationName = () => {
    if (locationNames.length < 10) {
      setLocationNames([...locationNames, { name: "", state: "" }]);
    }
  };

  const removeLocationName = (index) => {
    const newNames = locationNames.filter((_, i) => i !== index);
    setLocationNames(newNames.length > 0 ? newNames : [{ name: "", state: "" }]);
  };

  const updateLocationName = (index, field, value) => {
    const newNames = [...locationNames];
    if (field === 'state') {
      // Only allow 2 letter uppercase state codes
      newNames[index] = { ...newNames[index], state: value.toUpperCase().slice(0, 2) };
    } else {
      newNames[index] = { ...newNames[index], name: value };
    }
    setLocationNames(newNames);
  };

  const handleSearch = useCallback(async (page = 1) => {
    if (!category) {
      toast.error("Please select a category");
      return;
    }
    
    const hasLocation = location.trim() && searchTab === "location";
    const hasRegion = region && searchTab === "region";
    const hasLocationNames = locationNames.some(loc => loc.name.trim()) && searchTab === "specific";
    
    if (!hasLocation && !hasRegion && !hasLocationNames) {
      toast.error("Please provide a search location");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      // Format location names with state abbreviations
      const filteredLocationNames = searchTab === "specific" 
        ? locationNames
            .filter(loc => loc.name.trim())
            .map(loc => loc.state ? `${loc.name.trim()}, ${loc.state}` : loc.name.trim())
        : [];
      
      const response = await axios.post(`${API}/places/search`, {
        category,
        location: searchTab === "location" ? location.trim() : "",
        region: searchTab === "region" ? region : "",
        location_names: filteredLocationNames,
        page,
        per_page: 20
      });

      if (response.data.success) {
        setPlaces(response.data.places);
        setPagination({
          page: response.data.page,
          totalPages: response.data.total_pages,
          total: response.data.total
        });
        
        // Reset removals on new search
        if (page === 1) {
          setRemovedIds(new Set());
          fetchAllPagesForExport(response.data.total_pages, filteredLocationNames);
        }
        
        // Mark current page locations as seen after 3 seconds
        setTimeout(() => {
          const placeIds = response.data.places.map(p => p.id);
          markAsSeen(placeIds);
        }, 3000);
        
        toast.success(`Found ${response.data.total} locations`);
      }
    } catch (error) {
      console.error("Search error:", error);
      const message = error.response?.data?.detail || "Failed to search locations";
      toast.error(message);
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [category, location, region, locationNames, searchTab]);

  const fetchAllPagesForExport = async (totalPages, filteredLocationNames) => {
    try {
      const allResults = [];
      for (let p = 1; p <= totalPages; p++) {
        const response = await axios.post(`${API}/places/search`, {
          category,
          location: searchTab === "location" ? location.trim() : "",
          region: searchTab === "region" ? region : "",
          location_names: filteredLocationNames,
          page: p,
          per_page: 20
        });
        if (response.data.success) {
          allResults.push(...response.data.places);
        }
      }
      setAllPlaces(allResults);
    } catch (error) {
      console.error("Error fetching all pages:", error);
      setAllPlaces(places);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      handleSearch(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleExportCSV = useCallback(async (exportType = 'all') => {
    let dataToExport;
    
    if (exportType === 'selected') {
      dataToExport = visibleAllPlaces.filter(p => selectedIds.has(p.id));
      if (dataToExport.length === 0) {
        toast.error("No locations selected for export");
        return;
      }
    } else {
      dataToExport = visibleAllPlaces.length > 0 ? visibleAllPlaces : visiblePlaces;
      if (dataToExport.length === 0) {
        toast.error("No locations to export");
        return;
      }
    }

    // Filter out failed images from export data
    const cleanedData = dataToExport.map(place => {
      const placeFailures = failedImages[place.id] || new Set();
      const validPhotos = (place.photos || []).filter(photo => !placeFailures.has(photo.url));
      return {
        ...place,
        photos: validPhotos
      };
    });

    try {
      const response = await axios.post(`${API}/places/export-csv`, cleanedData, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const locationPart = location || region || 'locations';
      const suffix = exportType === 'selected' ? '-selected' : '';
      link.download = `${category}-${locationPart.replace(/\s+/g, '-')}${suffix}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${dataToExport.length} locations to CSV`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export CSV");
    }
  }, [visiblePlaces, visibleAllPlaces, category, location, region, selectedIds]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch(1);
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.id === category);
  const selectedRegion = region ? US_REGIONS[region] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                  <Map className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }} data-testid="app-title">
                    MapData Collector
                  </h1>
                  <p className="text-xs text-muted-foreground">Smart Google Maps Location Scraper</p>
                </div>
              </Link>
              
              {/* Navigation */}
              <nav className="flex items-center gap-1 ml-4">
                <Link to="/">
                  <Button variant="ghost" size="sm" className="text-sm">
                    <Search className="w-4 h-4 mr-1" />
                    Search
                  </Button>
                </Link>
                <Link to="/history">
                  <Button variant="ghost" size="sm" className="text-sm">
                    <Clock className="w-4 h-4 mr-1" />
                    History
                  </Button>
                </Link>
                <Link to="/config">
                  <Button variant="ghost" size="sm" className="text-sm">
                    <Settings className="w-4 h-4 mr-1" />
                    Config
                  </Button>
                </Link>
              </nav>
            </div>
            
            {pagination.total > 0 && (
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <Button
                    onClick={() => handleExportCSV('selected')}
                    variant="outline"
                    className="border-primary text-primary hover:bg-primary/10"
                    data-testid="export-selected-button"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Selected ({selectedIds.size})
                  </Button>
                )}
                <Button
                  onClick={() => handleExportCSV('all')}
                  className="bg-foreground text-background hover:bg-foreground/90"
                  data-testid="export-csv-button"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export All ({visibleAllPlaces.length || visiblePlaces.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search Section */}
      <section className="py-12 px-6 bg-gradient-to-b from-secondary/30 to-background">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {/* Step 1: Category Selection */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center">1</span>
              <h2 className="text-lg font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Choose Experience Category</h2>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <TooltipProvider delayDuration={200}>
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.id;
                  return (
                    <Tooltip key={cat.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setCategory(cat.id)}
                          className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                            isSelected 
                              ? 'border-primary bg-primary/5 shadow-md' 
                              : 'border-border bg-white hover:border-primary/50 hover:shadow-sm'
                          }`}
                          data-testid={`category-btn-${cat.id}`}
                        >
                          <div className={`w-10 h-10 rounded-lg ${cat.color} flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                            <Icon className="w-5 h-5 text-white" />
                          </div>
                          <p className="font-medium text-sm mb-1">{cat.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{cat.description}</p>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent 
                        side="bottom" 
                        className="max-w-xs p-4 bg-foreground text-background rounded-lg shadow-xl"
                        sideOffset={8}
                      >
                        <div className="space-y-2">
                          <p className="font-semibold text-sm">{cat.tooltip.title}</p>
                          <p className="text-xs opacity-90 leading-relaxed">{cat.tooltip.description}</p>
                          <div className="pt-2 border-t border-white/20">
                            <p className="text-xs font-medium mb-1.5 opacity-70">Search keyword examples:</p>
                            <div className="flex flex-wrap gap-1">
                              {cat.tooltip.keywords.map((keyword) => (
                                <span 
                                  key={keyword}
                                  className="px-2 py-0.5 bg-white/15 rounded text-xs"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </TooltipProvider>
            </div>
          </div>

          {/* Step 2: Search Method */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center">2</span>
              <h2 className="text-lg font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Select Search Method</h2>
            </div>

            <Tabs value={searchTab} onValueChange={setSearchTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-12 p-1 bg-secondary/50">
                <TabsTrigger value="location" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg" data-testid="tab-location">
                  <MapPin className="w-4 h-4 mr-2" />
                  City / Zip
                </TabsTrigger>
                <TabsTrigger value="region" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg" data-testid="tab-region">
                  <Navigation className="w-4 h-4 mr-2" />
                  US Region
                </TabsTrigger>
                <TabsTrigger value="specific" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg" data-testid="tab-specific">
                  <Building2 className="w-4 h-4 mr-2" />
                  Specific Places
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 p-6 bg-white rounded-xl border border-border shadow-sm">
                <TabsContent value="location" className="mt-0 space-y-4">
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Enter city, area, or zip code (e.g., Los Angeles, CA or 90210)"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="h-14 pl-12 text-base border-2 focus:border-primary"
                      data-testid="location-input"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="region" className="mt-0 space-y-4">
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="h-14 text-base border-2 focus:border-primary" data-testid="region-select">
                      <SelectValue placeholder="Select a US region" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(US_REGIONS).map(([id, data]) => (
                        <SelectItem key={id} value={id} data-testid={`region-option-${id}`}>
                          <div className="flex items-center gap-2">
                            <Navigation className="w-4 h-4" />
                            <span>{data.name}</span>
                            <span className="text-xs text-muted-foreground">({data.states.length} states)</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedRegion && (
                    <div className="p-4 bg-secondary/30 rounded-lg" data-testid="region-states-display">
                      <p className="text-sm font-medium mb-2">{selectedRegion.name} includes:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedRegion.states.map((state) => (
                          <Badge key={state} variant="secondary" className="text-xs font-normal">
                            {state}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="specific" className="mt-0 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">Add specific locations to search (up to 10)</p>
                    {locationNames.length < 10 && (
                      <Button variant="outline" size="sm" onClick={addLocationName} data-testid="add-location-name-btn">
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    {locationNames.map((loc, index) => (
                      <div key={index} className="flex gap-2">
                        <div className="relative flex-1">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder={`Location ${index + 1} (e.g., Central Park)`}
                            value={loc.name}
                            onChange={(e) => updateLocationName(index, 'name', e.target.value)}
                            className="h-11 pl-10 text-sm border focus:border-primary"
                            data-testid={`location-name-input-${index}`}
                          />
                        </div>
                        <Input
                          type="text"
                          placeholder="ST"
                          value={loc.state}
                          onChange={(e) => updateLocationName(index, 'state', e.target.value)}
                          className="h-11 w-16 text-center text-sm font-medium border focus:border-primary uppercase"
                          maxLength={2}
                          data-testid={`location-state-input-${index}`}
                        />
                        {locationNames.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLocationName(index)}
                            className="h-11 w-11 text-muted-foreground hover:text-destructive"
                            data-testid={`remove-location-name-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground mt-2">
                      Add 2-letter state code (e.g., NY, CA) to search same location name in different states
                    </p>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Search Button */}
          <div className="flex justify-center">
            <Button
              onClick={() => handleSearch(1)}
              disabled={loading || !category}
              size="lg"
              className="h-14 px-12 text-base font-medium bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all"
              data-testid="search-button"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Search Locations
                </>
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* Results Section */}
      <main>
        {searched && pagination.total > 0 && (
          <div className="border-y border-border bg-white py-4 px-6" data-testid="stats-bar">
            <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-semibold text-lg" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                  {visiblePlaces.length} locations
                  {removedIds.size > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      ({removedIds.size} removed)
                    </span>
                  )}
                </span>
                {selectedCategory && (
                  <Badge className={`${selectedCategory.color} text-white border-0`}>
                    {selectedCategory.name}
                  </Badge>
                )}
                {searchTab === "location" && location && (
                  <span className="text-muted-foreground">in {location}</span>
                )}
                {searchTab === "region" && selectedRegion && (
                  <Badge variant="outline">{selectedRegion.name}</Badge>
                )}
                {removedIds.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={undoRemovals}
                    className="text-xs h-7 text-muted-foreground hover:text-foreground"
                    data-testid="undo-removals-btn"
                  >
                    Restore removed
                  </Button>
                )}
              </div>
              
              <div className="flex items-center gap-4">
                {/* Selection Controls */}
                <div className="flex items-center gap-2 border-r border-border pr-4">
                  {selectedIds.size > 0 ? (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedIds.size} selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={deselectAll}
                        className="text-xs h-8"
                        data-testid="deselect-all-btn"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">None selected</span>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                    className="text-xs h-8"
                    data-testid="select-page-btn"
                  >
                    <CheckSquare className="w-3 h-3 mr-1" />
                    Select Page
                  </Button>
                  {visibleAllPlaces.length > visiblePlaces.length && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAll}
                      className="text-xs h-8"
                      data-testid="select-all-btn"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Select All ({visibleAllPlaces.length})
                    </Button>
                  )}
                </div>
                
                <span className="text-sm text-muted-foreground">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-7xl mx-auto">
          {loading ? (
            <LoadingSkeleton />
          ) : visiblePlaces.length > 0 ? (
            <>
              <div className="results-grid border-t border-l border-border" data-testid="results-grid">
                {visiblePlaces.map((place, index) => (
                  <LocationCard 
                    key={place.id || index} 
                    place={place} 
                    index={index}
                    isSelected={selectedIds.has(place.id)}
                    onSelect={toggleSelection}
                    isNew={!seenLocations.has(place.id)}
                    onRemove={removeLocation}
                    onImageError={handleImageError}
                  />
                ))}
              </div>
              
              {pagination.totalPages > 1 && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={handlePageChange}
                  disabled={loading}
                />
              )}
            </>
          ) : searched ? (
            <div className="empty-state py-32">
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6">
                <MapPin className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                No locations found
              </h3>
              <p className="text-muted-foreground max-w-md">
                No locations with complete data found. Try a different search.
              </p>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </main>
    </div>
  );
}

// Main App with Router
function App() {
  return (
    <Router>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/config" element={<ConfigPage />} />
      </Routes>
    </Router>
  );
}

export default App;
