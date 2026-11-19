/* relynked.com/beta/checkin and /beta/feedback: a tester's own page (founder, 19 Nov 2026: "we have to make it
   seamless for them"). One personal link, no sign in, no code to type. The link's token rides after the # (so it is
   never sent in an address), is kept on this phone, and is posted to /api/beta/* (this site's Pages Functions).

   The look follows the tester proposal deck: one task, or one question, a screen, in a frame that never moves (the
   band, the progress row and the actions at the bottom keep their place). Each step is a browser history entry, so
   the phone's Back goes to the previous task; the address never changes (no token, no step in it). A swipe to the
   right is Back too.

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
  var mode = PAGE === "feedback" ? "questions" : "day";   // day | questions | days (earlier days) | shops
  var idx = null;       // the task on screen (null: the first one not answered yet)
  var changing = null;  // the task whose three answers are shown again after "Change"
  var step = 0;         // the question on screen
  var dir = 0;          // 1: forward (the new screen comes from the right), -1: back
  var depth = 0;        // history entries this page has added
  var opened = {};      // tasks whose "What happened?" is showing
  var greeting = false; // the big "Hi" in the band (the first screen of a day only)
  var booted = false;   // the first screen has been drawn
  var backFn = null;    // what Back does on the screen on view
  var dockKind = "";
  var lastBar = null;
  var pending = store.get("pending") || {};
  var sending = false;
  var touched = false;  // something was answered since the page asked the server
  var still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var $ = function (id) { return document.getElementById(id); };
  var slot = document.querySelector(".slot");
  var greetEl = $("greet");
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
  function niceDay(iso) {
    try { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }); } catch (e) { return iso; }
  }
  function top() { try { window.scrollTo(0, 0); } catch (e) { /* old browser */ } }

  /* The band's right side: the day, or for a moment a note ("Welcome back", "Saved"). */
  function when(text) { $("when").textContent = text || ""; }
  function band(big) {
    greeting = !!big;
    greetEl.className = big ? "greet" : "greet shut";
    slot.classList.toggle("big", !!big);
    if (big && view) { $("hi").textContent = "Hi " + view.me.firstName; $("big-when").textContent = $("when").textContent; }
  }

  function call(path, body) {
    body.token = token;
    return fetch("/api/beta/" + path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
  }

  /* ── Saving: one small request per answer, kept on the phone until it is in ─────────────────────────────────── */
  /* One quiet note in the band, never over the cards: a lime dot and "Saved" that fades in and out. */
  var noteTimer = null;
  function tick(key, cls, text) {
    clearTimeout(noteTimer);
    if (cls === "wait" && text === "Saving") return;   // a save on its way says nothing until it is in
    $("saved-text").textContent = text;
    $("saved").className = "saved" + (cls ? " " + cls : "");
    slot.classList.add("noting");
    noteTimer = setTimeout(function () { slot.classList.remove("noting"); }, !cls ? 1400 : cls === "err" ? 5000 : 600000);
  }
  function welcome() {
    $("saved-text").textContent = "Welcome back";
    $("saved").className = "saved";
    slot.classList.add("noting");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { slot.classList.remove("noting"); }, 2000);
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

  /* ── Moving between screens: a history entry per step, never a change of address ──────────────────────────── */
  function snap() { return { rb: 1, m: mode, d: day, i: idx, s: step, c: changing, n: depth }; }
  function forward(change) {
    return function () {
      settle();
      change();
      depth++;
      try { history.pushState(snap(), "", location.pathname); } catch (e) { /* old browser: Back leaves the page */ }
      dir = 1;
      top();
      render();
    };
  }
  /* Back: the browser's own history when this page added the step, else straight to the screen before. */
  function backTo(change) {
    return function () {
      settle();
      if (depth > 0) { try { history.back(); return; } catch (e) { /* fall through */ } }
      change();
      try { history.replaceState(snap(), "", location.pathname); } catch (e) { /* old browser */ }
      dir = -1;
      top();
      render();
    };
  }
  // Each step opens at its top; the browser must not put back an old scroll position.
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* old browser */ }
  window.addEventListener("popstate", function (e) {
    var st = e.state;
    if (!st || !st.rb || !view) return;
    settle();
    dir = st.n < depth ? -1 : 1;
    mode = st.m; day = st.d; idx = st.i; step = st.s; changing = st.c; depth = st.n;
    if (mode === "questions") store.set("qstep", step);
    top();
    render();
  });
  /* A swipe to the right is Back (touch only; a mostly sideways, quick swipe, so scrolling is never taken over). */
  var sx = null, sy = 0, st0 = 0;
  app.addEventListener("touchstart", function (e) {
    var t = e.touches[0];
    sx = e.touches.length === 1 && !(e.target.closest && e.target.closest("textarea,input")) ? t.clientX : null;
    sy = t.clientY; st0 = Date.now();
  }, { passive: true });
  app.addEventListener("touchend", function (e) {
    if (sx === null || !backFn) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    sx = null;
    if (dx > 72 && dy < 48 && dx > dy * 2.5 && Date.now() - st0 < 700) backFn();
  }, { passive: true });

  /* ── The frame ─────────────────────────────────────────────────────────────────────────────────────────────── */
  function clear() {
    var old = app.querySelector(".stage > .card:not(.leave-f):not(.leave-b)");
    while (app.firstChild) app.removeChild(app.firstChild);
    var d = document.querySelector("body > .dock:not(.out)");
    if (d) d.classList.add("old");
    backFn = null;
    return old;
  }
  /* The progress row: always the same height, at the same place. */
  function meta(label, n, of, onBack) {
    var box = el("div", "meta");
    var row = el("div", "top");
    var b = button("back" + (onBack ? "" : " hide"), "", onBack);
    b.setAttribute("aria-label", "Back");
    if (!onBack) { b.tabIndex = -1; b.setAttribute("aria-hidden", "true"); }
    backFn = onBack || null;
    row.appendChild(b);
    row.appendChild(el("p", "count", label));
    box.appendChild(row);
    var bar = el("div", of ? "bar" : "bar none");
    var fill = el("i");
    var pct = of ? Math.round((n / of) * 100) : 0;
    bar.appendChild(fill);
    if (of) {
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", label);
      bar.setAttribute("aria-valuemin", "1"); bar.setAttribute("aria-valuemax", String(of)); bar.setAttribute("aria-valuenow", String(n));
      // The bar grows from where it was.
      if (lastBar !== null && !still) { fill.style.width = lastBar + "%"; requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = pct + "%"; }); }); }
      else fill.style.width = pct + "%";
      lastBar = pct;
    }
    box.appendChild(bar);
    app.appendChild(box);
  }
  /* The card: slides in from the side the tester is going while the old one slides out; the very first rises. */
  function stage(card, old) {
    var s = el("div", "stage");
    s.appendChild(card);
    app.appendChild(s);
    if (!still) {
      if (!booted) card.classList.add("rise");
      else if (dir && old) {
        old.className = old.className.replace(/ ?(enter|leave)-[fb]| ?rise/g, "") + (dir > 0 ? " leave-f" : " leave-b");
        s.insertBefore(old, card);   // underneath the new card
        setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 320);
        card.classList.add(dir > 0 ? "enter-f" : "enter-b");
      }
    }
    booted = true;
    dir = 0;
  }
  /* The actions at the bottom: fixed, the same place on every screen of a kind. */
  /* The old actions: gone at once when the new ones are the same, else they sink away while the new ones rise. */
  function dropDock(keep) {
    var olds = document.querySelectorAll("body > .dock.old");
    for (var i = 0; i < olds.length; i++) {
      var o = olds[i];
      o.classList.remove("old");
      if (keep && !still) { o.classList.add("out"); setTimeout((function (x) { return function () { if (x.parentNode) x.parentNode.removeChild(x); }; })(o), 320); }
      else o.parentNode.removeChild(o);
    }
  }
  function dock(kind, nodes) {
    dropDock(kind !== dockKind);
    var d = el("div", "dock" + (kind !== dockKind && booted && !still ? " in" : ""));
    var w = el("div", "wrap");
    nodes.forEach(function (n) { w.appendChild(n); });
    d.appendChild(w);
    document.body.appendChild(d);
    app.className = "wrap flow " + (kind === "three" ? "dock3" : "dock1");
    dockKind = kind;
  }
  function noDock() { dropDock(false); app.className = "wrap flow"; dockKind = ""; }
  function heading(card) {
    var h = card.querySelector("h2");
    if (h && booted) { h.tabIndex = -1; try { h.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
  }

  /* A whole forest screen: one huge line, one plain sentence, a button when there is something to do. */
  function full(title, line, label, on) {
    document.body.className = "dark";
    band(false);
    noDock();
    var c = el("section", "full" + (still ? "" : " rise"));
    c.appendChild(el("h1", "", title));
    if (line) c.appendChild(el("p", "line", line));
    if (label) c.appendChild(button("btn", label, on));
    app.appendChild(c);
    booted = true;
    return c;
  }
  function message(title, line, label, on) {
    clear();
    when("");
    full(title, line, label, on);
  }
  function quietLinks(list, into) {
    var q = el("div", "quiet");
    list.forEach(function (x) { if (x) q.appendChild(button("link", x[0], x[1])); });
    if (q.firstChild) into.appendChild(q);
  }
  function earlier() { return view.days.filter(function (d) { return d.index < view.sprint.dayIndex; }); }
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
  function toToday() { mode = "day"; day = view.sprint.dayIndex; idx = null; changing = null; }

  /* ── The day: one task a screen ─────────────────────────────────────────────────────────────────────────────── */
  function todays() { return view.tasks.filter(function (t) { return t.day === day; }); }
  function answered(t) { var r = resultOf(t.key); return !!(r && r.status); }
  function firstOpen(tasks) {
    for (var i = 0; i < tasks.length; i++) if (!answered(tasks[i])) return i;
    return tasks.length;
  }

  function renderDay(old) {
    var s = view.sprint;
    when(s.dayIndex >= 0 && s.dayIndex <= s.lastIndex ? whenToday() : "");
    if (s.dayIndex === null || s.dayIndex === undefined) return full("Not started yet.", "We will email you the start day. Keep this link, it is the only one you need.");
    if (s.dayIndex < 0) return full("Not open yet.", "The sprint starts on " + niceDay(s.starts) + ". Come back to this link that day.");
    if (day !== s.dayIndex) return renderClosedDay(old);
    var tasks = todays();
    if (!tasks.length) {
      if (s.dayIndex > s.lastIndex) return full("The sprint is over.", "Thank you for testing with us.");
      var c = full("Nothing for you today.", view.me.role === "customer" && day === 0 ? "Today the business testers set up their shops. Your tasks start tomorrow." : "Check back tomorrow.");
      return quietLinks([earlier().length ? ["Earlier days", forward(function () { mode = "days"; })] : null, view.feedback.open ? ["Final questions", forward(function () { mode = "questions"; })] : null], c);
    }
    if (idx === null) idx = firstOpen(tasks);
    if (idx >= tasks.length && firstOpen(tasks) < tasks.length) idx = firstOpen(tasks);
    if (idx >= tasks.length) return renderDone();
    document.body.className = "";
    band(greeting && idx === greetAt);
    var t = tasks[idx];
    meta((idx + 1) + " of " + tasks.length, idx + 1, tasks.length, idx > 0 ? backTo(function () { changing = null; idx--; }) : null);
    var card = taskCard(t);
    stage(card, old);
    heading(card);
  }

  function nextTask() { forward(function () { changing = null; idx++; if (greeting) band(false); })(); }

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
      var buttons = [];
      [["done", "Done", " done"], ["failed", "Didn't work", " bad"], ["stuck", "Got stuck", " stuck"]].forEach(function (o) {
        var b = button("ans" + o[2], o[1], function () {
          r.status = o[0];
          if (o[0] === "done") { r.note = null; r.screenshot = null; r.shops = []; }
          buttons.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          push();
          if (o[0] === "done") return setTimeout(nextTask, still ? 0 : 120);
          changing = null;
          greeting = false;   // the follow-up needs the room: the greeting folds away
          render(true);
        });
        b.setAttribute("aria-pressed", String(r.status === o[0]));
        buttons.push(b);
      });
      dock("three", buttons);
      var links = [
        earlier().length ? ["Earlier days", forward(function () { mode = "days"; })] : null,
        view.shops.length ? [view.me.role === "business" ? "Your business" : "Your shops", forward(function () { mode = "shops"; })] : null,
        view.feedback.open ? ["Final questions", forward(function () { mode = "questions"; })] : null
      ];
      quietLinks(links, card);
      return card;
    }

    /* "Didn't work" or "Got stuck": a few calm questions on the same card, opening in place. */
    var grow = el("div", "reveal");
    var inner = el("div");
    grow.appendChild(inner);
    var picked = el("div", "picked");
    picked.appendChild(el("span", "tag" + (r.status === "stuck" ? " stuck" : ""), STATUS[r.status]));
    picked.appendChild(button("link", "Change", function () { settle(); changing = t.key; render(); }));
    inner.appendChild(picked);
    var askShop = t.perShop && view.shops.length > 1;
    var rest = el("div", "reveal");
    var restIn = el("div");
    rest.appendChild(restIn);
    if (askShop) {
      inner.appendChild(el("p", "ask", view.me.role === "business" ? "Which business?" : "Which shop?"));
      var chips = el("div", view.shops.length > 4 ? "chips many" : "chips");
      view.shops.forEach(function (s) {
        var c = button("opt", s.name, function () {
          var at = r.shops.indexOf(s.ref);
          if (at >= 0) r.shops.splice(at, 1); else r.shops.push(s.ref);
          c.setAttribute("aria-pressed", String(at < 0));
          push();
          // The next question opens in place; the keyboard stays down until they tap the box.
          if (!opened[t.key]) { opened[t.key] = true; rest.classList.add("open"); }
        });
        c.setAttribute("aria-pressed", String(r.shops.indexOf(s.ref) >= 0));
        chips.appendChild(c);
      });
      inner.appendChild(chips);
    }
    var id = "n-" + t.key;
    var lab = el("label", "ask", "What happened?");
    lab.htmlFor = id;
    var box = el("textarea");
    box.id = id; box.maxLength = 500; box.rows = 3; box.value = r.note || "";
    box.placeholder = "What you did, what you expected, what you saw";
    typed(box, function (v) { r.note = v || null; push(); });
    restIn.appendChild(lab); restIn.appendChild(box);
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
    restIn.appendChild(lab2); restIn.appendChild(shot); restIn.appendChild(note);
    inner.appendChild(rest);
    card.appendChild(grow);
    if (!askShop || r.shops.length || r.note || r.screenshot) opened[t.key] = true;
    var wasOpen = !!opened[t.key];
    // Opening in place: the rows grow from nothing (grid rows), nothing is measured.
    if (still || !justAnswered) { grow.classList.add("open"); if (wasOpen) rest.classList.add("open"); }
    else requestAnimationFrame(function () { requestAnimationFrame(function () { grow.classList.add("open"); if (wasOpen) rest.classList.add("open"); }); });
    dock("next", [button("btn", "Next", function () {
      settle();
      if (!good) { shot.focus(); return; }
      nextTask();
    })]);
    return card;
  }
  var justAnswered = false;
  var greetAt = -1;

  function renderDone() {
    var s = view.sprint;
    var last = view.feedback.open && day === s.dayIndex;
    greeting = false;
    var c = full("", last ? "One last thing: a few quick questions about how it felt." : "See you tomorrow.", last ? "Answer the final questions" : null, forward(function () { mode = "questions"; }));
    var h = c.querySelector("h1");
    h.appendChild(document.createTextNode("All done "));
    h.appendChild(el("em", "", "for today."));
    var tpl = $("tick");
    if (tpl && tpl.content) c.insertBefore(tpl.content.firstElementChild.cloneNode(true), h);
    when(whenToday());
    quietLinks([
      ["Change an answer", forward(function () { idx = 0; changing = null; })],
      earlier().length ? ["Earlier days", forward(function () { mode = "days"; })] : null
    ], c);
  }

  /* An earlier day: read only, all on one calm list. */
  function listScreen(label, old, fill) {
    document.body.className = "";
    band(false);
    meta(label, 0, 0, backTo(toToday));
    var card = el("section", "card bare");
    card.style.background = "transparent";
    card.style.padding = "0";
    fill(card);
    stage(card, old);
    dock("today", [button("btn forest", "Back to today", backTo(toToday))]);
  }
  function renderClosedDay(old) {
    when(dayLabel(day) + ", closed");
    listScreen("Read only", old, function (card) {
      var list = el("div", "list");
      todays().forEach(function (t) {
        var r = resultOf(t.key);
        var row = el("div", "row");
        row.appendChild(el("b", "", t.title));
        row.appendChild(el("span", r && r.status ? "" : "none", r && r.status ? STATUS[r.status] || r.status : "Not answered"));
        list.appendChild(row);
      });
      if (!list.firstChild) list.appendChild(el("div", "row", "Nothing for you that day."));
      card.appendChild(list);
    });
  }
  function renderDays(old) {
    when("Earlier days");
    listScreen("Days closed", old, function (card) {
      var list = el("div", "list");
      earlier().forEach(function (d) { list.appendChild(button("opt", d.label, forward(function () { mode = "day"; day = d.index; }))); });
      card.appendChild(list);
    });
  }
  function renderShops(old) {
    when(view.me.role === "business" ? "Your business" : "Your shops");
    listScreen(view.shops.length + (view.shops.length === 1 ? " shop" : " shops"), old, function (card) {
      var list = el("div", "list");
      view.shops.forEach(function (s) {
        var row = el("div", "row shop");
        row.appendChild(el("b", "", s.name));
        if (s.code) { var sp = el("span", "", "Code "); sp.appendChild(el("code", "", s.code)); row.appendChild(sp); }
        list.appendChild(row);
      });
      card.appendChild(list);
    });
  }

  /* ── The final questions: one question a screen; every shop rating on one screen ───────────────────────────── */
  function screens() {
    return view.feedback.questions.filter(function (q) { return !((q.kind === "shop_rating" || q.kind === "shop_choice") && !view.shops.length); });
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
  var ONE_TO_FIVE = ["1", "2", "3", "4", "5"];
  function questionCard(q, total, nav, move) {
    var card = el("section", "card q");
    card.appendChild(el("p", "eyebrow", q.sectionTitle));
    card.appendChild(el("h2", "", q.prompt));
    // One tap answers; the chosen answer fills, then the next question comes (unless they already moved).
    var at = step;
    var after = function () { setTimeout(function () { if (mode === "questions" && step === at) move(); }, still ? 0 : 250); };
    if (q.kind === "shop_rating") {
      card.className += " rating";
      var rows = el("div", "rates");
      view.shops.forEach(function (s) {
        var row = el("div", "rrow");
        row.appendChild(el("b", "", s.name));
        var five = el("div", "five");
        five.setAttribute("role", "group");
        five.setAttribute("aria-label", s.name);
        var cur = answerOf(q.key, s.ref);
        var all = [];
        ONE_TO_FIVE.forEach(function (n) {
          var b = button("rate", n, function () {
            all.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            setAnswer(q.key, s.ref, n);
            nav(true);
          });
          b.setAttribute("aria-pressed", String(cur === n));
          all.push(b);
          five.appendChild(b);
        });
        row.appendChild(five);
        rows.appendChild(row);
      });
      card.appendChild(rows);   // the question itself says what 1 and 5 mean
      return card;
    }
    if (q.kind === "choice" || q.kind === "shop_choice") {
      var opts = q.kind === "choice" ? q.options : view.shops.map(function (s) { return { value: s.ref, label: s.name }; });
      card.appendChild(choiceRow(q.kind === "shop_choice" && opts.length > 4 ? "chips many" : "stack", opts, answerOf(q.key), function (v) { setAnswer(q.key, "", v); nav(true); after(); }));
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
  function anyAnswer(q) {
    if (q.kind !== "shop_rating") return answerOf(q.key) !== "";
    return view.shops.some(function (s) { return answerOf(q.key, s.ref) !== ""; });
  }
  function renderQuestions(old) {
    var f = view.feedback;
    var s = view.sprint;
    if (!f.open) {
      when("");
      var past = s.dayIndex !== null && s.lastIndex !== null && s.dayIndex > s.lastIndex;
      if (past) return full("All closed.", "The final questions are closed. Thank you for testing with us.");
      return full("Not open yet.", (f.opensOn ? "The final questions open on " + niceDay(f.opensOn) + ", the last day." : "The final questions open on the last day of the sprint.") + " This same link will show them.", "Go to today's check-in", forward(toToday));
    }
    when("Final questions");
    var list = screens();
    if (!list.length) return full("No questions yet.", "Please check back a little later.");
    if (step >= list.length) {
      var d = full("Thank you.", "All your answers are saved, " + view.me.firstName + ". You can still change them this week.");
      quietLinks([
        ["Look at my answers again", forward(function () { step = 0; store.set("qstep", 0); })],
        s.dayIndex !== null && s.dayIndex >= 0 && s.dayIndex <= s.lastIndex ? ["Today's check-in", forward(toToday)] : null
      ], d);
      return;
    }
    document.body.className = "";
    band(false);
    var q = list[step];
    var go = forward(function () { step = Math.min(list.length, step + 1); store.set("qstep", step); });
    meta("Question " + (step + 1) + " of " + list.length, step + 1, list.length, step > 0 ? backTo(function () { step--; store.set("qstep", step); }) : null);
    var nextBtn = button("btn", "Next", go);
    var nav = function (has) {
      nextBtn.textContent = has ? (step === list.length - 1 ? "Finish" : "Next") : "Skip";
      nextBtn.className = has ? "btn" : "btn ghost";
    };
    var card = questionCard(q, list.length, nav, go);
    nav(anyAnswer(q));
    stage(card, old);
    dock("next", [nextBtn]);
    heading(card);
  }

  function render(fromAnswer) {
    var old = clear();
    justAnswered = !!fromAnswer;
    if (mode === "questions") renderQuestions(old);
    else if (mode === "days") renderDays(old);
    else if (mode === "shops") renderShops(old);
    else renderDay(old);
    justAnswered = false;
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
      depth = 0;
      step = Math.max(0, Number(store.get("qstep")) || 0);
      // After the last day the link goes straight to the final questions.
      if (v.feedback.open && s.dayIndex > s.lastIndex) mode = "questions";
      // The first screen of a day says hello; coming back to a day already started says "Welcome back" for a moment.
      var tasks = v.tasks.filter(function (t) { return t.day === day; });
      var done = tasks.filter(function (t) { var r = resultOf(t.key); return r && r.status; }).length;
      if (mode === "day" && s.dayIndex >= 0 && s.dayIndex <= s.lastIndex && tasks.length) {
        when(whenToday());
        greetAt = done === 0 ? 0 : -1;
        if (done === 0) band(true);
        else if (done < tasks.length) welcome();
      }
      render();
      try { history.replaceState(snap(), "", location.pathname); } catch (e) { /* old browser */ }
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
    // Nothing kept yet: the band and a soft pulse on the card stay until the server answers (well under a second).
    load();
  }
  start();
})();
