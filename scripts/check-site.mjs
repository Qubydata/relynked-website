/**
 * The site's house rules, checked on every pull request
 * (.github/workflows/site-check.yml). Run it from this folder:
 *
 *   node scripts/check-site.mjs
 *
 * It reads only what is deployed: everything except reference/, scripts/,
 * README.md, .git, .github and .wrangler. It fails on:
 *   - an em dash or an en dash
 *   - app.relynked.com, relynked.app, remy.relynked.com or staff.relynked.com
 *     (the apps are closed behind a holding page)
 *   - "Coming soon" (only live features go on the site)
 *   - a phone number or email address other than the support line, the
 *     support email and Remy's WhatsApp line (placeholder="..." text in a
 *     form field is not checked)
 *   - _headers out of date: an inline script changed and
 *     scripts/build-headers.mjs was not run again
 *
 * It prints every problem with its file and line, and exits 1 if there is any.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["reference", "scripts", "README.md", "node_modules", ".git", ".github", ".wrangler"]);
const TEXT = new Set([".html", ".js", ".css", ".txt", ".xml", ".json", ".webmanifest", ".svg", ""]);

// The only contacts allowed on the site. Phones are compared as 0XXXXXXXXXX.
const PHONES = new Map([
  ["09162216711", "support line"],
  ["09115671307", "Remy on WhatsApp"],
]);
const EMAILS = new Set(["hello@relynked.com"]);

const RULES = [
  { name: "em or en dash", re: /[–—]|&(mdash|ndash|#8211|#8212|#x2013|#x2014);/gi },
  { name: "closed app link", re: /\b(app\.relynked\.com|remy\.relynked\.com|staff\.relynked\.com|relynked\.app)\b(?![\w-])/gi },
  { name: "Coming soon", re: /coming\s+soon/gi },
];
const PHONE = /(?<![\w.])(?:\+?234[\s-]?|0)[789][01](?:[\s-]?\d){8}(?![\w.])/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const FILENAME = /\.(png|jpe?g|webp|avif|gif|svg|ico|css|js|mjs)$/i; // icon@2x.png is a file, not an email
const PLACEHOLDER =/\splaceholder\s*=\s*("[^"]*"|'[^']*')/gi;

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (TEXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

const problems = [];
function report(file, text, index, rule, found) {
  const line = text.slice(0, index).split("\n").length;
  problems.push(`${relative(ROOT, file)}:${line}  ${rule}: ${found}`);
}

for (const file of files(ROOT)) {
  const text = readFileSync(file, "utf8");
  for (const { name, re } of RULES) {
    for (const m of text.matchAll(re)) report(file, text, m.index, name, m[0]);
  }
  const blanked = text.replace(PLACEHOLDER, s => " ".repeat(s.length));
  for (const m of blanked.matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, "").replace(/^234/, "0");
    if (!PHONES.has(digits)) report(file, text, m.index, "phone not allowed", m[0]);
  }
  for (const m of blanked.matchAll(EMAIL)) {
    if (FILENAME.test(m[0])) continue;
    if (!EMAILS.has(m[0].toLowerCase())) report(file, text, m.index, "email not allowed", m[0]);
  }
}

// _headers must be what build-headers.mjs writes from the pages as they are.
// It is rebuilt in a throwaway copy so this check never changes the folder.
const tmp = mkdtempSync(join(tmpdir(), "relynked-check-"));
try {
  cpSync(ROOT, tmp, { recursive: true, filter: src => !/[\\/](\.git|node_modules|\.wrangler)$/.test(src) });
  execFileSync(process.execPath, [join(tmp, "scripts", "build-headers.mjs")], { stdio: "ignore" });
  const norm = s => s.replace(/\r\n?/g, "\n");
  const have = norm(readFileSync(join(ROOT, "_headers"), "utf8"));
  const want = norm(readFileSync(join(tmp, "_headers"), "utf8"));
  if (have !== want) problems.push("_headers  out of date: an inline script changed. Run node scripts/build-headers.mjs and commit _headers.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n` + problems.join("\n"));
  process.exit(1);
}
console.log("Site check passed.");
