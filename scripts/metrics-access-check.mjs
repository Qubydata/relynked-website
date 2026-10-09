// Checks functions/api/metrics.js verifies the Cloudflare Access token
// (security review 2026-10-09): a made-up header, a token signed by anyone
// else, for another application or team, or out of date is refused, and only
// a real one reaches the API. Nothing real is called: fetch is replaced with a
// stand-in team that serves its own keys, and a stand-in API.
//
// Run from this folder: node scripts/metrics-access-check.mjs
import { readFileSync } from "node:fs";

// The function is a plain .js file with no package.json: load its text as a module.
const source = readFileSync(new URL("../functions/api/metrics.js", import.meta.url), "utf8");
const { onRequestGet } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

let passes = 0;
let failures = 0;
const check = (ok, label) => {
  if (ok) {
    passes++;
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.error(`FAIL: ${label}`);
  }
};

const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const part = (obj) => b64url(enc.encode(JSON.stringify(obj)));

async function keyPair() {
  return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}
async function sign(privateKey, header, claims) {
  const head = `${part(header)}.${part(claims)}`;
  const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, privateKey, enc.encode(head));
  return `${head}.${b64url(new Uint8Array(sig))}`;
}

const team = (n) => `team${n}.cloudflareaccess.com`;
const AUD = "a1b2c3d4e5f6-dashboard-aud";
const teamKey = await keyPair();
const strangerKey = await keyPair();
const teamJwk = { ...(await crypto.subtle.exportKey("jwk", teamKey.publicKey)), kid: "kid-1" };

let apiCalls = 0;
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith("/cdn-cgi/access/certs")) return new Response(JSON.stringify({ keys: [teamJwk] }), { status: 200 });
  if (u.includes("/admin/metrics")) {
    apiCalls++;
    return new Response(JSON.stringify({ businesses: 3 }), { status: 200 });
  }
  return new Response("not found", { status: 404 });
};

let n = 0;
async function ask(token, envOver = {}) {
  n++;
  const env = { ADMIN_METRICS_KEY: "k", CF_ACCESS_TEAM_DOMAIN: team(n), CF_ACCESS_AUD: AUD, ...envOver };
  const t = String(env.CF_ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const headers = new Headers();
  if (token !== null) headers.set("cf-access-jwt-assertion", typeof token === "function" ? await token(t) : token);
  const res = await onRequestGet({ request: new Request("https://relynked.com/api/metrics", { headers }), env });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const now = Math.floor(Date.now() / 1000);
const good = (t, over = {}) => ({ iss: `https://${t}`, aud: [AUD], sub: "founder", email: "founder@example.com", iat: now - 10, nbf: now - 10, exp: now + 600, ...over });
const header = { alg: "RS256", kid: "kid-1", typ: "JWT" };

let before = apiCalls;
const none = await ask(null);
check(none.status === 401 && none.body?.error === "not_behind_access", "1 no Access header: refused");
const fake = await ask("anything-at-all");
check(fake.status === 401 && fake.body?.error === "access_token_refused", "2 a made-up cf-access-jwt-assertion header is refused (it used to be enough)");
const fakeJwt = await ask(`${part(header)}.${part(good(team(n + 1)))}.${b64url(enc.encode("not a signature"))}`);
check(fakeJwt.status === 401 && fakeJwt.body?.reason === "bad_signature", "3 a well formed token with a forged signature is refused");
const stranger = await ask((t) => sign(strangerKey.privateKey, header, good(t)));
check(stranger.status === 401 && stranger.body?.reason === "bad_signature", "4 a token signed by someone else's key under the team's key id is refused");
const unknownKid = await ask((t) => sign(teamKey.privateKey, { ...header, kid: "kid-9" }, good(t)));
check(unknownKid.status === 401 && unknownKid.body?.reason === "unknown_key", "5 a key id the team does not publish is refused");
const none2 = await ask((t) => sign(teamKey.privateKey, { alg: "none", kid: "kid-1" }, good(t)));
check(none2.status === 401 && none2.body?.reason === "bad_algorithm", "6 alg none (or anything but RS256) is refused");
const otherApp = await ask((t) => sign(teamKey.privateKey, header, good(t, { aud: ["another-application"] })));
check(otherApp.status === 401 && otherApp.body?.reason === "wrong_audience", "7 a real token for another Access application is refused (audience)");
const otherTeam = await ask((t) => sign(teamKey.privateKey, header, good(t, { iss: "https://someone-else.cloudflareaccess.com" })));
check(otherTeam.status === 401 && otherTeam.body?.reason === "wrong_issuer", "8 a token from another team is refused (issuer)");
const old = await ask((t) => sign(teamKey.privateKey, header, good(t, { exp: now - 3600, iat: now - 7200, nbf: now - 7200 })));
check(old.status === 401 && old.body?.reason === "expired", "9 an expired token is refused");
const early = await ask((t) => sign(teamKey.privateKey, header, good(t, { nbf: now + 3600 })));
check(early.status === 401 && early.body?.reason === "not_yet_valid", "10 a token not valid yet is refused");
check(apiCalls === before, "11 none of those reached the API with the admin key");
const unset = await ask((t) => sign(teamKey.privateKey, header, good(t)), { CF_ACCESS_AUD: "" });
check(unset.status === 503 && unset.body?.error === "not_configured", "12 without the audience setting it fails closed (503), never trusting the header");

before = apiCalls;
const real = await ask((t) => sign(teamKey.privateKey, header, good(t)));
check(real.status === 200 && real.body?.businesses === 3 && apiCalls === before + 1, "13 a real Access token for this application reaches the API");
const realUrl = await ask((t) => sign(teamKey.privateKey, header, good(t)), { CF_ACCESS_TEAM_DOMAIN: `https://${team(n + 1)}/` });
check(realUrl.status === 200, "14 the team domain may be given as a URL");

console.log(failures === 0 ? `\nALL PASS: ${passes} passed` : `\n${failures} FAILURE(S): ${passes} passed`);
process.exit(failures === 0 ? 0 : 1);
