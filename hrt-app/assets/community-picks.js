/* ---------------------------------------------------------------------------
   community-picks.js - HRT Community Picks (free tool, Oct 25 2026)

   Members rank lounges, resorts, routes, cards and tips from experience.
   No chat, no replies, no names. Everything lives in Memberstack Data Tables:
     cp_board   public, written only by HRT's daily tally (keys: round,
                rankings, tips, crew). The page only ever reads it.
     cp_votes   one record per member per round, readable only by its owner.
     cp_tips    open-question tips, readable only by their owner until the
                daily screening approves them onto the board.
     cp_helped  "This helped" taps, one per member per tip.
   The tally (tools/community-picks/tally.mjs) runs every morning at 5am
   Hawaii time, so rankings, tips and the contributor board refresh daily.

   Honest numbers only: a ranking shows once 25 members have picked on it.
   Exposes window.HRT_PICKS; app.js calls .show() from onShow.picks.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var SITE = "https://www.hawaiirewardtravel.com";
  var REVEAL_AT = 25;
  var FREE_PLAN = "pln_free-member-09dc08yw";
  var CATS = {
    lounges: { label: "Lounges", color: "#5fd0c4", icon: '<path d="M4 18v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5M4 18h16M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/>' },
    airlines: { label: "Airlines", color: "#82b6ff", icon: '<path d="M3 13l18-7-4 14-5-5-4 3 1-5z"/>' },
    hotels: { label: "Hotels", color: "#ff8f7d", icon: '<path d="M3 20V8l9-4 9 4v12M9 20v-6h6v6M3 20h18"/>' },
    destinations: { label: "Destinations", color: "#c9a0ff", icon: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>' },
    points: { label: "Points", color: "#f2b84b", icon: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9 10.5h4.5a1.5 1.5 0 0 1 0 3H10"/>' },
    cards: { label: "Cards", color: "#ffa463", icon: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>' },
    tips: { label: "Tips", color: "#86dc93", icon: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>' },
    awards: { label: "Awards", color: "#f2b84b", icon: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/>' }
  };
  var LINKS = {
    "hnl lounge map": { route: "lounges", label: "Open HNL Lounge Map" },
    "atmos reward calendar": { route: "atmos", label: "Search Atmos Reward Calendar" },
    "my wallet": { route: "wallet", label: "Open My Wallet" },
    "my wallet store search": { route: "wallet", label: "Which card should I use?" },
    "points valuations": { route: "values", label: "See Points Valuations" },
    "kamaʻāina deals": { route: "kamaaina", label: "See Kamaʻāina Deals" },
    "communities calculator": { route: "communities", label: "Try the Community Calculator" },
    "choose to earn calculator": { route: "status", label: "Try Choose to Earn" },
    "best credit cards": { href: SITE + "/best-credit-cards-hawaii", label: "See Best Credit Cards" }
  };
  var TINTS = ["#7fc8b8", "#c9a6e0", "#8fb3ea", "#e7c38f", "#9fd49a", "#e9a7a0", "#a9c4cf", "#d8b4c8", "#b9c98a", "#9ec1e6"];

  var host = null, mounted = false, loading = false;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var S = {
    board: null, error: "", memberId: "", signedIn: false,
    mine: [], myTip: null, myHelped: {}, show: false,
    view: "cards", cat: "all", period: "month", tab: "rank",
    poll: null
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/\s*[–—]\s*/g, ", ")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(n) { return (+n || 0).toLocaleString("en-US"); }
  function ms() { return window.$memberstackDom; }
  function cat(c) { return CATS[c] || CATS.tips; }
  function icon(c) { return '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + cat(c).icon + "</svg>"; }
  function linkFor(name) { return LINKS[String(name || "").toLowerCase().trim()] || null; }
  function hstMonth(d) { var h = new Date((d ? new Date(d) : new Date()).getTime() - 36e6); return h.toISOString().slice(0, 7); }
  function monthName() { return new Date(Date.now() - 36e6).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }); }
  function parse(s) { try { return typeof s === "string" ? JSON.parse(s) : s; } catch (e) { return null; } }
  function recs(r) { return (r && r.data && (r.data.records || r.data)) || []; }
  function field(rec, k) { var d = (rec && rec.data) || {}; return d[k]; }

  /* ----------------------------- data ----------------------------- */
  /* The round of questions comes from the board when the daily task has posted one there,
     else from data/community-round.json in this repo (the backup the weekly task also updates). */
  function fileRound() {
    return fetch("data/community-round.json", { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function loadBoard() {
    var fromMs = ms().queryDataRecords({ table: "cp_board", query: { take: 20 } }).then(function (r) {
      var b = {};
      recs(r).forEach(function (rec) { var k = field(rec, "key"), p = parse(field(rec, "payload")); if (k && p) b[k] = p; });
      return b;
    }).catch(function () { return {}; });
    return Promise.all([fromMs, fileRound()]).then(function (two) {
      var b = two[0], f = two[1];
      if (f && f.round && (!b.round || +f.round > +b.round.round)) b.round = f;
      return b;
    });
  }
  function loadMine(id) {
    var q = function (table) { return ms().queryDataRecords({ table: table, query: { where: { member: { equals: id } }, take: 100 } }).then(recs).catch(function () { return []; }); };
    return Promise.all([q("cp_votes"), q("cp_tips"), q("cp_helped")]);
  }
  function load() {
    if (loading) return;
    if (!ms() || !ms().queryDataRecords) { setTimeout(load, 300); return; }
    loading = true;
    ms().getCurrentMember().then(function (r) {
      var m = r && r.data;
      S.signedIn = !!m; S.memberId = m ? m.id : "";
      return Promise.all([loadBoard(), m ? loadMine(m.id) : Promise.resolve([[], [], []])]);
    }).then(function (all) {
      S.board = all[0] || {};
      S.mine = all[1][0] || [];
      var round = currentRound();
      S.myTip = (all[1][1] || []).filter(function (t) { return +field(t, "round") === round; })[0] || null;
      S.myHelped = {};
      (all[1][2] || []).forEach(function (h) { S.myHelped[field(h, "tip")] = h.id; });
      var last = S.mine.slice().sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); })[0];
      S.show = !!(last && field(last, "show_on_board"));
      S.error = "";
      loading = false; render();
    }).catch(function () {
      loading = false; S.error = "Community Picks could not load right now. Refresh the page to try again."; render();
    });
  }

  function currentRound() { var r = S.board && S.board.round; return r && r.round ? +r.round : 0; }
  function votedThisRound() { var n = currentRound(); return S.mine.some(function (v) { return +field(v, "round") === n; }); }
  function myStats() {
    var month = hstMonth(), picks = 0, rounds = {};
    S.mine.forEach(function (v) {
      var a = parse(field(v, "answers")), n = 0;
      if (a && a.q) Object.keys(a.q).forEach(function (k) { if (a.q[k] && a.q[k].p) n++; });
      if (hstMonth(v.createdAt) === month) picks += n;
      rounds[+field(v, "round")] = 1;
    });
    return { picks: picks, rounds: Object.keys(rounds).length };
  }
  function topicFor(id) { var r = S.board && S.board.rankings; return r && (r.topics || []).filter(function (t) { return t.id === id; })[0]; }

  /* ----------------------------- render ----------------------------- */
  function render() {
    if (!host) return;
    if (S.error) { host.innerHTML = '<div class="cp"><div class="cp-wrap"><div class="cp-empty">' + esc(S.error) + "</div></div></div>"; return; }
    if (!S.board) { host.innerHTML = '<div class="cp"><div class="cp-wrap"><div class="cp-empty">Loading Community Picks...</div></div></div>'; return; }
    var rk = S.board.rankings || { topics: [], travelers: 0, picksMonth: 0 };
    var tabs = [["rank", "Rankings"], ["tips", "Tips"], ["crew", "Contributors"]];
    var body = S.tab === "tips" ? tipsHtml() : S.tab === "crew" ? crewHtml() : rankingsHtml();
    host.innerHTML = '<div class="cp">' + heroHtml(rk) + '<div class="cp-wrap">' + inviteHtml() + '<div class="cp-poll" id="cpPoll" hidden></div>' +
      '<nav class="cp-tabs" aria-label="Community Picks sections">' + tabs.map(function (t) {
        return '<button type="button" data-cp-tab="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + "</button>";
      }).join("") + "</nav>" + body + howHtml() + "</div></div>";
    flapBoard(rk);
    if (S.tab === "rank") renderTopics();
    if (S.poll) { host.querySelector("#cpInvite").hidden = true; drawPoll(); }
  }

  /* Hero photo: Waikiki sunset by Tim Mossholder on Unsplash (Unsplash License, free to use). */
  var HERO_IMG = "https://images.unsplash.com/photo-1719469243598-0191cfae6f83?w=2000&h=1000&fit=crop&crop=focalpoint&fp-x=0.6&fp-y=0.32&q=70&auto=format";
  var HERO_CREDIT = "https://unsplash.com/photos/a-sunset-on-a-beach-with-palm-trees-in-the-background-xRgUxTUI_dE";
  function heroHtml(rk) {
    var live = (rk.topics || []).filter(function (t) { return !t.locked; });
    var crew = (S.board.crew && S.board.crew.monthly) || [];
    var stack = crew.slice(0, 5).map(function (c, i) { return avatar(c, i, "cp-stk"); }).join("");
    return '<header class="cp-hero"><div class="cp-photo" style="background-image:url(\'' + HERO_IMG + '\')"><div class="cp-in cp-hin">' +
      (rk.picksMonth ? '<div class="cp-live"><i aria-hidden="true"></i><span><b class="cp-num">' + fmt(rk.picksMonth) + "</b> picks in " + esc(monthName()) + "</span></div>" : '<div class="cp-live"><i aria-hidden="true"></i><span>Community Picks is open</span></div>') +
      '<h1 class="cp-h1">What Hawaiʻi travelers rank #1</h1>' +
      '<p class="cp-lede">Lounges, resorts, routes and cards, ranked by locals who have actually been there. Look before you spend your points.</p>' +
      (rk.travelers ? '<div class="cp-crowd">' + (stack ? '<span class="cp-stack" aria-hidden="true">' + stack + "</span>" : "") + '<small><b class="cp-num">' + fmt(rk.travelers) + "</b> " + (rk.travelers === 1 ? "traveler has" : "travelers have") + " shared picks so far</small></div>" : "") +
      '</div><a class="cp-credit" href="' + HERO_CREDIT + '" target="_blank" rel="noopener">Photo: Tim Mossholder, Unsplash</a></div>' +
      '<div class="cp-in cp-sin"><div class="cp-board" role="table" aria-label="Community number one picks"><div class="cp-bh" role="row"><span role="columnheader">TOPIC</span><span role="columnheader">#1 PICK</span><span role="columnheader" class="r">SHARE</span><span role="columnheader" class="r cp-hide-s">PICKS</span></div>' +
      '<div id="cpBoardRows">' + (live.length ? "" : '<div class="cp-brow" role="row"><span class="cp-cell t" role="cell" style="--rc:#f2b84b">FIRST RANKINGS</span><span class="cp-cell" role="cell">POSTING SOON</span><span class="cp-cell p" role="cell">--</span><span class="cp-cell v cp-hide-s" role="cell">--</span></div>') + "</div>" +
      '<div class="cp-bf"><span>' + (live.length ? "NOW SHOWING · " + live.length + (live.length === 1 ? " TOPIC" : " TOPICS") : "RANKINGS POST AS PICKS COME IN") + "</span><span>UPDATES DAILY 5:00 AM HST</span></div></div></div></header>";
  }

  function boardLabel(q) { return String(q || "").replace(/\?$/, "").replace(/^(best|most)\s+/i, "").slice(0, 26); }
  function flapBoard(rk) {
    var rows = (rk.topics || []).filter(function (t) { return !t.locked && t.picks && t.picks.length; }).slice(0, 7);
    var box = host.querySelector("#cpBoardRows"); if (!box || !rows.length) return;
    box.innerHTML = rows.map(function (t, i) {
      return '<div class="cp-brow" role="row" style="--rc:' + cat(t.cat).color + '"><span class="cp-cell t" role="cell" data-f="' + i + 't"></span><span class="cp-cell" role="cell" data-f="' + i + 'w"></span><span class="cp-cell p cp-num" role="cell" data-f="' + i + 'p"></span><span class="cp-cell v cp-num cp-hide-s" role="cell" data-f="' + i + 'v"></span></div>';
    }).join("");
    rows.forEach(function (t, i) {
      var d = i * 140;
      flap(box.querySelector('[data-f="' + i + 't"]'), boardLabel(t.q), d);
      flap(box.querySelector('[data-f="' + i + 'w"]'), t.picks[0][0], d + 120);
      flap(box.querySelector('[data-f="' + i + 'p"]'), t.picks[0][1] + "%", d + 260);
      flap(box.querySelector('[data-f="' + i + 'v"]'), String(t.votes), d + 320);
    });
  }
  var CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  function flap(el, text, delay) {
    if (!el) return;
    el.textContent = text;
    if (reduce) return;
    var target = String(text).toUpperCase(), len = target.length, start = null, at = [];
    for (var i = 0; i < len; i++) at.push(6 + i * 1.4 + Math.random() * 6);
    function tick(ts) {
      if (!el.isConnected) return;
      if (start === null) start = ts + delay;
      if (ts < start) { requestAnimationFrame(tick); return; }
      var f = (ts - start) / 28, out = "", done = true;
      for (var j = 0; j < len; j++) {
        var ch = target[j];
        if (ch === " " || f >= at[j]) out += ch; else { out += CHARS[Math.floor(Math.random() * CHARS.length)]; done = false; }
      }
      el.textContent = out;
      if (!done) requestAnimationFrame(tick); else el.textContent = text;
    }
    requestAnimationFrame(tick);
  }

  function closesIn() {
    var r = S.board.round; if (!r || !r.opened) return "";
    var end = new Date(r.opened + "T15:00:00Z").getTime() + 7 * 864e5, left = end - Date.now();
    if (left <= 0) return "New picks open soon";
    var d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 36e5);
    return "Closes in " + (d ? d + "d " : "") + h + "h";
  }
  function inviteHtml() {
    var r = S.board.round;
    if (!r || !(r.questions || []).length) {
      return '<section class="cp-invite" id="cpInvite"><div><h2 class="cp-h2s">New picks open soon</h2><p class="cp-p">The next round of questions posts on Monday morning.</p></div></section>';
    }
    if (!S.signedIn) {
      return '<section class="cp-invite" id="cpInvite"><div><h2 class="cp-h2s">Add your picks</h2><p class="cp-p">Create a free account to rate what you\'ve tried and help the next traveler choose. It takes a minute.</p></div>' +
        '<div class="cp-meta"><button type="button" class="cp-btn" data-cp="signup">Create a free account</button><button type="button" class="cp-btn ghost" data-cp="login">Log in</button></div></section>';
    }
    if (votedThisRound()) {
      return '<section class="cp-invite done" id="cpInvite"><div><h2 class="cp-h2s">You\'re all set this week</h2><p class="cp-p">Your picks count in tomorrow morning\'s rankings. New questions open Monday.</p></div><div class="cp-meta"><span class="cp-count">' + esc(closesIn()) + "</span></div></section>";
    }
    var n = r.questions.length;
    return '<section class="cp-invite" id="cpInvite"><div><h2 class="cp-h2s">Your picks for this week</h2><p class="cp-p">' + n + " quick taps" + (r.open ? " plus one open question" : "") + ". Only rate what you've tried, then tell us why in one tap.</p></div>" +
      '<div class="cp-meta"><span class="cp-count">' + esc(closesIn()) + '</span><button type="button" class="cp-btn" data-cp="open">Add my picks</button></div></section>';
  }

  function rankingsHtml() {
    var chips = [["all", "All"]].concat(Object.keys(CATS).filter(function (k) { return k !== "awards"; }).map(function (k) { return [k, CATS[k].label]; }));
    return '<section class="cp-sec" aria-labelledby="cpRankT"><div class="cp-sh"><div><h2 class="cp-h2" id="cpRankT">The rankings</h2><p class="cp-p">Every topic, ranked by members who picked from experience, with the top reasons they gave.</p></div>' +
      '<div class="cp-seg" role="group" aria-label="Layout"><button type="button" data-cp-view="cards" aria-pressed="' + (S.view === "cards") + '">Cards</button><button type="button" data-cp-view="list" aria-pressed="' + (S.view === "list") + '">List</button></div></div>' +
      '<div class="cp-chips" role="group" aria-label="Filter topics">' + chips.map(function (c) {
        return '<button type="button" class="cp-chip" data-cp-cat="' + c[0] + '" style="--cc:' + (c[0] === "all" ? "#eef2f7" : CATS[c[0]].color) + '" aria-pressed="' + (S.cat === c[0]) + '"><i aria-hidden="true"></i>' + c[1] + "</button>";
      }).join("") + '</div><div id="cpTopics"></div></section>';
  }
  function moveTag(m) {
    if (m > 0) return '<span class="cp-move up">&#9650;' + m + '<span class="cp-sr"> up</span></span>';
    if (m < 0) return '<span class="cp-move down">&#9660;' + (-m) + '<span class="cp-sr"> down</span></span>';
    return "";
  }
  function renderTopics() {
    var box = host.querySelector("#cpTopics"); if (!box) return;
    var all = (S.board.rankings && S.board.rankings.topics) || [];
    var list = all.filter(function (t) { return S.cat === "all" || t.cat === S.cat; });
    if (!list.length) {
      box.innerHTML = '<div class="cp-empty">' + (all.length ? "No picks in this topic yet. They'll show here as members vote." : "The first rankings post once " + REVEAL_AT + " travelers weigh in on a question. Add your picks to get it started.") + "</div>";
      return;
    }
    if (S.view === "list") {
      box.innerHTML = '<div class="cp-tl"><table><thead><tr><th scope="col">TOPIC</th><th scope="col">QUESTION</th><th scope="col">COMMUNITY #1</th><th scope="col" class="r">SHARE</th><th scope="col" class="r">PICKS</th></tr></thead><tbody>' +
        list.map(function (t) {
          return '<tr style="--cc:' + cat(t.cat).color + '"><td class="m"><span class="cp-dot" aria-hidden="true"></span>' + esc(cat(t.cat).label) + '</td><td class="b">' + esc(t.q) + '</td><td class="w">' + (t.locked ? '<span class="m">' + fmt(t.votes) + " of " + REVEAL_AT + " picks</span>" : esc(t.picks[0][0])) + '</td><td class="n">' + (t.locked ? "" : t.picks[0][1] + "%") + '</td><td class="n m">' + fmt(t.votes) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
      return;
    }
    box.innerHTML = '<div class="cp-grid">' + list.map(function (t) {
      var c = cat(t.cat), body, L = linkFor(t.link);
      if (t.locked) {
        body = '<div class="cp-locked"><b><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Revealed at ' + REVEAL_AT + ' picks</b><div class="cp-bar"><i data-w="' + Math.min(100, Math.round(t.votes / REVEAL_AT * 100)) + '"></i></div><span class="cp-small">' + fmt(t.votes) + " of " + REVEAL_AT + " so far. " + (REVEAL_AT - t.votes) + " more to reveal the ranking.</span></div>";
      } else {
        body = t.picks.map(function (p, i) {
          return '<div class="cp-rank' + (i === 0 ? " first" : "") + '"><span class="cp-pos">' + (i + 1) + '</span><span class="cp-name">' + esc(p[0]) + moveTag(p[3]) + '</span><span class="cp-pct cp-num">' + p[1] + '%</span><div class="cp-bar"><i data-w="' + p[1] + '"></i></div></div>';
        }).join("") + ((t.why || []).length ? '<div class="cp-why"><span>Why travelers picked ' + esc(t.picks[0][0]) + "</span><div>" + t.why.map(function (w) { return "<b>" + esc(w[0]) + ' <em class="cp-num">' + w[1] + "%</em></b>"; }).join("") + "</div></div>" : "");
      }
      var link = L ? (L.route ? '<a href="#' + L.route + '" data-route="' + L.route + '">' + esc(L.label) + "</a>" : '<a href="' + L.href + '" target="_top" rel="noopener">' + esc(L.label) + "</a>") : "";
      return '<article class="cp-card" style="--cc:' + c.color + '"><div class="cp-ctop"><span class="cp-cat">' + icon(t.cat) + esc(c.label) + '</span></div><h3 class="cp-h3">' + esc(t.q) + "</h3>" + body +
        '<div class="cp-cfoot"><span><b class="cp-num">' + fmt(t.votes) + "</b> picks</span>" + link + "</div></article>";
    }).join("") + "</div>";
    grow(box);
  }
  function grow(box) {
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      box.querySelectorAll(".cp-bar i").forEach(function (b) { b.style.width = Math.min(100, +b.getAttribute("data-w")) + "%"; });
    }); });
  }

  function tipsHtml() {
    var tb = S.board.tips || { tips: [] }, tips = tb.tips || [], r = S.board.round;
    var q = (tips[0] && tb.questions && tb.questions[tips[0].round]) || (r && r.open && r.open.q) || "";
    var mine = S.myTip ? '<article class="cp-tip mine"><div class="cp-who"><span class="cp-av" style="background:#f2b84b">You</span><div><b>Your tip</b><span>' + (/approved/i.test(field(S.myTip, "status") || "") ? "Approved" : "In review") + '</span></div></div><p class="cp-tp">' + esc(field(S.myTip, "text")) + "</p></article>" : "";
    var cards = tips.map(function (t, i) {
      var on = !!S.myHelped[t.id], n = t.helped;
      return '<article class="cp-tip' + (i === 0 && t.helped > 0 ? " top" : "") + '"><div class="cp-who">' + avatar(t, i) + "<div><b>" + esc(t.who) + "</b><span>Community member</span></div>" + (i === 0 && t.helped > 0 ? '<span class="cp-tbadge">Most helpful</span>' : "") + '</div><p class="cp-tp">' + esc(t.text) + "</p>" +
        '<div class="cp-tfoot">' + (S.signedIn ? '<button type="button" class="cp-helped" data-cp-help="' + esc(t.id) + '" aria-pressed="' + on + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.3 20H7"/></svg>This helped</button>' : "") +
        '<span class="cp-small cp-num">' + fmt(n) + " found this helpful</span></div></article>";
    }).join("");
    return '<section class="cp-sec" aria-labelledby="cpTipsT"><div class="cp-sh"><div><h2 class="cp-h2" id="cpTipsT">Tips from the community</h2><p class="cp-p">Answers to the open question, in members\' own words. The most helpful rise to the top.</p></div></div>' +
      (q ? '<div class="cp-openq"><small>' + (tips.length ? "OPEN QUESTION" : "THIS WEEK'S OPEN QUESTION") + "</small><b>" + esc(q) + "</b></div>" : "") +
      (mine || cards ? '<div class="cp-tips">' + mine + cards + "</div>" : '<div class="cp-empty">The first tips post after review. Answer this week\'s open question to be one of them.</div>') +
      '<p class="cp-note">Every tip is reviewed by HRT before it posts. Tips about prices or rules are fact-checked first.</p></section>';
  }

  function avatar(c, i, extra) {
    var bg = TINTS[i % TINTS.length];
    if (c.photo && /^https:\/\//.test(c.photo)) return '<span class="cp-av ' + (extra || "") + '" style="background:' + bg + '"><img src="' + esc(c.photo) + '" alt="" loading="lazy"></span>';
    return '<span class="cp-av ' + (extra || "") + '" style="background:' + bg + '" aria-hidden="true">' + esc(c.who || "") + "</span>";
  }
  function crewHtml() {
    var cr = S.board.crew || {}, rows = (S.period === "month" ? cr.monthly : cr.allTime) || [];
    var me = myStats();
    var pod = rows.slice(0, 3), order = [1, 0, 2].filter(function (i) { return pod[i]; });
    var podium = order.map(function (i) {
      var r = pod[i];
      return '<div class="cp-pod p' + (i + 1) + '">' + avatar(r, i) + '<span class="cp-medal">' + ["1st", "2nd", "3rd"][i] + '</span><b class="cp-pw">' + esc(r.who) + '</b><span class="cp-big cp-num">' + fmt(r.picks) + '</span><span class="cp-small">picks' + (r.streak > 1 ? " · " + r.streak + " week streak" : "") + "</span></div>";
    }).join("");
    var ladder = rows.slice(3).map(function (r, i) {
      return '<div class="cp-lrow"><span class="cp-pos">' + (i + 4) + "</span>" + avatar(r, i + 3) + '<span class="cp-lw"><b>' + esc(r.who) + "</b></span>" + (r.streak > 1 ? '<span class="cp-streak">' + r.streak + " week streak</span>" : "<span></span>") + '<span class="cp-lc cp-num">' + fmt(r.picks) + "</span></div>";
    }).join("");
    var meRow = S.signedIn ? '<div class="cp-lrow me"><span class="cp-pos">You</span><span class="cp-av" style="background:#f2b84b" aria-hidden="true">You</span><span class="cp-lw"><b>Your picks in ' + esc(monthName()) + "</b><span>" + (S.show ? "You're on the board" : "Not shown on the board") + '</span></span><label class="cp-opt"><input type="checkbox" id="cpShow"' + (S.show ? " checked" : "") + "> Show me</label>" + '<span class="cp-lc cp-num">' + fmt(me.picks) + "</span></div>" : "";
    return '<section class="cp-sec" aria-labelledby="cpCrewT"><div class="cp-sh"><div><h2 class="cp-h2" id="cpCrewT">Top contributors</h2><p class="cp-p">Ranked by picks added' + (S.period === "month" ? " in " + esc(monthName()) : " all time") + '. Every pick helps someone choose better.</p></div>' +
      '<div class="cp-seg" role="group" aria-label="Time period"><button type="button" data-cp-period="month" aria-pressed="' + (S.period === "month") + '">This month</button><button type="button" data-cp-period="all" aria-pressed="' + (S.period === "all") + '">All time</button></div></div>' +
      (rows.length ? '<div class="cp-podium">' + podium + "</div>" : '<div class="cp-empty">The board fills as members add picks. Turn on "Show me" to be on it.</div>') +
      (ladder || meRow ? '<div class="cp-ladder">' + ladder + meRow + "</div>" : "") +
      '<p class="cp-note">Contributors appear with their profile photo and initials only, never their name. Showing up is your choice.</p></section>';
  }
  function howHtml() {
    return '<p class="cp-how">Pick only what you\'ve tried. One pick per member per question. A ranking shows once ' + REVEAL_AT + ' travelers weigh in, and every tip is reviewed before it posts.</p>';
  }

  /* ----------------------------- poll ----------------------------- */
  function startPoll() {
    var r = S.board.round;
    S.poll = { step: 0, phase: "pick", answers: {}, writein: {}, reasons: {}, other: false, tip: "", saving: false, err: "" };
    host.querySelector("#cpInvite").hidden = true;
    drawPoll();
    var el = host.querySelector("#cpPoll"); if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }
  function steps() { var r = S.board.round; return (r.questions || []).length + (r.open ? 1 : 0); }
  function pollHead(c, q, i, n) {
    var dots = ""; for (var k = 0; k < n; k++) dots += '<span class="' + (k === i ? "on" : k < i ? "done" : "") + '"></span>';
    return '<div class="cp-ptop"><div class="cp-steps" aria-label="Question ' + (i + 1) + " of " + n + '">' + dots + "<em>" + (i + 1) + " of " + n + '</em></div><button type="button" class="cp-ib" data-cp="close" aria-label="Close"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div><div class="cp-pcat">' + esc(cat(c).label.toUpperCase()) + '</div><h3 class="cp-pq">' + esc(q) + "</h3>";
  }
  function agreeLine(q, pick) {
    var t = topicFor(q.id);
    if (t && !t.locked) {
      var hit = t.picks.filter(function (p) { return p[0] === pick; })[0];
      if (hit) return { pct: hit[1], text: hit[1] + "% of travelers also picked " + pick };
      return { pct: 0, text: "You're one of the few picking " + pick + ". Nice find." };
    }
    return null;
  }
  function drawPoll() {
    var P = S.poll, r = S.board.round, el = host.querySelector("#cpPoll"); if (!el || !P) return;
    el.hidden = false;
    var qs = r.questions || [], n = steps();
    if (P.step >= n) return P.saved ? drawDone() : drawSaving();
    if (P.step === qs.length && r.open) {
      el.style.setProperty("--qc", CATS.tips.color);
      el.innerHTML = pollHead("tips", r.open.q, P.step, n) + '<p class="cp-hint">' + esc(r.open.hint || "One tip in a sentence or two. No names, links or personal info.") + "</p></div>" +
        '<div class="cp-col"><label for="cpTip" class="cp-lab">Your tip</label><textarea id="cpTip" class="cp-field" maxlength="200" placeholder="Example: I always check award seats the morning they open...">' + esc(P.tip) + "</textarea>" +
        '<div class="cp-row"><span class="cp-err" id="cpTipErr"' + (P.err ? "" : " hidden") + ">" + esc(P.err || "Write a short tip first, or skip this one.") + '</span><span class="cp-small cp-num" id="cpTipN" style="margin-left:auto">' + P.tip.length + " / 200</span></div>" +
        '<span class="cp-small">Every tip is reviewed before it posts. Please leave out names, links and personal details.</span></div>' +
        '<div class="cp-pfoot"><button type="button" class="cp-btn ghost" data-cp="back">Back</button><div class="cp-row"><button type="button" class="cp-link" data-cp="skipTip">Skip</button><button type="button" class="cp-btn" data-cp="shareTip"' + (P.saving ? " disabled" : "") + ">" + (P.saving ? "Saving..." : "Finish") + "</button></div></div>";
      var ta = el.querySelector("#cpTip");
      ta.addEventListener("input", function () { P.tip = ta.value; el.querySelector("#cpTipN").textContent = ta.value.length + " / 200"; el.querySelector("#cpTipErr").hidden = true; });
      return;
    }
    var q = qs[P.step];
    el.style.setProperty("--qc", cat(q.cat).color);
    if (P.phase === "pick") {
      el.innerHTML = pollHead(q.cat, q.q, P.step, n) + (q.hint ? '<p class="cp-hint">' + esc(q.hint) + "</p>" : "") + "</div>" +
        '<div class="cp-choices">' + q.choices.map(function (c) { return '<button type="button" class="cp-choice" data-cp-pick="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") +
        (P.other ? "" : '<button type="button" class="cp-choice add" data-cp="other">+ Something else</button>') + "</div>" +
        (P.other ? '<div class="cp-other"><label for="cpOther" class="cp-lab">Your answer</label><div class="cp-row"><input id="cpOther" class="cp-field" maxlength="40" autocomplete="off" placeholder="Type a short answer"><button type="button" class="cp-btn" data-cp="addOther">Add</button></div><span class="cp-err" id="cpOtherErr" hidden>Type an answer first.</span><span class="cp-small">Write-ins are reviewed. When a few people give the same answer, it becomes a choice for everyone.</span></div>' : "") +
        '<div class="cp-pfoot"><button type="button" class="cp-btn ghost" data-cp="back">Back</button>' + (q.tried ? '<button type="button" class="cp-link" data-cp="skip">I haven\'t tried these</button>' : '<button type="button" class="cp-link" data-cp="skip">Skip</button>') + "</div>";
      if (P.other) {
        var oi = el.querySelector("#cpOther"); oi.focus();
        oi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addOther(); } });
        oi.addEventListener("input", function () { el.querySelector("#cpOtherErr").hidden = true; });
      }
    } else {
      var pick = P.answers[q.id], w = !!P.writein[q.id], chosen = P.reasons[q.id] || [], a = w ? null : agreeLine(q, pick);
      el.innerHTML = pollHead(q.cat, q.q, P.step, n) + "</div>" +
        (w ? '<div class="cp-agree"><b>Thanks for adding "' + esc(pick) + '"</b><span class="cp-small">It goes to review first. If a few more travelers say the same, it joins the list for everyone.</span></div>'
          : a ? '<div class="cp-agree"><b>' + esc(a.text) + '</b><div class="cp-bar"><i data-w="' + a.pct + '"></i></div></div>'
          : '<div class="cp-agree saved"><b><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>Your pick: ' + esc(pick) + '</b></div>') +
        ((q.reasons || []).length ? '<div class="cp-col"><span class="cp-lab">Why did you pick it? <span class="cp-small">Tap up to 2</span></span><div class="cp-reasons">' + q.reasons.map(function (x) { return '<button type="button" class="cp-reason" data-cp-reason="' + esc(x) + '" aria-pressed="' + (chosen.indexOf(x) > -1) + '">' + esc(x) + "</button>"; }).join("") + "</div></div>" : "") +
        '<div class="cp-pfoot"><button type="button" class="cp-btn ghost" data-cp="repick">Change pick</button><button type="button" class="cp-btn" data-cp="next">' + (P.step === n - 1 ? "Finish" : "Next question") + "</button></div>";
      grow(el);
    }
  }
  function addOther() {
    var P = S.poll, q = S.board.round.questions[P.step], el = host.querySelector("#cpOther"), v = el ? el.value.replace(/\s+/g, " ").trim() : "";
    if (!v) { host.querySelector("#cpOtherErr").hidden = false; el.focus(); return; }
    P.answers[q.id] = v.slice(0, 40); P.writein[q.id] = true; P.other = false; P.phase = "why"; drawPoll();
  }
  function cleanTip(s) {
    return String(s || "").replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/\S+@\S+\.\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  }
  function save() {
    var P = S.poll, r = S.board.round;
    var q = {};
    (r.questions || []).forEach(function (x) {
      var p = P.answers[x.id];
      if (p) q[x.id] = { p: p, r: (P.reasons[x.id] || []).slice(0, 2) }; if (p && P.writein[x.id]) q[x.id].w = 1;
    });
    var tip = cleanTip(P.tip);
    P.saving = true; P.err = ""; P.step = steps(); drawPoll();
    var jobs = [];
    if (Object.keys(q).length) jobs.push(ms().createDataRecord({ table: "cp_votes", data: { member: S.memberId, round: r.round, answers: JSON.stringify({ q: q }), show_on_board: S.show } }));
    if (tip) jobs.push(ms().createDataRecord({ table: "cp_tips", data: { member: S.memberId, round: r.round, text: tip } }));
    if (!jobs.length) { S.poll = null; render(); return; }
    Promise.all(jobs).then(function () {
      P.saved = { picks: Object.keys(q).length, tip: !!tip };
      P.saving = false;
      return loadMine(S.memberId).then(function (all) {
        S.mine = all[0] || S.mine;
        S.myTip = (all[1] || []).filter(function (t) { return +field(t, "round") === r.round; })[0] || S.myTip;
      }).catch(function () {});
    }).then(function () { drawDone(); }).catch(function () {
      P.saving = false; P.err = "Your picks could not be saved. Check your connection and try again."; drawPoll();
    });
  }
  function drawSaving() {
    var P = S.poll, el = host.querySelector("#cpPoll");
    el.innerHTML = P.err
      ? '<div class="cp-col"><h3 class="cp-pq">Almost there</h3><p class="cp-err">' + esc(P.err) + '</p></div><div class="cp-pfoot"><button type="button" class="cp-btn ghost" data-cp="close">Close</button><button type="button" class="cp-btn" data-cp="retry">Try again</button></div>'
      : '<div class="cp-col"><h3 class="cp-pq">Saving your picks...</h3><p class="cp-hint">One moment.</p></div>';
  }
  function drawDone() {
    var P = S.poll, el = host.querySelector("#cpPoll"), r = S.board.round;
    var matched = 0, counted = 0;
    (r.questions || []).forEach(function (x) {
      var t = topicFor(x.id), p = P.answers[x.id];
      if (!p || P.writein[x.id] || !t || t.locked) return;
      counted++; if (t.picks[0] && t.picks[0][0] === p) matched++;
    });
    el.style.setProperty("--qc", "#f2b84b");
    el.innerHTML = '<div class="cp-done"><div class="cp-ring cp-num">+' + ((P.saved && P.saved.picks) || 0) + '</div><div><h3 class="cp-pq">Picks added. Mahalo!</h3><p class="cp-hint">' +
      (counted ? "You matched the community's #1 on " + matched + " of " + counted + " topics. " : "") + "Your picks count in tomorrow morning's rankings." + (P.saved && P.saved.tip ? " Your tip is in review and posts once it's approved." : "") + "</p></div></div>" +
      '<label class="cp-opt big"><input type="checkbox" id="cpShow2"' + (S.show ? " checked" : "") + "> Show my photo and initials on the contributor board</label>" +
      '<div class="cp-pfoot"><span></span><button type="button" class="cp-btn" data-cp="finish">See the rankings</button></div>';
  }
  function setShow(on) {
    S.show = !!on;
    var mineThis = S.mine.filter(function (v) { return +field(v, "round") === currentRound(); })[0] || S.mine[0];
    if (mineThis && ms().updateDataRecord) {
      ms().updateDataRecord({ recordId: mineThis.id, data: { show_on_board: S.show } }).catch(function () {});
    }
  }
  function toggleHelped(tipId, btn) {
    var have = S.myHelped[tipId];
    btn.disabled = true;
    var job = have ? ms().deleteDataRecord({ recordId: have }).then(function () { delete S.myHelped[tipId]; })
      : ms().createDataRecord({ table: "cp_helped", data: { member: S.memberId, tip: tipId } }).then(function (r) { S.myHelped[tipId] = (r && r.data && r.data.id) || "pending"; });
    job.then(function () {
      btn.setAttribute("aria-pressed", String(!!S.myHelped[tipId]));
    }).catch(function () {}).then(function () { btn.disabled = false; });
  }

  /* ----------------------------- events ----------------------------- */
  function onClick(e) {
    var b = e.target.closest("button, input"); if (!b || !host.contains(b)) return;
    var P = S.poll, r = S.board && S.board.round;
    if (b.id === "cpShow" || b.id === "cpShow2") { setShow(b.checked); return; }
    if (b.hasAttribute("data-cp-cat")) { S.cat = b.getAttribute("data-cp-cat"); host.querySelectorAll("[data-cp-cat]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderTopics(); return; }
    if (b.hasAttribute("data-cp-view")) { S.view = b.getAttribute("data-cp-view"); host.querySelectorAll("[data-cp-view]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); renderTopics(); return; }
    if (b.hasAttribute("data-cp-tab")) { S.tab = b.getAttribute("data-cp-tab"); render(); var nv = host.querySelector(".cp-tabs"); if (nv) nv.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return; }
    if (b.hasAttribute("data-cp-period")) { S.period = b.getAttribute("data-cp-period"); render(); return; }
    if (b.hasAttribute("data-cp-help")) { toggleHelped(b.getAttribute("data-cp-help"), b); return; }
    var act = b.getAttribute("data-cp");
    if (act === "open") { startPoll(); return; }
    if (act === "signup" || act === "login") {
      var hb = document.querySelector('.ms-auth [data-ms-modal="' + act + '"]');
      if (hb) hb.click(); else if (ms() && ms().openModal) ms().openModal(act === "signup" ? "SIGNUP" : "LOGIN", act === "signup" ? { signup: { plans: [FREE_PLAN] } } : undefined);
      return;
    }
    if (!P) return;
    if (act === "retry") { save(); return; }
    var q = r.questions[P.step] || {};
    if (b.hasAttribute("data-cp-pick")) { P.answers[q.id] = b.getAttribute("data-cp-pick"); P.writein[q.id] = false; P.phase = "why"; drawPoll(); return; }
    if (b.hasAttribute("data-cp-reason")) {
      var list = P.reasons[q.id] || (P.reasons[q.id] = []), x = b.getAttribute("data-cp-reason"), at = list.indexOf(x);
      if (at > -1) list.splice(at, 1); else { if (list.length >= 2) list.shift(); list.push(x); }
      host.querySelectorAll("[data-cp-reason]").forEach(function (y) { y.setAttribute("aria-pressed", String(list.indexOf(y.getAttribute("data-cp-reason")) > -1)); });
      return;
    }
    if (act === "other") { P.other = true; drawPoll(); return; }
    if (act === "addOther") { addOther(); return; }
    if (act === "shareTip") { var t = cleanTip(P.tip); if (!t && P.tip.trim()) { P.err = "Please leave out links and email addresses."; drawPoll(); return; } if (!t) { host.querySelector("#cpTipErr").hidden = false; return; } P.err = ""; save(); return; }
    if (act === "skipTip") { P.tip = ""; save(); return; }
    if (act === "skip") { delete P.answers[q.id]; P.other = false; nextStep(); return; }
    if (act === "next") { nextStep(); return; }
    if (act === "repick") { P.phase = "pick"; drawPoll(); return; }
    if (act === "back") { P.other = false; if (P.step > 0) { P.step--; P.phase = "pick"; drawPoll(); } else closePoll(); return; }
    if (act === "close") { closePoll(); return; }
    if (act === "finish") { S.poll = null; S.tab = "rank"; render(); var t2 = host.querySelector(".cp-tabs"); if (t2) t2.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
  }
  function nextStep() {
    var P = S.poll; P.step++; P.phase = "pick"; P.other = false;
    if (P.step >= steps()) save(); else drawPoll();
  }
  function closePoll() { S.poll = null; var el = host.querySelector("#cpPoll"); if (el) el.hidden = true; var inv = host.querySelector("#cpInvite"); if (inv) inv.hidden = false; }

  /* ----------------------------- styles ----------------------------- */
  function styles() {
    if (document.getElementById("cp-styles")) return;
    var css = [
      "#cp-host{--cp-ink:#0c1420;--cp-panel:#141e30;--cp-panel2:#1a2740;--cp-line:#273652;--cp-fg:#eef2f7;--cp-mute:#a7b2c3;--cp-dim:#8794aa;--cp-gold:#f2b84b;--cp-orange:#e8824c;--cp-live:#5fd38d}",
      "#cp-host .cp{background:var(--cp-ink);color:var(--cp-fg);border-radius:20px;overflow:hidden;font-size:16px;line-height:1.5}",
      "#cp-host .cp *{box-sizing:border-box}",
      "#cp-host .cp button{font:inherit;color:inherit;cursor:pointer}",
      "#cp-host .cp button:focus-visible,#cp-host .cp a:focus-visible,#cp-host .cp input:focus-visible{outline:3px solid var(--cp-gold);outline-offset:3px}",
      "#cp-host .cp-num{font-variant-numeric:tabular-nums}",
      "#cp-host .cp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}",
      "#cp-host .cp-in{max-width:1120px;margin:0 auto;padding-left:clamp(16px,3vw,32px);padding-right:clamp(16px,3vw,32px)}",
      "#cp-host .cp-wrap{max-width:1120px;margin:0 auto;padding:24px clamp(16px,3vw,32px) 36px;display:flex;flex-direction:column;gap:22px}",
      "#cp-host .cp-photo{position:relative;background-color:#1b2430;background-size:cover;background-position:60% 32%}",
      "#cp-host .cp-photo::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,20,32,.82) 0%,rgba(12,20,32,.55) 45%,rgba(12,20,32,.1) 100%),linear-gradient(180deg,rgba(12,20,32,0) 55%,var(--cp-ink) 100%)}",
      "#cp-host .cp-credit{position:absolute;right:14px;top:10px;z-index:1;font-size:12px;color:rgba(255,255,255,.7);text-decoration:none}",
      "#cp-host .cp-credit:hover{color:#fff;text-decoration:underline}",
      "#cp-host .cp-hin{position:relative;padding-top:28px;padding-bottom:clamp(70px,9vw,110px);display:flex;flex-direction:column;gap:12px}",
      "#cp-host .cp-sin{position:relative;margin-top:-34px;padding-bottom:6px}",
      "#cp-host .cp-tabs{display:flex;gap:6px;padding:5px;border-radius:14px;background:var(--cp-panel);border:1px solid var(--cp-line);position:sticky;top:0;z-index:2;overflow-x:auto}",
      "#cp-host .cp-tabs button{flex:1 1 0;min-height:46px;padding:0 16px;border-radius:10px;border:0;background:transparent;color:var(--cp-mute);font-weight:700;font-size:16px;white-space:nowrap}",
      "#cp-host .cp-tabs button[aria-pressed='true']{background:var(--cp-fg);color:var(--cp-ink)}",
      "#cp-host .cp-agree.saved b{display:flex;align-items:center;gap:10px;color:var(--qc,var(--cp-gold))}",
      "#cp-host .cp-live{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;font-size:15px;color:#e6e8f5;background:rgba(10,16,30,.45);border:1px solid rgba(255,255,255,.14);padding:6px 12px;border-radius:99px}",
      "#cp-host .cp-live i{width:9px;height:9px;border-radius:50%;background:var(--cp-live);animation:cpPulse 2s infinite}",
      "@keyframes cpPulse{0%{box-shadow:0 0 0 0 rgba(95,211,141,.55)}70%{box-shadow:0 0 0 10px rgba(95,211,141,0)}100%{box-shadow:0 0 0 0 rgba(95,211,141,0)}}",
      "#cp-host .cp-h1{margin:6px 0 0;font-size:clamp(38px,6.4vw,76px);line-height:.95;font-weight:800;letter-spacing:-.01em;color:#fff;text-wrap:balance;max-width:14ch}",
      "#cp-host .cp-lede{margin:0;max-width:46ch;color:#e8edf3;font-size:18px}",
      "#cp-host .cp-crowd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
      "#cp-host .cp-crowd small{font-size:15px;color:#e8edf3}",
      "#cp-host .cp-stack{display:flex}",
      "#cp-host .cp-stack .cp-av{width:32px;height:32px;font-size:12px;border:2px solid #1b2430;margin-left:-8px}",
      "#cp-host .cp-stack .cp-av:first-child{margin-left:0}",
      "#cp-host .cp-board{background:rgba(8,13,22,.92);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:10px;overflow:hidden}",
      "#cp-host .cp-bh,#cp-host .cp-brow{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.6fr) 80px 80px;gap:8px}",
      "#cp-host .cp-bh{padding:8px 12px 10px;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.12em;color:var(--cp-dim)}",
      "#cp-host .cp-bh .r,#cp-host .cp-tl .r{text-align:right}",
      "#cp-host .cp-brow{padding:4px 2px}",
      "#cp-host .cp-cell{position:relative;background:#111a28;border-radius:6px;padding:10px 12px;font-family:ui-monospace,Menlo,monospace;font-weight:600;font-size:clamp(13px,1.6vw,17px);color:#ffd27f;letter-spacing:.06em;text-transform:uppercase;min-width:0;overflow-wrap:anywhere}",
      "#cp-host .cp-cell::after{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(0,0,0,.55)}",
      "#cp-host .cp-cell.t{color:var(--rc,#dfe6ef);display:flex;align-items:center;gap:8px}",
      "#cp-host .cp-cell.t::before{content:'';width:8px;height:8px;border-radius:2px;background:var(--rc,#dfe6ef);flex:none}",
      "#cp-host .cp-cell.p{color:var(--cp-gold);text-align:right}",
      "#cp-host .cp-cell.v{color:var(--cp-mute);text-align:right}",
      "#cp-host .cp-bf{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 12px 4px;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--cp-dim);letter-spacing:.06em}",
      "#cp-host .cp-invite{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px;padding:22px 24px;border-radius:18px;background:var(--cp-panel);border:1px solid var(--cp-gold)}",
      "#cp-host .cp-invite.done{border-color:#2f6b55}",
      "#cp-host .cp-h2s{margin:0;font-size:26px;font-weight:800;color:var(--cp-fg)}",
      "#cp-host .cp-h2{margin:0;font-size:clamp(24px,3vw,32px);font-weight:800;line-height:1.1;color:var(--cp-fg);text-wrap:balance}",
      "#cp-host .cp-h3{margin:0;font-size:22px;font-weight:700;line-height:1.15;color:var(--cp-fg);text-wrap:balance}",
      "#cp-host .cp-p{margin:6px 0 0;color:var(--cp-mute);max-width:60ch;font-size:16px}",
      "#cp-host .cp-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
      "#cp-host .cp-count{font-family:ui-monospace,Menlo,monospace;font-size:14px;color:var(--cp-mute)}",
      "#cp-host .cp-btn{min-height:48px;padding:0 24px;border-radius:12px;border:0;background:var(--cp-gold);color:var(--cp-ink)!important;font-weight:700;font-size:16px}",
      "#cp-host .cp-btn:hover{background:#ffc764}",
      "#cp-host .cp-btn[disabled]{opacity:.6;cursor:wait}",
      "#cp-host .cp-btn.ghost{background:transparent;border:1px solid var(--cp-line);color:var(--cp-fg)!important}",
      "#cp-host .cp-link{background:none;border:0;color:var(--cp-gold);font-weight:600;text-decoration:underline;min-height:44px;padding:0 6px}",
      "#cp-host .cp-ib{width:44px;height:44px;border-radius:12px;border:1px solid var(--cp-line);background:transparent;display:grid;place-items:center;color:var(--cp-mute)}",
      "#cp-host .cp-poll{border-radius:20px;background:var(--cp-panel);border:1px solid var(--cp-line);border-top:4px solid var(--qc,var(--cp-gold));padding:24px;display:flex;flex-direction:column;gap:18px}",
      "#cp-host .cp-poll[hidden]{display:none}",
      "#cp-host .cp-ptop{display:flex;align-items:center;justify-content:space-between;gap:12px}",
      "#cp-host .cp-steps{display:flex;gap:6px;align-items:center}",
      "#cp-host .cp-steps span{height:8px;width:8px;border-radius:99px;background:#33425e;transition:width .25s ease}",
      "#cp-host .cp-steps span.on{width:30px;background:var(--qc,var(--cp-gold))}",
      "#cp-host .cp-steps span.done{background:var(--cp-orange)}",
      "#cp-host .cp-steps em{font-style:normal;margin-left:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--cp-mute)}",
      "#cp-host .cp-pcat{font-family:ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:.1em;color:var(--qc,var(--cp-gold))}",
      "#cp-host .cp-pq{margin:4px 0 0;font-size:clamp(24px,3.4vw,34px);font-weight:800;line-height:1.1;color:var(--cp-fg)}",
      "#cp-host .cp-hint{margin:6px 0 0;color:var(--cp-mute)}",
      "#cp-host .cp-choices{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}",
      "#cp-host .cp-choice{min-height:56px;padding:12px 16px;border-radius:14px;border:1px solid var(--cp-line);background:var(--cp-panel2);text-align:left;font-weight:600;font-size:16px;color:var(--cp-fg)}",
      "#cp-host .cp-choice:hover{border-color:var(--qc,var(--cp-gold))}",
      "#cp-host .cp-choice.add{border-style:dashed;color:var(--qc,var(--cp-gold))}",
      "#cp-host .cp-other{display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:14px;background:var(--cp-panel2);border:1px dashed var(--cp-line)}",
      "#cp-host .cp-col{display:flex;flex-direction:column;gap:8px}",
      "#cp-host .cp-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
      "#cp-host .cp-lab{font-weight:700}",
      "#cp-host .cp-field{flex:1 1 220px;min-width:0;min-height:48px;padding:0 14px;border-radius:12px;border:1px solid var(--cp-line);background:var(--cp-ink);color:var(--cp-fg);font:inherit;font-size:16px}",
      "#cp-host textarea.cp-field{min-height:110px;padding:12px 14px;resize:vertical;width:100%;flex:none}",
      "#cp-host .cp-err{font-size:14px;color:#ff9c8a}",
      "#cp-host .cp-small{font-size:14px;color:var(--cp-mute)}",
      "#cp-host .cp-agree{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:14px;background:var(--cp-panel2)}",
      "#cp-host .cp-agree b{font-size:22px;font-weight:800}",
      "#cp-host .cp-agree .cp-bar{height:12px;margin:0}",
      "#cp-host .cp-agree .cp-bar i{background:var(--qc,var(--cp-gold))}",
      "#cp-host .cp-reasons{display:flex;flex-wrap:wrap;gap:8px}",
      "#cp-host .cp-reason{min-height:44px;padding:0 16px;border-radius:99px;border:1px solid var(--cp-line);background:var(--cp-panel2);font-weight:600;font-size:15px;color:var(--cp-fg)}",
      "#cp-host .cp-reason[aria-pressed='true']{background:var(--qc,var(--cp-gold));color:var(--cp-ink);border-color:transparent}",
      "#cp-host .cp-pfoot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}",
      "#cp-host .cp-done{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:center}",
      "#cp-host .cp-ring{width:80px;height:80px;border-radius:50%;border:3px solid var(--cp-gold);display:grid;place-items:center;font-weight:800;font-size:30px;color:var(--cp-gold)}",
      "#cp-host .cp-opt{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--cp-mute);cursor:pointer;white-space:nowrap}",
      "#cp-host .cp-opt.big{font-size:15px;color:var(--cp-fg);white-space:normal}",
      "#cp-host .cp-opt input{width:20px;height:20px;accent-color:#f2b84b}",
      "#cp-host .cp-sec{display:flex;flex-direction:column;gap:16px}",
      "#cp-host .cp-sh{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px}",
      "#cp-host .cp-seg{display:flex;padding:4px;gap:4px;border-radius:12px;background:var(--cp-panel);border:1px solid var(--cp-line)}",
      "#cp-host .cp-seg button{min-height:40px;padding:0 16px;border-radius:9px;border:0;background:transparent;color:var(--cp-mute);font-weight:700;font-size:15px}",
      "#cp-host .cp-seg button[aria-pressed='true']{background:var(--cp-gold);color:var(--cp-ink)}",
      "#cp-host .cp-chips{display:flex;flex-wrap:wrap;gap:8px}",
      "#cp-host .cp-chip{min-height:44px;padding:0 18px 0 14px;border-radius:99px;border:1px solid var(--cp-line);background:var(--cp-panel);color:#d6dde8;font-weight:600;font-size:15px;display:inline-flex;align-items:center;gap:8px}",
      "#cp-host .cp-chip i{width:10px;height:10px;border-radius:50%;background:var(--cc)}",
      "#cp-host .cp-chip[aria-pressed='true']{background:var(--cc);color:var(--cp-ink);border-color:transparent}",
      "#cp-host .cp-chip[aria-pressed='true'] i{background:var(--cp-ink)}",
      "#cp-host .cp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}",
      "#cp-host .cp-card{background:var(--cp-panel);border:1px solid var(--cp-line);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:14px}",
      "#cp-host .cp-ctop{display:flex;justify-content:space-between;align-items:center;gap:8px}",
      "#cp-host .cp-cat{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--cc)}",
      "#cp-host .cp-cat svg{width:30px;height:30px;padding:6px;border-radius:9px;background:color-mix(in srgb,var(--cc) 18%,transparent);stroke:var(--cc)}",
      "#cp-host .cp-rank{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:10px;align-items:center}",
      "#cp-host .cp-pos{font-weight:800;font-size:22px;color:var(--cp-dim);text-align:center}",
      "#cp-host .cp-rank.first .cp-pos{color:var(--cp-ink);background:var(--cc);border-radius:8px;line-height:36px;height:36px;font-size:20px}",
      "#cp-host .cp-name{font-weight:600;min-width:0}",
      "#cp-host .cp-rank.first .cp-name{font-weight:700;font-size:18px}",
      "#cp-host .cp-pct{font-family:ui-monospace,Menlo,monospace;font-weight:600;color:var(--cp-mute)}",
      "#cp-host .cp-rank.first .cp-pct{color:var(--cc);font-size:19px}",
      "#cp-host .cp-bar{grid-column:2/4;height:6px;border-radius:99px;background:#22304a;overflow:hidden;margin-top:-4px}",
      "#cp-host .cp-bar i{display:block;height:100%;border-radius:99px;background:#6f7f99;width:0;transition:width .8s cubic-bezier(.2,.8,.2,1)}",
      "#cp-host .cp-rank.first .cp-bar{height:9px}",
      "#cp-host .cp-rank.first .cp-bar i{background:var(--cc)}",
      "#cp-host .cp-move{font-size:13px;font-weight:700;margin-left:6px}",
      "#cp-host .cp-move.up{color:var(--cp-live)}#cp-host .cp-move.down{color:#ff8f7a}",
      "#cp-host .cp-why{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;background:color-mix(in srgb,var(--cc) 9%,var(--cp-panel2))}",
      "#cp-host .cp-why>span{font-size:14px;color:var(--cp-mute)}",
      "#cp-host .cp-why div{display:flex;flex-wrap:wrap;gap:6px}",
      "#cp-host .cp-why b{font-size:14px;font-weight:600;padding:4px 10px;border-radius:99px;background:color-mix(in srgb,var(--cc) 22%,transparent)}",
      "#cp-host .cp-why em{font-style:normal;color:var(--cp-mute);font-size:13px}",
      "#cp-host .cp-cfoot{display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:12px;border-top:1px solid #22304a;margin-top:auto;font-size:15px;color:var(--cp-mute)}",
      "#cp-host .cp-cfoot b{color:var(--cp-fg)}",
      "#cp-host .cp-cfoot a{font-weight:600;text-decoration:none;color:var(--cc)}",
      "#cp-host .cp-locked{border:1px dashed #3a4b6b;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px}",
      "#cp-host .cp-locked b{display:flex;align-items:center;gap:8px}",
      "#cp-host .cp-locked .cp-bar{margin:0}",
      "#cp-host .cp-locked .cp-bar i{background:var(--cc)}",
      "#cp-host .cp-tl{background:var(--cp-panel);border:1px solid var(--cp-line);border-radius:18px;overflow-x:auto}",
      "#cp-host .cp-tl table{width:100%;min-width:680px;border-collapse:collapse}",
      "#cp-host .cp-tl th{text-align:left;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.1em;color:var(--cp-dim);font-weight:600;padding:14px 16px;border-bottom:1px solid var(--cp-line)}",
      "#cp-host .cp-tl td{padding:14px 16px;border-bottom:1px solid #1f2b42;color:var(--cp-fg)}",
      "#cp-host .cp-tl td.m,#cp-host .cp-tl .m{color:var(--cp-mute)}",
      "#cp-host .cp-tl td.b{font-weight:600}",
      "#cp-host .cp-tl td.w{color:var(--cc);font-weight:700}",
      "#cp-host .cp-tl td.n{font-family:ui-monospace,Menlo,monospace;text-align:right}",
      "#cp-host .cp-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--cc);margin-right:8px}",
      "#cp-host .cp-empty{padding:22px;border-radius:16px;border:1px dashed #3a4b6b;color:var(--cp-mute);background:var(--cp-panel)}",
      "#cp-host .cp-openq{display:flex;flex-direction:column;gap:6px;padding:18px 20px;border-radius:18px;background:color-mix(in srgb,#86dc93 10%,var(--cp-panel));border:1px solid color-mix(in srgb,#86dc93 40%,var(--cp-line))}",
      "#cp-host .cp-openq small{font-family:ui-monospace,Menlo,monospace;font-size:13px;letter-spacing:.08em;color:#86dc93}",
      "#cp-host .cp-openq b{font-size:clamp(22px,3vw,30px);line-height:1.1;font-weight:800}",
      "#cp-host .cp-tips{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}",
      "#cp-host .cp-tip{background:var(--cp-panel);border:1px solid var(--cp-line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px}",
      "#cp-host .cp-tip.top{border-color:#86dc93}",
      "#cp-host .cp-tip.mine{border-style:dashed;border-color:var(--cp-gold)}",
      "#cp-host .cp-tp{margin:0;font-size:16px;color:var(--cp-fg)}",
      "#cp-host .cp-who{display:flex;align-items:center;gap:10px}",
      "#cp-host .cp-who b{display:block;font-size:15px}",
      "#cp-host .cp-who span{font-size:13px;color:var(--cp-mute)}",
      "#cp-host .cp-who .cp-av{width:38px;height:38px;font-size:14px}",
      "#cp-host .cp-tbadge{margin-left:auto;font-size:12px;font-weight:700;color:var(--cp-ink)!important;background:#86dc93;border-radius:99px;padding:2px 9px}",
      "#cp-host .cp-tfoot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto}",
      "#cp-host .cp-helped{min-height:44px;padding:0 14px;border-radius:99px;border:1px solid var(--cp-line);background:transparent;font-weight:600;font-size:15px;display:inline-flex;align-items:center;gap:8px}",
      "#cp-host .cp-helped[aria-pressed='true']{background:#86dc93;color:var(--cp-ink);border-color:transparent}",
      "#cp-host .cp-note{margin:0;font-size:14px;color:var(--cp-dim)}",
      "#cp-host .cp-av{width:64px;height:64px;border-radius:50%;display:inline-grid;place-items:center;font-weight:800;font-size:24px;color:#0c1420;border:3px solid transparent;overflow:hidden;flex:none}",
      "#cp-host .cp-av img{width:100%;height:100%;object-fit:cover;display:block}",
      "#cp-host .cp-podium{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:end}",
      "#cp-host .cp-pod{background:var(--cp-panel);border:1px solid var(--cp-line);border-radius:18px;padding:20px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}",
      "#cp-host .cp-pod.p1{padding-top:32px;border-color:var(--cp-gold);background:linear-gradient(180deg,rgba(242,184,75,.16),var(--cp-panel2) 60%)}",
      "#cp-host .cp-pod.p1 .cp-av{width:84px;height:84px;font-size:32px;border-color:var(--cp-gold)}",
      "#cp-host .cp-pod.p2 .cp-av{border-color:#c9d2de}#cp-host .cp-pod.p3 .cp-av{border-color:#d49a6a}",
      "#cp-host .cp-medal{font-weight:800;font-size:14px;letter-spacing:.06em;padding:2px 12px;border-radius:99px;color:var(--cp-ink)}",
      "#cp-host .p1 .cp-medal{background:var(--cp-gold)}#cp-host .p2 .cp-medal{background:#c9d2de}#cp-host .p3 .cp-medal{background:#d49a6a}",
      "#cp-host .cp-pw{font-size:17px}",
      "#cp-host .cp-big{font-weight:800;font-size:38px;line-height:1}",
      "#cp-host .cp-ladder{background:var(--cp-panel);border:1px solid var(--cp-line);border-radius:18px;overflow:hidden}",
      "#cp-host .cp-lrow{display:grid;grid-template-columns:44px 44px minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:12px 16px;border-bottom:1px solid #1f2b42}",
      "#cp-host .cp-lrow:last-child{border-bottom:0}",
      "#cp-host .cp-lrow .cp-pos{font-size:20px}",
      "#cp-host .cp-lrow .cp-av{width:42px;height:42px;font-size:15px;border-width:2px}",
      "#cp-host .cp-lw{min-width:0}#cp-host .cp-lw b{display:block}#cp-host .cp-lw span{font-size:14px;color:var(--cp-mute)}",
      "#cp-host .cp-streak{font-size:14px;color:var(--cp-orange);font-weight:700;white-space:nowrap}",
      "#cp-host .cp-lc{font-family:ui-monospace,Menlo,monospace;font-weight:600;text-align:right;min-width:56px}",
      "#cp-host .cp-lrow.me{background:#1f2c48;border-top:1px solid var(--cp-gold)}",
      "#cp-host .cp-lrow.me .cp-pos{color:var(--cp-gold);font-size:15px}",
      "#cp-host .cp-lrow.me .cp-av{border-color:var(--cp-gold);font-size:12px}",
      "#cp-host .cp-how{margin:4px 0 0;font-size:14px;color:var(--cp-dim);text-align:center;max-width:70ch;align-self:center}",
      "@media (max-width:640px){#cp-host .cp-bh,#cp-host .cp-brow{grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) 60px}#cp-host .cp-hide-s{display:none}#cp-host .cp-photo{background-position:62% 30%}#cp-host .cp-tabs button{font-size:15px;padding:0 10px}#cp-host .cp-podium{gap:8px}#cp-host .cp-pod{padding:14px 6px}#cp-host .cp-big{font-size:28px}#cp-host .cp-av{width:52px;height:52px;font-size:19px}#cp-host .cp-pod.p1 .cp-av{width:64px;height:64px;font-size:24px}#cp-host .cp-lrow{grid-template-columns:32px 40px minmax(0,1fr) auto;gap:10px;padding:12px}#cp-host .cp-streak{display:none}#cp-host .cp-lrow .cp-av{width:38px;height:38px}#cp-host .cp-lrow.me .cp-opt{grid-column:3/5}}",
      "@media (prefers-reduced-motion:reduce){#cp-host *{animation:none!important;transition:none!important}}"
    ].join("\n");
    var s = document.createElement("style"); s.id = "cp-styles"; s.textContent = css; document.head.appendChild(s);
  }

  window.HRT_PICKS = {
    show: function () {
      host = document.getElementById("cp-host"); if (!host) return;
      styles();
      if (!mounted) { mounted = true; host.addEventListener("click", onClick); render(); }
      load();
    }
  };
  window.addEventListener("hrt:member", function () { if (mounted && !S.poll) load(); });
})();
