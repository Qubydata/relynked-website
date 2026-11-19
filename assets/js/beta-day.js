/* relynked.com/beta/checkin and /beta/feedback: a tester's own page (founder, 19 Nov 2026: "we have to make it
   seamless for them"). One personal link, no sign in, no code to type. The link's token rides after the # (so it is
   never sent in an address), is kept on this phone, and is posted to /api/beta/* (this site's Pages Functions).

   Every tap is saved at once, on its own. A save that could not be sent waits on this phone and is sent again when
   the connection is back, so a dropped connection or a closed tab loses nothing. Everything on the page is built
   with textContent, never HTML. No library. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var PAGE = document.body.getAttribute("data-page");
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem("rb." + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem("rb." + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem("rb." + k); } catch (e) { /* private mode */ } }
  };

  /* The token: from the link's # ONLY (#t=...; never a ?t=, which would be sent to servers and kept in their logs),
     else the one this phone already has. Once kept it is taken out of the address bar and the history, so it is
     not left on screen, in a screenshot, in a shared tab or in the browser's history. */
  var m = /^#t=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  var token = m ? m[1] : store.get("t");
  if (m) {
    if (store.get("t") !== m[1]) { store.del("view"); store.del("pending"); }
    store.set("t", m[1]);
  }
  if (location.hash) { try { history.replaceState(null, "", location.pathname); } catch (e) { /* an old browser keeps the # */ } }

  var view = null;      // what the server last said
  var day = null;       // the day on screen
  var mode = PAGE === "feedback" ? "questions" : "day";
  var step = 0;         // the section of the final questions on screen
  var pending = store.get("pending") || {};
  var sending = false;
  var touched = false;  // something was answered since the page asked the server
  var ticks = {};       // save key -> the element that shows "Saved"

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function button(cls, text, on) {
    var b = el("button", cls, text);
    b.type = "button";
    if (on) b.addEventListener("click", on);
    return b;
  }
  function clear() { while (app.firstChild) app.removeChild(app.firstChild); ticks = {}; }
  function niceDay(iso) {
    try { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }); } catch (e) { return iso; }
  }

  /* A whole screen message, with a button when there is something to do. */
  function message(title, line, label, on) {
    clear();
    var c = el("div", "card center");
    c.appendChild(el("p", "big", title));
    c.appendChild(el("p", "soft", line));
    if (label) c.appendChild(button("btn", label, on));
    app.appendChild(c);
  }

  function call(path, body) {
    body.token = token;
    return fetch("/api/beta/" + path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
  }

  /* ── Saving: one small request per answer, kept on the phone until it is in ─────────────────────────────────── */
  function tick(key, cls, text) {
    var t = ticks[key];
    if (t) { t.className = "saved" + (cls ? " " + cls : ""); t.textContent = text; }
  }
  function save(key, path, body) {
    touched = true;
    pending[key] = { path: path, body: body };
    store.set("pending", pending);
    tick(key, "wait", "Saving");
    flush();
  }
  function flush() {
    if (sending) return;
    var keys = Object.keys(pending);
    if (!keys.length) return;
    var key = keys[0];
    var job = pending[key];
    sending = true;
    call(job.path, job.body).then(function (r) {
      sending = false;
      if (pending[key] !== job) return flush();   // a newer answer for the same thing is waiting
      if (r.status === 200) {
        delete pending[key];
        tick(key, "", "✓ Saved");
      } else if (r.status === 409 || r.status === 400 || r.status === 404 || r.status === 413) {
        delete pending[key];
        tick(key, "err", r.status === 409 ? "This is closed now, so it was not saved." : r.status === 404 ? "This link no longer works." : "That could not be saved. Please check it.");
      } else {
        tick(key, "wait", "Saved on this phone. We will send it again in a moment.");
        store.set("pending", pending);
        return setTimeout(flush, r.status === 429 ? 30000 : 5000);
      }
      store.set("pending", pending);
      flush();
    }, function () {
      sending = false;
      tick(key, "wait", "No connection. Saved on this phone, sending when you are back online.");
      setTimeout(flush, 6000);
    });
  }
  window.addEventListener("online", flush);

  /* What is on screen wins over what the server said while a save is still waiting. */
  function resultOf(taskKey) {
    var p = pending["c:" + taskKey];
    if (p) return { task: taskKey, status: p.body.status, note: p.body.note || null, screenshot: p.body.screenshot || null, shops: p.body.shops || [] };
    for (var i = 0; i < view.results.length; i++) if (view.results[i].task === taskKey) return view.results[i];
    return null;
  }
  function remember(taskKey, r) {
    var list = view.results.filter(function (x) { return x.task !== taskKey; });
    list.push(r);
    view.results = list;
    store.set("view", view);
  }
  function answerOf(q, shop) {
    var p = pending["a:" + q + ":" + (shop || "")];
    if (p) return p.body.answer;
    var a = view.feedback.answers;
    for (var i = 0; i < a.length; i++) if (a[i].q === q && (a[i].shop || "") === (shop || "")) return a[i].answer;
    return "";
  }
  function setAnswer(q, shop, answer) {
    var list = view.feedback.answers.filter(function (x) { return !(x.q === q && (x.shop || "") === (shop || "")); });
    if (answer !== "") list.push({ q: q, shop: shop || null, answer: answer });
    view.feedback.answers = list;
    store.set("view", view);
    save("a:" + q + ":" + (shop || ""), "answer", { question: q, shop: shop || "", answer: answer });
  }
  function typed(input, fn) {
    var timer = null;
    var go = function () { clearTimeout(timer); timer = null; fn(input.value.trim()); };
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(go, 900); });
    input.addEventListener("blur", function () { if (timer) go(); });
  }

  /* ── The day ───────────────────────────────────────────────────────────────────────────────────────────────── */
  function header() {
    var s = view.sprint;
    app.appendChild(el("h1", "", "Hello " + view.me.firstName));
    var role = view.me.role === "business" ? "Business tester" : "Customer tester";
    app.appendChild(el("p", "soft", role + (s.today ? ", " + niceDay(s.today) : "")));
    var row = el("div", "days");
    view.days.forEach(function (d) {
      var b = button("day", d.index === s.dayIndex ? d.label + ", today" : d.label, function () { mode = "day"; day = d.index; render(); });
      b.setAttribute("aria-pressed", String(mode === "day" && d.index === day));
      row.appendChild(b);
    });
    if (view.feedback.open) {
      var f = button("day final", "Final questions", function () { mode = "questions"; render(); });
      f.setAttribute("aria-pressed", String(mode === "questions"));
      row.appendChild(f);
    }
    if (row.firstChild) app.appendChild(row);
    // The chosen day is always in sight, even when the row is wider than the phone.
    var on = row.querySelector('[aria-pressed="true"]');
    if (on && on.offsetLeft + on.offsetWidth > row.clientWidth) row.scrollLeft = on.offsetLeft + on.offsetWidth - row.clientWidth + 16;
  }

  function taskCard(t, open) {
    var r = resultOf(t.key) || { task: t.key, status: null, note: null, screenshot: null, shops: [] };
    var card = el("section", "card task");
    card.appendChild(el("h2", "", t.title));
    var tri = el("div", "tri");
    var more = el("div", "more");
    var saved = el("p", "saved");
    saved.setAttribute("role", "status");
    ticks["c:" + t.key] = saved;
    if (pending["c:" + t.key]) { saved.className = "saved wait"; saved.textContent = "Saved on this phone, sending"; }
    var buttons = [];
    function push() {
      remember(t.key, r);
      save("c:" + t.key, "checkin", { task: t.key, status: r.status, note: r.note || "", screenshot: r.screenshot || "", shops: r.shops });
    }
    function drawMore() {
      while (more.firstChild) more.removeChild(more.firstChild);
      more.hidden = !r.status || r.status === "done";
      if (more.hidden) return;
      if (t.perShop && view.shops.length > 1) {
        more.appendChild(el("label", "", view.me.role === "business" ? "With which business?" : "With which shop?"));
        var chips = el("div", view.shops.length > 4 ? "chips many" : "chips");
        view.shops.forEach(function (s) {
          var c = button("opt", s.name, function () {
            var at = r.shops.indexOf(s.ref);
            if (at >= 0) r.shops.splice(at, 1); else r.shops.push(s.ref);
            c.setAttribute("aria-pressed", String(at < 0));
            push();
          });
          c.setAttribute("aria-pressed", String(r.shops.indexOf(s.ref) >= 0));
          c.disabled = !open;
          chips.appendChild(c);
        });
        more.appendChild(chips);
      }
      var id = "n-" + t.key;
      var lab = el("label", "", "What happened?");
      lab.htmlFor = id;
      var box = el("textarea");
      box.id = id; box.maxLength = 500; box.rows = 3; box.value = r.note || ""; box.disabled = !open;
      box.placeholder = "What you did, what you expected, what you saw";
      typed(box, function (v) { r.note = v || null; push(); });
      more.appendChild(lab); more.appendChild(box);
      var lab2 = el("label", "", "Screenshot link (optional)");
      lab2.htmlFor = "s-" + t.key;
      var shot = el("input");
      shot.type = "url"; shot.id = "s-" + t.key; shot.maxLength = 300; shot.inputMode = "url"; shot.value = r.screenshot || ""; shot.disabled = !open;
      shot.placeholder = "https://";
      typed(shot, function (v) {
        if (v && !/^https:\/\/[^\s<>"'()[\]`]{4,290}$/.test(v)) { tick("c:" + t.key, "err", "A screenshot link starts with https:// and has no spaces or brackets."); return; }
        r.screenshot = v || null; push();
      });
      more.appendChild(lab2); more.appendChild(shot);
      more.appendChild(el("p", "hint", "Paste a link to your screenshot or screen recording if you have one."));
    }
    [["done", "Done", ""], ["failed", "Failed", " bad"], ["stuck", "Got stuck", " stuck"]].forEach(function (o) {
      var b = button("ans" + o[2], o[1], function () {
        r.status = o[0];
        if (o[0] === "done") { r.note = null; r.screenshot = null; r.shops = []; }
        buttons.forEach(function (x) { x.b.setAttribute("aria-pressed", String(x.v === r.status)); });
        drawMore();
        push();
        counter();
        if (o[0] !== "done") { var box = more.querySelector("textarea"); if (box) box.focus(); }
      });
      b.setAttribute("aria-pressed", String(r.status === o[0]));
      b.disabled = !open;
      buttons.push({ b: b, v: o[0] });
      tri.appendChild(b);
    });
    card.appendChild(tri);
    drawMore();
    card.appendChild(more);
    card.appendChild(saved);
    return card;
  }

  var countEl = null;
  function counter() {
    if (!countEl) return;
    var tasks = view.tasks.filter(function (t) { return t.day === day; });
    var n = tasks.filter(function (t) { var r = resultOf(t.key); return r && r.status; }).length;
    countEl.textContent = n === tasks.length && n > 0 ? "All " + n + " answered. Thank you." : n + " of " + tasks.length + " answered";
  }

  function renderDay() {
    var s = view.sprint;
    if (s.dayIndex === null || s.dayIndex === undefined) {
      app.appendChild(cardOf("The sprint has not started yet", "We will email you the start day. Keep this link: it is the only one you need."));
      return;
    }
    if (s.dayIndex < 0) {
      app.appendChild(cardOf("The sprint starts on " + niceDay(s.starts), "Come back to this link that day. It will show your tasks."));
      return;
    }
    var tasks = view.tasks.filter(function (t) { return t.day === day; });
    var open = day === s.dayIndex;
    if (view.feedback.open && day === s.dayIndex) app.appendChild(lastStep());
    if (view.shops.length) {
      var p = el("p", "shops");
      p.appendChild(el("b", "", view.me.role === "business" ? "Your business: " : "Your shops: "));
      p.appendChild(document.createTextNode(view.shops.map(function (x) { return x.name + (x.code ? " (code " + x.code + ")" : ""); }).join(", ")));
      app.appendChild(p);
    }
    if (!tasks.length) {
      app.appendChild(cardOf(s.dayIndex > s.lastIndex ? "The sprint is over" : "Nothing for you today", s.dayIndex > s.lastIndex ? "Thank you for testing with us." : view.me.role === "customer" && day === 0 ? "Today the business testers set up their shops. Your tasks start tomorrow." : "Check back tomorrow."));
      return;
    }
    countEl = el("p", "count");
    app.appendChild(countEl);
    if (!open) app.appendChild(el("p", "closed", "This day is closed. You can read it, but not change it."));
    tasks.forEach(function (t) { app.appendChild(taskCard(t, open)); });
    counter();
    if (open) app.appendChild(el("p", "hint", "Every tap is saved at once. You can change today's answers until midnight."));
  }
  function cardOf(title, line) {
    var c = el("div", "card center");
    c.appendChild(el("p", "big", title));
    c.appendChild(el("p", "soft", line));
    return c;
  }
  function lastStep() {
    var c = el("div", "card banner");
    c.appendChild(el("p", "big", "Last day: final questions"));
    c.appendChild(el("p", "soft", "After today's tasks, tell us how it went. Mostly taps, about 5 minutes."));
    c.appendChild(button("btn", "Answer the final questions", function () { mode = "questions"; window.scrollTo(0, 0); render(); }));
    return c;
  }

  /* ── The final questions: one section a screen ─────────────────────────────────────────────────────────────── */
  function sections() {
    var out = [];
    view.feedback.questions.forEach(function (q) {
      var last = out[out.length - 1];
      if (!last || last.key !== q.section) out.push(last = { key: q.section, title: q.sectionTitle, qs: [] });
      last.qs.push(q);
    });
    return out;
  }
  function choiceRow(cls, options, current, on) {
    var wrap = el("div", cls);
    var all = [];
    options.forEach(function (o) {
      var b = button("opt", o.label, function () {
        all.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        on(o.value);
      });
      b.setAttribute("aria-pressed", String(current === o.value));
      all.push(b);
      wrap.appendChild(b);
    });
    return wrap;
  }
  var ONE_TO_FIVE = ["1", "2", "3", "4", "5"].map(function (n) { return { value: n, label: n }; });
  function question(q) {
    var box = el("div", "q");
    box.appendChild(el("h2", "", q.prompt));
    var shops = view.shops.map(function (s) { return { value: s.ref, label: s.name }; });
    if (q.kind === "choice") {
      box.appendChild(choiceRow(q.options.length > 4 || q.options.some(function (o) { return o.label.length > 12; }) ? "stack" : "chips", q.options, answerOf(q.key), function (v) { setAnswer(q.key, "", v); }));
    } else if (q.kind === "shop_choice") {
      box.appendChild(shops.length ? choiceRow(shops.length > 4 ? "chips many" : "stack", shops, answerOf(q.key), function (v) { setAnswer(q.key, "", v); }) : el("p", "soft", "You have no shops listed yet."));
    } else if (q.kind === "shop_rating") {
      if (!shops.length) box.appendChild(el("p", "soft", "You have no shops listed yet."));
      view.shops.forEach(function (s) {
        var row = el("div", "shoprow");
        row.appendChild(el("span", "", s.name));
        row.appendChild(choiceRow("five", ONE_TO_FIVE, answerOf(q.key, s.ref), function (v) { setAnswer(q.key, s.ref, v); }));
        var t = el("p", "saved");
        ticks["a:" + q.key + ":" + s.ref] = t;
        row.appendChild(t);
        box.appendChild(row);
      });
      return box;
    } else {
      var input = el(q.kind === "minutes" ? "input" : "textarea");
      if (q.kind === "minutes") { input.type = "number"; input.min = "0"; input.max = "600"; input.inputMode = "numeric"; input.placeholder = "Minutes"; }
      else { input.maxLength = 500; input.rows = 3; }
      input.setAttribute("aria-label", q.prompt);
      input.value = answerOf(q.key);
      typed(input, function (v) {
        if (q.kind === "minutes" && v !== "" && !/^\d{1,3}$/.test(v)) { tick("a:" + q.key + ":", "err", "Please type a number of minutes."); return; }
        setAnswer(q.key, "", v);
      });
      box.appendChild(input);
    }
    var t2 = el("p", "saved");
    t2.setAttribute("role", "status");
    ticks["a:" + q.key + ":"] = t2;
    box.appendChild(t2);
    return box;
  }
  function renderQuestions() {
    var f = view.feedback;
    if (!f.open) {
      var past = view.sprint.dayIndex !== null && view.sprint.lastIndex !== null && view.sprint.dayIndex > view.sprint.lastIndex;
      var c = cardOf(past ? "The final questions are closed" : "The final questions are not open yet", past ? "Thank you for testing with us." : f.opensOn ? "They open on " + niceDay(f.opensOn) + ", the last day of the sprint. This same link will show them." : "They open on the last day of the sprint. This same link will show them.");
      if (!past) c.appendChild(button("btn", "Go to today's check-in", function () { mode = "day"; render(); }));
      app.appendChild(c);
      return;
    }
    var secs = sections();
    if (!secs.length) { app.appendChild(cardOf("No questions yet", "Please check back a little later.")); return; }
    if (step >= secs.length) {
      var d = cardOf("Thank you, " + view.me.firstName, "All your answers are saved. You can still change them this week.");
      d.appendChild(button("btn ghost", "Look at my answers again", function () { step = 0; window.scrollTo(0, 0); render(); }));
      app.appendChild(d);
      return;
    }
    var sec = secs[step];
    var bar = el("div", "bar");
    var fill = el("i");
    fill.style.width = Math.round(((step + 1) / secs.length) * 100) + "%";
    bar.appendChild(fill);
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "1"); bar.setAttribute("aria-valuemax", String(secs.length)); bar.setAttribute("aria-valuenow", String(step + 1));
    app.appendChild(bar);
    app.appendChild(el("p", "count", "Part " + (step + 1) + " of " + secs.length));
    var card = el("section", "card");
    card.appendChild(el("p", "big", sec.title));
    sec.qs.forEach(function (q) { card.appendChild(question(q)); });
    app.appendChild(card);
    var nav = el("div", "nav");
    var back = button("btn ghost", "Back", function () { step--; store.set("step", step); window.scrollTo(0, 0); render(); });
    back.disabled = step === 0;
    nav.appendChild(back);
    nav.appendChild(button("btn", step === secs.length - 1 ? "Finish" : "Next", function () { step++; store.set("step", step); window.scrollTo(0, 0); render(); }));
    app.appendChild(nav);
    app.appendChild(el("p", "hint", "Every answer is saved as you tap. You can skip a question and come back."));
  }

  function render() {
    clear();
    countEl = null;
    header();
    if (mode === "questions") renderQuestions(); else renderDay();
  }

  /* ── Opening ───────────────────────────────────────────────────────────────────────────────────────────────── */
  function show(v, fresh) {
    var first = view === null || view.sprint.dayIndex !== v.sprint.dayIndex || view.me.role !== v.me.role;
    view = v;
    store.set("view", v);
    var s = v.sprint;
    if (first) {
      var days = v.days.map(function (d) { return d.index; });
      day = days.indexOf(s.dayIndex) >= 0 ? s.dayIndex : days.length ? days[days.length - 1] : s.dayIndex;
      step = Math.max(0, Number(store.get("step")) || 0);
      // After the last day the link goes straight to the final questions.
      if (v.feedback.open && s.dayIndex > s.lastIndex) mode = "questions";
      render();
    } else if (fresh && !document.activeElement.matches("textarea,input")) render();
  }
  function load() {
    call("me", {}).then(function (r) {
      if (r.status === 200 && r.json && r.json.ok) {
        // Answered while the page was still asking: what is on screen is newer, so it stays.
        if (!(view && touched)) show(r.json, true);
        flush();
        return;
      }
      if (r.status === 404) {
        store.del("t"); store.del("view"); store.del("pending");
        return message("This link no longer works", "Reply to our last email and we will send you a new link. Nothing you saved is lost.");
      }
      if (view) return;   // the copy kept on this phone is on screen; saves go on waiting
      if (r.status === 429) return message("Too many tries", "Please wait a few minutes, then try again.", "Try again", start);
      message("We could not open your page", "This is on our side, not yours. Please try again in a moment.", "Try again", start);
    }, function () {
      if (view) return;
      message("No connection", "Check your data or Wi-Fi, then try again.", "Try again", start);
    });
  }
  function start() {
    if (!token) return message("Open the link in your email", "Your personal link is in the email from Relynked titled \"Your Relynked beta check-in link\". Open it on this phone once, and this page will remember you.");
    var kept = store.get("view");
    if (kept && kept.me && kept.sprint && kept.feedback) show(kept, false);
    else message("Opening your page", "One moment.");
    load();
  }
  start();
})();
