import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MapPin,
  Navigation,
  Building2,
  Plus,
  X,
  Info,
  Loader2,
  Search,
  RotateCcw,
} from "lucide-react";

/**
 * SearchFilters — the top "filters" block of the main search page.
 *
 * Encapsulates:
 *   1) Category grid (multi-select) with tooltips
 *   2) Search-method tabs: City/Zip, US Region, Specific Places
 *   3) Search + Restart buttons
 *
 * All state is owned by the parent (SearchPage); this component is presentational.
 */
export default function SearchFilters({
  CATEGORIES,
  US_REGIONS,
  // state
  categories,
  setCategories,
  searchTab,
  setSearchTab,
  location,
  setLocation,
  region,
  setRegion,
  locationNames,
  updateLocationName,
  addLocationName,
  removeLocationName,
  loading,
  // handlers
  onSearch,
  onRestart,
  onKeyPress,
}) {
  const selectedRegion = region ? US_REGIONS[region] : null;

  return (
    <section className="py-12 px-6 bg-gradient-to-b from-secondary/30 to-background">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Step 1: Category Selection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center">1</span>
            <h2 className="text-lg font-medium" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>Choose Experience Category</h2>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-1 rounded-full hover:bg-secondary transition-colors" data-testid="category-info-tooltip">
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs p-3 bg-foreground text-background rounded-lg" sideOffset={6}>
                  <p className="text-xs leading-relaxed">Optional when using <strong>Specific Places</strong> search. You can skip this step and search directly by location name.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <TooltipProvider delayDuration={200}>
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = categories.includes(cat.id);
                return (
                  <Tooltip key={cat.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setCategories(prev =>
                          prev.includes(cat.id)
                            ? prev.filter(c => c !== cat.id)
                            : [...prev, cat.id]
                        )}
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
                    onKeyPress={onKeyPress}
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
                  <p className="text-sm text-muted-foreground">Add specific locations to search (up to 20)</p>
                  {locationNames.length < 20 && (
                    <Button variant="outline" size="sm" onClick={addLocationName} data-testid="add-location-name-btn">
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  {locationNames.map((loc, index) => (
                    <div key={loc.id} className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1 min-w-0">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder={`Location ${index + 1} name (e.g., Central Park)`}
                          value={loc.name}
                          onChange={(e) => updateLocationName(index, 'name', e.target.value)}
                          className="h-11 pl-10 text-sm border focus:border-primary"
                          data-testid={`location-name-input-${index}`}
                        />
                      </div>
                      <div className="relative w-full sm:w-48 shrink-0">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="City (optional)"
                          value={loc.city}
                          onChange={(e) => updateLocationName(index, 'city', e.target.value)}
                          className="h-11 pl-10 text-sm border focus:border-primary"
                          data-testid={`location-city-input-${index}`}
                        />
                      </div>
                      <Input
                        type="text"
                        placeholder="ST"
                        value={loc.state}
                        onChange={(e) => updateLocationName(index, 'state', e.target.value)}
                        className="h-11 w-full sm:w-16 text-center text-sm font-medium border focus:border-primary uppercase"
                        maxLength={2}
                        data-testid={`location-state-input-${index}`}
                      />
                      {locationNames.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLocationName(index)}
                          className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                          data-testid={`remove-location-name-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground mt-2">
                    Name, City, and State are each optional — provide any combination to refine results (e.g., a place name alone, or a city + state to scan a whole area).
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Search + Restart Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={onSearch}
            disabled={loading || (categories.length === 0 && searchTab !== "specific")}
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
          <Button
            onClick={onRestart}
            variant="outline"
            size="lg"
            disabled={loading}
            className="h-14 px-6 text-base font-medium border-2"
            data-testid="restart-button"
            title="Clear results and start a new search"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Restart
          </Button>
        </div>
      </div>
    </section>
  );
}
