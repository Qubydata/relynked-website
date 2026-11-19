/* relynked.com/beta/checkin and /beta/feedback: a tester's own page (founder, 19 Nov 2026: "we have to make it
   seamless for them"). One personal link, no sign in, no code to type. The link's token rides after the # (so it is
   never sent in an address), is kept on this phone, and is posted to /api/beta/* (this site's Pages Functions).

   The look follows the tester proposal deck: one task, or one question, on screen at a time.

   Every tap is saved at once, on its own. A save that could not be sent waits on this phone and is sent again when
   the connection is back, so a dropped connection or a closed tab loses nothing. Everything on the page is built
   with textContent, never HTML. No library. */
(function () {
  "use strict";
  var app = document.getElementById("app");
  var hero = document.getElementById("hero");
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
  var mode = PAGE === "feedback" ? "questions" : "day";   // day | questions | days (earlier days) | shops
  var idx = null;       // the task on screen (null: the first one not answered yet)
  var changing = null;  // the task whose three answers are shown again after "Change"
  var step = 0;         // the question screen on screen
  var dir = 0;          // 1: the next screen slides in from the right, -1: from the left
  var pending = store.get("pending") || {};
  var sending = false;
  var touched = false;  // something was answered since the page asked the server
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  function clear() {
    while (app.firstChild) app.removeChild(app.firstChild);
    while (hero.firstChild) hero.removeChild(hero.firstChild);
  }
  function niceDay(iso) {
    try { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }); } catch (e) { return iso; }
  }
  function top() { try { window.scrollTo(0, 0); } catch (e) { /* old browser */ } }

  /* The forest band's greeting. */
  function greet(when, small) {
    hero.className = small ? "hero-sm" : "";
    if (!small) hero.appendChild(el("p", "hi", "Hi " + view.me.firstName));
    hero.appendChild(el("p", "when", when));
  }

  /* A whole forest screen: one huge line, one plain sentence, a button when there is something to do. */
  function full(title, line, label, on) {
    document.body.className = "dark";
    var c = el("section", "full");
    c.appendChild(el("h1", "", title));
    if (line) c.appendChild(el("p", "line", line));
    if (label) { var b = button("btn lime go", label, on); c.appendChild(b); }
    app.appendChild(c);
    return c;
  }
  function message(title, line, label, on) {
    clear();
    full(title, line, label, on);
  }

  function call(path, body) {
    body.token = token;
    return fetch("/api/beta/" + path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
  }

  /* ── Saving: one small request per answer, kept on the phone until it is in ─────────────────────────────────── */
  /* One quiet message at the bottom of the screen, never a tick per answer. */
  var pill = el("p", "pill off");
  pill.setAttribute("role", "status");
  pill.setAttribute("aria-live", "polite");
  document.body.appendChild(pill);
  var pillTimer = null;
  function tick(key, cls, text) {
    clearTimeout(pillTimer);
    if (cls === "wait" && text === "Saving") return;   // a save on its way says nothing until it is in
    pill.textContent = text;
    pill.className = "pill " + (cls || "ok");
    if (!cls) pillTimer = setTimeout(function () { pill.className = "pill ok off"; }, 1600);
    else if (cls === "err") pillTimer = setTimeout(function () { pill.className = "pill err off"; }, 5000);
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
        if (!Object.keys(pending).length) tick(key, "", "Saved");
      } else if (r.status === 409 || r.status === 400 || r.status === 404 || r.status === 413) {
        delete pending[key];
        tick(key, "err", r.status === 409 ? "This is closed now, so it was not saved." : r.status === 404 ? "This link no longer works." : "That could not be saved. Please check it.");
      } else {
        tick(key, "wait", "Saved on this phone. Sending again soon.");
        store.set("pending", pending);
        return setTimeout(flush, r.status === 429 ? 30000 : 5000);
      }
      store.set("pending", pending);
      flush();
    }, function () {
      sending = false;
      tick(key, "wait", "Saving when you're back online");
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
  /* Before leaving a screen, a half typed answer is saved (its blur runs the save). */
  function settle() { var a = document.activeElement; if (a && a.blur && a.matches && a.matches("textarea,input")) a.blur(); }

  /* ── Shared screen parts ───────────────────────────────────────────────────────────────────────────────────── */
  function topRow(n, of, label, onBack) {
    var row = el("div", "top");
    var b = button("back" + (onBack ? "" : " hide"), "", onBack);
    b.setAttribute("aria-label", "Back");
    if (!onBack) b.tabIndex = -1;
    row.appendChild(b);
    row.appendChild(el("p", "count", label));
    app.appendChild(row);
    if (of) progress(n, of, label);
  }
  function progress(n, of, label) {
    var bar = el("div", "bar");
    var fill = el("i");
    fill.style.width = Math.round((n / of) * 100) + "%";
    bar.appendChild(fill);
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", label);
    bar.setAttribute("aria-valuemin", "1"); bar.setAttribute("aria-valuemax", String(of)); bar.setAttribute("aria-valuenow", String(n));
    app.appendChild(bar);
  }
  /* The card slides in (transform only), from the side the tester is going. */
  function stage(card) {
    var s = el("div", "stage");
    s.appendChild(card);
    app.appendChild(s);
    if (dir && !still) {
      card.className += dir > 0 ? " from-r" : " from-l";
      void card.offsetWidth;
      requestAnimationFrame(function () { card.className = card.className.replace(/ from-[rl]/, ""); });
    }
    dir = 0;
  }
  function quietLinks(list, into) {
    var q = el("div", "quiet");
    list.forEach(function (x) { if (x) q.appendChild(button("link", x[0], x[1])); });
    if (q.firstChild) (into || app).appendChild(q);
  }
  function earlier() { return view.days.filter(function (d) { return d.index < view.sprint.dayIndex; }); }
  function go(newMode, opts) {
    return function () {
      settle();
      mode = newMode;
      if (opts && "day" in opts) day = opts.day;
      if (opts && "idx" in opts) idx = opts.idx;
      top();
      render();
    };
  }
  function bottomLinks(into) {
    quietLinks([
      earlier().length ? ["Earlier days", go("days")] : null,
      view.shops.length ? [view.me.role === "business" ? "Your business" : "Your shops", go("shops")] : null,
      view.feedback.open ? ["Final questions", go("questions")] : null
    ], into);
  }
  function dayLabel(d) {
    for (var i = 0; i < view.days.length; i++) if (view.days[i].index === d) return view.days[i].label;
    return "Day " + d;
  }
  function whenToday() {
    var s = view.sprint;
    var l = dayLabel(s.dayIndex);
    return s.dayIndex >= 1 && s.lastIndex ? l + " of " + s.lastIndex : l;
  }
  var STATUS = { done: "Done", failed: "Didn't work", stuck: "Got stuck" };

  /* ── The day: one task a screen ─────────────────────────────────────────────────────────────────────────────── */
  function todays() { return view.tasks.filter(function (t) { return t.day === day; }); }
  function answered(t) { var r = resultOf(t.key); return !!(r && r.status); }
  function firstOpen(tasks) {
    for (var i = 0; i < tasks.length; i++) if (!answered(tasks[i])) return i;
    return tasks.length;
  }

  function renderDay() {
    var s = view.sprint;
    if (s.dayIndex === null || s.dayIndex === undefined) return full("Not started yet.", "We will email you the start day. Keep this link, it is the only one you need.");
    if (s.dayIndex < 0) return full("Not open yet.", "The sprint starts on " + niceDay(s.starts) + ". Come back to this link that day.");
    if (day !== s.dayIndex) return renderClosedDay();
    var tasks = todays();
    if (!tasks.length) {
      if (s.dayIndex > s.lastIndex) return full("The sprint is over.", "Thank you for testing with us.");
      return bottomLinks(full("Nothing for you today.", view.me.role === "customer" && day === 0 ? "Today the business testers set up their shops. Your tasks start tomorrow." : "Check back tomorrow."));
    }
    if (idx === null) idx = firstOpen(tasks);
    if (idx >= tasks.length && firstOpen(tasks) < tasks.length) idx = firstOpen(tasks);
    if (idx >= tasks.length) return renderDone();
    document.body.className = "";
    greet(whenToday());
    var t = tasks[idx];
    topRow(idx + 1, tasks.length, (idx + 1) + " of " + tasks.length, idx > 0 ? function () { settle(); changing = null; idx--; dir = -1; top(); render(); } : null);
    stage(taskCard(t));
    bottomLinks();
  }

  function next() {
    settle();
    changing = null;
    idx++;
    dir = 1;
    top();
    render();
    var h = app.querySelector(".card h2");
    if (h) { h.tabIndex = -1; try { h.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
  }

  function taskCard(t) {
    var r = resultOf(t.key) || { task: t.key, status: null, note: null, screenshot: null, shops: [] };
    r = { task: r.task, status: r.status, note: r.note, screenshot: r.screenshot, shops: (r.shops || []).slice() };
    var card = el("section", "card task");
    card.appendChild(el("h2", "", t.title));
    if (t.help) card.appendChild(el("p", "help", t.help));
    function push() {
      remember(t.key, r);
      save("c:" + t.key, "checkin", { task: t.key, status: r.status, note: r.note || "", screenshot: r.screenshot || "", shops: r.shops });
    }
    var showMore = (r.status === "failed" || r.status === "stuck") && changing !== t.key;
    if (!showMore) {
      var tri = el("div", "tri");
      [["done", "Done", " done"], ["failed", "Didn't work", " bad"], ["stuck", "Got stuck", " stuck"]].forEach(function (o) {
        var b = button("ans" + o[2], o[1], function () {
          r.status = o[0];
          if (o[0] === "done") { r.note = null; r.screenshot = null; r.shops = []; }
          push();
          if (o[0] === "done") return next();
          changing = null;
          render();
          var first = app.querySelector(".more .opt, .more textarea");
          if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
        });
        b.setAttribute("aria-pressed", String(r.status === o[0]));
        tri.appendChild(b);
      });
      card.appendChild(tri);
      if (r.status) card.appendChild(button("btn ghost", "Next", next));
      return card;
    }

    /* "Didn't work" or "Got stuck": a few calm questions on the same screen. */
    var more = el("div", "more");
    var picked = el("div", "picked");
    picked.appendChild(el("span", "tag" + (r.status === "stuck" ? " stuck" : ""), STATUS[r.status]));
    picked.appendChild(button("link", "Change", function () { settle(); changing = t.key; render(); }));
    more.appendChild(picked);
    if (t.perShop && view.shops.length > 1) {
      more.appendChild(el("p", "ask", view.me.role === "business" ? "Which business?" : "Which shop?"));
      var chips = el("div", view.shops.length > 4 ? "chips many" : "chips");
      view.shops.forEach(function (s) {
        var c = button("opt", s.name, function () {
          var at = r.shops.indexOf(s.ref);
          if (at >= 0) r.shops.splice(at, 1); else r.shops.push(s.ref);
          c.setAttribute("aria-pressed", String(at < 0));
          push();
        });
        c.setAttribute("aria-pressed", String(r.shops.indexOf(s.ref) >= 0));
        chips.appendChild(c);
      });
      more.appendChild(chips);
    }
    var id = "n-" + t.key;
    var lab = el("label", "ask", "What happened?");
    lab.htmlFor = id;
    var box = el("textarea");
    box.id = id; box.maxLength = 500; box.rows = 4; box.value = r.note || "";
    box.placeholder = "What you did, what you expected, what you saw";
    typed(box, function (v) { r.note = v || null; push(); });
    more.appendChild(lab); more.appendChild(box);
    var lab2 = el("label", "ask", "Screenshot link ");
    lab2.appendChild(el("small", "", "(optional)"));
    lab2.htmlFor = "s-" + t.key;
    var shot = el("input");
    shot.type = "url"; shot.id = "s-" + t.key; shot.maxLength = 300; shot.inputMode = "url"; shot.value = r.screenshot || "";
    shot.placeholder = "https://";
    var note = el("p", "note");
    note.setAttribute("role", "status");
    var good = true;
    // The line under the field changes only while typing, never on leaving it, so a tap on Next never moves.
    shot.addEventListener("input", function () { if (note.textContent) note.textContent = ""; });
    typed(shot, function (v) {
      if (v && !/^https:\/\/[^\s<>"'()[\]`]{4,290}$/.test(v)) { good = false; note.textContent = "A screenshot link starts with https:// and has no spaces or brackets."; return; }
      good = true;
      r.screenshot = v || null; push();
    });
    more.appendChild(lab2); more.appendChild(shot); more.appendChild(note);
    card.appendChild(more);
    card.appendChild(button("btn", "Next", function () {
      settle();
      if (!good) { shot.focus(); return; }
      next();
    }));
    return card;
  }

  function renderDone() {
    var s = view.sprint;
    var last = view.feedback.open && day === s.dayIndex;
    var c = full("", last ? "One last thing: a few quick questions about how it felt." : "See you tomorrow.", last ? "Answer the final questions" : null, go("questions"));
    var h = c.querySelector("h1");
    h.appendChild(document.createTextNode("All done "));
    h.appendChild(el("em", "", "for today."));
    var mark = el("span", "tickmark");
    mark.setAttribute("aria-hidden", "true");
    c.insertBefore(mark, h);
    quietLinks([
      ["Change an answer", function () { idx = 0; dir = -1; top(); render(); }],
      earlier().length ? ["Earlier days", go("days")] : null
    ], c);
  }

  /* An earlier day: read only, all on one calm list. */
  function renderClosedDay() {
    document.body.className = "";
    greet(dayLabel(day) + ", closed");
    topRow(1, 0, "Read only", go("days"));
    var list = el("div", "list");
    todays().forEach(function (t) {
      var r = resultOf(t.key);
      var row = el("div", "row");
      row.appendChild(el("b", "", t.title));
      row.appendChild(el("span", r && r.status ? "" : "none", r && r.status ? STATUS[r.status] || r.status : "Not answered"));
      list.appendChild(row);
    });
    if (!list.firstChild) list.appendChild(el("div", "row", "Nothing for you that day."));
    app.appendChild(list);
    app.appendChild(button("btn", "Back to today", go("day", { day: view.sprint.dayIndex, idx: null })));
  }
  function renderDays() {
    document.body.className = "";
    greet("Earlier days");
    topRow(1, 0, "Days closed", go("day", { day: view.sprint.dayIndex, idx: null }));
    var list = el("div", "stack");
    earlier().forEach(function (d) { list.appendChild(button("opt", d.label, go("day", { day: d.index }))); });
    app.appendChild(list);
  }
  function renderShops() {
    document.body.className = "";
    greet(view.me.role === "business" ? "Your business" : "Your shops");
    topRow(1, 0, view.shops.length + (view.shops.length === 1 ? " shop" : " shops"), go(PAGE === "feedback" && view.feedback.open ? "questions" : "day", { day: view.sprint.dayIndex }));
    var list = el("div", "list");
    view.shops.forEach(function (s) {
      var row = el("div", "row shop");
      row.appendChild(el("b", "", s.name));
      if (s.code) { var sp = el("span", "", "Code "); sp.appendChild(el("code", "", s.code)); row.appendChild(sp); }
      list.appendChild(row);
    });
    app.appendChild(list);
  }

  /* ── The final questions: one question a screen ────────────────────────────────────────────────────────────── */
  /* A rating for each shop is one screen per shop, so a screen never asks two things. */
  function screens() {
    var out = [];
    view.feedback.questions.forEach(function (q) {
      if (q.kind === "shop_rating") view.shops.forEach(function (s) { out.push({ q: q, shop: s }); });
      else if (q.kind === "shop_choice" && !view.shops.length) return;
      else out.push({ q: q, shop: null });
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
  function move(by, total) {
    return function () {
      settle();
      step = Math.max(0, Math.min(total, step + by));
      store.set("qstep", step);
      dir = by;
      top();
      render();
    };
  }
  function questionCard(sc, total, nav) {
    var q = sc.q;
    var card = el("section", "card q");
    card.appendChild(el("p", "eyebrow", q.sectionTitle));
    // One tap answers and moves on (unless the tester has already moved).
    var at = step;
    var after = function () { setTimeout(function () { if (mode === "questions" && step === at) move(1, total)(); }, 320); };
    if (q.kind === "shop_rating") {
      card.appendChild(el("h2", "", sc.shop.name));
      card.appendChild(el("p", "help", q.prompt));
      card.appendChild(choiceRow("five", ONE_TO_FIVE, answerOf(q.key, sc.shop.ref), function (v) { setAnswer(q.key, sc.shop.ref, v); nav(true); after(); }));
      var ends = el("div", "ends");
      ends.appendChild(el("span", "", "Poor")); ends.appendChild(el("span", "", "Great"));
      card.appendChild(ends);
      return card;
    }
    card.appendChild(el("h2", "", q.prompt));
    if (q.kind === "choice" || q.kind === "shop_choice") {
      var opts = q.kind === "choice" ? q.options : view.shops.map(function (s) { return { value: s.ref, label: s.name }; });
      var row = choiceRow(q.kind === "shop_choice" && opts.length > 4 ? "chips many" : "stack", opts, answerOf(q.key), function (v) { setAnswer(q.key, "", v); nav(true); after(); });
      row.style.marginTop = "26px";
      card.appendChild(row);
      return card;
    }
    var input = el(q.kind === "minutes" ? "input" : "textarea");
    if (q.kind === "minutes") { input.type = "number"; input.min = "0"; input.max = "600"; input.inputMode = "numeric"; input.placeholder = "Minutes"; }
    else { input.maxLength = 500; input.rows = 5; input.placeholder = "Type here, a few words is fine"; }
    input.setAttribute("aria-label", q.prompt);
    input.value = answerOf(q.key);
    var note = el("p", "note");
    note.setAttribute("role", "status");
    input.addEventListener("input", function () { note.textContent = ""; nav(input.value.trim() !== ""); });
    typed(input, function (v) {
      if (q.kind === "minutes" && v !== "" && !/^\d{1,3}$/.test(v)) { note.textContent = "Please type a number of minutes."; return; }
      setAnswer(q.key, "", v);
    });
    card.appendChild(input);
    card.appendChild(note);
    return card;
  }
  function renderQuestions() {
    var f = view.feedback;
    var s = view.sprint;
    if (!f.open) {
      var past = s.dayIndex !== null && s.lastIndex !== null && s.dayIndex > s.lastIndex;
      if (past) return full("All closed.", "The final questions are closed. Thank you for testing with us.");
      return full("Not open yet.", (f.opensOn ? "The final questions open on " + niceDay(f.opensOn) + ", the last day." : "The final questions open on the last day of the sprint.") + " This same link will show them.", "Go to today's check-in", go("day", { day: s.dayIndex, idx: null }));
    }
    var list = screens();
    if (!list.length) return full("No questions yet.", "Please check back a little later.");
    if (step >= list.length) {
      var d = full("Thank you.", "All your answers are saved, " + view.me.firstName + ". You can still change them this week.");
      quietLinks([
        ["Look at my answers again", function () { step = 0; store.set("qstep", 0); dir = -1; top(); render(); }],
        s.dayIndex !== null && s.dayIndex >= 0 && s.dayIndex <= s.lastIndex ? ["Today's check-in", go("day", { day: s.dayIndex, idx: null })] : null
      ], d);
      return;
    }
    document.body.className = "";
    var label = "Question " + (step + 1) + " of " + list.length;
    greet(label, true);
    var sc = list[step];
    progress(step + 1, list.length, label);
    var nextBtn = null;
    var nav = function (has) {
      if (!nextBtn) return;
      var lastOne = step === list.length - 1;
      nextBtn.textContent = has ? (lastOne ? "Finish" : "Next") : "Skip";
      nextBtn.className = has ? "btn" : "btn ghost";
    };
    var card = questionCard(sc, list.length, nav);
    var row = el("div", step > 0 ? "nav" : "nav one");
    if (step > 0) row.appendChild(button("btn ghost", "Back", move(-1, list.length)));
    nextBtn = button("btn", "Next", move(1, list.length));
    row.appendChild(nextBtn);
    nav(answerOf(sc.q.key, sc.shop ? sc.shop.ref : "") !== "");
    card.appendChild(row);
    stage(card);
  }

  function render() {
    clear();
    if (mode === "questions") renderQuestions();
    else if (mode === "days") renderDays();
    else if (mode === "shops") renderShops();
    else renderDay();
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
      idx = null;
      step = Math.max(0, Number(store.get("qstep")) || 0);
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
        return message("This link no longer works.", "Reply to our last email and we will send you a new link. Nothing you saved is lost.");
      }
      if (view) return;   // the copy kept on this phone is on screen; saves go on waiting
      if (r.status === 429) return message("Too many tries.", "Please wait a few minutes, then try again.", "Try again", start);
      message("We could not open your page.", "This is on our side, not yours. Please try again in a moment.", "Try again", start);
    }, function () {
      if (view) return;
      message("No connection.", "Check your data or Wi-Fi, then try again.", "Try again", start);
    });
  }
  function start() {
    if (!token) return message("Open the link in your email.", "Your personal link is in the email from Relynked titled \"Your Relynked beta check-in link\". Open it on this phone once, and this page will remember you.");
    var kept = store.get("view");
    if (kept && kept.me && kept.sprint && kept.feedback) show(kept, false);
    else message("Opening your page.", "One moment.");
    load();
  }
  start();
})();
