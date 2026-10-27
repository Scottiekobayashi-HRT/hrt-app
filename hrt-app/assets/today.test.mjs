/* node assets/today.test.mjs  (run from hrt-app/hrt-app) */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const T = require('./today.js');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + x)); };

const NOW = Date.parse('2026-10-26T08:00:00Z'); // Sun Oct 25, 10pm in Hawaii
const bonuses = [
  { bank: 'amex', bankName: 'American Express', partner: 'Air France-KLM Flying Blue', bonusPct: 25, startDate: '2026-10-01', expiresDate: '2026-10-31' },
  { bank: 'chase', bankName: 'Chase', partner: 'Marriott Bonvoy', bonusPct: 50, startDate: '2026-10-22', expiresDate: '2026-11-15' },
  { bank: 'citi', bankName: 'Citi', partner: 'Aeromexico Rewards', bonusPct: 30, startDate: '2026-10-24', expiresDate: '2026-10-20' }
];

// partner names
ok('Flying Blue short', T.shortPartner('Air France-KLM Flying Blue') === 'Flying Blue');
ok('Aeromexico short', T.shortPartner('Aeromexico Rewards') === 'Aeromexico');
ok('Bonvoy kept', T.shortPartner('Marriott Bonvoy') === 'Marriott Bonvoy');
const names = { 'Virgin Atlantic Flying Club': 'Virgin Atlantic', 'Qatar Airways Privilege Club': 'Qatar Airways', 'Air India Maharaja Club': 'Air India',
  'British Airways Avios': 'British Airways', 'Japan Airlines Mileage Bank': 'Japan Airlines', 'JetBlue TrueBlue': 'JetBlue' };
Object.keys(names).forEach((k) => ok('short name: ' + k, T.shortPartner(k) === names[k], T.shortPartner(k)));

// bonus line
let b = T.bonusLine(bonuses, [], '2026-10-25');
ok('no wallet: newest live bonus', b.text === 'New bonus: Chase to Marriott Bonvoy +50%', b.text);
b = T.bonusLine(bonuses, ['amex'], '2026-10-25');
ok('wallet: bonus for my points first', b.text === 'Bonus: Amex to Flying Blue +25%', b.text);
b = T.bonusLine(bonuses, ['bilt'], '2026-10-25');
ok('no match for my points: newest overall', /Marriott/.test(b.text));
ok('expired bonus never shown', !/Aeromexico/.test(T.bonusLine(bonuses, ['citi'], '2026-10-25').text));
ok('no bonuses, no line', T.bonusLine([], [], '2026-10-25') === null);

// credit line
let c = T.creditLine({ urgent: { amount: 25, label: 'Digital Entertainment', card: 'Amex Platinum', days: 6 } });
ok('credit text', c.text === '$25 credit ends in 6 days' && c.tone === 'hot', c.text);
ok('credit tomorrow', T.creditLine({ urgent: { amount: 15.5, days: 1 } }).text === '$15.50 credit ends tomorrow');
ok('credit warn tone past a week', T.creditLine({ urgent: { amount: 10, days: 12 } }).tone === 'warn');
ok('no urgent credit, no line', T.creditLine({ urgent: null }) === null);

// site line
const news = {
  article: { title: 'How to fly to Japan for 25,000 points from Honolulu this winter with your Atmos card', url: 'https://www.hawaiirewardtravel.com/bloghome/japan', date: Date.parse('2026-10-20T00:00:00Z') },
  deal: { title: 'Hilton Hawaiian Village kamaaina rate', url: 'https://www.hawaiirewardtravel.com/traveldeals/hhv', date: Date.parse('2026-10-24T00:00:00Z') }
};
let s = T.siteLine(news, NOW);
ok('newest of article or deal wins', s.text === 'New deal: Hilton Hawaiian Village kamaaina rate', s.text);
s = T.siteLine({ article: news.article }, NOW);
ok('long title cut short', s.text.length <= 'New article: '.length + 46 && /…$/.test(s.text), s.text);
ok('old item says Latest', /^Latest article/.test(T.siteLine({ article: { title: 'x', url: news.article.url, date: Date.parse('2026-08-01') } }, NOW).text));
ok('only links to hawaiirewardtravel.com', T.siteLine({ deal: { title: 'x', url: 'https://evil.example/x', date: NOW } }, NOW) === null);

// build
let v = T.build({ now: NOW, wallet: { count: 8, fees: 2995, captured: 1240, urgent: { amount: 25, days: 6 } }, bonuses, myBanks: ['amex'], news });
ok('tile lines: bonus then site (credits live in the wallet tile)', v.lines.map((l) => l.key).join() === 'bonus,site');
ok('date in Hawaii time', v.date === 'Sunday, October 25', v.date);
ok('captured and percent of fees', v.captured.amount === 1240 && v.captured.pct === 41, JSON.stringify(v.captured));
v = T.build({ now: NOW, wallet: { count: 0 }, bonuses: [], news: null });
ok('nothing to show = a calm note', /Nothing new yet today/.test(T.html(v)));
v = T.build({ now: NOW, wallet: { count: 3, fees: 0, captured: 0, urgent: null }, bonuses, news: null });
ok('no captured line before any tick', v.captured === null && v.lines.length === 1);
const h = T.html(T.build({ now: NOW, wallet: { count: 1, fees: 95, captured: 50, urgent: { amount: 25, days: 3 } }, bonuses, news }));
ok('html links', h.indexOf('data-route="transfers"') > -1 && h.indexOf('target="_top"') > -1 && h.indexOf('<script') < 0);
const dd = { name: 'Hilton Hawaiian Village <b>', offer: 'Kamaaina rate with breakfast', big: '$219', small: 'a night', image: 'https://images.example/x.jpg', where: 'Oahu', idx: 7 };
const hd = T.html(T.build({ now: NOW, bonuses, news, dotd: dd }));
ok('deal of the day card first', hd.indexOf('tdy-deal') > -1 && hd.indexOf('tdy-deal') < hd.indexOf('tdy-row'));
ok('deal opens Kamaaina deal 7', hd.indexOf('data-route="kamaaina"') > -1 && hd.indexOf('data-kama-open="7"') > -1);
ok('deal name escaped', hd.indexOf('<b>Hilton Hawaiian Village &lt;b&gt;') > -1);
ok('photo only from https', T.html(T.build({ now: NOW, dotd: Object.assign({}, dd, { image: 'javascript:x' }) })).indexOf('background-image') < 0);
ok('Asia Miles short', T.shortPartner('Cathay Pacific Asia Miles') === 'Cathay Pacific', T.shortPartner('Cathay Pacific Asia Miles'));
ok('deal subtitle drops the repeated name', T.html(T.build({ now: NOW, dotd: Object.assign({}, dd, { name: 'The Westin Hapuna', offer: 'Kamaaina Starting $299 - The Westin Hapuna' }) })).indexOf('<small>Kamaaina Starting $299</small>') > -1);
const drop = { title: 'Atmos Deal Drop: HNL to Tokyo 35k', text: 'Book by Friday', url: 'https://www.hawaiirewardtravel.com/traveldeals/tokyo', price: '35k points', ends: '2026-11-15', for: 'all' };
let hdr = T.html(T.build({ now: NOW, news: Object.assign({}, news, { drop: drop, deal: { title: 'same', url: drop.url, date: NOW } }), dotd: dd }));
ok('drop pinned first', hdr.indexOf('tdy-drop') > -1 && hdr.indexOf('tdy-drop') < hdr.indexOf('tdy-deal'));
ok('drop shows price and end date', hdr.indexOf('35k points · Ends Nov 15') > -1);
ok('drop not repeated as New deal', hdr.indexOf('New deal') < 0);
ok('pro drop is a locked teaser for free members', T.dropFor({ drop: Object.assign({}, drop, { for: 'pro' }) }, {}).locked === true);
ok('pro drop open for PRO', T.dropFor({ drop: Object.assign({}, drop, { for: 'pro' }) }, { pro: true }).locked === false);
ok('ohana drop locked for PRO-only members', T.dropFor({ drop: Object.assign({}, drop, { for: 'ohana' }) }, { pro: true }).locked === true);
const lk = T.html(T.build({ now: NOW, news: { drop: Object.assign({}, drop, { for: 'pro' }) }, audience: {} }));
ok('locked teaser points to Plans, not the post', lk.indexOf('data-route="plans"') > -1 && lk.indexOf(drop.url) < 0 && /Unlock with HRT PRO/.test(lk));
ok('locked teaser hides the details', lk.indexOf('Book by Friday') < 0 && /got this one first/.test(lk));
const oh = T.html(T.build({ now: NOW, news: { drop: Object.assign({}, drop, { for: 'ohana' }) }, audience: {} }));
ok('ohana teaser says Join the ʻOhana', /Join the ʻOhana/.test(oh));
const up = T.html(T.build({ now: NOW, news: { drop: Object.assign({}, drop, { kind: 'update', title: 'New: My Wallet Cards page' }) }, audience: {} }));
ok('update gets HRT Update badge', /HRT Update/.test(up) && /Read more/.test(up) && up.indexOf('tdy-drop upd') > -1);
ok('drop must link to hawaiirewardtravel.com', T.dropFor({ drop: Object.assign({}, drop, { url: 'https://evil.example/' }) }, {}) === null);
ok('deal of the day says Kamaaina and daily', hd.indexOf('Kamaʻāina deal of the day') > -1);
/* posts Scottie asks for in chat (data/drops.json) */
const FD = [{ title: 'Black Friday: Ohana spots open', text: 'Book your onboarding call this week', start: '2026-10-24', ends: '2026-10-31', link: '#plans', button: 'Book a call', kind: 'update' },
  { title: 'Old one', start: '2026-10-01' }, { title: 'Future one', start: '2026-11-20' }];
const f1 = T.fileDrop(FD, '2026-10-25');
ok('chat post live today is picked', f1 && f1.title === 'Black Friday: Ohana spots open' && f1.own === true);
ok('no ends = 7 days', T.fileDrop([{ title: 'x', start: '2026-10-20' }], '2026-10-28') === null && !!T.fileDrop([{ title: 'x', start: '2026-10-20' }], '2026-10-27'));
ok('future post waits', T.fileDrop([{ title: 'x', start: '2026-11-20' }], '2026-10-25') === null);
const hf = T.html(T.build({ now: NOW, drops: FD }));
ok('chat post shows with its own button and route', /Book a call/.test(hf) && hf.indexOf('data-route="plans"') > -1 && /HRT Update/.test(hf));
ok('newer chat post beats older Squarespace drop', /Black Friday/.test(T.html(T.build({ now: NOW, drops: FD, news: { drop: Object.assign({}, drop, { date: Date.parse('2026-10-01') }) } }))));
ok('newer Squarespace drop beats older chat post', /Tokyo/.test(T.html(T.build({ now: NOW, drops: FD, news: { drop: Object.assign({}, drop, { date: Date.parse('2026-10-25T12:00:00Z') }) } }))));
ok('bad link not clickable', T.safeLink('javascript:alert(1)') === '' && T.safeLink('https://evil.example/') === '' && T.safeLink('#atmos') === '#atmos');
ok('post with no link still shows, not a link', /<div class="tdy-drop/.test(T.html(T.build({ now: NOW, drops: [{ title: 'Note from Scottie', start: '2026-10-25' }] }))));
ok('bonus row has label and body', /tdy-k">Transfer bonus<\/span><b>Amex to Flying Blue \+25%/.test(T.html(T.build({ now: NOW, bonuses, myBanks: ['amex'] }))));
ok('no em dashes in banner text', !/[—]/.test(h));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
