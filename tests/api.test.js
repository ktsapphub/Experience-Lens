// Worker /api behaviour: auth, authorization, input validation, error codes, CORS, history/config persistence.
import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../worker/index.js";
import { createD1 } from "./d1-shim.js";

const env = {
  DB: createD1(),
  JWT_SECRET: "y".repeat(40),
  ADMIN_EMAIL: "Admin@Example.com",
  ADMIN_PASSWORD: "AdminPass123",
  ALLOW_REGISTRATION: "true",
  CORS_ORIGINS: "https://other.example",
};
const call = (path, init = {}) => worker.fetch(new Request(`https://app.test${path}`, init), env);
const post = (path, body, headers = {}) =>
  call(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const bearer = (t) => ({ authorization: `Bearer ${t}` });

async function login(email, password) {
  const res = await post("/api/auth/login", { email, password });
  return { res, body: await res.json() };
}

test("root reports configuration flags without secrets", async () => {
  const body = await (await call("/api/")).json();
  assert.equal(body.configured.auth, true);
  assert.equal(body.configured.google_places, false);
  assert.ok(!JSON.stringify(body).includes(env.JWT_SECRET));
});

test("admin is seeded; login sets httpOnly cookie and returns a bearer token", async () => {
  const { res, body } = await login("admin@example.com", "AdminPass123");
  assert.equal(res.status, 200);
  assert.equal(body.token_type, "bearer");
  const cookie = res.headers.get("set-cookie");
  assert.match(cookie, /^mdc_access_token=.+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure/);
  const me = await call("/api/auth/me", { headers: { cookie: cookie.split(";")[0] } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, "admin@example.com");
});

test("bad credentials, malformed input and unauthenticated access", async () => {
  assert.equal((await login("admin@example.com", "wrong")).res.status, 401);
  assert.equal((await login("nobody@example.com", "x")).res.status, 401);
  assert.equal((await post("/api/auth/login", { email: "not-an-email", password: "x" })).status, 422);
  assert.equal((await post("/api/auth/login", { email: "a@b.co" })).status, 422);
  const bad = await call("/api/auth/login", { method: "POST", body: "{nope" });
  assert.equal(bad.status, 422);
  assert.equal((await call("/api/auth/me")).status, 401);
  assert.equal((await call("/api/auth/me", { headers: bearer("a.b.c") })).status, 401);
  assert.equal((await call("/api/history")).status, 401);
  assert.equal((await post("/api/shorten-links", { urls: [] })).status, 401);
  assert.equal((await post("/api/generate-descriptions", { places: [] })).status, 401);
});

test("tampered and alg=none tokens are rejected", async () => {
  const { body } = await login("admin@example.com", "AdminPass123");
  const [h, p, s] = body.access_token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "x", exp: 9999999999, type: "access" })).toString("base64url");
  assert.equal((await call("/api/auth/me", { headers: bearer(`${h}.${forged}.${s}`) })).status, 401);
  const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  assert.equal((await call("/api/auth/me", { headers: bearer(`${none}.${p}.`) })).status, 401);
});

test("registration: validates, rejects duplicates, creates non-admin users", async () => {
  assert.equal((await post("/api/auth/register", { email: "u@example.com", password: "short" })).status, 422);
  const ok = await post("/api/auth/register", { email: "U@Example.com", password: "longenough1" });
  assert.equal(ok.status, 200);
  assert.equal((await post("/api/auth/register", { email: "u@example.com", password: "longenough1" })).status, 400);
  const { body } = await login("u@example.com", "longenough1");
  const t = body.access_token;
  // non-admin: can read history, cannot list users, change config or clear history
  assert.equal((await call("/api/history", { headers: bearer(t) })).status, 200);
  assert.equal((await call("/api/users", { headers: bearer(t) })).status, 403);
  assert.equal((await call("/api/config/category", { method: "PUT", headers: bearer(t), body: "{}" })).status, 403);
  assert.equal((await call("/api/history", { method: "DELETE", headers: bearer(t) })).status, 403);
});

test("registration can be disabled", async () => {
  const res = await worker.fetch(
    new Request("https://app.test/api/auth/register", { method: "POST", body: "{}" }),
    { ...env, ALLOW_REGISTRATION: "false" },
  );
  assert.equal(res.status, 403);
});

test("admin: users never expose password hashes; config update validates and persists", async () => {
  const t = (await login("admin@example.com", "AdminPass123")).body.access_token;
  const users = await (await call("/api/users", { headers: bearer(t) })).json();
  assert.ok(users.length >= 2);
  assert.ok(users.every((u) => !("password" in u) && !("seed_fp" in u)));

  const put = (b) => call("/api/config/category", { method: "PUT", headers: { ...bearer(t), "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await put({ category_id: "nope" })).status, 400);
  assert.equal((await put({ category_id: "foodie", place_types: "x" })).status, 422);
  assert.equal((await put({ category_id: "foodie", place_types: ["Bad Type!"] })).status, 422);
  assert.equal((await put({ category_id: "foodie", keywords: "k".repeat(4000) })).status, 422);
  assert.equal((await put({ category_id: "foodie", keywords: "tacos OR pizza", place_types: ["restaurant"] })).status, 200);
  const cfg = await (await call("/api/config")).json();
  assert.equal(cfg.categories.foodie.keywords, "tacos OR pizza");
  assert.equal((await call("/api/config/reset", { method: "POST", headers: bearer(t) })).status, 200);
  assert.notEqual((await (await call("/api/config")).json()).categories.foodie.keywords, "tacos OR pizza");
});

test("history: list, limit validation, 404, delete", async () => {
  const t = (await login("admin@example.com", "AdminPass123")).body.access_token;
  await env.DB.prepare(
    "INSERT INTO search_history (id, category, search_method, location, region, location_names, results_count, results, timestamp) VALUES ('h1','foodie','location','Austin','','[]',1,'[{\"name\":\"A\"}]','2026-01-01T00:00:00Z')",
  ).run();
  const list = await (await call("/api/history?limit=5", { headers: bearer(t) })).json();
  assert.equal(list.history[0].results[0].name, "A");
  assert.equal((await call("/api/history?limit=9999", { headers: bearer(t) })).status, 422);
  assert.equal((await call("/api/history?limit=abc", { headers: bearer(t) })).status, 422);
  assert.equal((await call("/api/history/h1", { headers: bearer(t) })).status, 200);
  assert.equal((await call("/api/history/missing", { headers: bearer(t) })).status, 404);
  assert.equal((await call("/api/history/h1", { method: "DELETE", headers: bearer(t) })).status, 200);
  assert.equal((await call("/api/history/h1", { method: "DELETE", headers: bearer(t) })).status, 404);
  assert.equal((await call("/api/history/bad%20id!", { headers: bearer(t) })).status, 404);
});

test("search input validation (before any outbound call)", async () => {
  env.GOOGLE_PLACES_API_KEY = "k";
  globalThis.fetch = async () => assert.fail("no outbound request expected");
  assert.equal((await post("/api/places/search", { categories: "foodie", location: "x" })).status, 422);
  assert.equal((await post("/api/places/search", { categories: ["foodie"], location: "x".repeat(300) })).status, 422);
  assert.equal((await post("/api/places/search", { categories: ["foodie"], location: "x", per_page: 0 })).status, 422);
  assert.equal((await post("/api/places/search", { categories: ["foodie"], location: "x", per_page: 5000 })).status, 422);
  assert.equal((await post("/api/places/search", { categories: ["foodie"], location: "x", page: "a" })).status, 422);
  assert.equal((await post("/api/places/search", [])).status, 422);
  assert.equal((await post("/api/places/search", { categories: ["nope"], location: "x" })).status, 400);
  delete env.GOOGLE_PLACES_API_KEY;
  assert.equal((await post("/api/places/search", { categories: ["foodie"], location: "x" })).status, 500);
});

test("export-csv validation", async () => {
  assert.equal((await post("/api/places/export-csv", { not: "a list" })).status, 422);
  assert.equal((await post("/api/places/export-csv", [{ id: "1" }])).status, 422);
  assert.equal((await post("/api/places/export-csv", [{ id: "1", name: "n", address: "a", latitude: "x", longitude: 1 }])).status, 422);
  const big = Array.from({ length: 501 }, (_, i) => ({ id: `${i}`, name: "n", address: "a", latitude: 1, longitude: 1 }));
  assert.equal((await post("/api/places/export-csv", big)).status, 422);
});

test("CSV export neutralises spreadsheet formulas in free text", async () => {
  const res = await post("/api/places/export-csv", [
    { id: "1", name: "=HYPERLINK(\"http://evil\")", address: "+cmd", latitude: 1, longitude: 2, description: "@SUM(A1)", phone: "+1 555" },
  ]);
  const text = await res.text();
  assert.ok(text.includes(`"'=HYPERLINK(""http://evil"")"`), text);
  assert.ok(text.includes(",'+cmd,"));
  assert.ok(text.includes(",'@SUM(A1),"));
  assert.ok(text.includes(",+1 555,"), "phone numbers keep their leading +");
});

test("photo proxy rejects bad names and keeps the key server-side", async () => {
  env.GOOGLE_PLACES_API_KEY = "secret-key";
  assert.equal((await call("/api/places/photo")).status, 400);
  assert.equal((await call("/api/places/photo?name=../../etc/passwd")).status, 400);
  assert.equal((await call("/api/places/photo?name=places/a/photos/b?x=1")).status, 400);
  let seen;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), init };
    return new Response("img", { headers: { "content-type": "image/jpeg" } });
  };
  const res = await call("/api/places/photo?name=places/abc/photos/def");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  assert.ok(!seen.url.includes("secret-key"), "key must travel in a header, not the URL");
  assert.equal(seen.init.headers["X-Goog-Api-Key"], "secret-key");
  globalThis.fetch = async () => new Response("<html>", { headers: { "content-type": "text/html" } });
  assert.equal((await call("/api/places/photo?name=places/abc/photos/def")).status, 502);
  delete env.GOOGLE_PLACES_API_KEY;
});

test("shorten + descriptions: auth ok, validation, batch caps, no key leakage", async () => {
  const t = (await login("admin@example.com", "AdminPass123")).body.access_token;
  const h = bearer(t);
  assert.equal((await post("/api/shorten-links", { urls: [{ id: "1", url: "https://a.example" }] }, h)).status, 500);
  assert.equal((await post("/api/generate-descriptions", { places: [] }, h)).status, 500);
  const e2 = { ...env, SHORTIO_API_KEY: "sk_secretvalue1234", SHORTIO_DOMAIN: "go.example.com", GEMINI_API_KEY: "gk" };
  const run = (path, body) => worker.fetch(new Request(`https://app.test${path}`, { method: "POST", headers: h, body: JSON.stringify(body) }), e2);
  globalThis.fetch = async (url) =>
    String(url).includes("short.io") ? Response.json({ shortURL: "https://go.example.com/abc" }) : Response.json({ candidates: [{ content: { parts: [{ text: "\"Nice place\"" }] } }] });
  assert.equal((await run("/api/shorten-links", { urls: "x" })).status, 422);
  assert.equal((await run("/api/shorten-links", { urls: Array(60).fill({ id: "1", url: "https://a.example" }) })).status, 413);
  const s = await (await run("/api/shorten-links", { urls: [{ id: "1", url: "https://a.example" }, { id: "2", url: "javascript:alert(1)" }, { id: "3", url: "" }] })).json();
  assert.deepEqual(s.results.map((r) => r.success), [true, false, false]);
  assert.equal(s.shortened, 1);
  assert.equal((await run("/api/generate-descriptions", { places: Array(11).fill({ id: "1", name: "n" }) })).status, 413);
  const d = await (await run("/api/generate-descriptions", { places: [{ id: "1", name: "Cafe", address: "x" }, { id: "2" }] })).json();
  assert.equal(d.results[0].description, "Nice place");
  assert.equal(d.results[1].success, false);
  const st = await worker.fetch(new Request("https://app.test/api/shorten-status", { headers: h }), { ...e2 });
  assert.ok(!JSON.stringify(await st.json()).includes("secretvalue"));
});

test("CORS: same-origin ok, unknown origin rejected, allow-listed origin gets credentials headers", async () => {
  assert.equal((await call("/api/categories", { headers: { origin: "https://app.test" } })).status, 200);
  const evil = await call("/api/categories", { headers: { origin: "https://evil.example" } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  assert.equal((await call("/api/auth/login", { method: "OPTIONS", headers: { origin: "https://evil.example" } })).status, 403);
  const pre = await call("/api/auth/login", { method: "OPTIONS", headers: { origin: "https://other.example" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://other.example");
  const ok = await call("/api/categories", { headers: { origin: "https://other.example" } });
  assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
  assert.equal(ok.headers.get("vary"), "Origin");
  const same = await call("/api/categories");
  assert.equal(same.headers.get("access-control-allow-origin"), null);
});

test("error codes: 404, 405, trailing slash, security headers, no stack leaks", async () => {
  const nf = await call("/api/does-not-exist");
  assert.equal(nf.status, 404);
  assert.deepEqual(await nf.json(), { detail: "Not found" });
  assert.equal((await call("/api/categories", { method: "DELETE" })).status, 405);
  assert.equal((await call("/api/categories/")).status, 200);
  assert.equal(nf.headers.get("x-content-type-options"), "nosniff");
  assert.equal(nf.headers.get("x-frame-options"), "DENY");
  const broken = await worker.fetch(new Request("https://app.test/api/history", { headers: bearer("a.b.c") }), { JWT_SECRET: "short" });
  assert.equal(broken.status, 500);
  assert.ok(!(await broken.text()).includes("JWT_SECRET"));
});

test("oversized body is rejected", async () => {
  const res = await call("/api/auth/login", { method: "POST", headers: { "content-length": "5000000" }, body: "{}" });
  assert.equal(res.status, 413);
});

test("non-api paths fall through to static assets", async () => {
  const res = await worker.fetch(new Request("https://app.test/history"), { ASSETS: { fetch: async () => new Response("<html>spa</html>") } });
  assert.equal(await res.text(), "<html>spa</html>");
});
