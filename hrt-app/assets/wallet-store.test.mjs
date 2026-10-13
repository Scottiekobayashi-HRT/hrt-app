/* node assets/wallet-store.test.mjs  (run from hrt-app/hrt-app)
   A fake Memberstack that behaves like the real one: async, and
   updateMemberJSON REPLACES the whole object. */
import fs from 'fs';
global.window = {};
eval(fs.readFileSync('./assets/wallet-store.js', 'utf8'));
const S = global.window.HRT_WALLET_STORE;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + x)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function fakeMs(initial, opts = {}) {
  const f = { stored: initial === undefined ? null : JSON.parse(JSON.stringify(initial)), writes: 0, reads: 0 };
  f.getMemberJSON = async () => {
    f.reads++; await wait(opts.readDelay ?? 5);
    if (opts.readFails) throw new Error('network');
    if (opts.readUndefined) return undefined;
    return { data: f.stored == null ? null : JSON.parse(JSON.stringify(f.stored)) };
  };
  f.updateMemberJSON = async ({ json }) => {
    await wait(opts.writeDelay ?? 5);
    if (opts.writeFailsOnce) { opts.writeFailsOnce = false; throw new Error('500'); }
    f.writes++; f.stored = JSON.parse(JSON.stringify(json)); /* replaces everything */
    return { data: json };
  };
  global.window.$memberstackDom = f;
  return f;
}
const card = (id, cardId = 'amex-gold', opened = '2024-03-15') => ({ id, cardId, opened, nickname: '' });
async function code(p) { try { await p; return 'resolved'; } catch (e) { return e.code; } }

// 1. brand new member
let f = fakeMs(null);
let w = await S.load();
ok('new member loads an empty wallet', w.v === 1 && w.cards.length === 0 && w.points.length === 0);
ok('loading never writes', f.writes === 0);

// 2. other keys survive a save
f = fakeMs({ prefs: { theme: 'dark' }, lessons: [1, 2, 3] });
await S.update(d => { d.cards.push(card('a')); });
ok('save keeps keys outside the wallet', f.stored.prefs?.theme === 'dark' && f.stored.lessons?.length === 3);
ok('save stores the new card', f.stored.wallet.cards[0].id === 'a');

// 3. two saves at once: both land (the bug serialisation prevents)
f = fakeMs({ wallet: { v: 1, cards: [], points: [] } }, { readDelay: 20, writeDelay: 20 });
await Promise.all([S.update(d => { d.cards.push(card('x')); }), S.update(d => { d.cards.push(card('y')); })]);
ok('two simultaneous saves both survive', f.stored.wallet.cards.map(c => c.id).join() === 'x,y', JSON.stringify(f.stored.wallet.cards));

// 4. read fails -> no write
f = fakeMs({ wallet: { v: 1, cards: [card('keep')], points: [] } }, { readFails: true });
ok('failed read rejects with READ_FAILED', await code(S.update(d => { d.cards = []; })) === 'READ_FAILED');
ok('failed read writes nothing', f.writes === 0 && f.stored.wallet.cards[0].id === 'keep');

// 5. odd answer from Memberstack is a failed read, not an empty wallet
f = fakeMs({ wallet: { v: 1, cards: [card('keep')], points: [] } }, { readUndefined: true });
ok('undefined answer rejects', await code(S.update(d => { d.cards.push(card('n')); })) === 'READ_FAILED');
ok('undefined answer writes nothing', f.writes === 0);

// 6. invalid change is refused
f = fakeMs({ wallet: { v: 1, cards: [card('keep')], points: [] } });
ok('bad opened date refused', await code(S.update(d => { d.cards.push(card('b', 'amex-gold', '2024-13-01')); })) === 'INVALID');
ok('duplicate id refused', await code(S.update(d => { d.cards.push(card('keep')); })) === 'INVALID');
ok('long nickname refused', await code(S.update(d => { d.cards.push({ ...card('n'), nickname: 'x'.repeat(41) }); })) === 'INVALID');
ok('refused changes write nothing', f.writes === 0 && f.stored.wallet.cards.length === 1);

// 7. a wallet from a newer dashboard is never overwritten
f = fakeMs({ wallet: { v: 2, cards: [], future: true } });
ok('newer version refused', await code(S.update(d => { d.cards.push(card('n')); })) === 'NEWER_VERSION');
ok('newer version untouched', f.writes === 0 && f.stored.wallet.future === true);

// 8. corrupt wallet is never overwritten silently
f = fakeMs({ wallet: 'oops' });
ok('corrupt wallet refused', await code(S.update(d => { d.cards.push(card('n')); })) === 'CORRUPT' && f.writes === 0);

// 9. write fails, next save still works
f = fakeMs({ wallet: { v: 1, cards: [], points: [] } }, { writeFailsOnce: true });
ok('failed write rejects with WRITE_FAILED', await code(S.update(d => { d.cards.push(card('a')); })) === 'WRITE_FAILED');
await S.update(d => { d.cards.push(card('b')); });
ok('save after a failure goes through', f.stored.wallet.cards.map(c => c.id).join() === 'b');

// 10. change function throws: nothing written, queue not stuck
f = fakeMs({ wallet: { v: 1, cards: [], points: [] } });
ok('throwing change rejects', await code(S.update(() => { throw new Error('boom'); })) === undefined);
await S.update(d => { d.cards.push(card('c')); });
ok('queue recovers after a thrown change', f.writes === 1 && f.stored.wallet.cards[0].id === 'c');

// 11. fields added by later phases are kept when an older screen saves
f = fakeMs({ wallet: { v: 1, cards: [{ ...card('a'), used: { resy: { '2026-Q4': 40 } } }], points: [{ program: 'atmos', balance: 142000, asOf: '2026-10-13' }] } });
await S.update(d => { d.cards.push(card('b', 'capone-venture-x', '2023-07')); });
ok('unknown card fields survive', f.stored.wallet.cards[0].used?.resy?.['2026-Q4'] === 40);
ok('points survive a card save', f.stored.wallet.points[0].balance === 142000);
ok('month-only opened date accepted', f.stored.wallet.cards[1].opened === '2023-07');

// 11b. ticked-off perks are checked
f = fakeMs({ wallet: { v: 1, cards: [card('a')], points: [] } });
await S.update(d => { d.cards[0].used = { resy: { '2026-Q4': true }, travel: { A2026: true }, uber: { '2026-10': 15 } }; });
ok('valid ticks and amounts save', f.stored.wallet.cards[0].used.travel.A2026 === true && f.stored.wallet.cards[0].used.uber['2026-10'] === 15);
ok('bad period key refused', await code(S.update(d => { d.cards[0].used.resy['2026-Q5'] = true; })) === 'INVALID');
ok('bad tick value refused', await code(S.update(d => { d.cards[0].used.resy['2026-Q3'] = 'yes'; })) === 'INVALID');
ok('negative amount refused', await code(S.update(d => { d.cards[0].used.resy['2026-Q3'] = -5; })) === 'INVALID');
ok('used as a list refused', await code(S.update(d => { d.cards[0].used = []; })) === 'INVALID');
ok('refused ticks write nothing', f.writes === 1);

// 12. size limit
f = fakeMs({ big: 'x'.repeat(S._test.MAX_BYTES), wallet: { v: 1, cards: [], points: [] } });
ok('over the size limit refused', await code(S.update(d => { d.cards.push(card('a')); })) === 'TOO_BIG' && f.writes === 0);

// 13. no Memberstack on the page
global.window.$memberstackDom = undefined;
ok('no Memberstack rejects cleanly', await code(S.load()) === 'NO_MEMBERSTACK');

// 14. load returns a copy: editing it does not change what the store thinks
f = fakeMs({ wallet: { v: 1, cards: [card('a')], points: [] } });
w = await S.load(); w.cards = [];
ok('load returns a copy', f.stored.wallet.cards.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
