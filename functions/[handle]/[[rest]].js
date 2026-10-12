/**
 * relynked.com/<handle>/photo/<file> and relynked.com/<handle>/report, from
 * the API (../_shop.js). Any other path under a first segment goes on to the
 * site's own files (/industries/..., /assets/..., /o/... are never handles).
 */
import { isHandle, toApi } from "../_shop.js";

const PHOTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(t|l)\.jpg$/;

export async function onRequest(context) {
  const handle = String(context.params.handle || "");
  const rest = Array.isArray(context.params.rest) ? context.params.rest : [];
  if (!isHandle(handle)) return context.next();
  if (rest.length === 2 && rest[0] === "photo" && PHOTO.test(rest[1])) return toApi(context, `/shop-pages/${handle}/photo/${rest[1]}`);
  if (rest.length === 1 && rest[0] === "report") return toApi(context, `/shop-pages/${handle}/report`);
  return context.next();
}
