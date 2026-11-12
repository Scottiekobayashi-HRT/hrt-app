/* node assets/atmos-try.test.mjs  (run from hrt-app/hrt-app) */
import fs from 'fs';
global.window = {}; global.document = { readyState: 'complete', getElementById: () => null };
eval(fs.readFileSync('./assets/atmos-try.js', 'utf8'));
const T = window.HRT_ATMOS_TRY._test;
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.log('FAIL', n)); };
const feed = { window_days: 30, updated: '2026-11-12', economy: [
  { origin: 'HNL', dest: 'HND', dates: [{ date: '2026-11-11', miles: 30000 }, { date: '2026-11-12', miles: 35000, seats: 4, nonstop: true }, { date: '2026-11-20', miles: 30000 }, { date: '2026-12-11', miles: 30000 }, { date: '2026-12-12', miles: 30000 }] },
  { origin: 'HNL', dest: 'LAX', dates: [{ date: '2026-11-13', miles: 12500 }] }] };
const d = T.build(feed, T.ROUTE, '2026-11-12');
ok('window ends 29 days later', d.end === '2026-12-11');
ok('past and out-of-window dates dropped', !d.days['2026-11-11'] && !d.days['2026-12-12'] && d.count === 3);
ok('lowest price is great, others decent', d.days['2026-11-20'].tier === 'great' && d.days['2026-11-12'].tier === 'decent');
ok('only the HND route used', d.min === 30000);
ok('months: Nov, Dec plus one locked', JSON.stringify(d.months) === JSON.stringify([[2026, 11], [2026, 12], [2027, 1]]));
ok('addDays crosses the year', T.addDays('2026-12-20', 15) === '2027-01-04');
ok('no route data gives 0 days', T.build({ economy: [] }, T.ROUTE, '2026-11-12').count === 0);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
