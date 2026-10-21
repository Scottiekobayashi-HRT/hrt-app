/* ---------------------------------------------------------------------------
   bigfamily.js - HRT Big Family Finder (free tool)

   Hotel rooms in Hawaii and Japan that fit 5 or more people in one room or
   unit, with an honest note on beds (real beds, kings shared, sofa bed) and
   the points program that can book it.

   Data: data/bigfamily-rooms.js (window.HRT_BIGFAM_ROOMS), copied from the
   Google Sheet "HRT Big Family Finder Catalog". Points prices are a snapshot
   from sample dates (window.HRT_BIGFAM_POINTS_DATES), never live.

   Exposes window.HRT_BIGFAM; app.js calls .show() from onShow.bigfamily.
   Host: #bf-host. Every style is prefixed #bf-host.
   Tests: node assets/bigfamily.test.mjs
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var PLACES = {
    hawaii: ["All islands", "Oʻahu", "Maui", "Big Island", "Kauaʻi", "Lānaʻi"],
    japan: ["All of Japan", "Tokyo", "Osaka", "Kyoto", "Okinawa", "Hokkaido"]
  };
  var BEDS = {
    real: "Everyone gets a real bed",
    shared: "Real beds if you share the kings",
    sofa: "Someone sleeps on the sofa bed",
    unknown: "Bed setup not listed yet",
    extra: "Needs a paid extra bed"
  };
  var BEDS_SHORT = { real: "Real beds", shared: "Share the kings", sofa: "Sofa bed", unknown: "Not listed", extra: "Extra bed" };
  var POINTS = ["Hilton", "Marriott", "Hyatt"];
  var SORTS = [
    ["points", "Fewest points"],
    ["guests", "Sleeps the most"],
    ["bedrooms", "Most bedrooms"],
    ["beds", "Real beds first"],
    ["name", "Hotel name, A to Z"]
  ];
  var MIN_GUESTS = 5, MAX_GUESTS = 10;
  var PREF_KEY = "hrtBigFam";

  /* ---------------- pure helpers (tested) ---------------- */
  function isRealBeds(x) { return x.b === "real" || x.b === "shared"; }
  function hasPointsProgram(x) { return POINTS.indexOf(x.g) >= 0; }
  function ptsKey(x) { return x.pts || (hasPointsProgram(x) ? 5e6 : 9e6); }
  function brKey(x) { var m = String(x.br).match(/\d+/); return m ? Number(m[0]) : 1; }
  var BED_ORDER = { real: 0, shared: 1, unknown: 2, sofa: 3, extra: 4 };

  function fits(x, st, place) {
    if (x.d !== st.dest) return false;
    if (x.s < st.guests) return false;
    if (place && place !== PLACES[st.dest][0] && x.p !== place) return false;
    if (st.real && !isRealBeds(x)) return false;
    if (st.pts && !hasPointsProgram(x)) return false;
    return true;
  }
  var SORTERS = {
    points: function (a, b) { return ptsKey(a) - ptsKey(b) || b.s - a.s; },
    guests: function (a, b) { return b.s - a.s || ptsKey(a) - ptsKey(b); },
    bedrooms: function (a, b) { return brKey(b) - brKey(a) || b.s - a.s; },
    beds: function (a, b) { return (BED_ORDER[a.b] - BED_ORDER[b.b]) || ptsKey(a) - ptsKey(b); },
    name: function (a, b) { return a.n.localeCompare(b.n); }
  };
  function pick(rooms, st) {
    var place = PLACES[st.dest][st.place] || PLACES[st.dest][0];
    return rooms.filter(function (x) { return fits(x, st, place); }).sort(SORTERS[st.sort] || SORTERS.points);
  }
  function countFor(rooms, st, place) {
    return rooms.filter(function (x) { return fits(x, st, place); }).length;
  }
  function cheapest(list, n) {
    return list.filter(function (x) { return x.pts && x.pts < 400000; })
      .sort(function (a, b) { return a.pts - b.pts; }).slice(0, n);
  }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }
  function pointsLabel(x) {
    if (x.pts) return { main: fmt(x.pts) + " " + x.g + " pts", sub: "a night on sample dates, not live", cls: "has" };
    if (x.g === "DVC") return { main: "Disney Vacation Club", sub: "DVC points only", cls: "" };
    if (x.g === "None") return { main: "Cash only", sub: "No hotel points program", cls: "" };
    return { main: x.g + " points", sub: "Price not checked yet", cls: "maybe" };
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) { return /^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? u : "#"; }

  /* ---------------- state ---------------- */
  var st = { dest: "hawaii", place: 0, guests: 6, real: false, pts: false, view: "grid", sort: "points" };
  try {
    var saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    if (saved.view === "list" || saved.view === "grid") st.view = saved.view;
    if (SORTERS[saved.sort]) st.sort = saved.sort;
    if (saved.guests >= MIN_GUESTS && saved.guests <= MAX_GUESTS) st.guests = saved.guests;
  } catch (e) {}
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ view: st.view, sort: st.sort, guests: st.guests })); } catch (e) {}
  }

  /* ---------------- render ---------------- */
  function rooms() { return window.HRT_BIGFAM_ROOMS || []; }

  function cardHtml(x) {
    var p = pointsLabel(x);
    return '<a class="bf-card" href="' + esc(safeUrl(x.u)) + '" target="_blank" rel="noopener" aria-label="' + esc(x.n + ", " + x.r + ". Opens the hotel site.") + '">'
      + '<span class="bf-where">' + esc(x.a + ", " + x.p) + '</span>'
      + '<span class="bf-name">' + esc(x.n) + '</span>'
      + '<span class="bf-room">' + esc(x.r) + '</span>'
      + '<span class="bf-facts">Sleeps ' + esc(x.s) + ' &middot; ' + esc(x.br) + ' &middot; ' + esc(x.k) + '</span>'
      + '<span class="bf-pill ' + (isRealBeds(x) ? "ok" : "") + '">' + esc(BEDS[x.b]) + '</span>'
      + '<span class="bf-foot"><span class="bf-pts ' + p.cls + '"><b>' + esc(p.main) + '</b><small>' + esc(p.sub) + '</small></span>'
      + '<span class="bf-go" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></span></span>'
      + '</a>';
  }
  function rowHtml(x) {
    var p = pointsLabel(x);
    var main = x.pts ? fmt(x.pts) : (x.g === "None" ? "Cash only" : (x.g === "DVC" ? "DVC only" : "Not checked"));
    var sub = x.pts ? x.g + ", sample dates" : (x.g === "None" || x.g === "DVC" ? "" : x.g + " points");
    return '<tr>'
      + '<td><b class="bf-tn">' + esc(x.n) + '</b><small>' + esc(x.a + ", " + x.p) + '</small></td>'
      + '<td class="bf-tsl">' + esc(x.s) + '</td>'
      + '<td>' + esc(x.br + ", " + x.k) + '</td>'
      + '<td><span class="bf-pill ' + (isRealBeds(x) ? "ok" : "") + '">' + esc(BEDS_SHORT[x.b]) + '</span></td>'
      + '<td><b class="bf-tp ' + p.cls + '">' + esc(main) + '</b><small>' + esc(sub) + '</small></td>'
      + '<td class="bf-tgo"><a class="bf-see" href="' + esc(safeUrl(x.u)) + '" target="_blank" rel="noopener" aria-label="' + esc("See " + x.n + ", " + x.r + " on the hotel site") + '">See room</a></td>'
      + '</tr>';
  }

  function render() {
    var host = document.getElementById("bf-host");
    if (!host) return;
    var all = rooms();
    var list = pick(all, st);
    var picks = cheapest(list, 3);
    var places = PLACES[st.dest];
    var tip = st.dest === "japan"
      ? "Heads up: points stays in Japan often cover only 2 guests, with a charge for each extra person."
      : (st.real ? "" : "Tip: many rooms count a sofa bed to reach 6. Turn on Real beds only to skip those.");

    var h = '<div class="bf">';
    h += '<div class="bf-top">';
    h += '<div class="bf-search card">'
      + '<div class="bf-seg" role="group" aria-label="Destination">'
      + '<button type="button" data-bf-dest="hawaii" aria-pressed="' + (st.dest === "hawaii") + '">Hawaiʻi</button>'
      + '<button type="button" data-bf-dest="japan" aria-pressed="' + (st.dest === "japan") + '">Japan</button></div>'
      + '<div class="bf-row"><span class="bf-lbl" id="bf-glbl">Guests</span>'
      + '<div class="bf-step" role="group" aria-labelledby="bf-glbl">'
      + '<button type="button" data-bf-guests="-1" aria-label="One fewer guest"' + (st.guests <= MIN_GUESTS ? " disabled" : "") + '>&minus;</button>'
      + '<b aria-live="polite">' + st.guests + '</b>'
      + '<button type="button" data-bf-guests="1" aria-label="One more guest"' + (st.guests >= MAX_GUESTS ? " disabled" : "") + '>+</button></div>'
      + '<span class="bf-note">in one room or unit</span></div>'
      + '<div class="bf-row">'
      + '<button type="button" class="bf-tog" data-bf-toggle="real" aria-pressed="' + st.real + '"><span class="sw"><i></i></span>Real beds only</button>'
      + '<button type="button" class="bf-tog" data-bf-toggle="pts" aria-pressed="' + st.pts + '"><span class="sw"><i></i></span>Book with points</button></div>'
      + '<div class="bf-chips" role="group" aria-label="Where">';
    places.forEach(function (p, i) {
      h += '<button type="button" class="bf-chip" data-bf-place="' + i + '" aria-pressed="' + (st.place === i) + '">' + esc(p)
        + ' <span>' + countFor(all, st, p) + '</span></button>';
    });
    h += '</div></div>';
    h += '<figure class="bf-photo"><img src="assets/bigfamily-hero.jpg" alt="Scottie and his family of six on a lanai in Waikīkī, Diamond Head behind them" loading="lazy" width="900" height="1200">'
      + '<figcaption>Built by a family of six, for big families</figcaption></figure>';
    h += '</div>';

    if (picks.length) {
      h += '<div class="bf-picks"><h2>Lowest points we found</h2><div class="bf-pgrid">';
      picks.forEach(function (x) {
        h += '<a class="bf-pick" href="' + esc(safeUrl(x.u)) + '" target="_blank" rel="noopener">'
          + '<b>' + fmt(x.pts) + '</b><small>' + esc(x.g) + ' points a night</small>'
          + '<span class="bf-pn">' + esc(x.n) + '</span><span class="bf-pr">' + esc(x.r) + '</span></a>';
      });
      h += '</div><p class="bf-fine">Prices seen on hilton.com on ' + esc(window.HRT_BIGFAM_CHECKED || "") + ' for ' + esc(window.HRT_BIGFAM_POINTS_DATES || "sample dates") + '. Your dates will differ.</p></div>';
    }

    h += '<div class="bf-bar"><div><h2>' + list.length + (list.length === 1 ? " room fits " : " rooms fit ") + st.guests + '</h2>'
      + (tip ? '<p class="bf-tip">' + esc(tip) + '</p>' : '') + '</div>'
      + '<div class="bf-tools"><label for="bf-sort">Sort by</label><select id="bf-sort" data-bf-sort>';
    SORTS.forEach(function (s) { h += '<option value="' + s[0] + '"' + (st.sort === s[0] ? " selected" : "") + '>' + s[1] + '</option>'; });
    h += '</select><div class="bf-seg sm" role="group" aria-label="View">'
      + '<button type="button" data-bf-view="grid" aria-pressed="' + (st.view === "grid") + '">Grid</button>'
      + '<button type="button" data-bf-view="list" aria-pressed="' + (st.view === "list") + '">List</button></div></div></div>';

    if (!list.length) {
      h += '<div class="bf-empty card"><b>No rooms match yet</b><span>Try fewer guests, another island, or turn off a filter. We add new rooms as we check them.</span></div>';
    } else if (st.view === "list") {
      h += '<div class="bf-tablewrap card"><table class="bf-table"><thead><tr><th scope="col">Hotel</th><th scope="col">Sleeps</th><th scope="col">Room</th><th scope="col">Beds</th><th scope="col">Points a night</th><th scope="col"><span class="bf-sr">Link</span></th></tr></thead><tbody>';
      list.forEach(function (x) { h += rowHtml(x); });
      h += '</tbody></table></div>';
    } else {
      h += '<div class="bf-grid">';
      list.forEach(function (x) { h += cardHtml(x); });
      h += '</div>';
    }

    h += '<p class="bf-fine">Beds and room sizes come from each hotel\'s official site, checked ' + esc(window.HRT_BIGFAM_CHECKED || "") + '. Points prices are a snapshot from sample dates, not live, so always check the hotel site for your dates. Know a room that fits a big family? Text Scottie and we will add it.</p>';
    h += '</div>';
    host.innerHTML = h;
  }

  /* ---------------- events ---------------- */
  var wired = false;
  function wire() {
    var host = document.getElementById("bf-host");
    if (!host || wired) return;
    wired = true;
    host.addEventListener("click", function (ev) {
      var b = ev.target.closest("button");
      if (!b || !host.contains(b)) return;
      var focusSel = null;
      if (b.hasAttribute("data-bf-dest")) { st.dest = b.getAttribute("data-bf-dest"); st.place = 0; focusSel = '[data-bf-dest="' + st.dest + '"]'; }
      else if (b.hasAttribute("data-bf-guests")) {
        st.guests = Math.max(MIN_GUESTS, Math.min(MAX_GUESTS, st.guests + Number(b.getAttribute("data-bf-guests"))));
        focusSel = '[data-bf-guests="' + b.getAttribute("data-bf-guests") + '"]';
      }
      else if (b.hasAttribute("data-bf-toggle")) { var k = b.getAttribute("data-bf-toggle"); st[k] = !st[k]; focusSel = '[data-bf-toggle="' + k + '"]'; }
      else if (b.hasAttribute("data-bf-place")) { st.place = Number(b.getAttribute("data-bf-place")); focusSel = '[data-bf-place="' + st.place + '"]'; }
      else if (b.hasAttribute("data-bf-view")) { st.view = b.getAttribute("data-bf-view"); focusSel = '[data-bf-view="' + st.view + '"]'; }
      else return;
      savePrefs();
      render();
      var f = focusSel && host.querySelector(focusSel);
      if (f && !f.disabled) f.focus();
    });
    host.addEventListener("change", function (ev) {
      if (!ev.target.hasAttribute("data-bf-sort")) return;
      st.sort = ev.target.value;
      savePrefs();
      render();
      var s = host.querySelector("[data-bf-sort]"); if (s) s.focus();
    });
  }

  /* ---------------- styles ---------------- */
  function styles() {
    if (document.getElementById("bf-css")) return;
    var s = document.createElement("style");
    s.id = "bf-css";
    s.textContent = [
      "#bf-host .bf{display:flex;flex-direction:column;gap:22px}",
      "#bf-host .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}",
      "#bf-host .bf-top{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px}",
      "@media (max-width:860px){#bf-host .bf-top{grid-template-columns:1fr}#bf-host .bf-photo{height:260px}}",
      "#bf-host .bf-search{padding:20px;display:flex;flex-direction:column;gap:16px}",
      "#bf-host .bf-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}",
      "#bf-host .bf-lbl{font-weight:800;font-size:15px;color:var(--text)}",
      "#bf-host .bf-note{font-size:13px;color:var(--muted)}",
      "#bf-host .bf-seg{display:inline-flex;align-self:flex-start;gap:4px;padding:4px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line)}",
      "#bf-host .bf-seg button{font:inherit;font-size:15px;font-weight:700;min-height:44px;padding:0 20px;border-radius:999px;border:0;background:none;color:var(--muted);cursor:pointer}",
      "#bf-host .bf-seg.sm button{min-height:40px;padding:0 14px;font-size:14px}",
      "#bf-host .bf-seg button[aria-pressed='true']{background:var(--coral);color:#fff}",
      "#bf-host .bf-step{display:inline-flex;align-items:center;gap:10px}",
      "#bf-host .bf-step b{min-width:28px;text-align:center;font-size:24px;font-weight:800;color:var(--text)}",
      "#bf-host .bf-step button{font:inherit;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--surface-2);color:var(--text);font-size:22px;font-weight:700;cursor:pointer}",
      "#bf-host .bf-step button:disabled{opacity:.4;cursor:default}",
      "#bf-host .bf-tog{font:inherit;font-size:15px;font-weight:700;min-height:44px;padding:0 16px 0 8px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--text);cursor:pointer;display:inline-flex;align-items:center;gap:10px}",
      "#bf-host .bf-tog .sw{width:36px;height:22px;border-radius:999px;background:#c3ccd6;position:relative;flex:none}",
      "#bf-host .bf-tog .sw i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff}",
      "#bf-host .bf-tog[aria-pressed='true']{border-color:var(--coral)}",
      "#bf-host .bf-tog[aria-pressed='true'] .sw{background:var(--coral)}",
      "#bf-host .bf-tog[aria-pressed='true'] .sw i{left:17px}",
      "#bf-host .bf-chips{display:flex;flex-wrap:wrap;gap:8px}",
      "#bf-host .bf-chip{font:inherit;font-size:14px;font-weight:700;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer}",
      "#bf-host .bf-chip span{color:var(--muted);font-weight:700;margin-left:4px}",
      "#bf-host .bf-chip[aria-pressed='true']{background:var(--ocean);border-color:var(--ocean);color:#fff}",
      "#bf-host .bf-chip[aria-pressed='true'] span{color:#cfd8e2}",
      "#bf-host .bf-photo{margin:0;position:relative;border-radius:var(--radius);overflow:hidden;background:var(--ocean);min-height:240px;box-shadow:var(--shadow)}",
      "#bf-host .bf-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 62%}",
      "#bf-host .bf-photo figcaption{position:absolute;left:12px;right:12px;bottom:12px;padding:8px 12px;border-radius:12px;background:rgba(20,27,36,.82);color:#fff;font-size:13px;font-weight:700}",
      "#bf-host .bf-picks{background:var(--ocean);border-radius:var(--radius);padding:20px;color:#fff}",
      "#bf-host .bf-picks h2{margin:0 0 14px;font-size:19px;color:#fff}",
      "#bf-host .bf-pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}",
      "#bf-host .bf-pick{display:flex;flex-direction:column;gap:3px;padding:16px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(242,184,75,.35);color:#fff;text-decoration:none}",
      "#bf-host .bf-pick:hover{background:rgba(255,255,255,.1)}",
      "#bf-host .bf-pick b{font-size:28px;font-weight:800;color:#f2b84b;line-height:1.05}",
      "#bf-host .bf-pick small{font-size:13px;color:#cfd8e2}",
      "#bf-host .bf-pn{margin-top:6px;font-weight:800;font-size:15px}",
      "#bf-host .bf-pr{font-size:13px;color:#cfd8e2}",
      "#bf-host .bf-picks .bf-fine{color:#cfd8e2;margin:12px 0 0}",
      "#bf-host .bf-bar{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px}",
      "#bf-host .bf-bar h2{margin:0;font-size:20px;color:var(--text)}",
      "#bf-host .bf-tip{margin:4px 0 0;font-size:14px;color:var(--muted);max-width:520px}",
      "#bf-host .bf-tools{display:flex;flex-wrap:wrap;align-items:center;gap:10px}",
      "#bf-host .bf-tools label{font-size:13px;font-weight:700;color:var(--muted)}",
      "#bf-host .bf-tools select{font:inherit;font-size:14px;font-weight:700;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--text)}",
      "#bf-host .bf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}",
      "#bf-host .bf-card{display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);text-decoration:none;color:var(--text)}",
      "#bf-host .bf-card:hover{box-shadow:var(--shadow-lift)}",
      "#bf-host .bf-where{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}",
      "#bf-host .bf-name{font-size:17px;font-weight:800;line-height:1.25}",
      "#bf-host .bf-room{font-size:14px;color:var(--text)}",
      "#bf-host .bf-facts{font-size:13px;color:var(--muted)}",
      "#bf-host .bf-pill{align-self:flex-start;display:inline-block;margin-top:4px;font-size:12px;font-weight:800;padding:5px 10px;border-radius:999px;background:var(--look-bg);color:var(--look)}",
      "#bf-host .bf-pill.ok{background:var(--deal-bg);color:var(--deal)}",
      "#bf-host .bf-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:12px;border-top:1px solid var(--line)}",
      "#bf-host .bf-pts{display:flex;flex-direction:column}",
      "#bf-host .bf-pts b{font-size:15px;font-weight:800;color:var(--text)}",
      "#bf-host .bf-pts.has b{color:var(--coral-d)}",
      "#bf-host .bf-pts small{font-size:12px;color:var(--muted)}",
      "#bf-host .bf-go{flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--surface-2);color:var(--coral-d)}",
      "#bf-host .bf-card:hover .bf-go{background:var(--coral);color:#fff}",
      "#bf-host .bf-tablewrap{overflow-x:auto}",
      "#bf-host .bf-table{width:100%;min-width:760px;border-collapse:collapse;font-size:14px;color:var(--text)}",
      "#bf-host .bf-table th{text-align:left;padding:12px 14px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--line)}",
      "#bf-host .bf-table td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}",
      "#bf-host .bf-table tr:last-child td{border-bottom:0}",
      "#bf-host .bf-table small{display:block;font-size:12px;color:var(--muted)}",
      "#bf-host .bf-tn{font-size:15px}",
      "#bf-host .bf-tsl{font-size:18px;font-weight:800}",
      "#bf-host .bf-tp.has{color:var(--coral-d)}",
      "#bf-host .bf-tgo{text-align:right;vertical-align:middle}",
      "#bf-host .bf-see{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--coral);color:var(--coral-d);font-weight:800;text-decoration:none;white-space:nowrap}",
      "#bf-host .bf-see:hover{background:var(--coral);color:#fff}",
      "#bf-host .bf-empty{padding:32px;text-align:center;display:flex;flex-direction:column;gap:6px;color:var(--muted)}",
      "#bf-host .bf-empty b{color:var(--text);font-size:17px}",
      "#bf-host .bf-fine{margin:0;font-size:12px;line-height:1.55;color:var(--muted);max-width:760px}",
      "#bf-host .bf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
      ":root[data-theme='dark'] #bf-host .bf-tog .sw{background:#33465b}",
      ":root[data-theme='dark'] #bf-host .bf-pts.has b,:root[data-theme='dark'] #bf-host .bf-tp.has,:root[data-theme='dark'] #bf-host .bf-see,:root[data-theme='dark'] #bf-host .bf-go{color:#f7c39f}",
      ":root[data-theme='dark'] #bf-host .bf-chip[aria-pressed='true']{background:#1b2f4c;border-color:#1b2f4c}"
    ].join("\n");
    document.head.appendChild(s);
  }

  window.HRT_BIGFAM = {
    show: function () {
      styles(); wire(); render();
      var all = rooms();
      var set = function (id, n) { var el = document.getElementById(id); if (el) el.textContent = n; };
      set("bfRooms", all.length);
      set("bfReal", all.filter(isRealBeds).length);
      set("bfPts", all.filter(hasPointsProgram).length);
    },
    _test: { fits: fits, pick: pick, cheapest: cheapest, pointsLabel: pointsLabel, SORTERS: SORTERS, PLACES: PLACES, safeUrl: safeUrl, countFor: countFor }
  };
})();
