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
    n = m ? m[1] : sessionStorage.getItem("hrtLay");
  } catch (e) { return; }
  if (!n || n === "0") return;
  var root = document.documentElement;
  root.classList.add("lay", "lay-" + n);
  if (n === "4" || n === "5") root.classList.add("lay-1", "lay-sm");
  if (n === "5" || n === "6") root.classList.add("lay-nosub");
  if (n === "6") root.classList.add("lay-2"); /* Nov 18: big photo banner again (Scottie) */
  var useRows = n === "2" || n === "3" || n === "6";

  /* Banner photo picker (Nov 18): the member picks the photo behind their Wall title; saved in this browser */
  var SQ = "https://images.squarespace-cdn.com/content/67cfe44f78d8ac79bcf6ec19/";
  var PICS = [
    ["Waikiki", "https://images.unsplash.com/photo-1507876466758-bc54f384809c?w=1400&q=70&auto=format", "center 60%"],
    ["Honolulu", SQ + "6a6fffa2-d2f7-456f-bfcf-c92232c98f1a/524f980d-83f5-4e88-9401-95c8c24e57a9.png?format=1500w", "center 45%"],
    ["Sunset", "https://images.unsplash.com/photo-1719469243598-0191cfae6f83?w=1400&q=70&auto=format", "center 40%"],
    ["Tokyo", SQ + "9d0b0acf-ede1-4ce9-bce6-7ee1a798b12f/Tokyo.png?format=1500w", "center 85%"],
    ["Osaka", SQ + "eab99c1e-cdfc-4718-b852-391d5f44bb30/Osaka.jpg?format=1500w", "center"],
    ["Las Vegas", "https://images.unsplash.com/photo-1581351721010-8cf859cb14a4?q=80&w=1400&auto=format&fit=crop", "center"],
    ["San Francisco", SQ + "11c361af-1226-4181-898d-c49a240893c3/San+Francisco.jpg?format=1500w", "center"],
    ["Four destinations", "montage", ""]
  ];
  function picIndex() { try { var i = +localStorage.getItem("hrtWallPic"); return i >= 0 && i < PICS.length ? i : 0; } catch (e) { return 0; } }
  function setPic(band, i) {
    var p = PICS[i] || PICS[0];
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
    /* everything above the disclosure goes into the main column */
    Array.prototype.slice.call(content.children).forEach(function (c) {
      if (c === grid || c.classList.contains("srcnote") || c.classList.contains("foot")) return;
      main.appendChild(c);
    });
    /* later inserts (Scottie's Wall) land in .content or after .toprow: keep them in main */
    new MutationObserver(function () {
      Array.prototype.slice.call(content.children).forEach(function (c) {
        if (c === grid || c.classList.contains("srcnote") || c.classList.contains("foot")) return;
        main.appendChild(c);
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
    var tools = mk("div", "lay-card lay-tools", '<h3 class="lay-eyebrow">Quick links</h3><div class="lay-qgrid">' +
      [["#atmos", "atmos", "Points Calendar"], ["#transfers", "transfers", "Transfer bonuses"], ["#kamaaina", "kamaaina", "Staycation Deals"], ["#lounges", "lounges", "HNL lounges"]]
        .map(function (q) { return '<a href="' + q[0] + '" data-route="' + q[1] + '">' + q[2] + "</a>"; }).join("") + "</div>");
    side.appendChild(stat); side.appendChild(vid); side.appendChild(ask); side.appendChild(tools);

    function fillStats() {
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
        var band = mk("div", "lay-band", '<button type="button" class="lay-pick" aria-haspopup="true" aria-expanded="false">Change photo</button>' +
          '<div class="lay-pick-menu" hidden>' + PICS.map(function (p, i) { return '<button type="button" data-pic="' + i + '">' + p[0] + "</button>"; }).join("") + "</div>" +
          '<span class="lay-date"></span><b class="lay-wt"></b>');
        setPic(band, picIndex());
        band.addEventListener("click", function (e) {
          var menu = band.querySelector(".lay-pick-menu"), t = e.target.closest("button");
          if (!t) return;
          if (t.classList.contains("lay-pick")) { menu.hidden = !menu.hidden; t.setAttribute("aria-expanded", !menu.hidden); return; }
          var i = +t.getAttribute("data-pic");
          try { localStorage.setItem("hrtWallPic", i); } catch (er) {}
          setPic(band, i); menu.hidden = true; band.querySelector(".lay-pick").setAttribute("aria-expanded", "false");
        });
        hero.insertBefore(band, hero.firstChild);
        hero.appendChild(rows);
      }
      var d = new Date();
      hero.querySelector(".lay-date").textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
      var t = hero.querySelector(".hw-wall-t");
      hero.querySelector(".lay-wt").textContent = t ? txt((t.querySelector(".hh-title") || t.querySelector(".named") || t).textContent).replace(/(Aloha|Ohana|Pro) Level member.*$/, "") : "Your Wall";
      var boxes = Array.prototype.slice.call(host.querySelectorAll(".hw-boxes > .hw-box:not(.hw-vid)"));
      rows.innerHTML = '<div class="lay-rh"><b>Your next steps</b><span>' + esc(hero.querySelector(".hh-title .hw-lvl") ? txt(hero.querySelector(".hh-title .hw-lvl").textContent) : lvlName()) + "</span></div>" +
        boxes.map(function (b, i) {
          var l = b.querySelector(".hw-l, .hw-nx-t, .hw-act-t"), v = b.querySelector(".hw-v, .hw-nx-rows"), s = b.querySelector(".hw-s");
          var a = s && s.querySelector("a.hw-nx-go"), sub = s ? txt(s.textContent.replace(a ? a.textContent : "", "")) : "";
          var btn = a ? '<a class="lay-pill" href="' + esc(a.getAttribute("href")) + '"' + (a.getAttribute("data-route") ? ' data-route="' + esc(a.getAttribute("data-route")) + '"' : "") +
            (a.getAttribute("data-scrollto") ? ' data-scrollto="' + esc(a.getAttribute("data-scrollto")) + '"' : "") + (a.target ? ' target="_blank" rel="noopener"' : "") + ">" + esc(txt(a.textContent).replace(/\s*›$/, "")) + "</a>" : "";
          return '<div class="lay-row"><span class="lay-ic">' + (i + 1) + '</span><span class="lay-rt"><small>' + esc(txt(l && l.textContent)) + "</small><b>" +
            (v ? String(v.innerText || v.textContent || "").split(/\n+/).map(txt).filter(Boolean).map(esc).join("<br>") : "") + "</b>" + (sub ? "<em>" + esc(sub) + "</em>" : "") + "</span>" + btn + "</div>";
        }).join("");
    }
    if (host) { new MutationObserver(wall).observe(host, { childList: true, subtree: true }); wall(); }
    return true;
  }
  function go() { if (!build()) setTimeout(go, 200); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
