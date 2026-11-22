/**
 * SHOP PAGES ON relynked.com (backend: relynked server/api src/routes/shop-pages.ts).
 *
 *   relynked.com/<handle>                 the business's page
 *   relynked.com/<handle>/photo/<file>    its web sized photos
 *   relynked.com/<handle>/report          the report page (GET) and a report (POST)
 *   relynked.com/<handle>/order           the cart the page posts for the Ref in its WhatsApp message (POST)
 *   relynked.com/s/<code>                 the permanent short link
 *   relynked.com/<handle>?r=CODE, ?utm_source=tiktok...   a TikTok link or ad: its counted ref on the page (refFor)
 *   relynked.com/sitemap-index.xml        the site's sitemap, then one per shop whose owner let search read it
 *   relynked.com/sitemap-shop-<handle>.xml  that shop's page and the photos search may show
 *
 * The sitemaps sit at the top of the site on purpose: a sitemap may only list addresses under its own folder, and a
 * shop's address is relynked.com/<handle>. While shop pages are off (or the API cannot answer) the index still answers,
 * with the site's own sitemap only, so robots.txt never points at something broken.
 *
 * WHY HERE AND NOT A REDIRECT. The address customers share and print is
 * relynked.com/<handle>; a redirect would show the API's own domain, break the
 * canonical address and WhatsApp's link preview. So this function passes the
 * request to the API, which draws the page (one small HTML document, the
 * prices live), and Cloudflare keeps each answer at the edge for as long as
 * the API's own Cache-Control says: a page 2 seconds fresh, then served up to
 * 3 more while this function asks the API again with the page's ETag (a 304
 * when nothing changed, no body), a photo for good (its address carries its
 * own id). An owner's change therefore shows in a few seconds, while a busy
 * page costs the API one small request every 2 seconds per edge location, and
 * a burst of visitors landing on a cold page at one location is one request
 * (they share it), not one each.
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

// Names that are never a shop page: the site's own pages and folders, Relynked's own paths and host words
// (www, app, staff, api, staging, floor, kitchen ...), and the words the API refuses as handles. The API
// keeps the same lists (shop-pages/handles.ts RESERVED_HANDLES and reserved-hosts.ts); a word here only
// saves a trip to the API, the API refuses them all again.
export const NOT_A_PAGE = new Set([
  // The site's own pages, folders and files.
  "api", "assets", "functions", "industries", "o", "s", "reference", "scripts", "app", "staff", "www", "admin", "login",
  "support", "help", "pricing", "product", "careers", "contact", "press", "privacy", "terms", "refund-policy",
  "data-deletion", "how-it-works", "dashboard", "index", "robots", "sitemap", "favicon", "furjejkwnfuh737-x3-shift26",
  "faq", "console",
  // Relynked's apps, services and host words.
  "mail", "email", "status", "cdn", "static", "floor", "kitchen", "bar", "pos", "waiter", "till", "store", "storekeeper",
  "cashier", "bartender", "docs", "git", "next", "pages", "remy", "relynked", "vettar", "qubydata", "auth", "oauth",
  "webhooks", "health", "pay", "payments", "checkout", "billing", "wallet",
  // Paths a person would expect to be Relynked's.
  "signup", "sign-up", "signin", "sign-in", "register", "account", "settings", "security", "legal", "blog", "about",
  "shop", "shops", "order", "orders", "page", "report", "abuse", "download", "home", "new", "edit", "me", "my", "you",
  "official", "verify", "verified", "verification", "kyc", "bvn", "nin", "otp", "password", "reset", "refund", "refunds",
  "invoice", "receipt", "receipts", "careers-team", "team", "jobs", "customercare", "customer-care", "customerservice",
  "customer-service", "helpdesk", "help-desk", "partners", "partner", "agents", "agent", "investors", "media", "news",
  "app-store", "play-store",
  // The names a mail or web host uses, and test words.
  "ftp", "smtp", "imap", "pop", "pop3", "webmail", "vpn", "autodiscover", "autoconfig", "ns1", "ns2", "mx",
  "staging", "dev", "beta", "preview", "stage", "test", "demo", "example", "simple", "waitlist",
]);

const HANDLE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Whether a first path segment can be a shop page at all. Pure. */
export function isHandle(seg) {
  return typeof seg === "string" && HANDLE.test(seg) && !seg.includes("--") && /[a-z]/.test(seg) && !NOT_A_PAGE.has(seg);
}

/** Whether shop pages are switched on and configured on this Pages project. Off: every path goes on to the site's files as before. */
export function shopsOn(env) {
  return env.SHOP_PAGES_ENABLED === "true" && /^https:\/\/[a-z0-9.-]+$/.test(env.SHOP_PAGES_API || "") && (env.SHOP_PAGES_PROXY_SECRET || "").length >= 32;
}

const PASS_BACK = ["content-type", "cache-control", "content-security-policy", "x-robots-tag", "location", "link", "retry-after", "referrer-policy", "x-content-type-options", "x-frame-options", "permissions-policy"];

/** The longest a page is served past its freshness while the edge asks the API again (seconds). */
export const MAX_STALE_S = 5;
/** How long an expired entry is kept only to ask the API "has it changed?" (seconds): a 304 then costs no body. */
const VALIDATE_WINDOW_S = 60;

/** Parses the API's Cache-Control into what the edge may do with the answer. Pure. */
export function edgeRule(cc) {
  if (!/\bpublic\b/.test(cc || "")) return null;
  const s = /s-maxage=(\d+)/.exec(cc);
  const m = /max-age=([1-9]\d*)/.exec(cc);
  const fresh = s ? Number(s[1]) : m ? Number(m[1]) : 0;
  if (!fresh) return null;
  const w = /stale-while-revalidate=(\d+)/.exec(cc);
  // Only a rule with an s-maxage (a page that changes) may be served stale, and never for long: an owner's edit must show.
  const stale = s && w ? Math.min(Number(w[1]), MAX_STALE_S) : 0;
  return { fresh, stale };
}

/** What the API's answer looks like to the visitor: only the safe headers, plus HSTS. */
function visitorHeaders(upstream) {
  const out = new Headers();
  for (const h of PASS_BACK) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("strict-transport-security", "max-age=31536000");
  return out;
}

const INTERNAL = ["x-shop-cc", "x-shop-fresh-until", "x-shop-stale-until", "x-shop-etag"];

/** A kept answer's headers as the API sent them: the browser gets the API's own rule back, never the edge's. */
function unkeep(kept) {
  const h = new Headers(kept);
  const original = h.get("x-shop-cc");
  if (original) h.set("cache-control", original);
  for (const k of INTERNAL) h.delete(k);
  return h;
}

/**
 * Keeps an answer at the edge. It is stored for its freshness plus the stale window plus a minute (to ask "unchanged?"
 * with its ETag), and carries its own deadlines, because the Cache API only knows one: when it is gone.
 */
async function keep(cache, cacheKey, status, visitor, buf, etag, rule) {
  const now = Date.now();
  const edge = new Headers(visitor);
  edge.set("x-shop-cc", visitor.get("cache-control") || "");
  edge.set("x-shop-fresh-until", String(now + rule.fresh * 1000));
  edge.set("x-shop-stale-until", String(now + (rule.fresh + rule.stale) * 1000));
  if (etag) edge.set("x-shop-etag", etag);
  const physical = rule.fresh + rule.stale + (etag ? VALIDATE_WINDOW_S : 0);
  edge.set("cache-control", `public, max-age=${physical}`);
  await cache.put(cacheKey, new Response(buf, { status, headers: edge }));
}

/** One question to the API at a time per page in this isolate: a burst of visitors on a cold page is one request, not hundreds. */
const asking = new Map();

/** Passes a cart or a report on to the API. Never kept. */
async function post(context, apiPath) {
  const { request, env } = context;
  const type = request.headers.get("content-type") || "";
  if (!/^application\/(x-www-form-urlencoded|json)\b/.test(type)) return new Response("Unsupported", { status: 415 });
  const text = await request.text();
  if (text.length > 4096) return new Response("Too large", { status: 413 });
  const headers = { "x-relynked-proxy": env.SHOP_PAGES_PROXY_SECRET, "x-relynked-client-ip": visitorOf(request, env), accept: request.headers.get("accept") || "*/*", "content-type": type };
  let upstream;
  try {
    upstream = await fetch(env.SHOP_PAGES_API + apiPath, { method: "POST", headers, body: text, redirect: "manual" });
  } catch {
    return new Response("Busy. Please try again in a moment.", { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  }
  return new Response(upstream.body, { status: upstream.status, headers: visitorHeaders(upstream) });
}

/**
 * Passes one request to the API at `apiPath` and gives its answer back, kept at the edge when the API says it may be
 * (a page: fresh for 2 seconds, then served up to 3 more while the API is asked again, cheaply, with the page's ETag:
 * a 304 sends no body; a photo: for good). `context.next()` when the feature is off or not configured.
 */
export async function toApi(context, apiPath, query = "") {
  const { request, env } = context;
  if (!shopsOn(env)) return context.next();
  const method = request.method;
  if (method !== "GET" && method !== "HEAD" && method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (method === "POST") return post(context, apiPath);
  const url = new URL(request.url);
  const cache = caches.default;
  // A banner's colours ride in its query (already reduced to known keys by the caller), so they are part of what is kept.
  const cacheKey = new Request(url.origin + url.pathname + query, { method: "GET" });
  const key = cacheKey.url;
  const answer = (status, headers, buf) => new Response(method === "HEAD" ? null : buf, { status, headers });

  /** Asks the API (shared by every visitor waiting on this page here), keeps the answer, and returns {status, headers, buf}. */
  const ask = (hit, validator) => {
    let pending = asking.get(key);
    if (!pending) {
      pending = (async () => {
        const h = { "x-relynked-proxy": env.SHOP_PAGES_PROXY_SECRET, "x-relynked-client-ip": visitorOf(request, env), accept: request.headers.get("accept") || "*/*" };
        if (validator) h["if-none-match"] = validator;
        const upstream = await fetch(env.SHOP_PAGES_API + apiPath + query, { method: "GET", headers: h, redirect: "manual" });
        const rule = edgeRule(upstream.headers.get("cache-control") || "");
        if (upstream.status === 304 && hit) {
          // Unchanged: the page we hold is the page, fresh again; no body came.
          const visitor = unkeep(hit.headers);
          const buf = await hit.arrayBuffer();
          if (rule) await keep(cache, cacheKey, hit.status, visitor, buf, validator, rule);
          return { status: hit.status, headers: visitor, buf };
        }
        const visitor = visitorHeaders(upstream);
        const buf = await upstream.arrayBuffer();
        if (rule && [200, 301, 302, 404].includes(upstream.status)) await keep(cache, cacheKey, upstream.status, visitor, buf, upstream.headers.get("etag") || "", rule);
        return { status: upstream.status, headers: visitor, buf };
      })().finally(() => asking.delete(key));
      asking.set(key, pending);
    }
    return pending;
  };

  const hit = await cache.match(cacheKey);
  let validator = "";
  if (hit) {
    const now = Date.now();
    const freshUntil = Number(hit.headers.get("x-shop-fresh-until")) || 0;
    const staleUntil = Number(hit.headers.get("x-shop-stale-until")) || 0;
    // Fresh; or kept by the older rule, which has no deadlines of its own (the Cache API's expiry was its freshness).
    if (!freshUntil || now < freshUntil) return answer(hit.status, unkeep(hit.headers), hit.body);
    validator = hit.headers.get("x-shop-etag") || "";
    if (now < staleUntil) {
      // A little past fresh: this visitor gets the kept page at once, and the API is asked again for the next one.
      context.waitUntil(ask(hit.clone(), validator).catch(() => {}));
      return answer(hit.status, unkeep(hit.headers), hit.body);
    }
  }
  try {
    const r = await ask(hit, validator);
    return answer(r.status, r.headers, r.buf);
  } catch {
    return new Response("Busy. Please try again in a moment.", { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  }
}

/**
 * relynked.com/<handle> itself. Shared by functions/[handle].js and functions/[handle]/[[rest]].js: Pages lets the
 * optional catch-all [[rest]] answer a bare /<handle> (with an empty rest) ahead of [handle].js, so both call this.
 *
 * The site's own files always win, and not by asking the site first: Cloudflare Pages answers any path it has no
 * file for with the home page (200), so "was it a 404?" can never tell. _routes.json (scripts/build-shop-routes.mjs,
 * run before every deploy) keeps every file and folder the site has out of the functions, and NOT_A_PAGE keeps the
 * reserved words out. What reaches here is a name no file has.
 */
export async function servePage(context) {
  const raw = String(context.params.handle || "");
  if (raw === SITEMAP_INDEX || raw.startsWith("sitemap-shop-")) return (await serveSitemap(context, raw)) || context.next();
  const handle = raw.toLowerCase();
  if (!shopsOn(context.env) || !isHandle(handle)) return context.next();
  if (raw !== handle) return Response.redirect(new URL(`/${handle}` + new URL(context.request.url).search, context.request.url).toString(), 301);
  // A TikTok link or ad (API 0614): its ref, read here on the server, asked for while the page itself is fetched.
  const [ref, page] = await Promise.all([context.request.method === "GET" ? refFor(context, handle) : Promise.resolve(null), toApi(context, `/shop-pages/${handle}`)]);
  return ref ? withRef(page, ref) : page;
}

/*
 * TIKTOK, READ ON THE SERVER (API 0614, server/api/src/came-from/tiktok.ts). No pixel, no script of TikTok's, nothing
 * kept here.
 *
 *   relynked.com/<handle>?r=K7Q4M   a counted TikTok link (bio or video): the code goes on the page as it is.
 *   relynked.com/<handle>?utm_source=tiktok&utm_campaign=...&ttclid=...   a TikTok ad: only the values below are
 *                                   posted to the API (server to server, with the proxy secret), which keeps the tap
 *                                   and answers its 8 character token; the campaign's counted link is made only when
 *                                   a customer's first WhatsApp message claims it.
 *
 * The page itself is the same kept page for everyone; the ref is written onto its <body> as data-cf for this one
 * answer (HTMLRewriter), which is then never kept anywhere. The page's script ends the WhatsApp first line with
 * "(ref CODE)". With no answer in time, or any refusal, the page is served exactly as before.
 */
const REF_SET = "A-HJKMNP-Z2-9";
const LINK_CODE = new RegExp(`^[${REF_SET}]{5}$`);
const TAP_TOKEN = new RegExp(`^[${REF_SET}]{8}$`);
/** The query values TikTok's ads carry that the API reads. Nothing else of the address leaves here. */
export const TIKTOK_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_id", "campaign_id", "aid", "adgroup_id", "cid", "creative_id", "ttclid"];
const MAX_VALUE = 1000;
const ARRIVAL_WAIT_MS = 1500;

/** A ref the page may carry: a counted link's code, or a TikTok ad tap's 8 character token. Pure. */
export function isPageRef(v) {
  return typeof v === "string" && (LINK_CODE.test(v) || TAP_TOKEN.test(v)) && /[A-Z]/.test(v);
}

/** The TikTok values in a page address, or null when it is not from a TikTok ad. Pure. */
export function tiktokQuery(url) {
  const q = new URL(url).searchParams;
  const source = (q.get("utm_source") || "").trim().toLowerCase();
  if (source !== "tiktok" && !q.get("ttclid")) return null;
  const out = {};
  for (const k of TIKTOK_KEYS) {
    const v = q.get(k);
    if (typeof v === "string" && v.length > 0 && v.length <= MAX_VALUE) out[k] = v;
  }
  return out;
}

/** The ref for this visit: ?r= for a TikTok link, else the API's answer for a TikTok ad, else null. */
export async function refFor(context, handle) {
  const { request, env } = context;
  const url = new URL(request.url);
  const r = (url.searchParams.get("r") || "").trim().toUpperCase();
  if (LINK_CODE.test(r) && /[A-Z]/.test(r)) return r;
  const q = tiktokQuery(request.url);
  if (!q) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ARRIVAL_WAIT_MS);
  try {
    const res = await fetch(`${env.SHOP_PAGES_API}/shop-pages/${handle}/arrival`, {
      method: "POST",
      headers: { "x-relynked-proxy": env.SHOP_PAGES_PROXY_SECRET, "x-relynked-client-ip": visitorOf(request, env), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ q }),
      redirect: "manual",
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j && isPageRef(j.ref) ? j.ref : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The page with data-cf="<ref>" on its <body>, for this answer only: never kept by the edge or the browser. */
export function withRef(page, ref) {
  if (page.status !== 200 || !/text\/html/.test(page.headers.get("content-type") || "") || !isPageRef(ref)) return page;
  const headers = new Headers(page.headers);
  headers.set("cache-control", "private, no-store");
  const out = new Response(page.body, { status: page.status, headers });
  return new HTMLRewriter().on("body", { element(el) { el.setAttribute("data-cf", ref); } }).transform(out);
}

/** The sitemap index's own name, at the top of the site (robots.txt names it). */
export const SITEMAP_INDEX = "sitemap-index.xml";
const SHOP_SITEMAP = /^sitemap-shop-([a-z0-9][a-z0-9-]{1,28}[a-z0-9])\.xml$/;

/** The index with the site's own sitemap only: what /sitemap-index.xml says while shop pages are off or the API cannot answer. Pure. */
export function siteOnlyIndex(origin) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>${origin}/sitemap.xml</loc></sitemap>\n</sitemapindex>\n`;
}

const xmlAnswer = (body, cacheControl, method) =>
  new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": cacheControl, "x-robots-tag": "noindex", "x-content-type-options": "nosniff", "strict-transport-security": "max-age=31536000" },
  });

/**
 * relynked.com/sitemap-index.xml and relynked.com/sitemap-shop-<handle>.xml, from the API (kept at the edge ten
 * minutes, as the API says). The index always answers: with shop pages off, or the API down or saying no, it lists
 * the site's own sitemap only. A shop's sitemap answers only while shop pages are on; null means "not a sitemap".
 */
export async function serveSitemap(context, seg) {
  const { request, env } = context;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const origin = new URL(request.url).origin;
  if (seg === SITEMAP_INDEX) {
    if (!shopsOn(env)) return xmlAnswer(siteOnlyIndex(origin), "public, max-age=3600", request.method);
    try {
      const r = await toApi(context, "/shop-pages/sitemap-index.xml");
      if (r.status === 200 && /xml/.test(r.headers.get("content-type") || "")) return r;
    } catch {
      // The API is not answering: the site's own sitemap is still worth reading.
    }
    return xmlAnswer(siteOnlyIndex(origin), "public, max-age=300", request.method);
  }
  const m = SHOP_SITEMAP.exec(seg);
  if (!m || !shopsOn(env) || !isHandle(m[1])) return null;
  return toApi(context, `/shop-pages/${m[1]}/sitemap.xml`);
}
