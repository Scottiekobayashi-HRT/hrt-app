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
ok('bad prefs cleaned', JSON.stringify(P({ dests: ['LAX', 'x', 5], cabin: 'boat', max: -3, months: ['2026-1'] })) === JSON.stringify({ routes: [], origins: [], dests: ['LAX'], cabin: 'economy', max: 0, months: [] }));
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

const multi = T.entriesFrom({ deals: [
  { origin: 'HNL', dest: 'LAX', city: 'Los Angeles', cabin: 'economy', dates: [{ date: '2026-11-02', miles: 12500 }] },
  { origin: 'OGG', dest: 'LAX', city: 'Los Angeles', cabin: 'economy', dates: [{ date: '2026-11-03', miles: 15000 }] },
  { origin: 'HNL', dest: 'LAX', city: 'Los Angeles', cabin: 'business', dates: [{ date: '2026-11-04', miles: 45000 }] },
  { origin: 'KOA', dest: 'SEA', city: 'Seattle', cabin: 'business', dates: [{ date: '2026-11-05', miles: 50000 }] }
] });
const MC = T.choicesFor(multi, '2026-10-16');
ok('departure airports offered from data', MC.origins.join() === 'HNL,OGG,KOA', MC.origins.join());
ok('bad origins cleaned', JSON.stringify(P({ origins: ['OGG', 'ogg', 7] }).origins) === '["OGG"]');
r = T.applyPrefs(multi, P({ origins: ['OGG'] }), '2026-10-16');
ok('route filter: OGG only', r.length === 1 && r[0].origin === 'OGG' && r[0].dest === 'LAX');
r = T.applyPrefs(multi, P({ cabin: 'business' }), '2026-10-16');
ok('business shows business routes only', r.map((x) => x.origin + x.dest).join() === 'HNLLAX,KOASEA', r.map((x) => x.origin + x.dest).join());
r = T.applyPrefs(multi, P({ cabin: 'business', origins: ['KOA'], dests: ['SEA'] }), '2026-10-16');
ok('route plus cabin together', r.length === 1 && r[0].dest === 'SEA' && r[0].miles === 50000);
r = T.applyPrefs(multi, P({}), '2026-10-16');
ok('same city from two islands = two cards', r.length === 2 && r[0].origin !== r[1].origin);

const mix = T.entriesFrom({ deals: [
  { origin: 'HNL', dest: 'LAX', city: 'Los Angeles', cabin: 'economy', dates: [{ date: '2026-11-02', miles: 12500 }, { date: '2026-12-02', miles: 15000 }] },
  { origin: 'HNL', dest: 'NRT', city: 'Tokyo', cabin: 'business', dates: [{ date: '2027-03-10', miles: 60000 }, { date: '2027-06-20', miles: 120000 }] },
  { origin: 'OGG', dest: 'SEA', city: 'Seattle', cabin: 'business', dates: [{ date: '2027-01-05', miles: 45000 }] }
] });
const ce = T.choicesFor(mix, '2026-10-16', P({ cabin: 'economy' }));
const cb = T.choicesFor(mix, '2026-10-16', P({ cabin: 'business' }));
ok('economy months only economy', ce.months.join() === '2026-11,2026-12', ce.months.join());
ok('business months reach 2027', cb.months.join() === '2027-01,2027-03,2027-06', cb.months.join());
ok('business points steps are business sized', cb.steps[0] >= 50000 && cb.steps.indexOf(100000) >= 0 && ce.steps.indexOf(100000) < 0, cb.steps.join() + ' / ' + ce.steps.join());
ok('business cities only business', cb.cities.map((c) => c.dest).join() === 'NRT,SEA');
ok('all cabins still offered', cb.cabins.economy && cb.cabins.business);
const cbo = T.choicesFor(mix, '2026-10-16', P({ cabin: 'business', origins: ['OGG'] }));
ok('airport narrows cities and months', cbo.cities.length === 1 && cbo.months.join() === '2027-01');

// ---- route tracking ----
const rt = T.entriesFrom({ deals: [
  { origin: 'HNL', dest: 'LAX', city: 'Los Angeles', cabin: 'economy', image: 'lax.jpg', dates: [{ date: '2026-11-02', miles: 12500 }, { date: '2026-10-01', miles: 9000 }] },
  { origin: 'HNL', dest: 'LAX', city: 'Los Angeles', cabin: 'business', dates: [{ date: '2027-02-02', miles: 45000, nonstop: true }] },
  { origin: 'LAX', dest: 'HNL', city: 'Honolulu', cabin: 'economy', dates: [{ date: '2026-12-02', miles: 15000 }] },
  { origin: 'OGG', dest: 'SEA', city: 'Seattle', cabin: 'first', dates: [{ date: '2027-03-02', miles: 70000 }] },
  { origin: 'HNL', dest: 'NRT', city: 'Tokyo', cabin: 'business', dates: [{ date: '2026-09-02', miles: 60000 }] }
] });
const RC = T.routeChoices(rt, '2026-10-16');
ok('route choices: Hawaii airports first', RC.origins.join() === 'HNL,OGG,LAX', RC.origins.join());
ok('route choices: every destination from HNL, even with no deals now', RC.byOrigin.HNL.map((d) => d.dest).join() === 'LAX,NRT', RC.byOrigin.HNL.map((d) => d.dest).join());
ok('route choices: cabins with live dates', RC.byOrigin.HNL[0].cabins.economy && RC.byOrigin.HNL[0].cabins.business && !RC.byOrigin.HNL[1].cabins.business);
ok('return route is offered', RC.byOrigin.LAX.some((d) => d.dest === 'HNL'));
const CR = T.cleanRoutes([{ o: 'HNL', d: 'LAX', cabins: ['business', 'economy', 'boat'] }, { o: 'HNL', d: 'LAX', cabins: ['first'] }, { o: 'hnl', d: 'LAX' }, { o: 'HNL', d: 'HNL' }, { o: 'KOA', d: 'SEA', cabins: [] }]);
ok('routes cleaned, deduped, cabins ordered', JSON.stringify(CR) === JSON.stringify([{ o: 'HNL', d: 'LAX', cabins: ['economy', 'business'] }, { o: 'KOA', d: 'SEA', cabins: ['economy'] }]), JSON.stringify(CR));
const AR = T.applyRoutes(rt, [{ o: 'HNL', d: 'LAX', cabins: ['economy', 'business', 'first'] }, { o: 'LAX', d: 'HNL', cabins: ['economy'] }], '2026-10-16');
ok('one card per route and cabin, in order', AR.map((c) => c.origin + c.dest + c.cabin[0]).join() === 'HNLLAXe,HNLLAXb,HNLLAXf,LAXHNLe', AR.map((c) => c.origin + c.dest + c.cabin[0]).join());
ok('past dates dropped on tracked route', AR[0].count === 1 && AR[0].miles === 12500);
ok('tracked cabin with no deals still shows, marked none', AR[2].none === true && AR[2].city === 'Los Angeles' && AR[2].image === 'lax.jpg');
ok('business card carries nonstop', AR[1].nonstop === true && AR[1].miles === 45000);
const MG = T.migratePrefs(P({ dests: ['LAX', 'NRT'], cabin: 'business' }));
ok('old city picks become routes', JSON.stringify(MG.routes) === JSON.stringify([{ o: 'HNL', d: 'LAX', cabins: ['business'] }, { o: 'HNL', d: 'NRT', cabins: ['business'] }]), JSON.stringify(MG.routes));
ok('saved routes survive cleaning', P({ routes: [{ o: 'HNL', d: 'LAX', cabins: ['first'] }] }).routes[0].cabins[0] === 'first');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
