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

  /* ============================== VIEW ============================== */
  var host, state = { wallet: null, error: null, editing: null, busy: false, msg: "" };

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

  function save(change, done) {
    if (state.busy) return;
    state.busy = true; state.msg = ""; paint();
    store().update(change).then(function (w) {
      state.wallet = w; state.busy = false; if (done) done(); paint();
    }, function (e) {
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
  function rowHtml(r) {
    var e = r.entry, c = r.card;
    if (!c) {
      return '<li class="wl-row wl-gone"><div class="wl-main"><b class="wl-name">A card we no longer track</b>' +
        '<span class="wl-sub">It was removed from our card list. You can remove it here.</span></div>' +
        '<div class="wl-side"><button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></div></li>';
    }
    var rn = r.renewal, soon = r.hasFee && rn && rn.days <= SOON_DAYS;
    var feeLine = r.hasFee ? money(c.fee) + " a year" : "No annual fee";
    var renewLine = r.hasFee ? "Renews " + esc(renewalText(rn)) : "Opened " + esc(openedText(e.opened));
    return '<li class="wl-row' + (soon ? " wl-soon" : "") + '">' +
      '<div class="wl-main"><b class="wl-name">' + esc(c.name) + "</b>" +
      '<span class="wl-sub">' + esc(c.issuer) + (e.nickname ? " &middot; " + esc(e.nickname) : "") + "</span>" +
      '<span class="wl-meta">' + renewLine + (r.hasFee ? ' <span class="wl-dot">&middot;</span> Opened ' + esc(openedText(e.opened)) : "") + "</span></div>" +
      '<div class="wl-side"><span class="wl-fee">' + esc(feeLine) + "</span>" +
      (r.hasFee ? '<span class="wl-when' + (soon ? " on" : "") + '">' + esc(whenText(rn)) + "</span>" : "") +
      '<span class="wl-rowacts"><button class="wl-link" data-wl="edit" data-id="' + esc(e.id) + '">Edit</button>' +
      '<button class="wl-link" data-wl="remove" data-id="' + esc(e.id) + '">Remove</button></span></div></li>';
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
    setStats(s);
    var editingEntry = state.editing && state.editing !== "new" ?
      state.wallet.cards.filter(function (c) { return c.id === state.editing; })[0] : null;
    var html = "";
    if (state.msg) html += '<p class="wl-banner" role="alert">' + esc(state.msg) + "</p>";
    if (state.editing) html += '<div class="wl-card">' + formHtml(editingEntry) + "</div>";

    if (!s.count && !state.editing) {
      html += '<div class="wl-card wl-empty"><h3 class="wl-h3">Start with the cards in your wallet</h3>' +
        "<p>Add each card and the month you opened it. You will see every annual fee in one place, sorted by when it renews, so none of them sneak up on you.</p>" +
        '<button class="wl-btn wl-pri" data-wl="add">Add your first card</button></div>';
    } else if (s.count) {
      html += '<div class="wl-card"><div class="wl-head"><h3 class="wl-h3">Annual fees, soonest first</h3>' +
        (state.editing ? "" : '<button class="wl-btn wl-pri" data-wl="add">Add a card</button>') + "</div>" +
        (s.soon ? '<p class="wl-note">' + s.soon + (s.soon === 1 ? " card renews" : " cards renew") + " in the next " + SOON_DAYS + " days. Now is the time to decide: keep it, ask for a retention offer, or downgrade.</p>" : "") +
        '<ul class="wl-list">' + s.rows.map(rowHtml).join("") + "</ul></div>";
    }
    var checked = catalog().cards.length ? catalog().cards.map(function (c) { return c.checked; }).sort()[0] : "";
    html += '<p class="wl-foot">Fees come from each issuer\'s own website' + (checked ? ", checked " + esc(fmtIso(checked)) : "") +
      ". Renewal is your card anniversary; most issuers bill the fee on the statement after it. Your wallet is private to your account.</p>";
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

  function onClick(ev) {
    var b = ev.target.closest && ev.target.closest("[data-wl]");
    if (!b || !host.contains(b)) return;
    var act = b.getAttribute("data-wl"), id = b.getAttribute("data-id");
    if (act === "retry") return load();
    if (act === "add") { state.editing = "new"; state.msg = ""; paint(); host.scrollIntoView({ block: "nearest" }); return; }
    if (act === "cancel") { state.editing = null; paint(); return; }
    if (act === "edit") { state.editing = id; state.msg = ""; paint(); return; }
    if (act === "remove") {
      var e = state.wallet.cards.filter(function (c) { return c.id === id; })[0];
      var c = e && catalog().cards.filter(function (k) { return k.id === e.cardId; })[0];
      if (!window.confirm("Remove " + (c ? c.name : "this card") + " from your wallet?")) return;
      save(function (w) { w.cards = w.cards.filter(function (k) { return k.id !== id; }); },
        function () { if (state.editing === id) state.editing = null; });
    }
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
      "@media (max-width:560px){.wl-row{flex-direction:column;gap:8px}.wl-side{align-items:flex-start;text-align:left;flex-direction:row;flex-wrap:wrap;gap:8px 12px;align-items:center}.wl-rowacts{margin-left:auto}.wl-date{grid-template-columns:1fr 1fr}.wl-date select:first-child{grid-column:1/-1}}"
    ].join("");
    document.head.appendChild(s);
  }

  window.HRT_WALLET = {
    _test: { parseOpened: parseOpened, nextRenewal: nextRenewal, isFuture: isFuture, summarize: summarize,
      whenText: whenText, renewalText: renewalText, money: money },
    show: function () {
      styles();
      host = document.getElementById("wl-host");
      if (host && !host.getAttribute("data-ready")) {
        host.setAttribute("data-ready", "1");
        host.addEventListener("click", onClick);
        load();
      }
    }
  };
})();
