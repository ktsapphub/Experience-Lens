import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Download, MapPin, Globe, Instagram, Star, Loader2,
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X,
  Map, Clock, Settings, Phone, ExternalLink, ImageOff, Sparkles,
  ChevronDown, ChevronUp, RefreshCw, ArrowRight, Info,
  Mountain, Palette, Music, UtensilsCrossed
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const EXPERIENCE_TYPES = [
  { id: "", name: "None", icon: X, color: "bg-gray-100 text-gray-500" },
  { id: "Thrill Seeking", name: "Thrill Seeking", icon: Mountain, color: "bg-orange-100 text-orange-700" },
  { id: "Super Chill", name: "Super Chill", icon: Sparkles, color: "bg-emerald-100 text-emerald-700" },
  { id: "Creative", name: "Creative", icon: Palette, color: "bg-purple-100 text-purple-700" },
  { id: "Pure Entertainment", name: "Pure Entertainment", icon: Music, color: "bg-pink-100 text-pink-700" },
  { id: "Foodie", name: "Foodie", icon: UtensilsCrossed, color: "bg-red-100 text-red-700" },
];

// File Upload Area
function UploadArea({ onFileSelect, loading }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelect(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
        dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-secondary/30"
      }`}
      data-testid="upload-area"
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
        data-testid="file-input"
      />
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm font-medium">Parsing file...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-medium text-base">Drop your CSV or Excel file here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse. Accepts .csv, .xlsx</p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Format: Experience Type, Name, Address, Lat, Lng, Website, Phone, Instagram, Description, Rating, Images</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Discrepancy Resolver
function DiscrepancyItem({ field, label, original, google, resolved, onResolve }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm" data-testid={`discrepancy-${field}`}>
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-2">
        <p className="font-medium text-amber-900">{label}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => onResolve(field, "original")}
            className={`p-2 rounded-lg border text-left transition-all ${
              resolved === "original"
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-white hover:border-primary/50"
            }`}
            data-testid={`resolve-original-${field}`}
          >
            <p className="text-xs font-medium text-muted-foreground mb-1">Your Data</p>
            <p className="text-sm break-all">{original || <span className="italic text-muted-foreground">empty</span>}</p>
          </button>
          <button
            onClick={() => onResolve(field, "google")}
            className={`p-2 rounded-lg border text-left transition-all ${
              resolved === "google"
                ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                : "border-border bg-white hover:border-emerald-500/50"
            }`}
            data-testid={`resolve-google-${field}`}
          >
            <p className="text-xs font-medium text-emerald-700 mb-1">Google Data</p>
            <p className="text-sm break-all">{google || <span className="italic text-muted-foreground">empty</span>}</p>
          </button>
        </div>
      </div>
    </div>
  );
}

// Import Location Card
function ImportCard({ item, index, isSelected, onSelect, onResolve, onGenerateDesc, generatingDesc, onChangeType }) {
  const [expanded, setExpanded] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const loc = item.original;
  const hasDiscreps = Object.keys(item.discrepancies || {}).length > 0;
  const mainImage = loc.images?.[0];
  const currentType = EXPERIENCE_TYPES.find(t => t.id === loc.experience_type) || EXPERIENCE_TYPES[0];
  const TypeIcon = currentType.icon;

  return (
    <Card
      className={`border rounded-lg overflow-hidden transition-all ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${!loc.description ? "ring-2 ring-yellow-400" : ""}`}
      data-testid={`import-card-${index}`}
    >
      {/* Header with checkbox + status */}
      <div className="flex items-center justify-between p-3 bg-secondary/30 border-b">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(item.id)}
            className="h-4 w-4"
            data-testid={`import-select-${index}`}
          />
          <span className="font-medium text-sm truncate max-w-[200px]">{loc.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {item.matched ? (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Matched
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">
              Not Found
            </Badge>
          )}
          {hasDiscreps && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              <AlertTriangle className="w-3 h-3 mr-1" /> {Object.keys(item.discrepancies).length} Discrepancies
            </Badge>
          )}
          {!loc.description && (
            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
              No Description
            </Badge>
          )}
        </div>
      </div>

      {/* Experience Type Selector */}
      <div className="px-3 pt-2 relative">
        <button
          onClick={() => setTypeOpen(!typeOpen)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${currentType.color} hover:opacity-80`}
          data-testid={`experience-type-btn-${index}`}
        >
          <TypeIcon className="w-3 h-3" />
          {currentType.id ? currentType.name : "Set Experience Type"}
          <ChevronDown className="w-3 h-3" />
        </button>
        {typeOpen && (
          <div className="absolute z-20 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[180px]" data-testid={`experience-type-dropdown-${index}`}>
            {EXPERIENCE_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => { onChangeType(item.id, type.id); setTypeOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${
                    loc.experience_type === type.id ? "bg-secondary font-medium" : ""
                  }`}
                  data-testid={`experience-type-option-${type.id || "none"}-${index}`}
                >
                  <Icon className="w-3 h-3" />
                  {type.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Image + Details */}
      <div className="flex">
        {mainImage && (
          <div className="w-32 h-32 shrink-0 bg-secondary">
            <img src={mainImage} alt={loc.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
          </div>
        )}
        <CardContent className="p-3 flex-1 space-y-2 min-w-0">
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{loc.address || "No address"}</span>
          </div>
          {loc.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{loc.description}</p>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-yellow-600 italic">No description</p>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => onGenerateDesc(item.id)}
                disabled={generatingDesc}
                data-testid={`generate-desc-${index}`}
              >
                {generatingDesc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Generate
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-xs">
            {loc.website && (
              <a href={loc.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                <Globe className="w-3 h-3" /> Website <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
            {loc.phone && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Phone className="w-3 h-3" /> {loc.phone}
              </span>
            )}
            {loc.instagram && (
              <a href={loc.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-pink-600 hover:underline">
                <Instagram className="w-3 h-3" /> Instagram <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
            {loc.rating && (
              <span className="inline-flex items-center gap-1 text-amber-600">
                <Star className="w-3 h-3 fill-amber-400" /> {loc.rating}
              </span>
            )}
          </div>
        </CardContent>
      </div>

      {/* Discrepancies */}
      {hasDiscreps && (
        <div className="border-t">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors"
            data-testid={`toggle-discrep-${index}`}
          >
            <span>Review {Object.keys(item.discrepancies).length} discrepancies</span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expanded && (
            <div className="p-3 space-y-2 bg-white">
              {Object.entries(item.discrepancies).map(([field, data]) => (
                <DiscrepancyItem
                  key={field}
                  field={field}
                  label={data.label}
                  original={data.original}
                  google={data.google}
                  resolved={item.resolutions?.[field]}
                  onResolve={(f, choice) => onResolve(item.id, f, choice)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ImportPage() {
  const [locations, setLocations] = useState([]);
  const [crossChecked, setCrossChecked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [fileName, setFileName] = useState("");

  const handleFileSelect = useCallback(async (file) => {
    setUploading(true);
    setFileName(file.name);
    setCrossChecked(false);
    setSelectedIds(new Set());

    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await axios.post(`${API}/import/upload`, formData);
      if (resp.data.success) {
        const locs = resp.data.locations.map((l) => ({
          ...l,
          id: l.id || crypto.randomUUID(),
          original: l,
          google: null,
          discrepancies: {},
          matched: false,
          resolutions: {},
        }));
        setLocations(locs);
        toast.success(`Imported ${locs.length} locations from ${file.name}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to parse file");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleCrossCheck = useCallback(async () => {
    if (locations.length === 0) return;
    setChecking(true);
    try {
      const locsToCheck = locations.map((l) => l.original);
      const resp = await axios.post(`${API}/import/cross-check`, locsToCheck);
      if (resp.data.success) {
        const results = resp.data.results.map((r) => ({
          ...r,
          resolutions: {},
        }));
        setLocations(results);
        setCrossChecked(true);
        const matched = results.filter((r) => r.matched).length;
        const discrepCount = results.reduce((acc, r) => acc + Object.keys(r.discrepancies || {}).length, 0);
        toast.success(`Cross-checked: ${matched}/${results.length} matched, ${discrepCount} discrepancies found`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Cross-check failed");
    } finally {
      setChecking(false);
    }
  }, [locations]);

  const handleResolve = useCallback((itemId, field, choice) => {
    setLocations((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const newResolutions = { ...item.resolutions, [field]: choice };
        const newOriginal = { ...item.original };
        if (choice === "google" && item.google) {
          newOriginal[field] = item.google[field];
        } else if (choice === "original" && item.discrepancies[field]) {
          newOriginal[field] = item.discrepancies[field].original;
        }
        return { ...item, resolutions: newResolutions, original: newOriginal };
      })
    );
  }, []);

  const handleGenerateDesc = useCallback(async (itemId) => {
    const item = locations.find((l) => l.id === itemId);
    if (!item) return;
    setGeneratingId(itemId);
    try {
      const resp = await axios.post(`${API}/import/generate-description`, {
        name: item.original.name,
        address: item.original.address,
        category: item.original.experience_type,
        website: item.original.website,
      });
      if (resp.data.success) {
        setLocations((prev) =>
          prev.map((l) =>
            l.id === itemId ? { ...l, original: { ...l.original, description: resp.data.description } } : l
          )
        );
        toast.success("Description generated");
      }
    } catch (err) {
      toast.error("Failed to generate description");
    } finally {
      setGeneratingId(null);
    }
  }, [locations]);

  const handleGenerateAllDescs = useCallback(async () => {
    const missing = locations.filter((l) => !l.original.description);
    if (missing.length === 0) { toast.info("All locations already have descriptions"); return; }
    setGeneratingAll(true);
    let count = 0;
    for (const item of missing) {
      try {
        const resp = await axios.post(`${API}/import/generate-description`, {
          name: item.original.name,
          address: item.original.address,
          category: item.original.experience_type,
          website: item.original.website,
        });
        if (resp.data.success) {
          setLocations((prev) =>
            prev.map((l) =>
              l.id === item.id ? { ...l, original: { ...l.original, description: resp.data.description } } : l
            )
          );
          count++;
        }
      } catch { /* continue */ }
    }
    setGeneratingAll(false);
    toast.success(`Generated ${count} descriptions`);
  }, [locations]);

  const handleChangeType = useCallback((itemId, typeId) => {
    setLocations((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, original: { ...item.original, experience_type: typeId } }
          : item
      )
    );
  }, []);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const selectAll = () => setSelectedIds(new Set(locations.map((l) => l.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleExport = useCallback(async (type) => {
    const items = type === "selected"
      ? locations.filter((l) => selectedIds.has(l.id))
      : locations;
    if (items.length === 0) { toast.error("No locations to export"); return; }

    try {
      const exportData = items.map((l) => l.original);
      const resp = await axios.post(`${API}/import/export-csv`, exportData, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enriched-${fileName || "locations"}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${items.length} locations`);
    } catch {
      toast.error("Export failed");
    }
  }, [locations, selectedIds, fileName]);

  const missingDescCount = locations.filter((l) => !l.original.description).length;
  const discrepCount = locations.reduce((acc, l) => acc + Object.keys(l.discrepancies || {}).length, 0);
  const matchedCount = locations.filter((l) => l.matched).length;

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
                  <h1 className="text-xl font-semibold" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>MapData Collector</h1>
                  <p className="text-xs text-muted-foreground">Smart Google Maps Location Scraper</p>
                </div>
              </Link>
              <nav className="flex items-center gap-1 ml-4">
                <Link to="/"><Button variant="ghost" size="sm" className="text-sm"><Search className="w-4 h-4 mr-1" />Search</Button></Link>
                <Link to="/import"><Button variant="ghost" size="sm" className="text-sm font-semibold text-primary"><Upload className="w-4 h-4 mr-1" />Import</Button></Link>
                <Link to="/history"><Button variant="ghost" size="sm" className="text-sm"><Clock className="w-4 h-4 mr-1" />History</Button></Link>
                <Link to="/config"><Button variant="ghost" size="sm" className="text-sm"><Settings className="w-4 h-4 mr-1" />Config</Button></Link>
              </nav>
            </div>
            {locations.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <Button onClick={() => handleExport("selected")} variant="outline" className="border-primary text-primary" data-testid="import-export-selected">
                    <Download className="w-4 h-4 mr-2" /> Export Selected ({selectedIds.size})
                  </Button>
                )}
                <Button onClick={() => handleExport("all")} className="bg-foreground text-background hover:bg-foreground/90" data-testid="import-export-all">
                  <Download className="w-4 h-4 mr-2" /> Export All ({locations.length})
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Upload Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center">1</span>
            <h2 className="text-lg font-medium" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>Import Locations</h2>
          </div>
          <UploadArea onFileSelect={handleFileSelect} loading={uploading} />
          {fileName && locations.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4" />
              <span>{fileName} — {locations.length} locations loaded</span>
            </div>
          )}
        </div>

        {/* Cross-Check Section */}
        {locations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full text-white text-sm font-medium flex items-center justify-center ${crossChecked ? "bg-emerald-500" : "bg-primary"}`}>2</span>
              <h2 className="text-lg font-medium" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>Cross-Check & Enrich</h2>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleCrossCheck}
                disabled={checking}
                className="bg-primary hover:bg-primary/90"
                data-testid="cross-check-btn"
              >
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                {checking ? "Cross-checking..." : crossChecked ? "Re-check All" : "Cross-Check Against Google"}
              </Button>
              {missingDescCount > 0 && (
                <Button
                  onClick={handleGenerateAllDescs}
                  disabled={generatingAll}
                  variant="outline"
                  data-testid="generate-all-desc-btn"
                >
                  {generatingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Generate All Missing Descriptions ({missingDescCount})
                </Button>
              )}
            </div>

            {crossChecked && (
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" /> {matchedCount}/{locations.length} matched
                </span>
                {discrepCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="w-4 h-4" /> {discrepCount} discrepancies
                  </span>
                )}
                {missingDescCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-yellow-700">
                    <Info className="w-4 h-4" /> {missingDescCount} missing descriptions
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {locations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-medium flex items-center justify-center">3</span>
                <h2 className="text-lg font-medium" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>Review & Export</h2>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {selectedIds.size > 0 ? (
                  <span className="text-muted-foreground">{selectedIds.size} selected</span>
                ) : (
                  <span className="text-muted-foreground">None selected</span>
                )}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAll} data-testid="import-select-all">Select All</Button>
                {selectedIds.size > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll} data-testid="import-deselect-all">
                    <X className="w-3 h-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="import-results-grid">
              {locations.map((item, i) => (
                <ImportCard
                  key={item.id}
                  item={item}
                  index={i}
                  isSelected={selectedIds.has(item.id)}
                  onSelect={toggleSelect}
                  onResolve={handleResolve}
                  onGenerateDesc={handleGenerateDesc}
                  generatingDesc={generatingId === item.id}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
