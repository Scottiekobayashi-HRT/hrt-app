/* ---------------------------------------------------------------------------
   hrt-quiz.js - shared "one question at a time" look for HRT calculators.

   Design rules (Scottie, Oct 13 2026): never overwhelm, never look like AI
   slop, stay on the HRT brand.
   - One question per screen. Answers are plain rows with a radio dot.
   - The answer is a boarding pass: the one bold element on the page.
   - Brand: navy #1B2840, deep teal #1c3a45, gold #c9923a, sunset #D97040
     (main button only), paper #F4F1EC (the pass only). DM Serif Display for
     question titles and the answer, Inter for everything else.
   - No gradient pills, no all caps labels, no glows, no icon tiles.
   - Everything secondary sits in one quiet "More about this" list.

   Used by atmos-status.js (Choose to Earn) and atmos-communities.js.
   Must load before both. Exposes window.HRT_QUIZ.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function icon(path, size) {
    var w = el("span", "qz-ic");
    w.innerHTML = '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    return w;
  }
  var RESTART = '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>';

  function fonts() {
    if (document.getElementById("qz-font")) return;
    var l = document.createElement("link"); l.id = "qz-font"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap";
    document.head.appendChild(l);
  }

  /* q = { n, total, title, hint, options:[{value,label,sub}], current, multi, compact, onPick, onBack, nextLabel, onNext, extra } */
  function question(q) {
    var card = el("section", "qz-q");
    var top = el("div", "qz-top");
    var steps = el("div", "qz-steps");
    steps.setAttribute("aria-label", "Question " + q.n + " of " + q.total);
    for (var i = 1; i <= q.total; i++) steps.appendChild(el("i", i < q.n ? "done" : i === q.n ? "now" : ""));
    top.appendChild(steps);
    top.appendChild(el("span", "qz-count", q.n + " of " + q.total));
    card.appendChild(top);
    card.appendChild(el("h2", "qz-title", q.title));
    if (q.hint) card.appendChild(el("p", "qz-hint", q.hint));
    var list = el("div", "qz-opts" + (q.compact ? " compact" : ""));
    list.setAttribute("role", q.multi ? "group" : "radiogroup");
    q.options.forEach(function (o) {
      var on = q.multi ? !!(q.current && q.current[o.value]) : q.current === o.value;
      var b = el("button", "qz-opt" + (on ? " on" : "") + (q.multi ? " multi" : ""));
      b.type = "button";
      b.setAttribute(q.multi ? "aria-pressed" : "aria-checked", on ? "true" : "false");
      if (!q.multi) b.setAttribute("role", "radio");
      b.appendChild(el("span", "qz-mark"));
      var t = el("span", "qz-optt");
      t.appendChild(el("b", null, o.label));
      if (o.sub) t.appendChild(el("span", null, o.sub));
      b.appendChild(t);
      b.addEventListener("click", function () {
        if (q.multi) {
          var now = !b.classList.contains("on");
          b.classList.toggle("on", now); b.setAttribute("aria-pressed", now ? "true" : "false");
        } else {
          list.querySelectorAll(".qz-opt").forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-checked", "false"); });
          b.classList.add("on"); b.setAttribute("aria-checked", "true");
        }
        q.onPick(o.value);
      });
      list.appendChild(b);
    });
    card.appendChild(list);
    if (q.extra) card.appendChild(q.extra);
    var foot = el("div", "qz-foot");
    if (q.onBack) {
      var back = el("button", "qz-back", "Back");
      back.type = "button"; back.addEventListener("click", q.onBack);
      foot.appendChild(back);
    }
    if (q.onNext) {
      var nx = el("button", "qz-next", q.nextLabel || "Next");
      nx.type = "button"; nx.addEventListener("click", q.onNext);
      foot.appendChild(nx);
    }
    if (foot.childNodes.length) card.appendChild(foot);
    return card;
  }

  /* list = [{ label, value, onEdit }]. Start over is a real button, not a link. */
  function answers(list, onRestart) {
    var w = el("div", "qz-answers");
    var head = el("div", "qz-ahead");
    var ht = el("p", "qz-al");
    ht.appendChild(el("b", null, "Your answers"));
    ht.appendChild(document.createTextNode(" Tap one to change it."));
    head.appendChild(ht);
    if (onRestart) {
      var r = el("button", "qz-restart");
      r.type = "button";
      r.appendChild(icon(RESTART, 16));
      r.appendChild(el("span", null, "Start over"));
      r.addEventListener("click", onRestart);
      head.appendChild(r);
    }
    w.appendChild(head);
    var chips = el("div", "qz-chips");
    list.forEach(function (a) {
      var b = el("button", "qz-chip");
      b.type = "button"; b.setAttribute("aria-label", "Change " + a.label + ", now " + a.value);
      b.appendChild(el("span", null, a.label));
      b.appendChild(el("b", null, a.value));
      b.addEventListener("click", a.onEdit);
      chips.appendChild(b);
    });
    w.appendChild(chips);
    return w;
  }

  /* p = { kicker, title, color, value, unit, lines:[[label, value]], note, how }
     The answer as a boarding pass: body on the left, tear-off stub on the right. */
  function pass(p) {
    var t = el("article", "qz-pass");
    if (p.color) t.style.setProperty("--pc", p.color);
    var body = el("div", "qz-pbody");
    body.appendChild(el("p", "qz-pk", p.kicker));
    body.appendChild(el("h2", "qz-pt", p.title));
    if (p.note) body.appendChild(el("p", "qz-pn", p.note));
    if (p.lines && p.lines.length) {
      var dl = el("dl", "qz-plines");
      p.lines.forEach(function (l) {
        var row = el("div", "qz-pl");
        row.appendChild(el("dt", null, l[0]));
        row.appendChild(el("dd", null, l[1]));
        dl.appendChild(row);
      });
      body.appendChild(dl);
    }
    if (p.how) body.appendChild(el("p", "qz-phow", p.how));
    t.appendChild(body);
    var stub = el("div", "qz-pstub");
    stub.appendChild(el("span", "qz-psl", p.valueLabel || "Worth about"));
    stub.appendChild(el("b", "qz-pv", p.value));
    stub.appendChild(el("span", "qz-pu", p.unit || ""));
    t.appendChild(stub);
    return t;
  }

  /* rows = [{ name, value, frac, color, win }] */
  function ranking(title, rows, note) {
    var c = el("section", "qz-rankc");
    c.appendChild(el("h3", "qz-h3", title));
    var list = el("ol", "qz-rank");
    rows.forEach(function (r) {
      var li = el("li", "qz-r" + (r.win ? " win" : ""));
      var top = el("div", "qz-rtop");
      var n = el("span", "qz-rn");
      var dot = el("i", "qz-rdot"); dot.style.background = r.color;
      n.appendChild(dot); n.appendChild(document.createTextNode(r.name));
      top.appendChild(n);
      top.appendChild(el("span", "qz-rv", r.value));
      li.appendChild(top);
      var tr = el("div", "qz-rt"); var f = el("i"); f.style.width = Math.max(0, Math.min(1, r.frac)) * 100 + "%";
      tr.appendChild(f); li.appendChild(tr);
      list.appendChild(li);
    });
    c.appendChild(list);
    if (note) c.appendChild(el("p", "qz-small", note));
    return c;
  }

  /* One quiet panel holding every folded section. items = [[key, title, sub, build]] */
  var openState = {};
  function moreList(items) {
    var wrap = el("section", "qz-morelist");
    wrap.appendChild(el("h3", "qz-h3", "More about this answer"));
    items.forEach(function (it) {
      var key = it[0];
      var d = el("details", "qz-more");
      if (openState[key]) d.open = true;
      var s = el("summary");
      var t = el("span", "qz-mt");
      t.appendChild(el("b", null, it[1]));
      if (it[2]) t.appendChild(el("span", null, it[2]));
      s.appendChild(t);
      d.appendChild(s);
      var body = el("div", "qz-mb");
      var built = false;
      function fill() { if (!built) { built = true; body.appendChild(it[3]()); } }
      if (d.open) fill();
      d.addEventListener("toggle", function () { openState[key] = d.open; if (d.open) fill(); });
      d.appendChild(body);
      wrap.appendChild(d);
    });
    return wrap;
  }

  function css() {
    fonts();
    if (document.getElementById("qz-css")) return;
    var s = document.createElement("style"); s.id = "qz-css";
    var SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";
    s.textContent = [
      ".qz-wrap{--hn:#1B2840;--ht:#1c3a45;--hg:#c9923a;--hs:#D97040;--hp:#F4F1EC;max-width:680px;margin:0 auto}",
      ".qz-wrap .qz-h3{margin:0 0 14px;font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:var(--text)}",
      /* question */
      ".qz-q{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:26px 26px 22px}",
      "@media (max-width:560px){.qz-q{padding:20px 16px 16px}}",
      ".qz-top{display:flex;align-items:center;gap:12px;margin-bottom:22px}",
      ".qz-steps{display:flex;gap:5px;flex:1}",
      ".qz-steps i{flex:1;height:3px;border-radius:2px;background:var(--line)}",
      ".qz-steps i.done{background:var(--hn)}",
      ".qz-steps i.now{background:var(--hg)}",
      ":root[data-theme=\"dark\"] .qz-steps i.done{background:#9fb2c7}",
      ".qz-count{font-size:12px;font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}",
      ".qz-wrap .qz-title{margin:0;font-family:" + SERIF + ";font-weight:400;font-size:30px;line-height:1.15;letter-spacing:0;color:var(--text)}",
      "@media (max-width:560px){.qz-wrap .qz-title{font-size:25px}}",
      ".qz-wrap .qz-hint{margin:8px 0 0;font-size:14.5px;color:var(--muted);line-height:1.5;max-width:56ch}",
      ".qz-opts{display:flex;flex-direction:column;gap:8px;margin-top:20px}",
      ".qz-opts.compact{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px}",
      "@media (max-width:560px){.qz-opts.compact{grid-template-columns:1fr 1fr}}",
      ".qz-opt{display:flex;align-items:center;gap:14px;width:100%;text-align:left;font:inherit;cursor:pointer;min-height:58px;padding:12px 16px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--text);transition:border-color .12s,background-color .12s}",
      ".qz-opts.compact .qz-opt{min-height:48px;padding:9px 12px;gap:10px}",
      ".qz-opt:hover{border-color:var(--hn)}",
      ":root[data-theme=\"dark\"] .qz-opt:hover{border-color:#9fb2c7}",
      ".qz-mark{flex:0 0 auto;width:20px;height:20px;border-radius:50%;border:1.5px solid #9aa6b4;display:grid;place-items:center}",
      ".qz-opt.multi .qz-mark{border-radius:5px}",
      ".qz-opt.on{border-color:var(--hn);background:color-mix(in srgb,var(--hn) 6%,var(--surface))}",
      ".qz-opt.on .qz-mark{border-color:var(--hn);background:var(--hn);box-shadow:inset 0 0 0 4px var(--surface)}",
      ".qz-opt.multi.on .qz-mark{box-shadow:none;background:var(--hn) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M20 6 9 17l-5-5' fill='none' stroke='%23fff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") center/14px no-repeat}",
      ":root[data-theme=\"dark\"] .qz-opt.on{border-color:#c9923a;background:color-mix(in srgb,#c9923a 10%,var(--surface))}",
      ":root[data-theme=\"dark\"] .qz-opt.on .qz-mark{border-color:#c9923a;background:#c9923a}",
      ".qz-optt{display:flex;flex-direction:column;gap:1px;min-width:0}",
      ".qz-optt b{font-size:15.5px;font-weight:600;line-height:1.3}",
      ".qz-opts.compact .qz-optt b{font-size:14px;font-weight:700;letter-spacing:.02em}",
      ".qz-optt span{font-size:13px;color:var(--muted);line-height:1.35}",
      ".qz-opts.compact .qz-optt span{font-size:11.5px}",
      ".qz-foot{display:flex;align-items:center;gap:12px;margin-top:18px}",
      ".qz-back{font:inherit;font-size:14px;font-weight:600;color:var(--muted);background:none;border:0;cursor:pointer;padding:10px 2px;min-height:44px}",
      ".qz-back:hover{color:var(--text);text-decoration:underline}",
      ".qz-next{margin-left:auto;min-height:48px;padding:0 26px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;border:0;border-radius:10px;color:#fff;background:var(--hs)}",
      ".qz-next:hover{background:#c45f31}",
      "@media (max-width:560px){.qz-next{flex:1}}",
      /* answers */
      ".qz-answers{margin:0 0 16px}",
      ".qz-ahead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}",
      ".qz-wrap .qz-al{margin:0;font-size:13px;color:var(--muted)}",
      ".qz-al b{color:var(--text);margin-right:4px}",
      ".qz-restart{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:0 15px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border-radius:10px;border:1.5px solid var(--hn);background:var(--surface);color:var(--hn)}",
      ".qz-restart:hover{background:var(--hn);color:#fff}",
      ":root[data-theme=\"dark\"] .qz-restart{border-color:#c9923a;color:#e2b768;background:transparent}",
      ":root[data-theme=\"dark\"] .qz-restart:hover{background:#c9923a;color:#1B2840}",
      ".qz-chips{display:flex;flex-wrap:wrap;gap:6px}",
      ".qz-chip{display:inline-flex;gap:6px;align-items:baseline;font:inherit;font-size:13px;cursor:pointer;padding:7px 11px;min-height:36px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--muted)}",
      ".qz-chip b{font-weight:600;color:var(--text);text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--text) 25%,transparent);text-underline-offset:3px}",
      ".qz-chip:hover{border-color:var(--hn)}",
      /* the boarding pass */
      ".qz-pass{--pc:#c9923a;position:relative;display:grid;grid-template-columns:1fr 196px;margin:0 0 18px;color:#1B2840;background:var(--hp);border-radius:14px;box-shadow:0 1px 0 rgba(27,40,64,.08),0 14px 30px -18px rgba(27,40,64,.45)}",
      ".qz-pass:before{content:'';position:absolute;left:0;top:0;bottom:0;width:7px;border-radius:14px 0 0 14px;background:var(--pc)}",
      ".qz-pbody{padding:24px 24px 22px 31px;min-width:0}",
      ".qz-wrap .qz-pk{margin:0;font-size:13px;font-weight:600;color:#5d6675}",
      ".qz-wrap .qz-pt{margin:4px 0 0;font-family:" + SERIF + ";font-weight:400;font-size:34px;line-height:1.08;color:#1B2840;letter-spacing:0}",
      ".qz-wrap .qz-pn{margin:10px 0 0;font-size:14px;line-height:1.5;color:#3d4757;max-width:52ch}",
      ".qz-plines{margin:16px 0 0;padding:0}",
      ".qz-pl{display:flex;align-items:baseline;gap:10px;padding:8px 0;border-top:1px solid #ddd6c8;font-size:14px}",
      ".qz-pl dt{flex:1;min-width:0;color:#1B2840}",
      ".qz-pl dd{margin:0;font-weight:700;color:#1B2840;font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".qz-wrap .qz-phow{margin:14px 0 0;font-size:12.5px;line-height:1.5;color:#5d6675}",
      ".qz-pstub{position:relative;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:22px 20px;color:#F4F1EC;background:#1c3a45;border-radius:0 14px 14px 0;border-left:2px dashed #F4F1EC}",
      ".qz-pstub:before,.qz-pstub:after{content:'';position:absolute;left:-12px;width:22px;height:22px;border-radius:50%;background:var(--bg)}",
      ".qz-pstub:before{top:-11px}.qz-pstub:after{bottom:-11px}",
      ".qz-psl{font-size:13px;color:#b9cdd2}",
      ".qz-pv{font-family:" + SERIF + ";font-weight:400;font-size:44px;line-height:1;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:0}",
      ".qz-pu{font-size:13.5px;color:#e2b768;font-weight:600}",
      "@media (max-width:600px){.qz-pass{grid-template-columns:1fr}.qz-pstub{order:-1;border-left:0;border-bottom:2px dashed #F4F1EC;border-radius:14px 14px 0 0;padding:18px 20px 18px 27px;flex-direction:row;flex-wrap:wrap;align-items:baseline;column-gap:10px}",
      ".qz-pstub:before,.qz-pstub:after{top:auto;bottom:-12px;left:auto}.qz-pstub:before{left:-11px}.qz-pstub:after{right:-11px}",
      ".qz-pass:before{border-radius:14px 0 0 14px}.qz-psl{width:100%}.qz-pv{font-size:38px}.qz-pbody{padding:18px 18px 18px 25px}.qz-wrap .qz-pt{font-size:28px}}",
      /* ranking */
      ".qz-rankc{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:14px}",
      "@media (max-width:560px){.qz-rankc{padding:16px}}",
      ".qz-rank{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}",
      ".qz-rtop{display:flex;justify-content:space-between;gap:10px;align-items:baseline}",
      ".qz-rn{display:inline-flex;align-items:center;gap:9px;font-size:14.5px;color:var(--text)}",
      ".qz-rdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}",
      ".qz-r.win .qz-rn{font-weight:700}",
      ".qz-rv{font-size:14.5px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;white-space:nowrap}",
      ".qz-rt{height:6px;border-radius:3px;background:var(--surface-2);margin-top:7px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--line)}",
      ".qz-rt i{display:block;height:100%;border-radius:3px;background:#9aa6b4}",
      ".qz-r.win .qz-rt i{background:var(--hg)}",
      ".qz-wrap .qz-small{margin:14px 0 0;font-size:13px;color:var(--muted);line-height:1.5}",
      /* more */
      ".qz-morelist{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px 22px 6px;margin-bottom:14px}",
      "@media (max-width:560px){.qz-morelist{padding:16px 16px 4px}}",
      ".qz-morelist .qz-h3{margin-bottom:4px}",
      ".qz-more{border-top:1px solid var(--line)}",
      ".qz-more>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;padding:14px 0;min-height:56px;box-sizing:border-box}",
      ".qz-more>summary::-webkit-details-marker{display:none}",
      ".qz-more>summary:after{content:'+';margin-left:auto;flex:0 0 auto;font-size:22px;line-height:1;font-weight:400;color:var(--muted)}",
      ".qz-more[open]>summary:after{content:'\\2212'}",
      ".qz-mt{display:flex;flex-direction:column;gap:2px}",
      ".qz-mt b{font-size:14.5px;font-weight:600;color:var(--text)}",
      ".qz-mt span{font-size:13px;color:var(--muted)}",
      ".qz-mb{padding:0 0 18px}"
    ].join("\n");
    document.head.appendChild(s);
  }

  window.HRT_QUIZ = { el: el, icon: icon, question: question, answers: answers, pass: pass, ranking: ranking, moreList: moreList, css: css };
})();
