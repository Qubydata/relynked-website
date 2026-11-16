/* relynked.com/beta: the numbers from the API's settings (spots, days, minutes; no pay), and the sign up form.
   The page reads /api/beta/settings and posts /api/beta/apply, both through this
   site's Pages Functions (functions/api/beta), so nothing here talks to another
   site. The quiz is scored on the server: the page holds no answers. */
(function () {
  "use strict";
  var started = Date.now();
  var form = document.getElementById("beta-form");
  var done = document.getElementById("done");
  var status = document.getElementById("status");
  var send = document.getElementById("send");

  function pick(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }
  function longDate(iso) {
    var d = new Date(iso + "T12:00:00Z");
    return isNaN(d) ? null : d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  }

  /* The settings: every [data-k] shows its number; the HTML holds the defaults. */
  function show(s) {
    document.querySelectorAll("[data-k]").forEach(function (el) {
      var v = pick(s, el.getAttribute("data-k"));
      if (v === undefined || v === null) return;
      el.textContent = String(v);
    });
    if (s.replyBy) {
      var when = longDate(s.replyBy);
      if (when) {
        var a = document.getElementById("faq-when");
        var b = document.getElementById("done-when");
        if (a) a.textContent = "We email the people we pick by " + when + ". If you are not picked this time, you stay on the waiting list and we may email you for a later sprint.";
        if (b) b.textContent = "Picks go out by " + when + ". If you are not picked this time, you stay on the waiting list for the next sprint.";
      }
    }
    if (s.open === false) closed();
  }
  function closed() {
    form.hidden = true;
    document.getElementById("closed-note").hidden = false;
    document.getElementById("bh-closed").hidden = false;
  }
  fetch("/api/beta/settings", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.settings) show(j.settings); })
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
    name: "name", email: "email", phone: "phone", city: "city", phone_type: "phoneType", minutes: "minutes",
    ran_business: "ranBusiness", business_kind: "businessKind", pidgin_comfort: "pidginComfort", quiz: "wrongPrice", consent: "consent"
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
      if (input.type !== "radio") input.setAttribute("aria-invalid", "true");
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
    if (valueOf("city").length < 2) bad.push("city");
    if (!valueOf("phoneType")) bad.push("phone_type");
    if (!valueOf("minutes")) bad.push("minutes");
    var ran = valueOf("ranBusiness");
    if (!ran) bad.push("ran_business");
    if (ran === "yes" && valueOf("businessKind").length < 2) bad.push("business_kind");
    if (!valueOf("pidginComfort")) bad.push("pidgin_comfort");
    if (!valueOf("wrongPrice") || !valueOf("total") || valueOf("bug").length < 3 || valueOf("pidgin").length < 3) bad.push("quiz");
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
      phoneType: valueOf("phoneType"), minutes: Number(valueOf("minutes")), ranBusiness: valueOf("ranBusiness"),
      businessKind: valueOf("businessKind"), pidginComfort: valueOf("pidginComfort"),
      otherLanguages: Array.prototype.map.call(form.querySelectorAll('[name="otherLanguages"]:checked'), function (c) { return c.value; }),
      wrongPrice: valueOf("wrongPrice"), bug: valueOf("bug"), pidgin: valueOf("pidgin"), total: valueOf("total"),
      consent: true, website: document.getElementById("website").value, formMs: Date.now() - started
    };
    send.disabled = true;
    status.textContent = "Sending...";
    fetch("/api/beta/apply", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status === 200 && res.j.ok) {
          form.hidden = true;
          var firstName = body.name.split(/\s+/)[0];
          document.getElementById("done-title").textContent = "Thank you, " + firstName + ". Your application is in.";
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
          status.textContent = "Too many tries from this connection. Please try again in a few minutes.";
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
