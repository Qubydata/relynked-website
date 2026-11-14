/**
 * End to end check of the shop pages on a deployed copy of the website (the preview, never production by default).
 *
 *   node scripts/shop-e2e.mjs --base <preview address> --handle <test shop handle> --code <its short link code>
 *        [--expect <file.json>] [--site-headers] [--listed] [--vocab <schemaorg-current-https.jsonld>]
 *        [--public-base <the API's SHOP_PAGES_BASE_URL, when it is not --base: a local run>]
 *
 * Nothing about the test server, the preview or the test shop is written in this public file: the addresses and the
 * handle come from the command line (or SHOP_E2E_BASE, SHOP_E2E_HANDLE and SHOP_E2E_CODE), and what the test shop
 * sells from --expect, a small JSON file kept with the test accounts, never in this repo:
 *
 *   { "name": "...", "products": ["...", "..."], "categories": ["...", "..."],
 *     "deal": { "label": "...", "price": "2,000", "oldPrice": "2,500" }, "combo": "..." }
 *
 * Every key is optional; a check whose key is missing is skipped and says so. --site-headers also checks that the
 * site's own pages carry the site's security headers (a deploy copy built with _headers). --listed says the test
 * shop's owner turned on "Let search and AI assistants read this page": then the page must be indexable with valid
 * schema.org structured data (checked by check-jsonld.mjs against schema.org's vocabulary, --vocab or downloaded once)
 * and its own sitemap; without it, the page must say noindex and carry none.
 *
 * Run it once the test server has SHOP_PAGES_ENABLED=true, SHOP_PAGES_BASE_URL (the preview address) and the shared
 * SHOP_PAGES_PROXY_SECRET. It only reads, except one deliberately bad report and one nonsense cart (both refused, nothing kept).
 * Exit code 0 when every check passes, 1 otherwise, 2 when it was not told where to look. Needs Node 18 or newer and nothing else.
 *
 * What it checks: the page (products, hot deal, the category sections and tabs built from what the shop stocks, the
 * footer link, no ads or outside scripts), the redesign (search in the header, the order sheet, the cart sent for its
 * Ref, light by default, Top sellers only with a ranking, a nonsense cart refused), the security headers on the page, a photo, the report page and the short
 * link; a refused report; the site's own pages still served as before; reserved names and an unknown name never
 * showing a shop; capital letters redirecting.
 */
import { readFileSync } from "node:fs";
import { jsonLdBlocks, readVocab, validateJsonLd } from "./check-jsonld.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = (arg("base", process.env.SHOP_E2E_BASE || "") || "").replace(/\/+$/, "");
const HANDLE = arg("handle", process.env.SHOP_E2E_HANDLE || "");
const CODE = arg("code", process.env.SHOP_E2E_CODE || "");
if (!/^https?:\/\/[^/]+$/.test(BASE) || !/^[a-z0-9-]{3,30}$/.test(HANDLE) || !/^[a-z0-9]{7}$/.test(CODE)) {
  console.error("Say where to look: node scripts/shop-e2e.mjs --base <preview address> --handle <test shop handle> --code <short link code> [--expect <file.json>]");
  process.exit(2);
}
if (/^https:\/\/(www\.)?relynked\.com$/.test(BASE) && !process.argv.includes("--allow-production")) {
  console.error("That is the production site. Pass --allow-production if you really mean it.");
  process.exit(2);
}
const EXPECT = (() => {
  const f = arg("expect", "");
  if (!f) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    console.error(`--expect ${f}: ${e.message}`);
    process.exit(2);
  }
})();
const SITE_HEADERS = process.argv.includes("--site-headers");
const LISTED = process.argv.includes("--listed");
const VOCAB = arg("vocab", "");
// The address the pages call their own (canonical, sitemaps): the preview itself on the staging run.
const PUBLIC = (arg("public-base", "") || BASE).replace(/\/+$/, "");

let failed = 0;
let passed = 0;
const skip = (name, why) => console.log(`  skip  ${name}  (${why})`);
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
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The page writes names HTML-escaped (an apostrophe is &#39;), so a name is looked for both ways.
const asHtml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const has = (t) => body.includes(t) || body.includes(asHtml(t));
if (EXPECT.name) ok(has(EXPECT.name), "the shop's name is on the page");
else skip("the shop's name is on the page", "no name in --expect");
const products = Array.isArray(EXPECT.products) ? EXPECT.products : [];
if (products.length) for (const item of products) ok(has(item), `product listed: ${item}`);
else skip("products listed", "no products in --expect");
const firstList = body.indexOf('<section id="s0"');
ok(!body.includes('id="hot"') || firstList < 0 || body.indexOf('id="hot"') < firstList, "hot deals strip, when there is one, comes before the lists");
if (EXPECT.deal) {
  ok(body.includes("Hot deals"), "the shop's hot deal makes a Hot deals strip");
  if (EXPECT.deal.label) ok(has(EXPECT.deal.label), "the hot deal's label shows");
  if (EXPECT.deal.price && EXPECT.deal.oldPrice) ok(body.includes(EXPECT.deal.price) && body.includes(EXPECT.deal.oldPrice), `deal price ${EXPECT.deal.price} and the old price ${EXPECT.deal.oldPrice} both show`);
} else skip("the hot deal", "no deal in --expect");
const cats = Array.isArray(EXPECT.categories) ? EXPECT.categories : [];
if (cats.length) for (const cat of cats) ok(new RegExp(`<h2>${esc(asHtml(cat))}\\b`).test(body), `category section built from the stock: ${cat}`);
else skip("category sections", "no categories in --expect");
ok((body.match(/data-t="s\d+"/g) || []).length >= Math.max(1, cats.length), "category filter tabs are there", "expected one per category");
ok(body.includes("Get your own shop page free"), "footer: Get your own shop page free");
ok(body.includes(`/${HANDLE}/report`), "footer: report link");
ok(body.includes("wa.me/"), "the WhatsApp order button points at WhatsApp");
ok(!/adsbygoogle|googlesyndication|doubleclick|adservice|<iframe|banner-ad|sponsored/i.test(body), "no ads or frames");
// What the page loads (a canonical or alternate link only names the address, it loads nothing).
const outside = [...body.matchAll(/<(?:script|img|link)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/gi)]
  .filter((m) => !/\brel="(?:canonical|alternate)"/i.test(m[0]))
  .map((m) => m[1])
  .filter((u) => !u.includes("relynked") && !u.startsWith(BASE + "/"));
ok(outside.length === 0, "no scripts, images or styles loaded from other sites", outside.slice(0, 2).join(" "));
ok(!/[\u2013\u2014]/.test(body), "no em or en dashes in the page");

// 1a. Combos (backend feat/shop-page-fast): every combo sits in its own Combos section and tab, right after Hot deals and
// Top sellers, whichever group it was saved in, once only. The test shop's combo (--expect "combo") is saved in Mains
// (with or without parts linked). Needs the test server on the build that has the Combos section.
console.log("\nCombos");
const topSectionEarly = /<section class="top" id="top">/.test(body);
const COMBO = EXPECT.combo || "";
const sectionOf = (id) => {
  const start = body.indexOf(`<section id="${id}" data-sec="${id}">`);
  return start < 0 ? "" : body.slice(start, body.indexOf("</section>", start) + 10);
};
if (!COMBO) {
  skip("combos", "no combo in --expect");
} else if (!body.includes(COMBO)) {
  ok(false, `the combo "${COMBO}" is on the page`);
} else {
  // The page in order: Hot deals, then Top sellers (when there is a ranking), then Combos, then the other groups.
  const groupIds = [...body.matchAll(/<section id="(s\d+)" data-sec="\1"><h2>([^<]+)</g)].map((m) => ({ id: m[1], title: m[2], at: m.index }));
  const combosGroup = groupIds.find((g) => g.title === "Combos");
  const order = [
    ...(body.indexOf('id="hot"') >= 0 ? [["Hot deals", body.indexOf('id="hot"')]] : []),
    ...(topSectionEarly ? [["Top sellers", body.indexOf('id="top"')]] : []),
    ...groupIds.map((g) => [g.title, g.at]),
  ].sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  const leading = order.filter((t) => t === "Hot deals" || t === "Top sellers").length;
  ok(!!combosGroup && order.indexOf("Combos") === leading && order.slice(0, leading).every((t) => t === "Hot deals" || t === "Top sellers"), "Combos comes right after Hot deals and Top sellers, before the other groups", order.join(", "));
  const first = combosGroup ? sectionOf(combosGroup.id) : "";
  ok(first.includes(COMBO), "the combo is listed under Combos");
  ok((body.match(new RegExp(`data-n="${esc(COMBO)}"`, "g")) || []).length === 1, "and only once, not also in Mains");
  ok(body.indexOf('id="hot"') < body.indexOf('<section id="s0"') && (!topSectionEarly || body.indexOf('id="top"') < body.indexOf('<section id="s0"')), "Combos comes after Hot deals and Top sellers");
  const tabs = [...body.matchAll(/data-a="nav" data-t="([^"]+)">([^<]+)</g)].map((m) => m[2]);
  ok(tabs.indexOf("Combos") >= 0 && tabs.indexOf("Combos") === tabs.filter((t) => t === "Hot deals" || t === "Top sellers").length, "the tab bar has Combos right after Hot deals and Top sellers", tabs.join(", "));
  const mains = groupIds.find((g) => g.title === "Mains");
  ok(!mains || !sectionOf(mains.id).includes(COMBO), "Mains no longer lists it");
}

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
ok(/^(noindex, follow|index, follow, max-image-preview:large)$/.test(page.h("x-robots-tag")), "indexing header is one of the two the API sends (section 8 checks it is the owner's choice)", page.h("x-robots-tag"));
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
ok((short.status === 302 && target.endsWith(`/${HANDLE}`)) || (short.status === 200 && showsShop(short.text)), "short link leads to the page", `${short.status} ${target}`);
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
for (const name of ["www", "app", "staff", "api", "simple", "staging", "admin", "floor", "kitchen", "preview", "report", "login", "faq", "console"]) {
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
for (const path of ["/", "/pricing", "/product", "/how-it-works", "/contact", "/privacy", "/terms", "/data-deletion", "/robots.txt"]) {
  const r = await get(path);
  ok(r.status === 200 && !showsShop(r.text), `${path} is served as before`, String(r.status));
}
for (const path of ["/industries", "/industries/"]) {
  const r = await get(path);
  ok(r.status === 301 && /\/product#who-its-for$/.test(r.h("location")), `${path} still redirects to the business list (the site's _redirects, not a shop)`, `${r.status} ${r.h("location")}`);
}
const pricing = await get("/pricing");
ok(!pricing.h("content-security-policy").includes("default-src 'none'"), "the site's own pages are not answered with the shop page's policy");
if (SITE_HEADERS) {
  ok(pricing.h("content-security-policy").includes("default-src 'self'"), "the site's own pages keep the site's CSP");
  ok(pricing.h("x-frame-options") === "DENY" && /max-age=\d{7,}/.test(pricing.h("strict-transport-security")), "the site's own pages keep their security headers");
} else skip("the site's own security headers", "pass --site-headers for a deploy copy built with _headers");

// 8. Search and AI assistants (growth build 7, API migration 0526).
console.log(`\nSearch and AI assistants (${LISTED ? "the owner turned search on: --listed" : "search off, the default"})`);
const metaOf = (key) => new RegExp(`<meta (?:name|property)="${esc(key)}" content="([^"]*)">`).exec(body)?.[1] ?? null;
ok(body.includes(`<link rel="canonical" href="${PUBLIC}/${HANDLE}">`), "the canonical address is the page's own", /<link rel="canonical" href="([^"]+)">/.exec(body)?.[1]);
ok(metaOf("og:url") === `${PUBLIC}/${HANDLE}` && !!metaOf("og:title") && metaOf("og:site_name") === "Relynked" && !!metaOf("twitter:title"), "Open Graph and Twitter tags: title, address, site name");
const ogImage = metaOf("og:image");
if (ogImage) {
  ok(metaOf("twitter:card") === "summary_large_image" && metaOf("twitter:image") === ogImage && !!metaOf("og:image:alt"), "the share picture is on both cards, with its alt text");
  const pic = await fetch(ogImage.replace(PUBLIC, BASE), { redirect: "manual" });
  ok(pic.status === 200 && /image\/jpeg/.test(pic.headers.get("content-type") || ""), "the share picture loads", String(pic.status));
} else ok(metaOf("twitter:card") === "summary", "no picture to share: a small card");
const blocks = jsonLdBlocks(body);
const robots = metaOf("robots") || "";
const sitemapIndex = await get("/sitemap-index.xml");
ok(sitemapIndex.status === 200 && /xml/.test(sitemapIndex.h("content-type")) && /<sitemapindex /.test(sitemapIndex.text) && sitemapIndex.text.includes("/sitemap.xml</loc>"), "the sitemap index answers, with the site's own sitemap in it", String(sitemapIndex.status));
const shopMap = await get(`/sitemap-shop-${HANDLE}.xml`);
if (LISTED) {
  ok(robots.startsWith("index") && page.h("x-robots-tag").startsWith("index"), "indexable, in the page and in X-Robots-Tag", `${robots} / ${page.h("x-robots-tag")}`);
  ok(blocks.length === 1, "one block of structured data", String(blocks.length));
  const vocab = await readVocab(VOCAB || null);
  const { errors, warnings } = validateJsonLd(blocks, { vocab, pageUrl: `${PUBLIC}/${HANDLE}`, currency: "NGN" });
  ok(errors.length === 0, "the structured data is valid schema.org, priced in NGN, nothing invented", errors.slice(0, 3).join("; "));
  if (warnings.length) console.log(`        warnings: ${warnings.slice(0, 3).join("; ")}`);
  let ld = {};
  try {
    ld = JSON.parse(blocks[0] || "{}");
  } catch {
    ld = {};
  }
  const offers = (ld.hasOfferCatalog?.itemListElement || []).map((x) => ({ name: x.name, price: x.offers?.price }));
  const naira = (p) => `\u20a6${Number(p).toLocaleString("en-NG", { minimumFractionDigits: /\./.test(String(p)) ? 2 : 0, maximumFractionDigits: 2 })}`;
  const missing = offers.filter((o) => !body.includes(naira(o.price)));
  ok(offers.length > 0 && missing.length === 0, "every price in the structured data is a price shown on the page", missing.slice(0, 2).map((o) => `${o.name} ${o.price}`).join(", "));
  for (const item of products) ok(offers.some((o) => o.name === item), `structured data lists ${item}`);
  ok(shopMap.status === 200 && shopMap.text.includes(`<loc>${PUBLIC}/${HANDLE}</loc>`), "the shop's own sitemap lists its page", String(shopMap.status));
} else {
  ok(robots.startsWith("noindex") && page.h("x-robots-tag").startsWith("noindex"), "not indexed until the owner turns search on (page and X-Robots-Tag)", `${robots} / ${page.h("x-robots-tag")}`);
  ok(blocks.length === 0, "and no structured data");
  ok(shopMap.status === 404 && !shopMap.text.includes("<urlset"), "and no sitemap of its own", String(shopMap.status));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
