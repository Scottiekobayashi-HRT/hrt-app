/* ---------------------------------------------------------------------------
   atmos-status.js - HRT Atmos Status Planner (free tool)

   Atmos Rewards lets members pick ONE way to earn flight points per calendar
   year: distance, price, or segments. Selections opened 1 Oct 2026 for flights
   from 1 Jan 2027, and the choice can only be changed once a year. Members who
   do nothing stay on distance.

   For Hawaii residents that default is usually wrong. An HNL-OGG hop is about
   100 miles each way, so a round trip earns 200 points by distance and 1,000
   by segment.

   DESIGN NOTE: built for someone who has never heard of status points. Pick a
   traveller type, move two sliders, read one big answer. No jargon on the
   default view; miles, fares and segments live behind "Adjust the details".

   Program rules used (verified Oct 2026):
     tiers    Silver 20,000 / Gold 40,000 / Platinum 80,000 / Titanium 135,000
     distance 1 status point per mile flown
     price    5 status points per dollar of fare, excluding taxes and fees
     segment  500 status points per segment
     bonus    Silver 25%, Gold 50%, Platinum 100%, Titanium 150%, flights only
     cards    Ascent 1 per $3, Summit 1 per $2 plus a 10,000 anniversary bonus.
              Card earning is NOT affected by the earning choice.

   Exposes window.HRT_ATMOS; app.js calls .show() from onShow.status.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var TIERS = [
    { key: "silver",   name: "Silver",   pts: 20000,  bonus: 0.25 },
    { key: "gold",     name: "Gold",     pts: 40000,  bonus: 0.50 },
    { key: "platinum", name: "Platinum", pts: 80000,  bonus: 1.00 },
    { key: "titanium", name: "Titanium", pts: 135000, bonus: 1.50 }
  ];
  var PER_MILE = 1, PER_DOLLAR = 5, PER_SEGMENT = 500;
  var CARDS = {
    none:   { label: "None",   per: 0, anniversary: 0 },
    ascent: { label: "Ascent", per: 3, anniversary: 0 },
    summit: { label: "Summit", per: 2, anniversary: 10000 }
  };

  /* A leg type: typical one-way miles, typical round-trip fare, segments per
     round trip. Editable under "Adjust the details". */
  var LEGS = {
    island: { label: "Inter-island",  miles: 110,  fare: 160, segs: 2 },
    west:   { label: "West Coast",    miles: 2550, fare: 420, segs: 2 },
    far:    { label: "Japan or Australia", miles: 3850, fare: 700, segs: 2 }
  };

  /* Traveller presets. share = how the year's round trips split across legs. */
  var PRESETS = [
    { key: "island", name: "Island hopper",  blurb: "Mostly OGG, KOA, LIH, ITO",
      trips: 14, mix: { island: 1 } },
    { key: "mainland", name: "Mainland a few times", blurb: "LAX, SFO, SEA, LAS",
      trips: 4, mix: { west: 1 } },
    { key: "far", name: "Japan or Australia", blurb: "HND, KIX, SYD",
      trips: 3, mix: { far: 1 } },
    { key: "mix", name: "A bit of everything", blurb: "Islands plus the mainland",
      trips: 10, mix: { island: 0.6, west: 0.3, far: 0.1 } }
  ];

  var ICONS = {
    island: '<path d="M12 21c-4 0-7-1.5-7-1.5M12 21V11M12 11c-3 0-5 1-6 2.5M12 11c3 0 5 1 6 2.5M12 11c-1-2-3-3-5-3M12 11c1-2 3-3 5-3"/>',
    mainland: '<path d="M2 20h20M4 16l5-7 4 3 7-8"/><circle cx="20" cy="4" r="1.6"/>',
    far: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
    mix: '<path d="M4 7h6l4 10h6M4 17h6M18 4l3 3-3 3M18 14l3 3-3 3"/>'
  };

  var PALETTE = { fly: "#d4722f", card: "#0b7fc0" };

  var state = {
    preset: "island",
    trips: 14,
    card: "ascent",
    spend: 1500,
    current: "none",
    advanced: false,
    legs: JSON.parse(JSON.stringify(LEGS))
  };

  /* ---------- helpers ---------- */
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function svg(path, size) {
    var s = '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    var w = document.createElement("span"); w.className = "ap-ic"; w.innerHTML = s; return w;
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function presetFor(k) { for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === k) return PRESETS[i]; return PRESETS[0]; }
  function bonusFor(k) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i].key === k) return TIERS[i].bonus; return 0; }
  function tierFor(p) { var r = null; for (var i = 0; i < TIERS.length; i++) if (p >= TIERS[i].pts) r = TIERS[i]; return r; }
  function nextTier(p) { for (var i = 0; i < TIERS.length; i++) if (p < TIERS[i].pts) return TIERS[i]; return null; }

  /* ---------- the maths ---------- */
  function compute() {
    var p = presetFor(state.preset);
    var b = 1 + bonusFor(state.current);
    var total = Math.max(0, +state.trips || 0);
    var miles = 0, dollars = 0, segments = 0;
    Object.keys(p.mix).forEach(function (k) {
      var n = total * p.mix[k];
      var L = state.legs[k];
      miles    += n * (Math.max(0, +L.miles || 0) * 2);
      dollars  += n * Math.max(0, +L.fare || 0);
      segments += n * Math.max(0, +L.segs || 0);
    });
    var c = CARDS[state.card] || CARDS.none;
    var cardPts = (c.per ? (Math.max(0, +state.spend || 0) * 12) / c.per : 0) + c.anniversary;

    var methods = [
      { key: "distance", name: "Distance", verb: "by distance", rule: "1 point per mile",      fly: miles * PER_MILE * b },
      { key: "price",    name: "Price",    verb: "by price",    rule: "5 points per dollar",   fly: dollars * PER_DOLLAR * b },
      { key: "segment",  name: "Segments", verb: "by segment",  rule: "500 points per flight", fly: segments * PER_SEGMENT * b }
    ];
    methods.forEach(function (m) { m.total = m.fly + cardPts; });
    var sorted = methods.slice().sort(function (a, z) { return z.total - a.total; });
    return { methods: methods, sorted: sorted, best: sorted[0], runnerUp: sorted[1],
             cardPts: cardPts, bonus: b - 1, miles: miles, dollars: dollars, segments: segments };
  }

  /* ---------- pieces ---------- */
  function presetCards() {
    var wrap = el("div", "ap-card");
    wrap.appendChild(el("h3", "ap-q", "1. Which sounds most like you?"));
    var grid = el("div", "ap-presets");
    PRESETS.forEach(function (p) {
      var b = el("button", "ap-p" + (p.key === state.preset ? " on" : ""));
      b.type = "button";
      b.appendChild(svg(ICONS[p.key], 26));
      b.appendChild(el("b", null, p.name));
      b.appendChild(el("span", null, p.blurb));
      b.addEventListener("click", function () {
        state.preset = p.key; state.trips = p.trips; redraw();
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function slider(label, value, min, max, step, suffix, onInput) {
    var w = el("div", "ap-sl");
    var head = el("div", "ap-slh");
    head.appendChild(el("span", "ap-sll", label));
    var val = el("b", "ap-slv", suffix(value));
    head.appendChild(val);
    w.appendChild(head);
    var i = document.createElement("input");
    i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = value;
    i.className = "ap-range";
    i.addEventListener("input", function () { val.textContent = suffix(i.value); onInput(i.value); });
    w.appendChild(i);
    return w;
  }

  function inputsCard() {
    var wrap = el("div", "ap-card");
    wrap.appendChild(el("h3", "ap-q", "2. A couple of quick numbers"));

    wrap.appendChild(slider("Round trips a year", state.trips, 0, 40, 1,
      function (v) { return v + (+v === 1 ? " trip" : " trips"); },
      function (v) { state.trips = v; softRedraw(); }));

    var cw = el("div", "ap-cardsel");
    cw.appendChild(el("span", "ap-sll", "Atmos credit card"));
    var row = el("div", "ap-seg3");
    Object.keys(CARDS).forEach(function (k) {
      var b = el("button", "ap-segb" + (k === state.card ? " on" : ""), CARDS[k].label);
      b.type = "button";
      b.addEventListener("click", function () { state.card = k; redraw(); });
      row.appendChild(b);
    });
    cw.appendChild(row);
    wrap.appendChild(cw);

    if (state.card !== "none") {
      wrap.appendChild(slider("Card spend a month", state.spend, 0, 10000, 250,
        function (v) { return "$" + (+v).toLocaleString("en-US"); },
        function (v) { state.spend = v; softRedraw(); }));
    }

    var adv = el("button", "ap-adv", (state.advanced ? "Hide the details" : "Adjust the details"));
    adv.type = "button";
    adv.addEventListener("click", function () { state.advanced = !state.advanced; redraw(); });
    wrap.appendChild(adv);

    if (state.advanced) {
      var p = presetFor(state.preset);
      var det = el("div", "ap-det");
      det.appendChild(el("p", "ap-note", "Typical numbers for your trips. Change them if yours are different."));
      Object.keys(p.mix).forEach(function (k) {
        var L = state.legs[k];
        var r = el("div", "ap-detrow");
        r.appendChild(el("b", null, L.label));
        var g = el("div", "ap-detg");
        [["Miles each way", "miles"], ["Fare per round trip", "fare"], ["Flights per round trip", "segs"]].forEach(function (f) {
          var lab = el("label", "ap-f");
          lab.appendChild(el("span", "ap-fl", f[0]));
          var inp = document.createElement("input");
          inp.type = "number"; inp.min = 0; inp.value = L[f[1]]; inp.className = "ap-in";
          inp.addEventListener("input", function () { L[f[1]] = inp.value; softRedraw(); });
          lab.appendChild(inp);
          g.appendChild(lab);
        });
        r.appendChild(g);
        det.appendChild(r);
      });
      var st = el("label", "ap-f");
      st.appendChild(el("span", "ap-fl", "Status you already hold"));
      var sel = document.createElement("select"); sel.className = "ap-in";
      var o0 = document.createElement("option"); o0.value = "none"; o0.textContent = "None yet"; sel.appendChild(o0);
      TIERS.forEach(function (t) {
        var o = document.createElement("option"); o.value = t.key;
        o.textContent = t.name + " (+" + Math.round(t.bonus * 100) + "% on flights)";
        if (t.key === state.current) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener("change", function () { state.current = sel.value; redraw(); });
      st.appendChild(sel);
      det.appendChild(st);
      wrap.appendChild(det);
    }
    return wrap;
  }

  function answerCard(r) {
    var wrap = el("div", "ap-card ap-answer");
    wrap.appendChild(el("span", "ap-pill", "Your answer"));
    wrap.appendChild(el("h2", "ap-big", "Earn " + r.best.verb));
    wrap.appendChild(el("p", "ap-bigsub", r.best.rule + ", which gets you " + fmt(r.best.total) + " status points a year."));

    var gap = r.best.total - r.runnerUp.total;
    var dflt = r.methods[0]; // distance is the do-nothing default
    if (r.best.key !== "distance" && r.best.total > dflt.total) {
      wrap.appendChild(el("p", "ap-cost",
        "Doing nothing leaves you on distance and costs you " + fmt(r.best.total - dflt.total) + " points a year."));
    } else if (gap > 0) {
      wrap.appendChild(el("p", "ap-cost", "That is " + fmt(gap) + " more than the next best option."));
    }

    var reached = tierFor(r.best.total), nxt = nextTier(r.best.total);
    var lad = el("div", "ap-ladder");
    TIERS.forEach(function (t) {
      var hit = r.best.total >= t.pts;
      var b = el("div", "ap-badge" + (hit ? " hit" : ""));
      b.appendChild(el("i", "ap-bdot", hit ? "✓" : ""));
      b.appendChild(el("b", null, t.name));
      b.appendChild(el("span", null, fmt(t.pts)));
      lad.appendChild(b);
    });
    wrap.appendChild(lad);
    wrap.appendChild(el("p", "ap-tierline", reached
      ? "That reaches " + reached.name + (nxt ? ", and you are " + fmt(nxt.pts - r.best.total) + " points short of " + nxt.name + "." : ", the top tier.")
      : "That is " + fmt(TIERS[0].pts - r.best.total) + " points short of Silver, the first tier."));
    return wrap;
  }

  function compareCard(r) {
    var wrap = el("div", "ap-card");
    wrap.appendChild(el("h3", "ap-q", "How the three compare"));
    var max = Math.max.apply(null, r.methods.map(function (m) { return m.total; })) || 1;
    var legend = el("div", "ap-legend");
    [["fly", "From flying"], ["card", "From card spend"]].forEach(function (p) {
      var i = el("span", "ap-lg"); var sw = el("i", "ap-sw"); sw.style.background = PALETTE[p[0]];
      i.appendChild(sw); i.appendChild(el("span", null, p[1])); legend.appendChild(i);
    });
    wrap.appendChild(legend);
    var rows = el("div", "ap-bars");
    r.methods.forEach(function (m) {
      var row = el("div", "ap-bar" + (m.key === r.best.key ? " best" : ""));
      row.appendChild(el("div", "ap-barl", m.name));
      var tr = el("div", "ap-track");
      var f = el("i", "ap-seg fly"); f.style.width = (m.fly / max * 100) + "%";
      f.title = "From flying: " + fmt(m.fly) + " points";
      var c = el("i", "ap-seg card"); c.style.width = (r.cardPts / max * 100) + "%";
      c.title = "From card spend: " + fmt(r.cardPts) + " points";
      tr.appendChild(f); tr.appendChild(c); row.appendChild(tr);
      row.appendChild(el("div", "ap-barv", fmt(m.total)));
      rows.appendChild(row);
    });
    wrap.appendChild(rows);
    return wrap;
  }

  /* The teaching graphic: why a flat 500 changes everything on short hops. */
  function explainCard() {
    var wrap = el("div", "ap-card ap-explain");
    wrap.appendChild(el("h3", "ap-q", "Why the choice matters"));
    wrap.appendChild(el("p", "ap-note", "Segments pay the same 500 points whether you fly 20 minutes or 9 hours. That is what makes short island hops so valuable."));
    var ex = [
      { name: "HNL to OGG", sub: "about 100 miles", miles: 100, fare: 80 },
      { name: "HNL to Tokyo", sub: "about 3,850 miles", miles: 3850, fare: 350 }
    ];
    var g = el("div", "ap-ex");
    ex.forEach(function (f) {
      var vals = [
        { k: "Distance", v: f.miles * PER_MILE },
        { k: "Price",    v: f.fare * PER_DOLLAR },
        { k: "Segments", v: PER_SEGMENT }
      ];
      var top = Math.max.apply(null, vals.map(function (v) { return v.v; }));
      var cc = el("div", "ap-exc");
      var h = el("div", "ap-exh");
      h.appendChild(svg('<path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" fill="currentColor" stroke="none"/>', 16));
      var ht = el("div");
      ht.appendChild(el("b", null, f.name));
      ht.appendChild(el("span", "ap-exs", f.sub + ", one way"));
      h.appendChild(ht);
      cc.appendChild(h);
      vals.forEach(function (v) {
        var r = el("div", "ap-exr");
        r.appendChild(el("span", "ap-exk", v.k));
        var t = el("div", "ap-extr");
        var b = el("i"); b.style.width = (v.v / top * 100) + "%";
        if (v.k === "Segments") b.className = "hi";
        t.appendChild(b);
        r.appendChild(t);
        r.appendChild(el("span", "ap-exv", fmt(v.v)));
        cc.appendChild(r);
      });
      g.appendChild(cc);
    });
    wrap.appendChild(g);
    wrap.appendChild(el("p", "ap-note", "Points shown are for one flight, before any status bonus. A short hop earns 5 times more on segments than on distance."));
    return wrap;
  }

  function footerCard(r) {
    var wrap = el("div", "ap-card");
    var ul = el("ul", "ap-list");
    if (r.cardPts > 0) ul.appendChild(el("li", null, "Your card adds " + fmt(r.cardPts) + " points, and that part is the same whichever option you pick."));
    if (r.bonus > 0) ul.appendChild(el("li", null, "Your current status adds " + Math.round(r.bonus * 100) + "% on flights, already counted above."));
    ul.appendChild(el("li", null, "You can change your choice once per calendar year. Members who do nothing stay on distance."));
    wrap.appendChild(ul);
    wrap.appendChild(el("p", "ap-note", "Estimates for planning only, based on published Atmos Rewards rates as of October 2026. Taxes and fees do not earn on the price option. Confirm current rules with Alaska before deciding."));
    return wrap;
  }

  /* ---------- render ---------- */
  var host = null;
  function paint() {
    var r = compute();
    host.innerHTML = "";
    var grid = el("div", "ap-grid");
    var L = el("div", "ap-col");
    L.appendChild(presetCards());
    L.appendChild(inputsCard());
    var R = el("div", "ap-col");
    R.appendChild(answerCard(r));
    R.appendChild(compareCard(r));
    R.appendChild(explainCard());
    R.appendChild(footerCard(r));
    grid.appendChild(L); grid.appendChild(R);
    host.appendChild(grid);
  }
  function redraw() { if (host) paint(); }
  /* Sliders must not lose focus mid-drag, so only the right column repaints. */
  var softTimer = null;
  function softRedraw() {
    if (!host) return;
    clearTimeout(softTimer);
    softTimer = setTimeout(function () {
      var r = compute();
      var col = host.querySelectorAll(".ap-col")[1];
      if (!col) return paint();
      col.innerHTML = "";
      col.appendChild(answerCard(r));
      col.appendChild(compareCard(r));
      col.appendChild(explainCard());
      col.appendChild(footerCard(r));
    }, 40);
  }

  function styles() {
    if (document.getElementById("ap-css")) return;
    var s = document.createElement("style"); s.id = "ap-css";
    s.textContent = [
      ".ap-grid{display:grid;grid-template-columns:minmax(280px,360px) 1fr;gap:16px;align-items:start}",
      "@media (max-width:920px){.ap-grid{grid-template-columns:1fr}}",
      ".ap-card{border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);padding:16px;margin-bottom:14px}",
      ".ap-q{margin:0 0 11px;font-size:15px;color:var(--text)}",
      ".ap-note{margin:0 0 10px;font-size:11.5px;color:var(--muted);line-height:1.5}",
      ".ap-ic{display:inline-flex;color:var(--coral)}",
      /* presets */
      ".ap-presets{display:grid;grid-template-columns:1fr 1fr;gap:9px}",
      ".ap-p{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;font:inherit;cursor:pointer;padding:12px 11px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface-2,#f7f9fb);color:var(--text)}",
      ".ap-p b{font-size:13px;line-height:1.25}",
      ".ap-p span{font-size:10.5px;color:var(--muted);font-weight:600;line-height:1.3}",
      ".ap-p:hover{border-color:var(--coral)}",
      ".ap-p.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 10%,var(--surface));box-shadow:0 0 0 1px var(--coral) inset}",
      /* sliders */
      ".ap-sl{margin-bottom:14px}",
      ".ap-slh{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}",
      ".ap-sll{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}",
      ".ap-slv{font-size:15px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums}",
      ".ap-range{width:100%;accent-color:var(--coral);height:22px}",
      ".ap-cardsel{margin-bottom:14px}",
      ".ap-seg3{display:flex;gap:6px;margin-top:5px}",
      ".ap-segb{flex:1;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:8px 6px;border-radius:9px;border:1.5px solid var(--line);background:var(--surface);color:var(--text)}",
      ".ap-segb.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 12%,var(--surface))}",
      ".ap-adv{font:inherit;font-size:12px;font-weight:700;color:var(--muted);background:none;border:0;padding:4px 0;cursor:pointer;text-decoration:underline}",
      ".ap-adv:hover{color:var(--coral)}",
      ".ap-det{margin-top:10px;padding-top:11px;border-top:1px solid var(--line)}",
      ".ap-detrow{margin-bottom:11px}",
      ".ap-detrow>b{display:block;font-size:12.5px;margin-bottom:5px;color:var(--text)}",
      ".ap-detg{display:grid;grid-template-columns:1fr 1fr;gap:7px}",
      ".ap-f{display:flex;flex-direction:column;gap:3px}",
      ".ap-fl{font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}",
      ".ap-in{font:inherit;font-size:13px;font-weight:700;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 8px;width:100%;box-sizing:border-box}",
      /* the answer */
      ".ap-answer{background:linear-gradient(130deg,#0e1b2c 0%,#16294a 70%,#22304a 100%);border-color:rgba(242,184,75,.45)}",
      ".ap-answer .ap-pill{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:4px 10px}",
      ".ap-answer .ap-big{margin:10px 0 4px;color:#fff;font-size:30px;line-height:1.1}",
      "@media (max-width:560px){.ap-answer .ap-big{font-size:24px}}",
      ".ap-answer .ap-bigsub{margin:0;color:#dce6f1;font-size:14px}",
      ".ap-answer .ap-cost{margin:11px 0 0;color:#f5c75a;font-size:13.5px;font-weight:700}",
      ".ap-answer .ap-tierline{margin:12px 0 0;color:#c7d4e2;font-size:12.5px}",
      ".ap-ladder{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:16px}",
      ".ap-badge{text-align:center;padding:9px 4px;border-radius:11px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05)}",
      ".ap-badge b{display:block;font-size:11.5px;color:#9fb2c7;margin-top:3px}",
      ".ap-badge span{display:block;font-size:10px;color:#7c8ea3;font-variant-numeric:tabular-nums}",
      ".ap-bdot{display:block;width:17px;height:17px;line-height:17px;border-radius:50%;margin:0 auto;background:rgba(255,255,255,.1);color:transparent;font-size:10px;font-style:normal;font-weight:800}",
      ".ap-badge.hit{border-color:rgba(242,184,75,.55);background:rgba(242,184,75,.12)}",
      ".ap-badge.hit .ap-bdot{background:linear-gradient(135deg,#f5c75a,#e8824c);color:#1a1204}",
      ".ap-badge.hit b{color:#fff}",
      ".ap-badge.hit span{color:#f5c75a}",
      /* compare */
      ".ap-legend{display:flex;gap:14px;margin:-2px 0 11px}",
      ".ap-lg{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--muted)}",
      ".ap-sw{width:10px;height:10px;border-radius:3px;display:inline-block}",
      ".ap-bars{display:flex;flex-direction:column;gap:9px}",
      ".ap-bar{display:grid;grid-template-columns:104px 1fr 70px;gap:10px;align-items:center}",
      ".ap-barl{font-size:12.5px;font-weight:700;color:var(--text)}",
      ".ap-bar.best .ap-barl:after{content:'Best';display:inline-block;margin-left:6px;font-size:9px;font-weight:800;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:1px 6px}",
      ".ap-track{display:flex;gap:2px;height:20px}",
      ".ap-seg{display:block;height:100%;border-radius:0 4px 4px 0;min-width:2px}",
      ".ap-seg:first-child{border-radius:4px 0 0 4px}",
      ".ap-seg.fly{background:" + PALETTE.fly + "}",
      ".ap-seg.card{background:" + PALETTE.card + "}",
      ".ap-barv{text-align:right;font-weight:800;font-size:14px;color:var(--text);font-variant-numeric:tabular-nums}",
      /* explainer */
      ".ap-ex{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:4px 0 10px}",
      "@media (max-width:620px){.ap-ex{grid-template-columns:1fr}.ap-bar{grid-template-columns:70px 1fr 62px}}",
      ".ap-exc{border:1px solid var(--line);border-radius:12px;padding:11px;background:var(--surface-2,#f7f9fb)}",
      ".ap-exh{display:flex;gap:8px;align-items:flex-start;margin-bottom:9px}",
      ".ap-exh b{display:block;font-size:12.5px;color:var(--text)}",
      ".ap-exs{display:block;font-size:10.5px;color:var(--muted);font-weight:600}",
      ".ap-exr{display:grid;grid-template-columns:58px 1fr 42px;gap:7px;align-items:center;margin-bottom:5px}",
      ".ap-exk{font-size:10.5px;font-weight:700;color:var(--muted)}",
      ".ap-extr{height:12px;background:var(--line);border-radius:4px;overflow:hidden}",
      ".ap-extr i{display:block;height:100%;border-radius:4px;background:var(--muted);opacity:.55}",
      ".ap-extr i.hi{background:" + PALETTE.fly + ";opacity:1}",
      ".ap-exv{font-size:11px;font-weight:800;color:var(--text);text-align:right;font-variant-numeric:tabular-nums}",
      ".ap-list{margin:0 0 10px;padding-left:17px;font-size:12.5px;color:var(--text);line-height:1.55}",
      ".ap-list li{margin-bottom:6px}"
    ].join("");
    document.head.appendChild(s);
  }

  window.HRT_ATMOS = {
    _test: { compute: compute, tierFor: tierFor, state: state, PRESETS: PRESETS },
    show: function () {
      styles();
      host = document.getElementById("as-host");
      if (host && !host.getAttribute("data-ready")) { host.setAttribute("data-ready", "1"); paint(); }
    }
  };
})();
