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
  Mountain, Palette, Music, UtensilsCrossed, DollarSign, Image as ImageIcon, Eye
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

const PRICE_RANGES = [
  { id: "", label: "Not Set" },
  { id: "$", label: "$ ($0 – $50)" },
  { id: "$$", label: "$$ ($51 – $100)" },
  { id: "$$$", label: "$$$ ($101+)" },
];

const FIX_FIELDS = [
  { id: "name", label: "Name", icon: FileSpreadsheet },
  { id: "address", label: "Address", icon: MapPin },
  { id: "latitude", label: "Latitude", icon: MapPin },
  { id: "longitude", label: "Longitude", icon: MapPin },
  { id: "description", label: "Description", icon: FileSpreadsheet },
  { id: "phone", label: "Phone", icon: Phone },
  { id: "website", label: "Website", icon: Globe },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "price_range", label: "Price Range", icon: DollarSign },
  { id: "rating", label: "Rating", icon: Star },
  { id: "images", label: "Images", icon: ImageIcon },
];

// Field Selection Checklist
function FieldSelector({ selected, onChange }) {
  const toggleField = (fieldId) => {
    onChange(prev => prev.includes(fieldId) ? prev.filter(f => f !== fieldId) : [...prev, fieldId]);
  };
  const selectAll = () => onChange(FIX_FIELDS.map(f => f.id));
  const clearAll = () => onChange([]);

  return (
    <div className="space-y-3" data-testid="field-selector">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Select which fields to cross-check & fix:</p>
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-xs text-primary hover:underline" data-testid="select-all-fields">Select All</button>
          <span className="text-xs text-muted-foreground">|</span>
          <button onClick={clearAll} className="text-xs text-muted-foreground hover:underline" data-testid="clear-all-fields">Clear</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {FIX_FIELDS.map(field => {
          const Icon = field.icon;
          const isActive = selected.includes(field.id);
          return (
            <button
              key={field.id}
              onClick={() => toggleField(field.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                isActive
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white text-muted-foreground border-border hover:border-primary/40"
              }`}
              data-testid={`field-toggle-${field.id}`}
            >
              <Icon className="w-3 h-3" />
              {field.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Image Preview Modal
function ImagePreview({ url, onClose }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-8" onClick={onClose} data-testid="image-preview-modal">
      <div className="relative max-w-3xl max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 z-10">
          <X className="w-4 h-4" />
        </button>
        <img src={url} alt="Preview" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl object-contain" />
      </div>
    </div>
  );
}

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

// Import Location Card — gallery view matching search results
function ImportCard({ item, index, isSelected, onSelect, onResolve, onGenerateDesc, generatingDesc, onChangeType, onChangePriceRange, onPreviewImage }) {
  const [expanded, setExpanded] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [imgErrors, setImgErrors] = useState({});
  const loc = item.original;
  const hasDiscreps = Object.keys(item.discrepancies || {}).length > 0;
  const images = loc.images || [];
  const hasImages = images.length > 0;
  const currentType = EXPERIENCE_TYPES.find(t => t.id === loc.experience_type) || EXPERIENCE_TYPES[0];
  const TypeIcon = currentType.icon;
  const currentPrice = PRICE_RANGES.find(p => p.id === loc.price_range) || PRICE_RANGES[0];

  // Extract IG handle for display
  const igHandle = (() => {
    if (!loc.instagram) return "";
    const match = loc.instagram.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
    return match ? `@${match[1]}` : loc.instagram;
  })();

  const handleImgError = (key) => setImgErrors(prev => ({ ...prev, [key]: true }));

  return (
    <Card
      className={`border rounded-lg overflow-hidden transition-all ${
        isSelected ? "ring-2 ring-primary" : ""
      } ${!loc.description ? "ring-2 ring-yellow-400" : ""}`}
      data-testid={`import-card-${index}`}
    >
      {/* Image Gallery */}
      <div className="relative">
        <div className="relative h-44 bg-secondary overflow-hidden">
          {hasImages && !imgErrors["main"] ? (
            <div className="relative w-full h-full group cursor-pointer" onClick={() => onPreviewImage(images[0])}>
              <img src={images[0]} alt={loc.name} className="w-full h-full object-cover" onError={() => handleImgError("main")} loading="lazy" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-secondary/60 text-muted-foreground">
              <ImageOff className="w-8 h-8 mb-1" />
              <span className="text-xs">{hasImages ? "Image failed to load" : "No images"}</span>
            </div>
          )}

          {/* Overlay badges */}
          <div className="absolute top-2.5 left-2.5 z-10">
            <Checkbox checked={isSelected} onCheckedChange={() => onSelect(item.id)} className="h-5 w-5 bg-white/90 backdrop-blur-sm border-2 data-[state=checked]:bg-primary data-[state=checked]:border-primary" data-testid={`import-select-${index}`} />
          </div>
          <div className="absolute top-2.5 left-11 z-10 flex items-center gap-1.5">
            {item.matched ? (
              <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500 text-white rounded-full shadow-sm">Matched</span>
            ) : (
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-500/80 text-white rounded-full shadow-sm">Not Found</span>
            )}
            {hasDiscreps && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-500 text-white rounded-full shadow-sm">{Object.keys(item.discrepancies).length} Discrepancies</span>
            )}
          </div>
          {!loc.description && (
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-10">
              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-400 text-yellow-900 rounded-full shadow-sm">No Description</span>
            </div>
          )}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            {loc.rating != null && (
              <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span className="text-sm font-medium">{Number(loc.rating).toFixed(1)}</span>
              </div>
            )}
            {loc.price_range && (
              <div className="bg-white/90 backdrop-blur-sm px-2 py-1 rounded">
                <span className="text-sm font-semibold text-emerald-700">{loc.price_range}</span>
              </div>
            )}
          </div>
          {hasImages && (
            <div className="absolute bottom-2 right-2.5 flex items-center gap-1.5">
              <div className="bg-emerald-500 text-white px-2 py-0.5 rounded text-xs backdrop-blur-sm flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> {images.length} image{images.length !== 1 ? "s" : ""}
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail strip with preview */}
        {images.length > 1 && (
          <div className="grid grid-cols-3 gap-px bg-border">
            {images.slice(1, 4).map((img, idx) => (
              <div key={idx} className="h-14 bg-secondary relative group cursor-pointer" onClick={() => !imgErrors[`thumb-${idx}`] && onPreviewImage(img)}>
                {imgErrors[`thumb-${idx}`] ? (
                  <div className="w-full h-full flex items-center justify-center bg-secondary"><ImageOff className="w-3 h-3 text-muted-foreground" /></div>
                ) : (
                  <>
                    <img src={img} alt={`${loc.name} ${idx + 2}`} className="w-full h-full object-cover" onError={() => handleImgError(`thumb-${idx}`)} loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Eye className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </>
                )}
              </div>
            ))}
            {images.length < 4 && [...Array(4 - images.length)].map((_, idx) => (
              <div key={`empty-${idx}`} className="h-14 bg-secondary/40" />
            ))}
          </div>
        )}
      </div>

      {/* Card Content */}
      <CardContent className="p-4 space-y-3">
        <h3 className="font-semibold text-base leading-tight line-clamp-2" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>{loc.name}</h3>

        {/* Type + Price selectors row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Experience Type */}
          <div className="relative">
            <button onClick={() => { setTypeOpen(!typeOpen); setPriceOpen(false); }} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${currentType.color} hover:opacity-80`} data-testid={`experience-type-btn-${index}`}>
              <TypeIcon className="w-3 h-3" />
              {currentType.id ? currentType.name : "Set Category"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {typeOpen && (
              <div className="absolute z-20 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[180px]" data-testid={`experience-type-dropdown-${index}`}>
                {EXPERIENCE_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button key={type.id} onClick={() => { onChangeType(item.id, type.id); setTypeOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${loc.experience_type === type.id ? "bg-secondary font-medium" : ""}`} data-testid={`experience-type-option-${type.id || "none"}-${index}`}>
                      <Icon className="w-3 h-3" /> {type.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Price Range */}
          <div className="relative">
            <button onClick={() => { setPriceOpen(!priceOpen); setTypeOpen(false); }} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${loc.price_range ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"} hover:opacity-80`} data-testid={`price-range-btn-${index}`}>
              <DollarSign className="w-3 h-3" />
              {loc.price_range || "Set Price"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {priceOpen && (
              <div className="absolute z-20 mt-1 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]" data-testid={`price-range-dropdown-${index}`}>
                {PRICE_RANGES.map((pr) => (
                  <button key={pr.id} onClick={() => { onChangePriceRange(item.id, pr.id); setPriceOpen(false); }} className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${loc.price_range === pr.id ? "bg-secondary font-medium" : ""}`} data-testid={`price-option-${pr.id || "none"}-${index}`}>
                    <DollarSign className="w-3 h-3" /> {pr.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{loc.address || <span className="italic">No address</span>}</span>
        </div>

        {/* Description */}
        {loc.description ? (
          <p className="text-sm text-muted-foreground line-clamp-3">{loc.description}</p>
        ) : (
          <div className="flex items-center gap-2 py-1">
            <p className="text-sm text-yellow-600 italic">No description</p>
            <Button variant="outline" size="sm" className="h-7 text-xs px-3" onClick={() => onGenerateDesc(item.id)} disabled={generatingDesc} data-testid={`generate-desc-${index}`}>
              {generatingDesc ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
              Generate
            </Button>
          </div>
        )}

        {/* Coordinates */}
        {(loc.latitude !== 0 || loc.longitude !== 0) && (
          <div className="text-mono text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
            {Number(loc.latitude).toFixed(6)}, {Number(loc.longitude).toFixed(6)}
          </div>
        )}

        {/* Links & Info row */}
        <div className="flex flex-wrap gap-3 pt-1">
          {loc.website && (
            <a href={loc.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid={`import-website-${index}`}>
              <Globe className="w-3 h-3" /> Website <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {loc.phone && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground" data-testid={`import-phone-${index}`}>
              <Phone className="w-3 h-3" /> {loc.phone}
            </span>
          )}
          {loc.instagram && (
            <a href={loc.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-pink-600 hover:underline" data-testid={`import-instagram-${index}`}>
              <Instagram className="w-3 h-3" /> {igHandle} <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </CardContent>

      {/* Discrepancies panel */}
      {hasDiscreps && (
        <div className="border-t">
          <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors" data-testid={`toggle-discrep-${index}`}>
            <span>Review {Object.keys(item.discrepancies).length} discrepancies</span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {expanded && (
            <div className="p-3 space-y-2 bg-white border-t">
              {Object.entries(item.discrepancies).map(([field, data]) => (
                <DiscrepancyItem key={field} field={field} label={data.label} original={data.original} google={data.google} resolved={item.resolutions?.[field]} onResolve={(f, choice) => onResolve(item.id, f, choice)} />
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
  const [fieldsToFix, setFieldsToFix] = useState(FIX_FIELDS.map(f => f.id));
  const [previewImage, setPreviewImage] = useState(null);

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
    if (fieldsToFix.length === 0) { toast.error("Please select at least one field to fix"); return; }
    setChecking(true);
    try {
      const locsToCheck = locations.map((l) => l.original);
      const resp = await axios.post(`${API}/import/cross-check`, {
        locations: locsToCheck,
        fields_to_fix: fieldsToFix,
      });
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
  }, [locations, fieldsToFix]);

  const handleResolve = useCallback((itemId, field, choice) => {
    setLocations((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const newResolutions = { ...item.resolutions, [field]: choice };
        const newOriginal = { ...item.original };
        if (choice === "google" && item.google) {
          if (field === "images") {
            newOriginal.images = item.google.images || [];
          } else {
            newOriginal[field] = item.google[field];
          }
        } else if (choice === "original" && item.discrepancies[field]) {
          if (field === "images") {
            // Keep original images as-is (may be empty)
          } else {
            newOriginal[field] = item.discrepancies[field].original;
          }
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

  const handleChangePriceRange = useCallback((itemId, priceId) => {
    setLocations((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, original: { ...item.original, price_range: priceId } }
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
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full text-white text-sm font-medium flex items-center justify-center ${crossChecked ? "bg-emerald-500" : "bg-primary"}`}>2</span>
              <h2 className="text-lg font-medium" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>What do you want to fix?</h2>
            </div>

            <FieldSelector selected={fieldsToFix} onChange={setFieldsToFix} />

            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleCrossCheck}
                disabled={checking || fieldsToFix.length === 0}
                className="bg-primary hover:bg-primary/90"
                data-testid="cross-check-btn"
              >
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                {checking ? "Cross-checking..." : crossChecked ? "Re-check All" : `Cross-Check ${fieldsToFix.length} Fields`}
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
                  onChangeType={handleChangeType}
                  onChangePriceRange={handleChangePriceRange}
                  onPreviewImage={setPreviewImage}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {previewImage && <ImagePreview url={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  );
}
