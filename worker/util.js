// Small shared helpers: responses, body parsing, validation, rate limiting.

export class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const MAX_BODY_BYTES = 2_000_000;

export async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, "Request body must be valid JSON");
  }
}

export const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function str(v, name, { max = 500, required = false, def = "" } = {}) {
  if (v === undefined || v === null) {
    if (required) throw new HttpError(422, `${name} is required`);
    return def;
  }
  if (typeof v !== "string") throw new HttpError(422, `${name} must be a string`);
  if (required && !v.trim()) throw new HttpError(422, `${name} is required`);
  if (v.length > max) throw new HttpError(422, `${name} must be at most ${max} characters`);
  return v;
}

export function int(v, name, { min, max, def }) {
  if (v === undefined || v === null || v === "") return def;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(422, `${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function strList(v, name, { maxItems, maxLen }) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(422, `${name} must be a list`);
  if (v.length > maxItems) throw new HttpError(422, `${name} may contain at most ${maxItems} items`);
  return v.map((x) => str(x, `${name} item`, { max: maxLen }));
}

// Python's str(float): whole numbers keep a trailing ".0" (keeps CSV bytes identical to the old API).
export const pyFloat = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Rate limit via the Workers Rate Limiting binding (env.LIMITER). No binding (tests, local) = allow.
export async function rateLimit(env, request, bucket) {
  if (!env.LIMITER) return;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const { success } = await env.LIMITER.limit({ key: `${bucket}:${ip}` });
  if (!success) throw new HttpError(429, "Too many requests. Please slow down and retry shortly.");
}

export const num = (env, name, def) => {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
};
