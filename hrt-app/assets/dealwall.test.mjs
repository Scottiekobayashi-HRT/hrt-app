/* node assets/dealwall.test.mjs  (run from hrt-app/hrt-app) */
import fs from 'fs';
global.document = { readyState: 'complete', querySelector: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } };
global.window = {};
global.fetch = () => new Promise(() => {});
eval(fs.readFileSync('./assets/dealwall.js', 'utf8'));
const T = global.window.HRT_DEALWALL._test;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + x)); };

const feed = {
  window_days: 30, updated: '2026-10-15',
  economy: [
    { dest: 'LAX', city: 'Los Angeles', miles: 12500, deal_dates: 3, soonest: '2026-10-15', image: 'https://x/lax.jpg',
      dates: [{ date: '2026-10-15', miles: 12500 }, { date: '2026-10-20', miles: 12500 }, { date: '2026-10-21', miles: 12500 }] },
    { dest: 'JFK', city: 'New York-JFK', miles: 25000, deal_dates: 3, soonest: '2026-10-15', image: 'https://x/jfk.jpg',
      dates: [{ date: '2026-10-15', miles: 25000 }, { date: '2026-10-16', miles: 30000 }, { date: '2026-10-23', miles: 30000 }] },
    { dest: 'SEA', city: 'Seattle', miles: 15000, deal_dates: 1, soonest: '2026-10-15', dates: [{ date: '2026-10-15', miles: 15000 }] },
    { dest: 'LAS', city: 'Las Vegas', miles: 17500, image: 'https://x/las.jpg', dates: [{ date: '2026-10-18', miles: 17500 }] }
  ],
  premium_teasers: [{ origin: 'HNL', dest: 'MNL', city: 'Manila', cabin: 'business' }, { origin: 'HNL', dest: 'LAX', city: 'Los Angeles', cabin: 'business' }]
};

const f = T.freshen(feed, '2026-10-16');
const lax = f.economy.find((d) => d.dest === 'LAX'), jfk = f.economy.find((d) => d.dest === 'JFK');
ok('past date dropped', lax.dates.length === 2 && lax.dates[0].date === '2026-10-20');
ok('count recounted', lax.deal_dates === 2, lax.deal_dates);
ok('soonest moved forward', lax.soonest === '2026-10-20', lax.soonest);
ok('today still counts', jfk.soonest === '2026-10-16', jfk.soonest);
ok('price is the lowest left', jfk.miles === 30000, jfk.miles);
ok('city with nothing left is hidden', !f.economy.some((d) => d.dest === 'SEA'));
ok('feed itself untouched', feed.economy[0].dates.length === 3 && feed.economy[0].soonest === '2026-10-15');
ok('same day keeps everything', T.freshen(feed, '2026-10-15').economy.length === 4);

const t = T.teasersFor(feed);
ok('LAS tile added', t.some((x) => x.dest === 'LAS' && /first/.test(x.cabin)));
ok('LAS borrows the free card photo', t.find((x) => x.dest === 'LAS').image === 'https://x/las.jpg');
ok('feed tile wins over extra', t.filter((x) => x.dest === 'LAX').length === 1 && t.find((x) => x.dest === 'LAX').cabin === 'business');
ok('feed tiles first', t[0].dest === 'MNL');
ok('hawaii today format', /^\d{4}-\d\d-\d\d$/.test(T.hawaiiToday()));

/* PRO wall */
const E = T.entriesFrom(feed);
ok('free feed becomes economy entries', E.length === 4 && E.every((e) => e.cabin === 'economy'));
const P = (o) => T.cleanPrefs(o);
ok('bad prefs cleaned', JSON.stringify(P({ dests: ['LAX', 'x', 5], cabin: 'boat', max: -3, months: ['2026-1'] })) === JSON.stringify({ dests: ['LAX'], cabin: 'economy', max: 0, months: [] }));
let r = T.applyPrefs(E, P({}), '2026-10-16');
ok('defaults show every city with dates left', r.map((x) => x.dest).join() === 'LAX,JFK,LAS', r.map((x) => x.dest).join());
r = T.applyPrefs(E, P({ dests: ['LAS', 'LAX'] }), '2026-10-16');
ok('picked cities only, in picked order', r.map((x) => x.dest).join() === 'LAS,LAX');
r = T.applyPrefs(E, P({ max: 25000 }), '2026-10-16');
ok('max points drops pricier dates', !r.some((x) => x.dest === 'JFK'), r.map((x) => x.dest).join());
r = T.applyPrefs(E, P({ months: ['2026-10'] }), '2026-10-01');
ok('month filter keeps October', r.length === 4);
r = T.applyPrefs(E, P({ months: ['2026-11'] }), '2026-10-01');
ok('month with nothing gives empty', r.length === 0);
r = T.applyPrefs(E, P({ cabin: 'business' }), '2026-10-16');
ok('business with no data gives empty', r.length === 0);
const jf = T.applyPrefs(E, P({}), '2026-10-16').find((x) => x.dest === 'JFK');
ok('card recounted', jf.count === 2 && jf.miles === 30000 && jf.soonest === '2026-10-16');

const full = { deals: [
  { dest: 'NRT', city: 'Tokyo', cabin: 'Business', dates: [{ date: '2026-12-01', miles: 70000 }] },
  { dest: 'LAX', city: 'Los Angeles', cabin: 'first', dates: [{ date: '2026-11-01', miles: 40000 }] },
  { city: 'broken' }
] };
const EF = T.entriesFrom(full);
ok('full feed read, broken row skipped', EF.length === 2 && EF[0].cabin === 'business');
const C = T.choicesFor(EF, '2026-10-16');
ok('cabins offered from data', C.cabins.business && C.cabins.first && !C.cabins.economy);
ok('months offered from data', C.months.join() === '2026-11,2026-12');
ok('points steps inside the range', C.steps.join() === '40000,50000,60000', C.steps.join());
ok('first class cards', T.applyPrefs(EF, P({ cabin: 'first' }), '2026-10-16')[0].dest === 'LAX');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
