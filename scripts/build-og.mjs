// Makes the link preview pictures: one 1200x630 card per page, in the site's own
// colours and type (forest green, lime, Archivo), so a link shared on WhatsApp,
// Facebook, X or LinkedIn shows a picture that says what that page is.
//
//   assets/img/og/<page>.png               one per top-level page
//   assets/img/og/industries/<slug>.png    one per "Who it is for" page
//
// The home page keeps assets/img/og-relynked.png (the original card).
//
// This is a tool for the person editing the site, not part of the site: it is
// not deployed to anything and nothing on the site loads it. It needs Node 18+,
// Google Chrome, and the playwright-core package (npm i playwright-core in any
// folder, then point PLAYWRIGHT_CORE at its folder). Run from the site folder:
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/build-og.mjs
//
// Chrome is found in the usual places on Windows, macOS and Linux; set CHROME to
// use another. Fonts come from Google Fonts, so it needs the internet.
// After changing a card's words, run it again and commit the pictures.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const CHROMES = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);
const chrome = CHROMES.find(p => existsSync(p));
if (!chrome) throw new Error('Chrome not found. Set CHROME to its full path.');

// [file name, headline before the lime part, the lime part, the address shown]
// The words follow each page's own title and description.
const PAGES = [
  ['product', 'Products that run your operation and ', 'answer your customers', 'relynked.com/product'],
  ['how-it-works', 'Every step carries ', 'a name and a time', 'relynked.com/how-it-works'],
  ['pricing', 'A flat price. ', 'No cut of your sales.', 'relynked.com/pricing'],
  ['contact', 'Talk to the ', 'Relynked team', 'relynked.com/contact'],
  ['careers', 'We read what you send us. ', 'Tell us what you would build.', 'relynked.com/careers'],
  ['press', 'Facts, brand assets and contact for ', 'journalists', 'relynked.com/press'],
  ['privacy', 'Privacy Policy: what we collect, why, and ', 'how you control it', 'relynked.com/privacy'],
  ['terms', 'Terms of ', 'Service', 'relynked.com/terms'],
  ['refund-policy', 'Refund Policy: how to cancel and ', 'when we refund', 'relynked.com/refund-policy'],
  ['data-deletion', 'Delete your Relynked account, ', 'in the app or without it', 'relynked.com/data-deletion'],
];

// One card per industry page, worded from that page's own title.
const industries = readdirSync(join(ROOT, 'industries')).filter(f => f.endsWith('.html')).map(f => {
  const slug = f.replace(/\.html$/, '');
  const m = readFileSync(join(ROOT, 'industries', f), 'utf8').match(/<title>Business management software for (.+?) in Nigeria/);
  return m ? [`industries/${slug}`, 'Business management software for ', m[1], `relynked.com/industries/${slug}`] : null;
}).filter(Boolean);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const size = s => (s.length > 70 ? 66 : s.length > 48 ? 76 : 88);

const card = ([, before, hl, url]) => `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Manrope:wght@600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0C3E35;color:#fff;font-family:"Archivo",system-ui,sans-serif;position:relative;overflow:hidden}
.logo{position:absolute;left:84px;top:84px;display:flex;align-items:center;gap:28px}
.logo svg{width:64px;height:auto}
.logo b{font-weight:800;font-size:84px;letter-spacing:-.04em;line-height:1}
.logo sup{font-size:22px;font-weight:700;vertical-align:top;position:relative;top:-6px;margin-left:4px;letter-spacing:0}
h1{position:absolute;left:84px;right:84px;top:226px;font-weight:800;font-size:${size(before + hl)}px;letter-spacing:-.045em;line-height:1.04}
h1 span{color:#E7FE25}
.bars{position:absolute;left:84px;bottom:66px}
.bars i{display:block;height:15px;border-radius:8px}
.bars i:first-child{width:150px;background:#fff;margin-bottom:12px}
.bars i:last-child{width:210px;background:#E7FE25}
.url{position:absolute;right:84px;bottom:58px;font-family:"Manrope",sans-serif;font-weight:700;font-size:28px;color:#E7FE25}
</style>
<div class="logo"><svg viewBox="54 85 227 168"><rect x="54" y="85" width="176" height="65" rx="32.5" fill="#fff"/><rect x="54" y="186" width="227" height="67" rx="33.5" fill="#E7FE25"/></svg><b>Relynked<sup>™</sup></b></div>
<h1>${esc(before)}<span>${esc(hl)}</span></h1>
<div class="bars"><i></i><i></i></div>
<div class="url">${esc(url)}</div>`;

const browser = await chromium.launch({ executablePath: chrome });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of [...PAGES, ...industries]) {
  const out = join(ROOT, 'assets', 'img', 'og', `${c[0]}.png`);
  mkdirSync(dirname(out), { recursive: true });
  await page.setContent(card(c), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('wrote', `assets/img/og/${c[0]}.png`);
}
await browser.close();
