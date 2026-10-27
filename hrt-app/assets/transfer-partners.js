/* HRT Transfer Partners chart (window.HRT_TRANSFERS)
   One source for "which points go where": the chart on the Transfers page reads it, and the
   transfer calculator in app.js builds its partner lists from it.

   Data: checked October 27, 2026 against Frequent Miler's transfer partner master list
   (updated October 20, 2026). Each cell is "a:b" (a bank points become b miles or points),
   or "vBA" / "vQR" when the only way in is through British Airways or Qatar Avios
   (move to that program first, then to the partner).
   Edit a row here and both the chart and the calculator follow.

   mount(host, { bonuses, myBanks, calc }) returns { refresh() }.
   bonuses(): live transfer bonuses (app.js TB.list). myBanks(): { bankId: { cards:[...] } } or null.
   calc(bankId, bonusPct): opens the calculator for that bank. */
(function () {
  "use strict";
  var UPDATED = "October 27, 2026";
  var BANKS = [
    { id: "amex", short: "Amex", name: "Amex Membership Rewards", c: "#2f6fbf" },
    { id: "bilt", short: "Bilt", name: "Bilt Rewards", c: "#3a3f47" },
    { id: "capital-one", short: "Cap One", name: "Capital One Miles", c: "#c4393a" },
    { id: "chase", short: "Chase", name: "Chase Ultimate Rewards", c: "#1f5aa6" },
    { id: "citi", short: "Citi", name: "Citi ThankYou Points", c: "#0d6fa8" },
    { id: "wells", short: "Wells", name: "Wells Fargo Rewards", c: "#b3261e" },
    { id: "rove", short: "Rove", name: "Rove Miles", c: "#6a4fb3" }
  ];
  /* hi: flies from HNL or is a go-to for Hawaiʻi trips. m: words used to match live bonuses. */
  var PROGRAMS = [
    { code: "AS", name: "Alaska / Hawaiian Atmos Rewards", type: "airline", hi: 1, m: /atmos|alaska|hawaiian/i, t: { bilt: "1:1" } },
    { code: "AA", name: "American Airlines AAdvantage", type: "airline", hi: 1, m: /american|aadvantage/i, t: { citi: "1:1" } },
    { code: "UA", name: "United MileagePlus", type: "airline", hi: 1, m: /united/i, t: { bilt: "1:1", chase: "1:1" } },
    { code: "DL", name: "Delta SkyMiles", type: "airline", hi: 1, m: /delta/i, t: { amex: "1:1" } },
    { code: "WN", name: "Southwest Rapid Rewards", type: "airline", hi: 1, m: /southwest/i, t: { bilt: "1:1", chase: "1:1" } },
    { code: "NH", name: "ANA Mileage Club", type: "airline", hi: 1, m: /\bana\b|all nippon/i, t: { amex: "1:1" } },
    { code: "JL", name: "JAL Mileage Bank", type: "airline", hi: 1, m: /\bjal\b|japan airlines/i, t: { bilt: "1:1", "capital-one": "4:3", citi: "1:1", rove: "1:1" } },
    { code: "QF", name: "Qantas Frequent Flyer", type: "airline", hi: 1, m: /qantas/i, t: { amex: "1:1", "capital-one": "1:1", citi: "1:1", rove: "1:1" } },
    { code: "AC", name: "Air Canada Aeroplan", type: "airline", hi: 1, m: /aeroplan|air canada/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "1:1", chase: "1:1", rove: "1:1" } },
    { code: "BA", name: "British Airways Avios", type: "airline", hi: 1, m: /british/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "1:1", chase: "1:1", citi: "vQR", wells: "1:1", rove: "vQR" } },
    { code: "EI", name: "Aer Lingus Avios", type: "airline", m: /aer lingus/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "vBA", chase: "1:1", citi: "vQR", wells: "1:1", rove: "vQR" } },
    { code: "AM", name: "Aeromexico Rewards", type: "airline", m: /aeromexico|aerom[eé]xico/i, t: { amex: "1:1.6", "capital-one": "1:1", rove: "1:1" } },
    { code: "AF", name: "Air France / KLM Flying Blue", type: "airline", m: /flying blue|air france|klm/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "1:1", chase: "1:1", citi: "1:1", wells: "1:1", rove: "1:1" } },
    { code: "AV", name: "Avianca LifeMiles", type: "airline", m: /avianca|lifemiles/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "1:1", citi: "1:1", wells: "1:1" } },
    { code: "CX", name: "Cathay Pacific Asia Miles", type: "airline", m: /cathay|asia miles/i, t: { amex: "5:4", bilt: "1:1", "capital-one": "1:1", citi: "1:1", wells: "1:1", rove: "1:1" } },
    { code: "CM", name: "Copa ConnectMiles", type: "airline", m: /copa/i, t: { citi: "1:1", rove: "1:1" } },
    { code: "EK", name: "Emirates Skywards", type: "airline", m: /emirates/i, t: { amex: "5:4", bilt: "1:1", "capital-one": "4:3", citi: "5:4" } },
    { code: "EY", name: "Etihad Guest", type: "airline", m: /etihad/i, t: { bilt: "1:1", "capital-one": "1:1", citi: "1:1", rove: "1:1" } },
    { code: "BR", name: "EVA Air Infinity MileageLands", type: "airline", m: /\beva\b/i, t: { "capital-one": "4:3", citi: "1:1" } },
    { code: "AY", name: "Finnair Avios", type: "airline", m: /finnair/i, t: { amex: "vBA", bilt: "vBA", "capital-one": "1:1", chase: "vBA", citi: "vQR", wells: "vBA", rove: "1:1" } },
    { code: "IB", name: "Iberia Avios", type: "airline", m: /iberia/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "vBA", chase: "1:1", citi: "vQR", wells: "1:1", rove: "vQR" } },
    { code: "B6", name: "JetBlue TrueBlue", type: "airline", m: /jetblue|trueblue/i, t: { amex: "5:4", bilt: "1:1", "capital-one": "5:3", chase: "1:1", citi: "1:1", wells: "1:1", rove: "1:1" } },
    { code: "LH", name: "Lufthansa Miles & More", type: "airline", m: /lufthansa|miles ?& ?more/i, t: { rove: "1:1" } },
    { code: "QR", name: "Qatar Airways Privilege Club", type: "airline", m: /qatar/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "1:1", chase: "vBA", citi: "1:1", wells: "vBA", rove: "1:1" } },
    { code: "SK", name: "SAS EuroBonus", type: "airline", m: /\bsas\b|eurobonus/i, t: { rove: "1:1" } },
    { code: "SQ", name: "Singapore KrisFlyer", type: "airline", m: /singapore|krisflyer/i, t: { amex: "1:1", "capital-one": "1:1", chase: "1:1", citi: "1:1" } },
    { code: "TP", name: "TAP Air Portugal Miles&Go", type: "airline", m: /\btap\b/i, t: { bilt: "1:1", "capital-one": "1:1" } },
    { code: "TG", name: "Thai Royal Orchid Plus", type: "airline", m: /thai/i, t: { citi: "1:1", rove: "1:1" } },
    { code: "TK", name: "Turkish Miles&Smiles", type: "airline", m: /turkish/i, t: { bilt: "1:1", "capital-one": "1:1", citi: "1:1", rove: "1:1" } },
    { code: "VS", name: "Virgin Atlantic Flying Club", type: "airline", m: /virgin atlantic|flying club|virgin red/i, t: { amex: "1:1", bilt: "1:1", "capital-one": "1:1", chase: "1:1", citi: "1:1", wells: "1:1", rove: "1:1" } },
    { code: "HY", name: "World of Hyatt", type: "hotel", hi: 1, m: /hyatt/i, note: "Bilt moves to 4:3 on January 1, 2027. Chase is 1:1 on most cards.", t: { bilt: "1:1", chase: "1:1" } },
    { code: "MB", name: "Marriott Bonvoy", type: "hotel", hi: 1, m: /marriott|bonvoy/i, t: { amex: "1:1", bilt: "1:1", chase: "1:1" } },
    { code: "HH", name: "Hilton Honors", type: "hotel", hi: 1, m: /hilton/i, t: { amex: "1:2", bilt: "1:1" } },
    { code: "IH", name: "IHG One Rewards", type: "hotel", m: /\bihg\b/i, t: { bilt: "1:1", chase: "1:1" } },
    { code: "WY", name: "Wyndham Rewards", type: "hotel", m: /wyndham/i, t: { bilt: "1:1", "capital-one": "1:1", chase: "1:1", citi: "1:1", wells: "1:2" } },
    { code: "CH", name: "Choice Privileges", type: "hotel", m: /choice/i, t: { amex: "1:1", "capital-one": "1:1", citi: "1:1.5", wells: "1:2" } },
    { code: "AL", name: "Accor Live Limitless", type: "hotel", m: /accor/i, t: { bilt: "3:2", "capital-one": "2:1", citi: "2:1", rove: "1:1" } },
    { code: "PH", name: "Preferred Hotels I Prefer", type: "hotel", m: /i prefer|preferred hotels/i, t: { bilt: "1:2", "capital-one": "1:2", citi: "1:2" } },
    { code: "LW", name: "Leading Hotels of the World", type: "hotel", m: /leading hotels/i, t: { amex: "4:1", citi: "5:1" } }
  ];
  var BYID = {}; BANKS.forEach(function (b) { BYID[b.id] = b; });

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ratio(v) { if (!v || v.charAt(0) === "v") return null; var p = v.split(":"); return [parseFloat(p[0]), parseFloat(p[1])]; }
  function plain(v) {
    if (!v) return "No transfer";
    if (v === "vBA") return "Only through British Airways Avios";
    if (v === "vQR") return "Only through Qatar Avios";
    var r = ratio(v); var per = Math.round(1000 * r[1] / r[0]);
    return v === "1:1" ? "1:1, every point becomes a mile" : v + ", 1,000 points become " + per.toLocaleString() + (per === 1000 ? "" : "");
  }
  /* calculator lists for app.js: [name, type, a, b, hawaii pick] per bank, direct transfers only */
  function calcLists() {
    var out = {};
    BANKS.forEach(function (b) {
      var p = PROGRAMS.filter(function (x) { return ratio(x.t[b.id]); }).map(function (x) { var r = ratio(x.t[b.id]); return [x.name, x.type, r[0], r[1], x.hi ? 1 : 0]; });
      out[b.id] = { name: b.name, p: p };
    });
    return out;
  }

  var CSS = [
    ':host{all:initial;display:block;width:100%;--surface:#fff;--surface2:#f7f9fb;--text:#1b2430;--muted:#5c6b7d;--line:#e4eaf0;--navy:#1b2430;--navy2:#141b24;--coral:#d97040;--coral-ink:#b5552a;--ok:#1f7a55;--gold:#f2b84b;',
    ' --d:"sofia-pro","Montserrat","DM Sans",Arial,sans-serif;--u:"DM Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-family:var(--u);font-size:14px;line-height:1.45;color:var(--text);-webkit-font-smoothing:antialiased}',
    ':host(.dark){--surface:#111f2e;--surface2:#0d1a27;--text:#e9eff6;--muted:#93a5b8;--line:#213347;--coral-ink:#f0a070;--ok:#3fce7f}',
    '[hidden]{display:none!important}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer;letter-spacing:normal;text-transform:none}',
    ':focus-visible{outline:3px solid var(--coral);outline-offset:2px}',
    '.bar{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}',
    '.srch{display:flex;align-items:center;gap:8px;border:1.5px solid var(--line);border-radius:11px;padding:0 10px;height:40px;background:var(--surface2);flex:1 1 220px;min-width:0;max-width:340px}',
    '.srch svg{width:16px;height:16px;flex:none;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round}.srch:focus-within{border-color:var(--coral)}',
    '.srch input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--text);height:auto;margin:0;padding:0;box-shadow:none}',
    '.chip{border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:700;white-space:nowrap;min-height:36px;display:inline-flex;align-items:center;gap:6px}',
    '.chip[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}:host(.dark) .chip[aria-pressed=true]{background:#fff;color:var(--navy2);border-color:#fff}',
    '.chip.mine[aria-pressed=true]{background:var(--ok);border-color:var(--ok);color:#fff}',
    '.chip svg{width:13px;height:13px;fill:currentColor}',
    '.hint{padding:8px 16px 0;font-size:12.5px;color:var(--muted)}.hint b{color:var(--text)}',
    '.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}',
    'table{border-collapse:separate;border-spacing:0;width:100%;min-width:640px}',
    'th,td{padding:0;text-align:center}',
    'thead th{position:sticky;top:0;background:var(--surface);z-index:2;padding:10px 4px;border-bottom:1px solid var(--line)}',
    'thead th.pn{text-align:left;padding-left:16px;font-size:12px;color:var(--muted);font-weight:700;letter-spacing:.4px;text-transform:uppercase}',
    '.bk{border:0;border-radius:9px;padding:6px 0;width:100%;max-width:74px;font-weight:800;font-size:12px;color:#fff;background:var(--c);min-height:34px;line-height:1.1}',
    '.bk small{display:block;font-size:9.5px;font-weight:700;opacity:.85;margin-top:1px}',
    '.bk[aria-pressed=true]{box-shadow:0 0 0 3px var(--surface),0 0 0 5px var(--c)}',
    'th.col-off .bk{opacity:.35}',
    'tbody tr{cursor:pointer}tbody tr:hover td,tbody tr.on td{background:var(--surface2)}',
    'tbody td{border-bottom:1px solid var(--line);height:48px}',
    'td.pn{text-align:left;padding:6px 10px 6px 16px;position:sticky;left:0;background:var(--surface);z-index:1;min-width:210px}',
    'tbody tr:hover td.pn,tbody tr.on td.pn{background:var(--surface2)}',
    '.pr{display:flex;align-items:center;gap:10px}',
    '.cd{flex:none;width:34px;height:26px;border-radius:7px;background:var(--surface2);border:1px solid var(--line);display:grid;place-items:center;font-size:11px;font-weight:800;letter-spacing:.3px;color:var(--muted)}',
    '.pr b{font-size:14px;font-weight:700;line-height:1.2}.pr small{display:block;font-size:11.5px;color:var(--muted);font-weight:600}',
    '.hi{color:var(--coral-ink);font-weight:700}',
    '.ok{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:40px;height:34px;border-radius:9px;background:color-mix(in srgb,var(--c) 14%,var(--surface));color:var(--c);font-weight:800}',
    ':host(.dark) .ok{background:color-mix(in srgb,var(--c) 30%,var(--surface));color:#fff}',
    '.ok svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',
    '.ok small{font-size:9.5px;font-weight:800;line-height:1}',
    '.via{display:inline-grid;place-items:center;width:40px;height:34px;border-radius:9px;border:1.5px dashed color-mix(in srgb,var(--c) 55%,var(--line));color:var(--muted);font-size:9.5px;font-weight:800;line-height:1.05}',
    '.no{color:var(--line);font-weight:700}',
    '.ok.bon{box-shadow:0 0 0 2px var(--coral);position:relative}',
    '.ok.bon::after{content:"+";position:absolute;right:-6px;top:-6px;width:15px;height:15px;border-radius:50%;background:var(--coral);color:#fff;font-size:11px;line-height:15px;font-weight:800}',
    'td.dim .ok,td.dim .via{opacity:.25}',
    'td.mine .ok{box-shadow:0 0 0 2px var(--ok)}',
    '.det{border-top:1px solid var(--line);padding:14px 16px 16px;background:var(--surface2)}',
    '.det h4{margin:0 0 2px;font-family:var(--d);font-weight:800;font-size:17px;color:var(--text);letter-spacing:normal;text-transform:none}',
    '.det .sub{font-size:12.5px;color:var(--muted);margin-bottom:10px}',
    '.dl{display:flex;flex-direction:column;gap:6px}',
    '.dr{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:9px 12px}',
    '.dr .dot{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}',
    '.dr b{min-width:150px}.dr span{color:var(--muted);font-size:13px;flex:1 1 200px}',
    '.dr .tag{flex:none;font-size:11.5px;font-weight:800;color:#fff;background:var(--coral);border-radius:999px;padding:2px 9px}',
    '.dr .tag.y{background:var(--ok)}',
    '.dr button{border:0;border-radius:999px;padding:8px 13px;font-weight:700;font-size:12.5px;background:var(--navy);color:#fff;min-height:36px}',
    ':host(.dark) .dr button{background:#e9eff6;color:#0b131d}',
    '.none{font-size:13px;color:var(--muted)}',
    '.foot{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;padding:10px 16px 14px;font-size:12px;color:var(--muted);border-top:1px solid var(--line)}',
    '.foot i{display:inline-block;vertical-align:-3px;margin-right:6px}',
    '.foot .k1{width:16px;height:14px;border-radius:4px;background:color-mix(in srgb,#2f6fbf 16%,var(--surface))}',
    '.foot .k2{width:16px;height:14px;border-radius:4px;border:1.5px dashed var(--muted)}',
    '.foot .k3{width:14px;height:14px;border-radius:50%;background:var(--coral)}',
    '.empty{padding:26px 16px;text-align:center;color:var(--muted)}',
    '@media (max-width:640px){table{min-width:0}td.pn{min-width:0;width:34%;padding:6px 6px 6px 12px}thead th.pn{padding-left:12px}.pr b{font-size:12.5px}.pr small{display:none}.cd{display:none}',
    ' thead th{padding:8px 1px}.bk{max-width:42px;font-size:10.5px;padding:5px 0;min-height:30px;border-radius:7px}.bk small{display:none}',
    ' .ok,.via{width:30px;height:30px;border-radius:7px}.ok svg{width:13px;height:13px}.ok small,.via{font-size:8.5px}tbody td{height:44px}',
    ' .bar{padding:10px 12px}.hint{padding:8px 12px 0}.det{padding:12px}.dr b{min-width:0;flex:1 1 auto}.dr span{flex:1 1 100%}.dr span.tag{flex:none}}'
  ].join("");
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function mount(host, opts) {
    if (!host || host.shadowRoot) return null;
    opts = opts || {};
    var root = host.attachShadow({ mode: "open" });
    var S = { type: "airline", q: "", bank: null, hi: false, mine: false, open: null };
    function theme() { host.classList.toggle("dark", document.documentElement.getAttribute("data-theme") === "dark"); }
    theme(); new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="bar">' +
        '<label class="srch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" class="q" placeholder="Search an airline or hotel" aria-label="Search programs" autocomplete="off"></label>' +
        '<button type="button" class="chip" data-type="airline" aria-pressed="true">Airlines</button>' +
        '<button type="button" class="chip" data-type="hotel" aria-pressed="false">Hotels</button>' +
        '<button type="button" class="chip" data-hi aria-pressed="false">Hawaiʻi favorites</button>' +
        '<button type="button" class="chip mine" data-mine aria-pressed="false" hidden>' + CHECK + 'My cards</button>' +
      '</div>' +
      '<div class="hint">Tap a bank to see only its partners. Tap a program to see every way in.</div>' +
      '<div class="scroll"><table><thead><tr><th class="pn" scope="col">Program</th>' + BANKS.map(function (b) {
        return '<th scope="col" data-col="' + b.id + '"><button type="button" class="bk" data-bank="' + b.id + '" style="--c:' + b.c + '" aria-pressed="false" title="' + esc(b.name) + '">' + esc(b.short) + '<small class="bn"></small></button></th>';
      }).join("") + '</tr></thead><tbody></tbody></table></div>' +
      '<div class="det" hidden></div>' +
      '<div class="foot"><span><i class="k1"></i>Transfers directly</span><span><i class="k2"></i>Through BA or Qatar Avios</span><span><i class="k3"></i>Live transfer bonus</span><span>Checked ' + UPDATED + '. Confirm in your bank account before you move points.</span></div>';
    var $ = function (s) { return root.querySelector(s); };
    var tbody = $("tbody"), det = $(".det");

    function bonusFor(bankId, p) { var L = (opts.bonuses && opts.bonuses()) || []; for (var i = 0; i < L.length; i++) { var b = L[i]; if (b.bank === bankId && p.m.test(String(b.partner || ""))) return b; } return null; }
    function myBanks() { var m = opts.myBanks && opts.myBanks(); return m && Object.keys(m).length ? m : null; }
    function rows() {
      return PROGRAMS.filter(function (p) {
        if (p.type !== S.type) return false;
        if (S.hi && !p.hi) return false;
        if (S.q && (p.name + " " + p.code).toLowerCase().indexOf(S.q) < 0) return false;
        if (S.bank && !p.t[S.bank]) return false;
        if (S.mine) { var mb = myBanks(); if (!mb || !Object.keys(p.t).some(function (k) { return mb[k]; })) return false; }
        return true;
      });
    }
    function cell(p, b, mb) {
      var v = p.t[b.id], cls = (S.bank && S.bank !== b.id ? "dim " : "") + (mb && mb[b.id] && v ? "mine" : "");
      if (!v) return '<td class="' + cls + '"><span class="no" aria-label="No transfer">&ndash;</span></td>';
      if (v.charAt(0) === "v") return '<td class="' + cls + '" style="--c:' + b.c + '"><span class="via" title="' + esc(plain(v)) + '">via<br>' + (v === "vBA" ? "BA" : "Qatar") + '</span></td>';
      var bon = bonusFor(b.id, p);
      return '<td class="' + cls + '" style="--c:' + b.c + '"><span class="ok' + (bon ? " bon" : "") + '" title="' + esc(b.short + " to " + p.name + ": " + v + (bon ? ", live +" + bon.bonusPct + "% bonus" : "")) + '">' + CHECK + (v !== "1:1" ? '<small>' + esc(v) + '</small>' : '') + '</span></td>';
    }
    function render() {
      var mb = myBanks(), list = rows();
      $("[data-mine]").hidden = !mb;
      if (!mb && S.mine) S.mine = false;
      root.querySelectorAll("[data-type]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.type === S.type); });
      $("[data-hi]").setAttribute("aria-pressed", S.hi); $("[data-mine]").setAttribute("aria-pressed", S.mine);
      BANKS.forEach(function (b) {
        var n = PROGRAMS.filter(function (p) { return p.type === S.type && p.t[b.id] && p.t[b.id].charAt(0) !== "v"; }).length;
        var btn = root.querySelector('[data-bank="' + b.id + '"]'); btn.querySelector(".bn").textContent = n + (S.type === "hotel" ? " hotels" : " airlines");
        btn.setAttribute("aria-pressed", S.bank === b.id);
        root.querySelector('th[data-col="' + b.id + '"]').classList.toggle("col-off", !!S.bank && S.bank !== b.id);
      });
      tbody.innerHTML = list.length ? list.map(function (p) {
        var direct = BANKS.filter(function (b) { return p.t[b.id] && p.t[b.id].charAt(0) !== "v"; }).length;
        return '<tr data-p="' + p.code + '" class="' + (S.open === p.code ? "on" : "") + '" tabindex="0"><td class="pn"><div class="pr"><span class="cd">' + esc(p.code) + '</span><div><b>' + esc(p.name) + '</b><small>' +
          (direct ? direct + (direct === 1 ? " bank" : " banks") : "No direct transfers") + (p.hi ? ' · <span class="hi">Hawaiʻi favorite</span>' : '') + '</small></div></div></td>' +
          BANKS.map(function (b) { return cell(p, b, mb); }).join("") + '</tr>';
      }).join("") : '<tr><td colspan="' + (BANKS.length + 1) + '"><div class="empty">No programs match that. Clear the search or pick another bank.</div></td></tr>';
      renderDet();
    }
    function renderDet() {
      var p = null; PROGRAMS.forEach(function (x) { if (x.code === S.open) p = x; });
      if (!p) { det.hidden = true; return; }
      var mb = myBanks();
      var ways = BANKS.filter(function (b) { return p.t[b.id]; });
      det.hidden = false;
      det.innerHTML = '<h4>' + esc(p.name) + '</h4><div class="sub">' + (ways.length ? "Ways to move points here" : "None of these banks transfer here") + (p.note ? ". " + esc(p.note) : "") + '</div>' +
        (ways.length ? '<div class="dl">' + ways.map(function (b) {
          var v = p.t[b.id], bon = v.charAt(0) === "v" ? null : bonusFor(b.id, p), mine = mb && mb[b.id];
          return '<div class="dr" style="--c:' + b.c + '"><span class="dot"></span><b>' + esc(b.name) + '</b><span>' + esc(plain(v)) + (mine ? ". You earn these with your " + esc(mine.cards.join(" or ")) : "") + '</span>' +
            (bon ? '<span class="tag">+' + esc(bon.bonusPct) + '% bonus now</span>' : '') + (mine ? '<span class="tag y">Your points</span>' : '') +
            (v.charAt(0) !== "v" && opts.calc ? '<button type="button" data-calc="' + b.id + '|' + (bon ? bon.bonusPct : 0) + '">Calculate</button>' : '') + '</div>';
        }).join("") + '</div>' : '<div class="none">Earn these miles by flying or with the airline\'s own credit card instead.</div>');
    }

    root.addEventListener("click", function (e) {
      var t = e.target;
      var ty = t.closest("[data-type]"); if (ty) { S.type = ty.dataset.type; S.open = null; render(); return; }
      if (t.closest("[data-hi]")) { S.hi = !S.hi; render(); return; }
      if (t.closest("[data-mine]")) { S.mine = !S.mine; render(); return; }
      var bk = t.closest("[data-bank]"); if (bk) { S.bank = S.bank === bk.dataset.bank ? null : bk.dataset.bank; render(); return; }
      var c = t.closest("[data-calc]"); if (c) { var x = c.dataset.calc.split("|"); opts.calc(x[0], +x[1] || 0); return; }
      var r = t.closest("tr[data-p]"); if (r) { S.open = S.open === r.dataset.p ? null : r.dataset.p; render(); if (S.open) det.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    });
    root.addEventListener("keydown", function (e) { var r = e.target.closest && e.target.closest("tr[data-p]"); if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); } });
    var qT; $(".q").addEventListener("input", function () { var v = this.value; clearTimeout(qT); qT = setTimeout(function () { S.q = v.trim().toLowerCase(); render(); }, 120); });
    render();
    return { refresh: render };
  }

  window.HRT_TRANSFERS = { mount: mount, BANKS: BANKS, PROGRAMS: PROGRAMS, calcLists: calcLists, UPDATED: UPDATED };
})();
