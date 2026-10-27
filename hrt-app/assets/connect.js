/* ---------------------------------------------------------------------------
   connect.js - how the dashboard tools talk to each other (Oct 17, 2026)

   One place that answers "what does this member's wallet mean for each tool?"
   It only reads. It never saves anything and never touches Member JSON.

   Inputs (plain data, so it can be tested in node):
     wallet   { held:[{cardId, name, short}], perks:[{cardId, cardShort, perkId,
               label, amount, unit, used, endText, days}], client:bool }
              from window.HRT_WALLET.connectData()
     bonuses  live transfer bonuses (the same list the Transfer Bonuses page shows)
     lounges  the HNL Lounge Map list

   Facts this file adds on top of the catalog (keep these short and checked):
     - Which points currency moves to which bank's partners.
     - Freedom cards ("cash back" Ultimate Rewards) only transfer when combined
       with a Sapphire Preferred, Sapphire Reserve or Ink Preferred account.
     - Lounge access: Priority Pass comes with the Amex Platinum, Amex Business
       Platinum, Sapphire Reserve, Sapphire Reserve for Business and Venture X
       (each needs enrolling first). Amex Platinum and Business Platinum get
       into Delta Sky Club on a same-day Delta flight, with a yearly visit limit.
       Last checked Oct 17, 2026.

   Exposes window.HRT_CONNECT.
--------------------------------------------------------------------------- */
(function (root) {
  "use strict";

  var CURRENCY_BANK = {
    "Ultimate Rewards points": "chase",
    "Membership Rewards points": "amex",
    "Capital One miles": "capital-one",
    "Bilt Points": "bilt",
    /* ready for when these cards join the catalog sheet; use these exact currency names there */
    "ThankYou Points": "citi",
    "Wells Fargo Rewards points": "wells",
    "Rove Miles": "rove"
  };
  var CASHBACK_UR = "Ultimate Rewards points (cash back)";
  var BANK_SHORT = { "amex": "Amex", "bilt": "Bilt", "capital-one": "Capital One", "chase": "Chase", "citi": "Citi", "wells": "Wells Fargo", "rove": "Rove" };
  var BANK_POINTS = { "amex": "Membership Rewards points", "capital-one": "Capital One miles", "chase": "Chase Ultimate Rewards points", "bilt": "Bilt Points", "citi": "Citi ThankYou Points", "wells": "Wells Fargo Rewards points", "rove": "Rove Miles" };
  var PRIORITY_PASS = ["amex-platinum", "amex-business-platinum", "chase-sapphire-reserve", "chase-sapphire-reserve-business", "capone-venture-x"];
  var SKY_CLUB = ["amex-platinum", "amex-business-platinum"];
  var ATMOS_CARDS = ["atmos-summit", "atmos-ascent"];

  function uniq(a) { var s = {}; return a.filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }
  function list(names) {
    names = uniq(names);
    if (names.length < 2) return names.join("");
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }
  function heldIds(w) { return ((w && w.held) || []).map(function (h) { return h.cardId; }); }
  function shortsFor(w, ids) {
    return uniq(((w && w.held) || []).filter(function (h) { return ids.indexOf(h.cardId) > -1; }).map(function (h) { return h.short || h.name; }));
  }

  /* Which banks' transfer partners this wallet can reach, and through which cards. */
  function banks(w, earning) {
    var out = {}, cash = [];
    var held = (w && w.held) || [];
    held.forEach(function (h) {
      (earning || []).forEach(function (e) {
        if (e.card !== h.cardId) return;
        var b = CURRENCY_BANK[e.currency];
        if (b) {
          out[b] = out[b] || { cards: [] };
          out[b].cards.push(h.short || h.name);
        } else if (e.currency === CASHBACK_UR) cash.push(h.short || h.name);
      });
    });
    Object.keys(out).forEach(function (k) { out[k].cards = uniq(out[k].cards); });
    /* Freedom points join a Sapphire's points, so name both when both are held */
    if (cash.length && out.chase) out.chase.cards = uniq(out.chase.cards.concat(cash));
    var cashOnly = cash.length && !out.chase ? uniq(cash) : [];
    return { banks: out, cashOnly: cashOnly };
  }

  /* Does this live bonus work with the member's points? Returns card names or null. */
  function bonusCards(b, bk) { return b && bk.banks[b.bank] ? bk.banks[b.bank].cards : null; }

  function loungeAccess(w, lounges) {
    var ids = heldIds(w), out = [];
    var pp = shortsFor(w, PRIORITY_PASS), sky = shortsFor(w, SKY_CLUB);
    (lounges || []).forEach(function (l) {
      if (l.soon) return;
      if (pp.length && (l.tags || []).indexOf("priority-pass") > -1) out.push({ id: l.id, name: l.name, how: "Priority Pass", cards: pp });
      else if (sky.length && l.id === "delta") out.push({ id: l.id, name: l.name, how: "Delta Sky Club access on a Delta flight", cards: sky });
    });
    return { list: out, pp: pp, sky: sky, any: ids.length > 0 };
  }

  function resyPerks(w) {
    return ((w && w.perks) || []).filter(function (p) { return p.perkId === "resy"; });
  }

  function money(n) { n = +n || 0; return "$" + (Math.round(n) === n ? n : n.toFixed(2)); }

  /* Everything worth telling this member, most time-sensitive first. Each tip:
     { key, kind, title, text, action:{ label, route, bank?, bonus? } } */
  function tips(w, earning, bonuses, lounges) {
    var out = [];
    if (!w || !(w.held || []).length) return out;
    var bk = banks(w, earning);
    var live = (bonuses || []).slice().sort(function (a, b) { return String(a.expiresDate || "9").localeCompare(String(b.expiresDate || "9")); });

    /* 1. transfer bonuses for points they hold, one tip per bank */
    Object.keys(bk.banks).forEach(function (bank) {
      var mine = live.filter(function (b) { return b.bank === bank; });
      if (!mine.length) return;
      var cards = bk.banks[bank].cards, b = mine[0];
      var title = mine.length === 1
        ? BANK_SHORT[bank] + " is running a " + b.bonusPct + "% bonus to " + b.partner
        : BANK_SHORT[bank] + " is running " + mine.length + " transfer bonuses";
      var text = "Your " + list(cards) + " earn" + (cards.length === 1 ? "s " : " ") + (BANK_POINTS[bank] || "points") + ", so this works for you. " +
        (mine.length === 1 ? "You get " + b.bonusPct + "% extra when you move points." : "The best is " + Math.max.apply(null, mine.map(function (x) { return +x.bonusPct || 0; })) + "% extra to " +
          mine.slice().sort(function (x, y) { return (+y.bonusPct || 0) - (+x.bonusPct || 0); })[0].partner + ".") +
        " Only move points when you have a trip to book.";
      out.push({ key: "tb-" + bank, kind: "transfer", title: title, text: text, ends: b.expiresDate,
        action: { label: mine.length === 1 ? "See the bonus" : "See all " + mine.length, route: "transfers", bank: bank, bonus: mine.length === 1 ? b.bonusPct : null } });
    });
    if (bk.cashOnly.length && !w.client && live.some(function (b) { return b.bank === "chase"; })) {
      out.push({ key: "tb-chase-cash", kind: "transfer", title: "Chase has a transfer bonus running",
        text: "Your " + list(bk.cashOnly) + " earn" + (bk.cashOnly.length === 1 ? "s" : "") + " Chase points as cash back. They can only move to airline and hotel partners when combined with a Sapphire Preferred, Sapphire Reserve or Ink Preferred account.",
        action: { label: "See Chase bonuses", route: "transfers", bank: "chase" } });
    }

    /* 2. a Resy credit not used yet */
    resyPerks(w).filter(function (p) { return !p.used; }).forEach(function (p) {
      out.push({ key: "resy-" + p.cardId, kind: "resy", title: "Your " + money(p.amount) + " Resy credit ends " + p.endText,
        text: "It comes with your " + p.cardShort + " and does not roll over. Find a Hawaiʻi restaurant on Resy that counts.",
        action: { label: "Open the Resy map", route: "resy" } });
    });

    /* 3. HNL lounges their cards open */
    var la = loungeAccess(w, lounges);
    if (la.list.length) {
      var ppL = la.list.filter(function (x) { return x.how === "Priority Pass"; }).map(function (x) { return x.name; });
      var skyL = la.list.filter(function (x) { return x.how !== "Priority Pass"; }).map(function (x) { return x.name; });
      var t = [];
      if (ppL.length) t.push("Your " + list(la.pp) + " include" + (la.pp.length === 1 ? "s" : "") + " Priority Pass, which gets you into " + list(ppL) + ". Enroll in Priority Pass through your card first.");
      if (skyL.length) t.push("Your " + list(la.sky) + " also get" + (la.sky.length === 1 ? "s" : "") + " you into the " + list(skyL) + " when you fly Delta that day. Visit limits apply.");
      out.push({ key: "lounges", kind: "lounge", title: la.list.length === 1 ? "1 HNL lounge is open to you" : la.list.length + " HNL lounges are open to you",
        text: t.join(" "), action: { label: "See them on the map", route: "lounges", lounges: la.list.map(function (x) { return x.id; }) } });
    }

    /* 4. Atmos cardholders: the two free Atmos calculators */
    var atmos = shortsFor(w, ATMOS_CARDS);
    if (atmos.length) {
      out.push({ key: "atmos", kind: "atmos", title: "Get more from your " + list(atmos),
        text: "Answer a few questions and we will show which Atmos Community gives you the most each year.",
        action: { label: "Try the Community Calculator", route: "communities" } });
    }
    return out;
  }

  var api = { banks: banks, bonusCards: bonusCards, loungeAccess: loungeAccess, resyPerks: resyPerks, tips: tips,
    PRIORITY_PASS: PRIORITY_PASS, SKY_CLUB: SKY_CLUB, BANK_SHORT: BANK_SHORT };
  root.HRT_CONNECT = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
