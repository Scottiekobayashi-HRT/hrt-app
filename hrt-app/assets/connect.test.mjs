// node assets/connect.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const C = require("./connect.js");
let n = 0, bad = 0;
function ok(c, m) { n++; if (!c) { bad++; console.log("FAIL", m); } }
const earning = [
  { card: "chase-sapphire-preferred", currency: "Ultimate Rewards points" },
  { card: "chase-freedom-flex", currency: "Ultimate Rewards points (cash back)" },
  { card: "amex-gold", currency: "Membership Rewards points" },
  { card: "capone-venture-x", currency: "Capital One miles" },
  { card: "atmos-summit", currency: "Atmos Rewards points" }
];
const H = (id, short) => ({ cardId: id, name: short, short });
const bonuses = [
  { bank: "amex", partner: "Flying Blue", bonusPct: 25, expiresDate: "2026-10-31" },
  { bank: "amex", partner: "Aeromexico", bonusPct: 20, expiresDate: "2026-10-30" },
  { bank: "chase", partner: "Virgin", bonusPct: 30, expiresDate: "2026-11-15" },
  { bank: "citi", partner: "Avianca", bonusPct: 25, expiresDate: "2026-11-01" }
];
const lounges = [
  { id: "iass", name: "IASS Hawaii Lounge", tags: ["priority-pass"] },
  { id: "premier", name: "Premier Club", tags: ["priority-pass", "day-pass"] },
  { id: "delta", name: "Delta Sky Club (current)", tags: ["skyteam", "amex"] },
  { id: "deltanew", name: "New Delta Sky Club", tags: ["coming-soon"], soon: true },
  { id: "ana", name: "ANA", tags: ["star-alliance"] }
];

// banks and matching
let w = { held: [H("chase-sapphire-preferred", "Sapphire Preferred"), H("chase-freedom-flex", "Freedom Flex")], perks: [] };
let bk = C.banks(w, earning);
ok(bk.banks.chase && bk.banks.chase.cards.join() === "Sapphire Preferred,Freedom Flex", "Freedom joins Sapphire");
ok(!bk.cashOnly.length, "no cash-only when Sapphire held");
ok(C.bonusCards(bonuses[2], bk), "chase bonus matches");
ok(!C.bonusCards(bonuses[0], bk), "amex bonus does not match chase wallet");
ok(!C.bonusCards(bonuses[3], bk), "citi never matches");

w = { held: [H("chase-freedom-flex", "Freedom Flex")], perks: [] };
bk = C.banks(w, earning);
ok(!bk.banks.chase && bk.cashOnly[0] === "Freedom Flex", "Freedom alone is cash only");
ok(!C.bonusCards(bonuses[2], bk), "Freedom alone does not match chase bonus");
let t = C.tips(w, earning, bonuses, lounges);
ok(t.some(x => x.key === "tb-chase-cash"), "cash-only explainer for free members");
t = C.tips({ ...w, client: true }, earning, bonuses, lounges);
ok(!t.some(x => x.key === "tb-chase-cash"), "no card-pairing explainer for ʻOhana Members");

// tips
w = { held: [H("amex-gold", "Amex Gold"), H("capone-venture-x", "Venture X"), H("atmos-summit", "Atmos Summit")],
  perks: [{ cardId: "amex-gold", cardShort: "Amex Gold", perkId: "resy", amount: 50, used: false, endText: "Dec 31", days: 75 }] };
t = C.tips(w, earning, bonuses, lounges);
const amex = t.find(x => x.key === "tb-amex");
ok(amex && /2 transfer bonuses/.test(amex.title) && amex.action.bank === "amex" && amex.action.bonus === null, "one amex tip for two bonuses");
ok(amex && /Flying Blue/.test(amex.text), "names the best amex bonus");
ok(!t.some(x => x.key === "tb-capital-one"), "no capital one tip without a live bonus");
ok(t.some(x => x.kind === "resy" && /\$50 Resy credit ends Dec 31/.test(x.title)), "resy tip");
const lg = t.find(x => x.kind === "lounge");
ok(lg && /2 HNL lounges/.test(lg.title) && lg.action.lounges.join() === "iass,premier", "venture x opens two PP lounges, not delta");
ok(t.some(x => x.kind === "atmos"), "atmos tip");
ok(t[0].kind === "transfer", "transfer first");
w.perks[0].used = true;
ok(!C.tips(w, earning, bonuses, lounges).some(x => x.kind === "resy"), "used resy credit gives no tip");

// lounges for Platinum: PP lounges plus current Sky Club, never the coming-soon one
const la = C.loungeAccess({ held: [H("amex-platinum", "Amex Platinum")] }, lounges);
ok(la.list.map(x => x.id).join() === "iass,premier,delta", "platinum lounges");
const ltip = C.tips({ held: [H("amex-platinum", "Amex Platinum")], perks: [] }, earning, [], lounges).find(x => x.kind === "lounge");
ok(ltip && /fly Delta that day/.test(ltip.text), "sky club wording");

ok(C.tips({ held: [], perks: [] }, earning, bonuses, lounges).length === 0, "empty wallet, no tips");
ok(C.tips(null, earning, bonuses, lounges).length === 0, "no wallet, no tips");
for (const x of C.tips(w, earning, bonuses, lounges)) ok(!/[–—]/.test(x.title + x.text), "no dashes: " + x.key);

console.log((n - bad) + "/" + n + " passed");
if (bad) process.exit(1);
