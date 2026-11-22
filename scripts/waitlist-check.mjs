/**
 * relynked.com/waitlist: its Pages Functions (functions/api/waitlist) with no network, and the page's words.
 *
 *   node scripts/waitlist-check.mjs
 *
 * Holds: join, status and place go to the API's /waitlist routes with the secret and the visitor's address and
 * nothing else of the visitor's; a GET to join is refused; another site's Origin is refused; place passes only a code
 * of the right shape and answers 404 itself for anything else; /waitlist stays a page of the site and is never a shop
 * name; the page has the fields asked for, the honeypot, the consent version the API knows, at most two buttons a
 * screen, and no em or en dash anywhere in what was added; the home page's button changes only when the list is open.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as joinPost, onRequestGet as joinGet } from "../functions/api/waitlist/join.js";
import { onRequestGet as statusGet } from "../functions/api/waitlist/status.js";
import { onRequestGet as placeGet, codeFrom } from "../functions/api/waitlist/place.js";
import { isHandle } from "../functions/_shop.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
let failed = 0;
let passed = 0;
const ok = (c, n, d = "") => {
  if (c) passed++;
  else failed++;
  console.log(`  ${c ? "ok  " : "FAIL"}  ${n}${c || !d ? "" : "  (" + d + ")"}`);
};

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init, headers: new Headers(init.headers || {}) });
  return new Response(JSON.stringify({ ok: true, place: 3 }), { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1" } });
};
const SECRET = "p".repeat(40);
const ENV = { SHOP_PAGES_API: "https://api.example.com", SHOP_PAGES_PROXY_SECRET: SECRET };
const ctx = (method, url, body, headers = {}, env = ENV) => ({
  request: new Request(url, { method, headers: { "cf-connecting-ip": "102.89.1.2", cookie: "session=abc", referer: "https://relynked.com/waitlist", ...headers }, ...(body !== undefined ? { body } : {}) }),
  env,
});

let r = await statusGet(ctx("GET", "https://relynked.com/api/waitlist/status"));
let c = calls.at(-1);
ok(r.status === 200 && c.url === "https://api.example.com/waitlist/status", "status goes to /waitlist/status");
ok(c.headers.get("x-relynked-proxy") === SECRET && c.headers.get("x-relynked-client-ip") === "102.89.1.2" && !c.headers.has("cookie") && !c.headers.has("referer"), "with the secret and the address, nothing else of the visitor's");
ok(!r.headers.has("set-cookie"), "the API's own headers never reach the visitor");

const body = JSON.stringify({ name: "Ada", phone: "08031234567" });
r = await joinPost(ctx("POST", "https://relynked.com/api/waitlist/join", body, { "content-type": "application/json", origin: "https://relynked.com" }));
c = calls.at(-1);
ok(r.status === 200 && c.url === "https://api.example.com/waitlist/join" && c.init.method === "POST" && c.init.body === body, "join goes to /waitlist/join as typed");
ok(r.headers.get("cache-control") === "no-store", "a join is never kept");
const before = calls.length;
r = await joinPost(ctx("POST", "https://relynked.com/api/waitlist/join", body, { "content-type": "application/json", origin: "https://evil.example" }));
ok(r.status === 403 && calls.length === before, "another site's page: 403, the API is never asked");
r = await joinPost(ctx("POST", "https://relynked.com/api/waitlist/join", "x=1", { "content-type": "application/x-www-form-urlencoded" }));
ok(r.status === 415 && calls.length === before, "JSON only");
r = await joinGet(ctx("GET", "https://relynked.com/api/waitlist/join"));
ok(r.status === 405, "a GET to join is refused");

r = await placeGet(ctx("GET", "https://relynked.com/api/waitlist/place?code=ab3cde"));
c = calls.at(-1);
ok(r.status === 200 && c.url === "https://api.example.com/waitlist/place?code=AB3CDE", "place passes the code, upper cased");
const n = calls.length;
for (const bad of ["", "AB3CD", "AB3CDE7", "IL0O10", "%3Cscript%3E", "AB3CDE%26x%3D1"]) {
  r = await placeGet(ctx("GET", `https://relynked.com/api/waitlist/place?code=${bad}`));
  ok(r.status === 404 && calls.length === n, `place refuses "${bad}" itself`);
}
ok(codeFrom("not a url") === null, "a broken address is no code");
r = await placeGet(ctx("GET", "https://relynked.com/api/waitlist/place?code=AB3CDE&code=ZZZZZZ&x=1"));
ok(calls.at(-1).url === "https://api.example.com/waitlist/place?code=AB3CDE", "only the one code goes on, nothing else from the address");

const routes = JSON.parse(read("_routes.json"));
ok(routes.exclude.includes("/waitlist") && routes.exclude.includes("/waitlist.html"), "/waitlist stays a page of the site (_routes.json)");
ok(!isHandle("waitlist"), "and waitlist is never a shop name");

const page = read("waitlist.html");
for (const name of ["name", "phone", "email", "businessName", "sellsPick", "sellsOther", "cityPick", "cityOther", "shops", "consent", "website"]) ok(page.includes(`name="${name}"`), `the page has ${name}`);
ok(/value="one"/.test(page) && /value="two_to_five"/.test(page) && /value="more_than_five"/.test(page) && page.includes(">2 to 5<") && page.includes(">More than 5<"), "shops: 1, 2 to 5, more than 5");
const js = read("assets/js/waitlist.js");
ok(js.includes('"waitlist-2026-11-22"') && js.includes("formMs") && js.includes("website"), "the consent version the API knows, the time on the form, the honeypot");
const screens = page.split(/<section /).slice(1);
ok(screens.length === 4 && screens.every((s) => (s.match(/class="pill /g) || []).length <= 2), "four blocks, at most two buttons each");
const steps = page.split(/class="step"/).slice(1);
ok(steps.length === 3 && js.includes('"Join"') && page.includes('class="prog"'), "the form is three steps with a progress bar, ending in Join");
for (const v of ["Food", "Fashion", "Beauty", "Phones", "Groceries", "Lagos", "Abuja", "Port Harcourt"]) ok(page.includes(`value="${v}"`), `chip ${v}`);
ok((page.match(/value="other"/g) || []).length === 2, "Other on what you sell and on the city, each with its short text");
ok(!/offer/i.test(page) && !/offer/i.test(js), "no early offer anywhere (founder, 22 Nov 2026)");
ok(page.includes("We'll be in touch.") && !/when it.s your turn/.test(page), "the place screen says We'll be in touch.");
ok(!/letter-spacing:\.[1-9]|text-transform:uppercase/.test(read("assets/css/waitlist.css")), "no letter spaced eyebrow labels");
ok(js.includes("Opening <em>soon.</em>"), "closed: the same hero with Opening soon.");
const added = [page, js, read("assets/css/waitlist.css"), read("assets/js/waitlist-cta.js"), read("functions/api/waitlist/join.js"), read("functions/api/waitlist/status.js"), read("functions/api/waitlist/place.js")].join("\n");
ok(!/[–—]/.test(added), "no em or en dash in anything added");
const privacy = read("privacy.html");
ok(!/Relynked Business|both (Relynked )?products|our products/.test(privacy), "the privacy page no longer calls Relynked and Remy two products");
ok(privacy.includes('id="waitlist"') && /To be removed, reply to our email or message us on WhatsApp/.test(privacy), "the privacy page says what is kept and how to be removed");
const home = read("index.html");
ok((home.match(/data-waitlist-cta/g) || []).length === 2 && home.includes("/assets/js/waitlist-cta.js"), "both home heroes carry the button that becomes Join the waitlist");
ok(read("assets/js/waitlist-cta.js").includes("j.open !== true"), "and it changes only when the list is open");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
