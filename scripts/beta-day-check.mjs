/**
 * relynked.com/beta/checkin and /beta/feedback (a tester's own page) and their Pages Functions, with no network: a
 * fake API records what it is asked.
 *
 *   node scripts/beta-day-check.mjs
 *
 * Holds: the three calls go to the API as POST with the proxy secret and the visitor's address, the token in the
 * body and never in an address; a GET is refused; nothing is ever kept (no-store); the two pages stay pages of the
 * site (_routes.json); no inline script, no third party call (Google Fonts only, as the rest of the site), no
 * dash; under 60 KB in all; the token
 * is read after the # and nothing is built from HTML strings.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as me, onRequestGet as meGet } from "../functions/api/beta/me.js";
import { onRequestPost as checkin, onRequestGet as checkinGet } from "../functions/api/beta/checkin.js";
import { onRequestPost as answer, onRequestGet as answerGet } from "../functions/api/beta/answer.js";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
let passed = 0;
const ok = (c, n, d = "") => {
  if (c) passed++;
  else failed++;
  console.log(`  ${c ? "ok  " : "FAIL"}  ${n}${c || !d ? "" : "  (" + d + ")"}`);
};

const calls = [];
let reply = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1", "cache-control": "public, max-age=60" } });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init, headers: new Headers(init.headers || {}) });
  return reply();
};
const SECRET = "p".repeat(40);
const ENV = { SHOP_PAGES_API: "https://api.example.com", SHOP_PAGES_PROXY_SECRET: SECRET };
const TOKEN = "A".repeat(43);
const ctx = (path, body, env = ENV) => ({
  request: new Request("https://relynked.com/api/beta/" + path, { method: "POST", headers: { "cf-connecting-ip": "102.89.1.2", cookie: "session=abc", referer: "https://relynked.com/beta/checkin", "content-type": "application/json" }, body }),
  env,
});

for (const [name, fn, getFn] of [["me", me, meGet], ["checkin", checkin, checkinGet], ["answer", answer, answerGet]]) {
  const body = JSON.stringify({ token: TOKEN, task: "d1_c_order", status: "done" });
  const r = await fn(ctx(name, body));
  const c = calls.at(-1);
  ok(c.url === `https://api.example.com/beta/${name}` && c.init.method === "POST" && c.init.body === body, `${name} goes to /beta/${name} as sent`);
  ok(!c.url.includes(TOKEN) && c.headers.get("x-relynked-proxy") === SECRET && c.headers.get("x-relynked-client-ip") === "102.89.1.2" && !c.headers.has("cookie") && !c.headers.has("referer"), `${name}: the token only in the body; the secret and the visitor's address; no cookie, no referrer`);
  ok(r.status === 200 && r.headers.get("cache-control") === "no-store" && !r.headers.has("set-cookie"), `${name}: never kept, and the API's own headers never reach the page`);
  ok((await getFn()).status === 405, `a GET to ${name} is refused`);
}
let n = calls.length;
let r = await me(ctx("me", JSON.stringify({ token: TOKEN }), {}));
ok(r.status === 503 && calls.length === n, "not set up: 503, the API is never asked");
r = await checkin(ctx("checkin", JSON.stringify({ token: TOKEN, note: "x".repeat(9000) })));
ok(r.status === 413 && calls.length === n, "a body over the limit never reaches the API");
reply = () => new Response(JSON.stringify({ ok: false, error: "closed" }), { status: 409, headers: { "content-type": "application/json" } });
r = await checkin(ctx("checkin", JSON.stringify({ token: TOKEN })));
ok(r.status === 409 && (await r.json()).error === "closed", "the API's answer (closed) reaches the page");

const routes = JSON.parse(readFileSync(join(root, "_routes.json"), "utf8"));
ok(routes.exclude.includes("/beta/*") && routes.exclude.includes("/beta") && !routes.exclude.some((p) => p.startsWith("/api")), "/beta/checkin and /beta/feedback stay pages of the site; /api still reaches the functions");

const read = (p) => readFileSync(join(root, p), "utf8");
const pages = { checkin: read("beta/checkin.html"), feedback: read("beta/feedback.html") };
const js = read("assets/js/beta-day.js");
const css = read("assets/css/beta-day.css");
for (const [name, html] of Object.entries(pages)) {
  ok(html.includes(`data-page="${name}"`) && html.includes('src="/assets/js/beta-day.js') && html.includes('href="/assets/css/beta-day.css'), `${name}: the one script and the one stylesheet`);
  ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html) && !/\son[a-z]+=/i.test(html), `${name}: no inline script (CSP: scripts from this site only)`);
  const third = html.match(/https?:\/\/[^"' )]+/g) || [];
  ok(third.every((u) => u === "https://fonts.googleapis.com" || u === "https://fonts.gstatic.com" || u.startsWith("https://fonts.googleapis.com/css2?")), `${name}: no third party file but Google Fonts (the site's CSP allows only those)`, third.join(" "));
  ok(html.indexOf('name="referrer" content="no-referrer"') < html.indexOf("fonts.googleapis"), `${name}: no referrer is set before the fonts are asked for`);
  ok(html.includes('src="/assets/brand/relynked-lockup-dark-sm.png"'), `${name}: the white and lime logo, a small file`);
  ok(html.includes('content="noindex,nofollow"') && html.includes('name="referrer" content="no-referrer"'), `${name}: never indexed, and no referrer leaves the page`);
  ok(Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css) < 60 * 1024, `${name}: the whole page is under 60 KB`, String(Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css)));
}
ok(!/[–—]/.test(pages.checkin + pages.feedback + js + css), "no em or en dash in the pages, the script or the styles");
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(js), "nothing on the page is built from HTML strings");
ok(!/https?:\/\/[a-z]/.test(js.replace(/"https:\/\/"/g, "")) && (js.match(/fetch\(/g) || []).length === 1 && js.includes('fetch("/api/beta/" + path'), "the script only ever calls this site's /api/beta");
ok(js.includes("/^#t=([A-Za-z0-9_-]{43})$/.exec(location.hash)") && !/location\.search/.test(js) && js.includes("body.token = token") && !/[?&]t=["' ]*\+/.test(js), "the token is read from the # ONLY (no ?t=) and sent in the body, never put in an address");
ok(js.includes('history.replaceState(null, "", location.pathname)') && js.indexOf("history.replaceState") > js.indexOf('store.set("t", m[1])'), "once kept, the token is taken out of the address bar and the history");
ok(js.includes(`!/^https:\\/\\/[^\\s<>"'()[\\]\`]{4,290}$/.test(v)`), "a screenshot link with a bracket, a backtick or a space is refused on the page too");
ok(routes.exclude.length === new Set(routes.exclude).size && routes.exclude.filter((p) => p === "/beta").length === 1, "_routes.json lists every rule once (/beta is not doubled)");
ok(/\.chips\.many \.opt\{[^}]*min-height:5[6-9]px/.test(css) && js.includes('view.shops.length > 4 ? "chips many"'), "more than 4 shops: chips that wrap, each still 56px tall");
ok(!/₦|naira|bonus|\bpaid\b|\bpay\b|earn/i.test(pages.checkin + pages.feedback + js), "no pay anywhere on the tester's page");
ok(/font:16px\/1\.5 Inter,system-ui/.test(css) && /--head:Montserrat,/.test(css) && !/@import|@font-face|url\(/.test(css), "Inter and Montserrat with system fonts behind; the styles load nothing else");
ok(/min-height:(6[4-9]|[7-9]\d)px/.test(css.match(/\.ans\{[^}]+\}/)[0]) && /min-height:(5[6-9]|[6-9]\d)px/.test(css.match(/\.opt\{[^}]+\}/)[0]) && /min-height:(6[4-9]|[7-9]\d)px/.test(css.match(/\.btn\{[^}]+\}/)[0]) && /width:5[6-9]px;height:5[6-9]px/.test(css.match(/\.back\{[^}]+\}/)[0]), "big tap targets: an answer and a button 64px tall, a choice and the back arrow 56px");
ok(!/#(E5372B|8A1F11|C0392B|D32F2F|FF0000)\b|\bred\b/i.test(css), "no red anywhere");
ok(/prefers-reduced-motion:reduce\)\{[^}]*\.card[^}]*transition:none/.test(css) && /\.card\{[^}]*transition:transform \.25s/.test(css), "the next task slides in (transform, 250ms), and stays still for reduced motion");
for (const v of ["--forest:#0F3D2E", "--lime:#E2EE4D", "--soft:#F3F6F2"]) ok(css.includes(v), `the deck's colours as tokens: ${v}`);
ok(js.includes('[["done", "Done", " done"], ["failed", "Didn\'t work", " bad"], ["stuck", "Got stuck", " stuck"]]'), "\"Didn't work\" saves the status failed");
for (const s of ["Done", "Didn't work", "Got stuck", "Which shop?", "What happened?", "Screenshot link ", "(optional)", "Final questions", "Answer the final questions", "All done ", "Saving when you're back online", "Earlier days", "Back", "Next", "Skip", "Thank you.", "Try again", "No connection", "This link no longer works"]) ok(js.includes(`"${s}"`) || js.includes(s), `the page says "${s}"`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
