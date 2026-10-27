/* Build hrt-app/data/kamaaina-deals.js from HVCB offers (the vetted baseline)
   plus hotel-chain deals Scottie approved in the "Kamaaina review" sheet tab.

   Pure functions live here so they can be tested without a browser.
   scrape.mjs reads hvcb.org in a real browser and calls build(). */

const ISLAND_KEYS = {
  "oʻahu": "oahu", "oahu": "oahu", "maui": "maui", "kauaʻi": "kauai", "kauai": "kauai",
  "island of hawaiʻi": "hawaii", "hawaiʻi island": "hawaii", "hawaii island": "hawaii", "big island": "hawaii", "hawaiʻi": "hawaii", "hawaii": "hawaii",
  "lānaʻi": "lanai", "lanai": "lanai", "molokaʻi": "molokai", "molokai": "molokai"
};
export function islandKey(name) {
  const k = String(name || "").toLowerCase().replace(/[‘’']/g, "ʻ").trim();
  return ISLAND_KEYS[k] || ISLAND_KEYS[k.replace(/ʻ/g, "")] || null;
}

/* HVCB category -> the dashboard's groups */
export function groupFor(cat, listingCat) {
  const c = String(cat || "") + " " + String(listingCat || "");
  if (/accommodation|hotel|resort|condo|vacation rental|lodging/i.test(c)) return "Stays";
  if (/transport|car rental|airline|shuttle/i.test(c)) return "Getting around";
  if (/dining|restaurant|food/i.test(c)) return "Dining";
  if (/shopping|retail/i.test(c)) return "Shopping";
  if (/service/i.test(c)) return "Services";
  return "Things to do";
}

/* Hawaiian spelling for towns the map knows */
const TOWNS = { "waikiki": "Waikīkī", "kailua kona": "Kailua-Kona", "kailua-kona": "Kailua-Kona", "lanai city": "Lanai City" };
export function areaFor(city) {
  const c = String(city || "").trim();
  return TOWNS[c.toLowerCase()] || c;
}

const PROGRAMS = [
  [/westin|sheraton|marriott|moana surfrider|royal hawaiian|luxury collection|ritz|courtyard|residence inn|autograph|\bw maui|st\.? regis|aloft|ac hotel|fairfield|springhill|four points|le meridien|renaissance|edition|wailea beach resort|kaanapali beach club|ko olina beach club|maui ocean club|princess kaiulani/i, "Marriott Bonvoy"],
  [/hilton|doubletree|embassy suites|hampton|conrad|waldorf|grand islander|kalia tower|grand wailea|curio|tapestry|lagoon tower|hokulani/i, "Hilton Honors"],
  [/hyatt|andaz|alila|thompson|destination by hyatt|unbound/i, "World of Hyatt"],
  [/\bihg\b|holiday inn|intercontinental|kimpton|hotel indigo|vacation club|candlewood|crowne plaza|regent/i, "IHG One Rewards"],
  [/outrigger|ohana waikiki|waikiki beachcomber|reef/i, "Outrigger"],
  [/aqua|aston/i, "Aqua-Aston"],
  [/wyndham|trademark collection|ramada|days inn|la quinta|travelodge/i, "Wyndham"],
  [/best western/i, "Best Western"],
  [/aulani|disney/i, "Disney"]
];
export function programFor(business) {
  for (const [re, name] of PROGRAMS) if (re.test(business || "")) return name;
  return "";
}

export function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|div|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "-").replace(/&mdash;/g, ", ").replace(/&[a-z]+;/g, " ")
    .replace(/\s*[–—]\s*/g, ", ")          /* no em dashes in customer-facing text */
    .replace(/\s+/g, " ").trim();
}
export function clip(s, n) {
  s = String(s || "");
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 3);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 30)) + "...";
}

/* What a deal gives: percent off, fee discount, perks, nightly price */
/* Room or ticket percent off. The headline wins when it names one, because
   descriptions often mention other percentages (spa, parking, dining). */
function pctOff(text) {
  let p = 0;
  for (const m of (" " + text + " ").matchAll(/(?:up to |save |enjoy |receive |get |a )?(\d{1,2})\s?%\s*(?:off|discount|savings)?([^.;,%]{0,40})/gi)) {
    const v = +m[1], tail = (m[2] || "").toLowerCase();
    if (v > 0 && v <= 75 && !/amenity|resort fee|resort charge|parking|valet|spa|dining|food|f&b|retail|restaurant|breakfast/.test(tail)) { p = Math.max(p, v); }
  }
  return p;
}

export function readDeal(text, isStay, headline) {
  const t = " " + text.replace(/\s+/g, " ") + " ";
  const p = (headline && pctOff(headline)) || pctOff(t);
  let a = 0;
  const am = t.match(/(\d{1,3})\s?%\s*off[^.%]{0,25}(?:amenity|resort)\s*(?:fee|charge)/i);
  if (am) a = Math.min(100, +am[1]);
  const k = [];
  const add = (x) => { if (k.indexOf(x) < 0) k.push(x); };
  const waivedFee = /(waived|no|complimentary|free)\s+(daily\s+)?(resort|amenity|destination)\s*(fee|charge)|(resort|amenity|destination)\s*(fee|charge)s?\s*(is\s+|are\s+)?waived/i.test(t);
  if (waivedFee) add("Resort fee waived");
  else if (a > 0 || /\$\d+\s*off[^.]{0,20}(amenity|resort)\s*fee/i.test(t)) add("Resort fee discount");
  if (/(free|complimentary|waived)\s+(self[-\s]?)?(parking|valet)|parking\s+(is\s+)?(free|waived|included|complimentary)/i.test(t)) add("Free parking");
  else if (/\d+\s?%\s*off\s*(self[-\s]?|valet\s*)?parking|discounted parking|parking discount/i.test(t)) add("Parking discount");
  if (/breakfast/i.test(t) && /(free|complimentary|included|daily breakfast|breakfast for)/i.test(t)) add("Breakfast included");
  if (/upgrade/i.test(t)) add("Room upgrade");
  if (/late check[-\s]?out/i.test(t)) add("Late check-out");
  if (/early check[-\s]?in/i.test(t)) add("Early check-in");
  if (/(\$\d+|daily|nightly)\s+(resort|food|f&b|dining)\s+credit|resort credit/i.test(t)) add("Resort credit");
  if (/\d+\s?%\s*off[^.]{0,20}(dining|restaurant|food|f&b)/i.test(t)) add("Dining discount");
  if (/\d+\s?%\s*off[^.]{0,15}spa/i.test(t)) add("Spa discount");
  if (/(fourth|4th|third|3rd|fifth|5th) night free|free night/i.test(t)) add("Free night");
  if (/free (admission|entry)|complimentary (admission|entry)/i.test(t)) add("Free entry");
  let v = null;
  if (isStay) {
    const pm = t.match(/(?:from|starting at|starting|as low as|rates? (?:of|from)|only)\s*\$(\d{2,4})(?![\d,])/i) || t.match(/\$(\d{2,4})(?![\d,])\s*(?:per night|\/\s?night|a night|nightly)/i);
    if (pm) v = +pm[1];
  }
  return { p, a, k, v };
}

export function scoreFor(d) {
  const s = Math.round(d.p + 0.12 * d.a + 7 * d.k.length + (d.v ? 9 : 0) + (d.g === "Stays" ? 5 : 7));
  return Math.max(1, Math.min(99, s));
}
export function ratingFor(s) {
  return s >= 58 ? "Top pick" : s >= 38 ? "Strong" : s >= 20 ? "Solid" : "Worth a look";
}

/* Days from today (Hawaii) to an ISO date */
export function daysLeft(iso, today) {
  if (!iso) return null;
  const t = Date.parse(iso + "T12:00:00Z"), n = Date.parse(today + "T12:00:00Z");
  return Math.round((t - n) / 86400000);
}
export function hawaiiToday(now = new Date()) {
  return new Date(now.getTime() - 10 * 3600 * 1000).toISOString().slice(0, 10);
}

/* One HVCB offer record (from the coupon page's `var data` and JSON-LD) -> dashboard row */
export function fromHvcb(o, today, prev) {
  const L = (o.listings && o.listings[0]) || {};
  const udf = o.udfs_object || {};
  const isl = ((udf["2724"] && (udf["2724"].valuearray || udf["2724"].value_raw)) || []).map((x) => islandKey(x.value)).filter(Boolean);
  const cat = udf["3915"] && udf["3915"].value;
  const g = groupFor(cat, L.primary_category && L.primary_category.catname);
  const b = stripHtml(L.title || o.company || "").replace(/\s+/g, " ");
  const t = stripHtml(o.title);
  const desc = stripHtml(o.description);
  const terms = stripHtml(udf["2703"] && udf["2703"].value);
  const deal = readDeal([t, desc].join(". "), g === "Stays", t);
  const key = (b + "|" + t).toLowerCase();
  const old = prev[key] || prev["b:" + b.toLowerCase()];
  const h = (old && old.h) || areaFor(L.city);
  const e = o._validUntil || null;
  const dl = daysLeft(e, today);
  const row = {
    b, t, d: clip(desc, 200), f: clip(terms, 150),
    i: isl.length ? Array.from(new Set(isl)) : [islandKey(L.region) || "oahu"],
    g, h, p: deal.p, a: deal.a, k: deal.k, v: deal.v, s: 0, r: "",
    e: e || "2027-12-31", dl: dl == null ? 365 : dl,
    n: prev[key] ? 0 : 1, x: 0,
    m: (old && old.m) || programFor(b),
    u: o.offerlink ? (/^https?:/i.test(o.offerlink) ? o.offerlink : "https://" + o.offerlink) : "https://www.hvcb.org" + (o._path || "/kamaaina/"),
    src: "hvcb"
  };
  if (typeof L.latitude === "number" && typeof L.longitude === "number" && L.latitude) row.ll = [+L.latitude.toFixed(4), +L.longitude.toFixed(4)];
  row.s = scoreFor(row); row.r = ratingFor(row.s); row.x = row.dl <= 60 ? 1 : 0;
  return row;
}

/* Approved row from the review sheet (CSV object keyed by header) -> dashboard row */
export function fromSheet(r, today, prev) {
  const g = groupFor(r.category || "Accommodations");
  const b = stripHtml(r.business), t = stripHtml(r.title);
  const desc = stripHtml(r.description), terms = stripHtml(r.terms);
  const deal = readDeal([t, desc].join(". "), g === "Stays", t);
  if (r.percent_off) deal.p = +r.percent_off || deal.p;
  if (r.perks) deal.k = r.perks.split(/\s*;\s*/).filter(Boolean);
  if (r.nightly_from) deal.v = +r.nightly_from || deal.v;
  const key = (b + "|" + t).toLowerCase();
  const e = r.ends || "2027-12-31", dl = daysLeft(e, today);
  const row = {
    b, t, d: clip(desc, 200), f: clip(terms, 150),
    i: String(r.island || "oahu").split(/\s*[;,+]\s*/).map(islandKey).filter(Boolean),
    g, h: areaFor(r.area || ""), p: deal.p, a: deal.a, k: deal.k, v: deal.v, s: 0, r: "",
    e, dl, n: prev[key] ? 0 : 1, x: 0, m: r.program || programFor(b), u: r.link, src: "chain"
  };
  if (!row.i.length) row.i = ["oahu"];
  row.s = scoreFor(row); row.r = ratingFor(row.s); row.x = row.dl <= 60 ? 1 : 0;
  return row;
}

/* Previous data keyed for "new" flags and hand-tuned areas/programs */
export function indexPrev(list) {
  const out = {};
  (list || []).forEach((d) => { out[(d.b + "|" + d.t).toLowerCase()] = d; out["b:" + d.b.toLowerCase()] = out["b:" + d.b.toLowerCase()] || d; });
  return out;
}

/* Freshness. Each row carries:
     fs  the date we first saw this offer (blank = before tracking started)
     us  the date its terms last changed, or the business swapped in a new offer (blank = never)
     n   1 while the offer is under a week old (older pages use it for the "New" tag)
   A business that replaces its old offer with a new one counts as "updated", not "new". */
const FRESH_FIELDS = ["t", "d", "f", "p", "a", "k", "v", "e"];
function sig(r) { return JSON.stringify(FRESH_FIELDS.map((k) => r[k] == null ? null : r[k])); }
export function stampRows(rows, prevList, today) {
  const keyOf = (r) => (r.b + "|" + r.t).toLowerCase();
  const prevByKey = {}, prevByBiz = {};
  (prevList || []).forEach((p) => {
    if (!p || !p.b) return;
    prevByKey[keyOf(p)] = p;
    (prevByBiz[p.b.toLowerCase()] = prevByBiz[p.b.toLowerCase()] || []).push(p);
  });
  const cur = new Set(rows.map(keyOf));
  /* No previous list (first run, or yesterday's file could not be read): we cannot tell
     what is new, so mark nothing new rather than calling every deal new. */
  if (!(prevList || []).length) { rows.forEach((r) => { r.fs = ""; r.us = ""; r.n = 0; }); return rows; }
  rows.forEach((r) => {
    const o = prevByKey[keyOf(r)];
    if (o) {
      r.fs = o.fs || "";
      r.us = sig(o) !== sig(r) ? today : (o.us || "");
    } else {
      const replaced = (prevByBiz[r.b.toLowerCase()] || []).filter((p) => !cur.has(keyOf(p)));
      if (replaced.length) { r.fs = replaced[0].fs || ""; r.us = today; }
      else { r.fs = today; r.us = ""; }
    }
    const age = r.fs ? daysLeft(today, r.fs) : 99;
    r.n = age <= 6 ? 1 : 0;
  });
  return rows;
}

export function build({ hvcb, sheetRows = [], prevList = [], today = hawaiiToday(), minHvcb = 40 }) {
  if (!Array.isArray(hvcb) || hvcb.length < minHvcb) throw new Error("Only " + (hvcb ? hvcb.length : 0) + " HVCB offers read (expected at least " + minHvcb + "). HVCB may have changed its pages. Keeping the last good data.");
  const prev = indexPrev(prevList);
  const rows = [], seen = new Set();
  const push = (r) => {
    const key = (r.b + "|" + r.t).toLowerCase();
    if (!r.b || !r.t || seen.has(key) || r.dl < 0) return;
    if (r.u && !/^https:\/\//i.test(r.u)) return;
    seen.add(key); rows.push(r);
  };
  hvcb.forEach((o) => push(fromHvcb(o, today, prev)));
  sheetRows.filter((r) => /^(y|yes|approved|true|1)$/i.test(String(r.approved || "").trim())).forEach((r) => push(fromSheet(r, today, prev)));
  stampRows(rows, prevList, today);
  rows.sort((a, b) => b.s - a.s || a.b.localeCompare(b.b));
  return rows;
}

export function label(today) {
  const d = new Date(today + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* Line 1 holds both the date label and the exact run time. The Mac's refresh.sh
   ignores changes to this line when deciding whether anything changed. */
export function toJs(rows, today, now = new Date()) {
  return "window.HRT_KAMAAINA_UPDATED=" + JSON.stringify(label(today)) + ";window.HRT_KAMAAINA_STAMP=" + JSON.stringify(now.toISOString()) + ";\n" +
    "window.HRT_KAMAAINA_DEALS=" + JSON.stringify(rows) + ";\n";
}

/* Minimal CSV parser (quoted fields, commas, newlines) for the published sheet tab */
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
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

/* Pull `var data = {...}` out of an offer page without running its scripts */
export function parseOfferPage(html) {
  const at = html.indexOf("var data = ");
  if (at < 0) return null;
  let i = at + 11, depth = 0;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '"') { i++; while (i < html.length && html[i] !== '"') { if (html[i] === "\\") i++; i++; } }
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  const o = JSON.parse(html.slice(at + 11, i));
  const until = html.match(/"priceValidUntil"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  const from = html.match(/"validFrom"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
  o._validUntil = until ? until[1] : null;
  o._validFrom = from ? from[1] : null;
  return o;
}

