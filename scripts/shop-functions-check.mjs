/**
 * The shop page functions' routing and safety rules, with no network and no Cloudflare: a fake API and a fake edge
 * cache drive functions/[handle].js, functions/[handle]/[[rest]].js and functions/s/[code].js as Pages would call them.
 *
 *   node scripts/shop-functions-check.mjs
 *
 * Holds: everything is off unless SHOP_PAGES_ENABLED is exactly "true" with an https API and a long secret; the site's
 * own pages, files and folders are never a shop (by _routes.json, which must be up to date, and by name); a handle
 * goes to the API with the secret and the visitor's address and nothing else of the visitor's; capital letters
 * redirect; only a page's own photos, its report page and its cart (POST) pass under its name; the short link takes
 * only a real code; the subdomain Worker's word for the visitor counts only with its secret; carts and reports are
 * small and typed; the visitor gets the API's safe headers plus HSTS and nothing else.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isHandle, NOT_A_PAGE, shopsOn } from "../functions/_shop.js";
import { onRequest as page } from "../functions/[handle].js";
import { onRequest as rest } from "../functions/[handle]/[[rest]].js";
import { onRequest as short } from "../functions/s/[code].js";
import { shopRoutes } from "./build-shop-routes.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
let passed = 0;
const ok = (c, n, d = "") => {
  if (c) passed++;
  else failed++;
  console.log(`  ${c ? "ok  " : "FAIL"}  ${n}${c || !d ? "" : "  (" + d + ")"}`);
};

// The edge cache: empty each time (the cache itself is shop-edge-check.mjs's).
globalThis.caches = { default: { match: async () => undefined, put: async () => undefined } };

// The API: records what it was asked, answers with a page and some headers the visitor must never see.
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init, headers: new Headers(init.headers || {}) });
  return new Response("<html>from the api</html>", {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
      "set-cookie": "session=1",
      "x-powered-by": "api",
      "x-relynked-proxy": "echo",
    },
  });
};

const SECRET = "p".repeat(40);
const WORKER = "w".repeat(40);
const ON = { SHOP_PAGES_ENABLED: "true", SHOP_PAGES_API: "https://api.example.com", SHOP_PAGES_PROXY_SECRET: SECRET, SHOP_WORKER_SECRET: WORKER };
const NEXT = "the site's own file";

/** Calls a function as Pages would, with the params its file name gives. */
async function call(fn, path, { env = ON, params, method = "GET", headers = {}, body } = {}) {
  calls.length = 0;
  const request = new Request(`https://relynked.com${path}`, { method, headers: { "cf-connecting-ip": "203.0.113.7", ...headers }, body });
  let nexted = false;
  const context = {
    request,
    env,
    params: params ?? {},
    waitUntil: () => {},
    next: async () => {
      nexted = true;
      return new Response(NEXT, { status: 200 });
    },
  };
  const res = await fn(context);
  return { res, nexted, calls: [...calls], text: await res.text() };
}
const segs = (path) => path.split("/").filter(Boolean);
const asPage = (path, o = {}) => call(page, path, { ...o, params: { handle: segs(path)[0] } });
const asRest = (path, o = {}) => call(rest, path, { ...o, params: { handle: segs(path)[0], rest: segs(path).slice(1) } });
const asShort = (code, o = {}) => call(short, `/s/${code}`, { ...o, params: { code } });

console.log("Off unless switched on and configured");
ok(!shopsOn({}), "no settings: off");
ok(!shopsOn({ ...ON, SHOP_PAGES_ENABLED: "TRUE" }) && !shopsOn({ ...ON, SHOP_PAGES_ENABLED: "1" }), "SHOP_PAGES_ENABLED must be exactly true");
ok(!shopsOn({ ...ON, SHOP_PAGES_API: "http://api.example.com" }) && !shopsOn({ ...ON, SHOP_PAGES_API: "https://api.example.com/x" }) && !shopsOn({ ...ON, SHOP_PAGES_API: "https://api.example.com:8443" }), "the API must be a bare https origin");
ok(!shopsOn({ ...ON, SHOP_PAGES_PROXY_SECRET: "s".repeat(31) }), "the proxy secret must be 32 characters or more");
ok(shopsOn(ON), "all three set: on");
for (const [what, fn] of [["a handle", () => asPage("/mama-put", { env: {} })], ["a photo", () => asRest(`/mama-put/photo/${"0".repeat(8)}-0000-0000-0000-${"0".repeat(12)}-t.jpg`, { env: {} })], ["a short link", () => asShort("abcdefg", { env: {} })]]) {
  const r = await fn();
  ok(r.nexted && r.calls.length === 0, `off: ${what} goes on to the site's files, the API is never asked`);
}

console.log("\nThe site's own names are never a shop");
const routes = shopRoutes(root);
let committed = null;
try {
  committed = JSON.parse(readFileSync(join(root, "_routes.json"), "utf8"));
} catch {
  committed = null;
}
ok(JSON.stringify(committed) === JSON.stringify(routes), "_routes.json is up to date (node scripts/build-shop-routes.mjs)");
ok(routes.include.length + routes.exclude.length <= 100, "within Cloudflare's 100 rules", String(routes.include.length + routes.exclude.length));
const topNames = [...new Set(routes.exclude.map((r) => r.replace(/^\//, "").replace(/\/\*$/, "").replace(/\.html$/, "")).filter(Boolean))];
const missing = topNames.filter((n) => isHandle(n));
ok(missing.length === 0, "every page, file and folder at the top of the site is also on the never-a-shop list (in case _routes.json is ever stale)", missing.join(", "));
for (const name of ["faq", "console", "pricing", "privacy", "data-deletion", "dashboard", "industries", "assets", "api", "o", "s"]) {
  const r = await asPage(`/${name}`);
  ok(r.nexted && r.calls.length === 0, `/${name} goes on to the site, never to the API`);
}
for (const name of ["www", "app", "staff", "admin", "login", "staging", "preview", "floor", "kitchen", "report", "remy", "relynked"]) ok(NOT_A_PAGE.has(name), `${name} is never a shop`);
for (const bad of ["ab", "-bad", "bad-", "x--y", "12345", "has_underscore", "a".repeat(31), "with.dot"]) ok(!isHandle(bad), `${JSON.stringify(bad)} cannot be a handle`);
ok(isHandle("mama-put") && isHandle("abc") && isHandle("shop-24"), "mama-put, abc and shop-24 can");

console.log("\nA handle");
const p = await asPage("/mama-put", { headers: { cookie: "a=b", referer: "https://elsewhere.example/", authorization: "Bearer x" } });
const asked = p.calls[0];
ok(p.res.status === 200 && p.text === "<html>from the api</html>", "/mama-put is the API's page");
ok(asked?.url === "https://api.example.com/shop-pages/mama-put", "asked at /shop-pages/<handle>", asked?.url);
ok(asked?.headers.get("x-relynked-proxy") === SECRET && asked?.headers.get("x-relynked-client-ip") === "203.0.113.7", "with the proxy secret and the visitor's address");
ok(!asked?.headers.get("cookie") && !asked?.headers.get("referer") && !asked?.headers.get("authorization"), "and nothing else of the visitor's: no cookie, referrer or authorization");
ok(!p.res.headers.get("set-cookie") && !p.res.headers.get("x-powered-by") && !p.res.headers.get("x-relynked-proxy"), "the visitor gets no cookie and no other header of the API's");
ok(p.res.headers.get("content-security-policy") === "default-src 'none'" && p.res.headers.get("x-content-type-options") === "nosniff" && /max-age=\d{7,}/.test(p.res.headers.get("strict-transport-security") || ""), "the API's policy and nosniff, plus HSTS");
const bare = await asRest("/mama-put");
ok(bare.calls[0]?.url === "https://api.example.com/shop-pages/mama-put", "a bare /<handle> reaching the catch-all is the same page");
const upper = await asPage("/Mama-Put");
ok(upper.res.status === 301 && upper.res.headers.get("location") === "https://relynked.com/mama-put" && upper.calls.length === 0, "capital letters redirect to the lower case address", `${upper.res.status} ${upper.res.headers.get("location")}`);
const del = await asPage("/mama-put", { method: "DELETE" });
ok(del.res.status === 405 && del.calls.length === 0, "a method other than GET, HEAD or POST is refused");

console.log("\nUnder a handle");
const PHOTO = `${"a".repeat(8)}-bbbb-cccc-dddd-${"e".repeat(12)}-l.jpg`;
const ph = await asRest(`/mama-put/photo/${PHOTO}`);
ok(ph.calls[0]?.url === `https://api.example.com/shop-pages/mama-put/photo/${PHOTO}`, "its own photo goes to the API");
for (const odd of ["/mama-put/photo/evil.jpg", "/mama-put/photo/../../app", "/mama-put/photo", "/mama-put/admin", "/mama-put/report/x", "/pricing/report"]) {
  const r = await asRest(odd);
  ok(r.nexted && r.calls.length === 0, `${odd} goes on to the site, never to the API`);
}
const VID = `${"a".repeat(8)}-bbbb-cccc-dddd-${"e".repeat(12)}`;
const vid = await asRest(`/mama-put/video/${VID}`);
ok(vid.calls[0]?.url === `https://api.example.com/shop-pages/mama-put/video/${VID}` && vid.calls[0]?.init.redirect === "manual", "its own video goes to the API, whose redirect is passed back, not followed");
for (const oddv of [`/mama-put/video/${VID}.mp4`, "/mama-put/video/evil", "/mama-put/video", `/mama-put/video/${VID}/x`]) {
  const r = await asRest(oddv);
  ok(r.nexted && r.calls.length === 0, `${oddv} goes on to the site, never to the API`);
}
const rep = await asRest("/mama-put/report");
ok(rep.calls[0]?.url === "https://api.example.com/shop-pages/mama-put/report", "the report page goes to the API");
const orderGet = await asRest("/mama-put/order");
ok(orderGet.nexted && orderGet.calls.length === 0, "the cart address answers POST only");
const order = await asRest("/mama-put/order", { method: "POST", headers: { "content-type": "application/json", cookie: "a=b" }, body: '{"lines":[]}' });
ok(order.calls[0]?.url === "https://api.example.com/shop-pages/mama-put/order" && order.calls[0]?.init.method === "POST" && order.calls[0]?.init.body === '{"lines":[]}', "a cart is passed to the API as it came");
ok(order.calls[0]?.headers.get("x-relynked-proxy") === SECRET && !order.calls[0]?.headers.get("cookie"), "with the secret and without the visitor's cookie");
const odd = await asRest("/mama-put/report", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
ok(odd.res.status === 415 && odd.calls.length === 0, "a report in an odd format is refused at the edge");
const big = await asRest("/mama-put/report", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "note=" + "x".repeat(5000) });
ok(big.res.status === 413 && big.calls.length === 0, "a report over 4 KB is refused at the edge");

console.log("\nThe short link");
const s1 = await asShort("abc2def");
ok(s1.calls[0]?.url === "https://api.example.com/shop-pages/s/abc2def", "a real code goes to the API");
for (const bad of ["abc", "ABCDEFG", "abcdef1", "abcdefgh", "abc-def"]) {
  const r = await asShort(bad);
  ok(r.nexted && r.calls.length === 0, `/s/${bad} goes on to the site`);
}

console.log("\nWho the visitor is");
const viaWorker = await asPage("/mama-put", { headers: { "x-relynked-worker": WORKER, "x-relynked-visitor": "198.51.100.4" } });
ok(viaWorker.calls[0]?.headers.get("x-relynked-client-ip") === "198.51.100.4", "the subdomain Worker's word counts when it carries its secret");
const forged = await asPage("/mama-put", { headers: { "x-relynked-worker": "w".repeat(39) + "x", "x-relynked-visitor": "198.51.100.4" } });
ok(forged.calls[0]?.headers.get("x-relynked-client-ip") === "203.0.113.7", "a wrong Worker secret is ignored: the request's own address counts");
const noWorker = await asPage("/mama-put", { env: { ...ON, SHOP_WORKER_SECRET: "" }, headers: { "x-relynked-worker": "", "x-relynked-visitor": "198.51.100.4" } });
ok(noWorker.calls[0]?.headers.get("x-relynked-client-ip") === "203.0.113.7", "with no Worker secret set, the visitor header is ignored");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
