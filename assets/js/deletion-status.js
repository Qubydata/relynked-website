/*
 * A data deletion request's status (relynked.com/data-deletion?code=...).
 * Meta hands this link and a confirmation code to someone who asked Meta to
 * have Relynked delete their data. The page asks the Relynked API for that
 * code's state: received or done, and when. Nothing about whose data it was
 * comes back. Shown only when a code is in the address; otherwise the page
 * is exactly as it was.
 */
(function () {
  var box = document.getElementById("delstatus");
  if (!box) return;
  var code = (new URLSearchParams(location.search).get("code") || "").trim();
  if (!/^[A-Za-z0-9_-]{24}$/.test(code)) return;
  var title = box.querySelector("[data-title]");
  var text = box.querySelector("[data-text]");
  function show(t, p) {
    title.textContent = t;
    text.textContent = p;
    box.hidden = false;
  }
  function day(iso) {
    try {
      return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return "";
    }
  }
  show("Checking your request", "One moment.");
  fetch("https://relynked-api-production.up.railway.app/instagram/data-deletion/status?code=" + encodeURIComponent(code), {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  })
    .then(function (r) {
      return r.json().then(function (j) {
        return { ok: r.ok, body: j };
      });
    })
    .then(function (r) {
      if (!r.ok || !r.body || !r.body.status || r.body.status === "unknown") {
        show("We could not find that request", "Check the code Meta gave you, or contact us below with it.");
        return;
      }
      if (r.body.status === "done") {
        show("Your request is done", "The data Relynked held about you was deleted" + (r.body.completedAt ? " on " + day(r.body.completedAt) : "") + ". Confirmation code " + code + ".");
      } else {
        show("Your request was received", "We are deleting the data Relynked holds about you. Confirmation code " + code + ".");
      }
    })
    .catch(function () {
      show("We could not check just now", "Please try again in a few minutes, or contact us below with your code.");
    });
})();
