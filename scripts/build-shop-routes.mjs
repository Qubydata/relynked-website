/**
 * Writes _routes.json for the shop pages (functions/[handle].js, functions/s,
 * functions/[handle]/[[rest]].js), so that requests for the site's own pages
 * and files never start a Function at all (Functions are counted on the free
 * plan), and a page of the site can never be answered as a shop. Run before
 * publishing the site, and after adding, renaming or removing a page or a
 * folder at the top of the site:
 *
 *   node scripts/build-shop-routes.mjs           writes _routes.json
 *   node scripts/build-shop-routes.mjs --check   changes nothing; fails when _routes.json is out of date
 *
 * Everything goes to Functions except the files and folders that are on disk
 * at the top of the site, by name (pricing.html is excluded as /pricing and
 * /pricing.html; a folder as /industries and /industries/*, so the folder's
 * own address and its _redirects line stay with the site). Cloudflare allows
 * 100 rules in all.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["functions", "scripts", "reference", "docs", "node_modules", ".git", ".github", ".wrangler", "README.md", "_routes.json", "_headers", "_redirects"]);

/** The rules for the folder `dir`, from what is on disk. Pure but for reading the folder. */
export function shopRoutes(dir = root) {
  const exclude = ["/"];
  for (const name of readdirSync(dir).sort()) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) exclude.push(`/${name}`, `/${name}/*`);
    else {
      exclude.push(`/${name}`);
      if (name.endsWith(".html")) exclude.push(`/${name.slice(0, -5)}`);
    }
  }
  // The order link's page is copied in at publish time (Remy repo, npm run build:order).
  for (const r of ["/o", "/o/*"]) if (!exclude.includes(r)) exclude.push(r);
  return { version: 1, include: ["/*"], exclude };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const routes = shopRoutes();
  const rules = routes.include.length + routes.exclude.length;
  if (rules > 100) {
    console.error(`_routes.json: ${rules} rules, over Cloudflare's 100`);
    process.exit(1);
  }
  const text = JSON.stringify(routes, null, 2) + "\n";
  const file = join(root, "_routes.json");
  if (process.argv.includes("--check")) {
    let now = "";
    try {
      now = readFileSync(file, "utf8");
    } catch {
      now = "";
    }
    if (now !== text) {
      console.error("_routes.json is out of date: run node scripts/build-shop-routes.mjs and commit it (a page the routes do not list would be asked of the shop pages).");
      process.exit(1);
    }
    console.log(`_routes.json is up to date (${routes.exclude.length} paths stay static, ${rules} rules of 100)`);
  } else {
    writeFileSync(file, text);
    console.log(`_routes.json: ${routes.exclude.length} paths stay static, everything else may be a shop page or /api (${rules} rules of 100)`);
  }
}
