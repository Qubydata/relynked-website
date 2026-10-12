/**
 * End to end check of the shop pages on a deployed copy of the website (the preview, never production by default).
 *
 *   node scripts/shop-e2e.mjs [--base https://shop-staging.relynked-3wg.pages.dev] [--handle mama-put-kitchen] [--code 5km4yrr]
 *
 * Run it once the test server has SHOP_PAGES_ENABLED=true, SHOP_PAGES_BASE_URL (the preview address) and the shared
 * SHOP_PAGES_PROXY_SECRET. It only reads, except one deliberately bad report and one nonsense cart (both refused, nothing kept).
 * Exit code 0 when every check passes, 1 otherwise. Needs Node 18 or newer and nothing else.
 *
 * What it checks: the page (products, hot deal, the category sections and tabs built from what the shop stocks, the
 * footer link, no ads or outside scripts), the redesign (search in the header, the order sheet, the cart sent for its
 * Ref, light by default, Top sellers only with a ranking, a nonsense cart refused), the security headers on the page, a photo, the report page and the short
 * link; a refused report; the site's own pages still served as before; reserved names and an unknown name never
 * showing a shop; capital letters redirecting.
 */
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://shop-staging.relynked-3wg.pages.dev").replace(/\/+$/, "");
const HANDLE = arg("handle", "mama-put-kitchen");
const CODE = arg("code", "5km4yrr");
if (/^https:\/\/(www\.)?relynked\.com$/.test(BASE) && !process.argv.includes("--allow-production")) {
  console.error("That is the production site. Pass --allow-production if you really mean it.");
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond, name, detail = "") => {
  if (cond) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? "  (" + detail + ")" : ""}`);
  }
};
const get = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { redirect: "manual", ...opts });
  const text = await res.text();
  return { res, text, status: res.status, h: (n) => res.headers.get(n) || "" };
};
const SHOP_MARKERS = ["Report this page", 'data-a="add"']; // the footer "Made with Relynked" also shows on the not-found page, so it is not a shop marker
const showsShop = (text) => SHOP_MARKERS.some((m) => text.includes(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PHOTO = /\/[a-z0-9-]+\/photo\/[0-9a-f-]{36}-[tl]\.jpg/;

console.log(`Shop page end to end check\n  site   ${BASE}\n  shop   /${HANDLE}   short /s/${CODE}\n`);

// 1. The page.
console.log("The page");
const page = await get(`/${HANDLE}`);
ok(page.status === 200, "page answers 200", `got ${page.status}; is the test server's SHOP_PAGES_ENABLED true?`);
ok(/text\/html/.test(page.h("content-type")), "page is HTML");
const body = page.text;
ok(body.includes("Mama Put Kitchen"), "the shop's name is on the page");
for (const item of ["Jollof Rice", "Fried Rice", "Pounded Yam and Egusi", "Asun", "Zobo", "Puff Puff"]) ok(body.includes(item), `product listed: ${item}`);
ok(body.includes("Hot deals") && body.indexOf("Hot deals") < body.indexOf("Fried Rice"), "hot deals strip comes before the lists");
ok(body.includes("Weekend special"), "the hot deal's label shows");
ok(/2,000/.test(body) && /2,500/.test(body), "deal price 2,000 and the old price 2,500 both show");
for (const cat of ["Drinks", "Mains", "Protein", "Sides"]) ok(new RegExp(`<h2>${cat}\\b`).test(body), `category section built from the stock: ${cat}`);
ok((body.match(/data-t="s\d+"/g) || []).length >= 4, "category filter tabs are there", "expected one per category");
ok(body.includes("Get your own shop page free"), "footer: Get your own shop page free");
ok(body.includes(`/${HANDLE}/report`), "footer: report link");
ok(body.includes("wa.me/"), "the WhatsApp order button points at WhatsApp");
ok(!/adsbygoogle|googlesyndication|doubleclick|adservice|<iframe|banner-ad|sponsored/i.test(body), "no ads or frames");
const outside = [...body.matchAll(/<(?:script|img|link)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"/gi)].map((m) => m[1]).filter((u) => !u.includes("relynked"));
ok(outside.length === 0, "no scripts, images or styles loaded from other sites", outside.slice(0, 2).join(" "));
ok(!/[–—]/.test(body), "no em or en dashes in the page");

// 1b. The redesign (backend feat/shop-page-design): pinned header with search, Top sellers only with a real ranking,
// the cart and order sheet, the cart posted to this site for the Ref, light by default.
console.log("\nThe page design");
ok(/<input id="sq" type="search"[^>]*aria-label="Search /.test(body), "the header has a search field");
ok(/<section class="sheet" id="sheet" role="dialog" aria-label="Your (order|booking)"/.test(body), "the cart opens an order sheet");
ok(/Nothing is paid on this page\./.test(body), "the sheet says nothing is paid on the page");
ok(body.includes(`data-order="/${HANDLE}/order"`), "the cart is sent to this site for the Ref", "no data-order on the page");
ok(/:root\{[^}]*--bg:#fff;[^}]*color-scheme:light\}/.test(body) && /:root\.dk\{[^}]*color-scheme:dark\}/.test(body), "light by default, dark only when chosen");
const topSection = /<section class="top" id="top">/.test(body);
const topTab = />Top sellers</.test(body.replace(/<section class="top"[\s\S]*?<\/section>/, ""));
ok(topSection === topTab, "Top sellers tab and row come together (shown only with a real ranking)", `row ${topSection}, tab ${topTab}`);
const badOrder = await get(`/${HANDLE}/order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lines: "nonsense" }) });
ok(badOrder.status === 400 && !/"ref"/.test(badOrder.text), "a nonsense cart is refused and gets no Ref (nothing kept)", `got ${badOrder.status}`);
ok(/no-store/.test(badOrder.h("cache-control")), "the order answer is never cached", badOrder.h("cache-control"));
const noShopOrder = await get(`/no-such-shop-${Date.now()}/order`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok(noShopOrder.status === 404, "an order to a shop that does not exist is a 404", `got ${noShopOrder.status}`);

// 2. Headers on the page.
console.log("\nHeaders on the page");
const csp = page.h("content-security-policy");
ok(csp.includes("default-src 'none'"), "CSP: default-src 'none'");
ok(/script-src 'sha256-[^']+'/.test(csp), "CSP: script only by hash");
ok(csp.includes("frame-ancestors 'none'"), "CSP: nothing may frame it");
ok(csp.includes("img-src 'self'"), "CSP: images from this site only");
ok(page.h("x-content-type-options") === "nosniff", "nosniff");
ok(page.h("x-frame-options") === "DENY", "X-Frame-Options DENY");
ok(/strict-origin/.test(page.h("referrer-policy")), "referrer policy");
ok(/camera=\(\)/.test(page.h("permissions-policy")), "permissions policy");
ok(/max-age=\d{7,}/.test(page.h("strict-transport-security")), "HSTS");
ok(/public/.test(page.h("cache-control")), "cache rule is public (a few seconds at the edge)", page.h("cache-control"));
ok(/noindex/.test(page.h("x-robots-tag")) || !page.h("x-robots-tag"), "indexing header is sane", page.h("x-robots-tag"));
ok(!page.h("set-cookie"), "no cookies set");

// 3. Photos (the first visit makes the web sized copies, so look again for a short while).
console.log("\nPhotos");
let photo = (body.match(PHOTO) || [])[0] || null;
for (let i = 0; i < 8 && !photo; i++) {
  await sleep(6000);
  const again = await get(`/${HANDLE}?r=${i}`);
  photo = (again.text.match(PHOTO) || [])[0] || null;
}
ok(!!photo, "the page carries a product photo (made after the first visit)");
if (photo) {
  const p = await get(photo);
  ok(p.status === 200 && p.h("content-type") === "image/jpeg", "photo is a JPEG", `${p.status} ${p.h("content-type")}`);
  ok(p.h("content-security-policy").includes("default-src 'none'"), "photo carries its own locked policy");
  ok(p.h("x-content-type-options") === "nosniff", "photo nosniff");
}
const badPhoto = await get(`/${HANDLE}/photo/00000000-0000-0000-0000-000000000000-t.jpg`);
ok(!/image\/jpeg/.test(badPhoto.h("content-type")) && !showsShop(badPhoto.text), "a photo that is not this page's is not served", String(badPhoto.status));

// 4. The permanent short link.
console.log("\nShort link");
const short = await get(`/s/${CODE}`);
const target = short.h("location");
ok((short.status === 302 && target.endsWith(`/${HANDLE}`)) || (short.status === 200 && short.text.includes("Mama Put Kitchen")), "short link leads to the page", `${short.status} ${target}`);
const badShort = await get("/s/zzzzzzz");
ok(badShort.status === 404 && !showsShop(badShort.text), "a short link that does not exist is not a shop", String(badShort.status));

// 5. Report page.
console.log("\nReport page");
const rep = await get(`/${HANDLE}/report`);
ok(rep.status === 200 && /<form[^>]*method="post"/i.test(rep.text), "report page has a form");
ok(/noindex/.test(rep.h("x-robots-tag")), "report page is noindex");
ok(rep.h("content-security-policy").includes("script-src 'none'"), "report page runs no script");
const badReport = await get(`/${HANDLE}/report`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "reason=not-a-reason&note=x" });
ok(badReport.status === 400, "a report with no real reason is refused (nothing filed)", String(badReport.status));
const oddReport = await get(`/${HANDLE}/report`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x" });
ok(oddReport.status === 415, "a report in an odd format is refused", String(oddReport.status));

// 6. Reserved and unknown names never show a shop.
console.log("\nReserved and unknown names");
for (const name of ["www", "app", "staff", "api", "simple", "staging", "admin", "floor", "kitchen", "preview", "report", "login"]) {
  const r = await get(`/${name}`);
  ok(!showsShop(r.text) && r.status < 500, `/${name} is not a shop`, String(r.status));
}
const unknown = await get(`/zzz-not-a-shop-${Date.now().toString(36)}`);
ok(unknown.status === 404 && !showsShop(unknown.text), "an unknown name is a 404 and shows no shop", String(unknown.status));
ok(/noindex/.test(unknown.h("x-robots-tag")), "an unknown name is noindex");
const upper = await get(`/${HANDLE.toUpperCase()}`);
ok(upper.status === 301 && upper.h("location").endsWith(`/${HANDLE}`), "capital letters redirect to the lower case address", `${upper.status} ${upper.h("location")}`);

// 7. The site itself is unchanged.
console.log("\nThe rest of the site");
for (const path of ["/", "/pricing", "/product", "/how-it-works", "/contact", "/privacy", "/terms", "/robots.txt"]) {
  const r = await get(path);
  ok(r.status === 200 && !showsShop(r.text), `${path} is served as before`, String(r.status));
}
const pricing = await get("/pricing");
ok(pricing.h("content-security-policy").includes("default-src 'self'"), "the site's own pages keep the site's CSP");
ok(pricing.h("x-frame-options") === "DENY" && /max-age=\d{7,}/.test(pricing.h("strict-transport-security")), "the site's own pages keep their security headers");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
