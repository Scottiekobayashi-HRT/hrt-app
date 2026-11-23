/* Home layout DRAFTS (Nov 18). Nothing changes for members: these only run with ?lay=1, 2 or 3
   in the address (and stay on for that browser tab). ?lay=0 turns them off.
   Inspired by Scottie's other app: one big main column plus a narrow side column of simple cards.
   1 = two columns, our current colors
   2 = two columns, the member's Wall as a warm, light card with a photo band and simple rows
   3 = draft 2 with deep teal instead of navy
   4 = draft 1 with a small photo banner behind the Wall title
   5 = draft 4, and the sidebar without the small gray lines under each link
   6 = draft 2 (big photo banner, simple rows) with the sidebar without the gray lines */
(function () {
  var n;
  try {
    var m = /[?&]lay=(\d)/.exec(location.search);
    if (m) sessionStorage.setItem("hrtLay", m[1]);
    n = m ? m[1] : (sessionStorage.getItem("hrtLay") || "6"); /* Nov 18 (Scottie): draft 6 is the sandbox default; ?lay=0 shows the old look */
  } catch (e) { return; }
  if (!n || n === "0") return;
  var root = document.documentElement;
  root.classList.add("lay", "lay-" + n);
  try { var w = /[?&]wall=(\d)/.exec(location.search); if (w) sessionStorage.setItem("hrtWallDraft", w[1]); var wn = w ? w[1] : (sessionStorage.getItem("hrtWallDraft") || "1"); /* tiles are the default */ if (wn && wn !== "0") root.classList.add("wall-" + wn); } catch (e) {}
  if (n === "4" || n === "5") root.classList.add("lay-1", "lay-sm");
  if (n === "5" || n === "6") root.classList.add("lay-nosub");
  if (n === "6") root.classList.add("lay-2"); /* Nov 18: big photo banner again (Scottie) */
  var useRows = n === "2" || n === "3" || n === "6";

  /* Banner photo picker (Nov 18): the member picks the photo behind their Wall title; saved in this browser */
  var SQ = "https://images.squarespace-cdn.com/content/67cfe44f78d8ac79bcf6ec19/";
  var PICS = [
    ["Honolulu", SQ + "6a6fffa2-d2f7-456f-bfcf-c92232c98f1a/524f980d-83f5-4e88-9401-95c8c24e57a9.png?format=1500w", "center 45%"],
    ["Sunset", "https://images.unsplash.com/photo-1719469243598-0191cfae6f83?w=1400&q=70&auto=format", "center 40%"],
    ["Tokyo", SQ + "9d0b0acf-ede1-4ce9-bce6-7ee1a798b12f/Tokyo.png?format=1500w", "center 85%"],
    ["Osaka", SQ + "eab99c1e-cdfc-4718-b852-391d5f44bb30/Osaka.jpg?format=1500w", "center"],
    ["Las Vegas", "https://images.unsplash.com/photo-1581351721010-8cf859cb14a4?q=80&w=1400&auto=format&fit=crop", "center"],
    ["San Francisco", SQ + "11c361af-1226-4181-898d-c49a240893c3/San+Francisco.jpg?format=1500w", "center"],
    ["Four destinations", "montage", ""]
  ];
  var PIC_DEFAULT = PICS.length - 1; /* Nov 19: Waikiki removed; Four destinations is the default */
  function picIndex() { try { var v = localStorage.getItem("hrtWallPic2"), i = v === null ? PIC_DEFAULT : +v; return i >= 0 && i < PICS.length ? i : PIC_DEFAULT; } catch (e) { return PIC_DEFAULT; } }
  function setPic(band, i) {
    var p = PICS[i] || PICS[PIC_DEFAULT];
    var mt = band.querySelector(".hdr-photos");
    if (p[1] === "montage") {
      if (!mt) { mt = mk("div", "hdr-photos", "<span></span><span></span><span></span><span></span>"); mt.setAttribute("aria-hidden", "true"); band.insertBefore(mt, band.firstChild); }
      band.classList.add("lay-montage");
    } else { band.classList.remove("lay-montage"); }
    band.style.setProperty("--band-img", 'url("' + p[1] + '")');
    band.style.setProperty("--band-pos", p[2]);
    band.querySelectorAll(".lay-pick-menu button").forEach(function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-pic") === i); });
  }
  function $(s, el) { return (el || document).querySelector(s); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function txt(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function lines(el) { return el ? String(el.innerText || el.textContent || "").split(/\n+/).map(txt).filter(Boolean).join(" \u00b7 ") : ""; }
  function lvlName() { var c = root.classList; return (c.contains("ms-pro") ? "Pro" : c.contains("ms-client") ? "Ohana" : "Aloha") + " Level member"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function build() {
    var content = $("#v-home .content"), top = content && $(".toprow", content);
    if (!top || $(".lay-grid", content)) return !!top;
    var grid = mk("div", "lay-grid"), main = mk("div", "lay-main"), side = mk("aside", "lay-side");
    grid.appendChild(main); grid.appendChild(side);
    content.insertBefore(grid, top);
    /* ?side=1 draft (Nov 19): only the Wall sits beside the side column; Scottie's Wall and the tools run full width below */
    var wide = false; try { var sd = /[?&]side=(\d)/.exec(location.search); if (sd) sessionStorage.setItem("hrtSide", sd[1]); wide = (sd ? sd[1] : sessionStorage.getItem("hrtSide")) === "1"; } catch (e) {}
    var below = mk("div", "lay-below");
    if (wide) {
      root.classList.add("lay-wide"); grid.appendChild(below);
      /* Scottie's Wall is inserted right after the member Wall; move anything that lands in the main column below */
      new MutationObserver(function () {
        Array.prototype.slice.call(main.children).forEach(function (c) { if (!c.classList.contains("toprow")) below.insertBefore(c, below.firstChild); });
      }).observe(main, { childList: true });
    }
    function home(c) { (wide && !c.classList.contains("toprow") ? below : main).appendChild(c); }
    /* everything above the disclosure goes into the main column */
    Array.prototype.slice.call(content.children).forEach(function (c) {
      if (c === grid || c.classList.contains("srcnote") || c.classList.contains("foot")) return;
      home(c);
    });
    /* later inserts (Scottie's Wall) land in .content or after .toprow: keep them in main */
    new MutationObserver(function () {
      Array.prototype.slice.call(content.children).forEach(function (c) {
        if (c === grid || c.classList.contains("srcnote") || c.classList.contains("foot")) return;
        home(c);
      });
    }).observe(content, { childList: true });

    /* Side column cards */
    var stat = mk("div", "lay-card lay-stat",
      '<span class="lay-live"><i></i>LIVE</span><b class="lay-big" id="layBig">&ndash;</b>' +
      '<span class="lay-statl">transfer bonuses live right now</span><span class="lay-stats2" id="layStat2"></span>');
    var vid = mk("div", "lay-card lay-vidcard");
    var ask = mk("div", "lay-card lay-cream",
      '<h3>Questions about your next card?</h3><p>Text Scottie anytime. Real answers from a real person, here in Hawaii.</p>' +
      '<a class="lay-btn" href="sms:+18083545216">Text Scottie</a>');
    /* Quick links (Nov 19): icon tiles like the prayer app, and the member picks which four show (saved in this browser) */
    var I = function (d) { return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>"; };
    var QL = {
      cal: ["#atmos", "atmos", "Points Calendar", I('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>')],
      wallet: ["#wallet", "wallet", "My Wallet", I('<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="16" cy="13.5" r="1.3"/>')],
      stay: ["#kamaaina", "kamaaina", "Staycation Deals", I('<path d="M3 18V8M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>')],
      lounge: ["#lounges", "lounges", "HNL Lounges", I('<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M6 18v2M18 18v2"/>')],
      coach: ["#coaching", "coaching", "Card Coaching", I('<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9-4.3-4.1 5.9-.8z"/>')],
      resy: ["#resy", "resy", "Resy Map", I('<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-1.7 1.5-2 4-2 6s1 3 2 3v9"/>')],
      bonus: ["#transfers", "transfers", "Transfer Bonuses", I('<path d="M4 8h13l-3-3M20 16H7l3 3"/>')],
      earn: ["#status", "status", "Choose to Earn", I('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M8 15h2M12 15h2"/>')],
      ask: ["sms:+18083545216", "", "Text Scottie", I('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z"/>')]
    };
    var QDEF = ["cal", "wallet", "stay", "lounge"];
    function qPicked() { try { var v = JSON.parse(localStorage.getItem("hrtQuick") || "null"); if (Array.isArray(v) && v.length) return v.filter(function (k) { return QL[k]; }).slice(0, 4); } catch (e) {} return QDEF.slice(); }
    var tools = mk("div", "lay-card lay-tools");
    function drawQuick(editing) {
      var picked = qPicked();
      tools.innerHTML = '<div class="lay-qh"><h3 class="lay-eyebrow">Quick links</h3><button type="button" class="lay-qedit">' + (editing ? "Done" : "Edit") + "</button></div>" +
        (editing
          ? '<p class="lay-qtip">Pick up to 4</p><div class="lay-qpick">' + Object.keys(QL).map(function (k) { return '<button type="button" data-q="' + k + '" aria-pressed="' + (picked.indexOf(k) > -1) + '">' + QL[k][3] + "<span>" + QL[k][2] + "</span></button>"; }).join("") + "</div>"
          : '<div class="lay-qgrid lay-qicons">' + picked.map(function (k) { var q = QL[k]; return '<a href="' + q[0] + '"' + (q[1] ? ' data-route="' + q[1] + '"' : "") + "><span class=\"lay-qi\">" + q[3] + "</span><span>" + q[2] + "</span></a>"; }).join("") + "</div>");
    }
    tools.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.classList.contains("lay-qedit")) { drawQuick(b.textContent === "Edit"); return; }
      var k = b.getAttribute("data-q"); if (!k) return;
      var picked = qPicked(), i = picked.indexOf(k);
      if (i > -1) { if (picked.length > 1) picked.splice(i, 1); } else { if (picked.length >= 4) picked.shift(); picked.push(k); }
      try { localStorage.setItem("hrtQuick", JSON.stringify(picked)); } catch (er) {}
      drawQuick(true);
    });
    drawQuick(false);
    /* Nov 19 (Scottie + Eddie): transfer bonus stat card removed; the video leads the side column */
    side.appendChild(vid); side.appendChild(ask); side.appendChild(tools);

    function fillStats() {
      if (!document.getElementById("layBig")) return; /* stat card removed Nov 19 */
      var a = $("#hmTb"), b = $("#hmKama"), c = $("#hmTbBest");
      if (a) $("#layBig").textContent = txt(a.textContent) || "–";
      $("#layStat2").textContent = [b && txt(b.textContent) !== "–" ? txt(b.textContent) + " staycation deals" : "", c && txt(c.textContent) !== "–" ? "best bonus " + txt(c.textContent) : ""].filter(Boolean).join(" · ");
    }
    var hs = $(".hstats"); if (hs) new MutationObserver(fillStats).observe(hs, { subtree: true, characterData: true, childList: true });
    fillStats();

    /* Wall: draft 1 keeps the boxes; drafts 2 and 3 rebuild them as simple rows */
    var host = $("#wl-hero");
    function wall() {
      var v = host && host.querySelector(".hw-vid");
      if (v) { vid.innerHTML = ""; var c = v.cloneNode(true); c.className = "lay-vid"; vid.appendChild(c); }
      if (!useRows || !host) return;
      var hero = host.closest(".hero"), rows = hero.querySelector(".lay-rows");
      if (!rows) {
        rows = mk("div", "lay-rows");
        var band = mk("div", "lay-band", '<button type="button" class="lay-pick" aria-haspopup="true" aria-expanded="false" aria-label="Change photo" title="Change photo"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>' +
          '<div class="lay-pick-menu" hidden>' + PICS.map(function (p, i) { return '<button type="button" data-pic="' + i + '">' + p[0] + "</button>"; }).join("") + "</div>" +
          '<span class="lay-date"></span><b class="lay-wt"></b><span class="lay-lvl"></span>');
        setPic(band, picIndex());
        band.addEventListener("click", function (e) {
          var menu = band.querySelector(".lay-pick-menu"), t = e.target.closest("button");
          if (!t) return;
          if (t.classList.contains("lay-pick")) { menu.hidden = !menu.hidden; t.setAttribute("aria-expanded", !menu.hidden); return; }
          var i = +t.getAttribute("data-pic");
          try { localStorage.setItem("hrtWallPic2", i); } catch (er) {}
          setPic(band, i); menu.hidden = true; band.querySelector(".lay-pick").setAttribute("aria-expanded", "false");
        });
        hero.insertBefore(band, hero.firstChild);
        hero.appendChild(rows);
      }
      var d = new Date();
      hero.querySelector(".lay-date").textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
      var t = hero.querySelector(".hw-wall-t");
      hero.querySelector(".lay-wt").textContent = t ? txt((t.querySelector(".hh-title") || t.querySelector(".named") || t).textContent).replace(/(Aloha|Ohana|Pro) Level member.*$/, "") : "Your Wall";
      /* Nov 19 (Scottie): level shown as a bubble on the banner; "Your next steps" title removed */
      /* Nov 19 (Scottie): the bubble gets fancier with each level. ?as=ohana or ?as=pro previews the bubble only */
      var lvT = hero.querySelector(".hh-title .hw-lvl") ? txt(hero.querySelector(".hh-title .hw-lvl").textContent) : lvlName();
      var asM = /[?&]as=(aloha|ohana|pro)\b/i.exec(location.search);
      if (asM) lvT = asM[1].charAt(0).toUpperCase() + asM[1].slice(1).toLowerCase() + " Level member";
      var lvK = /^Pro/.test(lvT) ? "pro" : /^Ohana/.test(lvT) ? "ohana" : "aloha", lvEl = hero.querySelector(".lay-lvl");
      var STAR = '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7.5-6.5-4-6.5 4 2-7.5L2 9.5 9 9z" fill="currentColor"/></svg>';
      var CROWN = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/></svg>';
      lvEl.className = "lay-lvl lvl-" + lvK;
      lvEl.innerHTML = (lvK === "pro" ? CROWN : lvK === "ohana" ? STAR : "") + "<span>" + esc(lvT) + "</span>";
      var boxes = Array.prototype.slice.call(host.querySelectorAll(".hw-boxes > .hw-box:not(.hw-vid)"));
      if (boxes.length === 4) boxes = [boxes[0], boxes[1], boxes[3], boxes[2]]; /* Nov 18 (Scottie): Rewards Cards before Save on annual fees */
      rows.innerHTML = '<div class="lay-rh"><b>Your next steps</b><span>' + esc(hero.querySelector(".hh-title .hw-lvl") ? txt(hero.querySelector(".hh-title .hw-lvl").textContent) : lvlName()) + "</span></div>" +
        boxes.map(function (b, i) {
          var l = b.querySelector(".hw-l, .hw-nx-t, .hw-act-t"), v = b.querySelector(".hw-v, .hw-nx-rows"), s = b.querySelector(".hw-s");
          var a = s && s.querySelector("a.hw-nx-go"), sub = s ? txt(s.textContent.replace(a ? a.textContent : "", "")) : "";
          var btn = a ? '<a class="lay-pill" href="' + esc(a.getAttribute("href")) + '"' + (a.getAttribute("data-route") ? ' data-route="' + esc(a.getAttribute("data-route")) + '"' : "") +
            (a.getAttribute("data-scrollto") ? ' data-scrollto="' + esc(a.getAttribute("data-scrollto")) + '"' : "") + (a.target ? ' target="_blank" rel="noopener"' : "") + ">" + esc(txt(a.textContent).replace(/\s*›$/, "")) + "</a>" : "";
          /* Nov 18 (Scottie): Aloha Level gets an upgrade button on the annual fees line */
          if (!btn && b.classList.contains("hw-fee") && !root.classList.contains("ms-client") && !root.classList.contains("ms-pro") && !hero.querySelector(".hh-title"))
            btn = '<a class="lay-pill" href="#plans" data-route="plans">Upgrade to Ohana Level</a>';
          return '<div class="lay-row lay-r' + (i + 1) + '"><span class="lay-ic">' + (i + 1) + '</span><span class="lay-rt"><small>' + esc(txt(l && l.textContent)) + "</small><b>" +
            (/^\d+$/.test(txt(v && v.textContent)) && /REWARDS CARDS/i.test(txt(l && l.textContent)) ? esc("Your Wallet has " + txt(v.textContent) + (txt(v.textContent) === "1" ? " card" : " cards")) : v ? String(v.innerText || v.textContent || "").split(/\n+/).map(txt).filter(Boolean).map(esc).join("<br>") : "") + "</b>" + (sub ? "<em>" + esc(sub) + "</em>" : "") + "</span>" + btn + "</div>";
        }).join("");
    }
    if (host) { new MutationObserver(wall).observe(host, { childList: true, subtree: true }); wall(); }
    return true;
  }
  function go() { if (!build()) setTimeout(go, 200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
/* "Pop" drafts (Nov 18), ideas from Scottie's prayer app. Only with ?pop=1, 2 or 3; ?pop=0 turns off.
   1 = orange beta strip on top + white header bar with "Aloha, Eddie · date" and chips
   2 = white header bar with greeting and chips + thin orange line under it (no strip)
   3 = draft 1 plus overall polish: softer cards, orange eyebrow titles, calmer sidebar */
(function () {
  var p;
  try { var m = /[?&]pop=(\d)/.exec(location.search); if (m) sessionStorage.setItem("hrtPop", m[1]); p = m ? m[1] : (sessionStorage.getItem("hrtPop") || "2"); } /* Nov 18 (Scottie): pop 2 is the sandbox default */ catch (e) { return; }
  if (!p || p === "0") return;
  var root = document.documentElement;
  root.classList.add("pop", "pop-" + p);
  if (p === "3") root.classList.add("pop-1");
  if (p === "2") root.classList.add("pop-3");
  try { var ed = /[?&]edge=(\d)/.exec(location.search); if (ed) sessionStorage.setItem("hrtEdge", ed[1]); var ev = ed ? ed[1] : sessionStorage.getItem("hrtEdge"); if (ev && ev !== "0") root.classList.add("edge-" + ev); } catch (e) {} /* Nov 19: Wall border samples */
  try { var ew = /[?&]ew=(\d)/.exec(location.search); if (ew) sessionStorage.setItem("hrtEw", ew[1]); var ewv = ew ? ew[1] : (sessionStorage.getItem("hrtEw") || "3"); /* Nov 19 (Scottie): navy Wall background is the default */ if (ewv && ewv !== "0") root.classList.add("ew-" + ewv); } catch (e) {} /* Nov 19: Wall background samples */
  try { var tn = /[?&]tone=(\d)/.exec(location.search); if (tn) sessionStorage.setItem("hrtTone", tn[1]); var tv = tn ? tn[1] : sessionStorage.getItem("hrtTone"); if (tv && tv !== "0") root.classList.add("tone", "tone-" + tv); } catch (e) {} /* Nov 19: less-orange samples */
  try { var sw = /[?&]swh=(\d)/.exec(location.search); if (sw) sessionStorage.setItem("hrtSwh", sw[1]); var swn = sw ? sw[1] : (sessionStorage.getItem("hrtSwh") || "1"); /* Nov 19 (Scottie): Tokyo banner is the default */ if (swn && swn !== "0") root.classList.add("swh", "swh-" + swn); } catch (e) {} /* Nov 19: Scottie's Wall banner samples */
  try { var bm = /[?&]bar=(\d)/.exec(location.search); if (bm) sessionStorage.setItem("hrtBar", bm[1]); if ((bm ? bm[1] : sessionStorage.getItem("hrtBar")) === "1") root.classList.add("pop-bar"); } catch (e) {} /* Nov 19: thin dark orange top border preview */ /* Nov 18: draft 3's polish, without the gold strip (kept for future announcements: ?pop=3) */
  function go() {
    var tb = document.querySelector(".topbar"), tbin = tb && tb.querySelector(".tbin");
    if (!tbin) return setTimeout(go, 200);
    if (tbin.querySelector(".pop-greet")) return;
    if (!document.querySelector(".pop-strip")) {
      var st = document.createElement("div"); st.className = "pop-strip" + (p === "2" ? " pop-strip-or" : "");
      /* Nov 19 (Scottie): an orange welcome strip on the default; the gold beta one stays on ?pop=3 */
      st.innerHTML = p === "2" ? 'Aloha and welcome to your new Hawaii Reward Travel dashboard! Questions or ideas? <a href="sms:+18083545216">Text Scottie</a> anytime.'
        : '<b>HRT BETA</b> Aloha! This is a beta version. Please <a href="sms:+18083545216">text Scottie your feedback</a>. Mahalo for building this with us.';
      tb.parentNode.insertBefore(st, tb);
    }
    var g = document.createElement("span"); g.className = "pop-greet";
    var d = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    g.innerHTML = '<b>Aloha, <span class="ms-first-name">' + ((window.HRT_MEMBER && window.HRT_MEMBER.firstName) || "friend").split(" ")[0] + '</span></b><i>\u00b7</i><span>' + d + "</span>"; /* Nov 19: greeting back (Scottie) */
    tbin.insertBefore(g, tbin.firstChild);
    var chips = document.createElement("span"); chips.className = "pop-chips";
    chips.innerHTML = '<span class="pop-chip" id="popLvl">Aloha Level</span>'; /* Nov 19: transfer bonus chip removed */
    var sp = tbin.querySelector(".spacer"); if (sp) sp.parentNode.insertBefore(chips, sp.nextSibling); else tbin.appendChild(chips);
    function fill() {
      var c = root.classList; document.getElementById("popLvl").textContent = c.contains("ms-pro") ? "Pro Level" : c.contains("ms-client") ? "Ohana Level" : "Aloha Level";
    }
    fill(); setInterval(fill, 3000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* Tool tile + video samples (Nov 19, Eddie's idea). ?tt=1 video on top, 2 video bar on the bottom,
   3 small video beside the text. No videos yet: the play area opens the tool for now. */
(function () {
  var t;
  try { var m = /[?&]tt=(\d)/.exec(location.search); if (m) sessionStorage.setItem("hrtTt", m[1]); t = m ? m[1] : sessionStorage.getItem("hrtTt"); } catch (e) { return; }
  if (!t || t === "0") return;
  document.documentElement.classList.add("tt", "tt-" + t);
  var PLAY = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  function go() {
    var tiles = document.querySelectorAll(".ttiles .ttile");
    if (!tiles.length) return setTimeout(go, 200);
    tiles.forEach(function (tile) {
      if (tile.querySelector(".tt-vid")) return;
      var name = (tile.querySelector(".tt b") || {}).textContent || "this tool";
      var v = document.createElement("span"); v.className = "tt-vid";
      v.innerHTML = '<span class="tt-play">' + PLAY + "</span>" + (t === "2" ? "<span>Watch video</span><em>1 min</em>" : t === "1" ? "<em>1 min</em>" : "");
      if (t === "2") tile.appendChild(v); else tile.insertBefore(v, tile.firstChild);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* Wall swap draft (Nov 22, Scottie): ?swap=1 puts Scottie's Wall (deals: what members could get) above
   the member's own Wall (what they already have). ?swap=0 turns it off. Stays on for the browser tab. */
(function () {
  var s;
  try { var m = /[?&]swap=(\d)/.exec(location.search); if (m) sessionStorage.setItem("hrtSwap", m[1]); s = m ? m[1] : sessionStorage.getItem("hrtSwap"); } catch (e) { return; }
  if (s !== "1") return;
  document.documentElement.classList.add("wall-swap");
  function fix() {
    var top = document.querySelector("#v-home .toprow");
    if (!top || !top.parentNode) return;
    /* free wall (.dw) and PRO wall (.dwp), kept in their own order */
    Array.prototype.slice.call(top.parentNode.querySelectorAll(":scope > .dwp, :scope > .dw")).forEach(function (w) {
      if (top.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) top.parentNode.insertBefore(w, top);
    });
  }
  function go() {
    var c = document.querySelector("#v-home .content");
    if (!c) return setTimeout(go, 200);
    new MutationObserver(fix).observe(c, { childList: true, subtree: true });
    fix();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* Quick links "pop" drafts (Nov 22, Scottie): ?ql=1..5, ?ql=0 off. Stays on for the browser tab. */
(function () {
  try { var m = /[?&]ql=(\d)/.exec(location.search); if (m) sessionStorage.setItem("hrtQl", m[1]); var q = m ? m[1] : sessionStorage.getItem("hrtQl"); if (q && q !== "0") document.documentElement.classList.add("ql-" + q); } catch (e) {}
})();

/* Full-width welcome strip (Nov 22, Scottie): with ?swap=1 on a computer, the orange welcome strip
   runs across the whole top of the screen, above the sidebar too, like the prayer app */
(function () {
  try { if (sessionStorage.getItem("hrtSwap") !== "1" && !/[?&]swap=1/.test(location.search)) return; } catch (e) { return; }
  if (!window.matchMedia || !window.matchMedia("(min-width:901px)").matches) return;
  function go() {
    var app = document.querySelector(".hrt-app"), st = document.querySelector(".pop-strip");
    if (!app || !st) return setTimeout(go, 200);
    if (st.parentNode !== app) { app.insertBefore(st, app.firstChild); document.documentElement.classList.add("strip-full"); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* One banner frame for every page (Nov 23, Scottie, swap draft): every page header uses the
   same frame as the Walls and My Wallet. Adds a small gold section name above each page title. */
(function () {
  try { if (sessionStorage.getItem("hrtSwap") !== "1" && !/[?&]swap=1/.test(location.search)) return; } catch (e) { return; }
  var EYE = { coaching: "Cards & Points", transfers: "Cards & Points", welcome: "Cards & Points",
    atmos: "Atmos Rewards", status: "Atmos Rewards", communities: "Atmos Rewards", picks: "Atmos Rewards",
    kamaaina: "Hawaii Tools", lounges: "Hawaii Tools", resy: "Hawaii Tools", plans: "Membership" };
  function go() {
    var heroes = document.querySelectorAll(".view .hero.slim");
    if (!heroes.length) return setTimeout(go, 200);
    heroes.forEach(function (h) {
      if (h.querySelector(".pb-eye")) return;
      var v = h.closest(".view"), pg = v && v.getAttribute("data-page"), t = h.querySelector(".hs-text") || h;
      if (!pg || !EYE[pg]) return;
      var e = document.createElement("span"); e.className = "pb-eye"; e.textContent = EYE[pg];
      t.insertBefore(e, t.firstChild);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();

/* Atmos Choose to Earn + Communities look drafts (Nov 23, Scottie): ?atx=1..3, ?atx=0 off. Stays on for the tab. */
(function () {
  try { var m = /[?&]atx=(\d)/.exec(location.search); if (m) sessionStorage.setItem("hrtAtx", m[1]); var q = m ? m[1] : sessionStorage.getItem("hrtAtx"); if (q && q !== "0") document.documentElement.classList.add("atx-" + q); } catch (e) {}
})();
