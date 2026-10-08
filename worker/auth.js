// JWT (HS256) + PBKDF2 password hashing on WebCrypto. Cookie/Bearer contract matches the old FastAPI API.
import { HttpError } from "./util.js";

export const COOKIE_NAME = "mdc_access_token";
const TOKEN_HOURS = 24 * 7;
const PBKDF2_ITERATIONS = 100_000; // Workers WebCrypto maximum
const enc = new TextEncoder();

const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

function requireSecret(env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    console.error("JWT_SECRET is missing or shorter than 32 characters");
    throw new HttpError(500, "Authentication is not configured");
  }
  return env.JWT_SECRET;
}

const hmacKey = (secret, usage) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

export async function signToken(env, userId, email) {
  const header = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const exp = Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600;
  const body = b64u(enc.encode(JSON.stringify({ sub: userId, email, exp, type: "access" })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(requireSecret(env), "sign"), enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64u(sig)}`;
}

async function verifyToken(env, token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Invalid token");
  try {
    const header = JSON.parse(new TextDecoder().decode(unb64u(parts[0])));
    if (header.alg !== "HS256") throw new Error("alg");
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(requireSecret(env), "verify"),
      unb64u(parts[2]),
      enc.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) throw new Error("sig");
    const payload = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
      throw new HttpError(401, "Token expired");
    }
    if (payload.type !== "access") throw new HttpError(401, "Invalid token type");
    return payload;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, "Invalid token");
  }
}

export function cookieHeader(request, token) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const age = token ? TOKEN_HOURS * 3600 : 0;
  return `${COOKIE_NAME}=${token || ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
}

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Cookie first (XSS-resistant), then Bearer for API clients/tests.
export async function currentUser(env, request) {
  let token = readCookie(request, COOKIE_NAME);
  if (!token) {
    const h = request.headers.get("authorization") || "";
    if (h.startsWith("Bearer ")) token = h.slice(7);
  }
  if (!token) throw new HttpError(401, "Not authenticated");
  const payload = await verifyToken(env, token);
  const user = await env.DB.prepare("SELECT id, email, role, created_at FROM users WHERE id = ?")
    .bind(String(payload.sub))
    .first();
  if (!user) throw new HttpError(401, "User not found");
  return user;
}

export async function requireAdmin(env, request) {
  const user = await currentUser(env, request);
  if (user.role !== "admin") throw new HttpError(403, "Admin access required");
  return user;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64u(salt)}$${b64u(await derive(password, salt, PBKDF2_ITERATIONS))}`;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, salt, hash] = (stored || "").split("$");
  if (scheme !== "pbkdf2" || !hash) return false;
  const got = new Uint8Array(await derive(password, unb64u(salt), Number(iter)));
  const want = unb64u(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function credentials(body) {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(422, "A valid email is required");
  if (!password || password.length > 128) throw new HttpError(422, "Password must be 1-128 characters");
  return { email, password };
}

// Idempotent admin bootstrap from ADMIN_EMAIL / ADMIN_PASSWORD. A fingerprint avoids re-hashing every cold start.
export async function seedAdmin(env) {
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email || !env.ADMIN_PASSWORD) return;
  const fp = b64u(await crypto.subtle.digest("SHA-256", enc.encode(`${email}\n${env.ADMIN_PASSWORD}`)));
  const row = await env.DB.prepare("SELECT id, seed_fp FROM users WHERE email = ?").bind(email).first();
  if (!row) {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password, role, created_at, seed_fp) VALUES (?, ?, ?, 'admin', ?, ?)",
    )
      .bind(crypto.randomUUID(), email, await hashPassword(env.ADMIN_PASSWORD), new Date().toISOString(), fp)
      .run();
  } else if (row.seed_fp !== fp) {
    await env.DB.prepare("UPDATE users SET password = ?, role = 'admin', seed_fp = ? WHERE id = ?")
      .bind(await hashPassword(env.ADMIN_PASSWORD), fp, row.id)
      .run();
  }
}
