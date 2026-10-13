/**
 * Writes llms.txt and llms-full.txt: plain-text, markdown summaries of Relynked
 * for AI agents and answer engines (the llmstxt.org format). Served as
 * text/plain (see build-headers.mjs).
 *
 *   node scripts/build-llms.mjs
 *
 * Nothing is typed twice. Plans and prices come from pricing.html, the trial
 * length from the stylesheet, the questions from pricing.html and
 * about-relynked.html, the business types from the industries pages. Change the
 * page, run this, and the summaries follow. build-industries.mjs runs it too.
 *
 * It also fails loudly if about-relynked.html (typed by hand) no longer states
 * the prices on pricing.html, so the two cannot disagree unnoticed.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, APP, COMPANY as C, read, plans, planBullets, trialDays, faqOf, titleOf, naira, text } from './lib-site.mjs';

const NL = String.fromCharCode(10, 10);
const [basic, standard, enterprise] = plans();
const trial = trialDays();
const bullets = planBullets();

// ---- the facts page must agree with the pricing page
const facts = read('about-relynked.html');
for (const needle of [naira(basic.month), naira(standard.month), naira(enterprise.from), naira(basic.quarter), naira(standard.quarter), naira(basic.year), naira(standard.year)]) {
  if (!facts.includes(needle)) throw new Error(`about-relynked.html does not state ${needle}, which pricing.html does`);
}

// ---- business types, from the generated industries pages
const types = readdirSync(join(ROOT, 'industries'))
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .map(f => {
    const html = read(`industries/${f}`);
    let label = (titleOf(html).match(/software for (.+?) in Nigeria/) || [, f.replace('.html', '')])[1];
    label = label.replace(/teches/, "technicians");
    return { label: label.charAt(0).toUpperCase() + label.slice(1), url: `${SITE}/industries/${f.replace('.html', '')}` };
  });

const PAGES = [
  ['about-relynked', 'Facts about Relynked', 'Short, quotable answers: what it is, who it is for, price, how it differs, what it does not do.'],
  ['pricing', 'Pricing', 'Basic, Standard and Enterprise in naira, how paying works, and the questions people ask first.'],
  ['product', 'Products', 'Relynked Business and Remy, each everyday problem and what Relynked does about it, and every kind of business it is set up for.'],
  ['how-it-works', 'How it works', 'How goods, services and money are recorded step by step, with a name and a time on each.'],
  ['contact', 'Contact', 'Phone, email, address and how to book a call about Enterprise.'],
];

const list = rows => rows.map(([url, name, note]) => `- [${name}](${url})${note ? `: ${note}` : ''}`).join('\n');
const pageRows = PAGES.map(([slug, name, note]) => [`${SITE}/${slug}`, name, note]);

const summary = `Relynked is a business app for small businesses in Nigeria: shops, salons, food vendors and one-venue lounges. It keeps what you sell, your stock, your staff, your orders and your payments in one place, and Remy, the assistant inside it, answers customers on WhatsApp in English or Pidgin. It is made by ${C.legalName} (${C.rc}) in ${C.city}, ${C.region}.`;

const keyFacts = `- Who it is for: small businesses in Nigeria that sell products or book services (shops, supermarkets, clothing and shoe sellers, phone shops, bakeries, grills, bukas, restaurants, bars and lounges, hair salons, barbers, makeup artists, nail and lash technicians, spas, car washes).
- Price, in Nigerian naira: Basic ${naira(basic.month)} a month, Standard ${naira(standard.month)} a month, Enterprise from ${naira(enterprise.from)} a month (agreed after a call). Quarterly: ${naira(basic.quarter)} (Basic), ${naira(standard.quarter)} (Standard). Yearly: ${naira(basic.year)} (Basic), ${naira(standard.year)} (Standard).
- Free trial: ${trial}, no card needed.
- Staff: unlimited on every plan. The plan counts only the people who answer customers on the business's WhatsApp number or use Remy: the owner plus 2 on Basic, plus 5 on Standard, plus 10 on Enterprise.
- No percentage of sales and no fee per transaction. Meta's charges for some WhatsApp messages are separate from the plan.
- Relynked does not hold customers' money: customers pay the business through a licensed payment company.
- Sign up: ${APP} (no card needed).
- Contact: ${C.email}, ${C.phoneLocal}, 7B Edegbe Street, off Giwa-Amu Street, GRA, ${C.city}, ${C.region}, Nigeria.`;

const industries = list(types.map(t => [t.url, t.label, '']));

const llms = `# Relynked

> ${summary}

${keyFacts}

## Key pages

${list(pageRows)}

## Who it is for

${industries}

## Policies

${list([
  [`${SITE}/terms`, 'Terms of service', ''],
  [`${SITE}/privacy`, 'Privacy policy', ''],
  [`${SITE}/refund-policy`, 'Refund policy', ''],
  [`${SITE}/data-deletion`, 'Data deletion', ''],
])}

## Optional

${list([
  [`${SITE}/llms-full.txt`, 'Relynked in full', 'the same facts with every plan detail and every question answered, in one file'],
  [`${SITE}/press`, 'Press', 'approved descriptions, brand assets and press contact'],
  [`${SITE}/careers`, 'Careers', ''],
  [`${SITE}/sitemap.xml`, 'Sitemap', ''],
])}
`;

// ---- the long version
const payHtml = read('pricing.html');
const paying = [...payHtml.matchAll(/<div class="hc[^"]*">(?:<svg[\s\S]*?<\/svg>)?<b>([^<]+)<\/b><p>([\s\S]*?)<\/p>/g)].map(m => `### ${text(m[1])}\n\n${text(m[2])}`).join('\n\n');
const qa = pairs => pairs.map(([q, a]) => `### ${q}\n\n${a}`).join('\n\n');
const planBlock = p => {
  const price = p.month
    ? `${naira(p.month)} a month, ${naira(p.quarter)} a quarter, ${naira(p.year)} a year`
    : `from ${naira(p.from)} a month, agreed after a call`;
  return `### ${p.name}: ${price}\n\n${(bullets[p.name] || []).map(b => `- ${b}`).join('\n')}`;
};

const full = `# Relynked

> ${summary}

Every fact below is also on the pages linked from ${SITE}/llms.txt. Prices are in Nigerian naira. Quarterly plans save 5%. Yearly plans pay for 10 months and get 12.

## Plans

Free for ${trial} with no card. Staff are unlimited on every plan.

${[basic, standard, enterprise].map(planBlock).join(NL)}

A customer chat is one customer's conversation with the business on WhatsApp. If they go quiet for 8 hours and then write again, that is a new chat. Chats start again every month, even on a quarterly or yearly plan.

## How paying works

${paying}

## Questions and answers about pricing

${qa(faqOf(payHtml))}

## Facts about Relynked

${qa(faqOf(facts))}

## Who it is for

${industries}

## Contact

- Email: ${C.email}
- Phone: ${C.phoneLocal} (${C.phoneIntl})
- Address: 7B Edegbe Street, off Giwa-Amu Street, GRA, ${C.city}, ${C.region}, Nigeria
- Company: ${C.legalName}, ${C.rc}
- Instagram: ${C.social[0]}
- Sign up: ${APP}

## Pages

${list(pageRows)}
`;

function put(name, body) {
  if (/[\u2013\u2014]/.test(body)) throw new Error(`${name} contains an em dash or en dash. House style forbids them.`);
  writeFileSync(join(ROOT, name), body);
}
put('llms.txt', llms);
put('llms-full.txt', full);
console.log(`llms.txt ${llms.length} chars, llms-full.txt ${full.length} chars`);
