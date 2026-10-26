/* node tools/community-picks/tally.test.mjs */
import assert from "node:assert/strict";
import { parseBank, parseOpens, buildRound, nextRound, tally, REVEAL_AT } from "./tally.mjs";

let passed = 0;
function t(name, fn) { fn(); passed++; }

const ROWS = [
  ["ID", "Round", "Category", "Question", "Choices", "Answer type", "Status", "Links to", "Notes", "Hint", "Reasons"],
  ["P1", "Setup", "Experience level", "Trips?", "A | B", "Opinion", "Draft"],
  ["1", "1", "Lounges and airports", "Best lounge at HNL?", "Plumeria Lounge | Premier Club | JAL Sakura Lounge", "Tried it", "Draft", "HNL Lounge Map", "", "Lounges are quiet rooms.", "Best food | Quiet seating | Showers"],
  ["2", "1", "Destinations", "Best Japan city for a first trip?", "Tokyo | Osaka | Kyoto", "Opinion", "Draft", "", "", "", "Food | Trains"],
  ["3", "2", "Credit cards", "Best card?", "Card A | Card B", "Tried it", "Draft"],
  ["96", "20", "Community Choice Awards", "Airline of the year?", "X | Y", "Opinion", "Hold for December"]
];
const OPENS = [["Round", "Q", "Hint", "Status"], ["1", "Best trick?", "One tip.", "Ready"], ["20", "Best win?", "", "Hold for December"]];
const bank = parseBank(ROWS), opens = parseOpens(OPENS);

const members = {};
for (let i = 0; i < 40; i++) members["mem_" + i] = { initials: "M" + i, photo: "" };
function vote(m, round, q, at, show) { return { id: "rec_" + m + "_" + round + "_" + at, createdAt: at, data: { member: m, round, answers: JSON.stringify({ q }), show_on_board: !!show } }; }

t("parseBank keeps numbered rows and maps categories", () => {
  assert.deepEqual(Object.keys(bank).sort(), ["1", "2", "3", "96"]);
  assert.equal(bank["1"].cat, "lounges");
  assert.equal(bank["1"].tried, true);
  assert.deepEqual(bank["1"].reasons, ["Best food", "Quiet seating", "Showers"]);
  assert.equal(bank["96"].cat, "awards");
});

t("buildRound lists that round's questions and the open question", () => {
  const r = buildRound(bank, opens, 1, "2026-10-26");
  assert.equal(r.questions.length, 2);
  assert.equal(r.open.q, "Best trick?");
  assert.equal(r.opened, "2026-10-26");
});

t("held rounds are skipped and rounds wrap", () => {
  assert.equal(nextRound(bank, opens, 1), 2);
  assert.equal(nextRound(bank, opens, 2), 1);
  assert.equal(buildRound(bank, opens, 20).questions.length, 0);
});

t("a ranking stays locked under 25 picks", () => {
  const votes = [];
  for (let i = 0; i < REVEAL_AT - 1; i++) votes.push(vote("mem_" + i, 1, { "1": { p: "Plumeria Lounge" } }, "2026-10-26T10:00:00Z"));
  const out = tally({ bank, votes, members, now: "2026-10-27T15:00:00Z" });
  const topic = out.rankings.topics.find((x) => x.id === "1");
  assert.equal(topic.locked, true);
  assert.equal(topic.picks.length, 0);
  assert.equal(topic.votes, REVEAL_AT - 1);
});

t("unlocked ranking: shares, order, reasons for the winner", () => {
  const votes = [];
  for (let i = 0; i < 30; i++) {
    const p = i < 15 ? "JAL Sakura Lounge" : i < 25 ? "Plumeria Lounge" : "Premier Club";
    votes.push(vote("mem_" + i, 1, { "1": { p, r: i < 10 ? ["Best food"] : ["Showers"] } }, "2026-10-26T10:00:00Z"));
  }
  const out = tally({ bank, votes, members, now: "2026-10-27T15:00:00Z" });
  const topic = out.rankings.topics.find((x) => x.id === "1");
  assert.equal(topic.locked, false);
  assert.deepEqual(topic.picks.map((p) => p[0]), ["JAL Sakura Lounge", "Plumeria Lounge", "Premier Club"]);
  assert.equal(topic.picks[0][1], 50);
  assert.equal(topic.picks[0][2], 15);
  assert.equal(topic.why[0][0], "Best food");
  assert.equal(topic.why[0][1], 67);
});

t("one pick per member per question, latest wins", () => {
  const votes = [];
  for (let i = 0; i < 25; i++) votes.push(vote("mem_" + i, 1, { "2": { p: "Tokyo" } }, "2026-10-26T10:00:00Z"));
  votes.push(vote("mem_0", 1, { "2": { p: "Kyoto" } }, "2026-10-26T12:00:00Z"));
  const topic = tally({ bank, votes, members }).rankings.topics.find((x) => x.id === "2");
  assert.equal(topic.votes, 25);
  assert.deepEqual(topic.picks.map((p) => [p[0], p[2]]), [["Tokyo", 24], ["Kyoto", 1]]);
});

t("test and unknown accounts never count", () => {
  const votes = [vote("mem_sandbox_x", 1, { "2": { p: "Tokyo" } }, "2026-10-26T10:00:00Z")];
  const out = tally({ bank, votes, members });
  assert.equal(out.rankings.topics.length, 0);
  assert.equal(out.rankings.travelers, 0);
});

t("write-ins are reported but not ranked until promoted", () => {
  const votes = [];
  for (let i = 0; i < 26; i++) votes.push(vote("mem_" + i, 1, { "1": { p: "Tokyo" === "x" ? "" : "Plumeria Lounge" } }, "2026-10-26T10:00:00Z"));
  for (let i = 26; i < 29; i++) votes.push(vote("mem_" + i, 1, { "1": { p: "Hawaiian Premier Club  Mauka", w: 1 } }, "2026-10-26T10:00:00Z"));
  const out = tally({ bank, votes, members });
  const topic = out.rankings.topics.find((x) => x.id === "1");
  assert.equal(topic.votes, 26);
  assert.equal(out.writeins.length, 1);
  assert.equal(out.writeins[0].count, 3);
});

t("arrows compare against the previous board", () => {
  const votes = [];
  for (let i = 0; i < 30; i++) votes.push(vote("mem_" + i, 1, { "2": { p: i < 20 ? "Osaka" : "Tokyo" } }, "2026-10-26T10:00:00Z"));
  const prev = { rankings: { topics: [{ id: "2", picks: [["Tokyo", 60, 18, 0], ["Osaka", 40, 12, 0]] }] } };
  const topic = tally({ bank, votes, members, prev }).rankings.topics.find((x) => x.id === "2");
  assert.equal(topic.picks[0][0], "Osaka");
  assert.equal(topic.picks[0][3], 1);
  assert.equal(topic.picks[1][3], -1);
});

t("tips: approved only, helpful once per member, sorted", () => {
  const tips = [
    { id: "tip_a", createdAt: "2026-10-26T10:00:00Z", data: { member: "mem_1", round: 1, text: "Check daily.", status: "approved" } },
    { id: "tip_b", createdAt: "2026-10-26T11:00:00Z", data: { member: "mem_2", round: 1, text: "Call before renewing.", status: "approved" } },
    { id: "tip_c", createdAt: "2026-10-26T11:00:00Z", data: { member: "mem_3", round: 1, text: "Spam <b>", status: "new" } }
  ];
  const helped = [
    { id: "h1", data: { member: "mem_5", tip: "tip_b" } }, { id: "h2", data: { member: "mem_5", tip: "tip_b" } },
    { id: "h3", data: { member: "mem_6", tip: "tip_b" } }, { id: "h4", data: { member: "mem_7", tip: "tip_a" } }
  ];
  const out = tally({ bank, votes: [], tips, helped, members });
  assert.deepEqual(out.tips.tips.map((x) => [x.id, x.helped]), [["tip_b", 2], ["tip_a", 1]]);
  assert.equal(out.tips.tips[0].who, "M2");
});

t("contributor board: opted-in only, monthly vs all time, streaks", () => {
  const votes = [
    vote("mem_1", 1, { "1": { p: "Premier Club" }, "2": { p: "Tokyo" } }, "2026-09-20T10:00:00Z", true),
    vote("mem_1", 2, { "3": { p: "Card A" } }, "2026-10-26T10:00:00Z", true),
    vote("mem_2", 2, { "3": { p: "Card B" } }, "2026-10-26T10:00:00Z", false)
  ];
  const out = tally({ bank, votes, members, now: "2026-10-27T15:00:00Z" });
  assert.equal(out.crew.monthly.length, 1);
  assert.equal(out.crew.monthly[0].who, "M1");
  assert.equal(out.crew.monthly[0].picks, 1);
  assert.equal(out.crew.allTime[0].picks, 3);
  assert.equal(out.crew.monthly[0].streak, 2);
  assert.equal(out.rankings.travelers, 2);
});

t("bad answer text never breaks the tally", () => {
  const votes = [{ id: "x", createdAt: "2026-10-26T10:00:00Z", data: { member: "mem_1", round: 1, answers: "{not json" } }];
  const out = tally({ bank, votes, members });
  assert.equal(out.rankings.topics.length, 0);
});

console.log("community picks tally: " + passed + " passed");
