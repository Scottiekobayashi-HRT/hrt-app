/* ---------------------------------------------------------------------------
   today.js - "Today for you" in the Dashboard's Aloha banner (Oct 25, 2026)

   Up to three short lines, only the ones that are real for this member:
     1. a wallet credit that ends within 14 days      (wallet.js todayData)
     2. a transfer bonus, for points they hold if any (Transfer Bonuses feed)
     3. the newest HRT article or travel deal         (/api/site-news)
   Then "$X used this year" against their annual fees, once they have ticked
   a credit Used.

   Scottie: keep it to a few big words. Older members read this.
   When there is nothing to show (signed out, empty wallet and no news), the
   banner keeps its usual welcome text and stats.
--------------------------------------------------------------------------- */
(function (root) {
  "use strict";

  var SITE_NEWS = "/api/site-news";
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var BANK = { "amex": "Amex", "bilt": "Bilt", "capital-one": "Capital One", "chase": "Chase", "citi": "Citi", "rove": "Rove" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/\s*[–—]\s*/g, ", ")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function money(n) { n = +n || 0; var r = Math.round(n * 100) / 100; return "$" + (r % 1 ? r.toFixed(2) : String(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  /* Hawaii has no daylight saving: always UTC-10. */
  function hiNow(ms) { return new Date((ms == null ? Date.now() : ms) - 10 * 3600e3); }
  function hiIso(ms) { return hiNow(ms).toISOString().slice(0, 10); }
  function dateLine(ms) { var d = hiNow(ms); return DAYS[d.getUTCDay()] + ", " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate(); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
  function cut(s, n) { s = String(s || "").trim(); return s.length > n ? s.slice(0, n - 1).replace(/[\s,.:;]+\S*$/, "") + "…" : s; }

  /* "Air France-KLM Flying Blue" -> "Flying Blue", "Aeromexico Rewards" -> "Aeromexico" */
  var PROGRAM = /\s+(Flying Club|Privilege Club|Maharaja Club|Mileage Bank|Mileage Club|Avios|TrueBlue|Rewards|Loyalty Program|Loyalty|Program|Miles|Club|Plus)$/i;
  function shortPartner(p) {
    p = String(p || "").trim();
    if (/^Air France-KLM\s+/i.test(p)) return "Flying Blue";
    var q = p.replace(PROGRAM, "").trim();
    return cut(q || p, 22);
  }

  /* 1. the wallet credit line */
  function creditLine(td) {
    var u = td && td.urgent;
    if (!u || !(u.amount > 0)) return null;
    var when = u.days <= 0 ? "today" : u.days === 1 ? "tomorrow" : "in " + u.days + " days";
    return { key: "credit", tone: u.days <= 7 ? "hot" : "warn", text: money(u.amount) + " credit ends " + when,
      act: "See it", route: "wallet/credits", title: u.card + ": " + u.label };
  }

  /* 2. a transfer bonus. Points they hold first; then the newest one that started. */
  function bonusLine(bonuses, myBanks, today) {
    var live = (bonuses || []).filter(function (b) { return b && b.bank && b.partner && +b.bonusPct > 0 && (!b.expiresDate || b.expiresDate >= today); });
    if (!live.length) return null;
    var mine = myBanks && myBanks.length ? live.filter(function (b) { return myBanks.indexOf(b.bank) > -1; }) : [];
    var pool = mine.length ? mine : live;
    pool = pool.slice().sort(function (a, b) {
      return String(b.startDate || "").localeCompare(String(a.startDate || "")) || (+b.bonusPct || 0) - (+a.bonusPct || 0);
    });
    var b = pool[0], fresh = b.startDate && daysBetween(b.startDate, today) <= 7;
    return { key: "bonus", tone: "gold", text: (fresh ? "New bonus: " : "Bonus: ") + (BANK[b.bank] || b.bankName || b.bank) + " to " + shortPartner(b.partner) + " +" + b.bonusPct + "%",
      act: "See bonus", route: "transfers", title: (b.bankName || "") + " to " + b.partner + ", ends " + (b.expiresDate || "") };
  }

  /* 3. the newest article or deal from hawaiirewardtravel.com */
  function siteLine(news, nowMs) {
    if (!news) return null;
    var pick = [news.article && { kind: "article", it: news.article }, news.deal && { kind: "deal", it: news.deal }]
      .filter(function (x) { return x && x.it && x.it.title && /^https:\/\/www\.hawaiirewardtravel\.com\//.test(x.it.url || ""); })
      .sort(function (a, b) { return (+b.it.date || 0) - (+a.it.date || 0); })[0];
    if (!pick) return null;
    var age = pick.it.date ? ((nowMs == null ? Date.now() : nowMs) - pick.it.date) / 864e5 : 99;
    var label = pick.kind === "deal" ? (age <= 14 ? "New deal: " : "Latest deal: ") : (age <= 14 ? "New article: " : "Latest article: ");
    return { key: "site", tone: "blue", text: label + cut(pick.it.title, 46), act: "Read", href: pick.it.url, title: pick.it.title };
  }

  /* Pure: everything the banner shows. */
  function build(opt) {
    opt = opt || {};
    var today = opt.today || hiIso(opt.now);
    var lines = [creditLine(opt.wallet), bonusLine(opt.bonuses, opt.myBanks, today), siteLine(opt.news, opt.now)].filter(Boolean);
    var td = opt.wallet, cap = null;
    if (td && td.count && td.captured > 0) {
      cap = { amount: td.captured, pct: td.fees > 0 ? Math.min(100, Math.round(td.captured / td.fees * 100)) : null };
    }
    return { date: dateLine(opt.now), lines: lines, captured: cap };
  }

  function html(v) {
    if (!v.lines.length && !v.captured) return "";
    var out = '<div class="td-in">';
    if (v.lines.length) {
      out += '<p class="td-k">Today for you</p><ul class="td-list">' + v.lines.map(function (l) {
        var attrs = l.href ? 'href="' + esc(l.href) + '" target="_top" rel="noopener"' : 'href="#' + esc(l.route) + '" data-route="' + esc(l.route) + '"';
        return '<li><a class="td-row t-' + l.tone + '" ' + attrs + ' title="' + esc(l.title || "") + '"><span class="td-dot" aria-hidden="true"></span>' +
          '<b class="td-t">' + esc(l.text) + '</b><span class="td-a">' + esc(l.act) + "</span></a></li>";
      }).join("") + "</ul>";
    }
    if (v.captured) {
      var c = v.captured;
      out += '<div class="td-cap"><div class="td-cap-top"><span><b>' + esc(money(c.amount)) + "</b> used this year</span>" +
        (c.pct != null ? '<span class="td-cap-pct">' + c.pct + "% of your fees</span>" : "") + "</div>" +
        (c.pct != null ? '<div class="td-bar" aria-hidden="true"><i style="width:' + Math.max(3, c.pct) + '%"></i></div>' : "") + "</div>";
    }
    return out + "</div>";
  }

  /* ---------- browser wiring ---------- */
  var news = null, newsAsked = false;
  function myBanks() {
    try {
      var W = root.HRT_WALLET, C = root.HRT_CONNECT, d = W && W.connectData && W.connectData();
      var cat = root.HRT_WALLET_CATALOG || {};
      if (!d || !C || !C.banks) return [];
      return Object.keys(C.banks(d, cat.earning || []).banks || {});
    } catch (e) { return []; }
  }
  function paint() {
    var host = document.getElementById("hmToday"), hero = host && host.closest(".hero");
    if (!host) return;
    var W = root.HRT_WALLET, td = null;
    try { td = W && W.todayData ? W.todayData() : null; } catch (e) { td = null; }
    var signedIn = !!(root.HRT_MEMBER && root.HRT_MEMBER.signedIn);
    var v = build({ wallet: td, bonuses: root.HRT_TB_LIVE || [], myBanks: myBanks(), news: news });
    var inner = signedIn ? html(v) : "";
    host.innerHTML = inner;
    var dl = document.getElementById("hmDate"); if (dl) dl.textContent = v.date;
    if (hero) hero.classList.toggle("has-today", !!inner);
  }
  function loadNews() {
    if (newsAsked) return; newsAsked = true;
    try {
      fetch(SITE_NEWS, { cache: "default" }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { news = d && (d.article || d.deal) ? d : null; paint(); }).catch(function () {});
    } catch (e) {}
  }
  var t;
  function soon() { clearTimeout(t); t = setTimeout(paint, 30); }

  var api = { build: build, html: html, shortPartner: shortPartner, creditLine: creditLine, bonusLine: bonusLine, siteLine: siteLine, paint: paint };
  root.HRT_TODAY = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document === "undefined" || !root.addEventListener) return;
  root.addEventListener("hrt:wallet", soon);
  root.addEventListener("hrt:bonuses", soon);
  root.addEventListener("hrt:member", soon);
  function start() { loadNews(); paint(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  /* membership is read a moment after load */
  setTimeout(paint, 1500); setTimeout(paint, 4000);
})(typeof window !== "undefined" ? window : globalThis);
