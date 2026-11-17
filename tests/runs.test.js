// Run allowance (10 free, request +5 at the last run), admin approval, keyword password reset, private history.
import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "../worker/index.js";
import { createD1 } from "./d1-shim.js";

const env = {
  DB: createD1(),
  JWT_SECRET: "z".repeat(40),
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "AdminPass123",
  ALLOW_REGISTRATION: "true",
  GOOGLE_PLACES_API_KEY: "k",
  FREE_RUNS: "3",
  RUN_TOPUP: "5",
  RESET_KEYWORD: "ktsappshub",
};
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("places:searchText")) {
    return Response.json({ places: [{ id: "p1", displayName: { text: "Spot" }, formattedAddress: "1 Main St, Norfolk, VA", location: { latitude: 36.8, longitude: -76.3 }, websiteUri: "https://spot.example", photos: [{ name: "places/p1/photos/a" }] }] });
  }
  return new Response("", { status: 404 });
};
const call = (path, init = {}) => worker.fetch(new Request(`https://app.test${path}`, init), env);
const post = (path, body, token) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
const token = async (email, password) => (await (await post("/api/auth/login", { email, password })).json()).access_token;
const me = async (t) => (await call("/api/auth/me", { headers: { authorization: `Bearer ${t}` } })).json();
const search = (t) => post("/api/places/search", { categories: ["foodie"], location: "Norfolk, VA" }, t);

test("users count down runs, request at the last run, admin approves +5", async () => {
  assert.equal((await post("/api/auth/register", { email: "u1@x.com", password: "password1" })).status, 200);
  const u = await token("u1@x.com", "password1");
  assert.deepEqual((await me(u)).runs, { unlimited: false, runs_used: 0, runs_limit: 3, runs_left: 3, pending_request: false });

  assert.equal((await post("/api/runs/request", {}, u)).status, 400, "too early to request");
  assert.equal((await (await search(u)).json()).runs.runs_left, 2);
  assert.equal((await (await search(u)).json()).runs.runs_left, 1);

  const req = await post("/api/runs/request", {}, u); // allowed on the last run
  assert.equal(req.status, 200);
  assert.equal((await req.json()).runs.pending_request, true);
  await post("/api/runs/request", {}, u); // idempotent: still one pending

  assert.equal((await search(u)).status, 200);
  const out = await search(u);
  assert.equal(out.status, 402);

  const a = await token("admin@example.com", "AdminPass123");
  assert.equal((await post("/api/runs/request", {}, a)).status, 400, "admins are unlimited");
  assert.equal((await post("/api/admin/run-requests/x/approve", {}, u)).status, 403, "users can't approve");
  const { requests } = await (await call("/api/admin/run-requests", { headers: { authorization: `Bearer ${a}` } })).json();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].email, "u1@x.com");
  assert.equal((await post(`/api/admin/run-requests/${requests[0].id}/approve`, {}, a)).status, 200);
  assert.equal((await post(`/api/admin/run-requests/${requests[0].id}/approve`, {}, a)).status, 404, "only once");

  assert.deepEqual((await me(u)).runs, { unlimited: false, runs_used: 3, runs_limit: 8, runs_left: 5, pending_request: false });
  assert.equal((await search(u)).status, 200);

  // Admin search is unmetered.
  for (let i = 0; i < 5; i++) assert.equal((await search(a)).status, 200);
  assert.equal((await me(a)).runs.unlimited, true);
});

test("a failed or empty search refunds the run", async () => {
  await post("/api/auth/register", { email: "u2@x.com", password: "password1" });
  const u = await token("u2@x.com", "password1");
  const saved = globalThis.fetch;
  globalThis.fetch = async () => new Response("boom", { status: 500 });
  await search(u);
  globalThis.fetch = saved;
  assert.equal((await me(u)).runs.runs_used, 0);
});

test("history is private to each user; admin sees all", async () => {
  await post("/api/auth/register", { email: "u3@x.com", password: "password1" });
  await post("/api/auth/register", { email: "u4@x.com", password: "password1" });
  const u2 = await token("u4@x.com", "password1");
  const u3 = await token("u3@x.com", "password1");
  await search(u3);
  const hist = async (t) => (await (await call("/api/history", { headers: { authorization: `Bearer ${t}` } })).json()).history;
  const mine = await hist(u3);
  assert.equal(mine.length, 1);
  assert.equal((await hist(u2)).length, 0);
  assert.equal((await call(`/api/history/${mine[0].id}`, { headers: { authorization: `Bearer ${u2}` } })).status, 404);
  assert.equal((await call(`/api/history/${mine[0].id}`, { method: "DELETE", headers: { authorization: `Bearer ${u2}` } })).status, 404);
  assert.ok((await hist(await token("admin@example.com", "AdminPass123"))).length >= 2);
});

test("keyword password reset", async () => {
  const bad = await post("/api/auth/reset-password", { email: "admin@example.com", keyword: "nope", new_password: "NewPass1234" });
  assert.equal(bad.status, 401);
  assert.equal((await post("/api/auth/reset-password", { email: "ghost@x.com", keyword: "ktsappshub", new_password: "NewPass1234" })).status, 401);
  assert.equal((await post("/api/auth/reset-password", { email: "admin@example.com", keyword: "ktsappshub", new_password: "short" })).status, 422);

  const ok = await post("/api/auth/reset-password", { email: "Admin@Example.com", keyword: " KtsAppsHub ", new_password: "NewPass1234" });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("set-cookie"), /mdc_access_token=.+/);
  assert.equal((await post("/api/auth/login", { email: "admin@example.com", password: "AdminPass123" })).status, 401);
  assert.equal((await post("/api/auth/login", { email: "admin@example.com", password: "NewPass1234" })).status, 200);

  const off = { ...env };
  delete off.RESET_KEYWORD;
  const res = await worker.fetch(new Request("https://app.test/api/auth/reset-password", {
    method: "POST", body: JSON.stringify({ email: "admin@example.com", keyword: "ktsappshub", new_password: "NewPass1234" }),
  }), off);
  assert.equal(res.status, 403, "disabled when the secret isn't set");
});
