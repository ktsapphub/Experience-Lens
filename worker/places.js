// Places search, Instagram enrichment, photo proxy and CSV export (port of backend/server.py).
import { US_REGIONS } from "./constants.js";
import { HttpError, int, isObj, num, pyFloat, str, strList } from "./util.js";

const GOOGLE_FIELDS =
  "places.id,places.displayName,places.formattedAddress,places.location," +
  "places.websiteUri,places.internationalPhoneNumber,places.rating," +
  "places.priceLevel,places.photos,places.editorialSummary,places.types";

const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: "$",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$",
};

const INSTAGRAM_PATTERNS = [
  /href=["'](?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?["']/gi,
  /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?/gi,
];
const INSTAGRAM_SKIP = new Set([
  "explore", "p", "reel", "reels", "stories", "accounts", "direct", "about",
  "developer", "legal", "privacy", "terms", "api", "press", "",
]);
const PHOTO_PARAM_RE = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const photoProxyUrl = (name) => `/api/places/photo?name=${name}`;

export function parseInstagramHandle(html) {
  for (const re of INSTAGRAM_PATTERNS) {
    for (const m of html.matchAll(re)) {
      const handle = m[1].trim().replace(/\/+$/, "").toLowerCase();
      if (handle && !INSTAGRAM_SKIP.has(handle) && handle.length <= 30) return handle;
    }
  }
  return null;
}

export function buildPlaceResult(place, category) {
  const photosData = place.photos || [];
  const website = place.websiteUri;
  const address = place.formattedAddress || "";
  if (!photosData.length || !website || !address || address === "Address not available") return null;

  const photos = photosData
    .slice(0, 3)
    .filter((p) => p.name)
    .map((p) => ({ url: photoProxyUrl(p.name), height: 400, width: 600 }));
  const coords = place.location || {};
  const site = String(website);
  return {
    id: place.id || crypto.randomUUID(),
    name: place.displayName?.text ?? "Unknown",
    address,
    latitude: coords.latitude ?? 0,
    longitude: coords.longitude ?? 0,
    website: site,
    phone: place.internationalPhoneNumber ?? null,
    instagram: site.toLowerCase().includes("instagram.com") ? site : null,
    description: place.editorialSummary?.text ?? "",
    photos,
    rating: place.rating ?? null,
    price_range: PRICE_LEVEL_MAP[place.priceLevel] ?? null,
    category,
  };
}

export function interleaveByCategory(places, categories) {
  if (categories.length <= 1) return places;
  const buckets = Object.fromEntries(categories.map((c) => [c, []]));
  const others = [];
  for (const p of places) (buckets[p.category] || others).push(p);
  const out = [];
  while (categories.some((c) => buckets[c].length)) {
    for (const c of categories) if (buckets[c].length) out.push(buckets[c].shift());
  }
  return out.concat(others);
}

export function normalizeSearchRequest(body, cfg) {
  if (!isObj(body)) throw new HttpError(422, "Request body must be a JSON object");
  const category = str(body.category, "category", { max: 100 });
  let categories = strList(body.categories, "categories", { maxItems: 10, maxLen: 100 });
  const location = str(body.location, "location", { max: 200 });
  const region = str(body.region, "region", { max: 50 });
  const locationNamesRaw = strList(body.location_names, "location_names", { maxItems: 50, maxLen: 200 });
  const page = int(body.page, "page", { min: 1, max: 100000, def: 1 });
  const perPage = int(body.per_page, "per_page", { min: 1, max: 1000, def: 20 });

  categories = (categories.length ? categories : category ? [category] : []).filter(Boolean);
  categories = [...new Set(categories)];
  for (const c of categories) {
    if (!(c in cfg.types)) {
      throw new HttpError(400, `Invalid category '${c}'. Valid categories: [${Object.keys(cfg.types).map((k) => `'${k}'`).join(", ")}]`);
    }
  }
  if (!categories.length && !locationNamesRaw.length) {
    throw new HttpError(400, "Please select a category, or use specific location names to search without one");
  }
  if (!location && !region && !locationNamesRaw.length) {
    throw new HttpError(400, "Please provide a location (city/zip), region, or specific location names");
  }

  const locationNames = locationNamesRaw.slice(0, 10);
  const searchLocations = locationNames.map((l) => l.trim()).filter(Boolean);
  if (region && Object.hasOwn(US_REGIONS, region)) searchLocations.push(...US_REGIONS[region].states.slice(0, 5));
  if (location) searchLocations.push(location.trim());
  if (!searchLocations.length) throw new HttpError(400, "No valid search location provided");

  return { categories, locationNames, searchLocations, location, region, page, perPage };
}

async function googleTextSearch(env, query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": GOOGLE_FIELDS,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status !== 200) {
    console.warn(`Google API error for ${JSON.stringify(query)}: ${res.status}`);
    return [];
  }
  return (await res.json()).places || [];
}

async function scrapeInstagram(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const res = await fetch(u, { redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    if (res.status === 200) return parseInstagramHandle((await res.text()).slice(0, 200000));
  } catch {
    /* unreachable site: no handle */
  }
  return null;
}

// Plan Google queries in the old order (category-major: keyword pass per location, then 2 place-type passes),
// trimmed fairly per category so the whole request stays inside the Workers subrequest limit.
function planQueries(req, cfg, maxQueries) {
  const isDirect = !req.categories.length && req.locationNames.length > 0;
  const cats = req.categories.length ? req.categories : [""];
  const perCat = Math.max(1, Math.floor(maxQueries / cats.length));
  const plan = [];
  for (const cat of cats) {
    const q = [];
    const keywords = cat ? cfg.keywords[cat] || "" : "";
    for (const loc of req.searchLocations) q.push({ cat, text: isDirect ? loc : `${keywords} in ${loc}` });
    for (const t of (cat ? cfg.types[cat] || [] : []).slice(0, 2)) {
      q.push({ cat, text: `${t} in ${req.searchLocations[0]}` });
    }
    plan.push(...q.slice(0, perCat));
  }
  return plan;
}

export async function searchPlaces(env, req, cfg) {
  if (!env.GOOGLE_PLACES_API_KEY) {
    console.error("GOOGLE_PLACES_API_KEY not configured");
    throw new HttpError(500, "Google Places API is not configured. Set the GOOGLE_PLACES_API_KEY secret.");
  }
  const budget = num(env, "SUBREQUEST_BUDGET", 40);
  const maxTotal = Math.max(60, 60 * Math.max(req.categories.length, 1));
  const plan = planQueries(req, cfg, Math.max(1, Math.floor(budget * 0.6)));

  let responses;
  try {
    responses = await Promise.all(plan.map((p) => googleTextSearch(env, p.text)));
  } catch (e) {
    console.error("Google request failed", e);
    throw new HttpError(502, "Failed to connect to Google Places API");
  }

  const all = [];
  const seenIds = new Set();
  const seenNameAddr = new Set();
  plan.forEach((p, i) => {
    if (all.length >= maxTotal) return;
    for (const raw of responses[i]) {
      const r = buildPlaceResult(raw, p.cat);
      if (!r) continue;
      const key = `${r.name}|${r.address}`.toLowerCase();
      if (seenIds.has(raw.id) || seenNameAddr.has(key)) continue;
      seenIds.add(raw.id);
      seenNameAddr.add(key);
      all.push(r);
    }
  });

  const ordered = interleaveByCategory(all, req.categories);

  // Instagram enrichment is best effort and bounded by the remaining subrequest budget.
  const igSlots = Math.max(0, budget - plan.length);
  const targets = ordered.filter((p) => !p.instagram && p.website).slice(0, igSlots);
  const handles = await Promise.all(targets.map((p) => scrapeInstagram(p.website)));
  targets.forEach((p, i) => {
    if (handles[i]) p.instagram = `https://instagram.com/${handles[i]}`;
  });
  return ordered;
}

export function paginate(places, page, perPage) {
  const total = places.length;
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 1;
  const p = Math.max(1, Math.min(page, totalPages));
  return {
    success: true,
    places: places.slice((p - 1) * perPage, p * perPage),
    total,
    page: p,
    per_page: perPage,
    total_pages: totalPages,
  };
}

export async function persistHistory(env, req, places) {
  const method = req.region ? "region" : req.locationNames.length ? "specific" : "location";
  await env.DB.prepare(
    `INSERT INTO search_history (id, category, search_method, location, region, location_names, results_count, results, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      req.categories.join(","),
      method,
      req.location,
      req.region,
      JSON.stringify(req.locationNames),
      places.length,
      JSON.stringify(places.map((p) => ({ name: p.name, address: p.address, website: p.website }))),
      new Date().toISOString(),
    )
    .run();
}

// ---- Photo proxy: keeps the Google API key server-side ----

export async function photoProxy(env, url) {
  const name = url.searchParams.get("name") || "";
  if (!PHOTO_PARAM_RE.test(name)) throw new HttpError(400, "Invalid photo name");
  if (!env.GOOGLE_PLACES_API_KEY) throw new HttpError(500, "Google Places API is not configured");
  const w = int(url.searchParams.get("w"), "w", { min: 1, max: 1600, def: 600 });
  const h = int(url.searchParams.get("h"), "h", { min: 1, max: 1600, def: 400 });
  let res;
  try {
    res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&maxHeightPx=${h}`, {
      headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(502, "Failed to fetch photo");
  }
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, "Photo unavailable");
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new HttpError(502, "Photo unavailable");
  return new Response(res.body, {
    headers: { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" },
  });
}

async function resolvePhotoUrl(env, name) {
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=600&maxHeightPx=400&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY }, signal: AbortSignal.timeout(5000) },
    );
    if (res.status === 200) return (await res.json()).photoUri || null;
  } catch (e) {
    console.warn(`Photo resolution failed for ${name}: ${e}`);
  }
  return null;
}

// ---- CSV export ----

const EXPERIENCE_NAMES = {
  thrill_seeking: "Thrill Seeking",
  super_chill: "Super Chill",
  creative: "Creative",
  pure_entertainment: "Pure Entertainment",
  foodie: "Foodie",
};
const CATEGORY_COLORS = {
  thrill_seeking: "#E63946",
  super_chill: "#84A98C",
  creative: "#0F8FA8",
  pure_entertainment: "#9B5DE5",
  foodie: "#F4A261",
  "Thrill Seeking": "#E63946",
  "Super Chill": "#84A98C",
  Creative: "#0F8FA8",
  "Pure Entertainment": "#9B5DE5",
  Foodie: "#F4A261",
};
const CSV_HEADER = [
  "Category", "Name", "Address", "Latitude", "Longitude", "Website URL", "Phone", "Instagram",
  "Description", "Color", "Rating", "Price Range", "Image 1", "Image 2", "Image 3", "Is Staff Pick",
];

export function validatePlaces(body) {
  if (!Array.isArray(body)) throw new HttpError(422, "Request body must be a list of places");
  if (body.length > 500) throw new HttpError(422, "At most 500 places can be exported at once");
  return body.map((p, i) => {
    if (!isObj(p)) throw new HttpError(422, `places[${i}] must be an object`);
    const f = (k) => {
      if (typeof p[k] !== "number" || !Number.isFinite(p[k])) throw new HttpError(422, `places[${i}].${k} must be a number`);
      return p[k];
    };
    const photos = Array.isArray(p.photos) ? p.photos : [];
    return {
      id: str(p.id, `places[${i}].id`, { required: true, max: 200 }),
      name: str(p.name, `places[${i}].name`, { required: true, max: 500 }),
      address: str(p.address, `places[${i}].address`, { required: true, max: 1000 }),
      latitude: f("latitude"),
      longitude: f("longitude"),
      website: str(p.website, "website", { max: 2000, def: null }),
      phone: str(p.phone, "phone", { max: 100, def: null }),
      instagram: str(p.instagram, "instagram", { max: 500, def: null }),
      description: str(p.description, "description", { max: 5000, def: null }),
      photos: photos.slice(0, 3).map((ph) => ({ url: str(ph?.url, "photo url", { max: 2000 }) })),
      rating: typeof p.rating === "number" ? p.rating : null,
      price_range: str(p.price_range, "price_range", { max: 10, def: null }),
      category: str(p.category, "category", { max: 100 }),
    };
  });
}

// Python csv.writer defaults: QUOTE_MINIMAL, "\r\n" row terminator.
const csvCell = (v) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
// Stop spreadsheet formula injection from third-party text (names, addresses, descriptions).
const safeText = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

export function buildCsv(places, resolved = new Map()) {
  const rows = [CSV_HEADER];
  for (const place of places) {
    const photoUrls = place.photos.map((p) => resolved.get(p.url) ?? p.url);
    const experience = EXPERIENCE_NAMES[place.category] || place.category || "";
    let ig = "";
    if (place.instagram) {
      const m = place.instagram.toLowerCase().replace(/\/+$/, "").match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
      ig = m ? m[1] : place.instagram.replace(/^@+/, "");
    }
    rows.push([
      experience,
      safeText(place.name),
      safeText(place.address),
      pyFloat(place.latitude),
      pyFloat(place.longitude),
      place.website || "",
      place.phone || "",
      ig,
      safeText(place.description || ""),
      CATEGORY_COLORS[place.category] || CATEGORY_COLORS[experience] || "",
      place.rating ? pyFloat(place.rating) : "",
      place.price_range || "",
      photoUrls[0] || "",
      photoUrls[1] || "",
      photoUrls[2] || "",
      0,
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}

// Resolve Places photo URLs (proxy or legacy) to final CDN URLs so the CSV never carries an API key.
export async function exportCsv(env, places, origin) {
  const resolved = new Map();
  if (env.GOOGLE_PLACES_API_KEY) {
    const limit = num(env, "SUBREQUEST_BUDGET", 40) - 2;
    const jobs = [];
    for (const place of places) {
      for (const photo of place.photos) {
        let name = null;
        try {
          const u = new URL(photo.url, origin);
          name = u.origin === origin ? u.searchParams.get("name") : null;
        } catch {
          /* not a URL */
        }
        name = name && PHOTO_PARAM_RE.test(name) ? name : null;
        if (name && !resolved.has(photo.url) && jobs.length < limit) {
          resolved.set(photo.url, null);
          jobs.push([photo.url, name]);
        }
      }
    }
    await Promise.all(
      jobs.map(async ([url, name]) => {
        resolved.set(url, await resolvePhotoUrl(env, name));
      }),
    );
  }
  // Unresolved proxy URLs become absolute so they still open from a spreadsheet (they never include the key).
  for (const place of places) {
    for (const photo of place.photos) {
      if (!resolved.get(photo.url) && photo.url.startsWith("/api/places/photo")) {
        resolved.set(photo.url, origin + photo.url);
      }
    }
  }
  return buildCsv(places, resolved);
}
