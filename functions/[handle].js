/**
 * relynked.com/<handle>: a business's shop page, from the API (./_shop.js).
 * Anything that is not a handle, or that the site has a file for, or all of
 * it while shop pages are off, goes on to the site's files, untouched.
 */
import { servePage } from "./_shop.js";

export const onRequest = servePage;
