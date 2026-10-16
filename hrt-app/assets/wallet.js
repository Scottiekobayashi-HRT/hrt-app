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
      if (!cards[e.cardId] || !isHeld(e)) return;
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
    g.forEach(function (x) { x.usd = x.rows.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.perk.amount : 0); }, 0); });
    return g.filter(function (x) { return x.rows.length; });
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
      openUsd: credits.reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.perk.amount : 0); }, 0),
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
      var usd = urgent.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.perk.amount : 0); }, 0);
      var d0 = urgent[0].period.days;
      out.push({ level: "hot", id: null, text: (usd ? money(usd) + " in credits" : urgent.length + " credits") + " expire" +
        (d0 === 0 ? " today" : d0 === 1 ? " by tomorrow" : " within " + urgent[urgent.length - 1].period.days + " days") });
    }
    // 2. annual fees coming due (30 days)
    s.rows.filter(function (r) { return r.hasFee && r.renewal && r.renewal.days <= 30; }).forEach(function (r) {
      out.push({ level: "warn", id: r.entry.id, text: shortName(r.card.name) + " renews " +
        (r.renewal.days === 0 ? "today" : "in " + r.renewal.days + (r.renewal.days === 1 ? " day" : " days")) + ", " + money(r.card.fee) + " fee" });
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
      var mUsd = month.reduce(function (a, r) { return a + (r.perk.unit === "usd" ? r.perk.amount : 0); }, 0);
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
    var sapphire = held.some(function (e) { return /^chase-sapphire/.test(e.cardId); });
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
      if (best) out.push(best);
    });
    return out.sort(function (a, b) { return b.value - a.value || a.card.name.localeCompare(b.card.name); });
  }
  function valueText(v) { var n = Math.round(v * 10) / 10; return "worth about " + (n % 1 ? n.toFixed(1) : n) + "% back"; }

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
      c("ascent", "atmos-ascent", "2019-02", "Spouse's card")
    ] };
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
    var cat = catalog().cards.slice().sort(function (a, b) { return a.issuer.localeCompare(b.issuer) || a.name.localeCompare(b.name); });
    var groups = {}, order = [];
    cat.forEach(function (c) { if (!groups[c.issuer]) { groups[c.issuer] = []; order.push(c.issuer); } groups[c.issuer].push(c); });
    var o = entry ? parseOpened(entry.opened) : null, t = todayParts();
    var opts = '<option value="">Choose a card</option>' + order.map(function (iss) {
      return '<optgroup label="' + esc(iss) + '">' + groups[iss].map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (entry && entry.cardId === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>";
      }).join("") + "</optgroup>";
    }).join("") + '<option value="custom"' + (entry && entry.cardId === "custom" ? " selected" : "") + ">Other card (not on this list)</option>";
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
    return '<form class="wl-form" id="wlForm" novalidate>' +
      '<h3 class="wl-h3">' + (entry ? "Edit card" : "Add a card") + "</h3>" +
      '<label class="wl-lab">Card<select id="wlCard" required' + (entry ? " disabled" : "") + ">" + opts + "</select></label>" +
      '<div class="wl-custom" id="wlCustom"' + (entry && entry.cardId === "custom" ? "" : " hidden") + ">" +
      '<label class="wl-lab">Card name<input id="wlCName" maxlength="60" placeholder="e.g. Chase Ink Business Preferred" value="' + esc(cu.name || "") + '"></label>' +
      '<label class="wl-lab">Bank (optional)<input id="wlCIssuer" maxlength="40" placeholder="e.g. Chase" value="' + esc(cu.issuer || "") + '"></label>' +
      '<label class="wl-lab">Annual fee<span class="wl-dollar">$<input id="wlCFee" type="number" inputmode="decimal" min="0" step="1" placeholder="0" value="' + (cu.fee != null ? cu.fee : "") + '"></span></label></div>' +
      '<div class="wl-two"><label class="wl-lab">Whose card (optional)<input id="wlHolder" maxlength="30" placeholder="e.g. Janice" value="' + esc(entry && entry.holder || "") + '"></label>' +
      '<label class="wl-lab">Status (optional)<select id="wlStatus">' + stOpts + "</select></label></div>" +
      '<div class="wl-lab">When did you open it?<div class="wl-date">' +
      '<select id="wlMonth" aria-label="Month opened">' + months + "</select>" +
      '<select id="wlDay" aria-label="Day opened">' + days + "</select>" +
      '<select id="wlYear" aria-label="Year opened">' + years + "</select></div>" +
      '<small class="wl-help">Month and year are enough. Add the day for an exact renewal date. Not sure, or not opened yet? Leave it blank.</small></div>' +
      '<label class="wl-lab">Next step (optional)<textarea id="wlNote" maxlength="500" rows="2" placeholder="e.g. Call Capital One in December to switch to the no-fee VentureOne">' + esc(entry && entry.note || "") + "</textarea></label>" +
      '<label class="wl-lab">Nickname (optional)<input id="wlNick" maxlength="40" placeholder="e.g. Business card, Spouse\'s card" value="' + esc(entry && entry.nickname || "") + '"></label>' +
      bonusFields(entry) +
      '<p class="wl-err" id="wlFormErr" role="alert"></p>' +
      '<div class="wl-acts"><button class="wl-btn wl-pri" type="submit"' + (state.busy ? " disabled" : "") + ">" + (state.busy ? "Saving" : entry ? "Save changes" : "Add card") + "</button>" +
      '<button class="wl-btn" type="button" data-wl="cancel">Cancel</button></div></form>';
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
    if (!cardId) return { err: "Choose which card." };
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
    return { cardId: cardId, opened: opened, nickname: $("wlNick").value.trim().slice(0, 40), bonus: bn.bonus, custom: custom,
      holder: $("wlHolder").value.trim().slice(0, 30), status: status, note: $("wlNote").value.trim().slice(0, 500) };
  }
  /* Copy the optional fields onto a saved card, dropping empty ones. */
  function applyExtras(c, v) {
    ["holder", "status", "note"].forEach(function (k) { if (v[k]) c[k] = v[k]; else delete c[k]; });
    if (v.custom) c.custom = v.custom;
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
    var renewLine = r.hasFee && rn ? "Renews " + esc(renewalText(rn)) : r.hasFee ? "Add the date you opened it to see when the fee renews" : opTxt ? "Opened " + esc(opTxt) : "Open date not added";
    var html = '<li class="wl-row' + (soon ? " wl-soon" : "") + '" data-entry="' + esc(e.id) + '"><div class="wl-rowtop">' +
      artHtml(c, "md") + '<div class="wl-main"><b class="wl-name">' + esc(c.name) + "</b>" +
      '<span class="wl-sub">' + esc([e.holder ? e.holder + "\u2019s card" : "", c.issuer, e.nickname].filter(Boolean).join(" \u00b7 ")) + "</span>" +
      '<span class="wl-meta">' + renewLine + (r.hasFee && rn && opTxt ? ' <span class="wl-dot">&middot;</span> Opened ' + esc(opTxt) : "") + "</span>" +
      statusHtml(e) +
      valueLine(credits, other) +
      "</div>" +
      '<div class="wl-side"><span class="wl-fee">' + esc(feeLine) + "</span>" +
      (r.hasFee ? '<span class="wl-when' + (soon ? " on" : "") + '">' + esc(whenText(rn)) + "</span>" : "") +
      '<span class="wl-rowacts"><button class="wl-link" data-wl="edit" data-id="' + esc(e.id) + '">Edit</button>' +
      '<button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></span></div></div>';
    html += noteHtml(e) + bonusHtml(e) + (r.hasFee && rn && rn.days <= SOON_DAYS ? keepHtml(r) : "");
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

  function creditItem(r) {
    var b = r.perk, p = r.period, lvl = p.days <= 7 ? " hot" : p.days <= 14 ? " warm" : "";
    return '<li class="wl-pk' + lvl + '"><div class="wl-pk-main"><div class="wl-pk-top"><b>' + esc(b.label) + "</b>" +
      '<span class="wl-pk-amt">' + esc(b.unit === "usd" ? money(b.amount) : perkAmount(b)) + "</span></div>" +
      '<div class="wl-pk-when">' + esc(shortName(r.card.name)) + (r.entry.nickname ? " (" + esc(r.entry.nickname) + ")" : "") + " &middot; " +
      (p.activateBy ? "Activate by " : "Use by ") + esc(dayText(p.end)) + (p.approx ? " or earlier" : "") +
      ' <span class="wl-pk-days' + lvl + '">' + esc(daysLeft(p.days)) + "</span></div>" +
      (b.type === "activation" ? rotatingLine(b.card) : "") +
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
    var limit = home ? 4 : 6, shown = state.showAllSoon && !home ? sel.rows : sel.rows.slice(0, limit);
    return '<section class="wl-card wl-soonbox' + (home ? " wl-soon-home" : "") + '"><div class="wl-cr-head"><div><h3 class="wl-cr-title">Credits to use</h3>' +
      '<p class="wl-cr-sub">' + (home ? "Soonest first. Tick each one once you use it." : "Everything you have not used yet, soonest first. Tick each one once you use it.") + "</p></div>" +
      (total ? '<div class="wl-cr-total"><b>' + esc(money(total)) + "</b><span>left to use</span></div>" : "") + "</div>" + tabs +
      '<ul class="wl-pks wl-pks-soon">' + shown.map(creditItem).join("") + "</ul>" +
      (home ? (sel.rows.length > limit ? '<a class="wl-hm-more" href="#wallet" data-route="wallet">See all ' + sel.rows.length + " in My Wallet</a>" : "") :
        sel.rows.length > limit ? '<button class="wl-perkbtn" data-wl="allsoon">' + (state.showAllSoon ? "Show fewer" : "Show all " + sel.rows.length) + "</button>" : "") +
      "</section>";
  }

  function paint() { paintMain(); paintHome(); paintAlerts(); }

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
    var s = summarize(state.wallet, catalog());
    if (!s.count) { homeHost.innerHTML = ""; return; } /* the summary card above invites them to start */
    var perks = perkRows(state.wallet, catalog());
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
  function tilesHtml(s, perks) {
    return '<div class="wl-tiles">' + s.rows.map(function (row) {
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
      if (bf.open > 1) pills += '<span class="wl-tl-pill soft">' + bf.open + " credits open</span>";
      return '<button class="wl-tile" data-wl="go-card" data-id="' + esc(e.id) + '">' + artHtml(c, "sm") +
        '<span class="wl-tl-body"><span class="wl-tl-name">' + esc(shortName(c.name)) + "</span>" +
        (e.nickname || e.holder ? '<span class="wl-tl-nick">' + esc([e.holder, e.nickname].filter(Boolean).join(" · ")) + "</span>" : "") +
        (e.status && e.status !== "keep" ? '<span class="wl-tl-status st-' + esc(e.status) + '">' + esc(STATUS_LABEL[e.status] || "") + "</span>" : "") + lines +
        (pills ? '<span class="wl-tl-pills">' + pills + "</span>" : "") + "</span></button>";
    }).join("") + "</div>";
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
    var list = whichCard(state.wallet, catalog(), k, null, null, { visaOnly: st && st.visaOnly });
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
  function summaryHtml(where) {
    var home = where === "home";
    if (!state.wallet || state.error) return "";
    var s = summarize(state.wallet, catalog());
    var title = home ? "Your wallet" : "My Wallet";
    if (!s.count) {
      return '<section class="wl-sum wl-sum-empty" aria-label="' + title + '">' + exampleBanner() +
        '<h2 class="wl-sum-title">' + title + "</h2>" +
        '<p class="wl-sum-lede">Add the cards you hold and see, in one place, what each one costs, what it gives back, and which credits to use before they reset.</p>' +
        '<div class="wl-sum-acts"><button class="wl-btn wl-gold" data-wl="' + (home ? "go-add" : "add") + '">Add your cards</button>' +
        '<button class="wl-btn wl-ghost" data-wl="demo">See an example</button></div></section>';
    }
    var perks = perkRows(state.wallet, catalog());
    var credits = perks.reduce(function (t, r) { return t + perkYearUsd(r.perk); }, 0);
    var soon = expiringSoon(perks, SOON_PERK_DAYS);
    var due = soon.reduce(function (t, r) { return t + (r.perk.unit === "usd" ? r.perk.amount : 0); }, 0);
    var later = expiringSoon(perks, 100000).filter(function (r) { return r.perk.unit === "usd"; });
    var laterUsd = later.reduce(function (t, r) { return t + r.perk.amount; }, 0);
    var alerts = topAlerts(state.wallet, catalog()).filter(function (a) { return a.level !== "info"; });
    var nx = s.next;
    var stat = function (label, value, sub) {
      return '<div class="wl-sum-stat"><dt>' + label + "</dt><dd>" + value + (sub ? "<small>" + sub + "</small>" : "") + "</dd></div>";
    };
    var html = '<section class="wl-sum" aria-label="' + title + '">' + exampleBanner() +
      '<div class="wl-sum-top"><h2 class="wl-sum-title">' + title + "</h2>" +
      (home ? '<a class="wl-btn wl-ghost" href="#wallet" data-route="wallet">Open My Wallet</a>'
            : (state.editing ? "" : '<button class="wl-btn wl-ghost" data-wl="add">Add a card</button>')) + "</div>" +
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

  function paintMain() {
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
    var html = summaryHtml("page");
    if (state.msg) html += '<p class="wl-banner" role="alert">' + esc(state.msg) + "</p>";
    if (state.editing) html += '<div class="wl-card">' + formHtml(editingEntry) + "</div>";

    if (!s.count && !(s.upcoming || []).length && !state.editing) {
      /* the summary card above invites them to add cards */
    } else if (s.count) {
      if (!state.editing) html += '<div class="wl-hm-grid wl-pg-grid"><div class="wl-card wl-hm"><div class="wl-hm-head"><h2 class="wl-hm-h">Your cards</h2></div>' +
        tilesHtml(s, perks) + whichHtml() + "</div>" + (soonHtml(perks) || soonHtml(perks, true)) + "</div>";
      html += '<div class="wl-card"><div class="wl-head"><h3 class="wl-h3">Card details</h3></div>' +
        (s.soon ? '<p class="wl-note">' + s.soon + (s.soon === 1 ? " card renews" : " cards renew") + " in the next " + SOON_DAYS + " days. Now is the time to decide: keep it, ask for a retention offer, or downgrade.</p>" : "") +
        '<ul class="wl-list">' + s.rows.map(function (r) { return rowHtml(r, perks); }).join("") + "</ul></div>";
    }
    html += upcomingHtml(s.upcoming || []);
    var checked = catalog().cards.length ? catalog().cards.map(function (c) { return c.checked; }).sort()[0] : "";
    html += '<p class="wl-foot">Fees and credits come from each issuer\'s own website' + (checked ? ", checked " + esc(fmtIso(checked)) : "") +
      '. Where an issuer does not say when a credit resets, we show calendar periods. Renewal is your card anniversary; most issuers bill the fee on the statement after it. Your wallet is private to your account.</p>';
    host.innerHTML = html;
    if (state.editing) bindForm(editingEntry);
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
    var sel = $("wlCard"), box = $("wlCustom");
    if (sel && box) sel.addEventListener("change", function () { box.hidden = sel.value !== "custom"; if (!box.hidden) $("wlCName").focus(); });
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
    if (!b || !((host && host.contains(b)) || (homeHost && homeHost.contains(b)) || (alertHost && alertHost.contains(b)))) return;
    var act = b.getAttribute("data-wl"), id = b.getAttribute("data-id");
    if (act === "use") return; /* handled on change */
    if (act === "clamp") { if (ev.target.closest("a")) return; b.classList.toggle("full"); return; }
    if (act === "retry") return load();
    if (act === "demo") { startExample(); if (location.hash !== "#home" && location.hash !== "#wallet") location.hash = "wallet"; return; }
    if (act === "demo-off") { endExample(); return; }
    if (act === "which") { var k = b.getAttribute("data-key"); state.which = (state.which === k && !state.storeQ) ? "" : k; state.storeQ = ""; paint(); return; }
    if (act === "go-wallet") { location.hash = "wallet"; return; }
    if (act === "go-card") { state.open[id] = true; state.focus = id; state.editing = null; if (location.hash === "#wallet") paint(); else location.hash = "wallet"; return; }
    if ((act === "go-add" || act === "add") && state.demo) { endExample(); state.editing = "new"; if (act === "go-add") location.hash = "wallet"; return; }
    if (act === "go-add") { state.editing = "new"; state.msg = ""; location.hash = "wallet"; return; }
    if (act === "add") { state.editing = "new"; state.msg = ""; paint(); host.scrollIntoView({ block: "nearest" }); return; }
    if (act === "cancel") { state.editing = null; paint(); return; }
    if (act === "edit") { state.editing = id; state.msg = ""; paint(); return; }
    if (act === "perks") { state.open[id] = !state.open[id]; paint(); return; }
    if (act === "bonus-save") {
      var inp = b.parentNode.querySelector("[data-wl-spent]"), amt = inp ? +inp.value : NaN;
      if (!(amt >= 0) || amt > 10000000) { if (inp) inp.focus(); return; }
      amt = Math.round(amt * 100) / 100;
      save(function (w) { w.cards.forEach(function (k) { if (k.id === id && k.bonus) k.bonus.spent = amt; }); });
      return;
    }
    if (act === "bonus-remove") { save(function (w) { w.cards.forEach(function (k) { if (k.id === id) delete k.bonus; }); }); return; }
    if (act === "ctab") { state.creditTab = b.getAttribute("data-key"); state.showAllSoon = false; paint(); return; }
    if (act === "allsoon") { state.showAllSoon = !state.showAllSoon; paint(); return; }
    if (act === "remove") {
      var e = state.wallet.cards.filter(function (c) { return c.id === id; })[0];
      var c = e && cardFor(e, catalog().cards.reduce(function (m, k) { m[k.id] = k; return m; }, {}));
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
      ".wl-status.st-min-spend,.wl-status.st-min-spend-almost{background:rgba(232,130,76,.15);color:#b4541f}",
      ".wl-status.st-cancel,.wl-status.st-closed{background:rgba(120,130,145,.16);color:var(--muted)}",
      ".wl-status.st-next{background:rgba(28,61,90,.12);color:#1c3d5a}",
      "[data-theme=dark] .wl-status{color:#8fe0b4}[data-theme=dark] .wl-status.st-keep-for-now,[data-theme=dark] .wl-status.st-downgrade{color:#f2c56b}[data-theme=dark] .wl-status.st-min-spend,[data-theme=dark] .wl-status.st-min-spend-almost{color:#f4a77c}[data-theme=dark] .wl-status.st-next{color:#9fc1d4;background:rgba(159,193,212,.14)}",
      ".wl-next{display:flex;flex-direction:column;gap:2px;margin:10px 0 0;padding:9px 12px;border-left:3px solid var(--coral);border-radius:0 10px 10px 0;background:rgba(232,130,76,.07);font-size:13.5px;line-height:1.45;color:var(--text)}",
      ".wl-next b{font-size:11.5px;font-weight:800;color:var(--coral-d,#d06a34)}",
      ".wl-up .wl-name{color:var(--muted)}",
      ".wl-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.wl-two{grid-template-columns:1fr}}",
      ".wl-custom{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;padding:12px;border:1px dashed var(--line);border-radius:12px}.wl-custom[hidden]{display:none}@media(max-width:560px){.wl-custom{grid-template-columns:1fr}}",
      ".wl-form textarea{font:inherit;font-size:14px;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,var(--surface));color:var(--text);resize:vertical;min-height:60px}",
      ".wl-tl-status{display:inline-block;align-self:flex-start;font-size:11px;font-weight:800;color:#b4541f}",
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
      ".wl-tag.warn{border-color:rgba(232,130,76,.5);color:#b4580f}",
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
      ".wl-ctab.on{background:#1c3d5a;border-color:#1c3d5a;box-shadow:inset 0 -3px 0 #e0aa48}.wl-ctab.on b{color:#fff}.wl-ctab.on span{color:#f2c766}",
      "[data-theme=dark] .wl-ctab.on{background:#f2b84b;border-color:#f2b84b}[data-theme=dark] .wl-ctab.on b,[data-theme=dark] .wl-ctab.on span{color:#14202e}",
      ".wl-pks-soon .wl-pk{background:var(--surface);border:1px solid rgba(201,151,58,.22)}",
      ".wl-pk.warm{box-shadow:inset 3px 0 0 #f2b84b}.wl-pk.hot{box-shadow:inset 3px 0 0 #e8824c}",
      ".wl-pk-days.warm,.wl-pk-days.hot{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px}",
      ".wl-pk-days.warm{background:rgba(242,184,75,.25);color:#8a4a10}.wl-pk-days.hot{background:rgba(232,130,76,.2);color:#a3410f}",
      "[data-theme=dark] .wl-pk-days.warm,[data-theme=dark] .wl-pk-days.hot{color:#f2b84b}",
      ".wl-demo{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;margin:0 0 12px;padding:9px 12px;border-radius:12px;background:rgba(159,193,212,.22);border:1px dashed rgba(28,61,90,.35);font-size:13px;color:var(--text)}",
      ".wl-demo .wl-btn{min-height:36px;padding:6px 12px}",
      ".wl-hm-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.wl-hm-acts.wl-center{justify-content:center}",
      /* ---- wallet summary card: navy with a gold edge, like a premium card ---- */
      ".wl-sum{position:relative;overflow:hidden;margin:0 0 18px;padding:22px 24px 20px;border-radius:20px;color:#eef4fa;" +
        /* photo at the back, the welcome tile's navy to blue gradient over it (strong, so text stays easy to read), soft light top right */
        "background:radial-gradient(1100px 320px at 88% -50%,rgba(159,193,212,.42),transparent 60%)," +
          "linear-gradient(120deg,rgba(14,27,44,.93),rgba(22,38,61,.88) 52%,rgba(29,51,80,.84))," +
          "url('" + SUMMARY_PHOTO + "') center 60%/cover no-repeat,#16263d;" +
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
      ".wl-sum .wl-sum-fee{position:absolute;top:-5px;bottom:-5px;width:4px;margin-left:-2px;border-radius:2px;background:#f2b84b;box-shadow:0 0 0 2px #10243a}",
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
      ".wl-sum .wl-btn.wl-gold{background:linear-gradient(90deg,#f2b84b,#e8824c);border-color:transparent;color:#14202e}",
      ".wl-sum .wl-sum-lede{margin:10px 0 0;max-width:56ch;font-size:15px;line-height:1.55;color:#cfe0ee}",
      ".wl-sum .wl-sum-acts{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}",
      ".wl-sum .wl-demo{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.3);color:#eef4fa}",
      ".wl-hm .wl-hm-head{align-items:center}.wl-hm .wl-hm-h{font-size:17px}",
      "@media (max-width:560px){.wl-sum{padding:18px 16px 16px;border-radius:18px}" +
        ".wl-sum .wl-sum-stats{grid-template-columns:1fr 1fr}" +
        ".wl-sum .wl-sum-stat:nth-child(odd){padding-left:0;border-left:0}" +
        ".wl-sum .wl-sum-stat:nth-child(n+3){border-top:1px solid rgba(255,255,255,.13);margin-top:10px}" +
        ".wl-sum dd{font-size:19px}.wl-sum .wl-btn{min-height:44px}}",
      ".wl-wc-h{margin-top:18px}.wl-card > .wl-wc .wl-wc-h{margin-top:0;margin-bottom:12px;font-size:19px}.wl-card.wl-hm > .wl-wc .wl-wc-h{margin-top:22px}",
      ".wl-chips{display:flex;flex-wrap:wrap;gap:7px}",
      ".wl-chip{all:unset;box-sizing:border-box;cursor:pointer;min-height:38px;padding:0 13px;display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;font-size:13.5px;font-weight:700;color:var(--text);background:var(--surface);-webkit-tap-highlight-color:transparent}",
      ".wl-chip:hover{border-color:var(--coral)}.wl-chip:focus-visible{outline:2px solid var(--coral);outline-offset:2px}",
      ".wl-chip.on{background:#1c3d5a;border-color:#1c3d5a;color:#fff}",
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
      ".wl-al.warn{border-color:rgba(242,184,75,.6);background:rgba(242,184,75,.16)}.wl-al.warn .wl-al-dot{background:#e8824c}",
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
      ".wl-hm-grid>.wl-card{margin-bottom:0}.wl-pg-grid{margin-bottom:14px}.wl-pg-grid .wl-hm-head{justify-content:flex-start;align-items:flex-start;text-align:left}",
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
      ".wl-art-ph{position:absolute;inset:0;display:flex;align-items:flex-end;padding:0 0 6% 8%;box-sizing:border-box;background:linear-gradient(135deg,var(--tone),#0e1b2c);color:rgba(255,255,255,.85);font:800 8px/1 system-ui,sans-serif;letter-spacing:.08em}",
      ".wl-art-md .wl-art-ph{font-size:9.5px}",
      ".wl-art-ph i{position:absolute;left:9%;top:30%;width:17%;height:21%;border-radius:2px;background:linear-gradient(135deg,#e8d39a,#b8954a);opacity:.9}",
      ".wl-wc-top{display:flex;gap:12px;align-items:flex-start}",
      ".wl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
      ".wl-store{display:block;margin:10px 0 10px}",
      ".wl-store input{box-sizing:border-box;width:100%;max-width:420px;min-height:44px;padding:0 14px;font:inherit;font-size:16px;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:12px}",
      ".wl-store input:focus{outline:2px solid var(--coral);outline-offset:1px;border-color:transparent}",
      ".wl-bar{height:8px;border-radius:999px;background:var(--surface-2,rgba(0,0,0,.07));overflow:hidden;margin:8px 0}",
      ".wl-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#f2b84b,#e8824c)}",
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
      "@media (max-width:560px){.wl-rowtop{display:grid;grid-template-columns:auto 1fr;gap:8px 12px}.wl-rowtop>.wl-side{grid-column:1/-1}.wl-art-md{width:72px;border-radius:5px}.wl-art-md .wl-art-ph{font-size:7.5px}.wl-side{align-items:flex-start;text-align:left;flex-direction:row;flex-wrap:wrap;gap:8px 12px;align-items:center}.wl-rowacts{margin-left:auto}.wl-date{grid-template-columns:1fr 1fr}.wl-date select:first-child{grid-column:1/-1}}"
    ].join("");
    document.head.appendChild(s);
  }

  window.HRT_WALLET = {
    _test: { creditGroups: creditGroups, findStore: findStore, STORES: STORES, usedThisCardYear: usedThisCardYear, cardYearStart: cardYearStart, bonusState: bonusState, artHtml: artHtml, parseOpened: parseOpened, nextRenewal: nextRenewal, isFuture: isFuture, summarize: summarize,
      whenText: whenText, renewalText: renewalText, money: money,
      perkPeriod: perkPeriod, perkRows: perkRows, expiringSoon: expiringSoon, pruneUsed: pruneUsed,
      perkAmount: perkAmount, perkYearUsd: perkYearUsd, isTracked: isTracked, state: state,
      shortName: shortName, cardBrief: cardBrief, topAlerts: topAlerts,
      whichCard: whichCard, exampleWallet: exampleWallet, centsPer: centsPer, valueText: valueText, SPEND: SPEND,
      rateText: rateText, earningFor: earningFor, quartersFor: quartersFor, quarterName: quarterName },
    show: function () {
      styles();
      host = document.getElementById("wl-host");
      if (host && !host.getAttribute("data-ready")) {
        host.setAttribute("data-ready", "1");
        host.addEventListener("click", onClick);
        host.addEventListener("change", onChange);
        host.addEventListener("input", onInput);
      }
      if (!state.wallet && !state.loading) load(); else paint();
    },
    /* the Dashboard home panel; shares the same wallet and the same safe saves */
    home: function () {
      styles();
      homeHost = document.getElementById("wl-home");
      alertHost = document.getElementById("wl-summary");
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
