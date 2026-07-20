// GamerHoard — Steam import backend. Two ways in, both server-side:
//
//   1) "Sign in through Steam" (OpenID 2.0) — the default. No API key, no profile
//      typing. Uses the DEVELOPER's Steam key (a function secret). Requires the
//      user's "Game details" privacy to be Public.
//        • start    GET  ?app=<redirect>            → 302 to Steam's login page
//        • callback GET  ?app=<redirect>&openid.*   → verify, 302 back to
//                        <redirect>#sid&exp&sig      (short-lived HMAC-signed SteamID)
//        • games    GET  ?stage=games&sid&exp&sig   → GetOwnedGames (server key) → JSON
//
//   2) Manual API key — the hidden fallback for people who keep their profile
//      PRIVATE. The user supplies their OWN Steam key (a key can always read its
//      owner's library, public or not). Routed here too, so web has no CORS issue
//      and the key never sits in a URL/log (sent in the POST body, used once).
//        • manual   POST {mode:"manual", key, profile} → resolve + GetOwnedGames → JSON
//
// Deploy:  supabase functions deploy steam-auth --no-verify-jwt
// Secrets: supabase secrets set STEAM_WEB_API_KEY=xxxx STEAM_AUTH_SECRET=$(openssl rand -hex 32)

const STEAM_KEY = Deno.env.get("STEAM_WEB_API_KEY") ?? "";
const AUTH_SECRET = Deno.env.get("STEAM_AUTH_SECRET") ?? "";
const ALLOWED_HOSTS = (Deno.env.get("STEAM_ALLOWED_HOSTS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const OPENID_URL = "https://steamcommunity.com/openid/login";
const API = "https://api.steampowered.com";
const TOKEN_TTL = 300; // seconds a signed SteamID stays valid (login → games call)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location } });

// ---- HMAC token over "<steamid>.<exp>" --------------------------------------
const enc = new TextEncoder();
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signSteamId(steamid: string) {
  const exp = String(Math.floor(Date.now() / 1000) + TOKEN_TTL);
  return { sid: steamid, exp, sig: await hmac(`${steamid}.${exp}`) };
}
async function verifyToken(sid: string, exp: string, sig: string): Promise<boolean> {
  if (!/^\d{17}$/.test(sid) || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(`${sid}.${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0; // constant-time-ish compare
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---- Steam Web API helpers (used by both flows) -----------------------------
const RE_ID64 = /^\d{17}$/;
/** Accept a 17-digit SteamID64, a profile URL, or a vanity name (resolved via key). */
async function resolveSteamId(input: string, key: string): Promise<string | null> {
  const s = input.trim();
  if (RE_ID64.test(s)) return s;
  const mProf = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (mProf) return mProf[1];
  let vanity = s;
  const mVan = s.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (mVan) vanity = mVan[1];
  const r = await fetch(`${API}/ISteamUser/ResolveVanityURL/v1/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.response?.success === 1 && j.response.steamid ? String(j.response.steamid) : null;
}
/** Returns the games array, [] when the profile hides its games, or null on API error. */
async function getOwnedGames(steamid: string, key: string): Promise<any[] | null> {
  const r = await fetch(`${API}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1&format=json`);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || !j.response) return null;
  return Array.isArray(j.response.games) ? j.response.games : [];
}

// ---- Redirect-target allow-list ---------------------------------------------
function isSafeRedirect(app: string): boolean {
  if (!app) return false;
  if (app.startsWith("gamerhoard://")) return true; // native deep link
  let u: URL;
  try { u = new URL(app); } catch { return false; }
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true; // dev
  if (u.protocol !== "https:") return false;
  return ALLOWED_HOSTS.length === 0 ? true : ALLOWED_HOSTS.includes(u.hostname);
}
function appHash(app: string, params: Record<string, string>): string {
  const frag = new URLSearchParams(params).toString();
  return `${app}${app.includes("#") ? "&" : "#"}${frag}`;
}
function selfUrl(req: Request): string {
  const u = new URL(req.url);
  return `${u.origin}${u.pathname}`;
}

// ---- Steam OpenID assertion verification ------------------------------------
const RE_CLAIMED = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
async function verifyOpenId(params: URLSearchParams): Promise<string | null> {
  const m = (params.get("openid.claimed_id") ?? "").match(RE_CLAIMED);
  if (!m) return null;
  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");
  const r = await fetch(OPENID_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await r.text();
  return /is_valid\s*:\s*true/i.test(text) ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!STEAM_KEY || !AUTH_SECRET) return json({ error: "server_misconfigured" }, 500);

  // ---- manual: user's OWN key + profile (works on private profiles) ----------
  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || body.mode !== "manual") return json({ error: "bad_request" }, 400);
    const key = String(body.key ?? "").trim();
    const profile = String(body.profile ?? "").trim();
    if (!key || !profile) return json({ error: "need_both" }, 400);
    const steamid = await resolveSteamId(profile, key);
    if (!steamid) return json({ error: "profile" }, 400);
    const games = await getOwnedGames(steamid, key);
    if (games == null) return json({ error: "fetch" }, 502);
    return json({ steamid, games });
  }

  const q = new URL(req.url).searchParams;

  // ---- games: exchange a signed SteamID for the owned-games library ----------
  if (q.get("stage") === "games") {
    const sid = q.get("sid") ?? "", exp = q.get("exp") ?? "", sig = q.get("sig") ?? "";
    if (!(await verifyToken(sid, exp, sig))) return json({ error: "bad_token" }, 401);
    const games = await getOwnedGames(sid, STEAM_KEY);
    if (games == null) return json({ error: "steam_api" }, 502);
    // With the SERVER key, an empty list means the profile's game details are private.
    if (games.length === 0) return json({ steamid: sid, games: [], private: true });
    return json({ steamid: sid, games });
  }

  // ---- callback: Steam bounced the user back with an assertion ----------------
  if (q.get("openid.mode") === "id_res") {
    const app = q.get("app") ?? "";
    if (!isSafeRedirect(app)) return json({ error: "bad_redirect" }, 400);
    const steamid = await verifyOpenId(q);
    if (!steamid) return redirect(appHash(app, { error: "verify" }));
    return redirect(appHash(app, await signSteamId(steamid)));
  }

  // ---- start: send the user to Steam's login page -----------------------------
  const app = q.get("app") ?? "";
  if (!isSafeRedirect(app)) return json({ error: "missing_or_bad_app" }, 400);
  const self = selfUrl(req);
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${self}?app=${encodeURIComponent(app)}`,
    "openid.realm": new URL(self).origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return redirect(`${OPENID_URL}?${p.toString()}`);
});
