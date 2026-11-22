/* relynked.com/waitlist (22 Nov 2026). Talks only to this site's Pages Functions (functions/api/waitlist), which pass
   the calls to the API (relynked server/api src/routes/waitlist.ts), as the beta page does.
   Screens, one at a time: closed ("Opening soon"), the form, your place.
     ?ref=CODE  a friend's link: the form, and joining moves them up.
     ?me=CODE   your own place (the email's button). This phone also remembers your code after you join.
   The honeypot field and the time on the form are sent; the server decides. */
(function () {
  "use strict";
  var started = Date.now();
  var KEY = "relynked.waitlist.code";
  var CODE = /^[A-HJKMNP-Z2-9]{6}$/;
  var CONSENT_VERSION = "waitlist-2026-11-22";
  var $ = function (id) { return document.getElementById(id); };
  var screens = ["wl-wait", "wl-closed", "wl-join", "wl-place"];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    $("wl-wait").removeAttribute("aria-busy");
  }

  var params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { params = { get: function () { return null; } }; }
  var shape = function (v) { v = String(v || "").trim().toUpperCase(); return CODE.test(v) ? v : ""; };
  var ref = shape(params.get("ref"));
  var me = shape(params.get("me"));
  var store = {
    get: function () { try { return shape(window.localStorage.getItem(KEY)); } catch (e) { return ""; } },
    set: function (c) { try { window.localStorage.setItem(KEY, c); } catch (e) {} },
    clear: function () { try { window.localStorage.removeItem(KEY); } catch (e) {} }
  };

  var json = function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); };

  /* Your place. */
  function placeScreen(place, code, bump) {
    $("wl-number").textContent = Number(place).toLocaleString("en-NG");
    if (bump) $("wl-bump").textContent = String(bump);
    var share = $("wl-share");
    if (code) {
      var link = window.location.origin + "/waitlist?ref=" + code;
      $("wl-link").textContent = link.replace(/^https?:\/\//, "");
      $("wl-wa").href = "https://wa.me/?text=" + encodeURIComponent("Join me on the Relynked waitlist: " + link);
      share.hidden = false;
      share.setAttribute("data-link", link);
    } else {
      share.hidden = true;
    }
    show("wl-place");
    $("wl-place").focus();
  }
  /* A bot answer, or no code: on the list, no number to show. */
  function listedScreen() {
    $("wl-place-title").textContent = "You're on the list.";
    $("wl-share").hidden = true;
    show("wl-place");
  }

  $("wl-copy").addEventListener("click", function () {
    var link = $("wl-share").getAttribute("data-link") || "";
    var said = $("wl-copied");
    var done = function () { said.textContent = "Link copied."; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done, function () { said.textContent = link; });
    } else {
      said.textContent = link;
    }
  });
  $("wl-again").addEventListener("click", function () { store.clear(); });

  function joinScreen() {
    if (ref) $("wl-invited").hidden = false;
    show("wl-join");
  }

  /* Which screen: your place if this phone or the link knows your code, else the form, unless closed. */
  function start(open) {
    var mine = me || (ref ? "" : store.get());
    if (mine) {
      fetch("/api/waitlist/place?code=" + mine, { headers: { accept: "application/json" } })
        .then(json)
        .then(function (res) {
          if (res.status === 200 && res.j.ok && res.j.place) {
            if (!me) store.set(mine);
            placeScreen(res.j.place, mine);
          } else {
            store.clear();
            open ? joinScreen() : show("wl-closed");
          }
        })
        .catch(function () { open ? joinScreen() : show("wl-closed"); });
      return;
    }
    open ? joinScreen() : show("wl-closed");
  }
  fetch("/api/waitlist/status", { headers: { accept: "application/json" } })
    .then(json)
    .then(function (res) { start(res.status === 200 && res.j.open === true); })
    .catch(function () { start(false); });

  /* The form. */
  var form = $("wl-form");
  var status = $("status");
  var send = $("send");
  var FIELDS = { name: "name", phone: "phone", email: "email", business_name: "businessName", sells: "sells", city: "city", shops: "shops", consent: "consent" };
  function clearErrors() {
    form.querySelectorAll(".err").forEach(function (e) { e.hidden = true; });
    form.querySelectorAll("[aria-invalid]").forEach(function (e) { e.removeAttribute("aria-invalid"); });
    status.textContent = "";
  }
  function fail(field) {
    var err = $(field + "-err");
    if (err) err.hidden = false;
    var input = form.querySelector('[name="' + (FIELDS[field] || field) + '"]');
    if (input && input.type !== "radio" && input.type !== "checkbox") input.setAttribute("aria-invalid", "true");
    return input;
  }
  function valueOf(name) {
    var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]:not([type=radio]):not([type=checkbox])');
    return el ? el.value.trim() : "";
  }
  function check() {
    var bad = [];
    if (valueOf("name").length < 2) bad.push("name");
    var digits = valueOf("phone").replace(/[^\d]/g, "");
    if (digits.length < 10 || digits.length > 15) bad.push("phone");
    var email = valueOf("email");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad.push("email");
    if (valueOf("businessName").length < 2) bad.push("business_name");
    if (valueOf("sells").length < 2) bad.push("sells");
    if (valueOf("city").length < 2) bad.push("city");
    if (!valueOf("shops")) bad.push("shops");
    if (!$("consent").checked) bad.push("consent");
    return bad;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    var bad = check();
    if (bad.length) {
      var first = null;
      bad.forEach(function (f) { var el = fail(f); if (!first) first = el; });
      status.textContent = "Please check the " + (bad.length === 1 ? "field" : bad.length + " fields") + " marked above.";
      if (first) first.focus();
      return;
    }
    var body = {
      name: valueOf("name"), phone: valueOf("phone"), email: valueOf("email"), businessName: valueOf("businessName"),
      sells: valueOf("sells"), city: valueOf("city"), shops: valueOf("shops"), consent: true, consentVersion: CONSENT_VERSION,
      ref: ref, website: $("website").value, formMs: Date.now() - started
    };
    send.disabled = true;
    status.textContent = "Sending...";
    fetch("/api/waitlist/join", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) })
      .then(json)
      .then(function (res) {
        send.disabled = false;
        if (res.status === 200 && res.j.ok) {
          status.textContent = "";
          if (res.j.place && res.j.code) {
            store.set(res.j.code);
            placeScreen(res.j.place, res.j.code, res.j.bump);
          } else {
            listedScreen();
          }
          return;
        }
        if (res.status === 400 && res.j.field) {
          var el = fail(res.j.field);
          status.textContent = "Please check the field marked above.";
          if (el) el.focus();
        } else if (res.status === 409) {
          show("wl-closed");
        } else if (res.status === 429) {
          var said = typeof res.j.message === "string" ? res.j.message.slice(0, 200) : "";
          status.textContent = said || "Too many tries right now. Please try again later.";
        } else {
          status.textContent = "We could not send it just now. Please try again in a moment.";
        }
      })
      .catch(function () {
        send.disabled = false;
        status.textContent = "No connection. Please check your data and try again.";
      });
  });
})();
