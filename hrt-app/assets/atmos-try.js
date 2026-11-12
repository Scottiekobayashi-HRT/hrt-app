/* ---------------------------------------------------------------------------
   atmos-try.js - "Try the Atmos Reward Calendar" (Nov 12, Scottie)

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
  /* Routes shown in the picker, locked. The real calendar covers about 15. */
  var LOCKED_TO = [["LAX", "Los Angeles"], ["LAS", "Las Vegas"], ["JFK", "New York"], ["SEA", "Seattle"], ["SFO", "San Francisco"],
    ["ANC", "Anchorage"], ["KIX", "Osaka"], ["NRT", "Tokyo Narita"], ["SAN", "San Diego"], ["PDX", "Portland"]];
  var MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hawaiiToday() { return new Date(Date.now() - 10 * 3600e3).toISOString().slice(0, 10); }
  function parts(iso) { var p = String(iso).split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function iso(y, m, d) { return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d; }
  function addDays(isoS, n) { var p = parts(isoS), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return t.toISOString().slice(0, 10); }
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
    list.forEach(function (t) { days[t.date] = { miles: t.miles, seats: t.seats || 0, nonstop: !!t.nonstop, tier: t.miles <= min ? "great" : "decent" }; });
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

  function monthHtml(data, y, m) {
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var g = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(function (d) { return '<span class="at-dow">' + d + "</span>"; }).join("");
    for (var i = 0; i < first; i++) g += "<span></span>";
    var allLocked = iso(y, m, 1) > data.end;
    for (var d = 1; d <= n; d++) {
      var key = iso(y, m, d), info = data.days[key];
      if (key < data.start) g += '<span class="at-d none">' + d + "</span>";
      else if (key > data.end) g += '<span class="at-d locked" aria-hidden="true">' + d + "</span>";
      else if (info) g += '<button type="button" class="at-d ' + info.tier + '" data-at="' + key + '" aria-label="' + esc(MS[m - 1] + " " + d + ", " + info.miles.toLocaleString("en-US") + " points") + '">' + d + "<small>" + k(info.miles) + "</small></button>";
      else g += '<span class="at-d none" title="No saver deal this day">' + d + "</span>";
    }
    return '<div class="at-m"><h3>' + MON[m - 1] + " " + y + '</h3><div class="at-g">' + g + "</div>" +
      (allLocked ? '<div class="at-veil"><b>&#128274; ' + MON[m - 1] + " and beyond</b><span>HRT PRO shows about 270 days out.</span>" + unlockBtn() + "</div>" : "") + "</div>";
  }

  function html(data) {
    var to = '<option value="HND" selected>' + esc(ROUTE.city) + " (HND)</option>" + LOCKED_TO.map(function (t) { return '<option value="' + t[0] + '">&#128274; ' + esc(t[1]) + " (" + t[0] + ")</option>"; }).join("");
    var upd = data.updated ? (function () { var p = parts(data.updated); return MS[p.m - 1] + " " + p.d; })() : "";
    return '<div class="at-card">' +
      '<div class="at-h"><h2>Try it: <span>Honolulu to Tokyo Haneda</span></h2><span class="at-pill">Free to try</span></div>' +
      '<p class="at-sub">The real Atmos award space from this morning, for one route, economy, the next ' + data.win + " days. Tap a green or yellow day. HRT PRO opens every route, both directions, business and first class, about 270 days out.</p>" +
      '<div class="at-ctrl">' +
      '<label class="at-f"><small>Depart from</small><select data-atlock="from"><option selected>Honolulu (HNL)</option><option>&#128274; Tokyo Haneda (HND)</option><option>&#128274; Los Angeles (LAX)</option></select></label>' +
      '<label class="at-f"><small>To</small><select data-atlock="to">' + to + "</select></label>" +
      '<label class="at-f"><small>Cabin</small><select data-atlock="cabin"><option selected>Economy</option><option>&#128274; Business</option><option>&#128274; First</option></select></label>' +
      '<label class="at-f"><small>Airline</small><select data-atlock="air"><option selected>Any airline</option><option>&#128274; Hawaiian only</option><option>&#128274; Alaska only</option></select></label></div>' +
      '<div class="at-legend"><span><i style="background:#9fd6b1"></i>Lowest price this month</span><span><i style="background:#efd27c"></i>Saver deal</span><span><i style="background:rgba(120,130,145,.3)"></i>No deal that day</span>' +
      "<span>" + data.count + " deal days in the next " + data.win + (upd ? " · updated " + upd : "") + "</span></div>" +
      '<div class="at-lockmsg" id="atLockMsg"><span><b>That one is for HRT PRO.</b> Unlock every route, the return trip, business and first class, and about 270 days out.</span>' + unlockBtn() + "</div>" +
      '<div class="at-months">' + data.months.map(function (mm) { return monthHtml(data, mm[0], mm[1]); }).join("") + "</div>" +
      '<div class="at-detail" id="atDetail"></div>' +
      '<p class="at-foot">Award space changes all day. Always confirm on alaskaair.com before you book or transfer points.</p></div>';
  }

  function detail(data, key) {
    var info = data.days[key], box = document.getElementById("atDetail"); if (!info || !box) return;
    var p = parts(key), wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
    box.innerHTML = "<b>" + wd + ", " + MS[p.m - 1] + " " + p.d + ": Honolulu to Tokyo Haneda</b>" +
      "<p>" + info.miles.toLocaleString("en-US") + " Atmos points one way in economy" + (info.nonstop ? ", nonstop" : "") +
      (info.seats ? ", " + (info.seats >= 9 ? "9 or more seats" : info.seats + (info.seats === 1 ? " seat" : " seats")) : "") + ". " +
      (info.tier === "great" ? "That is the lowest price this month." : "") + "</p>" +
      '<p>With HRT PRO you would also see the return dates, business class on this route and every other route from Hawaiʻi.</p>' +
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
      host.addEventListener("click", function (e) { var d = e.target.closest("[data-at]"); if (d) detail(data, d.getAttribute("data-at")); });
      host.addEventListener("change", function (e) {
        var s = e.target.closest("[data-atlock]"); if (!s) return;
        if (s.selectedIndex !== 0) { var m = document.getElementById("atLockMsg"); if (m) { m.classList.add("on"); m.scrollIntoView({ block: "nearest", behavior: "smooth" }); } s.selectedIndex = 0; }
      });
    }).catch(function () {});
  }

  window.HRT_ATMOS_TRY = { show: mount, _test: { build: build, addDays: addDays, ROUTE: ROUTE } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
