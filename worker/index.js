// Experience Lens: one Worker = static frontend (ASSETS) + /api. Port of backend/server.py (FastAPI + MongoDB).
import {
  cookieHeader, credentials, currentUser, hashPassword, requireAdmin, seedAdmin, signToken, verifyPassword,
} from "./auth.js";
import { DEFAULT_CATEGORY_KEYWORDS, DEFAULT_CATEGORY_TYPES, US_REGIONS } from "./constants.js";
import { generateDescriptions, shortenLinks, shortenStatus } from "./integrations.js";
import {
  exportCsv, normalizeSearchRequest, paginate, persistHistory, photoProxy, searchPlaces, validatePlaces,
} from "./places.js";
import { HttpError, int, isObj, json, rateLimit, readJson, str } from "./util.js";

const APP_VERSION = "1.0.0";
const API_VERSION = "Google Places API (New) v1";
const BUILD_DATE = "2026-01-30";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL, seed_fp TEXT)`,
  `CREATE TABLE IF NOT EXISTS config (category_id TEXT PRIMARY KEY, place_types TEXT NOT NULL, keywords TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS search_history (id TEXT PRIMARY KEY, category TEXT, search_method TEXT, location TEXT, region TEXT,
    location_names TEXT, results_count INTEGER, results TEXT, timestamp TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_history_ts ON search_history (timestamp DESC)`,
  `CREATE TABLE IF NOT EXISTS status_checks (id TEXT PRIMARY KEY, client_name TEXT NOT NULL, timestamp TEXT NOT NULL)`,
];

// Schema + admin seed run once per isolate (idempotent), so a fresh D1 database needs no manual migration step.
let ready;
function ensureReady(env) {
  if (!env.DB) throw new HttpError(500, "Database is not configured");
  ready ||= (async () => {
    await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
    await seedAdmin(env);
  })().catch((e) => {
    ready = undefined;
    throw e;
  });
  return ready;
}

async function loadConfig(env) {
  const cfg = { types: structuredClone(DEFAULT_CATEGORY_TYPES), keywords: { ...DEFAULT_CATEGORY_KEYWORDS } };
  const { results } = await env.DB.prepare("SELECT category_id, place_types, keywords FROM config").all();
  for (const r of results) {
    if (r.category_id in cfg.types) {
      cfg.types[r.category_id] = JSON.parse(r.place_types);
      cfg.keywords[r.category_id] = r.keywords;
    }
  }
  return cfg;
}

const publicUser = (u) => ({ id: u.id, email: u.email, created_at: u.created_at });
const authOk = async (env, request, user, status = 200, extra = {}) => {
  const token = await signToken(env, user.id, user.email);
  return json(
    { success: true, access_token: token, token_type: "bearer", user: extra.user || { id: user.id, email: user.email } },
    status,
    { "set-cookie": cookieHeader(request, token) },
  );
};

const historyRow = (r) => ({
  id: r.id,
  timestamp: r.timestamp,
  category: r.category,
  search_method: r.search_method,
  location: r.location,
  region: r.region,
  location_names: JSON.parse(r.location_names || "[]"),
  results_count: r.results_count,
  results: JSON.parse(r.results || "[]"),
});

// ---- Handlers ---------------------------------------------------------------

const handlers = {
  "GET /": async (env) => ({
    message: "Google Maps Location Scraper API",
    configured: {
      google_places: Boolean(env.GOOGLE_PLACES_API_KEY),
      short_io: Boolean(env.SHORTIO_API_KEY && env.SHORTIO_DOMAIN),
      gemini: Boolean(env.GEMINI_API_KEY),
      auth: Boolean(env.JWT_SECRET && env.JWT_SECRET.length >= 32),
    },
  }),

  "POST /auth/register": async (env, request) => {
    if (String(env.ALLOW_REGISTRATION).toLowerCase() !== "true") throw new HttpError(403, "Registration is disabled");
    await rateLimit(env, request, "auth");
    const { email, password } = credentials(await readJson(request));
    if (password.length < 8) throw new HttpError(422, "Password must be at least 8 characters");
    if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) {
      throw new HttpError(400, "Email already registered");
    }
    const user = { id: crypto.randomUUID(), email, created_at: new Date().toISOString() };
    try {
      await env.DB.prepare("INSERT INTO users (id, email, password, role, created_at) VALUES (?, ?, ?, 'user', ?)")
        .bind(user.id, email, await hashPassword(password), user.created_at)
        .run();
    } catch {
      throw new HttpError(400, "Email already registered");
    }
    return authOk(env, request, user, 200, { user: publicUser(user) });
  },

  "POST /auth/login": async (env, request) => {
    await rateLimit(env, request, "auth");
    const { email, password } = credentials(await readJson(request));
    const row = await env.DB.prepare("SELECT id, email, password FROM users WHERE email = ?").bind(email).first();
    // Always run one PBKDF2 so unknown emails and wrong passwords look identical.
    const ok = await verifyPassword(password, row ? row.password : "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    if (!row || !ok) throw new HttpError(401, "Invalid email or password");
    return authOk(env, request, row);
  },

  "POST /auth/logout": async (env, request) => json({ success: true }, 200, { "set-cookie": cookieHeader(request, "") }),

  "GET /auth/me": async (env, request) => {
    const u = await currentUser(env, request);
    return { id: u.id, email: u.email, created_at: u.created_at };
  },

  "GET /users": async (env, request) => {
    await requireAdmin(env, request);
    const { results } = await env.DB.prepare("SELECT id, email, created_at FROM users LIMIT 100").all();
    return results;
  },

  "GET /config": async (env) => {
    const cfg = await loadConfig(env);
    return {
      app_version: APP_VERSION,
      api_version: API_VERSION,
      build_date: BUILD_DATE,
      tech_stack: {
        frontend: "React 19 + Tailwind CSS + shadcn/ui",
        backend: "Cloudflare Workers + D1",
        database: "Cloudflare D1 (SQLite)",
        external_api: "Google Places API (New)",
      },
      protocol: {
        search_method: "Text Search API with category-specific keywords",
        deduplication: "Place ID + Name/Address combination",
        filtering: "Requires address, website, and photos",
        pagination: "20 results per page, max 60 total per search",
      },
      categories: Object.fromEntries(
        Object.keys(cfg.types).map((id) => [id, { place_types: cfg.types[id], keywords: cfg.keywords[id] }]),
      ),
    };
  },

  "PUT /config/category": async (env, request) => {
    await requireAdmin(env, request);
    const body = await readJson(request);
    if (!isObj(body)) throw new HttpError(422, "Request body must be a JSON object");
    const id = str(body.category_id, "category_id", { required: true, max: 50 });
    if (!Object.hasOwn(DEFAULT_CATEGORY_TYPES, id)) throw new HttpError(400, `Invalid category: ${id}`);
    const cfg = await loadConfig(env);
    if (body.place_types !== undefined && body.place_types !== null) {
      if (!Array.isArray(body.place_types) || body.place_types.length > 30 ||
          !body.place_types.every((t) => typeof t === "string" && /^[a-z0-9_]{1,60}$/.test(t))) {
        throw new HttpError(422, "place_types must be a list of up to 30 lowercase place-type identifiers");
      }
      cfg.types[id] = body.place_types;
    }
    if (body.keywords !== undefined && body.keywords !== null) {
      cfg.keywords[id] = str(body.keywords, "keywords", { max: 3000 });
    }
    await env.DB.prepare(
      `INSERT INTO config (category_id, place_types, keywords, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(category_id) DO UPDATE SET place_types = excluded.place_types, keywords = excluded.keywords, updated_at = excluded.updated_at`,
    )
      .bind(id, JSON.stringify(cfg.types[id]), cfg.keywords[id], new Date().toISOString())
      .run();
    return {
      success: true,
      message: `Configuration updated for ${id}`,
      config: { place_types: cfg.types[id], keywords: cfg.keywords[id] },
    };
  },

  "POST /config/reset": async (env, request) => {
    await requireAdmin(env, request);
    await env.DB.prepare("DELETE FROM config").run();
    return { success: true, message: "Configuration reset to defaults" };
  },

  "GET /history": async (env, request, url) => {
    await currentUser(env, request);
    const limit = int(url.searchParams.get("limit"), "limit", { min: 1, max: 200, def: 50 });
    const { results } = await env.DB.prepare("SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?").bind(limit).all();
    return { history: results.map(historyRow) };
  },

  "GET /history/:id": async (env, request, url, [id]) => {
    await currentUser(env, request);
    const row = await env.DB.prepare("SELECT * FROM search_history WHERE id = ?").bind(id).first();
    if (!row) throw new HttpError(404, "History entry not found");
    return historyRow(row);
  },

  "DELETE /history/:id": async (env, request, url, [id]) => {
    await currentUser(env, request);
    const r = await env.DB.prepare("DELETE FROM search_history WHERE id = ?").bind(id).run();
    if (!r.meta.changes) throw new HttpError(404, "History entry not found");
    return { success: true, message: "History entry deleted" };
  },

  "DELETE /history": async (env, request) => {
    await requireAdmin(env, request);
    await env.DB.prepare("DELETE FROM search_history").run();
    return { success: true, message: "All history cleared" };
  },

  "GET /search-history": async (env, request, url) => {
    await currentUser(env, request);
    const limit = int(url.searchParams.get("limit"), "limit", { min: 1, max: 100, def: 10 });
    const { results } = await env.DB.prepare(
      "SELECT id, category, location, results_count, timestamp FROM search_history ORDER BY timestamp DESC LIMIT ?",
    ).bind(limit).all();
    return { history: results };
  },

  "GET /categories": async () => ({
    categories: [
      { id: "thrill_seeking", name: "Thrill Seeking", description: "Adventurous outings like rock climbing, theme parks, paintball" },
      { id: "super_chill", name: "Super Chill", description: "Relaxing items like spas, yoga, hiking trails, golf" },
      { id: "creative", name: "Creative", description: "Arts like museums, DIY arts and crafts locations, workshops" },
      { id: "pure_entertainment", name: "Pure Entertainment", description: "Venues for performing arts, theaters, concert venues" },
      { id: "foodie", name: "Foodie", description: "Restaurants, wineries, breweries, cooking classes" },
    ],
  }),

  "GET /regions": async () => ({
    regions: Object.entries(US_REGIONS).map(([id, r]) => ({ id, name: r.name, states: r.states })),
  }),

  "POST /places/search": async (env, request) => {
    await rateLimit(env, request, "search");
    const cfg = await loadConfig(env);
    const req = normalizeSearchRequest(await readJson(request), cfg);
    const places = await searchPlaces(env, req, cfg);
    await persistHistory(env, req, places);
    return paginate(places, req.page, req.perPage);
  },

  "GET /places/photo": (env, request, url) => photoProxy(env, url),

  "POST /places/export-csv": async (env, request, url) => {
    await rateLimit(env, request, "export");
    const places = validatePlaces(await readJson(request));
    const csv = await exportCsv(env, places, url.origin);
    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=locations.csv" },
    });
  },

  "POST /generate-descriptions": async (env, request) => {
    await currentUser(env, request);
    await rateLimit(env, request, "ai");
    return generateDescriptions(env, await readJson(request));
  },

  "POST /shorten-links": async (env, request) => {
    await currentUser(env, request);
    await rateLimit(env, request, "shorten");
    return shortenLinks(env, await readJson(request));
  },

  "GET /shorten-status": async (env, request) => {
    await currentUser(env, request);
    return shortenStatus(env);
  },

  "POST /status": async (env, request) => {
    await currentUser(env, request);
    const body = await readJson(request);
    const row = {
      id: crypto.randomUUID(),
      client_name: str(isObj(body) ? body.client_name : undefined, "client_name", { required: true, max: 200 }),
      timestamp: new Date().toISOString(),
    };
    await env.DB.prepare("INSERT INTO status_checks (id, client_name, timestamp) VALUES (?, ?, ?)")
      .bind(row.id, row.client_name, row.timestamp).run();
    return row;
  },

  "GET /status": async (env, request, url) => {
    await currentUser(env, request);
    const limit = int(url.searchParams.get("limit"), "limit", { min: 1, max: 1000, def: 100 });
    const { results } = await env.DB.prepare("SELECT id, client_name, timestamp FROM status_checks ORDER BY timestamp DESC LIMIT ?")
      .bind(limit).all();
    return results;
  },
};

const NO_DB = new Set(["/places/photo", "/categories", "/regions"]);

// Compile "METHOD /path/:param" keys into a route table.
const routes = Object.entries(handlers).map(([key, fn]) => {
  const [method, pattern] = key.split(" ");
  const re = new RegExp("^" + pattern.replace(/:[a-z]+/g, "([A-Za-z0-9_-]{1,64})") + "$");
  return { method, re, fn };
});

// ---- Request pipeline: CORS / CSRF guard, routing, uniform errors ----------------

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cache-control": "no-store",
};

function allowedOrigins(env, url) {
  return new Set([url.origin, ...(env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean)]);
}

async function handleApi(request, env, url) {
  const origin = request.headers.get("origin");
  const allowed = allowedOrigins(env, url);
  const crossOriginOk = origin && origin !== url.origin && allowed.has(origin);
  if (origin && !allowed.has(origin)) throw new HttpError(403, "Origin not allowed");

  if (request.method === "OPTIONS") {
    const res = new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-max-age": "600",
      },
    });
    return withHeaders(res, crossOriginOk ? origin : null);
  }

  const path = (url.pathname.replace(/^\/api/, "").replace(/\/+$/, "")) || "/";
  let pathMatched = false;
  for (const { method, re, fn } of routes) {
    const m = re.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (method !== request.method && !(method === "GET" && request.method === "HEAD")) continue;
    if (NO_DB.has(path)) {
      /* static data or proxy: no database needed */
    } else await ensureReady(env);
    const out = await fn(env, request, url, m.slice(1));
    const res = out instanceof Response ? out : json(out);
    return withHeaders(res, crossOriginOk ? origin : null);
  }
  throw new HttpError(pathMatched ? 405 : 404, pathMatched ? "Method not allowed" : "Not found");
}

function withHeaders(res, corsOrigin) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!h.has(k)) h.set(k, v);
  if (corsOrigin) {
    h.set("access-control-allow-origin", corsOrigin);
    h.set("access-control-allow-credentials", "true");
    h.set("vary", "Origin");
  }
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
      // Static assets are normally served before the Worker runs; this only catches misconfiguration.
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
    }
    try {
      return await handleApi(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) {
        const res = json({ detail: e.detail }, e.status);
        return withHeaders(res, null);
      }
      console.error("Unhandled error", e);
      return withHeaders(json({ detail: "Internal server error" }, 500), null);
    }
  },
};
