/* node assets/atmos-communities.test.mjs  (run from hrt-app/hrt-app) */
import fs from 'fs';
global.document = { getElementById:()=>null, createElement:()=>({style:{},appendChild(){},setAttribute(){},addEventListener(){}}), head:{appendChild(){}} };
global.window = { HRT_POINT_VALUES: { list: [["Alaska Atmos Rewards","airline",1.4]] } };
eval(fs.readFileSync('./assets/atmos-communities.js','utf8'));
const T = global.window.HRT_COMMUNITIES._test;
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+' '+x)); };
const base = () => ({ home:'HI', earn:'segment', goal:'both', island:0, intl:0, party:1, kids:0, kidTrips:0, kidPts:25000,
  transfer:0, bags:0, freeBag:false, card:'none', foodland:false, akTrips:0, akFare:300,
  niMiles:110, niFare:160, intlMiles:3850, intlFare:700, dests:{} });
const get=(r,k)=>r.all.find(x=>x.c.key===k);

// the official challenge ladder
ok('ladder totals 10,000', T.CUMUL[10]===10000, T.CUMUL[10]);
ok('5 destinations = 1,500', T.CUMUL[5]===1500, T.CUMUL[5]);
ok('every community has 10 unique destinations', T.COMMUNITIES.every(c=>new Set(c.dests).size===10));

// residency gates
let s=base(); s.home='other';
let r=T.compute(s);
ok('Huakai ineligible outside Hawaii', !get(r,'huakai').eligible);
ok('Club 49 ineligible outside Alaska', !get(r,'club49').eligible);
ok('ineligible never ranks first', r.best.eligible);

// island hopper: 12 trips, segments, 1 bag, no card
s=base(); s.island=12; s.bags=1; s.dests={HNL:1,OGG:1,KOA:1,LIH:1,ITO:1};
r=T.compute(s);
let h=get(r,'huakai');
ok('Huakai challenge 5 of 10 = 1,500', h.lines[0].pts===1500, h.lines[0].pts);
ok('Huakai 50% on 12 RT by segments = 6,000', h.lines[1].pts===6000 && h.lines[1].status===6000, h.lines[1].pts);
ok('bags: $30 x 2 ways x 12 = $720', h.lines[2].cash===720, h.lines[2].cash);
ok('codes: 4 x 10% x $160 = $64', Math.abs(h.lines[3].cash-64)<1e-9, h.lines[3].cash);
ok('island hopper: Huakai wins', r.best.c.key==='huakai', r.best.c.key);

// card doubles the code and free first bag removes bag savings
s.card='atmos'; s.freeBag=true;
h=get(T.compute(s),'huakai');
ok('card makes code 20% = $128', Math.abs(h.lines[3].cash-128)<1e-9, h.lines[3].cash);
ok('free first bag: no bag savings for 1 bag', h.lines[2].cash===0, h.lines[2].cash);

// distance earners get far less from the 50%
s=base(); s.island=12; s.earn='distance';
h=get(T.compute(s),'huakai');
ok('distance: 12 x 220 x 50% = 1,320', h.lines[1].pts===1320, h.lines[1].pts);

// families: 2 kids, 2 trips, 25,000 each = 100,000 spent, 20,000 back
s=base(); s.kids=2; s.kidTrips=2; s.dests={HNL:1,LAX:1,SAN:1,LGB:1};
r=T.compute(s);
ok('Families 20% back = 20,000', get(r,'families').lines[1].pts===20000, get(r,'families').lines[1].pts);
ok('family on mainland with few island trips: Families wins', r.best.c.key==='families', r.best.c.key);
s.kids=9; ok('kids capped at 7 per reservation', get(T.compute(s),'families').lines[1].pts===7*2*25000*0.2);

// global locals: status only, transfers 1 per 25
s=base(); s.intl=3; s.transfer=50000;
let g=get(T.compute(s),'global');
ok('Global 10% on 3 intl RT by segments = 300 status', g.lines[1].status===300 && g.lines[1].pts===0, g.lines[1].status);
ok('50,000 transferred = 2,000 status', g.lines[2].status===2000, g.lines[2].status);
s.goal='money'; r=T.compute(s);
ok('money goal: status-only community scores 0', get(r,'global').score===0, get(r,'global').score);

// club 49 for an Alaskan
s=base(); s.home='AK'; s.akTrips=4; s.party=3; s.bags=2;
let c=get(T.compute(s),'club49');
ok('Club 49 bags: ($45+$55) x 2 x 4 x 3 = $2,400', c.lines[1].cash===2400, c.lines[1].cash);

// HND counts for Huakai but not for the NRT lists
s=base(); s.dests={HND:1}; r=T.compute(s);
ok('HND counts for Huakai', get(r,'huakai').hits.length===1);
ok('HND does not count for Global Locals', get(r,'global').hits.length===0);

// presets only use real airports and every airport is on some list
const all=new Set(T.COMMUNITIES.flatMap(c=>c.dests));
ok('preset destinations all on at least one list', T.PRESETS.every(p=>p.set.dests.every(d=>all.has(d))));

// no em dashes anywhere in the tool
const src=fs.readFileSync('./assets/atmos-communities.js','utf8');
ok('no em dashes', !/—/.test(src));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
