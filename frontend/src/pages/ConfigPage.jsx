import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings,
  Code,
  Database,
  Globe,
  Server,
  RefreshCw,
  Save,
  RotateCcw,
  Plus,
  X,
  Mountain,
  Sparkles,
  Palette,
  Music,
  UtensilsCrossed,
  Info,
  CheckCircle
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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

function CategoryConfigCard({ categoryId, config, onUpdate }) {
  const [placeTypes, setPlaceTypes] = useState(config?.place_types || []);
  const [keywords, setKeywords] = useState(config?.keywords || "");
  const [newType, setNewType] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const CategoryIcon = CATEGORY_ICONS[categoryId] || Settings;

  useEffect(() => {
    setPlaceTypes(config?.place_types || []);
    setKeywords(config?.keywords || "");
    setHasChanges(false);
  }, [config]);

  const addPlaceType = () => {
    if (newType.trim() && !placeTypes.includes(newType.trim())) {
      setPlaceTypes([...placeTypes, newType.trim()]);
      setNewType("");
      setHasChanges(true);
    }
  };

  const removePlaceType = (type) => {
    setPlaceTypes(placeTypes.filter(t => t !== type));
    setHasChanges(true);
  };

  const handleKeywordsChange = (value) => {
    setKeywords(value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(categoryId, placeTypes, keywords);
      setHasChanges(false);
      toast.success(`${CATEGORY_NAMES[categoryId]} configuration saved`);
    } catch (error) {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${CATEGORY_COLORS[categoryId]} flex items-center justify-center`}>
              <CategoryIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{CATEGORY_NAMES[categoryId]}</CardTitle>
              <CardDescription>Configure search parameters</CardDescription>
            </div>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="w-4 h-4 mr-1" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Place Types */}
        <div>
          <label className="text-sm font-medium mb-2 block">Google Place Types</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {placeTypes.map((type) => (
              <Badge key={type} variant="secondary" className="pr-1">
                {type}
                <button
                  onClick={() => removePlaceType(type)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add place type (e.g., restaurant)"
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addPlaceType()}
              className="flex-1 h-9"
            />
            <Button variant="outline" size="sm" onClick={addPlaceType}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Keywords */}
        <div>
          <label className="text-sm font-medium mb-2 block">Search Keywords</label>
          <Textarea
            placeholder="Enter keywords separated by OR (e.g., spa OR massage OR yoga studio)"
            value={keywords}
            onChange={(e) => handleKeywordsChange(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use "OR" to separate keywords for broader search results
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConfigPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/config`);
      setConfig(response.data);
    } catch (error) {
      console.error("Error fetching config:", error);
      toast.error("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleUpdateCategory = async (categoryId, placeTypes, keywords) => {
    await axios.put(`${API}/config/category`, {
      category_id: categoryId,
      place_types: placeTypes,
      keywords: keywords
    });
    // Update local state
    setConfig(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [categoryId]: { place_types: placeTypes, keywords }
      }
    }));
  };

  const handleReset = async () => {
    if (!window.confirm("Reset all configurations to defaults? This cannot be undone.")) return;
    
    setResetting(true);
    try {
      await axios.post(`${API}/config/reset`);
      await fetchConfig();
      toast.success("Configuration reset to defaults");
    } catch (error) {
      toast.error("Failed to reset configuration");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold mb-1" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              Configuration
            </h1>
            <p className="text-muted-foreground">
              Manage API settings and search parameters
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchConfig}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetting}>
              <RotateCcw className={`w-4 h-4 mr-2 ${resetting ? 'animate-spin' : ''}`} />
              Reset to Defaults
            </Button>
          </div>
        </div>

        <Tabs defaultValue="system" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="system" className="text-base">
              <Server className="w-4 h-4 mr-2" />
              System Info
            </TabsTrigger>
            <TabsTrigger value="categories" className="text-base">
              <Settings className="w-4 h-4 mr-2" />
              Experience Types
            </TabsTrigger>
          </TabsList>

          {/* System Info Tab */}
          <TabsContent value="system" className="space-y-6">
            {/* Version Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Application Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">App Version</p>
                    <p className="text-2xl font-semibold">{config?.app_version}</p>
                  </div>
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">API Version</p>
                    <p className="text-lg font-medium">{config?.api_version}</p>
                  </div>
                  <div className="p-4 bg-secondary/30 rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Build Date</p>
                    <p className="text-lg font-medium">{config?.build_date}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tech Stack */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Technology Stack
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Globe className="w-5 h-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Frontend</p>
                      <p className="text-sm text-muted-foreground">{config?.tech_stack?.frontend}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Server className="w-5 h-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Backend</p>
                      <p className="text-sm text-muted-foreground">{config?.tech_stack?.backend}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Database className="w-5 h-5 text-purple-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Database</p>
                      <p className="text-sm text-muted-foreground">{config?.tech_stack?.database}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <Globe className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-medium">External API</p>
                      <p className="text-sm text-muted-foreground">{config?.tech_stack?.external_api}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Protocol */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Search Protocol
                </CardTitle>
                <CardDescription>How the application searches and processes results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {config?.protocol && Object.entries(config.protocol).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-3 p-3 bg-secondary/20 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm capitalize">{key.replace(/_/g, ' ')}</p>
                        <p className="text-sm text-muted-foreground">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4">
            <Card className="mb-6">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium">About Experience Type Configuration</p>
                    <p className="text-sm text-muted-foreground">
                      Each experience category uses Google Place Types and search keywords to find relevant locations. 
                      Modify these settings to refine search results. Changes are saved immediately and will apply to future searches.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {config?.categories && Object.entries(config.categories).map(([categoryId, categoryConfig]) => (
              <CategoryConfigCard
                key={categoryId}
                categoryId={categoryId}
                config={categoryConfig}
                onUpdate={handleUpdateCategory}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
