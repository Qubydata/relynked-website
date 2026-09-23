/**
 * The dashboard's way to reach platform metrics without holding a secret.
 *
 * WHY A PROXY AT ALL. The metrics endpoint needs a key, and a browser cannot
 * keep one: anything the page can send, anyone reading the page can send
 * too. So the key lives here, in a Cloudflare Pages Function running at the
 * edge, and the browser asks this instead. Same origin, no credential, no
 * CORS.
 *
 * IT FAILS CLOSED, and that is the important property. The Cloudflare Access
 * application in front of the dashboard protects `relynked.com/dashboard`.
 * This file answers a DIFFERENT path, `/api/metrics`, which Access does not
 * cover unless it is deliberately added as a second destination. Rather than
 * trust that it was, this refuses any request arriving without Access's
 * signed assertion header. So if the Access configuration is missing or is
 * later changed, the endpoint stops working rather than quietly becoming an
 * open window onto the platform's commercial position.
 *
 * Presence of the header, not verification of its signature, is what is
 * checked. That is honest about what it buys: Cloudflare injects that header
 * on requests it proxies and strips any a caller supplies, so presence means
 * the request came through Access. Verifying the signature would add
 * defence against a Cloudflare-level compromise and needs the account's
 * public keys fetched and cached; worth doing if this ever returns anything
 * richer than counts.
 */
const API = "https://relynked-api-production.up.railway.app/admin/metrics";

const json = (body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Commercial figures should not sit in a shared cache anywhere.
      "cache-control": "no-store, private",
    },
  });

export async function onRequestGet(context) {
  const key = context.env.ADMIN_METRICS_KEY;
  if (!key) {
    return json({ error: "not_configured", detail: "ADMIN_METRICS_KEY is not set on this Pages project." }, 503);
  }

  const assertion = context.request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    return json(
      {
        error: "not_behind_access",
        detail:
          "This request did not come through Cloudflare Access. Add relynked.com/api/metrics as a destination on the Relynked Dashboard application.",
      },
      401,
    );
  }

  let upstream;
  try {
    upstream = await fetch(API, {
      headers: { "x-admin-key": key },
      // A dashboard tile is not worth hanging a page for.
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", detail: String((e && e.message) || e) }, 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    // Passed through rather than flattened, so a 401 here reads as "the key
    // is wrong" instead of a generic failure the dashboard cannot explain.
    return json({ error: "upstream_error", status: upstream.status, detail: text.slice(0, 300) }, 502);
  }

  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" },
  });
}
