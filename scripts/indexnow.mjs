/**
 * Tells Bing and Yandex which relynked.com pages changed, using IndexNow, so
 * they are fetched within minutes instead of whenever a crawler comes round.
 * ChatGPT search reads Bing's index, so this is also how a new page reaches it.
 *
 * Run it AFTER a deploy (the key file must already be live at
 * https://relynked.com/<key>.txt, or the engines reject the ping):
 *
 *   node scripts/indexnow.mjs                  pages changed in the last commit
 *   node scripts/indexnow.mjs --since <ref>    pages changed since a commit or tag
 *   node scripts/indexnow.mjs --all            every page in sitemap.xml
 *   node scripts/indexnow.mjs --dry            print what would be sent, send nothing
 *   node scripts/indexnow.mjs https://relynked.com/pricing   exactly these URLs
 *
 * Needs Node 18 or newer and nothing else. The key is the 32-character hex .txt
 * file in the site root (its name and its content are the same string). The key
 * is public by design; it only proves the ping comes from someone who controls
 * the site.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'relynked.com';
const SITE = `https://${HOST}`;
// api.indexnow.org shares with every IndexNow engine; Bing and Yandex are also pinged directly.
const ENDPOINTS = ['https://www.bing.com/indexnow', 'https://yandex.com/indexnow'];

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : 'HEAD~1';
const explicit = args.filter(a => /^https?:\/\//.test(a));

const keyFile = readdirSync(ROOT).find(f => /^[0-9a-f]{32}\.txt$/.test(f) && readFileSync(join(ROOT, f), 'utf8').trim() === f.replace('.txt', ''));
if (!keyFile) { console.error('No IndexNow key file (<32 hex>.txt) found in the site root.'); process.exit(1); }
const key = keyFile.replace('.txt', '');

// A changed file becomes the URL it is served at. Only pages worth indexing count.
function urlOf(file) {
  if (file === 'index.html') return `${SITE}/`;
  if (file === 'dashboard.html') return null;
  if (/^industries\/index\.html$/.test(file)) return null;
  const m = file.match(/^((?:industries\/)?[^/]+)\.html$/);
  if (m) return `${SITE}/${m[1]}`;
  if (file === 'llms.txt' || file === 'llms-full.txt') return `${SITE}/${file}`;
  return null;
}

let urls;
if (explicit.length) urls = explicit;
else if (flag('--all')) {
  urls = [...readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
} else {
  const out = execFileSync('git', ['diff', '--name-only', since, 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  urls = out.split('\n').map(s => s.trim()).filter(Boolean).map(urlOf).filter(Boolean);
  // A changed stylesheet or script touches every page; send the sitemap's list instead.
  if (out.split('\n').some(f => /^assets\/(css|js)\//.test(f.trim()))) {
    urls = [...readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  }
}
urls = [...new Set(urls)];
if (!urls.length) { console.log('Nothing to send: no page changed.'); process.exit(0); }

const body = { host: HOST, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls };
console.log(`${urls.length} URL(s), key file ${body.keyLocation}`);
for (const u of urls) console.log('  ' + u);
if (flag('--dry')) { console.log('Dry run: nothing sent.'); process.exit(0); }

for (const endpoint of ENDPOINTS) {
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
    // 200 or 202 means accepted. 403 means the key file is not live yet. 422 means a URL is not on this host.
    console.log(`${endpoint} -> ${res.status} ${res.statusText}`);
  } catch (e) {
    console.log(`${endpoint} -> failed: ${e.message}`);
  }
}
