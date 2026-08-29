// CrowdCampers planner API: Cloudflare Worker serving POST /api/plan.
//
// Request order (every step is a launch requirement, see .claude/skills/planner-api):
//   kill switch -> Turnstile -> input caps -> cache -> rate limit -> Claude -> cache store
//
// Env (wrangler.toml vars / secrets):
//   PLANNER_ENABLED   "true" to serve; anything else -> 503 (kill switch)
//   TURNSTILE_SECRET  secret
//   ANTHROPIC_API_KEY secret, a key dedicated to the planner
//   PLANNER_MODEL     default claude-haiku-4-5 (cheapest model that returns reliable JSON)
//   DATA_BASE_URL     where data/processed/ and planner/PLANNER_PROMPT.md are served from
//   RATE_KV           KV namespace binding for per-IP counters
//   ALLOWED_ORIGINS   comma-separated origins allowed to call this API (CORS)

const MAX_INPUT_CHARS = 600;
const MAX_SPOTS = 150;
const MAX_TOKENS = 3000;
const CACHE_TTL = 7 * 24 * 3600;
const RATE_LIMITS = { hour: 3, day: 6 };
const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_DATA_URL = "https://raw.githubusercontent.com/mineflowprocess/crowdcampers/main";

const MSG = {
  disabled: "De planner staat tijdelijk uit. Probeer het later nog eens.",
  turnstile: "De anti-botcheck lukte niet. Ververs de pagina en probeer het opnieuw.",
  tooLong: `Je beschrijving is te lang (max ${MAX_INPUT_CHARS} tekens).`,
  tooShort: "Vertel iets meer over je trip, dan kunnen we er wat mee.",
  rate: "Je hebt je plannen voor nu even op. Probeer het over een uurtje weer.",
  upstream: "De planner kon geen route maken. Probeer het zo nog eens.",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (url.pathname !== "/api/plan") return json({ message: "Not found" }, 404, cors);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ message: "Method not allowed" }, 405, cors);
    try {
      const res = await plan(request, env, ctx);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      console.log(JSON.stringify({ event: "error", error: String(e && e.message || e) }));
      return json({ message: MSG.upstream }, 502, cors);
    }
  },
};

async function plan(request, env, ctx) {
  const started = Date.now();
  if (env.PLANNER_ENABLED !== "true") return json({ message: MSG.disabled }, 503);

  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

  if (!(await verifyTurnstile(body.turnstile, ip, env))) return json({ message: MSG.turnstile }, 403);

  const trip = typeof body.trip === "string" ? body.trip.trim() : "";
  if (trip.length > MAX_INPUT_CHARS) return json({ message: MSG.tooLong }, 400);
  if (trip.length < 10) return json({ message: MSG.tooShort }, 400);

  // Cache before rate limit: a cached answer costs nothing, so it should not burn quota.
  const key = await cacheKey(trip);
  const cache = caches.default;
  const cached = await cache.match(key);
  if (cached) {
    log({ event: "plan", cache: "hit", ms: Date.now() - started });
    return cached;
  }

  if (!(await withinRateLimit(ip, env))) return json({ message: MSG.rate }, 429);

  const [prompt, index] = await Promise.all([loadText(env, "/planner/PLANNER_PROMPT.md"), loadJson(env, "/data/processed/index.json")]);
  const spots = await selectSpots(trip, index, env);
  const result = await askClaude(prompt, spots, trip, env);
  if (!result.plan) {
    log({ event: "plan", cache: "miss", spots: spots.length, error: result.error, usage: result.usage });
    return json({ message: MSG.upstream }, 502);
  }
  log({ event: "plan", cache: "miss", spots: spots.length, usage: result.usage, ms: Date.now() - started });

  const response = json(result.plan, 200, { "Cache-Control": `public, max-age=${CACHE_TTL}` });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

// --- protections ---------------------------------------------------------

async function verifyTurnstile(token, ip, env) {
  if (!token || !env.TURNSTILE_SECRET) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  const data = await r.json().catch(() => ({}));
  return data.success === true;
}

async function withinRateLimit(ip, env) {
  if (!env.RATE_KV) return false; // fail closed: no counter, no plans
  const now = new Date();
  const hourKey = `${ip}:h:${now.toISOString().slice(0, 13)}`;
  const dayKey = `${ip}:d:${now.toISOString().slice(0, 10)}`;
  const [h, d] = await Promise.all([env.RATE_KV.get(hourKey), env.RATE_KV.get(dayKey)]);
  const hour = Number(h || 0), day = Number(d || 0);
  if (hour >= RATE_LIMITS.hour || day >= RATE_LIMITS.day) return false;
  await Promise.all([
    env.RATE_KV.put(hourKey, String(hour + 1), { expirationTtl: 3600 }),
    env.RATE_KV.put(dayKey, String(day + 1), { expirationTtl: 86400 }),
  ]);
  return true;
}

async function cacheKey(trip) {
  const normalized = trip.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request(`https://cache.crowdcampers.internal/plan/${hex}`);
}

// --- data ----------------------------------------------------------------

function loadText(env, path) {
  return fetch((env.DATA_BASE_URL || DEFAULT_DATA_URL) + path, { cf: { cacheTtl: 3600, cacheEverything: true } })
    .then((r) => { if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`); return r.text(); });
}

function loadJson(env, path) {
  return loadText(env, path).then(JSON.parse);
}

// Pick the spots most likely relevant: regions and countries the traveler names.
// No model call here; text matching keeps this step free.
async function selectSpots(trip, index, env) {
  const text = trip.toLowerCase();
  const countries = Object.keys(index.countries || {});
  const wanted = [];
  for (const cc of countries) {
    const regions = Object.keys(index.countries[cc].regions || {}).filter((r) => r !== "?");
    const hitRegions = regions.filter((r) => text.includes(r.toLowerCase()));
    const hitCountry = (COUNTRY_WORDS[cc] || []).some((w) => text.includes(w));
    if (hitRegions.length || hitCountry) wanted.push({ cc, regions: hitRegions });
  }
  if (!wanted.length && countries.length) wanted.push({ cc: countries[0], regions: [] });

  let pool = [];
  for (const { cc, regions } of wanted) {
    const file = await loadJson(env, `/data/processed/spots-${cc}.json`);
    const spots = file.spots.filter((s) => !regions.length || regions.includes(s.region));
    pool = pool.concat(spots);
  }
  // Prefer named spots with amenity info; then sample evenly to the cap.
  pool.sort((a, b) => score(b) - score(a));
  if (pool.length > MAX_SPOTS) {
    const step = pool.length / MAX_SPOTS;
    pool = Array.from({ length: MAX_SPOTS }, (_, i) => pool[Math.floor(i * step)]);
  }
  return pool.map((s) => ({
    id: s.id, naam: s.name, lat: s.lat, lon: s.lon, regio: s.region, type: s.type,
    betaald: s.fee, voorzieningen: s.amenities, osm_url: s.osm_url,
  }));
}

function score(s) {
  return (s.name ? 2 : 0) + (s.amenities ? s.amenities.length : 0) + (s.fee === false ? 1 : 0);
}

const COUNTRY_WORDS = {
  NL: ["nederland", "holland", "netherlands"], BE: ["belgi", "ardennen", "belgium"],
  DE: ["duitsland", "germany", "eifel", "moezel", "zwarte woud"], FR: ["frankrijk", "france", "bretagne", "normandi", "provence", "dordogne", "elzas"],
  ES: ["spanje", "spain", "andalusi", "cataloni"], IT: ["itali", "toscane", "italy"], PT: ["portugal", "algarve"],
  AT: ["oostenrijk", "austria", "tirol"], CH: ["zwitserland", "switzerland"], DK: ["denemarken", "denmark"],
  NO: ["noorwegen", "norway"], SE: ["zweden", "sweden"], HR: ["kroati", "croatia", "istri"], SI: ["sloveni"],
};

// --- model ---------------------------------------------------------------

async function askClaude(systemPrompt, spots, trip, env) {
  const system = systemPrompt + "\n\n## Beschikbare plekken (JSON)\n\n" + JSON.stringify(spots);
  const messages = [{ role: "user", content: trip }]; // user text never enters the system prompt
  let usage = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.PLANNER_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `api ${r.status}: ${data.error && data.error.message}` };
    usage = data.usage;
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
    const plan = parsePlan(text);
    if (plan) return { plan, usage };
    messages.push({ role: "assistant", content: text }, { role: "user", content: "Dat was geen geldige JSON. Antwoord opnieuw met uitsluitend het JSON-object." });
  }
  return { error: "malformed json twice", usage };
}

function parsePlan(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    const plan = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(plan.dagen) ? plan : null;
  } catch (_) {
    return null;
  }
}

// --- helpers -------------------------------------------------------------

// The site lives on Pages (another origin) until the Worker gets a route on crowdcampers.com.
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function log(fields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
}
