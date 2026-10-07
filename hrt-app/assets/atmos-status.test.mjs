/* node assets/atmos-status.test.mjs  (run from hrt-app/hrt-app) */
import fs from 'fs';
global.document = { getElementById:()=>null, createElement:()=>({style:{},appendChild(){},setAttribute(){},addEventListener(){}}), head:{appendChild(){}} };
global.window = {};
eval(fs.readFileSync('./assets/atmos-status.js','utf8'));
const T = global.window.HRT_ATMOS._test, S = T.state;
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+' '+x)); };
const by=(r,k)=>r.methods.find(m=>m.key===k);

// island hopper preset: 14 round trips, 110 mi each way, $160, 2 flights
S.preset='island'; S.trips=14; S.card='none'; S.spend=0; S.current='none';
let r=T.compute();
ok('island distance = 14 x 220 = 3,080', by(r,'distance').fly===3080, by(r,'distance').fly);
ok('island price = 14 x 160 x 5 = 11,200', by(r,'price').fly===11200, by(r,'price').fly);
ok('island segments = 14 x 2 x 500 = 14,000', by(r,'segment').fly===14000, by(r,'segment').fly);
ok('island: segments wins', r.best.key==='segment', r.best.key);

// mainland preset: distance should beat segments
S.preset='mainland'; S.trips=4;
r=T.compute();
ok('mainland distance = 4 x 5,100 = 20,400', by(r,'distance').fly===20400, by(r,'distance').fly);
ok('mainland: distance wins', r.best.key==='distance', r.best.key);

// the mix preset splits trips across legs and still totals correctly
S.preset='mix'; S.trips=10;
r=T.compute();
const expMiles = 10*0.6*220 + 10*0.3*5100 + 10*0.1*7700;
ok('mix miles split correctly', Math.abs(r.miles-expMiles)<0.001, r.miles+' vs '+expMiles);

// elite bonus applies to flights only, never to card points
S.preset='island'; S.trips=14; S.current='gold'; S.card='ascent'; S.spend=3000;
r=T.compute();
ok('gold bonus: 14,000 x 1.5 = 21,000', by(r,'segment').fly===21000, by(r,'segment').fly);
ok('card unaffected by bonus: 36,000/3 = 12,000', r.cardPts===12000, r.cardPts);
ok('total = flights + card', by(r,'segment').total===21000+12000, by(r,'segment').total);

// Summit anniversary bonus
S.card='summit'; S.spend=1000;
r=T.compute();
ok('summit: 12,000/2 + 10,000 = 16,000', r.cardPts===16000, r.cardPts);

// tier boundaries
ok('19,999 -> none', T.tierFor(19999)===null);
ok('20,000 -> Silver', T.tierFor(20000).name==='Silver');
ok('134,999 -> Platinum', T.tierFor(134999).name==='Platinum');
ok('135,000 -> Titanium', T.tierFor(135000).name==='Titanium');

// zero trips and no card must not produce NaN
S.trips=0; S.card='none'; S.spend=0; S.current='none';
r=T.compute();
ok('zero input: all zero, no NaN', r.methods.every(m=>m.total===0 && !isNaN(m.total)));

// every preset must be computable and name a winner
let allOk=true;
T.PRESETS.forEach(p=>{ S.preset=p.key; S.trips=p.trips; const x=T.compute(); if(!x.best||isNaN(x.best.total)) allOk=false; });
ok('all 4 presets compute and pick a winner', allOk);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
