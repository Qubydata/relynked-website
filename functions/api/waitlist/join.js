/** relynked.com/api/waitlist/join: one person joining the waitlist, passed to the API with the proxy secret (../beta/_proxy.js). */
import { toBetaApi } from "../beta/_proxy.js";

export const onRequestPost = (context) => toBetaApi(context, "/waitlist/join");
export const onRequestGet = () => new Response(JSON.stringify({ ok: false, error: "post only" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: "POST" } });
