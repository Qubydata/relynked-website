/**
 * Puts schema.org JSON-LD in the head of every public page, so search engines
 * and AI answer engines can read who Relynked is, what it costs and what each
 * page answers without parsing the layout.
 *
 *   node scripts/build-jsonld.mjs
 *
 * Safe to run any number of times: it replaces its own block (between the
 * "ai:jsonld" comments) and touches nothing else. build-industries.mjs runs it
 * at the end, because that script rewrites the industries pages from scratch.
 * Run it again after merging another branch that changed a page head.
 *
 * What goes where:
 *   every page        Organization, WebSite, WebPage (and SoftwareApplication with
 *                     the plans, unless the page already carries its own, as the
 *                     industries pages do)
 *   pages with Q&A    FAQPage, read from the page's own questions (the pricing
 *                     accordion, or a <div data-faq> list such as the facts page)
 *   industries pages  BreadcrumbList, which build-industries.mjs writes itself
 *
 * Prices come from pricing.html and the trial length from the stylesheet (see
 * lib-site.mjs). There is no aggregateRating and no review: Relynked has none
 * to show, and none is to be invented.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, APP, COMPANY as C, plans, trialDays, faqOf, titleOf, descOf, naira } from './lib-site.mjs';

const START = '<!-- ai:jsonld -->';
const END = '<!-- /ai:jsonld -->';
const ORG_ID = `${SITE}/#organization`;
const SITE_ID = `${SITE}/#website`;
const APP_ID = `${SITE}/#software`;

const organization = {
  '@type': 'Organization',
  '@id': ORG_ID,
  name: C.name,
  legalName: C.legalName,
  url: `${SITE}/`,
  logo: { '@type': 'ImageObject', url: `${SITE}/assets/img/icon-512.png`, width: 512, height: 512 },
  email: C.email,
  telephone: C.phoneIntl,
  identifier: { '@type': 'PropertyValue', name: 'CAC registration number', value: C.rc },
  address: {
    '@type': 'PostalAddress',
    streetAddress: C.street,
    addressLocality: C.city,
    addressRegion: C.region,
    addressCountry: C.country,
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: C.email,
    telephone: C.phoneIntl,
    areaServed: 'NG',
    availableLanguage: 'English',
  },
  sameAs: C.social,
};

const website = {
  '@type': 'WebSite',
  '@id': SITE_ID,
  url: `${SITE}/`,
  name: C.name,
  description: 'Relynked is a business app for Nigerian small businesses. Remy, the assistant inside it, answers customers on WhatsApp.',
  inLanguage: 'en-NG',
  publisher: { '@id': ORG_ID },
};

function software() {
  const [basic, standard, enterprise] = plans();
  const month = p => ({
    '@type': 'Offer',
    name: p.name,
    url: `${SITE}/pricing`,
    price: String(p.month),
    priceCurrency: 'NGN',
    availability: 'https://schema.org/InStock',
    priceSpecification: { '@type': 'UnitPriceSpecification', price: String(p.month), priceCurrency: 'NGN', billingDuration: 'P1M', unitCode: 'MON' },
  });
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: C.name,
    url: `${SITE}/`,
    installUrl: APP,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'en-NG',
    description: `Relynked is a business app for small businesses in Nigeria: products or services, stock, staff, orders and payments in one place, with Remy, an assistant that answers customers on WhatsApp. Free for ${trialDays()} with no card, then ${naira(basic.month)} or ${naira(standard.month)} a month, with no cut of your sales.`,
    featureList: [
      'Remy answers customers on WhatsApp in English or Pidgin',
      'Orders and bookings taken on WhatsApp',
      'Stock counts per item',
      'Staff sign in with their own accounts',
      'Orders and payments in one place',
    ],
    provider: { '@id': ORG_ID },
    offers: [
      month(basic),
      month(standard),
      {
        '@type': 'Offer',
        name: enterprise.name,
        url: `${SITE}/pricing`,
        price: String(enterprise.from),
        priceCurrency: 'NGN',
        availability: 'https://schema.org/InStock',
        description: `From ${naira(enterprise.from)} a month, agreed after a call.`,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: String(enterprise.from), priceCurrency: 'NGN', billingDuration: 'P1M', unitCode: 'MON' },
      },
    ],
  };
}

const KINDS = { 'about-relynked': 'AboutPage', contact: 'ContactPage' };

function graphFor(file, html) {
  const slug = file.replace(/\.html$/, '');
  const url = file === 'index.html' ? `${SITE}/` : `${SITE}/${slug}`;
  const graph = [organization, website];
  // Industries pages carry their own, more specific SoftwareApplication.
  if (!/"@type":"SoftwareApplication"/.test(html.replace(new RegExp(`${START}[\s\S]*?${END}`), ''))) graph.push(software());
  const page = {
    '@type': KINDS[slug] || 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: titleOf(html),
    isPartOf: { '@id': SITE_ID },
    about: { '@id': ORG_ID },
    inLanguage: 'en-NG',
  };
  const d = descOf(html);
  if (d) page.description = d;
  graph.push(page);
  const qa = faqOf(html);
  if (qa.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      url,
      isPartOf: { '@id': `${url}#webpage` },
      mainEntity: qa.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

function files() {
  const out = readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'dashboard.html');
  for (const f of readdirSync(join(ROOT, 'industries')).filter(f => f.endsWith('.html'))) out.push(`industries/${f}`);
  return out;
}

let changed = 0;
for (const file of files()) {
  const path = join(ROOT, file);
  let html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const before = html;
  // The home page used to carry a bare Organization; the graph replaces it.
  html = html.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"Organization"[^\n]*?<\/script>\n/, '');
  html = html.replace(new RegExp(`${START}[\s\S]*?${END}\n`), '');
  const json = JSON.stringify(graphFor(file, html)).replace(/</g, '\u003c');
  JSON.parse(json); // the block must stay valid JSON
  if (/[\u2013\u2014]/.test(json)) throw new Error(`${file}: JSON-LD contains an em dash or en dash`);
  html = html.replace('</head>', `${START}\n<script type="application/ld+json">${json}</script>\n${END}\n</head>`);
  if (html !== before) { writeFileSync(path, html); changed++; }
}
console.log(`JSON-LD: ${files().length} pages checked, ${changed} written`);
