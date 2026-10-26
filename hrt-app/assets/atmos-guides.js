/* ---------------------------------------------------------------------------
   atmos-guides.js - the "what is this?" guides under the two Atmos calculators.

   Scottie, Oct 26 2026: people landing here may never have heard of Choose
   to Earn or Communities. Each calculator gets a bold, visual explainer
   underneath, always visible, so the page makes sense before and after the
   questions.

   - #as-guide (Choose to Earn): what it is in two sentences, then three
     infographics (distance, price, segments) that run the SAME two example
     trips so the difference is obvious, then a one-line "which to pick".
   - #ac-guide (Communities): what they are, a four-step how-it-works line,
     the six Communities as bold tiles led by their headline number, and
     what every Community includes.

   After a calculator answers, it calls HRT_ATMOS_GUIDE.mark(kind, key) and
   the matching panel or tile is tagged "Your best match".

   Facts: Choose to Earn rates from alaskaair.com choose-how-you-earn (read
   Oct 7 2026). Community facts are the same as atmos-communities.js.
   Loads after atmos-communities.js. Exposes window.HRT_ATMOS_GUIDE.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function svgEl(markup) { var w = el("div", "ag-art"); w.innerHTML = markup; return w; }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }

  /* Official Atmos pages (links read from alaskaair.com's Communities page,
     Oct 26 2026). We link out so members can read the full rules and each
     Bonus Points Challenge list on Atmos itself. */
  var LINKS = {
    communities: "https://www.alaskaair.com/atmosrewards/content/benefits/2026-updates/communities",
    choose:      "https://www.alaskaair.com/atmosrewards/content/earn-points/choose-how-you-earn",
    huakai:      "https://www.hawaiianairlines.com/content/huakai",
    families:    "https://www.alaskaair.com/atmosrewards/content/families-on-the-go",
    global:      "https://www.alaskaair.com/atmosrewards/content/global-locals",
    culinary:    "https://www.alaskaair.com/atmosrewards/content/culinary-journeys",
    active:      "https://www.alaskaair.com/atmosrewards/content/active-escapes",
    club49:      "https://www.alaskaair.com/atmosrewards/content/club-49"
  };
  var EXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  /* A link that opens the official page in a new tab, with a clear icon. */
  function extLink(text, url, cls) {
    var a = el("a", "ag-ext" + (cls ? " " + cls : ""));
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    a.appendChild(el("span", null, text));
    var i = el("span", "ag-exti"); i.innerHTML = EXT; a.appendChild(i);
    a.setAttribute("aria-label", text + " (opens in a new tab)");
    return a;
  }
  function scrollToTool(id) {
    var t = document.getElementById(id);
    if (!t) return;
    try { t.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { t.scrollIntoView(); }
  }

  /* ======================= Choose to Earn ======================= */

  /* Photos: free Unsplash photos (Unsplash License), hotlinked. Distance: wing
     over the ocean. Price: boarding passes. Segments: Diamond Head from the air.

     Two example round trips from Honolulu, used by all three panels.
     Miles: HNL-OGG about 100 each way, HNL-LAX 2,556 each way.
     Fares are typical examples, before taxes and fees. */
  var TRIPS = [
    { name: "Honolulu to Maui", miles: 200, fare: 160, flights: 2 },
    { name: "Honolulu to Los Angeles", miles: 5112, fare: 420, flights: 2 }
  ];
  var WAYS = [
    { key: "distance", color: "#5c7fa3", photo: "photo-1758537697408-87849d0baffc", name: "By distance", rule: "1 point per mile",
      plain: "The farther you fly, the more you earn.",
      best: "Best for long flights on cheaper fares.",
      calc: function (t) { return t.miles; },
      how: function (t) { return fmt(t.miles) + " miles"; } },
    { key: "price", color: "#0b7fc0", photo: "photo-1655722724447-2d2a3071e7f8", name: "By price", rule: "5 points per dollar",
      plain: "The more your ticket costs, the more you earn.",
      best: "Best for a mix of trip lengths, or premium and Exit Row seats.",
      calc: function (t) { return t.fare * 5; },
      how: function (t) { return "$" + fmt(t.fare) + " fare"; } },
    { key: "segment", color: "#d4722f", photo: "photo-1581720488341-a02fe8d6575d", name: "By segments", rule: "500 points per flight",
      plain: "Every flight counts the same, short or long.",
      best: "Best for short hops, like island flights.",
      calc: function (t) { return t.flights * 500; },
      how: function (t) { return t.flights + " flights"; } }
  ];

  /* Hand-drawn style pictures, one per way to earn. Pure SVG, no images. */
  var ART = {
    distance:
      '<svg viewBox="0 0 280 120" role="img" aria-label="A flight path from Honolulu to Los Angeles, measured in miles">' +
      '<path d="M34 92 C 90 18, 190 18, 246 92" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" opacity=".9"/>' +
      '<circle cx="34" cy="92" r="7" fill="#fff"/><circle cx="246" cy="92" r="7" fill="#fff"/>' +
      '<text x="34" y="114" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">HNL</text>' +
      '<text x="246" y="114" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">LAX</text>' +
      '<g transform="translate(140 34) rotate(8)"><path d="M14 4v-2L4 -4v-6A1.6 1.6 0 0 0 0 -10a1.6 1.6 0 0 0 -1.6 1.6V-4l-10 6v2l10-3v5.6l-2.4 1.8V10l4-1.2L4 10V8.4L1.6 6.6V1z" fill="#fff" transform="scale(1.5)"/></g>' +
      '<rect x="96" y="58" width="88" height="26" rx="13" fill="rgba(255,255,255,.18)"/>' +
      '<text x="140" y="76" text-anchor="middle" fill="#fff" font-size="13" font-weight="800">2,556 miles</text></svg>',
    price:
      '<svg viewBox="0 0 280 120" role="img" aria-label="A plane ticket showing the fare in dollars">' +
      '<g transform="translate(40 18)"><path d="M0 10a10 10 0 0 1 10-10h180a10 10 0 0 1 10 10v20a14 14 0 0 0 0 28v20a10 10 0 0 1-10 10H10A10 10 0 0 1 0 78V58a14 14 0 0 0 0-28z" fill="#fff"/>' +
      '<path d="M140 8v72" stroke="#0b7fc0" stroke-width="2" stroke-dasharray="4 5"/>' +
      '<text x="22" y="34" fill="#0b7fc0" font-size="12" font-weight="800">FARE</text>' +
      '<text x="20" y="66" fill="#0b4f7a" font-size="32" font-weight="800">$420</text>' +
      '<text x="170" y="40" text-anchor="middle" fill="#0b7fc0" font-size="24" font-weight="800">x5</text>' +
      '<text x="170" y="62" text-anchor="middle" fill="#0b4f7a" font-size="11" font-weight="700">points</text></g></svg>',
    segment:
      '<svg viewBox="0 0 280 120" role="img" aria-label="Three flights, each earning the same 500 points">' +
      [40, 140, 240].map(function (x, i) {
        return '<g transform="translate(' + x + ' 50)">' +
          '<circle r="30" fill="rgba(255,255,255,.16)"/>' +
          '<path d="M14 4v-2L4 -4v-6A1.6 1.6 0 0 0 0 -10a1.6 1.6 0 0 0 -1.6 1.6V-4l-10 6v2l10-3v5.6l-2.4 1.8V10l4-1.2L4 10V8.4L1.6 6.6V1z" fill="#fff" transform="scale(1.35)"/>' +
          '<text y="52" text-anchor="middle" fill="#fff" font-size="15" font-weight="800">500</text>' +
          (i < 2 ? '<path d="M38 0h24" stroke="#fff" stroke-width="2.5" stroke-dasharray="2 6" stroke-linecap="round"/>' : '') +
          '</g>';
      }).join("") + '</svg>'
  };

  function earnGuide() {
    var sec = el("section", "ag ag-earn");
    sec.id = "as-guide-top";

    var head = el("div", "ag-head");
    head.appendChild(el("h2", "ag-h", "What is Choose to Earn?"));
    head.appendChild(el("p", "ag-lead", "Every flight on Alaska, Hawaiian and their partners earns two kinds of points: points you spend on award flights, and status points that decide your elite tier (Silver starts at 20,000). From Jan 1 2027, Atmos Rewards lets you choose how both are counted, in one of three ways."));
    var facts = el("ul", "ag-facts");
    ["Pick one in your Atmos Rewards account", "Change it once a year", "Do nothing and you stay on distance"].forEach(function (f) { facts.appendChild(el("li", null, f)); });
    head.appendChild(facts);
    head.appendChild(extLink("Read Choose how you earn on Atmos Rewards", LINKS.choose, "on-dark"));
    sec.appendChild(head);

    var max = 0;
    WAYS.forEach(function (w) { TRIPS.forEach(function (t) { max = Math.max(max, w.calc(t)); }); });

    var grid = el("div", "ag-ways");
    WAYS.forEach(function (w) {
      var p = el("article", "ag-way");
      p.dataset.key = w.key;
      p.style.setProperty("--wc", w.color);
      var top = el("div", "ag-waytop");
      top.style.backgroundImage = "linear-gradient(180deg, color-mix(in srgb, " + w.color + " 10%, transparent) 0%, color-mix(in srgb, " + w.color + " 30%, transparent) 40%, color-mix(in srgb, " + w.color + " 90%, #1b2430) 100%), url('https://images.unsplash.com/" + w.photo + "?auto=format&fit=crop&w=800&q=70')";
      top.setAttribute("role", "img"); top.setAttribute("aria-label", w.name + ", " + w.rule);
      top.appendChild(el("span", "ag-match", "Your best match"));
      top.appendChild(svgEl(ART[w.key]));
      p.appendChild(top);
      var b = el("div", "ag-wayb");
      b.appendChild(el("h3", "ag-wayn", w.name));
      b.appendChild(el("p", "ag-rule", w.rule));
      b.appendChild(el("p", "ag-plain", w.plain));
      var ex = el("div", "ag-ex");
      TRIPS.forEach(function (t) {
        var v = w.calc(t);
        var row = el("div", "ag-exr");
        var lab = el("div", "ag-exl");
        lab.appendChild(el("span", null, t.name));
        lab.appendChild(el("b", null, fmt(v)));
        row.appendChild(lab);
        var bar = el("div", "ag-exbar"); var f = el("i"); f.style.width = Math.max(2, v / max * 100) + "%";
        bar.appendChild(f); row.appendChild(bar);
        row.appendChild(el("span", "ag-exhow", w.how(t) + ", round trip"));
        ex.appendChild(row);
      });
      b.appendChild(ex);
      b.appendChild(el("p", "ag-best", w.best));
      p.appendChild(b);
      grid.appendChild(p);
    });
    sec.appendChild(grid);

    var foot = el("div", "ag-foot");
    var ft = el("div");
    ft.appendChild(el("b", null, "Which one is right for you?"));
    ft.appendChild(el("p", null, "Island hoppers usually win with segments. Long trips on sale fares favor distance. First class and pricey tickets favor price. Your card spending earns the same either way."));
    foot.appendChild(ft);
    var btn = el("button", "ag-btn", "Find my best option");
    btn.type = "button";
    btn.addEventListener("click", function () { scrollToTool("v-status"); });
    foot.appendChild(btn);
    sec.appendChild(foot);
    sec.appendChild(el("p", "ag-fine", "Points shown for the example round trips, before any elite bonus. Award flights earn status points only. Example fares exclude taxes and fees, which never count. Saver and Basic Economy fares earn nothing on any of the three."));
    return sec;
  }

  /* ======================= Communities ======================= */

  /* The headline number for each Community: the one thing to remember. */
  var HEADLINE = {
    huakai:   { big: "50%", line: "more points and status points on flights between the islands, from Jan 1 2027",
                more: ["Two free checked bags between the islands, surfboards included", "A 10% off island fare code every three months, 20% with an Atmos or Hawaiian card"] },
    club49:   { big: "2 bags", line: "checked free for you and up to 7 others on trips that include Alaska",
                more: ["Two Travel Now discounts a year: 30% off last minute fares", "Ship up to 100 lbs within Alaska for $49"] },
    global:   { big: "10%", line: "more status points on flights that start or end outside the U.S.",
                more: ["1 status point for every 25 points you transfer in from Bilt or Marriott", "Bonus points for flying to oneworld hub cities like Tokyo, London and Sydney"] },
    families: { big: "20%", line: "of the points back on award seats for kids 12 and under",
                more: ["Works on Alaska, Hawaiian and partner award flights", "Bonus points for family favorites like Orlando, San Diego and Tokyo"] },
    culinary: { big: "20% off", line: "food and wine experiences you book with Atmos points",
                more: ["Bonus points for flying to food cities like Tokyo, Austin and New York", "Best if your trips are planned around where to eat"] },
    active:   { big: "20% off", line: "outdoor experiences you book with Atmos points",
                more: ["Bonus points for national park gateways like Bozeman, Jackson Hole and Kona", "Partner offers, including AllTrails"] }
  };
  /* Ranked for Hawaiʻi travelers (Scottie, Oct 26 2026): the top three first,
     Club 49 last because it needs an Alaska address. */
  var ORDER = ["huakai", "families", "global", "culinary", "active", "club49"];

  /* Free photos from Unsplash (Unsplash License: free for commercial use, no
     credit required), hotlinked from images.unsplash.com. Swap any id here. */
  var PHOTO = {
    huakai:   "photo-1553301139-3c610dd5b1cb",  /* Na Pali coast, Kauaʻi */
    families: "photo-1475503572774-15a45e5d60b9",  /* parents and child on the shore */
    global:   "photo-1573455494060-c5595004fb6c",  /* Tokyo alley with red lanterns */
    culinary: "photo-1547573854-74d2a71d0826",  /* shared table of dishes */
    active:   "photo-1549221838-126dc3ebf29f",  /* Yosemite valley */
    club49:   "photo-1593326101816-dd0c165b3ef1"   /* Alaska lake and mountains */
  };
  var RES_NOTE = { huakai: "Hawaiʻi residents only", club49: "Alaska residents only" };
  function photoUrl(k, w) { return "https://images.unsplash.com/" + PHOTO[k] + "?auto=format&fit=crop&w=" + w + "&q=70"; }

  function commGuide() {
    var data = (window.HRT_COMMUNITIES && window.HRT_COMMUNITIES.data) || null;
    if (!data) return el("div");
    var byKey = {}; data.COMMUNITIES.forEach(function (c) { byKey[c.key] = c; });

    var sec = el("section", "ag ag-comm");
    var head = el("div", "ag-head");
    head.appendChild(el("h2", "ag-h", "What are Atmos Communities?"));
    head.appendChild(el("p", "ag-lead", "Communities are free groups inside Atmos Rewards, the Alaska and Hawaiian Airlines loyalty program. Each one gives extra perks to a certain kind of traveler, so the right one depends on how you travel."));
    head.appendChild(extLink("See all six Communities on Atmos Rewards", LINKS.communities, "on-dark"));
    sec.appendChild(head);

    var steps = el("ol", "ag-steps");
    [["Join for free", "Sign in to Atmos Rewards and choose Join a Community."],
     ["Pick just one", "You belong to one Community at a time."],
     ["Fly and collect", "Its perks apply on the day you fly, plus bonus points for visiting its 10 places."],
     ["Switch once a year", "If your travel changes, you can move to another one."]].forEach(function (s) {
      var li = el("li", "ag-step");
      li.appendChild(el("b", null, s[0]));
      li.appendChild(el("span", null, s[1]));
      steps.appendChild(li);
    });
    sec.appendChild(steps);

    function group(title, sub, keys, big) {
      var g = el("div", "ag-group");
      var gh = el("div", "ag-gh");
      gh.appendChild(el("h3", null, title));
      gh.appendChild(el("span", null, sub));
      g.appendChild(gh);
      var grid = el("div", "ag-tiles " + (big ? "ag-top" : "ag-rest"));
      keys.forEach(function (k, idx) {
        var c = byKey[k], h = HEADLINE[k];
        if (!c || !h) return;
        var t = el("article", "ag-tile");
        t.dataset.key = k;
        t.style.setProperty("--cc", c.color);
        var band = el("div", "ag-tband");
        band.style.backgroundImage = "linear-gradient(180deg, color-mix(in srgb, " + c.color + " 18%, transparent) 0%, color-mix(in srgb, " + c.color + " 55%, transparent) 45%, color-mix(in srgb, " + c.color + " 92%, #1b2430) 100%), url('" + photoUrl(k, big ? 900 : 700) + "')";
        band.setAttribute("role", "img");
        band.setAttribute("aria-label", c.name);
        band.appendChild(el("span", "ag-match", "Your best match"));
        if (big) band.appendChild(el("span", "ag-rank", String(idx + 1)));
        if (RES_NOTE[k]) band.appendChild(el("span", "ag-res", RES_NOTE[k]));
        var bt = el("div", "ag-btext");
        bt.appendChild(el("h4", "ag-tname", c.name));
        bt.appendChild(el("span", "ag-ttag", c.tag));
        band.appendChild(bt);
        t.appendChild(band);
        var body = el("div", "ag-tbody");
        body.appendChild(el("b", "ag-big", h.big));
        body.appendChild(el("p", "ag-bigl", h.line));
        var ul = el("ul", "ag-tmore");
        h.more.forEach(function (m) { ul.appendChild(el("li", null, m)); });
        body.appendChild(ul);
        body.appendChild(extLink((k === "huakai" ? "Full details on Hawaiian Airlines" : "Full details on Atmos Rewards") + ", including its 10 challenge places", LINKS[k], "tile"));
        t.appendChild(body);
        grid.appendChild(t);
      });
      g.appendChild(grid);
      return g;
    }
    sec.appendChild(group("Top picks for Hawaiʻi travelers", "Where most of our members get the most value", ORDER.slice(0, 3), true));
    sec.appendChild(group("The other three", "Worth it if your travel fits", ORDER.slice(3), false));

    var every = el("div", "ag-every");
    var ev = el("div", "ag-evtext");
    ev.appendChild(el("h3", null, "Every Community also includes"));
    var ul = el("ul");
    ["A Bonus Points Challenge: up to 10,000 bonus points and 10,000 status points for flying to its 10 places by Dec 31 2027",
     "Flight deals sent by email",
     "20% off Atmos Rewards Unlocked experiences"].forEach(function (x) { ul.appendChild(el("li", null, x)); });
    ev.appendChild(ul);
    ev.appendChild(el("p", "ag-evnote", "Each Community has its own 10 places. Open its Atmos page above to see the list and the full challenge rules."));
    every.appendChild(ev);
    var lad = el("div", "ag-lad");
    var steps10 = [100, 200, 300, 400, 500, 750, 1000, 1250, 2500, 3000];
    var row = el("div", "ag-ladbars");
    steps10.forEach(function (v) {
      var col = el("span", "ag-ladc");
      var i = el("i"); i.style.height = (10 + v / 3000 * 90) + "%";
      col.appendChild(i);
      row.appendChild(col);
    });
    lad.appendChild(row);
    lad.appendChild(el("span", "ag-ladcap", "Each new place pays more: 100 points for the 1st, 3,000 for the 10th"));
    every.appendChild(lad);
    sec.appendChild(every);

    var foot = el("div", "ag-foot");
    var ft = el("div");
    ft.appendChild(el("b", null, "Not sure which one fits you?"));
    ft.appendChild(el("p", null, "Answer a few quick questions and we will work out what each one is worth to you in dollars."));
    foot.appendChild(ft);
    var btn = el("button", "ag-btn", "Find my best Community");
    btn.type = "button";
    btn.addEventListener("click", function () { scrollToTool("v-communities"); });
    foot.appendChild(btn);
    sec.appendChild(foot);
    return sec;
  }

  /* ======================= shared ======================= */

  function css() {
    if (document.getElementById("ag-css")) return;
    var s = document.createElement("style"); s.id = "ag-css";
    s.textContent = [
      ".ag{margin:28px 0 8px}",
      ".ag-head{position:relative;overflow:hidden;border-radius:var(--radius,16px);padding:26px 26px 24px;color:#fff;background:#1b2430;margin-bottom:16px}",
      "@media (max-width:560px){.ag-head{padding:20px 18px}}",
      ".ag .ag-h{position:relative;margin:0;font-size:28px;font-weight:800;line-height:1.15;color:#fff}",
      "@media (max-width:560px){.ag .ag-h{font-size:23px}}",
      ".ag .ag-lead{position:relative;margin:10px 0 0;max-width:64ch;font-size:15px;line-height:1.55;color:#d3dbe5}",
      ".ag-facts{position:relative;list-style:none;margin:16px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px}",
      ".ag-facts li{font-size:13px;font-weight:700;color:#fff;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16)}",
      /* the three ways */
      ".ag-ways{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}",
      "@media (max-width:900px){.ag-ways{grid-template-columns:1fr}}",
      ".ag-way{display:flex;flex-direction:column;overflow:hidden;border-radius:var(--radius,16px);background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}",
      ".ag-waytop{position:relative;background-color:var(--wc);background-size:cover;background-position:center;padding:22px 14px 14px;min-height:230px;display:flex;align-items:flex-end}",
      ".ag-waytop .ag-art{width:100%;max-width:78%;margin:0 auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}",
      ".ag-art svg{display:block;width:100%;height:auto;max-height:130px}",
      ".ag-art text{font-family:'DM Sans',sans-serif}",
      ".ag-wayb{display:flex;flex-direction:column;padding:16px 18px 18px;flex:1}",
      ".ag .ag-wayn{margin:0;font-size:14px;font-weight:800;color:var(--wc)}",
      ".ag .ag-rule{margin:2px 0 0;font-family:'sofia-pro','Montserrat','DM Sans',sans-serif;font-size:26px;font-weight:800;line-height:1.1;color:var(--text)}",
      ".ag .ag-plain{margin:6px 0 0;font-size:14px;color:var(--muted);line-height:1.45}",
      ".ag-ex{margin:16px 0 0;padding-top:14px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:12px}",
      ".ag-exl{display:flex;justify-content:space-between;gap:8px;align-items:baseline;font-size:13.5px;color:var(--text)}",
      ".ag-exl b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}",
      ".ag-exbar{height:10px;border-radius:6px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line);margin-top:5px;overflow:hidden}",
      ".ag-exbar i{display:block;height:100%;border-radius:6px;background:var(--wc)}",
      ".ag-exhow{display:block;font-size:12px;color:var(--muted);margin-top:3px}",
      ".ag .ag-best{margin:16px 0 0;padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:700;color:var(--text);background:color-mix(in srgb,var(--wc) 11%,var(--surface))}",
      /* best match tag, shown after the calculator answers */
      ".ag-match{display:none;position:absolute;top:10px;left:10px;z-index:2;font-size:11.5px;font-weight:800;color:#1b2430;background:#fff;border-radius:999px;padding:4px 10px;box-shadow:0 2px 8px rgba(0,0,0,.18)}",
      ".ag-way.is-best .ag-match,.ag-tile.is-best .ag-match{display:inline-block}",
      ".ag-way.is-best,.ag-tile.is-best{border-color:var(--coral);box-shadow:0 0 0 2px var(--coral),var(--shadow)}",
      /* footer row */
      ".ag-foot{display:flex;align-items:center;gap:16px;margin-top:16px;padding:18px 20px;border-radius:var(--radius,16px);background:var(--surface);border:1px solid var(--line)}",
      "@media (max-width:640px){.ag-foot{flex-direction:column;align-items:stretch}}",
      ".ag-foot>div{flex:1}",
      ".ag-foot b{font-size:15.5px;color:var(--text)}",
      ".ag-foot p{margin:4px 0 0;font-size:13.5px;color:var(--muted);line-height:1.5}",
      ".ag-btn{flex:0 0 auto;min-height:48px;padding:0 22px;font:inherit;font-size:15px;font-weight:800;cursor:pointer;border:0;border-radius:12px;color:#fff;background:var(--coral)}",
      ".ag-btn:hover{background:var(--coral-d,#c05f32)}",
      ".ag .ag-fine{margin:12px 2px 0;font-size:12px;color:var(--muted);line-height:1.5}",
      /* communities: how it works */
      ".ag-steps{list-style:none;counter-reset:ag;margin:0 0 22px;padding:0;display:grid;grid-template-columns:repeat(4,1fr);gap:0}",
      "@media (max-width:820px){.ag-steps{grid-template-columns:1fr 1fr;row-gap:18px}}",
      ".ag-step{counter-increment:ag;position:relative;padding:44px 14px 0 0}",
      ".ag-step:before{content:counter(ag);position:absolute;left:0;top:0;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:15px;color:#fff;background:#1b2430;z-index:1}",
      ".ag-step:after{content:'';position:absolute;left:34px;right:0;top:16px;border-top:2px dashed color-mix(in srgb,var(--coral) 60%,var(--line))}",
      ".ag-step:last-child:after{display:none}",
      "@media (max-width:820px){.ag-step:nth-child(2):after{display:none}}",
      ":root[data-theme=\"dark\"] .ag-step:before{background:var(--coral)}",
      ".ag-step b{display:block;font-size:15px;color:var(--text)}",
      ".ag-step span{display:block;margin-top:3px;font-size:13px;color:var(--muted);line-height:1.45}",
      /* communities: the six */
      ".ag-group{margin-bottom:18px}",
      ".ag-gh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 10px}",
      ".ag-gh h3{margin:0;font-size:17px;font-weight:800;color:var(--text)}",
      ".ag-gh span{font-size:13px;color:var(--muted)}",
      ".ag-tiles{display:grid;gap:14px}",
      ".ag-top{grid-template-columns:repeat(3,1fr)}",
      ".ag-rest{grid-template-columns:repeat(3,1fr)}",
      "@media (max-width:980px){.ag-top,.ag-rest{grid-template-columns:1fr 1fr}}",
      "@media (max-width:620px){.ag-top,.ag-rest{grid-template-columns:1fr}}",
      ".ag-tile{display:flex;flex-direction:column;overflow:hidden;border-radius:var(--radius,16px);background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow)}",
      ".ag-tband{position:relative;display:flex;align-items:flex-end;min-height:210px;padding:16px 18px;color:#fff;background-color:var(--cc);background-size:cover;background-position:center}",
      ".ag-rest .ag-tband{min-height:160px}",
      ".ag-btext{position:relative;text-shadow:0 1px 10px rgba(0,0,0,.35)}",
      ".ag-tband .ag-match{left:auto;right:10px}",
      ".ag-rank{position:absolute;top:12px;left:14px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:16px;color:#1b2430;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2)}",
      ".ag-res{position:absolute;top:14px;right:12px;font-size:12px;font-weight:700;color:#fff;padding:4px 10px;border-radius:999px;background:rgba(27,36,48,.55);border:1px solid rgba(255,255,255,.35)}",
      ".ag-tile.is-best .ag-res{display:none}",
      ".ag .ag-tname{margin:0;font-size:21px;font-weight:800;line-height:1.15;color:#fff}",
      ".ag-rest .ag-tname{font-size:18px}",
      ".ag-ttag{display:block;margin-top:3px;font-size:13.5px;color:rgba(255,255,255,.92)}",
      ".ag-tbody{padding:16px 18px 18px;flex:1}",
      ".ag-big{display:block;font-family:'sofia-pro','Montserrat','DM Sans',sans-serif;font-size:40px;font-weight:800;line-height:1;color:var(--cc)}",
      ":root[data-theme=\"dark\"] .ag-big{color:color-mix(in srgb,var(--cc) 70%,#fff)}",
      ".ag .ag-bigl{margin:6px 0 0;font-size:14px;font-weight:600;color:var(--text);line-height:1.45}",
      ".ag-tmore{margin:12px 0 0;padding:12px 0 0 17px;border-top:1px solid var(--line);font-size:13px;color:var(--muted);line-height:1.5}",
      ".ag-tmore li{margin-bottom:5px}",
      ".ag-tmore li::marker{color:var(--cc)}",
      /* every community */
      ".ag-every{display:grid;grid-template-columns:1.3fr 1fr;gap:22px;align-items:center;padding:20px 22px;border-radius:var(--radius,16px);background:#1b2430;color:#fff}",
      "@media (max-width:760px){.ag-every{grid-template-columns:1fr}}",
      ".ag-evtext h3{margin:0 0 8px;font-size:17px;font-weight:800;color:#fff}",
      ".ag-evtext ul{margin:0;padding-left:18px;font-size:14px;line-height:1.55;color:#d3dbe5}",
      ".ag-evtext li{margin-bottom:6px}",
      ".ag-evtext li::marker{color:var(--coral)}",
      ".ag-ladbars{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;align-items:end;height:110px}",
      ".ag-ladc{display:flex;align-items:flex-end;height:100%}",
      ".ag-ladc i{display:block;width:100%;border-radius:4px 4px 1px 1px;background:var(--coral)}",
      ".ag-ladcap{display:block;margin-top:8px;font-size:12.5px;color:#b9c4d1;text-align:center}",
      ".hero .ag-jump{position:relative;z-index:2;margin-top:10px;padding:6px 0;min-height:36px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;background:none;border:0;color:#fff;text-decoration:underline;text-decoration-color:var(--coral);text-decoration-thickness:2px;text-underline-offset:4px}",
      ".hero .ag-jump:hover{color:#ffd9c4}",
      ".hrt-app .ag-ext{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:700;line-height:1.35;color:var(--coral);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:3px;min-height:36px}",
      ".hrt-app .ag-ext:hover{color:var(--coral-d,#c05f32)}",
      ".ag-exti{display:inline-flex;flex:0 0 auto}",
      ".hrt-app .ag-ext.on-dark{position:relative;margin-top:14px;color:#fff;text-decoration-color:var(--coral)}",
      ".hrt-app .ag-ext.on-dark:hover{color:#ffd9c4}",
      ".ag-tbody{display:flex;flex-direction:column}",
      ".hrt-app .ag-ext.tile{margin-top:auto;padding-top:12px;font-size:13px;color:var(--cc)}",
      ":root[data-theme=\"dark\"] .hrt-app .ag-ext.tile{color:color-mix(in srgb,var(--cc) 60%,#fff)}",
      ".ag .ag-evnote{margin:10px 0 0;font-size:13px;color:#b9c4d1}",
      "@media (prefers-reduced-motion:reduce){.ag *{transition:none!important}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  var built = { earn: false, comm: false };
  function mount(kind) {
    css();
    var id = kind === "earn" ? "as-guide" : "ac-guide";
    var host = document.getElementById(id);
    if (!host || built[kind]) return;
    built[kind] = true;
    host.appendChild(kind === "earn" ? earnGuide() : commGuide());
  }

  /* Tag the matching panel after a calculator answers; key null clears it. */
  function mark(kind, key) {
    var host = document.getElementById(kind === "earn" ? "as-guide" : "ac-guide");
    if (!host) return;
    host.querySelectorAll(kind === "earn" ? ".ag-way" : ".ag-tile").forEach(function (n) {
      n.classList.toggle("is-best", !!key && n.dataset.key === key);
    });
  }

  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".ag-jump");
    if (b) scrollToTool(b.getAttribute("data-ag"));
  });

  window.HRT_ATMOS_GUIDE = { mount: mount, mark: mark, links: LINKS, extLink: extLink, _test: { WAYS: WAYS, TRIPS: TRIPS, HEADLINE: HEADLINE, ORDER: ORDER } };
})();
