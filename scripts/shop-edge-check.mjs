/**
 * The shop page function's edge cache, with no network and no Cloudflare: a fake edge cache, a fake API and a fake
 * clock drive functions/_shop.js.
 *
 *   node scripts/shop-edge-check.mjs
 *
 * Holds: a burst on a cold page is ONE request to the API; a fresh page costs the API nothing; a page a little past
 * fresh is served at once and asked again with its ETag (a 304 with no body when unchanged); a changed page shows within
 * the stale window; a page left alone longer than that is never served stale; the visitor gets the API's own headers and
 * none of the edge's; a photo is kept for good; a 404 is kept only briefly; carts pass through uncached.
 */
import { toApi, edgeRule, MAX_STALE_S } from "../functions/_shop.js";

let failed = 0;
const ok = (c, n, d = "") => {
  if (!c) failed++;
  console.log(`  ${c ? "ok  " : "FAIL"}  ${n}${c || !d ? "" : "  (" + d + ")"}`);
};

// A clock we move by hand.
let now = 1_000_000;
Date.now = () => now;

// The edge cache: keeps an entry for the max-age it is given.
const store = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const e = store.get(req.url);
      if (!e || now >= e.expires) return undefined;
      return new Response(e.buf.slice(0), { status: e.status, headers: e.headers });
    },
    async put(req, res) {
      const m = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
      store.set(req.url, { expires: now + (m ? Number(m[1]) : 0) * 1000, status: res.status, headers: [...res.headers], buf: await res.arrayBuffer() });
    },
  },
};

// The API: one page whose words we can change, a photo, a 404.
let html = "<html>shop v1</html>";
let version = 1;
const calls = { page: 0, page304: 0, photo: 0, gone: 0, post: 0 };
const SAFE = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()",
};
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const h = new Headers(init.headers || {});
  if (init.method === "POST") {
    calls.post++;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (u.pathname.endsWith("/photo/p.jpg")) {
    calls.photo++;
    return new Response("jpegbytes", { status: 200, headers: { ...SAFE, "content-type": "image/jpeg", "cache-control": "public, max-age=86400", "set-cookie": "x=1" } });
  }
  if (u.pathname.endsWith("/nope")) {
    calls.gone++;
    return new Response("gone", { status: 404, headers: { ...SAFE, "content-type": "text/html", "cache-control": "public, max-age=0, s-maxage=5" } });
  }
  calls.page++;
  const etag = `"v${version}"`;
  const cc = "public, max-age=0, s-maxage=2, stale-while-revalidate=3";
  if (h.get("if-none-match") === etag) {
    calls.page304++;
    return new Response(null, { status: 304, headers: { ...SAFE, "cache-control": cc, etag } });
  }
  await new Promise((r) => setTimeout(r, 5)); // the API takes a moment
  return new Response(html, { status: 200, headers: { ...SAFE, "content-type": "text/html; charset=utf-8", "cache-control": cc, etag, "set-cookie": "x=1", "x-secret": "1" } });
};

const env = { SHOP_PAGES_ENABLED: "true", SHOP_PAGES_API: "https://api.example.com", SHOP_PAGES_PROXY_SECRET: "s".repeat(40) };
const pending = [];
const go = async (path, init = {}) => {
  const request = new Request(`https://relynked.com${path}`, init);
  const context = { request, env, params: {}, waitUntil: (p) => pending.push(p), next: () => new Response("site", { status: 200 }) };
  const res = await toApi(context, `/shop-pages${path}`);
  return { res, text: await res.text() };
};
const settle = async () => {
  await Promise.all(pending.splice(0));
};

console.log("edgeRule");
ok(JSON.stringify(edgeRule("public, max-age=0, s-maxage=2, stale-while-revalidate=3")) === '{"fresh":2,"stale":3}', "a page: 2 seconds fresh, 3 stale");
ok(edgeRule("public, max-age=0, s-maxage=2, stale-while-revalidate=300").stale === MAX_STALE_S, "the stale window is capped whatever the API says", MAX_STALE_S);
ok(JSON.stringify(edgeRule("public, max-age=86400")) === '{"fresh":86400,"stale":0}', "a photo: for a day, never stale");
ok(edgeRule("no-store") === null && edgeRule("private, max-age=60") === null && edgeRule("public, max-age=0") === null, "no-store, private and max-age=0 are not kept");

console.log("\nA burst on a cold page");
const burst = await Promise.all(Array.from({ length: 200 }, () => go("/mama")));
ok(calls.page === 1, "200 visitors at once are ONE request to the API", `API saw ${calls.page}`);
ok(burst.every((b) => b.text === "<html>shop v1</html>" && b.res.status === 200), "every one of them got the page");
const first = burst[0].res;
ok(first.headers.get("cache-control") === "public, max-age=0, s-maxage=2, stale-while-revalidate=3", "the browser is given the API's rule", first.headers.get("cache-control"));
ok(!first.headers.get("set-cookie") && !first.headers.get("x-secret") && !first.headers.get("etag"), "no cookie, no secret header and no ETag reach the visitor");
ok([...first.headers.keys()].every((k) => !k.startsWith("x-shop-")), "none of the edge's own bookkeeping reaches the visitor");
ok(
  first.headers.get("x-frame-options") === "DENY" &&
    first.headers.get("content-security-policy") === "default-src 'none'" &&
    first.headers.get("x-content-type-options") === "nosniff" &&
    /max-age=\d{7,}/.test(first.headers.get("strict-transport-security") || ""),
  "the security headers and the policy are all there, with HSTS",
);

console.log("\nFresh");
now += 1500;
const calm = await Promise.all(Array.from({ length: 200 }, () => go("/mama")));
ok(calls.page === 1 && calm.every((b) => b.text === "<html>shop v1</html>"), "200 more within 2 seconds cost the API nothing", `API saw ${calls.page}`);

console.log("\nA little past fresh, nothing changed");
now += 1000; // 2.5 s since kept
const late = await go("/mama");
await settle();
ok(late.text === "<html>shop v1</html>", "the visitor gets the kept page at once");
ok(calls.page === 2 && calls.page304 === 1, "the API was asked again, and said 304 (no body)", JSON.stringify(calls));
now += 1000;
await go("/mama");
ok(calls.page === 2, "and the page is fresh again for 2 seconds");

console.log("\nA change shows within the stale window");
html = "<html>shop v2</html>";
version = 2;
now += 2500;
const stale = await go("/mama");
await settle();
ok(stale.text === "<html>shop v1</html>", "the first visitor past fresh still gets the kept page");
const next = await go("/mama");
ok(next.text === "<html>shop v2</html>", "the next visitor sees the change", next.text);
ok(calls.page === 3 && calls.page304 === 1, "one request carried it, with a body because the page changed", JSON.stringify(calls));

console.log("\nLeft alone longer than the stale window");
html = "<html>shop v3</html>";
version = 3;
now += (2 + MAX_STALE_S + 1) * 1000;
const cold = await go("/mama");
ok(cold.text === "<html>shop v3</html>", "a page older than fresh plus stale is never served: the visitor waits for the new one", cold.text);
now += (2 + MAX_STALE_S + 1) * 1000;
const again = await go("/mama");
await settle();
ok(again.text === "<html>shop v3</html>" && calls.page304 === 2, "unchanged after a long quiet spell: asked with the ETag, 304, no body", JSON.stringify(calls));

console.log("\nPhotos, a missing page and carts");
await go("/mama/photo/p.jpg");
now += 3600_000;
const ph = await go("/mama/photo/p.jpg");
ok(calls.photo === 1 && ph.res.headers.get("cache-control") === "public, max-age=86400" && !ph.res.headers.get("set-cookie"), "a photo is kept for good (an hour later, still one request)");
await go("/nope");
now += 2000;
await go("/nope");
ok(calls.gone === 1, "a 404 is kept a few seconds");
now += 6000;
await go("/nope");
await settle();
ok(calls.gone === 2, "and asked again after them, so a page just published is live within seconds");
const posted = await go("/mama/order", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
await go("/mama/order", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok(calls.post === 2 && posted.res.status === 200, "carts pass through every time, never kept");

console.log("\nHEAD and a down API");
const head = await go("/mama", { method: "HEAD" });
ok(head.text === "" && head.res.status === 200, "HEAD answers with no body");
globalThis.fetch = async () => {
  throw new Error("down");
};
store.clear();
const down = await go("/mama");
ok(down.res.status === 503 && down.res.headers.get("retry-after") === "5" && down.res.headers.get("cache-control") === "no-store", "an API that is down gives a polite 503, kept nowhere");

console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
process.exit(failed ? 1 : 0);
