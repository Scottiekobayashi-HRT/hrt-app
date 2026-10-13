/* ---------------------------------------------------------------------------
   wallet.js - HRT My Wallet, Phase 1 (free tool)

   Phase 1 answers one question: what am I paying in annual fees, and when?
   A member adds the cards they hold with the date they opened each one, and
   sees every annual fee sorted by when it next renews.

   Data:
     catalog  window.HRT_WALLET_CATALOG  (data/wallet-catalog.js, generated
              from the card catalog Google Sheet; never hand-edit)
     wallet   window.HRT_WALLET_STORE    (assets/wallet-store.js). Every save
              goes through store.update(); nothing here writes Member JSON.

   Renewal rules:
     - The card anniversary is the month and day the account was opened.
     - The first renewal is one year after opening, never the opening day.
     - Opened on Feb 29: renews Feb 28 in years without a Feb 29.
     - Month-only open dates show the month, never a made-up day.
     - Issuers usually bill the fee on the statement after the anniversary,
       so the page says "renews", not "charged on".

   Exposes window.HRT_WALLET; app.js calls .show() from onShow.wallet.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var SOON_DAYS = 45; /* renewals inside this window get a "coming up" flag */

  /* ============================ DATE MATH ============================ */
  function parseOpened(s) {
    var m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(s || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = m[3] ? +m[3] : null;
    if (mo < 1 || mo > 12) return null;
    if (d !== null && (d < 1 || d > daysInMonth(y, mo))) return null;
    return { y: y, m: mo, d: d };
  }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function dayNum(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 86400000); }
  function todayParts(now) { now = now || new Date(); return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }; }

  /* Next anniversary on or after today, and always after the opening date. */
  function nextRenewal(opened, today) {
    var o = typeof opened === "string" ? parseOpened(opened) : opened;
    if (!o) return null;
    var t = today || todayParts();
    var y = Math.max(t.y, o.y + 1);
    if (o.d === null) {
      if (y === t.y && o.m < t.m) y++;
      /* Count days to the 1st of that month, the earliest it could be */
      return { y: y, m: o.m, d: null, exact: false, days: dayNum(y, o.m, 1) - dayNum(t.y, t.m, t.d) };
    }
    function clampD(yy) { return Math.min(o.d, daysInMonth(yy, o.m)); }
    if (y === t.y && dayNum(y, o.m, clampD(y)) < dayNum(t.y, t.m, t.d)) y++;
    var d = clampD(y);
    return { y: y, m: o.m, d: d, exact: true, days: dayNum(y, o.m, d) - dayNum(t.y, t.m, t.d) };
  }
  function isFuture(opened, today) {
    var o = parseOpened(opened), t = today || todayParts();
    if (!o) return false;
    return o.d === null ? (o.y * 12 + o.m) > (t.y * 12 + t.m) : dayNum(o.y, o.m, o.d) > dayNum(t.y, t.m, t.d);
  }

  function renewalText(r) {
    if (!r) return "";
    return r.exact ? MONTHS[r.m - 1].slice(0, 3) + " " + r.d + ", " + r.y : MONTHS[r.m - 1] + " " + r.y;
  }
  function whenText(r) {
    if (!r) return "";
    if (!r.exact) {
      if (r.days <= 0) return "This month";
      var months = Math.round(r.days / 30.4);
      return months <= 1 ? "Next month" : "In about " + months + " months";
    }
    if (r.days === 0) return "Today";
    if (r.days === 1) return "Tomorrow";
    if (r.days <= 60) return "In " + r.days + " days";
    return "In about " + Math.round(r.days / 30.4) + " months";
  }
  function openedText(s) {
    var o = parseOpened(s);
    if (!o) return "";
    return o.d === null ? MONTHS[o.m - 1] + " " + o.y : MONTHS[o.m - 1].slice(0, 3) + " " + o.d + ", " + o.y;
  }
  function money(n) { return "$" + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* Everything the screen shows, worked out from wallet + catalog. Pure. */
  function summarize(wallet, catalog, today) {
    var byId = {};
    (catalog && catalog.cards || []).forEach(function (c) { byId[c.id] = c; });
    var rows = (wallet && wallet.cards || []).map(function (w) {
      var c = byId[w.cardId] || null;
      var hasFee = !!(c && c.fee > 0 && c.feeBasis === "anniversary");
      return { entry: w, card: c, hasFee: hasFee, renewal: c ? nextRenewal(w.opened, today) : null };
    });
    rows.sort(function (a, b) {
      if (a.hasFee !== b.hasFee) return a.hasFee ? -1 : 1;
      var da = a.renewal ? a.renewal.days : 1e9, db = b.renewal ? b.renewal.days : 1e9;
      return da - db || String(a.card && a.card.name).localeCompare(String(b.card && b.card.name));
    });
    var feeRows = rows.filter(function (r) { return r.hasFee; });
    return {
      rows: rows,
      count: rows.length,
      yearly: feeRows.reduce(function (s, r) { return s + r.card.fee; }, 0),
      next: feeRows.length ? feeRows[0] : null,
      soon: feeRows.filter(function (r) { return r.renewal && r.renewal.days <= SOON_DAYS; }).length
    };
  }

  /* ============================== PERKS ==============================
     A perk's "period" is the window it must be used in before it resets.

     resets "calendar"    months, quarters, halves and years of the calendar
     resets "anniversary" the member's card year, from one anniversary to the
                          day before the next (only annual perks use this)
     resets "unclear"     the issuer does not say. We show calendar periods and
                          SAY that we are assuming, never present it as fact.
     every4years, per event, per purchase: shown for information, not tracked.
     type "bonus" (anniversary miles, status points) arrives on its own: shown
     with its next date, nothing to tick.

     Ticks are stored as wallet.cards[i].used[perkId][periodKey] = true.
     Period keys: "2026-10" month, "2026-Q4" quarter, "2026-H2" half,
     "2026" calendar year, "A2026" card year that began in 2026.
  ------------------------------------------------------------------- */
  var TRACKED_CADENCE = { monthly: 1, quarterly: 1, semiannual: 1, annual: 1 };
  var TRACKED_TYPE = { credit: 1, discount: 1, activation: 1, passes: 1, certificate: 1 };
  var SHORT_MONTHS = MONTHS.map(function (m) { return m.slice(0, 3); });

  function addDays(p, n) {
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function dayText(p) { return SHORT_MONTHS[p.m - 1] + " " + p.d; }

  function isTracked(b) {
    return !!(TRACKED_CADENCE[b.cadence] && TRACKED_TYPE[b.type] &&
      (b.resets === "calendar" || b.resets === "anniversary" || b.resets === "unclear"));
  }

  /* The window this perk is in today. Returns null for untracked perks. */
  function perkPeriod(b, opened, today) {
    if (!isTracked(b)) return null;
    var t = today || todayParts(), y = t.y, m = t.m, p;
    if (b.resets === "anniversary" && b.cadence === "annual") {
      var o = parseOpened(opened);
      if (!o) return null;
      /* next anniversary strictly after today, so on the anniversary itself a new year has begun */
      var nx = nextRenewal(o, addDays(t, 1));
      if (nx.exact) {
        var end = addDays({ y: nx.y, m: nx.m, d: nx.d }, -1);
        p = { key: "A" + (nx.y - 1), end: end, approx: false, name: "This card year" };
      } else {
        /* month only: the earliest the anniversary could fall is the 1st, so the
           safe deadline is the last day of the month before */
        var e2 = addDays({ y: nx.y, m: nx.m, d: 1 }, -1);
        p = { key: "A" + (nx.y - 1), end: e2, approx: true, name: "This card year" };
      }
    } else if (b.cadence === "monthly") {
      p = { key: y + "-" + (m < 10 ? "0" : "") + m, end: { y: y, m: m, d: daysInMonth(y, m) }, name: "This month" };
    } else if (b.cadence === "quarterly") {
      var q = Math.ceil(m / 3), qm = q * 3;
      p = { key: y + "-Q" + q, end: { y: y, m: qm, d: daysInMonth(y, qm) },
        name: "This quarter (" + SHORT_MONTHS[qm - 3] + " to " + SHORT_MONTHS[qm - 1] + ")" };
    } else if (b.cadence === "semiannual") {
      var h = m <= 6 ? 1 : 2;
      p = { key: y + "-H" + h, end: { y: y, m: h * 6, d: h === 1 ? 30 : 31 }, name: h === 1 ? "Jan to Jun" : "Jul to Dec" };
    } else {
      p = { key: String(y), end: { y: y, m: 12, d: 31 }, name: "This year" };
    }
    /* Chase rotating categories: must be ACTIVATED by the 14th of the quarter's last month */
    if (b.type === "activation" && b.cadence === "quarterly") {
      p.end = { y: p.end.y, m: p.end.m, d: 14 };
      p.activateBy = true;
    }
    p.approx = !!p.approx;
    p.assumed = b.resets === "unclear" || (b.resets === "anniversary" && b.cadence !== "annual");
    p.days = dayNum(p.end.y, p.end.m, p.end.d) - dayNum(t.y, t.m, t.d);
    return p;
  }

  function isUsed(entry, b, period) {
    return !!(period && entry.used && entry.used[b.id] && entry.used[b.id][period.key]);
  }

  /* Drop ticks older than last year so the stored wallet stays small. */
  function pruneUsed(entry, today) {
    if (!entry.used) return;
    var keep = (today || todayParts()).y - 1;
    Object.keys(entry.used).forEach(function (pid) {
      var u = entry.used[pid];
      if (!u || typeof u !== "object") { delete entry.used[pid]; return; }
      Object.keys(u).forEach(function (k) { var yr = parseInt(k.replace(/^A/, ""), 10); if (!(yr >= keep)) delete u[k]; });
      if (!Object.keys(u).length) delete entry.used[pid];
    });
  }

  var PER = { monthly: "a month", quarterly: "a quarter", semiannual: "every 6 months", annual: "a year",
    every4years: "every 4 years", "per event": "each time" };
  function perkAmount(b) {
    if (b.cadence === "per purchase" || !(b.amount > 0)) return "";
    var per = PER[b.cadence] || "";
    if (b.unit === "usd") return money(b.amount) + (per ? " " + per : "");
    var n = String(Math.round(b.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    var noun = b.unit === "points" ? "points" : b.unit === "passes" ? (b.amount === 1 ? "pass" : "passes") :
      (b.amount === 1 ? "certificate" : "certificates");
    return n + " " + noun + (per ? " " + per : "");
  }
  /* Dollar credits a card gives in a year. Events, purchases and bonus categories are not counted. */
  function perkYearUsd(b) {
    if (b.unit !== "usd" || !(b.amount > 0) || !(b.perYear > 0)) return 0;
    if (!{ credit: 1, discount: 1 }[b.type]) return 0; /* 5% categories are earned, not credits */
    return b.amount * b.perYear;
  }

  /* Every perk on every card the member holds, with its state today. Pure. */
  function perkRows(wallet, catalog, today) {
    var byCard = {}, cards = {};
    (catalog && catalog.cards || []).forEach(function (c) { cards[c.id] = c; });
    (catalog && catalog.benefits || []).forEach(function (b) { (byCard[b.card] = byCard[b.card] || []).push(b); });
    var out = [];
    (wallet && wallet.cards || []).forEach(function (e) {
      if (!cards[e.cardId]) return;
      (byCard[e.cardId] || []).forEach(function (b) {
        var p = perkPeriod(b, e.opened, today);
        var next = b.type === "bonus" && b.resets === "anniversary" ? nextRenewal(e.opened, today) : null;
        out.push({ entry: e, card: cards[e.cardId], perk: b, period: p, used: isUsed(e, b, p), nextArrives: next });
      });
    });
    return out;
  }

  /* Unused perks whose window closes within `days`, soonest first. */
  function expiringSoon(rows, days) {
    return rows.filter(function (r) { return r.period && !r.used && r.period.days >= 0 && r.period.days <= days; })
      .sort(function (a, b) {
        return a.period.days - b.period.days || perkYearUsd(b.perk) - perkYearUsd(a.perk) ||
          a.card.name.localeCompare(b.card.name);
      });
  }

  /* ============================= EARNING =============================
     catalog.earning: { card, category, groups[], rate, currency, cap, via, ... }
     catalog.quarterly: Freedom Flex style rotating categories by quarter.
  ------------------------------------------------------------------- */
  function rateText(e) {
    var cur = String(e.currency || "").toLowerCase(), r = e.rate;
    if (cur.indexOf("status") > -1) return r < 1 ? "1 per $" + Math.round(1 / r) : r + " per $1";
    var n = (Math.round(r * 10) / 10).toString();
    return cur.indexOf("cash back") > -1 ? n + "%" : n + "x";
  }
  function earningFor(catalog, cardId) {
    var rank = function (e) { return e.groups.indexOf("status") > -1 ? 2 : e.groups.indexOf("everyday") > -1 ? 1 : 0; };
    return (catalog && catalog.earning || []).filter(function (e) { return e.card === cardId; })
      .slice().sort(function (a, b) { return rank(a) - rank(b) || b.rate - a.rate; });
  }
  function quarterKey(y, q) { return y + "-Q" + q; }
  function quartersFor(catalog, cardId, today) {
    var t = today || todayParts(), q = Math.ceil(t.m / 3);
    var nk = q === 4 ? quarterKey(t.y + 1, 1) : quarterKey(t.y, q + 1);
    var mine = (catalog && catalog.quarterly || []).filter(function (x) { return x.card === cardId; });
    var find = function (k) { return mine.filter(function (x) { return x.quarter === k; })[0] || null; };
    return { current: find(quarterKey(t.y, q)), next: find(nk) };
  }
  var Q_NAMES = { 1: "Jan to Mar", 2: "Apr to Jun", 3: "Jul to Sep", 4: "Oct to Dec" };
  function quarterName(k) { return Q_NAMES[+String(k).slice(-1)] + " " + String(k).slice(0, 4); }

  /* ============================== VIEW ============================== */
  var host, state = { wallet: null, error: null, editing: null, busy: false, msg: "", open: {}, showAllSoon: false };
  var SOON_PERK_DAYS = 31;

  function esc(s) {
    return String(s == null ? "" : s).replace(/\s*[\u2013\u2014]\s*/g, ", ")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function catalog() { return window.HRT_WALLET_CATALOG || { cards: [] }; }
  function store() { return window.HRT_WALLET_STORE; }
  function $(id) { return document.getElementById(id); }

  var ERRORS = {
    NO_MEMBERSTACK: "Sign in to use My Wallet.",
    READ_FAILED: "We could not load your wallet just now. Nothing was changed.",
    WRITE_FAILED: "That did not save. Your wallet is as it was. Please try again.",
    INVALID: "Something about that card did not look right, so it was not saved.",
    TOO_BIG: "Your wallet is full. Remove a card before adding another.",
    NEWER_VERSION: "Your wallet was saved by a newer version of this page. Refresh to load it.",
    CORRUPT: "We could not read your saved wallet. Nothing was changed. Please contact Scottie."
  };
  function errText(e) { return ERRORS[e && e.code] || "Something went wrong. Nothing was changed. Please try again."; }

  function setStats(s) {
    var c = $("wlStatCount"), f = $("wlStatFees"), n = $("wlStatNext");
    if (c) c.textContent = s ? s.count : "0";
    if (f) f.textContent = s ? money(s.yearly) : "$0";
    var cr = $("wlStatCredits"); if (cr) cr.textContent = s && s.credits ? money(s.credits) : "$0";
    if (n) n.textContent = s && s.next ? (s.next.renewal.exact ? MONTHS[s.next.renewal.m - 1].slice(0, 3) + " " + s.next.renewal.d : MONTHS[s.next.renewal.m - 1].slice(0, 3)) : "None";
  }

  /* Memberstack can arrive a moment after the page does (index.html polls for
     it too), so give it up to 8 seconds before calling it missing. */
  function whenMemberstack(cb, waited) {
    waited = waited || 0;
    if (window.$memberstackDom || waited >= 8000) return cb();
    setTimeout(function () { whenMemberstack(cb, waited + 200); }, 200);
  }

  function load() {
    state.error = null; state.wallet = null; paint();
    if (!store()) { state.error = { code: "NO_MEMBERSTACK" }; return paint(); }
    whenMemberstack(function () {
      store().load().then(function (w) { state.wallet = w; state.error = null; paint(); },
        function (e) { state.wallet = null; state.error = e; paint(); });
    });
  }

  /* optimistic: show the change at once (used for ticks), undo it if the save fails */
  function save(change, done, optimistic) {
    if (state.busy) return;
    var before = state.wallet;
    if (optimistic && before) {
      var draft = JSON.parse(JSON.stringify(before));
      change(draft);
      state.wallet = draft;
    }
    state.busy = true; state.msg = ""; paint();
    store().update(change).then(function (w) {
      state.wallet = w; state.busy = false; if (done) done(); paint();
    }, function (e) {
      if (optimistic) state.wallet = before;
      state.busy = false; state.msg = errText(e); paint();
    });
  }

  /* ----- add / edit form ----- */
  function formHtml(entry) {
    var cat = catalog().cards.slice().sort(function (a, b) { return a.issuer.localeCompare(b.issuer) || a.name.localeCompare(b.name); });
    var groups = {}, order = [];
    cat.forEach(function (c) { if (!groups[c.issuer]) { groups[c.issuer] = []; order.push(c.issuer); } groups[c.issuer].push(c); });
    var o = entry ? parseOpened(entry.opened) : null, t = todayParts();
    var opts = '<option value="">Choose a card</option>' + order.map(function (iss) {
      return '<optgroup label="' + esc(iss) + '">' + groups[iss].map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (entry && entry.cardId === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
    var months = '<option value="">Month</option>' + MONTHS.map(function (m, i) {
      return '<option value="' + (i + 1) + '"' + (o && o.m === i + 1 ? " selected" : "") + ">" + m + "</option>";
    }).join("");
    var years = '<option value="">Year</option>';
    for (var y = t.y; y >= t.y - 40; y--) years += '<option value="' + y + '"' + (o && o.y === y ? " selected" : "") + ">" + y + "</option>";
    var days = '<option value="">Day (optional)</option>';
    for (var d = 1; d <= 31; d++) days += '<option value="' + d + '"' + (o && o.d === d ? " selected" : "") + ">" + d + "</option>";
    return '<form class="wl-form" id="wlForm" novalidate>' +
      '<h3 class="wl-h3">' + (entry ? "Edit card" : "Add a card") + "</h3>" +
      '<label class="wl-lab">Card<select id="wlCard" required' + (entry ? " disabled" : "") + ">" + opts + "</select></label>" +
      '<div class="wl-lab">When did you open it?<div class="wl-date">' +
      '<select id="wlMonth" aria-label="Month opened">' + months + "</select>" +
      '<select id="wlDay" aria-label="Day opened">' + days + "</select>" +
      '<select id="wlYear" aria-label="Year opened">' + years + "</select></div>" +
      '<small class="wl-help">Month and year are enough. Add the day if you know it for an exact renewal date. It is on your first statement or in your issuer\'s app.</small></div>' +
      '<label class="wl-lab">Nickname (optional)<input id="wlNick" maxlength="40" placeholder="e.g. Business card, Spouse\'s card" value="' + esc(entry && entry.nickname || "") + '"></label>' +
      '<p class="wl-err" id="wlFormErr" role="alert"></p>' +
      '<div class="wl-acts"><button class="wl-btn wl-pri" type="submit"' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Saving" : entry ? "Save changes" : "Add card") + "</button>" +
      '<button class="wl-btn" type="button" data-wl="cancel">Cancel</button></div></form>';
  }

  function readForm(entry) {
    var cardId = entry ? entry.cardId : $("wlCard").value;
    var m = +$("wlMonth").value, y = +$("wlYear").value, d = +$("wlDay").value;
    if (!cardId) return { err: "Choose which card." };
    if (!m || !y) return { err: "Choose the month and year you opened it." };
    if (d && d > daysInMonth(y, m)) return { err: MONTHS[m - 1] + " " + y + " only has " + daysInMonth(y, m) + " days." };
    var opened = y + "-" + (m < 10 ? "0" : "") + m + (d ? "-" + (d < 10 ? "0" : "") + d : "");
    if (isFuture(opened)) return { err: "That date is in the future." };
    return { cardId: cardId, opened: opened, nickname: $("wlNick").value.trim().slice(0, 40) };
  }

  /* ----- list ----- */
  function badge(text, kind) { return '<span class="wl-tag' + (kind ? " " + kind : "") + '">' + esc(text) + "</span>"; }

  function perkTags(b, p) {
    var t = "";
    if (b.enroll === "yes") t += badge("Enroll first");
    if (b.spendGate) t += badge("Needs $" + Number(b.spendGate).toLocaleString("en-US") + " spend");
    if (b.confidence === "assumed") t += badge("Issuer does not state this", "warn");
    else if (p && p.assumed) t += badge("Reset date not confirmed", "warn");
    return t;
  }

  /* One line of the card's perk panel */
  function perkHtml(r, today) {
    var b = r.perk, p = r.period, amt = perkAmount(b);
    var head = '<div class="wl-pk-top"><b>' + esc(b.label) + "</b>" + (amt ? '<span class="wl-pk-amt">' + esc(amt) + "</span>" : "") + "</div>" +
      (b.type === "activation" ? rotatingLine(b.card) : "");
    var when = "";
    if (p) {
      var dl = p.activateBy ? "Activate by " : "Use by ";
      when = '<div class="wl-pk-when">' + esc(p.name) + ": " + dl + esc(dayText(p.end)) + (p.approx ? " or earlier" : "") +
        (r.used ? "" : ' <span class="wl-pk-days' + (p.days <= 14 ? " on" : "") + '">' + esc(daysLeft(p.days)) + "</span>") + "</div>";
    } else if (r.nextArrives) {
      when = '<div class="wl-pk-when">Arrives on your card anniversary: next ' + esc(renewalText(r.nextArrives)) + "</div>";
    } else if (b.cadence === "every4years") {
      when = '<div class="wl-pk-when">Once every 4 years, counted from when you last used it</div>';
    } else if (b.cadence === "per event" || b.cadence === "per purchase") {
      when = '<div class="wl-pk-when">Automatic when it applies</div>';
    }
    var tick = p ? '<label class="wl-tick"><input type="checkbox" data-wl="use" data-id="' + esc(r.entry.id) + '" data-perk="' + esc(b.id) +
      '" data-key="' + esc(p.key) + '"' + (r.used ? " checked" : "") + (state.busy ? " disabled" : "") + "> " +
      (p.activateBy ? "Activated" : "Used") + "</label>" : "";
    var foot = (b.note ? '<p class="wl-pk-note">' + esc(b.note) + "</p>" : "") +
      (b.source ? '<a class="wl-src" href="' + esc(b.source) + '" target="_blank" rel="noopener">Source</a>' : "");
    return '<li class="wl-pk' + (r.used ? " done" : "") + '"><div class="wl-pk-main">' + head + when +
      '<div class="wl-tags">' + perkTags(b, p) + "</div>" + foot + "</div>" + tick + "</li>";
  }
  function rotatingLine(cardId) {
    var qs = quartersFor(catalog(), cardId), t = "";
    if (qs.current) t += '<div class="wl-pk-rot"><b>' + esc(quarterName(qs.current.quarter)) + ":</b> " + esc(qs.current.categories) + "</div>";
    if (qs.next) t += '<div class="wl-pk-rot wl-dim"><b>Next, ' + esc(quarterName(qs.next.quarter)) + ":</b> " + esc(qs.next.categories) +
      (qs.next.deadline ? "" : " (activation deadline not announced yet)") + "</div>";
    return t;
  }

  function earnHtml(cardId) {
    var list = earningFor(catalog(), cardId);
    if (!list.length) return "";
    return '<h4 class="wl-h4">How it earns</h4><ul class="wl-earn">' + list.map(function (e) {
      var cap1 = function (x) { return x.charAt(0).toUpperCase() + x.slice(1); };
      var sub = [e.cap, e.via].filter(Boolean).map(cap1).join(". ");
      var status = e.groups.indexOf("status") > -1;
      return '<li><span class="wl-rate' + (status ? " st" : "") + '">' + esc(rateText(e)) + "</span>" +
        '<span class="wl-earn-main"><b>' + esc(e.category) + "</b>" + (status ? " <span class=\"wl-dim\">(" + esc(e.currency) + ")</span>" : "") +
        (sub ? '<span class="wl-earn-sub">' + esc(sub) + "</span>" : "") +
        (e.note && !status && e.groups.indexOf("everyday") < 0 && e.groups.indexOf("rotating") < 0 ? '<span class="wl-earn-sub wl-dim">' + esc(e.note) + "</span>" : "") +
        (e.groups.indexOf("rotating") > -1 ? rotatingLine(cardId) : "") +
        (e.confidence === "assumed" ? '<span class="wl-tags">' + badge("Issuer does not state this clearly", "warn") + "</span>" : "") +
        "</span></li>";
    }).join("") + "</ul>";
  }

  function daysLeft(n) { return n < 0 ? "Deadline passed" : n === 0 ? "Last day" : n === 1 ? "1 day left" : n + " days left"; }

  function rowHtml(r, perks) {
    var e = r.entry, c = r.card;
    if (!c) {
      return '<li class="wl-row wl-gone"><div class="wl-rowtop"><div class="wl-main"><b class="wl-name">A card we no longer track</b>' +
        '<span class="wl-sub">It was removed from our card list. You can remove it here.</span></div>' +
        '<div class="wl-side"><button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></div></div></li>';
    }
    var mine = perks.filter(function (x) { return x.entry.id === e.id; });
    var credits = mine.reduce(function (s, x) { return s + perkYearUsd(x.perk); }, 0);
    var other = mine.filter(function (x) { return !perkYearUsd(x.perk); }).length;
    var open = !!state.open[e.id];
    var rn = r.renewal, soon = r.hasFee && rn && rn.days <= SOON_DAYS;
    var feeLine = r.hasFee ? money(c.fee) + " a year" : "No annual fee";
    var renewLine = r.hasFee ? "Renews " + esc(renewalText(rn)) : "Opened " + esc(openedText(e.opened));
    var html = '<li class="wl-row' + (soon ? " wl-soon" : "") + '"><div class="wl-rowtop">' +
      '<div class="wl-main"><b class="wl-name">' + esc(c.name) + "</b>" +
      '<span class="wl-sub">' + esc(c.issuer) + (e.nickname ? " &middot; " + esc(e.nickname) : "") + "</span>" +
      '<span class="wl-meta">' + renewLine + (r.hasFee ? ' <span class="wl-dot">&middot;</span> Opened ' + esc(openedText(e.opened)) : "") + "</span>" +
      valueLine(credits, other) +
      "</div>" +
      '<div class="wl-side"><span class="wl-fee">' + esc(feeLine) + "</span>" +
      (r.hasFee ? '<span class="wl-when' + (soon ? " on" : "") + '">' + esc(whenText(rn)) + "</span>" : "") +
      '<span class="wl-rowacts"><button class="wl-link" data-wl="edit" data-id="' + esc(e.id) + '">Edit</button>' +
      '<button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></span></div></div>';
    var earnCount = earningFor(catalog(), c.id).length;
    if (mine.length || earnCount) {
      html += '<button class="wl-perkbtn" data-wl="perks" data-id="' + esc(e.id) + '" aria-expanded="' + open + '">' +
        (open ? "Hide details" : "How it earns, perks and credits") + "</button>";
      if (open) html += '<div class="wl-detail">' + earnHtml(c.id) +
        (mine.length ? '<h4 class="wl-h4">Perks and credits</h4><ul class="wl-pks">' + mine.map(function (x) { return perkHtml(x); }).join("") + "</ul>" : "") +
        "</div>";
    } else if (c.note) {
      html += '<p class="wl-pk-note wl-cardnote">' + esc(c.note) + "</p>";
    }
    return html + "</li>";
  }

  /* Dollar credits plus a count of the perks that are not dollars (passes,
     companion fares, status points). Never set against the fee: that would
     make cards whose value is not in dollars look like a bad deal. */
  function valueLine(credits, other) {
    if (!credits && !other) return "";
    var t = credits ? "Up to " + money(credits) + " a year in credits" : "";
    if (other) t += (t ? ", plus " : "") + other + (other === 1 ? " other perk" : " other perks");
    return '<span class="wl-value">' + esc(t) + "</span>";
  }

  function soonHtml(perks) {
    var list = expiringSoon(perks, SOON_PERK_DAYS);
    if (!list.length) return "";
    var atRisk = list.reduce(function (s, r) { return s + (r.perk.unit === "usd" ? r.perk.amount : 0); }, 0);
    var shown = state.showAllSoon ? list : list.slice(0, 6);
    return '<div class="wl-card wl-soonbox"><div class="wl-head"><h3 class="wl-h3">Use it or lose it</h3>' +
      (atRisk ? '<span class="wl-risk">' + esc(money(atRisk)) + " unused</span>" : "") + "</div>" +
      '<p class="wl-sub2">Credits that reset in the next ' + SOON_PERK_DAYS + " days and are not ticked off yet.</p>" +
      '<ul class="wl-pks wl-pks-soon">' + shown.map(function (r) {
        var b = r.perk, p = r.period;
        return '<li class="wl-pk"><div class="wl-pk-main"><div class="wl-pk-top"><b>' + esc(b.label) + "</b>" +
          '<span class="wl-pk-amt">' + esc(b.unit === "usd" ? money(b.amount) : perkAmount(b)) + "</span></div>" +
          '<div class="wl-pk-when">' + esc(r.card.name) + (r.entry.nickname ? " (" + esc(r.entry.nickname) + ")" : "") + " &middot; " +
          (p.activateBy ? "Activate by " : "Use by ") + esc(dayText(p.end)) + (p.approx ? " or earlier" : "") +
          ' <span class="wl-pk-days' + (p.days <= 14 ? " on" : "") + '">' + esc(daysLeft(p.days)) + "</span></div>" +
          (b.type === "activation" ? rotatingLine(b.card) : "") +
          '<div class="wl-tags">' + perkTags(b, p) + "</div></div>" +
          '<label class="wl-tick"><input type="checkbox" data-wl="use" data-id="' + esc(r.entry.id) + '" data-perk="' + esc(b.id) +
          '" data-key="' + esc(p.key) + '"' + (state.busy ? " disabled" : "") + "> " + (p.activateBy ? "Activated" : "Used") + "</label></li>";
      }).join("") + "</ul>" +
      (list.length > 6 ? '<button class="wl-perkbtn" data-wl="allsoon">' + (state.showAllSoon ? "Show fewer" : "Show all " + list.length) + "</button>" : "") +
      "</div>";
  }

  function paint() {
    if (!host) return;
    if (state.error) {
      setStats(null);
      host.innerHTML = '<div class="wl-card wl-empty"><p>' + esc(errText(state.error)) + "</p>" +
        (state.error.code === "READ_FAILED" ? '<button class="wl-btn wl-pri" data-wl="retry">Try again</button>' : "") + "</div>";
      return;
    }
    if (!state.wallet) { host.innerHTML = '<div class="wl-card wl-empty"><p>Loading your wallet</p></div>'; return; }
    var s = summarize(state.wallet, catalog());
    var perks = perkRows(state.wallet, catalog());
    s.credits = perks.reduce(function (t, r) { return t + perkYearUsd(r.perk); }, 0);
    setStats(s);
    var editingEntry = state.editing && state.editing !== "new" ?
      state.wallet.cards.filter(function (c) { return c.id === state.editing; })[0] : null;
    var html = "";
    if (state.msg) html += '<p class="wl-banner" role="alert">' + esc(state.msg) + "</p>";
    if (state.editing) html += '<div class="wl-card">' + formHtml(editingEntry) + "</div>";

    if (!s.count && !state.editing) {
      html += '<div class="wl-card wl-empty"><h3 class="wl-h3">Start with the cards in your wallet</h3>' +
        "<p>Add each card and the month you opened it. You will see every annual fee and every credit in one place, with the ones about to expire at the top, so none of them slip by.</p>" +
        '<button class="wl-btn wl-pri" data-wl="add">Add your first card</button></div>';
    } else if (s.count) {
      if (!state.editing) html += soonHtml(perks);
      html += '<div class="wl-card"><div class="wl-head"><h3 class="wl-h3">Your cards</h3>' +
        (state.editing ? "" : '<button class="wl-btn wl-pri" data-wl="add">Add a card</button>') + "</div>" +
        (s.soon ? '<p class="wl-note">' + s.soon + (s.soon === 1 ? " card renews" : " cards renew") + " in the next " + SOON_DAYS + " days. Now is the time to decide: keep it, ask for a retention offer, or downgrade.</p>" : "") +
        '<ul class="wl-list">' + s.rows.map(function (r) { return rowHtml(r, perks); }).join("") + "</ul></div>";
    }
    var checked = catalog().cards.length ? catalog().cards.map(function (c) { return c.checked; }).sort()[0] : "";
    html += '<p class="wl-foot">Fees and credits come from each issuer\'s own website' + (checked ? ", checked " + esc(fmtIso(checked)) : "") +
      '. Where an issuer does not say when a credit resets, we say so and show calendar periods. Renewal is your card anniversary; most issuers bill the fee on the statement after it. Your wallet is private to your account.</p>';
    host.innerHTML = html;
    if (state.editing) bindForm(editingEntry);
  }
  function fmtIso(s) { var o = parseOpened(s); return o ? MONTHS[o.m - 1].slice(0, 3) + " " + o.d + ", " + o.y : s; }

  function bindForm(entry) {
    var f = $("wlForm"); if (!f) return;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = readForm(entry);
      if (v.err) { $("wlFormErr").textContent = v.err; return; }
      if (entry) {
        save(function (w) { w.cards.forEach(function (c) { if (c.id === entry.id) { c.opened = v.opened; c.nickname = v.nickname; } }); },
          function () { state.editing = null; });
      } else {
        save(function (w) { w.cards.push({ id: store().newId(), cardId: v.cardId, opened: v.opened, nickname: v.nickname }); },
          function () { state.editing = null; });
      }
    });
    var first = entry ? $("wlMonth") : $("wlCard");
    if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
  }

  /* Tick or untick a perk for the current period. Uses the same safe save. */
  function setUsed(entryId, perkId, key, on) {
    save(function (w) {
      w.cards.forEach(function (c) {
        if (c.id !== entryId) return;
        c.used = c.used || {};
        c.used[perkId] = c.used[perkId] || {};
        if (on) c.used[perkId][key] = true; else delete c.used[perkId][key];
        pruneUsed(c);
      });
    }, null, true);
  }

  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest("[data-wl]");
    if (!b || !host.contains(b)) return;
    var act = b.getAttribute("data-wl"), id = b.getAttribute("data-id");
    if (act === "use") return; /* handled on change */
    if (act === "retry") return load();
    if (act === "add") { state.editing = "new"; state.msg = ""; paint(); host.scrollIntoView({ block: "nearest" }); return; }
    if (act === "cancel") { state.editing = null; paint(); return; }
    if (act === "edit") { state.editing = id; state.msg = ""; paint(); return; }
    if (act === "perks") { state.open[id] = !state.open[id]; paint(); return; }
    if (act === "allsoon") { state.showAllSoon = !state.showAllSoon; paint(); return; }
    if (act === "remove") {
      var e = state.wallet.cards.filter(function (c) { return c.id === id; })[0];
      var c = e && catalog().cards.filter(function (k) { return k.id === e.cardId; })[0];
      if (!window.confirm("Remove " + (c ? c.name : "this card") + " from your wallet? Its ticked-off credits go too.")) return;
      save(function (w) { w.cards = w.cards.filter(function (k) { return k.id !== id; }); },
        function () { if (state.editing === id) state.editing = null; });
    }
  }
  function onChange(ev) {
    var t = ev.target;
    if (!t || t.getAttribute("data-wl") !== "use") return;
    setUsed(t.getAttribute("data-id"), t.getAttribute("data-perk"), t.getAttribute("data-key"), t.checked);
  }

  function styles() {
    if (document.getElementById("wl-css")) return;
    var s = document.createElement("style");
    s.id = "wl-css";
    s.textContent = [
      ".wl-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius,16px);box-shadow:var(--shadow);padding:18px;margin-bottom:14px}",
      ".wl-h3{margin:0;font-size:16px;font-weight:800;color:var(--text)}",
      ".wl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}",
      ".wl-empty{text-align:center;padding:28px 18px}.wl-empty p{color:var(--muted);max-width:520px;margin:10px auto 16px;line-height:1.55;font-size:14px}",
      ".wl-btn{font:inherit;font-size:13.5px;font-weight:800;border-radius:10px;padding:9px 14px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer}",
      ".wl-btn.wl-pri{background:var(--coral);border-color:var(--coral);color:#fff}.wl-btn:disabled{opacity:.6;cursor:wait}",
      ".wl-link{font:inherit;font-size:12.5px;font-weight:700;color:var(--muted);background:none;border:0;padding:4px 6px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}",
      ".wl-link:hover{color:var(--text)}",
      ".wl-list{list-style:none;margin:0;padding:0}",
      ".wl-row{display:flex;justify-content:space-between;gap:14px;padding:14px 0;border-top:1px solid var(--line)}",
      ".wl-row:first-child{border-top:0}",
      ".wl-main,.wl-side{display:flex;flex-direction:column;gap:3px;min-width:0}",
      ".wl-side{align-items:flex-end;text-align:right;flex:0 0 auto}",
      ".wl-name{font-size:14.5px;color:var(--text)}",
      ".wl-sub,.wl-meta{font-size:12.5px;color:var(--muted)}",
      ".wl-fee{font-size:14px;font-weight:800;color:var(--text)}",
      ".wl-when{font-size:12px;font-weight:700;color:var(--muted)}",
      ".wl-when.on{color:#b4580f;background:rgba(242,184,75,.22);border-radius:999px;padding:2px 9px}",
      "[data-theme=dark] .wl-when.on{color:#f2b84b}",
      ".wl-soon .wl-name:before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#e8824c;margin-right:7px;vertical-align:1px}",
      ".wl-gone{opacity:.75}",
      ".wl-note{margin:0 0 6px;font-size:13px;line-height:1.5;color:var(--text);background:rgba(242,184,75,.14);border-radius:10px;padding:9px 12px}",
      ".wl-banner{margin:0 0 12px;font-size:13.5px;font-weight:700;color:#9b2c2c;background:rgba(242,114,110,.14);border-radius:10px;padding:10px 12px}",
      "[data-theme=dark] .wl-banner{color:#f6a7a3}",
      ".wl-foot{font-size:12px;line-height:1.55;color:var(--muted);margin:4px 2px 0}",
      ".wl-form{display:flex;flex-direction:column;gap:14px}",
      ".wl-lab{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:var(--text)}",
      ".wl-form select,.wl-form input{font:inherit;font-size:14px;font-weight:500;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,var(--surface));color:var(--text);min-width:0}",
      ".wl-date{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px}",
      ".wl-help{font-weight:500;color:var(--muted);font-size:12px;line-height:1.5}",
      ".wl-err{margin:0;min-height:1em;font-size:13px;font-weight:700;color:#c0392b}",
      ".wl-acts{display:flex;gap:10px}",
      ".wl-rowtop{display:flex;justify-content:space-between;gap:14px}",
      ".wl-row{flex-direction:column;gap:0}",
      ".wl-value{font-size:12.5px;font-weight:700;color:#2f855a;margin-top:2px}",
      "[data-theme=dark] .wl-value{color:#6fd39b}",
      ".wl-perkbtn{align-self:flex-start;margin-top:10px;font:inherit;font-size:12.5px;font-weight:800;color:var(--coral);background:none;border:1px solid var(--line);border-radius:999px;padding:5px 12px;cursor:pointer}",
      ".wl-pks{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}",
      ".wl-pk{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;background:var(--surface-2,var(--bg));border-radius:12px;padding:11px 13px}",
      ".wl-pk.done{opacity:.6}",
      ".wl-pk-main{display:flex;flex-direction:column;gap:3px;min-width:0}",
      ".wl-pk-top{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;font-size:13.5px;color:var(--text)}",
      ".wl-pk-amt{font-size:12.5px;font-weight:700;color:var(--muted)}",
      ".wl-pk-when{font-size:12.5px;color:var(--muted)}",
      ".wl-pk-days{font-weight:700}.wl-pk-days.on{color:#b4580f}",
      "[data-theme=dark] .wl-pk-days.on{color:#f2b84b}",
      ".wl-pk-note{margin:2px 0 0;font-size:12px;line-height:1.45;color:var(--muted)}",
      ".wl-cardnote{margin-top:8px}",
      ".wl-src{font-size:11.5px;color:var(--muted)}",
      ".wl-tags{display:flex;flex-wrap:wrap;gap:5px}.wl-tags:empty{display:none}",
      ".wl-tag{font-size:11px;font-weight:700;border:1px solid var(--line);border-radius:999px;padding:1px 8px;color:var(--muted)}",
      ".wl-tag.warn{border-color:rgba(232,130,76,.5);color:#b4580f}",
      "[data-theme=dark] .wl-tag.warn{color:#f2b84b}",
      ".wl-tick{flex:0 0 auto;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;color:var(--text);cursor:pointer;white-space:nowrap;padding-top:1px}",
      ".wl-tick input{width:18px;height:18px;accent-color:#e8824c;cursor:pointer}",
      ".wl-soonbox{border-color:rgba(242,184,75,.55)}",
      ".wl-h4{margin:16px 0 8px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}",
      ".wl-detail .wl-h4:first-child{margin-top:12px}",
      ".wl-earn{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}",
      ".wl-earn li{display:flex;gap:12px;align-items:flex-start;padding:7px 0;border-top:1px dashed var(--line)}",
      ".wl-earn li:first-child{border-top:0}",
      ".wl-rate{flex:0 0 64px;text-align:center;font-size:14px;font-weight:800;color:#1c3d5a;background:rgba(159,193,212,.28);border-radius:8px;padding:4px 0}",
      "[data-theme=dark] .wl-rate{color:#d6e7f2}",
      ".wl-rate.st{font-size:11.5px;color:#7a5a12;background:rgba(242,184,75,.22)}",
      "[data-theme=dark] .wl-rate.st{color:#f2b84b}",
      ".wl-earn-main{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:13.5px;color:var(--text)}",
      ".wl-earn-sub{font-size:12px;line-height:1.45;color:var(--muted)}",
      ".wl-dim{color:var(--muted);font-weight:500}",
      ".wl-pk-rot{font-size:12.5px;line-height:1.45;color:var(--text)}",
      ".wl-risk{font-size:13px;font-weight:800;color:#b4580f;background:rgba(242,184,75,.22);border-radius:999px;padding:3px 11px}",
      "[data-theme=dark] .wl-risk{color:#f2b84b}",
      ".wl-sub2{margin:-4px 0 0;font-size:12.5px;color:var(--muted)}",
      "@media (max-width:560px){.wl-rowtop{flex-direction:column;gap:8px}.wl-pk{flex-direction:column;gap:8px}.wl-side{align-items:flex-start;text-align:left;flex-direction:row;flex-wrap:wrap;gap:8px 12px;align-items:center}.wl-rowacts{margin-left:auto}.wl-date{grid-template-columns:1fr 1fr}.wl-date select:first-child{grid-column:1/-1}}"
    ].join("");
    document.head.appendChild(s);
  }

  window.HRT_WALLET = {
    _test: { parseOpened: parseOpened, nextRenewal: nextRenewal, isFuture: isFuture, summarize: summarize,
      whenText: whenText, renewalText: renewalText, money: money,
      perkPeriod: perkPeriod, perkRows: perkRows, expiringSoon: expiringSoon, pruneUsed: pruneUsed,
      perkAmount: perkAmount, perkYearUsd: perkYearUsd, isTracked: isTracked,
      rateText: rateText, earningFor: earningFor, quartersFor: quartersFor, quarterName: quarterName },
    show: function () {
      styles();
      host = document.getElementById("wl-host");
      if (host && !host.getAttribute("data-ready")) {
        host.setAttribute("data-ready", "1");
        host.addEventListener("click", onClick);
        host.addEventListener("change", onChange);
        load();
      }
    }
  };
})();
