/* Build a Memberstack member import CSV from Eddie's household trackers.

   Input: a households list CSV with columns
     email, first_name, household, tracker
   where tracker is the path to that household's card tracker CSV.

   Output: a CSV for Memberstack's member import (Members > Import), one row per
   household: Email Address, First Name (custom field first-name), Free Plan ID,
   and JSON = { wallet: {...} } so My Wallet is filled in on first login.

   Usage:
     node tools/clients/make_import.mjs households.csv > memberstack-import.csv
   Notes go to the screen (stderr). Nothing here is sent anywhere; you upload the
   file yourself. Client data never goes in this repo (it is public). */
import fs from "node:fs";
import path from "node:path";
import { parseCsv, toWallet, loadCatalogIds } from "./eddie_to_wallet.mjs";

const FREE_PLAN = "pln_free-member-09dc08yw";
/* The "HRT Client" free plan, once it exists in Memberstack: pass --client-plan pln_xxx */
const CLIENT_PLAN = process.argv.includes("--client-plan") ? process.argv[process.argv.indexOf("--client-plan") + 1] : "";

export function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function buildImport(households, readTracker, catalogIds, clientPlan = "") {
  const out = [["Email Address", "First Name", "Free Plan ID(s)", "Metadata", "JSON"]], notes = [], emails = {};
  households.forEach((h, i) => {
    const email = String(h.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { notes.push("Line " + (i + 2) + ": bad or missing email, skipped."); return; }
    if (emails[email]) { notes.push("Line " + (i + 2) + ": " + email + " already used on line " + emails[email] + ", skipped."); return; }
    emails[email] = i + 2;
    let rows = [];
    try { rows = parseCsv(readTracker(h.tracker)); } catch (e) { notes.push("Line " + (i + 2) + ": could not read " + h.tracker + ", skipped."); return; }
    const { wallet, warnings } = toWallet(rows, catalogIds, h.household || email);
    warnings.forEach((w) => notes.push((h.household || email) + ": " + w));
    /* metaData is admin-only in Memberstack, so members cannot mark themselves as clients */
    out.push([email, (h.first_name || "").trim(), [FREE_PLAN, clientPlan].filter(Boolean).join(","), JSON.stringify({ hrtClient: true }), JSON.stringify({ wallet })]);
  });
  return { csv: out.map((r) => r.map(csvCell).join(",")).join("\n") + "\n", notes, count: out.length - 1 };
}

if (import.meta.url === "file://" + process.argv[1]) {
  const list = process.argv[2];
  if (!list) { console.error("Usage: node tools/clients/make_import.mjs households.csv > memberstack-import.csv"); process.exit(1); }
  const base = path.dirname(path.resolve(list));
  const { csv, notes, count } = buildImport(parseCsv(fs.readFileSync(list, "utf8")),
    (p) => fs.readFileSync(path.resolve(base, p), "utf8"), loadCatalogIds(), CLIENT_PLAN);
  notes.forEach((n) => console.error("NOTE " + n));
  console.error(count + " households ready to import.");
  process.stdout.write(csv);
}
