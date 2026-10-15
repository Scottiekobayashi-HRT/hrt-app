/* node assets/wallet.test.mjs  (run from hrt-app/hrt-app) */
import fs from 'fs';
global.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };
global.window = {};
eval(fs.readFileSync('./assets/wallet.js', 'utf8'));
eval(fs.readFileSync('./data/wallet-catalog.js', 'utf8'));
const T = global.window.HRT_WALLET._test, CAT = global.window.HRT_WALLET_CATALOG;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + x)); };
const day = (y, m, d) => ({ y, m, d });
const at = (r) => r ? `${r.y}-${r.m}-${r.d}/${r.days}` : 'null';
const TODAY = day(2026, 10, 13);

// --- full dates ---
let r = T.nextRenewal('2024-03-15', TODAY);
ok('Mar 15 opener renews Mar 15 2027', r.y === 2027 && r.m === 3 && r.d === 15 && r.exact, at(r));
ok('Mar 15 2027 is 153 days from Oct 13 2026', r.days === 153, r.days);
r = T.nextRenewal('2020-12-01', TODAY);
ok('Dec 1 opener renews this year', r.y === 2026 && r.m === 12 && r.d === 1 && r.days === 49, at(r));
r = T.nextRenewal('2019-10-13', TODAY);
ok('anniversary today shows today', r.y === 2026 && r.days === 0, at(r));
r = T.nextRenewal('2019-10-12', TODAY);
ok('anniversary yesterday rolls to next year', r.y === 2027 && r.days === 364, at(r));

// --- first year: never renews on the opening day ---
r = T.nextRenewal('2026-10-13', TODAY);
ok('opened today renews in a year', r.y === 2027 && r.m === 10 && r.d === 13, at(r));
r = T.nextRenewal('2026-02-01', TODAY);
ok('opened earlier this year renews next year', r.y === 2027 && r.m === 2, at(r));
r = T.nextRenewal('2025-11-20', TODAY);
ok('opened last Nov renews this Nov', r.y === 2026 && r.m === 11 && r.d === 20 && r.days === 38, at(r));

// --- leap day ---
r = T.nextRenewal('2024-02-29', TODAY);
ok('Feb 29 opener renews Feb 28 2027', r.y === 2027 && r.m === 2 && r.d === 28, at(r));
r = T.nextRenewal('2024-02-29', day(2027, 3, 1));
ok('Feb 29 opener renews Feb 29 2028 in a leap year', r.y === 2028 && r.d === 29, at(r));
r = T.nextRenewal('2024-02-29', day(2027, 2, 28));
ok('Feb 29 opener on Feb 28 2027 is today', r.y === 2027 && r.days === 0, at(r));

// --- year end ---
r = T.nextRenewal('2021-01-02', day(2026, 12, 31));
ok('across New Year counts 2 days', r.y === 2027 && r.days === 2, at(r));

// --- month only ---
r = T.nextRenewal('2023-07', TODAY);
ok('month-only July renews July 2027, no day', r.y === 2027 && r.m === 7 && r.d === null && !r.exact, at(r));
r = T.nextRenewal('2023-10', TODAY);
ok('month-only this month is this month', r.y === 2026 && r.m === 10 && T.whenText(r) === 'This month', at(r) + ' ' + T.whenText(r));
r = T.nextRenewal('2026-03', TODAY);
ok('month-only opened this year renews next year', r.y === 2027 && r.m === 3, at(r));
ok('month-only text names the month', T.renewalText(T.nextRenewal('2023-07', TODAY)) === 'July 2027');

// --- input checks ---
ok('rejects month 13', T.parseOpened('2024-13') === null);
ok('rejects Feb 30', T.parseOpened('2024-02-30') === null);
ok('rejects Feb 29 in a non-leap year', T.parseOpened('2025-02-29') === null);
ok('future date caught', T.isFuture('2026-10-14', TODAY) && T.isFuture('2026-11', TODAY));
ok('today is not future', !T.isFuture('2026-10-13', TODAY) && !T.isFuture('2026-10', TODAY));

// --- wording ---
ok('tomorrow', T.whenText({ exact: true, days: 1 }) === 'Tomorrow');
ok('in 45 days', T.whenText({ exact: true, days: 45 }) === 'In 45 days');
ok('far out in months', T.whenText({ exact: true, days: 153 }) === 'In about 5 months');
ok('money formats thousands', T.money(1290) === '$1,290' && T.money(12.95) === '$12.95');

// --- summary against the real catalog ---
ok('catalog has at least the original 11 cards', CAT.cards.length >= 11);
const wallet = { v: 1, points: [], cards: [
  { id: 'a', cardId: 'amex-platinum', opened: '2024-03-15' },
  { id: 'b', cardId: 'chase-freedom-unlimited', opened: '2019-05-01' },
  { id: 'c', cardId: 'capone-venture-x', opened: '2022-11-02' },
  { id: 'd', cardId: 'retired-card', opened: '2020-01-01' },
  { id: 'e', cardId: 'atmos-ascent', opened: '2018-06' }
]};
const s = T.summarize(wallet, CAT, TODAY);
ok('yearly fees add up: 895 + 395 + 95', s.yearly === 1385, s.yearly);
ok('soonest fee first: Venture X Nov 2', s.rows[0].entry.id === 'c' && s.next.entry.id === 'c', s.rows.map(x => x.entry.id).join());
ok('order is c, a, e then no-fee then unknown', s.rows.map(x => x.entry.id).join() === 'c,a,e,b,d', s.rows.map(x => x.entry.id).join());
ok('one renewal inside 45 days', s.soon === 1, s.soon);
ok('a card missing from the catalog is kept, not crashed on', s.rows.find(x => x.entry.id === 'd').card === null);
ok('empty wallet summary', T.summarize({ v: 1, cards: [], points: [] }, CAT, TODAY).yearly === 0);

// ============ PERKS ============
const P = (card, id) => CAT.benefits.find(b => b.card === card && b.id === id);
const pp = (card, id, opened, today = TODAY) => T.perkPeriod(P(card, id), opened, today);
const end = p => p ? `${p.end.y}-${p.end.m}-${p.end.d}` : 'null';
ok('catalog has at least the original 51 perks', CAT.benefits.length >= 51, CAT.benefits.length);

let p = pp('amex-platinum', 'uber', '2024-03-15');
ok('monthly: Oct 2026, ends Oct 31, 18 days', p.key === '2026-10' && end(p) === '2026-10-31' && p.days === 18 && !p.assumed, p.key + ' ' + end(p) + ' ' + p.days);
p = pp('amex-platinum', 'resy', '2024-03-15');
ok('quarterly: Q4 ends Dec 31', p.key === '2026-Q4' && end(p) === '2026-12-31' && p.days === 79 && p.name === 'This quarter (Oct to Dec)', p.key + ' ' + p.name);
p = pp('amex-gold', 'resy', '2024-03-15');
ok('semiannual: Jul to Dec', p.key === '2026-H2' && end(p) === '2026-12-31');
p = pp('amex-gold', 'resy', '2024-03-15', day(2026, 6, 30));
ok('semiannual: Jun 30 is the last day of H1', p.key === '2026-H1' && p.days === 0);
p = pp('amex-gold', 'dining', '2024-03-15');
ok('unclear reset is flagged as assumed', p.assumed === true && p.key === '2026-10');
p = pp('amex-platinum', 'equinox', '2024-03-15');
ok('calendar annual: ends Dec 31', p.key === '2026' && end(p) === '2026-12-31');

// anniversary-based credits
p = pp('chase-sapphire-preferred', 'hotel', '2024-03-15');
ok('CSP hotel: card year A2026 ends Mar 14 2027', p.key === 'A2026' && end(p) === '2027-3-14' && !p.approx, p.key + ' ' + end(p));
p = pp('chase-sapphire-preferred', 'hotel', '2024-03-15', day(2027, 3, 14));
ok('day before anniversary is the last day', p.key === 'A2026' && p.days === 0);
p = pp('chase-sapphire-preferred', 'hotel', '2024-03-15', day(2027, 3, 15));
ok('on the anniversary a new card year starts', p.key === 'A2027' && end(p) === '2028-3-14', p.key + ' ' + end(p));
p = pp('capone-venture-x', 'travel', '2023-07');
ok('month-only open date: safe deadline Jun 30, flagged approx', p.key === 'A2026' && end(p) === '2027-6-30' && p.approx, p.key + ' ' + end(p));
p = pp('capone-venture-x', 'travel', '2026-05-01');
ok('first card year runs to the first anniversary', p.key === 'A2026' && end(p) === '2027-4-30', p.key + ' ' + end(p));
p = pp('chase-sapphire-preferred', 'hotel', '2024-02-29', day(2027, 1, 10));
ok('Feb 29 opener: card year ends Feb 27 2027', end(p) === '2027-2-27', end(p));

// Freedom Flex rotating: activation deadline is the 14th
p = pp('chase-freedom-flex', 'rotating', '2020-01-01');
ok('rotating 5%: activate by Dec 14', p.activateBy && end(p) === '2026-12-14' && p.days === 62, end(p) + ' ' + p.days);
p = pp('chase-freedom-flex', 'rotating', '2020-01-01', day(2026, 12, 15));
ok('rotating 5%: after the 14th the deadline has passed', p.days === -1);

// year boundary
p = pp('amex-platinum', 'resy', '2024-03-15', day(2027, 1, 1));
ok('Jan 1 starts Q1 2027', p.key === '2027-Q1' && end(p) === '2027-3-31');

// not tracked
ok('Global Entry is info only', pp('amex-platinum', 'globalentry', '2024-03-15') === null);
ok('per event is info only', pp('atmos-summit', 'delaycredit', '2024-03-15') === null);
ok('per purchase is info only', pp('atmos-ascent', 'inflight', '2024-03-15') === null);
ok('anniversary miles are not ticked', pp('capone-venture-x', 'annivmiles', '2024-03-15') === null);

// wording
ok('amount: $15 a month', T.perkAmount(P('amex-platinum', 'uber')) === '$15 a month');
ok('amount: 2 passes a quarter', T.perkAmount(P('atmos-summit', 'lounge')) === '2 passes a quarter');
ok('amount: 10,000 points a year', T.perkAmount(P('capone-venture-x', 'annivmiles')) === '10,000 points a year');
ok('amount: none for 20% inflight', T.perkAmount(P('atmos-ascent', 'inflight')) === '');
ok('amount: $12.95 a month', T.perkAmount(P('amex-platinum', 'walmart')) === '$12.95 a month');

// rows, value, expiring soon
const w2 = { v: 1, points: [], cards: [
  { id: 'p', cardId: 'amex-platinum', opened: '2024-03-15', used: { uber: { '2026-10': true } } },
  { id: 'x', cardId: 'capone-venture-x', opened: '2022-11-02' },
  { id: 'f', cardId: 'chase-freedom-flex', opened: '2020-01-01' }
]};
const rows = T.perkRows(w2, CAT, TODAY);
const plat = rows.filter(r => r.entry.id === 'p');
const platUsd = plat.reduce((s, r) => s + T.perkYearUsd(r.perk), 0);
ok('Platinum credits add to $3,004.40 a year', Math.abs(platUsd - 3004.4) < 0.001, platUsd);
ok('ticked Uber shows as used this month', rows.find(r => r.entry.id === 'p' && r.perk.id === 'uber').used === true);
const soon = T.expiringSoon(rows, 31);
const ids = soon.map(r => r.entry.id + ':' + r.perk.id);
ok('used Uber is not in expiring soon', !ids.includes('p:uber'), ids.join());
ok('Venture X travel credit (ends Nov 1) is in expiring soon', ids.includes('x:travel'), ids.join());
ok('monthly credits are in expiring soon', ids.includes('p:digital') && ids.includes('p:walmart'));
ok('Q4 credits are not (79 days out)', !ids.includes('p:resy'));
ok('soonest first: Oct 31 before Nov 1', soon[0].period.days === 18 && soon[soon.length - 1].perk.id === 'travel', soon.map(r=>r.period.days).join());
const vx = rows.find(r => r.entry.id === 'x' && r.perk.id === 'annivmiles');
ok('anniversary miles show the next date', vx.nextArrives && vx.nextArrives.y === 2026 && vx.nextArrives.m === 11 && vx.nextArrives.d === 2);

// pruning
const e = { used: { a: { '2024-03': true, '2025-12': true, '2026-Q4': true }, b: { A2024: true }, c: { A2025: true } } };
T.pruneUsed(e, TODAY);
ok('prune keeps this year and last', JSON.stringify(e.used) === JSON.stringify({ a: { '2025-12': true, '2026-Q4': true }, c: { A2025: true } }), JSON.stringify(e.used));

// ============ EARNING ============
ok('catalog has at least 62 earning rates and 2 quarters', CAT.earning.length >= 62 && CAT.quarterly.length >= 2, CAT.earning.length + '/' + CAT.quarterly.length);
const E = (card, cat) => CAT.earning.find(e => e.card === card && e.category === cat);
ok('points show as 4x', T.rateText(E('amex-gold', 'Restaurants worldwide')) === '4x');
ok('cash back shows as 1.5%', T.rateText(E('chase-freedom-unlimited', 'Everything else')) === '1.5%');
ok('status 0.5 shows 1 per $2', T.rateText(E('atmos-summit', 'Status points on all purchases')) === '1 per $2');
ok('status 0.3333 shows 1 per $3', T.rateText(E('atmos-ascent', 'Status points on all purchases')) === '1 per $3');
ok('10x Venture X hotels', T.rateText(E('capone-venture-x', 'Hotels and rental cars')) === '10x');
ok('empty cap words removed', E('chase-sapphire-preferred', 'Dining').cap === '' && E('atmos-summit', 'Dining').via === '');
const sum = T.earningFor(CAT, 'atmos-summit').map(e => e.category);
ok('bonus categories first, everything else then status last', sum[sum.length - 1].startsWith('Status') && sum[sum.length - 2] === 'Everything else', sum.join(' | '));
ok('every card has an everything-else rate', CAT.cards.every(c => CAT.earning.some(e => e.card === c.id && e.groups.includes('everyday'))));
let qs = T.quartersFor(CAT, 'chase-freedom-flex', TODAY);
ok('Oct 2026: current Q4, next Q1 2027', qs.current.quarter === '2026-Q4' && qs.next.quarter === '2027-Q1');
ok('Q4 deadline Dec 14, Q1 deadline not announced', qs.current.deadline === '2026-12-14' && qs.next.deadline === '');
qs = T.quartersFor(CAT, 'chase-freedom-flex', day(2027, 4, 2));
ok('Apr 2027 with no data: nothing shown, nothing invented', qs.current === null && qs.next === null);
ok('quarter names', T.quarterName('2026-Q4') === 'Oct to Dec 2026' && T.quarterName('2027-Q1') === 'Jan to Mar 2027');
ok('other cards have no quarters', T.quartersFor(CAT, 'amex-gold', TODAY).current === null);

// ============ DASHBOARD TILES ============
const names = Object.fromEntries(CAT.cards.map(c => [c.id, T.shortName(c.name)]));
ok('short names read naturally', names['amex-platinum'] === 'Amex Platinum' && names['amex-gold'] === 'Amex Gold' &&
  names['amex-business-platinum'] === 'Amex Business Platinum' && names['amex-business-gold'] === 'Amex Business Gold' &&
  names['atmos-summit'] === 'Atmos Summit' && names['atmos-ascent'] === 'Atmos Ascent' && names['capone-venture'] === 'Venture' &&
  names['capone-venture-x'] === 'Venture X' && names['chase-sapphire-preferred'] === 'Sapphire Preferred' &&
  names['chase-freedom-flex'] === 'Freedom Flex' && names['chase-freedom-unlimited'] === 'Freedom Unlimited', JSON.stringify(names));
const wb = { v: 1, points: [], cards: [
  { id: 'p', cardId: 'amex-platinum', opened: '2024-03-15', used: { uber: { '2026-10': true } } },
  { id: 'x', cardId: 'capone-venture-x', opened: '2022-11-02' },
  { id: 'f', cardId: 'chase-freedom-flex', opened: '2020-01-01' }
]};
const rowsB = T.perkRows(wb, CAT, TODAY);
const card = id => CAT.cards.find(c => c.id === id);
let bf = T.cardBrief(wb.cards[0], card('amex-platinum'), rowsB, TODAY);
ok('Platinum brief: next is an Oct 31 credit, not the ticked Uber', bf.next && bf.next.period.days === 18 && bf.next.perk.id !== 'uber', bf.next && bf.next.perk.id);
ok('Platinum brief: renews Mar 15, not soon', bf.hasFee && bf.renewal.m === 3 && !bf.renewSoon);
bf = T.cardBrief(wb.cards[1], card('capone-venture-x'), rowsB, TODAY);
ok('Venture X brief: renews in 20 days, $300 travel credit next', bf.renewSoon && bf.renewal.days === 20 && bf.next.perk.id === 'travel');
bf = T.cardBrief(wb.cards[2], card('chase-freedom-flex'), rowsB, TODAY);
ok('Freedom Flex brief: activation flagged separately, no fee', bf.activate && bf.activate.perk.id === 'rotating' && !bf.hasFee && bf.next.perk.id === 'doordash');

// ============ NEEDS YOUR ATTENTION ============
const wa = { v: 1, points: [], cards: [
  { id: 'p', cardId: 'amex-platinum', opened: '2024-03-15' },
  { id: 'x', cardId: 'capone-venture-x', opened: '2022-11-02' },
  { id: 'f', cardId: 'chase-freedom-flex', opened: '2020-01-01' }
]};
let al = T.topAlerts(wa, CAT, TODAY);
ok('Oct 13: nothing within 7 days, so renewal first', al[0].text === 'Venture X renews in 20 days, $395 fee' && al[0].id === 'x', JSON.stringify(al));
ok('Oct 13: month total last', al[al.length - 1].level === 'info' && /in credits to use/.test(al[al.length - 1].text), JSON.stringify(al));
ok('Oct 13: Freedom Flex activation is 62 days out, not shown', !al.some(a => /Activate/.test(a.text)));
al = T.topAlerts(wa, CAT, day(2026, 10, 27));
ok('Oct 27: credits expiring this week come first, summed', al[0].level === 'hot' && /^\$\d.* in credits expire within 5 days$/.test(al[0].text), al[0].text);
ok('Oct 27: never more than 3', al.length <= 3);
al = T.topAlerts(wa, CAT, day(2026, 11, 20));
ok('Nov 20: activation due in 24 days is flagged', al.some(a => a.text === 'Activate Freedom Flex 5% by Dec 14'), JSON.stringify(al));
const one = { v: 1, points: [], cards: [{ id: 'x', cardId: 'capone-venture-x', opened: '2022-11-02' }] };
al = T.topAlerts(one, CAT, day(2026, 10, 30));
ok('one credit about to go: named exactly', al[0].text === 'Venture X Capital One Travel Credit $300 expires in 2 days' && al[0].id === 'x', al[0].text);
const done = { v: 1, points: [], cards: [{ id: 'u', cardId: 'chase-freedom-unlimited', opened: '2019-05-01', used: { doordash: { '2026-Q4': true } } }] };
ok('nothing urgent: empty, so the strip hides', T.topAlerts(done, CAT, TODAY).length === 0, JSON.stringify(T.topAlerts(done, CAT, TODAY)));

// ============ WHICH CARD SHOULD I USE ============
const VALS = { 'Amex Membership Rewards': 2.0, 'Chase Ultimate Rewards': 2.05, 'Capital One Miles': 1.85, 'Alaska Atmos Rewards': 1.4 };
const W = (ids, extra = {}) => ({ v: 1, points: [], cards: ids.map(([id, cardId, opened]) => ({ id, cardId, opened, ...(extra[id] || {}) })) });
const seven = W([['g','amex-gold','2023-06-08'],['p','amex-platinum','2024-03-15'],['s','chase-sapphire-preferred','2021-11-20'],
  ['f','chase-freedom-flex','2020-01'],['x','capone-venture-x','2022-11-02'],['m','atmos-summit','2025-08-20'],['a','atmos-ascent','2019-02']]);
const wc = (w, k, d = TODAY) => T.whichCard(w, CAT, k, d, VALS);
const top = (w, k, d) => { const w1 = wc(w, k, d); return w1[0] && w1[0].card.id; };
let w1 = wc(seven, 'grocery');
ok('groceries in Q4 with a Sapphire: Freedom Flex 5% wins', w1[0].card.id === 'chase-freedom-flex' && Math.abs(w1[0].value - 10.25) < 1e-9, w1.map(x => x.card.id + ' ' + x.value).join(', '));
ok('...and says activate first by Dec 14', w1[0].notes.some(n => n === 'Activate first, by Dec 14'), JSON.stringify(w1[0].notes));
ok('...Amex Gold 4x is second', w1[1].card.id === 'amex-gold' && w1[1].value === 8);
ok('...Sapphire online grocery says it is online only', w1.find(x => x.card.id === 'chase-sapphire-preferred').notes.some(n => /^Online orders/.test(n)));
const activated = W([['g','amex-gold','2023-06-08'],['s','chase-sapphire-preferred','2021-11-20'],['f','chase-freedom-flex','2020-01']], { f: { used: { rotating: { '2026-Q4': true } } } });
ok('once activated, no activate note', !wc(activated, 'grocery')[0].notes.some(n => /Activate/.test(n)));
const noSapphire = W([['g','amex-gold','2023-06-08'],['f','chase-freedom-flex','2020-01']]);
w1 = wc(noSapphire, 'grocery');
ok('without a Sapphire, Flex counts as 5% cash back and Gold wins', w1[0].card.id === 'amex-gold' && w1[1].value === 5, w1.map(x => x.card.id + ' ' + x.value).join(', '));
ok('cash back note says 1 cent per point', w1[1].notes.includes('Cash back, 1 cent per point'));
ok('Q1 2027 groceries still on Flex, but Q2 has no data so Gold wins', top(seven, 'grocery', day(2027, 2, 1)) === 'chase-freedom-flex' && top(seven, 'grocery', day(2027, 4, 2)) === 'amex-gold');
ok('gas: Sapphire Preferred 3x', top(seven, 'gas') === 'chase-sapphire-preferred');
w1 = wc(seven, 'hotels');
ok('hotels: Venture X 10x through Capital One Travel', w1[0].card.id === 'capone-venture-x' && w1[0].rate === 10 && w1[0].notes.includes('Booked through Capital One Travel'), JSON.stringify(w1[0].notes));
ok('everything else: Venture X 2x', top(seven, 'everyday') === 'capone-venture-x');
ok('every card appears once', wc(seven, 'dining').length === 7);
const twice = W([['g1','amex-gold','2023-06-08'],['g2','amex-gold','2020-01-01']]);
ok('two of the same card listed once', wc(twice, 'dining').length === 1);
ok('status and promo rows never win', !wc(seven, 'transit').some(x => x.row.groups.includes('status') || x.row.groups.includes('promo')));
const biz = W([['b','amex-business-gold','2023-01-01']]);
ok('Business Gold gas warns about top 2', wc(biz, 'gas')[0].notes.some(n => /top 2/.test(n)));
ok('value text', T.valueText(10.25) === 'worth about 10.3% back' && T.valueText(8) === 'worth about 8% back');
ok('every spend type answers for the sample wallet', T.SPEND.every(sp => wc(seven, sp.key).length === 7));

// --- house style ---
// --- store search ---
const FS = q => (T.findStore(q) || {}).name;
ok('Foodland is a grocery store', T.findStore('foodland').spend === 'grocery');
ok('typing part of a name finds it', FS('food') === 'Foodland' && FS('cost') === 'Costco');
ok('name then branch still matches', FS('Foodland Kapolei') === 'Foodland' && FS('longs drugs waipahu') === 'Longs Drugs');
ok('Hawaiian Electric is not Hawaiian Airlines', FS('hawaiian electric') === 'Hawaiian Electric' && FS('hawaiian') === 'Hawaiian Airlines');
ok('Uber Eats is dining, Uber is a ride', T.findStore('uber eats').spend === 'dining' && T.findStore('uber').spend === 'transit');
ok("apostrophes and ampersands are ignored", FS("Zippy's") === "Zippy's" && FS('L&L') === 'L&L Hawaiian Barbecue');
ok('Hawaii Gas is a bill, not a gas station', T.findStore('hawaii gas').spend === 'everyday');
ok('unknown store finds nothing', T.findStore('zzqx shop') === null && T.findStore('a') === null);
ok('every store points at a real spend type', T.STORES.every(st => T.SPEND.some(x => x.key === st.spend)));
const costcoW = { v: 1, points: [], cards: [{ id: 'g', cardId: 'amex-gold', opened: '2023-06-08' }, { id: 'vx', cardId: 'capone-venture-x', opened: '2022-11-02' }] };
const cw = T.whichCard(costcoW, CAT, 'everyday', null, null, { visaOnly: true });
ok('Costco leaves out cards that are not Visa', cw.length === 1 && cw[0].card.id === 'capone-venture-x');
ok('no Visa at Costco gives an empty list', T.whichCard({ v: 1, points: [], cards: [costcoW.cards[0]] }, CAT, 'everyday', null, null, { visaOnly: true }).length === 0);

// --- Sapphire Reserve in the catalog ---
const CSR = CAT.cards.find(c => c.id === 'chase-sapphire-reserve');
ok('Sapphire Reserve is in the catalog with its fee and art', CSR && CSR.fee === 795 && /^https:/.test(CSR.art));
ok('Reserve $300 travel credit resets on the anniversary', P('chase-sapphire-reserve', 'travel').resets === 'anniversary');
const csrW = { v: 1, points: [], cards: [{ id: 'r', cardId: 'chase-sapphire-reserve', opened: '2024-05-01' }] };
ok('Reserve wins dining at 3x', T.whichCard(csrW, CAT, 'dining')[0].rate === 3);

// --- keep or cancel ---
const oct13 = { y: 2026, m: 10, d: 13 };
ok('card year starts on the last anniversary', JSON.stringify(T.cardYearStart('2022-11-02', oct13)) === '{"y":2025,"m":11,"d":2}');
ok('card year of a new card starts on its open date', JSON.stringify(T.cardYearStart('2026-09-03', oct13)) === '{"y":2026,"m":9,"d":3}');
const vxE = { id: 'vx', cardId: 'capone-venture-x', opened: '2022-11-02', used: { travel: { A2025: true } } };
const u1 = T.usedThisCardYear(vxE, CAT, oct13);
ok('a ticked anniversary credit counts in full', u1.used === 300, JSON.stringify(u1));
ok('last card year does not count', T.usedThisCardYear({ ...vxE, used: { travel: { A2024: true } } }, CAT, oct13).used === 0);
const platE = { id: 'p', cardId: 'amex-platinum', opened: '2024-03-15', used: { uber: { '2026-04': true, '2026-05': 7, '2026-02': true }, resy: { '2026-Q1': true } } };
const u2 = T.usedThisCardYear(platE, CAT, oct13);
ok('monthly ticks and partial amounts add up within the card year', u2.used === 15 + 7 + 100, JSON.stringify(u2));
ok('nothing ticked means nothing used', T.usedThisCardYear({ id: 'x', cardId: 'amex-gold', opened: '2023-06-08' }, CAT, oct13).used === 0);

// --- welcome bonus ---
const bE = { id: 'b', cardId: 'chase-sapphire-reserve', opened: '2026-09-03', bonus: { spend: 6000, months: 3, spent: 2350, reward: '100,000 points' } };
const b1 = T.bonusState(bE, oct13);
ok('bonus deadline is open date plus the months', JSON.stringify(b1.by) === '{"y":2026,"m":12,"d":3}' && b1.days === 51 && !b1.approx);
ok('bonus shows what is left', b1.left === 3650 && b1.pct === 39 && !b1.met && !b1.missed);
ok('month-only open date uses the earliest deadline', JSON.stringify(T.bonusState({ ...bE, opened: '2026-09' }, oct13).by) === '{"y":2026,"m":11,"d":30}');
ok('deadline in the next year rolls over', JSON.stringify(T.bonusState({ ...bE, opened: '2026-11-30' }, oct13).by) === '{"y":2027,"m":2,"d":28}');
ok('spend reached is met', T.bonusState({ ...bE, bonus: { ...bE.bonus, spent: 6000 } }, oct13).met);
ok('deadline passed is missed', T.bonusState({ ...bE, opened: '2026-05-01' }, oct13).missed);
ok('no bonus, no state', T.bonusState({ ...bE, bonus: undefined }, oct13) === null);
const bAl = T.topAlerts({ v: 1, points: [], cards: [{ ...bE, opened: '2026-07-20' }] }, CAT, oct13);
ok("bonus due within 30 days is an alert", bAl.some(a => /Spend \$3,650 more on Sapphire Reserve by Oct 20/.test(a.text) && a.level === 'hot'), JSON.stringify(bAl));
const ex = T.exampleWallet();
ok('example wallet has a Reserve with a bonus in progress', ex.cards.some(c => c.cardId === 'chase-sapphire-reserve' && c.bonus && !T.bonusState(c).met));

// --- credits to use: quarterly and yearly credits are never hidden ---
const platOnly = { v: 1, points: [], cards: [{ id: 'p', cardId: 'amex-platinum', opened: '2024-03-15' }] };
const cg = T.creditGroups(T.perkRows(platOnly, CAT, { y: 2026, m: 10, d: 13 }), { y: 2026, m: 10, d: 13 });
ok('groups are next 31 days, by Dec 31, later', cg.map(g => g.key).join() === 'soon,quarter', cg.map(g => g.key).join());
ok('Resy and lululemon quarterly credits show by Dec 31', ['resy', 'lululemon'].every(id => cg[1].rows.some(r => r.perk.id === id)));
ok('the quarter group has a label with its end date', cg[1].label === 'By Dec 31');
ok('used credits are left out of every group', !T.creditGroups(T.perkRows({ v: 1, points: [], cards: [{ ...platOnly.cards[0], used: { resy: { '2026-Q4': true } } }] }, CAT, { y: 2026, m: 10, d: 13 }), { y: 2026, m: 10, d: 13 }).some(g => g.rows.some(r => r.perk.id === 'resy')));
const vxOnly = { v: 1, points: [], cards: [{ id: 'v', cardId: 'capone-venture-x', opened: '2022-03-02' }] };
const cg2 = T.creditGroups(T.perkRows(vxOnly, CAT, { y: 2026, m: 10, d: 13 }), { y: 2026, m: 10, d: 13 });
ok('a credit ending next year is under Later', cg2.some(g => g.key === 'later' && g.rows.some(r => r.perk.id === 'travel')));

// --- card art ---
ok('card art links are https only', CAT.cards.every(c => !c.art || /^https:\/\/[^\s"'<>()\\]+$/.test(c.art)));
const artA = T.artHtml({ issuer: 'Chase', name: 'X', art: 'https://img.example/a.png?x=1&y=2' }, 'sm');
ok('card with art shows the image over a plain card', /<img src="https:\/\/img\.example\/a\.png\?x=1&amp;y=2"/.test(artA) && artA.includes('wl-art-ph'));
const artB = T.artHtml({ issuer: 'Capital One', name: 'Y' }, 'md');
ok('card without art shows a plain card in the issuer colour', !artB.includes('<img') && artB.includes('CAPITAL ONE') && artB.includes('#c4473a'));
const src = fs.readFileSync('./assets/wallet.js', 'utf8') + fs.readFileSync('./data/wallet-catalog.js', 'utf8');
ok('no em or en dashes in member-facing code', !/[–—]/.test(src.replace(/\\u201[34]/g, '')));


// --- household fields: whose card, status, next step, other cards, planned cards ---
const hh = { v: 1, points: [], cards: [
  { id: 'a', cardId: 'chase-sapphire-preferred', opened: '2025-10-18', holder: 'Daniel', status: 'keep', note: 'One Sapphire' },
  { id: 'b', cardId: 'custom', opened: '2026-05-13', custom: { name: 'Chase Ink Business Preferred', issuer: 'Chase', fee: 95 }, holder: 'Daniel' },
  { id: 'c', cardId: 'custom', opened: '', custom: { name: 'Chase Freedom', fee: 0 }, status: 'keep' },
  { id: 'd', cardId: 'custom', opened: '2026-10-21', custom: { name: 'Atmos card' }, status: 'next' },
  { id: 'e', cardId: 'amex-gold', opened: '2024-01-05', status: 'closed' }
] };
const HS = T.summarize(hh, CAT, { y: 2026, m: 10, d: 14 });
ok('planned and closed cards are not counted', HS.count === 3 && HS.upcoming.length === 2);
ok('other card fee counts toward annual fees', HS.yearly === 95 + 95);
ok('other card gets a renewal from its open date', HS.rows.some(r => r.entry.id === 'b' && r.renewal && r.renewal.m === 5));
ok('unknown open date has no renewal and does not break next renewal', HS.next && HS.next.entry.id === 'a');
ok('closed Amex Gold credits are not listed', !T.perkRows(hh, CAT, { y: 2026, m: 10, d: 14 }).some(r => r.entry.id === 'e'));
ok('Which card ignores planned and other cards', !T.whichCard(hh, CAT, 'dining').some(x => x.entry && (x.entry.id === 'd' || x.entry.id === 'b')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
