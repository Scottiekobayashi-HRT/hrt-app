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
  var COACH_URL = "https://www.hawaiirewardtravel.com/our-accelerated-program"; /* our 1:1 program */
  /* Scottie's number for ʻOhana Members (Oct 25). Opens a text on phones; desktop Macs open Messages. */
  var SCOTTIE_SMS = "sms:+18083545216";
  var CHAT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>';
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
  /* Optional "fee posts on" date (MM-DD), when the bank bills the fee. Next one on or after today. */
  function nextFeeDate(entry, today) {
    var m = /^(\d{2})-(\d{2})$/.exec(entry && entry.feeDate || "");
    if (!m) return null;
    var t = today || todayParts(), mo = +m[1], d = +m[2], y = t.y;
    var dd = function (yy) { return Math.min(d, daysInMonth(yy, mo)); };
    if (dayNum(y, mo, dd(y)) < dayNum(t.y, t.m, t.d)) y++;
    return { y: y, m: mo, d: dd(y), days: dayNum(y, mo, dd(y)) - dayNum(t.y, t.m, t.d) };
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
  /* Status labels. Keys match HRT_WALLET_STORE.STATUSES. "next" = planned, not opened yet. */
  var STATUS_LABEL = {
    "keep": "Keep", "keep-for-now": "Keep for now", "min-spend": "Working on minimum spend",
    "min-spend-almost": "Minimum spend almost done", "downgrade": "Plan to downgrade", "cancel": "Plan to cancel",
    "next": "Next card", "closed": "Closed"
  };
  var STATUS_ORDER = ["keep", "keep-for-now", "min-spend", "min-spend-almost", "downgrade", "cancel", "next", "closed"];
  /* A card counts toward fees, credits and "Which card" only once it is open and not closed. */
  function isHeld(e) { return !e || (e.status !== "next" && e.status !== "closed"); }
  /* The catalog card for an entry, or a stand-in for a card we do not catalog ("Other card"). */
  function cardFor(e, byId) {
    if (e && e.cardId === "custom" && e.custom) {
      var fee = +e.custom.fee || 0;
      return { id: "custom", custom: true, name: e.custom.name, issuer: e.custom.issuer || "", fee: fee, feeBasis: "anniversary", network: "" };
    }
    return (byId && byId[e.cardId]) || null;
  }
  function money(n) { return "$" + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

  /* Everything the screen shows, worked out from wallet + catalog. Pure. */
  function summarize(wallet, catalog, today) {
    var byId = {};
    (catalog && catalog.cards || []).forEach(function (c) { byId[c.id] = c; });
    var all = wallet && wallet.cards || [];
    var upcoming = all.filter(function (w) { return !isHeld(w); }).map(function (w) { return { entry: w, card: cardFor(w, byId) }; });
    var rows = all.filter(isHeld).map(function (w) {
      var c = cardFor(w, byId);
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
      upcoming: upcoming,
      count: rows.length,
      yearly: feeRows.reduce(function (s, r) { return s + r.card.fee; }, 0),
      next: feeRows.filter(function (r) { return r.renewal; })[0] || null,
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

  /* A tick (true) or an amount at least the full credit means used. A smaller
     amount means part used: still open, with the rest left to use. */
  function usedValue(entry, b, period) {
    return period && entry.used && entry.used[b.id] ? entry.used[b.id][period.key] : undefined;
  }
  function isUsed(entry, b, period) {
    var v = usedValue(entry, b, period);
    return v === true || (typeof v === "number" && v > 0 && v >= b.amount);
  }
  function partUsed(entry, b, period) {
    var v = usedValue(entry, b, period);
    return typeof v === "number" && v > 0 && v < b.amount ? v : 0;
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
      if (!cards[e.cardId] || !isHeld(e)) return;
      (byCard[e.cardId] || []).forEach(function (b) {
        var p = perkPeriod(b, e.opened, today);
        var next = b.type === "bonus" && b.resets === "anniversary" ? nextRenewal(e.opened, today) : null;
        var part = partUsed(e, b, p);
        out.push({ entry: e, card: cards[e.cardId], perk: b, period: p, used: isUsed(e, b, p), part: part,
          left: Math.round((b.amount - part) * 100) / 100, nextArrives: next });
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

  /* Every unused credit in its current window, grouped by when it ends:
     the next 31 days, the rest of this calendar quarter, and later. So a
     quarterly Resy credit or a yearly airline credit is never hidden just
     because it ends more than a month away. Empty groups are dropped. Pure. */
  function creditGroups(perks, today) {
    var t = today || todayParts(), qm = Math.ceil(t.m / 3) * 3, qEnd = { y: t.y, m: qm, d: daysInMonth(t.y, qm) };
    var qDays = dayNum(qEnd.y, qEnd.m, qEnd.d) - dayNum(t.y, t.m, t.d);
    var g = [{ key: "soon", label: "Next " + SOON_PERK_DAYS + " days", rows: [] },
      { key: "quarter", label: "By " + dayText(qEnd), rows: [] },
      { key: "later", label: "Later", rows: [] }];
    expiringSoon(perks, 100000).forEach(function (r) {
      (r.period.days <= SOON_PERK_DAYS ? g[0] : r.period.days <= qDays ? g[1] : g[2]).rows.push(r);
    });
    g.forEach(function (x) { x.usd = x.rows.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.left : 0); }, 0); });
    return g.filter(function (x) { return x.rows.length; });
  }

  /* Everything with a date in the next `horizon` days, soonest first. Credits
     ending the same day are grouped. Pure. */
  function importantDates(wallet, catalog, today, horizon) {
    var t = today || todayParts(), H = horizon || 90, out = [], s = summarize(wallet, catalog, t), perks = perkRows(wallet, catalog, t);
    var add = function (date, days, kind, text, id, usd) { if (days >= 0 && days <= H) out.push({ date: date, days: days, kind: kind, text: text, id: id || null, usd: usd || 0 }); };
    s.rows.forEach(function (r) {
      if (!r.card) return;
      if (r.hasFee && r.renewal) add({ y: r.renewal.y, m: r.renewal.m, d: r.renewal.d || 1 }, r.renewal.days, "renew",
        shortName(r.card.name) + " renews, " + money(r.card.fee) + " fee" + (r.renewal.exact ? "" : " (some time this month)"), r.entry.id);
      var fd = r.hasFee ? nextFeeDate(r.entry, t) : null;
      if (fd) add(fd, fd.days, "fee", shortName(r.card.name) + " annual fee posts (" + money(r.card.fee) + ")", r.entry.id);
      var bs = bonusState(r.entry, t);
      if (bs && !bs.met && !bs.missed) add(bs.by, bs.days, "bonus", "Spend " + money(bs.left) + " more on " + shortName(r.card.name) + " for the welcome bonus", r.entry.id);
    });
    var byDay = {};
    perks.forEach(function (r) {
      if (!r.period || r.used || r.period.days < 0 || r.period.days > H) return;
      if (r.perk.type === "activation") { add(r.period.end, r.period.days, "activate", "Activate " + shortName(r.card.name) + " 5% categories", r.entry.id); return; }
      var k = r.period.end.y + "-" + r.period.end.m + "-" + r.period.end.d;
      (byDay[k] = byDay[k] || { date: r.period.end, days: r.period.days, rows: [] }).rows.push(r);
    });
    Object.keys(byDay).forEach(function (k) {
      var g = byDay[k], usd = g.rows.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.left : 0); }, 0);
      var text = g.rows.length === 1 ? shortName(g.rows[0].card.name) + " " + g.rows[0].perk.label + " ends" :
        g.rows.length + " credits end (" + g.rows.slice(0, 3).map(function (r) { return r.perk.label; }).join(", ") + (g.rows.length > 3 ? " and more" : "") + ")";
      add(g.date, g.days, "credit", text, g.rows.length === 1 ? g.rows[0].entry.id : null, usd);
    });
    var rank = { bonus: 0, activate: 1, fee: 2, renew: 3, credit: 4 };
    return out.sort(function (a, b) { return a.days - b.days || rank[a.kind] - rank[b.kind]; });
  }

  /* Short names for tight spaces: "American Express Gold Card" -> "Amex Gold" */
  function shortName(name) {
    var n = String(name || "").replace(/^The /, "");
    var amex = /American Express/.test(n);
    n = n.replace(/ Card from American Express$/, "").replace(/^American Express /, "").replace(/ Card$/, "")
      .replace(/ Visa (Infinite|Signature)$/, "").replace(/^Atmos Rewards /, "Atmos ").replace(/^Capital One /, "")
      .replace(/^Chase /, "").replace(/ Rewards$/, "");
    return amex ? "Amex " + n : n;
  }
  /* Card art: the issuer's own card image when the sheet has one, otherwise a
     plain card in the issuer's colour. The plain card sits underneath the image,
     so if an image ever fails to load the member still sees a tidy card. */
  var ISSUER_SHORT = { "American Express": "AMEX", "Chase": "CHASE", "Capital One": "CAPITAL ONE", "Bank of America": "ATMOS" };
  function artHtml(c, size) {
    var tone = ISSUER_TONE[c.issuer] || "#7a8ca0";
    return '<span class="wl-art wl-art-' + size + '" style="--tone:' + tone + '" aria-hidden="true">' +
      '<span class="wl-art-ph"><i></i>' + esc(ISSUER_SHORT[c.issuer] || c.issuer || "") + "</span>" +
      (c.art ? '<img src="' + esc(c.art) + '" alt="" loading="lazy" decoding="async"' +
        ' onload="this.parentNode.classList.add(\'wl-art-ok\')" onerror="this.remove()">' : "") + "</span>";
  }
  function shortAmount(b) {
    if (!(b.amount > 0)) return "";
    if (b.unit === "usd") return " " + money(b.amount);
    if (b.unit === "passes") return " (" + b.amount + (b.amount === 1 ? " pass)" : " passes)");
    return "";
  }
  var ISSUER_TONE = { "American Express": "#4f7fb8", "Chase": "#1f4e8c", "Capital One": "#c4473a", "Bank of America": "#2a8c8c" };

  /* What one card needs a member to know right now. Pure. */
  function cardBrief(entry, card, perks, today) {
    var mine = perks.filter(function (r) { return r.entry.id === entry.id && r.period && !r.used && r.period.days >= 0; })
      .sort(function (a, b) { return a.period.days - b.period.days; });
    var credits = mine.filter(function (r) { return r.perk.type !== "activation"; });
    var act = mine.filter(function (r) { return r.perk.type === "activation"; })[0] || null;
    var hasFee = card.fee > 0 && card.feeBasis === "anniversary";
    var rn = hasFee ? nextRenewal(entry.opened, today) : null;
    return {
      hasFee: hasFee, renewal: rn, renewSoon: !!(rn && rn.days <= SOON_DAYS),
      next: credits[0] || null, open: credits.length,
      openUsd: credits.reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.left : 0); }, 0),
      activate: act
    };
  }

  /* The few things a member most needs to know today, most urgent first. Pure.
     Returns [{ level: "hot"|"warn"|"info", text, id (wallet entry or null) }]. */
  function topAlerts(wallet, catalog, today, max) {
    var t = today || todayParts(), out = [];
    var s = summarize(wallet, catalog, t), perks = perkRows(wallet, catalog, t);
    var open = perks.filter(function (r) { return r.period && !r.used && r.period.days >= 0; });
    var credits = open.filter(function (r) { return r.perk.type !== "activation"; });
    // 1. credits about to be lost (within 7 days)
    var urgent = credits.filter(function (r) { return r.period.days <= 7; }).sort(function (a, b) { return a.period.days - b.period.days; });
    if (urgent.length === 1) {
      var u = urgent[0];
      out.push({ level: "hot", id: u.entry.id, text: shortName(u.card.name) + " " + u.perk.label + shortAmount(u.perk) + " expires " +
        (u.period.days === 0 ? "today" : u.period.days === 1 ? "tomorrow" : "in " + u.period.days + " days") });
    } else if (urgent.length > 1) {
      var usd = urgent.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.left : 0); }, 0);
      var d0 = urgent[0].period.days;
      out.push({ level: "hot", id: null, text: (usd ? money(usd) + " in credits" : urgent.length + " credits") + " expire" +
        (d0 === 0 ? " today" : d0 === 1 ? " by tomorrow" : " within " + urgent[urgent.length - 1].period.days + " days") });
    }
    // 2. annual fees coming due (30 days)
    s.rows.filter(function (r) { return r.hasFee && r.renewal && r.renewal.days <= 30; }).forEach(function (r) {
      out.push({ level: "warn", id: r.entry.id, text: shortName(r.card.name) + " renews " +
        (r.renewal.days === 0 ? "today" : "in " + r.renewal.days + (r.renewal.days === 1 ? " day" : " days")) + ", " + money(r.card.fee) + " fee" +
        (nextFeeDate(r.entry, t) ? " posts around " + dayText(nextFeeDate(r.entry, t)) : "") });
    });
    // 2b. welcome bonus spend due (30 days)
    (wallet && wallet.cards || []).forEach(function (e) {
      if (!isHeld(e)) return;
      var c = cardFor(e, (catalog.cards || []).reduce(function (m, k) { m[k.id] = k; return m; }, {})), bs = c && bonusState(e, t);
      if (bs && !bs.met && bs.days >= 0 && bs.days <= 30) out.push({ level: bs.days <= 7 ? "hot" : "warn", id: e.id,
        text: "Spend " + money(bs.left) + " more on " + shortName(c.name) + " by " + dayText(bs.by) + " for the welcome bonus" });
    });
    // 3. activations due (30 days)
    open.filter(function (r) { return r.perk.type === "activation" && r.period.days <= 30; }).forEach(function (r) {
      out.push({ level: "warn", id: r.entry.id, text: "Activate " + shortName(r.card.name) + " 5% by " + dayText(r.period.end) });
    });
    // 4. otherwise, what is left to use this month
    if (!urgent.length) {
      var month = credits.filter(function (r) { return r.period.days <= 31; });
      var mUsd = month.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.left : 0); }, 0);
      if (mUsd) out.push({ level: "info", id: null, text: money(mUsd) + " in credits to use in the next " + (month[month.length - 1] ? "31 days" : "month") });
    }
    return out.slice(0, max || 3);
  }

  /* ====================== KEEP OR CANCEL AT RENEWAL ======================
     What the member got from a card's dollar credits in the current card year
     (last anniversary, or the open date, to today), to set against the fee.
     Counts only credits and discounts the member ticked: a tick is the full
     amount, a stored number is that amount. Periods that overlap the card
     year count. Lounges, points and passes are not dollars, so not counted. */
  function cardYearStart(opened, today) {
    var t = today || todayParts(), nx = nextRenewal(opened, addDays(t, 1));
    return nx ? { y: nx.y - 1, m: nx.m, d: nx.exact ? nx.d : 1 } : null;
  }
  function usedThisCardYear(entry, catalog, today) {
    var t = today || todayParts(), start = cardYearStart(entry.opened, t), out = { used: 0, offered: 0 };
    if (!start) return out;
    var t0 = dayNum(t.y, t.m, t.d), dates = [start];
    for (var y = start.y, m = start.m + 1; ; m++) {
      if (m > 12) { m = 1; y++; }
      if (dayNum(y, m, 1) > t0) break;
      dates.push({ y: y, m: m, d: 1 });
    }
    (catalog && catalog.benefits || []).forEach(function (b) {
      if (b.card !== entry.cardId || !perkYearUsd(b) || !isTracked(b)) return;
      out.offered += perkYearUsd(b);
      var u = entry.used && entry.used[b.id], seen = {};
      if (!u) return;
      dates.forEach(function (d) {
        var p = perkPeriod(b, entry.opened, d);
        if (!p || seen[p.key]) return;
        seen[p.key] = 1;
        var v = u[p.key];
        if (v === true) out.used += b.amount; else if (typeof v === "number" && v > 0) out.used += Math.min(v, b.amount);
      });
    });
    out.used = Math.round(out.used * 100) / 100;
    return out;
  }

  /* ========================= WELCOME BONUS =========================
     entry.bonus = { spend, months, spent, reward }. The deadline is worked out
     from the open date, never stored: "within 3 months of account opening".
     Month-only open date: we use the earliest it could be, and say "about". */
  function bonusState(entry, today) {
    var b = entry && entry.bonus, o = entry && parseOpened(entry.opened);
    if (!b || !o || !(b.spend > 0) || !(b.months > 0)) return null;
    var t = today || todayParts(), mm = o.m + b.months, yy = o.y + Math.floor((mm - 1) / 12), by;
    mm = (mm - 1) % 12 + 1;
    if (o.d) by = { y: yy, m: mm, d: Math.min(o.d, daysInMonth(yy, mm)) };
    else by = addDays({ y: yy, m: mm, d: 1 }, -1);
    var spent = b.spent > 0 ? b.spent : 0, left = Math.max(0, Math.round((b.spend - spent) * 100) / 100);
    var days = dayNum(by.y, by.m, by.d) - dayNum(t.y, t.m, t.d);
    return { spend: b.spend, spent: spent, left: left, by: by, approx: !o.d, days: days, reward: b.reward || "",
      met: left <= 0, missed: left > 0 && days < 0, pct: Math.min(100, Math.round(spent / b.spend * 100)) };
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

  /* ======================= WHICH CARD SHOULD I USE =======================
     For beginners. Pick what you are buying; see which of YOUR cards earns most.
     Ranked by value, not raw multiplier, using the Points Valuations tool's
     cents per point (window.HRT_POINT_VALUES, set by app.js), so 4x Amex
     points and 3% cash back are compared fairly.
     Rules:
       - Chase "cash back" points are worth 1 cent each unless the member also
         holds a Sapphire card (then they transfer and are worth full value).
       - Freedom Flex 5% counts only if this quarter's categories cover it;
         flagged "Activate first" until the member ticks Activated.
       - Conditions (top 2 categories, online only, booking site) are shown.
  ------------------------------------------------------------------- */
  var SPEND = [
    { key: "grocery", label: "Groceries", groups: ["grocery"], words: ["grocery"],
      tip: "Costco, Sam's Club, Walmart and Target usually do not count as grocery stores." },
    { key: "dining", label: "Dining", groups: ["dining"], words: ["dining", "restaurant"] },
    { key: "gas", label: "Gas", groups: ["gas"], words: ["gas"],
      tip: "Gas at Costco or a supermarket often does not count as a gas station." },
    { key: "flights", label: "Flights", groups: ["flights", "travel"], words: [] },
    { key: "hotels", label: "Hotels", groups: ["hotels", "travel"], words: [] },
    { key: "transit", label: "Rideshare and bus", groups: ["transit"], words: ["transit"] },
    { key: "streaming", label: "Streaming", groups: ["streaming"], words: ["streaming"] },
    { key: "drugstores", label: "Drugstores", groups: ["drugstores"], words: ["drugstore"] },
    { key: "ev", label: "EV charging", groups: ["ev"], words: ["ev charging"] },
    { key: "foreign", label: "Shopping abroad", groups: ["foreign"], words: [] },
    { key: "online", label: "Online shopping", groups: ["online"], words: [],
      tip: "Clicking through a shopping portal first, like Shop through Chase or Rakuten, can add extra points on top." },
    { key: "everyday", label: "Everything else", groups: ["everyday"], words: [] }
  ];
  /* Stores members type into "Which card should I use?". Each points at a
     spend type above. Hawaii names first. `visaOnly`: Costco warehouses take
     only Visa. `note` says how banks usually see the store, which decides the
     bonus. Keep notes plain and hedged: banks decide coding, not us. */
  var STORES = [
    { name: "Foodland", spend: "grocery", words: ["foodland", "sack n save", "sack and save"] },
    { name: "Times Supermarket", spend: "grocery", words: ["times supermarket", "times", "big way"] },
    { name: "Safeway", spend: "grocery", words: ["safeway"], note: "Gas at Safeway usually counts as grocery store gas, not a gas station." },
    { name: "KTA Super Stores", spend: "grocery", words: ["kta"] },
    { name: "Down to Earth", spend: "grocery", words: ["down to earth"] },
    { name: "Whole Foods", spend: "grocery", words: ["whole foods"] },
    { name: "Tokyo Central (Marukai)", spend: "grocery", words: ["tokyo central", "marukai"] },
    { name: "Nijiya Market", spend: "grocery", words: ["nijiya"] },
    { name: "Palama Supermarket", spend: "grocery", words: ["palama"] },
    { name: "Mana Foods", spend: "grocery", words: ["mana foods"] },
    { name: "Don Quijote", spend: "grocery", words: ["don quijote", "donki", "don q"],
      note: "We have not confirmed that banks count Don Quijote as a supermarket. Check your statement after your first visit." },
    { name: "Costco", spend: "everyday", words: ["costco"], visaOnly: true,
      note: "Costco warehouses take Visa only. Warehouse clubs do not count as grocery stores, and Costco gas usually is not a gas station." },
    { name: "Sam's Club", spend: "everyday", words: ["sams club", "sams"], note: "Warehouse clubs do not count as grocery stores for most cards." },
    { name: "Walmart", spend: "everyday", words: ["walmart"], note: "Walmart does not count as a grocery store for most cards." },
    { name: "Target", spend: "everyday", words: ["target"], note: "Target does not count as a grocery store for most cards." },
    { name: "Longs Drugs", spend: "drugstores", words: ["longs drugs", "longs", "cvs"], note: "Longs is CVS, so it counts as a drugstore, even when you buy food there." },
    { name: "Walgreens", spend: "drugstores", words: ["walgreens"] },
    { name: "Aloha Petroleum and Minit Stop", spend: "gas", words: ["aloha petroleum", "aloha gas", "minit stop"],
      note: "Pay at the pump. Snacks bought inside may code as a convenience store." },
    { name: "Shell", spend: "gas", words: ["shell"] },
    { name: "Chevron", spend: "gas", words: ["chevron"] },
    { name: "Texaco", spend: "gas", words: ["texaco"] },
    { name: "76", spend: "gas", words: ["76", "union 76"] },
    { name: "Hawaii Gas", spend: "everyday", words: ["hawaii gas"], note: "Hawaii Gas is a utility bill, not a gas station." },
    { name: "Hawaiian Electric", spend: "everyday", words: ["hawaiian electric", "heco"] },
    { name: "Zippy's", spend: "dining", words: ["zippys"] },
    { name: "L&L Hawaiian Barbecue", spend: "dining", words: ["l and l", "l and l hawaiian barbecue"] },
    { name: "Starbucks", spend: "dining", words: ["starbucks"] },
    { name: "McDonald's", spend: "dining", words: ["mcdonalds"] },
    { name: "DoorDash", spend: "dining", words: ["doordash", "door dash"], note: "Restaurant delivery counts as dining on most cards. Grocery orders through DoorDash may not." },
    { name: "Uber Eats", spend: "dining", words: ["uber eats", "ubereats"] },
    { name: "Uber and Lyft rides", spend: "transit", words: ["uber", "lyft"] },
    { name: "Hawaiian Airlines", spend: "flights", words: ["hawaiian airlines", "hawaiian air", "hawaiian"] },
    { name: "Alaska Airlines", spend: "flights", words: ["alaska airlines", "alaska air", "alaska"] },
    { name: "Southwest", spend: "flights", words: ["southwest"] },
    { name: "Hotels", spend: "hotels", words: ["hotel", "hilton", "marriott", "hyatt", "ihg", "outrigger"] },
    { name: "Streaming services", spend: "streaming", words: ["netflix", "disney", "hulu", "spotify", "youtube premium", "max"] },
    { name: "Amazon", spend: "everyday", words: ["amazon"] },
    { name: "Home Depot and Lowe's", spend: "everyday", words: ["home depot", "lowes"] },
    { name: "Ross", spend: "everyday", words: ["ross"] },
    { name: "Ala Moana Center", spend: "everyday", words: ["ala moana"] }
  ];
  function normStore(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  }
  /* Best store for what was typed: an exact name, then "foodland kapolei"
     (name first), then a name that starts with what was typed (3+ letters). */
  function findStore(q) {
    q = normStore(q);
    if (q.length < 2) return null;
    var best = null, top = 0;
    STORES.forEach(function (st) {
      st.words.forEach(function (w) {
        w = normStore(w);
        var sc = q === w ? 1000 + w.length : q.indexOf(w + " ") === 0 ? 500 + w.length :
          (q.length >= 3 && w.indexOf(q) === 0) ? Math.max(1, 100 - (w.length - q.length)) : 0;
        if (sc > top) { top = sc; best = st; }
      });
    });
    return best;
  }
  var CPP_DEFAULT = { "Amex Membership Rewards": 2.0, "Chase Ultimate Rewards": 2.05, "Capital One Miles": 1.85, "Alaska Atmos Rewards": 1.4 };
  function pointValues() {
    var out = {}, src = window.HRT_POINT_VALUES && window.HRT_POINT_VALUES.list;
    Object.keys(CPP_DEFAULT).forEach(function (k) { out[k] = CPP_DEFAULT[k]; });
    (src || []).forEach(function (v) { if (out.hasOwnProperty(v[0]) && v[2] > 0) out[v[0]] = v[2]; });
    return out;
  }
  /* cents of value per point for a currency, given the member's wallet */
  function centsPer(currency, holdsSapphire, vals) {
    var c = String(currency || "");
    if (/status/i.test(c)) return 0;
    if (/cash back/i.test(c)) return holdsSapphire ? vals["Chase Ultimate Rewards"] : 1;
    if (/Ultimate Rewards/.test(c)) return vals["Chase Ultimate Rewards"];
    if (/Membership Rewards/.test(c)) return vals["Amex Membership Rewards"];
    if (/Capital One/.test(c)) return vals["Capital One Miles"];
    if (/Atmos/.test(c)) return vals["Alaska Atmos Rewards"];
    return 1;
  }

  function whichCard(wallet, catalog, spendKey, today, values, opts) {
    var sp = SPEND.filter(function (x) { return x.key === spendKey; })[0];
    if (!sp || !wallet) return [];
    var vals = values || pointValues(), cards = {}, seen = {};
    (catalog.cards || []).forEach(function (c) { cards[c.id] = c; });
    var held = wallet.cards.filter(function (e) { return cards[e.cardId] && isHeld(e); });
    var sapphire = held.some(function (e) { return /^chase-(sapphire|ink-business-preferred)/.test(e.cardId) && e.status !== "next" && e.status !== "closed"; });
    if (opts && opts.visaOnly) held = held.filter(function (e) { return cards[e.cardId].network === "Visa"; });
    var perks = perkRows(wallet, catalog, today);
    var out = [];
    held.forEach(function (e) {
      if (seen[e.cardId]) return; /* two of the same card earn the same */
      seen[e.cardId] = 1;
      var card = cards[e.cardId], rows = earningFor(catalog, e.cardId), best = null;
      function consider(rate, row, extra) {
        var cents = centsPer(row.currency, sapphire, vals), value = rate * cents;
        var cand = { entry: e, card: card, row: row, rate: rate, value: value, rateText: rateText({ rate: rate, currency: row.currency }),
          via: row.via, cap: row.cap, notes: extra || [] };
        if (/top 2/i.test(row.cap)) cand.notes.push("Only if it is one of your top 2 spending categories that month");
        if (row.via && row.groups.indexOf("rotating") < 0) cand.notes.push(row.via.charAt(0).toUpperCase() + row.via.slice(1));
        if (/cash back/i.test(row.currency)) cand.notes.push(sapphire ? "Worth more because you also hold a Sapphire card" : "Cash back, 1 cent per point");
        if (!best || value > best.value + 1e-9 || (Math.abs(value - best.value) < 1e-9 && best.via && !cand.via)) best = cand;
      }
      rows.forEach(function (r) {
        if (r.groups.indexOf("status") > -1 || r.groups.indexOf("promo") > -1) return;
        if (r.groups.some(function (g) { return sp.groups.indexOf(g) > -1; })) consider(r.rate, r);
        if (r.groups.indexOf("rotating") > -1 && sp.words.length) {
          var q = quartersFor(catalog, e.cardId, today).current;
          if (q && sp.words.some(function (w) { return q.categories.toLowerCase().indexOf(w) > -1; })) {
            var act = perks.filter(function (x) { return x.entry.id === e.id && x.perk.type === "activation"; })[0];
            var extra = ["Up to $" + Number(q.cap || 1500).toLocaleString("en-US") + " of spending this quarter"];
            if (act && !act.used) extra.push("Activate first, by " + dayText(act.period.end));
            consider(r.rate, r, extra);
          }
        }
      });
      if (!best) {
        var base = rows.filter(function (r) { return r.groups.indexOf("everyday") > -1; })[0];
        if (base) consider(base.rate, base);
      }
      if (best && spendKey === "foreign" && card.ftf > 0) {
        best.value -= card.ftf;
        best.notes.unshift("Charges a " + card.ftf + "% foreign transaction fee, so it costs more than it earns abroad");
      }
      if (best) out.push(best);
    });
    return out.sort(function (a, b) { return b.value - a.value || a.card.name.localeCompare(b.card.name); });
  }
  function valueText(v) {
    var n = Math.round(v * 10) / 10, a = Math.abs(n), t = a % 1 ? a.toFixed(1) : a;
    return n < 0 ? "costs you about " + t + "% after the fee" : "worth about " + t + "% back";
  }

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
    if (state.loading) return;
    state.loading = true; state.error = null; state.wallet = null; paint();
    if (!store()) { state.loading = false; state.error = { code: "NO_MEMBERSTACK" }; return paint(); }
    whenMemberstack(function () {
      store().load().then(function (w) { state.loading = false; state.wallet = w; state.error = null; paint(); },
        function (e) { state.loading = false; state.wallet = null; state.error = e; paint(); });
    });
  }

  /* optimistic: show the change at once (used for ticks), undo it if the save fails */
  /* Example wallet: lets a new member (or Scottie) see everything working before
     adding their own cards. Lives only in this page; nothing is ever saved. */
  function exampleWallet() {
    var c = function (id, cardId, opened, nickname) { return { id: "ex-" + id, cardId: cardId, opened: opened, nickname: nickname || "" }; };
    var w = { v: 1, points: [], cards: [
      c("plat", "amex-platinum", "2024-03-15"), c("gold", "amex-gold", "2023-06-08"),
      c("csp", "chase-sapphire-preferred", "2021-11-20"), c("flex", "chase-freedom-flex", "2020-01"),
      c("vx", "capone-venture-x", "2022-11-02"), c("summit", "atmos-summit", "2025-08-20"),
      c("ascent", "atmos-ascent", "2019-02")
    ] };
    w.cards.forEach(function (k) { if (k.id === "ex-ascent" || k.id === "ex-flex") k.holder = "Leilani"; });
    w.cards.forEach(function (k) { if (k.id === "ex-vx") k.feeDate = "11-28"; });
    var t = todayParts(), o = addDays(t, -40), csr = c("csr", "chase-sapphire-reserve", o.y + "-" + (o.m < 10 ? "0" : "") + o.m + "-" + (o.d < 10 ? "0" : "") + o.d);
    csr.bonus = { spend: 6000, months: 3, spent: 2350, reward: "100,000 points" };
    w.cards.splice(2, 0, csr);
    /* Venture X renews soon: show what keep or cancel looks like with real ticks */
    var vx = w.cards.filter(function (k) { return k.id === "ex-vx"; })[0];
    vx.used = { travel: {} };
    vx.used.travel["A" + cardYearStart(vx.opened, t).y] = true;
    return w;
  }
  function startExample() { state.demo = true; state.wallet = exampleWallet(); state.editing = null; state.msg = ""; paint(); }
  function endExample() { state.demo = false; state.wallet = null; state.open = {}; state.which = ""; load(); }

  function save(change, done, optimistic) {
    if (state.busy) return;
    if (state.demo) {
      var copy = JSON.parse(JSON.stringify(state.wallet)), out = change(copy);
      state.wallet = out === undefined ? copy : out; if (done) done(); paint();
      return;
    }
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
    var o = entry ? parseOpened(entry.opened) : null, t = todayParts();
    var cu = entry && entry.custom || {};
    var stOpts = '<option value="">No status</option>' + STATUS_ORDER.map(function (k) {
      return '<option value="' + k + '"' + (entry && entry.status === k ? " selected" : "") + ">" + esc(STATUS_LABEL[k]) + "</option>";
    }).join("");
    var months = '<option value="">Month</option>' + MONTHS.map(function (m, i) {
      return '<option value="' + (i + 1) + '"' + (o && o.m === i + 1 ? " selected" : "") + ">" + m + "</option>";
    }).join("");
    var years = '<option value="">Year</option>';
    for (var y = t.y; y >= t.y - 40; y--) years += '<option value="' + y + '"' + (o && o.y === y ? " selected" : "") + ">" + y + "</option>";
    var days = '<option value="">Day (optional)</option>';
    for (var d = 1; d <= 31; d++) days += '<option value="' + d + '"' + (o && o.d === d ? " selected" : "") + ">" + d + "</option>";
    var ec = entry ? cardFor(entry, catIndex()) : null;
    var holders = holderList(state.wallet).filter(Boolean);
    var more = entry && (entry.status || entry.note || entry.feeDate || entry.nickname || entry.withHrt) ? " open" : "";
    return '<form class="wl-form" id="wlForm" novalidate>' +
      '<h3 class="wl-h3">' + (entry ? "Edit card" : "Add a card") + "</h3>" +
      (entry ? '<div class="wl-pick-cur">' + (ec ? artHtml(ec, "sm") : "") + "<b>" + esc(ec ? ec.name : "Card") + "</b></div>" +
        '<input type="hidden" id="wlCard" value="' + esc(entry.cardId) + '">'
      : '<div class="wl-pick"><label class="wl-lab">Which card?<input type="search" id="wlPickQ" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Type a card, like Sapphire or Venture"></label>' +
        '<input type="hidden" id="wlCard" value=""><ul class="wl-pick-list" id="wlPickList">' + pickItems("") + "</ul></div>") +
      '<div class="wl-custom" id="wlCustom"' + (entry && entry.cardId === "custom" ? "" : " hidden") + ">" +
      '<label class="wl-lab">Card name<input id="wlCName" maxlength="60" placeholder="e.g. Chase Ink Business Preferred" value="' + esc(cu.name || "") + '"></label>' +
      '<label class="wl-lab">Bank (optional)<input id="wlCIssuer" maxlength="40" placeholder="e.g. Chase" value="' + esc(cu.issuer || "") + '"></label>' +
      '<label class="wl-lab">Annual fee<span class="wl-dollar">$<input id="wlCFee" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="' + (cu.fee != null ? cu.fee : "") + '"></span></label></div>' +
      '<label class="wl-lab">Whose card (optional)<input id="wlHolder" maxlength="30" list="wlHolders" placeholder="e.g. Marlene" value="' + esc(entry && entry.holder || "") + '"></label>' +
      (holders.length ? '<datalist id="wlHolders">' + holders.map(function (h) { return '<option value="' + esc(h) + '">'; }).join("") + "</datalist>" : "") +
      '<div class="wl-lab">When did you open it?<div class="wl-date">' +
      '<select id="wlMonth" aria-label="Month opened">' + months + "</select>" +
      '<select id="wlDay" aria-label="Day opened">' + days + "</select>" +
      '<select id="wlYear" aria-label="Year opened">' + years + "</select></div>" +
      '<small class="wl-help">Month and year are enough. Not sure? Leave it blank and add it later.</small></div>' +
      '<details class="wl-formmore"' + more + "><summary>More options</summary><div class=\"wl-formmore-in\">" +
      '<label class="wl-lab">Status (optional)<select id="wlStatus">' + stOpts + "</select></label>" +
      '<label class="wl-check"><input type="checkbox" id="wlWithHrt"' + (entry && entry.withHrt ? " checked" : "") + "> Opened with HRT\u2019s help</label>" +
      '<label class="wl-lab">Next step (optional)<textarea id="wlNote" maxlength="500" rows="2" placeholder="e.g. Call Capital One in December to switch to the no-fee VentureOne">' + esc(entry && entry.note || "") + "</textarea></label>" +
      feeDateFields(entry) +
      '<label class="wl-lab">Nickname (optional)<input id="wlNick" maxlength="40" placeholder="e.g. Business card, Spouse\'s card" value="' + esc(entry && entry.nickname || "") + '"></label>' +
      bonusFields(entry) + "</div></details>" +
      '<p class="wl-err" id="wlFormErr" role="alert"></p>' +
      '<div class="wl-acts"><button class="wl-btn wl-pri" type="submit"' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Saving" : entry ? "Save changes" : "Add card") + "</button>" +
      '<button class="wl-btn" type="button" data-wl="cancel">Cancel</button></div></form>';
  }

  /* Card search for Add a card: type "sapphire", "plat" or "venture x". Every word must match. */
  function catIndex() { return catalog().cards.reduce(function (m, k) { m[k.id] = k; return m; }, {}); }
  function pickItems(q) {
    var words = String(q || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    var cur = $("wlCard") ? $("wlCard").value : "";
    var list = catalog().cards.slice().sort(function (a, b) { return a.issuer.localeCompare(b.issuer) || a.name.localeCompare(b.name); })
      .filter(function (c) { var h = (c.issuer + " " + c.name).toLowerCase(); return words.every(function (w) { return h.indexOf(w) > -1; }); });
    var item = function (id, art, name, sub) {
      return '<li><button type="button" class="wl-pick-i' + (cur === id ? " on" : "") + '" data-wl="pick" data-key="' + esc(id) + '">' + art +
        '<span class="wl-pick-t"><b>' + esc(name) + "</b><span>" + esc(sub) + '</span></span><span class="wl-pick-ok" aria-hidden="true">&#10003;</span></button></li>';
    };
    return list.map(function (c) { return item(c.id, artHtml(c, "sm"), c.name, c.issuer + " \u00b7 " + (c.fee ? money(c.fee) + " a year" : "No annual fee")); }).join("") +
      (list.length ? "" : '<li class="wl-pick-none">No match in our card list.</li>') +
      item("custom", '<span class="wl-pick-plus" aria-hidden="true">+</span>', "Other card", "Not on our list? Add it by name");
  }

  function feeDateFields(entry) {
    var m = /^(\d{2})-(\d{2})$/.exec(entry && entry.feeDate || ""), fm = m ? +m[1] : 0, fd = m ? +m[2] : 0;
    var mo = '<option value="">Month</option>' + MONTHS.map(function (x, i) { return '<option value="' + (i + 1) + '"' + (fm === i + 1 ? " selected" : "") + ">" + x + "</option>"; }).join("");
    var dy = '<option value="">Day</option>';
    for (var d = 1; d <= 31; d++) dy += '<option value="' + d + '"' + (fd === d ? " selected" : "") + ">" + d + "</option>";
    return '<div class="wl-lab">Annual fee posts on (optional)<div class="wl-date wl-date2"><select id="wlFMonth" aria-label="Fee month">' + mo + "</select>" +
      '<select id="wlFDay" aria-label="Fee day">' + dy + "</select></div>" +
      "<small class=\"wl-help\">Banks usually bill the fee on the first statement after your card's anniversary. Add it from last year's statement if you know it.</small></div>";
  }
  function bonusFields(entry) {
    var b = entry && entry.bonus || null, mo = b ? b.months : 3, opts = "";
    [1, 2, 3, 4, 5, 6, 9, 12].forEach(function (n) { opts += '<option value="' + n + '"' + (n === mo ? " selected" : "") + ">" + n + (n === 1 ? " month" : " months") + "</option>"; });
    return '<details class="wl-bonusf"' + (b ? " open" : "") + "><summary>Track a welcome bonus (optional)</summary>" +
      '<div class="wl-bonusg"><label class="wl-lab">Spend needed<span class="wl-dollar">$<input id="wlBSpend" type="number" inputmode="decimal" min="0" step="1" placeholder="6000" value="' + (b ? b.spend : "") + '"></span></label>' +
      '<label class="wl-lab">Within<select id="wlBMonths">' + opts + "</select></label>" +
      '<label class="wl-lab">Spent so far<span class="wl-dollar">$<input id="wlBSpent" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="' + (b && b.spent ? b.spent : "") + '"></span></label>' +
      '<label class="wl-lab">Bonus (optional)<input id="wlBReward" maxlength="40" placeholder="e.g. 100,000 points" value="' + esc(b && b.reward || "") + '"></label></div>' +
      '<small class="wl-help">Counted from the day you opened the card. Leave Spend needed empty to stop tracking.</small></details>';
  }
  function readBonus() {
    var sEl = $("wlBSpend");
    if (!sEl) return { bonus: null };
    var raw = sEl.value.trim(), spend = +raw, spent = +($("wlBSpent").value.trim() || 0);
    if (!raw) return { bonus: null };
    if (!(spend > 0) || spend > 1000000) return { err: "Enter the welcome bonus spend as a number, like 6000." };
    if (!(spent >= 0) || spent > 10000000) return { err: "Enter what you have spent so far as a number." };
    var out = { spend: Math.round(spend * 100) / 100, months: +$("wlBMonths").value, spent: Math.round(spent * 100) / 100 };
    var rw = $("wlBReward").value.trim().slice(0, 40);
    if (rw) out.reward = rw;
    return { bonus: out };
  }
  function readForm(entry) {
    var cardId = entry ? entry.cardId : $("wlCard").value;
    var m = +$("wlMonth").value, y = +$("wlYear").value, d = +$("wlDay").value;
    var status = $("wlStatus").value || "";
    if (!cardId) return { err: "Choose which card. Type its name above, then tap it." };
    var custom = null;
    if (cardId === "custom") {
      var nm = $("wlCName").value.trim().slice(0, 60), fr = $("wlCFee").value.trim(), fee = fr ? +fr : 0;
      if (!nm) return { err: "Type the card's name." };
      if (!(fee >= 0) || fee > 10000) return { err: "Enter the annual fee as a number, like 95. Use 0 for no fee." };
      custom = { name: nm, fee: Math.round(fee * 100) / 100 };
      var iss = $("wlCIssuer").value.trim().slice(0, 40);
      if (iss) custom.issuer = iss;
    }
    if ((m && !y) || (y && !m)) return { err: "Choose both the month and the year, or leave both blank." };
    var opened = "";
    if (m && y) {
      if (d && d > daysInMonth(y, m)) return { err: MONTHS[m - 1] + " " + y + " only has " + daysInMonth(y, m) + " days." };
      opened = y + "-" + (m < 10 ? "0" : "") + m + (d ? "-" + (d < 10 ? "0" : "") + d : "");
      if (status !== "next" && isFuture(opened)) return { err: "That date is in the future. For a card you have not opened yet, set Status to Next card." };
    }
    var bn = readBonus();
    if (bn.err) return { err: bn.err };
    var fm = +($("wlFMonth") ? $("wlFMonth").value : 0), fdy = +($("wlFDay") ? $("wlFDay").value : 0), fd = { val: "" };
    if ((fm && !fdy) || (fdy && !fm)) return { err: "For the fee date, choose both the month and the day, or leave both blank." };
    if (fm && fdy) { if (fdy > daysInMonth(2024, fm)) return { err: MONTHS[fm - 1] + " does not have " + fdy + " days." }; fd.val = (fm < 10 ? "0" : "") + fm + "-" + (fdy < 10 ? "0" : "") + fdy; }
    return { cardId: cardId, opened: opened, nickname: $("wlNick").value.trim().slice(0, 40), bonus: bn.bonus, custom: custom,
      holder: $("wlHolder").value.trim().slice(0, 30), status: status, note: $("wlNote").value.trim().slice(0, 500), feeDate: fd.val, withHrt: !!($("wlWithHrt") && $("wlWithHrt").checked) };
  }
  /* Copy the optional fields onto a saved card, dropping empty ones. */
  function applyExtras(c, v) {
    ["holder", "status", "note", "feeDate", "withHrt"].forEach(function (k) { if (v[k]) c[k] = v[k]; else delete c[k]; });
    if (v.custom) c.custom = v.custom;
  }

  /* "5 cards opened with HRT since July 2024": the work the ʻOhana team has done. */
  function hrtLine(w) {
    var mine = (w && w.cards || []).filter(function (e) { return e.withHrt && e.status !== "next"; });
    if (!mine.length) return "";
    var first = mine.map(function (e) { return e.opened || ""; }).filter(Boolean).sort()[0], o = first ? parseOpened(first) : null;
    return '<p class="wl-sum-hrt"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>' +
      mine.length + (mine.length === 1 ? " card" : " cards") + " opened with HRT" + (o ? " since " + MONTHS[o.m - 1] + " " + o.y : "") + "</p>";
  }

  /* ----- list ----- */
  function badge(text, kind) { return '<span class="wl-tag' + (kind ? " " + kind : "") + '">' + esc(text) + "</span>"; }

  function perkTags(b, p) {
    var t = "";
    if (b.enroll === "yes") t += badge("Enroll first");
    if (b.spendGate) t += badge("Needs $" + Number(b.spendGate).toLocaleString("en-US") + " spend");
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
    var src = b.source ? ' <a class="wl-src" href="' + esc(b.source) + '" target="_blank" rel="noopener">Source</a>' : "";
    var foot = b.note ? '<p class="wl-pk-note wl-clamp" data-wl="clamp">' + esc(b.note) + src + "</p>" :
      (src ? '<p class="wl-pk-note">' + src + "</p>" : "");
    return '<li class="wl-pk' + (r.used ? " done" : "") + '"><div class="wl-pk-main">' + head + when +
      partHtml(r) + '<div class="wl-tags">' + perkTags(b, p) + "</div>" + foot + "</div>" + tick + "</li>";
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
        (e.note && !status && e.groups.indexOf("everyday") < 0 && e.groups.indexOf("rotating") < 0 ? '<span class="wl-earn-sub wl-dim wl-clamp" data-wl="clamp">' + esc(e.note) + "</span>" : "") +
        (e.groups.indexOf("rotating") > -1 ? rotatingLine(cardId) : "") +

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
    var opTxt = openedText(e.opened);
    var fdx = r.hasFee ? nextFeeDate(e) : null;
    var renewLine = r.hasFee && rn ? "Renews " + esc(renewalText(rn)) + (fdx ? ", fee posts around " + esc(dayText(fdx)) : "") : r.hasFee ? "Add the date you opened it to see when the fee renews" : opTxt ? "Opened " + esc(opTxt) : "Open date not added";
    var html = '<li class="wl-row' + (soon ? " wl-soon" : "") + '" data-entry="' + esc(e.id) + '"><div class="wl-rowtop">' +
      artHtml(c, "md") + '<div class="wl-main"><b class="wl-name">' + esc(c.name) + "</b>" +
      '<span class="wl-sub">' + esc([e.holder ? e.holder + "\u2019s card" : "", c.issuer, e.nickname].filter(Boolean).join(" \u00b7 ")) + "</span>" +
      '<span class="wl-meta">' + renewLine + (r.hasFee && rn && opTxt ? ' <span class="wl-dot">&middot;</span> Opened ' + esc(opTxt) : "") + "</span>" +
      statusHtml(e) + (e.withHrt ? '<span class="wl-withhrt">Opened with HRT</span>' : e.withHrt === false ? '<span class="wl-prehrt">Had before HRT</span>' : e.addedBy === "hrt" ? '<span class="wl-byhrt">Added by your ʻOhana team</span>' : "") +
      valueLine(credits, other) +
      "</div>" +
      '<div class="wl-side"><span class="wl-fee">' + esc(feeLine) + "</span>" +
      (r.hasFee ? '<span class="wl-when' + (soon ? " on" : "") + '">' + esc(whenText(rn)) + "</span>" : "") +
      '<span class="wl-rowacts"><button class="wl-link" data-wl="edit" data-id="' + esc(e.id) + '">Edit</button>' +
      '<button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></span></div></div>';
    html += noteHtml(e) + bonusHtml(e) + (r.hasFee && rn && rn.days <= SOON_DAYS && !isClient() ? keepHtml(r) : "");
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

  function statusHtml(e) {
    return e.status ? '<span class="wl-status st-' + esc(e.status) + '">' + esc(STATUS_LABEL[e.status] || e.status) + "</span>" : "";
  }
  function noteHtml(e) {
    return e.note ? '<div class="wl-next"><b>Next step</b><span>' + esc(e.note) + "</span></div>" : "";
  }
  /* Planned cards (status "next") and closed cards: listed, never counted. */
  function upcomingHtml(list) {
    if (!list.length) return "";
    return '<div class="wl-card"><div class="wl-head"><h3 class="wl-h3">Next up and closed</h3></div><ul class="wl-list">' + list.map(function (u) {
      var e = u.entry, c = u.card, name = c ? c.name : "A card we no longer track";
      if (e.status === "next" && e.addedBy === "hrt") { name = "Your next card"; c = null; }
      var op = openedText(e.opened);
      return '<li class="wl-row wl-up" data-entry="' + esc(e.id) + '"><div class="wl-rowtop"><div class="wl-main"><b class="wl-name">' + esc(name) + "</b>" +
        '<span class="wl-sub">' + esc([e.holder ? e.holder + "\u2019s card" : "", c && c.issuer, e.nickname].filter(Boolean).join(" \u00b7 ")) + "</span>" +
        (op ? '<span class="wl-meta">' + (e.status === "next" ? "Planned for " : "Opened ") + esc(op) + "</span>" : "") + statusHtml(e) + "</div>" +
        '<div class="wl-side"><span class="wl-rowacts"><button class="wl-link" data-wl="edit" data-id="' + esc(e.id) + '">Edit</button>' +
        '<button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></span></div></div>' + noteHtml(e) + "</li>";
    }).join("") + "</ul></div>";
  }

  function bonusHtml(e) {
    var bs = bonusState(e);
    if (!bs) return "";
    var line, cls = "";
    if (bs.met) { line = "Spend reached: " + money(bs.spent) + " of " + money(bs.spend) + ". Banks usually post the bonus within a few statements."; cls = " done"; }
    else if (bs.missed) { line = "The deadline was " + dayText(bs.by) + ", with " + money(bs.left) + " still to spend. Call the bank if you think you made it."; cls = " missed"; }
    else line = money(bs.spent) + " of " + money(bs.spend) + " spent. <b>" + money(bs.left) + " to go</b> by " + (bs.approx ? "about " : "") +
      dayText(bs.by) + ", " + bs.by.y + " (" + (bs.days === 0 ? "today" : bs.days === 1 ? "1 day" : bs.days + " days") + ").";
    return '<div class="wl-bonus' + cls + '"><div class="wl-bonus-top"><b>Welcome bonus</b>' + (bs.reward ? "<span>" + esc(bs.reward) + "</span>" : "") + "</div>" +
      '<div class="wl-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + bs.pct + '"><i style="width:' + bs.pct + '%"></i></div>' +
      '<p class="wl-bonus-line">' + line.replace(/<(?!\/?b>)/g, "&lt;") + "</p>" +
      (bs.met || bs.missed ? '<button class="wl-link" data-wl="bonus-remove" data-id="' + esc(e.id) + '">Stop tracking</button>' :
        '<div class="wl-bonus-upd"><label>Spent so far <span class="wl-dollar">$<input type="number" inputmode="decimal" min="0" step="1" data-wl-spent value="' + bs.spent + '"></span></label>' +
        '<button class="wl-btn" data-wl="bonus-save" data-id="' + esc(e.id) + '"' + (state.busy ? " disabled" : "") + ">Update</button></div>") + "</div>";
  }
  function keepHtml(r) {
    var e = r.entry, c = r.card, u = usedThisCardYear(e, catalog()), fee = c.fee, pct = Math.min(100, Math.round(u.used / fee * 100));
    var verdict = u.used >= fee ? "Your credits have already covered the fee." :
      "That is " + money(fee - u.used) + " less than the fee" + (u.offered > fee ? ", though the card offers up to " + money(u.offered) + " a year if you use every credit." : ".");
    return '<div class="wl-keep"><b class="wl-keep-h">Keep or cancel?</b>' +
      '<p>This card year you marked <b>' + esc(money(u.used)) + "</b> of credits as used. The fee is <b>" + esc(money(fee)) + "</b>. " + esc(verdict) + "</p>" +
      '<div class="wl-bar"><i style="width:' + pct + '%"></i></div>' +
      "<p>Before it renews you can keep it, ask " + esc(c.issuer) + " for a retention offer, or ask to switch to a card with a lower fee and keep your account history. If you cancel, use or move your points first.</p>" +
      '<p class="wl-dimtxt">Counts the credits you ticked. Lounges, points and other perks are not counted.</p></div>';
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

  /* "Used part of it": a small amount box under a dollar credit. */
  function partHtml(r) {
    var b = r.perk, p = r.period;
    if (!p || r.used || b.unit !== "usd" || !(b.amount >= 5) || !{ credit: 1, discount: 1 }[b.type]) return "";
    var key = r.entry.id + "|" + b.id + "|" + p.key, open = state.partOpen === key;
    var line = r.part ? '<div class="wl-pk-part">Used ' + esc(money(r.part)) + " of " + esc(money(b.amount)) + ", <b>" + esc(money(r.left)) + " left</b></div>" : "";
    if (!open) return line + '<button class="wl-partbtn" data-wl="part" data-k="' + esc(key) + '">' + (r.part ? "Change amount used" : "Used part of it") + "</button>";
    return line + '<div class="wl-partform"><label>Amount used <span class="wl-dollar">$<input type="number" inputmode="decimal" min="0" step="0.01" data-wl-part value="' + (r.part || "") + '" placeholder="' + esc(String(Math.round(b.amount / 2))) + '"></span></label>' +
      '<button class="wl-btn" data-wl="part-save" data-k="' + esc(key) + '" data-max="' + b.amount + '"' + (state.busy ? " disabled" : "") + ">Save</button>" +
      '<button class="wl-link" data-wl="part-cancel">Cancel</button></div>';
  }
  function creditItem(r) {
    var b = r.perk, p = r.period, lvl = p.days <= 7 ? " hot" : p.days <= 14 ? " warm" : "";
    return '<li class="wl-pk' + lvl + '"><div class="wl-pk-main"><div class="wl-pk-top"><b>' + esc(b.label) + "</b>" +
      '<span class="wl-pk-amt">' + esc(b.unit === "usd" ? money(r.part ? r.left : b.amount) + (r.part ? " left" : "") : perkAmount(b)) + "</span></div>" +
      '<div class="wl-pk-when">' + esc(shortName(r.card.name)) + (r.entry.nickname ? " (" + esc(r.entry.nickname) + ")" : "") + " &middot; " +
      (p.activateBy ? "Activate by " : "Use by ") + esc(dayText(p.end)) + (p.approx ? " or earlier" : "") +
      ' <span class="wl-pk-days' + lvl + '">' + esc(daysLeft(p.days)) + "</span></div>" +
      (b.type === "activation" ? rotatingLine(b.card) : "") + partHtml(r) +
      (b.id === "resy" ? '<a class="wl-pk-link" href="#resy" data-route="resy">Find a Hawaiʻi Resy spot &rarr;</a>' : "") +
      '<div class="wl-tags">' + perkTags(b, p) + "</div></div>" +
      '<label class="wl-tick"><input type="checkbox" data-wl="use" data-id="' + esc(r.entry.id) + '" data-perk="' + esc(b.id) +
      '" data-key="' + esc(p.key) + '"' + (state.busy ? " disabled" : "") + "> " + (p.activateBy ? "Activated" : "Used") + "</label></li>";
  }
  function soonHtml(perks, home) {
    var groups = creditGroups(perks);
    if (!groups.length) return home ? '<section class="wl-card wl-soonbox wl-soon-home"><h3 class="wl-cr-title">Credits to use</h3>' +
      '<p class="wl-cr-sub">All caught up. You have used every credit that is open right now.</p></section>' : "";
    var total = groups.reduce(function (a, g) { return a + g.usd; }, 0);
    var sel = groups.filter(function (g) { return g.key === state.creditTab; })[0] || groups[0];
    var tabs = groups.length > 1 ? '<div class="wl-ctabs" role="tablist" aria-label="When they end">' + groups.map(function (g) {
      var on = g === sel;
      return '<button class="wl-ctab' + (on ? " on" : "") + '" role="tab" aria-selected="' + on + '" data-wl="ctab" data-key="' + g.key + '">' +
        "<b>" + esc(g.label) + "</b><span>" + (g.usd ? esc(money(g.usd)) : g.rows.length + (g.rows.length === 1 ? " perk" : " perks")) + "</span></button>";
    }).join("") + "</div>" : "";
    var limit = 4, shown = state.showAllSoon && !home ? sel.rows : sel.rows.slice(0, limit);
    return '<section class="wl-card wl-soonbox' + (home ? " wl-soon-home" : "") + '"><div class="wl-cr-head"><div><h3 class="wl-cr-title">Credits to use</h3>' +
      '<p class="wl-cr-sub">' + (home ? "Soonest first. Tick each one once you use it." : "Everything you have not used yet, soonest first. Tick each one once you use it.") + "</p></div>" +
      (total ? '<div class="wl-cr-total"><b>' + esc(money(total)) + "</b><span>left to use</span></div>" : "") + "</div>" + tabs +
      '<ul class="wl-pks wl-pks-soon">' + shown.map(creditItem).join("") + "</ul>" +
      (home ? (sel.rows.length > limit ? '<a class="wl-hm-more" href="#wallet" data-route="wallet">See all ' + sel.rows.length + " in My Wallet</a>" : "") :
        sel.rows.length > limit ? '<button class="wl-perkbtn" data-wl="allsoon">' + (state.showAllSoon ? "Show fewer" : "Show all " + sel.rows.length) + "</button>" : "") +
      "</section>";
  }

  function datesHtml(list) {
    if (!list.length) return "";
    var shown = state.showAllDates ? list : list.slice(0, 7);
    var KIND = { renew: "Renewal", fee: "Annual fee", bonus: "Welcome bonus", activate: "Activate", credit: "Credits" };
    return '<section class="wl-card wl-dates"><div class="wl-head"><h3 class="wl-h3">Important dates</h3><span class="wl-dimtxt">Next 90 days</span></div>' +
      '<ol class="wl-dl">' + shown.map(function (x) {
        return '<li class="wl-dli k-' + x.kind + '"><span class="wl-dlday"><b>' + x.date.d + "</b><span>" + SHORT_MONTHS[x.date.m - 1] + "</span></span>" +
          '<span class="wl-dlbody"><span class="wl-dlkind">' + KIND[x.kind] + "</span><span class=\"wl-dltext\">" + esc(x.text) +
          (x.usd ? ' <b class="wl-dlusd">' + esc(money(x.usd)) + "</b>" : "") + "</span></span>" +
          '<span class="wl-dlwhen' + (x.days <= 7 ? " hot" : x.days <= 14 ? " warm" : "") + '">' + (x.days === 0 ? "Today" : x.days === 1 ? "Tomorrow" : "In " + x.days + " days") + "</span></li>";
      }).join("") + "</ol>" +
      (list.length > 7 ? '<button class="wl-perkbtn" data-wl="alldates">' + (state.showAllDates ? "Show fewer" : "Show all " + list.length) + "</button>" : "") + "</section>";
  }


  /* ===================== MINI WALLET (Dashboard top right tile) =====================
     Small on purpose: one headline number, three facts, and the next three things
     to act on. Everything else lives on the My Wallet page. */
  var miniHost;
  function miniHtml() {
    var head = function (link) {
      var cl = member().client;
      return '<div class="wlm-head"><h2 class="wlm-title">' + (cl ? '<span class="wlm-ow">' + OH_STAR + "</span>Your ʻOhana Wallet" : "Your wallet") + "</h2>" +
        (link ? '<a class="wlm-open" href="#wallet" data-route="wallet">' + (cl ? "Open" : "Open My Wallet") + ' <span aria-hidden="true">&rsaquo;</span></a>' : "") + "</div>";
    };
    if (state.error) return head(true) + '<p class="wlm-lede">' + esc(errText(state.error)) + "</p>" +
      (state.error.code === "READ_FAILED" ? '<div class="wlm-acts"><button class="wl-btn" data-wl="retry">Try again</button></div>' : "");
    if (!state.wallet) return head(false) + '<p class="wlm-lede">Loading your wallet</p>';
    var V = view(), s = summarize(V, catalog());
    var demo = state.demo ? '<div class="wlm-demo"><span>Example wallet. Nothing is saved.</span><button class="wlm-x" data-wl="demo-off">Use my own cards</button></div>' : "";
    if (!s.count) {
      return head(false) +
        '<p class="wlm-big wlm-big-empty">Never miss a card credit again</p>' +
        '<ul class="wlm-points"><li>Every annual fee and renewal date</li><li>Credits to use before they reset</li><li>Which card to use at Foodland, Costco and more</li></ul>' +
        '<div class="wlm-acts"><button class="wl-btn wl-gold" data-wl="go-add">Add your cards</button>' +
        '<button class="wl-btn wl-ghost" data-wl="demo">See an example</button></div>' +
        '<p class="wlm-foot">Free with your account. We never ask for card numbers.</p>';
    }
    var perks = perkRows(V, catalog());
    var soon = expiringSoon(perks, SOON_PERK_DAYS);
    var due = soon.reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.left : 0); }, 0);
    var nx = s.next;
    var html = demo + head(true) + '<div class="wlm-hero">' +
      (due ? '<span class="wlm-big">' + esc(money(due)) + '</span><span class="wlm-cap">in credits to use in the next ' + SOON_PERK_DAYS + " days</span>"
           : '<span class="wlm-big wlm-ok">All caught up</span><span class="wlm-cap">No credits end in the next ' + SOON_PERK_DAYS + " days</span>") + "</div>" +
      '<dl class="wlm-stats"><div><dt>Cards</dt><dd>' + s.count + "</dd></div>" +
      "<div><dt>Annual fees</dt><dd>" + esc(money(s.yearly)) + "</dd></div>" +
      "<div><dt>Next renewal</dt><dd>" + (nx ? esc(nx.renewal.exact ? dayText(nx.renewal) : SHORT_MONTHS[nx.renewal.m - 1]) : "None") + "</dd></div></dl>";
    /* Up next: renewals, welcome bonus deadlines and activations first (they are not
       in the credit list), then the soonest credits, three rows in all. */
    var alerts = topAlerts(V, catalog(), null, 6).filter(function (a) { return a.level === "warn" || (a.level === "hot" && /welcome bonus/.test(a.text)); }).slice(0, 2);
    var credits = soon.filter(function (r) { return r.perk.type !== "activation"; }).slice(0, Math.max(1, 3 - alerts.length));
    var rows = alerts.map(function (a) {
      return '<li><button class="wlm-row ' + a.level + '" ' + (a.id ? 'data-wl="go-card" data-id="' + esc(a.id) + '"' : 'data-wl="go-wallet"') + '>' +
        '<span class="wlm-dot" aria-hidden="true"></span><span class="wlm-txt">' + esc(a.text.replace(/ fee posts around .*$/, " fee")) + '</span><span class="wlm-go" aria-hidden="true">&rsaquo;</span></button></li>';
    }).concat(credits.map(function (r) {
      var b = r.perk, p = r.period, lvl = p.days <= 7 ? " hot" : p.days <= 14 ? " warn" : "";
      return '<li class="wlm-cr' + lvl + '"><span class="wlm-dot" aria-hidden="true"></span><span class="wlm-txt"><b>' + esc(shortName(r.card.name)) + " " + esc(b.label) +
        (b.unit === "usd" ? " " + esc(money(r.part ? r.left : b.amount)) : "") + "</b><small>" + esc(daysLeft(p.days)) + ", use by " + esc(dayText(p.end)) + "</small></span>" +
        '<label class="wlm-tick"><input type="checkbox" data-wl="use" data-id="' + esc(r.entry.id) + '" data-perk="' + esc(b.id) + '" data-key="' + esc(p.key) + '"' +
        (state.busy ? " disabled" : "") + "> Used</label></li>";
    }));
    if (rows.length) html += '<h3 class="wlm-sub">Up next</h3><ul class="wlm-list">' + rows.join("") + "</ul>";
    if (state.msg) html += '<p class="wlm-msg" role="alert">' + esc(state.msg) + "</p>";
    return html;
  }
  function paintMini() {
    if (miniHost) miniHost.innerHTML = miniHtml();
    var th = document.getElementById("wl-tips-home");
    if (th) th.innerHTML = state.wallet && !state.error ? tipsHtml(true) : "";
  }
  function paint() {
    paintMain(); paintHome(); paintAlerts(); paintMini();
    /* tell the other tools (Transfer Bonuses, Resy, Lounges) the wallet changed; see connect.js */
    try { window.dispatchEvent(new Event("hrt:wallet")); } catch (e) {}
  }

  /* ----- Links to the other tools (connect.js) ----- */
  /* The member's held cards and their open perks, as plain data for connect.js. */
  function connectData() {
    if (!state.wallet) return null;
    var V = view(), cat = catalog();
    var held = summarize(V, cat).rows.filter(function (r) { return r.card && !r.card.custom; }).map(function (r) {
      return { cardId: r.entry.cardId, name: r.card.name, short: shortName(r.card.name) };
    });
    var perks = perkRows(V, cat).filter(function (r) { return r.period; }).map(function (r) {
      return { cardId: r.entry.cardId, cardShort: shortName(r.card.name), perkId: r.perk.id, label: r.perk.label,
        amount: r.part ? r.left : r.perk.amount, unit: r.perk.unit, used: !!r.used, endText: dayText(r.period.end), days: r.period.days };
    });
    return { demo: !!state.demo, held: held, perks: perks, client: !!member().client };
  }
  var TIP_ICON = {
    transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    resy: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 3c-2 2-2 6 0 8v10"/>',
    lounge: '<path d="M4 18v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5M4 18h16M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/>',
    atmos: '<path d="M3 15l7-2 4-8 2 1-2 7 6 1 1 2-8 1-5 5-2-1 2-4-5-1z"/>'
  };
  function connectTips() {
    var C = window.HRT_CONNECT, d = connectData();
    if (!C || !d) return [];
    return C.tips(d, catalog().earning, window.HRT_TB_LIVE || [], window.HRT_LOUNGES || []);
  }
  /* "For your cards": where this wallet meets the other tools. Home shows the top 3. */
  function tipsHtml(home) {
    var all = connectTips(), list = all;
    if (home) { /* a mix on the Dashboard: one of each kind first, then the rest, in order */
      var seen = {}, first = all.filter(function (t) { if (seen[t.kind]) return false; seen[t.kind] = 1; return true; });
      list = first.concat(all.filter(function (t) { return first.indexOf(t) < 0; })).slice(0, 3);
      list.sort(function (a, b) { return all.indexOf(a) - all.indexOf(b); });
    }
    if (!list.length) return "";
    return '<section class="wl-card wl-tips"><div class="wl-head"><h3 class="wl-h3">For your cards</h3>' +
      '<span class="wl-dimtxt">From our other tools</span></div><ul class="wl-tiplist">' + list.map(function (t) {
        var a = t.action || {};
        return '<li class="wl-tip k-' + esc(t.kind) + '"><span class="wl-tip-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          (TIP_ICON[t.kind] || "") + '</svg></span><span class="wl-tip-body"><b>' + esc(t.title) + "</b><span>" + esc(t.text) + "</span>" +
          '<a class="wl-tip-go" href="#' + esc(a.route) + '" data-cx-go="' + esc(a.route) + '"' +
          (a.bank ? ' data-cx-bank="' + esc(a.bank) + '"' : "") + (a.bonus ? ' data-cx-bonus="' + esc(a.bonus) + '"' : "") +
          (a.lounges ? ' data-cx-lounges="' + esc(a.lounges.join(",")) + '"' : "") + ">" + esc(a.label) + " &rarr;</a></span></li>";
      }).join("") + "</ul>" + (home && all.length > 3 ? '<a class="wl-hm-more" href="#wallet" data-route="wallet">See all ' + all.length + " in My Wallet</a>" : "") + "</section>";
  }
  if (window.addEventListener) window.addEventListener("hrt:bonuses", function () { try { paintMain(); paintHome(); paintMini(); } catch (e) {} });

  /* ----- Dashboard home panel: totals and the next credits to use ----- */
  var homeHost;
  function paintHome() {
    if (!homeHost) return;
    var head = '<div class="wl-hm-head"><div><h2 class="wl-hm-h">Your cards</h2>';
    if (state.error) {
      homeHost.innerHTML = '<div class="wl-card wl-hm">' + head + "<p class=\"wl-hm-sub\">" + esc(errText(state.error)) + "</p></div>" +
        (state.error.code === "READ_FAILED" ? '<button class="wl-btn" data-wl="retry">Try again</button>' : "") + "</div></div>";
      return;
    }
    if (!state.wallet) { homeHost.innerHTML = '<div class="wl-card wl-hm">' + head + '<p class="wl-hm-sub">Loading your wallet</p></div></div></div>'; return; }
    var V = view(), s = summarize(V, catalog());
    if (!s.count) { homeHost.innerHTML = ""; return; } /* the summary card above invites them to start */
    var perks = perkRows(V, catalog());
    var soon = expiringSoon(perks, SOON_PERK_DAYS);
    var html = '<div class="wl-hm-grid"><div class="wl-card wl-hm"><div class="wl-hm-head"><h2 class="wl-hm-h">Your cards</h2>' +
      '<a class="wl-link" href="#wallet" data-route="wallet">See all details</a></div>';
    html += tilesHtml(s, perks);
    html += whichHtml();
    if (state.msg) html += '<p class="wl-banner" role="alert">' + esc(state.msg) + "</p>";
    html += "</div>" + soonHtml(perks, true) + "</div>";
    homeHost.innerHTML = html;
  }

  /* The swipeable card tiles, used on the Dashboard and the My Wallet page. */
  /* Grid or list for the card tiles on the My Wallet tab, remembered per browser. */
  function cardView() {
    if (!state.cardView) { try { state.cardView = localStorage.getItem("hrt-wl-view") === "list" ? "list" : "grid"; } catch (e) { state.cardView = "grid"; } }
    return state.cardView;
  }
  var GRID_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>';
  var LIST_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/></svg>';
  function viewToggle() {
    var v = cardView();
    return '<div class="wl-view" role="group" aria-label="Show cards as">' +
      '<button class="wl-view-b' + (v === "grid" ? " on" : "") + '" data-wl="view" data-key="grid" aria-pressed="' + (v === "grid") + '">' + GRID_ICON + "<span>Grid</span></button>" +
      '<button class="wl-view-b' + (v === "list" ? " on" : "") + '" data-wl="view" data-key="list" aria-pressed="' + (v === "list") + '">' + LIST_ICON + "<span>List</span></button></div>";
  }
  function tilesHtml(s, perks, view) {
    return '<div class="wl-tiles' + (view === "list" ? " wl-tiles-list" : "") + '">' + s.rows.map(function (row) {
      var e = row.entry, c = row.card;
      if (!c) return "";
      var bf = cardBrief(e, c, perks);
      var lines = '<span class="wl-tl-fee">' + (bf.hasFee && !bf.renewal ? esc(money(c.fee)) + " fee" : bf.hasFee ? esc(money(c.fee)) + " fee &middot; renews " + esc(bf.renewal.exact ? dayText(bf.renewal) : MONTHS[bf.renewal.m - 1].slice(0, 3)) : "No annual fee") + "</span>";
      if (bf.next) lines += '<span class="wl-tl-next">Next: ' + esc(bf.next.perk.label) + esc(shortAmount(bf.next.perk)) + ', <b class="' + (bf.next.period.days <= 14 ? "hot" : "") + '">' + esc(daysLeft(bf.next.period.days).replace(" left", "")) + "</b></span>";
      else if (perks.some(function (r) { return r.entry.id === e.id && r.period; })) lines += '<span class="wl-tl-next ok">All credits used this period</span>';
      var pills = "";
      if (bf.activate) pills += '<span class="wl-tl-pill">Activate 5% by ' + esc(dayText(bf.activate.period.end)) + "</span>";
      if (bf.renewSoon) pills += '<span class="wl-tl-pill">Renews in ' + bf.renewal.days + (bf.renewal.days === 1 ? " day" : " days") + "</span>";
      var bsT = bonusState(e);
      if (bsT && !bsT.met && !bsT.missed) pills += '<span class="wl-tl-pill">Bonus: ' + esc(money(bsT.left)) + " to go</span>";
      if (e.withHrt) pills += '<span class="wl-tl-pill hrt">Opened with HRT</span>';
      if (bf.open > 1) pills += '<span class="wl-tl-pill soft">' + bf.open + " credits open</span>";
      return '<button class="wl-tile" data-wl="go-card" data-id="' + esc(e.id) + '">' + artHtml(c, "sm") +
        '<span class="wl-tl-body"><span class="wl-tl-name">' + esc(shortName(c.name)) + "</span>" +
        (e.nickname || e.holder ? '<span class="wl-tl-nick">' + esc([e.holder, e.nickname].filter(Boolean).join(" · ")) + "</span>" : "") +
        (e.status && e.status !== "keep" ? '<span class="wl-tl-status st-' + esc(e.status) + '">' + esc(STATUS_LABEL[e.status] || "") + "</span>" : "") + lines +
        (pills ? '<span class="wl-tl-pills">' + pills + "</span>" : "") + "</span></button>";
    }).join("") + "</div>";
  }

  /* Family filter: show one person's cards, using "Whose card". Cards with no
     name are the member's own ("You"). Only shown when 2 or more people. */
  function holderOf(e) { return (e.holder || "").trim(); }
  function holderList(w) {
    var seen = {}, out = [];
    (w && w.cards || []).forEach(function (e) { var h = holderOf(e); if (!seen[h]) { seen[h] = 1; out.push(h); } });
    return out.sort(function (a, b) { return a === "" ? -1 : b === "" ? 1 : a.localeCompare(b); });
  }
  function view() {
    var w = state.wallet;
    if (!w || state.holder == null) return w;
    if (holderList(w).indexOf(state.holder) < 0) { state.holder = null; return w; }
    var o = {}; Object.keys(w).forEach(function (k) { o[k] = w[k]; });
    o.cards = w.cards.filter(function (e) { return holderOf(e) === state.holder; });
    return o;
  }
  function famHtml() {
    var hs = holderList(state.wallet);
    if (hs.length < 2) return "";
    var chip = function (key, label) {
      var on = key === null ? state.holder == null : state.holder === key;
      return '<button class="wl-fam-b' + (on ? " on" : "") + '" data-wl="fam"' + (key === null ? "" : ' data-key="' + esc(key) + '"') + ' aria-pressed="' + on + '">' + esc(label) + "</button>";
    };
    return '<div class="wl-fam" role="group" aria-label="Whose cards">' + chip(null, "Everyone") +
      hs.map(function (h) { return chip(h, h || "You"); }).join("") + "</div>";
  }
  function exampleBanner() {
    return state.demo ? '<div class="wl-demo"><span><b>Example wallet.</b> Try anything; nothing here is saved.</span>' +
      '<button class="wl-btn" data-wl="demo-off">Use my own cards</button></div>' : "";
  }

  function whichHtml() {
    var cards = state.wallet && state.wallet.cards.length;
    if (!cards) return "";
    var k = whichKey();
    var chips = SPEND.map(function (x) {
      return '<button class="wl-chip' + (x.key === k ? " on" : "") + '" data-wl="which" data-key="' + x.key + '" aria-pressed="' + (x.key === k) + '">' + esc(x.label) + "</button>";
    }).join("");
    return '<div class="wl-wc"><h3 class="wl-h4 wl-wc-h">Which card should I use?</h3>' +
      '<label class="wl-store"><span class="wl-sr">Where are you shopping?</span>' +
      '<input type="search" data-wl-store autocomplete="off" enterkeyhint="search" spellcheck="false" placeholder="Type a store, like Foodland or Costco" value="' + esc(state.storeQ || "") + '"></label>' +
      '<div class="wl-chips" role="group" aria-label="Or pick what you are buying">' + chips + "</div>" +
      '<div class="wl-wc-out" aria-live="polite">' + whichOut() + "</div></div>";
  }
  /* The spend type in play: a recognised store wins over a tapped chip. */
  function whichKey() {
    var st = state.storeQ ? findStore(state.storeQ) : null;
    return st ? st.spend : state.storeQ ? "" : state.which || "";
  }
  function whichOut() {
    var st = state.storeQ ? findStore(state.storeQ) : null, k = whichKey();
    if (state.storeQ && !st) {
      return normStore(state.storeQ).length < 2 ? '<p class="wl-wc-foot">Keep typing a store name.</p>' :
        '<p class="wl-wc-foot">We do not know that store yet. Tap what you are buying instead.</p>';
    }
    if (!k) return '<p class="wl-wc-foot">Type a store, or tap what you are buying.</p>';
    var sp = SPEND.filter(function (x) { return x.key === k; })[0];
    var list = whichCard(view(), catalog(), k, null, null, { visaOnly: st && st.visaOnly });
    var tip = st ? st.note : sp.tip, res = "";
    if (!list.length) {
      res = '<div class="wl-wc-res"><p class="wl-wc-why">' + (st && st.visaOnly ? "None of your cards are Visa, and " + esc(st.name) + " takes Visa only." : "None of your cards fit this.") + "</p></div>";
    } else {
      var top = list[0];
      var on = top.row.groups.indexOf("everyday") > -1 ? "everything" :
        top.row.groups.indexOf("rotating") > -1 ? sp.label.toLowerCase() + " this quarter" : top.row.category.charAt(0).toLowerCase() + top.row.category.slice(1);
      res = '<div class="wl-wc-res"><div class="wl-wc-top">' + artHtml(top.card, "sm") + '<div class="wl-wc-best"><span class="wl-wc-tag">' + (st ? "At " + esc(st.name) + ", use" : "Use this card") + "</span>" +
        '<b class="wl-wc-name">' + esc(shortName(top.card.name)) + (top.entry.nickname ? ' <span class="wl-dim">(' + esc(top.entry.nickname) + ")</span>" : "") + "</b>" +
        '<span class="wl-wc-why"><b>' + esc(top.rateText) + "</b> on " + esc(on) + ", " + esc(valueText(top.value)) + "</span>" +
        (top.notes.length ? '<span class="wl-wc-notes">' + top.notes.map(esc).join(". ") + "</span>" : "") + "</div></div>" +
        (list.length > 1 ? '<ol class="wl-wc-rest" start="2">' + list.slice(1, 4).map(function (c) {
          return "<li><b>" + esc(shortName(c.card.name)) + "</b> " + esc(c.rateText) + ", " + esc(valueText(c.value)) +
            (c.notes.length ? ' <span class="wl-dim">(' + esc(c.notes[0]) + ")</span>" : "") + "</li>";
        }).join("") + "</ol>" : "") + "</div>";
    }
    var upd = window.HRT_POINT_VALUES && window.HRT_POINT_VALUES.updated;
    return res + (tip ? '<p class="wl-wc-tip">' + esc(tip) + "</p>" : "") +
      '<p class="wl-wc-foot">Ranked by value using HRT point values' + (upd ? " (" + esc(upd) + ")" : "") + '. <a href="#values" data-route="values">How we value points</a></p>';
  }
  /* Typing a store updates only the answer, so the keyboard stays open. */
  function onInput(ev) {
    var t = ev.target;
    if (t && t.id === "wlCardQ") {
      state.cardQ = t.value;
      var q = t.value.trim().toLowerCase(), shown = 0;
      Array.prototype.forEach.call(host.querySelectorAll("[data-ct-q]"), function (r) {
        var hit = !q || r.getAttribute("data-ct-q").indexOf(q) > -1; r.hidden = !hit; if (hit) shown++;
      });
      var n = $("wlCardN"); if (n) n.textContent = shown + (shown === 1 ? " card" : " cards");
      return;
    }
    if (t && t.id === "wlPickQ") { var pl = $("wlPickList"); if (pl) pl.innerHTML = pickItems(t.value); return; }
    if (!t || !t.hasAttribute || !t.hasAttribute("data-wl-store")) return;
    state.storeQ = t.value;
    var wc = t.closest(".wl-wc"); if (!wc) return;
    wc.querySelector(".wl-wc-out").innerHTML = whichOut();
    var k = whichKey();
    Array.prototype.forEach.call(wc.querySelectorAll(".wl-chip"), function (c) {
      var on = c.getAttribute("data-key") === k;
      c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on));
    });
  }

  /* The wallet summary card: the first thing a member sees, on the Dashboard
     (under the Aloha greeting) and at the top of My Wallet. */
  /* ----- HRT clients vs everyone else -----
     Clients (HRT_MEMBER.client, set from a plan only HRT assigns) see that our
     team keeps their wallet up to date. Everyone else sees one quiet offer of
     help picking their next card; a yes is saved on their Memberstack profile
     (custom field wants-card-help) so HRT can follow up. */
  var HELP_KEY = "hrtCardHelpHidden", HELP_DAYS = 60;
  function member() { return window.HRT_MEMBER || {}; }
  /* ʻOhana Members: Scottie decides keep or cancel with them, so the self-serve box is hidden. */
  function isClient() { return document.documentElement.classList.contains("ms-client"); }
  function helpHidden() {
    try { var t = +localStorage.getItem(HELP_KEY); return t && Date.now() - t < HELP_DAYS * 864e5; } catch (e) { return false; }
  }
  /* ʻOhana header (Oct 17): navy with a gold edge and star. "Member since", "Your strategy" and
     "Last review" come from Member metaData that only HRT edits (see HRT_MEMBER.ohana in index.html);
     each line is left out when it is blank. Never name team members other than Scottie here. */
  var OH_STAR = '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7.5-6.5-4-6.5 4 2-7.5L2 9.5 9 9z" fill="currentColor"/></svg>';
  function ohanaDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    if (!m) return v || "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function clientHtml() {
    var m = member(), o = m.ohana || {};
    var name = String(m.firstName || "").trim();
    return '<div class="wl-oh" role="note">' +
      '<div class="wl-oh-top"><span class="wl-oh-star">' + OH_STAR + '</span>' +
      '<span class="wl-oh-eyebrow">ʻOhana Member' + (o.since ? " since " + esc(o.since) : "") + "</span></div>" +
      '<p class="wl-oh-hi">' + (name ? "Aloha, " + esc(name) : "Aloha") + "</p>" +
      '<p class="wl-oh-txt">Your wallet is guided by Scottie and the HRT team. We help manage your cards and build your strategy with you. Opened a new card? Text Scottie and we will add it.</p>' +
      (o.strategy ? '<div class="wl-oh-box"><span>Your strategy</span><b>' + esc(o.strategy) + "</b></div>" : "") +
      (o.review ? '<p class="wl-oh-rev">Last review: ' + esc(ohanaDate(o.review)) + "</p>" : "") +
      "</div>";
  }
  function helpHtml(where) {
    var m = member();
    if (!m.signedIn || m.client || state.demo) return "";
    if (state.helpSent || m.wantsHelp) {
      return where === "home" ? "" : '<div class="wl-card wl-help done"><b>Thanks, we will be in touch.</b><span>Scottie will reach out to welcome you to the ʻOhana program. ' +
        '<a href="' + esc(COACH_URL) + '" target="_top">See how the program works &rarr;</a></span></div>';
    }
    if (helpHidden()) return "";
    return '<div class="wl-card wl-help"><div><span class="wl-help-eyebrow">' + OH_STAR + ' The ʻOhana Wallet</span>' +
      '<b>Want Scottie to manage your wallet for you?</b>' +
      '<ul class="wl-help-pts"><li>ʻOhana Members get the ʻOhana Wallet: we keep your cards up to date for you</li>' +
      '<li>Your own card strategy, and help picking your next best card</li>' +
      '<li>Help hitting every welcome bonus, with a text from Scottie when it is time</li></ul></div>' +
      '<div class="wl-help-acts"><button class="wl-btn wl-pri" data-wl="help-yes"' + (state.busy ? " disabled" : "") + '>Join the ʻOhana program</button>' +
      '<button class="wl-link" data-wl="help-no">Not now</button></div></div>';
  }
  function askForHelp() {
    var ms = window.$memberstackDom;
    state.helpSent = true; paint();
    if (ms && typeof ms.updateMember === "function") {
      Promise.resolve(ms.updateMember({ customFields: { "wants-card-help": "yes" } })).catch(function () {});
    }
    try { window.open(COACH_URL, "_blank", "noopener"); } catch (e) {}
  }

  function summaryHtml(where) {
    var core = summaryCore(where);
    if (!core) return "";
    if (member().client) core = core.replace(/<section([^>]*)>/, function (all, attrs) {
      return "<section" + attrs.replace(/class="/, 'class="wl-sum-oh ') + ">" + clientHtml();
    });
    return core + helpHtml(where);
  }
  function summaryCore(where) {
    var home = where === "home";
    if (!state.wallet || state.error) return "";
    var V = view(), s = summarize(V, catalog());
    var title = home ? "Your wallet" : "My Wallet";
    if (!s.count) {
      return '<section class="wl-sum wl-sum-empty" aria-label="' + title + '">' + exampleBanner() +
        '<h2 class="wl-sum-title">' + title + "</h2>" +
        '<p class="wl-sum-lede">Add the cards you hold and see, in one place, what each one costs, what it gives back, and which credits to use before they reset.</p>' +
        '<div class="wl-sum-acts"><button class="wl-btn wl-gold" data-wl="' + (home ? "go-add" : "add") + '">Add your cards</button>' +
        '<button class="wl-btn wl-ghost" data-wl="demo">See an example</button></div></section>';
    }
    var perks = perkRows(V, catalog());
    var credits = perks.reduce(function (t, r) { return t + perkYearUsd(r.perk); }, 0);
    var soon = expiringSoon(perks, SOON_PERK_DAYS);
    var due = soon.reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.left : 0); }, 0);
    var later = expiringSoon(perks, 100000).filter(function (r) { return r.perk.unit === "usd"; });
    var laterUsd = later.reduce(function (t, r) { return t + r.left; }, 0);
    var alerts = topAlerts(V, catalog()).filter(function (a) { return a.level !== "info"; });
    var nx = s.next;
    var stat = function (label, value, sub) {
      return '<div class="wl-sum-stat"><dt>' + label + "</dt><dd>" + value + (sub ? "<small>" + sub + "</small>" : "") + "</dd></div>";
    };
    var html = '<section class="wl-sum" aria-label="' + title + '">' + exampleBanner() +
      '<div class="wl-sum-top"><h2 class="wl-sum-title">' + title + "</h2>" +
      (home ? '<a class="wl-btn wl-ghost" href="#wallet" data-route="wallet">Open My Wallet</a>'
            : (state.editing ? "" : '<button class="wl-btn wl-ghost" data-wl="add">Add a card</button>')) + "</div>" + famHtml() +
      hrtLine(V) +
      '<div class="wl-sum-hero">' +
      (due ? '<span class="wl-sum-big">' + esc(money(due)) + '</span><span class="wl-sum-cap">in credits to use in the next ' + SOON_PERK_DAYS + " days</span>"
           : laterUsd ? '<span class="wl-sum-big">' + esc(money(laterUsd)) + '</span><span class="wl-sum-cap">in credits left to use. Nothing ends in the next ' + SOON_PERK_DAYS + " days; the next one ends " + esc(dayText(later[0].period.end)) + "</span>"
           : '<span class="wl-sum-big wl-sum-ok">All caught up</span><span class="wl-sum-cap">You have used every credit that is open right now</span>') +
      "</div>" +
      '<dl class="wl-sum-stats">' +
      stat("Cards", String(s.count)) +
      stat("Annual fees", esc(money(s.yearly))) +
      stat("Credits a year", esc(money(credits)), "if you use them all") +
      stat("Next renewal", nx ? esc(nx.renewal.exact ? dayText(nx.renewal) : SHORT_MONTHS[nx.renewal.m - 1]) : "None",
        nx ? esc(shortName(nx.card.name)) : "") +
      "</dl>";
    if (s.yearly > 0 && credits > 0) {
      /* Plain sentence instead of a bar: Scottie found the fees vs credits bar hard to read. */
      var diff = credits - s.yearly;
      var line = diff >= 0
        ? "Use every credit and you get back " + money(credits) + " a year, " + money(diff) + " more than the " + money(s.yearly) + " you pay in fees."
        : "Your credits add up to " + money(credits) + " a year, " + money(-diff) + " less than the " + money(s.yearly) + " you pay in fees.";
      html += '<div class="wl-sum-meter"><p class="wl-sum-verdict ' + (diff >= 0 ? "up" : "down") + '">' + esc(line) + '</p>' +
        '<p class="wl-sum-note">Lounge passes, companion fares and points are on top of that.</p></div>';
    }
    if (alerts.length) {
      html += '<ul class="wl-sum-alerts" aria-label="Needs your attention">' + alerts.map(function (a) {
        return '<li><button class="wl-sum-al ' + a.level + '" ' + (a.id ? 'data-wl="go-card" data-id="' + esc(a.id) + '"' : 'data-wl="go-wallet"') + ">" +
          '<span class="wl-sum-dot" aria-hidden="true"></span><span>' + esc(a.text) + '</span><span class="wl-sum-go" aria-hidden="true">&rsaquo;</span></button></li>';
      }).join("") + "</ul>";
    }
    return html + "</section>";
  }

  var alertHost;
  function paintAlerts() {
    if (!alertHost) return;
    alertHost.innerHTML = summaryHtml("home");
  }

  /* ===================== MY WALLET PAGE, simple layout (Oct 19) =====================
     Marlene's feedback: too much on one page, and fixing a card should be easy. The page
     is now a slim header, one list of cards and the credits to use. Everything about one
     card opens in a card sheet; the extra tools fold away under "More". */
  var REVIEW_KEY = "hrt-wl-reviewed", REVIEW_DAYS = 30;
  function reviewHidden() { try { var t = +localStorage.getItem(REVIEW_KEY); return t && Date.now() - t < REVIEW_DAYS * 864e5; } catch (e) { return false; } }
  function missingDates(w) { return (w && w.cards || []).filter(function (e) { return e.status !== "next" && e.status !== "closed" && !e.opened; }); }
  var STAR_SM = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';

  function slimHeadHtml(s, perks) {
    var V = view(), m = member(), o = m.ohana || {}, name = String(m.firstName || "").trim();
    var due = expiringSoon(perks, SOON_PERK_DAYS).reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.left : 0); }, 0);
    var nx = s.next;
    /* ʻOhana Wallet (Oct 25): ʻOhana Members get their own premium wallet, managed by Scottie. */
    var since = o.since ? "ʻOhana Member since " + esc(o.since) : "ʻOhana Member";
    var oh = m.client ? '<div class="wl-ow-top"><span class="wl-ow-eyebrow"><span class="wl-sl-star">' + OH_STAR + "</span>ʻOhana Wallet</span>" +
      '<span class="wl-ow-managed">Managed by Scottie</span></div>' : "";
    var ohActs = '<div class="wl-ow-acts"><a class="wl-btn wl-ghost wl-ow-text" href="' + SCOTTIE_SMS + '">' + CHAT_ICON + "Text Scottie</a>" +
      '<button class="wl-btn wl-gold" data-wl="add">+ Add a card</button></div>';
    var ohSub = m.client ? '<p class="wl-ow-sub">' + since + (o.review ? " \u00b7 Last review " + esc(ohanaDate(o.review)) : "") + "</p>" +
      '<div class="wl-ow-row">' + (o.strategy ? '<div class="wl-ow-strat"><span>Your strategy</span><b>' + esc(o.strategy) + "</b></div>" : "") + ohActs + "</div>" : "";
    return '<section class="wl-sum wl-slim' + (m.client ? " wl-sum-oh wl-ow" : "") + '" aria-label="' + (m.client ? "ʻOhana Wallet" : "My Wallet") + '">' + exampleBanner() + oh +
      '<div class="wl-sum-top"><h2 class="wl-sum-title">' + (m.client ? (name ? "Aloha, " + esc(name) : "Aloha") : "My Wallet") + "</h2>" +
      (m.client ? "" : '<button class="wl-btn wl-gold" data-wl="add">+ Add a card</button>') + "</div>" + ohSub +
      famHtml() + hrtLine(V) +
      '<dl class="wl-sl-stats">' +
      '<div><dt>Credits to use</dt><dd>' + (due ? esc(money(due)) : "All used") + "<small>next " + SOON_PERK_DAYS + " days</small></dd></div>" +
      "<div><dt>Annual fees</dt><dd>" + esc(money(s.yearly)) + "</dd></div>" +
      "<div><dt>Next renewal</dt><dd>" + (nx ? esc(nx.renewal.exact ? dayText(nx.renewal) : SHORT_MONTHS[nx.renewal.m - 1]) + "<small>" + esc(shortName(nx.card.name)) + "</small>" : "None") + "</dd></div>" +
      "</dl></section>";
  }

  function nudgeHtml() {
    if (state.demo || state.review) return "";
    var miss = missingDates(view());
    if (!miss.length || reviewHidden()) return "";
    return '<div class="wl-card wl-nudge"><div class="wl-nudge-t"><b>Is your wallet right?</b><span>' + miss.length + (miss.length === 1 ? " card is" : " cards are") +
      " missing the date you opened it. Add it so we can remind you before a fee renews.</span></div>" +
      '<div class="wl-nudge-acts"><button class="wl-btn wl-pri" data-wl="review">Check my cards</button><button class="wl-link" data-wl="review-later">Later</button></div></div>';
  }

  /* "Check my cards": every card on one screen, fix open dates, remove old ones, one Save. */
  function reviewHtml() {
    var idx = catIndex(), t = todayParts();
    var rows = view().cards.filter(function (e) { return e.status !== "closed"; }).map(function (e) {
      var c = cardFor(e, idx), o = parseOpened(e.opened), hidden = e.status === "next" && e.addedBy === "hrt";
      var mo = '<option value="">Month</option>' + MONTHS.map(function (x, i) { return '<option value="' + (i + 1) + '"' + (o && o.m === i + 1 ? " selected" : "") + ">" + x.slice(0, 3) + "</option>"; }).join("");
      var yr = '<option value="">Year</option>';
      for (var y = t.y + (e.status === "next" ? 1 : 0); y >= t.y - 40; y--) yr += '<option value="' + y + '"' + (o && o.y === y ? " selected" : "") + ">" + y + "</option>";
      return '<li class="wl-rv' + (e.opened ? "" : " miss") + '" data-rv="' + esc(e.id) + '">' + (c && !hidden ? artHtml(c, "sm") : '<span class="wl-art wl-art-sm wl-art-blank"></span>') +
        '<div class="wl-rv-main"><b>' + esc(hidden ? "Your next card" : c ? shortName(c.name) : "A card we no longer track") + "</b><span>" +
        esc([e.holder ? e.holder + "’s card" : "", e.opened ? "" : "Open date missing"].filter(Boolean).join(" · ")) + "</span></div>" +
        '<div class="wl-rv-date"><select data-rv-m aria-label="Month opened">' + mo + '</select><select data-rv-y aria-label="Year opened">' + yr + "</select></div>" +
        '<button class="wl-link wl-rv-rm" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></li>';
    }).join("");
    return '<section class="wl-card wl-review"><div class="wl-head"><h3 class="wl-h3">Check your cards</h3></div>' +
      '<p class="wl-note">Fix the month and year you opened each card, and remove any you no longer have.' +
      (member().client ? " Something else looks off? Text Scottie and we will fix it." : "") + "</p>" +
      '<ul class="wl-rvlist">' + rows + '</ul><p class="wl-err" id="wlRvErr" role="alert"></p>' +
      '<div class="wl-acts"><button class="wl-btn wl-pri" data-wl="review-save"' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Saving" : "Save") + "</button>" +
      '<button class="wl-btn" data-wl="add">+ Add a missing card</button><button class="wl-link" data-wl="review-done">Cancel</button></div></section>';
  }

  /* One short row per card: art, name, whose and when it renews. Tap opens the card sheet. */
  function crowHtml(r) {
    var e = r.entry, c = r.card;
    if (!c) return '<li><button class="wl-crow" data-wl="sheet" data-id="' + esc(e.id) + '"><span class="wl-crow-main"><b>A card we no longer track</b><span>Tap to remove it</span></span><span class="wl-crow-go" aria-hidden="true">&rsaquo;</span></button></li>';
    var rn = r.renewal, soon = r.hasFee && rn && rn.days <= SOON_DAYS;
    var line = r.hasFee ? (rn ? "Renews " + (rn.exact ? dayText(rn) : MONTHS[rn.m - 1].slice(0, 3)) + ", " + money(c.fee) : money(c.fee) + " a year") : "No annual fee";
    var bs = bonusState(e), flag = "";
    if (bs && !bs.met && !bs.missed) flag = '<span class="wl-crow-flag">Bonus: ' + esc(money(bs.left)) + " to go</span>";
    else if (e.status && e.status !== "keep" && STATUS_LABEL[e.status]) flag = '<span class="wl-crow-flag st">' + esc(STATUS_LABEL[e.status]) + "</span>";
    else if (soon) flag = '<span class="wl-crow-flag">Renews in ' + rn.days + (rn.days === 1 ? " day" : " days") + "</span>";
    else if (!e.opened) flag = '<span class="wl-crow-flag soft">Add open date</span>';
    return '<li><button class="wl-crow' + (soon ? " soon" : "") + '" data-wl="sheet" data-id="' + esc(e.id) + '">' + artHtml(c, "sm") +
      '<span class="wl-crow-main"><b>' + esc(shortName(c.name)) + (e.withHrt ? '<span class="wl-crow-hrt" title="Opened with HRT">' + STAR_SM + "</span>" : "") + "</b>" +
      "<span>" + esc([e.holder, line].filter(Boolean).join(" · ")) + "</span>" + flag + '</span><span class="wl-crow-go" aria-hidden="true">&rsaquo;</span></button></li>';
  }
  function cardListHtml(s, perks) {
    var v = cardView(), hrt = s.rows.some(function (r) { return r.entry.withHrt; });
    return '<section class="wl-card wl-cards"><div class="wl-hm-head"><h2 class="wl-hm-h">Your cards <span class="wl-count">' + s.count + "</span></h2>" + viewToggle() + "</div>" +
      (v === "grid" ? tilesHtml(s, perks, "grid") : '<ul class="wl-clist">' + s.rows.map(crowHtml).join("") + "</ul>") +
      '<div class="wl-cards-foot">' + (hrt ? '<span class="wl-cards-key"><span class="wl-crow-hrt">' + STAR_SM + "</span> Opened with HRT</span>" : "<span></span>") +
      '<button class="wl-link" data-wl="review">Check and fix my cards</button></div></section>';
  }

  /* Folded sections; open ones are remembered while the page is open. */
  function moreBox(key, title, inner, sub) {
    if (!inner) return "";
    var open = !!(state.more && state.more[key]);
    return '<section class="wl-card wl-more' + (open ? " open" : "") + '"><button class="wl-more-h" data-wl="more" data-key="' + key + '" aria-expanded="' + open + '">' +
      "<span><b>" + esc(title) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span class="wl-more-i" aria-hidden="true">' + (open ? "&minus;" : "+") + "</span></button>" +
      (open ? '<div class="wl-more-in">' + inner + "</div>" : "") + "</section>";
  }

  /* The card sheet: one card's facts, Edit and Remove, then perks and earning folded away. */
  function sheetHtml() {
    var id = state.sel, adding = state.editing === "new";
    if (!adding && !id && !state.editing) return "";
    var inner;
    if (adding) inner = formHtml(null);
    else {
      var eid = state.editing || id, e = state.wallet.cards.filter(function (k) { return k.id === eid; })[0];
      if (!e) { state.sel = null; state.editing = null; return ""; }
      inner = state.editing ? formHtml(e) : sheetBody(e);
    }
    return '<div class="wl-sheet-bg" data-wl="sheet-close"></div><div class="wl-sheet" role="dialog" aria-modal="true" aria-label="Card">' +
      '<button class="wl-sheet-x" data-wl="sheet-close" aria-label="Close">&times;</button>' + inner + "</div>";
  }
  function sheetBody(e) {
    var s = summarize(state.wallet, catalog()), r = s.rows.filter(function (x) { return x.entry.id === e.id; })[0];
    var c = r ? r.card : cardFor(e, catIndex()), hidden = e.status === "next" && e.addedBy === "hrt";
    var name = hidden ? "Your next card" : c ? c.name : "A card we no longer track";
    var perks = perkRows(state.wallet, catalog()).filter(function (x) { return x.entry.id === e.id; });
    var facts = [];
    if (c && !hidden) facts.push(["Annual fee", c.fee ? money(c.fee) + " a year" : "None"]);
    facts.push([e.status === "next" ? "Planned for" : "Opened", openedText(e.opened) || "Not added yet"]);
    if (r && r.hasFee && r.renewal) facts.push(["Renews", renewalText(r.renewal)]);
    var fdx = r && r.hasFee ? nextFeeDate(e) : null;
    if (fdx) facts.push(["Fee posts around", dayText(fdx)]);
    if (e.holder) facts.push(["Whose card", e.holder]);
    if (e.nickname) facts.push(["Nickname", e.nickname]);
    var credits = perks.reduce(function (t, x) { return t + perkYearUsd(x.perk); }, 0);
    if (credits) facts.push(["Credits a year", "Up to " + money(credits)]);
    var tags = statusHtml(e) + (e.withHrt ? '<span class="wl-withhrt">' + STAR_SM + " Opened with HRT</span>" : e.withHrt === false ? '<span class="wl-prehrt">Had before HRT</span>' : "");
    var html = '<div class="wl-sh-top">' + (c && !hidden ? artHtml(c, "md") : "") + '<div class="wl-sh-id"><b class="wl-sh-name">' + esc(name) + "</b>" +
      (c && !hidden && c.issuer ? '<span class="wl-sh-sub">' + esc(c.issuer) + "</span>" : "") + (tags ? '<span class="wl-sh-tags">' + tags + "</span>" : "") + "</div></div>" +
      '<dl class="wl-sh-facts">' + facts.map(function (f) { return "<div><dt>" + esc(f[0]) + "</dt><dd" + (f[1] === "Not added yet" ? ' class="miss"' : "") + ">" + esc(f[1]) + "</dd></div>"; }).join("") + "</dl>" +
      (!e.opened && e.status !== "next" ? '<p class="wl-sh-hint">Add the date you opened it to see when the fee renews.</p>' : "") +
      noteHtml(e) + bonusHtml(e) + (r && r.hasFee && r.renewal && r.renewal.days <= SOON_DAYS && !isClient() ? keepHtml(r) : "") +
      '<div class="wl-sh-acts"><button class="wl-btn wl-pri" data-wl="edit" data-id="' + esc(e.id) + '">Edit card</button>' +
      '<button class="wl-link wl-danger" data-wl="remove" data-id="' + esc(e.id) + '">Remove card</button></div>';
    if (perks.length) html += moreBox("p-" + e.id, "Credits and perks", '<ul class="wl-pks">' + perks.map(function (x) { return perkHtml(x); }).join("") + "</ul>",
      perks.length + (perks.length === 1 ? " perk" : " perks") + (credits ? ", up to " + money(credits) + " a year" : ""));
    if (c && !hidden && earningFor(catalog(), c.id).length) html += moreBox("e-" + e.id, "How it earns", earnHtml(c.id).replace(/<h4 class="wl-h4">How it earns<\/h4>/, ""));
    if (c && c.note && !perks.length) html += '<p class="wl-pk-note wl-cardnote">' + esc(c.note) + "</p>";
    return html;
  }


  /* ===================== MY WALLET SUB PAGES =====================
     Overview (#wallet) is home base: everything at a glance. Cards
     (#wallet/cards) and Credits (#wallet/credits) are the full lists. */
  function tabsHtml(s, perks) {
    var due = expiringSoon(perks, SOON_PERK_DAYS).reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.left : 0); }, 0);
    var tab = function (key, route, label, extra) {
      var on = (state.tab || "overview") === key;
      return '<a class="wl-tab' + (on ? " on" : "") + '" href="#' + route + '" data-route="' + route + '"' + (on ? ' aria-current="page"' : "") + ">" + label +
        (extra ? '<span class="wl-tab-n">' + extra + "</span>" : "") + "</a>";
    };
    return '<nav class="wl-tabs" aria-label="My Wallet">' + tab("overview", "wallet", "Overview") +
      tab("cards", "wallet/cards", "Cards", String(s.count)) + tab("credits", "wallet/credits", "Credits", due ? esc(money(due)) : "") + "</nav>";
  }

  function cardsPageHtml(s, perks) {
    var credits = perks.reduce(function (t, r) { return t + perkYearUsd(r.perk); }, 0), net = credits - s.yearly, m = member();
    var head = '<section class="wl-card wl-cp"><div class="wl-cp-head"><div><h2 class="wl-cp-h">Your cards</h2>' +
      '<p class="wl-cp-sub">Fees, credits and welcome bonuses for every card you hold. Tap a card for the details.</p></div>' +
      '<div class="wl-cp-acts">' + (m.client ? '<a class="wl-btn wl-ghost" href="' + SCOTTIE_SMS + '">' + CHAT_ICON + "Text Scottie</a>" : "") +
      '<button class="wl-btn wl-gold" data-wl="add">+ Add a card</button></div></div>' +
      '<dl class="wl-cp-tot"><div><dt>Annual fees</dt><dd>' + esc(money(s.yearly)) + "</dd></div>" +
      "<div><dt>Credits a year</dt><dd>" + esc(money(credits)) + "<small>if you use them all</small></dd></div>" +
      '<div><dt>Net value</dt><dd class="' + (net >= 0 ? "up" : "down") + '">' + (net >= 0 ? "+" : "&minus;") + esc(money(Math.abs(net))) + "<small>credits minus fees</small></dd></div></dl>" +
      famHtml() +
      '<div class="wl-cp-bar"><label class="wl-cp-q"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="wlCardQ" type="search" placeholder="Search your cards" aria-label="Search your cards" value="' + esc(state.cardQ || "") + '"></label>' +
      '<span class="wl-cp-n" id="wlCardN">' + s.count + (s.count === 1 ? " card" : " cards") + "</span></div>";
    var q = String(state.cardQ || "").trim().toLowerCase();
    var rows = s.rows.map(function (r) {
      var e = r.entry, c = r.card;
      var find = [c ? c.name : "", c ? c.issuer : "", e.holder, e.nickname].join(" ").toLowerCase();
      var hide = q && find.indexOf(q) < 0 ? " hidden" : "";
      if (!c) return '<li data-ct-q="' + esc(find) + '"' + hide + '><button class="wl-ct" data-wl="sheet" data-id="' + esc(e.id) + '"><span class="wl-ct-card"><span class="wl-ct-nm"><b>A card we no longer track</b><small>Tap to remove it</small></span></span><span class="wl-ct-go" aria-hidden="true">&rsaquo;</span></button></li>';
      var cr = perks.filter(function (x) { return x.entry.id === e.id; }).reduce(function (t, x) { return t + perkYearUsd(x.perk); }, 0);
      var rn = r.renewal, soon = r.hasFee && rn && rn.days <= SOON_DAYS;
      var bs = bonusState(e), bonus = '<span class="wl-ct-dim">&ndash;</span>';
      if (bs && bs.met) bonus = '<span class="wl-ct-ok">Earned</span>';
      else if (bs && bs.missed) bonus = '<span class="wl-ct-dim">Missed</span>';
      else if (bs) bonus = '<span class="wl-ct-bonus"><span class="wl-ct-bt">' + esc(money(bs.spent)) + " of " + esc(money(bs.spend)) + "</span>" +
        '<span class="wl-ct-track"><i style="width:' + bs.pct + '%"></i></span><small>by ' + esc(dayText(bs.by)) + "</small></span>";
      return '<li data-ct-q="' + esc(find) + '"' + hide + '><button class="wl-ct' + (soon ? " soon" : "") + '" data-wl="sheet" data-id="' + esc(e.id) + '">' +
        '<span class="wl-ct-card">' + artHtml(c, "sm") + '<span class="wl-ct-nm"><small>' + esc(c.issuer || "") + "</small><b>" + esc(shortName(c.name)) +
        (e.withHrt ? '<span class="wl-crow-hrt" title="Opened with HRT">' + STAR_SM + "</span>" : "") + "</b>" +
        (e.nickname ? '<small class="wl-ct-nick">' + esc(e.nickname) + "</small>" : "") +
        (e.holder ? '<small class="wl-ct-pho">' + esc(e.holder) + "\u2019s card</small>" : "") + "</span></span>" +
        '<span class="wl-ct-c wl-ct-who" data-l="Whose">' + esc(e.holder || "You") + "</span>" +
        '<span class="wl-ct-c" data-l="Credits a year">' + (cr ? esc(money(cr)) : '<span class="wl-ct-dim">&ndash;</span>') + "</span>" +
        '<span class="wl-ct-c" data-l="Annual fee">' + (r.hasFee ? esc(money(c.fee)) : '<span class="wl-ct-dim">None</span>') + "</span>" +
        '<span class="wl-ct-c" data-l="Renews">' + (r.hasFee && rn ? '<span class="' + (soon ? "wl-ct-hot" : "") + '">' + esc(rn.exact ? dayText(rn) : MONTHS[rn.m - 1].slice(0, 3)) + "</span>" : r.hasFee ? '<span class="wl-ct-dim">Add open date</span>' : '<span class="wl-ct-dim">&ndash;</span>') + "</span>" +
        '<span class="wl-ct-c wl-ct-wb' + (bs ? "" : " nob") + '" data-l="Welcome bonus">' + bonus + "</span>" +
        '<span class="wl-ct-go" aria-hidden="true">&rsaquo;</span></button></li>';
    }).join("");
    return head + '<div class="wl-ct-head" aria-hidden="true"><span>Card</span><span>Whose</span><span>Credits a year</span><span>Annual fee</span><span>Renews</span><span>Welcome bonus</span><span></span></div>' +
      '<ul class="wl-ct-list">' + rows + "</ul>" +
      '<div class="wl-cards-foot"><span></span><button class="wl-link" data-wl="review">Check and fix my cards</button></div></section>' +
      upcomingHtml(s.upcoming || []);
  }

  function creditsPageHtml(perks) {
    return soonHtml(perks) || '<section class="wl-card wl-soonbox"><h3 class="wl-cr-title">Credits to use</h3><p class="wl-cr-sub">All caught up. You have used every credit that is open right now.</p></section>';
  }

  function paintMain() {
    if (!host) return;
    if (state.error) {
      setStats(null);
      host.innerHTML = '<div class="wl-card wl-empty"><p>' + esc(errText(state.error)) + "</p>" +
        (state.error.code === "READ_FAILED" ? '<button class="wl-btn wl-pri" data-wl="retry">Try again</button>' : "") + "</div>";
      return;
    }
    if (!state.wallet) { host.innerHTML = '<div class="wl-card wl-empty"><p>Loading your wallet</p></div>'; return; }
    var s = summarize(view(), catalog());
    var perks = perkRows(view(), catalog());
    s.credits = perks.reduce(function (t, r) { return t + perkYearUsd(r.perk); }, 0);
    setStats(s);
    var html;
    if (!s.count && !(s.upcoming || []).length) {
      html = summaryHtml("page"); /* empty wallet: the summary card invites them to add cards */
      if (state.msg) html += '<p class="wl-banner" role="alert">' + esc(state.msg) + "</p>";
    } else {
      var tab = s.count ? (state.tab || "overview") : "overview";
      html = s.count ? tabsHtml(s, perks) : "";
      html += tab === "overview" ? (s.count ? slimHeadHtml(s, perks) : summaryHtml("page")) + helpHtml("page") : "";
      if (state.msg) html += '<p class="wl-banner" role="alert">' + esc(state.msg) + "</p>";
      if (state.review) html += reviewHtml();
      else if (tab === "cards") html += cardsPageHtml(s, perks);
      else if (tab === "credits") html += creditsPageHtml(perks);
      else {
        html += nudgeHtml();
        if (s.count) html += '<div class="wl-hm-grid wl-pg-grid">' + cardListHtml(s, perks) + (soonHtml(perks) || soonHtml(perks, true)) + "</div>";
        var dates = importantDates(view(), catalog());
        html += '<h3 class="wl-more-title">More</h3>' +
          moreBox("which", "Which card should I use?", whichHtml().replace(/<h3 class="wl-h4 wl-wc-h">Which card should I use\?<\/h3>/, ""), "Type a store, like Foodland or Costco") +
          moreBox("dates", "Important dates", datesHtml(dates), dates.length + (dates.length === 1 ? " date" : " dates") + " in the next 90 days") +
          moreBox("tips", "For your cards", tipsHtml(false), "Transfer bonuses, lounges and more from our other tools") +
          moreBox("up", "Next up and closed", upcomingHtml(s.upcoming || []), (s.upcoming || []).length + " planned or closed");
      }
    }
    var checked = catalog().cards.length ? catalog().cards.map(function (c) { return c.checked; }).sort()[0] : "";
    html += '<p class="wl-foot">Fees and credits come from each issuer\'s own website' + (checked ? ", checked " + esc(fmtIso(checked)) : "") + ". Your wallet is private to your account.</p>";
    html += sheetHtml();
    host.innerHTML = html;
    var sheetOpen = !!host.querySelector(".wl-sheet");
    document.documentElement.classList.toggle("wl-sheet-open", sheetOpen);
    if (state.editing) bindForm(state.editing === "new" ? null : state.wallet.cards.filter(function (c) { return c.id === state.editing; })[0]);
    if (state.focus) {
      var row = host.querySelector('[data-entry="' + state.focus + '"]');
      state.focus = null;
      if (row) setTimeout(function () { try { row.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) { row.scrollIntoView(); } }, 60);
    }
  }
  function fmtIso(s) { var o = parseOpened(s); return o ? MONTHS[o.m - 1].slice(0, 3) + " " + o.d + ", " + o.y : s; }

  function bindForm(entry) {
    var f = $("wlForm"); if (!f) return;
    f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = readForm(entry);
      if (v.err) { $("wlFormErr").textContent = v.err; return; }
      if (entry) {
        save(function (w) { w.cards.forEach(function (c) { if (c.id === entry.id) { c.opened = v.opened; c.nickname = v.nickname; if (v.bonus) c.bonus = v.bonus; else delete c.bonus; applyExtras(c, v); } }); },
          function () { state.editing = null; });
      } else {
        save(function (w) { var n = { id: store().newId(), cardId: v.cardId, opened: v.opened, nickname: v.nickname }; if (v.bonus) n.bonus = v.bonus; applyExtras(n, v); w.cards.push(n); },
          function () { state.editing = null; });
      }
    });
    var first = entry ? $("wlMonth") : $("wlPickQ");
    if (first) try { first.focus({ preventScroll: true }); } catch (e) {}
  }

  /* Tick or untick a perk for the current period. Uses the same safe save. */
  function setUsedAmount(entryId, perkId, key, amt, full) {
    save(function (w) {
      w.cards.forEach(function (c) {
        if (c.id !== entryId) return;
        c.used = c.used || {};
        c.used[perkId] = c.used[perkId] || {};
        if (amt >= full) c.used[perkId][key] = true; else if (amt > 0) c.used[perkId][key] = Math.round(amt * 100) / 100; else delete c.used[perkId][key];
        pruneUsed(c);
      });
    }, function () { state.partOpen = null; }, true);
  }
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
    if (!b || !((host && host.contains(b)) || (homeHost && homeHost.contains(b)) || (alertHost && alertHost.contains(b)) || (miniHost && miniHost.contains(b)))) return;
    var act = b.getAttribute("data-wl"), id = b.getAttribute("data-id");
    if (act === "use") return; /* handled on change */
    if (act === "clamp") { if (ev.target.closest("a")) return; b.classList.toggle("full"); return; }
    if (act === "retry") return load();
    if (act === "help-yes") { askForHelp(); return; }
    if (act === "help-no") { try { localStorage.setItem(HELP_KEY, String(Date.now())); } catch (e) {} paint(); return; }
    if (act === "demo") { startExample(); if (location.hash !== "#home" && location.hash !== "#wallet") location.hash = "wallet"; return; }
    if (act === "demo-off") { endExample(); return; }
    if (act === "which") { var k = b.getAttribute("data-key"); state.which = (state.which === k && !state.storeQ) ? "" : k; state.storeQ = ""; paint(); return; }
    if (act === "go-wallet") { location.hash = "wallet"; return; }
    if (act === "go-card" || act === "sheet") { state.sel = id; state.editing = null; if (/^#wallet(\/|$)/.test(location.hash)) paint(); else location.hash = "wallet"; return; }
    if (act === "sheet-close") { state.sel = null; state.editing = null; paint(); return; }
    if (act === "more") { state.more = state.more || {}; var mk = b.getAttribute("data-key"); state.more[mk] = !state.more[mk]; paint(); return; }
    if (act === "pick") {
      var pk = b.getAttribute("data-key"), hid = $("wlCard"), cbox = $("wlCustom");
      if (hid) hid.value = pk;
      Array.prototype.forEach.call(document.querySelectorAll(".wl-pick-i"), function (x) { x.classList.toggle("on", x === b); });
      if (cbox) { cbox.hidden = pk !== "custom"; if (!cbox.hidden) $("wlCName").focus(); }
      if (pk !== "custom" && $("wlHolder")) try { $("wlHolder").scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (x) {}
      if ($("wlFormErr")) $("wlFormErr").textContent = "";
      return;
    }
    if (act === "review") { state.review = true; state.sel = null; state.editing = null; state.msg = ""; paint(); try { host.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (x) {} return; }
    if (act === "review-done") { state.review = false; paint(); return; }
    if (act === "review-later") { try { localStorage.setItem(REVIEW_KEY, String(Date.now())); } catch (x) {} paint(); return; }
    if (act === "review-save") {
      var errs = "", ch = {};
      Array.prototype.forEach.call(host.querySelectorAll("[data-rv]"), function (li) {
        if (errs) return;
        var rid = li.getAttribute("data-rv"), rm = +li.querySelector("[data-rv-m]").value, ry = +li.querySelector("[data-rv-y]").value;
        var ent = state.wallet.cards.filter(function (k) { return k.id === rid; })[0];
        if ((rm && !ry) || (ry && !rm)) { errs = "Choose both the month and the year, or leave both blank."; return; }
        var v = rm && ry ? ry + "-" + (rm < 10 ? "0" : "") + rm : "";
        if (v && ent && ent.status !== "next" && isFuture(v)) { errs = MONTHS[rm - 1] + " " + ry + " is in the future. Pick the month you opened the card."; return; }
        ch[rid] = v;
      });
      if (errs) { $("wlRvErr").textContent = errs; return; }
      save(function (w) {
        w.cards.forEach(function (k) {
          if (!(k.id in ch)) return;
          var v = ch[k.id];
          if (v && k.opened && k.opened.slice(0, 7) === v) return; /* same month: keep the exact day */
          k.opened = v;
        });
      }, function () { state.review = false; try { localStorage.setItem(REVIEW_KEY, String(Date.now())); } catch (x) {} });
      return;
    }
    if ((act === "go-add" || act === "add") && state.demo) { endExample(); state.sel = null; state.editing = "new"; if (act === "go-add") location.hash = "wallet"; return; }
    if (act === "go-add") { state.sel = null; state.editing = "new"; state.msg = ""; location.hash = "wallet"; return; }
    if (act === "add") { state.sel = null; state.editing = "new"; state.msg = ""; paint(); return; }
    if (act === "cancel") { state.editing = null; paint(); return; }
    if (act === "edit") { state.sel = id; state.editing = id; state.msg = ""; paint(); return; }
    if (act === "perks") { state.open[id] = !state.open[id]; paint(); return; }
    if (act === "bonus-save") {
      var inp = b.parentNode.querySelector("[data-wl-spent]"), amt = inp ? +inp.value : NaN;
      if (!(amt >= 0) || amt > 10000000) { if (inp) inp.focus(); return; }
      amt = Math.round(amt * 100) / 100;
      save(function (w) { w.cards.forEach(function (k) { if (k.id === id && k.bonus) k.bonus.spent = amt; }); });
      return;
    }
    if (act === "bonus-remove") { save(function (w) { w.cards.forEach(function (k) { if (k.id === id) delete k.bonus; }); }); return; }
    if (act === "view") { state.cardView = b.getAttribute("data-key") === "list" ? "list" : "grid"; try { localStorage.setItem("hrt-wl-view", state.cardView); } catch (e) {} paint(); return; }
    if (act === "fam") { state.holder = b.hasAttribute("data-key") ? b.getAttribute("data-key") : null; state.showAllSoon = false; paint(); return; }
    if (act === "alldates") { state.showAllDates = !state.showAllDates; paint(); return; }
    if (act === "part") { state.partOpen = b.getAttribute("data-k"); paint(); var pi = document.querySelector("[data-wl-part]"); if (pi) try { pi.focus(); } catch (x) {} return; }
    if (act === "part-cancel") { state.partOpen = null; paint(); return; }
    if (act === "part-save") {
      var inp2 = b.parentNode.querySelector("[data-wl-part]"), amt2 = inp2 ? +inp2.value : NaN, kk = (b.getAttribute("data-k") || "").split("|");
      if (!(amt2 >= 0) || kk.length !== 3) { if (inp2) inp2.focus(); return; }
      setUsedAmount(kk[0], kk[1], kk[2], amt2, +b.getAttribute("data-max"));
      return;
    }
    if (act === "ctab") { state.creditTab = b.getAttribute("data-key"); state.showAllSoon = false; paint(); return; }
    if (act === "allsoon") { state.showAllSoon = !state.showAllSoon; paint(); return; }
    if (act === "remove") {
      var e = state.wallet.cards.filter(function (c) { return c.id === id; })[0];
      var c = e && cardFor(e, catalog().cards.reduce(function (m, k) { m[k.id] = k; return m; }, {}));
      if (!window.confirm("Remove " + (c ? c.name : "this card") + " from your wallet? Its ticked-off credits go too.")) return;
      save(function (w) { w.cards = w.cards.filter(function (k) { return k.id !== id; }); },
        function () { if (state.editing === id) state.editing = null; if (state.sel === id) state.sel = null; });
    }
  }
  function onChange(ev) {
    var t = ev.target;
    if (!t || t.getAttribute("data-wl") !== "use") return;
    setUsed(t.getAttribute("data-id"), t.getAttribute("data-perk"), t.getAttribute("data-key"), t.checked);
  }

  /* Background photo for the wallet summary card (hosted on HRT's Squarespace) */
  var SUMMARY_PHOTO = "https://images.squarespace-cdn.com/content/67cfe44f78d8ac79bcf6ec19/b3017d69-9c62-4d52-9714-0c39f1cadff7/michelle-spollen-dC2FsjoXsPQ-unsplash+%281%29.jpg?content-type=image%2Fjpeg";

  function styles() {
    if (document.getElementById("wl-css")) return;
    var s = document.createElement("style");
    s.id = "wl-css";
    s.textContent = [
      ".wl-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius,16px);box-shadow:var(--shadow);padding:18px;margin-bottom:14px}",
      ".wl-status{display:inline-block;align-self:flex-start;margin-top:6px;font-size:11.5px;font-weight:800;line-height:1;padding:5px 9px;border-radius:999px;background:rgba(47,133,90,.12);color:#2f855a}",
      ".wl-status.st-keep-for-now,.wl-status.st-downgrade{background:rgba(242,184,75,.18);color:#8a5a10}",
      ".wl-status.st-min-spend,.wl-status.st-min-spend-almost{background:rgba(217,112,64,.15);color:#b4541f}",
      ".wl-status.st-cancel,.wl-status.st-closed{background:rgba(120,130,145,.16);color:var(--muted)}",
      ".wl-status.st-next{background:rgba(28,61,90,.12);color:#1b2430}",
      "[data-theme=dark] .wl-status{color:#8fe0b4}[data-theme=dark] .wl-status.st-keep-for-now,[data-theme=dark] .wl-status.st-downgrade{color:#f2c56b}[data-theme=dark] .wl-status.st-min-spend,[data-theme=dark] .wl-status.st-min-spend-almost{color:#f4a77c}[data-theme=dark] .wl-status.st-next{color:#9fc1d4;background:rgba(159,193,212,.14)}",
      ".wl-next{display:flex;flex-direction:column;gap:2px;margin:10px 0 0;padding:9px 12px;border-left:3px solid var(--coral);border-radius:0 10px 10px 0;background:rgba(217,112,64,.07);font-size:13.5px;line-height:1.45;color:var(--text)}",
      ".wl-next b{font-size:11.5px;font-weight:800;color:var(--coral-d,#c05f32)}",
      ".wl-up .wl-name{color:var(--muted)}",
      ".wl-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.wl-two{grid-template-columns:1fr}}",
      ".wl-custom{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;padding:12px;border:1px dashed var(--line);border-radius:12px}.wl-custom[hidden]{display:none}@media(max-width:560px){.wl-custom{grid-template-columns:1fr}}",
      ".wl-form textarea{font:inherit;font-size:14px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,var(--surface));color:var(--text);resize:vertical;min-height:60px}",
      ".wl-tl-status{display:inline-block;align-self:flex-start;font-size:11px;font-weight:800;color:#b4541f}",
      ".wl-sum.wl-sum-oh{border:1.5px solid #f2b84b}",
      ".wl-tiplist{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:10px}",
      ".wl-tip{display:flex;gap:12px;align-items:flex-start;padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,var(--surface))}",
      ".wl-tip-ic{flex:0 0 34px;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(217,112,64,.12);color:#c25c26}",
      ".wl-tip.k-lounge .wl-tip-ic,.wl-tip.k-atmos .wl-tip-ic{background:rgba(58,123,181,.12);color:#2f6aa3}",
      "[data-theme=dark] .wl-tip-ic{color:#f0a070}[data-theme=dark] .wl-tip.k-lounge .wl-tip-ic,[data-theme=dark] .wl-tip.k-atmos .wl-tip-ic{color:#8cc0ee}",
      ".wl-tip-body{display:flex;flex-direction:column;gap:3px;min-width:0}.wl-tip-body b{font-size:14.5px;color:var(--text);line-height:1.35}.wl-tip-body span{font-size:13.5px;color:var(--muted);line-height:1.5}",
      ".wl-tips .wl-tip-go,.wl-pk .wl-pk-link,.wl-tip-go,.wl-pk-link{align-self:flex-start;margin-top:4px;font-size:13.5px;font-weight:700;color:#c05f32;text-decoration:none;min-height:30px;display:inline-flex;align-items:center}",
      ".wl-tip-go:hover,.wl-pk-link:hover{text-decoration:underline}[data-theme=dark] .wl-tips .wl-tip-go,[data-theme=dark] .wl-pk .wl-pk-link{color:#f0a070}",
      "#wl-tips-home .wl-tips{margin:0}@media(min-width:900px){#wl-tips-home .wl-tiplist{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}}",
      ".wl-oh{margin:0 0 16px;padding:0 0 16px;border-bottom:1px solid rgba(242,184,75,.28)}",
      ".wl-oh .wl-oh-top{display:flex;align-items:center;gap:8px}.wl-oh .wl-oh-star{display:inline-flex;color:#f2b84b}",
      ".wl-oh .wl-oh-eyebrow{font-size:12px;font-weight:700;letter-spacing:.03em;color:#f5c75a}",
      ".wl-oh .wl-oh-hi{margin:8px 0 4px;font-size:21px;font-weight:800;line-height:1.25;color:#fff}",
      ".wl-oh .wl-oh-txt{margin:0;font-size:14px;line-height:1.55;color:#c9d6e3;max-width:62ch}",
      ".wl-oh .wl-oh-box{display:flex;flex-direction:column;gap:2px;margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.06)}",
      ".wl-oh .wl-oh-box span{font-size:12px;font-weight:700;color:#f5c75a}.wl-oh .wl-oh-box b{font-size:14.5px;font-weight:600;color:#fff;line-height:1.4}",
      ".wl-oh .wl-oh-rev{margin:10px 0 0;font-size:12.5px;color:#a9bccf}",
      ".wl-client{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:10px 14px;border-radius:12px;background:rgba(63,206,127,.10);border:1px solid rgba(63,206,127,.35);font-size:13px;line-height:1.45;color:#eef4fa}",
      ".wl-client-txt{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}.wl-client-txt b{color:#a6e9c3;font-size:13.5px}.wl-client-txt span{color:#cfe0ee}",
      ".wl-live{position:relative;flex:0 0 10px;width:10px;height:10px;border-radius:50%;background:#3fce7f;box-shadow:0 0 0 3px rgba(63,206,127,.25)}",
      ".wl-live:after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid #3fce7f;opacity:0;animation:wlPulse 2s ease-out infinite}",
      "@keyframes wlPulse{0%{transform:scale(.6);opacity:.8}100%{transform:scale(1.8);opacity:0}}@media(prefers-reduced-motion:reduce){.wl-live:after{animation:none}}",
      "@media(max-width:560px){.wl-client .wl-client-pill{display:none}}",
      ".wl-client-pill{flex:0 0 auto;font-size:11px;font-weight:800;color:#14202e;background:linear-gradient(135deg,#f5c75a,#e8824c);border-radius:999px;padding:4px 10px}",
      ".wl-byhrt{display:inline-block;align-self:flex-start;margin-top:4px;font-size:11px;font-weight:700;color:#8a5a10}[data-theme=dark] .wl-byhrt{color:#f2c56b}",
      ".wl-help{display:flex;align-items:center;justify-content:space-between;gap:12px 18px;flex-wrap:wrap;border-left:4px solid var(--coral)}",
      ".wl-card.wl-help .wl-help-eyebrow,.wl-help-eyebrow{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#d06a34}",
      ".wl-help-pts{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:4px}.wl-help-pts li{position:relative;padding-left:20px;font-size:13.5px;color:var(--text);line-height:1.45}",
      ".wl-help-pts li:before{content:'';position:absolute;left:2px;top:6px;width:9px;height:5px;border-left:2px solid #2f855a;border-bottom:2px solid #2f855a;transform:rotate(-45deg)}",
      ".wl-help>div:first-child{display:flex;flex-direction:column;gap:3px;min-width:240px;flex:1}.wl-help b{font-size:15px;color:var(--text)}.wl-help span{font-size:13.5px;color:var(--muted);line-height:1.5}",
      ".wl-help-acts{display:flex;align-items:center;gap:12px}.wl-help.done{display:flex;flex-direction:column;align-items:flex-start;gap:3px;border-left-color:#2f855a}.wl-help.done a{color:var(--coral-d,#d06a34);font-weight:700}",
      ".wl-h3{margin:0;font-size:19px;font-weight:800;line-height:1.25;color:var(--text)}",
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
      ".wl-soon .wl-name:before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#d97040;margin-right:7px;vertical-align:1px}",
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
      ".wl-rowtop>.wl-main{flex:1;min-width:0}",
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
      ".wl-tag.warn{border-color:rgba(217,112,64,.5);color:#b4580f}",
      "[data-theme=dark] .wl-tag.warn{color:#f2b84b}",
      ".wl-tick{flex:0 0 auto;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 13px;border:1px solid var(--line);border-radius:999px;background:var(--surface);font-size:13px;font-weight:800;color:var(--text);cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;user-select:none}",
      ".wl-tick:active{transform:scale(.97)}",
      ".wl-tick input{width:20px;height:20px;margin:0;accent-color:#2f855a;cursor:pointer}",
      ".wl-tick:has(input:checked){border-color:rgba(47,133,90,.5);background:rgba(63,206,127,.14);color:#2f855a}",
      "[data-theme=dark] .wl-tick:has(input:checked){color:#6fd39b}",
      ".wl-clamp{cursor:pointer}",
      ".wl-soonbox{position:relative;overflow:hidden;border:1px solid #e3c785;background:linear-gradient(180deg,#fbf4e2 0,#fdf9ef 110px,var(--surface) 240px)}",
      ".wl-soonbox:before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#c9973a,#f2c766 45%,#e0aa48)}",
      "[data-theme=dark] .wl-soonbox{border-color:rgba(242,199,102,.45);background:linear-gradient(180deg,rgba(242,199,102,.12),rgba(242,199,102,.03) 160px),var(--surface)}",
      ".wl-cr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}",
      ".wl-soonbox .wl-cr-title{margin:0;font-size:19px;font-weight:800;line-height:1.25;color:var(--text)}",
      ".wl-soonbox .wl-cr-sub{margin:4px 0 0;font-size:13px;line-height:1.45;color:var(--muted)}",
      ".wl-cr-total{display:flex;flex-direction:column;align-items:flex-end;flex:0 0 auto;text-align:right}",
      ".wl-cr-total b{font-size:28px;font-weight:800;line-height:1.05;color:var(--text);font-variant-numeric:tabular-nums}",
      ".wl-cr-total span{font-size:12px;font-weight:700;letter-spacing:.02em;color:#9a6b12}[data-theme=dark] .wl-cr-total span{color:#f2c766}",
      ".wl-ctabs{display:flex;gap:8px;margin:14px 0 12px}",
      "@media (max-width:560px){.wl-cr-head{flex-direction:column;gap:8px}.wl-cr-total{flex-direction:row;align-items:baseline;gap:8px;text-align:left}.wl-cr-total b{font-size:26px}}",
      ".wl-ctab{all:unset;box-sizing:border-box;cursor:pointer;flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:1px;min-height:48px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);-webkit-tap-highlight-color:transparent}",
      ".wl-ctab b{font-size:13px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wl-ctab span{font-size:12.5px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums}",
      ".wl-ctab:hover{border-color:var(--coral)}.wl-ctab:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".wl-ctab.on{background:#1b2430;border-color:#1b2430;box-shadow:inset 0 -3px 0 #e0aa48}.wl-ctab.on b{color:#fff}.wl-ctab.on span{color:#f2c766}",
      "[data-theme=dark] .wl-ctab.on{background:#f2b84b;border-color:#f2b84b}[data-theme=dark] .wl-ctab.on b,[data-theme=dark] .wl-ctab.on span{color:#14202e}",
      ".wl-pks-soon .wl-pk{background:var(--surface);border:1px solid rgba(201,151,58,.22)}",
      ".wl-pk.warm{box-shadow:inset 3px 0 0 #f2b84b}.wl-pk.hot{box-shadow:inset 3px 0 0 #d97040}",
      ".wl-pk-days.warm,.wl-pk-days.hot{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px}",
      ".wl-pk-days.warm{background:rgba(242,184,75,.25);color:#8a4a10}.wl-pk-days.hot{background:rgba(217,112,64,.2);color:#a3410f}",
      "[data-theme=dark] .wl-pk-days.warm,[data-theme=dark] .wl-pk-days.hot{color:#f2b84b}",
      ".wl-demo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;margin:0 0 12px;padding:9px 12px;border-radius:12px;background:rgba(159,193,212,.22);border:1px dashed rgba(28,61,90,.35);font-size:13px;color:var(--text)}",
      ".wl-demo .wl-btn{min-height:36px;padding:6px 12px}",
      ".wl-hm-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.wl-hm-acts.wl-center{justify-content:center}",
      /* ---- wallet summary card: navy with a gold edge, like a premium card ---- */
      ".wl-sum{position:relative;overflow:hidden;margin:0 0 18px;padding:22px 24px 20px;border-radius:20px;color:#eef4fa;" +
        /* photo at the back, the welcome tile's navy to blue gradient over it (strong, so text stays easy to read), soft light top right */
        "background:radial-gradient(1100px 320px at 88% -50%,rgba(159,193,212,.42),transparent 60%)," +
          "linear-gradient(120deg,rgba(20,27,36,.93),rgba(27,36,48,.88) 52%,rgba(35,47,62,.84))," +
          "url('" + SUMMARY_PHOTO + "') center 60%/cover no-repeat,#1b2430;" +
        "border:1px solid rgba(242,184,75,.45);box-shadow:0 18px 40px -24px rgba(9,20,35,.75)}",
      ".wl-sum .wl-sum-top{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      ".wl-sum .wl-sum-title{margin:0;font-size:15px;font-weight:700;line-height:1.3;color:#cfe0ee}",
      ".wl-sum .wl-sum-hero{display:flex;flex-direction:column;gap:4px;margin:14px 0 18px}",
      ".wl-sum .wl-sum-big{font-size:clamp(34px,5vw,46px);font-weight:800;line-height:1.02;letter-spacing:-.015em;color:#fff;font-variant-numeric:tabular-nums}",
      ".wl-sum .wl-sum-big.wl-sum-ok{color:#a6e9c3;font-size:clamp(28px,4vw,36px)}",
      ".wl-sum .wl-sum-cap{font-size:14px;line-height:1.4;color:#b9cbdc}",
      ".wl-sum .wl-sum-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0;border-top:1px solid rgba(255,255,255,.13)}",
      ".wl-sum .wl-sum-stat{padding:13px 14px 2px 0;min-width:0}",
      ".wl-sum .wl-sum-stat + .wl-sum-stat{padding-left:16px;border-left:1px solid rgba(255,255,255,.13)}",
      ".wl-sum dt{margin:0 0 3px;font-size:12.5px;color:#9fb4c8}",
      ".wl-sum dd{margin:0;font-size:21px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wl-sum dd small{display:block;margin-top:2px;font-size:12px;font-weight:600;color:#9fb4c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wl-sum .wl-sum-meter{margin-top:16px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.06)}",
      ".wl-sum .wl-sum-verdict{margin:0;font-size:14.5px;font-weight:700;line-height:1.45;color:#fff}.wl-sum .wl-sum-verdict.up{color:#a6e9c3}",
      ".wl-sum .wl-sum-bar{position:relative;height:10px;border-radius:999px;background:rgba(255,255,255,.1)}",
      ".wl-sum .wl-sum-cr{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:linear-gradient(90deg,#2fb46c,#7fe0a8)}",
      ".wl-sum .wl-sum-fee{position:absolute;top:-5px;bottom:-5px;width:4px;margin-left:-2px;border-radius:2px;background:#f2b84b;box-shadow:0 0 0 2px #141b24}",
      ".wl-sum .wl-sum-legend{display:flex;gap:16px;margin-top:9px;font-size:12px;color:#b9cbdc}",
      ".wl-sum .wl-sum-legend span:before{content:'';display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}",
      ".wl-sum .wl-sum-legend .cr:before{background:#4cc884}.wl-sum .wl-sum-legend .fee:before{width:4px;background:#f2b84b}",
      ".wl-sum .wl-sum-note{margin:6px 0 0;font-size:13px;line-height:1.5;color:#cfe0ee}",
      ".wl-sum .wl-sum-alerts{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:6px}",
      ".wl-sum .wl-sum-al{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:flex;align-items:center;gap:10px;min-height:44px;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.07);color:#fff;font-size:14px;font-weight:600;line-height:1.35;-webkit-tap-highlight-color:transparent}",
      ".wl-sum .wl-sum-al:hover{background:rgba(255,255,255,.12)}.wl-sum .wl-sum-al:focus-visible{outline:2px solid #f2b84b;outline-offset:2px}",
      ".wl-sum .wl-sum-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:#9fc1d4}",
      ".wl-sum .hot .wl-sum-dot{background:#ff7a70}.wl-sum .warn .wl-sum-dot{background:#f2b84b}",
      ".wl-sum .wl-sum-go{margin-left:auto;font-size:20px;line-height:1;color:#9fb4c8}",
      ".wl-sum .wl-btn{min-height:40px;text-decoration:none;display:inline-flex;align-items:center}",
      ".wl-sum .wl-btn.wl-ghost{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.28);color:#fff}",
      ".wl-sum .wl-btn.wl-ghost:hover{background:rgba(255,255,255,.14)}",
      ".wl-sum .wl-btn.wl-gold{background:linear-gradient(90deg,#f2b84b,#d97040);border-color:transparent;color:#14202e}",
      ".wl-sum .wl-sum-lede{margin:10px 0 0;max-width:56ch;font-size:15px;line-height:1.55;color:#cfe0ee}",
      ".wl-sum .wl-sum-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}",
      ".wl-sum .wl-demo{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3);color:#eef4fa}",
      ".wl-hm .wl-hm-head{align-items:center}.wl-hm .wl-hm-h{font-size:17px}",
      /* the Dashboard mini wallet wears the same photo card as the banner above */
      "#wl-mini{background:radial-gradient(900px 300px at 88% -50%,rgba(159,193,212,.42),transparent 60%)," +
        "linear-gradient(120deg,rgba(20,27,36,.93),rgba(27,36,48,.88) 52%,rgba(35,47,62,.84))," +
        "url('" + SUMMARY_PHOTO + "') center 60%/cover no-repeat,#1b2430}",
      "@media (max-width:560px){.wl-sum{padding:18px 16px 16px;border-radius:18px}" +
        ".wl-sum .wl-sum-stats{grid-template-columns:1fr 1fr}" +
        ".wl-sum .wl-sum-stat:nth-child(odd){padding-left:0;border-left:0}" +
        ".wl-sum .wl-sum-stat:nth-child(n+3){border-top:1px solid rgba(255,255,255,.13);margin-top:10px}" +
        ".wl-sum dd{font-size:19px}.wl-sum .wl-btn{min-height:44px}}",
      ".wl-wc-h{margin-top:18px}.wl-card > .wl-wc .wl-wc-h{margin-top:0;margin-bottom:12px;font-size:19px}.wl-card.wl-hm > .wl-wc .wl-wc-h{margin-top:22px}",
      ".wl-chips{display:flex;flex-wrap:wrap;gap:7px}",
      ".wl-chip{all:unset;box-sizing:border-box;cursor:pointer;min-height:38px;padding:0 13px;display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;font-size:13.5px;font-weight:700;color:var(--text);background:var(--surface);-webkit-tap-highlight-color:transparent}",
      ".wl-chip:hover{border-color:var(--coral)}.wl-chip:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".wl-chip.on{background:#1b2430;border-color:#1b2430;color:#fff}",
      "[data-theme=dark] .wl-chip.on{background:#f2b84b;border-color:#f2b84b;color:#14202e}",
      ".wl-wc-res{margin-top:12px;border:1px solid rgba(47,133,90,.35);background:rgba(63,206,127,.08);border-radius:12px;padding:12px 14px}",
      ".wl-wc-best{display:flex;flex-direction:column;gap:3px}",
      ".wl-wc-tag{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#2f855a}",
      "[data-theme=dark] .wl-wc-tag{color:#6fd39b}",
      ".wl-wc-name{font-size:18px;font-weight:800;color:var(--text)}",
      ".wl-wc-why{font-size:14px;color:var(--text)}",
      ".wl-wc-notes{font-size:12.5px;line-height:1.45;color:var(--muted)}",
      ".wl-wc-rest{margin:10px 0 0;padding:10px 0 0 20px;border-top:1px dashed var(--line);font-size:13px;line-height:1.6;color:var(--text)}",
      ".wl-wc-tip{margin:8px 0 0;font-size:12.5px;color:#8a4a10}",
      "[data-theme=dark] .wl-wc-tip{color:#f2b84b}",
      ".wl-wc-foot{margin:8px 0 0;font-size:12px;color:var(--muted)}.wl-wc-foot a{color:inherit}",
      "@media (max-width:560px){.wl-chips{flex-wrap:nowrap;overflow-x:auto;margin:0 -14px;padding:2px 14px 4px;scrollbar-width:none}.wl-chips::-webkit-scrollbar{display:none}.wl-chip{flex:0 0 auto;min-height:44px}}",
      ".wl-alerts{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px;padding:10px 12px;border:1px solid rgba(242,184,75,.55);border-radius:14px;background:var(--surface);box-shadow:var(--shadow)}",
      ".wl-al-h{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#b4580f;margin-right:4px}",
      "[data-theme=dark] .wl-al-h{color:#f2b84b}",
      ".wl-al{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 12px;border-radius:999px;font-size:13.5px;font-weight:700;color:var(--text);background:var(--surface-2,rgba(0,0,0,.04));border:1px solid var(--line);-webkit-tap-highlight-color:transparent}",
      ".wl-al:hover{box-shadow:var(--shadow)}.wl-al:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".wl-al-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;background:#9fc1d4}",
      ".wl-al.hot{border-color:rgba(192,57,43,.35);background:rgba(242,114,110,.12)}.wl-al.hot .wl-al-dot{background:#d9534f}",
      ".wl-al.warn{border-color:rgba(242,184,75,.6);background:rgba(242,184,75,.16)}.wl-al.warn .wl-al-dot{background:#d97040}",
      ".wl-al-go{font-size:18px;line-height:1;color:var(--muted);margin-left:2px}",
      "@media (max-width:560px){.wl-alerts{flex-direction:column;align-items:stretch;gap:6px;padding:10px}.wl-al-h{margin:0 0 2px 2px}.wl-al{min-height:46px;justify-content:flex-start;border-radius:12px}.wl-al-go{margin-left:auto}}",
      ".wl-hm{margin:0 0 18px;border-color:rgba(242,184,75,.55)}",
      ".wl-hm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}",
      ".wl-hm-head .wl-btn{flex:0 0 auto;text-decoration:none;white-space:nowrap}",
      ".wl-hm-eye{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#b4580f;margin-bottom:4px}",
      "[data-theme=dark] .wl-hm-eye{color:#f2b84b}",
      ".wl-hm-h{margin:0;font-size:20px;line-height:1.25;font-weight:800;color:var(--text)}",
      ".wl-hm-sub{margin:6px 0 0;font-size:13px;line-height:1.5;color:var(--muted)}",
      ".wl-hm-list{margin-top:0}",
      ".wl-hm-h4{margin-top:18px}",
      ".wl-hm-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:14px;align-items:start}",
      ".wl-view{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}",
      ".wl-view-b{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 11px;border-radius:7px;font-size:12.5px;font-weight:800;color:var(--muted);-webkit-tap-highlight-color:transparent}",
      ".wl-view-b:hover{color:var(--text)}.wl-view-b:focus-visible{outline:2px solid var(--coral);outline-offset:1px}",
      ".wl-view-b.on{background:#1b2430;color:#fff}[data-theme=dark] .wl-view-b.on{background:#f2b84b;color:#14202e}",
      ".wl-pg-grid .wl-hm-head{display:flex;flex-direction:row;justify-content:space-between;align-items:center;gap:10px;text-align:left}",
      ".wl-tiles.wl-tiles-list{display:flex;flex-direction:column;gap:8px;overflow:visible;margin:14px 0 0;padding:0;scroll-snap-type:none}",
      ".wl-tiles-list .wl-tile{flex:none;width:100%;align-items:center;padding:10px 12px}",
      ".wl-tiles-list .wl-tl-body{flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:14px;row-gap:3px}",
      ".wl-tiles-list .wl-tl-name{flex:1 0 100%}.wl-tiles-list .wl-tl-pills{margin-top:0}",
      ".wl-tiles-list .wl-art-sm{width:64px}",
      ".wl-fam{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0}",
      ".wl-sum .wl-fam-b{all:unset;box-sizing:border-box;cursor:pointer;min-height:36px;padding:0 14px;display:inline-flex;align-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.28);color:#e6eef6;font-size:13px;font-weight:700;-webkit-tap-highlight-color:transparent}",
      ".wl-sum .wl-fam-b:hover{background:rgba(255,255,255,.1)}.wl-sum .wl-fam-b:focus-visible{outline:2px solid #f2b84b;outline-offset:2px}",
      ".wl-sum .wl-fam-b.on{background:#f2b84b;border-color:#f2b84b;color:#14202e}",
      ".wl-pk-part{font-size:12.5px;color:var(--text)}",
      ".wl-partbtn{all:unset;cursor:pointer;align-self:flex-start;font-size:12px;font-weight:700;color:var(--muted);text-decoration:underline;text-underline-offset:2px;padding:2px 0}.wl-partbtn:hover{color:var(--text)}",
      ".wl-partform{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px}.wl-partform label{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--muted)}",
      ".wl-partform .wl-dollar input{width:96px}",
      ".wl-date.wl-date2{grid-template-columns:1fr 1fr}",
      ".wl-dates .wl-dimtxt{font-size:12.5px;color:var(--muted)}",
      ".wl-dl{list-style:none;margin:0;padding:0}",
      ".wl-dli{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}.wl-dli:first-child{border-top:0}",
      ".wl-dlday{flex:0 0 46px;height:46px;border-radius:10px;background:#1b2430;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}",
      ".wl-dlday b{font-size:17px;font-weight:800}.wl-dlday span{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#f2c766;margin-top:3px}",
      ".wl-dlbody{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}",
      ".wl-dlkind{font-size:11.5px;font-weight:800;color:var(--muted)}.wl-dltext{font-size:13.5px;line-height:1.4;color:var(--text)}.wl-dlusd{font-weight:800}",
      ".k-bonus .wl-dlday,.k-activate .wl-dlday{background:#b4580f}",
      ".wl-dlwhen{flex:0 0 auto;font-size:12px;font-weight:700;color:var(--muted);white-space:nowrap}",
      ".wl-dlwhen.warm{color:#8a4a10}.wl-dlwhen.hot{color:#a3410f}",
      "[data-theme=dark] .wl-dlwhen.warm,[data-theme=dark] .wl-dlwhen.hot{color:#f2b84b}",
      ".wl-withhrt{align-self:flex-start;display:inline-flex;align-items:center;gap:5px;margin-top:3px;font-size:11.5px;font-weight:800;color:#8a5a12;background:rgba(242,199,102,.28);border-radius:999px;padding:2px 9px}",
      "[data-theme=dark] .wl-withhrt{color:#f2c766}",
      ".wl-prehrt{align-self:flex-start;margin-top:3px;font-size:11.5px;font-weight:700;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:1px 9px}",
      ".wl-tl-pill.hrt{color:#8a5a12;background:rgba(242,199,102,.32)}[data-theme=dark] .wl-tl-pill.hrt{color:#f2c766}",
      ".wl-sum .wl-sum-hrt{display:inline-flex;align-items:center;gap:7px;margin:12px 0 0;padding:6px 12px;border-radius:999px;background:rgba(242,199,102,.16);border:1px solid rgba(242,199,102,.45);color:#f2c766;font-size:13px;font-weight:700}",
      ".wl-check{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;color:var(--text)}.wl-check input{width:20px;height:20px}",
      ".wl-hm-grid>.wl-card{margin-bottom:0}.wl-pg-grid{margin-bottom:14px}",
      ".wl-soon-home .wl-cr-total b{font-size:24px}.wl-soon-home .wl-ctab{padding:7px 10px}",
      "@media (max-width:1060px){.wl-hm-grid{grid-template-columns:minmax(0,1fr)}}",
      ".wl-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;margin-top:16px}",
      ".wl-tile{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--surface);transition:box-shadow .15s,transform .15s}",
      ".wl-tl-body{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}",
      ".wl-art{position:relative;flex:0 0 auto;display:block;aspect-ratio:1.586;border-radius:6px;overflow:hidden;box-shadow:0 1px 2px rgba(10,20,35,.25),0 3px 8px rgba(10,20,35,.12)}",
      ".wl-art-sm{width:78px;border-radius:5px}.wl-art-md{width:104px}",
      ".wl-art img{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;width:auto;height:auto;display:block;border-radius:inherit}",
      /* Once the image loads, show all of it (no cropping): the plain card steps aside and the image itself carries the rounded corners and shadow. */
      ".wl-art.wl-art-ok{background:none;box-shadow:none;overflow:visible}.wl-art.wl-art-ok .wl-art-ph{display:none}.wl-art.wl-art-ok img{box-shadow:0 1px 2px rgba(10,20,35,.25),0 3px 8px rgba(10,20,35,.12)}",
      ".wl-art-ph{position:absolute;inset:0;display:flex;align-items:flex-end;padding:0 0 6% 8%;box-sizing:border-box;background:linear-gradient(135deg,var(--tone),#141b24);color:rgba(255,255,255,.85);font:800 8px/1 system-ui,sans-serif;letter-spacing:.08em}",
      ".wl-art-md .wl-art-ph{font-size:9.5px}",
      ".wl-art-ph i{position:absolute;left:9%;top:30%;width:17%;height:21%;border-radius:2px;background:linear-gradient(135deg,#e8d39a,#b8954a);opacity:.9}",
      ".wl-wc-top{display:flex;gap:12px;align-items:flex-start}",
      ".wl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
      ".wl-store{display:block;margin:10px 0 10px}",
      ".wl-store input{box-sizing:border-box;width:100%;max-width:420px;min-height:44px;padding:0 14px;font:inherit;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:12px}",
      ".wl-store input:focus{outline:2px solid var(--coral);outline-offset:1px;border-color:transparent}",
      ".wl-bar{height:8px;border-radius:999px;background:var(--surface-2,rgba(0,0,0,.07));overflow:hidden;margin:8px 0}",
      ".wl-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f2b84b,#d97040)}",
      ".wl-bonus,.wl-keep{margin:12px 0 4px;padding:12px 14px;border-radius:12px;border:1px solid rgba(242,184,75,.55);background:rgba(242,184,75,.10)}",
      ".wl-bonus.done{border-color:rgba(47,133,90,.4);background:rgba(63,206,127,.08)}.wl-bonus.done .wl-bar i{background:#2f855a}",
      ".wl-bonus.missed{border-color:var(--line);background:var(--surface-2,rgba(0,0,0,.04))}",
      ".wl-bonus-top{display:flex;justify-content:space-between;gap:10px;font-size:13.5px;color:var(--text)}.wl-bonus-top span{font-weight:700;color:var(--muted)}",
      ".wl-bonus-line,.wl-keep p{margin:0 0 6px;font-size:13px;line-height:1.5;color:var(--text)}",
      ".wl-keep-h{display:block;font-size:13.5px;color:var(--text);margin-bottom:4px}",
      ".wl-keep p.wl-dimtxt{font-size:12px;color:var(--muted);margin:0}",
      ".wl-bonus-upd{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wl-bonus-upd label{font-size:12.5px;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:8px}",
      ".wl-dollar{display:inline-flex;align-items:center;gap:4px;font-weight:700;color:var(--muted)}",
      ".wl-dollar input{box-sizing:border-box;width:120px;min-height:40px;padding:0 10px;font:inherit;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:10px}",
      ".wl-bonusf{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.wl-bonusf summary{cursor:pointer;font-size:13.5px;font-weight:800;color:var(--text);min-height:28px;display:flex;align-items:center}",
      ".wl-bonusg{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:10px 0 6px}",
      ".wl-bonusg .wl-dollar input{width:100%}.wl-bonusg .wl-dollar{display:flex}",
      ".wl-tile:hover{box-shadow:var(--shadow);transform:translateY(-1px)}",
      ".wl-tile:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".wl-tl-name{font-size:14.5px;font-weight:800;color:var(--text)}",
      ".wl-tl-nick{font-size:11.5px;color:var(--muted);margin-top:-3px}",
      ".wl-tl-fee{font-size:12.5px;color:var(--muted)}",
      ".wl-tl-next{font-size:12.5px;color:var(--text);line-height:1.4}",
      ".wl-tl-next b{font-weight:800}.wl-tl-next b.hot{color:#b4580f}",
      "[data-theme=dark] .wl-tl-next b.hot{color:#f2b84b}",
      ".wl-tl-next.ok{color:#2f855a}",
      "[data-theme=dark] .wl-tl-next.ok{color:#6fd39b}",
      ".wl-tl-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:3px}",
      ".wl-tl-pill{font-size:11px;font-weight:800;color:#8a4a10;background:rgba(242,184,75,.25);border-radius:999px;padding:2px 8px}",
      "[data-theme=dark] .wl-tl-pill{color:#f2b84b}",
      ".wl-tl-pill.soft{color:var(--muted);background:var(--surface-2,rgba(0,0,0,.05))}",
      ".wl-hm-more{display:inline-block;margin-top:10px;font-size:13px;font-weight:800;color:var(--coral);text-decoration:none}",
      ".wl-hm-ok{margin:12px 0 0;font-size:13px;color:var(--muted)}",
      ".wl-hm .wl-banner{margin:12px 0 0}",
      "@media (max-width:560px){.wl-hm-head{flex-direction:column}.wl-hm-h{font-size:18px}}",
      ".wl-h4{margin:16px 0 8px;font-size:14px;font-weight:800;line-height:1.3;color:var(--text)}",
      ".wl-detail .wl-h4:first-child{margin-top:12px}",
      ".wl-earn{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}",
      ".wl-earn li{display:flex;gap:12px;align-items:flex-start;padding:7px 0;border-top:1px dashed var(--line)}",
      ".wl-earn li:first-child{border-top:0}",
      ".wl-rate{flex:0 0 64px;text-align:center;font-size:14px;font-weight:800;color:#1b2430;background:rgba(159,193,212,.28);border-radius:8px;padding:4px 0}",
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
      "@media (max-width:560px){" +
        ".wl-card{padding:15px 14px;border-radius:14px}" +
        ".wl-pk{padding:11px 11px 11px 12px;gap:10px}" +
        ".wl-tick{min-height:44px;padding:0 12px}" +
        ".wl-clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
        ".wl-clamp.full{display:block;-webkit-line-clamp:unset;overflow:visible}" +
        ".wl-tiles{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:10px;margin:14px -14px 0;padding:2px 14px 6px;scrollbar-width:none;-webkit-overflow-scrolling:touch}" +
        ".wl-tiles::-webkit-scrollbar{display:none}" +
        ".wl-tile{flex:0 0 84%;scroll-snap-align:start;scroll-margin-left:14px}" +
        ".wl-tl-pill{font-size:12px}" +
        ".wl-earn li{gap:10px}.wl-rate{flex-basis:52px}" +
        ".wl-btn{min-height:44px}" +
        ".wl-perkbtn{min-height:40px;padding:8px 14px}" +
        ".wl-form select,.wl-form input{min-height:44px;font-size:16px}" +
      "}",
      "@media (max-width:560px){.wl-rowtop{display:grid;grid-template-columns:auto 1fr;gap:8px 12px}.wl-rowtop>.wl-side{grid-column:1/-1}.wl-art-md{width:72px;border-radius:5px}.wl-art-md .wl-art-ph{font-size:7.5px}.wl-side{align-items:flex-start;text-align:left;flex-direction:row;flex-wrap:wrap;gap:8px 12px;align-items:center}.wl-rowacts{margin-left:auto}.wl-date{grid-template-columns:1fr 1fr}.wl-date select:first-child{grid-column:1/-1}}",
      /* ----- My Wallet page, simple layout (Oct 19) ----- */
      ".wl-slim{padding:18px 22px 16px}",
      ".wl-slim .wl-sum-title{font-size:21px;font-weight:800;color:#fff}",
      ".wl-slim .wl-sum-top{margin-bottom:2px}",
      ".wl-slim .wl-fam{margin-top:12px}",
      ".wl-sl-oh{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;line-height:1.4;color:#cfe0ee}.wl-sl-oh b{color:#f5c75a;font-weight:700}",
      ".wl-sl-star{display:inline-flex;flex:0 0 auto;color:#f2b84b}",
      ".wl-sum .wl-sl-strat{margin:-2px 0 12px;font-size:13.5px;line-height:1.45;color:#fff}.wl-sum .wl-sl-strat span{display:block;font-size:11.5px;font-weight:700;letter-spacing:.03em;color:#f5c75a}",
      ".wl-sl-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:14px 0 0;padding-top:12px;border-top:1px solid rgba(255,255,255,.13)}",
      ".wl-sl-stats>div{min-width:0;padding-right:12px}.wl-sl-stats>div+div{padding-left:14px;border-left:1px solid rgba(255,255,255,.13)}",
      ".wl-sum .wl-sl-stats dd{font-size:20px}",
      ".wl-nudge{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;border:1.5px solid rgba(242,184,75,.6);background:linear-gradient(180deg,rgba(242,184,75,.10),var(--surface) 70%)}",
      ".wl-nudge-t{display:flex;flex-direction:column;gap:3px;flex:1 1 300px}.wl-nudge-t b{font-size:15.5px;color:var(--text)}.wl-nudge-t span{font-size:13.5px;line-height:1.5;color:var(--muted)}",
      ".wl-nudge-acts{display:flex;align-items:center;gap:8px}",
      ".wl-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;margin-left:6px;padding:0 7px;border-radius:999px;background:var(--surface-2,rgba(120,130,145,.12));font-size:12.5px;font-weight:800;color:var(--muted);vertical-align:3px}",
      ".wl-clist{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column}",
      ".wl-clist li+li{border-top:1px solid var(--line)}",
      ".wl-crow{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:flex;align-items:center;gap:12px;padding:10px 4px;min-height:60px;border-radius:10px}",
      ".wl-crow:hover{background:var(--surface-2,rgba(120,130,145,.07))}.wl-crow:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".wl-crow .wl-art-sm{width:64px}",
      ".wl-crow-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
      ".wl-crow-main b{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:800;color:var(--text);line-height:1.3}",
      ".wl-crow-main>span{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".wl-crow-main>.wl-crow-flag{align-self:flex-start;margin-top:2px;font-size:11.5px;font-weight:800;color:#b4541f;background:rgba(217,112,64,.12);border-radius:999px;padding:2px 8px}",
      ".wl-crow-flag.st{color:#8a5a10;background:rgba(242,184,75,.2)}.wl-crow-flag.soft{color:var(--muted);background:var(--surface-2,rgba(120,130,145,.12))}",
      "[data-theme=dark] .wl-crow-main>.wl-crow-flag{color:#f4a77c}[data-theme=dark] .wl-crow-flag.st{color:#f2c56b}[data-theme=dark] .wl-crow-main>.wl-crow-flag.soft{color:var(--muted)}",
      ".wl-crow-hrt{display:inline-flex;color:#d9a134}",
      ".wl-crow-go{flex:0 0 auto;font-size:24px;line-height:1;color:var(--muted)}",
      ".wl-cards-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}",
      ".wl-cards-key{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)}",
      ".wl-more-title{margin:22px 0 10px;font-size:13px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}",
      ".wl-more{padding:0;margin-bottom:10px;overflow:hidden}",
      ".wl-more-h{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;min-height:56px}",
      ".wl-more-h:focus-visible{outline:2px solid var(--coral);outline-offset:-2px}",
      ".wl-more-h>span:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}.wl-more-h b{font-size:15.5px;font-weight:800;color:var(--text)}.wl-more-h small{font-size:13px;color:var(--muted)}",
      ".wl-more-i{flex:0 0 30px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--surface-2,rgba(120,130,145,.12));font-size:19px;font-weight:700;color:var(--text)}",
      ".wl-more.open .wl-more-i{background:var(--coral);color:#fff}",
      ".wl-more-in{padding:0 18px 16px}",
      ".wl-more-in .wl-card{border:0;box-shadow:none;background:none;padding:0;margin:0}",
      ".wl-more-in .wl-dates>.wl-head,.wl-more-in .wl-tips>.wl-head,.wl-more-in .wl-card>.wl-head{display:none}",
      ".wl-more-in .wl-wc{margin:0;padding:0;border:0}",
      /* the card sheet: a bottom sheet on phones, a centred panel on bigger screens */
      "html.wl-sheet-open{overflow:hidden}",
      ".wl-sheet-bg{position:fixed;inset:0;z-index:80;background:rgba(10,18,28,.55);animation:wlFade .18s ease-out}",
      ".wl-sheet{position:fixed;z-index:81;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:22px 22px 20px;border-radius:20px;background:var(--surface);color:var(--text);box-shadow:0 30px 70px -20px rgba(5,12,22,.6);animation:wlPop .2s ease-out}",
      "@keyframes wlFade{from{opacity:0}to{opacity:1}}@keyframes wlPop{from{opacity:0;transform:translate(-50%,-47%)}to{opacity:1;transform:translate(-50%,-50%)}}",
      ".wl-sheet-x{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;border:0;background:var(--surface-2,rgba(120,130,145,.12));color:var(--text);font-size:24px;line-height:1;cursor:pointer}",
      ".wl-sheet .wl-form{margin:0}.wl-sheet .wl-h3{padding-right:44px}",
      ".wl-sh-top{display:flex;align-items:center;gap:14px;padding-right:44px}",
      ".wl-sh-id{display:flex;flex-direction:column;gap:3px;min-width:0}.wl-sh-name{font-size:19px;font-weight:800;line-height:1.25}.wl-sh-sub{font-size:13.5px;color:var(--muted)}",
      ".wl-sh-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.wl-sh-tags>span{margin-top:0}",
      ".wl-withhrt svg{flex:0 0 auto}",
      ".wl-sh-facts{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:16px 0 0;border:1px solid var(--line);border-radius:14px;overflow:hidden}",
      ".wl-sh-facts>div{padding:10px 14px;border-bottom:1px solid var(--line);min-width:0}.wl-sh-facts>div:nth-child(odd){border-right:1px solid var(--line)}",
      ".wl-sh-facts dt{font-size:12px;color:var(--muted);margin:0 0 2px}.wl-sh-facts dd{margin:0;font-size:15px;font-weight:700}.wl-sh-facts dd.miss{color:var(--muted);font-weight:600}",
      ".wl-sh-hint{margin:10px 0 0;font-size:13.5px;color:var(--muted)}",
      ".wl-sh-acts{display:flex;align-items:center;gap:12px;margin:16px 0 12px}",
      ".wl-link.wl-danger{color:#b83a32}[data-theme=dark] .wl-link.wl-danger{color:#f6a7a3}",
      ".wl-sheet .wl-more{border:1px solid var(--line);box-shadow:none;border-radius:14px;margin:10px 0 0}",
      ".wl-sheet .wl-more-h{padding:12px 14px;min-height:52px}.wl-sheet .wl-more-in{padding:0 14px 12px}",
      /* card search in Add a card */
      ".wl-pick-list{list-style:none;margin:8px 0 0;padding:4px;max-height:248px;overflow:auto;border:1px solid var(--line);border-radius:12px}",
      ".wl-pick-i{all:unset;box-sizing:border-box;cursor:pointer;width:100%;display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:9px;min-height:48px}",
      ".wl-pick-i:hover{background:var(--surface-2,rgba(120,130,145,.08))}.wl-pick-i:focus-visible{outline:2px solid var(--coral)}",
      ".wl-pick-i.on{background:rgba(217,112,64,.12);box-shadow:inset 0 0 0 1.5px var(--coral)}",
      ".wl-pick-i .wl-art-sm{width:52px}",
      ".wl-pick-t{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}.wl-pick-t b{font-size:14px;color:var(--text)}.wl-pick-t span{font-size:12.5px;color:var(--muted)}",
      ".wl-pick-ok{opacity:0;color:var(--coral);font-weight:800}.wl-pick-i.on .wl-pick-ok{opacity:1}",
      ".wl-pick-plus{flex:0 0 52px;width:52px;aspect-ratio:1.586;border-radius:5px;border:1.5px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--muted)}",
      ".wl-pick-none{padding:10px;font-size:13.5px;color:var(--muted)}",
      ".wl-pick-cur{display:flex;align-items:center;gap:10px;margin:4px 0 10px}.wl-pick-cur .wl-art-sm{width:56px}.wl-pick-cur b{font-size:15px}",
      ".wl-form small.wl-help{display:block;border:0;padding:0;margin:4px 0 0;background:none;box-shadow:none;font-size:12.5px;color:var(--muted)}",
      ".wl-formmore{border:1px solid var(--line);border-radius:12px;padding:0 12px}.wl-formmore>summary{cursor:pointer;padding:12px 0;font-size:14px;font-weight:800;color:var(--text)}",
      ".wl-formmore-in{display:flex;flex-direction:column;gap:12px;padding:0 0 12px}",
      /* Check my cards */
      ".wl-rvlist{list-style:none;margin:10px 0 0;padding:0}",
      ".wl-rv{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px 12px;padding:10px 0;border-top:1px solid var(--line)}",
      ".wl-rv .wl-art-sm{width:56px}.wl-art-blank{background:var(--surface-2,rgba(120,130,145,.15))}",
      ".wl-rv-main{display:flex;flex-direction:column;gap:1px;min-width:0}.wl-rv-main b{font-size:14.5px}.wl-rv-main span{font-size:12.5px;color:var(--muted)}",
      ".wl-rv.miss .wl-rv-main span{color:#b4541f;font-weight:700}[data-theme=dark] .wl-rv.miss .wl-rv-main span{color:#f4a77c}",
      ".wl-rv-date{display:flex;gap:6px}.wl-rv-date select{font:inherit;font-size:14px;min-height:40px;padding:0 8px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--text)}",
      ".wl-rv.miss select{border-color:rgba(217,112,64,.7)}",
      "@media (max-width:560px){" +
        ".wl-slim{padding:16px 16px 14px}.wl-slim .wl-sum-title{font-size:19px}.wl-slim .wl-sum-top .wl-btn{flex:0 0 auto;min-height:40px;padding:0 12px;font-size:13.5px}" +
        ".wl-sl-oh{font-size:12.5px;align-items:flex-start}.wl-sum .wl-sl-strat{font-size:13px}" +
        ".wl-sum .wl-sl-stats dd{font-size:17px}.wl-sl-stats>div+div{padding-left:10px}.wl-sl-stats>div{padding-right:8px}" +
        ".wl-sheet{top:auto;bottom:0;left:0;right:0;transform:none;width:100%;max-height:88vh;border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom));animation:wlUp .22s ease-out}" +
        ".wl-sh-facts{grid-template-columns:1fr 1fr}" +
        ".wl-rv{grid-template-columns:auto 1fr auto}.wl-rv-date{grid-column:1/-1}.wl-rv-date select{flex:1;min-height:44px;font-size:16px}" +
        ".wl-cards-foot{flex-wrap:wrap}" +
      "}",
      "@keyframes wlUp{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}",
      "@media (prefers-reduced-motion:reduce){.wl-sheet,.wl-sheet-bg{animation:none}}",
      /* ----- ʻOhana Wallet (Oct 25): premium header for ʻOhana Members ----- */
      ".wl-sum.wl-ow{border:0;padding-top:20px;background:radial-gradient(900px 260px at 92% -40%,rgba(242,199,102,.30),transparent 60%),radial-gradient(700px 220px at -10% 120%,rgba(217,112,64,.20),transparent 60%),linear-gradient(135deg,#141b24,#1b2430 55%,#232f3e);box-shadow:0 0 0 1.5px rgba(242,184,75,.75),0 0 0 5px rgba(242,184,75,.10),0 22px 46px -22px rgba(9,20,35,.85)}",
      ".wl-sum.wl-ow:before{content:'';position:absolute;left:0;right:0;top:0;height:3px;background:linear-gradient(90deg,#b98a2e,#f5d27a 30%,#f2b84b 60%,#d97040);pointer-events:none}",
      ".wl-ow-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px}",
      ".wl-sum .wl-ow-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;background:linear-gradient(90deg,#f5d27a,#f2b84b);-webkit-background-clip:text;background-clip:text;color:transparent}",
      ".wl-ow-eyebrow .wl-sl-star svg{width:15px;height:15px}",
      ".wl-sum .wl-ow-managed{flex:0 0 auto;font-size:11.5px;font-weight:800;letter-spacing:.02em;color:#1b2430;background:linear-gradient(135deg,#f5d27a,#f2b84b);border-radius:999px;padding:5px 11px;box-shadow:0 2px 10px -2px rgba(242,184,75,.55)}",
      ".wl-sum.wl-ow .wl-sum-title{font-size:24px;letter-spacing:-.01em}",
      ".wl-sum .wl-ow-sub{margin:4px 0 0;font-size:13px;color:#c9d6e3}",
      ".wl-sum .wl-ow-strat{display:flex;flex-direction:column;gap:2px;margin:12px 0 2px;padding:10px 14px;border-radius:12px;background:linear-gradient(90deg,rgba(242,199,102,.14),rgba(255,255,255,.04));border:1px solid rgba(242,199,102,.30)}",
      ".wl-sum .wl-ow-strat span{font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#f5c75a}.wl-sum .wl-ow-strat b{font-size:14.5px;font-weight:600;line-height:1.45;color:#fff}",
      ".wl-sum.wl-ow .wl-sl-stats{border-top-color:rgba(242,199,102,.25)}.wl-sum.wl-ow .wl-sl-stats>div+div{border-left-color:rgba(242,199,102,.22)}",
      ".wlm-ow{display:inline-flex;margin-right:6px;color:#f2b84b;vertical-align:-2px}",
      ".wl-help .wl-help-eyebrow svg{width:12px;height:12px;vertical-align:-1px;color:#d9a134}",
      ".wl-ow-row{display:flex;align-items:center;gap:14px;margin:12px 0 2px}.wl-ow-row .wl-ow-strat{flex:1 1 auto;margin:0;min-width:0}",
      ".wl-ow-acts{display:flex;justify-content:flex-end;gap:10px;margin-left:auto;flex:0 0 auto}",
      ".wl-sum .wl-ow-acts .wl-btn{min-height:44px;justify-content:center;gap:8px;padding:0 18px;font-size:14px}",
      ".wl-sum .wl-ow-text{text-decoration:none;border-color:rgba(242,199,102,.55);color:#f5d27a}.wl-sum .wl-ow-text:hover{background:rgba(242,199,102,.12)}",
      "@media (max-width:560px){.wl-sum.wl-ow .wl-sum-title{font-size:20px}.wl-ow-top{flex-wrap:wrap}" +
        ".wl-ow-row{flex-direction:column;align-items:stretch;gap:10px}.wl-ow-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-left:0}.wl-sum .wl-ow-acts .wl-btn{padding:0 10px;font-size:14px;white-space:nowrap}}"
    ].join("");
    document.head.appendChild(s);
  }

  if (window.addEventListener) window.addEventListener("hrt:member", function () { try { paint(); } catch (e) {} });

  window.HRT_WALLET = {
    connectData: connectData,
    /* load the wallet without showing it, so other tools can use it (called by app.js once signed in) */
    ensure: function () { if (!state.wallet && !state.loading) load(); },
    _test: { importantDates: importantDates, nextFeeDate: nextFeeDate, holderList: holderList, valueTextX: function (v) { return valueText(v); }, creditGroups: creditGroups, findStore: findStore, STORES: STORES, usedThisCardYear: usedThisCardYear, cardYearStart: cardYearStart, bonusState: bonusState, artHtml: artHtml, parseOpened: parseOpened, nextRenewal: nextRenewal, isFuture: isFuture, summarize: summarize,
      whenText: whenText, renewalText: renewalText, money: money,
      perkPeriod: perkPeriod, perkRows: perkRows, expiringSoon: expiringSoon, pruneUsed: pruneUsed,
      perkAmount: perkAmount, perkYearUsd: perkYearUsd, isTracked: isTracked, state: state,
      shortName: shortName, cardBrief: cardBrief, topAlerts: topAlerts,
      whichCard: whichCard, exampleWallet: exampleWallet, centsPer: centsPer, valueText: valueText, SPEND: SPEND,
      rateText: rateText, earningFor: earningFor, quartersFor: quartersFor, quarterName: quarterName },
    show: function (sub) {
      state.tab = sub === "cards" || sub === "credits" ? sub : "overview";
      styles();
      host = document.getElementById("wl-host");
      if (host && !host.getAttribute("data-ready")) {
        host.setAttribute("data-ready", "1");
        host.addEventListener("click", onClick);
        host.addEventListener("change", onChange);
        host.addEventListener("input", onInput);
        document.addEventListener("keydown", function (ev) {
          if (ev.key === "Escape" && (state.sel || state.editing) && host.querySelector(".wl-sheet")) { state.sel = null; state.editing = null; paint(); }
        });
      }
      if (!state.wallet && !state.loading) load(); else paint();
    },
    /* the Dashboard home panel; shares the same wallet and the same safe saves */
    home: function () {
      styles();
      homeHost = document.getElementById("wl-home");
      alertHost = document.getElementById("wl-summary");
      miniHost = document.getElementById("wl-mini");
      if (miniHost && !miniHost.getAttribute("data-ready")) {
        miniHost.setAttribute("data-ready", "1");
        miniHost.addEventListener("click", onClick);
        miniHost.addEventListener("change", onChange);
      }
      if (alertHost && !alertHost.getAttribute("data-ready")) {
        alertHost.setAttribute("data-ready", "1");
        alertHost.addEventListener("click", onClick);
      }
      if (homeHost && !homeHost.getAttribute("data-ready")) {
        homeHost.setAttribute("data-ready", "1");
        homeHost.addEventListener("click", onClick);
        homeHost.addEventListener("change", onChange);
        homeHost.addEventListener("input", onInput);
      }
      if (!state.wallet && !state.loading) load(); else paint();
    }
  };
})();
