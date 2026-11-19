/**
 * relynked.com/beta's two calls, passed to the API (relynked server/api src/routes/beta.ts) the way the shop pages are
 * (../../_shop.js): the API's origin in BETA_API, else SHOP_PAGES_API, and the same proxy secret,
 * SHOP_PAGES_PROXY_SECRET (32 characters or more), beside the visitor's address. Unlike the shop pages it does not
 * wait for SHOP_PAGES_ENABLED: sign up works whether or not shop pages are on. Without an API or a secret it answers
 * 503 and the page says it could not send.
 *
 * Nothing of the visitor's goes to the API but the JSON they typed and their address (for the per visitor limit):
 * no cookies, no referrer. The API's answer comes back with only its content type.
 *
 * THE INVITE WORD (security review, 19 Nov 2026). The tester link is relynked.com/beta?k=WORD; the page puts the word
 * in the JSON as k, and the JSON goes to the API as typed, so the word goes with it. The API checks it; this function
 * never knows the word.
 *
 * ONLY THIS SITE'S OWN PAGE. A request that names an Origin other than https://relynked.com is refused (403) before
 * anything is read or sent, so another site's page cannot post through a visitor's browser. A browser sends Origin on
 * every POST; a request with none (curl, an old browser on a GET) is let through and meets the API's own checks. A
 * Pages preview (https://<something>.pages.dev, posting to itself) is allowed only when BETA_ALLOW_PREVIEW_ORIGIN is
 * "true" on that deployment. A body that says it is larger than 8192 bytes is refused before it is read.
 */
import { visitorOf } from "../../_shop.js";

/** The API's https origin, or null when this Pages project is not set up for it. Pure. */
export function betaApi(env) {
  const api = env.BETA_API || env.SHOP_PAGES_API || "";
  return /^https:\/\/[a-z0-9.-]+$/.test(api) && (env.SHOP_PAGES_PROXY_SECRET || "").length >= 32 ? api : null;
}

export const MAX_BODY = 8192;
export const SITE_ORIGIN = "https://relynked.com";

/** Whether the request may come from where it says it comes from. No Origin at all: yes. Pure. */
export function originAllowed(request, env) {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  if (origin === SITE_ORIGIN) return true;
  if (env.BETA_ALLOW_PREVIEW_ORIGIN !== "true") return false;
  // A preview deployment's own page, posting to itself.
  let own = "";
  try {
    own = new URL(request.url).origin;
  } catch {
    return false;
  }
  return origin === own && /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)?\.pages\.dev$/.test(origin);
}

const answer = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });

export async function toBetaApi(context, path) {
  const { request, env } = context;
  const api = betaApi(env);
  if (!api) return answer(503, { ok: false, error: "not_configured" });
  if (!originAllowed(request, env)) return answer(403, { ok: false, error: "forbidden" });
  const headers = { "x-relynked-proxy": env.SHOP_PAGES_PROXY_SECRET, "x-relynked-client-ip": visitorOf(request, env), accept: "application/json" };
  let init = { method: "GET", headers, redirect: "manual" };
  if (request.method === "POST") {
    if (!/^application\/json\b/.test(request.headers.get("content-type") || "")) return answer(415, { ok: false, error: "json_only" });
    // What the request says its size is, before a byte of it is read; then what it really was.
    const said = Number(request.headers.get("content-length") || "0");
    if (!Number.isFinite(said) || said > MAX_BODY) return answer(413, { ok: false, error: "too_large" });
    const text = await request.text();
    if (text.length > MAX_BODY) return answer(413, { ok: false, error: "too_large" });
    init = { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: text, redirect: "manual" };
  }
  let upstream;
  try {
    upstream = await fetch(api + path, init);
  } catch {
    return answer(503, { ok: false, error: "busy" }, { "retry-after": "5" });
  }
  const out = new Headers({ "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" });
  // The settings may be kept a minute (the API says so); an application never.
  out.set("cache-control", request.method === "GET" && upstream.status === 200 ? "public, max-age=60" : "no-store");
  const retry = upstream.headers.get("retry-after");
  if (retry) out.set("retry-after", retry);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
