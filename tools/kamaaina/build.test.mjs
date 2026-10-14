import { build, readDeal, islandKey, groupFor, scoreFor, ratingFor, parseCsv, toJs, stripHtml, daysLeft, parseOfferPage } from "./build.mjs";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  if (!ok) console.log("FAIL", name, "\n  got ", JSON.stringify(got), "\n  want", JSON.stringify(want));
};

/* islands and groups */
eq("oahu", islandKey("Oʻahu"), "oahu");
eq("big island", islandKey("Island of Hawaiʻi"), "hawaii");
eq("lanai", islandKey("Lānaʻi"), "lanai");
eq("stays", groupFor("Accommodations - Oʻahu"), "Stays");
eq("activities", groupFor("Activities"), "Things to do");
eq("transport", groupFor("Transportation"), "Getting around");

/* deal reading */
const aston = readDeal("Enjoy up to 10% off room rate, $10 off daily amenity fees, & More!. Up to 10% off room rates* $10 off daily amenity fees Complimentary daily fitness pass", true);
eq("aston p", aston.p, 10);
eq("aston perks", aston.k, ["Resort fee discount"]);
const wrh = readDeal("SAVE UP TO 30% OFF + 50% OFF AMENITY FEE + WAIVED PARKING. Late check-out and early check-in when available.", true);
eq("wrh p", wrh.p, 30);
eq("wrh a", wrh.a, 50);
eq("wrh perks", wrh.k, ["Resort fee discount", "Free parking", "Late check-out", "Early check-in"]);
const westin = readDeal("Kamaʻāina Starting $299. Resort View Rooms from $299 per night plus tax, includes complimentary self-parking with daily resort fees waived", true);
eq("westin price", westin.v, 299);
eq("westin perks", westin.k, ["Resort fee waived", "Free parking"]);
eq("parking pct is not room pct", readDeal("Save 20% off room rate & 25% off Parking", true).p, 20);
eq("no em dash", stripHtml("<p>Ocean view — best rate</p>"), "Ocean view, best rate");
eq("rating", [ratingFor(88), ratingFor(40), ratingFor(25), ratingFor(5)], ["Top pick", "Strong", "Solid", "Worth a look"]);
eq("days left", daysLeft("2026-12-31", "2026-10-14"), 78);

eq("headline percent wins", readDeal("Enjoy 30% off room rates, No Amenity Fees. Up to 50% off select stays", true, "Enjoy 30% off room rates, No Amenity Fees").p, 30);

/* offer page parsing */
const html = '<script>var data = {"recid":"2856","title":"Enjoy up to 10% off room rate","description":"<p>Up to 10% off room rates</p>","offerlink":"https://www.aquaaston.com/x","categories":[{"categoryid":7}],"udfs_object":{"2724":{"valuearray":[{"listid":5626,"value":"Oʻahu"}]},"3915":{"value":"Accommodations - Oʻahu"},"2703":{"value":"Rates plus tax. {braces} \\"quoted\\""}},"listings":[{"title":"Aston at the Executive Centre Hotel","city":"Honolulu","region":"Oʻahu","latitude":21.30932,"longitude":-157.86,"primary_category":{"catname":"Accommodations"}}]};</script>' +
  '<script type="application/ld+json">{"validFrom":"2026-09-28","priceValidUntil":"2027-09-27"}</script>';
const o = parseOfferPage(html);
eq("parsed id", o.recid, "2856");
eq("parsed until", o._validUntil, "2027-09-27");
eq("braces in strings", o.udfs_object["2703"].value, 'Rates plus tax. {braces} "quoted"');

/* build */
const many = Array.from({ length: 40 }, (_, i) => Object.assign(JSON.parse(JSON.stringify(o)), { title: "Offer " + i }));
const rows = build({ hvcb: many, prevList: [{ b: "Aston at the Executive Centre Hotel", t: "Offer 1", h: "Waikīkī", m: "Aqua-Aston" }], today: "2026-10-14" });
eq("count", rows.length, 40);
const r1 = rows.find((r) => r.t === "Offer 1");
eq("kept old area", r1.h, "Waikīkī");
eq("old is not new", r1.n, 0);
eq("others are new", rows.find((r) => r.t === "Offer 2").n, 1);
eq("island", r1.i, ["oahu"]);
eq("group", r1.g, "Stays");
eq("link", r1.u, "https://www.aquaaston.com/x");
eq("coords", r1.ll, [21.3093, -157.86]);
eq("ends", [r1.e, r1.dl, r1.x], ["2027-09-27", 348, 0]);
let threw = false; try { build({ hvcb: many.slice(0, 10) }); } catch (e) { threw = true; }
eq("refuses thin data", threw, true);

/* approved chain rows from the sheet */
const csv = 'approved,island,business,title,description,terms,category,percent_off,perks,nightly_from,ends,link,program\n' +
  'yes,Maui,Hyatt Regency Maui,"Kamaʻāina rate","Save 25% plus daily breakfast, ""for locals""",HI ID required,Accommodations,25,Breakfast included,,2026-12-20,https://www.hyatt.com/x,World of Hyatt\n' +
  'no,Oʻahu,Hilton Hawaiian Village,Local rate,Save 15%,,Accommodations,15,,,2026-12-31,https://www.hilton.com/y,\n';
const sheet = parseCsv(csv);
eq("csv rows", sheet.length, 2);
eq("csv quotes", sheet[0].description, 'Save 25% plus daily breakfast, "for locals"');
const rows2 = build({ hvcb: many, sheetRows: sheet, today: "2026-10-14" });
eq("only approved added", rows2.filter((r) => r.src === "chain").map((r) => r.b), ["Hyatt Regency Maui"]);
eq("chain perks", rows2.find((r) => r.src === "chain").k, ["Breakfast included"]);
eq("expired dropped", build({ hvcb: many, sheetRows: [Object.assign({}, sheet[0], { ends: "2026-10-01" })], today: "2026-10-14" }).filter((r) => r.src === "chain").length, 0);

/* output */
const js = toJs(rows.slice(0, 1), "2026-10-14");
eq("label", js.split("\n")[0], 'window.HRT_KAMAAINA_UPDATED="October 14, 2026";');
eq("no em dash in output", /—/.test(js), false);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
