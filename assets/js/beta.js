/* relynked.com/beta: tester onboarding (founder, 17 Nov 2026). Reads /api/beta/settings only to know whether sign up
   is open, and posts /api/beta/apply, both through this site's Pages Functions (functions/api/beta), so nothing here
   talks to another site. No quiz: the testing partner recruits and trains the testers.
   THE INVITE WORD (19 Nov 2026): the link the testing partner sends is /beta?k=WORD. The word is read from the
   address and sent with the form, so the tester types nothing. With no word the page still shows, with one line
   asking them to open their link, and no form. The server decides whether the word is right. */
(function () {
  "use strict";
  var started = Date.now();
  var form = document.getElementById("beta-form");
  var done = document.getElementById("done");
  var status = document.getElementById("status");
  var send = document.getElementById("send");

  var invite = "";
  try { invite = new URLSearchParams(window.location.search).get("k") || ""; } catch (e) { invite = ""; }
  var invited = /^[A-Za-z0-9]{8,40}$/.test(invite);
  if (!invited) {
    form.hidden = true;
    document.getElementById("invite-note").hidden = false;
  }

  function closed() {
    form.hidden = true;
    document.getElementById("invite-note").hidden = true;
    document.getElementById("closed-note").hidden = false;
  }
  fetch("/api/beta/settings", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.settings && j.settings.open === false) closed(); })
    .catch(function () {});

  /* A business owner says what kind. */
  var kindWrap = document.getElementById("kind-wrap");
  var kind = document.getElementById("businessKind");
  form.querySelectorAll('input[name="ranBusiness"]').forEach(function (r) {
    r.addEventListener("change", function () {
      var yes = form.querySelector('input[name="ranBusiness"]:checked').value === "yes";
      kindWrap.hidden = !yes;
      kind.required = yes;
    });
  });

  /* Errors: one line under the field, the field marked, the first one focused. */
  var FIELDS = {
    name: "name", email: "email", phone: "phone", city: "city", phone_type: "phoneType",
    ran_business: "ranBusiness", business_kind: "businessKind", pidgin_comfort: "pidginComfort", languages: "otherLanguages", consent: "consent"
  };
  function clearErrors() {
    form.querySelectorAll(".err").forEach(function (e) { e.hidden = true; });
    form.querySelectorAll("[aria-invalid]").forEach(function (e) { e.removeAttribute("aria-invalid"); });
    status.textContent = "";
  }
  function fail(field) {
    var err = document.getElementById(field + "-err");
    if (err) err.hidden = false;
    var input = form.querySelector('[name="' + (FIELDS[field] || field) + '"]');
    if (input) {
      if (input.type !== "radio" && input.type !== "checkbox") input.setAttribute("aria-invalid", "true");
      return input;
    }
    return null;
  }
  function valueOf(name) {
    var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]:not([type=radio]):not([type=checkbox])');
    return el ? el.value.trim() : "";
  }
  function check() {
    var bad = [];
    if (valueOf("name").length < 2) bad.push("name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valueOf("email"))) bad.push("email");
    var digits = valueOf("phone").replace(/[^\d]/g, "");
    if (digits.length < 10 || digits.length > 15) bad.push("phone");
    if (!valueOf("phoneType")) bad.push("phone_type");
    if (valueOf("city").length < 2) bad.push("city");
    var ran = valueOf("ranBusiness");
    if (!ran) bad.push("ran_business");
    if (ran === "yes" && valueOf("businessKind").length < 2) bad.push("business_kind");
    if (!valueOf("pidginComfort")) bad.push("pidgin_comfort");
    if (!document.getElementById("consent").checked) bad.push("consent");
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
      name: valueOf("name"), email: valueOf("email"), phone: valueOf("phone"), city: valueOf("city"),
      phoneType: valueOf("phoneType"), ranBusiness: valueOf("ranBusiness"),
      businessKind: valueOf("ranBusiness") === "yes" ? valueOf("businessKind") : "", pidginComfort: valueOf("pidginComfort"),
      otherLanguages: Array.prototype.map.call(form.querySelectorAll('[name="otherLanguages"]:checked'), function (c) { return c.value; }),
      consent: true, website: document.getElementById("website").value, formMs: Date.now() - started, k: invite
    };
    send.disabled = true;
    status.textContent = "Sending...";
    fetch("/api/beta/apply", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 200 && res.j.ok) {
          form.hidden = true;
          done.hidden = false;
          done.focus();
          return;
        }
        send.disabled = false;
        if (res.status === 400 && res.j.field) {
          var el = fail(res.j.field);
          status.textContent = "Please check the field marked above.";
          if (el) el.focus();
        } else if (res.status === 409) {
          closed();
        } else if (res.status === 429) {
          var said = typeof res.j.message === "string" ? res.j.message.slice(0, 200) : "";
          status.textContent = said || "Too many people are signing up right now. Please try again later.";
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
