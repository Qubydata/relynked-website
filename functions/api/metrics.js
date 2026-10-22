/**
 * The dashboard's way to reach platform metrics without holding a secret.
 *
 * WHY A PROXY AT ALL. The metrics endpoint needs a key, and a browser cannot
 * keep one: anything the page can send, anyone reading the page can send
 * too. So the key lives here, in a Cloudflare Pages Function running at the
 * edge, and the browser asks this instead. Same origin, no credential, no
 * CORS.
 *
 * IT FAILS CLOSED, and that is the important property. The Cloudflare Access
 * application in front of the dashboard protects `relynked.com/dashboard`,
 * and `/api/metrics` is a destination on it too. Rather than trust that it
 * still is, this refuses any request that does not carry a Cloudflare Access
 * token it can verify itself.
 *
 * THE TOKEN IS VERIFIED, NOT JUST SEEN (security review 2026-10-09,
 * remy-hq/security/clone-and-break-resistance.md). This used to check only
 * that a `cf-access-jwt-assertion` header existed, so if the path ever fell
 * out of Access, anyone could send a made-up header and read the platform's
 * figures through the admin key. Now the token must be a JWT that is:
 *
 *   signed (RS256) by one of the team's own keys, fetched from
 *     https://<team>/cdn-cgi/access/certs and kept for ten minutes (fetched
 *     again at once for a key id it has not seen, so a key rotation works);
 *   issued by that team (iss is https://<team>);
 *   for this application (aud holds CF_ACCESS_AUD, the application's
 *     audience tag);
 *   in date (exp in the future, nbf and iat not in the future, a minute of
 *     clock slack).
 *
 * A refusal answers one plain 401 (access_token_refused), never which check
 * failed; the reason goes to the function's own log. An unknown key id
 * fetches the keys again at most once a minute, so made-up tokens cannot
 * make this hammer Cloudflare. Who viewed (the token's email) is logged, and
 * sent to the API as x-relynked-viewer for its own log (security review
 * 2026-10-10, web-18 and web-19).
 *
 * Settings on the Pages project (Settings, Variables and secrets):
 *   ADMIN_METRICS_KEY      the API's admin key (secret)
 *   CF_ACCESS_TEAM_DOMAIN  the Zero Trust team domain, e.g. relynked.cloudflareaccess.com
 *   CF_ACCESS_AUD          the Relynked Dashboard application's Audience (AUD) tag
 * Without the last two the function answers 503: it never falls back to
 * trusting the header.
 *
 * Path behind Cloudflare Access on live already: this is defence in depth.
 * Following https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */
const API = "https://relynked-api-production.up.railway.app/admin/metrics";

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Commercial figures should not sit in a shared cache anywhere.
      "cache-control": "no-store, private",
    },
  });

/* ── the Access token ─────────────────────────────────────────────────── */

const CERTS_TTL_MS = 10 * 60_000;
const FORCED_FETCH_GAP_MS = 60_000;
let lastForcedFetch = 0;
const CLOCK_SLACK_S = 60;
let certsCache = null; // { team, at, keys: Map<kid, CryptoKey> }

/** "relynked.cloudflareaccess.com" from either that or "https://relynked.cloudflareaccess.com/". */
function teamHost(value) {
  const v = String(value || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(v) ? v.toLowerCase() : null;
}

function b64urlBytes(s) {
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : s.length % 4 === 0 ? "" : null;
  if (pad === null || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function loadKeys(team, force) {
  const now = Date.now();
  if (!force && certsCache && certsCache.team === team && now - certsCache.at < CERTS_TTL_MS) return certsCache.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`certs ${res.status}`);
  const body = await res.json();
  const keys = new Map();
  for (const jwk of (body && body.keys) || []) {
    if (!jwk || jwk.kty !== "RSA" || typeof jwk.kid !== "string") continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    } catch {
      /* a key this runtime cannot read is skipped */
    }
  }
  certsCache = { team, at: now, keys };
  return keys;
}

/**
 * Verifies a Cloudflare Access token. Resolves with its claims, or with
 * { error } naming what failed. Never throws.
 */
async function verifyAccessToken(token, { team, aud, now = Date.now() }) {
  try {
    if (typeof token !== "string" || token.length > 8192) return { error: "malformed" };
    const parts = token.split(".");
    if (parts.length !== 3) return { error: "malformed" };
    const header = b64urlJson(parts[0]);
    const claims = b64urlJson(parts[1]);
    const signature = b64urlBytes(parts[2]);
    if (!header || header.alg !== "RS256" || typeof header.kid !== "string") return { error: "bad_algorithm" };

    let keys = await loadKeys(team, false);
    // A key id not seen yet: the team may have rotated its keys. Fetch once more, at most once a minute.
    if (!keys.has(header.kid) && Date.now() - lastForcedFetch >= FORCED_FETCH_GAP_MS) {
      lastForcedFetch = Date.now();
      keys = await loadKeys(team, true);
    }
    const key = keys.get(header.kid);
    if (!key) return { error: "unknown_key" };
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, signed);
    if (!ok) return { error: "bad_signature" };

    if (!claims || claims.iss !== `https://${team}`) return { error: "wrong_issuer" };
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(aud)) return { error: "wrong_audience" };
    const t = Math.floor(now / 1000);
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SLACK_S < t) return { error: "expired" };
    if (typeof claims.nbf === "number" && claims.nbf - CLOCK_SLACK_S > t) return { error: "not_yet_valid" };
    if (typeof claims.iat === "number" && claims.iat - CLOCK_SLACK_S > t) return { error: "not_yet_valid" };
    return { claims };
  } catch {
    return { error: "malformed" };
  }
}

/* ── the request ──────────────────────────────────────────────────────── */

export async function onRequestGet(context) {
  const env = context.env || {};
  const key = env.ADMIN_METRICS_KEY;
  if (!key) {
    return json({ error: "not_configured", detail: "ADMIN_METRICS_KEY is not set on this Pages project." }, 503);
  }
  const team = teamHost(env.CF_ACCESS_TEAM_DOMAIN);
  const aud = typeof env.CF_ACCESS_AUD === "string" ? env.CF_ACCESS_AUD.trim() : "";
  if (!team || !aud) {
    return json(
      {
        error: "not_configured",
        detail:
          "Set CF_ACCESS_TEAM_DOMAIN (the Zero Trust team domain) and CF_ACCESS_AUD (the Relynked Dashboard application's audience tag) on this Pages project, so the Access token can be verified.",
      },
      503,
    );
  }

  const assertion = context.request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    return json(
      {
        error: "not_behind_access",
        detail:
          "This request did not come through Cloudflare Access. Add relynked.com/api/metrics as a destination on the Relynked Dashboard application.",
      },
      401,
    );
  }
  const verified = await verifyAccessToken(assertion, { team, aud });
  if (verified.error) {
    // The reason is logged here, never told to the caller, and never the token.
    console.warn(JSON.stringify({ event: "metrics_access_refused", reason: verified.error }));
    return json({ error: "access_token_refused" }, 401);
  }
  const viewer = typeof verified.claims.email === "string" ? verified.claims.email.slice(0, 200) : String(verified.claims.sub || "").slice(0, 200);
  console.log(JSON.stringify({ event: "metrics_viewed", viewer }));

  let upstream;
  try {
    upstream = await fetch(API, {
      headers: { "x-admin-key": key, "x-relynked-viewer": viewer },
      // A dashboard tile is not worth hanging a page for.
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", detail: String((e && e.message) || e) }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    // Passed through rather than flattened, so a 401 here reads as "the key
    // is wrong" instead of a generic failure the dashboard cannot explain.
    return json({ error: "upstream_error", status: upstream.status, detail: text.slice(0, 300) }, 502);
  }

  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" },
  });
}
