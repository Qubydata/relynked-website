# Relynked website

Static site, no build step. Open `index.html` in a browser to view it.

## Files

    index.html          Home      hero, ticker, why it exists, quote, CTA
    product.html        Product   the two products, bottle verification, CTA
    how-it-works.html   How it works   custody chain, blind counts, built for Nigeria, CTA
    pricing.html        Pricing   plans, FAQ, CTA
    contact.html        Contact   phone, address, Google map, what a walkthrough covers

    assets/css/styles.css   the whole stylesheet, lifted unchanged from the original page
    assets/js/main.js       sticky nav, scroll reveal, count-up, FAQ, magnetic buttons, hero board
    assets/img/             drop photographs here as they arrive
    reference/              the original single-page file, kept untouched as the reference

## House rules

- The header and footer are identical on all five pages. Change one, change all five.
- There is no Home link in the nav. The Relynked logo in the header and in the footer is
  the way back to `index.html`.
- Inner pages carry `class="nav solid always-solid"` so the nav is legible before you scroll.
  The home page keeps the transparent nav that turns solid on scroll.
- Colours, fonts, spacing and the photo placeholders are exactly as designed. Edit
  `assets/css/styles.css` only when a change is deliberate.

## Photo placeholders

Three `.ph` blocks are waiting for photographs, on home, product and contact.
Each carries a `.tag` describing the shot. Replace the block with an `<img>` when
the photo exists.

## Products

There are two: **Relynked Business**, the venue system this site is mostly about, and
**Remy**, the WhatsApp assistant. They appear as two cards on `product.html` and as the
two entries in the footer Product column on all five pages.

Remy has no page of its own yet, so its card links to `contact.html`. The five surface
cards that used to fill the product page (Waiter, Kitchen, Bar, Chef, Storekeeper) were
replaced by these two. That copy is still in `reference/` if it is ever wanted back.

## Company details

The registered entity is Relynked Ltd, RC 9837720, at 7B Edegbe Street, off Giwa-Amu
Street, GRA, Benin City, Edo State, Nigeria. It appears in the footer bar and in the
footer Contact column on all five pages, and three times on `contact.html`: the address
block, the map, and the location card.

The phone number is 0911 567 1307, shown in local format and dialled as
`tel:+2349115671307` so it works from abroad too. It appears in the footer on all five
pages, twice on `contact.html`, and in the CTA band on four pages.

## The map

The Google map on the contact page is a keyless embed. It reads the address straight
out of the `src` query on the `<iframe>`. To move the pin, change the query in both the
iframe and the "Open in Google Maps" button beneath it. The `z` value sets the zoom,
higher is closer.

## Dashes

House style is no em-dashes and no en-dashes. The only dash-like glyph in the copy is
the minus sign in the two reconciliation equations on `how-it-works.html`, which is
arithmetic, not punctuation.

## Mobile

One responsive site, no separate mobile version. Breakpoints are 1080, 900 and 600 px.

Below 900px the nav links become a dropdown card opened by the burger button, and the
header's own booking button is hidden because the menu carries its own lime one. The
menu closes on a link click, on Escape, and on a click outside it.

## Photos

Drop a photo straight into any `.ph` block and it crops to the box instead of stretching,
because `.ph img` is `object-fit: cover`. On phones every `.ph` becomes a 4:3 box rather
than a tall column, so a wide shot stays a wide shot.

    <div class="ph tall reveal">
      <picture>
        <source media="(max-width:600px)" srcset="assets/img/bar-tight.avif" type="image/avif">
        <img src="assets/img/bar.jpg" alt="Bartender scanning a bottle"
             width="1600" height="2000" loading="lazy" decoding="async">
      </picture>
    </div>

Use the `<source>` line only when the phone needs a genuinely different crop. To choose
which part of a photo survives the crop, add `object-position` to that image, for example
`style="object-position:70% 50%"`. Remove the `.tag` span once a real photo is in.

## The ticker

The ribbon on the home page is written once in the HTML. The script clones the list so it
can loop with no visible seam, and sets the duration from the measured width at about 58
pixels a second. Add or remove items in the HTML and nothing else needs touching: the
ribbon gets longer, not faster. It travels left to right. To reverse it, delete
`animation-direction:reverse` from the `.tk-track` rule in the stylesheet.

## Reduced motion

The stylesheet switches animations off for anyone who asks their device for reduced
motion. The hero used to open from a hidden state that only the animation undid, so it
came up blank for those users. The reduced-motion block at the foot of the stylesheet
now sets those elements visible, and the lime sweep on show.
