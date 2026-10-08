// Third-party integrations: Gemini (descriptions) and short.io (link shortening).
import { HttpError, isObj, num, str } from "./util.js";

const GEMINI_MODEL = "gemini-2.5-flash";
const SYSTEM_PROMPT =
  "You are a concise location description writer. Write engaging, factual mini-descriptions for businesses and places. " +
  "Keep descriptions under 500 characters. Output the description text directly with no quotes.";

export async function generateDescriptions(env, body) {
  if (!env.GEMINI_API_KEY) throw new HttpError(500, "LLM key not configured");
  if (!isObj(body) || !Array.isArray(body.places)) throw new HttpError(422, "places must be a list");
  const cap = Math.min(10, Math.max(1, num(env, "SUBREQUEST_BUDGET", 40) - 2));
  if (body.places.length > cap) throw new HttpError(413, `At most ${cap} places per request`);

  const results = await Promise.all(
    body.places.map(async (item) => {
      const id = typeof item?.id === "string" ? item.id.slice(0, 200) : "";
      const name = typeof item?.name === "string" ? item.name.trim().slice(0, 200) : "";
      if (!name) return { id, description: null, success: false, error: "Missing name" };
      const address = typeof item.address === "string" ? item.address.slice(0, 300) : "";
      const cat = typeof item.category === "string" ? item.category.slice(0, 100) : "";
      let prompt = `Write a short, engaging description (max 500 chars) for: ${name}`;
      if (address) prompt += ` at ${address}`;
      if (cat) prompt += ` (Category: ${cat})`;
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) {
          console.error(`Gemini error ${res.status} for ${name}`);
          return { id, description: null, success: false, error: `LLM error ${res.status}` };
        }
        const data = await res.json();
        let desc = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().replace(/^["']+|["']+$/g, "");
        if (!desc) return { id, description: null, success: false, error: "Empty response" };
        if (desc.length > 500) desc = desc.slice(0, 497) + "...";
        return { id, description: desc, success: true };
      } catch (e) {
        const timeout = e?.name === "TimeoutError";
        console.error(`Description gen ${timeout ? "timeout" : "error"} for ${name}: ${e}`);
        return { id, description: null, success: false, error: timeout ? "Timeout" : "Request failed" };
      }
    }),
  );
  const generated = results.filter((r) => r.success).length;
  return { success: true, results, generated, total: results.length };
}

const shortioConfigured = (env) => Boolean(env.SHORTIO_API_KEY && env.SHORTIO_DOMAIN);

export async function shortenLinks(env, body) {
  if (!shortioConfigured(env)) throw new HttpError(500, "Short.io is not configured");
  if (!isObj(body) || !Array.isArray(body.urls)) throw new HttpError(422, "urls must be a list");
  const cap = Math.max(1, num(env, "SUBREQUEST_BUDGET", 40) - 2);
  if (body.urls.length > cap) throw new HttpError(413, `At most ${cap} urls per request`);

  const one = async (item) => {
    const id = str(item?.id, "id", { max: 200 });
    const url = str(item?.url, "url", { max: 2000 });
    if (!url) return { id, original_url: "", short_url: null, success: false, error: "No URL" };
    let valid = false;
    try {
      valid = ["http:", "https:"].includes(new URL(url).protocol);
    } catch {
      /* invalid */
    }
    if (!valid) return { id, original_url: url, short_url: null, success: false, error: "Invalid URL" };
    try {
      const res = await fetch("https://api.short.io/links", {
        method: "POST",
        headers: { Authorization: env.SHORTIO_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ originalURL: url, domain: env.SHORTIO_DOMAIN, allowDuplicates: false }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => ({}));
      if (data.shortURL) return { id, original_url: url, short_url: data.shortURL, success: true, error: null };
      return { id, original_url: url, short_url: null, success: false, error: data.message || data.error || String(res.status) };
    } catch (e) {
      console.error(`short.io error: ${e}`);
      return { id, original_url: url, short_url: null, success: false, error: "Request failed" };
    }
  };

  const results = [];
  for (let i = 0; i < body.urls.length; i += 5) {
    results.push(...(await Promise.all(body.urls.slice(i, i + 5).map(one))));
  }
  return { success: true, results, shortened: results.filter((r) => r.success).length, total: results.length };
}

const mask = (key) => (key ? `${"*".repeat(8)}${key.slice(-4)}` : "");

// Read-only reachability check (the old endpoint created a real short link on every call).
export async function shortenStatus(env) {
  const masked = mask(env.SHORTIO_API_KEY);
  if (!shortioConfigured(env)) return { connected: false, domain: "", api_key_masked: masked, error: "Not configured" };
  const domain = env.SHORTIO_DOMAIN;
  try {
    const res = await fetch("https://api.short.io/api/domains", {
      headers: { Authorization: env.SHORTIO_API_KEY, accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return { connected: true, domain, api_key_masked: masked, error: null };
    return { connected: false, domain, api_key_masked: masked, error: `Status ${res.status}` };
  } catch {
    return { connected: false, domain, api_key_masked: masked, error: "Unreachable" };
  }
}
