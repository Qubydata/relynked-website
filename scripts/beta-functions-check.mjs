/**
 * relynked.com/beta's Pages Functions (functions/api/beta), with no network: a fake API records what it is asked.
 *
 *   node scripts/beta-functions-check.mjs
 *
 * Holds: off (503) without an https API and a long secret; the settings and an application go to the API with the
 * secret and the visitor's address and nothing else of the visitor's (no cookie, no referrer); JSON only, and small;
 * the visitor gets JSON back and never the API's own headers; the settings may be kept a minute, an application never;
 * a GET to apply is refused; /beta stays a page of the site (_routes.json) and is never a shop name; the page is
 * onboarding only (17 Nov 2026): the short form, no quiz, no pay, no marketing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestGet as settings } from "../functions/api/beta/settings.js";
import { onRequestPost as apply, onRequestGet as applyGet } from "../functions/api/beta/apply.js";
import { betaApi } from "../functions/api/beta/_proxy.js";
import { isHandle } from "../functions/_shop.js";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;
let passed = 0;
const ok = (c, n, d = "") => {
  if (c) passed++;
  else failed++;
  console.log(`  ${c ? "ok  " : "FAIL"}  ${n}${c || !d ? "" : "  (" + d + ")"}`);
};

const calls = [];
let answer = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1", "x-powered-by": "api", "cache-control": "public, max-age=60" } });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init, headers: new Headers(init.headers || {}) });
  return answer();
};
const SECRET = "p".repeat(40);
const ENV = { SHOP_PAGES_API: "https://api.example.com", SHOP_PAGES_PROXY_SECRET: SECRET };
const ctx = (method, body, env = ENV, headers = {}) => ({
  request: new Request("https://relynked.com/api/beta/x", { method, headers: { "cf-connecting-ip": "102.89.1.2", cookie: "session=abc", referer: "https://relynked.com/beta", ...headers }, ...(body !== undefined ? { body } : {}) }),
  env,
});

ok(betaApi(ENV) === "https://api.example.com", "the API from SHOP_PAGES_API");
ok(betaApi({ ...ENV, BETA_API: "https://beta.example.com" }) === "https://beta.example.com", "BETA_API wins when set");
ok(betaApi({ ...ENV, SHOP_PAGES_PROXY_SECRET: "short" }) === null && betaApi({ ...ENV, SHOP_PAGES_API: "http://api.example.com" }) === null, "off without a long secret or an https API");
ok(betaApi({ ...ENV, SHOP_PAGES_ENABLED: "false" }) !== null, "on whether or not shop pages are on");

let r = await settings(ctx("GET", undefined, {}));
ok(r.status === 503 && calls.length === 0, "not set up: 503, the API is never asked");

r = await settings(ctx("GET"));
let c = calls.at(-1);
ok(c.url === "https://api.example.com/beta/settings" && c.init.method === "GET", "settings go to /beta/settings");
ok(c.headers.get("x-relynked-proxy") === SECRET && c.headers.get("x-relynked-client-ip") === "102.89.1.2", "with the secret and the visitor's address");
ok(!c.headers.has("cookie") && !c.headers.has("referer"), "and nothing else of the visitor's");
ok(r.headers.get("cache-control") === "public, max-age=60" && !r.headers.has("set-cookie") && !r.headers.has("x-powered-by"), "kept a minute; the API's own headers never reach the visitor");

const body = JSON.stringify({ name: "Ada" });
r = await apply(ctx("POST", body, ENV, { "content-type": "application/json" }));
c = calls.at(-1);
ok(c.url === "https://api.example.com/beta/apply" && c.init.method === "POST" && c.init.body === body, "an application goes to /beta/apply as typed");
ok(c.headers.get("x-relynked-proxy") === SECRET && !c.headers.has("cookie"), "with the secret, without the cookie");
ok(r.status === 200 && r.headers.get("cache-control") === "no-store", "an application is never kept");

const before = calls.length;
r = await apply(ctx("POST", "name=Ada", ENV, { "content-type": "application/x-www-form-urlencoded" }));
ok(r.status === 415 && calls.length === before, "JSON only");
r = await apply(ctx("POST", JSON.stringify({ x: "y".repeat(9000) }), ENV, { "content-type": "application/json" }));
ok(r.status === 413 && calls.length === before, "and small");
r = await applyGet();
ok(r.status === 405, "a GET to apply is refused");

answer = () => new Response(JSON.stringify({ ok: false, error: "slow_down" }), { status: 429, headers: { "content-type": "application/json", "retry-after": "600" } });
r = await apply(ctx("POST", body, ENV, { "content-type": "application/json" }));
ok(r.status === 429 && r.headers.get("retry-after") === "600", "the API's limit and its wait reach the page");
globalThis.fetch = async () => { throw new Error("down"); };
r = await apply(ctx("POST", body, ENV, { "content-type": "application/json" }));
ok(r.status === 503, "the API down: 503, the page says try again");

const routes = JSON.parse(readFileSync(join(root, "_routes.json"), "utf8"));
ok(routes.exclude.includes("/beta") && routes.exclude.includes("/beta.html"), "/beta stays a page of the site (_routes.json)");
ok(!isHandle("beta"), "and beta is never a shop name");
ok(!routes.exclude.some((p) => p.startsWith("/api")), "/api still reaches the functions");

const html = readFileSync(join(root, "beta.html"), "utf8");
const js = readFileSync(join(root, "assets/js/beta.js"), "utf8");
const css = readFileSync(join(root, "assets/css/beta.css"), "utf8");
ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), "the page has no inline script (CSP: scripts from this site only)");
ok(!/https?:\/\/(?!relynked\.com|fonts\.g|www\.instagram\.com)/.test(html.replace(/xmlns="[^"]+"/g, "")) && !/https?:\/\//.test(js), "no third party script or call");
ok(!/[–—]/.test(html + js + css), "no em or en dash in the page, its script or its styles");
// Onboarding only (founder, 17 Nov 2026): the testing partner recruits, trains and pays the testers. No quiz, no
// marketing, no pay; one line sends pay, schedule and training questions to the partner.
ok(!/wrongPrice|"total"|name="bug"|name="pidgin"|chapman|9500/i.test(html + js) && !/quiz/i.test(html), "no quiz on the page or in its script");
ok(!/name="minutes"|minutes:/.test(html + js), "no minutes a day asked");
ok(!/₦|naira|bonus|paid|earn|per active day|data top up|#pay\b/i.test(html + js), "no pay shown: no amount, no bonus, no pay timing");
ok((html.match(/\bpay\b/gi) || []).length === 1 && html.includes("Questions about pay, schedule or training? Ask your testing partner."), "the one pay line: ask your testing partner");
ok(!/<nav\b|class="links"|burger|<figure|faq|fluted|bh-flute|orb|class="sprite"|<symbol/i.test(html), "no menu, no hero chat, no FAQ, no glass, no doodle sprite");
ok(html.includes("Relynked beta: tester onboarding") && html.includes("Your testing partner has signed you up."), "the title and the one line");
ok((html.match(/<ol class="ob-steps"[\s\S]*?<\/ol>/)?.[0].match(/<li>/g) || []).length === 3, "three steps");
for (const n of ["name", "email", "phone", "phoneType", "city", "ranBusiness", "businessKind", "pidginComfort", "otherLanguages", "consent"]) ok(html.includes(`name="${n}"`) && js.includes(`"${n}"`), `the form asks ${n} and the script sends it`);
ok((html.match(/name="pidginComfort"/g) || []).length === 4, "Pidgin comfort: four options");
ok(html.includes("Thanks, you're in the list.") && html.includes("We'll email you your role, tasks and codes."), "the success line");
ok((css.match(/var\(--lime\)/g) || []).length === 0 && html.includes('class="btn lime ob-send"'), "lime is used once, on the Submit button (the site's .btn.lime)");
const ids = [...html.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]).filter((id) => id !== "website" && id !== "consent");
ok(ids.every((id) => html.includes(`for="${id}"`)), "every text field has a real label", ids.filter((id) => !html.includes(`for="${id}"`)).join(","));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
