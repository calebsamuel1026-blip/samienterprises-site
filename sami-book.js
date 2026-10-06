/* sami-book.js - on-site "book a call" form (#book) -> Supabase call_requests (insert-only public key).
   Fills the day picker with the next 7 business days, captures timezone + attribution, validates, submits.
   If the backend is not configured yet (no window.SAMI_ANALYTICS), it falls back to opening a pre-filled email
   so no booking is ever lost. */
(function () {
  "use strict";
  var f = document.getElementById("bookForm");
  if (!f) return;
  var CFG = window.SAMI_ANALYTICS || {};
  var msg = document.getElementById("bookMsg"), btn = f.querySelector("button[type=submit]"), label = btn.textContent, started = Date.now();

  // next 7 business days
  var sel = f.elements.pref_day, d = new Date(), n = 0;
  while (n < 7) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    var o = document.createElement("option");
    o.value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    o.textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    sel.appendChild(o); n++;
  }
  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  var tzEl = document.getElementById("bookTz"); if (tzEl && tz) tzEl.textContent = "Times are in your time zone (" + tz.replace(/_/g, " ") + ").";

  function store(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function say(cls, t) { msg.className = cls; msg.textContent = t; }
  function bad(el, t) {                                                       // tie the message to the field for screen readers
    el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", "bookMsg"); el.focus(); say("err", t);
  }
  f.addEventListener("input", function (e) { if (e.target.removeAttribute) { e.target.removeAttribute("aria-invalid"); e.target.removeAttribute("aria-describedby"); } });
  function track(e, p) { if (window.samiTrack) window.samiTrack(e, p); }

  f.addEventListener("submit", function (e) {
    e.preventDefault(); say("", "");
    if (f.elements.website_hp.value) return;                                   // honeypot
    if (Date.now() - started < 2500) { say("err", f.dataset.slow); return; }
    var need = ["name", "company", "email"];
    for (var i = 0; i < need.length; i++) {
      var el = f.elements[need[i]];
      if (!el.value.trim()) { bad(el, f.dataset.missing + " " + el.labels[0].firstChild.textContent.trim().toLowerCase().replace(/^your\s+/, "").replace(/\s*\(optional\)$/, "") + "."); return; }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.elements.email.value.trim())) { bad(f.elements.email, f.dataset.bademail); return; }
    if (!f.elements.consent.checked) { bad(f.elements.consent, f.dataset.consent); return; }
    var q = new URLSearchParams(location.search);
    var row = {
      name: f.elements.name.value.trim().slice(0, 100), company: f.elements.company.value.trim().slice(0, 120),
      website: f.elements.website.value.trim().slice(0, 200) || null, email: f.elements.email.value.trim().slice(0, 160),
      phone: f.elements.phone.value.trim().slice(0, 40) || null, pref_day: f.elements.pref_day.value || null,
      pref_time: f.elements.pref_time.value || null, timezone: tz.slice(0, 60) || null,
      headache: (f.elements.headache && f.elements.headache.value) || null, notes: f.elements.notes.value.trim().slice(0, 1000) || null, consent: true,
      vid: store("sami_vid"), sid: store("sami_sid"), rid: (q.get("r") || store("sami_rid") || "").slice(0, 32) || null,
      utm_source: (q.get("utm_source") || "").slice(0, 80) || null
    };
    track("cta_click", { place: "book_form_submit", kind: CFG.url ? "form" : "mailto_fallback" });
    var BOOK = window.SAMI_BOOK_URL;                                            // Google Apps Script endpoint (tools/site/booking/Code.gs)
    if (BOOK) {
      btn.disabled = true; btn.textContent = f.dataset.sending;
      row.website_hp = f.elements.website_hp.value || "";
      fetch(BOOK, { method: "POST", body: JSON.stringify(row), headers: { "Content-Type": "text/plain;charset=utf-8" } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || "failed");
          track("cta_click", { place: "book_form_saved" });
          f.reset(); f.hidden = true; say("ok", f.dataset.success);
          document.getElementById("book").scrollIntoView({ block: "start" });
        })
        .catch(function () {                                                    // endpoint down: never lose the booking
          var body = Object.keys(row).filter(function (k) { return row[k] && ["vid", "sid", "consent", "website_hp"].indexOf(k) < 0; })
            .map(function (k) { return k + ": " + row[k]; }).join(String.fromCharCode(10));
          location.href = "mailto:" + f.dataset.fallback + "?subject=" + encodeURIComponent("15-minute call: " + row.company) + "&body=" + encodeURIComponent(body);
          say("ok", f.dataset.fallbackmsg);
        })
        .finally(function () { btn.disabled = false; btn.textContent = label; });
      return;
    }
    if (!CFG.url) {                                                             // backend not connected yet
      var body = Object.keys(row).filter(function (k) { return row[k] && ["vid", "sid", "consent"].indexOf(k) < 0; })
        .map(function (k) { return k + ": " + row[k]; }).join("\n");
      location.href = "mailto:" + f.dataset.fallback + "?subject=" + encodeURIComponent("15-minute call: " + row.company) + "&body=" + encodeURIComponent(body);
      say("ok", f.dataset.fallbackmsg); return;
    }
    btn.disabled = true; btn.textContent = f.dataset.sending;
    fetch(CFG.url.replace(/\/$/, "") + "/rest/v1/call_requests", {
      method: "POST", body: JSON.stringify(row),
      headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: "Bearer " + CFG.key, Prefer: "return=minimal" }
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      f.reset(); f.hidden = true; say("ok", f.dataset.success);
      document.getElementById("book").scrollIntoView({ block: "start" });
    }).catch(function () { say("err", f.dataset.error); })
      .finally(function () { btn.disabled = false; btn.textContent = label; });
  });
})();
