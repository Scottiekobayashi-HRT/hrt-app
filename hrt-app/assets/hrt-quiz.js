/* ---------------------------------------------------------------------------
   hrt-quiz.js - shared "one question at a time" look for HRT calculators.

   Design rule (Scottie, Oct 13 2026): a calculator must never overwhelm.
   One question on screen, big tap targets, one clear answer, and everything
   else folded behind a plain "See the math" style link.

   Used by atmos-status.js (Choose to Earn) and atmos-communities.js.
   Must load before both. Exposes window.HRT_QUIZ.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function icon(path, size) {
    var w = el("span", "qz-ic");
    w.innerHTML = '<svg width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    return w;
  }
  var CHECK = '<path d="M20 6 9 17l-5-5"/>';

  /* q = { n, total, title, hint, options:[{value,label,sub,icon}], current, multi, onPick, onBack, nextLabel, onNext, extra } */
  function question(q) {
    var card = el("div", "qz-card");
    var top = el("div", "qz-top");
    top.appendChild(el("span", "qz-count", "Question " + q.n + " of " + q.total));
    if (q.onBack) {
      var back = el("button", "qz-back", "Back");
      back.type = "button"; back.addEventListener("click", q.onBack);
      top.appendChild(back);
    }
    card.appendChild(top);
    var bar = el("div", "qz-prog"); var fill = el("i"); fill.style.width = (q.n / q.total * 100) + "%";
    bar.appendChild(fill); card.appendChild(bar);
    card.appendChild(el("h2", "qz-title", q.title));
    if (q.hint) card.appendChild(el("p", "qz-hint", q.hint));
    var grid = el("div", "qz-opts" + (q.compact ? " compact" : ""));
    q.options.forEach(function (o) {
      var on = q.multi ? !!(q.current && q.current[o.value]) : q.current === o.value;
      var b = el("button", "qz-opt" + (on ? " on" : ""));
      b.type = "button"; b.setAttribute("aria-pressed", on ? "true" : "false");
      if (o.icon) b.appendChild(icon(o.icon, 24));
      var t = el("span", "qz-optt");
      t.appendChild(el("b", null, o.label));
      if (o.sub) t.appendChild(el("span", null, o.sub));
      b.appendChild(t);
      if (q.multi) b.appendChild(icon(CHECK, 16)).className = "qz-tick";
      b.addEventListener("click", function () {
        if (q.multi) {
          var now = !b.classList.contains("on");
          b.classList.toggle("on", now); b.setAttribute("aria-pressed", now ? "true" : "false");
        }
        q.onPick(o.value);
      });
      grid.appendChild(b);
    });
    card.appendChild(grid);
    if (q.extra) card.appendChild(q.extra);
    if (q.onNext) {
      var nx = el("button", "qz-next", q.nextLabel || "Next");
      nx.type = "button"; nx.addEventListener("click", q.onNext);
      card.appendChild(nx);
    }
    return card;
  }

  /* answers = [{ label, value, onEdit }] shown as small tappable chips */
  function answers(list, onRestart) {
    var w = el("div", "qz-answers");
    w.appendChild(el("span", "qz-al", "Your answers"));
    list.forEach(function (a) {
      var b = el("button", "qz-chip");
      b.type = "button"; b.title = "Change this answer";
      b.appendChild(el("span", null, a.label));
      b.appendChild(el("b", null, a.value));
      b.addEventListener("click", a.onEdit);
      w.appendChild(b);
    });
    if (onRestart) {
      var r = el("button", "qz-restart");
      r.appendChild(icon('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>', 15));
      r.appendChild(el("span", null, "Start over"));
      r.type = "button"; r.addEventListener("click", onRestart);
      w.appendChild(r);
    }
    return w;
  }

  /* A folded section. key keeps it open across repaints. */
  var openState = {};
  function more(key, title, sub, build) {
    var d = el("details", "qz-more");
    if (openState[key]) d.open = true;
    var s = el("summary");
    var t = el("span", "qz-mt");
    t.appendChild(el("b", null, title));
    if (sub) t.appendChild(el("span", null, sub));
    s.appendChild(t);
    d.appendChild(s);
    var body = el("div", "qz-mb");
    var built = false;
    function fill() { if (!built) { built = true; body.appendChild(build()); } }
    if (d.open) fill();
    d.addEventListener("toggle", function () { openState[key] = d.open; if (d.open) fill(); });
    d.appendChild(body);
    return d;
  }

  /* why = array of strings, shown as gold check lines in the answer card */
  function whyList(why) {
    var ul = el("ul", "qz-why");
    why.forEach(function (w) {
      var li = el("li");
      li.appendChild(icon(CHECK, 14));
      li.appendChild(el("span", null, w));
      ul.appendChild(li);
    });
    return ul;
  }

  function css() {
    if (document.getElementById("qz-css")) return;
    var s = document.createElement("style"); s.id = "qz-css";
    s.textContent = [
      ".qz-wrap{max-width:760px;margin:0 auto}",
      ".qz-card{border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow);padding:22px 22px 24px;margin-bottom:14px}",
      "@media (max-width:560px){.qz-card{padding:18px 16px 20px}}",
      ".qz-top{display:flex;justify-content:space-between;align-items:center;gap:10px}",
      ".qz-count{font-size:12px;font-weight:700;color:var(--muted)}",
      ".qz-back{font:inherit;font-size:13px;font-weight:700;color:var(--muted);background:none;border:0;cursor:pointer;padding:10px 4px;min-height:44px}",
      ".qz-back:before{content:'\\2190  '}",
      ".qz-back:hover{color:var(--coral)}",
      ".qz-prog{height:6px;border-radius:4px;background:var(--line);overflow:hidden;margin:6px 0 18px}",
      ".qz-prog i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#f2b84b,#d97040);transition:width .3s}",
      ".qz-card .qz-title{margin:0 0 6px;font-size:23px;line-height:1.25;color:var(--text)}",
      "@media (max-width:560px){.qz-card .qz-title{font-size:20px}}",
      ".qz-card .qz-hint{margin:0 0 16px;font-size:14px;color:var(--muted);line-height:1.5}",
      ".qz-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}",
      ".qz-opts.compact{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}",
      "@media (max-width:560px){.qz-opts{grid-template-columns:1fr}.qz-opts.compact{grid-template-columns:1fr 1fr}}",
      ".qz-opt{position:relative;display:flex;align-items:center;gap:12px;text-align:left;font:inherit;cursor:pointer;min-height:64px;padding:14px 16px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface-2);color:var(--text);transition:border-color .15s,background .15s,transform .1s}",
      ".qz-opts.compact .qz-opt{min-height:52px;padding:10px 12px}",
      ".qz-opt:hover{border-color:var(--coral)}",
      ".qz-opt:active{transform:scale(.99)}",
      ".qz-opt .qz-ic{flex:0 0 auto;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;color:var(--coral);background:color-mix(in srgb,var(--coral) 12%,var(--surface))}",
      ".qz-optt{display:flex;flex-direction:column;gap:2px;min-width:0}",
      ".qz-optt b{font-size:15px;line-height:1.25}",
      ".qz-opts.compact .qz-optt b{font-size:14px}",
      ".qz-optt span{font-size:12px;color:var(--muted);font-weight:600;line-height:1.35}",
      ".qz-opt.on{border-color:#141b24;background:#141b24;color:#fff;box-shadow:inset 0 -3px 0 #f2b84b}",
      ".qz-opt.on .qz-optt span{color:#c7d4e2}",
      ".qz-opt.on .qz-ic{background:rgba(242,184,75,.18);color:#f5c75a}",
      ":root[data-theme=\"dark\"] .qz-opt.on{border-color:#f2b84b;background:#1d2c42}",
      ".qz-tick{margin-left:auto;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;border:1.5px solid var(--line);color:transparent;flex:0 0 auto}",
      ".qz-opt.on .qz-tick{background:linear-gradient(135deg,#f5c75a,#d97040);border-color:transparent;color:#1a1204}",
      ".qz-next{display:block;width:100%;margin-top:18px;min-height:52px;font:inherit;font-size:16px;font-weight:800;cursor:pointer;border:0;border-radius:14px;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#d97040)}",
      ".qz-next:hover{filter:brightness(1.04)}",
      /* the answer card */
      ".qz-hero{position:relative;overflow:hidden;border-radius:22px;padding:24px;margin-bottom:14px;color:#fff;background:linear-gradient(135deg,#141b24 0%,#1f2a38 65%,#23345a 100%);border:1px solid rgba(242,184,75,.45);box-shadow:var(--shadow)}",
      "@media (max-width:560px){.qz-hero{padding:20px 18px}}",
      ".qz-hero .qz-pill{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#1a1204;background:linear-gradient(135deg,#f5c75a,#d97040);border-radius:999px;padding:5px 11px}",
      ".qz-hero .qz-hrow{display:flex;gap:14px;align-items:center;margin-top:14px}",
      ".qz-hero .qz-badge{flex:0 0 auto;width:60px;height:60px;border-radius:17px;display:grid;place-items:center;color:#fff;box-shadow:0 0 0 3px rgba(242,184,75,.5)}",
      ".qz-hero .qz-big{margin:0;font-size:30px;line-height:1.1;color:#fff}",
      "@media (max-width:560px){.qz-hero .qz-big{font-size:24px}}",
      ".qz-hero .qz-sub{margin:6px 0 0;font-size:17px;font-weight:800;color:#f5c75a}",
      ".qz-hero .qz-line{margin:14px 0 0;font-size:14px;color:#dce6f1;line-height:1.5}",
      ".qz-why{list-style:none;margin:16px 0 0;padding:14px 0 0;border-top:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:9px}",
      ".qz-why li{display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;color:#fff}",
      ".qz-why .qz-ic{flex:0 0 auto;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#f5c75a,#d97040);color:#1a1204;margin-top:1px}",
      /* simple ranking */
      ".qz-rank{display:flex;flex-direction:column;gap:10px}",
      ".qz-r{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center}",
      ".qz-r .qz-dot{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;color:#fff}",
      ".qz-r .qz-rn{font-size:14px;font-weight:700;color:var(--text)}",
      ".qz-r .qz-rt{height:8px;border-radius:5px;background:var(--line);overflow:hidden;margin-top:5px}",
      ".qz-r .qz-rt i{display:block;height:100%;border-radius:5px}",
      ".qz-r .qz-rv{font-size:15px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".qz-r.win .qz-rn{font-weight:800}",
      ".qz-small{margin:12px 0 0;font-size:12.5px;color:var(--muted);line-height:1.5}",
      ".qz-h3{margin:0 0 14px;font-size:16px;color:var(--text)}",
      /* answers chips */
      ".qz-answers{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin:0 0 14px}",
      ".qz-al{font-size:12px;font-weight:800;color:var(--muted);margin-right:2px}",
      ".qz-chip{display:inline-flex;gap:6px;align-items:baseline;font:inherit;font-size:12.5px;cursor:pointer;padding:8px 12px;min-height:36px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--muted)}",
      ".qz-chip b{color:var(--text)}",
      ".qz-chip:hover{border-color:var(--coral)}",
      ".qz-restart{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:800;color:var(--coral);background:var(--surface);border:1.5px solid var(--coral);border-radius:999px;cursor:pointer;padding:0 14px;min-height:38px}",
      ".qz-restart .qz-ic{display:inline-flex}",
      ".qz-restart:hover{background:var(--coral);color:#fff}",
      /* folded sections */
      ".qz-more{border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow);margin-bottom:10px}",
      ".qz-more>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;padding:16px 18px;min-height:56px;box-sizing:border-box}",
      ".qz-more>summary::-webkit-details-marker{display:none}",
      ".qz-more>summary:after{content:'';margin-left:auto;flex:0 0 auto;width:9px;height:9px;border-right:2px solid var(--coral);border-bottom:2px solid var(--coral);transform:rotate(45deg);transition:transform .15s}",
      ".qz-more[open]>summary:after{transform:rotate(-135deg)}",
      ".qz-mt{display:flex;flex-direction:column;gap:2px}",
      ".qz-mt b{font-size:15px;color:var(--text)}",
      ".qz-mt span{font-size:12.5px;color:var(--muted)}",
      ".qz-mb{padding:0 18px 18px}",
      ".qz-go{display:grid;gap:8px;margin:4px 0 12px}.qz-go-h{font-size:13px;font-weight:800;color:var(--muted)}",
      ".qz-go-a{display:flex;flex-direction:column;gap:2px;padding:12px 16px;min-height:52px;box-sizing:border-box;border:1px solid var(--line);border-radius:14px;background:var(--surface);text-decoration:none}",
      ".qz-go-a b{font-size:14.5px;color:var(--text)}.qz-go-a b:after{content:' \\2192';color:var(--coral)}.qz-go-a span{font-size:12.5px;color:var(--muted)}",
      ".qz-go-a:hover{border-color:var(--coral)}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* "Keep going": links from a calculator result to the next useful tool, so no result is a dead end.
     items: [[route, title, line]] */
  function next(items) {
    var w = el("div", "qz-go");
    w.appendChild(el("b", "qz-go-h", "Keep going"));
    items.forEach(function (it) {
      var a = el("a", "qz-go-a");
      a.href = "#" + it[0]; a.setAttribute("data-route", it[0]);
      a.appendChild(el("b", null, it[1]));
      if (it[2]) a.appendChild(el("span", null, it[2]));
      w.appendChild(a);
    });
    return w;
  }

  window.HRT_QUIZ = { el: el, icon: icon, question: question, answers: answers, more: more, whyList: whyList, next: next, css: css };
})();
