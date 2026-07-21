import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Compass,
  ArrowRight,
  Mountain,
  Sparkles,
  Palette,
  Music,
  UtensilsCrossed,
  Search,
  Database,
  Link2,
} from "lucide-react";

/**
 * Experience Lens landing page.
 * Renders at `/`. The search tool itself is at `/search`.
 */
export default function LandingPage() {
  const categories = [
    { icon: Mountain, label: "Thrill Seeking", hex: "#E63946" },
    { icon: UtensilsCrossed, label: "Foodie", hex: "#F4A261" },
    { icon: Music, label: "Pure Entertainment", hex: "#9B5DE5" },
    { icon: Palette, label: "Creative", hex: "#0F8FA8" },
    { icon: Sparkles, label: "Super Chill", hex: "#84A98C" },
  ];

  const features = [
    {
      icon: Search,
      title: "Multi-mode search",
      body: "Query by category, city, ZIP, state, US region, or a list of specific places — mix and match as needed.",
    },
    {
      icon: Database,
      title: "AI-enriched results",
      body: "Fill in missing descriptions with one click, scrape social handles automatically, and stamp categories on any result.",
    },
    {
      icon: Link2,
      title: "Trackable exports",
      body: "Bulk-shorten every website URL via short.io before exporting a clean CSV that opens directly in Sheets or Excel.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Subtle decorative gradient */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-40 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-28 pb-24 sm:pt-32 sm:pb-28">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-11 h-11 rounded-2xl bg-primary flex items-center justify-center shadow-md">
              <Compass className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
                Experience Lens
              </div>
              <div className="text-xs text-muted-foreground">Location discovery, sharpened.</div>
            </div>
          </div>

          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground leading-[1.05] max-w-3xl"
            style={{ fontFamily: "IBM Plex Sans, sans-serif" }}
            data-testid="landing-headline"
          >
            Discover places through a{" "}
            <span className="text-primary">sharper&nbsp;lens</span>.
          </h1>

          <p className="mt-8 text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
            Experience Lens is an AI-powered location discovery and enrichment platform built to uncover
            experience-based businesses across the United States. Search by category, city, state, region,
            or ZIP code to find relevant places, complete missing business information, organize results,
            and generate trackable links for internal reporting.
          </p>

          <p className="mt-6 text-base text-muted-foreground max-w-2xl leading-relaxed">
            From thrill-seeking adventures and standout food destinations to entertainment, creative
            activities, and laid-back escapes, Experience Lens helps turn location data into a
            structured catalog of places worth experiencing.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link to="/search">
              <Button size="lg" className="h-14 px-8 text-base font-medium bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all" data-testid="cta-start-searching">
                Start Exploring
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link to="/history">
              <Button variant="outline" size="lg" className="h-14 px-6 text-base font-medium border-2" data-testid="cta-view-history">
                View Past Searches
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Category strip */}
      <section className="border-y border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-6">Five experience lenses</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {categories.map(({ icon: Icon, label, hex }) => (
              <div
                key={label}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-background hover:shadow-sm transition-shadow"
                data-testid={`landing-cat-${label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: hex }}
                >
                  <Icon className="w-4 h-4 text-white" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{label}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{hex}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="grid gap-8 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="p-6 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA footer */}
      <section className="border-t border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3" style={{ fontFamily: "IBM Plex Sans, sans-serif" }}>
            Ready to turn locations into a catalog?
          </h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Kick off a search in seconds — pick a category, pick a place, and let Experience Lens do the enrichment.
          </p>
          <Link to="/search">
            <Button size="lg" className="h-12 px-8 bg-primary hover:bg-primary/90">
              Open the Search Tool
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="text-center py-8 text-xs text-muted-foreground">
        Experience Lens · Location discovery, sharpened.
      </footer>
    </div>
  );
}
