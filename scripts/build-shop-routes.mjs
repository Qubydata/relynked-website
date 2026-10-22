/**
 * Writes _routes.json for the shop pages (functions/[handle].js, functions/s,
 * functions/[handle]/[[rest]].js), so that requests for the site's own pages
 * and files never start a Function at all (Functions are counted on the free
 * plan). Run before publishing the site:
 *
 *   node scripts/build-shop-routes.mjs
 *
 * Everything goes to Functions except the files and folders that are on disk
 * at the top of the site, by name (pricing.html is excluded as /pricing and
 * /pricing.html). Cloudflare allows 100 rules in all.
 */
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SKIP = new Set(["functions", "scripts", "reference", "node_modules", ".git", ".wrangler", "README.md", "_routes.json", "_headers", "_redirects"]);
const exclude = ["/"];
for (const name of readdirSync(root).sort()) {
  if (SKIP.has(name) || name.startsWith(".")) continue;
  const full = join(root, name);
  if (statSync(full).isDirectory()) exclude.push(`/${name}/*`);
  else {
    exclude.push(`/${name}`);
    if (name.endsWith(".html")) exclude.push(`/${name.slice(0, -5)}`);
  }
}
// The order link's page is copied in at publish time (Remy repo, npm run build:order).
if (!exclude.includes("/o/*")) exclude.push("/o/*");
if (exclude.length + 1 > 100) {
  console.error(`_routes.json: ${exclude.length + 1} rules, over Cloudflare's 100`);
  process.exit(1);
}
writeFileSync(join(root, "_routes.json"), JSON.stringify({ version: 1, include: ["/*"], exclude }, null, 2) + "\n");
console.log(`_routes.json: ${exclude.length} paths stay static, everything else may be a shop page or /api`);
