/** relynked.com/api/beta/open: a tester's own page (beta/checkin.html, beta/feedback.html), passed to the API with the proxy secret (./_proxy.js). The one time open code from the email is in the JSON body, never in the address; the answer carries the page's long lived token. */
import { toBetaApi } from "./_proxy.js";

export const onRequestPost = (context) => toBetaApi(context, "/beta/open");
export const onRequestGet = () => new Response(JSON.stringify({ ok: false, error: "post only" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "POST", "cache-control": "no-store" } });
