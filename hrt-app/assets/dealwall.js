/* ---------------------------------------------------------------------------
   dealwall.js - the free 30-day deal wall on the HRT dashboard home page.

   Reads the public marketing feed that refresh.sh rebuilds every morning and
   draws it as a horizontal scrolling row of cards. Economy shows real numbers.
   Business class shows city and photo only, blurred, because the feed carries
   no dates or points for those. Nothing is invented here.

   A city only appears on days it actually has deal-tier space, so the wall
   gets shorter or longer on its own. That is correct for a wall called deals.

   The "260+ days / 15 destinations" figures come from the feed too, which
   measures them from the live data each morning, so the sales copy cannot
   drift out of date.

   Free members only: the wrapper carries class "free-only", which existing CSS
   hides for PRO members, who have the full calendar already.

   Self contained on purpose: it injects its own styles and mounts itself, so
   index.html needs only one script tag.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var FEED = "https://hrt-calendar-pro.pages.dev/marketing_deals.json";
  var ATMOS_PRICE = "prc_atmos-monthly-zec10c3r";

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent = [
    ".dw{margin-top:22px}",
    ".dw-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:0 2px;margin-bottom:12px}",
    ".dw-head h2{margin:0;font-size:18px;color:var(--text)}",
    ".dw-head .dw-sub{font-size:12px;color:var(--muted);font-weight:600}",
    ".dw-head .dw-when{font-size:11.5px;color:var(--muted);font-weight:600}",
    ".dw-limit{font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);background:var(--surface-2,#f7f9fb);border:1px solid var(--line);border-radius:999px;padding:4px 9px;white-space:nowrap}",
    ".dw-scope{display:flex;flex-wrap:wrap;gap:18px;margin:12px 0 2px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(242,184,75,.28)}",
    ".dw-scope div{min-width:92px}",
    ".dw-scope b{display:block;font-size:19px;font-weight:800;color:#f5c75a;line-height:1.1}",
    ".dw-scope span{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#c7d4e2}",
    ".dw-nav{margin-left:auto;display:flex;gap:6px}",
    ".dw-nav button{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer;font:inherit;font-size:14px;line-height:1;display:grid;place-items:center;box-shadow:var(--shadow)}",
    ".dw-nav button:hover:not(:disabled){border-color:var(--coral)}",
    ".dw-nav button:disabled{opacity:.35;cursor:default}",
    ".dw-rail{display:flex;gap:12px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scroll-behavior:smooth;padding:2px 2px 10px;scrollbar-width:thin}",
    ".dw-rail::-webkit-scrollbar{height:8px}",
    ".dw-rail::-webkit-scrollbar-thumb{background:var(--line);border-radius:99px}",
    ".dw-rail::-webkit-scrollbar-track{background:transparent}",
    ".dw-card{flex:0 0 218px;scroll-snap-align:start;position:relative;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);display:flex;flex-direction:column}",
    ".dw-ph{position:relative;height:104px;background:#d9e5ee center/cover no-repeat}",
    ".dw-ph:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(14,27,44,0) 35%,rgba(14,27,44,.72))}",
    ".dw-city{position:absolute;left:12px;bottom:9px;z-index:1;color:#fff;font-weight:800;font-size:14.5px;text-shadow:0 1px 3px rgba(0,0,0,.45)}",
    ".dw-rt{position:absolute;right:10px;top:9px;z-index:1;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#0e1b2c;background:rgba(255,255,255,.92);border-radius:999px;padding:3px 8px}",
    ".dw-body{padding:11px 12px 12px;display:flex;flex-direction:column;gap:7px}",
    ".dw-pts{font-weight:800;font-size:17px;color:var(--text);line-height:1}",
    ".dw-pts small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-top:3px}",
    ".dw-meta{display:flex;flex-wrap:wrap;gap:6px}",
    ".dw-chip{font-size:11px;font-weight:700;color:var(--text);background:var(--surface-2,#f7f9fb);border:1px solid var(--line);border-radius:999px;padding:3px 8px}",
    ".dw-chip.ok{color:#1c6b40;background:color-mix(in srgb,#3fce7f 16%,var(--surface));border-color:color-mix(in srgb,#3fce7f 38%,var(--line))}",
    ".dw-pro{margin-top:14px;border:1px solid rgba(242,184,75,.45);border-radius:var(--radius,16px);background:linear-gradient(120deg,#0e1b2c 0%,#16294a 72%,#22304a 100%);padding:16px;box-shadow:var(--shadow)}",
    ".dw-pro-h{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}",
    ".dw-pro-h h3{margin:0;color:#fff;font-size:16px}",
    ".dw-pro-h p{margin:0;color:#c7d4e2;font-size:12.5px;flex:1;min-width:200px}",
    ".dw-pill{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:5px 10px;white-space:nowrap}",
    ".dw-rail.pro{padding-bottom:8px}",
    ".dw-rail.pro::-webkit-scrollbar-thumb{background:rgba(242,184,75,.35)}",
    ".dw-lock{flex:0 0 186px;scroll-snap-align:start;position:relative;overflow:hidden;border-radius:12px;border:1px solid rgba(242,184,75,.3);height:118px}",
    ".dw-lock .dw-blur{position:absolute;inset:0;background:#24354d center/cover no-repeat;filter:blur(7px);transform:scale(1.12);opacity:.85}",
    ".dw-lock .dw-lc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;padding:10px;background:rgba(10,18,28,.42);color:#fff}",
    ".dw-lock .dw-lc b{font-size:13.5px}",
    ".dw-lock .dw-lc span{font-size:11px;color:#e3ebf4;font-weight:600}",
    ".dw-cta{margin-top:11px;display:flex;flex-wrap:wrap;gap:9px;align-items:center}",
    ".dw-note{margin-top:10px;font-size:11px;color:var(--muted);line-height:1.45;padding:0 2px}",
    "@media (max-width:640px){.dw-nav{display:none}.dw-card{flex-basis:78vw;max-width:260px}.dw-lock{flex-basis:62vw;max-width:220px}}"
  ].join("");
  document.head.appendChild(css);

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function num(n) { return (n || 0).toLocaleString("en-US"); }
  // "2026-09-25" -> "Sep 25", built from parts so the browser's timezone
  // cannot shift the date back a day.
  function shortDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return (months[parseInt(p[1], 10) - 1] || "") + " " + parseInt(p[2], 10);
  }

  // Arrow buttons that page the rail. They hide themselves when everything
  // already fits, so they never look broken on a short wall.
  function attachNav(rail, nav) {
    var prev = el("button", null, "‹");
    var next = el("button", null, "›");
    prev.type = next.type = "button";
    prev.setAttribute("aria-label", "Scroll left");
    next.setAttribute("aria-label", "Scroll right");
    function step() {
      var card = rail.firstElementChild;
      return card ? card.getBoundingClientRect().width + 12 : 220;
    }
    prev.addEventListener("click", function () { rail.scrollBy({ left: -step() * 2, behavior: "smooth" }); });
    next.addEventListener("click", function () { rail.scrollBy({ left: step() * 2, behavior: "smooth" }); });
    function sync() {
      var max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
      nav.style.display = max > 4 ? "" : "none";
    }
    rail.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    nav.appendChild(prev); nav.appendChild(next);
    setTimeout(sync, 0);
  }

  /* ---------- build ---------- */
  function render(feed) {
    var wrap = el("div", "dw free-only");
    var win = feed.window_days || 30;

    var head = el("div", "dw-head");
    head.appendChild(el("h2", null, "Deals in the next " + win + " days"));
    head.appendChild(el("span", "dw-limit", "Free · " + win + " days only"));
    head.appendChild(el("span", "dw-sub", (feed.hub || "HNL") + " departures"));
    if (feed.updated) head.appendChild(el("span", "dw-when", "· updated " + shortDate(feed.updated)));
    var nav = el("div", "dw-nav");
    head.appendChild(nav);
    wrap.appendChild(head);

    /* economy: real numbers, scrolling rail */
    var rail = el("div", "dw-rail");
    (feed.economy || []).forEach(function (d) {
      var card = el("div", "dw-card");
      var ph = el("div", "dw-ph");
      if (d.image) ph.style.backgroundImage = "url('" + String(d.image).replace(/'/g, "%27") + "')";
      ph.appendChild(el("span", "dw-rt", (d.origin || "") + "–" + (d.dest || "")));
      ph.appendChild(el("span", "dw-city", d.city || d.dest || ""));
      card.appendChild(ph);

      var body = el("div", "dw-body");
      var pts = el("div", "dw-pts", num(d.miles) + " pts");
      pts.appendChild(el("small", null, "one way, economy"));
      body.appendChild(pts);

      var meta = el("div", "dw-meta");
      if (d.deal_dates) meta.appendChild(el("span", "dw-chip ok", d.deal_dates + (d.deal_dates === 1 ? " date open" : " dates open")));
      if (d.soonest) meta.appendChild(el("span", "dw-chip", "from " + shortDate(d.soonest)));
      if (d.nonstop) meta.appendChild(el("span", "dw-chip", "nonstop"));
      body.appendChild(meta);

      card.appendChild(body);
      rail.appendChild(card);
    });
    wrap.appendChild(rail);
    attachNav(rail, nav);

    /* business class: locked, and genuinely empty behind the blur */
    var teasers = feed.premium_teasers || [];
    if (teasers.length) {
      var pro = el("div", "dw-pro");
      var ph2 = el("div", "dw-pro-h");
      ph2.appendChild(el("span", "dw-pill", "★ HRT PRO"));
      ph2.appendChild(el("h3", null, "Business class award space"));
      var cities = teasers.map(function (t) { return t.city; }).filter(Boolean);
      ph2.appendChild(el("p", null,
        cities.length
          ? "We track business class award space to " + cities.join(", ") + ". PRO members see the dates and the points."
          : "PRO members see the dates and the points."));
      pro.appendChild(ph2);

      var prail = el("div", "dw-rail pro");
      teasers.forEach(function (t) {
        var lock = el("div", "dw-lock");
        var blur = el("div", "dw-blur");
        if (t.image) blur.style.backgroundImage = "url('" + String(t.image).replace(/'/g, "%27") + "')";
        lock.appendChild(blur);
        var lc = el("div", "dw-lc");
        lc.appendChild(el("b", null, t.city || t.dest || ""));
        lc.appendChild(el("span", null, (t.origin || "HNL") + "–" + (t.dest || "") + " · business"));
        lc.appendChild(el("span", null, "🔒 PRO members only"));
        lock.appendChild(lc);
        prail.appendChild(lock);
      });
      pro.appendChild(prail);

      /* What the paid calendar covers, measured from the data by the feed. */
      var sc = feed.pro_scope || {};
      if (sc.pro_days || sc.pro_destinations) {
        var scope = el("div", "dw-scope");
        function stat(big, label) {
          var d = document.createElement("div");
          d.appendChild(el("b", null, big));
          d.appendChild(el("span", null, label));
          scope.appendChild(d);
        }
        if (sc.pro_days) stat(sc.pro_days + "+ days", "booking window");
        if (sc.pro_destinations) stat(String(sc.pro_destinations), "destinations");
        stat("Atmos Rewards", "award space");
        pro.appendChild(scope);

        var vs = el("p", "dw-note", "This free wall shows the next " + win +
          " days. HRT PRO opens the full calendar: " +
          (sc.pro_days ? sc.pro_days + "+ days ahead" : "the full booking window") +
          " across " + (sc.pro_destinations || "all") + " destinations on Atmos Rewards, both directions.");
        vs.style.color = "#c7d4e2";
        vs.style.marginTop = "10px";
        pro.appendChild(vs);
      }

      var cta = el("div", "dw-cta");
      var btn = el("button", "btn gold", "Unlock the full calendar · $9.99/mo →");
      btn.type = "button";
      btn.setAttribute("data-ms-price:add", ATMOS_PRICE);
      cta.appendChild(btn);
      pro.appendChild(cta);

      wrap.appendChild(pro);
    }

    if (feed.note) wrap.appendChild(el("p", "dw-note", feed.note));
    return wrap;
  }

  /* ---------- mount ---------- */
  function mount() {
    var home = document.querySelector("#v-home .content");
    if (!home) return;
    var anchor = home.querySelector(".toprow");

    fetch(FEED, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("feed " + r.status); return r.json(); })
      .then(function (feed) {
        if (!feed || !(feed.economy || []).length) return; // nothing to show, show nothing
        var node = render(feed);
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
        else home.appendChild(node);
      })
      .catch(function (e) {
        // Stay silent on the page. A broken feed should never show an error box
        // to a visitor; it just means no wall today.
        if (window.console) console.warn("[dealwall] feed unavailable:", e && e.message);
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
