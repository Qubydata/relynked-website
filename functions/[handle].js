/**
 * relynked.com/<handle>: a business's shop page, from the API (./_shop.js).
 * Anything that is not a handle, or that the site has a file for, goes on
 * to the site's files, untouched.
 */
import { isHandle, toApi } from "./_shop.js";

export async function onRequest(context) {
  const raw = String(context.params.handle || "");
  const handle = raw.toLowerCase();
  if (!isHandle(handle)) return context.next();
  // The site's own files always win: a page added to the site later is never taken for a shop.
  const own = await context.next();
  if (own.status !== 404) return own;
  if (raw !== handle) return Response.redirect(new URL(`/${handle}`, context.request.url).toString(), 301);
  return toApi(context, `/shop-pages/${handle}`);
}
