/**
 * relynked.com/beta/checkin and /beta/feedback (a tester's own page) and their Pages Functions, with no network: a
 * fake API records what it is asked.
 *
 *   node scripts/beta-day-check.mjs
 *
 * Holds: the three calls go to the API as POST with the proxy secret and the visitor's address, the token in the
 * body and never in an address; a GET is refused; nothing is ever kept (no-store); the two pages stay pages of the
 * site (_routes.json); no inline script, no third party call, no web font, no dash; under 60 KB in all; the token
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
  ok(!/https?:\/\//.test(html.replace(/xmlns="[^"]+"/g, "")) && !/fonts\.g/.test(html), `${name}: no third party file, no web font`);
  ok(html.includes('content="noindex,nofollow"') && html.includes('name="referrer" content="no-referrer"'), `${name}: never indexed, and no referrer leaves the page`);
  ok(Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css) < 60 * 1024, `${name}: the whole page is under 60 KB`, String(Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css)));
}
ok(!/[–—]/.test(pages.checkin + pages.feedback + js + css), "no em or en dash in the pages, the script or the styles");
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(js), "nothing on the page is built from HTML strings");
ok(!/https?:\/\/[a-z]/.test(js.replace(/"https:\/\/"/g, "")) && (js.match(/fetch\(/g) || []).length === 1 && js.includes('fetch("/api/beta/" + path'), "the script only ever calls this site's /api/beta");
ok(js.includes("location.hash") && /\{43\}/.test(js) && js.includes("body.token = token") && !/[?&]t=["' ]*\+/.test(js), "the token is read after the # and sent in the body, never put in an address");
ok(!/₦|naira|bonus|\bpaid\b|\bpay\b|earn/i.test(pages.checkin + pages.feedback + js), "no pay anywhere on the tester's page");
ok(/font:16px\/1\.5 Manrope,system-ui/.test(css) && !/@import|@font-face|url\(/.test(css), "system fonts behind Manrope; the styles load nothing else");
ok(/min-height:5[0-9]px/.test(css.match(/\.ans\{[^}]+\}/)[0]) && /min-height:4[4-9]px|min-height:5\dpx/.test(css.match(/\.opt\{[^}]+\}/)[0]), "big tap targets: an answer is at least 56px tall, a choice 48px");
for (const s of ["Done", "Failed", "Got stuck", "What happened?", "Screenshot link (optional)", "Final questions", "Back", "Next", "Try again", "No connection", "This link no longer works"]) ok(js.includes(`"${s}"`) || js.includes(s), `the page says "${s}"`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
