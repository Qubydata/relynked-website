/**
 * SHOP PAGES ON relynked.com (backend: relynked server/api src/routes/shop-pages.ts).
 *
 *   relynked.com/<handle>                 the business's page
 *   relynked.com/<handle>/photo/<file>    its web sized photos
 *   relynked.com/<handle>/report          the report page (GET) and a report (POST)
 *   relynked.com/s/<code>                 the permanent short link
 *
 * WHY HERE AND NOT A REDIRECT. The address customers share and print is
 * relynked.com/<handle>; a redirect would show the API's own domain, break the
 * canonical address and WhatsApp's link preview. So this function passes the
 * request to the API, which draws the page (one small HTML document, the
 * prices live), and Cloudflare keeps each answer at the edge for as long as
 * the API's own s-maxage says (30 seconds for a page, for good for a photo,
 * whose address carries its own id). A busy page costs the API one request
 * every 30 seconds per edge location, not one per visitor.
 *
 * SWITCHED OFF UNLESS SHOP_PAGES_ENABLED is exactly "true" on this Pages
 * project, with SHOP_PAGES_API (the API's https origin) and
 * SHOP_PAGES_PROXY_SECRET (the same secret the API has, 32 characters or
 * more) set. Off, every path goes on to the site's own files as before.
 *
 * THE VISITOR'S ADDRESS goes to the API in x-relynked-client-ip, with the
 * secret beside it, so the API's rate limits count each visitor, not
 * Cloudflare. Nothing else of the visitor's is passed on: no cookies, no
 * referrer.
 *
 * <handle>.relynked.com (the Worker in the backend repo, deploy/shop-subdomains-worker)
 * asks this same function for relynked.com/<handle>. That request comes from
 * Cloudflare, so the Worker names the visitor in x-relynked-visitor and proves
 * it is the Worker with x-relynked-worker (SHOP_WORKER_SECRET, 32 characters
 * or more, the same on the Worker and on this Pages project). Without a match
 * the header is ignored and the request's own address counts.
 */

/** Constant time comparison of two strings. */
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The visitor's address: the Worker's word for it when the Worker proves itself, else Cloudflare's. */
export function visitorOf(request, env) {
  const secret = env.SHOP_WORKER_SECRET || "";
  if (secret.length >= 32 && same(request.headers.get("x-relynked-worker"), secret)) {
    return request.headers.get("x-relynked-visitor") || "";
  }
  return request.headers.get("cf-connecting-ip") || "";
}

// The site's own pages and folders, and Relynked's own paths: never a shop page.
export const NOT_A_PAGE = new Set([
  "api", "assets", "functions", "industries", "o", "s", "reference", "scripts", "app", "staff", "www", "admin", "login",
  "support", "help", "pricing", "product", "careers", "contact", "press", "privacy", "terms", "refund-policy",
  "data-deletion", "how-it-works", "dashboard", "index", "robots", "sitemap", "favicon", "furjejkwnfuh737-x3-shift26",
]);

const HANDLE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Whether a first path segment can be a shop page at all. Pure. */
export function isHandle(seg) {
  return typeof seg === "string" && HANDLE.test(seg) && !seg.includes("--") && /[a-z]/.test(seg) && !NOT_A_PAGE.has(seg);
}

const PASS_BACK = ["content-type", "cache-control", "content-security-policy", "x-robots-tag", "location", "link", "retry-after", "referrer-policy", "x-content-type-options", "x-frame-options", "permissions-policy"];

/**
 * Passes one request to the API at `apiPath` and gives its answer back,
 * kept at the edge when the API says it may be. `context.next()` when the
 * feature is off or not configured.
 */
export async function toApi(context, apiPath) {
  const { request, env } = context;
  if (env.SHOP_PAGES_ENABLED !== "true" || !/^https:\/\/[a-z0-9.-]+$/.test(env.SHOP_PAGES_API || "") || (env.SHOP_PAGES_PROXY_SECRET || "").length < 32) {
    return context.next();
  }
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = new URL(request.url);
  const cache = caches.default;
  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
  if (method === "GET") {
    const hit = await cache.match(cacheKey);
    if (hit) {
      // The browser gets the API's own rule back (max-age=0 for a page), not the edge's.
      const h = new Headers(hit.headers);
      const original = h.get("x-shop-cc");
      if (original) h.set("cache-control", original);
      h.delete("x-shop-cc");
      return new Response(hit.body, { status: hit.status, headers: h });
    }
  }
  const headers = {
    "x-relynked-proxy": env.SHOP_PAGES_PROXY_SECRET,
    "x-relynked-client-ip": visitorOf(request, env),
    accept: request.headers.get("accept") || "*/*",
  };
  let body;
  if (method === "POST") {
    const type = request.headers.get("content-type") || "";
    if (!/^application\/(x-www-form-urlencoded|json)\b/.test(type)) return new Response("Unsupported", { status: 415 });
    const text = await request.text();
    if (text.length > 4096) return new Response("Too large", { status: 413 });
    headers["content-type"] = type;
    body = text;
  }
  let upstream;
  try {
    upstream = await fetch(env.SHOP_PAGES_API + apiPath, { method: method === "HEAD" ? "GET" : method, headers, body, redirect: "manual" });
  } catch {
    return new Response("Busy. Please try again in a moment.", { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  }
  const out = new Headers();
  for (const h of PASS_BACK) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("strict-transport-security", "max-age=31536000");
  const response = new Response(method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
  const cc = out.get("cache-control") || "";
  if (method === "GET" && /\bpublic\b/.test(cc) && /s-maxage=\d+|max-age=[1-9]/.test(cc) && [200, 301, 302, 404].includes(upstream.status)) {
    // Cloudflare's cache keeps it for the s-maxage the API set (30 seconds for a page).
    const keep = response.clone();
    const edge = new Headers(keep.headers);
    const s = /s-maxage=(\d+)/.exec(cc);
    if (s) edge.set("cache-control", `public, max-age=${s[1]}`);
    edge.set("x-shop-cc", cc);
    context.waitUntil(cache.put(cacheKey, new Response(keep.body, { status: keep.status, headers: edge })));
  }
  return response;
}
