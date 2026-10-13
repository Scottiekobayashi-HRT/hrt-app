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

// --- house style ---
const src = fs.readFileSync('./assets/wallet.js', 'utf8') + fs.readFileSync('./data/wallet-catalog.js', 'utf8');
ok('no em or en dashes in member-facing code', !/[–—]/.test(src.replace(/\\u201[34]/g, '')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
