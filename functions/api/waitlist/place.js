/**
 * relynked.com/api/waitlist/place?code=CODE: the place in line for a share code, and nothing else. Only a code of the
 * right shape is passed on (6 of the share code letters); anything else is answered 404 here, without asking the API.
 */
import { toBetaApi } from "../beta/_proxy.js";

export const CODE = /^[A-HJKMNP-Z2-9]{6}$/;

/** The code from the address, upper cased, or null. Pure. */
export function codeFrom(url) {
  let raw = "";
  try {
    raw = new URL(url).searchParams.get("code") || "";
  } catch {
    return null;
  }
  const c = raw.trim().toUpperCase();
  return CODE.test(c) ? c : null;
}

export const onRequestGet = (context) => {
  const code = codeFrom(context.request.url);
  if (!code) return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  return toBetaApi(context, `/waitlist/place?code=${code}`);
};
