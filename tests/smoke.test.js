// End-to-end smoke test against a running Worker:  SMOKE_URL=http://localhost:8787 npm test
// (skipped when SMOKE_URL is unset). Optional: SMOKE_EMAIL / SMOKE_PASSWORD to exercise the authed path.
import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.SMOKE_URL;
const opts = { skip: !base && "SMOKE_URL not set" };

test("SPA index and deep link are served with security headers", opts, async () => {
  for (const path of ["/", "/history", "/search"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(await res.text(), /<div id="root">/);
  }
  const res = await fetch(base + "/");
  assert.match(res.headers.get("content-security-policy") || "", /default-src 'self'/);
});

test("/api routes respond with JSON and correct codes", opts, async () => {
  const root = await fetch(`${base}/api/`);
  assert.equal(root.status, 200);
  assert.equal((await root.json()).message, "Google Maps Location Scraper API");
  assert.equal((await fetch(`${base}/api/categories`)).status, 200);
  assert.equal((await fetch(`${base}/api/regions`)).status, 200);
  assert.equal((await fetch(`${base}/api/config`)).status, 200);
  assert.equal((await fetch(`${base}/api/history`)).status, 401);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  const bad = await fetch(`${base}/api/places/search`, { method: "POST", body: "{bad" });
  assert.equal(bad.status, 422);
  const empty = await fetch(`${base}/api/places/search`, { method: "POST", body: "{}" });
  assert.equal(empty.status, 400);
});

test("login → cookie → me → history", { skip: (!base || !process.env.SMOKE_EMAIL) && "SMOKE_URL / SMOKE_EMAIL not set" }, async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get("set-cookie").split(";")[0];
  const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await fetch(`${base}/api/history`, { headers: { cookie } })).status, 200);
});
