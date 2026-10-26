/* HRT Kamaʻāina Deals map (window.HRT_DEALS_MAP)
   Same system as the HNL Lounge Map (lounge-map.js), on the real street map:
   list on the left that follows the map, map on the right, grouped pins when crowded,
   pins with labels that never overlap, island buttons, a slide-in deal card, and on
   phones a preview that opens full screen with tabs at the bottom and a swipe-down sheet.
   The street map is OpenFreeMap (free, no key), recolored to HRT colors with shop icons hidden.
   Everything lives in a shadow root so none of these styles touch the dashboard.

   mount(host, { deals, details }) returns { show(id), resize() }.
   deals: [{ id, b, h, isl, k:"stay"|"act"|"more", p, v, kk, s, r, e, m, u, d, ll:[lat,lng]|null }]
   details(id): opens the dashboard's full offer dialog (kamaaina.js). */
(function () {
  "use strict";
  var STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
  var STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
  var MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
  var ISL = { all: [[-160.35, 18.85], [-154.75, 22.30]], oahu: [[-158.30, 21.24], [-157.64, 21.73]], maui: [[-156.72, 20.55], [-155.95, 21.05]],
    hawaii: [[-156.10, 18.90], [-154.80, 20.30]], kauai: [[-159.80, 21.85], [-159.28, 22.25]], lm: [[-157.35, 20.70], [-156.75, 21.25]] };
  var ISLN = { oahu: "Oʻahu", maui: "Maui", hawaii: "Hawaiʻi Island", kauai: "Kauaʻi", lm: "Lānaʻi & Molokaʻi", all: "Several islands" };
  var KINDS = { stay: { label: "Hotels", one: "Hotel", c: "var(--c-stay)", icon: "bed" }, act: { label: "Things to do", one: "Thing to do", c: "var(--c-act)", icon: "star" }, more: { label: "Dining & more", one: "Dining & more", c: "var(--c-more)", icon: "fork" } };
  var ICONS = {
    bed: '<path d="M3 6h2v6h14a2 2 0 0 1 2 2v5h-2v-2H5v2H3zm5 1.5a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6zM11 8h6a3 3 0 0 1 3 3H11z"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/>',
    fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9h2v-9a2 2 0 0 0 2-2V3h-1.6v6h-1.2V3H8.8v6H7.6V3zM16 3c-1.7 0-3 2.2-3 5v5h2v8h2V3z"/>',
    clock: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5v4.6l3.6 2.1-1 1.7L11 12.7V7z"/>',
    ext: '<path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    near: '<path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
    info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1.3 15h-2.6v-6.6h2.6zM12 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>'
  };
  var LIST_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>';
  var FULL_IC = '<svg viewBox="0 0 24 24"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>';
  var X_IC = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ic(n, cls) { return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }

  /* Recolor the free street map to HRT colors and hide shop and house-number labels */
  var styleCache = {};
  function hrtStyle(dark, done) {
    var url = dark ? STYLE_DARK : STYLE_LIGHT, key = dark ? "d" : "l";
    if (styleCache[key]) { done(styleCache[key]); return; }
    if (!window.fetch) { done(url); return; }
    fetch(url).then(function (r) { return r.json(); }).then(function (st) {
      (st.layers || []).forEach(function (l) {
        var id = l.id || "";
        if (/poi|housenumber|aerialway/.test(id)) { l.layout = l.layout || {}; l.layout.visibility = "none"; return; }
        l.paint = l.paint || {};
        if (l.type === "background") l.paint["background-color"] = dark ? "#142235" : "#f7f6f1";
        else if (l.type === "fill" && /water/.test(id)) l.paint["fill-color"] = dark ? "#0b1826" : "#d3e2ee";
        else if (l.type === "fill" && /park|landcover_wood|landcover_grass|landuse_park/.test(id)) l.paint["fill-color"] = dark ? "#16302c" : "#e6efe3";
      });
      styleCache[key] = st; done(st);
    }).catch(function () { done(url); });
  }

  var CSS = [
    ':host{all:initial;display:block;width:100%;contain:layout;',
    ' --bg:#eef2f6;--surface:#fff;--surface2:#f7f9fb;--text:#1b2430;--muted:#5c6b7d;--line:#e4eaf0;',
    ' --navy:#1b2430;--navy2:#141b24;--coral:#d97040;--coral-ink:#b5552a;',
    ' --c-stay:#2f6f9f;--c-act:#1f7a55;--c-more:#a86f0c;--shadow:0 1px 2px rgba(16,32,54,.06),0 8px 24px rgba(16,32,54,.06);',
    ' --d:"sofia-pro","Montserrat","DM Sans",Arial,sans-serif;--u:"DM Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;',
    ' font-family:var(--u);font-size:14px;line-height:1.5;color:var(--text);-webkit-font-smoothing:antialiased}',
    ':host(.dark){--surface:#111f2e;--surface2:#0d1a27;--text:#e9eff6;--muted:#93a5b8;--line:#213347;--coral-ink:#f0a070;--c-stay:#6fa9d8;--c-act:#38b878;--c-more:#e9b44a;--shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35)}',
    ':host(.full){position:fixed!important;inset:0!important;z-index:2147483000!important;width:100vw!important;height:100%!important;margin:0!important;contain:none}',
    '[hidden]{display:none!important}*{box-sizing:border-box}button{font:inherit;color:inherit;cursor:pointer;letter-spacing:normal;text-transform:none}a{color:inherit;text-decoration:none}',
    ':focus-visible{outline:3px solid var(--coral);outline-offset:2px}',
    '.lay{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}',
    ':host(.wide) .lay{grid-template-columns:minmax(310px,390px) minmax(0,1fr)}:host(.full) .lay{display:block;height:100%}',
    '.side{display:none;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;height:min(80vh,780px);min-height:560px;box-shadow:var(--shadow)}',
    ':host(.wide) .side{display:flex}:host(.full) .side{display:none}',
    '.sh{padding:12px 14px 10px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:8px}',
    '.r1{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.r1 b{font-family:var(--d);font-weight:800;font-size:16px}.r1 span{font-size:12.5px;color:var(--muted)}',
    '.srch{display:flex;align-items:center;gap:8px;border:1.5px solid var(--line);border-radius:11px;padding:0 10px;height:42px;background:var(--surface2)}',
    '.srch svg{width:16px;height:16px;flex:none;fill:none;stroke:var(--muted);stroke-width:2;stroke-linecap:round}',
    '.srch input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--text);height:auto;margin:0;padding:0;box-shadow:none}',
    '.srch:focus-within{border-color:var(--coral)}',
    '.sorts{display:flex;gap:6px;flex-wrap:wrap}',
    '.sorts button{border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:6px 11px;font-size:12.5px;font-weight:700;min-height:34px}',
    '.sorts button[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}:host(.dark) .sorts button[aria-pressed=true]{background:#fff;color:var(--navy2);border-color:#fff}',
    '.follow{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);cursor:pointer;min-height:32px}.follow input{width:18px;height:18px;accent-color:#d97040;margin:0}',
    '.sl{flex:1;overflow-y:auto;padding:4px 8px 12px}',
    '.row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;background:transparent;border-radius:12px;padding:10px;min-height:62px}',
    '.row:hover,.row.hov{background:var(--surface2)}.row.sel{background:color-mix(in srgb,var(--coral) 12%,var(--surface));box-shadow:inset 0 0 0 2px var(--coral)}',
    '.row .dt{flex:none;width:32px;height:32px;border-radius:50%;background:var(--c);display:grid;place-items:center;box-shadow:0 0 0 2px #fff}.row .dt svg{width:17px;height:17px;fill:#fff}',
    '.row .nm{flex:1;min-width:0;display:flex;flex-direction:column}',
    '.row .nm b{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.row .nm small{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.row .vl{flex:none;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:1px}',
    '.row .vl b{font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums}.row .vl small{font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}.row .vl small.soon{color:var(--coral-ink);font-weight:700}',
    '.empty{color:var(--muted);text-align:center;padding:30px 16px;font-size:13.5px}',
    '.w{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;height:min(80vh,780px);min-height:560px;display:flex;flex-direction:column;-webkit-tap-highlight-color:transparent;box-shadow:var(--shadow)}',
    ':host(.full) .w{height:100vh;height:100dvh;min-height:0;border-radius:0;border:0}',
    '.top{display:flex;align-items:center;gap:12px;padding:12px 14px 10px;flex:none;flex-wrap:wrap;border-bottom:1px solid var(--line)}',
    ':host(.full) .top{padding-top:calc(12px + env(safe-area-inset-top,0px))}',
    '.ttl{display:flex;flex-direction:column;line-height:1.1}.ttl b{font-family:var(--d);font-weight:800;font-size:18px}.ttl span{font-size:12px;color:var(--muted);margin-top:3px}',
    '.chips{display:flex;gap:6px;margin-left:auto;overflow-x:auto;scrollbar-width:none;max-width:100%}.chips::-webkit-scrollbar{display:none}',
    '.chip{border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:6px;min-height:36px}',
    '.chip i{width:9px;height:9px;border-radius:50%;background:var(--c)}.chip em{font-style:normal;font-size:11.5px;opacity:.7}',
    '.chip[aria-pressed=true]{background:var(--navy);color:#fff;border-color:var(--navy)}:host(.dark) .chip[aria-pressed=true]{background:#fff;color:var(--navy2);border-color:#fff}',
    '.map{position:relative;flex:1;overflow:hidden;background:#d3e2ee}:host(.dark) .map{background:#0b1826}',
    '.mapgl{position:absolute;inset:0}',
    '.mapmsg{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13.5px;z-index:1;pointer-events:none}',
    '.pins{position:absolute;inset:0;pointer-events:none;z-index:2;overflow:hidden}',
    '.pin{position:absolute;left:0;top:0;pointer-events:auto;border:0;background:none;padding:0;display:flex;align-items:center}',
    '.dot{width:28px;height:28px;border-radius:50%;background:var(--c);display:grid;place-items:center;box-shadow:0 0 0 2.5px #fff,0 4px 10px rgba(10,20,34,.35);flex:none;position:relative;z-index:1}',
    '.dot svg{width:15px;height:15px;fill:#fff}',
    '.lab{background:var(--surface);color:var(--text);font-weight:700;font-size:12px;line-height:1.15;padding:5px 10px 5px 17px;margin-left:-12px;border-radius:0 999px 999px 0;white-space:nowrap;box-shadow:0 4px 12px rgba(10,20,34,.22);max-width:200px;overflow:hidden;text-overflow:ellipsis}',
    '.lab em{font-style:normal;color:var(--coral-ink);margin-left:5px}',
    '.pin.nolab .lab{display:none}.pin.left{flex-direction:row-reverse}.pin.left .lab{margin:0 -12px 0 0;padding:5px 17px 5px 10px;border-radius:999px 0 0 999px}',
    '.pin.sel .dot,.pin.hov .dot{box-shadow:0 0 0 3px #fff,0 0 0 7px var(--c),0 6px 16px rgba(10,20,34,.4)}.pin.sel .lab{background:var(--c);color:#fff}.pin.sel .lab em{color:#fff}',
    '.pin.pulse .dot::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:3px solid var(--c);animation:pl 1.3s ease-out infinite}@keyframes pl{to{transform:scale(2.4);opacity:0}}',
    '.cl{position:absolute;left:0;top:0;pointer-events:auto;border:0;padding:0;border-radius:50%;background:var(--navy);color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;box-shadow:0 0 0 3px rgba(255,255,255,.9),0 4px 12px rgba(10,20,34,.35);font-variant-numeric:tabular-nums}',
    ':host(.dark) .cl{background:#e9eff6;color:#0b131d}.cl.hov{box-shadow:0 0 0 3px #fff,0 0 0 7px var(--coral),0 6px 16px rgba(10,20,34,.4)}',
    '.ctl{position:absolute;right:12px;top:12px;display:flex;flex-direction:column;gap:8px;z-index:3}',
    '.btn{width:44px;height:44px;border-radius:12px;border:0;background:var(--navy);display:grid;place-items:center;box-shadow:0 4px 14px rgba(10,20,34,.3)}',
    '.btn svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.btn:hover{background:var(--navy2)}',
    '.quick{position:absolute;left:12px;top:12px;display:flex;gap:6px;z-index:3;flex-wrap:wrap;max-width:calc(100% - 80px)}',
    '.q{border:0;border-radius:999px;padding:8px 13px;background:var(--navy);color:#fff;font-weight:700;font-size:13px;box-shadow:0 4px 14px rgba(10,20,34,.3);min-height:38px;white-space:nowrap}.q[aria-pressed=true]{background:var(--coral)}',
    '.card{position:absolute;z-index:5;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 40px rgba(10,20,34,.3);padding:16px 18px;left:12px;bottom:12px;width:min(390px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;transform:translateY(16px);opacity:0;pointer-events:none;transition:transform .22s ease,opacity .22s ease}',
    '.card.on{transform:none;opacity:1;pointer-events:auto}',
    '.card .cat{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;color:var(--c);text-transform:uppercase}.card .cat i{width:8px;height:8px;border-radius:50%;background:var(--c)}',
    '.card h3{font-family:var(--d);font-weight:800;font-size:20px;line-height:1.15;margin:6px 40px 2px 0;color:var(--text);letter-spacing:normal;text-transform:none}',
    '.card .meta{font-size:13px;color:var(--muted)}',
    '.card .big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-top:10px}.card .big b{font-family:var(--d);font-weight:800;font-size:26px;color:var(--coral-ink);line-height:1}',
    '.card .big span{font-size:13px;color:var(--muted)}.card .big span.soon{color:var(--coral-ink);font-weight:700}',
    '.card p{margin:10px 0 0;font-size:13.5px;line-height:1.5;color:var(--text)}',
    '.perks{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.perks span{font-size:12px;font-weight:600;background:var(--surface2);border:1px solid var(--line);border-radius:999px;padding:3px 10px}',
    '.card .id{margin-top:10px;font-size:12.5px;color:var(--muted)}',
    '.card .rowb{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}',
    '.card .a{border:0;border-radius:999px;padding:10px 15px;font-weight:700;font-size:13px;background:var(--coral);color:#fff;display:inline-flex;align-items:center;gap:6px;min-height:42px}',
    '.card .a.alt{background:var(--surface2);color:var(--text);border:1px solid var(--line)}.card .a svg{width:14px;height:14px;fill:currentColor}',
    '.card .x{position:absolute;right:10px;top:10px;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:var(--surface2);font-size:20px;line-height:1;color:var(--text)}',
    '.list{position:absolute;z-index:6;inset:0;background:var(--surface);overflow:auto;padding:16px 16px 24px;transform:translateY(100%);transition:transform .28s ease;visibility:hidden}.list.on{transform:none;visibility:visible}',
    '.list h4{font-family:var(--d);font-weight:800;font-size:22px;margin:4px 0 8px;color:var(--text)}',
    '.close{position:sticky;top:0;float:right;border:0;background:var(--navy);color:#fff;border-radius:999px;padding:9px 15px;font-weight:700;z-index:2;min-height:40px}',
    '.foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;font-size:12px;color:var(--muted);flex:none;border-top:1px solid var(--line)}',
    '.foot button{border:0;background:var(--coral);color:#fff;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px;display:flex;gap:6px;align-items:center;min-height:38px}',
    '.foot button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round}:host(.wide) .foot [data-a=list]{display:none}',
    '.tabs{display:none}.explore{display:none}.grab{display:none}',
    ':host(.ph) .w{height:auto;min-height:0}:host(.ph) .map{flex:none;aspect-ratio:4/3}:host(.ph.full) .w{height:100vh;height:100dvh}:host(.ph.full) .map{flex:1;aspect-ratio:auto}',
    ':host(.ph) .chips{display:none;margin-left:0;width:100%;padding-bottom:2px}:host(.ph.full) .chips{display:flex}',
    ':host(.ph) .foot{display:none}:host(.ph) .quick{display:none}',
    ':host(.ph.full) .quick{display:flex;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:calc(100% - 66px)}:host(.ph.full) .quick::-webkit-scrollbar{display:none}',
    ':host(.ph) .ctl{right:10px;top:10px;display:none}:host(.ph.full) .ctl{display:flex}:host(.ph) .ctl [data-a=in],:host(.ph) .ctl [data-a=out]{display:none}',
    ':host(.ph) .explore{display:flex;position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:4;border:0;border-radius:999px;background:var(--coral);color:#fff;font-weight:800;font-size:14px;padding:11px 17px;gap:7px;align-items:center;white-space:nowrap;box-shadow:0 8px 22px rgba(10,20,34,.4);min-height:44px}',
    '.explore svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}:host(.ph.full) .explore{display:none}',
    ':host(.ph) .tabs{display:grid;grid-template-columns:repeat(4,1fr);flex:none;background:var(--navy2);padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px))}',
    '.tab{border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 2px;font-size:11.5px;font-weight:700;color:#e9eff6;min-height:54px;border-radius:12px}',
    '.tab:active{background:#1b2f4c}.tab span{width:30px;height:30px;border-radius:50%;background:var(--c);display:grid;place-items:center}',
    '.tab span svg{width:17px;height:17px;fill:#fff}.tab span svg.ln{fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round}',
    ':host(.ph) .card{left:0;right:0;bottom:0;width:auto;max-height:74%;border-radius:20px 20px 0 0;border-width:1px 0 0;padding:10px 18px 18px;transform:translateY(105%);opacity:1}',
    ':host(.ph) .card.on{transform:none}:host(.ph) .card .grab{display:block;width:44px;height:5px;border-radius:3px;background:var(--line);margin:0 auto 10px}',
    ':host(.ph) .card .a{padding:12px 16px;font-size:14px}:host(.ph) .card .x{top:16px;right:14px}',
    '.maplibregl-ctrl-attrib{font-size:10.5px}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'
  ].join("");

  function mount(host, opts) {
    if (!host || host.shadowRoot) return null;
    opts = opts || {};
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var D = (opts.deals || []).map(function (d) {
      var e = d.e ? new Date(d.e + "T00:00:00") : null, days = e ? Math.round((e - today) / 864e5) : 9999;
      return { id: d.id, b: d.b, h: d.h || "", isl: d.isl, k: d.k, p: d.p || 0, v: d.v, kk: d.kk || [], s: d.s || 0, r: d.r || "", m: d.m || "", u: d.u || "",
        d: String(d.d || "").replace(/\s*•\s*/g, ". ").slice(0, 220), ll: d.ll, days: days,
        ends: e ? MN[e.getMonth()] + " " + e.getDate() + ", " + e.getFullYear() : "",
        head: d.p ? d.p + "% off" : (d.v ? "From $" + d.v : "Resident rate"), place: (d.h ? d.h + " · " : "") + (ISLN[d.isl] || "") };
    }).filter(function (d) { return d.days >= 0; });
    /* spread deals that share one spot a little so each can be tapped */
    var seen = {};
    D.forEach(function (d) { if (!d.ll) return; var key = d.ll[0].toFixed(4) + "," + d.ll[1].toFixed(4), n = seen[key] = (seen[key] || 0) + 1;
      if (n > 1) { var a = n * 2.4, r = 0.0011 * Math.sqrt(n); d.ll = [d.ll[0] + Math.sin(a) * r, d.ll[1] + Math.cos(a) * r]; } });
    var onMap = D.filter(function (d) { return d.ll; });
    var byId = {}; D.forEach(function (d) { byId[d.id] = d; });
    var cnt = { stay: 0, act: 0, more: 0 }; D.forEach(function (d) { cnt[d.k] = (cnt[d.k] || 0) + 1; });

    var root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<link rel="stylesheet" href="' + MAPLIBRE_CSS + '"><style>' + CSS + '</style>' +
      '<div class="lay"><aside class="side" aria-label="Deals"><div class="sh">' +
        '<div class="r1"><b class="scnt"></b><span class="ssub"></span></div>' +
        '<label class="srch"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" class="sq" placeholder="Search a hotel, town or activity" aria-label="Search deals" autocomplete="off"></label>' +
        '<div class="sorts" role="group" aria-label="Sort"><button type="button" data-sort="best" aria-pressed="true">Best deals</button><button type="button" data-sort="soon" aria-pressed="false">Ending soon</button><button type="button" data-sort="off" aria-pressed="false">Biggest discount</button></div>' +
        '<label class="follow"><input type="checkbox" class="fol" checked> Only show deals on the map</label>' +
      '</div><div class="sl"></div></aside>' +
      '<div class="mapcol"><div class="w" role="region" aria-label="Kamaʻāina Deals map">' +
        '<div class="top"><div class="ttl"><b>Find a deal</b><span>Tap a pin or a deal in the list</span></div><div class="chips" role="toolbar" aria-label="Show"></div></div>' +
        '<div class="map"><div class="mapgl" aria-label="Map of kamaʻāina deals"></div><div class="mapmsg">Loading the map…</div><div class="pins"></div><div class="quick" role="group" aria-label="Islands"></div>' +
          '<div class="ctl">' +
            '<button type="button" class="btn" data-a="in" aria-label="Zoom in"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>' +
            '<button type="button" class="btn" data-a="out" aria-label="Zoom out"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>' +
            '<button type="button" class="btn" data-a="fit" aria-label="Show all islands"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button>' +
            '<button type="button" class="btn fullbtn" data-a="full" aria-label="Full screen">' + FULL_IC + '</button>' +
          '</div>' +
          '<button type="button" class="explore" data-a="full">' + FULL_IC.replace("<svg", '<svg aria-hidden="true"') + 'Tap to explore the map</button>' +
          '<div class="card" role="dialog" aria-live="polite"></div><div class="list" aria-label="All deals"></div>' +
        '</div>' +
        '<nav class="tabs" aria-label="Quick find"></nav>' +
        '<div class="foot"><span>Numbered pins are groups of deals. Tap one to zoom in.</span><button type="button" data-a="list">' + LIST_IC + 'All deals</button></div>' +
      '</div></div></div>';

    var $ = function (s) { return root.querySelector(s); };
    var mapEl = $(".map"), glEl = $(".mapgl"), pinsEl = $(".pins"), card = $(".card"), list = $(".list"), quick = $(".quick"), side = $(".sl"), follow = $(".fol"), sq = $(".sq");
    var map = null, kind = "all", island = null, sortBy = "best", q = "", selected = null, hovered = null, full = false, pulseIds = {};

    function dark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
    function theme() { host.classList.toggle("dark", dark()); }
    theme();
    new MutationObserver(function () { theme(); if (map) hrtStyle(dark(), function (st) { map.setStyle(st); }); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    /* chips, island buttons, phone tabs */
    var chips = $(".chips");
    [["all", "All", ""]].concat(Object.keys(KINDS).map(function (k) { return [k, KINDS[k].label, KINDS[k].c]; })).forEach(function (c) {
      var n = c[0] === "all" ? D.length : cnt[c[0]] || 0; if (!n) return;
      var b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.f = c[0]; b.setAttribute("aria-pressed", c[0] === "all");
      b.style.setProperty("--c", c[2]); b.innerHTML = (c[0] === "all" ? "" : "<i></i>") + esc(c[1]) + " <em>" + n + "</em>";
      b.onclick = function () { setKind(c[0]); }; chips.appendChild(b);
    });
    [["oahu", "Oʻahu"], ["maui", "Maui"], ["hawaii", "Hawaiʻi"], ["kauai", "Kauaʻi"], ["lm", "Lānaʻi & Molokaʻi"]].forEach(function (x) {
      var b = document.createElement("button"); b.type = "button"; b.className = "q"; b.dataset.isl = x[0]; b.setAttribute("aria-pressed", "false"); b.textContent = x[1];
      b.onclick = function () { flyIsland(island === x[0] ? null : x[0]); }; quick.appendChild(b);
    });
    var tabs = $(".tabs");
    [["stay", "Hotels", "var(--c-stay)", "bed"], ["act", "Things to do", "var(--c-act)", "star"], ["soon", "Ending soon", "var(--coral)", "clock"]].forEach(function (t) {
      var b = document.createElement("button"); b.type = "button"; b.className = "tab"; b.style.setProperty("--c", t[2]); b.innerHTML = "<span>" + ic(t[3]) + "</span>" + t[1];
      b.onclick = function () { goFull(function () { if (t[0] === "soon") { setKind("all"); highlight(onMap.filter(function (d) { return d.days <= 30; })); } else setKind(t[0]); }); };
      tabs.appendChild(b);
    });
    (function () { var b = document.createElement("button"); b.type = "button"; b.className = "tab"; b.style.setProperty("--c", "var(--navy)");
      b.innerHTML = '<span>' + LIST_IC.replace("<svg", '<svg class="ln"') + '</span>All deals'; b.onclick = function () { goFull(openList); }; tabs.appendChild(b); })();

    function isPhone() { return host.classList.contains("ph") && window.innerWidth < 700; }
    function goFull(then) { if (isPhone() && !full) { setFull(true); setTimeout(then, 80); } else then(); }

    /* pins */
    onMap.forEach(function (d) {
      var b = document.createElement("button"); b.type = "button"; b.className = "pin"; b.style.setProperty("--c", KINDS[d.k].c); b.setAttribute("aria-label", d.b + ", " + d.head);
      b.innerHTML = '<span class="dot">' + ic(KINDS[d.k].icon) + '</span><span class="lab">' + esc(d.b) + '<em>' + esc(d.head) + '</em></span>';
      b.addEventListener("click", function (e) { e.stopPropagation(); goFull(function () { select(d, true); }); });
      b.hidden = true; pinsEl.appendChild(b); d.el = b;
    });
    var clPool = [];
    function clEl(i) {
      if (!clPool[i]) { var b = document.createElement("button"); b.type = "button"; b.className = "cl";
        b.addEventListener("click", function (e) { e.stopPropagation(); var g = b._g; if (g) goFull(function () { fitTo(g, 17); }); });
        pinsEl.appendChild(b); clPool[i] = b; }
      return clPool[i];
    }

    /* ---------- the map ---------- */
    function startMap() {
      if (map || typeof maplibregl === "undefined") { if (!map) $(".mapmsg").textContent = "The map could not load. The list still works."; return; }
      hrtStyle(dark(), function (st) {
        try {
          map = new maplibregl.Map({ container: glEl, style: st, bounds: ISL.all, fitBoundsOptions: { padding: 30 }, attributionControl: { compact: true },
            cooperativeGestures: true, dragRotate: false, pitchWithRotate: false, maxZoom: 17.5 });
        } catch (e) { $(".mapmsg").textContent = "The map could not load. The list still works."; return; }
        map.touchZoomRotate.disableRotation();
        map.on("load", function () { $(".mapmsg").hidden = true; render(); renderSide(); });
        map.on("move", render);
        map.on("moveend", function () { if (follow.checked) renderSideSoon(); });
        map.on("click", function () { if (isPhone() && !full) setFull(true); else select(null); });
        map.on("error", function () {});
        /* pins and list work from the map's position alone, so show them before the street tiles arrive */
        render(); renderSide();
        setTimeout(function () { if (map && !map.loaded()) $(".mapmsg").textContent = "The street map is slow to load. The pins and list still work."; }, 9000);
      });
    }
    function fitTo(arr, maxZoom) {
      if (!map || !arr.length) return;
      var b = new maplibregl.LngLatBounds([arr[0].ll[1], arr[0].ll[0]], [arr[0].ll[1], arr[0].ll[0]]);
      arr.forEach(function (d) { b.extend([d.ll[1], d.ll[0]]); });
      map.fitBounds(b, { padding: { top: 80, bottom: 50, left: 50, right: 70 }, maxZoom: maxZoom || 15, duration: 700 });
    }
    function flyIsland(k) {
      island = k; quick.querySelectorAll(".q").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.isl === k); });
      select(null); if (map) map.fitBounds(ISL[k || "all"], { padding: 30, duration: 800 });
    }

    /* ---------- pins: groups when crowded, labels that never overlap ---------- */
    function visible(d) {
      if (kind !== "all" && d.k !== kind) return false;
      if (q && (d.b + " " + d.h + " " + (ISLN[d.isl] || "") + " " + d.m).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }
    function render() {
      if (!map) return;
      var w = mapEl.clientWidth, h = mapEl.clientHeight, zoom = map.getZoom(), R = isPhone() && !full ? 30 : 40, groups = [];
      onMap.filter(visible).sort(function (a, b) { return (b === selected) - (a === selected) || b.s - a.s; }).forEach(function (d) {
        var p = map.project([d.ll[1], d.ll[0]]); d.sx = p.x; d.sy = p.y;
        if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) return;
        var g = null;
        if (d !== selected) for (var i = 0; i < groups.length; i++) { var x = groups[i]; if (!x.lock && Math.abs(x.x - p.x) < R && Math.abs(x.y - p.y) < R) { g = x; break; } }
        if (g) g.m.push(d); else groups.push({ x: p.x, y: p.y, m: [d], lock: d === selected });
      });
      onMap.forEach(function (d) { d.el.hidden = true; }); clPool.forEach(function (c) { c.hidden = true; });
      var placed = [], ci = 0, hd = 14, mr = mapEl.getBoundingClientRect();
      [quick, $(".ctl")].forEach(function (el) { var r = el.getBoundingClientRect(); if (r.width) placed.push({ x0: r.left - mr.left - 4, y0: r.top - mr.top - 4, x1: r.right - mr.left + 4, y1: r.bottom - mr.top + 4 }); });
      groups.forEach(function (g) {
        if (g.m.length > 1) { var n = g.m.length; g.sz = n < 10 ? 34 : n < 40 ? 40 : 46; g.x = g.m.reduce(function (a, d) { return a + d.sx; }, 0) / n; g.y = g.m.reduce(function (a, d) { return a + d.sy; }, 0) / n;
          placed.push({ x0: g.x - g.sz / 2, y0: g.y - g.sz / 2, x1: g.x + g.sz / 2, y1: g.y + g.sz / 2 }); }
        else placed.push({ x0: g.x - hd, y0: g.y - hd, x1: g.x + hd, y1: g.y + hd, own: g.m[0] });
      });
      groups.forEach(function (g) {
        if (g.m.length > 1) {
          var c = clEl(ci++); c._g = g.m; c.hidden = false; c.textContent = g.m.length; c.style.width = c.style.height = g.sz + "px";
          c.setAttribute("aria-label", g.m.length + " deals here. Zoom in");
          c.classList.toggle("hov", !!hovered && g.m.indexOf(hovered) > -1);
          c.style.transform = "translate(" + (g.x - g.sz / 2) + "px," + (g.y - g.sz / 2) + "px)"; return;
        }
        var d = g.m[0], el = d.el; el.hidden = false;
        el.classList.toggle("sel", d === selected); el.classList.toggle("hov", d === hovered && d !== selected); el.classList.toggle("pulse", !!pulseIds[d.id]);
        var want = (isPhone() && !full) ? false : d === selected || d === hovered || zoom >= 13 || (d.r === "Top pick" && zoom >= 9.5), left = false;
        if (want) {
          if (!d.lw) { el.classList.remove("nolab"); d.lw = Math.max(40, el.querySelector(".lab").offsetWidth - 12); }
          var hits = function (r) { return r.x0 < 0 || r.x1 > w || placed.some(function (x) { return x.own !== d && r.x0 < x.x1 && r.x1 > x.x0 && r.y0 < x.y1 && r.y1 > x.y0; }); };
          var right = { x0: d.sx + hd - 2, y0: d.sy - 13, x1: d.sx + hd + d.lw, y1: d.sy + 13 }, lft = { x0: d.sx - hd - d.lw, y0: d.sy - 13, x1: d.sx - hd + 2, y1: d.sy + 13 };
          if (!hits(right)) placed.push(right); else if (!hits(lft)) { placed.push(lft); left = true; }
          else if (d === selected || d === hovered) { left = right.x1 > w; placed.push(left ? lft : right); } else want = false;
        }
        el.classList.toggle("nolab", !want); el.classList.toggle("left", left);
        el.style.zIndex = d === selected ? 4 : d === hovered ? 3 : want ? 2 : 1;
        el.style.transform = "translate(" + (d.sx - hd - (left ? d.lw : 0)) + "px," + (d.sy - hd) + "px)";
      });
    }

    /* ---------- selection ---------- */
    function select(d, fly) {
      selected = d; syncRows();
      if (!d) { card.classList.remove("on"); render(); return; }
      card.style.setProperty("--c", KINDS[d.k].c);
      var near = !d.ll ? [] : onMap.filter(function (x) { return x !== d && Math.abs(x.ll[0] - d.ll[0]) < .008 && Math.abs(x.ll[1] - d.ll[1]) < .008; });
      card.innerHTML = '<span class="grab" aria-hidden="true"></span><button type="button" class="x" aria-label="Close">×</button>' +
        '<span class="cat"><i></i>' + esc(KINDS[d.k].one) + (d.r === "Top pick" ? " · Top pick" : "") + '</span><h3>' + esc(d.b) + '</h3><div class="meta">' + esc(d.place) + (d.m ? " · " + esc(d.m) : "") + '</div>' +
        '<div class="big"><b>' + esc(d.head) + '</b><span class="' + (d.days <= 30 ? "soon" : "") + '">' + (d.ends ? "Ends " + d.ends + " · " + (d.days === 0 ? "last day" : d.days + (d.days === 1 ? " day" : " days") + " left") : "") + '</span></div>' +
        (d.kk.length ? '<div class="perks">' + d.kk.map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" : "") +
        (d.d ? "<p>" + esc(d.d) + "</p>" : "") + '<div class="id">Bring your Hawaiʻi ID. Rates and dates are set by the business.</div>' +
        '<div class="rowb">' + (d.u ? '<a class="a" href="' + esc(d.u) + '" target="_blank" rel="noopener">See the deal ' + ic("ext") + "</a>" : "") +
        (opts.details ? '<button type="button" class="a alt" data-det>' + ic("info") + "Full details</button>" : "") +
        (near.length ? '<button type="button" class="a alt" data-near>' + ic("near") + near.length + " more nearby</button>" : "") + "</div>";
      card.classList.add("on"); card.scrollTop = 0;
      card.querySelector(".x").onclick = function () { select(null); };
      var db = card.querySelector("[data-det]"); if (db) db.onclick = function () { if (full) setFull(false); opts.details(d.id); };
      var nb = card.querySelector("[data-near]"); if (nb) nb.onclick = function () { highlight([d].concat(near)); select(d, false); };
      if (fly && d.ll && map) {
        render();
        var wide = !isPhone() && mapEl.clientWidth >= 640;
        map.flyTo({ center: [d.ll[1], d.ll[0]], zoom: Math.max(map.getZoom(), 15), offset: wide ? [mapEl.clientWidth * .12, 0] : [0, -mapEl.clientHeight * .2], duration: 900 });
      } else render();
    }
    function setKind(k) { kind = k; chips.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.f === k); });
      if (selected && k !== "all" && selected.k !== k) select(null); render(); renderSide(); }
    var pulseT;
    function highlight(arr) {
      clearTimeout(pulseT); pulseIds = {}; arr.forEach(function (d) { pulseIds[d.id] = 1; });
      if (arr.length === 1) select(arr[0], true); else if (arr.length) { select(null); fitTo(arr, 15); }
      pulseT = setTimeout(function () { pulseIds = {}; render(); }, 4500);
    }

    /* ---------- the list (left on desktop, slide-up on phones) ---------- */
    function inView(d) { if (!map) return true; if (!d.ll) return !island; return map.getBounds().contains([d.ll[1], d.ll[0]]); }
    function sorted(arr) { return arr.slice().sort(function (a, b) { return sortBy === "soon" ? a.days - b.days || b.s - a.s : sortBy === "off" ? (b.p || 0) - (a.p || 0) || b.s - a.s : b.s - a.s; }); }
    function rowHtml(d) {
      return '<button type="button" class="row" data-id="' + d.id + '" style="--c:' + KINDS[d.k].c + '"><span class="dt">' + ic(KINDS[d.k].icon) + '</span>' +
        '<span class="nm"><b>' + esc(d.b) + '</b><small>' + esc(d.place) + '</small></span>' +
        '<span class="vl"><b>' + esc(d.head) + '</b><small class="' + (d.days <= 30 ? "soon" : "") + '">' + (d.days <= 30 ? d.days + (d.days === 1 ? " day left" : " days left") : "Ends " + esc(d.ends.replace(/, \d{4}$/, ""))) + '</small></span></button>';
    }
    var sideT = null;
    function renderSideSoon() { clearTimeout(sideT); sideT = setTimeout(renderSide, 120); }
    function renderSide() {
      var base = D.filter(visible), shown = sorted(follow.checked ? base.filter(inView) : base);
      $(".scnt").textContent = shown.length + (shown.length === 1 ? " deal" : " deals");
      $(".ssub").textContent = follow.checked && shown.length < base.length ? "on the map now" : q ? "match your search" : "on every island";
      side.innerHTML = shown.length ? shown.map(rowHtml).join("") : '<div class="empty">No deals here. Zoom out, pick an island or clear the search.</div>';
      syncRows();
    }
    function syncRows() { root.querySelectorAll(".row").forEach(function (r) { var d = byId[r.dataset.id]; if (!d) return; r.classList.toggle("sel", d === selected); r.classList.toggle("hov", d === hovered); }); }
    side.addEventListener("click", function (e) { var r = e.target.closest(".row"); if (!r) return; var d = byId[r.dataset.id];
      if (selected === d) { select(null); return; } var keep = follow.checked; follow.checked = false; select(d, true); setTimeout(function () { follow.checked = keep; }, 1200); });
    side.addEventListener("mouseover", function (e) { var r = e.target.closest(".row"), d = r ? byId[r.dataset.id] : null; if (d !== hovered) { hovered = d; syncRows(); render(); } });
    side.addEventListener("mouseleave", function () { hovered = null; syncRows(); render(); });
    follow.addEventListener("change", renderSide);
    var qT; sq.addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { q = sq.value.trim().toLowerCase(); select(null); render(); renderSide();
      if (q && map) { var m = onMap.filter(visible); if (m.length && m.length < 60) { var keep = follow.checked; follow.checked = false; fitTo(m, 14); setTimeout(function () { follow.checked = keep; renderSide(); }, 900); } } }, 180); });
    root.querySelectorAll("[data-sort]").forEach(function (b) { b.onclick = function () { sortBy = b.dataset.sort; root.querySelectorAll("[data-sort]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); renderSide(); }; });
    function renderList() {
      var arr = sorted(D.filter(visible));
      list.innerHTML = '<button type="button" class="close" data-a="closelist">Back to map</button><h4>' + arr.length + ' deals</h4>' + arr.map(rowHtml).join("");
      list.querySelectorAll(".row").forEach(function (b) { b.onclick = function () { closeList(); select(byId[b.dataset.id], true); }; });
    }
    function openList() { renderList(); list.classList.add("on"); list.querySelector(".close").focus(); }
    function closeList() { list.classList.remove("on"); }

    /* ---------- full screen (moves the map to the top of the page, works on iPhone too) ---------- */
    var placeholder = null;
    function setFull(on) {
      if (on === full) return; full = on; var b = $(".fullbtn");
      if (on) {
        placeholder = document.createElement("div"); placeholder.style.height = host.offsetHeight + "px";
        host.parentNode.insertBefore(placeholder, host); document.body.appendChild(host);
        host.classList.add("full"); document.documentElement.style.overflow = "hidden";
        b.setAttribute("aria-label", "Exit full screen"); b.innerHTML = X_IC;
        if (map && map.cooperativeGestures) map.cooperativeGestures.disable();
      } else {
        host.classList.remove("full"); placeholder.parentNode.insertBefore(host, placeholder); placeholder.remove(); placeholder = null;
        document.documentElement.style.overflow = ""; b.setAttribute("aria-label", "Full screen"); b.innerHTML = FULL_IC;
        if (map && map.cooperativeGestures) map.cooperativeGestures.enable();
      }
      requestAnimationFrame(function () { onMap.forEach(function (d) { d.lw = 0; }); if (map) { map.resize(); render(); } });
    }
    (function () { var y0 = null;
      card.addEventListener("touchstart", function (e) { if (card.scrollTop > 0) return; y0 = e.touches[0].clientY; }, { passive: true });
      card.addEventListener("touchmove", function (e) { if (y0 == null) return; var dy = e.touches[0].clientY - y0; if (dy > 0) card.style.transform = "translateY(" + dy + "px)"; }, { passive: true });
      card.addEventListener("touchend", function (e) { if (y0 == null) return; var dy = e.changedTouches[0].clientY - y0; card.style.transform = ""; y0 = null; if (dy > 70) select(null); });
    })();
    mapEl.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (list.classList.contains("on")) closeList(); else if (selected) select(null); else if (full) setFull(false); } });

    var ACTIONS = {
      in: function () { if (map) map.zoomIn(); }, out: function () { if (map) map.zoomOut(); },
      fit: function () { setKind("all"); flyIsland(null); }, full: function () { setFull(!full); },
      list: function () { openList(); }, closelist: function () { closeList(); }
    };
    root.addEventListener("click", function (e) { var a = e.target.closest("[data-a]"); if (a && ACTIONS[a.dataset.a]) ACTIONS[a.dataset.a](); });

    /* ---------- size classes (go by the widget's own width; the dashboard sidebar takes room) ---------- */
    function sizeClasses() { if (full) return; var w = host.clientWidth; if (!w) return;
      host.classList.toggle("wide", w >= 900); host.classList.toggle("ph", w < 640); }
    if (window.ResizeObserver) new ResizeObserver(function () { sizeClasses(); onMap.forEach(function (d) { d.lw = 0; }); if (map) { map.resize(); render(); } }).observe(host);
    sizeClasses(); renderSide(); startMap();

    return {
      show: function (id) { var d = byId[id]; if (!d) return; setKind("all"); q = ""; sq.value = "";
        if (isPhone()) goFull(function () { select(d, true); }); else setTimeout(function () { select(d, true); }, 80); },
      resize: function () { sizeClasses(); if (map) { map.resize(); render(); } else startMap(); }
    };
  }

  window.HRT_DEALS_MAP = { mount: mount };
})();
