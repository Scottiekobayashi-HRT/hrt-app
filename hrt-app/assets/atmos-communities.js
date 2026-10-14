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
      function add(label, pts, status, cash, note, kind) {
        lines.push({ label: label, pts: pts || 0, status: status || 0, cash: cash || 0, note: note || "", kind: kind || "", n: n });
      }
      add("Bonus Points Challenge, " + n + " of 10 destinations", CUMUL[n], CUMUL[n], 0,
        n ? "Your picks on its list: " + hits.join(", ") : "None of the places you picked are on its list", "challenge");

      if (cm.key === "huakai") {
        var trips = num(s.island);
        var base = perRoundTrip(s.earn, s.niMiles, s.niFare) * trips;
        add("50% more on " + fmt(trips) + " interisland round trips", base * 0.5, base * 0.5, 0,
          "Earning by " + EARN[s.earn].label.toLowerCase() + ", " + fmt(base) + " points before the bonus", "island");
        var b = Math.min(2, Math.round(num(s.bags)));
        var perWay = (b >= 1 && !s.freeBag ? FEES.niFirst : 0) + (b >= 2 ? FEES.niSecond : 0);
        add("Free checked bags between the islands", 0, 0, perWay * 2 * trips,
          b ? b + (b === 1 ? " bag" : " bags") + " each way, for you" + (s.freeBag ? ", first bag already free with your card" : "") : "You said you do not check bags", "nibags");
        var uses = Math.min(4, Math.ceil(trips));
        var pct = s.card === "none" ? 0.10 : 0.20;
        add("Quarterly Neighbor Island fare code", 0, 0, uses * pct * num(s.niFare) * party,
          uses + (uses === 1 ? " code" : " codes") + " at " + Math.round(pct * 100) + "% off a booking for " + party + (party === 1 ? " person" : " people"), "code");
        if (s.foodland) add("Foodland Maikaʻi points at 3x", 3000, 0, 0, "Up to 3,000 bonus points a year, if you convert regularly", "foodland");
      }
      if (cm.key === "global") {
        var ib = perRoundTrip(s.earn, s.intlMiles, s.intlFare) * num(s.intl);
        add("10% more status points on " + fmt(num(s.intl)) + " international round trips", 0, ib * 0.1, 0,
          "Status points only, on flights that start or end outside the U.S.", "intl");
        var tr = num(s.transfer);
        add("Status points on points you transfer in", 0, Math.floor(tr / 25), 0,
          tr ? fmt(tr) + " points from Bilt or Marriott, 1 status point per 25" : "You did not plan any transfers", "transfer");
      }
      if (cm.key === "families") {
        var kids = Math.min(7, Math.round(num(s.kids)));
        var spent = kids * num(s.kidTrips) * num(s.kidPts);
        add("20% back on kids' award seats", spent * 0.2, 0, 0,
          kids ? fmt(spent) + " points on " + kids + (kids === 1 ? " child" : " children") + " 12 and under" : "No kids 12 and under on award seats", "kids");
      }
      if (cm.key === "club49" && eligible) {
        var ak = num(s.akTrips);
        var bb = Math.min(2, Math.round(num(s.bags)));
        var way = (bb >= 1 ? FEES.mlFirst : 0) + (bb >= 2 ? FEES.mlSecond : 0);
        var people = Math.min(8, party);
        add("Free checked bags on trips that include Alaska", 0, 0, way * 2 * ak * people,
          fmt(ak) + " round trips, " + people + (people === 1 ? " traveler" : " travelers"), "akbags");
        add("Two Travel Now discounts", 0, 0, Math.min(2, ak) * 0.3 * num(s.akFare),
          "30% off a refundable one-way fare, if you book within 4 days", "travelnow");
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

  /* ======================= the screens =======================
     One question at a time, then one clear answer. Everything else
     (the math, fine tuning, the six, the rules) is folded away. */
  var Q = window.HRT_QUIZ;
  var ICO = {
    home: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
    mount: '<path d="M3 19 9 8l4 6 3-4 5 9Z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
    one: '<circle cx="12" cy="7" r="3"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>',
    two: '<circle cx="8.5" cy="7.5" r="2.6"/><circle cx="16" cy="7.5" r="2.6"/><path d="M3.5 19.5v-1.5a5 5 0 0 1 10 0v1.5M13 13.3a5 5 0 0 1 7.5 4.2v2"/>',
    fam: '<circle cx="7" cy="6.5" r="2.3"/><circle cx="17" cy="6.5" r="2.3"/><circle cx="12" cy="11" r="1.8"/><path d="M3 19v-3.5a4 4 0 0 1 8 0M13 15.5a4 4 0 0 1 8 0V19M9.5 19v-1.5a2.5 2.5 0 0 1 5 0V19"/>',
    group: '<circle cx="6" cy="8" r="2"/><circle cx="12" cy="6.5" r="2.2"/><circle cx="18" cy="8" r="2"/><path d="M2.5 18v-1a3.5 3.5 0 0 1 7 0M8 18v-1.5a4 4 0 0 1 8 0V18M14.5 17a3.5 3.5 0 0 1 7 0v1"/>'
  };
  var POPULAR = {
    HI: ["HNL", "OGG", "KOA", "LIH", "ITO", "LAX", "SFO", "SAN", "LAS", "PHX", "HND", "NRT", "ICN", "SYD", "CUN", "JFK"],
    AK: ["KOA", "LAS", "PHX", "PSP", "SJD", "PVR", "LAX", "SFO", "SAN", "JFK", "SYD", "NRT", "CUN", "SBA", "FLL", "DEN"],
    other: ["LAX", "SFO", "SAN", "LAS", "PHX", "JFK", "ORD", "DEN", "MCO", "KOA", "OGG", "HNL", "CUN", "NRT", "LHR", "SYD"]
  };

  /* Questions answered so far; nothing is highlighted until it is answered. */
  state.ans = state.ans || {};
  state.step = 0; state.done = false; state.allPlaces = false;
  state.dests = {};

  function steps() {
    var s = ["home"];
    if (state.home === "HI") s.push("island");
    if (state.home === "AK") s.push("akTrips");
    s.push("party");
    if (state.party >= 3) s.push("kids");
    s.push("intl", "places");
    return s;
  }

  function pick(key, value) {
    state[key] = value; state.ans[key] = true;
    if (key === "party" && value < 3) state.kids = 0;
    if (key === "kids") state.kidTrips = value > 0 ? (state.kidTrips || 2) : 0;
    setTimeout(function () { go(state.step + 1); }, 140);
  }
  function go(i) {
    var n = steps().length;
    if (i >= n) { state.done = true; } else { state.step = Math.max(0, i); state.done = false; }
    paint();
    if (state.done) try { host.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) {}
  }

  var QS = {
    home: function () { return { title: "Where do you live?", hint: "Two of the six Communities are only for residents.",
      key: "home", options: [
        { value: "HI", label: "Hawaiʻi", sub: "Huakaʻi is open to you", icon: ICO.home },
        { value: "AK", label: "Alaska", sub: "Club 49 is open to you", icon: ICO.mount },
        { value: "other", label: "Somewhere else", sub: "Four Communities are open to you", icon: ICO.globe }] }; },
    island: function () { return { title: "How often do you fly between the islands?", hint: "Count round trips, like Honolulu to Maui and back.",
      key: "island", options: [
        { value: 0, label: "Rarely or never" },
        { value: 3, label: "A few times a year", sub: "2 to 4 round trips" },
        { value: 8, label: "Every other month", sub: "6 to 10 round trips" },
        { value: 15, label: "Monthly or more", sub: "12 or more round trips" }] }; },
    akTrips: function () { return { title: "How many trips a year include Alaska?", hint: "Round trips that start, end or stop in Alaska.",
      key: "akTrips", options: [
        { value: 0, label: "None" }, { value: 2, label: "One or two" },
        { value: 5, label: "Three to six" }, { value: 10, label: "More than six" }] }; },
    party: function () { return { title: "Who usually travels with you?", hint: "The people on the same booking, you included.",
      key: "party", options: [
        { value: 1, label: "Just me", icon: ICO.one }, { value: 2, label: "Two of us", icon: ICO.two },
        { value: 4, label: "Family of 3 or 4", icon: ICO.fam }, { value: 6, label: "5 or more", icon: ICO.group }] }; },
    kids: function () { return { title: "How many are kids 12 and under?", hint: "Count the kids you book award seats for with points.",
      key: "kids", options: [
        { value: 0, label: "None" }, { value: 1, label: "One" },
        { value: 2, label: "Two" }, { value: 3, label: "Three or more" }] }; },
    intl: function () { return { title: "How many trips outside the U.S. this year?", hint: "Japan, Korea, Australia, Mexico, Europe and so on.",
      key: "intl", options: [
        { value: 0, label: "None" }, { value: 1, label: "One trip" },
        { value: 2, label: "Two or three" }, { value: 4, label: "Four or more" }] }; }
  };

  function placesQuestion(n, total) {
    var codes = state.allPlaces ? Object.keys(AIRPORTS) : (POPULAR[state.home] || POPULAR.other);
    var extra = el("button", "ac-moreplaces", state.allPlaces ? "Show fewer places" : "Show more places");
    extra.type = "button";
    extra.addEventListener("click", function () { state.allPlaces = !state.allPlaces; paint(); });
    return Q.question({
      n: n, total: total, compact: true, multi: true, current: state.dests,
      title: "Where are you headed by the end of 2027?",
      hint: "Tap every place you will fly to or connect through. Flying home counts, so keep HNL if you live on Oʻahu. Skip this if you are not sure.",
      options: codes.map(function (c) { return { value: c, label: c, sub: AIRPORTS[c] }; }),
      onPick: function (c) { if (state.dests[c]) delete state.dests[c]; else state.dests[c] = 1; state.ans.places = true; },
      extra: extra,
      onBack: function () { go(n - 2); },
      nextLabel: "See my answer", onNext: function () { state.ans.places = true; go(n); }
    });
  }

  function questionScreen() {
    var list = steps(), i = Math.min(state.step, list.length - 1), key = list[i];
    if (key === "places") return placesQuestion(i + 1, list.length);
    var q = QS[key]();
    return Q.question({
      n: i + 1, total: list.length, title: q.title, hint: q.hint, options: q.options,
      current: state.ans[q.key] ? state[q.key] : null,
      onPick: function (v) { pick(q.key, v); },
      onBack: i > 0 ? function () { go(i - 1); } : null
    });
  }

  /* ---------- the answer ---------- */
  function worth(l, r) { return l.pts * r.cpp / 100 + l.cash + l.status * r.cpp / 100 * Math.max(r.weight, 0.25); }
  function plain(l) {
    switch (l.kind) {
      case "challenge": return fmt(l.pts) + " bonus points from " + l.n + " of your destinations on its challenge list";
      case "island": return fmt(l.pts) + " extra points from your island trips, and the same in status points";
      case "nibags": return money(l.cash) + " saved on checked bags between the islands";
      case "code": return money(l.cash) + " off island fares with the discount code you get every three months";
      case "foodland": return "Up to 3,000 points a year from your Foodland Maikaʻi points";
      case "intl": return fmt(l.status) + " extra status points on your international trips";
      case "transfer": return fmt(l.status) + " status points from points you transfer in";
      case "kids": return fmt(l.pts) + " points back on your kids' award seats";
      case "akbags": return money(l.cash) + " saved on checked bags on Alaska trips";
      case "travelnow": return money(l.cash) + " off last minute Alaska fares";
    }
    return l.label;
  }

  function hero(r) {
    var best = r.best, sec = r.second;
    var h = el("div", "qz-hero");
    if (best.score <= 0) {
      h.appendChild(el("span", "qz-pill", "Your answer"));
      h.appendChild(el("h2", "qz-big", "Any of them, for now"));
      h.appendChild(el("p", "qz-line", "Nothing you told us earns much in any Community yet. Pick the one whose places you are most likely to visit, and come back when your plans change."));
      return h;
    }
    h.appendChild(el("span", "qz-pill", "Your best Community"));
    var row = el("div", "qz-hrow");
    var b = icon(ICON[best.c.key], 30); b.className = "qz-badge"; b.style.background = best.c.color;
    row.appendChild(b);
    var t = el("div");
    t.appendChild(el("h2", "qz-big", best.c.name));
    t.appendChild(el("p", "qz-sub", "About " + money(best.score) + " a year for you"));
    row.appendChild(t);
    h.appendChild(row);
    var gap = best.score - (sec && sec.score > 0 ? sec.score : 0);
    h.appendChild(el("p", "qz-line", sec && sec.score > 0
      ? (gap < 25 ? "A close call with " + sec.c.name + ". Either is a good pick, so go with the places you are most likely to fly."
                  : "That is about " + money(gap) + " a year more than the next best, " + sec.c.name + ".")
      : "No other Community gives you anything for the trips you described."));
    var why = best.lines.filter(function (l) { return l.pts || l.cash || l.status; })
      .sort(function (a, z) { return worth(z, r) - worth(a, r); }).slice(0, 3).map(plain);
    if (why.length) h.appendChild(Q.whyList(why));
    return h;
  }

  function rankCard(r) {
    var c = el("div", "qz-card");
    c.appendChild(el("h3", "qz-h3", "How the Communities compare for you"));
    var list = el("div", "qz-rank");
    var elig = r.ranked.filter(function (x) { return x.eligible; });
    var max = Math.max(1, elig[0] ? elig[0].score : 1);
    elig.forEach(function (x, i) {
      var row = el("div", "qz-r" + (i === 0 ? " win" : ""));
      var d = icon(ICON[x.c.key], 17); d.className = "qz-dot"; d.style.background = x.c.color;
      row.appendChild(d);
      var mid = el("div");
      mid.appendChild(el("div", "qz-rn", x.c.name));
      var tr = el("div", "qz-rt"); var f = el("i"); f.style.width = Math.max(0, x.score) / max * 100 + "%"; f.style.background = x.c.color;
      tr.appendChild(f); mid.appendChild(tr);
      row.appendChild(mid);
      row.appendChild(el("span", "qz-rv", money(Math.max(0, x.score))));
      list.appendChild(row);
    });
    c.appendChild(list);
    var off = r.all.filter(function (x) { return !x.eligible; }).map(function (x) { return x.c.name + ": " + x.c.who; });
    c.appendChild(el("p", "qz-small", "Dollar values per year, counting points at " + r.cpp.toFixed(1) + "¢ each." + (off.length ? " Not shown, " + off.join("; ") + "." : "")));
    var join = el("p", "qz-small", "To join, sign in to Atmos Rewards and choose Join a Community. It is free, and you can switch once a year.");
    c.appendChild(join);
    return c;
  }

  /* ---------- folded sections ---------- */
  function compareBody(r) {
    var a = r.best, b = r.second;
    var wrap = el("div");
    var g = el("div", "ac-cmp");
    [a, b].forEach(function (x, i) {
      if (!x) return;
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
      g.appendChild(col);
    });
    wrap.appendChild(g);
    var how = el("ul", "ac-list ac-howmath");
    ["Points are worth " + r.cpp.toFixed(1) + "¢ each, the Atmos value from our Points Valuations.",
     "Status points cannot be spent, so they count " + (r.weight === 1 ? "the same as points" : r.weight === 0 ? "for nothing" : "at half the value of points") + ", based on what you said matters to you. Change that under Fine tune.",
     "Bag savings use Alaska's published fees: $30 and $40 between the islands, $45 and $55 on the mainland.",
     "Island and international points depend on how you earn on Atmos (" + EARN[state.earn].label.toLowerCase() + ", " + EARN[state.earn].rule + "), before any elite bonus."].forEach(function (t) { how.appendChild(el("li", null, t)); });
    wrap.appendChild(how);
    return wrap;
  }

  function fineTuneBody() {
    var w = el("div", "ac-tune");
    function row(label, opts, key, hint) {
      var f = el("div", "ac-field");
      f.appendChild(el("span", "ac-lab", label));
      var g = el("div", "ac-seg");
      opts.forEach(function (o) {
        var b = el("button", "ac-segb" + (state[key] === o[0] ? " on" : ""), o[1]);
        b.type = "button"; b.setAttribute("aria-pressed", state[key] === o[0] ? "true" : "false");
        b.addEventListener("click", function () { state[key] = o[0]; paint(); });
        g.appendChild(b);
      });
      f.appendChild(g);
      if (hint) f.appendChild(el("span", "ac-hint", hint));
      w.appendChild(f);
    }
    row("What matters most to you?", [["money", "Free trips"], ["both", "Both"], ["status", "Elite status"]], "goal",
      "Decides how much status points count, since they cannot be spent.");
    row("How do you earn on Atmos?", [["segment", "Segments"], ["distance", "Distance"], ["price", "Price"]], "earn");
    var link = el("a", "ac-link", "Not sure? Try the Choose to Earn Calculator");
    link.href = "#status"; link.setAttribute("data-route", "status");
    w.appendChild(link);
    row("Checked bags each way", [[0, "None"], [1, "One"], [2, "Two"]], "bags");
    if (state.home === "HI") {
      row("Your Atmos or Hawaiian card", [["none", "None"], ["atmos", "Atmos Visa"], ["hawaiian", "Hawaiian MC"]], "card",
        "Either card doubles the Huakaʻi fare code to 20%.");
      var t = el("div", "ac-toggles");
      [["freeBag", "My card already gets me a free first bag between islands"], ["foodland", "I shop at Foodland and use Maikaʻi points"]].forEach(function (x) {
        var lab = el("label", "ac-tog");
        var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = !!state[x[0]];
        cb.addEventListener("change", function () { state[x[0]] = cb.checked; paint(); });
        lab.appendChild(cb); lab.appendChild(el("span", null, x[1]));
        t.appendChild(lab);
      });
      w.appendChild(t);
    }
    var d = el("div", "ac-det");
    var fields = [["transfer", "Points you will transfer in from Bilt or Marriott"], ["intlFare", "International fare, round trip, $"], ["niFare", "Island fare, round trip, $"]];
    if (state.kids > 0) fields.unshift(["kidTrips", "Award round trips with the kids"], ["kidPts", "Points per kid's award round trip"]);
    if (state.home === "AK") fields.push(["akFare", "Refundable one-way fare to Alaska, $"]);
    fields.forEach(function (f) {
      var lab = el("label", "ac-f");
      lab.appendChild(el("span", "ac-lab", f[1]));
      var inp = document.createElement("input");
      inp.type = "number"; inp.min = "0"; inp.inputMode = "numeric"; inp.className = "ac-in"; inp.value = state[f[0]];
      inp.addEventListener("change", function () { state[f[0]] = num(inp.value); paint(); });
      lab.appendChild(inp);
      d.appendChild(lab);
    });
    w.appendChild(d);
    return w;
  }

  function sixBody(r) {
    var w = el("div", "ac-accs");
    r.all.forEach(function (x) {
      var d = el("details", "ac-acc" + (x.eligible ? "" : " off"));
      d.style.setProperty("--cc", x.c.color);
      var s = el("summary");
      var ic = icon(ICON[x.c.key], 18); ic.className = "ac-accic";
      s.appendChild(ic);
      var t = el("span", "ac-acct");
      t.appendChild(el("b", null, x.c.name));
      t.appendChild(el("span", null, x.c.tag + (x.c.res ? ". " + x.c.who + "." : "")));
      s.appendChild(t);
      d.appendChild(s);
      var body = el("div", "ac-accb");
      var ul = el("ul", "ac-perks");
      x.c.perks.forEach(function (p) { ul.appendChild(el("li", null, p)); });
      body.appendChild(ul);
      var hh = el("div", "ac-dhead");
      hh.appendChild(el("b", null, "Its 10 challenge destinations"));
      hh.appendChild(el("span", null, x.hits.length + " on your list"));
      body.appendChild(hh);
      var chips = el("div", "ac-dchips");
      x.c.dests.forEach(function (code) {
        var on = !!state.dests[code];
        var sp = el("span", "ac-d" + (on ? " on" : ""), code); sp.title = AIRPORTS[code];
        chips.appendChild(sp);
      });
      body.appendChild(chips);
      d.appendChild(body);
      w.appendChild(d);
    });
    return w;
  }

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

  function howBody() {
    var w = el("div");
    var g = el("div", "ac-rules");
    [["Free to join", "Sign in to Atmos Rewards and choose Join a Community."],
     ["One at a time", "You belong to one Community. They do not stack."],
     ["Switch once a year", "Switching resets your challenge progress, but you keep points already earned."],
     ["The day you fly counts", "Benefits follow the Community you are in when you fly, not when you book."]].forEach(function (x, i) {
      var c = el("div", "ac-rule");
      c.appendChild(el("span", "ac-rulen", String(i + 1)));
      c.appendChild(el("b", null, x[0]));
      c.appendChild(el("p", null, x[1]));
      g.appendChild(c);
    });
    w.appendChild(g);
    var ch = el("div", "ac-chal");
    var left = el("div", "ac-chalt");
    left.appendChild(el("span", "ac-kicker", "In every Community"));
    left.appendChild(el("h4", null, "The Bonus Points Challenge"));
    left.appendChild(el("p", null, "Each Community lists 10 places. Your first flight to or through each one pays bonus points plus the same number of status points, and every new place pays more than the last."));
    left.appendChild(el("p", "ac-fine", "Oct 1 2026 to Dec 31 2027, award tickets count. All ten pays 10,000 of each, and the first member in each Community to finish gets 100,000 bonus points."));
    ch.appendChild(left);
    var right = el("div", "ac-chalg");
    right.appendChild(ladder());
    right.appendChild(el("span", "ac-lcap", "Points for your 1st to 10th place"));
    ch.appendChild(right);
    w.appendChild(ch);
    return w;
  }

  function fineBody() {
    var w = el("div");
    var ul = el("ul", "ac-list");
    ["Joining signs you up for Community emails, which is how the flight deals and codes arrive. Turning them off can cost you those deals.",
     "Huakaʻi's 50% island bonus starts with flights on Jan 1 2027. We count its free bags for you only, because the page does not say if they cover your whole booking.",
     "Families on the Go returns 20% of the points spent on the kids' seats, not taxes or fees, once the trip is done. Stay in the Community until then.",
     "Global Locals' 10% is status points only. Transfer bonus points do not earn status points.",
     "Saver and Basic Economy fares earn no flight points, so island and international bonuses assume regular fares.",
     "Every Community also gets flight deals by email, 20% off Atmos Rewards Unlocked experiences and partner offers, so those do not change the ranking.",
     "Estimates for planning only. Benefits can change, so check your Atmos Rewards account before you choose."].forEach(function (t) { ul.appendChild(el("li", null, t)); });
    w.appendChild(ul);
    var src = el("ul", "ac-list ac-src");
    COMMUNITIES.forEach(function (c) { src.appendChild(el("li", null, c.name + ": " + c.source)); });
    src.appendChild(el("li", null, "Bag fees: news.alaskaair.com, Update on bag fees, for tickets from Apr 10 2026"));
    w.appendChild(el("p", "ac-note", "Sources, checked Oct 13 2026:"));
    w.appendChild(src);
    return w;
  }

  function answerChips() {
    var list = steps().filter(function (k) { return k !== "places"; }).map(function (k, i) {
      var q = QS[k](), lab = "";
      q.options.forEach(function (o) { if (o.value === state[k]) lab = o.label; });
      var short = { home: "Home", island: "Island trips", akTrips: "Alaska trips", party: "Travel", kids: "Kids", intl: "Abroad" }[k];
      return { label: short, value: lab || "?", onEdit: function () { go(i); } };
    });
    var nP = Object.keys(state.dests).length;
    list.push({ label: "Places", value: nP ? nP + " picked" : "none", onEdit: function () { go(steps().length - 1); } });
    return Q.answers(list, function () { state.ans = {}; state.dests = {}; go(0); });
  }

  /* ---------- render ---------- */
  var host = null;
  function paint() {
    if (!host) return;
    host.innerHTML = "";
    var wrap = el("div", "qz-wrap");
    if (!state.done) {
      wrap.appendChild(questionScreen());
      wrap.appendChild(el("p", "ac-reassure", "About a minute. Nothing is saved or shared."));
    } else {
      var r = compute();
      wrap.appendChild(answerChips());
      wrap.appendChild(hero(r));
      wrap.appendChild(rankCard(r));
      wrap.appendChild(Q.more("ac-math", "See the math", "Your top two, line by line", function () { return compareBody(compute()); }));
      wrap.appendChild(Q.more("ac-tune", "Fine tune", "Your card, bags, how you earn, what matters most", fineTuneBody));
      wrap.appendChild(Q.more("ac-six", "Meet the six Communities", "What each one gives you", function () { return sixBody(compute()); }));
      wrap.appendChild(Q.more("ac-how", "How Communities work", "The rules and the bonus points challenge", howBody));
      wrap.appendChild(Q.more("ac-fine", "Fine print and sources", null, fineBody));
    }
    host.appendChild(wrap);
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
      H + ".ac-reassure{text-align:center;font-size:12.5px;color:var(--muted);margin:4px 0 0}",
      H + ".ac-moreplaces{display:block;margin:12px auto 0;font:inherit;font-size:13px;font-weight:700;color:var(--coral);background:none;border:0;cursor:pointer;padding:10px;min-height:44px}",
      H + ".ac-howmath{margin-top:14px;font-size:12.5px;color:var(--muted)}",
      H + ".ac-tune .ac-det{margin-top:4px}",
      H + ".ac-accs{display:flex;flex-direction:column;gap:8px}",
      H + ".ac-acc{border:1px solid var(--line);border-left:4px solid var(--cc);border-radius:12px;background:var(--surface-2)}",
      H + ".ac-acc.off{opacity:.6}",
      H + ".ac-acc>summary{display:flex;gap:12px;align-items:center;padding:12px 14px;cursor:pointer;list-style:none;min-height:56px;box-sizing:border-box}",
      H + ".ac-acc>summary::-webkit-details-marker{display:none}",
      H + ".ac-acc>summary:after{content:'+';margin-left:auto;font-size:20px;font-weight:700;color:var(--cc)}",
      H + ".ac-acc[open]>summary:after{content:'\\2212'}",
      H + ".ac-accic{flex:0 0 auto;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#fff;background:var(--cc)}",
      H + ".ac-acct{display:flex;flex-direction:column;gap:2px;min-width:0}",
      H + ".ac-acct b{font-size:14px;color:var(--text)}",
      H + ".ac-acct span{font-size:12px;color:var(--muted);line-height:1.4}",
      H + ".ac-accb{padding:0 14px 14px}",
      H + ".ac-accb .ac-perks{margin-top:2px}",
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
      if (window.HRT_QUIZ) window.HRT_QUIZ.css();
      styles();
      host = document.getElementById("ac-host");
      if (host && !host.getAttribute("data-ready")) { host.setAttribute("data-ready", "1"); paint(); }
    }
  };
})();
