/** relynked.com/api/beta/apply: one tester application, passed to the API with the proxy secret (./_proxy.js). */
import { toBetaApi } from "./_proxy.js";

export const onRequestPost = (context) => toBetaApi(context, "/beta/apply");
export const onRequestGet = () => new Response(JSON.stringify({ ok: false, error: "post only" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "POST" } });
