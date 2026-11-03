import { build, stampRows, readDeal, islandKey, groupFor, scoreFor, ratingFor, parseCsv, toJs, stripHtml, daysLeft, parseOfferPage } from "./build.mjs";

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

/* honest numbers: "up to", upgrade-only percents, minimum nights */
const ritzT = "Kamaʻāina Staycation: Waived Resort Fee, Self-Parking & Up to 15% off Dining, Spa, Retail and More";
const ritz = readDeal(ritzT + ". A quick trip to the North Shore offers the perfect escape for Hawaiʻi Residents to experience the best of our island home. On stays of 2 nights or more, enjoy a special Kama‘āina Rate starting at $519 in 2026 and $539 in 2027, plus up to 40% savings when upgrading to a Premium Room, Suite, or Bungalow.", true, ritzT);
eq("ritz: upgrade 40% is not the room discount", ritz.p, 0);
eq("ritz: upgrade 40% kept separately", ritz.pc, 40);
eq("ritz: rate from", ritz.v, 519);
eq("ritz: 2 night minimum", ritz.mn, 2);
eq("ritz: discounted upgrade is not a free upgrade", ritz.k.includes("Room upgrade"), false);
eq("up to is kept", readDeal("Kamaʻāina save up to 40%. Nestled against Puʻu Kekaʻa", true, "Kamaʻāina save up to 40%").pu, 1);
eq("flat is flat", readDeal("Enjoy 25% off our Best Available Rate", true).pu, 0);
const ast = readDeal("Enjoy 30% off room rates, No Amenity Fees. includes: 20-30% off room rates* No amenity fees", true, "Enjoy 30% off room rates, No Amenity Fees");
eq("range in body makes headline up to", [ast.p, ast.pu], [30, 1]);
const hap = readDeal("Resort View Rooms from $299 per night plus tax. Higher room categories up to 50% off", true, "Kamaʻāina Starting $299");
eq("higher category percent is not the room discount", [hap.p, hap.pc, hap.v], [0, 50, 299]);
eq("aulani select + min nights", (({ p, pu, mn, sel }) => [p, pu, mn, sel])(readDeal("Save up to 35% on select rooms and villas for stays of 2 or more nights", true)), [35, 1, 2, 1]);
eq("parking price is not a room price", readDeal("Up to 30% off published rates One Time $50 Resort Credit Discounted Valet Parking $30 per night", true).v, null);
eq("activities count for tour businesses", readDeal("Kama‘āina Discount, 10% Discount on Activities", false).p, 10);
eq("$199 rates", readDeal("Use promo code HWN to unlock our $199 Kamaʻāina rates", true).v, 199);
eq("up to scores lower than flat", scoreFor({ p: 40, pu: 1, a: 0, k: [], v: null, g: "Stays" }) < scoreFor({ p: 40, pu: 0, a: 0, k: [], v: null, g: "Stays" }), true);

/* offer page parsing */
const html = '<script>var data = {"recid":"2856","title":"Enjoy up to 10% off room rate","description":"<p>Up to 10% off room rates</p>","offerlink":"https://www.aquaaston.com/x","categories":[{"categoryid":7}],"udfs_object":{"2724":{"valuearray":[{"listid":5626,"value":"Oʻahu"}]},"3915":{"value":"Accommodations - Oʻahu"},"2703":{"value":"Rates plus tax. {braces} \\"quoted\\""}},"listings":[{"title":"Aston at the Executive Centre Hotel","city":"Honolulu","region":"Oʻahu","latitude":21.30932,"longitude":-157.86,"primary_category":{"catname":"Accommodations"}}]};</script>' +
  '<script type="application/ld+json">{"validFrom":"2026-09-28","priceValidUntil":"2027-09-27"}</script>';
const o = parseOfferPage(html);
eq("parsed id", o.recid, "2856");
eq("parsed until", o._validUntil, "2027-09-27");
eq("braces in strings", o.udfs_object["2703"].value, 'Rates plus tax. {braces} "quoted"');

/* build */
const many = Array.from({ length: 40 }, (_, i) => Object.assign(JSON.parse(JSON.stringify(o)), { title: "Offer " + i, _path: "/coupon/offer-" + i + "/28" + i + "/" }));
const rows = build({ hvcb: many, prevList: [{ b: "Aston at the Executive Centre Hotel", t: "Offer 1", h: "Waikīkī", m: "Aqua-Aston" }], today: "2026-10-14" });
eq("count", rows.length, 40);
const r1 = rows.find((r) => r.t === "Offer 1");
eq("kept old area", r1.h, "Waikīkī");
eq("old is not new", r1.n, 0);
eq("others are new", rows.find((r) => r.t === "Offer 2").n, 1);
eq("island", r1.i, ["oahu"]);
eq("group", r1.g, "Stays");
eq("link", r1.u, "https://www.aquaaston.com/x");
eq("hvcb coupon page", r1.c, "https://www.hvcb.org/coupon/offer-1/281/");
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
const upSheet = parseCsv('approved,island,business,title,description,terms,category,percent_off,perks,nightly_from,ends,link,program\nyes,Oʻahu,Hilton Garden Inn Waikiki Beach,Resident Rate,Up to 25% off the Best Available Rate,,Accommodations,25,,,2026-12-31,https://www.hilton.com/z,\n');
eq("sheet percent keeps up to", build({ hvcb: many, sheetRows: upSheet, today: "2026-10-14" }).find((r) => r.src === "chain").pu, 1);
eq("expired dropped", build({ hvcb: many, sheetRows: [Object.assign({}, sheet[0], { ends: "2026-10-01" })], today: "2026-10-14" }).filter((r) => r.src === "chain").length, 0);

/* output */
const js = toJs(rows.slice(0, 1), "2026-10-14");
eq("label", js.split("\n")[0].split(";")[0], 'window.HRT_KAMAAINA_UPDATED="October 14, 2026"');
eq("stamp on line 1", /^window\.HRT_KAMAAINA_UPDATED=.*;window\.HRT_KAMAAINA_STAMP="\d{4}-\d\d-\d\dT/.test(js.split("\n")[0]), true);

/* freshness: first seen, updated, replaced offers */
const yest = [
  { b: "Hotel A", t: "20% off", d: "x", f: "", p: 20, a: 0, k: [], v: null, e: "2027-01-01", fs: "2026-10-01", us: "" },
  { b: "Hotel B", t: "Save 30%", d: "y", f: "", p: 30, a: 0, k: [], v: null, e: "2027-01-01", fs: "", us: "" },
  { b: "Hotel C", t: "Old offer", d: "z", f: "", p: 10, a: 0, k: [], v: null, e: "2027-01-01", fs: "2026-09-30", us: "" },
  { b: "Hotel D", t: "Same", d: "q", f: "", p: 15, a: 0, k: [], v: null, e: "2027-01-01", fs: "2026-10-20", us: "2026-10-22" }
];
const todayRows = [
  Object.assign({}, yest[0]),
  Object.assign({}, yest[1], { p: 35 }),
  { b: "Hotel C", t: "New offer", d: "z2", f: "", p: 25, a: 0, k: [], v: null, e: "2027-01-01" },
  Object.assign({}, yest[3]),
  { b: "Hotel E", t: "Brand new", d: "n", f: "", p: 40, a: 0, k: [], v: null, e: "2027-01-01" }
];
const st = stampRows(todayRows.map((r) => Object.assign({}, r)), yest, "2026-10-27");
eq("unchanged keeps dates", [st[0].fs, st[0].us, st[0].n], ["2026-10-01", "", 0]);
eq("changed terms = updated", [st[1].fs, st[1].us, st[1].n], ["", "2026-10-27", 0]);
eq("replaced offer = updated", [st[2].fs, st[2].us], ["2026-09-30", "2026-10-27"]);
eq("keeps old update date", [st[3].us, st[3].n], ["2026-10-22", 0]);
eq("brand new", [st[4].fs, st[4].us, st[4].n], ["2026-10-27", "", 1]);
eq("new for a week", stampRows([Object.assign({}, st[4])], [st[4]], "2026-11-02")[0].n, 1);
eq("no previous list marks nothing new", stampRows([{ b: "X", t: "Y" }], [], "2026-10-27")[0].n, 0);
eq("then not new", stampRows([Object.assign({}, st[4])], [st[4]], "2026-11-03")[0].n, 0);
eq("no em dash in output", /—/.test(js), false);

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
