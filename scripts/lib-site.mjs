// Shared by build-jsonld.mjs and build-llms.mjs: facts read from the site's own
// pages, so the machine-readable copies (JSON-LD, llms.txt) cannot drift from
// what the pages say. Nothing here is typed in a second time.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://relynked.com';
export const APP = 'https://app.relynked.com/';
export const read = f => readFileSync(join(ROOT, f), 'utf8');

export const COMPANY = {
  name: 'Relynked',
  legalName: 'Relynked Ltd',
  rc: 'RC 9837720',
  email: 'hello@relynked.com',
  phoneLocal: '0911 567 1307',
  phoneIntl: '+2349115671307',
  street: '7B Edegbe Street, off Giwa-Amu Street, GRA',
  city: 'Benin City',
  region: 'Edo State',
  country: 'NG',
  social: ['https://www.instagram.com/relynkedltd/'],
};

// "7 days", from --trial-days in the stylesheet (the one place it is written).
export function trialDays() {
  const m = read('assets/css/styles.css').match(/--trial-days:\s*"([^"]+)"/);
  if (!m) throw new Error('Could not find --trial-days in assets/css/styles.css');
  return m[1];
}

const num = s => Number(s.replace(/[^\d]/g, ''));

// Plans, read from pricing.html: Basic and Standard with month, quarter and year
// prices, and Enterprise's "from" price. Throws if the markup changes, so a
// redesign cannot silently publish stale prices.
export function plans() {
  const html = read('pricing.html');
  const out = [];
  for (const m of html.matchAll(/<div class="plan[^"]*"><div class="pn">([^<]+)<\/div><div class="pp"([^>]*)>([\s\S]*?)<\/div><div class="psave">/g)) {
    const name = m[1].trim();
    const pp = m[3];
    const bm = pp.match(/<span class="bm">₦([\d,]+)/);
    const bq = pp.match(/<span class="bq">₦([\d,]+)/);
    const by = pp.match(/<span class="by">₦([\d,]+)/);
    if (bm && bq && by) out.push({ name, month: num(bm[1]), quarter: num(bq[1]), year: num(by[1]) });
    else {
      const from = pp.match(/From ₦([\d,]+)/);
      if (!from) throw new Error(`Could not read the price of ${name} in pricing.html`);
      out.push({ name, from: num(from[1]) });
    }
  }
  if (out.length !== 3 || out.some(p => !p.month && !p.from)) throw new Error('pricing.html: expected Basic, Standard and Enterprise plan cards');
  return out;
}

// The line items of one plan card, as plain text.
export function planBullets() {
  const html = read('pricing.html');
  const res = {};
  for (const m of html.matchAll(/<div class="pn">([^<]+)<\/div>[\s\S]*?<ul>([\s\S]*?)<\/ul>/g)) {
    res[m[1].trim()] = [...m[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => text(x[1]));
  }
  return res;
}

export const naira = n => '₦' + n.toLocaleString('en-US');

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&middot;': '\u00b7' };

// Visible text of an HTML fragment. The trial-days span shows its text from CSS,
// so it is filled in here.
export function text(fragment) {
  return fragment
    .replace(/<span class="trial-days"><\/span>/g, trialDays())
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, e => ENT[e] ?? e)
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:!?)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
}

// Question and answer pairs from a page. Two markups are understood:
//   the accordion  <div class="q"><button>Q<svg/></button><div class="a"><p>A</p></div></div>
//   a facts list   <div data-faq> ... <h3>Q</h3><p>A</p><p>A</p> ... </div>
export function faqOf(html) {
  const pairs = [];
  for (const m of html.matchAll(/<div class="q"><button>([\s\S]*?)<svg[\s\S]*?<\/svg><\/button><div class="a">([\s\S]*?)<\/div><\/div>/g)) {
    pairs.push([text(m[1]), text(m[2])]);
  }
  const box = html.match(/<div[^>]*\sdata-faq[^>]*>([\s\S]*?)<!-- \/faq -->/);
  if (box) {
    const parts = box[1].split(/<h3[^>]*>/).slice(1);
    for (const part of parts) {
      const [q, ...rest] = part.split('</h3>');
      const a = text(rest.join(''));
      if (a) pairs.push([text(q), a]);
    }
  }
  return pairs;
}

export function titleOf(html) {
  return text((html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]);
}
export function descOf(html) {
  const m = html.match(/<meta name="description" content="([^"]*)"/);
  return m ? text(m[1]) : '';
}
