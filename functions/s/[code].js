/**
 * relynked.com/s/<code>: a business's permanent short link (the website its
 * Meta business portfolio keeps). The API answers with a redirect to the
 * page's current address, or the simple page while the full page is off.
 */
import { toApi } from "../_shop.js";

const CODE = /^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/;

export async function onRequest(context) {
  const code = String(context.params.code || "");
  if (!CODE.test(code)) return context.next();
  return toApi(context, `/shop-pages/s/${code}`);
}
