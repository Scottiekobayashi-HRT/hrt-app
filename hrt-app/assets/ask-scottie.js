/* ---------------------------------------------------------------------------
   ask-scottie.js - the Ask Scottie chat screen (#ask), for ʻOhana Members.

   Talks to /api/ask-scottie (functions/api/ask-scottie.js). The server checks
   the member's plan itself, so nothing here is a security boundary: this file
   only draws the chat. Styles live in assets/ask-scottie.css, all under .as-.
   No em dashes in anything a member reads.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var API = "/api/ask-scottie";
  var PHOTO = "assets/scottie.jpg";
  var COACHING_URL = "https://www.hawaiirewardtravel.com/our-accelerated-program";
  var STORE = "hrtAskScottie.v1";
  var SUGGEST = [
    "How should I use my points for Japan?",
    "Which of my cards should I use at Foodland?",
    "Where are my credits to use?"
  ];

  var host = null, state = null, info = null, busy = false, started = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/\s*[–—]\s*/g, ", ")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* Tiny, safe formatter: **bold**, "- " lists, line breaks. Escapes first. */
  function fmt(text) {
    var lines = esc(text).split(/\n/), out = [], list = false;
    lines.forEach(function (ln) {
      var b = ln.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
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

  var ICON_TEXT = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>';
  var ICON_SEND = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';

  function textBtn(cls) {
    if (!info || !info.textNumber) return "";
    return '<a class="' + cls + '" href="' + esc(smsHref(info.textNumber)) + '">' + ICON_TEXT + "Text Scottie</a>";
  }

  /* ------------------------------ screens ------------------------------ */

  function shell(inner) {
    host.innerHTML =
      '<div class="as-card">' +
      '<div class="as-head">' +
      '<div class="as-top">' +
      '<img class="as-photo" src="' + PHOTO + '" alt="Scottie" width="56" height="56">' +
      '<div class="as-id"><div class="as-name">Ask Scottie</div>' +
      '<div class="as-badges"><span class="as-badge">ʻOhana Member</span>' + (info && info.pro ? '<span class="as-badge pro">&#9733; PRO</span>' : "") + "</div></div>" +
      textBtn("as-textbtn") +
      "</div>" +
      '<div class="as-eyebrow"><span></span>Your personal points coach</div>' +
      "</div>" + inner + "</div>";
  }

  function locked(kind) {
    var msg = kind === "signed_out"
      ? "<b>Log in to chat.</b> Ask Scottie is for ʻOhana Members. Log in with the account HRT set up for you."
      : "<b>Ask Scottie is for ʻOhana Members.</b> It's my personal coaching program: a 1 to 1 onboarding call, a card plan built around your goals, and this AI version of me for your everyday questions.";
    host.innerHTML =
      '<div class="as-card as-lock">' +
      '<img class="as-photo" src="' + PHOTO + '" alt="Scottie" width="72" height="72">' +
      '<h2>Ask Scottie</h2><p>' + msg + "</p>" +
      (kind === "signed_out" ? '<button type="button" class="as-primary" id="asLogin">Log in</button>'
        : '<a class="as-primary" href="' + COACHING_URL + '" target="_top">Book an onboarding call</a>') +
      "</div>";
    var b = document.getElementById("asLogin");
    if (b) b.addEventListener("click", function () {
      try { window.$memberstackDom.openModal("LOGIN"); } catch (e) {}
    });
  }

  function notice(text) {
    host.innerHTML = '<div class="as-card as-lock"><img class="as-photo" src="' + PHOTO + '" alt="Scottie" width="72" height="72"><h2>Ask Scottie</h2><p>' + text + "</p></div>";
  }

  function chat() {
    shell(
      '<div class="as-log" id="asLog" aria-live="polite"></div>' +
      '<div class="as-chips" id="asChips"></div>' +
      '<form class="as-compose" id="asForm" autocomplete="off">' +
      '<label class="as-sr" for="asInput">Message Ask Scottie</label>' +
      '<textarea id="asInput" rows="1" maxlength="1500" placeholder="Ask me anything about points"></textarea>' +
      '<button type="submit" class="as-send" aria-label="Send">' + ICON_SEND + "</button>" +
      "</form>" +
      '<p class="as-left" id="asLeft"></p>'
    );
    var form = document.getElementById("asForm"), input = document.getElementById("asInput");
    form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
    document.getElementById("asChips").addEventListener("click", function (e) {
      var b = e.target.closest("[data-q]"); if (b) send(b.getAttribute("data-q"));
      if (e.target.closest("[data-reset]")) { state = { msgs: [] }; save(); draw(); }
    });
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

  function seatCards(seats) {
    if (!seats || !seats.length) return "";
    return '<div class="as-seats">' + seats.map(function (s) {
      var d = new Date(s.date + "T12:00:00");
      var day = isNaN(d) ? s.date : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      var seen = s.lastSeen ? new Date(s.lastSeen) : null;
      var seenTxt = seen && !isNaN(seen) ? "Last seen " + seen.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Cached result";
      return '<div class="as-seat">' +
        '<div class="as-seat-row"><b>' + esc(day) + "</b><span>" + esc(s.from) + " to " + esc(s.to) + "</span></div>" +
        '<div class="as-seat-sub">' + esc(airlines(s.airlines)) + (s.direct ? " nonstop" : "") + " · Book with " + esc(PROGRAMS[s.program] || s.program || "") + "</div>" +
        '<div class="as-seat-row"><span class="as-miles">' + (s.miles ? Number(s.miles).toLocaleString() + " miles" : "") + "</span>" +
        "<span>" + esc(s.cabin) + (s.seats ? ", " + s.seats + " seats" : "") + "</span></div>" +
        '<div class="as-seat-sub">' + esc(seenTxt) + ". Plus taxes and fees.</div></div>";
    }).join("") + "</div>";
  }

  function bubble(m) {
    if (m.role === "user") return '<div class="as-msg me"><div class="as-b">' + esc(m.content) + "</div></div>";
    return '<div class="as-msg bot"><img class="as-av" src="' + PHOTO + '" alt="" width="30" height="30">' +
      '<div class="as-b' + (m.error ? " err" : "") + '">' + fmt(m.content) + seatCards(m.seats) +
      (m.handoff ? textBtn("as-textbtn inline") : "") + "</div></div>";
  }

  function draw() {
    var log = document.getElementById("asLog"); if (!log) return;
    var hello = {
      role: "assistant",
      content: "Aloha" + (info && info.firstName ? " " + info.firstName : "") + "! I can see the cards in your My Wallet. What are we working on today?"
    };
    log.innerHTML =
      '<p class="as-note">Ask Scottie is the AI version of me, trained on my tips. It can make mistakes, so double check before you transfer points. For anything personal, text the real me.</p>' +
      bubble(hello) + state.msgs.map(bubble).join("") +
      (busy ? '<div class="as-msg bot"><img class="as-av" src="' + PHOTO + '" alt="" width="30" height="30"><div class="as-b as-typing" aria-label="Scottie is typing"><i></i><i></i><i></i></div></div>' : "");
    log.scrollTop = log.scrollHeight;
    var chips = document.getElementById("asChips");
    chips.innerHTML = (state.msgs.length ? "" : SUGGEST.map(function (q) {
      return '<button type="button" class="as-chip" data-q="' + esc(q) + '">' + esc(q) + "</button>";
    }).join("")) + (state.msgs.length && !busy ? '<button type="button" class="as-chip ghost" data-reset>Start over</button>' : "");
    var left = document.getElementById("asLeft");
    if (left) left.textContent = info && typeof info.remaining === "number" && info.remaining <= 10 ? info.remaining + " messages left today" : "";
    var btn = document.querySelector(".as-send"); if (btn) btn.disabled = busy;
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
    var input = document.getElementById("asInput"); if (input) { input.value = ""; input.style.height = "auto"; }
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
        state.msgs.push({ role: "assistant", content: res.b.reply, handoff: !!res.b.handoff, seats: res.b.seats || null });
      }
    }).catch(function () {
      state.msgs.push({ role: "assistant", error: true, content: ERRORS.ai_unavailable });
    }).then(function () { busy = false; save(); draw(); });
  }

  /* ------------------------------ start ------------------------------ */

  function open() {
    host = document.getElementById("as-host"); if (!host) return;
    var mem = window.HRT_MEMBER;
    if (!mem) { notice("Loading..."); return; }
    if (!mem.signedIn) { locked("signed_out"); return; }
    if (!mem.client) { locked("ohana_only"); return; }
    if (started && info) { if (!document.getElementById("asLog")) chat(); return; }
    if (started) return; /* already loading */
    started = true;
    notice("Loading...");
    fetch(API, { headers: { authorization: "Bearer " + token() }, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (b) {
        if (!b.ok) { started = false; if (b.error === "signed_out") locked("signed_out"); else notice(ERRORS[b.error] || ERRORS.ai_unavailable); return; }
        if (!b.client) { locked("ohana_only"); return; }
        info = b; state = load(); chat();
      })
      .catch(function () { started = false; notice(ERRORS.ai_unavailable); });
  }

  function onRoute() { if ((location.hash || "").replace("#", "") === "ask") open(); }
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("hrt:member", onRoute);
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest('[data-route="ask"]')) setTimeout(open, 0);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onRoute); else onRoute();
})();
