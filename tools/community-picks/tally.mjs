/* ---------------------------------------------------------------------------
   tools/community-picks/tally.mjs   (Community Picks, Oct 25 2026)

   Turns the raw Memberstack records into the public board the dashboard reads.
   Run by the daily scheduled task (5am Hawaii). No keys, no network: the task
   saves the records with the Memberstack connector, runs this, then writes the
   output back to the cp_board table.

     node tools/community-picks/tally.mjs <folder>

   Reads from <folder>:
     bank.json      Questions tab rows (array of arrays, header first)
     opens.json     Open questions tab rows (array of arrays, header first)
     votes.json     cp_votes records   [{ id, createdAt, data:{ member, round, answers, show_on_board } }]
     tips.json      cp_tips records    [{ id, createdAt, data:{ member, round, text, status } }]
     helped.json    cp_helped records  [{ id, data:{ member, tip } }]
     members.json   { "<memberId>": { initials:"KM", photo:"https://..." } }  (live members only)
     prev.json      the last published board { rankings:{...} } (optional, for up/down arrows)
     state.json     { round: <current round number> }

   Writes to <folder>:
     board-rankings.json, board-tips.json, board-crew.json, board-round.json
     writeins.json  write-in answers with counts, for the task to review

   Rules (the same ones the page promises members):
   - One pick per member per question. A later pick replaces an earlier one.
   - Only members in members.json count (live accounts). Test accounts drop out.
   - A ranking shows once 25 members have picked on it. Until then: locked.
   - Write-ins count toward a ranking only once promoted into the Sheet's choices.
   - Tips show only with status "approved". Helpful taps count once per member.
   - The contributor board lists only members who opted in (show_on_board).
--------------------------------------------------------------------------- */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const REVEAL_AT = 25;

const CATS = {
  "lounges and airports": "lounges", "airlines and cabins": "airlines", "hotels and resorts": "hotels",
  "destinations": "destinations", "points and programs": "points", "credit cards": "cards",
  "tips and tricks": "tips", "community choice awards": "awards"
};
const LABELS = { lounges: "Lounges", airlines: "Airlines", hotels: "Hotels", destinations: "Destinations", points: "Points", cards: "Cards", tips: "Tips", awards: "Awards" };

const split = (s) => String(s || "").split("|").map((x) => x.trim()).filter(Boolean);
const norm = (s) => String(s || "").toLowerCase().replace(/[‘’ʻ'`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s, n) => {
  const t = String(s == null ? "" : s).replace(/\s*[–—]\s*/g, ", ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return n && t.length > n ? t.slice(0, n).trim() : t;
};

/* Questions tab rows -> { id: question } */
export function parseBank(rows) {
  const out = {};
  (rows || []).slice(1).forEach((r) => {
    const id = String(r[0] || "").trim();
    if (!/^\d+$/.test(id)) return;
    out[id] = {
      id, round: +r[1] || 0, cat: CATS[norm(r[2])] || "tips", q: clean(r[3], 140),
      choices: split(r[4]), tried: /tried/i.test(r[5] || ""), status: String(r[6] || "").trim(),
      link: clean(r[7], 40), hint: clean(r[9], 200), reasons: split(r[10])
    };
  });
  return out;
}
export function parseOpens(rows) {
  const out = {};
  (rows || []).slice(1).forEach((r) => {
    const n = +r[0];
    if (n > 0 && r[1]) out[n] = { round: n, q: clean(r[1], 140), hint: clean(r[2], 160), status: String(r[3] || "").trim() };
  });
  return out;
}
const usable = (status) => !/hold|retire/i.test(status || "");

/* The round the page should ask now. December uses the awards round when it is ready. */
export function buildRound(bank, opens, round, opened) {
  const qs = Object.values(bank).filter((q) => q.round === round && usable(q.status));
  const open = opens[round] && usable(opens[round].status) ? opens[round] : null;
  return {
    round, opened: opened || "",
    questions: qs.map((q) => ({ id: q.id, cat: q.cat, q: q.q, hint: q.hint, tried: q.tried, choices: q.choices, reasons: q.reasons, link: q.link })),
    open: open ? { q: open.q, hint: open.hint } : null
  };
}
/* Next round after `round`, skipping held rounds, wrapping back to 1. */
export function nextRound(bank, opens, round) {
  const rounds = [...new Set(Object.values(bank).filter((q) => usable(q.status)).map((q) => q.round))].sort((a, b) => a - b);
  if (!rounds.length) return round;
  const later = rounds.find((r) => r > round);
  return later || rounds[0];
}

function fields(rec) { return (rec && (rec.data || rec.fields)) || rec || {}; }
function memberId(v) { if (!v) return ""; if (typeof v === "string") return v; return v.id || v.memberId || ""; }
function parseAnswers(s) {
  try { const a = typeof s === "string" ? JSON.parse(s) : s; return a && typeof a === "object" && a.q ? a : { q: {} }; } catch (e) { return { q: {} }; }
}
function hstMonth(iso) {
  const d = new Date(iso); if (isNaN(d)) return "";
  const h = new Date(d.getTime() - 10 * 3600 * 1000);
  return h.toISOString().slice(0, 7);
}

/* The main tally. Pure: same input, same output. */
export function tally({ bank, votes, tips, helped, members, prev, now }) {
  members = members || {};
  const nowIso = now || new Date().toISOString();
  const month = hstMonth(nowIso);
  const live = (id) => !!members[id];

  /* latest pick per member per question */
  const sorted = (votes || []).slice().sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const latest = {};            /* qid -> memberId -> { p, w, r } */
  const perMember = {};         /* memberId -> { picksMonth, picksAll, rounds:Set, show } */
  const writeins = {};          /* qid -> norm -> { text, count } */
  sorted.forEach((rec) => {
    const f = fields(rec), m = memberId(f.member);
    if (!m || !live(m)) return;
    const ans = parseAnswers(f.answers);
    const pm = perMember[m] || (perMember[m] = { picksMonth: 0, picksAll: 0, rounds: new Set(), show: false });
    pm.show = f.show_on_board === true || f.show_on_board === "true";
    let n = 0;
    Object.keys(ans.q).forEach((qid) => {
      const a = ans.q[qid]; if (!a || !a.p || !bank[qid]) return;
      const pick = clean(a.p, 60);
      (latest[qid] || (latest[qid] = {}))[m] = { p: pick, w: !!a.w, r: (Array.isArray(a.r) ? a.r : []).slice(0, 2).map((x) => clean(x, 40)) };
      if (a.w) { const k = norm(pick); const box = (writeins[qid] || (writeins[qid] = {})); (box[k] || (box[k] = { text: pick, count: 0 })).count++; }
      n++;
    });
    if (n) {
      pm.picksAll += n;
      if (hstMonth(rec.createdAt) === month) pm.picksMonth += n;
      if (+f.round) pm.rounds.add(+f.round);
    }
  });

  /* rankings */
  const prevRank = {};
  ((prev && prev.rankings && prev.rankings.topics) || []).forEach((t) => {
    prevRank[t.id] = {}; (t.picks || []).forEach((p, i) => { prevRank[t.id][norm(p[0])] = i + 1; });
  });
  const topics = Object.keys(latest).map((qid) => {
    const q = bank[qid], byMember = latest[qid];
    const choiceKey = {}; q.choices.forEach((c) => { choiceKey[norm(c)] = c; });
    const counts = {}, reasons = {};
    let votesN = 0;
    Object.values(byMember).forEach((a) => {
      const name = choiceKey[norm(a.p)];
      if (!name) return; /* unpromoted write-in */
      votesN++;
      counts[name] = (counts[name] || 0) + 1;
      (reasons[name] || (reasons[name] = {}));
      a.r.forEach((r) => { if (q.reasons.indexOf(r) > -1) reasons[name][r] = (reasons[name][r] || 0) + 1; });
    });
    const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || q.choices.indexOf(a) - q.choices.indexOf(b));
    const locked = votesN < REVEAL_AT;
    const pct = (n) => Math.round((n / Math.max(1, votesN)) * 100);
    const picks = locked ? [] : order.slice(0, 4).map((name, i) => {
      const was = prevRank[qid] && prevRank[qid][norm(name)];
      return [name, pct(counts[name]), counts[name], was ? was - (i + 1) : 0];
    });
    const top = order[0];
    const why = locked || !top ? [] : Object.keys(reasons[top]).sort((a, b) => reasons[top][b] - reasons[top][a]).slice(0, 3)
      .map((r) => [r, Math.round((reasons[top][r] / counts[top]) * 100)]);
    return { id: qid, cat: q.cat, label: LABELS[q.cat] || "Tips", q: q.q, link: q.link, votes: votesN, locked, picks, why };
  }).filter((t) => t.votes > 0)
    .sort((a, b) => (a.locked - b.locked) || b.votes - a.votes);

  const travelers = Object.keys(perMember).filter((m) => perMember[m].picksAll > 0).length;
  const picksMonth = Object.values(perMember).reduce((s, p) => s + p.picksMonth, 0);

  /* tips */
  const helpCount = {}, seen = {};
  (helped || []).forEach((rec) => {
    const f = fields(rec), m = memberId(f.member), t = String(f.tip || "");
    if (!m || !t || !live(m)) return;
    const k = m + "|" + t; if (seen[k]) return; seen[k] = 1;
    helpCount[t] = (helpCount[t] || 0) + 1;
  });
  const tipList = (tips || []).filter((rec) => /^approved$/i.test(fields(rec).status || "") && live(memberId(fields(rec).member)))
    .map((rec) => {
      const f = fields(rec), m = memberId(f.member);
      return { id: rec.id, round: +f.round || 0, who: members[m].initials || "HRT", text: clean(f.text, 200), helped: helpCount[rec.id] || 0, at: rec.createdAt || "" };
    })
    .sort((a, b) => b.helped - a.helped || String(b.at).localeCompare(String(a.at)))
    .slice(0, 12)
    .map(({ at, ...t }) => t);

  /* contributor board */
  const roundsDesc = [...new Set(Object.values(perMember).flatMap((p) => [...p.rounds]))].sort((a, b) => b - a);
  const streak = (set) => { let s = 0; for (const r of roundsDesc) { if (set.has(r)) s++; else if (s) break; else break; } return s; };
  const crewRow = (m, key) => ({ who: members[m].initials || "HRT", photo: members[m].photo || "", picks: perMember[m][key], streak: streak(perMember[m].rounds) });
  const crewIds = Object.keys(perMember).filter((m) => perMember[m].show);
  const board = (key) => crewIds.filter((m) => perMember[m][key] > 0)
    .sort((a, b) => perMember[b][key] - perMember[a][key]).slice(0, 10).map((m) => crewRow(m, key));

  const wi = [];
  Object.keys(writeins).forEach((qid) => Object.values(writeins[qid]).forEach((w) => {
    if (!bank[qid].choices.some((c) => norm(c) === norm(w.text))) wi.push({ id: qid, q: bank[qid].q, text: w.text, count: w.count });
  }));
  wi.sort((a, b) => b.count - a.count);

  return {
    rankings: { updated: nowIso, revealAt: REVEAL_AT, travelers, picksMonth, topics },
    tips: { updated: nowIso, tips: tipList },
    crew: { updated: nowIso, month, monthly: board("picksMonth"), allTime: board("picksAll") },
    writeins: wi
  };
}

function read(dir, name, fallback) {
  const p = join(dir, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node tally.mjs <folder>"); process.exit(1); }
  const bank = parseBank(read(dir, "bank.json", []));
  const opens = parseOpens(read(dir, "opens.json", []));
  const state = read(dir, "state.json", { round: 1 });
  const out = tally({
    bank, votes: read(dir, "votes.json", []), tips: read(dir, "tips.json", []), helped: read(dir, "helped.json", []),
    members: read(dir, "members.json", {}), prev: read(dir, "prev.json", null)
  });
  const round = buildRound(bank, opens, state.round, state.opened);
  const opened = state.opened || "";
  out.tips.questions = {};
  out.tips.tips.forEach((t) => { if (opens[t.round]) out.tips.questions[t.round] = opens[t.round].q; });
  writeFileSync(join(dir, "board-rankings.json"), JSON.stringify(out.rankings));
  writeFileSync(join(dir, "board-tips.json"), JSON.stringify(out.tips));
  writeFileSync(join(dir, "board-crew.json"), JSON.stringify(out.crew));
  writeFileSync(join(dir, "board-round.json"), JSON.stringify(round));
  writeFileSync(join(dir, "writeins.json"), JSON.stringify(out.writeins, null, 1));
  const size = (o) => JSON.stringify(o).length;
  console.log(JSON.stringify({ round: round.round, opened, questions: round.questions.length, topics: out.rankings.topics.length,
    travelers: out.rankings.travelers, tips: out.tips.tips.length, crew: out.crew.monthly.length, writeins: out.writeins.length,
    bytes: { rankings: size(out.rankings), tips: size(out.tips), crew: size(out.crew), round: size(round) } }));
}
