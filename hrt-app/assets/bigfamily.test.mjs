/* node assets/bigfamily.test.mjs  (run from hrt-app/hrt-app) */
import fs from 'fs';
global.localStorage = { getItem: () => null, setItem() {} };
global.document = { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } };
global.window = {};
eval(fs.readFileSync('./data/bigfamily-rooms.js', 'utf8'));
eval(fs.readFileSync('./assets/bigfamily.js', 'utf8'));
const T = global.window.HRT_BIGFAM._test;
const ROOMS = global.window.HRT_BIGFAM_ROOMS;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + x)); };
const st = (o) => Object.assign({ dest: 'hawaii', place: 0, guests: 6, real: false, pts: false, sort: 'points' }, o || {});

// data sanity
ok('every room has an https official link', ROOMS.every(r => /^https:\/\//.test(r.u)));
ok('every room sleeps 6 or more', ROOMS.every(r => r.s >= 6));
ok('every bed value is known', ROOMS.every(r => ['real', 'shared', 'sofa', 'unknown', 'extra'].includes(r.b)));
ok('every island or city is a filter option', ROOMS.every(r => T.PLACES[r.d].includes(r.p)));
ok('no em dashes in customer text', ROOMS.every(r => !/—/.test(r.n + r.r + r.br + r.k)));

// filters
let l = T.pick(ROOMS, st());
ok('Hawaii only by default', l.every(r => r.d === 'hawaii'));
ok('6 guests includes the 6-sleepers', l.some(r => r.s === 6));
l = T.pick(ROOMS, st({ guests: 8 }));
ok('8 guests drops rooms for 6', l.length > 0 && l.every(r => r.s >= 8));
l = T.pick(ROOMS, st({ real: true }));
ok('real beds only removes sofa beds and unknowns', l.length > 0 && l.every(r => r.b === 'real' || r.b === 'shared'));
l = T.pick(ROOMS, st({ pts: true }));
ok('book with points keeps only Hilton, Marriott, Hyatt', l.length > 0 && l.every(r => ['Hilton', 'Marriott', 'Hyatt'].includes(r.g)));
l = T.pick(ROOMS, st({ place: 2 }));
ok('island filter (Maui)', l.length > 0 && l.every(r => r.p === 'Maui'));
l = T.pick(ROOMS, st({ dest: 'japan' }));
ok('Japan switch', l.length > 0 && l.every(r => r.d === 'japan'));
ok('island counts add up', T.PLACES.hawaii.slice(1).reduce((a, p) => a + T.countFor(ROOMS, st(), p), 0) === T.pick(ROOMS, st()).length);
ok('10 guests can return nothing without crashing', Array.isArray(T.pick(ROOMS, st({ guests: 10, real: true }))));

// sorting
l = T.pick(ROOMS, st({ sort: 'points' }));
ok('fewest points first is Embassy Suites 1BR at 144,000', l[0].pts === 144000, l[0].n);
const priced = l.filter(r => r.pts).map(r => r.pts);
ok('priced rooms ascend', priced.every((v, i) => i === 0 || v >= priced[i - 1]));
const firstUnpriced = l.findIndex(r => !r.pts);
ok('unpriced rooms come after priced ones', l.slice(firstUnpriced).every(r => !r.pts));
l = T.pick(ROOMS, st({ sort: 'guests' }));
ok('sleeps the most first', l[0].s === Math.max(...l.map(r => r.s)));
l = T.pick(ROOMS, st({ sort: 'beds' }));
ok('real beds first', l[0].b === 'real');
l = T.pick(ROOMS, st({ sort: 'name' }));
ok('name A to Z', l.every((r, i) => i === 0 || l[i - 1].n.localeCompare(r.n) <= 0));
l = T.pick(ROOMS, st({ sort: 'bedrooms' }));
ok('most bedrooms first', /3/.test(l[0].br));

// picks and labels
const picks = T.cheapest(T.pick(ROOMS, st()), 3);
ok('three cheapest picks', picks.length === 3 && picks[0].pts <= picks[1].pts && picks[1].pts <= picks[2].pts);
ok('picks skip million-point villas', picks.every(r => r.pts < 400000));
ok('snapshot points say not live', /not live/.test(T.pointsLabel({ pts: 144000, g: 'Hilton' }).sub));
ok('unpriced program says not checked', /not checked/.test(T.pointsLabel({ pts: null, g: 'Marriott' }).sub));
ok('cash-only label', T.pointsLabel({ pts: null, g: 'None' }).main === 'Cash only');
ok('unsafe link becomes #', T.safeUrl('javascript:alert(1)') === '#' && T.safeUrl('https://x.com/a') === 'https://x.com/a');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
