/* sami-events.js - first-party visitor analytics for samienterprises.co.
   Same design as NudoIQ's funnel tracking (closed event allowlist, insert-only storage, one row per event),
   plus friction signals computed in the browser (rage/dead clicks, errors, quick-backs, scroll, active time).
   Config: window.SAMI_ANALYTICS = { url: "https://<project>.supabase.co", key: "<anon public key>" }.
   Without config it does nothing except expose window.samiTrack (no-op), so the site never breaks.
   No cookies, no personal data: a random visitor id in localStorage, a 30-min session id, no IP stored. */
(function () {
  "use strict";
  var CFG = window.SAMI_ANALYTICS || {};
  var ENDPOINT = CFG.url ? CFG.url.replace(/\/$/, "") + "/rest/v1/site_events" : null;
  var ALLOWED = ["page_view", "scroll_25", "scroll_50", "scroll_75", "scroll_90", "section_view", "engaged_15s", "engaged_60s",
    "faq_open", "nav_click", "menu_open", "cta_click", "demo_click", "outbound_click", "rage_click", "dead_click",
    "js_error", "quick_back", "page_exit", "calc_used"];

  function rnd() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(0, 36); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var vid = store("sami_vid") || rnd(); store("sami_vid", vid);
  var now = Date.now(), last = +(store("sami_last") || 0), sid = store("sami_sid");
  if (!sid || now - last > 30 * 60 * 1000) { sid = rnd(); store("sami_sid", sid); }
  store("sami_last", String(now));

  var q = new URLSearchParams(location.search);
  var ua = navigator.userAgent || "";
  var bot = !!(navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|curl|python|wget|googleother/i.test(ua));
  var ctx = {
    vid: vid, sid: sid, path: location.pathname,
    rid: (q.get("r") || "").slice(0, 32) || null,                         // per-prospect id on links we send in replies
    referrer: (document.referrer ? (function () { try { return new URL(document.referrer).hostname; } catch (e) { return null; } })() : null),
    utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"), utm_campaign: q.get("utm_campaign"), utm_content: q.get("utm_content"),
    device: innerWidth < 768 ? "mobile" : innerWidth < 1100 ? "tablet" : "desktop", vw: innerWidth, bot: bot
  };
  if (ctx.rid) store("sami_rid", ctx.rid); else ctx.rid = store("sami_rid");  // keep attribution on later visits

  var queue = [], seq = 0, t0 = performance.now();
  function track(event, props) {
    if (ALLOWED.indexOf(event) < 0) return;
    var row = {}; for (var k in ctx) row[k] = ctx[k];
    row.event = event; row.seq = seq++; row.t_ms = Math.round(performance.now() - t0);
    row.props = props || {};
    queue.push(row);
    if (queue.length >= 10) flush();
  }
  function flush() {
    if (!ENDPOINT || !queue.length) { if (!ENDPOINT) queue = []; return; }
    var body = JSON.stringify(queue.splice(0, queue.length));
    try {
      fetch(ENDPOINT, { method: "POST", keepalive: true, body: body,
        headers: { "Content-Type": "application/json", apikey: CFG.key, Authorization: "Bearer " + CFG.key, Prefer: "return=minimal" } })
        .catch(function () {});
    } catch (e) {}
  }
  setInterval(flush, 5000);
  window.samiTrack = track;

  function sel(el) {  // short, stable description of what was clicked (no text content from inputs)
    if (!el || !el.tagName) return "";
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (el.classList && el.classList.length) s += "." + [].slice.call(el.classList, 0, 2).join(".");
    var p = el.closest && el.closest("section[id],section[class],header,footer");
    return ((p && p !== el ? (p.id || p.className.split(" ")[0] || p.tagName.toLowerCase()) + " > " : "") + s).slice(0, 80);
  }
  function label(el) { return ((el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 60); }

  // 1) landed
  track("page_view", { title: document.title.slice(0, 60), vh: innerHeight });

  // 2) scroll depth checkpoints
  var maxScroll = 0, hit = {};
  function onScroll() {
    var h = document.documentElement.scrollHeight - innerHeight;
    var pct = h > 0 ? Math.round(scrollY / h * 100) : 100;
    if (pct > maxScroll) maxScroll = pct;
    [25, 50, 75, 90].forEach(function (m) { if (pct >= m && !hit[m]) { hit[m] = 1; track("scroll_" + m); } });
  }
  addEventListener("scroll", onScroll, { passive: true });

  // 3) section views (saw how-it-works, pricing, FAQ, closing band)
  if ("IntersectionObserver" in window) {
    var seen = {};
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var name = e.target.id || (e.target.className || "").split(" ")[0] || "section";
        if (e.isIntersecting && !seen[name]) { seen[name] = 1; track("section_view", { section: name }); }
      });
    }, { threshold: 0.35 });
    [].forEach.call(document.querySelectorAll("section, .band"), function (s) { io.observe(s); });
  }

  // 4) active (visible + interacting) time checkpoints
  var active = 0, lastAct = Date.now(), engaged = {};
  ["mousemove", "keydown", "scroll", "touchstart", "click"].forEach(function (ev) { addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true }); });
  setInterval(function () {
    if (document.visibilityState === "visible" && Date.now() - lastAct < 15000) active += 1;
    if (active >= 15 && !engaged[15]) { engaged[15] = 1; track("engaged_15s"); }
    if (active >= 60 && !engaged[60]) { engaged[60] = 1; track("engaged_60s"); }
  }, 1000);

  // 5) clicks: intent, navigation, FAQ, friction
  var clicks = [], lastDead = {};
  document.addEventListener("click", function (e) {
    var t = e.target, a = t.closest && t.closest("a,button,summary,label,input,select,textarea,[role=button],[onclick]");
    if (a) {
      var href = a.getAttribute("href") || "";
      if (a.tagName === "SUMMARY") { var d = a.parentElement; if (d && !d.open) track("faq_open", { q: label(a) }); }
      else if (/^mailto:/i.test(href) || /book|call/i.test(label(a))) track("cta_click", { place: sel(a), text: label(a), kind: /^mailto:/i.test(href) ? "mailto" : "link" });
      else if (/artifact|demo/i.test(href)) track("demo_click", { place: sel(a) });
      else if (href.charAt(0) === "#") track("nav_click", { to: href.slice(0, 20) });
      else if (/^https?:/i.test(href) && a.hostname !== location.hostname) track("outbound_click", { host: a.hostname });
      else if (a.id === "burger") track("menu_open");
    } else {
      // dead click: clicked something that looks clickable or is text/image, and nothing on the page changed
      var before = document.body.innerHTML.length, sx = scrollY, where = sel(t), tn = Date.now();
      setTimeout(function () {
        if (document.body.innerHTML.length === before && scrollY === sx && /img|span|div|p|h\d|li|b|em/i.test(t.tagName)
            && !(lastDead.el === where && tn - lastDead.t < 2000)) {
          lastDead = { el: where, t: tn }; track("dead_click", { el: where });
        }
      }, 800);
    }
    // rage click: 3+ clicks within 700 ms inside a 40 px radius
    var n = Date.now(); clicks = clicks.filter(function (c) { return n - c.t < 700; });
    clicks.push({ t: n, x: e.clientX, y: e.clientY });
    var near = clicks.filter(function (c) { return Math.abs(c.x - e.clientX) < 40 && Math.abs(c.y - e.clientY) < 40; });
    if (near.length === 3) track("rage_click", { el: sel(t), n: near.length });
  }, true);

  // 6) errors
  var errs = 0;
  addEventListener("error", function (e) { if (errs++ < 5) track("js_error", { msg: String(e.message || "resource error").slice(0, 120), src: String(e.filename || (e.target && e.target.src) || "").slice(-60) }); }, true);

  // 7) exit + quick-back (left within 8 s having barely scrolled)
  var exited = false;
  function exit() {
    if (exited) return; exited = true;
    var secs = Math.round((performance.now() - t0) / 1000);
    if (secs < 8 && maxScroll < 10) track("quick_back", { secs: secs });
    track("page_exit", { secs: secs, active_s: active, max_scroll: maxScroll });
    flush();
  }
  addEventListener("pagehide", exit);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") exit(); });  // mobile often skips pagehide
})();
