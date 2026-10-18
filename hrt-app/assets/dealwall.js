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
    ".dw-card{appearance:none;font:inherit;text-align:left;cursor:pointer;padding:0;color:inherit;"+
      "flex:0 0 218px;scroll-snap-align:start;position:relative;overflow:hidden;border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);display:flex;flex-direction:column}",
    ".dw-ph{position:relative;height:104px;background:#d9e5ee center/cover no-repeat}",
    ".dw-ph:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,27,36,0) 35%,rgba(20,27,36,.72))}",
    ".dw-city{position:absolute;left:12px;bottom:9px;z-index:1;color:#fff;font-weight:800;font-size:14.5px;text-shadow:0 1px 3px rgba(0,0,0,.45)}",
    ".dw-rt{position:absolute;right:10px;top:9px;z-index:1;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#141b24;background:rgba(255,255,255,.92);border-radius:999px;padding:3px 8px}",
    ".dw-body{padding:11px 12px 12px;display:flex;flex-direction:column;gap:7px}",
    ".dw-pts{font-weight:800;font-size:17px;color:var(--text);line-height:1}",
    ".dw-pts small{display:block;font-size:10.5px;font-weight:700;color:var(--muted);letter-spacing:.04em;text-transform:uppercase;margin-top:3px}",
    ".dw-meta{display:flex;flex-wrap:wrap;gap:6px}",
    ".dw-chip{font-size:11px;font-weight:700;color:var(--text);background:var(--surface-2,#f7f9fb);border:1px solid var(--line);border-radius:999px;padding:3px 8px}",
    ".dw-chip.ok{color:#1c6b40;background:color-mix(in srgb,#3fce7f 16%,var(--surface));border-color:color-mix(in srgb,#3fce7f 38%,var(--line))}",
    ".dw-pro{margin-top:14px;border:1px solid rgba(242,184,75,.45);border-radius:var(--radius,16px);background:linear-gradient(120deg,#141b24 0%,#1f2a38 72%,#22304a 100%);padding:16px;box-shadow:var(--shadow)}",
    ".dw-pro-h{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px}",
    ".dw-pro-h h3{margin:0;color:#fff;font-size:16px}",
    ".dw-pro-h p{margin:0;color:#c7d4e2;font-size:12.5px;flex:1;min-width:200px}",
    ".dw-pill{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#d97040);border-radius:999px;padding:5px 10px;white-space:nowrap}",
    ".dw-rail.pro{padding-bottom:8px}",
    ".dw-rail.pro::-webkit-scrollbar-thumb{background:rgba(242,184,75,.35)}",
    ".dw-lock{flex:0 0 186px;scroll-snap-align:start;position:relative;overflow:hidden;border-radius:12px;border:1px solid rgba(242,184,75,.3);height:118px}",
    ".dw-lock .dw-blur{position:absolute;inset:0;background:#24354d center/cover no-repeat;filter:blur(7px);transform:scale(1.12);opacity:.85}",
    ".dw-lock .dw-lc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;text-align:center;padding:10px;background:rgba(10,18,28,.42);color:#fff}",
    ".dw-lock .dw-lc b{font-size:13.5px}",
    ".dw-lock .dw-lc span{font-size:11px;color:#e3ebf4;font-weight:600}",
    ".dw-cta{margin-top:11px;display:flex;flex-wrap:wrap;gap:9px;align-items:center}",
    ".dw-note{margin-top:10px;font-size:11px;color:var(--muted);line-height:1.45;padding:0 2px}",
    "@media (max-width:640px){.dw-nav{display:none}.dw-card{flex-basis:78vw;max-width:260px}.dw-lock{flex-basis:62vw;max-width:220px}}",
    /* a card is a button now: say so, and show which one is open */
    ".dw-card:hover{border-color:var(--coral)}",
    ".dw-card:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
    ".dw-card.on{border-color:var(--coral);box-shadow:0 0 0 1px var(--coral) inset,var(--shadow)}",
    ".dw-more{display:block;padding:0 12px 11px;font-size:11px;font-weight:800;color:var(--coral)}",
    ".dw-more:after{content:' \\2192'}",
    ".dw-card.on .dw-more{visibility:hidden}",
    /* the panel a card opens */
    ".dw-exp{display:none}",
    ".dw-exp.on{display:block;border:1px solid var(--coral);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);padding:14px 16px 15px;margin:2px 0 4px}",
    ".dw-exph{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}",
    ".dw-exph b{display:block;font-size:15px;color:var(--text)}",
    ".dw-exph span{display:block;font-size:12px;color:var(--muted);font-weight:600;margin-top:2px}",
    ".dw-x{margin-left:auto;flex:0 0 auto;width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--muted);font:inherit;font-size:17px;line-height:1;cursor:pointer}",
    ".dw-x:hover{border-color:var(--coral);color:var(--coral)}",
    ".dw-dates{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}",
    ".dw-date{border:1px solid var(--line);border-radius:10px;padding:8px 9px;background:var(--surface-2,#f7f9fb)}",
    ".dw-date.low{border-color:color-mix(in srgb,#f2726e 45%,var(--line));background:color-mix(in srgb,#f2726e 8%,var(--surface))}",
    ".dw-date b{display:block;font-size:12.5px;color:var(--text)}",
    ".dw-dpts{display:block;font-size:14px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;line-height:1.2;margin-top:1px}",
    ".dw-dtags{display:flex;flex-wrap:wrap;gap:4px 7px;margin-top:3px}",
    ".dw-dtags span{font-size:10px;font-weight:700;color:var(--muted)}",
    ".dw-dtags .dw-ns{color:var(--coral)}",
    ".dw-expf{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:13px;padding-top:11px;border-top:1px solid var(--line)}",
    ".dw-expf>span{font-size:11.5px;color:var(--muted);font-weight:600}",
    ".dw-unlock{margin-left:auto;font-size:12.5px;font-weight:800;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#d97040);border-radius:999px;padding:8px 15px;text-decoration:none;white-space:nowrap}",
    "@media (max-width:520px){.dw-unlock{margin-left:0}}"
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
  /* A rail of cards does not look scrollable until something moves. Slide it
     out and back once on load, then never again: a carousel that keeps drifting
     is harder to read and fights anyone mid-sentence. Skipped entirely when
     everything already fits, when the viewer has asked for less motion, or if
     they start scrolling it themselves first. */
  function nudge(rail) {
    var reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    if (reduce) return;
    setTimeout(function () {
      if (rail.scrollWidth <= rail.clientWidth + 4) return;  /* nothing to show */
      /* The rail rests a couple of px in because of its own padding, so this
         has to be a threshold, not > 0, or the nudge never fires. */
      var at0 = rail.scrollLeft;
      if (at0 > 8) return;                                   /* already moved it */
      var touched = false;
      function stop() { touched = true; }
      rail.addEventListener("pointerdown", stop, { once: true, passive: true });
      rail.addEventListener("wheel", stop, { once: true, passive: true });
      /* The rail uses scroll-snap, which yanks a part-card offset straight
         back to the nearest card and swallows the whole nudge. Turn snapping
         off for the gesture and restore it afterwards. */
      var snap = rail.style.scrollSnapType;
      rail.style.scrollSnapType = "none";
      function restore() { rail.style.scrollSnapType = snap; }
      var out = Math.min(96, Math.round(rail.clientWidth * 0.12));
      rail.scrollTo({ left: at0 + out, behavior: "smooth" });
      setTimeout(function () {
        if (touched) { restore(); return; }
        rail.scrollTo({ left: at0, behavior: "smooth" });
        setTimeout(restore, 600);
      }, 620);
    }, 420);
  }

  /* Today in Hawaii (no daylight saving, always UTC-10), as YYYY-MM-DD. */
  function hawaiiToday() { return new Date(Date.now() - 10 * 3600e3).toISOString().slice(0, 10); }

  /* The feed is built once each morning, so by evening (or before the next run)
     some of its dates are already in the past. Drop those here and recount each
     card from what is left, so a card never says "from Oct 15" on Oct 16. A city
     with nothing left disappears for the day. Pure, so it can be tested. */
  function freshen(feed, today) {
    today = today || hawaiiToday();
    var out = {};
    for (var k in feed) if (Object.prototype.hasOwnProperty.call(feed, k)) out[k] = feed[k];
    out.economy = (feed.economy || []).map(function (d) {
      var dates = (d.dates || []).filter(function (t) { return t && String(t.date) >= today; });
      if (!dates.length) return null;
      var c = {};
      for (var j in d) if (Object.prototype.hasOwnProperty.call(d, j)) c[j] = d[j];
      c.dates = dates;
      c.deal_dates = dates.length;
      c.soonest = dates.map(function (t) { return t.date; }).sort()[0];
      c.miles = Math.min.apply(null, dates.map(function (t) { return t.miles || Infinity; }));
      if (!isFinite(c.miles)) c.miles = d.miles;
      return c;
    }).filter(Boolean);
    return out;
  }

  /* Extra locked tiles for the PRO box, on top of the ones the feed sends.
     Photos are borrowed from the matching free card. The feed's own list is
     built on the Mac (~/award-tracker); move these there when it is next edited. */
  var EXTRA_TEASERS = [
    { origin: "HNL", dest: "LAX", city: "Los Angeles", cabin: "first class" },
    { origin: "HNL", dest: "LAS", city: "Las Vegas", cabin: "first class" }
  ];
  function teasersFor(feed) {
    var list = (feed.premium_teasers || []).slice();
    var have = {}; list.forEach(function (t) { have[t.dest] = 1; });
    var img = {}; (feed.economy || []).concat(feed.economy_all || []).forEach(function (d) { if (d.image) img[d.dest] = d.image; });
    EXTRA_TEASERS.forEach(function (t) {
      if (have[t.dest]) return;
      var c = { origin: t.origin, dest: t.dest, city: t.city, cabin: t.cabin, image: img[t.dest] || "", locked: true };
      list.push(c);
    });
    return list;
  }

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
    var exp = el("div", "dw-exp");   /* the panel a card opens, under the rail */
    var openKey = null;
    (feed.economy || []).forEach(function (d) {
      var card = el("button", "dw-card");
      card.type = "button";
      card.setAttribute("aria-expanded", "false");
      card.addEventListener("click", function () {
        var key = (d.dest || d.city);
        if (openKey === key) { closeExp(); return; }
        openKey = key;
        rail.querySelectorAll(".dw-card").forEach(function (c) {
          var on = c === card;
          c.classList.toggle("on", on);
          c.setAttribute("aria-expanded", on ? "true" : "false");
        });
        fillExp(d);
      });
      var ph = el("div", "dw-ph");
      if (d.image) ph.style.backgroundImage = "url('" + String(d.image).replace(/'/g, "%27") + "')";
      ph.appendChild(el("span", "dw-rt", (d.origin || "") + " → " + (d.dest || "")));
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
      card.appendChild(el("span", "dw-more", "See the open dates"));
      rail.appendChild(card);
    });
    wrap.appendChild(rail);

    /* ---- the expanded panel ---- */
    function closeExp() {
      openKey = null;
      exp.innerHTML = "";
      exp.classList.remove("on");
      rail.querySelectorAll(".dw-card").forEach(function (c) {
        c.classList.remove("on"); c.setAttribute("aria-expanded", "false");
      });
    }
    function fillExp(d) {
      exp.innerHTML = "";
      exp.classList.add("on");

      var h = el("div", "dw-exph");
      var ht = el("div");
      ht.appendChild(el("b", null, (d.origin || "HNL") + " to " + (d.city || d.dest)));
      var n = (d.dates || []).length;
      ht.appendChild(el("span", null, n + (n === 1 ? " date" : " dates") + " open in the next " + win +
        " days, from " + num(d.miles) + " points one way"));
      h.appendChild(ht);
      var x = el("button", "dw-x", "\u00d7");
      x.type = "button"; x.setAttribute("aria-label", "Close");
      x.addEventListener("click", closeExp);
      h.appendChild(x);
      exp.appendChild(h);

      var grid = el("div", "dw-dates");
      (d.dates || []).forEach(function (t) {
        var c = el("div", "dw-date" + (t.seats > 0 && t.seats <= 2 ? " low" : ""));
        c.appendChild(el("b", null, shortDate(t.date)));
        c.appendChild(el("span", "dw-dpts", num(t.miles)));
        var tags = el("span", "dw-dtags");
        /* seats.aero caps its seat count at 9, so 9 means "9 or more". */
        if (t.seats) tags.appendChild(el("span", null, t.seats >= 9 ? "9+ seats" : (t.seats + (t.seats === 1 ? " seat" : " seats"))));
        if (t.nonstop) tags.appendChild(el("span", "dw-ns", "nonstop"));
        c.appendChild(tags);
        grid.appendChild(c);
      });
      exp.appendChild(grid);

      var foot = el("div", "dw-expf");
      foot.appendChild(el("span", null, "These are the next " + win + " days only. HRT PRO opens the full calendar."));
      var a = el("a", "dw-unlock", "Unlock the full calendar \u2192");
      a.href = "#atmos"; a.setAttribute("data-route", "atmos");
      foot.appendChild(a);
      exp.appendChild(foot);

      exp.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    wrap.appendChild(exp);
    attachNav(rail, nav);
    nudge(rail);

    /* business class: locked, and genuinely empty behind the blur */
    var teasers = feed._teasers || feed.premium_teasers || [];
    if (teasers.length) {
      var pro = el("div", "dw-pro");
      var ph2 = el("div", "dw-pro-h");
      ph2.appendChild(el("span", "dw-pill", "★ HRT PRO"));
      var hasFirst = teasers.some(function (t) { return /first/i.test(t.cabin || ""); });
      ph2.appendChild(el("h3", null, hasFirst ? "Business and first class award space" : "Business class award space"));
      var cities = teasers.map(function (t) { return t.city; }).filter(Boolean);
      ph2.appendChild(el("p", null,
        cities.length
          ? "We track " + (hasFirst ? "premium cabin" : "business class") + " award space to " + cities.join(", ") + ". PRO members see the dates and the points."
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
        lc.appendChild(el("span", null, (t.origin || "HNL") + " → " + (t.dest || "") + " · " + (/first/i.test(t.cabin || "") ? "first class" : "business")));
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

        /* Count what the free wall is actually showing rather than hard coding
           it, so this line cannot drift when ECON_ROUTES changes. */
        var freeDests = (feed.economy || []).length;
        var vs = el("p", "dw-note", "This free wall shows " +
          (freeDests ? freeDests + " destination" + (freeDests === 1 ? "" : "s") : "a sample") +
          " for the next " + win + " days. HRT PRO opens the full calendar: " +
          (sc.pro_days ? sc.pro_days + "+ days ahead" : "the full booking window") +
          " across all " + (sc.pro_destinations || "15") + " destinations on Atmos Rewards, both directions.");
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


  /* =====================================================================
     PRO deal wall. PRO members do not see the sales box; instead they get
     their own wall at the top of the Dashboard and set it up with four taps:
     destinations, cabin, max points and months.

     Data: today it reads the free feed above (economy, next 30 days). When the
     Mac's calendar build publishes PRO_FEED on the gated PRO project, this
     reads that instead and the wall fills out by itself (all destinations,
     the whole booking window, business and first). PRO_FEED contract:
       { updated, hub, window_days,
         deals: [ { origin, dest, city, cabin: "economy"|"business"|"first",
                    image, dates: [ { date, miles, seats, nonstop } ] } ] }
     It is written from the same morning pull: no extra API calls.

     Settings live in this browser (localStorage), so they are per device.
  ===================================================================== */
  var PRO_FEED = "https://hrt-calendar-pro.pages.dev/pro_deals.json";
  var PREF_KEY = "hrtProWall";
  var CABINS = [["economy", "Economy"], ["business", "Business"], ["first", "First"]];
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* Normalize either feed into one list of { dest, city, cabin, image, dates }. */
  function entriesFrom(feed) {
    if (feed && Array.isArray(feed.deals)) {
      return feed.deals.filter(function (d) { return d && d.dest && Array.isArray(d.dates); }).map(function (d) {
        return { origin: d.origin || "HNL", dest: d.dest, city: d.city || d.dest, cabin: String(d.cabin || "economy").toLowerCase(), image: d.image || "", dates: d.dates };
      });
    }
    return ((feed && feed.economy) || []).map(function (d) {
      return { origin: d.origin || "HNL", dest: d.dest, city: d.city || d.dest, cabin: "economy", image: d.image || "", dates: d.dates || [] };
    });
  }

  function readPrefs() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem(PREF_KEY) || "null"); } catch (e) {}
    return migratePrefs(cleanPrefs(p));
  }
  /* Older saved settings picked cities, not routes. Turn those into routes once. */
  function migratePrefs(p) {
    if (!p.routes.length && p.dests.length) {
      var from = p.origins.length ? p.origins : ["HNL"];
      from.forEach(function (o) { p.dests.forEach(function (d) { p.routes.push({ o: o, d: d, cabins: [p.cabin] }); }); });
      p.routes = cleanRoutes(p.routes);
    }
    return p;
  }
  function cleanPrefs(p) {
    p = p && typeof p === "object" ? p : {};
    var strs = function (a, re) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && re.test(x); }).slice(0, 40) : []; };
    return {
      routes: cleanRoutes(p.routes),
      origins: strs(p.origins, /^[A-Z]{3}$/),
      dests: strs(p.dests, /^[A-Z]{3}$/),
      cabin: /^(economy|business|first)$/.test(p.cabin) ? p.cabin : "economy",
      max: typeof p.max === "number" && p.max > 0 && p.max < 1e6 ? p.max : 0,
      months: strs(p.months, /^\d{4}-\d\d$/)
    };
  }
  function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {} }

  /* Apply the member's settings. Pure. Drops past dates, then keeps the dates
     that match, and recounts each card. Cards follow the member's own order of
     picked cities, then the feed's order. */
  function applyPrefs(entries, prefs, today) {
    today = today || hawaiiToday();
    var pick = prefs.dests || [], months = prefs.months || [], from = prefs.origins || [];
    var out = entries.filter(function (e) {
      return e.cabin === prefs.cabin && (!pick.length || pick.indexOf(e.dest) >= 0) && (!from.length || from.indexOf(e.origin) >= 0);
    }).map(function (e, i) {
      var dates = e.dates.filter(function (t) {
        var d = String(t && t.date || "");
        return d >= today && (!prefs.max || (t.miles && t.miles <= prefs.max)) && (!months.length || months.indexOf(d.slice(0, 7)) >= 0);
      });
      if (!dates.length) return null;
      var miles = Math.min.apply(null, dates.map(function (t) { return t.miles || Infinity; }));
      return { origin: e.origin, dest: e.dest, city: e.city, cabin: e.cabin, image: e.image, dates: dates, i: i,
        miles: isFinite(miles) ? miles : 0, count: dates.length, soonest: dates.map(function (t) { return t.date; }).sort()[0],
        nonstop: dates.some(function (t) { return t.nonstop; }) };
    }).filter(Boolean);
    out.sort(function (a, b) {
      var ia = pick.indexOf(a.dest), ib = pick.indexOf(b.dest);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.i - b.i;
    });
    return out;
  }

  /* What the settings panel can offer, from the data itself. Pure. */
  /* Cities, points steps and months follow the chosen cabin and departure
     airports, so Business shows business prices and business months. */
  function choicesFor(entries, today, prefs) {
    today = today || hawaiiToday();
    var cabin = prefs && prefs.cabin, from = (prefs && prefs.origins) || [];
    var cities = [], seen = {}, cab = {}, months = {}, miles = [], origins = [];
    entries.forEach(function (e) {
      if (origins.indexOf(e.origin) < 0) origins.push(e.origin);
      var live = e.dates.some(function (t) { return String(t.date) >= today; });
      if (live) cab[e.cabin] = 1;
      if (cabin && e.cabin !== cabin) return;
      if (from.length && from.indexOf(e.origin) < 0) return;
      if (live && !seen[e.dest]) { seen[e.dest] = 1; cities.push({ dest: e.dest, city: e.city }); }
      e.dates.forEach(function (t) {
        if (String(t.date) < today) return;
        months[String(t.date).slice(0, 7)] = 1;
        if (t.miles) miles.push(t.miles);
      });
    });
    var lo = Math.min.apply(null, miles), hi = Math.max.apply(null, miles);
    var steps = [10000, 12500, 15000, 17500, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 100000, 125000, 150000, 200000, 250000]
      .filter(function (v) { return miles.length && v >= lo && v < hi; });
    return { cities: cities, origins: origins, cabins: cab, months: Object.keys(months).sort(), steps: steps };
  }
  function monthLabel(ym) { return MON[parseInt(ym.slice(5), 10) - 1] + (ym.slice(0, 4) !== hawaiiToday().slice(0, 4) ? " " + ym.slice(2, 4) : ""); }
  function kpts(n) { return n % 1000 ? (n / 1000).toFixed(1) + "k" : n / 1000 + "k"; }


  /* ---------- Route tracking (Oct 17): members pick routes + cabins ---------- */
  var AIRPORT = { HNL: "Honolulu", OGG: "Maui", KOA: "Kona", LIH: "Kauaʻi", ITO: "Hilo" };
  function placeName(code, entries) {
    if (AIRPORT[code]) return AIRPORT[code];
    for (var i = 0; i < entries.length; i++) if (entries[i].dest === code) return entries[i].city;
    return code;
  }
  /* What can be tracked, straight from the data. Pure. */
  function routeChoices(entries, today) {
    today = today || hawaiiToday();
    var origins = [], by = {};
    entries.forEach(function (e) {
      if (origins.indexOf(e.origin) < 0) { origins.push(e.origin); by[e.origin] = []; }
      var row = by[e.origin].filter(function (r) { return r.dest === e.dest; })[0];
      if (!row) { row = { dest: e.dest, city: e.city, cabins: {} }; by[e.origin].push(row); }
      if (e.dates.some(function (t) { return String(t.date) >= today; })) row.cabins[e.cabin] = 1;
    });
    origins.sort(function (a, b) { return (AIRPORT[a] ? 0 : 1) - (AIRPORT[b] ? 0 : 1) || (a < b ? -1 : 1); });
    Object.keys(by).forEach(function (o) { by[o].sort(function (a, b) { return a.city < b.city ? -1 : 1; }); });
    return { origins: origins, byOrigin: by };
  }
  function cleanRoutes(a) {
    if (!Array.isArray(a)) return [];
    var out = [], seen = {};
    a.forEach(function (r) {
      if (!r || !/^[A-Z]{3}$/.test(r.o) || !/^[A-Z]{3}$/.test(r.d) || r.o === r.d) return;
      var k = r.o + r.d; if (seen[k]) return; seen[k] = 1;
      var cabins = (Array.isArray(r.cabins) ? r.cabins : []).filter(function (c) { return /^(economy|business|first)$/.test(c); });
      cabins = CABINS.map(function (c) { return c[0]; }).filter(function (c) { return cabins.indexOf(c) >= 0; });
      var keep = { o: r.o, d: r.d, cabins: cabins.length ? cabins : ["economy"] };
      if (r.nonstop === true) keep.nonstop = true;
      out.push(keep);
    });
    return out.slice(0, 24);
  }
  /* One card per tracked route and cabin, in the member's order. A tracked
     route with no deal dates today still gets a card, so it never vanishes. Pure. */
  function applyRoutes(entries, routes, today) {
    today = today || hawaiiToday();
    var out = [];
    routes.forEach(function (r) {
      r.cabins.forEach(function (cab) {
        var e = entries.filter(function (x) { return x.origin === r.o && x.dest === r.d && x.cabin === cab; })[0];
        var dates = e ? e.dates.filter(function (t) { return String(t && t.date || "") >= today && (!r.nonstop || t.nonstop); }) : [];
        var miles = Math.min.apply(null, dates.map(function (t) { return t.miles || Infinity; }));
        out.push({ origin: r.o, dest: r.d, city: e ? e.city : placeName(r.d, entries), cabin: cab,
          image: e ? e.image : (entries.filter(function (x) { return x.dest === r.d && x.image; })[0] || {}).image || "",
          dates: dates, count: dates.length, none: !dates.length, nonstopOnly: !!r.nonstop,
          miles: isFinite(miles) ? miles : 0, soonest: dates.map(function (t) { return t.date; }).sort()[0],
          nonstop: dates.some(function (t) { return t.nonstop; }) });
      });
    });
    return out;
  }

  var proCss = document.createElement("style");
  proCss.textContent = [
    ".dwp{margin-top:22px;position:relative;border-radius:var(--radius,16px);padding:16px 18px 14px;background:radial-gradient(700px 220px at 92% -30%,rgba(242,184,75,.22),transparent 60%),linear-gradient(120deg,#141b24,#1b2430 55%,#1d3350);border:1px solid rgba(242,184,75,.5);box-shadow:inset 0 3px 0 #f2b84b,0 14px 36px rgba(16,32,54,.18)}",
    ".dwp .dw-head{margin-bottom:8px}.dwp .dw-head h2{color:#fff}.dwp .dw-sub,.dwp .dw-when,.dwp .dwp-sum{color:#bccde0}",
    ".dwp .dw-note{color:#9fb3c8}",
    ".dwp-pill{display:inline-flex;align-items:center;font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#d97040);border-radius:999px;padding:4px 9px}",
    ".dwp .dwp-tune{color:#fff;background:rgba(242,184,75,.14)}",
    ".dwp .dwp-tune[aria-expanded=true]{background:#f2b84b;color:#14202e;border-color:#f2b84b}",
    ".dwp-fold{appearance:none;font:inherit;cursor:pointer;width:36px;height:36px;border-radius:10px;border:1px solid rgba(159,193,212,.35);background:rgba(255,255,255,.06);color:#eaf2f8;display:grid;place-items:center}",
    ".dwp .dw-nav{margin-left:0}.dwp-fold{margin-left:auto}",
    ".dwp-fold:hover{border-color:#f2b84b}.dwp-fold svg{transition:transform .2s}.dwp-fold[aria-expanded=false] svg{transform:rotate(-90deg)}",
    ".dwp.folded .dwp-body{display:none}.dwp.folded{padding-bottom:12px}.dwp.folded .dw-nav,.dwp.folded .dwp-tune{display:none}",
    ".dwp-acc{display:flex;align-items:center;gap:10px;width:100%;appearance:none;font:inherit;cursor:pointer;background:none;border:0;padding:6px 0;color:var(--text);text-align:left;min-height:38px}",
    ".dwp-acc b{font-size:12.5px;flex:0 0 110px}.dwp-acc span{flex:1;font-size:12.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".dwp-acc i{font-style:normal;font-size:12px;color:var(--muted);transition:transform .2s}.dwp-acc[aria-expanded=true] i{transform:rotate(180deg)}",
    ".dwp-panel .dwp-chips{padding:2px 0 8px}",
    ".dwp-panel>.dwp-sec+.dwp-sec{border-top:1px solid var(--line)}",
    ".dwp-cab{position:absolute;left:10px;top:9px;z-index:1;font-size:10.5px;font-weight:800;border-radius:999px;padding:3px 8px;color:#fff;background:rgba(20,27,36,.78)}",
    ".dwp-cab.business{background:#1d3350;color:#f5c75a;box-shadow:inset 0 0 0 1px #f2b84b}.dwp-cab.first{background:linear-gradient(135deg,#f5c75a,#d97040);color:#1a1204}",
    ".dw-card.none{cursor:default;opacity:.92}.dw-card.none .dw-ph{filter:grayscale(.6)}",
    ".dwp-none{font-weight:800;font-size:14px;color:var(--text)}.dwp-none-s{font-size:11.5px;color:var(--muted);line-height:1.4}",
    ".dwp-block{padding:12px 0;display:grid;gap:8px}.dwp-block+.dwp-block{border-top:1px solid var(--line)}",
    ".dwp-block h4{margin:0;font-size:13.5px;font-weight:800;color:var(--text)}",
    ".dwp-hint{margin:0;font-size:12.5px;color:var(--muted)}",
    ".dwp-route{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,#f7f9fb)}",
    ".dwp-rname{display:flex;flex-direction:column;min-width:150px;flex:1}.dwp-rname b{font-size:14px;color:var(--text)}.dwp-rname span{font-size:11.5px;color:var(--muted)}",
    ".dwp-cabs{display:flex;flex-wrap:wrap;gap:6px}",
    ".dwp-chip.dwp-ns{margin-left:6px;border-style:dashed}.dwp-chip.dwp-ns.on{border-style:solid;background:#1f6b45;border-color:#1f6b45;color:#fff}",
    "[data-theme=dark] .dwp-chip.dwp-ns.on{background:#3fce7f;border-color:#3fce7f;color:#0a1a12}",
    ".dw-chip.ns{color:#1c6b40;border-color:color-mix(in srgb,#3fce7f 38%,var(--line))}",
    "@media (max-width:640px){.dwp-chip.dwp-ns{margin-left:0}}",
    ".dwp-rm{appearance:none;font:inherit;cursor:pointer;background:none;border:0;color:var(--muted);font-size:12px;font-weight:700;min-height:36px;padding:0 4px}.dwp-rm:hover{color:var(--peak,#d64541)}",
    ".dwp-addrow{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".dwp-field{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--muted)}",
    ".dwp-field select{font:inherit;font-size:14px;font-weight:600;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:10px;min-height:42px;padding:0 10px}",
    ".dwp-addcab{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.dwp-lbl{font-size:11.5px;font-weight:700;color:var(--muted);margin-right:4px}",
    ".dwp-addbtn{justify-self:start;min-height:40px}.dwp-addbtn:disabled{opacity:.5;cursor:default}",
    ".dwp-ret{appearance:none;font:inherit;cursor:pointer;justify-self:start;background:none;border:0;padding:0;color:var(--coral);font-weight:800;font-size:12.5px;min-height:32px}",
    "@media (max-width:640px){.dwp-addrow{grid-template-columns:1fr}.dwp-rname{min-width:100%}}",

    ".dwp-tune{appearance:none;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(242,184,75,.6);background:linear-gradient(135deg,rgba(245,199,90,.18),rgba(217,112,64,.12));color:var(--text);font-size:12.5px;font-weight:800}",
    ".dwp-tune:hover{border-color:#e8824c}.dwp-tune[aria-expanded=true]{background:#1b2430;color:#fff;border-color:#1b2430}",
    "[data-theme=dark] .dwp-tune[aria-expanded=true]{background:#f2b84b;color:#14202e;border-color:#f2b84b}",
    ".dwp-sum{width:100%;font-size:12px;color:var(--muted);font-weight:600;margin-top:-4px}",
    ".dwp-panel{border:1px solid color-mix(in srgb,#f2b84b 45%,var(--line));border-radius:14px;background:var(--surface);box-shadow:var(--shadow);padding:4px 16px 10px;margin:0 0 12px;display:grid;gap:0}",
    ".dwp-row{display:grid;grid-template-columns:120px 1fr;gap:10px;align-items:start}",
    ".dwp-row>b{font-size:12.5px;color:var(--text);padding-top:8px}",
    ".dwp-row>b small{display:block;font-size:11px;font-weight:600;color:var(--muted);margin-top:2px}",
    ".dwp-chips{display:flex;flex-wrap:wrap;gap:6px}",
    ".dwp-chip{appearance:none;font:inherit;cursor:pointer;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--text);font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:5px}",
    ".dwp-chip:hover:not(:disabled){border-color:#e8824c}",
    ".dwp-chip.on{background:#1b2430;border-color:#1b2430;color:#fff}",
    "[data-theme=dark] .dwp-chip.on{background:#f2b84b;border-color:#f2b84b;color:#14202e}",
    ".dwp-chip:disabled{opacity:.5;cursor:default}",
    ".dwp-chip small{font-size:10px;font-weight:700;opacity:.8}",
    ".dwp-foot{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding-top:10px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}",
    ".dwp-reset{appearance:none;font:inherit;cursor:pointer;margin-left:auto;background:none;border:0;color:var(--coral);font-weight:800;font-size:12.5px;min-height:36px}",
    ".dwp-done{appearance:none;font:inherit;cursor:pointer;min-height:36px;padding:0 16px;border-radius:999px;border:0;background:linear-gradient(135deg,#f5c75a,#d97040);color:#1a1204;font-weight:800;font-size:12.5px}",
    ".dwp-empty{border:1px dashed var(--line);border-radius:var(--radius,16px);padding:18px;text-align:center;color:var(--muted);font-size:13px;background:var(--surface)}",
    ".dwp-empty button{margin-top:8px}",
    ".dwp-cal{margin-left:auto;font-size:12.5px;font-weight:800;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#d97040);border-radius:999px;padding:8px 15px;text-decoration:none;white-space:nowrap}",
    "@media (max-width:640px){.dwp{padding:14px 12px 12px}.dwp-acc b{flex-basis:92px}.dwp-chip{min-height:40px}}"
  ].join("");
  document.head.appendChild(proCss);

  function renderPro(feed, full) {
    var entries = entriesFrom(feed), prefs = readPrefs();
    var win = feed.window_days || 30;
    var wrap = el("div", "dwp pro-only");

    var head = el("div", "dw-head");
    head.appendChild(el("span", "dwp-pill", "★ PRO"));
    head.appendChild(el("h2", null, "Your award deals"));
    var subEl = el("span", "dw-sub", ""); head.appendChild(subEl);
    if (feed.updated) head.appendChild(el("span", "dw-when", "· updated " + shortDate(feed.updated)));
    var tune = el("button", "dwp-tune", "Customize");
    tune.type = "button"; tune.setAttribute("aria-expanded", "false");
    tune.insertAdjacentHTML("afterbegin", '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>');
    head.appendChild(tune);
    var nav = el("div", "dw-nav"); head.appendChild(nav);
    var fold = el("button", "dwp-fold"); fold.type = "button";
    fold.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    head.appendChild(fold);
    var sum = el("div", "dwp-sum"); head.appendChild(sum);
    wrap.appendChild(head);
    var body = el("div", "dwp-body");

    var panel = el("div", "dwp-panel"); panel.hidden = true;
    var rail = el("div", "dw-rail");
    var exp = el("div", "dw-exp");
    var empty = el("div", "dwp-empty"); empty.hidden = true;
    body.appendChild(panel); body.appendChild(rail); body.appendChild(exp); body.appendChild(empty);
    wrap.appendChild(body);
    function setFold(f) {
      wrap.classList.toggle("folded", f);
      fold.setAttribute("aria-expanded", f ? "false" : "true");
      fold.setAttribute("aria-label", f ? "Show your award deals" : "Hide your award deals");
      fold.title = f ? "Show" : "Hide";
      try { localStorage.setItem(PREF_KEY + "Fold", f ? "1" : "0"); } catch (e) {}
    }
    var folded = false; try { folded = localStorage.getItem(PREF_KEY + "Fold") === "1"; } catch (e) {}
    setFold(folded);
    fold.addEventListener("click", function () { setFold(!wrap.classList.contains("folded")); });
    body.appendChild(el("p", "dw-note", full
      ? "From the HRT PRO calendar, refreshed every morning. Availability changes; confirm with the airline before booking."
      : "Showing economy deals for the next " + win + " days. For business, first and the full 270 days, open the Deals Calendar. Availability changes; confirm with the airline before booking."));

    var openKey = null;
    function closeExp() { openKey = null; exp.innerHTML = ""; exp.classList.remove("on");
      rail.querySelectorAll(".dw-card").forEach(function (c) { c.classList.remove("on"); c.setAttribute("aria-expanded", "false"); }); }

    function fillExp(d) {
      exp.innerHTML = ""; exp.classList.add("on");
      var h = el("div", "dw-exph"), ht = el("div");
      ht.appendChild(el("b", null, d.origin + " → " + d.city + ", " + (CAB_NAME[d.cabin] || d.cabin)));
      ht.appendChild(el("span", null, d.count + (d.count === 1 ? " deal date" : " deal dates") + (d.nonstopOnly ? " (nonstop only)" : "") + ", from " + num(d.miles) + " points one way"));
      h.appendChild(ht);
      var x = el("button", "dw-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); x.addEventListener("click", closeExp);
      h.appendChild(x); exp.appendChild(h);
      var grid = el("div", "dw-dates");
      d.dates.forEach(function (t) {
        var c = el("div", "dw-date" + (t.seats > 0 && t.seats <= 2 ? " low" : ""));
        c.appendChild(el("b", null, shortDate(t.date)));
        c.appendChild(el("span", "dw-dpts", num(t.miles)));
        var tags = el("span", "dw-dtags");
        if (t.seats) tags.appendChild(el("span", null, t.seats >= 9 ? "9+ seats" : (t.seats + (t.seats === 1 ? " seat" : " seats"))));
        if (t.nonstop) tags.appendChild(el("span", "dw-ns", "nonstop"));
        c.appendChild(tags); grid.appendChild(c);
      });
      exp.appendChild(grid);
      var foot = el("div", "dw-expf");
      foot.appendChild(el("span", null, "Book on the airline's site. Seats can go fast."));
      var a = el("a", "dwp-cal", "Open the Deals Calendar →");
      a.href = "#atmos"; a.setAttribute("data-route", "atmos"); a.setAttribute("data-cal", "calendar.html");
      foot.appendChild(a); exp.appendChild(foot);
      exp.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    var CAB_NAME = { economy: "Economy", business: "Business", first: "First" };
    function routeLabel(o, d) { return o + " → " + placeName(d, entries) + " (" + d + ")"; }

    function drawCards() {
      closeExp();
      rail.innerHTML = "";
      var tracking = prefs.routes.length > 0;
      var list = tracking ? applyRoutes(entries, prefs.routes)
        : applyPrefs(entries, cleanPrefs({ cabin: "economy" })).slice(0, 12);
      list.forEach(function (d) {
        var card = el(d.none ? "div" : "button", "dw-card" + (d.none ? " none" : ""));
        if (!d.none) {
          card.type = "button"; card.setAttribute("aria-expanded", "false");
          card.addEventListener("click", function () {
            var key = d.origin + d.dest + d.cabin;
            if (openKey === key) { closeExp(); return; }
            openKey = key;
            rail.querySelectorAll(".dw-card").forEach(function (c) { var on = c === card; c.classList.toggle("on", on); c.setAttribute("aria-expanded", on ? "true" : "false"); });
            fillExp(d);
          });
        }
        var ph = el("div", "dw-ph");
        if (d.image) ph.style.backgroundImage = "url('" + String(d.image).replace(/'/g, "%27") + "')";
        ph.appendChild(el("span", "dw-rt", d.origin + " → " + d.dest));
        ph.appendChild(el("span", "dwp-cab " + d.cabin, CAB_NAME[d.cabin] || d.cabin));
        ph.appendChild(el("span", "dw-city", d.city));
        card.appendChild(ph);
        var body = el("div", "dw-body");
        if (d.none) {
          body.appendChild(el("div", "dwp-none", d.nonstopOnly ? "No nonstop deal dates right now" : "No deal dates right now"));
          body.appendChild(el("div", "dwp-none-s", "We check every morning. It shows up here when space opens."));
        } else {
          var pts = el("div", "dw-pts", num(d.miles) + " pts");
          pts.appendChild(el("small", null, "one way, lowest"));
          body.appendChild(pts);
          var meta = el("div", "dw-meta");
          meta.appendChild(el("span", "dw-chip ok", d.count + (d.count === 1 ? " date" : " dates")));
          meta.appendChild(el("span", "dw-chip", "from " + shortDate(d.soonest)));
          if (d.nonstopOnly) meta.appendChild(el("span", "dw-chip ns", "nonstop only"));
          else if (d.nonstop) meta.appendChild(el("span", "dw-chip", "nonstop"));
          body.appendChild(meta);
        }
        card.appendChild(body);
        if (!d.none) card.appendChild(el("span", "dw-more", "See the dates"));
        rail.appendChild(card);
      });
      rail.hidden = !list.length;
      empty.hidden = !!list.length;
      if (!list.length) {
        empty.innerHTML = "";
        empty.appendChild(el("div", null, "No deals to show yet. Pick the routes you want to track."));
        var b = el("button", "dwp-done", "Pick my routes"); b.type = "button";
        b.addEventListener("click", function () { openPanel(true); });
        empty.appendChild(b);
      }
      var n = prefs.routes.length;
      subEl.textContent = tracking ? "Tracking " + n + (n === 1 ? " route" : " routes") : "Top deals today";
      sum.textContent = tracking
        ? prefs.routes.map(function (r) { return r.o + "→" + r.d + " " + r.cabins.map(function (c) { return CAB_NAME[c]; }).join("/") + (r.nonstop ? ", nonstop" : ""); }).join(" · ")
        : "Showing today's best economy deals. Tap Customize to track your own routes.";
      if (rail.scrollLeft) rail.scrollLeft = 0;
    }

    function chip(label, on, onTap, disabled, note) {
      var b = el("button", "dwp-chip" + (on ? " on" : ""), label); b.type = "button";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (note) b.appendChild(el("small", null, note));
      if (disabled) b.disabled = true; else b.addEventListener("click", onTap);
      return b;
    }
    function change(fn) { fn(); prefs = cleanPrefs(prefs); savePrefs(prefs); drawPanel(); drawCards(); }

    var pickFrom = null, pickTo = null, pickCabins = null, pickNonstop = false;
    function drawPanel() {
      var RC = routeChoices(entries);
      panel.innerHTML = "";

      /* 1. the routes they track */
      var mine = el("div", "dwp-block");
      mine.appendChild(el("h4", null, "Your routes"));
      if (!prefs.routes.length) mine.appendChild(el("p", "dwp-hint", "None yet. Add a route below and it shows on your home page every day."));
      prefs.routes.forEach(function (r, idx) {
        var row = el("div", "dwp-route");
        var name = el("div", "dwp-rname"); name.appendChild(el("b", null, r.o + " → " + r.d));
        name.appendChild(el("span", null, placeName(r.o, entries) + " to " + placeName(r.d, entries)));
        row.appendChild(name);
        var cabs = el("div", "dwp-cabs");
        CABINS.forEach(function (c) {
          var on = r.cabins.indexOf(c[0]) >= 0;
          cabs.appendChild(chip(c[1], on, function () { change(function () {
            var rr = prefs.routes[idx]; var k = rr.cabins.indexOf(c[0]);
            if (k >= 0) { if (rr.cabins.length > 1) rr.cabins.splice(k, 1); } else rr.cabins.push(c[0]);
          }); }));
        });
        var ns = chip("Nonstop only", !!r.nonstop, function () { change(function () { var rr = prefs.routes[idx]; if (rr.nonstop) delete rr.nonstop; else rr.nonstop = true; }); });
        ns.classList.add("dwp-ns"); cabs.appendChild(ns);
        row.appendChild(cabs);
        var x = el("button", "dwp-rm", "Remove"); x.type = "button"; x.setAttribute("aria-label", "Stop tracking " + r.o + " to " + r.d);
        x.addEventListener("click", function () { change(function () { prefs.routes.splice(idx, 1); }); });
        row.appendChild(x);
        mine.appendChild(row);
      });
      panel.appendChild(mine);

      /* 2. add a route */
      var add = el("div", "dwp-block dwp-add");
      add.appendChild(el("h4", null, "Add a route"));
      if (!RC.origins.length) { add.appendChild(el("p", "dwp-hint", "Routes appear here once today's deals load.")); }
      else {
        if (RC.origins.indexOf(pickFrom) < 0) pickFrom = RC.origins.indexOf("HNL") >= 0 ? "HNL" : RC.origins[0];
        var dests = RC.byOrigin[pickFrom] || [];
        if (!dests.some(function (d) { return d.dest === pickTo; })) { pickTo = dests.length ? dests[0].dest : null; pickCabins = null; }
        var row2 = el("div", "dwp-addrow");
        function sel(label, opts, val, onPick) {
          var w = el("label", "dwp-field"); w.appendChild(el("span", null, label));
          var s = document.createElement("select");
          opts.forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if (o[0] === val) op.selected = true; s.appendChild(op); });
          s.addEventListener("change", function () { onPick(s.value); });
          w.appendChild(s); return w;
        }
        row2.appendChild(sel("From", RC.origins.map(function (o) { return [o, placeName(o, entries) + " (" + o + ")"]; }), pickFrom,
          function (v) { pickFrom = v; pickTo = null; drawPanel(); }));
        row2.appendChild(sel("To", dests.map(function (d) { return [d.dest, d.city + " (" + d.dest + ")"]; }), pickTo,
          function (v) { pickTo = v; pickCabins = null; drawPanel(); }));
        add.appendChild(row2);
        var info = dests.filter(function (d) { return d.dest === pickTo; })[0];
        if (info) {
          var avail = CABINS.map(function (c) { return c[0]; }).filter(function (c) { return info.cabins[c]; });
          if (!pickCabins) pickCabins = avail.length ? avail.slice() : ["economy"];
          var cr = el("div", "dwp-addcab"); cr.appendChild(el("span", "dwp-lbl", "Cabins"));
          CABINS.forEach(function (c) {
            var on = pickCabins.indexOf(c[0]) >= 0;
            cr.appendChild(chip(c[1], on, function () {
              var k = pickCabins.indexOf(c[0]);
              if (k >= 0) { if (pickCabins.length > 1) pickCabins.splice(k, 1); } else pickCabins.push(c[0]);
              drawPanel();
            }, false, info.cabins[c[0]] ? "" : "no deals now"));
          });
          var nsc = chip("Nonstop only", pickNonstop, function () { pickNonstop = !pickNonstop; drawPanel(); });
          nsc.classList.add("dwp-ns"); cr.appendChild(nsc);
          add.appendChild(cr);
          var have = prefs.routes.some(function (r) { return r.o === pickFrom && r.d === pickTo; });
          var go = el("button", "dwp-done dwp-addbtn", have ? "Already tracking" : "Track " + pickFrom + " → " + pickTo);
          go.type = "button"; if (have) go.disabled = true;
          go.addEventListener("click", function () { var cabs = pickCabins.slice(); pickCabins = cabs; change(function () { prefs.routes.push(pickNonstop ? { o: pickFrom, d: pickTo, cabins: cabs, nonstop: true } : { o: pickFrom, d: pickTo, cabins: cabs }); }); });
          add.appendChild(go);
          var back = (RC.byOrigin[pickTo] || []).some(function (d) { return d.dest === pickFrom; });
          var haveBack = prefs.routes.some(function (r) { return r.o === pickTo && r.d === pickFrom; });
          if (back && !haveBack) {
            var rb = el("button", "dwp-ret", "Also track the return, " + pickTo + " → " + pickFrom); rb.type = "button";
            rb.addEventListener("click", function () {
              var mineR = prefs.routes.filter(function (r) { return r.o === pickFrom && r.d === pickTo; })[0];
              var cabs = (mineR ? mineR.cabins : (pickCabins || ["economy"])).slice();
              var nsr = mineR ? !!mineR.nonstop : pickNonstop;
              change(function () { prefs.routes.push(nsr ? { o: pickTo, d: pickFrom, cabins: cabs, nonstop: true } : { o: pickTo, d: pickFrom, cabins: cabs }); });
            });
            add.appendChild(rb);
          }
        }
      }
      panel.appendChild(add);

      var f = el("div", "dwp-foot");
      f.appendChild(el("span", null, "Saved on this device."));
      var r = el("button", "dwp-reset", "Clear all"); r.type = "button";
      r.addEventListener("click", function () { change(function () { prefs.routes = []; prefs.dests = []; }); });
      var d = el("button", "dwp-done", "Done"); d.type = "button";
      d.addEventListener("click", function () { openPanel(false); });
      f.appendChild(r); f.appendChild(d); panel.appendChild(f);
    }
    function openPanel(on) {
      panel.hidden = !on; tune.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) { drawPanel(); panel.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    }
    tune.addEventListener("click", function () { openPanel(panel.hidden); });

    drawCards();
    attachNav(rail, nav);
    return wrap;
  }

  /* The members-only file, once the Mac publishes it. Same token hand-off as
     the calendar frame. Any failure just means "use the free feed". */
  function proFeed() {
    var t = "";
    try { var ms = window.$memberstackDom; t = ms && ms.getMemberCookie && ms.getMemberCookie() || ""; } catch (e) {}
    if (!t) return Promise.reject(new Error("no token"));
    return fetch(PRO_FEED + "?mst=" + encodeURIComponent(t), { cache: "no-store", credentials: "include" })
      .then(function (r) { if (!r.ok) throw new Error("pro feed " + r.status); return r.json(); })
      .then(function (f) { if (!f || !Array.isArray(f.deals) || !f.deals.length) throw new Error("pro feed empty"); return f; });
  }

  /* ---------- mount ---------- */
  var proMounted = false;
  function mountPro(freeFeed, after) {
    function go() {
      if (proMounted) return;
      if (!document.documentElement.classList.contains("ms-pro")) return;
      proMounted = true;
      function put(feed, full) {
        var n = renderPro(feed, full);
        if (after && after.parentNode) { after.parentNode.insertBefore(n, after); return; }
        var home = document.querySelector("#v-home .content"), top = home && home.querySelector(".toprow");
        if (top && top.parentNode) top.parentNode.insertBefore(n, top.nextSibling); else if (home) home.appendChild(n);
      }
      proFeed().then(function (f) { put(f, true); }, function () { if (freeFeed) put(freeFeed, false); });
    }
    go();
    /* membership is read after this script runs; watch for the PRO class */
    if (!proMounted && window.MutationObserver) {
      var mo = new MutationObserver(function () { go(); if (proMounted) mo.disconnect(); });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
  }

  function mount() {
    var home = document.querySelector("#v-home .content");
    if (!home) return;
    var anchor = home.querySelector(".toprow");

    fetch(FEED, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("feed " + r.status); return r.json(); })
      .then(function (feed) {
        if (!feed) return;
        var fresh = freshen(feed);
        fresh._teasers = teasersFor(feed);
        if (!(fresh.economy || []).length) return; // nothing to show, show nothing
        var node = render(fresh);
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor.nextSibling);
        else home.appendChild(node);
        /* PRO wall, right where the free one sits. Built only for PRO members:
           the free wall is hidden for them by its free-only class. */
        mountPro(feed, node);
      })
      .catch(function (e) {
        // PRO members can still get their wall from the PRO feed.
        mountPro(null, null);
        // Stay silent on the page. A broken feed should never show an error box
        // to a visitor; it just means no wall today.
        if (window.console) console.warn("[dealwall] feed unavailable:", e && e.message);
      });
  }

  window.HRT_DEALWALL = { _test: { freshen: freshen, teasersFor: teasersFor, hawaiiToday: hawaiiToday, entriesFrom: entriesFrom, applyPrefs: applyPrefs, choicesFor: choicesFor, cleanPrefs: cleanPrefs, routeChoices: routeChoices, cleanRoutes: cleanRoutes, applyRoutes: applyRoutes, migratePrefs: migratePrefs } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
