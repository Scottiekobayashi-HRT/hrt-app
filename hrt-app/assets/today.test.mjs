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
ok('three lines in order', v.lines.map((l) => l.key).join() === 'credit,bonus,site');
ok('date in Hawaii time', v.date === 'Sunday, October 25', v.date);
ok('captured and percent of fees', v.captured.amount === 1240 && v.captured.pct === 41, JSON.stringify(v.captured));
v = T.build({ now: NOW, wallet: { count: 0 }, bonuses: [], news: null });
ok('nothing to show = empty html', T.html(v) === '');
v = T.build({ now: NOW, wallet: { count: 3, fees: 0, captured: 0, urgent: null }, bonuses, news: null });
ok('no captured line before any tick', v.captured === null && v.lines.length === 1);
const h = T.html(T.build({ now: NOW, wallet: { count: 1, fees: 95, captured: 50, urgent: { amount: 25, days: 3 } }, bonuses, news }));
ok('html escapes and links', h.indexOf('data-route="wallet/credits"') > -1 && h.indexOf('target="_top"') > -1 && h.indexOf('<script') < 0);
ok('no em dashes in banner text', !/[—]/.test(h));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
