/* ---------------------------------------------------------------------------
   atmos-status.js - HRT Atmos Status Planner (free tool)

   Atmos Rewards lets members pick ONE way to earn flight points for the year:
   by distance, by price, or by segment. The choice can only be changed once a
   calendar year. Selections opened 1 Oct 2026 and apply to flights from
   1 Jan 2027. Members who do nothing stay on distance.

   For Hawaii residents that default is usually the wrong one. An HNL-OGG hop is
   about 100 miles each way, so distance pays 200 points for a round trip while
   segments pay 1,000. This tool shows all three side by side and names the
   winner for how YOU actually fly.

   Program rules used (verified Oct 2026):
     tiers        Silver 20,000 / Gold 40,000 / Platinum 80,000 / Titanium 135,000
     distance     1 status point per mile flown
     price        5 status points per dollar of fare, excluding taxes and fees
     segment      500 status points per segment
     elite bonus  Silver 25%, Gold 50%, Platinum 100%, Titanium 150%, on flights only
     cards        Ascent 1 point per $3, Summit 1 per $2 plus a 10,000 anniversary
                  bonus. Card earning is NOT affected by the earning choice.

   Chart colours are validated for colour-blind separation and contrast in both
   light and dark mode. Do not swap them without re-validating.

   Exposes window.HRT_ATMOS; app.js calls .show() from onShow.status.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  /* ---------- program constants ---------- */
  var TIERS = [
    { key: "silver",   name: "Silver",   pts: 20000,  bonus: 0.25 },
    { key: "gold",     name: "Gold",     pts: 40000,  bonus: 0.50 },
    { key: "platinum", name: "Platinum", pts: 80000,  bonus: 1.00 },
    { key: "titanium", name: "Titanium", pts: 135000, bonus: 1.50 }
  ];
  var PTS_PER_MILE = 1;
  var PTS_PER_DOLLAR = 5;
  var PTS_PER_SEGMENT = 500;
  var CARDS = {
    none:   { label: "No Atmos card",      per: 0, anniversary: 0 },
    ascent: { label: "Atmos Ascent / Business", per: 3, anniversary: 0 },
    summit: { label: "Atmos Summit",       per: 2, anniversary: 10000 }
  };

  /* Trip rows. Miles and fares are editable; these are starting points, not
     promises. Segments default to 2 for a nonstop round trip. */
  var DEFAULT_TRIPS = [
    { id: "island",  label: "Inter-island",        hint: "HNL to OGG, KOA, LIH, ITO", trips: 6, miles: 110,  fare: 160,  segs: 2 },
    { id: "west",    label: "West Coast",          hint: "HNL to LAX, SFO, SEA, LAS", trips: 2, miles: 2550, fare: 420,  segs: 2 },
    { id: "japan",   label: "Japan or long haul",  hint: "HNL to HND, KIX, SYD",      trips: 1, miles: 3850, fare: 700,  segs: 2 }
  ];

  var PALETTE = { fly: "#d4722f", card: "#0b7fc0" };

  /* ---------- state ---------- */
  var state = {
    trips: DEFAULT_TRIPS.map(function (t) { return Object.assign({}, t); }),
    card: "ascent",
    spend: 1500,        // per month
    current: "none",    // current elite tier, drives the flight bonus
    table: false
  };

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function bonusFor(key) {
    for (var i = 0; i < TIERS.length; i++) if (TIERS[i].key === key) return TIERS[i].bonus;
    return 0;
  }
  function tierFor(pts) {
    var reached = null;
    for (var i = 0; i < TIERS.length; i++) if (pts >= TIERS[i].pts) reached = TIERS[i];
    return reached;
  }
  function nextTier(pts) {
    for (var i = 0; i < TIERS.length; i++) if (pts < TIERS[i].pts) return TIERS[i];
    return null;
  }

  /* ---------- the maths ---------- */
  function compute() {
    var b = 1 + bonusFor(state.current);
    var miles = 0, dollars = 0, segments = 0;
    state.trips.forEach(function (t) {
      var n = Math.max(0, +t.trips || 0);
      miles    += n * (Math.max(0, +t.miles || 0) * 2);   // round trip
      dollars  += n * Math.max(0, +t.fare || 0);
      segments += n * Math.max(0, +t.segs || 0);
    });

    var card = CARDS[state.card] || CARDS.none;
    var cardPts = card.per ? (Math.max(0, +state.spend || 0) * 12) / card.per : 0;
    cardPts += card.anniversary;

    var methods = [
      { key: "distance", name: "By distance", sub: "1 point per mile",        fly: miles * PTS_PER_MILE * b,        detail: fmt(miles) + " miles flown" },
      { key: "price",    name: "By price",    sub: "5 points per dollar",     fly: dollars * PTS_PER_DOLLAR * b,    detail: "$" + fmt(dollars) + " in fares" },
      { key: "segment",  name: "By segment",  sub: "500 points per segment",  fly: segments * PTS_PER_SEGMENT * b,  detail: fmt(segments) + " segments" }
    ];
    methods.forEach(function (m) { m.total = m.fly + cardPts; });

    var best = methods.slice().sort(function (a, c) { return c.total - a.total; })[0];
    return { methods: methods, cardPts: cardPts, best: best, bonus: b - 1,
             totals: { miles: miles, dollars: dollars, segments: segments } };
  }

  /* ---------- rendering ---------- */
  var host = null;

  function field(label, node, hint) {
    var w = el("label", "as-f");
    w.appendChild(el("span", "as-fl", label));
    w.appendChild(node);
    if (hint) w.appendChild(el("span", "as-fh", hint));
    return w;
  }
  function numInput(value, onChange, min, step) {
    var i = document.createElement("input");
    i.type = "number"; i.value = value; i.min = (min == null ? 0 : min); i.step = step || 1;
    i.className = "as-in";
    i.addEventListener("input", function () { onChange(i.value); });
    return i;
  }

  function renderInputs(wrap) {
    var card = el("div", "as-card");
    card.appendChild(el("h3", "as-h", "How do you fly in a year?"));
    card.appendChild(el("p", "as-sub", "Round trips, not one way. Change the miles and fares to match your own trips."));

    var grid = el("div", "as-trips");
    state.trips.forEach(function (t) {
      var row = el("div", "as-trip");
      var head = el("div", "as-trip-h");
      head.appendChild(el("b", null, t.label));
      head.appendChild(el("span", "as-fh", t.hint));
      row.appendChild(head);

      var ins = el("div", "as-trip-in");
      ins.appendChild(field("Round trips", numInput(t.trips, function (v) { t.trips = v; redraw(); })));
      ins.appendChild(field("Miles each way", numInput(t.miles, function (v) { t.miles = v; redraw(); })));
      ins.appendChild(field("Fare per trip", numInput(t.fare, function (v) { t.fare = v; redraw(); }), "$, no taxes"));
      ins.appendChild(field("Segments", numInput(t.segs, function (v) { t.segs = v; redraw(); }), "2 if nonstop"));
      row.appendChild(ins);
      grid.appendChild(row);
    });
    card.appendChild(grid);

    var more = el("div", "as-more");

    var cardSel = document.createElement("select");
    cardSel.className = "as-in";
    Object.keys(CARDS).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = CARDS[k].label;
      if (k === state.card) o.selected = true;
      cardSel.appendChild(o);
    });
    cardSel.addEventListener("change", function () { state.card = cardSel.value; redraw(); });
    more.appendChild(field("Atmos credit card", cardSel));
    more.appendChild(field("Card spend per month", numInput(state.spend, function (v) { state.spend = v; redraw(); }, 0, 50), "$"));

    var tierSel = document.createElement("select");
    tierSel.className = "as-in";
    var none = document.createElement("option");
    none.value = "none"; none.textContent = "No status yet";
    tierSel.appendChild(none);
    TIERS.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.key; o.textContent = t.name + " (+" + Math.round(t.bonus * 100) + "% on flights)";
      if (t.key === state.current) o.selected = true;
      tierSel.appendChild(o);
    });
    tierSel.addEventListener("change", function () { state.current = tierSel.value; redraw(); });
    more.appendChild(field("Your status right now", tierSel));

    card.appendChild(more);
    wrap.appendChild(card);
  }

  function renderResult(wrap, r) {
    var max = Math.max.apply(null, r.methods.map(function (m) { return m.total; })) || 1;

    /* headline */
    var head = el("div", "as-card as-hero");
    var win = el("div", "as-win");
    win.appendChild(el("span", "as-pill", "Best for how you fly"));
    win.appendChild(el("h3", "as-wint", r.best.name));
    win.appendChild(el("p", "as-wins", r.best.sub + ". " + fmt(r.best.total) + " status points a year."));
    head.appendChild(win);

    var reached = tierFor(r.best.total);
    var nxt = nextTier(r.best.total);
    var tierBox = el("div", "as-tier");
    tierBox.appendChild(el("b", "as-tiername", reached ? reached.name : "No status yet"));
    tierBox.appendChild(el("span", "as-tiersub",
      nxt ? fmt(nxt.pts - r.best.total) + " more for " + nxt.name : "Top tier reached"));
    head.appendChild(tierBox);
    wrap.appendChild(head);

    /* comparison chart */
    var chart = el("div", "as-card");
    chart.appendChild(el("h3", "as-h", "All three ways, side by side"));

    var legend = el("div", "as-legend");
    [["fly", "Flying"], ["card", "Card spend"]].forEach(function (p) {
      var i = el("span", "as-lg");
      var sw = el("i", "as-sw"); sw.style.background = PALETTE[p[0]];
      i.appendChild(sw); i.appendChild(el("span", null, p[1]));
      legend.appendChild(i);
    });
    chart.appendChild(legend);

    var rows = el("div", "as-bars");
    r.methods.forEach(function (m) {
      var row = el("div", "as-bar" + (m.key === r.best.key ? " best" : ""));
      var lab = el("div", "as-barl");
      lab.appendChild(el("b", null, m.name));
      lab.appendChild(el("span", "as-fh", m.detail));
      row.appendChild(lab);

      var track = el("div", "as-track");
      var flyW = (m.fly / max) * 100, cardW = (r.cardPts / max) * 100;
      var sFly = el("i", "as-seg fly"); sFly.style.width = flyW + "%";
      sFly.title = "Flying: " + fmt(m.fly) + " status points";
      var sCard = el("i", "as-seg card"); sCard.style.width = cardW + "%";
      sCard.title = "Card spend: " + fmt(r.cardPts) + " status points";
      track.appendChild(sFly); track.appendChild(sCard);
      row.appendChild(track);

      row.appendChild(el("div", "as-barv", fmt(m.total)));
      rows.appendChild(row);
    });
    chart.appendChild(rows);

    /* tier ladder, drawn against the best method */
    var ladder = el("div", "as-ladder");
    var top = TIERS[TIERS.length - 1].pts;
    var scale = Math.max(top, r.best.total);
    var fill = el("i", "as-lfill");
    fill.style.width = Math.min(100, (r.best.total / scale) * 100) + "%";
    ladder.appendChild(fill);
    TIERS.forEach(function (t) {
      var m = el("span", "as-mark" + (r.best.total >= t.pts ? " hit" : ""));
      m.style.left = (t.pts / scale) * 100 + "%";
      m.appendChild(el("i", "as-dot"));
      m.appendChild(el("span", "as-mt", t.name));
      m.appendChild(el("span", "as-mp", fmt(t.pts)));
      ladder.appendChild(m);
    });
    chart.appendChild(ladder);

    var tbtn = el("button", "as-tbtn", state.table ? "Hide the numbers" : "Show the numbers");
    tbtn.type = "button";
    tbtn.addEventListener("click", function () { state.table = !state.table; redraw(); });
    chart.appendChild(tbtn);

    if (state.table) {
      var tbl = document.createElement("table");
      tbl.className = "as-table";
      tbl.innerHTML = "<thead><tr><th>Method</th><th>Flying</th><th>Card spend</th><th>Total</th><th>Tier</th></tr></thead>";
      var tb = document.createElement("tbody");
      r.methods.forEach(function (m) {
        var t = tierFor(m.total);
        var tr = document.createElement("tr");
        [m.name, fmt(m.fly), fmt(r.cardPts), fmt(m.total), t ? t.name : "None"].forEach(function (v, i) {
          var td = document.createElement(i === 0 ? "th" : "td");
          td.textContent = v; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      chart.appendChild(tbl);
    }
    wrap.appendChild(chart);

    /* the why */
    var why = el("div", "as-card as-why");
    why.appendChild(el("h3", "as-h", "What this means for you"));
    var ul = el("ul", "as-list");
    var d = r.methods[0], p = r.methods[1], s = r.methods[2];
    if (r.best.key === "segment") {
      ul.appendChild(el("li", null, "Short hops are why segments win. Every flight pays a flat 500 points no matter how far it goes, so inter-island travel counts the same as a mainland leg."));
      ul.appendChild(el("li", null, "Staying on the distance default would cost you " + fmt(s.total - d.total) + " status points a year."));
    } else if (r.best.key === "distance") {
      ul.appendChild(el("li", null, "Long flights are why distance wins for you. Segments would pay " + fmt(s.total) + " and price would pay " + fmt(p.total) + "."));
    } else {
      ul.appendChild(el("li", null, "Your fares are high enough that price earning wins. Distance would pay " + fmt(d.total) + " and segments " + fmt(s.total) + "."));
    }
    if (r.cardPts > 0) {
      ul.appendChild(el("li", null, "Your card adds " + fmt(r.cardPts) + " status points, and that is the same whichever earning method you choose."));
    }
    if (r.bonus > 0) {
      ul.appendChild(el("li", null, "Your current status adds a " + Math.round(r.bonus * 100) + "% bonus on flight earning, already included above."));
    }
    ul.appendChild(el("li", null, "You can change your earning choice once per calendar year. Members who do nothing stay on distance."));
    why.appendChild(ul);
    why.appendChild(el("p", "as-note", "Estimates only, for planning. Based on published Atmos Rewards earning rates as of October 2026. Taxes and fees do not earn on the price method. Confirm current rules with Alaska before making decisions."));
    wrap.appendChild(why);
  }

  function redraw() {
    if (!host) return;
    host.innerHTML = "";
    var r = compute();
    var grid = el("div", "as-grid");
    var left = el("div"); renderInputs(left);
    var right = el("div"); renderResult(right, r);
    grid.appendChild(left); grid.appendChild(right);
    host.appendChild(grid);
  }

  /* ---------- styles ---------- */
  function styles() {
    if (document.getElementById("as-css")) return;
    var s = document.createElement("style");
    s.id = "as-css";
    s.textContent = [
      ".as-grid{display:grid;grid-template-columns:minmax(290px,370px) 1fr;gap:16px;align-items:start}",
      "@media (max-width:900px){.as-grid{grid-template-columns:1fr}}",
      ".as-card{border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);padding:16px;margin-bottom:14px}",
      ".as-h{margin:0 0 4px;font-size:15.5px;color:var(--text)}",
      ".as-sub{margin:0 0 12px;font-size:12.5px;color:var(--muted);line-height:1.45}",
      ".as-trip{border:1px solid var(--line);border-radius:12px;padding:10px 11px;margin-bottom:9px;background:var(--surface-2,#f7f9fb)}",
      ".as-trip-h{display:flex;flex-wrap:wrap;gap:7px;align-items:baseline;margin-bottom:8px}",
      ".as-trip-h b{font-size:13.5px;color:var(--text)}",
      ".as-trip-in{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      ".as-f{display:flex;flex-direction:column;gap:3px}",
      ".as-fl{font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}",
      ".as-fh{font-size:11px;color:var(--muted);font-weight:600}",
      ".as-in{font:inherit;font-size:13.5px;font-weight:700;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 9px;width:100%;box-sizing:border-box}",
      ".as-in:focus{outline:2px solid var(--coral);outline-offset:1px;border-color:var(--coral)}",
      ".as-more{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}",
      /* headline */
      ".as-hero{display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;background:linear-gradient(120deg,#0e1b2c 0%,#16294a 72%,#22304a 100%);border-color:rgba(242,184,75,.45)}",
      ".as-win{min-width:220px;flex:1}",
      ".as-pill{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:4px 10px}",
      ".as-wint{margin:8px 0 2px;color:#fff;font-size:24px}",
      ".as-wins{margin:0;color:#c7d4e2;font-size:13px}",
      ".as-tier{text-align:right;min-width:150px}",
      ".as-tiername{display:block;font-size:20px;font-weight:800;color:#f5c75a;line-height:1.15}",
      ".as-tiersub{font-size:11.5px;font-weight:700;color:#c7d4e2}",
      /* chart */
      ".as-legend{display:flex;gap:14px;margin:2px 0 12px}",
      ".as-lg{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--muted)}",
      ".as-sw{width:11px;height:11px;border-radius:3px;display:inline-block}",
      ".as-bars{display:flex;flex-direction:column;gap:11px}",
      ".as-bar{display:grid;grid-template-columns:132px 1fr 76px;gap:11px;align-items:center}",
      "@media (max-width:620px){.as-bar{grid-template-columns:1fr;gap:4px}.as-barv{text-align:left}}",
      ".as-barl b{display:block;font-size:13px;color:var(--text)}",
      ".as-track{display:flex;gap:2px;height:22px;align-items:stretch}",
      ".as-seg{display:block;height:100%;border-radius:0 4px 4px 0;min-width:2px}",
      ".as-seg:first-child{border-radius:4px 0 0 4px}",
      ".as-seg.fly{background:" + PALETTE.fly + "}",
      ".as-seg.card{background:" + PALETTE.card + "}",
      ".as-barv{font-weight:800;font-size:15px;color:var(--text);text-align:right;font-variant-numeric:tabular-nums}",
      ".as-bar.best .as-barv{color:var(--text)}",
      ".as-bar.best .as-barl b:after{content:'Best';margin-left:7px;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:2px 7px;vertical-align:middle}",
      /* ladder */
      ".as-ladder{position:relative;height:58px;margin:26px 0 4px;border-radius:999px;background:var(--surface-2,#f7f9fb);border:1px solid var(--line)}",
      ".as-ladder>.as-lfill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,rgba(212,114,47,.22),rgba(212,114,47,.5))}",
      ".as-mark{position:absolute;top:0;transform:translateX(-50%);text-align:center;width:74px}",
      ".as-mark .as-dot{display:block;width:9px;height:9px;border-radius:50%;margin:-5px auto 3px;background:var(--line);border:2px solid var(--surface)}",
      ".as-mark.hit .as-dot{background:" + PALETTE.fly + "}",
      ".as-mt{display:block;font-size:11px;font-weight:800;color:var(--muted)}",
      ".as-mark.hit .as-mt{color:var(--text)}",
      ".as-mp{display:block;font-size:10px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}",
      /* table + notes */
      ".as-tbtn{margin-top:14px;font:inherit;font-size:12px;font-weight:700;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 11px;cursor:pointer}",
      ".as-tbtn:hover{border-color:var(--coral)}",
      ".as-table{width:100%;border-collapse:collapse;margin-top:11px;font-size:12.5px}",
      ".as-table th,.as-table td{text-align:right;padding:7px 9px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}",
      ".as-table thead th{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}",
      ".as-table tbody th{text-align:left;font-weight:700;color:var(--text)}",
      ".as-list{margin:0;padding-left:18px;color:var(--text);font-size:13px;line-height:1.55}",
      ".as-list li{margin-bottom:7px}",
      ".as-note{margin:12px 0 0;font-size:11px;color:var(--muted);line-height:1.45}"
    ].join("");
    document.head.appendChild(s);
  }

  /* ---------- public ---------- */
  window.HRT_ATMOS = {
    /* exposed so the numbers can be unit tested without a browser */
    _test: { compute: compute, tierFor: tierFor, state: state },
    show: function () {
      styles();
      host = document.getElementById("as-host");
      if (host && !host.getAttribute("data-ready")) {
        host.setAttribute("data-ready", "1");
        redraw();
      }
    }
  };
})();
