/**
 * The customer console's way to reach the Vettar API without holding a secret.
 *
 * WHY A PROXY AT ALL. The console endpoints need a key, and a browser cannot
 * keep one: anything the page can send, anyone reading the page can send too.
 * So the key (ADMIN_CONSOLE_KEY) lives here, in a Cloudflare Pages Function
 * running at the edge, and console.html asks this instead. Same origin, no
 * credential in the browser, no CORS.
 *
 * IT FAILS CLOSED, and that is the important property. The Cloudflare Access
 * application in front of the dashboard protects specific paths
 * (relynked.com/dashboard, relynked.com/console). This file answers a
 * DIFFERENT path, `/api/console/*`, which Access does not cover unless it is
 * deliberately added as a destination. Rather than trust that it was, this
 * refuses any request arriving without Access's signed assertion header
 * (`cf-access-jwt-assertion`). So if the Access configuration is missing or is
 * later changed, the endpoint stops working rather than quietly becoming an
 * open window onto customer names, phones and emails.
 *
 * Presence of the header is all this file checks. Cloudflare injects that
 * header on requests it proxies and strips any a caller supplies, so presence
 * means the request came through Access. The real verification happens in the
 * API: this forwards the assertion unchanged, and the API checks its signature
 * against the Access team keys, reads the email out of it, and refuses any
 * email not on its allow list. The proxy is a door that is shut by default; the
 * API decides who may walk through.
 *
 * READ ONLY, WITH ONE EXCEPTION. Business data is only ever read: GET (and
 * HEAD) on `summary`, `log`, `export` and `businesses/<uuid>`. The only writes
 * are the founder's own changes to who may open the console: POST on `team`
 * and `team/remove`. The API accepts those from the founder's email only and
 * touches nothing but the team list. Nothing else can be POSTed, so this
 * cannot be turned into a general window onto the API.
 *
 * WHY A POST CHECKS THE ORIGIN AND THE BODY TYPE. The browser attaches the
 * founder's Access cookie to any request aimed at relynked.com, including one
 * fired by a different website he happens to have open (cross-site request
 * forgery). A GET that only reads is harmless to him; a POST that adds a
 * stranger to the team is not. So a POST is refused unless its Origin header
 * is this site's own origin (another site cannot make a browser lie about
 * that), and unless it says it is JSON: a plain HTML form cannot send
 * `application/json`, and a cross-site script that tries needs a CORS
 * preflight that this site never grants. The body is capped at 2 KB.
 *
 * Pages variables: ADMIN_CONSOLE_KEY (same value as on the API) and
 * VETTAR_API_URL (base address of the API, no trailing slash).
 */

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Customer contact details should not sit in a shared cache anywhere.
      "cache-control": "no-store, private",
    },
  });

const MAX_BODY = 2048;

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const READS = new RegExp(`^(summary|log|export|team|businesses/${UUID})$`);
const WRITES = /^(team|team\/remove)$/;

// The body, or null when it is bigger than the cap. Read as a stream so a
// large upload is cut off instead of buffered.
async function readCapped(request, cap) {
  const len = Number(request.headers.get("content-length"));
  if (Number.isFinite(len) && len > cap) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      try { await reader.cancel(); } catch (e) { /* already closing */ }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

export async function onRequest(context) {
  const { request, env, params } = context;

  const method = request.method;
  const notAllowed = (allow) => {
    const res = json({ error: "method_not_allowed", message: "That is not allowed here." }, 405);
    res.headers.set("allow", allow);
    return res;
  };
  if (method !== "GET" && method !== "HEAD" && method !== "POST") return notAllowed("GET, HEAD, POST");

  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    return json(
      {
        error: "not_behind_access",
        message:
          "This request did not come through Cloudflare Access. Add relynked.com/api/console as a destination on the Access application.",
      },
      401,
    );
  }

  const key = env && env.ADMIN_CONSOLE_KEY;
  const base = env && env.VETTAR_API_URL;
  if (!key || !base) {
    const missing = [];
    if (!key) missing.push("ADMIN_CONSOLE_KEY");
    if (!base) missing.push("VETTAR_API_URL");
    return json(
      { error: "not_configured", message: "Not set on this Pages project: " + missing.join(", ") + "." },
      503,
    );
  }

  const parts = Array.isArray(params && params.path) ? params.path : params && params.path ? [params.path] : [];
  const path = parts.join("/");
  const reads = READS.test(path);
  const writes = WRITES.test(path);
  if (!reads && !writes) {
    return json({ error: "not_found", message: "No such console page." }, 404);
  }
  if (method === "POST" ? !writes : !reads) return notAllowed(reads && writes ? "GET, HEAD, POST" : writes ? "POST" : "GET, HEAD");

  let body;
  if (method === "POST") {
    // Same-origin only. An absent Origin is refused too: the page's own
    // fetch always sends one on a POST.
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      return json({ error: "bad_origin", message: "That request did not come from the console page." }, 403);
    }
    if (!/^application\/json/i.test(request.headers.get("content-type") || "")) {
      return json({ error: "unsupported_media_type", message: "The body must be JSON." }, 415);
    }
    body = await readCapped(request, MAX_BODY);
    if (body === null) return json({ error: "too_large", message: "That request is too big." }, 413);
  }

  const url = new URL(request.url);
  const target = String(base).replace(/\/+$/, "") + "/admin/console/" + path + url.search;

  let upstream;
  try {
    const headers = { "x-admin-key": key, "cf-access-jwt-assertion": assertion };
    if (method === "POST") headers["content-type"] = "application/json";
    upstream = await fetch(target, {
      method,
      headers,
      ...(method === "POST" ? { body } : {}),
      // A console page is not worth hanging for.
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", message: "The API could not be reached." }, 502);
  }

  // Status and body pass through as they are, so a 403 reads as "this email is
  // not allowed" and a 429 as "slow down" instead of a generic failure.
  const out = new Headers();
  out.set("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) out.set("content-disposition", disposition);
  out.set("cache-control", "no-store, private");
  return new Response(method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: out });
}
