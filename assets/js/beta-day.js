/* relynked.com/beta/checkin and /beta/feedback: a tester's own page (founder, 19 Nov 2026: "we have to make it
   seamless for them"). One personal link, no sign in, no code to type. The link's token rides after the # (so it is
   never sent in an address), is kept on this phone, and is posted to /api/beta/* (this site's Pages Functions).

   The check-in is a chat with Remy, drawn in the Relynked app's own look (the Ask Remy screen): Remy asks one task
   at a time as a card, an answer folds into the app's receipt (tick, one line, Undo), a note is typed in the forest
   pill, and the final questions come the same way. Each step is a browser history entry, so the phone's Back goes to
   the step before; the address never changes (no token, no step in it). A swipe to the right is Back too.

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
  var idx = null;       // the task Remy is asking about (null: the first one not answered yet)
  var changing = null;  // a task reopened (Undo): its three answers are shown again
  var step = 0;         // the question Remy is asking
  var qmax = 0;         // the furthest question reached, where an edited answer returns to
  var depth = 0;        // history entries this page has added
  var opened = {};      // tasks whose "What happened?" is asked
  var linking = {};     // tasks where the pill takes a screenshot link
  var seen = {};        // thread items already on screen (only new ones arrive with motion)
  var booted = false;
  var backFn = null;
  var greetLine = "";
  var pending = store.get("pending") || {};
  var sending = false;
  var touched = false;  // something was answered since the page asked the server
  var still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var $ = function (id) { return document.getElementById(id); };
  var sub = $("sub"), comp = $("comp"), backBtn = $("back"), moreBtn = $("more");
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
  function clone(id) { return $(id).content.firstElementChild.cloneNode(true); }
  function niceDay(iso) {
    try { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }); } catch (e) { return iso; }
  }

  /* ── The head: the title, and under it one quiet status line (the day's count, or for a moment "Saved") ────── */
  var subText = "", subTimer = null;
  function status(text) { subText = text || ""; if (!subTimer) paintSub("", subText); }
  function paintSub(kind, text) {
    while (sub.firstChild) sub.removeChild(sub.firstChild);
    if (kind === "ok") sub.appendChild(el("i", "dot"));
    sub.appendChild(document.createTextNode(text));
  }
  function flash(kind, text, ms) {
    clearTimeout(subTimer);
    paintSub(kind, text);
    subTimer = setTimeout(function () { subTimer = null; paintSub("", subText); }, ms);
  }
  function progress(n, of) { $("prog").firstChild.style.width = of ? Math.round((n / of) * 100) + "%" : "0"; }

  function call(path, body) {
    body.token = token;
    return fetch("/api/beta/" + path, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
  }

  /* ── Saving: one small request per answer, kept on the phone until it is in ─────────────────────────────────── */
  /* One quiet word under the title, where the app shows a chat's status: "Saved", never a box over the thread. */
  function tick(key, cls, text) {
    if (cls === "wait" && text === "Saving") return;   // a save on its way says nothing until it is in
    flash(cls ? "" : "ok", text, !cls ? 1400 : cls === "err" ? 5000 : 600000);
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


  /* ── Moving between steps: a history entry per step, never a change of address ────────────────────────────── */
  function snap() { return { rb: 1, m: mode, d: day, i: idx, s: step, c: changing, n: depth }; }
  function forward(change) {
    return function () {
      settle();
      closeMenu();
      change();
      depth++;
      try { history.pushState(snap(), "", location.pathname); } catch (e) { /* old browser: Back leaves the page */ }
      render();
    };
  }
  /* Back: the browser's own history when this page added the step, else straight to the step before. */
  function backTo(change) {
    return function () {
      settle();
      closeMenu();
      if (depth > 0) { try { history.back(); return; } catch (e) { /* fall through */ } }
      change();
      try { history.replaceState(snap(), "", location.pathname); } catch (e) { /* old browser */ }
      render();
    };
  }
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) { /* old browser */ }
  window.addEventListener("popstate", function (e) {
    var st = e.state;
    if (!st || !st.rb || !view) return;
    settle();
    closeMenu();
    mode = st.m; day = st.d; idx = st.i; step = st.s; changing = st.c; depth = st.n;
    if (mode === "questions") store.set("qstep", step);
    render();
  });
  backBtn.addEventListener("click", function () { if (backFn) backFn(); });
  /* A swipe to the right is Back (touch only; a quick, mostly sideways swipe, so scrolling is never taken over). */
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

  /* ── The More menu (the head's three dots) ─────────────────────────────────────────────────────────────────── */
  var menu = null;
  function closeMenu() { if (menu) { menu.parentNode.removeChild(menu); menu = null; moreBtn.setAttribute("aria-expanded", "false"); } }
  moreBtn.addEventListener("click", function () {
    if (menu) return closeMenu();
    if (!view) return;
    var s = view.sprint;
    menu = el("div", "menu");
    menu.setAttribute("role", "menu");
    var items = [
      earlier().length ? ["Earlier days", forward(function () { mode = "days"; })] : null,
      view.shops.length ? [view.me.role === "business" ? "Your business" : "Your shops", forward(function () { mode = "shops"; })] : null,
      view.feedback.open && mode !== "questions" ? ["Final questions", forward(function () { mode = "questions"; })] : null,
      mode !== "day" && s.dayIndex !== null && s.dayIndex >= 0 && s.dayIndex <= s.lastIndex ? ["Today's check-in", forward(toToday)] : null
    ];
    items.forEach(function (x) { if (x) { var b = button("", x[0], x[1]); b.setAttribute("role", "menuitem"); menu.appendChild(b); } });
    var a = el("a", "", "Privacy");
    a.href = "/privacy";
    a.setAttribute("role", "menuitem");
    menu.appendChild(a);
    document.querySelector(".thd").appendChild(menu);
    moreBtn.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("click", function (e) { if (menu && !menu.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) closeMenu(); });

  /* ── The thread's pieces, each the app's own ───────────────────────────────────────────────────────────────── */
  var items = [];
  function put(key, node) { node.setAttribute("data-k", key); items.push(node); return node; }
  /* Remy speaks: the orb, "Remy", a bubble a line; `more` (chips, a card) sits under the bubbles. */
  function remy(key, lines, more) {
    var row = el("div", "arow");
    var ra = el("span", "ra");
    ra.appendChild(clone("orbtpl"));
    row.appendChild(ra);
    var col = el("span", "col");
    col.appendChild(el("div", "rlab", "Remy"));
    lines.forEach(function (l) { if (l) col.appendChild(el("div", "rbub", l)); });
    (more || []).forEach(function (n) { if (n) col.appendChild(n); });
    row.appendChild(col);
    return put(key, row);
  }
  /* The tester's own words, on the right. Tapping one changes it, when it can be changed. */
  function mine(key, text, on, quiet) {
    var w = el("div", "askmsg out");
    w.appendChild(on ? button("b out" + (quiet ? " skip" : ""), text, on) : el("div", "b out" + (quiet ? " skip" : ""), text));
    return put(key, w);
  }
  function divider(key, text) { return put(key, el("div", "daypill", text)); }
  function chips(list) {
    var q = el("div", "qrow");
    list.forEach(function (c) {
      if (!c) return;
      var b = button("qr" + (c.quiet ? " quiet" : ""), c.label, c.on);
      if (c.pressed !== undefined) b.setAttribute("aria-pressed", String(!!c.pressed));
      q.appendChild(b);
    });
    return q;
  }
  function receipt(text, small, onUndo, soft) {
    var c = el("div", "cv-card cv-receipt");
    c.setAttribute("role", "status");
    var row = el("div", "cv-rrow");
    var t = clone("tick");
    if (soft) t.className += " soft";
    row.appendChild(t);
    var tx = el("span", "cv-rtx", text);
    if (small) tx.appendChild(el("small", "", small));
    row.appendChild(tx);
    if (onUndo) row.appendChild(button("cv-undo", "Undo", onUndo));
    c.appendChild(row);
    return c;
  }
  /* The quiet state of an empty Ask Remy: the orb in its halo, one line, one sentence. */
  function state(title, line, label, on) {
    items = [];
    var c = el("section", "state");
    var h = el("span", "halo");
    h.appendChild(clone("orbtpl"));
    c.appendChild(h);
    c.appendChild(el("h1", "", title));
    if (line) c.appendChild(el("p", "", line));
    if (label) c.appendChild(button("cv-primary", label, on));
    put("state:" + title, c);
    return c;
  }
  function message(title, line, label, on) {
    backFn = null;
    backBtn.setAttribute("aria-disabled", "true");
    status("");
    progress(0, 0);
    composer(null);
    items = [];
    state(title, line, label, on);
    paint();
  }

  /* The pill: only when there is something to type. Its box is new for each question, so its autosave is its own. */
  var compKey = null;
  function composer(cfg) {
    if (!cfg) { comp.hidden = true; compKey = null; return; }
    comp.hidden = false;
    if (typeof cfg === "string") cfg = { key: "hint:" + cfg, hint: cfg };
    if (compKey === cfg.key) return;
    compKey = cfg.key;
    var fld = comp.querySelector(".fld");
    while (fld.firstChild) fld.removeChild(fld.firstChild);
    var send = $("send");
    // Nothing to type here: the app's pill stays, saying where the answer goes; a tap brings the question into view.
    if (cfg.hint) {
      var h = button("hint", cfg.hint, function () { try { app.scrollTo({ top: app.scrollHeight, behavior: still ? "auto" : "smooth" }); } catch (e) { app.scrollTop = app.scrollHeight; } });
      fld.appendChild(h);
      send.hidden = true;
      $("note").textContent = "";
      return;
    }
    send.hidden = false;
    var box = el(cfg.numeric ? "input" : "textarea");
    if (cfg.numeric) { box.type = "text"; box.inputMode = "numeric"; box.maxLength = 3; }
    else { box.rows = 1; box.maxLength = cfg.max || 500; }
    if (cfg.url) { box.inputMode = "url"; box.maxLength = 300; }
    box.id = "box";
    box.placeholder = cfg.placeholder;
    box.setAttribute("aria-label", cfg.placeholder);
    box.value = cfg.value || "";
    fld.appendChild(box);
    $("note").textContent = "";
    var grow = function () { if (box.tagName === "TEXTAREA") { box.style.height = "auto"; box.style.height = Math.min(120, box.scrollHeight) + "px"; } };
    var lit = function () { send.className = box.value.trim() ? "send on" : "send"; };
    box.addEventListener("input", function () { $("note").textContent = ""; grow(); lit(); });
    if (cfg.save) typed(box, cfg.save);
    box.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } });
    function go() { var v = box.value.trim(); if (!v && !cfg.empty) return; cfg.send(v, box); }
    send.onclick = go;
    lit();
    requestAnimationFrame(grow);
  }

  /* Draws the thread: what is new arrives with the app's message motion, then the thread follows to its end. */
  function paint() {
    while (app.firstChild) app.removeChild(app.firstChild);
    var fresh = 0;
    items.forEach(function (n) {
      var k = n.getAttribute("data-k");
      if (booted && !seen[k] && !still) { n.className += " new"; n.style.animationDelay = (fresh++ * 90) + "ms"; }
      seen[k] = 1;
      app.appendChild(n);
    });
    var smooth = booted && fresh && !still;
    requestAnimationFrame(function () { try { app.scrollTo({ top: app.scrollHeight, behavior: smooth ? "smooth" : "auto" }); } catch (e) { app.scrollTop = app.scrollHeight; } });
    booted = true;
  }

  function earlier() { return view.days.filter(function (d) { return d.index < view.sprint.dayIndex; }); }
  function dayLabel(d) {
    for (var i = 0; i < view.days.length; i++) if (view.days[i].index === d) return view.days[i].label;
    return "Day " + d;
  }
  var STATUS = { done: "done", failed: "didn't work", stuck: "got stuck" };
  var SAID = { done: "Done", failed: "Didn't work", stuck: "Got stuck" };
  function toToday() { mode = "day"; day = view.sprint.dayIndex; idx = null; changing = null; }
  function shopNames(refs) {
    return view.shops.filter(function (s) { return (refs || []).indexOf(s.ref) >= 0; }).map(function (s) { return s.name; }).join(", ");
  }
  function things(n) { return n === 1 ? "1 quick thing." : n + " quick things."; }

  /* ── The day: Remy asks one task at a time; an answered task folds into a receipt ──────────────────────────── */
  function todays() { return view.tasks.filter(function (t) { return t.day === day; }); }
  function answered(t) { var r = resultOf(t.key); return !!(r && r.status); }
  function firstOpen(tasks) {
    for (var i = 0; i < tasks.length; i++) if (!answered(tasks[i])) return i;
    return tasks.length;
  }

  function renderDay() {
    var s = view.sprint;
    $("title").textContent = (s.dayIndex >= 0 ? dayLabel(day) : "Day") + " check-in";
    if (s.dayIndex === null || s.dayIndex === undefined) return message("Not started yet.", "We will email you the start day. Keep this link, it is the only one you need.");
    if (s.dayIndex < 0) return message("Not open yet.", "The sprint starts on " + niceDay(s.starts) + ". Come back to this link that day.");
    if (day !== s.dayIndex) return renderClosedDay();
    var tasks = todays();
    if (!tasks.length) {
      if (s.dayIndex > s.lastIndex) return message("The sprint is over.", "Thank you for testing with us.");
      return message("Nothing for you today.", view.me.role === "customer" && day === 0 ? "Today the business testers set up their shops. Your tasks start tomorrow." : "Check back tomorrow.");
    }
    if (idx === null) idx = firstOpen(tasks);
    if (idx >= tasks.length && firstOpen(tasks) < tasks.length) idx = firstOpen(tasks);
    var done = tasks.filter(answered).length;
    status(done + " of " + tasks.length + " done");
    progress(0, 0);   // the line under the head is for the final questions only
    backFn = idx > 0 ? backTo(function () { idx--; changing = tasks[idx].key; }) : null;
    backBtn.setAttribute("aria-disabled", String(!backFn));
    items = [];
    var dayWord = day === 0 ? "Setup day" : dayLabel(day);
    remy("hi", ["Hi " + view.me.firstName + ". " + dayWord + ". " + things(tasks.length)]);
    if (idx >= tasks.length) return renderDone(tasks);
    // What is behind: one receipt each (their note first, as their own words).
    tasks.forEach(function (t, i) {
      if (i === idx || !answered(t)) return;
      var r = resultOf(t.key);
      if (r.status !== "done" && r.note) mine("n:" + t.key + ":" + r.note, r.note);
      var row = el("div", "arow cont");
      row.appendChild(el("span", "ra"));
      var col = el("span", "col");
      col.appendChild(receipt(t.title + ": " + STATUS[r.status], r.status !== "done" ? shopNames(r.shops) : null, forward(function () { idx = i; changing = t.key; }), r.status !== "done"));
      row.appendChild(col);
      put("r:" + t.key + ":" + r.status + ":" + (r.shops || []).join(), row);
    });
    askTask(tasks[idx], idx, tasks.length);
    paint();
  }

  function nextTask() {
    forward(function () {
      changing = null;
      var tasks = todays();
      var n = firstOpen(tasks);
      idx = n;
    })();
  }

  function askTask(t, i, total) {
    var r = resultOf(t.key) || { task: t.key, status: null, note: null, screenshot: null, shops: [] };
    r = { task: r.task, status: r.status, note: r.note, screenshot: r.screenshot, shops: (r.shops || []).slice() };
    function push() {
      remember(t.key, r);
      save("c:" + t.key, "checkin", { task: t.key, status: r.status, note: r.note || "", screenshot: r.screenshot || "", shops: r.shops });
    }
    var more = (r.status === "failed" || r.status === "stuck") && changing !== t.key;
    if (!more) {
      composer("Tap an answer above");
      var card = el("div", "cv-card");
      card.setAttribute("role", "group");
      var head = el("div", "cv-head");
      head.appendChild(el("span", "cv-label", "Task " + (i + 1) + " of " + total));
      card.appendChild(head);
      card.appendChild(el("div", "cv-title", t.title));
      if (t.help) card.appendChild(el("div", "cv-sub", t.help));
      var acts = el("div", "cv-actions three");
      [["done", "Done", " done"], ["failed", "Didn't work", " bad"], ["stuck", "Got stuck", " stuck"]].forEach(function (o) {
        var b = button(o[0] === "done" ? "cv-primary" : "cv-second", o[1], function () {
          r.status = o[0];
          if (o[0] === "done") { r.note = null; r.screenshot = null; r.shops = []; }
          push();
          if (o[0] === "done") return nextTask();
          changing = null;
          render();
        });
        if (r.status === o[0]) b.setAttribute("aria-pressed", "true");
        acts.appendChild(b);
      });
      card.appendChild(acts);
      remy("t:" + t.key + (changing === t.key ? ":again" : ""), [], [card]);
      return;
    }
    /* "Didn't work" or "Got stuck": their answer, then Remy asks which shop, then what happened. */
    var card2 = el("div", "cv-card");
    var h2 = el("div", "cv-head");
    h2.appendChild(el("span", "cv-label", "Task " + (i + 1) + " of " + total));
    card2.appendChild(h2);
    card2.appendChild(el("div", "cv-title", t.title));
    remy("t:" + t.key + ":asked", [], [card2]);
    mine("s:" + t.key + ":" + r.status, SAID[r.status], function () { settle(); changing = t.key; render(); });
    var askShop = t.perShop && view.shops.length > 1;
    if (askShop) {
      remy("w:" + t.key, [view.me.role === "business" ? "Which business?" : "Which shop?"], [chips(view.shops.map(function (s) {
        return { label: s.name, pressed: r.shops.indexOf(s.ref) >= 0, on: function () {
          var at = r.shops.indexOf(s.ref);
          if (at >= 0) r.shops.splice(at, 1); else r.shops.push(s.ref);
          push();
          opened[t.key] = true;
          render();
        } };
      }))]);
    }
    if (!askShop || r.shops.length || r.note || r.screenshot) opened[t.key] = true;
    if (!opened[t.key]) { composer("Pick the shop above"); return; }
    var linkOn = !!linking[t.key];
    remy("h:" + t.key, ["What happened? A few words below is fine."], [chips([
      !r.screenshot && !linkOn ? { label: "Add a screenshot link", quiet: true, on: function () { linking[t.key] = true; render(); var b = $("box"); if (b) b.focus(); } } : null,
      { label: r.note ? "Next task" : "Skip the note", quiet: !r.note, on: function () { settle(); nextTask(); } }
    ])]);
    if (r.screenshot) mine("l:" + t.key + ":" + r.screenshot, "Screenshot: " + r.screenshot, function () { linking[t.key] = true; render(); });
    if (linkOn) {
      composer({ key: "link:" + t.key, url: true, placeholder: "Paste the screenshot link", value: r.screenshot || "", save: function (v) {
        if (v && !/^https:\/\/[^\s<>"'()[\]`]{4,290}$/.test(v)) { $("note").textContent = "A screenshot link starts with https:// and has no spaces or brackets."; return; }
        r.screenshot = v || null; push();
      }, empty: true, send: function (v) {
        if (v && !/^https:\/\/[^\s<>"'()[\]`]{4,290}$/.test(v)) { $("note").textContent = "A screenshot link starts with https:// and has no spaces or brackets."; return; }
        r.screenshot = v || null; push();
        linking[t.key] = false;
        render();
      } });
    } else {
      composer({ key: "note:" + t.key, placeholder: "Type what happened", value: r.note || "", save: function (v) { r.note = v || null; push(); }, send: function (v, box) {
        r.note = v || null; push();
        box.value = "";
        nextTask();
      } });
    }
  }

  /* The day is done: Remy says so, and the day's list as the app's "ready" screen. */
  function renderDone(tasks) {
    composer("Everything is saved");
    var s = view.sprint;
    var last = view.feedback.open && day === s.dayIndex;
    backFn = backTo(function () { idx = tasks.length - 1; changing = tasks[idx].key; });
    backBtn.setAttribute("aria-disabled", "false");
    var card = el("div", "cv-card");
    var ready = el("div", "ready");
    var head = el("div", "ready-head");
    head.appendChild(clone("orbtpl"));
    head.appendChild(el("h2", "", dayLabel(day) + " done"));
    head.appendChild(el("p", "", last ? "One more thing below." : "See you tomorrow."));
    ready.appendChild(head);
    tasks.forEach(function (t, i) {
      var r = resultOf(t.key);
      var b = button("step", "", forward(function () { idx = i; changing = t.key; }));
      var tk = clone("tick");
      if (r.status !== "done") tk.className += " soft";
      b.appendChild(tk);
      var sp = el("span");
      sp.appendChild(el("b", "", t.title));
      sp.appendChild(el("small", "", SAID[r.status] + (r.status !== "done" && r.shops && r.shops.length ? ", " + shopNames(r.shops) : "")));
      b.appendChild(sp);
      ready.appendChild(b);
    });
    card.appendChild(ready);
    remy("end:" + day, ["That's everything for today. Thank you."], [card]);
    if (last) {
      var q = el("div", "cv-card");
      var hd = el("div", "cv-head");
      hd.appendChild(el("span", "cv-label", "Last step"));
      q.appendChild(hd);
      q.appendChild(el("div", "cv-title", "A few questions about how it felt"));
      q.appendChild(el("div", "cv-sub", "About 5 minutes, mostly taps."));
      var a = el("div", "cv-actions");
      a.appendChild(button("cv-primary", "Start", forward(function () { mode = "questions"; })));
      q.appendChild(a);
      remy("last", [], [q]).className += " cont";
    }
    paint();
  }

  /* An earlier day, the shops, the list of days: Remy shows them in a card. */
  function listCard(rows) {
    var c = el("div", "cv-card");
    var r = el("div", "ready");
    r.style.paddingTop = "14px";
    rows.forEach(function (x) { r.appendChild(x); });
    c.appendChild(r);
    return c;
  }
  function side() {
    composer(null);
    progress(0, 0);
    backFn = backTo(toToday);
    backBtn.setAttribute("aria-disabled", "false");
    items = [];
  }
  function renderClosedDay() {
    side();
    status("Closed, read only");
    $("title").textContent = dayLabel(day);
    remy("closed:" + day, [dayLabel(day) + " is closed now. Here is what you said."], [listCard(todays().map(function (t) {
      var r = resultOf(t.key);
      var row = el("div", "step");
      var tk = clone("tick");
      if (!r || r.status !== "done") tk.className += " soft";
      row.appendChild(tk);
      var sp = el("span");
      sp.appendChild(el("b", "", t.title));
      sp.appendChild(el("small", "", r && r.status ? SAID[r.status] : "Not answered"));
      row.appendChild(sp);
      return row;
    }))]);
    paint();
  }
  function renderDays() {
    side();
    status("Closed, read only");
    $("title").textContent = "Earlier days";
    remy("days", ["Which day?"], [chips(earlier().map(function (d) { return { label: d.label, on: forward(function () { mode = "day"; day = d.index; }) }; }))]);
    paint();
  }
  function renderShops() {
    side();
    status("");
    $("title").textContent = view.me.role === "business" ? "Your business" : "Your shops";
    remy("shops", [view.me.role === "business" ? "Your business on Relynked." : "Your shops, and the code to message each."], [listCard(view.shops.map(function (s) {
      var row = el("div", "step");
      var sp = el("span");
      sp.appendChild(el("b", "", s.name));
      if (s.code) sp.appendChild(el("small", "", "Code " + s.code));
      row.appendChild(sp);
      return row;
    }))]);
    paint();
  }

  /* ── The final questions: Remy asks one at a time in the same thread ───────────────────────────────────────── */
  function screens() {
    return view.feedback.questions.filter(function (q) { return !((q.kind === "shop_rating" || q.kind === "shop_choice") && !view.shops.length); });
  }
  function anyAnswer(q) {
    if (q.kind !== "shop_rating") return answerOf(q.key) !== "";
    return view.shops.some(function (s) { return answerOf(q.key, s.ref) !== ""; });
  }
  function said(q) {
    if (q.kind === "shop_rating") {
      var n = view.shops.filter(function (s) { return answerOf(q.key, s.ref) !== ""; }).length;
      return n ? (n === view.shops.length ? "Rated every shop" : "Rated " + n + " of " + view.shops.length + " shops") : "";
    }
    var a = answerOf(q.key);
    if (a === "") return "";
    if (q.kind === "choice") { for (var i = 0; i < q.options.length; i++) if (q.options[i].value === a) return q.options[i].label; }
    if (q.kind === "shop_choice") return shopNames([a]) || a;
    if (q.kind === "minutes") return a + (a === "1" ? " minute" : " minutes");
    return a;
  }
  function moveTo(n, total) {
    forward(function () { step = Math.max(0, Math.min(total, n)); qmax = Math.max(qmax, step); store.set("qstep", step); })();
  }
  function onward(total) { return step < qmax ? qmax : step + 1; }
  function renderQuestions() {
    var f = view.feedback, s = view.sprint;
    $("title").textContent = "Final questions";
    if (!f.open) {
      var past = s.dayIndex !== null && s.lastIndex !== null && s.dayIndex > s.lastIndex;
      if (past) return message("All closed.", "The final questions are closed. Thank you for testing with us.");
      return message("Not open yet.", (f.opensOn ? "The final questions open on " + niceDay(f.opensOn) + ", the last day." : "The final questions open on the last day of the sprint.") + " This same link will show them.", "Go to today's check-in", forward(toToday));
    }
    var list = screens();
    if (!list.length) return message("No questions yet.", "Please check back a little later.");
    step = Math.min(step, list.length);
    qmax = Math.max(qmax, step);
    var total = list.length;
    status(Math.min(step + 1, total) + " of " + total);
    progress(Math.min(step, total), total);
    backFn = step > 0 ? backTo(function () { step--; store.set("qstep", step); }) : null;
    backBtn.setAttribute("aria-disabled", String(!backFn));
    items = [];
    remy("qi", ["Hi " + view.me.firstName + ". A few questions about how it felt. Tap an answer, or type in the box."]);
    var section = null;
    for (var i = 0; i < Math.min(step, total); i++) {
      var q = list[i];
      if (q.section !== section) { section = q.section; divider("d:" + q.section, q.sectionTitle); }
      remy("q:" + q.key, [q.prompt]);
      var w = said(q);
      mine("a:" + q.key + ":" + w, w || "Skipped", (function (n) { return function () { moveTo(n, total); }; })(i), !w);
    }
    if (step >= total) {
      composer("Everything is saved");
      status("All answered");
      var c = el("div", "cv-card");
      var ready = el("div", "ready");
      var head = el("div", "ready-head");
      head.appendChild(clone("orbtpl"));
      head.appendChild(el("h2", "", "Thank you."));
      head.appendChild(el("p", "", "Your answers are saved. Tap any of them above to change it this week."));
      ready.appendChild(head);
      c.appendChild(ready);
      if (s.dayIndex !== null && s.dayIndex >= 0 && s.dayIndex <= s.lastIndex) {
        var a = el("div", "cv-actions");
        a.appendChild(button("cv-second", "Today's check-in", forward(toToday)));
        c.appendChild(a);
      }
      remy("thanks", ["That's all of them. Thank you, " + view.me.firstName + "."], [c]);
      return paint();
    }
    var cur = list[step];
    if (cur.section !== section) divider("d:" + cur.section, cur.sectionTitle);
    askQuestion(cur, total);
    paint();
  }
  function askQuestion(q, total) {
    var at = step;
    var next = function () { if (mode === "questions" && step === at) moveTo(onward(total), total); };
    var skip = { label: "Skip", quiet: true, on: function () { settle(); next(); } };
    if (q.kind === "shop_rating") {
      composer("Rate above, then Next");
      var card = el("div", "cv-card");
      var head = el("div", "cv-head");
      head.appendChild(el("span", "cv-label", "1 is poor, 5 is great"));
      card.appendChild(head);
      view.shops.forEach(function (s) {
        var row = el("div", "rate-row");
        row.appendChild(el("b", "", s.name));
        var seg = el("div", "segment");
        seg.setAttribute("role", "group");
        seg.setAttribute("aria-label", s.name);
        var cur = answerOf(q.key, s.ref), all = [];
        ["1", "2", "3", "4", "5"].forEach(function (n) {
          var b = button("seg", n, function () {
            all.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
            setAnswer(q.key, s.ref, n);
            go.textContent = "Next";
          });
          b.setAttribute("aria-pressed", String(cur === n));
          all.push(b);
          seg.appendChild(b);
        });
        row.appendChild(seg);
        card.appendChild(row);
      });
      var acts = el("div", "cv-actions");
      var go = button("cv-primary", anyAnswer(q) ? "Next" : "Skip", next);
      acts.appendChild(go);
      card.appendChild(acts);
      remy("q:" + q.key, [q.prompt], [card]);
      return;
    }
    if (q.kind === "choice" || q.kind === "shop_choice") {
      composer("Tap an answer above");
      var opts = q.kind === "choice" ? q.options : view.shops.map(function (s) { return { value: s.ref, label: s.name }; });
      var cur2 = answerOf(q.key);
      var row2 = chips(opts.map(function (o) {
        return { label: o.label, pressed: cur2 === o.value, on: function (e) {
          var b = e.currentTarget;
          row2.querySelectorAll(".qr").forEach(function (x) { if (!x.classList.contains("quiet")) x.setAttribute("aria-pressed", String(x === b)); });
          setAnswer(q.key, "", o.value);
          // The chosen chip lifts, then it is sent as their answer and Remy asks the next.
          setTimeout(next, still ? 0 : 250);
        } };
      }).concat([skip]));
      remy("q:" + q.key, [q.prompt], [row2]);
      return;
    }
    remy("q:" + q.key, [q.prompt], [chips([skip])]);
    composer({ key: "q:" + q.key, numeric: q.kind === "minutes", placeholder: q.kind === "minutes" ? "Minutes, as a number" : "Type your answer", value: answerOf(q.key), save: function (v) {
      if (q.kind === "minutes" && v !== "" && !/^\d{1,3}$/.test(v)) { $("note").textContent = "Please type a number of minutes."; return; }
      setAnswer(q.key, "", v);
    }, send: function (v) {
      if (q.kind === "minutes" && !/^\d{1,3}$/.test(v)) { $("note").textContent = "Please type a number of minutes."; return; }
      setAnswer(q.key, "", v);
      next();
    } });
  }

  function render() {
    closeMenu();
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
      depth = 0;
      step = Math.max(0, Number(store.get("qstep")) || 0);
      qmax = step;
      // After the last day the link goes straight to the final questions.
      if (v.feedback.open && s.dayIndex > s.lastIndex) mode = "questions";
      render();
      // Coming back to a day already started: it opens at the first task not answered, with "Welcome back".
      var tasks = v.tasks.filter(function (t) { return t.day === day; });
      var done = tasks.filter(function (t) { var r = resultOf(t.key); return r && r.status; }).length;
      if (mode === "day" && done > 0 && done < tasks.length) flash("", "Welcome back", 2000);
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
