import { useState, useCallback } from "react";
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
  ImageOff
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Category configuration
const CATEGORIES = [
  { 
    id: "thrill_seeking", 
    name: "Thrill Seeking", 
    description: "Adventurous outings like rock climbing, theme parks, paintball",
    icon: Mountain,
    color: "bg-orange-100 text-orange-800 border-orange-200"
  },
  { 
    id: "super_chill", 
    name: "Super Chill", 
    description: "Relaxing items like spas, yoga, hiking trails, golf",
    icon: Sparkles,
    color: "bg-green-100 text-green-800 border-green-200"
  },
  { 
    id: "creative", 
    name: "Creative", 
    description: "Arts like museums, DIY arts and crafts, workshops",
    icon: Palette,
    color: "bg-purple-100 text-purple-800 border-purple-200"
  },
  { 
    id: "pure_entertainment", 
    name: "Pure Entertainment", 
    description: "Venues for performing arts, theaters, concerts",
    icon: Music,
    color: "bg-pink-100 text-pink-800 border-pink-200"
  },
  { 
    id: "foodie", 
    name: "Foodie", 
    description: "Restaurants, wineries, breweries, cooking classes",
    icon: UtensilsCrossed,
    color: "bg-amber-100 text-amber-800 border-amber-200"
  }
];

// Fallback images for categories
const CATEGORY_IMAGES = {
  thrill_seeking: "https://images.unsplash.com/photo-1613456806102-6d5ef869f75e?w=600&h=400&fit=crop",
  super_chill: "https://images.unsplash.com/photo-1633526543913-d30e3c230d1f?w=600&h=400&fit=crop",
  creative: "https://images.unsplash.com/photo-1720176472643-731fc581b10e?w=600&h=400&fit=crop",
  pure_entertainment: "https://images.unsplash.com/photo-1740459057005-65f000db582f?w=600&h=400&fit=crop",
  foodie: "https://images.unsplash.com/photo-1757358957218-67e771ec07bb?w=600&h=400&fit=crop"
};

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?q=80&w=600&h=400&fit=crop";

// Location Card Component
function LocationCard({ place, index }) {
  const [imageError, setImageError] = useState({});
  const category = CATEGORIES.find(c => c.id === place.category);
  const CategoryIcon = category?.icon || MapPin;
  
  const mainImage = place.photos?.[0]?.url || CATEGORY_IMAGES[place.category] || FALLBACK_IMAGE;
  
  const handleImageError = (idx) => {
    setImageError(prev => ({ ...prev, [idx]: true }));
  };

  return (
    <Card 
      className="stagger-item card-hover border-r border-b border-border rounded-none"
      style={{ animationDelay: `${index * 0.05}s` }}
      data-testid={`location-card-${index}`}
    >
      {/* Main Image */}
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
            onError={() => handleImageError('main')}
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

      {/* Additional Images */}
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
                  onError={() => handleImageError(`thumb-${idx}`)}
                  loading="lazy"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <CardContent className="p-5 space-y-4">
        {/* Title and Category */}
        <div className="space-y-2">
          <h3 className="font-semibold text-lg leading-tight line-clamp-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
            {place.name}
          </h3>
          <Badge variant="outline" className={`text-xs ${category?.color || ''}`}>
            <CategoryIcon className="w-3 h-3 mr-1" />
            {category?.name || place.category}
          </Badge>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{place.address}</span>
        </div>

        {/* Description */}
        {place.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {place.description}
          </p>
        )}

        {/* Coordinates */}
        <div className="text-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
          {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
        </div>

        {/* Links */}
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
        Select a category and enter a location to discover amazing places
      </p>
    </div>
  );
}

// Main App Component
function App() {
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!category) {
      toast.error("Please select a category");
      return;
    }
    if (!location.trim()) {
      toast.error("Please enter a location");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const response = await axios.post(`${API}/places/search`, {
        category,
        location: location.trim(),
        max_results: 50
      });

      if (response.data.success) {
        setPlaces(response.data.places);
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
  }, [category, location]);

  const handleExportCSV = useCallback(async () => {
    if (places.length === 0) {
      toast.error("No locations to export");
      return;
    }

    try {
      const response = await axios.post(
        `${API}/places/export-csv`,
        places,
        { responseType: 'blob' }
      );

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `locations-${category}-${location.replace(/\s+/g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("CSV exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export CSV");
    }
  }, [places, category, location]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.id === category);

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />
      
      {/* Header / Search Section */}
      <header className="search-section border-b border-border">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="text-center mb-12">
            <h1 
              className="heading-primary text-foreground mb-3"
              data-testid="app-title"
            >
              MapData Collector
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Discover and export location data from Google Maps. Select a category and location to get started.
            </p>
          </div>

          {/* Search Controls */}
          <div className="flex flex-col sm:flex-row gap-4 max-w-3xl mx-auto">
            {/* Category Select */}
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger 
                className="h-14 text-base bg-white border-2 border-border focus:border-primary sm:w-64"
                data-testid="category-select"
              >
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <SelectItem 
                      key={cat.id} 
                      value={cat.id}
                      data-testid={`category-option-${cat.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span>{cat.name}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Location Input */}
            <div className="flex-1 relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter city or area (e.g., Los Angeles, CA)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyPress={handleKeyPress}
                className="h-14 pl-12 text-base bg-white border-2 border-border focus:border-primary"
                data-testid="location-input"
              />
            </div>

            {/* Search Button */}
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="h-14 px-8 text-base font-medium bg-primary hover:bg-primary/90"
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
                  Search
                </>
              )}
            </Button>
          </div>

          {/* Category Description */}
          {selectedCategory && (
            <p className="text-center text-sm text-muted-foreground mt-4">
              {selectedCategory.description}
            </p>
          )}
        </div>
      </header>

      {/* Results Section */}
      <main>
        {/* Stats Bar */}
        {searched && places.length > 0 && (
          <div className="stats-bar" data-testid="stats-bar">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center gap-6">
                <span className="font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                  {places.length} locations found
                </span>
                {selectedCategory && (
                  <Badge variant="outline" className={selectedCategory.color}>
                    {selectedCategory.name}
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  in {location}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Results Grid or States */}
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <LoadingSkeleton />
          ) : places.length > 0 ? (
            <div 
              className="results-grid border-t border-l border-border"
              data-testid="results-grid"
            >
              {places.map((place, index) => (
                <LocationCard key={place.id || index} place={place} index={index} />
              ))}
            </div>
          ) : searched ? (
            <div className="empty-state py-32">
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mb-6">
                <MapPin className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                No locations found
              </h3>
              <p className="text-muted-foreground max-w-md">
                Try a different category or broaden your search area
              </p>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </main>

      {/* Export Button (Fixed) */}
      {places.length > 0 && (
        <div className="export-button-container">
          <Button
            onClick={handleExportCSV}
            size="lg"
            className="shadow-lg hover:shadow-xl transition-shadow bg-foreground text-background hover:bg-foreground/90"
            data-testid="export-csv-button"
          >
            <Download className="w-5 h-5 mr-2" />
            Export CSV ({places.length})
          </Button>
        </div>
      )}
    </div>
  );
}

export default App;
