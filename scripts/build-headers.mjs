/**
 * Writes _headers for Cloudflare Pages: the security headers every page of
 * relynked.com carries (security review 2026-09-30, web-1). Run it from this
 * folder before every deploy (the README's deploy line does):
 *
 *   node scripts/build-headers.mjs
 *
 * WHY A SCRIPT AND NOT A FIXED FILE. Careers, press, the dashboard and the
 * Shift mock-up keep their script inside the page. Scripts may run only from
 * this site, so each inline script is allowed by the SHA-256 of its exact
 * text, read from the pages here. After changing one of those scripts, run
 * this again, or that page's script stops running on the live site.
 *
 * WHAT THE SITE LOADS, and so what the policy allows:
 *   - Google Fonts
 *   - the Google map on Contact (a frame from www.google.com)
 *   - the dashboard's status reading from the Relynked API
 *   - the forms and metrics under /api (Pages Functions, same site)
 *   - data: for the small inline SVG icons
 * No camera, microphone or location. Nothing may frame the site.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const API = "https://relynked-api-production.up.railway.app";
const SKIP = new Set(["node_modules", "reference", "functions", "scripts", ".git", ".wrangler"]);

function htmlFiles(d) {
  const out = [];
  for (const name of readdirSync(d)) {
    if (SKIP.has(name)) continue;
    const p = join(d, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

// The browser hashes the script text after turning CRLF and CR into LF, so
// the same is done here or a Windows checkout would hash differently.
// JSON-LD blocks are data, never run, and need no hash.
const hashes = new Set();
for (const file of htmlFiles(decodeURIComponent(ROOT))) {
  const html = readFileSync(file, "utf8");
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? "";
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && type !== "module" && type !== "text/javascript") continue;
    const text = m[2].replace(/\r\n?/g, "\n");
    hashes.add(`'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`);
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].sort().join(" ")}`.trim(),
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src 'self' ${API}`,
  "frame-src https://www.google.com",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const permissions = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "serial=()",
  "hid=()",
  "bluetooth=()",
  "midi=()",
  "display-capture=()",
  "accelerometer=()",
  "gyroscope=()",
  "magnetometer=()",
  "browsing-topics=()",
].join(", ");

const headers = `# Written by scripts/build-headers.mjs. Do not edit by hand: change the
# script and run it again.
/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: ${permissions}
`;

writeFileSync(join(decodeURIComponent(ROOT), "_headers"), headers, "utf8");
console.log(`_headers: ${hashes.size} inline script hash(es)`);
