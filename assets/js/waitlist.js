/* relynked.com/waitlist (22 Nov 2026, second look). Talks only to this site's Pages Functions (functions/api/waitlist),
   which pass the calls to the API (relynked server/api src/routes/waitlist.ts), as the beta page does.
   One idea per screen: the hero ("Get in early.", or "Opening soon." while closed), three form steps with a thin
   progress bar, then your place on lime.
     ?ref=CODE  a friend's link: the form, and joining moves them up.
     ?me=CODE   your own place (the email's button). This phone also remembers your code after you join.
   The honeypot field and the time on the form are sent; the server decides and checks every field again. */
(function () {
  "use strict";
  var started = Date.now();
  var KEY = "relynked.waitlist.code";
  var CODE = /^[A-HJKMNP-Z2-9]{6}$/;
  var CONSENT_VERSION = "waitlist-2026-11-22";
  var $ = function (id) { return document.getElementById(id); };
  var screens = ["wl-wait", "wl-hero", "wl-join", "wl-place"];
  function show(id) {
    screens.forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
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

  /* The hero: open or closed. */
  function hero(open) {
    if (!open) {
      $("wl-hero-title").innerHTML = "Opening <em>soon.</em>";
      $("wl-hero-say").textContent = "The Relynked waitlist opens shortly.";
      $("wl-start").hidden = true;
    }
    show("wl-hero");
  }
  $("wl-start").addEventListener("click", function () { step(1); show("wl-join"); $("name").focus(); });

  /* Your place. */
  function placeScreen(place, code, bump) {
    $("wl-number").textContent = Number(place).toLocaleString("en-NG");
    if (bump) $("wl-bump").textContent = String(bump);
    var link = window.location.origin + "/waitlist?ref=" + code;
    $("wl-wa").href = "https://wa.me/?text=" + encodeURIComponent("Join me on the Relynked waitlist: " + link);
    $("wl-share").setAttribute("data-link", link);
    $("wl-share").hidden = false;
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
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { said.textContent = "Link copied."; }, function () { said.textContent = link; });
    else said.textContent = link;
  });
  $("wl-again").addEventListener("click", function () { store.clear(); });

  /* Which screen first: your place if the link or this phone knows your code, else the hero. */
  function start(open) {
    if (ref) $("wl-invited").hidden = false;
    var mine = me || (ref ? "" : store.get());
    if (!mine) return hero(open);
    fetch("/api/waitlist/place?code=" + mine, { headers: { accept: "application/json" } })
      .then(json)
      .then(function (res) {
        if (res.status === 200 && res.j.ok && res.j.place) {
          if (!me) store.set(mine);
          placeScreen(res.j.place, mine);
        } else {
          store.clear();
          hero(open);
        }
      })
      .catch(function () { hero(open); });
  }
  fetch("/api/waitlist/status", { headers: { accept: "application/json" } })
    .then(json)
    .then(function (res) { start(res.status === 200 && res.j.open === true); })
    .catch(function () { start(false); });

  /* The form, three steps. */
  var form = $("wl-form");
  var status = $("status");
  var send = $("send");
  var now = 1;
  var STEP_OF = { name: 1, phone: 1, business_name: 1, sells: 2, city: 2, shops: 3, email: 3, consent: 3 };
  var INPUT_OF = { name: "name", phone: "phone", business_name: "businessName", sells: "sellsPick", city: "cityPick", shops: "shops", email: "email", consent: "consent" };
  function step(n) {
    now = n;
    form.querySelectorAll(".step").forEach(function (s) { s.hidden = Number(s.getAttribute("data-step")) !== n; });
    $("wl-prog").style.width = Math.round((n / 3) * 100) + "%";
    send.textContent = n === 3 ? "Join" : "Next";
    status.textContent = "";
    window.scrollTo(0, 0);
  }
  $("wl-back").addEventListener("click", function () {
    if (now > 1) step(now - 1);
    else show("wl-hero");
  });

  /* "Other" opens its short text. */
  function otherToggle(pick, input) {
    form.querySelectorAll('input[name="' + pick + '"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var other = r.value === "other" && r.checked;
        $(input).hidden = !other;
        if (other) $(input).focus();
      });
    });
  }
  otherToggle("sellsPick", "sellsOther");
  otherToggle("cityPick", "cityOther");

  function picked(name) {
    var el = form.querySelector('[name="' + name + '"]:checked');
    return el ? el.value : "";
  }
  function text(id) { return $(id).value.trim(); }
  function sells() { var p = picked("sellsPick"); return p === "other" ? text("sellsOther") : p; }
  function city() { var p = picked("cityPick"); return p === "other" ? text("cityOther") : p; }

  function clearErrors() {
    form.querySelectorAll(".err").forEach(function (e) { e.hidden = true; });
    form.querySelectorAll("[aria-invalid]").forEach(function (e) { e.removeAttribute("aria-invalid"); });
    status.textContent = "";
  }
  function fail(field) {
    var err = $(field + "-err");
    if (err) err.hidden = false;
    var other = field === "sells" && picked("sellsPick") === "other" ? $("sellsOther") : field === "city" && picked("cityPick") === "other" ? $("cityOther") : null;
    var input = other || form.querySelector('[name="' + INPUT_OF[field] + '"]');
    if (input && input.type !== "radio" && input.type !== "checkbox") input.setAttribute("aria-invalid", "true");
    return input;
  }
  /* The page's own check, per step; the server checks everything again. */
  function check(n) {
    var bad = [];
    if (n === 1) {
      if (text("name").length < 2) bad.push("name");
      var digits = text("phone").replace(/[^\d]/g, "");
      if (digits.length < 10 || digits.length > 15) bad.push("phone");
      if (text("businessName").length < 2) bad.push("business_name");
    } else if (n === 2) {
      if (sells().length < 2) bad.push("sells");
      if (city().length < 2) bad.push("city");
    } else {
      if (!picked("shops")) bad.push("shops");
      var email = text("email");
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad.push("email");
      if (!$("consent").checked) bad.push("consent");
    }
    return bad;
  }
  function showBad(bad) {
    var first = null;
    bad.forEach(function (f) { var el = fail(f); if (!first) first = el; });
    status.textContent = bad.length === 1 ? "Please check the field marked above." : "Please check the " + bad.length + " fields marked above.";
    if (first) first.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    var bad = check(now);
    if (bad.length) return showBad(bad);
    if (now < 3) return step(now + 1);
    var body = {
      name: text("name"), phone: text("phone"), email: text("email"), businessName: text("businessName"),
      sells: sells(), city: city(), shops: picked("shops"), consent: true, consentVersion: CONSENT_VERSION,
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
        if (res.status === 400 && res.j.field && STEP_OF[res.j.field]) {
          step(STEP_OF[res.j.field]);
          showBad([res.j.field]);
        } else if (res.status === 409) {
          hero(false);
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
