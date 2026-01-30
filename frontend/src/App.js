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
  ImageOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  MapPinned
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Category configuration
const CATEGORIES = [
  { 
    id: "thrill_seeking", 
    name: "Thrill Seeking", 
    description: "High-energy, adrenaline, competitive, or challenge-based experiences",
    icon: Mountain,
    color: "bg-orange-100 text-orange-800 border-orange-200"
  },
  { 
    id: "super_chill", 
    name: "Super Chill", 
    description: "Wellness, scenery, casual play, or easy exploration activities",
    icon: Sparkles,
    color: "bg-green-100 text-green-800 border-green-200"
  },
  { 
    id: "creative", 
    name: "Creative", 
    description: "Hands-on making, artistic expression, or interactive exhibits",
    icon: Palette,
    color: "bg-purple-100 text-purple-800 border-purple-200"
  },
  { 
    id: "pure_entertainment", 
    name: "Pure Entertainment", 
    description: "Shows, performances, spectacles, or ticketed venues",
    icon: Music,
    color: "bg-pink-100 text-pink-800 border-pink-200"
  },
  { 
    id: "foodie", 
    name: "Foodie", 
    description: "Tastings, pairings, ambiance dining, or curated culinary experiences",
    icon: UtensilsCrossed,
    color: "bg-amber-100 text-amber-800 border-amber-200"
  }
];

// US Regions configuration
const US_REGIONS = {
  northeast: {
    name: "Northeast Region",
    states: ["Connecticut", "Maine", "Massachusetts", "New Hampshire", "Rhode Island", "Vermont", "New Jersey", "New York", "Pennsylvania"]
  },
  southeast: {
    name: "Southeast Region",
    states: ["Alabama", "Florida", "Georgia", "Kentucky", "Mississippi", "North Carolina", "South Carolina", "Tennessee", "Virginia", "West Virginia", "Maryland", "Delaware", "District of Columbia"]
  },
  midwest: {
    name: "Midwest Region",
    states: ["Illinois", "Indiana", "Michigan", "Ohio", "Wisconsin", "Iowa", "Kansas", "Minnesota", "Missouri", "Nebraska", "North Dakota", "South Dakota"]
  },
  southwest: {
    name: "Southwest Region",
    states: ["Arizona", "Arkansas", "Louisiana", "New Mexico", "Oklahoma", "Texas"]
  },
  west_coast: {
    name: "West Coast Region",
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
function LocationCard({ place, index }) {
  const [imageError, setImageError] = useState({});
  const category = CATEGORIES.find(c => c.id === place.category);
  const CategoryIcon = category?.icon || MapPin;
  
  const mainImage = place.photos?.[0]?.url || CATEGORY_IMAGES[place.category];
  
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
            <Button
              variant={page === 1 ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(1)}
              disabled={disabled}
              className="w-10"
            >
              1
            </Button>
            {startPage > 2 && <span className="px-2 text-muted-foreground">...</span>}
          </>
        )}
        
        {pages.map((p) => (
          <Button
            key={p}
            variant={page === p ? "default" : "outline"}
            size="sm"
            onClick={() => onPageChange(p)}
            disabled={disabled}
            className="w-10"
            data-testid={`pagination-page-${p}`}
          >
            {p}
          </Button>
        ))}
        
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-2 text-muted-foreground">...</span>}
            <Button
              variant={page === totalPages ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(totalPages)}
              disabled={disabled}
              className="w-10"
            >
              {totalPages}
            </Button>
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

// Region States Display Component
function RegionStatesDisplay({ regionId }) {
  if (!regionId || !US_REGIONS[regionId]) return null;
  
  const region = US_REGIONS[regionId];
  
  return (
    <div className="mt-4 p-4 bg-secondary/50 rounded-lg border border-border" data-testid="region-states-display">
      <h4 className="text-sm font-medium mb-2 text-foreground" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
        {region.name} includes:
      </h4>
      <div className="flex flex-wrap gap-2">
        {region.states.map((state) => (
          <Badge key={state} variant="outline" className="text-xs bg-white">
            {state}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// Main App Component
function App() {
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [region, setRegion] = useState("");
  const [locationNames, setLocationNames] = useState([""]);
  const [places, setPlaces] = useState([]);
  const [allPlaces, setAllPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0
  });

  // Add a new location name field
  const addLocationName = () => {
    if (locationNames.length < 10) {
      setLocationNames([...locationNames, ""]);
    }
  };

  // Remove a location name field
  const removeLocationName = (index) => {
    const newNames = locationNames.filter((_, i) => i !== index);
    setLocationNames(newNames.length > 0 ? newNames : [""]);
  };

  // Update a location name
  const updateLocationName = (index, value) => {
    const newNames = [...locationNames];
    newNames[index] = value;
    setLocationNames(newNames);
  };

  const handleSearch = useCallback(async (page = 1) => {
    if (!category) {
      toast.error("Please select a category");
      return;
    }
    
    const hasLocation = location.trim();
    const hasRegion = region;
    const hasLocationNames = locationNames.some(name => name.trim());
    
    if (!hasLocation && !hasRegion && !hasLocationNames) {
      toast.error("Please enter a location, select a region, or add specific location names");
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const filteredLocationNames = locationNames.filter(name => name.trim());
      
      const response = await axios.post(`${API}/places/search`, {
        category,
        location: location.trim(),
        region,
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
        
        // On first search, fetch all pages for export
        if (page === 1) {
          fetchAllPagesForExport(response.data.total_pages, filteredLocationNames);
        }
        
        toast.success(`Found ${response.data.total} locations (showing ${response.data.places.length})`);
      }
    } catch (error) {
      console.error("Search error:", error);
      const message = error.response?.data?.detail || "Failed to search locations";
      toast.error(message);
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [category, location, region, locationNames]);

  // Fetch all pages for CSV export
  const fetchAllPagesForExport = async (totalPages, filteredLocationNames) => {
    try {
      const allResults = [];
      for (let p = 1; p <= totalPages; p++) {
        const response = await axios.post(`${API}/places/search`, {
          category,
          location: location.trim(),
          region,
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

  const handleExportCSV = useCallback(async () => {
    const dataToExport = allPlaces.length > 0 ? allPlaces : places;
    
    if (dataToExport.length === 0) {
      toast.error("No locations to export");
      return;
    }

    try {
      const response = await axios.post(
        `${API}/places/export-csv`,
        dataToExport,
        { responseType: 'blob' }
      );

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const locationPart = location || region || 'multiple';
      link.download = `locations-${category}-${locationPart.replace(/\s+/g, '-')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Exported ${dataToExport.length} locations to CSV`);
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export CSV");
    }
  }, [places, allPlaces, category, location, region]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch(1);
    }
  };

  // Clear region when location is entered and vice versa
  const handleLocationChange = (value) => {
    setLocation(value);
  };

  const handleRegionChange = (value) => {
    setRegion(value);
    if (value) {
      setLocation(""); // Clear location when region is selected
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.id === category);
  const activeLocationNames = locationNames.filter(name => name.trim()).length;

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />
      
      {/* Header / Search Section */}
      <header className="search-section border-b border-border">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="text-center mb-10">
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

          {/* Main Search Controls */}
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Row 1: Category + Location/Zip */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Category Select */}
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger 
                  className="h-12 text-base bg-white border-2 border-border focus:border-primary sm:w-56"
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

              {/* Location/Zip Input */}
              <div className="flex-1 relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="City, area, or zip code (e.g., Los Angeles, CA or 90210)"
                  value={location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="h-12 pl-12 text-base bg-white border-2 border-border focus:border-primary"
                  data-testid="location-input"
                  disabled={!!region}
                />
              </div>
            </div>

            {/* Row 2: Region Selector */}
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex items-center gap-2 text-sm text-muted-foreground sm:w-56 pt-2">
                <span>OR search by region:</span>
              </div>
              <div className="flex-1">
                <Select value={region} onValueChange={handleRegionChange}>
                  <SelectTrigger 
                    className="h-12 text-base bg-white border-2 border-border focus:border-primary"
                    data-testid="region-select"
                  >
                    <SelectValue placeholder="Select US region (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      <span className="text-muted-foreground">No region selected</span>
                    </SelectItem>
                    {Object.entries(US_REGIONS).map(([id, data]) => (
                      <SelectItem 
                        key={id} 
                        value={id}
                        data-testid={`region-option-${id}`}
                      >
                        <div className="flex items-center gap-2">
                          <MapPinned className="w-4 h-4" />
                          <span>{data.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Region States Display */}
                <RegionStatesDisplay regionId={region} />
              </div>
            </div>

            {/* Row 3: Specific Location Names */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Specific location names (optional, up to 10):
                </span>
                {locationNames.length < 10 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLocationName}
                    data-testid="add-location-name-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Location
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {locationNames.map((name, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="text"
                      placeholder={`Location name ${index + 1} (e.g., Central Park)`}
                      value={name}
                      onChange={(e) => updateLocationName(index, e.target.value)}
                      className="h-10 text-sm bg-white border border-border focus:border-primary"
                      data-testid={`location-name-input-${index}`}
                    />
                    {locationNames.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeLocationName(index)}
                        className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive"
                        data-testid={`remove-location-name-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Search Button */}
            <div className="flex justify-center pt-2">
              <Button
                onClick={() => handleSearch(1)}
                disabled={loading}
                className="h-14 px-12 text-base font-medium bg-primary hover:bg-primary/90"
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

            {/* Category Description */}
            {selectedCategory && (
              <p className="text-center text-sm text-muted-foreground">
                {selectedCategory.description}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Results Section */}
      <main>
        {/* Stats Bar */}
        {searched && pagination.total > 0 && (
          <div className="stats-bar" data-testid="stats-bar">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                  {pagination.total} locations found
                </span>
                {selectedCategory && (
                  <Badge variant="outline" className={selectedCategory.color}>
                    {selectedCategory.name}
                  </Badge>
                )}
                {location && (
                  <span className="text-sm text-muted-foreground">
                    in {location}
                  </span>
                )}
                {region && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    {US_REGIONS[region]?.name}
                  </Badge>
                )}
                {activeLocationNames > 0 && (
                  <span className="text-sm text-muted-foreground">
                    + {activeLocationNames} specific location{activeLocationNames > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
            </div>
          </div>
        )}

        {/* Results Grid or States */}
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <LoadingSkeleton />
          ) : places.length > 0 ? (
            <>
              <div 
                className="results-grid border-t border-l border-border"
                data-testid="results-grid"
              >
                {places.map((place, index) => (
                  <LocationCard key={place.id || index} place={place} index={index} />
                ))}
              </div>
              
              {/* Pagination */}
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
                No locations with complete data (address, website, and images) were found. Try a different category or location.
              </p>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </main>

      {/* Export Button (Fixed) */}
      {pagination.total > 0 && (
        <div className="export-button-container">
          <Button
            onClick={handleExportCSV}
            size="lg"
            className="shadow-lg hover:shadow-xl transition-shadow bg-foreground text-background hover:bg-foreground/90"
            data-testid="export-csv-button"
          >
            <Download className="w-5 h-5 mr-2" />
            Export CSV ({allPlaces.length || pagination.total})
          </Button>
        </div>
      )}
    </div>
  );
}

export default App;
