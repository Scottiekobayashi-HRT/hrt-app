/* ---------------------------------------------------------------------------
   coaching.js - Rewards Card Coaching page (#coaching), Nov 11 2026 (Eddie review)

   For Subscribers (free): what ʻOhana coaching does, why the bank rules make it
   hard to do alone, the two "start here" videos, and a free preview of Scottie AI
   with topic starters. The starters are scripted (no AI call yet): two answer
   with a video, the rest lead to ʻOhana coaching. When Ask Scottie (branch
   ask-scottie) comes to this dashboard, the starters can hand off to it.

   ʻOhana Members (html.ms-client) see "Text Scottie" where free members see
   "Join ʻOhana". Customer-facing text: no em dashes.

   Edit the words in STARTERS, RULES and VIDEOS below. Bank rules were checked
   in November 2026; re-check them when a bank changes its terms.
   Exposes window.HRT_COACHING.show().
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var JOIN_URL = "https://www.hawaiirewardtravel.com/our-accelerated-program";
  var SMS = "sms:+18083545216";

  var VIDEOS = [
    { id: "vXP9bjDBsOs", title: "How we'd work together", sub: "Start here. How ʻOhana coaching works, step by step." },
    { id: "-iCwFTT400E", title: "Redeeming 101", sub: "Turn your points into free flights. Members only link." }
  ];

  /* Why it is hard to do alone. Checked Nov 2026. */
  var RULES = [
    { bank: "Chase", rule: "Opened 5 or more personal cards from any bank in the last 24 months? Chase will usually say no.",
      why: "Every card you open anywhere counts, so the order you open cards in really matters." },
    { bank: "Chase Sapphire", rule: "Since January 2026, each Sapphire card's bonus depends on whether you ever earned that exact card's bonus before.",
      why: "Pick the wrong Sapphire first and you can leave a big bonus on the table." },
    { bank: "American Express", rule: "One welcome bonus per card, per lifetime. Some cards also skip the bonus if you have had a higher card in the same family, and you can only open about two new Amex cards in 90 days.",
      why: "Grab a small offer today and you can lose a much bigger one later." },
    { bank: "Citi", rule: "About one new card every 8 days and two every 65 days. The Strata cards now give their bonus once per lifetime.",
      why: "Timing between cards is part of the plan, not an afterthought." },
    { bank: "Business cards", rule: "Most business cards do not count toward Chase's 5 in 24 months.",
      why: "That changes which card should come first, second and third." }
  ];

  /* Scottie AI free preview. kind "video" answers with a video; "join" leads to ʻOhana coaching. */
  var STARTERS = [
    { q: "How do I get started?", kind: "video", video: 0,
      a: "Hey, glad you're here! Start with this short video on how we'd work together. Then add your cards to My Wallet so you can see where you stand." },
    { q: "How do I redeem points for free travel?", kind: "video", video: 1,
      a: "Good one. Watch my Redeeming 101 first. The short version: check your bank's travel portal first, then look at moving points to an airline partner. Only move points once you've found the seat, because transfers can't be undone." },
    { q: "Which card should I get next?", kind: "join",
      a: "That depends on every card you've opened, what you spend each month and where you want to go. It's exactly what I map out one-on-one with ʻOhana Members." },
    { q: "When is the best time to apply for my next card?", kind: "join",
      a: "Timing is everything with the bank rules above. The right month can be the difference between a big bonus and nothing. I plan that timing with ʻOhana Members, card by card." },
    { q: "Can I get a card's bonus again?", kind: "join",
      a: "Sometimes. It depends on the bank and your history with that exact card. Let's look at your cards together so you don't waste an application." }
  ];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var CSS = [
    "#v-coaching .co-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}",
    "#v-coaching .co-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius,16px);box-shadow:var(--shadow);padding:20px}",
    "#v-coaching .co-card h2{margin:0 0 6px;font-size:19px;color:var(--text)}#v-coaching .co-card h2 span{color:var(--coral,#d97040)}",
    "#v-coaching .co-lede{margin:0 0 12px;color:var(--muted);font-size:14px;line-height:1.55}",
    "#v-coaching .co-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}",
    "#v-coaching .co-list li{position:relative;padding-left:26px;font-size:14.5px;line-height:1.5;color:var(--text)}",
    "#v-coaching .co-list li:before{content:'';position:absolute;left:3px;top:6px;width:10px;height:6px;border-left:2.5px solid #2f855a;border-bottom:2.5px solid #2f855a;transform:rotate(-45deg)}",
    "#v-coaching .co-roi{margin-top:14px;border-radius:12px;padding:14px 16px;background:linear-gradient(135deg,#14202e,#1d3350);color:#fff}",
    "#v-coaching .co-roi b{display:block;font-size:22px;color:#f5c75a;line-height:1.15}#v-coaching .co-roi p{margin:6px 0 0;color:#c7d4e2;font-size:13.5px;line-height:1.5}",
    "#v-coaching .co-rules{display:grid;gap:10px}",
    "#v-coaching .co-rule{border:1px solid var(--line);border-left:4px solid #f2b84b;border-radius:12px;padding:12px 14px;background:var(--surface)}",
    "#v-coaching .co-rule b{font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--text)}",
    "#v-coaching .co-rule p{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--text)}#v-coaching .co-rule small{display:block;margin-top:4px;font-size:12.5px;color:var(--muted)}",
    "#v-coaching .co-fine{margin:12px 0 0;font-size:12.5px;color:var(--muted);line-height:1.5}",
    "#v-coaching .co-sum{margin:14px 0 0;font-size:14.5px;font-weight:700;color:var(--text);line-height:1.5}",
    "#v-coaching .co-vids{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}",
    "#v-coaching .co-vid{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}",
    "#v-coaching .co-play{position:relative;display:block;width:100%;aspect-ratio:16/9;border:0;padding:0;cursor:pointer;background:#14202e center/cover no-repeat}",
    "#v-coaching .co-play:after{content:'';position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(217,112,64,.92) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M8 5v14l11-7z' fill='white'/></svg>\") center/28px no-repeat;box-shadow:0 6px 18px rgba(0,0,0,.35)}",
    "#v-coaching .co-vid iframe{display:block;width:100%;aspect-ratio:16/9;border:0}",
    "#v-coaching .co-vid div{padding:12px 14px}#v-coaching .co-vid b{font-size:15px;color:var(--text)}#v-coaching .co-vid span{display:block;margin-top:3px;font-size:13px;color:var(--muted)}",
    "#v-coaching .co-ai{background:linear-gradient(135deg,#14202e,#1b2f4a);border:1px solid rgba(242,184,75,.32);color:#fff}",
    "#v-coaching .co-ai h2{color:#fff}#v-coaching .co-ai .co-lede{color:#c7d4e2}",
    "#v-coaching .co-tag{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;background:#f2b84b;color:#14202e;border-radius:999px;padding:3px 9px;margin-left:6px;vertical-align:3px}",
    "#v-coaching .co-card h2 span.co-tag{color:#14202e}",
    "#v-coaching .co-qs{display:flex;flex-wrap:wrap;gap:8px}",
    "#v-coaching .co-q{font:inherit;font-size:13.5px;font-weight:700;border-radius:999px;padding:9px 14px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;cursor:pointer;text-align:left}",
    "#v-coaching .co-q[aria-pressed=true]{background:#f2b84b;color:#14202e;border-color:#f2b84b}",
    "#v-coaching .co-chat{margin-top:14px;display:grid;gap:10px}",
    "#v-coaching .co-b{max-width:640px;border-radius:16px;padding:12px 14px;font-size:14.5px;line-height:1.55}",
    "#v-coaching .co-b.me{justify-self:end;background:#f2b84b;color:#14202e;border-bottom-right-radius:4px;font-weight:700}",
    "#v-coaching .co-b.ai{background:#fff;color:#14202e;border-bottom-left-radius:4px}",
    "#v-coaching .co-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
    "#v-coaching a.co-btn,#v-coaching button.co-btn{font:inherit;font-size:13px;font-weight:800;border-radius:999px;padding:8px 13px;text-decoration:none;border:0;cursor:pointer;background:#14202e;color:#fff}",
    "#v-coaching a.co-btn.gold{background:linear-gradient(135deg,#f5c75a,#d97040);color:#1a1204}",
    "#v-coaching .co-ainote{margin:12px 0 0;font-size:12px;color:#9fb3c8}",
    "html.ms-client #v-coaching .co-free{display:none!important}html:not(.ms-client) #v-coaching .co-oh{display:none!important}",
    "@media (max-width:860px){#v-coaching .co-grid,#v-coaching .co-vids{grid-template-columns:1fr}}"
  ].join("");

  function vidCard(v, i) {
    return '<div class="co-vid" id="coVid' + i + '"><button type="button" class="co-play" data-co-play="' + i + '" aria-label="Play ' + esc(v.title) + '" style="background-image:url(\'https://i.ytimg.com/vi/' + esc(v.id) + '/hqdefault.jpg\')"></button>' +
      "<div><b>" + esc(v.title) + "</b><span>" + esc(v.sub) + "</span></div></div>";
  }
  function play(i) {
    var box = document.getElementById("coVid" + i), v = VIDEOS[i];
    if (!box || !v) return;
    var btn = box.querySelector(".co-play");
    if (btn) {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v.id) + "?autoplay=1&rel=0";
      f.title = v.title; f.allow = "autoplay; encrypted-media; picture-in-picture"; f.allowFullscreen = true;
      btn.replaceWith(f);
    }
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function joinActs() {
    return '<div class="co-acts"><a class="co-btn gold co-free" href="' + JOIN_URL + '" target="_top">Join our ʻOhana</a>' +
      '<a class="co-btn co-free" href="' + JOIN_URL + '" target="_top">Book a free call</a>' +
      '<a class="co-btn gold co-oh" href="' + SMS + '">Text Scottie</a></div>';
  }
  function answer(i) {
    var s = STARTERS[i], chat = document.getElementById("coChat");
    if (!s || !chat) return;
    var acts = s.kind === "video" ? '<div class="co-acts"><button type="button" class="co-btn" data-co-play="' + s.video + '">Watch ' + esc(VIDEOS[s.video].title) + "</button>" +
      (s.video === 0 ? '<a class="co-btn" href="#wallet" data-route="wallet">Open My Wallet</a>' : "") + "</div>" : joinActs();
    chat.innerHTML = '<div class="co-b me">' + esc(s.q) + '</div><div class="co-b ai">' + esc(s.a) + acts + "</div>";
    Array.prototype.forEach.call(document.querySelectorAll("#v-coaching .co-q"), function (b, j) { b.setAttribute("aria-pressed", j === i ? "true" : "false"); });
  }

  function html() {
    return '<div class="co-grid">' +
      '<section class="co-card"><h2>What ʻOhana coaching <span>does for you</span></h2>' +
      '<p class="co-lede">You tell us your cards, your spending and where you want to go. We do the rest, and we text you when it is time to act.</p>' +
      '<ul class="co-list"><li>We map your next card: which bank, which card and when, based on every card you already have.</li>' +
      "<li>We time it around each bank's rules, so you get approved and actually earn the bonus.</li>" +
      "<li>We text you when it is time: your next card, your minimum spend and your fee renewals.</li>" +
      "<li>We help you turn the points into trips from Hawaiʻi, like Japan, Vegas or the mainland.</li></ul>" +
      '<div class="co-roi"><b>About 75,000 extra points</b><p>That is what one well-timed card can land. From Hawaiʻi, that is roughly $1,500 in airfare. Open the same card a few months too early and the bonus can be gone for good.</p></div>' +
      '<div class="co-acts co-free"><a class="co-btn gold" href="' + JOIN_URL + '" target="_top">Join our ʻOhana</a></div>' +
      '<div class="co-acts co-oh"><a class="co-btn gold" href="' + SMS + '">Text Scottie</a></div></section>' +
      '<section class="co-card"><h2>Why it is hard <span>to do on your own</span></h2>' +
      '<p class="co-lede">Every bank has its own rules about how often you can open cards and when you can earn a bonus. A few of them:</p>' +
      '<div class="co-rules">' + RULES.map(function (r) { return '<div class="co-rule"><b>' + esc(r.bank) + "</b><p>" + esc(r.rule) + "</p><small>" + esc(r.why) + "</small></div>"; }).join("") + "</div>" +
      '<p class="co-sum">Now add it all up: which bank first, which card second, how many months in between, and which bonuses you can still earn. That is the puzzle we solve for every ʻOhana Member.</p>' +
      '<p class="co-fine">Bank rules change often. These were checked in November 2026. Your exact path depends on every card you have opened, which is why we always start with your whole wallet.</p></section>' +
      "</div>" +
      '<section class="co-card"><h2>Start <span>here</span></h2><p class="co-lede">Two short videos from Scottie. Watch these first.</p>' +
      '<div class="co-vids">' + VIDEOS.map(vidCard).join("") + "</div></section>" +
      '<section class="co-card co-ai"><h2>Ask Scottie AI <span class="co-tag">Free preview</span></h2>' +
      '<p class="co-lede">Pick a question to start. This is my AI, not me live.</p>' +
      '<div class="co-qs" role="group" aria-label="Questions">' + STARTERS.map(function (s, i) { return '<button type="button" class="co-q" data-co-q="' + i + '" aria-pressed="false">' + esc(s.q) + "</button>"; }).join("") + "</div>" +
      '<div class="co-chat" id="coChat" aria-live="polite"></div>' +
      '<p class="co-ainote">The free preview answers these starter questions. ʻOhana Members get the full Scottie AI for their own questions.</p></section>';
  }

  var mounted = false;
  function mount() {
    if (mounted) return;
    var host = document.getElementById("coHost");
    if (!host) return;
    mounted = true;
    var st = document.createElement("style"); st.id = "co-css"; st.textContent = CSS; document.head.appendChild(st);
    host.innerHTML = html();
    host.addEventListener("click", function (ev) {
      var q = ev.target.closest("[data-co-q]"); if (q) { answer(+q.getAttribute("data-co-q")); return; }
      var p = ev.target.closest("[data-co-play]"); if (p) { play(+p.getAttribute("data-co-play")); }
    });
  }

  window.HRT_COACHING = { show: mount, _test: { STARTERS: STARTERS, RULES: RULES, VIDEOS: VIDEOS } };
})();
