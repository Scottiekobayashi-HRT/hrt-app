/* ---------------------------------------------------------------------------
   atmos-communities.js - HRT Atmos Community Calculator (free tool)

   Atmos Rewards members join ONE Community at a time (free), and can switch
   once per calendar year. Six exist from 1 Oct 2026. This tool asks how the
   member travels and works out which Community is worth the most to them,
   line by line, so the answer is never a vibe.

   Facts used (checked Oct 13 2026):
   - Huakai, Global Locals, Families on the Go: read on alaskaair.com /
     hawaiianairlines.com Community pages directly.
   - Culinary Journeys, Active Escapes, Club 49 details and destination lists:
     Thrifty Traveler's guide (Oct 2026), whose lists matched the three
     official pages exactly. Marked here so a future pass re-checks them.
   - Bag fees: news.alaskaair.com "Update on bag fees" (ticketed from
     10 Apr 2026): Neighbor Island $30 / $40, mainland $45 / $55.

   Every Community runs the same Bonus Points Challenge (Oct 1 2026 to
   Dec 31 2027): first flight to or through each of its 10 destinations pays
   100, 200, 300, 400, 500, 750, 1,000, 1,250, 2,500, 3,000 bonus points AND
   the same number of status points (10,000 each for all 10). First member in
   each Community to finish the list also gets 100,000 bonus points.

   Exposes window.HRT_COMMUNITIES; app.js calls .show() from
   onShow.communities.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var LADDER = [100, 200, 300, 400, 500, 750, 1000, 1250, 2500, 3000];
  var CUMUL = [0]; LADDER.forEach(function (v, i) { CUMUL.push(CUMUL[i] + v); });

  var FEES = { niFirst: 30, niSecond: 40, mlFirst: 45, mlSecond: 55 };
  var EARN = {
    segment:  { label: "Segments", rule: "500 per flight" },
    distance: { label: "Distance", rule: "1 per mile" },
    price:    { label: "Price",    rule: "5 per dollar" }
  };

  var AIRPORTS = {
    HNL: "Honolulu", OGG: "Kahului, Maui", KOA: "Kona", ITO: "Hilo", LIH: "Lihue, Kauai", LNY: "Lanai", MKK: "Molokai",
    LAX: "Los Angeles", SFO: "San Francisco", SAN: "San Diego", LGB: "Long Beach", SBA: "Santa Barbara", PSP: "Palm Springs",
    FAT: "Fresno", LAS: "Las Vegas", PHX: "Phoenix", YVR: "Vancouver",
    DEN: "Denver", SLC: "Salt Lake City", BZN: "Bozeman", JAC: "Jackson Hole", FCA: "Kalispell", AUS: "Austin", IAH: "Houston",
    JFK: "New York JFK", DCA: "Washington DC", ATL: "Atlanta", MCO: "Orlando", MIA: "Miami", FLL: "Fort Lauderdale", ORD: "Chicago", CLE: "Cleveland",
    CUN: "Cancun", SJD: "Los Cabos", PVR: "Puerto Vallarta", LIR: "Liberia, Costa Rica",
    HND: "Tokyo Haneda", NRT: "Tokyo Narita", ICN: "Seoul", HKG: "Hong Kong", KUL: "Kuala Lumpur", SYD: "Sydney", NAN: "Nadi, Fiji",
    LHR: "London", MAD: "Madrid", HEL: "Helsinki", DOH: "Doha", AMM: "Amman", CMN: "Casablanca"
  };
  var REGIONS = [
    ["Hawaiʻi", ["HNL", "OGG", "KOA", "ITO", "LIH", "LNY", "MKK"]],
    ["West Coast and Vegas", ["LAX", "SFO", "SAN", "LGB", "SBA", "PSP", "FAT", "LAS", "PHX", "YVR"]],
    ["Mountains and Texas", ["DEN", "SLC", "BZN", "JAC", "FCA", "AUS", "IAH"]],
    ["East and Midwest", ["JFK", "DCA", "ATL", "MCO", "MIA", "FLL", "ORD", "CLE"]],
    ["Mexico and Costa Rica", ["CUN", "SJD", "PVR", "LIR"]],
    ["Asia and Pacific", ["HND", "NRT", "ICN", "HKG", "KUL", "SYD", "NAN"]],
    ["Europe and Middle East", ["LHR", "MAD", "HEL", "DOH", "AMM", "CMN"]]
  ];

  var ICON = {
    huakai: '<path d="M12 21c-4 0-7-1.5-7-1.5M12 21V11M12 11c-3 0-5 1-6 2.5M12 11c3 0 5 1 6 2.5M12 11c-1-2-3-3-5-3M12 11c1-2 3-3 5-3"/>',
    club49: '<path d="M3 19 9 8l4 6 3-4 5 9Z"/><path d="m7.5 11 1.5 1.5L10.5 11"/>',
    global: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
    families: '<circle cx="8" cy="6" r="2.2"/><circle cx="16.5" cy="9" r="1.7"/><path d="M4.5 20v-5a3.5 3.5 0 0 1 7 0v5M13.5 20v-3.5a3 3 0 0 1 6 0V20"/>',
    culinary: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 21V3c-2 1.5-3 4-3 7h3"/>',
    active: '<path d="m3 20 6-11 4 6 2.5-3.5L21 20Z"/><circle cx="17" cy="6" r="2"/>'
  };

  /* who: residency needed ("HI", "AK" or null). source: where the facts came
     from, for the fine print and the next check. */
  var COMMUNITIES = [
    { key: "huakai", name: "Huakaʻi by Hawaiian", short: "Huakaʻi", color: "#c8237f", res: "HI",
      who: "Hawaiʻi residents only", tag: "Built for kamaʻāina who fly between the islands",
      challenge: "Holoholo Gateways",
      dests: ["HNL", "ITO", "HND", "OGG", "LNY", "SYD", "LIH", "LAS", "MKK", "KOA"],
      perks: ["50% more points and status points on interisland flights, from Jan 1 2027, however you choose to earn",
              "Two free checked bags on Neighbor Island flights, surfboards and golf bags included",
              "A code every three months: 10% off one Neighbor Island booking, 20% with an Atmos Rewards Visa or Hawaiian World Elite Mastercard",
              "Redeem Foodland Maikaʻi points for 3x Atmos points",
              "Upgrade certificates can clear as early as 3 days out on Hawaiʻi to Continent, Asia and Oceania flights",
              "Monthly flight deals"],
      source: "hawaiianairlines.com/content/huakai, read Oct 13 2026" },
    { key: "families", name: "Families on the Go", short: "Families", color: "#e8824c", res: null,
      who: "Open to every member", tag: "For anyone booking award seats for kids",
      challenge: "Fun finder",
      dests: ["MCO", "SAN", "JFK", "ATL", "NRT", "LGB", "CUN", "IAH", "YVR", "ICN"],
      perks: ["20% of the points back on award flights for children 12 and under, after the trip",
              "Works on Alaska, Hawaiian and partner awards booked with Atmos points",
              "Quarterly flight deals"],
      source: "alaskaair.com/atmosrewards/content/families-on-the-go, read Oct 13 2026" },
    { key: "global", name: "Global Locals", short: "Global Locals", color: "#2f7fb8", res: null,
      who: "Open to every member", tag: "For international flyers chasing status",
      challenge: "oneworld hubs",
      dests: ["NRT", "SYD", "DOH", "CMN", "LHR", "HKG", "KUL", "AMM", "HEL", "MAD"],
      perks: ["10% more status points on flights that start or end outside the U.S., award flights included",
              "1 status point for every 25 points you transfer into Atmos from eligible partners such as Bilt and Marriott",
              "Quarterly flight deals"],
      source: "alaskaair.com/atmosrewards/content/global-locals, read Oct 13 2026" },
    { key: "culinary", name: "Culinary Journeys", short: "Culinary", color: "#b4493b", res: null,
      who: "Open to every member", tag: "For trips planned around food",
      challenge: "",
      dests: ["AUS", "ORD", "DEN", "LHR", "LAX", "MIA", "JFK", "SFO", "NRT", "DCA"],
      perks: ["20% off food and wine experiences with Atmos Rewards Unlocked",
              "Quarterly flight deals"],
      source: "Thrifty Traveler Communities guide, Oct 2026; Alaska's summary card read Oct 13 2026" },
    { key: "active", name: "Active Escapes", short: "Active", color: "#3c8a52", res: null,
      who: "Open to every member", tag: "For national parks and the outdoors",
      challenge: "",
      dests: ["BZN", "CLE", "JAC", "FCA", "KOA", "NAN", "PSP", "PHX", "SLC", "FAT"],
      perks: ["20% off outdoor experiences with Atmos Rewards Unlocked",
              "Partner offers, including AllTrails",
              "Quarterly flight deals"],
      source: "Thrifty Traveler Communities guide, Oct 2026; Alaska's summary card read Oct 13 2026" },
    { key: "club49", name: "Club 49", short: "Club 49", color: "#1f5d8c", res: "AK",
      who: "Alaska residents only", tag: "Built for Alaskans",
      challenge: "",
      dests: ["SJD", "FLL", "KOA", "LAS", "LIR", "PSP", "PHX", "PVR", "SBA", "SYD"],
      perks: ["Two free checked bags for you and up to 7 others on trips that include Alaska",
              "Two Travel Now discounts a year: 30% off a one-way refundable fare booked within 4 days of travel",
              "Ship up to 100 lbs within Alaska for $49 plus tax",
              "Weekly fare sales"],
      source: "Thrifty Traveler Communities guide, Oct 2026; Alaska's summary card read Oct 13 2026" }
  ];

  var PRESETS = [
    { key: "island", name: "Island hopper", blurb: "Mostly OGG, KOA, LIH, ITO",
      set: { island: 12, intl: 0, party: 1, kids: 0, kidTrips: 0, transfer: 0, bags: 1, dests: ["HNL", "OGG", "KOA", "LIH", "ITO"] } },
    { key: "family", name: "Family trips", blurb: "Kids along, mainland too",
      set: { island: 2, intl: 0, party: 4, kids: 2, kidTrips: 3, transfer: 0, bags: 1, dests: ["HNL", "OGG", "LAX", "SAN", "LAS", "LGB"] } },
    { key: "world", name: "Japan and beyond", blurb: "HND, NRT, ICN, SYD",
      set: { island: 2, intl: 3, party: 2, kids: 0, kidTrips: 0, transfer: 30000, bags: 1, dests: ["HNL", "HND", "NRT", "ICN", "SYD"] } },
    { key: "mix", name: "A bit of everything", blurb: "Islands, mainland, one big trip",
      set: { island: 6, intl: 1, party: 2, kids: 0, kidTrips: 0, transfer: 0, bags: 1, dests: ["HNL", "OGG", "KOA", "LAS", "LAX", "SFO", "NRT"] } }
  ];

  var state = {
    home: "HI", preset: "island", earn: "segment", goal: "both",
    island: 12, intl: 0, party: 1, kids: 0, kidTrips: 0, kidPts: 25000,
    transfer: 0, bags: 1, freeBag: false, card: "none", foodland: false,
    akTrips: 0, akFare: 300,
    niMiles: 110, niFare: 160, intlMiles: 3850, intlFare: 700,
    advanced: false,
    dests: { HNL: 1, OGG: 1, KOA: 1, LIH: 1, ITO: 1 }
  };

  /* ---------- helpers ---------- */
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function icon(path, size) {
    var w = document.createElement("span"); w.className = "ac-ic";
    w.innerHTML = '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    return w;
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function money(n) { return "$" + fmt(n); }
  function num(v) { v = +v; return isFinite(v) && v > 0 ? v : 0; }
  function byKey(k) { for (var i = 0; i < COMMUNITIES.length; i++) if (COMMUNITIES[i].key === k) return COMMUNITIES[i]; return null; }

  /* Atmos value per point from the dashboard's Points Valuations, so both tools agree. */
  function cpp() {
    try {
      var l = (window.HRT_POINT_VALUES && window.HRT_POINT_VALUES.list) || [];
      for (var i = 0; i < l.length; i++) if (/atmos/i.test(l[i][0])) return +l[i][2];
    } catch (e) {}
    return 1.4;
  }

  /* Points from one round trip under the member's earn choice, before any elite bonus. */
  function perRoundTrip(earn, miles, fare) {
    if (earn === "distance") return 2 * num(miles);
    if (earn === "price") return 5 * num(fare);
    return 1000; /* two segments at 500 */
  }

  /* ---------- the maths ---------- */
  function compute(s) {
    s = s || state;
    var c = cpp() / 100;
    var w = s.goal === "status" ? 1 : s.goal === "money" ? 0 : 0.5;
    var party = Math.max(1, Math.round(num(s.party) || 1));

    var out = COMMUNITIES.map(function (cm) {
      var eligible = !cm.res || cm.res === s.home;
      var hits = cm.dests.filter(function (d) { return !!s.dests[d]; });
      var n = hits.length;
      var lines = [];
      function add(label, pts, status, cash, note) {
        lines.push({ label: label, pts: pts || 0, status: status || 0, cash: cash || 0, note: note || "" });
      }
      add("Bonus Points Challenge, " + n + " of 10 destinations", CUMUL[n], CUMUL[n], 0,
        n ? "Your picks on its list: " + hits.join(", ") : "None of the places you picked are on its list");

      if (cm.key === "huakai") {
        var trips = num(s.island);
        var base = perRoundTrip(s.earn, s.niMiles, s.niFare) * trips;
        add("50% more on " + fmt(trips) + " interisland round trips", base * 0.5, base * 0.5, 0,
          "Earning by " + EARN[s.earn].label.toLowerCase() + ", " + fmt(base) + " points before the bonus");
        var b = Math.min(2, Math.round(num(s.bags)));
        var perWay = (b >= 1 && !s.freeBag ? FEES.niFirst : 0) + (b >= 2 ? FEES.niSecond : 0);
        add("Free checked bags between the islands", 0, 0, perWay * 2 * trips,
          b ? b + (b === 1 ? " bag" : " bags") + " each way, for you" + (s.freeBag ? ", first bag already free with your card" : "") : "You said you do not check bags");
        var uses = Math.min(4, Math.ceil(trips));
        var pct = s.card === "none" ? 0.10 : 0.20;
        add("Quarterly Neighbor Island fare code", 0, 0, uses * pct * num(s.niFare) * party,
          uses + (uses === 1 ? " code" : " codes") + " at " + Math.round(pct * 100) + "% off a booking for " + party + (party === 1 ? " person" : " people"));
        if (s.foodland) add("Foodland Maikaʻi points at 3x", 3000, 0, 0, "Up to 3,000 bonus points a year, if you convert regularly");
      }
      if (cm.key === "global") {
        var ib = perRoundTrip(s.earn, s.intlMiles, s.intlFare) * num(s.intl);
        add("10% more status points on " + fmt(num(s.intl)) + " international round trips", 0, ib * 0.1, 0,
          "Status points only, on flights that start or end outside the U.S.");
        var tr = num(s.transfer);
        add("Status points on points you transfer in", 0, Math.floor(tr / 25), 0,
          tr ? fmt(tr) + " points from Bilt or Marriott, 1 status point per 25" : "You did not plan any transfers");
      }
      if (cm.key === "families") {
        var kids = Math.min(7, Math.round(num(s.kids)));
        var spent = kids * num(s.kidTrips) * num(s.kidPts);
        add("20% back on kids' award seats", spent * 0.2, 0, 0,
          kids ? fmt(spent) + " points on " + kids + (kids === 1 ? " child" : " children") + " 12 and under" : "No kids 12 and under on award seats");
      }
      if (cm.key === "club49" && eligible) {
        var ak = num(s.akTrips);
        var bb = Math.min(2, Math.round(num(s.bags)));
        var way = (bb >= 1 ? FEES.mlFirst : 0) + (bb >= 2 ? FEES.mlSecond : 0);
        var people = Math.min(8, party);
        add("Free checked bags on trips that include Alaska", 0, 0, way * 2 * ak * people,
          fmt(ak) + " round trips, " + people + (people === 1 ? " traveler" : " travelers"));
        add("Two Travel Now discounts", 0, 0, Math.min(2, ak) * 0.3 * num(s.akFare),
          "30% off a refundable one-way fare, if you book within 4 days");
      }

      var pts = 0, status = 0, cash = 0;
      lines.forEach(function (l) { pts += l.pts; status += l.status; cash += l.cash; });
      var value = pts * c + cash;
      return { c: cm, eligible: eligible, hits: hits, lines: lines, pts: pts, status: status, cash: cash,
               value: value, score: eligible ? value + status * c * w : -1 };
    });
    var ranked = out.slice().sort(function (a, z) { return z.score - a.score; });
    return { all: out, ranked: ranked, best: ranked[0], second: ranked[1], cpp: c * 100, weight: w };
  }

  /* ---------- left column: the questions ---------- */
  function seg(options, current, onPick) {
    var g = el("div", "ac-seg");
    options.forEach(function (o) {
      var b = el("button", "ac-segb" + (o[0] === current ? " on" : ""), o[1]);
      b.type = "button"; b.setAttribute("aria-pressed", o[0] === current ? "true" : "false");
      b.addEventListener("click", function () { onPick(o[0]); });
      g.appendChild(b);
    });
    return g;
  }
  function field(label, node, hint) {
    var w = el("div", "ac-field");
    w.appendChild(el("span", "ac-lab", label));
    w.appendChild(node);
    if (hint) w.appendChild(el("span", "ac-hint", hint));
    return w;
  }
  function slider(label, key, min, max, step, show) {
    var w = el("div", "ac-sl");
    var head = el("div", "ac-slh");
    head.appendChild(el("span", "ac-lab", label));
    var v = el("b", "ac-slv", show(state[key]));
    head.appendChild(v);
    w.appendChild(head);
    var i = document.createElement("input");
    i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = state[key];
    i.className = "ac-range"; i.setAttribute("aria-label", label);
    i.addEventListener("input", function () { state[key] = +i.value; v.textContent = show(i.value); state.preset = ""; soft(); });
    w.appendChild(i);
    return w;
  }
  function plural(word) { return function (v) { return fmt(v) + " " + word + (+v === 1 ? "" : "s"); }; }

  function stepCard(nTxt, title) {
    var c = el("div", "ac-card");
    var h = el("h3", "ac-q");
    h.appendChild(el("span", "ac-step", nTxt));
    h.appendChild(document.createTextNode(title));
    c.appendChild(h);
    return c;
  }

  function questions() {
    var col = el("div", "ac-col");

    var c1 = stepCard("1", "Where do you live?");
    c1.appendChild(seg([["HI", "Hawaiʻi"], ["AK", "Alaska"], ["other", "Somewhere else"]], state.home,
      function (k) { state.home = k; paint(); }));
    c1.appendChild(el("p", "ac-note", "Huakaʻi is only for Hawaiʻi residents and Club 49 only for Alaskans. The other four are open to everyone."));
    col.appendChild(c1);

    var c2 = stepCard("2", "Which sounds most like you?");
    var g = el("div", "ac-presets");
    PRESETS.forEach(function (p) {
      var b = el("button", "ac-p" + (p.key === state.preset ? " on" : ""));
      b.type = "button";
      b.appendChild(el("b", null, p.name));
      b.appendChild(el("span", null, p.blurb));
      b.addEventListener("click", function () {
        state.preset = p.key;
        Object.keys(p.set).forEach(function (k) {
          if (k === "dests") { state.dests = {}; p.set.dests.forEach(function (d) { state.dests[d] = 1; }); }
          else state[k] = p.set[k];
        });
        paint();
      });
      g.appendChild(b);
    });
    c2.appendChild(g);
    c2.appendChild(el("p", "ac-note", "A starting point. Fine tune everything below."));
    col.appendChild(c2);

    var c3 = stepCard("3", "Your next 12 months");
    if (state.home === "HI") c3.appendChild(slider("Interisland round trips", "island", 0, 30, 1, plural("trip")));
    if (state.home === "AK") c3.appendChild(slider("Round trips that include Alaska", "akTrips", 0, 20, 1, plural("trip")));
    c3.appendChild(slider("International round trips", "intl", 0, 12, 1, plural("trip")));
    c3.appendChild(slider("People on your bookings, you included", "party", 1, 8, 1, plural("person")));
    c3.appendChild(slider("Kids 12 and under on award seats", "kids", 0, 7, 1, plural("kid")));
    if (state.kids > 0) c3.appendChild(slider("Award round trips with them", "kidTrips", 0, 8, 1, plural("trip")));
    c3.appendChild(slider("Points you will transfer in from Bilt or Marriott", "transfer", 0, 200000, 5000, function (v) { return fmt(v) + " pts"; }));
    c3.appendChild(field("Checked bags you usually bring, each way",
      seg([[0, "None"], [1, "One"], [2, "Two"]], state.bags, function (k) { state.bags = k; state.preset = ""; paint(); })));
    if (state.home === "HI") {
      c3.appendChild(field("Your Atmos or Hawaiian credit card",
        seg([["none", "None"], ["atmos", "Atmos Visa"], ["hawaiian", "Hawaiian MC"]], state.card,
          function (k) { state.card = k; paint(); }), "An Atmos Rewards Visa or Hawaiian World Elite Mastercard doubles the Huakaʻi fare code to 20%."));
      var t = el("div", "ac-toggles");
      [["freeBag", "My card already gets me a free first bag between islands"], ["foodland", "I shop at Foodland and use Maikaʻi points"]].forEach(function (x) {
        var lab = el("label", "ac-tog");
        var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!state[x[0]];
        cb.addEventListener("change", function () { state[x[0]] = cb.checked; soft(); });
        lab.appendChild(cb); lab.appendChild(el("span", null, x[1]));
        t.appendChild(lab);
      });
      c3.appendChild(t);
    }
    col.appendChild(c3);

    var c4 = stepCard("4", "Where will you fly through 2027?");
    c4.appendChild(el("p", "ac-note", "Tap every place you expect to fly to or connect through by Dec 31 2027. Flying home counts too, so most Oʻahu travelers should keep HNL on."));
    REGIONS.forEach(function (r) {
      var box = el("div", "ac-reg");
      box.appendChild(el("span", "ac-regn", r[0]));
      var chips = el("div", "ac-chips");
      r[1].forEach(function (code) {
        var on = !!state.dests[code];
        var b = el("button", "ac-chip" + (on ? " on" : ""));
        b.type = "button"; b.setAttribute("aria-pressed", on ? "true" : "false");
        b.title = AIRPORTS[code];
        b.appendChild(el("b", null, code));
        b.appendChild(el("span", null, AIRPORTS[code]));
        b.addEventListener("click", function () {
          if (state.dests[code]) delete state.dests[code]; else state.dests[code] = 1;
          var now = !!state.dests[code];
          b.classList.toggle("on", now); b.setAttribute("aria-pressed", now ? "true" : "false");
          state.preset = ""; soft();
        });
        chips.appendChild(b);
      });
      box.appendChild(chips);
      c4.appendChild(box);
    });
    col.appendChild(c4);

    var c5 = stepCard("5", "Two last things");
    c5.appendChild(field("How do you earn on Atmos?",
      seg([["segment", "Segments"], ["distance", "Distance"], ["price", "Price"]], state.earn,
        function (k) { state.earn = k; paint(); })));
    var link = el("a", "ac-link", "Not sure? Run the Choose to Earn Calculator");
    link.href = "#status"; link.setAttribute("data-route", "status");
    c5.appendChild(link);
    c5.appendChild(field("What matters most to you?",
      seg([["money", "Free trips"], ["both", "Both"], ["status", "Elite status"]], state.goal,
        function (k) { state.goal = k; paint(); }),
      "Status points cannot be spent, so this decides how much they count in the ranking."));
    var adv = el("button", "ac-adv", state.advanced ? "Hide the details" : "Adjust the details");
    adv.type = "button";
    adv.addEventListener("click", function () { state.advanced = !state.advanced; paint(); });
    c5.appendChild(adv);
    if (state.advanced) {
      var d = el("div", "ac-det");
      [["niFare", "Interisland fare, round trip, $"], ["niMiles", "Interisland miles, one way"],
       ["intlFare", "International fare, round trip, $"], ["intlMiles", "International miles, one way"],
       ["kidPts", "Points per kid's award round trip"], ["akFare", "Refundable one-way fare to Alaska, $"]].forEach(function (f) {
        var lab = el("label", "ac-f");
        lab.appendChild(el("span", "ac-lab", f[1]));
        var inp = document.createElement("input");
        inp.type = "number"; inp.min = "0"; inp.inputMode = "numeric"; inp.className = "ac-in"; inp.value = state[f[0]];
        inp.addEventListener("input", function () { state[f[0]] = num(inp.value); soft(); });
        lab.appendChild(inp);
        d.appendChild(lab);
      });
      d.appendChild(el("p", "ac-note", "Check real award prices for kids' seats on the Atmos Award Calendar before you rely on this number."));
      c5.appendChild(d);
    }
    col.appendChild(c5);
    return col;
  }

  /* ---------- right column: the answer ---------- */
  function answer(r) {
    var best = r.best, sec = r.second;
    var wrap = el("div", "ac-card ac-answer");
    wrap.appendChild(el("span", "ac-pill", "Your best Community"));
    var head = el("div", "ac-ahead");
    var badge = icon(ICON[best.c.key], 26); badge.className = "ac-abadge"; badge.style.background = best.c.color;
    head.appendChild(badge);
    var ht = el("div");
    ht.appendChild(el("h2", "ac-big", best.c.name));
    var gap = best.score - (sec && sec.score > 0 ? sec.score : 0);
    ht.appendChild(el("p", "ac-bigsub", "Worth about " + money(Math.max(0, best.score)) + " a year to you."));
    head.appendChild(ht);
    wrap.appendChild(head);

    var verdict;
    if (best.score <= 0) verdict = "Nothing you entered moves the needle yet. Add trips or destinations and the ranking will sort itself out.";
    else if (sec && sec.score > 0 && gap < 25) verdict = "Close call with " + sec.c.name + ". Pick the one whose destinations you are most likely to actually fly.";
    else if (sec && sec.score > 0) verdict = "Beats " + sec.c.name + " by about " + money(gap) + " a year for the way you travel.";
    else verdict = "No other Community gives you anything for the trips you entered.";
    wrap.appendChild(el("p", "ac-verdict", verdict));
    wrap.appendChild(el("p", "ac-made", "That is " + fmt(best.pts) + " points" + (best.cash ? " and " + money(best.cash) + " in savings" : "") +
      (best.status ? ", plus " + fmt(best.status) + " status points" + (r.weight ? " counted at " + (r.weight === 1 ? "full" : "half") + " value" : " we did not count") : "") + "."));

    var max = Math.max.apply(null, r.ranked.map(function (x) { return x.score; })) || 1;
    var list = el("div", "ac-rank");
    r.ranked.forEach(function (x, i) {
      var row = el("div", "ac-row" + (i === 0 ? " win" : "") + (x.eligible ? "" : " off"));
      var ic = icon(ICON[x.c.key], 16); ic.className = "ac-rdot"; ic.style.background = x.c.color;
      row.appendChild(ic);
      var mid = el("div", "ac-rmid");
      var top = el("div", "ac-rtop");
      top.appendChild(el("b", null, x.c.name));
      top.appendChild(el("span", "ac-rval", x.eligible ? money(Math.max(0, x.score)) : x.c.who));
      mid.appendChild(top);
      var tr = el("div", "ac-rtrack");
      var bar = el("i"); bar.style.width = (x.eligible ? Math.max(0, x.score) / max * 100 : 0) + "%"; bar.style.background = x.c.color;
      tr.appendChild(bar);
      mid.appendChild(tr);
      if (x.eligible) mid.appendChild(el("span", "ac-rsub", fmt(x.pts) + " points, " + fmt(x.status) + " status points" + (x.cash ? ", " + money(x.cash) + " saved" : "")));
      row.appendChild(mid);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    wrap.appendChild(el("p", "ac-foot", "Values use " + r.cpp.toFixed(1) + "¢ per Atmos point from our Points Valuations. " +
      (r.weight === 0 ? "Status points are shown but not counted in the ranking." : r.weight === 1 ? "Status points count the same as spendable points in the ranking." : "Status points count at half the value of spendable points in the ranking.")));
    return wrap;
  }

  /* The part that makes the answer believable: the top two, line by line. */
  function compare(r) {
    var a = r.best, b = r.second;
    var wrap = el("div", "ac-card");
    var h = el("h3", "ac-q");
    h.appendChild(document.createTextNode("Line by line: " + a.c.short + " vs " + (b ? b.c.short : "")));
    wrap.appendChild(h);
    if (!b) return wrap;
    var g = el("div", "ac-cmp");
    [a, b].forEach(function (x, i) {
      var col = el("div", "ac-cmpc" + (i === 0 ? " win" : ""));
      col.style.setProperty("--cc", x.c.color);
      var hd = el("div", "ac-cmph");
      hd.appendChild(el("b", null, x.c.name));
      hd.appendChild(el("span", null, x.eligible ? money(Math.max(0, x.score)) + " a year" : x.c.who));
      col.appendChild(hd);
      x.lines.forEach(function (l) {
        var row = el("div", "ac-line" + (l.pts || l.status || l.cash ? "" : " zero"));
        var t = el("div", "ac-linet");
        t.appendChild(el("span", "ac-linel", l.label));
        var v = [];
        if (l.pts) v.push(fmt(l.pts) + " pts");
        if (l.status) v.push(fmt(l.status) + " status");
        if (l.cash) v.push(money(l.cash));
        t.appendChild(el("b", "ac-linev", v.length ? v.join(" + ") : "0"));
        row.appendChild(t);
        if (l.note) row.appendChild(el("span", "ac-linen", l.note));
        col.appendChild(row);
      });
      var tot = el("div", "ac-tot");
      tot.appendChild(el("span", null, "Total"));
      tot.appendChild(el("b", null, fmt(x.pts) + " pts, " + fmt(x.status) + " status" + (x.cash ? ", " + money(x.cash) : "")));
      col.appendChild(tot);
      g.appendChild(col);
    });
    wrap.appendChild(g);
    wrap.appendChild(el("p", "ac-note", "Points and status points are estimates before any elite bonus. Dollar savings use Alaska's published bag fees ($30 and $40 between the islands, $45 and $55 on the mainland) and the fares you set."));
    return wrap;
  }

  /* ---------- below: the six, neatly ---------- */
  function ladder() {
    var wrap = el("div", "ac-ladder");
    var top = LADDER[LADDER.length - 1];
    LADDER.forEach(function (v, i) {
      var c = el("div", "ac-lstep");
      var bar = el("i"); bar.style.height = (14 + v / top * 86) + "%";
      c.appendChild(el("span", "ac-lv", fmt(v)));
      c.appendChild(bar);
      c.appendChild(el("span", "ac-ln", String(i + 1)));
      wrap.appendChild(c);
    });
    return wrap;
  }

  function howItWorks() {
    var wrap = el("div", "ac-card ac-how");
    wrap.appendChild(el("h3", "ac-h2", "How Atmos Communities work"));
    var g = el("div", "ac-rules");
    [["Free to join", "Sign in to Atmos Rewards and pick Join a Community. It costs nothing."],
     ["One at a time", "You belong to one Community. You cannot stack them."],
     ["Switch once a year", "One change per calendar year. Switching resets your challenge progress, but you keep points already earned."],
     ["The day you fly counts", "Benefits follow the Community you are in on the day you fly, not the day you book."]].forEach(function (x, i) {
      var c = el("div", "ac-rule");
      c.appendChild(el("span", "ac-rulen", String(i + 1)));
      c.appendChild(el("b", null, x[0]));
      c.appendChild(el("p", null, x[1]));
      g.appendChild(c);
    });
    wrap.appendChild(g);

    var ch = el("div", "ac-chal");
    var left = el("div", "ac-chalt");
    left.appendChild(el("span", "ac-kicker", "In every Community"));
    left.appendChild(el("h4", null, "The Bonus Points Challenge"));
    left.appendChild(el("p", null, "Each Community has 10 destinations. Your first flight to or through each one, in any order, pays bonus points and the same number of status points. Every new place pays more than the last, up to 10,000 of each for all ten."));
    left.appendChild(el("p", "ac-fine", "Runs Oct 1 2026 to Dec 31 2027. Award tickets count. The first member in each Community to finish the list earns 100,000 bonus points. A new list arrives Jan 1 2028."));
    ch.appendChild(left);
    var right = el("div", "ac-chalg");
    right.appendChild(ladder());
    right.appendChild(el("span", "ac-lcap", "Bonus points for your 1st to 10th destination"));
    ch.appendChild(right);
    wrap.appendChild(ch);

    var sh = el("div", "ac-shared");
    sh.appendChild(el("b", null, "Also in every Community"));
    ["Flight deals by email (monthly for Huakaʻi, quarterly for most)", "20% off Atmos Rewards Unlocked experiences", "Partner offers"].forEach(function (t) {
      sh.appendChild(el("span", "ac-sharedi", t));
    });
    wrap.appendChild(sh);
    return wrap;
  }

  function sixCards(r) {
    var wrap = el("div", "ac-six-wrap");
    wrap.appendChild(el("h3", "ac-h2", "Meet the six Communities"));
    wrap.appendChild(el("p", "ac-note", "Your picks from step 4 light up on each challenge list."));
    var g = el("div", "ac-six");
    r.all.forEach(function (x) {
      var c = el("article", "ac-cc" + (x.eligible ? "" : " off") + (x.c.key === r.best.c.key ? " best" : ""));
      c.style.setProperty("--cc", x.c.color);
      var band = el("div", "ac-band");
      band.appendChild(icon(ICON[x.c.key], 22));
      var bt = el("div");
      bt.appendChild(el("h4", null, x.c.name));
      bt.appendChild(el("span", null, x.c.tag));
      band.appendChild(bt);
      if (x.c.key === r.best.c.key) band.appendChild(el("span", "ac-bestp", "Best for you"));
      c.appendChild(band);
      var body = el("div", "ac-ccb");
      body.appendChild(el("span", "ac-who" + (x.c.res ? " res" : ""), x.c.who));
      var ul = el("ul", "ac-perks");
      x.c.perks.forEach(function (p) { ul.appendChild(el("li", null, p)); });
      body.appendChild(ul);
      var ch = el("div", "ac-dlist");
      var hh = el("div", "ac-dhead");
      hh.appendChild(el("b", null, x.c.challenge ? "Challenge: " + x.c.challenge : "Challenge destinations"));
      hh.appendChild(el("span", null, x.hits.length + " of 10 for you"));
      ch.appendChild(hh);
      var chips = el("div", "ac-dchips");
      x.c.dests.forEach(function (d) {
        var on = !!state.dests[d];
        var s = el("span", "ac-d" + (on ? " on" : ""), d);
        s.title = AIRPORTS[d] + (on ? ", on your list" : "");
        chips.appendChild(s);
      });
      ch.appendChild(chips);
      body.appendChild(ch);
      c.appendChild(body);
      g.appendChild(c);
    });
    wrap.appendChild(g);
    return wrap;
  }

  function finePrint() {
    var d = el("details", "ac-sec");
    d.appendChild(el("summary", "ac-secs", "The fine print and sources"));
    var b = el("div", "ac-secb");
    var ul = el("ul", "ac-list");
    ["Huakaʻi needs a Hawaiʻi address and Club 49 an Alaska address. The other four are open to every Atmos Rewards member.",
     "Joining signs you up for Community emails, which is how the flight deals and codes arrive. Turning them off can cost you those deals.",
     "Huakaʻi's 50% interisland bonus starts with flights on Jan 1 2027. We assume the free bags cover you, not everyone on the booking, because the page does not say.",
     "Families on the Go returns 20% of the points spent on the kids' seats only, not taxes or fees, once travel is complete. You must stay in the Community until the trip is done.",
     "Global Locals' 10% is status points only. Transfer bonus points do not earn status points.",
     "Saver and Basic Economy fares earn no flight points, so the interisland and international bonuses assume regular fares.",
     "Estimates for planning only, before elite bonuses. Benefits can change; confirm in your Atmos Rewards account before you choose."].forEach(function (t) { ul.appendChild(el("li", null, t)); });
    b.appendChild(ul);
    var src = el("ul", "ac-list ac-src");
    COMMUNITIES.forEach(function (c) { src.appendChild(el("li", null, c.name + ": " + c.source)); });
    src.appendChild(el("li", null, "Bag fees: news.alaskaair.com, Update on bag fees, for tickets from Apr 10 2026"));
    b.appendChild(el("p", "ac-note", "Sources, checked Oct 13 2026:"));
    b.appendChild(src);
    d.appendChild(b);
    return d;
  }

  /* ---------- render ---------- */
  var host = null, timer = null;
  function results(col, r) {
    col.appendChild(answer(r));
    col.appendChild(compare(r));
  }
  function paint() {
    if (!host) return;
    var y = host.closest(".hrt-main"); var keep = y ? y.scrollTop : 0;
    var r = compute();
    host.innerHTML = "";
    var grid = el("div", "ac-grid");
    grid.appendChild(questions());
    var R = el("div", "ac-col ac-res");
    results(R, r);
    grid.appendChild(R);
    host.appendChild(grid);
    host.appendChild(howItWorks());
    host.appendChild(sixCards(r));
    host.appendChild(finePrint());
    if (y) y.scrollTop = keep;
  }
  /* Sliders and chips must not lose focus, so only the results repaint. */
  function soft() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (!host) return;
      var r = compute();
      var R = host.querySelector(".ac-res"), six = host.querySelector(".ac-six-wrap");
      if (!R || !six) return paint();
      R.innerHTML = ""; results(R, r);
      six.parentNode.replaceChild(sixCards(r), six);
    }, 40);
  }

  function styles() {
    if (document.getElementById("ac-css")) return;
    var s = document.createElement("style"); s.id = "ac-css";
    var H = "#ac-host ";
    s.textContent = [
      H + ".ac-grid{display:grid;grid-template-columns:minmax(290px,380px) 1fr;gap:16px;align-items:start}",
      "@media (max-width:920px){" + H + ".ac-grid{grid-template-columns:1fr}" + H + ".ac-res{order:-1}}",
      H + ".ac-res{position:sticky;top:12px}",
      "@media (max-width:920px){" + H + ".ac-res{position:static}}",
      H + ".ac-card{border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);padding:16px;margin-bottom:14px}",
      H + ".ac-q{display:flex;align-items:center;gap:9px;margin:0 0 12px;font-size:15px;color:var(--text)}",
      H + ".ac-step{flex:0 0 auto;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11.5px;font-weight:800;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c)}",
      H + ".ac-note{margin:8px 0 0;font-size:11.5px;color:var(--muted);line-height:1.5}",
      H + ".ac-hint{display:block;margin-top:5px;font-size:11px;color:var(--muted);line-height:1.45}",
      H + ".ac-lab{font-size:11px;font-weight:800;letter-spacing:.03em;color:var(--muted)}",
      H + ".ac-field{margin:0 0 13px}",
      H + ".ac-field>.ac-lab{display:block;margin-bottom:6px}",
      H + ".ac-seg{display:flex;gap:6px}",
      H + ".ac-segb{flex:1;min-height:44px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:8px 6px;border-radius:10px;border:1.5px solid var(--line);background:var(--surface-2);color:var(--text)}",
      H + ".ac-segb:hover{border-color:var(--coral)}",
      H + ".ac-segb.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 13%,var(--surface))}",
      H + ".ac-presets{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
      H + ".ac-p{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;font:inherit;cursor:pointer;padding:11px;border-radius:12px;border:1.5px solid var(--line);background:var(--surface-2);color:var(--text);min-height:58px}",
      H + ".ac-p b{font-size:13px}",
      H + ".ac-p span{font-size:10.5px;color:var(--muted);font-weight:600;line-height:1.3}",
      H + ".ac-p:hover{border-color:var(--coral)}",
      H + ".ac-p.on{border-color:var(--coral);background:color-mix(in srgb,var(--coral) 10%,var(--surface));box-shadow:0 0 0 1px var(--coral) inset}",
      H + ".ac-sl{margin-bottom:13px}",
      H + ".ac-slh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:4px}",
      H + ".ac-slv{font-size:14.5px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}",
      H + ".ac-range{width:100%;accent-color:var(--coral);height:26px}",
      H + ".ac-toggles{display:flex;flex-direction:column;gap:8px}",
      H + ".ac-tog{display:flex;gap:9px;align-items:flex-start;font-size:12.5px;color:var(--text);line-height:1.4;cursor:pointer;min-height:28px}",
      H + ".ac-tog input{width:18px;height:18px;margin:0;accent-color:var(--coral);flex:0 0 auto}",
      H + ".ac-reg{margin-top:11px}",
      H + ".ac-regn{display:block;font-size:11px;font-weight:800;color:var(--muted);margin-bottom:6px}",
      H + ".ac-chips{display:flex;flex-wrap:wrap;gap:6px}",
      H + ".ac-chip{display:inline-flex;align-items:baseline;gap:5px;font:inherit;cursor:pointer;padding:7px 10px;min-height:36px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface-2);color:var(--text)}",
      H + ".ac-chip b{font-size:12px;letter-spacing:.02em}",
      H + ".ac-chip span{font-size:10.5px;color:var(--muted);font-weight:600}",
      H + ".ac-chip:hover{border-color:var(--coral)}",
      H + ".ac-chip.on{background:#0e1b2c;border-color:#0e1b2c;color:#fff;box-shadow:inset 0 -2px 0 #f2b84b}",
      H + ".ac-chip.on span{color:#c7d4e2}",
      ":root[data-theme=\"dark\"] " + H + ".ac-chip.on{background:#f2b84b;border-color:#f2b84b;color:#1a1204}",
      ":root[data-theme=\"dark\"] " + H + ".ac-chip.on span{color:#3d2a06}",
      H + ".ac-link{display:inline-block;margin:-4px 0 14px;font-size:12px;font-weight:700;color:var(--coral)}",
      H + ".ac-adv{font:inherit;font-size:12px;font-weight:700;color:var(--muted);background:none;border:0;padding:6px 0;cursor:pointer;text-decoration:underline}",
      H + ".ac-det{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px;padding-top:11px;border-top:1px solid var(--line)}",
      H + ".ac-det .ac-note{grid-column:1/-1;margin:0}",
      H + ".ac-f{display:flex;flex-direction:column;gap:4px}",
      H + ".ac-in{font:inherit;font-size:16px;font-weight:700;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 9px;width:100%;box-sizing:border-box}",
      /* answer */
      H + ".ac-answer{background:linear-gradient(130deg,#0e1b2c 0%,#16294a 70%,#22304a 100%);border-color:rgba(242,184,75,.45)}",
      H + ".ac-answer .ac-pill{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:4px 10px}",
      H + ".ac-ahead{display:flex;gap:13px;align-items:center;margin-top:12px}",
      H + ".ac-abadge{flex:0 0 auto;width:52px;height:52px;border-radius:15px;display:grid;place-items:center;color:#fff;box-shadow:0 0 0 3px rgba(242,184,75,.45)}",
      H + ".ac-answer .ac-big{margin:0;color:#fff;font-size:28px;line-height:1.1}",
      "@media (max-width:560px){" + H + ".ac-answer .ac-big{font-size:22px}}",
      H + ".ac-answer .ac-bigsub{margin:4px 0 0;color:#f5c75a;font-size:14px;font-weight:700}",
      H + ".ac-answer .ac-verdict{margin:12px 0 0;color:#fff;font-size:13.5px;font-weight:700;line-height:1.5}",
      H + ".ac-answer .ac-made{margin:3px 0 0;color:#c7d4e2;font-size:12px;line-height:1.5}",
      H + ".ac-rank{display:flex;flex-direction:column;gap:7px;margin-top:15px}",
      H + ".ac-row{display:flex;gap:10px;align-items:center;padding:9px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04)}",
      H + ".ac-row.win{border-color:rgba(242,184,75,.6);background:rgba(242,184,75,.1)}",
      H + ".ac-row.off{opacity:.5}",
      H + ".ac-rdot{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff}",
      H + ".ac-rmid{flex:1;min-width:0}",
      H + ".ac-rtop{display:flex;justify-content:space-between;gap:8px;align-items:baseline}",
      H + ".ac-rtop b{font-size:13px;color:#fff}",
      H + ".ac-rval{font-size:13.5px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}",
      H + ".ac-row.off .ac-rval{font-size:10.5px;font-weight:700;color:#9fb2c7}",
      H + ".ac-row.win .ac-rval{color:#f5c75a}",
      H + ".ac-rtrack{height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;margin:6px 0 4px}",
      H + ".ac-rtrack i{display:block;height:100%;border-radius:4px;transition:width .25s}",
      H + ".ac-rsub{display:block;font-size:10.5px;color:#9fb2c7;font-variant-numeric:tabular-nums}",
      H + ".ac-answer .ac-foot{margin:12px 0 0;font-size:11px;color:#9fb2c7;line-height:1.5}",
      /* compare */
      H + ".ac-cmp{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
      "@media (max-width:620px){" + H + ".ac-cmp{grid-template-columns:1fr}}",
      H + ".ac-cmpc{border:1px solid var(--line);border-top:4px solid var(--cc);border-radius:12px;padding:11px;background:var(--surface-2)}",
      H + ".ac-cmpc.win{box-shadow:0 0 0 1px color-mix(in srgb,var(--cc) 40%,transparent)}",
      H + ".ac-cmph{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:8px}",
      H + ".ac-cmph b{font-size:13.5px;color:var(--text)}",
      H + ".ac-cmph span{font-size:13px;font-weight:800;color:var(--cc);white-space:nowrap}",
      H + ".ac-line{padding:8px 0;border-top:1px dashed var(--line)}",
      H + ".ac-line.zero .ac-linel," + H + ".ac-line.zero .ac-linev{color:var(--muted)}",
      H + ".ac-linet{display:flex;justify-content:space-between;gap:8px}",
      H + ".ac-linel{font-size:12px;font-weight:700;color:var(--text);line-height:1.35}",
      H + ".ac-linev{font-size:12px;color:var(--text);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
      H + ".ac-linen{display:block;font-size:10.5px;color:var(--muted);margin-top:2px;line-height:1.4}",
      H + ".ac-tot{display:flex;justify-content:space-between;gap:8px;padding-top:8px;border-top:1.5px solid var(--line);font-size:12px;color:var(--text)}",
      H + ".ac-tot b{text-align:right;font-variant-numeric:tabular-nums}",
      /* how it works */
      H + ".ac-h2{margin:0 0 12px;font-size:17px;font-weight:800;color:var(--text)}",
      H + ".ac-rules{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}",
      "@media (max-width:860px){" + H + ".ac-rules{grid-template-columns:1fr 1fr}}",
      H + ".ac-rule{border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--surface-2)}",
      H + ".ac-rulen{display:grid;place-items:center;width:24px;height:24px;border-radius:8px;background:#0e1b2c;color:#f5c75a;font-weight:800;font-size:12px;margin-bottom:8px}",
      H + ".ac-rule b{display:block;font-size:13px;color:var(--text);margin-bottom:3px}",
      H + ".ac-rule p{margin:0;font-size:11.5px;color:var(--muted);line-height:1.5}",
      H + ".ac-chal{display:grid;grid-template-columns:1fr 1.1fr;gap:18px;align-items:center;margin-top:14px;padding:16px;border-radius:14px;background:linear-gradient(130deg,#0e1b2c,#1b2f4f)}",
      "@media (max-width:760px){" + H + ".ac-chal{grid-template-columns:1fr}}",
      H + ".ac-kicker{font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:#f5c75a}",
      H + ".ac-chalt h4{margin:4px 0 6px;font-size:18px;color:#fff}",
      H + ".ac-chalt p{margin:0 0 8px;font-size:12.5px;color:#dce6f1;line-height:1.55}",
      H + ".ac-chalt p.ac-fine{font-size:11px;color:#9fb2c7;margin:0}",
      H + ".ac-ladder{display:grid;grid-template-columns:repeat(10,1fr);gap:4px;align-items:end;height:150px}",
      H + ".ac-lstep{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}",
      H + ".ac-lstep i{display:block;width:100%;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#f5c75a,#e8824c)}",
      H + ".ac-lv{font-size:9px;font-weight:800;color:#f5c75a;margin-bottom:3px;font-variant-numeric:tabular-nums;white-space:nowrap}",
      "@media (max-width:420px){" + H + ".ac-lv{font-size:7.5px}}",
      H + ".ac-ln{font-size:10px;font-weight:700;color:#9fb2c7;margin-top:4px}",
      H + ".ac-lcap{display:block;text-align:center;font-size:10.5px;color:#9fb2c7;margin-top:6px}",
      H + ".ac-shared{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin-top:14px}",
      H + ".ac-shared>b{font-size:12px;color:var(--text);margin-right:3px}",
      H + ".ac-sharedi{font-size:11.5px;font-weight:700;color:var(--text);padding:6px 11px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line)}",
      /* six cards */
      H + ".ac-six-wrap{margin-bottom:14px}",
      H + ".ac-six{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:10px}",
      "@media (max-width:1100px){" + H + ".ac-six{grid-template-columns:1fr 1fr}}",
      "@media (max-width:640px){" + H + ".ac-six{grid-template-columns:1fr}}",
      H + ".ac-cc{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);overflow:hidden}",
      H + ".ac-cc.best{border-color:#f2b84b;box-shadow:0 0 0 2px rgba(242,184,75,.45),var(--shadow)}",
      H + ".ac-cc.off{opacity:.62}",
      H + ".ac-band{position:relative;display:flex;gap:11px;align-items:center;padding:15px 14px;color:#fff;background:linear-gradient(135deg,var(--cc),color-mix(in srgb,var(--cc) 55%,#0e1b2c))}",
      H + ".ac-band .ac-ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.18);flex:0 0 auto}",
      H + ".ac-band h4{margin:0;font-size:15.5px;color:#fff;line-height:1.2}",
      H + ".ac-band span{font-size:11px;color:rgba(255,255,255,.85);font-weight:600}",
      H + ".ac-band .ac-bestp{position:absolute;top:9px;right:10px;font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:3px 8px}",
      H + ".ac-ccb{padding:13px 14px 14px;display:flex;flex-direction:column;flex:1}",
      H + ".ac-who{align-self:flex-start;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;color:var(--muted);background:var(--surface-2);border:1px solid var(--line)}",
      H + ".ac-who.res{color:var(--cc);border-color:color-mix(in srgb,var(--cc) 40%,var(--line))}",
      H + ".ac-perks{margin:10px 0 12px;padding-left:17px;font-size:12px;color:var(--text);line-height:1.5}",
      H + ".ac-perks li{margin-bottom:5px}",
      H + ".ac-perks li::marker{color:var(--cc)}",
      H + ".ac-dlist{margin-top:auto;padding-top:11px;border-top:1px solid var(--line)}",
      H + ".ac-dhead{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin-bottom:7px}",
      H + ".ac-dhead b{font-size:11.5px;color:var(--text)}",
      H + ".ac-dhead span{font-size:11px;font-weight:800;color:var(--cc);white-space:nowrap}",
      H + ".ac-dchips{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}",
      H + ".ac-d{text-align:center;font-size:11px;font-weight:800;padding:5px 0;border-radius:7px;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);letter-spacing:.02em}",
      H + ".ac-d.on{color:#fff;background:var(--cc);border-color:var(--cc)}",
      /* fine print */
      H + ".ac-sec{border:1px solid var(--line);border-radius:var(--radius,16px);background:var(--surface);box-shadow:var(--shadow);margin-bottom:10px}",
      H + ".ac-secs{cursor:pointer;list-style:none;padding:14px 16px;font-size:13.5px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:9px;min-height:44px;box-sizing:border-box}",
      H + ".ac-secs::-webkit-details-marker{display:none}",
      H + ".ac-secs:before{content:'';width:8px;height:8px;border-right:2px solid var(--coral);border-bottom:2px solid var(--coral);transform:rotate(-45deg);transition:transform .15s}",
      H + ".ac-sec[open] .ac-secs:before{transform:rotate(45deg)}",
      H + ".ac-secb{padding:0 16px 14px}",
      H + ".ac-list{margin:0 0 10px;padding-left:17px;font-size:12.5px;color:var(--text);line-height:1.55}",
      H + ".ac-list li{margin-bottom:6px}",
      H + ".ac-src{font-size:11.5px;color:var(--muted)}"
    ].join("\n");
    document.head.appendChild(s);
  }

  window.HRT_COMMUNITIES = {
    _test: { compute: compute, state: state, COMMUNITIES: COMMUNITIES, CUMUL: CUMUL, PRESETS: PRESETS, perRoundTrip: perRoundTrip },
    show: function () {
      styles();
      host = document.getElementById("ac-host");
      if (host && !host.getAttribute("data-ready")) { host.setAttribute("data-ready", "1"); paint(); }
    }
  };
})();
