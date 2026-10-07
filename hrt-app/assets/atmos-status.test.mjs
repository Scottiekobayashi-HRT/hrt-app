import fs from 'fs';
// minimal DOM stub: the module only touches document.head/createElement at show() time
global.document = { getElementById: () => null, createElement: () => ({ style:{}, appendChild(){}, setAttribute(){}, addEventListener(){} }), head:{ appendChild(){} } };
global.window = {};
eval(fs.readFileSync(process.argv[2] ?? './assets/atmos-status.js','utf8'));
const T = global.window.HRT_ATMOS._test;
let pass=0, fail=0;
const ok=(n,c,extra='')=>{ if(c){pass++;console.log('  PASS  '+n);} else {fail++;console.log('  FAIL  '+n+' '+extra);} };

const S = T.state;
// Scenario A: pure island hopper, no card, no status
S.trips[0].trips=6; S.trips[0].miles=110; S.trips[0].fare=160; S.trips[0].segs=2;
S.trips[1].trips=0; S.trips[2].trips=0;
S.card='none'; S.spend=0; S.current='none';
let r=T.compute();
const byKey=k=>r.methods.find(m=>m.key===k);
ok('island: distance = 6 x 220 mi = 1,320', byKey('distance').fly===1320, byKey('distance').fly);
ok('island: price = 6 x $160 x 5 = 4,800', byKey('price').fly===4800, byKey('price').fly);
ok('island: segments = 6 x 2 x 500 = 6,000', byKey('segment').fly===6000, byKey('segment').fly);
ok('island: segments wins', r.best.key==='segment', r.best.key);

// Scenario B: long-haul flyer, distance should win
S.trips[0].trips=0; S.trips[2].trips=4; S.trips[2].miles=3850; S.trips[2].fare=700; S.trips[2].segs=2;
r=T.compute();
ok('longhaul: distance = 4 x 7,700 = 30,800', byKey('distance').fly===30800, byKey('distance').fly);
ok('longhaul: distance wins', r.best.key==='distance', r.best.key);

// Scenario C: elite bonus applies to flights only, not card
S.current='gold';              // +50%
S.card='ascent'; S.spend=3000; // 36,000/yr / 3 = 12,000
r=T.compute();
ok('gold bonus: distance 30,800 x 1.5 = 46,200', byKey('distance').fly===46200, byKey('distance').fly);
ok('card unaffected by bonus: 12,000', r.cardPts===12000, r.cardPts);
ok('total = flight + card', byKey('distance').total===46200+12000, byKey('distance').total);

// Scenario D: Summit anniversary bonus
S.card='summit'; S.spend=1000; // 12,000/yr / 2 = 6,000 + 10,000
r=T.compute();
ok('summit: 6,000 + 10,000 anniversary = 16,000', r.cardPts===16000, r.cardPts);

// Scenario E: tier thresholds
ok('19,999 -> no tier', T.tierFor(19999)===null);
ok('20,000 -> Silver', T.tierFor(20000).name==='Silver');
ok('79,999 -> Gold', T.tierFor(79999).name==='Gold');
ok('135,000 -> Titanium', T.tierFor(135000).name==='Titanium');

// Scenario F: empty input must not throw or produce NaN
S.trips.forEach(t=>{t.trips=0;}); S.card='none'; S.spend=0; S.current='none';
r=T.compute();
ok('empty input: all zero, no NaN', r.methods.every(m=>m.total===0));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
