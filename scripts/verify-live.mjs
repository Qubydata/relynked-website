/**
 * Checks a deployed copy of the site from the outside, the way a visitor
 * sees it. The production deploy runs it against relynked.com right after
 * publishing (.github/workflows/site-deploy.yml); it works on a preview
 * address too:
 *
 *   node scripts/verify-live.mjs https://relynked.com
 *
 * It fails if:
 *   - the home page has no Content-Security-Policy header
 *   - /privacy or /data-deletion does not answer 200 (Meta's app review needs both)
 *   - any page links to app.relynked.com, relynked.app, remy.relynked.com or
 *     staff.relynked.com
 *   - any internal link or file on any page does not resolve
 *
 * Pages are found by following links from the home page and from sitemap.xml.
 */
const BASE = (process.argv[2] || "https://relynked.com").replace(/\/+$/, "");
const ORIGIN = new URL(BASE).origin;
const CLOSED = /\b(app\.relynked\.com|remy\.relynked\.com|staff\.relynked\.com|relynked\.app)\b(?![\w-])/gi;
const ATTR = /\s(?:href|src)\s*=\s*("([^"]*)"|'([^']*)')/gi;

const problems = [];
const status = new Map(); // url -> status code, so each address is fetched once

async function get(url, method = "GET") {
  for (let i = 0; i < 3; i++) {
    try {
      return await fetch(url, { method, redirect: "follow", headers: { "user-agent": "relynked-verify-live" } });
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function check(url) {
  if (status.has(url)) return status.get(url);
  let r = await get(url, "HEAD").catch(() => null);
  if (!r || r.status === 405) r = await get(url).catch(() => null);
  const code = r ? r.status : 0;
  status.set(url, code);
  return code;
}

// 1. Security headers on the home page.
const home = await get(BASE + "/");
if (!home.headers.get("content-security-policy")) problems.push("/  no Content-Security-Policy header");
console.log(`/  ${home.status}, CSP ${home.headers.get("content-security-policy") ? "present" : "MISSING"}`);

// 2. The pages Meta's review needs.
for (const path of ["/privacy", "/data-deletion"]) {
  const code = await check(BASE + path);
  console.log(`${path}  ${code}`);
  if (code !== 200) problems.push(`${path}  answered ${code}, expected 200`);
}

// 3. Every page: no closed app links, every internal link resolves.
const queue = [BASE + "/"];
const sitemap = await get(BASE + "/sitemap.xml").then(r => (r.ok ? r.text() : "")).catch(() => "");
for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const u = new URL(m[1].trim());
  queue.push(BASE + u.pathname); // sitemap names relynked.com; follow it on the address under test
}
const seen = new Set();
while (queue.length) {
  const page = queue.shift().replace(/#.*$/, "");
  if (seen.has(page)) continue;
  seen.add(page);
  const r = await get(page).catch(() => null);
  if (!r || !r.ok) {
    problems.push(`${page}  answered ${r ? r.status : "nothing"}`);
    continue;
  }
  if (!(r.headers.get("content-type") || "").includes("text/html")) continue;
  const html = await r.text();
  for (const m of html.matchAll(CLOSED)) problems.push(`${page}  links to a closed app: ${m[0]}`);
  for (const m of html.matchAll(ATTR)) {
    const raw = (m[2] ?? m[3] ?? "").replace(/&amp;/g, "&").trim();
    if (!raw || /^(mailto:|tel:|data:|javascript:|#)/i.test(raw)) continue;
    let url;
    try { url = new URL(raw, page); } catch { problems.push(`${page}  bad link: ${raw}`); continue; }
    if (url.origin !== ORIGIN || url.pathname.startsWith("/cdn-cgi/")) continue;
    url.hash = "";
    const target = url.href;
    const code = await check(target);
    if (code >= 400 || code === 0) problems.push(`${page}  broken link ${url.pathname}${url.search} (${code || "no answer"})`);
    else if (!/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.endsWith(".html")) queue.push(target);
  }
}

console.log(`${seen.size} pages, ${status.size} links checked`);
if (problems.length) {
  console.error(`${problems.length} problem(s):\n` + [...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log("Live check passed.");
