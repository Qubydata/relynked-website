/**
 * relynked.com/<handle>: a business's shop page, from the API (./_shop.js).
 * Anything that is not a handle, or that the site has a file for, goes on
 * to the site's files, untouched.
 */
import { isHandle, shopsOn, toApi } from "./_shop.js";

export async function onRequest(context) {
  const raw = String(context.params.handle || "");
  const handle = raw.toLowerCase();
  if (!shopsOn(context.env) || !isHandle(handle)) return context.next();
  // The site's own files always win, and not by asking the site first: Cloudflare Pages answers any path it has no
  // file for with the home page (200), so "was it a 404?" can never tell. _routes.json (scripts/build-shop-routes.mjs,
  // run before every deploy) keeps every file and folder the site has out of this function, and NOT_A_PAGE keeps
  // the reserved words out of it. What reaches here is a name no file has.
  if (raw !== handle) return Response.redirect(new URL(`/${handle}`, context.request.url).toString(), 301);
  return toApi(context, `/shop-pages/${handle}`);
}
