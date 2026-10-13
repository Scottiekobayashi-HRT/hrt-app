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
ok('catalog has the 11 cards', CAT.cards.length === 11);
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
ok('catalog has the 51 perks', CAT.benefits.length === 51, CAT.benefits.length);

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
ok('catalog has 62 earning rates and 2 quarters', CAT.earning.length === 62 && CAT.quarterly.length === 2, CAT.earning.length + '/' + CAT.quarterly.length);
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

// --- house style ---
const src = fs.readFileSync('./assets/wallet.js', 'utf8') + fs.readFileSync('./data/wallet-catalog.js', 'utf8');
ok('no em or en dashes in member-facing code', !/[–—]/.test(src.replace(/\\u201[34]/g, '')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
