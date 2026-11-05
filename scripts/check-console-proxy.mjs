// Checks the console proxy's method and path allowlist (functions/api/console/[[path]].js).
// Run: node scripts/check-console-proxy.mjs
// The Pages Function is loaded from a temporary .mjs copy so Node reads it as a module, and fetch is replaced by a stub
// that records what would have gone to the API. Nothing is sent anywhere.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "functions", "api", "console", "[[path]].js"), "utf8");
const dir = mkdtempSync(join(tmpdir(), "console-proxy-"));
const file = join(dir, "proxy.mjs");
writeFileSync(file, src);
const { onRequest } = await import(pathToFileURL(file).href);

let calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
};

const ORIGIN = "https://relynked.com";
const UUID = "0f1e2d3c-4b5a-4697-8899-aabbccddeeff";
const env = { ADMIN_CONSOLE_KEY: "k".repeat(40), VETTAR_API_URL: "https://api.example.test/" };
let failures = 0, passes = 0;
const ok = (c, l, d) => { if (c) { passes++; console.log("PASS: " + l); } else { failures++; console.error("FAIL: " + l + (d !== undefined ? "\n  " + JSON.stringify(d) : "")); } };

async function ask(method, path, opts = {}) {
  calls = [];
  const headers = {};
  if (opts.access !== false) headers["cf-access-jwt-assertion"] = "signed.assertion";
  if (method === "POST") {
    if (opts.origin !== null) headers["origin"] = opts.origin || ORIGIN;
    headers["content-type"] = opts.type || "application/json";
  }
  const init = { method, headers };
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") init.body = opts.body === undefined ? "{}" : opts.body;
  const request = new Request(ORIGIN + "/api/console/" + path, init);
  const res = await onRequest({ request, env, params: { path: path.split("/") } });
  return { status: res.status, called: calls.length > 0, call: calls[0] };
}
const body = JSON.stringify({ verified: true, confirmName: "Example Builders Ltd", note: "Called, saw the certificate" });

// reads pass
for (const p of ["summary", "log", "export?list=businesses&segment=all", "verify-queue", "team", `businesses/${UUID}`]) {
  const r = await ask("GET", p.split("?")[0]);
  ok(r.status === 200 && r.called && r.call.method === "GET", `GET ${p.split("?")[0]} passes`, r);
}
const head = await ask("HEAD", "summary");
ok(head.status === 200, "HEAD summary passes");

// the verify write passes, on exactly one path
const good = await ask("POST", `businesses/${UUID}/verify`, { body });
ok(good.status === 200 && good.called && good.call.method === "POST" && good.call.url === `https://api.example.test/admin/console/businesses/${UUID}/verify` && good.call.body === body && good.call.headers["x-admin-key"] === env.ADMIN_CONSOLE_KEY && good.call.headers["cf-access-jwt-assertion"] === "signed.assertion", "POST businesses/<uuid>/verify passes, to the API's verify route, with the key and the assertion", good);
const upper = await ask("POST", `businesses/${UUID.toUpperCase()}/verify`, { body });
ok(upper.status === 200, "POST with an upper case uuid passes");
for (const p of ["summary", "log", "export", "verify-queue", `businesses/${UUID}`, `businesses/${UUID}/verify/extra`, `businesses/${UUID}/unverify`, `businesses/${UUID}/verify/..`, "businesses/not-a-uuid/verify", "businesses/verify", "admin/summary", "verify"]) {
  const r = await ask("POST", p);
  ok(!r.called && (r.status === 404 || r.status === 405), `POST ${p} is refused and never reaches the API`, r);
}
ok((await ask("POST", "team", { body: JSON.stringify({ email: "a@b.co", role: "viewer" }) })).status === 200 && (await ask("POST", "team/remove", { body: JSON.stringify({ email: "a@b.co" }) })).status === 200, "the existing team writes still pass");
for (const m of ["PUT", "PATCH", "DELETE"]) {
  for (const p of [`businesses/${UUID}/verify`, `businesses/${UUID}`, "summary", "team"]) {
    const r = await ask(m, p);
    ok(r.status === 405 && !r.called, `${m} ${p} is refused (405) and never reaches the API`, r);
  }
}
const getVerify = await ask("GET", `businesses/${UUID}/verify`);
ok(getVerify.status === 405 && !getVerify.called, "GET on the verify path is refused");

// every existing refusal still holds on the new path
const noAccess = await ask("POST", `businesses/${UUID}/verify`, { body, access: false });
ok(noAccess.status === 401 && !noAccess.called, "a request that did not come through Access is 401");
const noAccessGet = await ask("GET", "summary", { access: false });
ok(noAccessGet.status === 401 && !noAccessGet.called, "and so is a GET");
const noOrigin = await ask("POST", `businesses/${UUID}/verify`, { body, origin: null });
const evil = await ask("POST", `businesses/${UUID}/verify`, { body, origin: "https://evil.example" });
ok(noOrigin.status === 403 && evil.status === 403 && !noOrigin.called && !evil.called, "a POST with no Origin, or another site's, is 403");
const form = await ask("POST", `businesses/${UUID}/verify`, { body: "verified=true", type: "application/x-www-form-urlencoded" });
ok(form.status === 415 && !form.called, "a POST that is not JSON is 415");
const big = await ask("POST", `businesses/${UUID}/verify`, { body: JSON.stringify({ verified: true, confirmName: "x", note: "n".repeat(2100) }) });
ok(big.status === 413 && !big.called, "a body over 2 KB is 413");
const edge = await ask("POST", `businesses/${UUID}/verify`, { body: JSON.stringify({ note: "n".repeat(2048 - 11) }) });
ok(edge.status === 200 && edge.call.body.length === 2048, "a body of exactly 2 KB passes", edge.status);
const savedKey = env.ADMIN_CONSOLE_KEY; env.ADMIN_CONSOLE_KEY = "";
const noKey = await ask("POST", `businesses/${UUID}/verify`, { body });
env.ADMIN_CONSOLE_KEY = savedKey;
ok(noKey.status === 503 && !noKey.called, "with no key on this project it is 503");

console.log(failures === 0 ? `\nALL PASS: ${passes} passed` : `\n${failures} FAILED, ${passes} passed`);
process.exit(failures > 0 ? 1 : 0);
