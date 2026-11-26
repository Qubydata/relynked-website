/**
 * relynked.com/beta/checkin and /beta/feedback (a tester's own page) and their Pages Functions, with no network: a
 * fake API records what it is asked.
 *
 *   node scripts/beta-day-check.mjs
 *
 * Holds: the three calls go to the API as POST with the proxy secret and the visitor's address, the token in the
 * body and never in an address; a GET is refused; nothing is ever kept (no-store); the two pages stay pages of the
 * site (_routes.json); no inline script, no third party call (Google Fonts only, as the rest of the site), no
 * dash; drawn as the app's Ask Remy screen; under 60 KB in all; the token
 * is read after the # and nothing is built from HTML strings.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestPost as me, onRequestGet as meGet } from "../functions/api/beta/me.js";
import { onRequestPost as checkin, onRequestGet as checkinGet } from "../functions/api/beta/checkin.js";
import { onRequestPost as answer, onRequestGet as answerGet } from "../functions/api/beta/answer.js";
import { onRequestPost as openFn, onRequestGet as openGet } from "../functions/api/beta/open.js";
import { onRequestPost as resendFn, onRequestGet as resendGet } from "../functions/api/beta/resend.js";

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

for (const [name, fn, getFn] of [["me", me, meGet], ["checkin", checkin, checkinGet], ["answer", answer, answerGet], ["open", openFn, openGet], ["resend", resendFn, resendGet]]) {
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
  ok(/<header class="asknav">[\s\S]*class="ro"[\s\S]*<\/header>/.test(html) && html.includes('class="thd dwp"') && html.includes('class="pillrow"'), `${name}: the app's Ask Remy screen: the head with the orb, the doodle wallpaper, the forest pill`);
  ok(html.includes('content="noindex,nofollow"') && html.includes('name="referrer" content="no-referrer"'), `${name}: never indexed, and no referrer leaves the page`);
  const doodle = readFileSync(join(root, "assets/beta/doodle.svg"));
  ok(Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css) < 60 * 1024 && Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css) + doodle.length < 85 * 1024, `${name}: the page under 60 KB, under 85 KB with the wallpaper (before compression)`, String(Buffer.byteLength(html) + Buffer.byteLength(js) + Buffer.byteLength(css) + doodle.length));
}
ok(!/[–—]/.test(pages.checkin + pages.feedback + js + css), "no em or en dash in the pages, the script or the styles");
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(js), "nothing on the page is built from HTML strings");
ok(!/https?:\/\/[a-z]/.test(js.replace(/"https:\/\/"/g, "")) && (js.match(/fetch\(/g) || []).length === 1 && js.includes('fetch("/api/beta/" + path'), "the script only ever calls this site's /api/beta");
ok(js.includes("/^#t=([A-Za-z0-9_-]{43})$/.exec(location.hash)") && !/location\.search/.test(js) && js.includes("body.token = token") && !/[?&]t=["' ]*\+/.test(js), "the token is read from the # ONLY (no ?t=) and sent in the body, never put in an address");
ok(js.includes('history.replaceState(null, "", location.pathname)') && js.indexOf("history.replaceState") > js.indexOf('store.set("t", m[1])'), "once kept, the token is taken out of the address bar and the history");
ok(js.includes(`!/^https:\\/\\/[^\\s<>"'()[\\]\`]{4,290}$/.test(v)`), "a screenshot link with a bracket, a backtick or a space is refused on the page too");
ok(routes.exclude.length === new Set(routes.exclude).size && routes.exclude.filter((p) => p === "/beta").length === 1, "_routes.json lists every rule once (/beta is not doubled)");
ok(/\.qrow\{display:flex;flex-wrap:wrap/.test(css) && /\.qr\{[^}]*border-radius:999px;border:1px solid var\(--line\)/.test(css) && /\.qr\[aria-pressed=true\]\{background:var\(--sel\);box-shadow:var\(--sel-sh\)/.test(css), "shops and answers are the app's reply chips: they wrap, a hairline, the chosen one lifts (no coloured fill)");
ok(!/₦|naira|bonus|\bpaid\b|\bpay\b|earn/i.test(pages.checkin + pages.feedback + js), "no pay anywhere on the tester's page");
ok(/font:400 14px\/1\.42 Montserrat,"Noto Sans"/.test(css) && !/\b(800|900)\b/.test(css) && !/Inter/.test(css) && !/@import|@font-face/.test(css) && (css.match(/url\("([^"]+)"\)/g) || []).every((u) => u === 'url("../beta/doodle.svg")') && (css.match(/url\(/g) || []).length === (css.match(/url\("\.\.\/beta\/doodle\.svg"\)/g) || []).length, "the app's face and ladder: Montserrat at 14px, never heavier than 700; the styles load only the wallpaper");
ok(/min-height:44px/.test(css.match(/\.cv-primary,\.cv-second\{[^}]+\}/)[0]) && /min-height:44px/.test(css.match(/\.cv-undo\{[^}]+\}/)[0]) && /\.qr::after\{content:"";position:absolute;inset:-2px 0\}/.test(css) && /\.seg::after\{content:"";position:absolute;inset:-4px -1px\}/.test(css), "tap targets: the card buttons and Undo 44px, as the app; a chip and a rating reach 44px with an invisible ring");
ok(!/#(E5372B|8A1F11|C0392B|D32F2F|FF0000)\b|\bred\b/i.test(css), "no red anywhere");
const decls = css.match(/(transition|animation):[^;}]+/g) || [];
ok((css.match(/cubic-bezier\(/g) || []).length === 1 && css.includes("--ease:cubic-bezier(0.2,0.8,0.2,1)") && decls.length > 5 && decls.every((d) => /var\(--ease\)|none|ro-orbit 1\.1s linear/.test(d)), "one easing for every motion (the app's --ease), the orb's own spin aside", decls.filter((d) => !/var\(--ease\)|none|ro-orbit/.test(d)).join(" | "));
ok((css.match(/(\d+)ms/g) || []).every((x) => parseInt(x, 10) <= 400), "no motion longer than 400ms");
ok(/prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation:none!important;transition:none!important/.test(css) && js.includes('matchMedia("(prefers-reduced-motion: reduce)")'), "reduced motion: instant cuts");
ok(/\.comp\{[^}]*env\(safe-area-inset-bottom/.test(css) && /\.thd\{position:fixed;inset:0;display:flex;flex-direction:column/.test(css) && js.includes('composer({ key: "note:"') && js.includes('comp.classList.remove("up")') && /\.comp\{position:absolute;[^}]*transform:translateY\(110%\)/.test(css) && /\.comp\.up\{transform:none/.test(css) && !/hint/.test(js), "the forest pill sits at the foot above the safe area, only when there is something to type, and slides up (no jump)");
ok(/\.msgs\{[^}]*mask-image:linear-gradient\(to bottom,transparent calc\(var\(--head-h\)/.test(css), "nothing readable under the frosted head: the thread fades out before it");
ok(/@media \(max-width:374px\)\{\.cv-actions\.three\{flex-direction:column/.test(css) && !/\.cv-actions\.three\{flex-wrap:wrap\}/.test(css), "the three answers: one row, or all three stacked on a narrow phone, never two and one");
for (const [name, html] of Object.entries(pages)) ok(!/<footer/.test(html) && js.includes('a.href = "/privacy"'), `${name}: no footer in the thread; Privacy is in the More menu`);
for (const [name, html] of Object.entries(pages)) ok(/<header class="asknav">[\s\S]*id="sub"[\s\S]*<\/header>/.test(html), `${name}: "Saved" is the head's status line, never over the thread`);
ok(!/position:fixed/.test((css.match(/\.asknav \.tx span\{[^}]+\}/) || [""])[0]) && !/\.saved|\.pill\{/.test(css), "the save status is never a floating box");
ok(/q\.kind === "shop_rating"[\s\S]{0,400}buyShops\(\)\.forEach\(function \(s\) \{\s*var row = el\("div", "rate-row"\)/.test(js) && /\.segment\{/.test(css) && js.includes('["1", "2", "3", "4", "5"]'), "every shop rating on ONE card: a row a shop, the app's segmented 1 to 5");
const snapSrc = (js.match(/function snap\(\) \{[^}]+\}/) || [""])[0];
ok(snapSrc && !/token/.test(snapSrc) && (js.match(/history\.(pushState|replaceState)\(/g) || []).length === (js.match(/history\.(pushState|replaceState)\((snap\(\)|null), "", location\.pathname\)/g) || []).length && js.includes("history.pushState(snap()") && js.includes('addEventListener("popstate"'), "a history entry per step (the phone's Back works), the address always the bare path: no token, no step");
ok(js.includes('"Welcome back"') && js.includes("firstOpen(tasks)"), "coming back lands on the first task not answered, with a quiet Welcome back");
ok(js.includes('[["done", "Done", " done"], ["failed", "Didn\'t work", " bad"], ["stuck", "Got stuck", " stuck"]]'), "\"Didn't work\" saves the status failed");
for (const s of ["Done", "Didn't work", "Got stuck", "Which shop?", "What happened?", "Add a screenshot link", "Undo", "Final questions", "That's everything for today. Thank you.", "Start", "Saving when you're back online", "Earlier days", "Back", "Skip", "Thank you.", "Try again", "No connection", "This link no longer works"]) ok(js.includes(`"${s}"`) || js.includes(s), `the page says "${s}"`);

// The one time open code (relynked 0612): the email carries #o=, the page trades it once for its own token.
ok(js.includes("/^#o=([A-Za-z0-9_-]{43})$/.exec(location.hash)") && js.includes('call("open", { code: code })') && js.indexOf("history.replaceState(null") < js.indexOf("function trade("), "an open code is read from the # only, taken out of the address bar at once, and traded through /api/beta/open");
ok(js.includes('if (path !== "open" && path !== "resend") body.token = token;'), "the open and resend calls never carry the page's token");
ok(/store\.set\("t", token\)[\s\S]{0,40}return start\(\)/.test(js), "the traded token is kept on this phone, exactly as a #t= link was");
ok(js.includes('"Send me a new link"') && js.includes('call("resend", body)') && js.includes("If that address is on our list, a new link is on its way."), "a used or expired link offers one button, Send me a new link, and answers the same whatever happened");
ok(js.includes('token = token || store.get("t");\n      if (token) return start();\n      if (r.status === 404) return gone();'), "a phone that already has a token (or another tab just kept one) opens its page whatever the code's answer (404, 429, an error)");
ok(js.includes("if (token && Object.keys(pending).length && n < 40)") && js.includes("if (token !== r.json.token) { pending = {};"), "answers waiting under the old token are sent before a code is traded, and never sent under a new token");
ok(!/window\.prompt|prompt\(/.test(js) && js.includes('box.type = "email"'), "the email for a new link is typed in the card, not a browser prompt");

// Every tester is both an owner and a customer (relynked 0623).
ok(js.includes('return list.filter(function (t) { return sectionOf(t) === "own"; }).concat(list.filter(function (t) { return sectionOf(t) === "buy"; }));') && js.includes('var SECTION = { own: "Your shops", buy: "Shops you buy from" };'), "the day's tasks are grouped by section: your shops first, then the shops you buy from");
ok(js.includes('var pick = sectionOf(t) === "own" ? ownShops() : buyShops();') && js.includes("function buyShops() { return view.shops.filter(function (s) { return !isMine(s); }); }"), "Which shop: a task for your shops offers only your shops; a task for shops you buy from never offers your own");
ok(js.includes('own ? "Your shop" + (s.code ? ", code " + s.code : "")') && js.includes('remy("shops:own"') && js.includes('remy("shops:buy"') && js.includes("[card(buyShops())]"), "your own shops are marked Your shop, apart from the shops you buy from");
ok(/q\.kind === "shop_rating"[\s\S]{0,400}buyShops\(\)\.forEach/.test(js) && js.includes('q.options : buyShops().map(') && js.includes('!buyShops().length'), "the final shop rating and best or worst shop never offer the tester's own shop");
ok(js.includes('var APP = "app.relynked.com";') && js.includes("It is not in the app stores: open it in Chrome or Safari and sign in with the same WhatsApp number as on your form.") && js.includes('location.href = "https://" + APP;'), "the app line: app.relynked.com, not in the stores, Chrome or Safari, the same WhatsApp number");
ok(js.includes('s.mine === undefined ? view.me.role === "business" : !!s.mine'), "a page answer from before 0623 (no mine) still reads: a business tester's shops are their own");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
