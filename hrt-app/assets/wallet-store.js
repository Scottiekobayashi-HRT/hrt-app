/* ---------------------------------------------------------------------------
   wallet-store.js - the ONLY code allowed to save a member's wallet.

   Where it lives: Memberstack Member JSON, under the key "wallet".
   The danger: updateMemberJSON REPLACES the member's entire JSON object.
   Write a partial object and everything else is gone for good.

   So every save goes through update(), which:
     1. waits for any save already in flight (one at a time, never two)
     2. reads the member's CURRENT JSON fresh from Memberstack
     3. hands a copy of the wallet to your change function
     4. checks the result is a valid wallet
     5. puts it back alongside every other key that was already there
     6. writes the whole thing
   If step 2 fails, nothing is written. A failed read must never look like an
   empty wallet, or the next save would wipe the real one.

   Wallet shape (v1):
     { v:1,
       cards:  [ { id, cardId, opened:"2024-03-15" or "2024-03" or "" (unknown), nickname,
                   holder (whose card, e.g. "Janice"), status (see STATUSES),
                   note (next step, free text), addedBy:"hrt" when our team added it,
                   custom: { name, issuer, fee }
                   when cardId is "custom" (a card not in our catalog),
                   used: { perkId: { periodKey: true or amount used } },
                   bonus: { spend, months, spent, reward } (optional welcome bonus),
                   ...future fields kept } ],
       points: [ { program, balance, asOf } ] }

   Memberstack's docs say never gate access on Member JSON. Nothing here does.
   Exposes window.HRT_WALLET_STORE.
--------------------------------------------------------------------------- */
(function (root) {
  "use strict";

  var VERSION = 1;
  var MAX_BYTES = 900000; /* Memberstack allows 1MB per member; stop well short */
  /* Card status, set by the member or by HRT. Labels live in wallet.js. */
  var STATUSES = ["keep", "keep-for-now", "min-spend", "min-spend-almost", "downgrade", "cancel", "next", "closed"];
  var OPENED_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
  var queue = Promise.resolve();

  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function empty() { return { v: VERSION, cards: [], points: [] }; }
  function ms() { return root.$memberstackDom; }

  /* Memberstack answers { data: {...} }. data:null is a member with no JSON yet,
     which is fine. Anything else unexpected is treated as a failed read. */
  function unwrap(res) {
    if (!res || typeof res !== "object" || !("data" in res)) throw fail("READ_FAILED", "Unexpected answer from Memberstack");
    var d = res.data;
    if (d == null) return {};
    if (typeof d !== "object" || Array.isArray(d)) throw fail("READ_FAILED", "Member JSON is not an object");
    return d;
  }

  function readAll() {
    var m = ms();
    if (!m || typeof m.getMemberJSON !== "function") return Promise.reject(fail("NO_MEMBERSTACK"));
    return Promise.resolve()
      .then(function () { return m.getMemberJSON(); })
      .then(unwrap, function (e) { throw fail("READ_FAILED", e && e.message); });
  }

  function validate(w) {
    if (!w || typeof w !== "object") throw fail("INVALID", "wallet missing");
    if (w.v !== VERSION) throw fail("INVALID", "wallet version");
    if (!Array.isArray(w.cards) || !Array.isArray(w.points)) throw fail("INVALID", "cards and points must be lists");
    var ids = {};
    w.cards.forEach(function (c, i) {
      if (!c || typeof c !== "object") throw fail("INVALID", "card " + i);
      if (typeof c.id !== "string" || !c.id) throw fail("INVALID", "card " + i + " id");
      if (ids[c.id]) throw fail("INVALID", "card id repeated: " + c.id);
      ids[c.id] = 1;
      if (typeof c.cardId !== "string" || !c.cardId) throw fail("INVALID", "card " + i + " cardId");
      /* opened may be "" when the member (or HRT) does not know it yet */
      if (typeof c.opened !== "string" || (c.opened !== "" && !OPENED_RE.test(c.opened))) throw fail("INVALID", "card " + i + " opened date");
      if (c.holder != null && (typeof c.holder !== "string" || c.holder.length > 30)) throw fail("INVALID", "card " + i + " holder");
      if (c.status != null && STATUSES.indexOf(c.status) < 0) throw fail("INVALID", "card " + i + " status");
      if (c.note != null && (typeof c.note !== "string" || c.note.length > 500)) throw fail("INVALID", "card " + i + " note");
      if (c.addedBy != null && c.addedBy !== "hrt") throw fail("INVALID", "card " + i + " addedBy");
      if (c.cardId === "custom" || c.custom != null) {
        var cu = c.custom;
        if (!cu || typeof cu !== "object" || Array.isArray(cu)) throw fail("INVALID", "card " + i + " custom card");
        if (typeof cu.name !== "string" || !cu.name.trim() || cu.name.length > 60) throw fail("INVALID", "card " + i + " custom name");
        if (cu.issuer != null && (typeof cu.issuer !== "string" || cu.issuer.length > 40)) throw fail("INVALID", "card " + i + " custom issuer");
        if (cu.fee != null && !(typeof cu.fee === "number" && cu.fee >= 0 && cu.fee <= 10000)) throw fail("INVALID", "card " + i + " custom fee");
      }
      if (c.nickname != null && (typeof c.nickname !== "string" || c.nickname.length > 40)) throw fail("INVALID", "card " + i + " nickname");
      if (c.feeDate != null && (typeof c.feeDate !== "string" || !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(c.feeDate))) throw fail("INVALID", "card " + i + " feeDate");
      if (c.bonus != null) {
        var bn = c.bonus;
        if (typeof bn !== "object" || Array.isArray(bn)) throw fail("INVALID", "card " + i + " bonus");
        if (!(typeof bn.spend === "number" && bn.spend > 0 && bn.spend <= 1000000)) throw fail("INVALID", "card " + i + " bonus spend");
        if (!(typeof bn.months === "number" && bn.months % 1 === 0 && bn.months >= 1 && bn.months <= 24)) throw fail("INVALID", "card " + i + " bonus months");
        if (bn.spent != null && !(typeof bn.spent === "number" && bn.spent >= 0 && bn.spent <= 10000000)) throw fail("INVALID", "card " + i + " bonus spent");
        if (bn.reward != null && (typeof bn.reward !== "string" || bn.reward.length > 40)) throw fail("INVALID", "card " + i + " bonus reward");
      }
      if (c.used != null) {
        if (typeof c.used !== "object" || Array.isArray(c.used)) throw fail("INVALID", "card " + i + " used");
        Object.keys(c.used).forEach(function (pid) {
          var u = c.used[pid];
          if (!u || typeof u !== "object" || Array.isArray(u)) throw fail("INVALID", "card " + i + " used." + pid);
          Object.keys(u).forEach(function (k) {
            if (!/^A?\d{4}(-(0[1-9]|1[0-2]|Q[1-4]|H[12]))?$/.test(k) || !(u[k] === true || (typeof u[k] === "number" && u[k] >= 0 && isFinite(u[k])))) throw fail("INVALID", "card " + i + " used." + pid + "." + k);
          });
        });
      }
    });
    return w;
  }

  /* Turn whatever is stored into a wallet we can work with. */
  function normalize(stored) {
    if (stored == null) return empty();
    if (typeof stored !== "object" || Array.isArray(stored)) throw fail("CORRUPT", "stored wallet is not an object");
    if (typeof stored.v === "number" && stored.v > VERSION) throw fail("NEWER_VERSION", "wallet saved by a newer version of the dashboard");
    var w = clone(stored);
    if (w.v == null) w.v = VERSION;
    if (!Array.isArray(w.cards)) w.cards = [];
    if (!Array.isArray(w.points)) w.points = [];
    return validate(w);
  }

  function byteSize(o) {
    var s = JSON.stringify(o);
    return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : s.length * 3;
  }

  function load() {
    return readAll().then(function (all) { return normalize(all.wallet); });
  }

  /* change(draft) edits the draft in place, or returns a replacement wallet. */
  function update(change) {
    var run = queue.then(function () {
      return readAll().then(function (all) {
        var draft = normalize(all.wallet);
        var out = change(draft);
        var next = validate(out === undefined ? draft : out);
        var merged = {};
        Object.keys(all).forEach(function (k) { merged[k] = all[k]; });
        merged.wallet = next;
        if (byteSize(merged) > MAX_BYTES) throw fail("TOO_BIG", "wallet would exceed the member storage limit");
        return Promise.resolve(ms().updateMemberJSON({ json: merged }))
          .then(function () { return clone(next); }, function (e) { throw fail("WRITE_FAILED", e && e.message); });
      });
    });
    queue = run.then(function () {}, function () {}); /* one failure never blocks later saves */
    return run;
  }

  function newId() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  root.HRT_WALLET_STORE = {
    load: load,
    update: update,
    newId: newId,
    STATUSES: STATUSES,
    _test: { validate: validate, normalize: normalize, unwrap: unwrap, MAX_BYTES: MAX_BYTES }
  };
})(typeof window !== "undefined" ? window : globalThis);
