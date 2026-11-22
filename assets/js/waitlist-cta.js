/* The home page's second hero button (22 Nov 2026). It stays "See pricing" until the waitlist is open (the API's
   WAITLIST_OPEN, read through /api/waitlist/status), then becomes "Join the waitlist", so nothing on the home page
   changes before the founder opens the list. The first button, Request access, is never touched. */
(function () {
  "use strict";
  var buttons = document.querySelectorAll("[data-waitlist-cta]");
  if (!buttons.length || !window.fetch) return;
  fetch("/api/waitlist/status", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j || j.open !== true) return;
      buttons.forEach(function (b) {
        b.setAttribute("href", "/waitlist");
        b.textContent = "Join the waitlist";
      });
    })
    .catch(function () {});
})();
