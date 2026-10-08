// Parity: the Worker's /api output vs. output recorded from the original FastAPI backend
// (tests/fixtures/expected.json, produced by tests/generate_expected.py on tests/fixtures/inputs.json).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import worker from "../worker/index.js";
import { DEFAULT_CATEGORY_KEYWORDS } from "../worker/constants.js";
import { parseInstagramHandle } from "../worker/places.js";
import { createD1 } from "./d1-shim.js";

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const inputs = load("inputs.json");
const expected = load("expected.json");

const env = { DB: createD1(), JWT_SECRET: "x".repeat(40), GOOGLE_PLACES_API_KEY: "test-key", SUBREQUEST_BUDGET: "40" };
const call = (path, init) => worker.fetch(new Request(`https://app.test${path}`, init), env);

// Mock every outbound request: Google Places text search + business websites.
const googleLookup = (query) => {
  for (const [cat, kw] of Object.entries(DEFAULT_CATEGORY_KEYWORDS)) {
    if (query.startsWith(kw)) return inputs.google[`${cat}${query.slice(kw.length)}`] ?? [];
  }
  return inputs.google[query] ?? [];
};
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith("https://places.googleapis.com/v1/places:searchText")) {
    assert.equal(init.headers["X-Goog-Api-Key"], "test-key");
    return Response.json({ places: googleLookup(JSON.parse(init.body).textQuery) });
  }
  const key = url.replace(/\/$/, "");
  return inputs.html[key] ? new Response(inputs.html[key]) : new Response("", { status: 404 });
};

const normPlace = (p) => ({
  ...p,
  photos: p.photos.map((ph) => {
    assert.match(ph.url, /^\/api\/places\/photo\?name=places\//, "photo URLs go through the same-origin proxy");
    assert.ok(!ph.url.includes("key="), "no API key in photo URL");
    return { ...ph, url: ph.url.split("name=")[1] };
  }),
});

for (const c of expected.searches) {
  test(`search parity: ${c.name}`, async () => {
    const body = inputs.searches.find((s) => s.name === c.name).body;
    const res = await call("/api/places/search", { method: "POST", body: JSON.stringify(body) });
    assert.equal(res.status, 200);
    const got = await res.json();
    assert.deepEqual({ ...got, places: got.places.map(normPlace) }, c.response);
  });
}

for (const c of expected.validation) {
  test(`validation parity: ${c.name}`, async () => {
    const body = inputs.validation.find((s) => s.name === c.name).body;
    const res = await call("/api/places/search", { method: "POST", body: JSON.stringify(body) });
    assert.equal(res.status, c.status);
    assert.equal((await res.json()).detail, c.detail);
  });
}

test("instagram handle parsing parity", () => {
  assert.deepEqual(inputs.instagramSamples.map(parseInstagramHandle), expected.instagram);
});

test("CSV export is byte-identical", async () => {
  const res = await call("/api/places/export-csv", { method: "POST", body: JSON.stringify(inputs.exportPlaces) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/csv/);
  assert.equal(res.headers.get("content-disposition"), "attachment; filename=locations.csv");
  assert.equal(await res.text(), expected.export_csv);
});

test("config / categories / regions parity", async () => {
  const cfg = await (await call("/api/config")).json();
  assert.deepEqual({ protocol: cfg.protocol, categories: cfg.categories }, expected.config);
  assert.deepEqual(await (await call("/api/categories")).json(), expected.categories);
  assert.deepEqual(await (await call("/api/regions")).json(), expected.regions);
  assert.equal((await (await call("/api/")).json()).message, "Google Maps Location Scraper API");
});
