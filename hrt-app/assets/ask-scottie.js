/* ---------------------------------------------------------------------------
   ask-scottie.js - Ask Scottie, the pop-up chat for ʻOhana Members.

   A round "Ask Scottie" button with Scottie's photo sits in the bottom right
   for ʻOhana Members only. Tapping it opens a chat window (full screen on a
   phone). Talks to /api/ask-scottie (functions/api/ask-scottie.js). The server
   checks the member's plan itself, so this file is not a security boundary:
   it only draws the chat. Styles: assets/ask-scottie.css, all under .asc-.
   No em dashes in anything a member reads.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var API = "/api/ask-scottie";
  var PHOTO = "assets/scottie.jpg";
  var STORE = "hrtAskScottie.v1";
  /* The My Seat Alerts card on the Dashboard home is switched off for now
     (Scottie, Oct 18). Alerts still work in the chat. Set to true to bring it back. */
  var HOME_CARD = false;
  /* Coaching only for now (Oct 20): no seat alerts. */
  var ALERTS_ON = false;
  var SUGGEST = [
    "I need help redeeming my points",
    "Help me plan my next trip with points"
  ];

  var fab = null, pop = null, host = null;
  var state = null, info = null, busy = false, loading = false, isOpen = false;
  var alerts = null, alertsLoading = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/\s*[–—]\s*/g, ", ")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Tiny, safe formatter: **bold**, "- " lists, line breaks. Escapes first. */
  function fmt(text) {
    var lines = esc(text).split(/\n/), out = [], list = false;
    lines.forEach(function (ln) {
      var b = ln.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        /* plain https links become tappable; trailing punctuation stays outside */
        .replace(/(https:\/\/[^\s<]+?)([.,;:!?)]*)(?=\s|$)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>$2');
      if (/^\s*[-*]\s+/.test(ln)) {
        if (!list) { out.push("<ul>"); list = true; }
        out.push("<li>" + b.replace(/^\s*[-*]\s+/, "") + "</li>");
      } else {
        if (list) { out.push("</ul>"); list = false; }
        if (b.trim()) out.push("<p>" + b + "</p>");
      }
    });
    if (list) out.push("</ul>");
    return out.join("");
  }

  function token() {
    try { var ms = window.$memberstackDom; return (ms && ms.getMemberCookie && ms.getMemberCookie()) || ""; }
    catch (e) { return ""; }
  }

  function load() {
    try { var s = JSON.parse(sessionStorage.getItem(STORE) || "null"); if (s && Array.isArray(s.msgs)) return s; } catch (e) {}
    return { msgs: [] };
  }
  function save() { try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} }

  function smsHref(num) { return "sms:" + String(num || "").replace(/[^\d+]/g, ""); }

  var ICON_TEXT = '<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>';
  var ICON_SEND = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  var ICON_X = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function textBtn(cls) {
    if (!info || !info.textNumber) return "";
    return '<a class="' + cls + '" href="' + esc(smsHref(info.textNumber)) + '">' + ICON_TEXT + "Text Scottie</a>";
  }

  /* ------------------------------ the button and window ------------------------------ */

  function build() {
    if (fab) return;
    fab = document.createElement("button");
    fab.type = "button";
    fab.className = "asc-fab";
    fab.setAttribute("aria-haspopup", "dialog");
    fab.setAttribute("aria-expanded", "false");
    fab.innerHTML = '<img src="' + PHOTO + '" alt="" width="44" height="44"><span>Ask Scottie</span><b class="asc-dot" hidden></b>';
    fab.addEventListener("click", function () { toggle(!isOpen); });

    pop = document.createElement("div");
    pop.className = "asc-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Ask Scottie chat");
    pop.hidden = true;
    pop.innerHTML = '<div id="asc-host"></div>';
    host = pop.firstChild;

    document.body.appendChild(pop);
    document.body.appendChild(fab);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen) toggle(false); });
  }

  function toggle(on) {
    isOpen = on;
    pop.hidden = !on;
    fab.setAttribute("aria-expanded", on ? "true" : "false");
    document.documentElement.classList.toggle("asc-open", on);
    if (on) {
      start();
      setTimeout(function () { var i = document.getElementById("ascInput"); if (i && window.innerWidth > 760) i.focus(); }, 50);
    } else {
      fab.focus();
    }
  }

  /* Show the button only to signed-in ʻOhana Members. */
  function sync() {
    var mem = window.HRT_MEMBER;
    var show = !!(mem && mem.signedIn && mem.client);
    if (show) build();
    if (fab) fab.hidden = !show;
    if (!show && isOpen) toggle(false);
    /* seat alerts are off while Ask Scottie is coaching only */
    if (show && !alerts && ALERTS_ON) loadAlerts();
    if (!show) { var c = document.getElementById("ascAlerts"); if (c) c.remove(); }
  }

  /* ------------------------------ screens ------------------------------ */

  function header() {
    return '<div class="asc-head">' +
      '<img class="asc-photo" src="' + PHOTO + '" alt="Scottie" width="48" height="48">' +
      '<div class="asc-id"><div class="asc-name">Ask Scottie</div>' +
      '<div class="asc-badges"><span class="asc-badge">ʻOhana Member</span>' + (info && info.pro ? '<span class="asc-badge pro">&#9733; PRO</span>' : "") + "</div></div>" +
      textBtn("asc-textbtn") +
      '<button type="button" class="asc-x" aria-label="Close chat">' + ICON_X + "</button>" +
      "</div>";
  }

  function notice(text) {
    host.innerHTML = '<div class="asc-card">' + header() + '<div class="asc-notice">' + text + "</div></div>";
    wireClose();
  }

  function wireClose() {
    var x = host.querySelector(".asc-x"); if (x) x.addEventListener("click", function () { toggle(false); });
  }

  function chat() {
    host.innerHTML = '<div class="asc-card">' + header() +
      '<div class="asc-log" id="ascLog" aria-live="polite"></div>' +
      '<div class="asc-chips" id="ascChips"></div>' +
      '<form class="asc-compose" id="ascForm" autocomplete="off">' +
      '<label class="asc-sr" for="ascInput">Message Ask Scottie</label>' +
      '<textarea id="ascInput" rows="1" maxlength="1500" placeholder="Ask me anything about points"></textarea>' +
      '<button type="submit" class="asc-send" aria-label="Send">' + ICON_SEND + "</button>" +
      "</form>" +
      '<p class="asc-left" id="ascLeft"></p></div>';
    wireClose();
    var form = document.getElementById("ascForm"), input = document.getElementById("ascInput");
    form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
    document.getElementById("ascLog").addEventListener("click", function (e) {
      if (e.target.closest("[data-asc-close]")) { toggle(false); return; }
      var y = e.target.closest("[data-watch-yes]"), n = e.target.closest("[data-watch-no]");
      if (y) watchIt(parseInt(y.getAttribute("data-watch-yes"), 10));
      if (n) { var mm = state.msgs[parseInt(n.getAttribute("data-watch-no"), 10)]; if (mm) { mm.watchState = "no"; save(); draw(); } }
    });
    document.getElementById("ascChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-q]"); if (b) send(b.getAttribute("data-q"));
      if (e.target.closest("[data-reset]")) { state = { msgs: [] }; save(); draw(); }
    });
    showNewSeats();
    draw();
  }

  /* ------------------------------ drawing ------------------------------ */

  /* seats.aero program keys and airline codes, in plain words */
  var PROGRAMS = { alaska: "Atmos Rewards (Alaska)", aeroplan: "Air Canada Aeroplan", american: "American AAdvantage", united: "United MileagePlus",
    delta: "Delta SkyMiles", virginatlantic: "Virgin Atlantic", flyingblue: "Air France KLM Flying Blue", qantas: "Qantas", velocity: "Virgin Australia Velocity",
    emirates: "Emirates Skywards", etihad: "Etihad Guest", qatar: "Qatar Privilege Club", turkish: "Turkish Miles&Smiles", singapore: "Singapore KrisFlyer",
    lifemiles: "Avianca LifeMiles", jetblue: "JetBlue TrueBlue", aeromexico: "Aeromexico", smiles: "GOL Smiles", azul: "Azul", connectmiles: "Copa ConnectMiles",
    eurobonus: "SAS EuroBonus", finnair: "Finnair Plus", lufthansa: "Lufthansa Miles & More", ethiopian: "Ethiopian ShebaMiles", saudia: "Saudia AlFursan", spirit: "Spirit Free Spirit" };
  var AIRLINES = { NH: "ANA", JL: "Japan Airlines", HA: "Hawaiian", AS: "Alaska", UA: "United", AA: "American", DL: "Delta", AC: "Air Canada",
    CX: "Cathay Pacific", SQ: "Singapore", KE: "Korean Air", OZ: "Asiana", QF: "Qantas", NZ: "Air New Zealand", BR: "EVA Air", CI: "China Airlines",
    FJ: "Fiji Airways", PR: "Philippine Airlines", ZG: "Zipair", VS: "Virgin Atlantic", AF: "Air France", KL: "KLM", LH: "Lufthansa", BA: "British Airways", QR: "Qatar", EK: "Emirates", TK: "Turkish" };
  function airlines(codes) {
    return String(codes || "").split(/\s*,\s*/).filter(Boolean).map(function (c) { return AIRLINES[c] || c; }).join(", ");
  }

  /* "Your Amex points transfer 1:1" plus a button to the program's site. */
  function howToBook(b) {
    if (!b) return "";
    var line = "";
    if (b.direct) line = "Your Atmos points book this directly.";
    else {
      var mine = (b.transferFrom || []).filter(function (p) { return p.yours; })[0];
      if (mine) line = "Your " + mine.from + " transfer " + mine.ratio + (mine.bonus ? ", " + mine.bonus : "") + ".";
      else if ((b.transferFrom || []).length) line = "None of your cards transfer here. " + b.transferFrom[0].from + " does, " + b.transferFrom[0].ratio + ".";
    }
    var safe = /^https:\/\//.test(b.bookAt || "") ? b.bookAt : "";
    return (line ? '<div class="asc-seat-you">' + esc(line) + "</div>" : "") +
      (safe ? '<a class="asc-book" href="' + esc(safe) + '" target="_blank" rel="noopener">Book with ' + esc(b.program) + "</a>" : "");
  }

  function seatCards(seats) {
    if (!seats || !seats.length) return "";
    return '<div class="asc-seats">' + seats.map(function (s) {
      var d = new Date(s.date + "T12:00:00");
      var day = isNaN(d) ? s.date : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      var seen = s.lastSeen ? new Date(s.lastSeen) : null;
      var seenTxt = seen && !isNaN(seen) ? "Last seen " + seen.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Cached result";
      return '<div class="asc-seat">' +
        '<div class="asc-seat-row"><b>' + esc(day) + "</b><span>" + esc(s.from) + " to " + esc(s.to) + "</span></div>" +
        '<div class="asc-seat-sub">' + esc(airlines(s.airlines)) + (s.direct ? " nonstop" : "") + " · Book with " + esc(PROGRAMS[s.program] || s.program || "") + "</div>" +
        '<div class="asc-seat-row"><span class="asc-miles">' + (s.miles ? Number(s.miles).toLocaleString() + " miles" : "") + "</span>" +
        "<span>" + esc(s.cabin) + (s.seats ? ", " + s.seats + " seats" : "") + "</span></div>" +
        '<div class="asc-seat-sub">' + esc(seenTxt) + ". Plus taxes and fees.</div>" +
        howToBook(s.book) + "</div>";
    }).join("") + "</div>";
  }

  function shortDay(day) {
    var d = new Date(day + "T12:00:00");
    return isNaN(d) ? day : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  function num(n) { return Number(n || 0).toLocaleString(); }

  function tripLeg(label, leg) {
    var safe = leg.book && /^https:\/\//.test(leg.book.bookAt || "") ? leg.book.bookAt : "";
    var prog = (leg.book && leg.book.program) || PROGRAMS[leg.program] || leg.program;
    return '<div class="asc-leg">' +
      '<div class="asc-leg-k">' + esc(label) + "</div>" +
      '<div class="asc-seat-row"><b>' + esc(shortDay(leg.date)) + "</b><span>" + esc(leg.from) + " to " + esc(leg.to) + "</span></div>" +
      '<div class="asc-seat-sub">' + esc(airlines(leg.airlines)) + (leg.direct ? " nonstop" : "") + " · " + esc(prog) + "</div>" +
      '<div class="asc-seat-row"><span class="asc-miles">' + num(leg.miles) + ' miles</span><span>per person</span></div>' +
      (safe ? '<a class="asc-book" href="' + esc(safe) + '" target="_blank" rel="noopener">Book with ' + esc(prog) + "</a>" : "") +
      "</div>";
  }

  /* The best round trip, its transfer plan, and the other options in one line each. */
  function tripCard(trip) {
    if (!trip || !trip.options || !trip.options.length) return "";
    var t = trip.options[0], n = trip.travelers || 1;
    var plan = (t.transferPlan || []).map(function (p) {
      var status = p.enough === true ? '<span class="asc-ok">Enough</span>'
        : p.enough === false ? '<span class="asc-short">Short ' + num(p.points - p.have) + "</span>" : "";
      return '<li><span>Move <b>' + num(p.points) + "</b> " + esc(p.from) + (p.have ? " (you have " + num(p.have) + ")" : "") + "</span>" + status + "</li>";
    }).join("");
    var others = trip.options.slice(1).map(function (o) {
      return "<li>" + esc(shortDay(o.out.date)) + " to " + esc(shortDay(o.back.date)) + ", " + num(o.milesTotal) + " miles total" + (o.gateway ? " (West Coast)" : "") + "</li>";
    }).join("");
    return '<div class="asc-trip">' +
      '<div class="asc-trip-head"><b>Your trip plan</b><span>' + n + (n === 1 ? " traveler" : " travelers") + " · " + esc(trip.cabin || t.out.cabin) + " · " + t.nights + " nights</span></div>" +
      tripLeg("Way out", t.out) + tripLeg("Way back", t.back) +
      (t.gateway ? '<div class="asc-trip-note">This plan uses a West Coast gateway. Add a separate Hawaii flight, with time to spare.</div>' : "") +
      '<div class="asc-trip-total"><span>Total for ' + n + "</span><b>" + num(t.milesTotal) + " miles</b></div>" +
      '<div class="asc-seat-sub">Plus taxes and fees. Cached results: confirm both seats before you transfer.</div>' +
      (plan ? '<div class="asc-leg-k">Transfer plan</div><ul class="asc-plan">' + plan + "</ul>"
        : '<div class="asc-trip-note">None of your saved cards transfer to these programs.</div>') +
      (others ? '<div class="asc-leg-k">Other options</div><ul class="asc-others">' + others + "</ul>" : "") +
      "</div>";
  }

  /* "Want me to watch this?" Yes / No under a reply. */
  function watchOffer(m, i) {
    if (!m.watch || !m.watch.length) return "";
    var st = m.watchState || "";
    if (st === "no") return "";
    if (st === "done") return '<div class="asc-watched">&#10003; Watching' + (m.watch.length > 1 ? " both flights" : " this route") + ". New seats will show here in the chat.</div>";
    if (st.indexOf("err:") === 0) return '<div class="asc-watched err">' + esc(st.slice(4)) + "</div>";
    var saving = st === "saving";
    return '<div class="asc-watch">' +
      '<button type="button" class="asc-wbtn yes" data-watch-yes="' + i + '"' + (saving ? " disabled" : "") + ">" + (saving ? "Saving..." : (m.watch.length > 1 ? "Yes, watch both flights" : "Yes, watch it")) + "</button>" +
      (saving ? "" : '<button type="button" class="asc-wbtn" data-watch-no="' + i + '">No thanks</button>') + "</div>";
  }

  function bubble(m, i) {
    if (m.role === "user") return '<div class="asc-msg me"><div class="asc-b">' + esc(m.content) + "</div></div>";
    return '<div class="asc-msg bot"><img class="asc-av" src="' + PHOTO + '" alt="" width="28" height="28">' +
      '<div class="asc-b' + (m.error ? " err" : "") + (m.alert ? " alert" : "") + '">' + fmt(m.content) + tripCard(m.trip) + seatCards(m.seats) +
      watchOffer(m, i) + (m.atmos ? '<a class="asc-atmos" href="#atmos" data-route="atmos" data-asc-close>&#9733; Unlock the Atmos Award Calendar</a>' : "") +
      (m.handoff ? textBtn("asc-textbtn inline") : "") + "</div></div>";
  }

  function draw() {
    var log = document.getElementById("ascLog"); if (!log) return;
    var hello = {
      role: "assistant",
      content: "Aloha" + (info && info.firstName ? " " + info.firstName : "") + "! Need help redeeming your points or planning your next trip? I can see the cards in your My Wallet, so tell me where you want to go."
    };
    log.innerHTML =
      '<p class="asc-note">Ask Scottie is the AI version of me, trained on my tips. It can make mistakes, so double check before you transfer points. For anything personal, text the real me.</p>' +
      bubble(hello, -1) + state.msgs.map(bubble).join("") +
      (busy ? '<div class="asc-msg bot"><img class="asc-av" src="' + PHOTO + '" alt="" width="28" height="28"><div class="asc-b asc-typing" aria-label="Scottie is typing"><i></i><i></i><i></i></div></div>' : "");
    var chips = document.getElementById("ascChips");
    chips.innerHTML = (state.msgs.length ? "" : SUGGEST.map(function (q) {
      return '<button type="button" class="asc-chip" data-q="' + esc(q) + '">' + esc(q) + "</button>";
    }).join("")) + (state.msgs.length && !busy ? '<button type="button" class="asc-chip ghost" data-reset>Start over</button>' : "");
    var left = document.getElementById("ascLeft");
    if (left) left.textContent = info && typeof info.remaining === "number" && info.remaining <= 10 ? info.remaining + " messages left today" : "";
    var btn = host.querySelector(".asc-send"); if (btn) btn.disabled = busy;
    /* scroll last, after the chips row has changed the log's height */
    log.scrollTop = log.scrollHeight;
  }

  var ERRORS = {
    daily_limit: "That's all the questions I can take today. Text me if it can't wait, or come back tomorrow.",
    signed_out: "Your login timed out. Log in again and ask me once more.",
    ai_unavailable: "I couldn't answer just now. Give it a minute and try again.",
    not_configured: "Ask Scottie is still being set up. Check back soon.",
    ohana_only: "Ask Scottie is for ʻOhana Members.",
    pro_coming_soon: "The Atmos Rewards Seat Finder for HRT PRO is coming soon."
  };

  function send(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    var input = document.getElementById("ascInput"); if (input) { input.value = ""; input.style.height = "auto"; }
    state.msgs.push({ role: "user", content: text.slice(0, 1500) });
    busy = true; save(); draw();
    var history = state.msgs.filter(function (m) { return !m.error; })
      .map(function (m) { return { role: m.role, content: m.content }; });
    fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + token() },
      body: JSON.stringify({ messages: history })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, b: b }; });
    }).then(function (res) {
      if (!res.ok || !res.b.reply) {
        state.msgs.push({ role: "assistant", error: true, content: ERRORS[res.b.error] || ERRORS.ai_unavailable, handoff: res.b.error === "daily_limit" });
        /* drop the unanswered question from what we send next time */
        for (var i = state.msgs.length - 2; i >= 0; i--) { if (state.msgs[i].role === "user") { state.msgs[i].error = true; break; } }
      } else {
        if (res.b.textNumber && info) info.textNumber = res.b.textNumber;
        if (info && typeof res.b.remaining === "number") info.remaining = res.b.remaining;
        state.msgs.push({ role: "assistant", content: res.b.reply, handoff: !!res.b.handoff, seats: res.b.seats || null, trip: res.b.trip || null, watch: res.b.watch || null, atmos: !!res.b.atmosPitch });
        if (res.b.watched) loadAlerts(true);
      }
    }).catch(function () {
      state.msgs.push({ role: "assistant", error: true, content: ERRORS.ai_unavailable });
    }).then(function () { busy = false; save(); draw(); });
  }

  /* First open: ask the server who this is, then draw the chat. */
  function start() {
    if (info) { if (!document.getElementById("ascLog")) chat(); return; }
    if (loading) return;
    loading = true;
    notice("Loading...");
    fetch(API, { headers: { authorization: "Bearer " + token() }, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (b) {
        loading = false;
        if (!b.ok) { notice(ERRORS[b.error] || ERRORS.ai_unavailable); return; }
        if (!b.client) { notice(ERRORS.ohana_only); return; }
        info = b; state = load(); chat();
      })
      .catch(function () { loading = false; notice(ERRORS.ai_unavailable); });
  }

  /* ------------------------------ seat alerts ------------------------------ */

  function routeName(a) { return a.origin.replace(/,/g, "/") + " to " + a.destination.replace(/,/g, "/"); }
  function unreadCount() { return alerts ? alerts.alerts.reduce(function (n, a) { return n + (a.unread || 0); }, 0) : 0; }

  /* Ask the server for this member's alerts. It checks any that are due. */
  function loadAlerts(force) {
    if (alertsLoading || (alerts && !force)) return;
    alertsLoading = true;
    fetch(API + "?alerts=1", { headers: { authorization: "Bearer " + token() }, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (b) {
        alertsLoading = false;
        if (!b.ok || !b.client) return;
        alerts = { alerts: b.alerts || [], max: b.max || 3 };
        paintAlerts();
        if (isOpen && document.getElementById("ascLog")) { showNewSeats(); draw(); }
      })
      .catch(function () { alertsLoading = false; });
  }

  function post(body) {
    return fetch(API, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { b.httpOk = r.ok; return b; }); });
  }

  function watchIt(i) {
    var m = state.msgs[i]; if (!m || !m.watch || m.watchState === "saving") return;
    m.watchState = "saving"; draw();
    post({ action: "watch", watch: m.watch }).then(function (b) {
      if (b.httpOk && b.ok) { m.watchState = "done"; alerts = { alerts: b.alerts || [], max: (alerts && alerts.max) || 3 }; paintAlerts(); }
      else m.watchState = "err:" + (b.error === "full" ? (b.note || "You're already watching 3 routes.") : "I couldn't save that alert. Try again in a bit.");
    }).catch(function () { m.watchState = "err:I couldn't save that alert. Try again in a bit."; })
      .then(function () { save(); draw(); });
  }

  /* New seats become a message from Scottie the next time the chat opens. */
  function showNewSeats() {
    if (!alerts || !state || !unreadCount()) return;
    alerts.alerts.forEach(function (a) {
      if (!a.unread) return;
      var fresh = a.hits.slice(0, Math.min(a.unread, 3));
      state.msgs.push({
        role: "assistant", alert: true,
        content: "Good news! " + (a.unread === 1 ? "A seat opened up" : a.unread + " new seats opened up") + " on **" + routeName(a) + "** in " + a.cabin + " for " + a.travelers + ". These are cached results, so confirm on the airline's site before you transfer points.",
        seats: fresh
      });
      a.unread = 0;
    });
    save(); paintAlerts();
    post({ action: "read" }).catch(function () {});
  }

  function openAlert(id) {
    var a = alerts && alerts.alerts.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    toggle(true);
    var go = function () {
      if (!state) return setTimeout(go, 200);
      if (a.unread) return;
      state.msgs.push({
        role: "assistant", alert: true,
        content: a.hits.length ? "Here's what I've found on **" + routeName(a) + "** since you asked me to watch it:"
          : "Nothing new on **" + routeName(a) + "** yet" + (a.best ? ". The cheapest I can see is " + num(a.best.miles) + " miles on " + shortDay(a.best.date) : "") + ". I'll keep checking and show you here when seats open up.",
        seats: a.hits.slice(0, 3)
      });
      save(); draw();
    };
    go();
  }

  function removeAlert(id, btn) {
    if (btn) btn.disabled = true;
    post({ action: "unwatch", id: id }).then(function (b) {
      if (b.ok) { alerts.alerts = b.alerts || []; paintAlerts(); } else if (btn) btn.disabled = false;
    }).catch(function () { if (btn) btn.disabled = false; });
  }

  /* The red dot on the button and the My Seat Alerts card on the Dashboard home. */
  function paintAlerts() {
    var n = unreadCount();
    if (fab) {
      var dot = fab.querySelector(".asc-dot");
      if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? "9+" : String(n || ""); }
      fab.setAttribute("aria-label", n ? "Ask Scottie, " + n + " new seat alerts" : "Ask Scottie");
    }
    var home = document.querySelector("#v-home .content"); if (!home || !alerts) return;
    if (!HOME_CARD) { var old = document.getElementById("ascAlerts"); if (old) old.remove(); return; }
    var card = document.getElementById("ascAlerts");
    if (!card) {
      card = document.createElement("div");
      card.id = "ascAlerts"; card.className = "card asc-al";
      var top = home.querySelector(".toprow");
      if (top && top.nextSibling) home.insertBefore(card, top.nextSibling); else home.appendChild(card);
      card.addEventListener("click", function (e) {
        var o = e.target.closest("[data-al-open]"), x = e.target.closest("[data-al-rm]"), ask = e.target.closest("[data-al-ask]");
        if (o) openAlert(o.getAttribute("data-al-open"));
        if (x) removeAlert(x.getAttribute("data-al-rm"), x);
        if (ask) toggle(true);
      });
    }
    var list = alerts.alerts;
    var rows = list.map(function (a) {
      var status = a.unread ? '<span class="asc-al-new">' + a.unread + " new</span>"
        : a.best ? '<span class="asc-al-best">From ' + num(a.best.miles) + " miles</span>" : '<span class="asc-al-none">Nothing yet</span>';
      return '<li class="asc-al-row">' +
        '<button type="button" class="asc-al-main" data-al-open="' + esc(a.id) + '"><b>' + esc(routeName(a)) + "</b>" +
        "<small>" + esc(a.cabin.charAt(0).toUpperCase() + a.cabin.slice(1)) + " · " + a.travelers + (a.travelers === 1 ? " traveler" : " travelers") + " · " + esc(shortDay(a.start)) + " to " + esc(shortDay(a.end)) +
        (a.maxMiles ? " · under " + num(a.maxMiles) : "") + "</small></button>" + status +
        '<button type="button" class="asc-al-x" data-al-rm="' + esc(a.id) + '" aria-label="Stop watching ' + esc(routeName(a)) + '">' + ICON_X + "</button></li>";
    }).join("");
    card.innerHTML =
      '<div class="sec-h"><h2>My Seat Alerts</h2><span class="note">' + (list.length ? "Checked a few times a day · " + list.length + " of " + alerts.max : "ʻOhana Members") + "</span></div>" +
      (list.length ? '<ul class="asc-al-list">' + rows + "</ul>"
        : '<div class="asc-al-empty"><p>Want to know when award seats open up? Ask me to watch a route and I\'ll show new seats right here.</p>' +
          '<button type="button" class="asc-al-ask" data-al-ask><img src="' + PHOTO + '" alt="" width="26" height="26">Ask Scottie</button></div>');
  }

  window.addEventListener("hrt:member", sync);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync); else sync();
})();
