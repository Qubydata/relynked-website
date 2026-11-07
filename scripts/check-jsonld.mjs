/**
 * A LOCAL VALIDATOR FOR THE SHOP PAGES' STRUCTURED DATA (schema.org JSON-LD), against schema.org's own vocabulary.
 *
 *   node scripts/check-jsonld.mjs [--vocab <schemaorg-current-https.jsonld>] [--currency NGN] <page.html | https://...> ...
 *
 * Reads every <script type="application/ld+json"> on each page and checks, with no outside service:
 *   - every @type is a schema.org class, and every property is a schema.org property that the type (or a type it
 *     inherits from) may carry (domainIncludes), with a value of a type it allows (rangeIncludes): a node of the right
 *     class, an enumeration member of the right enumeration (https://schema.org/InStock), a date, a time, a number or
 *     an absolute https address where one is expected; pending or superseded terms are warned about;
 *   - what Google needs for these types: a Product with a name and an offer; an Offer with a price, a three letter
 *     currency and a known availability; a LocalBusiness with a name and an address; opening hours as HH:MM;
 *   - the house rules: no em or en dash, no rating or review (Relynked has none it could stand behind), only https
 *     addresses, pictures on the page's own site, and every price in --currency when given.
 *
 * The vocabulary is schema.org's release file. Without --vocab it is read from SCHEMAORG_VOCAB, else downloaded once
 * from schema.org into the system's temporary folder and read from there after.
 *
 * Also imported by shop-e2e.mjs: validateJsonLd(blocks, { vocab, pageUrl, currency }) gives { errors, warnings }.
 * Exit code 0 when nothing is wrong, 1 when something is, 2 when there was nothing to check.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VOCAB_URL = "https://schema.org/version/latest/schemaorg-current-https.jsonld";
const S = "https://schema.org/";

/** schema.org's vocabulary as lookups: classes and their parents, properties with their domains and ranges, enumeration members. */
export function loadVocab(json) {
  const graph = json["@graph"] || [];
  const id = (x) => String(typeof x === "string" ? x : x && x["@id"]).replace(/^schema:/, "");
  const list = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const classes = new Map();
  const props = new Map();
  const members = new Map();
  for (const n of graph) {
    const types = list(n["@type"]).map(String);
    const name = id(n);
    const pending = list(n["schema:isPartOf"]).some((p) => /pending/.test(id(p)));
    const superseded = n["schema:supersededBy"] ? id(n["schema:supersededBy"]) : null;
    if (types.includes("rdfs:Class")) classes.set(name, { parents: list(n["rdfs:subClassOf"]).map(id), pending, superseded });
    else if (types.includes("rdf:Property")) props.set(name, { domain: list(n["schema:domainIncludes"]).map(id), range: list(n["schema:rangeIncludes"]).map(id), pending, superseded });
    else for (const t of types) if (t.startsWith("schema:")) members.set(name, { type: id(t), pending, superseded });
  }
  const up = new Map();
  /** A class and everything it inherits from. */
  const ancestors = (c) => {
    if (up.has(c)) return up.get(c);
    const seen = new Set();
    const walk = [c];
    while (walk.length) {
      const x = walk.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      for (const p of classes.get(x)?.parents || []) walk.push(p);
    }
    up.set(c, seen);
    return seen;
  };
  return { classes, props, members, ancestors };
}

/** Reads the vocabulary: a file, SCHEMAORG_VOCAB, or schema.org's release file downloaded once into the temporary folder. */
export async function readVocab(file) {
  const path = file || process.env.SCHEMAORG_VOCAB || join(tmpdir(), "schemaorg-current-https.jsonld");
  if (!existsSync(path)) {
    if (file) throw new Error(`no vocabulary at ${file}`);
    const res = await fetch(VOCAB_URL);
    if (!res.ok) throw new Error(`could not download ${VOCAB_URL}: ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return loadVocab(JSON.parse(readFileSync(path, "utf8")));
}

/** The JSON-LD blocks of an HTML page, as written. */
export function jsonLdBlocks(html) {
  return [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

const DASH = /[\u2013\u2014]/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const NUMBER = /^-?\d+(\.\d+)?$/;
const TEXTY = new Set(["Text", "URL", "CssSelectorType", "XPathType", "PronounceableText"]);

/**
 * Checks parsed JSON-LD blocks (strings) against the vocabulary. Pure on its inputs.
 * opts.pageUrl: the page's own address (pictures must be on its site). opts.currency: the only currency allowed.
 */
export function validateJsonLd(blocks, { vocab, pageUrl = null, currency = null } = {}) {
  const errors = [];
  const warnings = [];
  const { classes, props, members, ancestors } = vocab;
  const pageHost = pageUrl ? new URL(pageUrl).host : null;
  const list = (x) => (Array.isArray(x) ? x : [x]);
  const typeName = (t) => String(t).replace(/^https?:\/\/schema\.org\//, "").replace(/^schema:/, "");
  const isA = (types, want) => types.some((t) => ancestors(t).has(want));

  function checkString(s, range, at) {
    if (DASH.test(s)) errors.push(`${at}: an em or en dash in "${s.slice(0, 60)}"`);
    if (/^http:\/\//.test(s)) errors.push(`${at}: an http address (https only): ${s}`);
    const ok = [];
    if (range.some((r) => TEXTY.has(r))) ok.push("text");
    if (range.includes("URL") && !range.includes("Text") && !/^https:\/\/[^\s]+$/.test(s)) return errors.push(`${at}: expects an absolute https address, got "${s.slice(0, 60)}"`);
    if (s.startsWith(S)) {
      const m = members.get(s.slice(S.length));
      if (m) {
        if (range.some((r) => ancestors(m.type).has(r))) return;
        return errors.push(`${at}: ${s} is a ${m.type}, not one of ${range.join(", ")}`);
      }
      if (range.includes("URL")) return;
      return errors.push(`${at}: ${s} is not a schema.org enumeration member`);
    }
    if (range.includes("Date") && DATE.test(s)) return;
    if (range.includes("DateTime") && (DATETIME.test(s) || DATE.test(s))) return;
    if (range.includes("Time") && TIME.test(s)) return;
    if (range.some((r) => ["Number", "Integer", "Float"].includes(r)) && NUMBER.test(s)) return;
    if (ok.length) return;
    if (range.includes("Date") || range.includes("Time") || range.includes("DateTime")) return errors.push(`${at}: expects ${range.join(" or ")}, got "${s}"`);
    if (range.some((r) => ["Number", "Integer", "Float"].includes(r)) && !range.some((r) => classes.has(r) && !["Number", "Integer", "Float"].includes(r))) return errors.push(`${at}: expects a number, got "${s}"`);
    // Text where a node is expected: schema.org and Google read it as the thing's name, but say so.
    warnings.push(`${at}: text where ${range.join(" or ")} is expected`);
  }

  function checkNode(node, at, range) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return errors.push(`${at}: not an object`);
    const keys = Object.keys(node);
    if (!node["@type"]) {
      if (keys.length === 1 && node["@id"]) return; // a reference to a node named elsewhere
      return errors.push(`${at}: a node with no @type`);
    }
    const types = list(node["@type"]).map(typeName);
    for (const t of types) {
      const c = classes.get(t);
      if (!c) errors.push(`${at}: @type ${t} is not a schema.org class`);
      else {
        if (c.pending) warnings.push(`${at}: @type ${t} is still pending at schema.org`);
        if (c.superseded) warnings.push(`${at}: @type ${t} is superseded by ${c.superseded}`);
      }
    }
    if (range && range.length && !range.some((r) => isA(types, r))) errors.push(`${at}: a ${types.join("/")} where ${range.join(" or ")} is expected`);
    for (const k of keys) {
      if (k.startsWith("@")) {
        if (k === "@context" && node[k] !== "https://schema.org" && node[k] !== "https://schema.org/") errors.push(`${at}: @context should be https://schema.org`);
        if (k === "@id" && typeof node[k] === "string" && /^http:/.test(node[k])) errors.push(`${at}: @id over http`);
        continue;
      }
      const p = props.get(k);
      if (!p) {
        errors.push(`${at}.${k}: not a schema.org property`);
        continue;
      }
      if (p.pending) warnings.push(`${at}.${k}: still pending at schema.org`);
      if (p.superseded) warnings.push(`${at}.${k}: superseded by ${p.superseded}`);
      if (!p.domain.some((d) => isA(types, d))) errors.push(`${at}.${k}: a ${types.join("/")} may not carry ${k} (it belongs on ${p.domain.join(", ")})`);
      list(node[k]).forEach((v, i) => {
        const where = Array.isArray(node[k]) ? `${at}.${k}[${i}]` : `${at}.${k}`;
        if (v && typeof v === "object") checkNode(v, where, p.range.filter((r) => classes.has(r) && !TEXTY.has(r) && !["Number", "Integer", "Float", "Boolean", "Date", "DateTime", "Time"].includes(r)));
        else if (typeof v === "string") checkString(v, p.range, where);
        else if (typeof v === "number") {
          if (!p.range.some((r) => ["Number", "Integer", "Float", "Text", "QuantitativeValue"].includes(r))) errors.push(`${where}: a number where ${p.range.join(" or ")} is expected`);
        } else if (typeof v === "boolean") {
          if (!p.range.includes("Boolean")) errors.push(`${where}: true or false where ${p.range.join(" or ")} is expected`);
        } else errors.push(`${where}: an empty value`);
      });
    }
    // What Google needs for the types the shop pages use, and Relynked's own rules.
    if (isA(types, "Product") && (!node.name || !(node.offers || node.review || node.aggregateRating))) errors.push(`${at}: a Product needs a name and an offer`);
    if (isA(types, "Offer")) {
      if (node.price === undefined || node.price === null || node.price === "") errors.push(`${at}: an Offer needs a price`);
      else if (!NUMBER.test(String(node.price))) errors.push(`${at}: the price should be digits and a dot, got "${node.price}"`);
      if (!/^[A-Z]{3}$/.test(node.priceCurrency || "")) errors.push(`${at}: an Offer needs a three letter priceCurrency`);
      if (currency && node.priceCurrency && node.priceCurrency !== currency) errors.push(`${at}: priced in ${node.priceCurrency}, not ${currency}`);
      if (node.priceValidUntil && !DATE.test(node.priceValidUntil)) errors.push(`${at}: priceValidUntil is not a date`);
    }
    if (isA(types, "UnitPriceSpecification") && currency && node.priceCurrency && node.priceCurrency !== currency) errors.push(`${at}: priced in ${node.priceCurrency}, not ${currency}`);
    if (isA(types, "LocalBusiness") && (!node.name || !node.address)) errors.push(`${at}: a LocalBusiness needs a name and an address`);
    if (isA(types, "Organization") && !node.name) errors.push(`${at}: needs a name`);
    if (isA(types, "OpeningHoursSpecification") && (!TIME.test(node.opens || "") || !TIME.test(node.closes || "") || !node.dayOfWeek)) errors.push(`${at}: opening hours need a day, and opens and closes as HH:MM`);
    if ("aggregateRating" in node || "review" in node) errors.push(`${at}: a rating or review (Relynked has none it could stand behind)`);
    if (pageHost) {
      for (const k of ["image", "logo"]) {
        for (const v of list(node[k] ?? [])) {
          const u = typeof v === "string" ? v : v && v.url;
          if (typeof u === "string") {
            try {
              if (new URL(u).host !== pageHost) errors.push(`${at}.${k}: a picture on another site (${u})`);
            } catch {
              errors.push(`${at}.${k}: not an address (${u})`);
            }
          }
        }
      }
    }
  }

  if (!blocks.length) errors.push("no JSON-LD on the page");
  blocks.forEach((b, i) => {
    let data;
    try {
      data = JSON.parse(b);
    } catch (e) {
      errors.push(`block ${i}: not JSON (${e.message})`);
      return;
    }
    if (/<\/script/i.test(b)) errors.push(`block ${i}: a raw </script> inside the JSON`);
    for (const [j, node] of list(data["@graph"] ?? data).entries()) {
      if (!data["@graph"] && !node["@context"]) errors.push(`block ${i}: no @context`);
      checkNode(node, `block ${i}${data["@graph"] ? `.@graph[${j}]` : ""}`, null);
    }
  });
  return { errors, warnings };
}

/**
 * The validator's own check (--self-test): a good shop's JSON-LD passes, and each broken one is caught for the right
 * reason. Gives the names of the cases that did not behave.
 */
export function selfTest(vocab) {
  const shop = (over = {}, item = {}, offer = {}) => ({
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": "https://relynked.com/x#shop",
    name: "X",
    url: "https://relynked.com/x",
    address: { "@type": "PostalAddress", addressLocality: "Yaba", addressCountry: "NG" },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Menu",
      itemListElement: [{ "@type": "Product", name: "Rice", image: "https://relynked.com/x/photo/a-l.jpg", ...item, offers: { "@type": "Offer", price: "2500", priceCurrency: "NGN", availability: "https://schema.org/InStock", seller: { "@id": "https://relynked.com/x#shop" }, ...offer } }],
    },
    ...over,
  });
  const run = (data) => validateJsonLd([JSON.stringify(data)], { vocab, pageUrl: "https://relynked.com/x", currency: "NGN" });
  const cases = [
    ["a good shop passes", shop(), null],
    ["a made up type", shop({ "@type": "ShopOfWonders" }), /not a schema\.org class/],
    ["a made up property", shop({ shoeSize: 42 }), /not a schema\.org property/],
    ["a property the type may not carry", shop({ openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "08:00", closes: "21:00" }] }), /may not carry openingHoursSpecification/],
    ["an unknown availability", shop({}, {}, { availability: "https://schema.org/Plenty" }), /not a schema\.org enumeration member/],
    ["an enumeration member of the wrong kind", shop({}, {}, { availability: "https://schema.org/Monday" }), /is a DayOfWeek/],
    ["a price with the naira sign", shop({}, {}, { price: "₦2,500" }), /digits and a dot/],
    ["another currency", shop({}, {}, { priceCurrency: "USD" }), /not NGN/],
    ["a price date that is not a date", shop({}, {}, { priceValidUntil: "Sunday" }), /priceValidUntil is not a date|expects Date/],
    ["a product with no offer", shop({ hasOfferCatalog: { "@type": "OfferCatalog", itemListElement: [{ "@type": "Product", name: "Rice" }] } }), /needs a name and an offer/],
    ["a local business with no address", shop({ "@type": "Restaurant", address: undefined }), /needs a name and an address/],
    ["a node of the wrong class", shop({ address: { "@type": "Offer", price: "1", priceCurrency: "NGN" } }), /where PostalAddress/],
    ["an em dash", shop({ name: "X \u2014 Y" }), /em or en dash/],
    ["an http address", shop({ url: "http://relynked.com/x" }), /http address/],
    ["a rating", shop({ aggregateRating: { "@type": "AggregateRating", ratingValue: "5", reviewCount: "9" } }), /rating or review/],
    ["a picture on another site", shop({}, { image: "https://elsewhere.example/a.jpg" }), /another site/],
    ["a bad opening time", shop({ "@type": "Restaurant", openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Monday", opens: "8am", closes: "21:00" }] }), /HH:MM|expects Time/],
  ];
  const wrong = [];
  for (const [name, data, want] of cases) {
    const { errors } = run(JSON.parse(JSON.stringify(data)));
    if (want === null ? errors.length !== 0 : !errors.some((e) => want.test(e))) wrong.push(`${name}: ${errors.join("; ") || "no error"}`);
  }
  const closer = validateJsonLd([`{"@context":"https://schema.org","@type":"Store","name":"</script>","address":{"@type":"PostalAddress","addressCountry":"NG"}}`], { vocab });
  if (!closer.errors.some((e) => /raw <\/script>/.test(e))) wrong.push("a raw </script> inside the JSON: not caught");
  return { cases: cases.length + 1, wrong };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    args.splice(args.indexOf("--self-test"), 1);
    const vi = args.indexOf("--vocab");
    const { cases, wrong } = selfTest(await readVocab(vi >= 0 ? args[vi + 1] : null));
    for (const w of wrong) console.log(`  FAIL  ${w}`);
    console.log(wrong.length ? `check-jsonld self test: ${wrong.length} of ${cases} cases wrong` : `check-jsonld self test: all ${cases} cases behave (a good shop passes, each broken one is caught)`);
    process.exit(wrong.length ? 1 : 0);
  }
  const opt = (n) => {
    const i = args.indexOf(`--${n}`);
    if (i < 0) return null;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const vocabFile = opt("vocab");
  const currency = opt("currency");
  if (!args.length) {
    console.error("Say what to check: node scripts/check-jsonld.mjs [--vocab <file>] [--currency NGN] <page.html | https://...> ...");
    process.exit(2);
  }
  const vocab = await readVocab(vocabFile);
  let bad = 0;
  for (const a of args) {
    const html = /^https?:\/\//.test(a) ? await (await fetch(a)).text() : readFileSync(a, "utf8");
    const canonical = /<link rel="canonical" href="([^"]+)">/.exec(html)?.[1] ?? (/^https?:\/\//.test(a) ? a : null);
    const { errors, warnings } = validateJsonLd(jsonLdBlocks(html), { vocab, pageUrl: canonical, currency });
    console.log(`${errors.length ? "FAIL" : "ok  "}  ${a}  (${jsonLdBlocks(html).length} block, ${errors.length} errors, ${warnings.length} warnings)`);
    for (const e of errors) console.log(`        error    ${e}`);
    for (const w of warnings) console.log(`        warning  ${w}`);
    if (errors.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
