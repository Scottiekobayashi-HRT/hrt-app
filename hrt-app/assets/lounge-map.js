/* HRT HNL Lounge Map (window.HRT_LOUNGE_MAP)
   Built on the same map system as the MGMC Fall Fest map: pins with labels that never
   overlap, filter chips, quick-find buttons, a slide-in lounge card, and on phones a
   preview that opens full screen with tabs at the bottom and a swipe-down sheet.
   Desktop (widget 900px or wider): list on the left, map on the right.
   "What gets you in?" lights up the lounges a member can use. Signed-in members' My Wallet
   cards are picked for them (setWallet); everyone else picks by hand (kept in this browser).
   Everything lives in a shadow root so none of these styles touch the dashboard.

   mount(host, { lounges, site }) returns { show(id), mine(), setWallet(cardIds), resize() }.
   The lounge list itself stays in app.js (LOUNGES), shared with My Wallet through connect.js. */
(function () {
  "use strict";

  /* Card ids match the My Wallet catalog. Card rules match connect.js (checked Oct 17, 2026).
     Status, ticket and stay rules come from each lounge's own access list in app.js. */
  var PP = "Priority Pass, enroll through your card first";
  var SKY = "Sky Club access on a same-day Delta flight";
  var HAVE = [
    { g: "Cards", items: [
      { id: "amex-platinum", label: "Amex Platinum", opens: [["iass", PP], ["premier", PP], ["delta", SKY]] },
      { id: "amex-business-platinum", label: "Amex Business Platinum", opens: [["iass", PP], ["premier", PP], ["delta", SKY]] },
      { id: "chase-sapphire-reserve", label: "Chase Sapphire Reserve", opens: [["iass", PP], ["premier", PP]] },
      { id: "chase-sapphire-reserve-business", label: "Sapphire Reserve for Business", opens: [["iass", PP], ["premier", PP]] },
      { id: "capone-venture-x", label: "Capital One Venture X", opens: [["iass", PP], ["premier", PP]] }
    ] },
    { g: "Memberships and status", items: [
      { id: "ppm", label: "Priority Pass membership", opens: [["iass", "Priority Pass"], ["premier", "Priority Pass"]] },
      { id: "star", label: "Star Alliance Gold", opens: [["ana", "Star Alliance Gold, usually on an international Star flight"], ["united", "Star Alliance Gold, usually on an international Star flight"]] },
      { id: "ow", label: "Oneworld Sapphire or Emerald", opens: [["qantas", "Oneworld status, usually on an international Oneworld flight"], ["sakura", "Oneworld status, usually on an international Oneworld flight"]] },
      { id: "st", label: "SkyTeam Elite Plus", opens: [["korean", "SkyTeam Elite Plus, usually on an international SkyTeam flight"]] },
      { id: "atmos", label: "Atmos elite status", opens: [["plumeria", "Atmos elite status"]] },
      { id: "pualani", label: "Pualani Platinum or Gold", opens: [["premier", "Pualani Platinum or Gold"]] }
    ] },
    { g: "Flying business or first today on", items: [
      { id: "f-ana", label: "ANA", opens: [["ana", "Your ANA business or first ticket"]] },
      { id: "f-jal", label: "JAL", opens: [["sakura", "Your JAL business or first ticket"]] },
      { id: "f-qf", label: "Qantas", opens: [["qantas", "Your Qantas business or first ticket"]] },
      { id: "f-ua", label: "United Polaris", opens: [["united", "Your United Polaris ticket"]] },
      { id: "f-dl", label: "Delta One", opens: [["delta", "Your Delta One ticket"]] },
      { id: "f-ke", label: "Korean Air", opens: [["korean", "Your Korean Air business or first ticket"]] },
      { id: "f-aa", label: "American", opens: [["admirals", "Your American business or first ticket"]] },
      { id: "f-ha", label: "Hawaiian", opens: [["plumeria", "Your Hawaiian business or first ticket"], ["premier", "Your Hawaiian first class ticket"]] }
    ] },
    { g: "Other ways in", items: [
      { id: "day", label: "I would buy a day pass", opens: [["plumeria", "A day pass"], ["premier", "A day pass"], ["admirals", "A day pass"]] },
      { id: "ko", label: "Staying at a Ko Olina resort", opens: [["koolina", "Your Ko Olina resort stay, reserve ahead"]] },
      { id: "lanai", label: "Staying at Four Seasons or Sensei Lānaʻi", opens: [["fslanai", "Your Four Seasons or Sensei Lānaʻi stay"]] }
    ] }
  ];
  /* Short pin labels; the card and list show the full name */
  var SHORT = { ana: "ANA Lounge", qantas: "Qantas", sakura: "JAL Sakura", delta: "Delta Sky Club", iass: "IASS Lounge", korean: "Korean Air",
    fslanai: "Four Seasons Lanai", deltanew: "New Sky Club", southwest: "Southwest", alaskahawaiian: "New Alaska/Hawaiian" };
  /* Label priority: 1 shows at the first zoom, 2 a little closer, 3 closer still */
  var PRI = { admirals: 2, korean: 2, fslanai: 2, koolina: 2 };
  var GUIDES = [
    { t: "Have Priority Pass?", p: "Two lounges take it: IASS in Terminal 2 and Premier Club in Terminal 1. Enroll through your card first.", cat: "pp", ids: ["iass", "premier"] },
    { t: "Flying to Japan?", p: "ANA and JAL both run lounges in Terminal 2. Business class on either gets you in, and ANA is the top rated lounge at HNL.", cat: "air", ids: ["ana", "sakura"] },
    { t: "Staying at Ko Olina or Lānaʻi?", p: "Two resort lounges sit inside Terminal 2 for hotel guests only. Ko Olina needs a reservation.", cat: "resort", ids: ["koolina", "fslanai"] },
    { t: "What is coming?", p: "A bigger Delta Sky Club, Southwest's first ever lounge, and a new Alaska and Hawaiian lounge in Terminal 1.", cat: "soon", ids: ["deltanew", "southwest", "alaskahawaiian"] }
  ];
  var CATS = {
    pp: { label: "Priority Pass", c: "var(--c-pp)", icon: "pp" },
    air: { label: "Airline lounges", c: "var(--c-air)", icon: "plane" },
    resort: { label: "Resort guests", c: "var(--c-resort)", icon: "key" },
    soon: { label: "Coming soon", c: "var(--c-soon)", icon: "clock" }
  };
  var ORDER = ["pp", "air", "resort", "soon"];
  var ICONS = {
    pp: '<path fill-rule="evenodd" d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zm9 1.4 1.1 2.3 2.5.3-1.8 1.7.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3z"/>',
    plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
    key: '<path fill-rule="evenodd" d="M14.5 3a6.5 6.5 0 0 0-6.2 8.5L2 17.8V22h4.2v-2.2h2.2v-2.2h2.2l1.9-1.9A6.5 6.5 0 1 0 14.5 3zm1.8 3.2a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"/>',
    clock: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v4.6l3.6 2.1-1 1.7L11 12.7V7z"/>',
    card: '<path fill-rule="evenodd" d="M2 6.5A2.5 2.5 0 0 1 4.5 4h15A2.5 2.5 0 0 1 22 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5zM4 8v2h16V8zm2 6v2h5v-2z"/>',
    map: '<path d="M15 4l-6-2-6 2v16l6-2 6 2 6-2V2zm-1 13.6l-4-1.3V4.4l4 1.3z"/>',
    ext: '<path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    one: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1.2 15h-2.4V9.6L9 10.4V8.2L11.6 7h1.6z"/>',
    two: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.6 15H8.4v-1.8l3.5-3.4c.9-.9 1.2-1.4 1.2-2 0-.7-.5-1.2-1.3-1.2-.8 0-1.4.5-1.5 1.4l-2.2-.3C8.4 7.9 9.9 6.8 12 6.8c2.1 0 3.6 1.2 3.6 3 0 1.1-.5 2-1.7 3.2l-2 1.9h3.7z"/>'
  };
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var FULL_IC = '<svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>';
  var X_IC = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var LIST_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';
  var W = 1600, H = 1000;
  var STORE = "hrtLoungeHave";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ic(n, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }
  function catOf(l) { var t = l.tags || []; return l.soon ? "soon" : t.indexOf("priority-pass") > -1 ? "pp" : t.indexOf("resort-only") > -1 ? "resort" : "air"; }

  /* ---------- the drawing: HNL level 2, drawn by HRT ----------
     Same frame as the lounge x / y in app.js: makai (runways) at the top, mauka (roads) at the bottom,
     Diamond Head to the left, ʻEwa to the right. Gate spots are approximate. */
  function drawing() {
    function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    function gate(from, at, n) {
      return '<line x1="' + from[0].toFixed(1) + '" y1="' + from[1].toFixed(1) + '" x2="' + at[0].toFixed(1) + '" y2="' + at[1].toFixed(1) + '" stroke="var(--bldg-edge)" stroke-width="8" stroke-linecap="round"/>' +
        '<circle cx="' + at[0].toFixed(1) + '" cy="' + at[1].toFixed(1) + '" r="15" fill="var(--bldg)" stroke="var(--gate)" stroke-width="2.5"/>' +
        '<text x="' + at[0].toFixed(1) + '" y="' + (at[1] + 4.5).toFixed(1) + '" font-size="12" font-weight="700" fill="var(--maplabel)" text-anchor="middle">' + n + '</text>';
    }
    function along(a, b, names, ts, off) {
      var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, out = "";
      names.forEach(function (n, i) {
        var p = lerp(a, b, ts[Math.floor(i / 2)]), s = i % 2 ? -1 : 1;
        out += gate([p[0] + nx * 38 * s, p[1] + ny * 38 * s], [p[0] + nx * off * s, p[1] + ny * off * s], n);
      });
      return out;
    }
    var g = along([250, 170], [470, 430], ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10"], [.02, .2, .4, .6, .8], 66) +
      along([1420, 110], [1110, 440], ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"], [.02, .2, .4, .6, .8], 66);
    [["E1", 240], ["E2", 290], ["E3", 340]].forEach(function (e) { g += gate([742, e[1]], [712, e[1]], e[0]); });
    [["E4", 775], ["E5", 825], ["E6", 875], ["E7", 925]].forEach(function (e) { g += gate([e[1], 197], [e[1], 166], e[0]); });
    [["E8A", 232], ["E8B", 272], ["E9", 312], ["E10", 352]].forEach(function (e) { g += gate([943, e[1]], [977, e[1]], e[0]); });
    g += gate([500, 392], [488, 350], "F2") + gate([560, 512], [548, 550], "F1") + gate([1065, 402], [1050, 360], "D1") + gate([1112, 410], [1112, 368], "D2");
    [1270, 1309, 1348, 1387, 1426, 1465, 1504, 1543].forEach(function (x, i) { g += gate([x, 587], [x, 556], "A" + (13 + i)); });
    [770, 810, 850, 890, 930, 960].forEach(function (y, i) { g += gate([1294, y], [1262, y], "A" + (12 - i * 2)) + gate([1366, y], [1398, y], "A" + (11 - i * 2)); });
    g += gate([1514, 478], [1482, 478], "B4") + gate([1514, 520], [1482, 520], "B5") + gate([1576, 478], [1590, 452], "B1") + gate([1576, 520], [1594, 520], "B2") + gate([1545, 448], [1545, 420], "B3");
    var T = 'font-family="DM Sans, Arial, sans-serif" fill="var(--maplabel)" text-anchor="middle"';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<rect width="' + W + '" height="' + H + '" fill="var(--apron)"/>' +
      '<path d="M0 26 H1600" stroke="var(--taxi)" stroke-width="5" stroke-dasharray="26 18"/>' +
      '<text x="60" y="64" ' + T + ' text-anchor="start" font-size="13" font-weight="700" letter-spacing="2">▲ MAKAI · RUNWAYS</text>' +
      '<text x="60" y="985" ' + T + ' text-anchor="start" font-size="13" font-weight="700" letter-spacing="2">▼ MAUKA · NIMITZ HWY</text>' +
      '<text x="800" y="985" ' + T + ' font-size="13" font-weight="700" letter-spacing="2">◀ DIAMOND HEAD          ʻEWA ▶</text>' +
      '<g fill="none" stroke="var(--road)" stroke-linecap="round" stroke-linejoin="round"><path d="M60 640 L300 612 Q790 560 1180 600 Q1440 760 1460 980" stroke-width="34"/><path d="M300 612 L330 980" stroke-width="22"/></g>' +
      '<g fill="var(--road)"><rect x="560" y="640" width="190" height="110" rx="14"/><rect x="820" y="640" width="190" height="110" rx="14"/></g>' +
      '<g fill="none" stroke="var(--bldg-edge)" stroke-linecap="round" stroke-linejoin="round"><path d="M470 430 L250 170" stroke-width="86"/><path d="M1110 440 L1420 110" stroke-width="86"/><path d="M440 455 Q790 385 1150 445" stroke-width="146"/><path d="M1330 690 L1330 960" stroke-width="86"/><path d="M1545 600 L1545 450" stroke-width="80"/></g>' +
      '<rect x="735" y="190" width="215" height="200" rx="40" fill="var(--bldg-edge)"/><rect x="1235" y="580" width="335" height="125" rx="46" fill="var(--bldg-edge)"/><rect x="70" y="672" width="170" height="78" rx="22" fill="var(--bldg-edge)"/>' +
      '<g fill="none" stroke="var(--bldg)" stroke-linecap="round" stroke-linejoin="round"><path d="M470 430 L250 170" stroke-width="72"/><path d="M1110 440 L1420 110" stroke-width="72"/><path d="M440 455 Q790 385 1150 445" stroke-width="132"/><path d="M1330 690 L1330 960" stroke-width="72"/><path d="M1545 600 L1545 450" stroke-width="66"/></g>' +
      '<rect x="742" y="197" width="201" height="186" rx="34" fill="var(--bldg)"/><rect x="1242" y="587" width="321" height="111" rx="40" fill="var(--bldg)"/><rect x="77" y="679" width="156" height="64" rx="18" fill="var(--bldg)"/>' +
      '<g fill="var(--garden)"><ellipse cx="640" cy="414" rx="40" ry="20"/><ellipse cx="760" cy="402" rx="34" ry="17"/><ellipse cx="920" cy="414" rx="40" ry="20"/></g>' +
      '<path d="M1160 470 Q1215 520 1250 600" fill="none" stroke="var(--gate)" stroke-width="5" stroke-dasharray="3 12" stroke-linecap="round"/>' +
      '<g font-family="DM Sans, Arial, sans-serif">' + g + '</g>' +
      '<g ' + T + ' font-weight="800" letter-spacing="2">' +
      '<text x="205" y="104" font-size="19">DIAMOND HEAD CONCOURSE</text><text x="205" y="128" font-size="14" font-weight="600" letter-spacing="1">Gates G1 to G10</text>' +
      '<text x="1340" y="62" font-size="19">ʻEWA CONCOURSE</text><text x="1340" y="86" font-size="14" font-weight="600" letter-spacing="1">Gates C1 to C9</text>' +
      '<text x="842" y="274" font-size="16">CONCOURSE E</text><text x="842" y="296" font-size="13" font-weight="600" letter-spacing="1">Gates E1 to E10</text>' +
      '<text x="790" y="500" font-size="17">TERMINAL 2</text><text x="790" y="440" font-size="12" font-weight="700" letter-spacing="1.5" fill="var(--c-resort)">GARDEN COURT · CULTURAL GARDENS</text>' +
      '<text x="790" y="590" font-size="13" font-weight="600" letter-spacing="1">Lobbies 4 to 8 · check-in and baggage claim below</text>' +
      '<text x="1402" y="652" font-size="17">TERMINAL 1</text><text x="1402" y="676" font-size="12" font-weight="600" letter-spacing="1">Gates A13 to A20</text>' +
      '<text x="1212" y="840" font-size="13" text-anchor="end">MAUKA CONCOURSE</text><text x="1212" y="860" font-size="12" font-weight="600" letter-spacing="1" text-anchor="end">Gates A1 to A12</text>' +
      '<text x="1470" y="420" font-size="13" text-anchor="end">CONCOURSE B</text>' +
      '<text x="155" y="716" font-size="13">TERMINAL 3</text><text x="155" y="772" font-size="12" font-weight="600" letter-spacing="1">Mokulele · Gate H1 · shuttle only</text>' +
      '<text x="655" y="702" font-size="12" font-weight="600" letter-spacing="1">Parking</text><text x="915" y="702" font-size="12" font-weight="600" letter-spacing="1">Parking</text>' +
      '<text x="1150" y="560" font-size="12" font-weight="600" letter-spacing="1" transform="rotate(58 1150 560)">Walk to T1 · 5 to 15 min</text>' +
      '</g></svg>';
  }

  var CSS = [
    ':host{all:initial;display:block;width:100%;contain:layout;',
    ' --bg:#eef2f6;--surface:#fff;--surface2:#f7f9fb;--text:#1b2430;--muted:#5c6b7d;--line:#e4eaf0;',
    ' --navy:#1b2430;--navy2:#141b24;--coral:#d97040;--coral-ink:#b5552a;--ok:#1f7a55;',
    ' --apron:#e2eaf1;--bldg:#fff;--bldg-edge:#c2cfdb;--garden:#cde6d5;--road:#d2dce6;--maplabel:#5f7084;--gate:#8a9aab;--taxi:#e9d9a6;',
    ' --c-pp:#d97040;--c-air:#2f6f9f;--c-resort:#1f7a55;--c-soon:#a86f0c;',
    ' --shadow:0 1px 2px rgba(16,32,54,.06),0 8px 24px rgba(16,32,54,.06);',
    ' --d:"sofia-pro","Montserrat","DM Sans",Arial,sans-serif;--u:"DM Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;',
    ' font-family:var(--u);font-size:14px;line-height:1.5;color:var(--text);-webkit-font-smoothing:antialiased}',
    ':host(.dark){--bg:#0a121c;--surface:#111f2e;--surface2:#0d1a27;--text:#e9eff6;--muted:#93a5b8;--line:#213347;--ok:#3fce7f;',
    ' --apron:#0f1d2c;--bldg:#1b2f46;--bldg-edge:#2d4867;--garden:#1b3a32;--road:#16283a;--maplabel:#8ba1b7;--gate:#6d849c;--taxi:#3a3520;',
    ' --c-pp:#e8824c;--c-air:#6fa9d8;--c-resort:#38b878;--c-soon:#e9b44a;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35)}',
    ':host(.full){position:fixed!important;inset:0!important;z-index:2147483000!important;width:100vw!important;height:100%!important;margin:0!important;contain:none}',
    '[hidden]{display:none!important}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer;letter-spacing:normal;text-transform:none}a{color:inherit;text-decoration:none}',
    ':focus-visible{outline:3px solid var(--coral);outline-offset:2px}',
    '.root{display:flex;flex-direction:column;gap:18px}',
    ':host(.full) .root{height:100%;gap:0}:host(.full) .guides-sec{display:none}',
    '.lay{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}',
    ':host(.wide) .lay{grid-template-columns:minmax(290px,370px) minmax(0,1fr)}',
    ':host(.full) .lay{display:block;height:100%}',
    '.side{display:none;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;height:min(80vh,760px);min-height:540px;box-shadow:var(--shadow)}',
    ':host(.wide) .side{display:flex}:host(.full) .side{display:none}',
    '.sh{padding:14px 16px 12px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}',
    '.sh>b{font-family:var(--d);font-weight:800;font-size:16px}',
    '.sl{flex:1;overflow-y:auto;padding:4px 8px 12px}',
    '.lh{display:flex;justify-content:space-between;align-items:center;padding:10px 10px 4px;font-size:12.5px;color:var(--muted)}.lh b{color:var(--text);font-size:13px}',
    '.havebtn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:1.5px solid var(--line);background:var(--surface2);border-radius:12px;padding:10px 12px;text-align:left;min-height:48px}',
    '.havebtn b{font-size:14px;display:block}.havebtn span span{font-size:12.5px;color:var(--muted)}',
    '.havebtn.on{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,var(--surface))}.havebtn.on span span{color:var(--ok);font-weight:700}',
    '.havebtn svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}',
    '.row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;background:transparent;border-radius:12px;padding:10px;min-height:58px}',
    '.row:hover,.row.hov{background:var(--surface2)}',
    '.row.sel{background:color-mix(in srgb,var(--coral) 12%,var(--surface));box-shadow:inset 0 0 0 2px var(--coral)}',
    '.row.off{display:none}.row.no{opacity:.5}',
    '.row .dt{flex:none;width:32px;height:32px;border-radius:50%;background:var(--c);display:grid;place-items:center;box-shadow:0 0 0 2px #fff;position:relative}',
    '.row.soon .dt{background:var(--surface);box-shadow:0 0 0 2px var(--c)}.row.soon .dt svg{fill:var(--c)}',
    '.row .dt svg{width:17px;height:17px;fill:#fff}',
    '.row .nm{flex:1;min-width:0;display:flex;flex-direction:column}',
    '.row .nm b{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.row .nm small{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.row .nm em{font-style:normal;font-size:12px;font-weight:700;color:var(--ok);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.row .rt{flex:none;font-size:12px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}.row .rt.top{color:var(--coral-ink)}',
    '.ck{position:absolute;right:-5px;top:-5px;width:16px;height:16px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 2px var(--surface);display:grid;place-items:center}',
    '.ck svg{width:10px!important;height:10px!important;fill:none!important;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}',
    /* map widget */
    '.w{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;height:min(80vh,760px);min-height:540px;display:flex;flex-direction:column;-webkit-tap-highlight-color:transparent;box-shadow:var(--shadow)}',
    ':host(.full) .w{height:100vh;height:100dvh;min-height:0;border-radius:0;border:0}',
    '.top{display:flex;align-items:center;gap:12px;padding:12px 14px 10px;flex:none;flex-wrap:wrap;border-bottom:1px solid var(--line)}',
    ':host(.full) .top{padding-top:calc(12px + env(safe-area-inset-top,0px))}',
    '.ttl{display:flex;flex-direction:column;line-height:1.1}.ttl b{font-family:var(--d);font-weight:800;font-size:18px}.ttl span{font-size:12px;color:var(--muted);margin-top:3px}',
    '.chips{display:flex;gap:6px;margin-left:auto;overflow-x:auto;scrollbar-width:none;max-width:100%}.chips::-webkit-scrollbar{display:none}',
    '.chip{border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:6px;min-height:36px}',
    '.chip i{width:9px;height:9px;border-radius:50%;background:var(--c)}.chip em{font-style:normal;font-size:11.5px;opacity:.7}',
    '.chip[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}:host(.dark) .chip[aria-pressed=true]{background:#fff;color:var(--navy2);border-color:#fff}',
    '.map{position:relative;flex:1;overflow:hidden;background:var(--apron);touch-action:pan-y;cursor:grab;outline:none}',
    ':host(.full) .map{touch-action:none}.map.drag{cursor:grabbing}.map:focus-visible{box-shadow:inset 0 0 0 3px var(--coral)}',
    '.layer{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}.layer svg{display:block;width:100%;height:100%}',
    '.pins{position:absolute;inset:0;pointer-events:none}',
    '.pin{position:absolute;left:0;top:0;pointer-events:auto;border:0;background:none;padding:0;display:flex;align-items:center;transition:opacity .18s}',
    '.dot{width:30px;height:30px;border-radius:50%;background:var(--c);display:grid;place-items:center;box-shadow:0 0 0 2.5px #fff,0 4px 10px rgba(10,20,34,.35);flex:none;position:relative;z-index:1}',
    '.pin.soon .dot{background:var(--surface);box-shadow:0 0 0 2.5px var(--c),0 4px 10px rgba(10,20,34,.25)}.pin.soon .dot svg{fill:var(--c)}',
    '.dot svg{width:17px;height:17px;fill:#fff}.pin .ck{display:none}.pin.ok .ck{display:grid}',
    '.lab{background:var(--surface);color:var(--text);font-weight:700;font-size:12.5px;line-height:1.15;padding:6px 10px 6px 18px;margin-left:-13px;border-radius:0 999px 999px 0;white-space:nowrap;box-shadow:0 4px 12px rgba(10,20,34,.22);max-width:210px;overflow:hidden;text-overflow:ellipsis}',
    '.pin.ok .lab{box-shadow:0 0 0 2px var(--ok),0 4px 12px rgba(10,20,34,.22)}',
    '.pin.nolab .lab{display:none}.pin.left{flex-direction:row-reverse}.pin.left .lab{margin:0 -13px 0 0;padding:6px 18px 6px 10px;border-radius:999px 0 0 999px}',
    '.pin.dim{opacity:.22}',
    '.pin.sel .dot,.pin.hov .dot{box-shadow:0 0 0 3px #fff,0 0 0 7px var(--c),0 6px 16px rgba(10,20,34,.4)}.pin.sel .lab{background:var(--c);color:#fff}',
    '.pin.pulse .dot::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:3px solid var(--c);animation:pl 1.3s ease-out infinite}',
    '@keyframes pl{to{transform:scale(2.4);opacity:0}}',
    '.pin:focus-visible{outline:none}.pin:focus-visible .dot{box-shadow:0 0 0 3px #fff,0 0 0 6px var(--coral)}',
    '.ctl{position:absolute;right:12px;top:12px;display:flex;flex-direction:column;gap:8px;z-index:3}',
    '.btn{width:44px;height:44px;border-radius:12px;border:0;background:var(--navy);display:grid;place-items:center;box-shadow:0 4px 14px rgba(10,20,34,.3)}',
    '.btn svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.btn:hover{background:var(--navy2)}',
    '.quick{position:absolute;left:12px;top:12px;display:flex;gap:8px;z-index:3;flex-wrap:wrap;max-width:calc(100% - 80px)}',
    '.q{display:flex;align-items:center;gap:7px;border:0;border-radius:999px;padding:7px 13px 7px 7px;background:var(--navy);color:#fff;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(10,20,34,.3);min-height:38px}',
    '.q span{width:24px;height:24px;border-radius:50%;background:var(--c);display:grid;place-items:center}.q span svg{width:14px;height:14px;fill:#fff}.q.on{background:var(--ok)}',
    '.minebar{position:absolute;left:50%;top:60px;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:8px;background:var(--ok);color:#fff;border-radius:999px;padding:6px 6px 6px 14px;font-weight:700;font-size:13px;box-shadow:0 6px 18px rgba(10,20,34,.3);white-space:nowrap;max-width:calc(100% - 24px)}',
    ':host(.dark) .minebar{color:#0a121c}',
    '.minebar button{border:0;background:rgba(255,255,255,.22);color:inherit;border-radius:999px;padding:6px 11px;font-weight:700;font-size:12.5px;min-height:32px}',
    '.hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(20,27,36,.86);color:#fff;padding:12px 18px;border-radius:14px;font-weight:600;font-size:14px;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s;z-index:4;max-width:80%}.hint.on{opacity:1}',
    '.card{position:absolute;z-index:5;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 40px rgba(10,20,34,.3);padding:16px 18px;left:12px;bottom:12px;width:min(380px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;transform:translateY(16px);opacity:0;pointer-events:none;transition:transform .22s ease,opacity .22s ease}',
    '.card.on{transform:none;opacity:1;pointer-events:auto}',
    '.card .cat{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;color:var(--c);text-transform:uppercase}.card .cat i{width:8px;height:8px;border-radius:50%;background:var(--c)}',
    '.card h3{font-family:var(--d);font-weight:800;font-size:21px;line-height:1.15;margin:6px 40px 4px 0;color:var(--text);letter-spacing:normal;text-transform:none}',
    '.card .meta{font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}.card .meta .stars{color:var(--coral-ink);font-weight:700}',
    ':host(.dark) .card .meta .stars,:host(.dark) .row .rt.top{color:#f2b84b}',
    '.card p{margin:10px 0 0;font-size:14px;line-height:1.5;color:var(--text)}.card .nt{color:var(--muted);font-size:13px;margin-top:6px}',
    '.card .yes{margin-top:10px;border-radius:12px;padding:10px 12px;background:color-mix(in srgb,var(--ok) 12%,var(--surface));border:1px solid color-mix(in srgb,var(--ok) 40%,var(--line));font-size:13.5px}.card .yes b{color:var(--ok)}',
    '.card .yes.not{background:var(--surface2);border-color:var(--line)}',
    '.acc{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.acc span{font-size:12px;font-weight:600;background:var(--surface2);border:1px solid var(--line);border-radius:999px;padding:3px 10px}',
    '.card .rowb{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}',
    '.card .a{border:0;border-radius:999px;padding:10px 15px;font-weight:700;font-size:13px;background:var(--coral);color:#fff;display:inline-flex;align-items:center;gap:6px;min-height:42px}',
    '.card .a.alt{background:var(--surface2);color:var(--text);border:1px solid var(--line)}.card .a svg{width:14px;height:14px;fill:currentColor}',
    '.card .x{position:absolute;right:10px;top:10px;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:var(--surface2);font-size:20px;line-height:1;color:var(--text)}',
    '.list,.pick{position:absolute;z-index:6;inset:0;background:var(--surface);overflow:auto;padding:16px 16px 24px;transform:translateY(100%);transition:transform .28s ease;visibility:hidden}',
    '.list.on,.pick.on{transform:none;visibility:visible}',
    '.list h4,.pick h4{font-family:var(--d);font-weight:800;font-size:22px;margin:4px 0;color:var(--text)}',
    '.grp{font-size:11.5px;font-weight:700;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin:16px 4px 6px}',
    '.close{position:sticky;top:0;float:right;border:0;background:var(--navy);color:#fff;border-radius:999px;padding:9px 15px;font-weight:700;z-index:2;min-height:40px}',
    '.pick .lead{margin:0 0 4px;color:var(--muted);font-size:13.5px;max-width:56ch}',
    '.hv{display:flex;flex-wrap:wrap;gap:8px}',
    '.hv button{border:1.5px solid var(--line);background:var(--surface);border-radius:12px;padding:9px 12px;font-weight:700;font-size:13.5px;min-height:44px;display:inline-flex;align-items:center;gap:8px;text-align:left}',
    '.hv button small{font-size:11px;font-weight:700;color:var(--ok)}',
    '.hv button i{width:18px;height:18px;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;flex:none}',
    '.hv button i svg{width:12px;height:12px;fill:none;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;opacity:0}',
    '.hv button[aria-pressed=true]{border-color:var(--ok);background:color-mix(in srgb,var(--ok) 10%,var(--surface))}',
    '.hv button[aria-pressed=true] i{background:var(--ok);border-color:var(--ok)}.hv button[aria-pressed=true] i svg{opacity:1}',
    '.pick .res{position:sticky;bottom:-24px;margin:18px -16px -24px;padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}',
    '.pick .res b{font-size:14px}.pick .res span{display:flex;gap:8px}',
    '.pick .res .go{border:0;background:var(--ok);color:#fff;border-radius:999px;padding:10px 16px;font-weight:800;font-size:13.5px;min-height:44px}',
    ':host(.dark) .pick .res .go{color:#0a121c}',
    '.pick .res .clr{border:1px solid var(--line);background:var(--surface2);border-radius:999px;padding:10px 14px;font-weight:700;font-size:13px;min-height:44px}',
    '.fine{font-size:12px;color:var(--muted);margin:12px 0 0;max-width:110ch}',
    '.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;font-size:12px;color:var(--muted);flex:none;border-top:1px solid var(--line)}',
    '.foot button{border:0;background:var(--coral);color:#fff;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;display:flex;gap:6px;align-items:center;min-height:38px}',
    '.foot button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}',
    ':host(.wide) .foot [data-a=list]{display:none}',
    '.tabs{display:none}.explore{display:none}.grab{display:none}',
    /* phone: the Fall Fest pattern */
    ':host(.ph) .w{height:auto;min-height:0}:host(.ph) .map{flex:none;aspect-ratio:16/11}:host(.ph.full) .w{height:100vh;height:100dvh}:host(.ph.full) .map{flex:1;aspect-ratio:auto}',
    ':host(.ph) .chips{display:none;margin-left:0;width:100%;padding-bottom:2px}:host(.ph.full) .chips{display:flex}',
    ':host(.ph) .quick,:host(.ph) .foot,:host(.ph) .hint{display:none!important}',
    ':host(.ph:not(.full)) .minebar{display:none}:host(.ph.full) .minebar{top:auto;bottom:12px}',
    ':host(.ph) .ctl{right:10px;top:10px;display:none}:host(.ph.full) .ctl{display:flex}:host(.ph) .ctl [data-a=in],:host(.ph) .ctl [data-a=out]{display:none}',
    ':host(.ph) .dot{width:28px;height:28px}:host(.ph) .dot svg{width:16px;height:16px}',
    ':host(.ph.full) .dot{width:32px;height:32px}:host(.ph.full) .dot svg{width:18px;height:18px}:host(.ph.full) .lab{font-size:13.5px;padding:7px 12px 7px 18px}:host(.ph.full) .pin.left .lab{padding:7px 18px 7px 12px}',
    ':host(.ph) .explore{display:flex;position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:4;border:0;border-radius:999px;background:var(--coral);color:#fff;font-weight:800;font-size:14px;padding:11px 17px;gap:7px;align-items:center;white-space:nowrap;box-shadow:0 8px 22px rgba(10,20,34,.4);min-height:44px}',
    '.explore svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}:host(.ph.full) .explore{display:none}',
    ':host(.ph) .tabs{display:grid;grid-template-columns:repeat(4,1fr);flex:none;background:var(--navy2);padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px))}',
    '.tab{border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 2px;font-size:11.5px;font-weight:700;color:#e9eff6;min-height:54px;border-radius:12px}',
    '.tab:active{background:#1b2f4c}.tab span{width:30px;height:30px;border-radius:50%;background:var(--c);display:grid;place-items:center}',
    '.tab span svg{width:17px;height:17px;fill:#fff}.tab span svg.ln{fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round}',
    ':host(.ph) .card{left:0;right:0;bottom:0;width:auto;max-height:72%;border-radius:20px 20px 0 0;border-width:1px 0 0;padding:10px 18px 18px;transform:translateY(105%);opacity:1}',
    ':host(.ph) .card.on{transform:none}:host(.ph) .card .grab{display:block;width:44px;height:5px;border-radius:3px;background:var(--line);margin:0 auto 10px}',
    ':host(.ph) .card h3{font-size:22px}:host(.ph) .card .a{padding:12px 16px;font-size:14px}:host(.ph) .card .x{top:16px;right:14px}',
    '@media (max-height:500px) and (orientation:landscape){',
    ' :host(.full) .ttl span,:host(.full) .chips{display:none}:host(.full) .top{padding-block:8px}',
    ' :host(.full) .tabs{display:grid;grid-template-columns:repeat(4,1fr);background:var(--navy2);padding:2px 4px calc(2px + env(safe-area-inset-bottom,0px))}:host(.full) .tab{flex-direction:row;justify-content:center;min-height:40px;gap:8px}:host(.full) .tab span{width:26px;height:26px}',
    ' :host(.full) .foot,:host(.full) .quick{display:none!important}',
    ' :host(.full) .card{left:auto;right:12px;bottom:12px;width:min(380px,60%);border-radius:18px;max-height:calc(100% - 24px)}}',
    /* guide cards */
    '.guides-sec h2{font-family:var(--d);font-weight:800;font-size:22px;margin:4px 0 10px;color:var(--text);letter-spacing:normal;text-transform:none}.guides-sec h2 span{color:var(--coral)}',
    '.guides{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
    ':host(.mid) .guides{grid-template-columns:repeat(2,minmax(0,1fr))}:host(.ph) .guides{grid-template-columns:minmax(0,1fr)}',
    '.g{text-align:left;border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px;min-height:150px;transition:transform .15s ease;box-shadow:var(--shadow)}',
    '.g:hover{transform:translateY(-2px)}.g .ib{width:40px;height:40px;border-radius:12px;background:var(--c);display:grid;place-items:center}.g .ib svg{width:22px;height:22px;fill:#fff}',
    '.g h3{font-family:var(--d);font-weight:800;font-size:16px;margin:2px 0 0;line-height:1.2;color:var(--text);letter-spacing:normal;text-transform:none}',
    '.g p{margin:0;color:var(--muted);font-size:13.5px}',
    '.g .go{margin-top:auto;font-weight:800;font-size:13px;color:var(--coral-ink);display:inline-flex;gap:6px;align-items:center}:host(.dark) .g .go{color:var(--coral)}.g .go svg{width:14px;height:14px;fill:currentColor}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'
  ].join("");

  function mount(host, opts) {
    if (!host || host.shadowRoot) return null;
    opts = opts || {};
    var SITE = opts.site || "";
    var L = (opts.lounges || []).map(function (l) {
      return { id: l.id, name: l.name, op: l.op, t: l.t, gate: l.gate, r: l.r, url: l.url, access: l.access || [], blurb: l.blurb, note: l.note,
        cat: catOf(l), short: SHORT[l.id], px: l.x / 100 * W, py: l.y / 100 * H, p: l.soon ? 3 : (PRI[l.id] || 1) };
    });
    var byId = {}; L.forEach(function (l) { byId[l.id] = l; });
    var topR = Math.max.apply(null, L.map(function (l) { return l.r || 0; }));
    var HV = {}; HAVE.forEach(function (g) { g.items.forEach(function (i) { HV[i.id] = i; }); });

    var have = {}, wal = {};
    try { (JSON.parse(localStorage.getItem(STORE) || "[]") || []).forEach(function (k) { if (HV[k]) have[k] = 1; }); } catch (_) {}
    function picked() { var o = {}; Object.keys(wal).forEach(function (k) { if (HV[k]) o[k] = 1; }); Object.keys(have).forEach(function (k) { o[k] = 1; }); return o; }
    function haveCount() { return Object.keys(picked()).length; }
    function accessFor(l) { var p = picked(), out = []; if (l.cat === "soon") return out;
      Object.keys(p).forEach(function (k) { HV[k].opens.forEach(function (o) { if (o[0] === l.id) out.push({ by: HV[k].label, how: o[1] }); }); }); return out; }
    function openSet() { var m = {}; L.forEach(function (l) { if (accessFor(l).length) m[l.id] = 1; }); return m; }
    function mineList() { var m = openSet(); return L.filter(function (l) { return m[l.id]; }); }
    function saveHave() { try { localStorage.setItem(STORE, JSON.stringify(Object.keys(have))); } catch (_) {} }
    function col(l) { return CATS[l.cat].c; }

    var root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="root"><div class="lay">' +
        '<aside class="side" aria-label="Lounges"><div class="sh"><b>What gets you in?</b>' +
          '<button type="button" class="havebtn" data-a="pick"><span><b>Pick your cards and status</b><span class="hs">See which lounges open for you</span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>' +
          '<div class="sl"><div class="lh"><b class="scnt"></b><span class="ssort"></span></div><div class="slist"></div></div></aside>' +
        '<div class="mapcol"><div class="w" role="region" aria-label="HNL Lounge Map">' +
          '<div class="top"><div class="ttl"><b>Find your lounge</b><span>Level 2 · Terminals 1 and 2</span></div><div class="chips" role="toolbar" aria-label="Show"></div></div>' +
          '<div class="map" tabindex="0" aria-label="Airport map. Drag to move, use plus and minus to zoom.">' +
            '<div class="layer">' + drawing() + '</div><div class="pins"></div><div class="quick"></div>' +
            '<div class="minebar" hidden><span class="mtxt"></span><button type="button" data-a="pick">Edit</button><button type="button" data-a="clearhave">Clear</button></div>' +
            '<div class="ctl">' +
              '<button type="button" class="btn" data-a="in" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' +
              '<button type="button" class="btn" data-a="out" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>' +
              '<button type="button" class="btn" data-a="fit" aria-label="Back to the main view"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>' +
              '<button type="button" class="btn fullbtn" data-a="full" aria-label="Full screen">' + FULL_IC + '</button>' +
            '</div>' +
            '<div class="hint" aria-hidden="true"></div>' +
            '<button type="button" class="explore" data-a="full">' + FULL_IC.replace("<svg", '<svg aria-hidden="true"') + 'Tap to explore the map</button>' +
            '<div class="card" role="dialog" aria-live="polite"></div><div class="list" aria-label="All lounges"></div><div class="pick" aria-label="What gets you in"></div>' +
          '</div>' +
          '<nav class="tabs" aria-label="Quick find"></nav>' +
          '<div class="foot"><span>HRT drawing of HNL level 2. Gate spots are approximate.</span><button type="button" data-a="list">' + LIST_IC + 'All lounges</button></div>' +
        '</div></div></div>' +
        '<section class="guides-sec"><h2>Which lounge <span>can I get into?</span></h2><div class="guides"></div></section>' +
      '</div>';

    var $ = function (s) { return root.querySelector(s); };
    var map = $(".map"), layer = $(".layer"), pinsEl = $(".pins"), card = $(".card"), list = $(".list"), pick = $(".pick"), hint = $(".hint"), quick = $(".quick"), side = $(".slist"), bar = $(".minebar");
    layer.style.width = W + "px"; layer.style.height = H + "px";
    var view = { s: 1, x: 0, y: 0 }, fitS = 1, filter = "all", selected = null, hovered = null, anim = null, full = false;

    /* theme follows the dashboard's dark mode switch */
    function theme() { host.classList.toggle("dark", document.documentElement.getAttribute("data-theme") === "dark"); }
    theme(); new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    /* chips */
    var chips = $(".chips");
    [["all", "All", ""]].concat(ORDER.map(function (k) { return [k, CATS[k].label, CATS[k].c]; })).forEach(function (c) {
      var n = c[0] === "all" ? L.length : L.filter(function (l) { return l.cat === c[0]; }).length; if (!n) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.f = c[0]; b.setAttribute("aria-pressed", c[0] === "all");
      b.style.setProperty("--c", c[2]); b.innerHTML = (c[0] === "all" ? "" : "<i></i>") + esc(c[1]) + " <em>" + n + "</em>";
      b.onclick = function () { setFilter(c[0]); }; chips.appendChild(b);
    });
    /* quick buttons and phone tabs */
    var QUICK = [
      ["mine", "My cards", "var(--ok)", "card", null],
      ["pp", "Priority Pass", "var(--c-pp)", "pp", function (l) { return l.cat === "pp"; }],
      ["t1", "Terminal 1", "var(--c-air)", "one", function (l) { return l.t === "t1"; }],
      ["t2", "Terminal 2", "var(--c-air)", "two", function (l) { return l.t === "t2"; }]
    ];
    var tabs = $(".tabs");
    QUICK.forEach(function (q) {
      var act = function () { if (q[0] === "mine") openPick(); else highlight(L.filter(q[4])); };
      var b = document.createElement("button"); b.type = "button"; b.className = "q"; b.dataset.q = q[0]; b.style.setProperty("--c", q[2]);
      b.innerHTML = "<span>" + ic(q[3]) + "</span>" + q[1]; b.onclick = act; quick.appendChild(b);
      if (q[0] === "t2") return;
      var t = document.createElement("button"); t.type = "button"; t.className = "tab"; t.style.setProperty("--c", q[2]);
      t.innerHTML = "<span>" + ic(q[3]) + "</span>" + q[1]; t.onclick = function () { goFull(act); }; tabs.appendChild(t);
    });
    (function () { var t = document.createElement("button"); t.type = "button"; t.className = "tab"; t.style.setProperty("--c", "var(--coral)");
      t.innerHTML = '<span>' + LIST_IC.replace("<svg", '<svg class="ln"') + '</span>All lounges'; t.onclick = function () { goFull(openList); }; tabs.appendChild(t); })();

    function isPhone() { return host.classList.contains("ph") && window.innerWidth < 700; }
    function goFull(then) { if (isPhone() && !full) { setFull(true); setTimeout(then, 60); } else then(); }

    /* pins */
    L.forEach(function (l) {
      var b = document.createElement("button"); b.type = "button";
      b.className = "pin" + (l.cat === "soon" ? " soon" : ""); b.style.setProperty("--c", col(l)); b.setAttribute("aria-label", l.name);
      b.innerHTML = '<span class="dot">' + ic(CATS[l.cat].icon) + '<span class="ck">' + CHECK + '</span></span><span class="lab">' + esc(l.short || l.name) + '</span>';
      b.addEventListener("click", function (e) { e.stopPropagation(); goFull(function () { select(l, true); }); });
      pinsEl.appendChild(b); l.el = b;
    });

    /* ---------- view math (from the Fall Fest map) ---------- */
    function size() { return { w: map.clientWidth, h: map.clientHeight }; }
    function clampView(v) { var z = size(), sw = W * v.s, sh = H * v.s;
      v.x = sw < z.w ? (z.w - sw) / 2 : Math.min(0, Math.max(z.w - sw, v.x));
      v.y = sh < z.h ? (z.h - sh) / 2 : Math.min(0, Math.max(z.h - sh, v.y)); return v; }
    function apply() { if (!map.clientWidth) return; clampView(view); layer.style.transform = "translate(" + view.x + "px," + view.y + "px) scale(" + view.s + ")"; placePins(); }
    function fitView() { var z = size(); fitS = Math.min(z.w / W, z.h / H) || 1; return { s: fitS, x: (z.w - W * fitS) / 2, y: (z.h - H * fitS) / 2 }; }
    function homeView() { var z = size(); fitView(); if (z.w < 640 && !full) return fitView(); if (z.w < 640) return viewFor(L.filter(function (l) { return l.t === "t2"; }), fitS * 3); return viewFor(L, fitS * 1.4); }
    function insets() { var m = size().w < 640; return { t: m ? 62 : 70, r: m ? 58 : 70, b: m ? 26 : 30, l: m ? 22 : 30, lab: m ? 110 : 160 }; }
    function viewFor(pts, maxS) {
      var z = size(), I = insets(), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(function (p) { x0 = Math.min(x0, p.px); y0 = Math.min(y0, p.py); x1 = Math.max(x1, p.px); y1 = Math.max(y1, p.py); });
      var aw = z.w - I.l - I.r - I.lab, ah = z.h - I.t - I.b;
      var s = Math.min(aw / Math.max(1, x1 - x0), ah / Math.max(1, y1 - y0), maxS || fitS * 3);
      s = Math.max(s, fitS, Math.max(z.w / W, z.h / H));
      return { s: s, x: I.l + (aw - (x1 - x0) * s) / 2 - x0 * s, y: I.t + (ah - (y1 - y0) * s) / 2 - y0 * s };
    }
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function animateTo(t, ms) {
      cancelAnimationFrame(anim); clampView(t);
      if (reduce || !ms) { view = t; apply(); return; }
      var f = { s: view.s, x: view.x, y: view.y }, t0 = performance.now();
      (function step(now) { var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        view = { s: f.s + (t.s - f.s) * e, x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e }; apply();
        if (k < 1) anim = requestAnimationFrame(step); })(t0);
    }
    function zoomAt(f, cx, cy) { var s = Math.max(fitS * .9, Math.min(fitS * 6, view.s * f)); view = { s: s, x: cx - (cx - view.x) * (s / view.s), y: cy - (cy - view.y) * (s / view.s) }; apply(); }

    /* ---------- pins: labels that never overlap ---------- */
    var dh = 0;
    function dotHalf() { if (!dh) { dh = (L[0].el.querySelector(".dot").offsetWidth / 2) || 15; } return dh; }
    function labelWidth(l) { if (!l.lw) { var had = l.el.classList.contains("nolab"); l.el.classList.remove("nolab"); l.lw = Math.max(40, l.el.querySelector(".lab").offsetWidth - 13); if (had) l.el.classList.add("nolab"); } return l.lw; }
    function uiRects() { var mr = map.getBoundingClientRect(), out = [];
      [quick, $(".ctl"), bar].forEach(function (el) { var r = el.getBoundingClientRect(); if (!r.width) return; out.push({ x0: r.left - mr.left - 4, y0: r.top - mr.top - 4, x1: r.right - mr.left + 4, y1: r.bottom - mr.top + 4 }); });
      return out; }
    function placePins() {
      if (!L.length) return;
      var placed = uiRects(), zw = size().w, z = view.s / fitS, hd = dotHalf(), mine = haveCount() ? openSet() : null;
      L.forEach(function (q) { var qx = view.x + q.px * view.s, qy = view.y + q.py * view.s; placed.push({ x0: qx - hd, y0: qy - hd, x1: qx + hd, y1: qy + hd, own: q }); });
      L.slice().sort(function (a, b) { return (b === selected) - (a === selected) || (b === hovered) - (a === hovered) || (mine ? (!!mine[b.id]) - (!!mine[a.id]) : 0) || a.p - b.p; }).forEach(function (l) {
        var sx = view.x + l.px * view.s, sy = view.y + l.py * view.s, el = l.el, ok = !!(mine && mine[l.id]);
        var vis = (filter === "all" || l.cat === filter) && (!mine || ok);
        el.classList.toggle("dim", !vis); el.classList.toggle("ok", ok); el.classList.toggle("hov", l === hovered && l !== selected);
        var want = (isPhone() && !full) ? false : l === selected || l === hovered || ok || (vis && (l.p <= 1 || (l.p === 2 && z >= 1.6) || (l.p === 3 && z >= 2.3) || filter !== "all"));
        var left = false;
        if (want) {
          var lw = labelWidth(l);
          var hits = function (r) { return r.x0 < 0 || r.x1 > zw || placed.some(function (q) { return q.own !== l && r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0; }); };
          var right = { x0: sx + hd - 2, y0: sy - 14, x1: sx + hd + lw, y1: sy + 14 }, lft = { x0: sx - hd - lw, y0: sy - 14, x1: sx - hd + 2, y1: sy + 14 };
          if (!hits(right)) placed.push(right);
          else if (!hits(lft)) { placed.push(lft); left = true; }
          else if (l === selected || l === hovered) { left = right.x1 > zw; placed.push(left ? lft : right); }
          else want = false;
        }
        el.classList.toggle("nolab", !want); el.classList.toggle("left", left);
        el.style.zIndex = l === selected ? 4 : l === hovered ? 3 : want ? 2 : 1;
        el.style.transform = "translate(" + (sx - hd - (left ? labelWidth(l) : 0)) + "px," + (sy - hd) + "px)";
      });
    }

    /* ---------- selection, filters, highlight ---------- */
    function select(l, fly) {
      selected = l;
      L.forEach(function (q) { q.el.classList.remove("sel"); });
      syncRows();
      if (!l) { card.classList.remove("on"); placePins(); return; }
      l.el.classList.add("sel"); card.style.setProperty("--c", col(l));
      var nearPP = null;
      if (l.cat !== "pp") { var bd = Infinity; L.forEach(function (q) { if (q.cat === "pp") { var d = Math.hypot(q.px - l.px, q.py - l.py); if (d < bd) { bd = d; nearPP = q; } } }); }
      var acc = accessFor(l), yes = "";
      if (acc.length) yes = '<div class="yes"><b>Open to you</b> with ' + acc.map(function (a) { return esc(a.by) + ' (' + esc(a.how) + ')'; }).join(", or ") + '.</div>';
      else if (haveCount() && l.cat !== "soon") yes = '<div class="yes not">Not open with what you picked.</div>';
      card.innerHTML = '<span class="grab" aria-hidden="true"></span><button type="button" class="x" aria-label="Close">×</button>' +
        '<span class="cat"><i></i>' + esc(CATS[l.cat].label) + '</span><h3>' + esc(l.name) + '</h3>' +
        '<div class="meta"><span>' + esc(l.gate) + '</span><span>' + esc(l.op) + '</span><span class="stars">' + (l.r == null ? "No rating yet" : "★ " + l.r.toFixed(1)) + '</span></div>' + yes +
        '<p>' + esc(l.blurb) + '</p>' + (l.note ? '<p class="nt">' + esc(l.note) + '</p>' : '') +
        '<div class="acc" aria-label="How to get in">' + l.access.map(function (a) { return '<span>' + esc(a) + '</span>'; }).join("") + '</div>' +
        '<div class="rowb">' + (l.url ? '<a class="a" href="' + esc(SITE + l.url) + '" target="_top">Read the full review ' + ic("ext") + '</a>' : '') +
        (nearPP ? '<button type="button" class="a alt" data-near="' + nearPP.id + '">' + ic("pp") + 'Nearest Priority Pass</button>' : '') + '</div>';
      card.classList.add("on"); card.scrollTop = 0;
      card.querySelector(".x").onclick = function () { select(null); };
      var nb = card.querySelector("[data-near]"); if (nb) nb.onclick = function () { select(byId[nb.dataset.near], true); };
      if (fly) { var z = size(), s2 = Math.max(view.s, fitS * 2.2), mobile = z.w < 640;
        animateTo({ s: s2, x: (mobile ? z.w / 2 : z.w * .62) - l.px * s2, y: (mobile ? z.h * .3 : z.h * .42) - l.py * s2 }, 450);
      } else placePins();
    }
    function setFilter(f) {
      filter = f;
      chips.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.f === f); });
      if (f !== "all") animateTo(viewFor(L.filter(function (l) { return l.cat === f; })), 450);
      if (selected && f !== "all" && selected.cat !== f) select(null);
      syncRows(); placePins();
    }
    var pulseT;
    function highlight(arr) {
      clearTimeout(pulseT); select(null);
      L.forEach(function (l) { l.el.classList.remove("pulse"); });
      arr.forEach(function (l) { l.el.classList.add("pulse"); });
      if (arr.length === 1) select(arr[0], true); else if (arr.length) animateTo(viewFor(arr), 450);
      pulseT = setTimeout(function () { arr.forEach(function (l) { l.el.classList.remove("pulse"); }); }, 4500);
    }

    /* ---------- what gets you in ---------- */
    function renderPick() {
      var p = picked(), n = mineList().length;
      var h = '<button type="button" class="close" data-a="closepick">Back to map</button><h4>What gets you in?</h4>' +
        '<p class="lead">Tap everything you have. The lounges you can use light up on the map.' + (Object.keys(wal).length ? ' Cards from My Wallet are already picked.' : '') + '</p>';
      HAVE.forEach(function (g) {
        h += '<div class="grp">' + esc(g.g) + '</div><div class="hv">' + g.items.map(function (i) {
          return '<button type="button" data-have="' + i.id + '" aria-pressed="' + !!p[i.id] + '"><i>' + CHECK + '</i>' + esc(i.label) + (wal[i.id] ? ' <small>In My Wallet</small>' : '') + '</button>'; }).join("") + '</div>';
      });
      h += '<p class="fine">Card benefits as HRT checked them on October 17, 2026. Status usually needs a same-day flight on that airline or alliance. Lounges that are not open yet are never counted.</p>' +
        '<div class="res"><b>' + (haveCount() ? n + (n === 1 ? ' lounge is' : ' lounges are') + ' open to you' : 'Nothing picked yet') + '</b><span>' +
        (Object.keys(have).length ? '<button type="button" class="clr" data-a="clearhave">Clear</button>' : '') + '<button type="button" class="go" data-a="closepick">Show on map</button></span></div>';
      pick.innerHTML = h;
    }
    function openPick() { closeList(); renderPick(); pick.classList.add("on"); var b = pick.querySelector(".close"); if (b) b.focus(); }
    function closePick() { pick.classList.remove("on"); if (haveCount()) { var m = mineList(); select(null); if (m.length) animateTo(viewFor(m), 450); } }
    pick.addEventListener("click", function (e) { var b = e.target.closest("[data-have]"); if (!b) return; var k = b.dataset.have;
      if (wal[k]) { delete wal[k]; } else if (have[k]) delete have[k]; else have[k] = 1;
      saveHave(); var st = pick.scrollTop; renderPick(); pick.scrollTop = st; updateMine(); });
    function updateMine() {
      var n = haveCount(), m = mineList();
      bar.hidden = !n;
      $(".mtxt").textContent = m.length + (m.length === 1 ? " lounge open to you" : " lounges open to you");
      quick.querySelector('[data-q="mine"]').classList.toggle("on", !!n);
      $(".havebtn").classList.toggle("on", !!n);
      $(".hs").textContent = n ? m.length + (m.length === 1 ? " lounge open to you" : " lounges open to you") + " · " + n + " picked" : "See which lounges open for you";
      if (selected) select(selected, false);
      renderSide(); placePins();
    }

    /* ---------- lists: side list (desktop) and the slide-up list ---------- */
    function sorted() { var m = haveCount() ? openSet() : null;
      return L.slice().sort(function (a, b) { return (m ? (!!m[b.id]) - (!!m[a.id]) : 0) || ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat) || (b.r || 0) - (a.r || 0); }); }
    function rowHtml(l) {
      var acc = accessFor(l);
      return '<button type="button" class="row' + (l.cat === "soon" ? ' soon' : '') + '" data-id="' + l.id + '" style="--c:' + col(l) + '"><span class="dt">' + ic(CATS[l.cat].icon) + (acc.length ? '<span class="ck">' + CHECK + '</span>' : '') + '</span>' +
        '<span class="nm"><b>' + esc(l.name) + '</b>' + (acc.length ? '<em>Open to you · ' + esc(acc[0].by) + (acc.length > 1 ? ' + ' + (acc.length - 1) + ' more' : '') + '</em>' : '<small>' + esc(l.gate) + ' · ' + esc(l.op) + '</small>') + '</span>' +
        '<span class="rt' + (l.r === topR ? ' top' : '') + '">' + (l.r == null ? '' : '★ ' + l.r.toFixed(1)) + '</span></button>';
    }
    function renderSide() { side.innerHTML = sorted().map(rowHtml).join(""); $(".ssort").textContent = haveCount() ? "Open to you first" : "Priority Pass first"; syncRows(); }
    function syncRows() {
      var n = 0, m = haveCount() ? openSet() : null;
      root.querySelectorAll(".row").forEach(function (r) { var l = byId[r.dataset.id], vis = filter === "all" || l.cat === filter;
        if (side.contains(r)) { r.classList.toggle("off", !vis); if (vis) n++; }
        r.classList.toggle("no", !!m && !m[l.id]); r.classList.toggle("sel", l === selected); r.classList.toggle("hov", l === hovered); });
      $(".scnt").textContent = n + (n === 1 ? " lounge" : " lounges") + (filter === "all" ? "" : " · " + CATS[filter].label);
    }
    side.addEventListener("click", function (e) { var r = e.target.closest(".row"); if (!r) return; var l = byId[r.dataset.id]; select(selected === l ? null : l, selected !== l); });
    side.addEventListener("mouseover", function (e) { var r = e.target.closest(".row"), l = r ? byId[r.dataset.id] : null; if (l !== hovered) { hovered = l; syncRows(); placePins(); } });
    side.addEventListener("mouseleave", function () { hovered = null; syncRows(); placePins(); });
    function renderList() {
      var h = '<button type="button" class="close" data-a="closelist">Back to map</button><h4>All lounges</h4>', m = haveCount() ? openSet() : null;
      if (m) { var mine = sorted().filter(function (l) { return m[l.id]; }); if (mine.length) h += '<div class="grp">Open to you</div>' + mine.map(rowHtml).join(""); }
      ORDER.forEach(function (k) { var items = sorted().filter(function (l) { return l.cat === k && !(m && m[l.id]); }); if (!items.length) return;
        h += '<div class="grp">' + esc(CATS[k].label) + '</div>' + items.map(rowHtml).join(""); });
      list.innerHTML = h;
      list.querySelectorAll(".row").forEach(function (b) { b.onclick = function () { closeList(); setFilter("all"); select(byId[b.dataset.id], true); }; });
      syncRows();
    }
    function openList() { pick.classList.remove("on"); renderList(); list.classList.add("on"); list.querySelector(".close").focus(); }
    function closeList() { list.classList.remove("on"); }

    /* ---------- full screen (moves the map to the top of the page, works on iPhone too) ---------- */
    var placeholder = null;
    function setFull(on) {
      if (on === full) return; full = on;
      var b = $(".fullbtn");
      if (on) {
        placeholder = document.createElement("div"); placeholder.style.height = host.offsetHeight + "px";
        host.parentNode.insertBefore(placeholder, host); document.body.appendChild(host);
        host.classList.add("full"); document.documentElement.style.overflow = "hidden";
        b.setAttribute("aria-label", "Exit full screen"); b.innerHTML = X_IC;
      } else {
        host.classList.remove("full"); placeholder.parentNode.insertBefore(host, placeholder); placeholder.remove(); placeholder = null;
        document.documentElement.style.overflow = "";
        b.setAttribute("aria-label", "Full screen"); b.innerHTML = FULL_IC;
      }
      requestAnimationFrame(function () { resetMeasures(); fitView(); if (!selected) view = homeView(); apply(); if (selected) select(selected, true); });
    }
    (function () { var y0 = null;
      card.addEventListener("touchstart", function (e) { if (card.scrollTop > 0) return; y0 = e.touches[0].clientY; }, { passive: true });
      card.addEventListener("touchmove", function (e) { if (y0 == null) return; var dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = "translateY(" + dy + "px)"; }, { passive: true });
      card.addEventListener("touchend", function (e) { if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; card.style.transform = ""; y0 = null; if (dy > 70) select(null); });
    })();
    map.addEventListener("touchmove", function (e) { if (full && !e.target.closest(".card,.list,.pick")) e.preventDefault(); }, { passive: false });

    /* ---------- gestures ---------- */
    var pts = new Map(), drag = null, pinch = null, hintT, UI = ".pin,.ctl,.quick,.card,.list,.pick,.explore,.minebar";
    function showHint(t) { hint.textContent = t; hint.classList.add("on"); clearTimeout(hintT); hintT = setTimeout(function () { hint.classList.remove("on"); }, 1400); }
    map.addEventListener("pointerdown", function (e) {
      if (e.target.closest(UI)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { var a = Array.from(pts.values()); drag = null;
        pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: view.s, vx: view.x, vy: view.y, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
        try { map.setPointerCapture(e.pointerId); } catch (_) {} return; }
      if (e.pointerType === "touch" && !full) { drag = { touchOnly: true, sx: e.clientX, sy: e.clientY }; return; }
      drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      try { map.setPointerCapture(e.pointerId); } catch (_) {}
    });
    map.addEventListener("pointermove", function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var r = map.getBoundingClientRect();
      if (pinch && pts.size >= 2) { var a = Array.from(pts.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        var s = Math.max(fitS * .9, Math.min(fitS * 6, pinch.s * d / pinch.d));
        var mx = (a[0].x + a[1].x) / 2 - r.left, my = (a[0].y + a[1].y) / 2 - r.top, ox = pinch.mx - r.left, oy = pinch.my - r.top;
        cancelAnimationFrame(anim); view = { s: s, x: mx - (ox - pinch.vx) * (s / pinch.s), y: my - (oy - pinch.vy) * (s / pinch.s) }; apply(); return; }
      if (!drag) return;
      if (drag.touchOnly) { if (!isPhone() && Math.abs(e.clientX - drag.sx) > 24 && Math.abs(e.clientX - drag.sx) > Math.abs(e.clientY - drag.sy)) showHint("Use two fingers to move the map, or tap full screen"); return; }
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) { drag.moved = true; map.classList.add("drag"); }
      cancelAnimationFrame(anim); view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; apply();
    });
    function up(e) {
      pts.delete(e.pointerId); if (pts.size < 2) pinch = null; map.classList.remove("drag");
      if (drag && !drag.moved && !drag.touchOnly && !e.target.closest(UI)) select(null);
      if (drag && drag.touchOnly && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 10 && !e.target.closest(UI)) { if (isPhone()) setFull(true); else select(null); }
      drag = null;
    }
    map.addEventListener("pointerup", up); map.addEventListener("pointercancel", up);
    map.addEventListener("wheel", function (e) {
      if (e.target.closest(".card,.list,.pick")) return;
      if (!(e.ctrlKey || e.metaKey) && !full) { showHint(/Mac|iPhone|iPad/.test(navigator.platform) ? "Hold ⌘ and scroll to zoom" : "Hold Ctrl and scroll to zoom"); return; }
      e.preventDefault(); var r = map.getBoundingClientRect(); cancelAnimationFrame(anim);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .002)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    map.addEventListener("keydown", function (e) {
      if (e.target.closest(".card,.list,.pick") && e.key !== "Escape") return;
      var z = size(), k = e.key, st = 60;
      if (k === "+" || k === "=") zoomAt(1.3, z.w / 2, z.h / 2);
      else if (k === "-") zoomAt(1 / 1.3, z.w / 2, z.h / 2);
      else if (k === "ArrowLeft") { view.x += st; apply(); } else if (k === "ArrowRight") { view.x -= st; apply(); }
      else if (k === "ArrowUp") { view.y += st; apply(); } else if (k === "ArrowDown") { view.y -= st; apply(); }
      else if (k === "Escape") { if (pick.classList.contains("on")) closePick(); else if (list.classList.contains("on")) closeList(); else if (selected) select(null); else if (full) setFull(false); return; }
      else return;
      e.preventDefault();
    });
    var ACTIONS = {
      in: function (z) { animateTo({ s: Math.min(fitS * 6, view.s * 1.5), x: z.w / 2 - (z.w / 2 - view.x) * 1.5, y: z.h / 2 - (z.h / 2 - view.y) * 1.5 }, 250); },
      out: function (z) { var f = Math.max(fitS * .9, view.s / 1.5) / view.s; animateTo({ s: view.s * f, x: z.w / 2 - (z.w / 2 - view.x) * f, y: z.h / 2 - (z.h / 2 - view.y) * f }, 250); },
      fit: function () { select(null); setFilter("all"); animateTo(homeView(), 350); },
      full: function () { setFull(!full); },
      list: function () { openList(); },
      closelist: function () { closeList(); },
      pick: function () { goFull(openPick); },
      closepick: function () { closePick(); },
      clearhave: function () { have = {}; wal = {}; saveHave(); if (pick.classList.contains("on")) renderPick(); updateMine(); }
    };
    root.addEventListener("click", function (e) { var a = e.target.closest("[data-a]"); if (a && ACTIONS[a.dataset.a]) ACTIONS[a.dataset.a](size()); });

    /* ---------- guide cards: Show on map ---------- */
    var guides = GUIDES.filter(function (g) { return g.ids.some(function (id) { return byId[id]; }); });
    $(".guides").innerHTML = guides.map(function (g, i) { return '<button type="button" class="g" data-g="' + i + '" style="--c:' + CATS[g.cat].c + '"><span class="ib">' + ic(CATS[g.cat].icon) + '</span><h3>' + esc(g.t) + '</h3><p>' + esc(g.p) + '</p><span class="go">' + ic("map") + 'Show on map</span></button>'; }).join("");
    $(".guides").addEventListener("click", function (e) {
      var b = e.target.closest("[data-g]"); if (!b) return; var g = guides[+b.dataset.g];
      var run = function () { setFilter("all"); highlight(g.ids.map(function (id) { return byId[id]; }).filter(Boolean)); };
      if (isPhone()) goFull(run); else { $(".w").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); setTimeout(run, 350); }
    });

    /* ---------- size classes (the dashboard sidebar takes room, so go by the widget's own width) ---------- */
    var lastW = 0;
    function resetMeasures() { dh = 0; L.forEach(function (l) { l.lw = 0; }); }
    function sizeClasses() { if (full) return; var w = host.clientWidth; if (!w) return;
      host.classList.toggle("wide", w >= 900); host.classList.toggle("mid", w < 900 && w >= 640); host.classList.toggle("ph", w < 640); }
    function init() { sizeClasses(); fitView(); view = homeView(); apply(); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { resetMeasures(); apply(); });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { sizeClasses(); }).observe(host);
      new ResizeObserver(function () { var z = size(); if (!z.w) return; resetMeasures(); if (Math.abs(z.w - lastW) > 40 && !selected) { lastW = z.w; view = homeView(); } else fitView(); apply(); }).observe(map);
    } else window.addEventListener("resize", init);
    updateMine(); init();

    return {
      show: function (id) { var l = byId[id]; if (!l) return; setFilter("all");
        if (isPhone()) goFull(function () { select(l, true); }); else setTimeout(function () { select(l, true); }, 60); },
      mine: function () { setFilter("all"); var m = mineList(); if (m.length) setTimeout(function () { highlight(m); }, 60); else goFull(openPick); },
      setWallet: function (ids) { wal = {}; (ids || []).forEach(function (k) { if (HV[k]) wal[k] = 1; }); if (pick.classList.contains("on")) renderPick(); updateMine(); },
      resize: function () { sizeClasses(); resetMeasures(); fitView(); if (!selected) view = homeView(); apply(); }
    };
  }

  window.HRT_LOUNGE_MAP = { mount: mount, HAVE: HAVE };
})();
