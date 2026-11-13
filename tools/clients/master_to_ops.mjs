/* Master Client Sheet (ops) -> the "ops" block that feeds the Dashboard wallet tile.
   Field map (Scottie and Eddie, Nov 13):
     Next action for <first_name>  first_name, member_action_type, member_action_date, member_action_text
     Your next card                 next_card_pitch_date (When to apply), next_card_bonus_pts (Bonus)
     Next card to downgrade/cancel  fee_date (or the date in fee_anniversary) + fee_card (the member's own card)
     My Rewards Cards               wallet (count of entries, not counting cxld)
   Secrecy rule: no card names ever leave this file. next_card_plan, mrs_terms, wallet text
   and fee_anniversary codes are read for dates and counts only.
   Usage: node tools/clients/master_to_ops.mjs <sheet.tsv>  (prints JSON per member; nothing is sent)
   Member files have real names: never commit them. */
import { readFileSync } from "node:fs";

export function parseTsv(text) {
  const lines = String(text).replace(/\r/g, "").split("\n").filter((l) => l.length);
  const head = lines.shift().split("\t");
  return lines.map((l) => { const c = l.split("\t"), r = {}; head.forEach((h, i) => { r[h] = (c[i] || "").trim(); }); return r; });
}
const day = (s) => { const m = String(s || "").match(/(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; };
export function cardCount(wallet) {
  return String(wallet || "").split(";").map((t) => t.trim()).filter((t) => t && !/\bcxld\b/i.test(t)).length;
}
export function toOps(r) {
  const type = ["by", "on", "due_today", "all_set"].includes(r.member_action_type) ? r.member_action_type : "all_set";
  const pts = parseInt(String(r.next_card_bonus_pts || "").replace(/[^\d]/g, ""), 10);
  const ops = {
    action: { type, date: type === "all_set" ? "" : day(r.member_action_date), text: String(r.member_action_text || "").slice(0, 80) },
    nextCard: { date: day(r.next_card_pitch_date), bonusPts: Number.isFinite(pts) ? pts : null },
    feeDate: day(r.fee_date || r.fee_anniversary),
    feeCard: String(r.fee_card || "").slice(0, 40), /* the member's own card to downgrade or cancel (Scottie, Nov 13) */
    cardCount: cardCount(r.wallet)
  };
  if (ops.nextCard.bonusPts == null) delete ops.nextCard.bonusPts;
  return { firstName: r.first_name, ops };
}
if (process.argv[1] && process.argv[1].endsWith("master_to_ops.mjs") && process.argv[2]) {
  const rows = parseTsv(readFileSync(process.argv[2], "utf8"));
  console.log(JSON.stringify(rows.map(toOps), null, 1));
}
