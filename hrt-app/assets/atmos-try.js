/* ---------------------------------------------------------------------------
   atmos-try.js - "Try Scottie’s Atmos Points Calendar" (Nov 12, Scottie)

   Free Subscribers and ʻOhana Members can touch the calendar before they buy:
   one route (HNL to Tokyo Haneda), economy, the next 30 days, laid out like
   the real calendar (month grid, green / yellow days, tap a day for details).
   Every other route, the return, business and first, and the months past the
   30 days are visible but locked behind "Unlock with HRT PRO".

   Data: the same public feed the Deals, News, Flights wall reads
   (marketing_deals.json, rebuilt every morning on the Mac). Nothing new is
   pulled and the calendar project itself is not touched. The feed only lists
   deal-priced dates, so other days in the 30 show as "no deal".

   Shows on the Atmos page for anyone without HRT PRO (the .as-free block).
   Exposes window.HRT_ATMOS_TRY._test for node tests.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var FEED = "https://hrt-calendar-pro.pages.dev/marketing_deals.json";
  var ROUTE = { o: "HNL", d: "HND", city: "Tokyo Haneda" };
  var PRICE = "prc_atmos-monthly-zec10c3r";
  /* The real calendar's 15 destinations from Honolulu, in its own order (read Nov 12).
     Only HND is open here; the rest show locked. */
  var DESTS = [["SEA", "Seattle"], ["PDX", "Portland"], ["SFO", "San Francisco"], ["LAX", "Los Angeles"], ["SAN", "San Diego"], ["LGB", "Long Beach"],
    ["LAS", "Las Vegas"], ["PHX", "Phoenix"], ["SLC", "Salt Lake City"], ["JFK", "New York-JFK"], ["ANC", "Anchorage"], ["HND", "Tokyo-Haneda"],
    ["KIX", "Osaka"], ["MNL", "Manila"], ["SYD", "Sydney"]];
  /* The real calendar's price tiers for HNL to Tokyo Haneda in economy (read Nov 12):
     Great up to 30,000, Decent up to 35,000, High above. */
  var TIERS = { great: 30000, decent: 35000 };
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hawaiiToday() { return new Date(Date.now() - 10 * 3600e3).toISOString().slice(0, 10); }
  function parts(iso) { var p = String(iso).split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function iso(y, m, d) { return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d; }
  function addDays(isoS, n) { var p = parts(isoS), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return t.toISOString().slice(0, 10); }
  function tierOf(m) { return m <= TIERS.great ? "great" : m <= TIERS.decent ? "decent" : "high"; }
  function k(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace(/\.0$/, "") + "k" : String(n); }

  /* Pure: the try-out data for one route from the feed.
     Returns { days: { "YYYY-MM-DD": { miles, seats, nonstop, tier } }, start, end, min, months: [[y,m],...] } */
  function build(feed, route, today) {
    today = today || hawaiiToday();
    var win = (feed && feed.window_days) || 30;
    var end = addDays(today, win - 1);
    var r = (feed && feed.economy || []).filter(function (x) { return x.origin === route.o && x.dest === route.d; })[0];
    var days = {}, list = (r && r.dates || []).filter(function (t) { return t && t.date >= today && t.date <= end && t.miles > 0; });
    var min = list.length ? Math.min.apply(null, list.map(function (t) { return t.miles; })) : 0;
    list.forEach(function (t) { days[t.date] = { miles: t.miles, seats: t.seats || 0, nonstop: !!t.nonstop, tier: tierOf(t.miles) }; });
    var a = parts(today), b = parts(end), months = [[a.y, a.m]];
    if (a.y !== b.y || a.m !== b.m) months.push([b.y, b.m]);
    var nx = b.m === 12 ? [b.y + 1, 1] : [b.y, b.m + 1];
    months.push(nx); /* one more month, locked, to show there is more */
    return { days: days, start: today, end: end, min: min, months: months, count: list.length, win: win, updated: feed && feed.updated, image: r && r.image };
  }

  var CSS = [
    "#atTry{margin:4px 0 18px}",
    "#atTry .at-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius,16px);box-shadow:var(--shadow);padding:18px}",
    "#atTry .at-h{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:4px}",
    "#atTry .at-h h2{margin:0;font-size:20px;color:var(--text)}#atTry .at-h h2 span{color:#d97040}",
    "#atTry .at-pill{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;background:#2f855a;color:#fff;border-radius:999px;padding:3px 9px}",
    "#atTry .at-sub{margin:0 0 14px;color:var(--muted);font-size:14px;line-height:1.5}",
    "#atTry .at-ctrl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}",
    "#atTry .at-f{border:1px solid var(--line);border-radius:12px;padding:8px 12px;background:var(--surface-2,#f7f9fb)}",
    "#atTry .at-f small{display:block;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}",
    "#atTry .at-f select{font:inherit;font-size:14px;font-weight:700;border:0;background:none;color:var(--text);width:100%;padding:2px 0;cursor:pointer}",
    "#atTry .at-legend{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:12.5px;color:var(--muted);margin:0 0 12px}",
    "#atTry .at-legend i{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:5px;vertical-align:-1px}",
    "#atTry .at-months{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}",
    "#atTry .at-m{border:1px solid var(--line);border-radius:14px;padding:12px;position:relative;overflow:hidden}",
    "#atTry .at-m h3{margin:0 0 8px;font-size:15px;color:var(--text)}",
    "#atTry .at-g{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}",
    "#atTry .at-dow{font-size:10.5px;font-weight:700;color:var(--muted);text-align:center}",
    "#atTry .at-d{min-height:44px;border-radius:8px;border:1px solid transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--muted);background:none;padding:2px;font-family:inherit}",
    "#atTry .at-d small{font-size:10.5px;font-weight:800}",
    "#atTry .at-d.none{color:var(--muted);opacity:.45}",
    "#atTry .at-d.great{background:#dff3e6;border-color:#9fd6b1;color:#1f6b3d;cursor:pointer}",
    "#atTry .at-d.decent{background:#fdf1cf;border-color:#efd27c;color:#7a5a10;cursor:pointer}",
    "#atTry .at-d.high{background:#fbe0dd;border-color:#ec9c94;color:#8f2a20;cursor:pointer}",
    "[data-theme=dark] #atTry .at-d.high{background:rgba(242,114,110,.18);color:#f4a39f;border-color:rgba(242,114,110,.4)}",
    "#atTry .at-d.conn{position:relative}#atTry .at-d.conn:after{content:'';position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:currentColor}",
    "#atTry .at-ctrl{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) minmax(0,.8fr) minmax(0,.8fr)!important;align-items:stretch}",
    "#atTry .at-swap{font:inherit;font-size:20px;font-weight:800;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:#d97040;padding:0 14px;cursor:pointer}",
    "@media (max-width:900px){#atTry .at-ctrl{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)!important}#atTry .at-ctrl .at-f.wide{grid-column:span 1}}",
    "#atTry .at-d.on{outline:2.5px solid #14202e;outline-offset:1px}",
    "#atTry .at-d.locked{background:repeating-linear-gradient(135deg,rgba(120,130,145,.08) 0 6px,rgba(120,130,145,.16) 6px 12px);color:transparent}",
    "[data-theme=dark] #atTry .at-d.great{background:rgba(63,206,127,.18);color:#8fe0b4;border-color:rgba(63,206,127,.4)}[data-theme=dark] #atTry .at-d.decent{background:rgba(242,184,75,.16);color:#f2c56b;border-color:rgba(242,184,75,.4)}",
    "#atTry .at-veil{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:14px;background:rgba(20,32,46,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);color:#fff}",
    "#atTry .at-veil b{font-size:14px}",
    "#atTry .at-detail{margin-top:14px;border-radius:14px;padding:14px 16px;background:linear-gradient(135deg,#14202e,#1b2f4a);color:#fff;display:none}",
    "#atTry .at-detail.on{display:block}#atTry .at-detail b{font-size:17px}#atTry .at-detail p{margin:6px 0 0;color:#c7d4e2;font-size:13.5px;line-height:1.5}",
    "#atTry .at-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
    "#atTry .at-btn{font:inherit;font-size:13px;font-weight:800;border-radius:999px;padding:9px 14px;border:0;cursor:pointer;text-decoration:none;background:rgba(255,255,255,.12);color:#fff}",
    "#atTry .at-btn.gold{background:linear-gradient(135deg,#f5c75a,#d97040);color:#1a1204}",
    "#atTry .at-lockmsg{margin-top:12px;border:1px dashed #f2b84b;border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);display:none}",
    "#atTry .at-lockmsg.on{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}",
    "#atTry .at-foot{margin:12px 0 0;font-size:12.5px;color:var(--muted)}",
    "@media (max-width:900px){#atTry .at-months{grid-template-columns:1fr}#atTry .at-ctrl{grid-template-columns:repeat(2,minmax(0,1fr))}}"
  ].join("");

  function unlockBtn(label) { return '<button type="button" class="at-btn gold" data-ms-price:add="' + PRICE + '">' + esc(label || "Unlock with HRT PRO") + "</button>"; }

  var stops = "best";
  function shown(info) { return info && (stops === "best" || (stops === "nonstop" ? info.nonstop : !info.nonstop)); }
  function monthHtml(data, y, m) {
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var g = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (d) { return '<span class="at-dow">' + d + "</span>"; }).join("");
    for (var i = 0; i < first; i++) g += "<span></span>";
    var allLocked = iso(y, m, 1) > data.end;
    for (var d = 1; d <= n; d++) {
      var key = iso(y, m, d), info = data.days[key];
      if (key < data.start) g += '<span class="at-d none">' + d + "</span>";
      else if (key > data.end) g += '<span class="at-d locked" aria-hidden="true">' + d + "</span>";
      else if (shown(info)) g += '<button type="button" class="at-d ' + info.tier + (info.nonstop ? "" : " conn") + '" data-at="' + key + '" aria-label="' + esc(MS[m - 1] + " " + d + ", " + info.miles.toLocaleString("en-US") + " points") + '">' + d + "<small>" + k(info.miles) + "</small></button>";
      else g += '<span class="at-d none" title="' + (info ? "Hidden by your Flights filter" : "No saver space this day") + '">' + d + "</span>";
    }
    return '<div class="at-m"><h3>' + MON[m - 1] + " " + y + '</h3><div class="at-g">' + g + "</div>" +
      (allLocked ? '<div class="at-veil"><b>&#128274; ' + MON[m - 1] + " and beyond</b><span>HRT PRO shows about 270 days out.</span>" + unlockBtn() + "</div>" : "") + "</div>";
  }

  function html(data) {
    var to = DESTS.map(function (t) { return t[0] === ROUTE.d ? '<option value="HND" selected>' + t[0] + " · " + esc(t[1]) + "</option>" : '<option value="' + t[0] + '">&#128274; ' + t[0] + " · " + esc(t[1]) + "</option>"; }).join("");
    var upd = data.updated ? (function () { var p = parts(data.updated); return MS[p.m - 1] + " " + p.d; })() : "";
    return '<div class="at-card">' +
      '<div class="at-h"><h2>Try it: <span>Honolulu to Tokyo Haneda</span></h2><span class="at-pill">Free to try</span></div>' +
      '<p class="at-sub">The real Atmos award space from this morning, for one route, economy, the next ' + data.win + " days. Tap any colored day. HRT PRO opens all 15 routes from Honolulu, the trip back with the swap button, business class, and about 270 days out.</p>" +
      '<div class="at-ctrl">' +
      '<label class="at-f"><small>Depart from</small><select data-atlock="from"><option selected>HNL · Honolulu</option></select></label>' +
      '<button type="button" class="at-swap" data-atswap title="Swap: flights back to Hawaiʻi" aria-label="Swap direction, flights back to Hawaiʻi">&#8646;</button>' +
      '<label class="at-f"><small>To</small><select data-atlock="to">' + to + "</select></label>" +
      '<label class="at-f"><small>Cabin class</small><select data-atlock="cabin"><option selected>Economy</option><option>&#128274; Business</option></select></label>' +
      '<label class="at-f"><small>Flights</small><select data-atstops><option value="best" selected>Best deals</option><option value="nonstop">Nonstop</option><option value="conn">Connections</option></select></label>' +
      "</div>" + /* no Airline filter (Scottie, Nov 12) */
      '<div class="at-legend"><span><i style="background:#9fd6b1"></i>Great &le; 30,000</span><span><i style="background:#efd27c"></i>Decent &le; 35,000</span><span><i style="background:#ec9c94"></i>High &gt; 35,000</span>' +
      '<span>priced in Atmos points · a dot means a connection (1 stop) · faded day means no saver space</span>' +
      "<span>" + data.count + " deal days in the next " + data.win + (upd ? " · updated " + upd : "") + "</span></div>" +
      '<div class="at-lockmsg" id="atLockMsg"><span id="atLockTxt"><b>That one is for HRT PRO.</b> Unlock all 15 routes, the trip back to Hawaiʻi, business class, and about 270 days out.</span>' + unlockBtn() + "</div>" +
      '<div class="at-months" id="atMonths">' + data.months.map(function (mm) { return monthHtml(data, mm[0], mm[1]); }).join("") + "</div>" +
      '<div class="at-detail" id="atDetail"></div>' +
      '<p class="at-foot">Award space changes all day. Always confirm on alaskaair.com before you book or transfer points.</p></div>';
  }

  function detail(data, key) {
    var info = data.days[key], box = document.getElementById("atDetail"); if (!info || !box) return;
    var p = parts(key), wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
    box.innerHTML = "<b>" + wd + ", " + MS[p.m - 1] + " " + p.d + ": Honolulu to Tokyo Haneda</b>" +
      "<p>" + info.miles.toLocaleString("en-US") + " Atmos points one way in economy" + (info.nonstop ? ", nonstop" : ", with a connection (1 stop)") +
      (info.seats ? ", " + (info.seats >= 9 ? "9 or more seats" : info.seats + (info.seats === 1 ? " seat" : " seats")) : "") + ". " +
      (info.tier === "great" ? "That is a Great price for this route (30,000 or less)." : info.tier === "decent" ? "That is a Decent price for this route (35,000 or less)." : "") + "</p>" +
      '<p>With HRT PRO you would also see the flights back to Honolulu, business class on this route and all 15 routes from Hawaiʻi.</p>' +
      '<div class="at-acts"><a class="at-btn" href="https://www.alaskaair.com/" target="_blank" rel="noopener">Check it on alaskaair.com</a>' + unlockBtn("Unlock the full calendar") + "</div>";
    box.classList.add("on");
    Array.prototype.forEach.call(document.querySelectorAll("#atTry .at-d.on"), function (b) { b.classList.remove("on"); });
    var b = document.querySelector('#atTry [data-at="' + key + '"]'); if (b) b.classList.add("on");
  }

  var mounted = false;
  function mount() {
    if (mounted) return;
    var host = document.getElementById("atTry"); if (!host) return;
    mounted = true;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    fetch(FEED, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (feed) {
      var data = build(feed, ROUTE);
      if (!data.count) return; /* no data this morning: show nothing rather than an empty calendar */
      host.innerHTML = html(data);
      host.hidden = false;
      function lockMsg(txt) {
        var m = document.getElementById("atLockMsg"), t = document.getElementById("atLockTxt"); if (!m) return;
        if (txt) t.innerHTML = txt;
        m.classList.add("on"); m.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      host.addEventListener("click", function (e) {
        var d = e.target.closest("[data-at]"); if (d) { detail(data, d.getAttribute("data-at")); return; }
        if (e.target.closest("[data-atswap]")) lockMsg("<b>Flights back to Hawaiʻi are in HRT PRO.</b> Tap the swap button there to track Tokyo Haneda to Honolulu, and every other route home.");
      });
      host.addEventListener("change", function (e) {
        var st = e.target.closest("[data-atstops]"); if (!st) return;
        stops = st.value;
        var box = document.getElementById("atMonths"); if (box) box.innerHTML = data.months.map(function (mm) { return monthHtml(data, mm[0], mm[1]); }).join("");
        var det = document.getElementById("atDetail"); if (det) det.classList.remove("on");
      });
      host.addEventListener("change", function (e) {
        var s = e.target.closest("[data-atlock]"); if (!s) return;
        var def = 0; Array.prototype.forEach.call(s.options, function (o, i) { if (o.defaultSelected) def = i; });
        if (s.selectedIndex !== def) {
          var m = document.getElementById("atLockMsg"), t = document.getElementById("atLockTxt");
          if (t) t.innerHTML = "<b>That one is for HRT PRO.</b> Unlock all 15 routes, the trip back to Hawaiʻi, business class, and about 270 days out.";
          if (m) { m.classList.add("on"); m.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
          s.selectedIndex = def;
        }
      });
    }).catch(function () {});
  }

  window.HRT_ATMOS_TRY = { show: mount, _test: { build: build, addDays: addDays, ROUTE: ROUTE, tierOf: tierOf, DESTS: DESTS } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
