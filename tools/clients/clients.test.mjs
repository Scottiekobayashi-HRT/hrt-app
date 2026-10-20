import { parseCsv, parseDate, statusFor, toWallet, cardKey, stableId } from "./eddie_to_wallet.mjs";
import { buildImport, csvCell } from "./make_import.mjs";

let pass = 0, fail = 0;
const eq = (n, got, want) => { const okk = JSON.stringify(got) === JSON.stringify(want); okk ? pass++ : fail++; if (!okk) console.log("FAIL", n, JSON.stringify(got), "want", JSON.stringify(want)); };

eq("date words", parseDate("Oct 18 2025"), "2025-10-18");
eq("date approx", parseDate("~Oct 21 2026"), "2026-10-21");
eq("date dashes", parseDate("--"), "");
eq("date slash", parseDate("2/3/2026"), "2026-02-03");
eq("date month only", parseDate("March 2024"), "2024-03");
eq("date junk", parseDate("sometime"), null);
eq("status keep", statusFor("Keep"), "keep");
eq("status keep for now", statusFor("Keep for now"), "keep-for-now");
eq("status almost", statusFor("Minimum spend almost done"), "min-spend-almost");
eq("status waiting", statusFor("Waiting for limited-time offer"), "next");
eq("status unknown", statusFor("Hmm"), null);
eq("card key", cardKey("Chase Freedom (was Sapphire)"), "chase freedom");
eq("stable id", stableId("pak", "Daniel", "amex gold", "2026-09-11"), stableId("pak", "Daniel", "amex gold", "2026-09-11"));

const ids = new Set(["chase-sapphire-preferred", "capone-venture", "amex-gold", "chase-freedom-unlimited"]);
const csv = "Who,Card,Opened,Annual Fee,Fee Renews,Status,Next Step\n" +
  "Daniel,Chase Sapphire Preferred,Oct 18 2025,$95,Oct 18,Keep,Household's one Sapphire.\n" +
  "Janice,Chase Freedom (was Sapphire),--,$0,--,Keep,Move points\n" +
  "Janice,NEXT: Atmos card,~Oct 21 2026,,,Waiting for limited-time offer,Scottie will text\n" +
  "Janice,Mystery Card,Someday,$0,,Odd status,\n";
const { wallet, warnings } = toWallet(parseCsv(csv), ids, "pak");
eq("4 cards", wallet.cards.length, 4);
eq("catalog card", [wallet.cards[0].cardId, wallet.cards[0].holder, wallet.cards[0].status], ["chase-sapphire-preferred", "Daniel", "keep"]);
eq("other card", [wallet.cards[1].cardId, wallet.cards[1].custom, wallet.cards[1].opened, wallet.cards[1].nickname], ["custom", { name: "Chase Freedom", fee: 0, issuer: "Chase" }, "", "was Sapphire"]);
eq("planned card", [wallet.cards[2].status, wallet.cards[2].custom.name, wallet.cards[2].opened], ["next", "Your next card", "2026-10-21"]);
eq("planned card has no note or issuer", [wallet.cards[2].note, wallet.cards[2].custom.issuer, wallet.cards[2].cardId], [undefined, undefined, "custom"]);
eq("odd status kept in note", wallet.cards[3].note, "Status: Odd status");
eq("warns about unreadable date", warnings.some((w) => /could not read open date "Someday"/.test(w)), true);

const hh = [{ email: "Pak@Example.com", first_name: "Janice", household: "pak", tracker: "pak.csv" },
  { email: "pak@example.com", first_name: "Dup", household: "pak2", tracker: "pak.csv" },
  { email: "nope", first_name: "X", household: "x", tracker: "x.csv" }];
const imp = buildImport(hh, () => csv, ids);
eq("one household imported", imp.count, 1);
eq("duplicate and bad email noted", imp.notes.filter((n) => /already used|bad or missing email/.test(n)).length, 2);
const line = imp.csv.split("\n")[1];
eq("email lowercased, free plan set, marked client", line.startsWith('pak@example.com,Janice,pln_free-member-09dc08yw,"{""hrtClient"":true}",'), true);
eq("client plan added when given", buildImport(hh.slice(0, 1), () => csv, ids, "pln_hrt-client").csv.split("\n")[1].includes("pln_free-member-09dc08yw,pln_hrt-client"), true);
eq("imported cards marked added by HRT", wallet.cards.every((c) => c.addedBy === "hrt"), true);
eq("json cell quoted", /,"\{""wallet""/.test(line), true);
eq("csv cell", csvCell('a,"b"'), '"a,""b"""');


{
  const ids = new Set(["chase-ink-business-preferred", "chase-ink-business-cash", "capone-venture"]);
  const r = toWallet([{ card: "CBP", opened: "2024-07-18", origin: "hrt", who: "Justin" }, { card: "cbc", origin: "pre", who: "Marlene" }, { card: "VR", opened: "2025-11-12", origin: "HRT" }], ids, "sedono");
  eq("ink + venture aliases", r.wallet.cards.map((c) => c.cardId), ["chase-ink-business-preferred", "chase-ink-business-cash", "capone-venture"]);
  eq("withHrt from origin", r.wallet.cards.map((c) => c.withHrt), [true, false, true]);
}
{
  /* Eddie's code list (Oct 19): every code maps to a catalog card or a flagged Other card */
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../../hrt-app/data/wallet-catalog.js", import.meta.url), "utf8");
  const ids = new Set([...src.matchAll(/"id": "([a-z0-9-]+)"/g)].map((m) => m[1]));
  const codes = ["CSP","CSR","CSW","CFU","CFF","CBU","CBC","CBP","CBM","VR","VX","VONE","VX-B","AXG","AXP","AXP-B","AXG-B","ATMOS","ATM-ASC","ATM-SUM","ATM-BIZ","CITI","BARCLAYS","DELTA","HILTON","MARRIOTT","UNITED","QS","SAVOR","STORE","HA","ALASKA","BOFA","BILT"];
  const r = toWallet(codes.map((c) => ({ card: c, who: "A" })), ids, "codes");
  const got = Object.fromEntries(codes.map((c, i) => [c, r.wallet.cards[i].cardId === "custom" ? "custom:" + r.wallet.cards[i].custom.name : r.wallet.cards[i].cardId]));
  eq("CBM premier", got.CBM, "chase-ink-business-premier");
  eq("VX-B", got["VX-B"], "capone-venture-x-business");
  eq("ATM-BIZ", got["ATM-BIZ"], "atmos-business");
  eq("ALASKA -> Ascent", got.ALASKA, "atmos-ascent");
  eq("HA -> Barclays Hawaiian", got.HA, "barclays-hawaiian");
  eq("DELTA generic", got.DELTA, "custom:Amex Delta card");
  eq("exact co-brand code", toWallet([{ card: "DELTA-GOLD" }], ids, "x").wallet.cards[0].cardId, "amex-delta-gold");
  const exact = codes.filter((c) => !got[c].startsWith("custom:"));
  eq("exact codes all in catalog", exact.length, 23);
  console.log("  codes:", JSON.stringify(got));
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
