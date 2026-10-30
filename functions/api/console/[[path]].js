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
 * READ ONLY. Only GET (and HEAD) is answered, and only the four paths the
 * console uses, so this cannot be turned into a general window onto the API.
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

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const ALLOWED = new RegExp(`^(summary|log|export|businesses/${UUID})$`);

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== "GET" && request.method !== "HEAD") {
    const res = json({ error: "method_not_allowed", message: "The console is read only." }, 405);
    res.headers.set("allow", "GET, HEAD");
    return res;
  }

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
  if (!ALLOWED.test(path)) {
    return json({ error: "not_found", message: "No such console page." }, 404);
  }

  const url = new URL(request.url);
  const target = String(base).replace(/\/+$/, "") + "/admin/console/" + path + url.search;

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: { "x-admin-key": key, "cf-access-jwt-assertion": assertion },
      // A console page is not worth hanging for.
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", message: "The API could not be reached." }, 502);
  }

  // Status and body pass through as they are, so a 403 reads as "this email is
  // not allowed" and a 429 as "slow down" instead of a generic failure.
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
  const disposition = upstream.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  headers.set("cache-control", "no-store, private");
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
}
