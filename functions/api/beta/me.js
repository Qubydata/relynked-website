/** relynked.com/api/beta/me: a tester's own page (beta/checkin.html, beta/feedback.html), passed to the API with the proxy secret (./_proxy.js). The link's token is in the JSON body, never in the address. */
import { toBetaApi } from "./_proxy.js";

export const onRequestPost = (context) => toBetaApi(context, "/beta/me");
export const onRequestGet = () => new Response(JSON.stringify({ ok: false, error: "post only" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "POST", "cache-control": "no-store" } });
