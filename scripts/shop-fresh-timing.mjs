/**
 * How long an edit in the app takes to show on the shop page: edits one item as a business's owner through the API, then
 * polls the page on the site until the change is there. Reports the seconds for each run.
 *
 *   SHOP_TEST_PASSWORD=... node scripts/shop-fresh-timing.mjs [runs] [--phone 08000000003] [--handle mama-put-kitchen]
 *        [--api https://relynked-api-staging.up.railway.app] [--site https://shop-staging.relynked-3wg.pages.dev]
 *
 * The defaults are the test server and the preview with the test business Mama Put Kitchen (the password is in
 * remy-hq/testing/test-accounts.md, never in this file). Only ever the test server: the item's description is changed
 * for a few seconds and put back. Before the fast shop pages (30 second edge, 15 second API cache) it took 26 to 29
 * seconds; the goal is under 10.
 */
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const API = arg("api", "https://relynked-api-staging.up.railway.app");
const SITE = arg("site", "https://shop-staging.relynked-3wg.pages.dev");
const HANDLE = arg("handle", "mama-put-kitchen");
const RUNS = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 5);
if (/^https:\/\/(www\.)?relynked\.com/.test(SITE) || /relynked-api-production/.test(API)) { console.log("Test server only."); process.exit(2); }
const rf = async (u, o) => { for (let i = 0; i < 5; i++) { try { return await fetch(u, o); } catch (e) { await new Promise((r) => setTimeout(r, 400)); } } return fetch(u, o); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const j = async (path, opts = {}) => { const r = await rf(API + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } }); const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; } return { status: r.status, body: b }; };
const login = await j("/auth/login", { method: "POST", body: JSON.stringify({ phone: arg("phone","08000000003"), password: process.env.SHOP_TEST_PASSWORD || "" }) });
if (login.status !== 200) { console.log("login failed", login.status); process.exit(1); }
const auth = { authorization: `Bearer ${login.body.sessionToken}` };
const list = await j("/resources", { headers: auth });
const items = Array.isArray(list.body) ? list.body : list.body.resources || [];
const item = items.find((i) => i.name === "Puff Puff") || items.find((i) => i.name === "Zobo") || items[0];
console.log("item", item.name, item.id);
const original = item.menu_description ?? null;
const times = [];
for (let n = 1; n <= RUNS; n++) {
  const token = `speedcheck ${Date.now().toString(36)}`;
  // Warm the page so a stale copy is cached at the edge, as it would be with real visitors.
  await rf(`${SITE}/${HANDLE}`);
  await sleep(1500);
  const t0 = Date.now();
  const put = await j(`/resources/${item.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ menuDescription: token }) });
  if (put.status >= 300) { console.log("edit failed", put.status, JSON.stringify(put.body).slice(0, 200)); break; }
  const tEdit = Date.now();
  let shown = null;
  while (Date.now() - t0 < 120000) {
    const r = await rf(`${SITE}/${HANDLE}`, { cache: "no-store" });
    const t = await r.text();
    if (t.includes(token)) { shown = (Date.now() - tEdit) / 1000; break; }
    await sleep(250);
  }
  times.push(shown);
  console.log(`run ${n}: ${shown === null ? "NOT SHOWN in 120s" : shown.toFixed(1) + " s"}`);
  await sleep(2000);
}
await j(`/resources/${item.id}`, { method: "PUT", headers: auth, body: JSON.stringify({ menuDescription: original }) });
const ok = times.filter((x) => x !== null);
console.log("seconds:", times.map((x) => x?.toFixed(1)).join(", "), "| max", Math.max(...ok).toFixed(1), "avg", (ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(1));
