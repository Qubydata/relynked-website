/** relynked.com/api/beta/resend: a tester's own page (beta/checkin.html, beta/feedback.html), passed to the API with the proxy secret (./_proxy.js). "Send me a new link": the used open code (or a typed email) is in the JSON body; the answer is always the same. */
import { toBetaApi } from "./_proxy.js";

export const onRequestPost = (context) => toBetaApi(context, "/beta/resend");
export const onRequestGet = () => new Response(JSON.stringify({ ok: false, error: "post only" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "POST", "cache-control": "no-store" } });
