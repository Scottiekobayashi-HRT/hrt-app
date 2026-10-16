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
        lc.appendChild(el("span", null, (t.origin || "HNL") + "–" + (t.dest || "") + " · " + (/first/i.test(t.cabin || "") ? "first class" : "business")));
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
    return cleanPrefs(p);
  }
  function cleanPrefs(p) {
    p = p && typeof p === "object" ? p : {};
    var strs = function (a, re) { return Array.isArray(a) ? a.filter(function (x) { return typeof x === "string" && re.test(x); }).slice(0, 40) : []; };
    return {
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
    var pick = prefs.dests || [], months = prefs.months || [];
    var out = entries.filter(function (e) {
      return e.cabin === prefs.cabin && (!pick.length || pick.indexOf(e.dest) >= 0);
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
  function choicesFor(entries, today) {
    today = today || hawaiiToday();
    var cities = [], seen = {}, cab = {}, months = {}, miles = [];
    entries.forEach(function (e) {
      if (!seen[e.dest]) { seen[e.dest] = 1; cities.push({ dest: e.dest, city: e.city }); }
      e.dates.forEach(function (t) {
        if (String(t.date) < today) return;
        cab[e.cabin] = 1; months[String(t.date).slice(0, 7)] = 1;
        if (t.miles) miles.push(t.miles);
      });
    });
    var lo = Math.min.apply(null, miles), hi = Math.max.apply(null, miles);
    var steps = [10000, 12500, 15000, 17500, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 100000]
      .filter(function (v) { return miles.length && v >= lo && v < hi; });
    return { cities: cities, cabins: cab, months: Object.keys(months).sort(), steps: steps };
  }
  function monthLabel(ym) { return MON[parseInt(ym.slice(5), 10) - 1] + (ym.slice(0, 4) !== hawaiiToday().slice(0, 4) ? " " + ym.slice(2, 4) : ""); }
  function kpts(n) { return n % 1000 ? (n / 1000).toFixed(1) + "k" : n / 1000 + "k"; }

  var proCss = document.createElement("style");
  proCss.textContent = [
    ".dwp{margin-top:22px}",
    ".dwp-tune{appearance:none;font:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(242,184,75,.6);background:linear-gradient(135deg,rgba(245,199,90,.18),rgba(217,112,64,.12));color:var(--text);font-size:12.5px;font-weight:800}",
    ".dwp-tune:hover{border-color:#e8824c}.dwp-tune[aria-expanded=true]{background:#1b2430;color:#fff;border-color:#1b2430}",
    "[data-theme=dark] .dwp-tune[aria-expanded=true]{background:#f2b84b;color:#14202e;border-color:#f2b84b}",
    ".dwp-sum{width:100%;font-size:12px;color:var(--muted);font-weight:600;margin-top:-4px}",
    ".dwp-panel{border:1px solid color-mix(in srgb,#f2b84b 45%,var(--line));border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);padding:14px 16px 12px;margin:0 0 12px;display:grid;gap:12px}",
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
    "@media (max-width:640px){.dwp-row{grid-template-columns:1fr;gap:6px}.dwp-row>b{padding-top:0}.dwp-chip{min-height:40px}}"
  ].join("");
  document.head.appendChild(proCss);

  function renderPro(feed, full) {
    var entries = entriesFrom(feed), prefs = readPrefs();
    var win = feed.window_days || 30;
    var wrap = el("div", "dwp pro-only");

    var head = el("div", "dw-head");
    head.appendChild(el("h2", null, "Your award deals"));
    head.appendChild(el("span", "dw-sub", (feed.hub || "HNL") + " departures"));
    if (feed.updated) head.appendChild(el("span", "dw-when", "· updated " + shortDate(feed.updated)));
    var tune = el("button", "dwp-tune", "Customize");
    tune.type = "button"; tune.setAttribute("aria-expanded", "false");
    tune.insertAdjacentHTML("afterbegin", '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>');
    head.appendChild(tune);
    var nav = el("div", "dw-nav"); head.appendChild(nav);
    var sum = el("div", "dwp-sum"); head.appendChild(sum);
    wrap.appendChild(head);

    var panel = el("div", "dwp-panel"); panel.hidden = true;
    var rail = el("div", "dw-rail");
    var exp = el("div", "dw-exp");
    var empty = el("div", "dwp-empty"); empty.hidden = true;
    wrap.appendChild(panel); wrap.appendChild(rail); wrap.appendChild(exp); wrap.appendChild(empty);
    wrap.appendChild(el("p", "dw-note", full
      ? "From the HRT PRO calendar, refreshed every morning. Availability changes; confirm with the airline before booking."
      : "Showing economy for the next " + win + " days for now. Business and first class, and the full booking window, are on the way. Availability changes; confirm with the airline before booking."));

    var openKey = null;
    function closeExp() { openKey = null; exp.innerHTML = ""; exp.classList.remove("on");
      rail.querySelectorAll(".dw-card").forEach(function (c) { c.classList.remove("on"); c.setAttribute("aria-expanded", "false"); }); }

    function fillExp(d) {
      exp.innerHTML = ""; exp.classList.add("on");
      var h = el("div", "dw-exph"), ht = el("div");
      ht.appendChild(el("b", null, d.origin + " to " + d.city + (d.cabin !== "economy" ? ", " + d.cabin : "")));
      ht.appendChild(el("span", null, d.count + (d.count === 1 ? " date matches" : " dates match") + " your settings, from " + num(d.miles) + " points one way"));
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

    function drawCards() {
      closeExp();
      rail.innerHTML = "";
      var list = applyPrefs(entries, prefs);
      list.forEach(function (d) {
        var card = el("button", "dw-card"); card.type = "button"; card.setAttribute("aria-expanded", "false");
        card.addEventListener("click", function () {
          var key = d.dest + d.cabin;
          if (openKey === key) { closeExp(); return; }
          openKey = key;
          rail.querySelectorAll(".dw-card").forEach(function (c) { var on = c === card; c.classList.toggle("on", on); c.setAttribute("aria-expanded", on ? "true" : "false"); });
          fillExp(d);
        });
        var ph = el("div", "dw-ph");
        if (d.image) ph.style.backgroundImage = "url('" + String(d.image).replace(/'/g, "%27") + "')";
        ph.appendChild(el("span", "dw-rt", d.origin + "–" + d.dest));
        ph.appendChild(el("span", "dw-city", d.city));
        card.appendChild(ph);
        var body = el("div", "dw-body");
        var pts = el("div", "dw-pts", num(d.miles) + " pts");
        pts.appendChild(el("small", null, "one way, " + d.cabin));
        body.appendChild(pts);
        var meta = el("div", "dw-meta");
        meta.appendChild(el("span", "dw-chip ok", d.count + (d.count === 1 ? " date" : " dates")));
        meta.appendChild(el("span", "dw-chip", "from " + shortDate(d.soonest)));
        if (d.nonstop) meta.appendChild(el("span", "dw-chip", "nonstop"));
        body.appendChild(meta); card.appendChild(body);
        card.appendChild(el("span", "dw-more", "See the dates"));
        rail.appendChild(card);
      });
      rail.hidden = !list.length;
      empty.hidden = !!list.length;
      if (!list.length) {
        empty.innerHTML = "";
        empty.appendChild(el("div", null, "No dates match your settings right now. Try a higher points limit, another month, or more cities."));
        var b = el("button", "dwp-done", "Change settings"); b.type = "button";
        b.addEventListener("click", function () { openPanel(true); });
        empty.appendChild(b);
      }
      var C = choicesFor(entries);
      var cab = CABINS.filter(function (c) { return c[0] === prefs.cabin; })[0][1];
      sum.textContent = cab + ", " + (prefs.dests.length ? prefs.dests.length + (prefs.dests.length === 1 ? " city" : " cities") : "all cities") +
        ", " + (prefs.max ? "up to " + num(prefs.max) + " pts" : "any points") +
        ", " + (prefs.months.length ? prefs.months.map(monthLabel).join(", ") : (C.months.length > 1 ? monthLabel(C.months[0]) + " to " + monthLabel(C.months[C.months.length - 1]) : "next " + win + " days"));
      if (rail.scrollLeft) rail.scrollLeft = 0;
    }

    function chip(label, on, onTap, disabled, note) {
      var b = el("button", "dwp-chip" + (on ? " on" : ""), label); b.type = "button";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (note) b.appendChild(el("small", null, note));
      if (disabled) b.disabled = true; else b.addEventListener("click", onTap);
      return b;
    }
    function row(title, hint, kids) {
      var r = el("div", "dwp-row"), t = el("b", null, title);
      if (hint) t.appendChild(el("small", null, hint));
      var c = el("div", "dwp-chips"); kids.forEach(function (k) { c.appendChild(k); });
      r.appendChild(t); r.appendChild(c); return r;
    }
    function change(fn) { fn(); prefs = cleanPrefs(prefs); savePrefs(prefs); drawPanel(); drawCards(); }
    function toggle(arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }

    function drawPanel() {
      var C = choicesFor(entries);
      panel.innerHTML = "";
      panel.appendChild(row("Destinations", "Tap the ones you want", [chip("All", !prefs.dests.length, function () { change(function () { prefs.dests = []; }); })]
        .concat(C.cities.map(function (c) { return chip(c.city, prefs.dests.indexOf(c.dest) >= 0, function () { change(function () { toggle(prefs.dests, c.dest); }); }); }))));
      panel.appendChild(row("Cabin", "", CABINS.map(function (c) {
        var has = !!C.cabins[c[0]];
        return chip(c[1], prefs.cabin === c[0], function () { change(function () { prefs.cabin = c[0]; }); }, !has && prefs.cabin !== c[0], has ? "" : "soon");
      })));
      panel.appendChild(row("Max points", "One way", [chip("Any", !prefs.max, function () { change(function () { prefs.max = 0; }); })]
        .concat(C.steps.map(function (v) { return chip(kpts(v), prefs.max === v, function () { change(function () { prefs.max = v; }); }); }))));
      panel.appendChild(row("When", "Pick months", [chip("Any time", !prefs.months.length, function () { change(function () { prefs.months = []; }); })]
        .concat(C.months.map(function (m) { return chip(monthLabel(m), prefs.months.indexOf(m) >= 0, function () { change(function () { toggle(prefs.months, m); }); }); }))));
      var f = el("div", "dwp-foot");
      f.appendChild(el("span", null, "Saved on this device. Changes show right away."));
      var r = el("button", "dwp-reset", "Reset"); r.type = "button";
      r.addEventListener("click", function () { change(function () { prefs = cleanPrefs(null); }); });
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
        if (after.parentNode) after.parentNode.insertBefore(n, after);
      }
      proFeed().then(function (f) { put(f, true); }, function () { put(freeFeed, false); });
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
        // Stay silent on the page. A broken feed should never show an error box
        // to a visitor; it just means no wall today.
        if (window.console) console.warn("[dealwall] feed unavailable:", e && e.message);
      });
  }

  window.HRT_DEALWALL = { _test: { freshen: freshen, teasersFor: teasersFor, hawaiiToday: hawaiiToday, entriesFrom: entriesFrom, applyPrefs: applyPrefs, choicesFor: choicesFor, cleanPrefs: cleanPrefs } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
