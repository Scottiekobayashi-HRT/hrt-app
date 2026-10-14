/* Daily Kamaʻāina refresh.
   1. Opens HVCB's four island kamaʻāina pages in a real browser (the offer
      list only appears after the page's own scripts run) and pages through
      each list to collect every offer page.
   2. Reads each offer page. The full offer is embedded in the page itself
      (`var data = {...}` plus schema.org dates), so this is one normal page
      load per offer, spaced out politely.
   3. Adds hotel-chain deals Scottie marked approved in the review sheet.
   4. Rebuilds hrt-app/data/kamaaina-deals.js. Fewer than 40 HVCB offers
      means HVCB changed something: it stops and keeps the last good data.

   Usage: node tools/kamaaina/scrape.mjs [--out hrt-app/data/kamaaina-deals.js]
   Env:   KAMAAINA_SHEET_CSV  published CSV link of the review tab (optional) */
import { chromium } from "playwright";
import fs from "node:fs";
import vm from "node:vm";
import { build, toJs, parseCsv, hawaiiToday, parseOfferPage } from "./build.mjs";

const BASE = "https://www.hvcb.org";
const ISLANDS = ["/kamaaina/oahu/", "/kamaaina/maui-nui/", "/kamaaina/kauai/", "/kamaaina/island-of-hawaii/"];
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "hrt-app/data/kamaaina-deals.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readPrev(file) {
  try {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), ctx);
    return ctx.window.HRT_KAMAAINA_DEALS || [];
  } catch (e) { return []; }
}

async function collectPaths(page, path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("div.item a.title", { timeout: 45000 });
  const paths = new Set();
  for (let guard = 0; guard < 20; guard++) {
    const got = await page.$$eval("div.item a.title", (as) => as.map((a) => new URL(a.href).pathname));
    got.forEach((p) => paths.add(p));
    const info = (await page.textContent(".pager li.info").catch(() => "")) || "";
    const m = info.match(/(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/);
    if (!m || +m[2] >= +m[3]) break;
    const first = got[0];
    await page.click(".pager a.nxt");
    await page.waitForFunction((f) => { const a = document.querySelector("div.item a.title"); return a && new URL(a.href).pathname !== f; }, first, { timeout: 30000 });
    await sleep(800);
  }
  return [...paths].filter((p) => p.startsWith("/coupon/"));
}

async function main() {
  const today = hawaiiToday();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const all = new Set();
  for (const p of ISLANDS) {
    const got = await collectPaths(page, p);
    console.log(p, got.length, "offers");
    got.forEach((x) => all.add(x));
    await sleep(1500);
  }
  const offers = [];
  let failed = 0;
  for (const p of all) {
    try {
      const res = await page.request.get(BASE + p, { timeout: 30000 });
      if (!res.ok()) throw new Error("HTTP " + res.status());
      const o = parseOfferPage(await res.text());
      if (!o) throw new Error("no offer data");
      if ((o.categories || []).some((c) => c.categoryid === 7)) { o._path = p; offers.push(o); }
    } catch (e) { failed++; console.log("skip", p, e.message); }
    await sleep(700);
  }
  await browser.close();
  console.log("read", offers.length, "of", all.size, "offer pages,", failed, "failed");
  if (failed > all.size * 0.25) throw new Error("Too many offer pages failed (" + failed + "). Keeping the last good data.");

  let sheetRows = [];
  if (process.env.KAMAAINA_SHEET_CSV) {
    const r = await fetch(process.env.KAMAAINA_SHEET_CSV);
    if (!r.ok) throw new Error("Review sheet CSV returned " + r.status);
    sheetRows = parseCsv(await r.text());
    console.log("review sheet rows:", sheetRows.length, "approved:", sheetRows.filter((x) => /^(y|yes|approved|true|1)$/i.test(x.approved || "")).length);
  }
  const rows = build({ hvcb: offers, sheetRows, prevList: readPrev(OUT), today });
  fs.writeFileSync(OUT, toJs(rows, today));
  console.log("wrote", rows.length, "deals to", OUT, "| new:", rows.filter((r) => r.n).length, "| top:", rows[0] && rows[0].b);
}

if (import.meta.url === "file://" + process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
