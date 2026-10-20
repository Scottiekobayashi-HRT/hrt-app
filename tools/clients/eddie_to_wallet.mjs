/* Turn Eddie's household card tracker (CSV) into a My Wallet for that household.

   Eddie's columns: Who, Card, Opened, Annual Fee, Fee Renews, Status, Next Step
   Output: the wallet object My Wallet stores in the member's Memberstack JSON,
   under "wallet", plus warnings for anything a person should look at.

   Usage (one household):
     node tools/clients/eddie_to_wallet.mjs Pak_Household_Card_Tracker.csv > pak.json

   Cards we catalog get their full perks and earning. Anything else becomes an
   "Other card" with the name and fee from Eddie's sheet, so nothing is dropped.
   Client data never goes in this repo (it is public). Keep CSVs and output
   outside it. */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/* Names Eddie writes -> catalog ids. Lowercase, punctuation stripped. Add as you go. */
export const ALIASES = {
  "chase sapphire preferred": "chase-sapphire-preferred", "sapphire preferred": "chase-sapphire-preferred", "csp": "chase-sapphire-preferred",
  "chase sapphire reserve": "chase-sapphire-reserve", "sapphire reserve": "chase-sapphire-reserve", "csr": "chase-sapphire-reserve",
  "chase sapphire reserve for business": "chase-sapphire-reserve-business", "sapphire reserve business": "chase-sapphire-reserve-business",
  "chase freedom unlimited": "chase-freedom-unlimited", "freedom unlimited": "chase-freedom-unlimited", "cfu": "chase-freedom-unlimited",
  "chase freedom flex": "chase-freedom-flex", "freedom flex": "chase-freedom-flex", "cff": "chase-freedom-flex",
  "amex gold": "amex-gold", "american express gold": "amex-gold", "american express gold card": "amex-gold", "gold card": "amex-gold",
  "amex platinum": "amex-platinum", "american express platinum": "amex-platinum", "the platinum card": "amex-platinum", "platinum card": "amex-platinum",
  "amex business gold": "amex-business-gold", "business gold": "amex-business-gold",
  "amex business platinum": "amex-business-platinum", "business platinum": "amex-business-platinum",
  "capital one venture rewards": "capone-venture", "capital one venture": "capone-venture", "venture rewards": "capone-venture", "venture": "capone-venture",
  "capital one venture x": "capone-venture-x", "venture x": "capone-venture-x",
  "atmos rewards summit": "atmos-summit", "atmos summit": "atmos-summit", "atmos rewards summit visa infinite": "atmos-summit",
  "ink business preferred": "chase-ink-business-preferred", "chase ink business preferred": "chase-ink-business-preferred", "ink preferred": "chase-ink-business-preferred", "cbp": "chase-ink-business-preferred", "cip": "chase-ink-business-preferred",
  "ink business unlimited": "chase-ink-business-unlimited", "chase ink business unlimited": "chase-ink-business-unlimited", "ink unlimited": "chase-ink-business-unlimited", "cbu": "chase-ink-business-unlimited", "ciu": "chase-ink-business-unlimited",
  "ink business cash": "chase-ink-business-cash", "chase ink business cash": "chase-ink-business-cash", "ink cash": "chase-ink-business-cash", "cbc": "chase-ink-business-cash", "cic": "chase-ink-business-cash",
  "vr": "capone-venture", "vx": "capone-venture-x",
  "atmos rewards ascent": "atmos-ascent", "atmos ascent": "atmos-ascent", "atmos rewards ascent visa signature": "atmos-ascent"
};

/* Eddie's short codes (his tracker's Card column), Oct 19 2026. Exact cards map to the catalog.
   Codes that cover several cards (Delta, Hilton, United...) become a named Other card with a
   warning so a person picks the exact card; Eddie can also write the exact code (e.g. DELTA-GOLD). */
export const EDDIE_CODES = {
  "csp": "chase-sapphire-preferred", "csr": "chase-sapphire-reserve", "cfu": "chase-freedom-unlimited", "cff": "chase-freedom-flex",
  "cbu": "chase-ink-business-unlimited", "cbc": "chase-ink-business-cash", "cbp": "chase-ink-business-preferred", "cbm": "chase-ink-business-premier",
  "vr": "capone-venture", "vx": "capone-venture-x", "vone": "capone-ventureone", "vx b": "capone-venture-x-business",
  "axg": "amex-gold", "axp": "amex-platinum", "axp b": "amex-business-platinum", "axg b": "amex-business-gold",
  "atm asc": "atmos-ascent", "atm sum": "atmos-summit", "atm biz": "atmos-business",
  "qs": "capone-quicksilver", "savor": "capone-savor",
  "alaska": "atmos-ascent", /* the Alaska Visa Signature became Atmos Ascent automatically (BofA, Aug 2025) */
  "ha": "barclays-hawaiian",
  /* exact co-brand codes, if Eddie uses them */
  "csw plus": "chase-southwest-plus", "csw premier": "chase-southwest-premier", "csw priority": "chase-southwest-priority",
  "csw b premier": "chase-southwest-premier-business", "csw b performance": "chase-southwest-performance-business",
  "united gateway": "chase-united-gateway", "united explorer": "chase-united-explorer", "united quest": "chase-united-quest", "united club": "chase-united-club",
  "delta blue": "amex-delta-blue", "delta gold": "amex-delta-gold", "delta plat": "amex-delta-platinum", "delta platinum": "amex-delta-platinum", "delta reserve": "amex-delta-reserve",
  "hilton honors": "amex-hilton-honors", "hilton surpass": "amex-hilton-surpass", "hilton aspire": "amex-hilton-aspire",
  "marriott boundless": "chase-marriott-boundless", "marriott bold": "chase-marriott-bold", "marriott bevy": "amex-marriott-bevy", "marriott brilliant": "amex-marriott-brilliant",
  "bilt blue": "bilt-blue", "bilt obsidian": "bilt-obsidian", "bilt palladium": "bilt-palladium",
  "ha b": "barclays-hawaiian-business"
};
/* Codes that do not name one card: kept as an Other card with a clear name, flagged for a person. */
export const EDDIE_GENERIC = {
  "csw": ["Chase Southwest card", "Chase"], "delta": ["Amex Delta card", "American Express"], "hilton": ["Amex Hilton card", "American Express"],
  "united": ["Chase United card", "Chase"], "marriott": ["Marriott card", ""], "atmos": ["Atmos card", "Bank of America"],
  "citi": ["Citi card", "Citi"], "barclays": ["Barclays card", "Barclays"], "store": ["Store card", ""], "bofa": ["Bank of America card", "Bank of America"],
  "bilt": ["Bilt card", "Bilt"]
};

const STATUS_MAP = [
  [/^keep$/i, "keep"],
  [/keep for now/i, "keep-for-now"],
  [/minimum spend almost|min spend almost|almost done/i, "min-spend-almost"],
  [/minimum spend|min spend|working on spend/i, "min-spend"],
  [/downgrade|product change|switch/i, "downgrade"],
  [/cancel/i, "cancel"],
  [/closed/i, "closed"],
  [/waiting|next|apply|planned|offer/i, "next"]
];

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = (rows.shift() || []).map((h) => h.replace(/^﻿/, "").trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

/* "Oct 18 2025", "10/18/2025", "2025-10-18", "Oct 2025", "~Oct 21 2026", "--" */
export function parseDate(s) {
  const t = String(s || "").replace(/^[~≈]|approx\.?\s*/i, "").trim();
  if (!t || /^[-–—]+$/.test(t) || /^(n\/?a|unknown|\?)$/i.test(t)) return "";
  let m = t.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return y + "-" + String(m[1]).padStart(2, "0") + "-" + String(m[2]).padStart(2, "0"); }
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MON[m[1].slice(0, 3).toLowerCase()]) return m[3] + "-" + String(MON[m[1].slice(0, 3).toLowerCase()]).padStart(2, "0") + "-" + m[2].padStart(2, "0");
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m && MON[m[1].slice(0, 3).toLowerCase()]) return m[2] + "-" + String(MON[m[1].slice(0, 3).toLowerCase()]).padStart(2, "0");
  return null; /* could not read it */
}

export function cardKey(name) {
  return String(name || "").toLowerCase().replace(/®|™/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function statusFor(s) {
  const t = String(s || "").trim();
  if (!t) return "";
  for (const [re, k] of STATUS_MAP) if (re.test(t)) return k;
  return null;
}

/* Stable id per household + person + card + date, so re-imports update instead of duplicating. */
export function stableId(...parts) {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return "h" + h.toString(36);
}

export function toWallet(rows, catalogIds, household = "") {
  const cards = [], warnings = [], seen = {};
  rows.forEach((r, i) => {
    const line = i + 2;
    let name = (r.card || "").trim();
    if (!name) { warnings.push("Row " + line + ": no card name, skipped."); return; }
    let status = statusFor(r.status);
    if (/^next\s*:/i.test(name)) { name = name.replace(/^next\s*:\s*/i, ""); status = "next"; }
    if (status === null) { warnings.push("Row " + line + ': status "' + r.status + '" not recognized, kept in the note.'); }
    const opened = parseDate(r.opened);
    if (opened === null) warnings.push("Row " + line + ': could not read open date "' + r.opened + '", left blank.');
    const key = cardKey(name);
    const generic = EDDIE_GENERIC[key];
    const id0 = generic ? null : EDDIE_CODES[key] || ALIASES[key];
    const cardId = id0 && catalogIds.has(id0) ? id0 : "custom";
    const feeTxt = String(r.annual_fee || "").replace(/[$,\s]/g, "");
    const fee = feeTxt === "" ? null : +feeTxt;
    const entry = {
      id: stableId(household, r.who || "", key, opened || ""),
      cardId,
      opened: opened || "",
      addedBy: "hrt"
    };
    if (cardId === "custom" && generic) {
      entry.custom = { name: generic[0] };
      if (generic[1]) entry.custom.issuer = generic[1];
      if (fee != null && fee >= 0) entry.custom.fee = fee;
      warnings.push("Row " + line + ': "' + name + '" could be several cards, added as "' + generic[0] + '". Ask which one, or write the exact code (for example DELTA-GOLD).');
    } else if (cardId === "custom") {
      entry.custom = { name: name.replace(/\s*\(.*?\)\s*/g, " ").trim().slice(0, 60) };
      if (fee != null && fee >= 0) entry.custom.fee = fee;
      const iss = name.match(/^(chase|amex|american express|capital one|citi|bank of america|barclays|wells fargo|us bank|discover)\b/i);
      if (iss) entry.custom.issuer = iss[1].replace(/^amex$/i, "American Express").replace(/\b\w/g, (c) => c.toUpperCase()).replace("Us Bank", "U.S. Bank");
      warnings.push("Row " + line + ': "' + name + '" is not in our card list yet, added as Other card' + (fee == null ? " (no fee given)" : "") + ".");
    }
    if (key === "ha" && cardId !== "custom") warnings.push("Row " + line + ': "HA" added as the Barclays Hawaiian Airlines card. If it is the Bank of Hawaii Hawaiian card, change it.');
        /* Opened with HRT's help ("hrt") or before HRT ("pre"), from an origin column. */
    if (/^\s*hrt\b/i.test(r.origin || "")) entry.withHrt = true;
    else if (/^\s*pre\b/i.test(r.origin || "")) entry.withHrt = false;
    /* The next card is never named on the member's side: they hear it from Scottie by text. */
    if (status === "next") { entry.cardId = "custom"; entry.custom = { name: "Your next card" }; }
    if (r.who) entry.holder = r.who.slice(0, 30);
    if (status) entry.status = status;
    const note = status === "next" ? "" : [status === null ? "Status: " + r.status : "", r.next_step || ""].filter(Boolean).join(". ").slice(0, 500);
    if (note) entry.note = note;
    if (/\(was /i.test(r.card)) entry.nickname = (r.card.match(/\((was [^)]*)\)/i) || [])[1].slice(0, 40);
    if (seen[entry.id]) { warnings.push("Row " + line + ": same card, person and date as row " + seen[entry.id] + ", skipped."); return; }
    seen[entry.id] = line;
    cards.push(entry);
  });
  return { wallet: { v: 1, cards, points: [] }, warnings };
}

export function loadCatalogIds() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(HERE, "../../hrt-app/data/wallet-catalog.js"), "utf8"), ctx);
  return new Set((ctx.window.HRT_WALLET_CATALOG.cards || []).map((c) => c.id));
}

if (import.meta.url === "file://" + process.argv[1]) {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node tools/clients/eddie_to_wallet.mjs <household.csv>"); process.exit(1); }
  const household = path.basename(file).replace(/_?(household_)?card_tracker\.csv$/i, "").replace(/\.csv$/i, "");
  const { wallet, warnings } = toWallet(parseCsv(fs.readFileSync(file, "utf8")), loadCatalogIds(), household);
  warnings.forEach((w) => console.error("NOTE " + w));
  console.log(JSON.stringify({ wallet }, null, 1));
}
