/* ---------------------------------------------------------------------------
   Ask Scottie: the server side of the chat.
   Lives at /api/ask-scottie on the hrt-app Cloudflare Pages project.

   NOTHING SECRET IS IN THIS FILE. The repo is public. Everything private is
   set in Cloudflare (hrt-app > Settings > Variables and Secrets / Bindings):

     ANTHROPIC_API_KEY      secret   Claude API key
     MEMBERSTACK_SECRET_KEY secret   Memberstack secret key (sk_sb_... in test mode)
     SEATS_AERO_KEY         secret   seats.aero key (NOT used while LIVE_SEARCH is false)
     SCOTTIE_TEXT_NUMBER    variable Scottie's business text number, e.g. +18085551234
     ASK_SCOTTIE            KV binding. Keys "rulebook", "knowledge" and optional
                            "voice" (Scottie's voice guide) hold the
                            private instructions and knowledge base. Daily
                            counters are kept here too.
     ASK_MODEL              variable optional, defaults to claude-sonnet-5-5
     DAILY_MESSAGES         variable optional, messages per member per day (default 40)
     DAILY_SEARCHES         variable optional, award searches per member per day (default 15)
     ALERT_EVERY_HOURS      variable optional, hours between seat alert checks (default 6)

   Who gets what (see the rulebook):
     ʻOhana (HRT Client plan)  coaching on redeeming points, My Wallet, live transfer bonuses
     HRT PRO only              not built yet (Atmos Reward Seat Finder comes next)
     Free                      nothing
--------------------------------------------------------------------------- */

const CLIENT_PLANS = ["pln_hrt-client-fddt0cb9"];
const PRO_PLANS = ["pln_atmos-calendar-irdd08f8", "pln_all-access-xsc20cqf"];
const MS_API = "https://admin.memberstack.com";
const SEATS_API = "https://seats.aero/partnerapi/search";
const HANDOFF = "[[TEXT_SCOTTIE]]";

/* COACHING ONLY (Scottie, Oct 20). Ask Scottie coaches members on how to
   redeem their points. It does NOT look up live award seats: no seats.aero
   search, no trip planner, no seat alerts. That code stays below, switched
   off, for HRT's next platform. To switch it back on, set this to true. */
const LIVE_SEARCH = false;
const ATMOS_PITCH = "[[ATMOS_CALENDAR]]";

/* Atmos Rewards award space on Alaska and Hawaiian flights is what the Atmos
   Reward Calendar (HRT PRO) sells, so Ask Scottie leaves it out for members
   without PRO (Scottie, Oct 18). Atmos partner awards (JAL, Qatar and so on)
   still show. To undo: make this return false. */
function hideForNonPro(r) {
  return r.program === "alaska" && /\b(AS|HA)\b/.test(String(r.airlines || ""));
}
const MAX_TURNS = 20;
const MAX_CHARS = 2000;

const CABINS = { economy: "Y", premium: "W", business: "J", first: "F" };

/* ----------------------------- helpers ----------------------------- */

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function hawaiiDate(d) {
  return (d || new Date()).toLocaleDateString("en-CA", { timeZone: "Pacific/Honolulu" });
}

/* No em or en dashes in anything a member reads. */
function noDashes(s) {
  return String(s || "").replace(/\s*[–—]\s*/g, ", ");
}

function bearer(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function activePlans(member) {
  return (member.planConnections || [])
    .filter((p) => {
      const s = String(p.status || "").toUpperCase();
      return s !== "CANCELED" && s !== "CANCELLED" && p.active !== false;
    })
    .map((p) => p.planId);
}

/* Verify the member's Memberstack token, then load the member. */
async function loadMember(env, token) {
  if (!token) return { error: "signed_out" };
  const headers = { "x-api-key": env.MEMBERSTACK_SECRET_KEY, "content-type": "application/json" };
  const v = await fetch(MS_API + "/members/verify-token", { method: "POST", headers, body: JSON.stringify({ token }) });
  if (v.status !== 200) return { error: "signed_out" };
  const vid = (await v.json()).data;
  if (!vid || !vid.id || (vid.type && vid.type !== "member")) return { error: "signed_out" };
  const r = await fetch(MS_API + "/members/" + encodeURIComponent(vid.id), { headers });
  if (r.status !== 200) return { error: "member_lookup" };
  const member = (await r.json()).data;
  if (!member) return { error: "signed_out" };
  const plans = activePlans(member);
  const client = plans.some((id) => CLIENT_PLANS.includes(id)) || !!(member.metaData && member.metaData.hrtClient === true);
  const pro = plans.some((id) => PRO_PLANS.includes(id));
  const cf = member.customFields || {};
  return {
    member,
    id: member.id,
    firstName: String(cf["first-name"] || cf.firstName || "").trim().slice(0, 40),
    client,
    pro
  };
}

/* Daily counters in KV. Returns how many are left after counting this one,
   or -1 when the limit is already used up. */
async function spend(env, kind, memberId, limit) {
  const key = "count:" + kind + ":" + memberId + ":" + hawaiiDate();
  const used = parseInt((await env.ASK_SCOTTIE.get(key)) || "0", 10) || 0;
  if (used >= limit) return -1;
  await env.ASK_SCOTTIE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
  return limit - used - 1;
}

async function remaining(env, kind, memberId, limit) {
  const key = "count:" + kind + ":" + memberId + ":" + hawaiiDate();
  const used = parseInt((await env.ASK_SCOTTIE.get(key)) || "0", 10) || 0;
  return Math.max(0, limit - used);
}

/* The public card catalog, served by this same site. Cached per isolate. */
let catalogCache = null;
async function loadCatalog(env, request) {
  if (catalogCache) return catalogCache;
  try {
    const res = await env.ASSETS.fetch(new URL("/data/wallet-catalog.js", request.url));
    const text = await res.text();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    catalogCache = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    catalogCache = { cards: [], benefits: [], earning: [], quarterly: [] };
  }
  return catalogCache;
}

/* ------------------- transfer partners, bonuses, booking ------------------- */

/* The transfer partner table lives in the dashboard (assets/app.js, the
   Transfer Bonuses calculator) so there is one source of truth. Read it from
   the deployed file. Cached per isolate. */
let partnersCache = null;
async function loadPartners(env, request) {
  if (partnersCache) return partnersCache;
  try {
    const t = await (await env.ASSETS.fetch(new URL("/assets/app.js", request.url))).text();
    const a = t.indexOf("var PROGRAMS = {");
    const b = t.indexOf("\n };", a);
    if (a < 0 || b < 0) throw new Error("partner table not found");
    const body = t.slice(a + "var PROGRAMS = ".length, b + 3).replace(/([{,]\s*)(name|p):/g, '$1"$2":');
    partnersCache = JSON.parse(body);
  } catch (e) {
    console.log("ask-scottie partners", e && e.message);
    partnersCache = {};
  }
  return partnersCache;
}

/* Live transfer bonuses from the daily bonus tracker. Cached about an hour. */
const BONUS_FEED = "https://raw.githubusercontent.com/Scottiekobayashi-HRT/hrt-bonuses/main/bonuses.json";
let bonusCache = null, bonusAt = 0, bonusPast = [];
async function loadBonuses() {
  if (bonusCache && Date.now() - bonusAt < 3600000) return bonusCache;
  try {
    const r = await fetch(BONUS_FEED, { cf: { cacheTtl: 1800 } });
    const d = await r.json();
    const today = hawaiiDate();
    bonusCache = (d.bonuses || []).filter((x) => !x.expiresDate || x.expiresDate >= today);
    bonusPast = (d.recentlyExpired || []).concat((d.bonuses || []).filter((x) => x.expiresDate && x.expiresDate < today));
    bonusAt = Date.now();
  } catch (e) {
    bonusCache = bonusCache || [];
  }
  return bonusCache;
}

/* Transfer bonus history, so the coach can say "the last one was 30% in
   September". The feed only keeps recent ones, so every bonus we see is
   also saved in KV ("bonusHistory"), updated at most once a day. */
async function bonusHistory(env, live) {
  let hist = {};
  try { hist = JSON.parse((await env.ASK_SCOTTIE.get("bonusHistory")) || "{}") || {}; } catch (e) { hist = {}; }
  const today = hawaiiDate();
  if (hist._day !== today) {
    live.concat(bonusPast).forEach((b) => {
      if (!b || !b.bank || !b.partner || !b.bonusPct) return;
      const k = b.bank + "|" + b.partner;
      const list = hist[k] || [];
      const start = b.startDate || "", end = b.expiresDate || "";
      if (!list.some((x) => x.start === start && x.pct === b.bonusPct)) list.push({ pct: b.bonusPct, start, end, bank: b.bankName || b.bank, partner: b.partner });
      list.sort((a, c) => String(c.start).localeCompare(String(a.start)));
      hist[k] = list.slice(0, 6);
    });
    hist._day = today;
    try { await env.ASK_SCOTTIE.put("bonusHistory", JSON.stringify(hist)); } catch (e) {}
  }
  return hist;
}

function describeHistory(hist) {
  const today = hawaiiDate();
  const rows = Object.keys(hist).filter((k) => k !== "_day").map((k) => {
    const past = (hist[k] || []).filter((x) => x.end && x.end < today);
    if (!past.length) return null;
    const h = past[0];
    return "- " + h.bank + " to " + h.partner + ": " + past.map((x) => x.pct + "% (" + x.start + " to " + x.end + ")").join(", ");
  }).filter(Boolean);
  return rows.length ? rows.join("\n") : "(none recorded yet)";
}

/* seats.aero program keys: the name to show, where to book, and how to find
   the same program in the transfer partner table. */
const SOURCES = {
  alaska: { name: "Atmos Rewards (Alaska Airlines)", url: "https://www.alaskaair.com", match: /atmos/i, direct: "atmos" },
  aeroplan: { name: "Air Canada Aeroplan", url: "https://www.aircanada.com/aeroplan", match: /aeroplan/i },
  american: { name: "American AAdvantage", url: "https://www.aa.com", match: /aadvantage/i },
  united: { name: "United MileagePlus", url: "https://www.united.com", match: /mileageplus/i },
  delta: { name: "Delta SkyMiles", url: "https://www.delta.com", match: /skymiles/i },
  virginatlantic: { name: "Virgin Atlantic Flying Club", url: "https://www.virginatlantic.com", match: /virgin atlantic/i },
  flyingblue: { name: "Air France KLM Flying Blue", url: "https://www.flyingblue.com", match: /flying blue/i },
  qantas: { name: "Qantas Frequent Flyer", url: "https://www.qantas.com", match: /qantas/i },
  emirates: { name: "Emirates Skywards", url: "https://www.emirates.com", match: /emirates/i },
  etihad: { name: "Etihad Guest", url: "https://www.etihad.com", match: /etihad/i },
  qatar: { name: "Qatar Airways Privilege Club", url: "https://www.qatarairways.com", match: /qatar/i },
  turkish: { name: "Turkish Airlines Miles&Smiles", url: "https://www.turkishairlines.com", match: /turkish/i },
  singapore: { name: "Singapore KrisFlyer", url: "https://www.singaporeair.com", match: /krisflyer/i },
  lifemiles: { name: "Avianca LifeMiles", url: "https://www.lifemiles.com", match: /lifemiles/i },
  jetblue: { name: "JetBlue TrueBlue", url: "https://www.jetblue.com", match: /trueblue/i },
  aeromexico: { name: "Aeromexico Rewards", url: "https://www.aeromexico.com", match: /aeromexico/i },
  finnair: { name: "Finnair Plus", url: "https://www.finnair.com", match: /finnair/i },
  velocity: { name: "Virgin Australia Velocity", url: "https://www.velocityfrequentflyer.com" },
  eurobonus: { name: "SAS EuroBonus", url: "https://www.flysas.com" },
  smiles: { name: "GOL Smiles", url: "https://www.smiles.com.br" },
  azul: { name: "Azul Fidelidade", url: "https://www.voeazul.com.br" },
  connectmiles: { name: "Copa ConnectMiles", url: "https://www.copaair.com" },
  ethiopian: { name: "Ethiopian ShebaMiles", url: "https://www.ethiopianairlines.com" },
  saudia: { name: "Saudia AlFursan", url: "https://www.saudia.com" },
  spirit: { name: "Spirit Free Spirit", url: "https://www.spirit.com" }
};
const BANK_PAGES = {
  chase: "https://ultimaterewards.chase.com",
  amex: "https://global.americanexpress.com/rewards",
  "capital-one": "https://www.capitalone.com",
  citi: "https://www.thankyou.com",
  bilt: "https://www.biltrewards.com"
};

/* Which transferable points (and Atmos points) this member holds, from My Wallet. */
/* Cards the member actually holds. "next" is a card HRT plans for them: it is
   never shown to Ask Scottie, so the AI can't name a member's next card
   (Eddie's rule: members only learn their next card from us, with our link). */
function cardHeld(c) { return !!c && c.status !== "closed" && c.status !== "next"; }

function memberBanks(wallet, catalog) {
  const cards = (wallet && Array.isArray(wallet.cards)) ? wallet.cards.filter(cardHeld) : [];
  const byId = {};
  (catalog.cards || []).forEach((c) => { byId[c.cardId || c.id] = c; });
  const held = {};
  let chaseTransfer = false, chaseAny = false;
  cards.forEach((c) => {
    const cat = byId[c.cardId];
    const issuer = String((cat && cat.issuer) || (c.custom && c.custom.issuer) || "").toLowerCase();
    const name = String((cat && cat.name) || (c.custom && c.custom.name) || c.cardId || "").toLowerCase();
    if (issuer.indexOf("chase") > -1) { chaseAny = true; if (/sapphire|ink/.test(name)) chaseTransfer = true; }
    else if (issuer.indexOf("american express") > -1 || issuer === "amex") held.amex = "yes";
    else if (issuer.indexOf("capital one") > -1) { if (/venture|spark/.test(name)) held["capital-one"] = "yes"; }
    else if (issuer.indexOf("citi") > -1) held.citi = "yes";
    else if (issuer.indexOf("bilt") > -1 || name.indexOf("bilt") > -1) held.bilt = "yes";
    if (/atmos|alaska|hawaiian/.test(name)) held.atmos = "yes";
  });
  if (chaseAny) held.chase = chaseTransfer ? "yes" : "cashback";
  ((wallet && wallet.points) || []).forEach((p) => { if (/atmos|alaska|hawaiian/i.test(p.program || "")) held.atmos = "yes"; });
  return held;
}

/* How to book one seats.aero result, using the member's own points. */
function bookingFor(source, held, partners, bonuses) {
  const info = SOURCES[source] || { name: source, url: "" };
  const paths = [];
  if (info.match) {
    Object.keys(partners).forEach((bank) => {
      const p = ((partners[bank] || {}).p || []).find((x) => info.match.test(x[0]));
      if (!p) return;
      const bonus = bonuses.find((b) => b.bank === bank && info.match.test(b.partner || ""));
      paths.push({
        bank,
        a: p[2], b: p[3], bonusPct: bonus ? Number(bonus.bonusPct) || 0 : 0,
        from: partners[bank].name,
        ratio: p[2] === 1 && p[3] === 1 ? "1:1" : p[2] + ":" + p[3],
        yours: held[bank] === "yes",
        note: held[bank] === "cashback" ? "Their Chase Freedom points only transfer when combined with a Sapphire or Ink card." : undefined,
        bonus: bonus ? "+" + bonus.bonusPct + "% transfer bonus" + (bonus.expiresDate ? " until " + new Date(bonus.expiresDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "") : undefined,
        transferAt: BANK_PAGES[bank]
      });
    });
  }
  paths.sort((a, b) => (b.yours ? 1 : 0) - (a.yours ? 1 : 0));
  return {
    program: info.name,
    bookAt: info.url,
    direct: info.direct && held[info.direct] ? "Their Atmos Rewards points book this directly, no transfer needed." : undefined,
    transferFrom: paths.filter((p) => p.yours || p.note).concat(paths.filter((p) => !p.yours && !p.note).slice(0, 2))
  };
}

/* The member's own transfer options, for answers that don't need a search. */
function describePartners(held, partners) {
  const lines = [];
  Object.keys(partners).forEach((bank) => {
    if (held[bank] !== "yes") return;
    const list = ((partners[bank] || {}).p || []).filter((x) => x[1] === "airline")
      .map((x) => x[0] + " " + (x[2] === 1 && x[3] === 1 ? "1:1" : x[2] + ":" + x[3]));
    if (list.length) lines.push("- " + partners[bank].name + " transfers to: " + list.join(", "));
  });
  if (held.chase === "cashback") lines.push("- Chase: their Freedom cards earn points that only transfer when combined with a Sapphire or Ink card.");
  if (held.atmos === "yes") lines.push("- Atmos Rewards: they earn Atmos points directly (book Alaska, Hawaiian and partners like JAL on alaskaair.com).");
  return lines.length ? lines.join("\n") : "None of their saved cards earn transferable points.";
}

/* Turn the member's saved wallet into a short, plain description. */
function describeWallet(wallet, catalog) {
  const cards = (wallet && Array.isArray(wallet.cards)) ? wallet.cards : [];
  const live = cards.filter(cardHeld);
  if (!live.length) return "No cards saved in My Wallet yet.";
  const byId = {};
  (catalog.cards || []).forEach((c) => { byId[c.id] = c; });
  const lines = live.slice(0, 25).map((c) => {
    const cat = byId[c.cardId];
    const name = cat ? cat.name : (c.custom && c.custom.name) || c.cardId;
    const bits = [name];
    if (c.holder) bits.push("holder: " + c.holder);
    if (c.opened) bits.push("opened " + c.opened);
    if (cat && typeof cat.fee === "number") bits.push("annual fee $" + cat.fee);
    if (c.status) bits.push("status: " + c.status);
    if (c.bonus && c.bonus.spend) {
      bits.push("welcome bonus: spend $" + c.bonus.spend + " in " + c.bonus.months + " months, $" + (c.bonus.spent || 0) + " spent so far" + (c.bonus.reward ? ", reward " + c.bonus.reward : ""));
    }
    const earn = (catalog.earning || []).filter((e) => e.card === c.cardId).slice(0, 6)
      .map((e) => e.rate + "x " + e.category);
    if (earn.length) bits.push("earns: " + earn.join("; ") + (cat ? " (" + ((catalog.earning || []).find((e) => e.card === c.cardId) || {}).currency + ")" : ""));
    const perks = (catalog.benefits || []).filter((b) => b.card === c.cardId && b.type === "credit").slice(0, 6)
      .map((b) => b.label + (b.amount ? " $" + b.amount : ""));
    if (perks.length) bits.push("credits: " + perks.join("; "));
    return "- " + bits.join(", ");
  });
  const pts = (wallet.points || []).slice(0, 10).map((p) => "- " + p.program + ": " + p.balance + " (as of " + p.asOf + ")");
  return lines.join("\n") + (pts.length ? "\nPoints balances the member entered:\n" + pts.join("\n") : "");
}

/* ------------------------- seats.aero search ------------------------- */

const SEARCH_TOOL = {
  name: "search_award_seats",
  description:
    "Search cached award seat availability on seats.aero across many airline programs. " +
    "Only use this when the member asks about award seats or availability. " +
    "Results are cached, not live. Ask for any missing details before searching.",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Origin airport code(s), comma separated, e.g. HNL or HNL,OGG" },
      destination: { type: "string", description: "Destination airport code(s), comma separated, e.g. HND,NRT" },
      start_date: { type: "string", description: "First departure date, YYYY-MM-DD" },
      end_date: { type: "string", description: "Last departure date, YYYY-MM-DD, at most 60 days after start_date" },
      cabin: { type: "string", enum: ["economy", "premium", "business", "first"] },
      travelers: { type: "integer", minimum: 1, maximum: 9 }
    },
    required: ["origin", "destination", "start_date", "end_date", "cabin", "travelers"]
  }
};

const IATA_LIST = /^[A-Z]{3}(,[A-Z]{3}){0,5}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkSearch(input) {
  const origin = String(input.origin || "").toUpperCase().replace(/\s/g, "");
  const destination = String(input.destination || "").toUpperCase().replace(/\s/g, "");
  if (!IATA_LIST.test(origin) || !IATA_LIST.test(destination)) return { error: "Use 3-letter airport codes." };
  if (!DAY.test(input.start_date || "") || !DAY.test(input.end_date || "")) return { error: "Dates must be YYYY-MM-DD." };
  const a = new Date(input.start_date + "T12:00:00Z"), b = new Date(input.end_date + "T12:00:00Z");
  if (isNaN(a) || isNaN(b) || b < a) return { error: "The end date must be on or after the start date." };
  if ((b - a) / 86400000 > 60) return { error: "Search at most 60 days at a time." };
  if (input.end_date < hawaiiDate()) return { error: "Those dates are in the past." };
  const cabin = CABINS[input.cabin] ? input.cabin : null;
  if (!cabin) return { error: "Pick economy, premium, business or first." };
  const travelers = Math.min(9, Math.max(1, parseInt(input.travelers, 10) || 1));
  return { origin, destination, start: input.start_date, end: input.end_date, cabin, travelers };
}

async function searchSeats(env, q, ctx) {
  const url = new URL(SEATS_API);
  url.searchParams.set("origin_airport", q.origin);
  url.searchParams.set("destination_airport", q.destination);
  url.searchParams.set("start_date", q.start);
  url.searchParams.set("end_date", q.end);
  url.searchParams.set("cabins", q.cabin);
  url.searchParams.set("order_by", "lowest_mileage");
  url.searchParams.set("take", "200");
  const res = await fetch(url.toString(), { headers: { "Partner-Authorization": env.SEATS_AERO_KEY, accept: "application/json" } });
  if (!res.ok) return { error: "The award search service did not answer (" + res.status + ")." };
  const body = await res.json();
  const k = CABINS[q.cabin];
  const rows = (body.data || [])
    .filter((r) => r[k + "Available"])
    .map((r) => {
      const seats = parseInt(r[k + "RemainingSeats"], 10) || 0;
      return {
        date: r.Date,
        from: r.Route && r.Route.OriginAirport,
        to: r.Route && r.Route.DestinationAirport,
        program: r.Source || (r.Route && r.Route.Source),
        cabin: q.cabin,
        miles: parseInt(r[k + "MileageCost"], 10) || null,
        seats: seats || null,
        airlines: r[k + "Airlines"] || "",
        direct: !!r[k + "Direct"],
        lastSeen: r.UpdatedAt || ""
      };
    })
    /* seats.aero gives 0 when it does not know the count: keep those, flag them */
    .filter((r) => r.miles && (r.seats === null || r.seats >= q.travelers));
  const shown = ctx && ctx.hideAtmos ? rows.filter((r) => !hideForNonPro(r)) : rows;
  const atmosHidden = shown.length < rows.length;
  const out = shown
    .sort((a, b) => a.miles - b.miles || a.date.localeCompare(b.date))
    .slice(0, q.keep || 12);
  if (ctx) out.forEach((r) => { r.book = bookingFor(r.program, ctx.held, ctx.partners, ctx.bonuses); });
  const found = { results: out, travelers: q.travelers };
  if (atmosHidden) found.atmosHidden = "Atmos Rewards award seats on Alaska and Hawaiian flights were found but are not shown. They are in the Atmos Reward Calendar (HRT PRO).";
  return found;
}

/* ---------------------------- trip planner ---------------------------- */

const PLAN_TOOL = {
  name: "plan_trip",
  description:
    "Plan a round trip on points: searches seats.aero for the way out and the way back, pairs them by trip length, " +
    "optionally tries West Coast gateways (LAX, SFO, SEA) when Hawaii has few seats, and works out how many points " +
    "the whole group needs from which of the member's cards. Use this for round trips or trip planning; use " +
    "search_award_seats for a one-way or a single date. Ask for missing details first (where, roughly when, how long, cabin, how many people).",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Home airport code(s), usually HNL. Comma separated allowed." },
      destination: { type: "string", description: "Destination airport code(s), e.g. HND,NRT for Tokyo" },
      depart_start: { type: "string", description: "Earliest departure, YYYY-MM-DD" },
      depart_end: { type: "string", description: "Latest departure, YYYY-MM-DD, at most 31 days after depart_start" },
      nights_min: { type: "integer", minimum: 1, maximum: 30 },
      nights_max: { type: "integer", minimum: 1, maximum: 30 },
      cabin: { type: "string", enum: ["economy", "premium", "business", "first"] },
      travelers: { type: "integer", minimum: 1, maximum: 9 },
      include_west_coast: { type: "boolean", description: "Also try LAX, SFO and SEA as gateways. Uses more searches." },
      points: {
        type: "object",
        description: "Point balances the member told you in this chat, by program: chase, amex, capital-one, citi, bilt, atmos",
        additionalProperties: { type: "integer" }
      }
    },
    required: ["origin", "destination", "depart_start", "depart_end", "nights_min", "nights_max", "cabin", "travelers"]
  }
};

const GATEWAYS = "LAX,SFO,SEA";
const BANK_LABEL = { chase: "Chase Ultimate Rewards", amex: "Amex Membership Rewards", "capital-one": "Capital One miles", citi: "Citi ThankYou Points", bilt: "Bilt Rewards", atmos: "Atmos Rewards points" };

function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) { return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000); }

function checkPlan(input) {
  const out = checkSearch({ origin: input.origin, destination: input.destination, start_date: input.depart_start, end_date: input.depart_end, cabin: input.cabin, travelers: input.travelers });
  if (out.error) return out;
  if (daysBetween(out.start, out.end) > 31) return { error: "Keep the departure window to about a month." };
  let lo = parseInt(input.nights_min, 10), hi = parseInt(input.nights_max, 10);
  if (!(lo >= 1) || !(hi >= 1)) return { error: "Say how many nights, roughly." };
  if (hi < lo) { const t = lo; lo = hi; hi = t; }
  lo = Math.min(lo, 30); hi = Math.min(hi, 30);
  return Object.assign(out, { nightsMin: lo, nightsMax: hi, westCoast: !!input.include_west_coast });
}

/* Balances: what the member said in chat wins over what My Wallet has. */
function budgetFrom(wallet, said) {
  const b = {};
  ((wallet && wallet.points) || []).forEach((p) => {
    const k = String(p.program || "").toLowerCase();
    const key = /chase|ultimate/.test(k) ? "chase" : /amex|membership/.test(k) ? "amex" : /capital/.test(k) ? "capital-one"
      : /citi|thankyou/.test(k) ? "citi" : /bilt/.test(k) ? "bilt" : /atmos|alaska|hawaiian/.test(k) ? "atmos" : null;
    if (key && Number(p.balance) > 0) b[key] = Number(p.balance);
  });
  Object.keys(said || {}).forEach((k) => { const v = parseInt(said[k], 10); if (BANK_LABEL[k] && v > 0) b[k] = v; });
  return b;
}

/* The member's best way to pay for one leg. */
function payFor(leg) {
  const bk = leg.book || {};
  if (bk.direct) return { bank: "atmos", a: 1, b: 1, bonusPct: 0 };
  const mine = (bk.transferFrom || []).find((p) => p.yours);
  return mine ? { bank: mine.bank, a: mine.a, b: mine.b, bonusPct: mine.bonusPct || 0 } : null;
}

/* Points to move from a bank for a leg. Transfers go in 1,000s. */
function bankPoints(miles, travelers, pay) {
  const raw = miles * travelers * (pay.a / pay.b) / (1 + (pay.bonusPct || 0) / 100);
  return Math.ceil(raw / 1000) * 1000;
}

function pairTrips(outs, backs, q, budget) {
  const combos = [];
  outs.forEach((o) => backs.forEach((r) => {
    const nights = daysBetween(o.date, r.date);
    if (nights < q.nightsMin || nights > q.nightsMax) return;
    const gateway = o.from !== q.origin.split(",")[0] || r.to !== q.origin.split(",")[0];
    const po = payFor(o), pr = payFor(r);
    const plan = {};
    [[o, po], [r, pr]].forEach(([leg, pay]) => {
      if (!pay) return;
      plan[pay.bank] = (plan[pay.bank] || 0) + bankPoints(leg.miles, q.travelers, pay);
    });
    const planList = Object.keys(plan).map((bank) => ({
      from: BANK_LABEL[bank] || bank,
      points: plan[bank],
      have: budget[bank] || null,
      enough: budget[bank] ? budget[bank] >= plan[bank] : null
    }));
    const covered = !!(po && pr);
    const short = planList.some((x) => x.enough === false);
    combos.push({
      nights, gateway,
      out: o, back: r,
      milesPerPerson: o.miles + r.miles,
      milesTotal: (o.miles + r.miles) * q.travelers,
      transferPlan: planList,
      usesYourCards: covered,
      fitsYourBalance: covered && !short && planList.every((x) => x.enough !== null) ? true : (short ? false : null),
      score: (o.miles + r.miles) + (covered ? 0 : 400000) + (short ? 200000 : 0) + (gateway ? 30000 : 0)
    });
  }));
  combos.sort((a, b) => a.score - b.score);
  /* keep variety: no two plans with the same pair of dates and programs */
  const seen = {}, top = [];
  combos.forEach((c) => {
    const k = c.out.date + c.out.program + c.back.date + c.back.program;
    if (!seen[k] && top.length < 3) { seen[k] = 1; top.push(c); }
  });
  top.forEach((c) => { delete c.score; });
  return top;
}

async function planTrip(env, q, ctx, takeSearch) {
  const runs = [];
  async function run(origin, destination, start, end) {
    if (!(await takeSearch())) return { error: "Daily search limit reached." };
    try {
      return await searchSeats(env, { origin, destination, start, end, cabin: q.cabin, travelers: q.travelers, keep: 40 }, ctx);
    } catch (e) { return { error: "The award search service did not answer." }; }
  }
  const backStart = addDays(q.start, q.nightsMin), backEnd = addDays(q.end, q.nightsMax);
  const out = await run(q.origin, q.destination, q.start, q.end);
  const back = await run(q.destination, q.origin, backStart, backEnd);
  if (out.error && back.error) return { error: out.error };
  let outs = out.results || [], backs = back.results || [];
  runs.push("Way out " + q.origin + " to " + q.destination + ": " + outs.length + " options");
  runs.push("Way back: " + backs.length + " options");

  let trips = pairTrips(outs, backs, q, ctx.budget);
  if (q.westCoast || trips.length < 2) {
    const gOut = await run(GATEWAYS, q.destination, q.start, q.end);
    const gBack = await run(q.destination, GATEWAYS, backStart, backEnd);
    const go = gOut.results || [], gb = gBack.results || [];
    runs.push("West Coast gateways: " + go.length + " out, " + gb.length + " back");
    if (go.length || gb.length) {
      trips = pairTrips(outs.concat(go), backs.concat(gb), q, ctx.budget);
    }
  }
  return {
    trips,
    atmosHidden: out.atmosHidden || back.atmosHidden || undefined,
    travelers: q.travelers,
    searched: runs,
    notes: [
      "Results are cached from seats.aero, not live.",
      "A gateway trip needs a separate flight between Hawaii and the West Coast (Atmos points, Southwest or cash), booked on its own ticket with time to spare.",
      "Transfer points only after the seat is confirmed on the program's site."
    ]
  };
}

/* ---------------------------- seat alerts ----------------------------
   ʻOhana only. A member's alerts live in KV under "alerts:<memberId>".
   There is no timer yet: alerts are checked when the member opens the
   dashboard, at most once every ALERT_EVERY_HOURS (default 6) per alert.
   The first check of a new alert only records what is already there, so
   the member hears about seats that open up AFTER they asked.
   Email comes later (a timer Worker plus Resend). */

const OFFER = "[[OFFER_WATCH]]";
const MAX_ALERTS = 3;

const WATCH_TOOL = {
  name: "watch_seats",
  description:
    "Save a seat alert: HRT checks this route a few times a day and shows newly opened award seats in this chat. Use only when the member asks you to watch, track or alert them about a route. Max 3 alerts per member. " +
    "Ask for anything missing first.",
  input_schema: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Origin airport code(s), comma separated" },
      destination: { type: "string", description: "Destination airport code(s), comma separated" },
      start_date: { type: "string", description: "First departure date to watch, YYYY-MM-DD" },
      end_date: { type: "string", description: "Last departure date to watch, YYYY-MM-DD, at most 60 days after start_date" },
      cabin: { type: "string", enum: ["economy", "premium", "business", "first"] },
      travelers: { type: "integer", minimum: 1, maximum: 9 },
      max_miles: { type: "integer", description: "Optional: only alert at or under this many miles per person" }
    },
    required: ["origin", "destination", "start_date", "end_date", "cabin", "travelers"]
  }
};

const UNWATCH_TOOL = {
  name: "stop_watching",
  description: "Delete one of the member's seat alerts when they ask you to stop watching a route. Use the id from their alert list.",
  input_schema: { type: "object", properties: { alert_id: { type: "string" } }, required: ["alert_id"] }
};

function checkWatch(w) {
  const q = checkSearch({
    origin: w.origin, destination: w.destination,
    start_date: w.start_date || w.start, end_date: w.end_date || w.end,
    cabin: w.cabin, travelers: w.travelers
  });
  if (q.error) return q;
  const max = parseInt(w.max_miles || w.maxMiles, 10);
  q.maxMiles = max > 0 ? max : null;
  return q;
}

async function loadAlerts(env, id) {
  try {
    const v = JSON.parse((await env.ASK_SCOTTIE.get("alerts:" + id)) || "[]");
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
async function saveAlerts(env, id, list) {
  await env.ASK_SCOTTIE.put("alerts:" + id, JSON.stringify(list));
}

function seatKey(r) { return [r.date, r.program, r.from, r.to].join("|"); }
function sameRoute(a, q) {
  return a.origin === q.origin && a.destination === q.destination && a.start === q.start && a.end === q.end && a.cabin === q.cabin && a.travelers === q.travelers;
}

/* Search once for an alert. New = a seat not in the last snapshot, or the same
   seat for fewer miles. Returns how many new seats were found. */
async function checkAlert(env, a, ctx, baseline) {
  const today = hawaiiDate();
  a.checked = Date.now();
  let res;
  try {
    res = await searchSeats(env, { origin: a.origin, destination: a.destination, start: a.start < today ? today : a.start, end: a.end, cabin: a.cabin, travelers: a.travelers, keep: 60 }, ctx);
  } catch (e) { return 0; }
  if (res.error) return 0;
  const before = a.seen || {}, now = {}, fresh = [];
  res.results.forEach((r) => {
    const k = seatKey(r);
    now[k] = Math.min(now[k] || Infinity, r.miles);
    const was = before[k];
    if (!baseline && (was === undefined || r.miles < was) && (!a.maxMiles || r.miles <= a.maxMiles)) fresh.push(r);
  });
  a.seen = now;
  a.best = res.results.length ? { miles: res.results[0].miles, date: res.results[0].date, count: res.results.length } : null;
  if (fresh.length) {
    const stamp = new Date().toISOString();
    fresh.forEach((r) => { r.foundAt = stamp; });
    const keys = fresh.map(seatKey);
    a.hits = fresh.concat((a.hits || []).filter((h) => keys.indexOf(seatKey(h)) < 0))
      .filter((h) => h.date >= today).slice(0, 6);
    a.unread = (a.unread || 0) + fresh.length;
  }
  return fresh.length;
}

function publicAlert(a) {
  return {
    id: a.id, origin: a.origin, destination: a.destination, start: a.start, end: a.end,
    cabin: a.cabin, travelers: a.travelers, maxMiles: a.maxMiles || null,
    checked: a.checked ? new Date(a.checked).toISOString() : null,
    best: a.best || null, hits: a.hits || [], unread: a.unread || 0
  };
}

async function alertCtx(env, request, m) {
  const [catalog, partners, bonuses] = await Promise.all([loadCatalog(env, request), loadPartners(env, request), loadBonuses()]);
  return { held: memberBanks((m.member.json || {}).wallet, catalog), partners, bonuses, hideAtmos: !m.pro };
}

/* Drop past alerts and check the ones that are due. */
async function refreshAlerts(env, request, m) {
  const today = hawaiiDate();
  const list = await loadAlerts(env, m.id);
  const live = list.filter((a) => a.end >= today);
  const every = (parseFloat(env.ALERT_EVERY_HOURS || "6") || 6) * 3600000;
  const due = live.filter((a) => Date.now() - (a.checked || 0) >= every);
  let changed = live.length !== list.length;
  if (due.length && env.SEATS_AERO_KEY) {
    const ctx = await alertCtx(env, request, m);
    for (const a of due) {
      if ((await spend(env, "alertcheck", m.id, MAX_ALERTS * 6)) < 0) break;
      await checkAlert(env, a, ctx, !a.checked);
      changed = true;
    }
  }
  if (changed) await saveAlerts(env, m.id, live);
  return live;
}

/* Add up to 2 alerts (a trip watches the way out and the way back).
   Each new alert gets its first, silent check right away. */
async function addAlerts(env, request, m, inputs) {
  const qs = [];
  for (const w of inputs.slice(0, 2)) {
    const q = checkWatch(w || {});
    if (q.error) return { error: q.error };
    qs.push(q);
  }
  if (!qs.length) return { error: "Nothing to watch." };
  const today = hawaiiDate();
  const list = (await loadAlerts(env, m.id)).filter((a) => a.end >= today);
  const fresh = qs.filter((q) => !list.some((a) => sameRoute(a, q)));
  if (list.length + fresh.length > MAX_ALERTS) {
    return { error: "full", note: "You can watch " + MAX_ALERTS + " routes at a time. Ask me to stop watching one first." };
  }
  const ctx = fresh.length ? await alertCtx(env, request, m) : null;
  for (const q of fresh) {
    const a = {
      id: crypto.randomUUID().slice(0, 8), origin: q.origin, destination: q.destination, start: q.start, end: q.end,
      cabin: q.cabin, travelers: q.travelers, maxMiles: q.maxMiles, created: Date.now(), checked: 0, seen: {}, hits: [], unread: 0
    };
    await checkAlert(env, a, ctx, true);
    list.push(a);
  }
  await saveAlerts(env, m.id, list);
  return { ok: true, added: fresh.length, alerts: list.map(publicAlert) };
}

/* What the "Yes, watch it" button would save, from the last search or trip plan. */
function watchFromSearch(q) {
  return [{ origin: q.origin, destination: q.destination, start: q.start, end: q.end, cabin: q.cabin, travelers: q.travelers }];
}
function watchFromPlan(q) {
  const backEnd = addDays(q.end, q.nightsMax);
  return [
    { origin: q.origin, destination: q.destination, start: q.start, end: q.end, cabin: q.cabin, travelers: q.travelers },
    { origin: q.destination, destination: q.origin, start: addDays(q.start, q.nightsMin), end: backEnd, cabin: q.cabin, travelers: q.travelers }
  ];
}

function describeAlerts(list) {
  if (!list.length) return "(none yet)";
  return list.map((a) => "- [id " + a.id + "] " + a.origin + " to " + a.destination + ", " + a.cabin + " for " + a.travelers + ", departing " + a.start + " to " + a.end +
    (a.maxMiles ? ", under " + a.maxMiles + " miles" : "") + (a.best ? ". Cheapest seen: " + a.best.miles + " miles on " + a.best.date : ". Nothing seen yet")).join("\n");
}

/* ------------------------ FAQ knowledge base ------------------------
   Scottie's FAQ knowledge base (306+ entries, "### ID: question" format) lives
   in KV. It is too big to send whole on every question, so the server picks
   the entries that best match what the member asked. Long files can be split
   across KV keys "knowledge", "knowledge-2" ... "knowledge-9"; they are joined
   in that order. An older plain-text knowledge file (no ### entries) is still
   sent whole. */

const KB_PARTS = ["knowledge", "knowledge-2", "knowledge-3", "knowledge-4", "knowledge-5", "knowledge-6", "knowledge-7", "knowledge-8", "knowledge-9"];
const KB_PICK = 8;
const STOP = new Set(("a an and are as at be but by can do does for from get got have how i if in is it its me my of on or our should so that the their them then there they this to was we what when where which who why will with you your im ive id dont cant just want like about any some more much many also would could into out up our us").split(" "));
let kbCache = null;

function kbWords(t) {
  return String(t || "").toLowerCase().replace(/[ʻ’']/g, "").replace(/[^a-z0-9$%]+/g, " ").split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function parseKb(raw) {
  const chunks = String(raw || "").split(/\n(?=### )/);
  const entries = [];
  chunks.forEach((c) => {
    const m = c.match(/^### ([A-Z]{2,4}-\d+[a-z]?):\s*(.+)/);
    if (!m) return;
    const ask = (c.match(/People also ask:\s*(.+)/) || [])[1] || "";
    const who = (c.match(/Who can see it:\s*(.+)/) || [])[1] || "";
    const head = new Set(kbWords(m[2] + " " + ask + " " + m[1]));
    const body = new Set(kbWords(c));
    entries.push({ id: m[1], title: m[2].trim(), who: who.trim(), text: c.replace(/\n## [^\n]*\s*$/, "").trim(), head, body });
  });
  const df = {};
  entries.forEach((e) => e.body.forEach((w) => { df[w] = (df[w] || 0) + 1; }));
  return { entries, df, n: entries.length };
}

async function loadKb(env) {
  if (kbCache && Date.now() - kbCache.at < 600000) return kbCache;
  const parts = await Promise.all(KB_PARTS.map((k) => env.ASK_SCOTTIE.get(k)));
  const raw = parts.filter(Boolean).join("\n");
  const parsed = parseKb(raw);
  kbCache = { at: Date.now(), raw, ...parsed };
  return kbCache;
}

/* Score entries against the member's last two messages (the latest counts double). */
function pickEntries(kb, messages, opts) {
  const users = messages.filter((m) => m.role === "user" && typeof m.content === "string");
  const latest = kbWords((users[users.length - 1] || {}).content);
  const before = kbWords((users[users.length - 2] || {}).content);
  const q = {};
  latest.forEach((w) => { q[w] = 2; });
  before.forEach((w) => { q[w] = Math.max(q[w] || 0, 1); });
  const scored = kb.entries
    .filter((e) => opts.client || !/only/i.test(e.who))
    .map((e) => {
      let s = 0;
      Object.keys(q).forEach((w) => {
        if (!e.body.has(w)) return;
        const idf = Math.log(1 + kb.n / (kb.df[w] || 1));
        s += q[w] * idf * (e.head.has(w) ? 3 : 1);
      });
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, KB_PICK);
  return scored.map((x) => x.e);
}

function knowledgeText(kb, messages, opts) {
  if (!kb.raw) return "(empty)";
  if (!kb.n) return kb.raw.slice(0, 60000);
  const picked = pickEntries(kb, messages, opts);
  if (!picked.length) return "(No FAQ entry matched this question closely. Coach from the playbook and partner table, or say you're not sure.)";
  return picked.map((e) => e.text).join("\n\n");
}

/* ----------------------------- prompts ----------------------------- */

const BANK_KEYS = ["chase", "amex", "capital-one", "citi", "bilt"];

/* Every bank's airline partners, so the coach can answer for points the
   member mentions in chat even if those cards aren't in My Wallet yet. */
function describeAllPartners(held, partners) {
  return BANK_KEYS.filter((b) => partners[b]).map((bank) => {
    const list = ((partners[bank] || {}).p || []).filter((x) => x[1] === "airline")
      .map((x) => x[0] + " " + (x[2] === 1 && x[3] === 1 ? "1:1" : x[2] + ":" + x[3]));
    const mine = held[bank] === "yes" ? " (they hold this)" : held[bank] === "cashback" ? " (they hold Chase cash back cards only)" : "";
    return "- " + partners[bank].name + mine + ": " + list.join(", ");
  }).join("\n");
}

/* Live transfer bonuses from HRT's daily tracker. */
function describeBonuses(bonuses, held) {
  if (!bonuses || !bonuses.length) return "None live right now (or the tracker could not be reached; then say you're not sure and to check the Transfer Bonuses page).";
  return bonuses.slice(0, 40).map((b) => {
    const mine = held[b.bank] === "yes" ? " [their bank]" : "";
    return "- " + (b.bankName || b.bank) + " to " + b.partner + ": +" + b.bonusPct + "%" +
      (b.bonusRatio ? " (" + b.transferRatio + " becomes " + b.bonusRatio + ")" : "") +
      (b.expiresDate ? ", ends " + b.expiresDate : "") + mine;
  }).join("\n");
}

function coachContext(m, walletText, held, partners, bonuses, historyText) {
  const lines = [
    "MEMBER CONTEXT (from the HRT dashboard, not from the member):",
    "- Today in Hawaii: " + hawaiiDate(),
    "- First name: " + (m.firstName || "unknown"),
    "- Plans: " + [m.client ? "ʻOhana Member" : null, m.pro ? "HRT PRO" : null].filter(Boolean).join(" and "),
    "",
    "Their cards in My Wallet:",
    walletText,
    "",
    "HRT's transfer partner table (airlines; ratios are bank points to airline miles and can change):",
    describeAllPartners(held, partners),
    "",
    "Live transfer bonuses today (HRT's tracker, checked daily):",
    describeBonuses(bonuses, held),
    "",
    "Past transfer bonuses (most recent first, from HRT's tracker):",
    historyText || "(none recorded yet)",
    "",
    "WHAT ASK SCOTTIE IS (this overrides anything in the rulebook about award searches):",
    "- You are my points coach for ʻOhana Members. You teach them HOW to redeem their points: the best way to pay, which programs to use, and the steps and rules. You do NOT look up live award seats, dates or prices, and you have no search tool.",
    "- Never claim a seat, date or price is available. If they ask \"is there space on March 10?\", say you coach on the strategy and they can check on the airline's site (or the portal); give them what to look for.",
    "- You may give typical award ranges as rough guides (\"usually around\"), and say they change. Use my playbook's numbers when it has them.",
    "- If they ask for availability or dates, be upfront: \"We don't do award seat availability yet, but I can walk you through exactly how to find it.\"",
    "",
    "USING MY FAQ ENTRIES (at the end of this context):",
    "- If an entry matches the question, lead with its Short answer in your own words, staying faithful to its facts. Add More detail when it helps.",
    "- If an entry says \"Hand off to Scottie: Yes\", end with the handoff to the real me.",
    "- Share the entry's HRT source link when it helps them read more.",
    "- For redemption questions, my playbook and today's partner table and bonuses win over an older FAQ entry if they disagree.",
    "",
    "HOW I COACH A REDEMPTION (follow this order, keep each part to a line or two):",
    "1. If the key facts are missing, ask 1 or 2 quick questions first: where and roughly when, how many people, cabin, and which points and how many. If they gave enough, go straight to the answer.",
    "2. Portal first, always. For Chase, Amex or Capital One points, start with that bank's travel portal: it's the most dependable and priced like cash, so they can see right away if it's a good deal.",
    "   - Chase Travel (https://ultimaterewards.chase.com): Points Boost can make points worth more on select flights and hotels. Sapphire Reserve up to 2 cents a point, Sapphire Preferred and Ink Business Preferred up to 1.75 cents on flights and 1.5 on hotels. Without a boost it's 1 cent. Offers change by booking.",
    "   - Amex Travel (https://www.amextravel.com) and Capital One Travel (https://travel.capitalone.com): check and compare first too.",
    "3. Then lead them down the path, not just a name. For each of the 1 to 3 best options (only ones their points actually transfer to, from the table above): the program and airline, the ratio, roughly how many points one way per person, what that means for their balance and their group, whether there's a transfer bonus today, and if not, when the last one was and how big (from the history above, e.g. \"no bonus right now, but Capital One to JAL had 30% in September, they come around a few times a year\").",
    "4. The rules before they transfer: open the airline account first, in their own name, matching their ID; find the seat on the airline's site BEFORE moving points; transfers are one way and can't be moved back; most are instant, some take a few days; taxes and fees are extra.",
    "5. Close by reminding them to look at the portal first, and offer the real me by text for anything personal or complicated.",
    "",
    "EXAMPLE OF MY STYLE (for tone and order, not facts to copy word for word):",
    "Member: \"Hey Scottie, I have about 80,000 points. Definitely want to fly to Japan next spring. I have Chase and Capital One miles. What's the best way to get there?\"",
    "Me: \"Howzit Kalei! Japan in the spring, love it. Quick q's: how many of you are going, & economy or business?",
    "Here's how I'd play it:",
    "- **Check Chase Travel first.** It's priced like cash & it's the most dependable. With Points Boost, your Chase points can go further on select flights.",
    "- **Capital One miles to JAL.** One of my favorite ways to Japan. Capital One moves to JAL at 4:3, so 40K miles becomes 30K JAL miles. No transfer bonus right now, but the last one was 30% in September & they come around a few times a year.",
    "- **Chase points to Virgin Atlantic for ANA, or Aeroplan or United.** Space comes & goes, so be flexible on dates.",
    "Before you transfer: open your own account with the airline, find the seat first, & remember transferred points can't be reversed.",
    "As always, look at the portal first :-)\"",
    "",
    "ATMOS REWARDS:",
    m.pro
      ? "- This member has HRT PRO. For any Atmos redemption question, coach them, then point them to the Atmos Reward Calendar in the sidebar: it checks Atmos award space every day on 15 major routes from Honolulu."
      : "- For any Atmos redemption question, coach them, then say: we don't do award seat availability yet, but if they want a daily check of Atmos data from Honolulu, my Atmos Reward Calendar searches every day on 15 major routes from Honolulu, part of HRT PRO for $9.99 a month. Then add " + ATMOS_PITCH + " on its own line; the app shows an Unlock button. Once per chat at most.",
    "",
    "THINGS I NEVER DO:",
    "- Never recommend applying for a specific new card or say what their next card should be. That's a handoff to the real me.",
    "- Never guess at numbers you don't have. If unsure, say so and offer a text with me.",
    "",
    "HOW YOUR ANSWER IS SHOWN:",
    "- Plain text in a phone chat bubble. Detailed and personal, like I'm texting them the full game plan, but easy to scan: short lines, **bold** for the key move, short lists with '- '. No headings, no tables, no emoji. Greet with their first name on your first reply only (my voice guide has the greetings); after that, no greeting.",
    "- Never use em dashes or en dashes.",
    "- When you hand off to the real Scottie, end your message with " + HANDOFF + " on its own line. The app turns it into a Text Scottie button. Never write a phone number."
  ];
  return lines.join("\n");
}

function memberContext(m, walletText, opts, partnerText) {
  const lines = [
    "MEMBER CONTEXT (from the HRT dashboard, not from the member):",
    "- Today in Hawaii: " + hawaiiDate(),
    "- First name: " + (m.firstName || "unknown"),
    "- Plans: " + [m.client ? "ʻOhana Member" : null, m.pro ? "HRT PRO" : null].filter(Boolean).join(" and "),
    "- Mode: Coach Mode (Part 3 of the rulebook)." + (m.pro ? " This member also has HRT PRO, but the Atmos Reward Seat Finder is not switched on yet, so for Atmos calendar data point them to the Atmos Reward Calendar in the sidebar." : ""),
    "- Award search: " + (opts.searchesLeft > 0 ? "available through search_award_seats, only if they ask (" + opts.searchesLeft + " searches left today)." : "used up for today. Say so kindly if they ask."),
    "",
    "Their cards in My Wallet:",
    walletText,
    "",
    "Where their card points can go (HRT's transfer partner table; ratios can change):",
    partnerText,
    "",
    "BOOKING HELP:",
    "- Each search result includes \"book\": the program to book with (bookAt is its website), whether their own points book it directly, and which of their points can transfer there (ratio, any live transfer bonus, transferAt is the bank's site).",
    "- When they ask how to book, give 3 short steps: 1) find the same seat on the program's site, 2) only then transfer from their bank (say which one, the ratio, and any bonus), 3) book. Link the sites as plain URLs.",
    "- Prefer paths where yours is true. If none of their cards transfer there, say so plainly and suggest a result they can book with their own points.",
    "- If they entered a points balance, say whether it looks like enough for everyone traveling, and note taxes and fees are extra.",
    "",
    "ATMOS REWARDS AWARD SEATS:",
    m.pro
      ? "- This member has HRT PRO, so searches include Atmos Rewards seats on Alaska and Hawaiian flights. For browsing Atmos dates, the Atmos Reward Calendar in the sidebar is the best tool."
      : "- This member does not have HRT PRO. Searches leave out Atmos Rewards award seats on Alaska and Hawaiian flights (Atmos partner awards like JAL still show). " +
        "If they ask about Atmos award seats, Alaska or Hawaiian award flights, or booking with Atmos points on Alaska or Hawaiian, do not search for them. " +
        "Tell them warmly, in your own words, that this is exactly what your Atmos Reward Calendar is for: every Atmos saver date from Hawaiʻi, updated every morning, part of HRT PRO for $9.99 a month. " +
        "Then add " + ATMOS_PITCH + " on its own line; the app shows an Unlock button. If a search result says atmosHidden, mention it the same way. Do not pitch it otherwise, and never more than once in a chat.",
    "",
    "TRAVEL PORTAL FIRST (Scottie's rule):",
    "- Whenever the member mentions Chase, Amex or Capital One points, or your answer, search or trip plan would use them, always tell them to first check that bank's travel portal and compare it with transferring to an airline. One short sentence is enough. Name only the banks that apply:",
    "  Chase Travel: https://ultimaterewards.chase.com",
    "  Amex Travel: https://www.amextravel.com",
    "  Capital One Travel: https://travel.capitalone.com",
    "- Do not quote portal point values or prices; just tell them to check and compare before transferring.",
    "",
    "TRIP PLANNING:",
    "- For a round trip or \"help me plan a trip\", use plan_trip (it uses 2 to 4 searches). Ask first for anything missing: destination, rough dates, how many nights, cabin, how many people. Default origin HNL.",
    "- If they mention point balances in the chat, pass them in points (keys: chase, amex, capital-one, citi, bilt, atmos).",
    "- The app shows the best plan as a trip card (both flights, total points, transfer plan). In your message: say why it is the best fit in a sentence or two, mention one alternative if it is meaningfully different, then the booking order: confirm both seats, transfer, book the way out and the way back.",
    "- If a plan uses a West Coast gateway, say plainly they need a separate Hawaii to West Coast flight and should leave a buffer.",
    "- If a plan is short on points, say by how much and suggest the closest fix (a different date, a cheaper cabin one way, or another card's points). Never suggest applying for a new card: that is a handoff.",
    "",
    "SEAT ALERTS (" + MAX_ALERTS + " at a time; HRT checks a few times a day and shows new seats in this chat, with a badge on the Ask Scottie button; email alerts are not ready yet):",
    "- Their alerts now:",
    opts.alertsText || "(none yet)",
    "- After a search or trip plan, if nothing fits, too few seats, or the miles are high, offer to watch it: add " + OFFER + " on its own line at the end and ask in one short sentence if they want you to watch it. The app shows Yes and No buttons. Do not offer every time, and never when they already watch that route or have " + MAX_ALERTS + " alerts.",
    "- If they ask you to watch a route, use watch_seats. If they ask what you're watching, list it from above (never show the ids). To stop one, use stop_watching.",
    "",
    "HOW YOUR ANSWER IS SHOWN:",
    "- Plain text in a phone chat bubble. Keep it short. You may use **bold** and short lists with '- '. No headings, no tables.",
    "- Never use em dashes or en dashes.",
    "- When you hand off to the real Scottie, end your message with " + HANDOFF + " on its own line. The app turns it into a Text Scottie button. Never write a phone number.",
    "- After a search, the app shows the 3 cheapest results as cards under your message. Point out the best one or two in a sentence instead of listing every number again. Always say the results are cached, show when they were last seen if it matters, and remind them to confirm on the airline's site before transferring points."
  ];
  return lines.join("\n");
}

async function callClaude(env, system, messages, tools, toolChoice) {
  /* Sonnet 5.5 thinks up front by default, and thinking counts against
     max_tokens. A chat answer doesn't need it: "between_tools" turns off the
     up-front thinking. If a model ever rejects that setting, retry without it. */
  async function once(withThinking) {
    const body = {
      model: env.ASK_MODEL || "claude-sonnet-5-5",
      max_tokens: 4000,
      system,
      messages,
      tools,
      tool_choice: tools && toolChoice ? toolChoice : undefined
    };
    if (withThinking) body.thinking = { type: "between_tools" };
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }
  let res = await once(true);
  if (res.status === 400) {
    const t = await res.text();
    if (/thinking/i.test(t)) { console.log("ask-scottie thinking setting rejected, retrying", t.slice(0, 200)); res = await once(false); }
    else throw new Error("claude 400 " + t.slice(0, 300));
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error("claude " + res.status + " " + t.slice(0, 300));
  }
  return res.json();
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw.slice(-MAX_TURNS)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

function configProblem(env) {
  const missing = ["ANTHROPIC_API_KEY", "MEMBERSTACK_SECRET_KEY"].filter((k) => !env[k]);
  if (!env.ASK_SCOTTIE) missing.push("ASK_SCOTTIE (KV binding)");
  return missing.length ? missing : null;
}

/* ------------------------------ routes ------------------------------ */

/* GET: who am I, what can I do. Used to open the chat. */
export async function onRequestGet({ request, env }) {
  const missing = configProblem(env);
  if (missing) return json({ ok: false, error: "not_configured", missing }, 503);
  const m = await loadMember(env, bearer(request));
  if (m.error) return json({ ok: false, error: m.error }, 401);
  if (new URL(request.url).searchParams.get("alerts")) {
    if (!LIVE_SEARCH || !m.client || !env.SEATS_AERO_KEY) return json({ ok: true, client: m.client, alerts: [], unread: 0 });
    const list = await refreshAlerts(env, request, m);
    return json({ ok: true, client: true, max: MAX_ALERTS, alerts: list.map(publicAlert), unread: list.reduce((n, a) => n + (a.unread || 0), 0) });
  }
  const limit = parseInt(env.DAILY_MESSAGES || "40", 10);
  return json({
    ok: true,
    client: m.client,
    pro: m.pro,
    firstName: m.firstName,
    textNumber: m.client ? (env.SCOTTIE_TEXT_NUMBER || "") : "",
    remaining: await remaining(env, "msg", m.id, limit)
  });
}

/* POST { messages: [{ role, content }] } -> { reply, handoff, seats, remaining } */
export async function onRequestPost({ request, env }) {
  const missing = configProblem(env);
  if (missing) return json({ error: "not_configured", missing }, 503);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "bad_request" }, 400); }
  if (body && body.action) return alertAction(request, env, body);
  const messages = cleanHistory(body && body.messages);
  if (!messages) return json({ error: "bad_request" }, 400);

  const m = await loadMember(env, bearer(request));
  if (m.error) return json({ error: m.error }, 401);
  if (!m.client) return json({ error: m.pro ? "pro_coming_soon" : "ohana_only" }, 403);

  const msgLimit = parseInt(env.DAILY_MESSAGES || "40", 10);
  const left = await spend(env, "msg", m.id, msgLimit);
  if (left < 0) return json({ error: "daily_limit" }, 429);

  const [rulebook, kb, voice, playbook, catalog, partners, bonuses] = await Promise.all([
    env.ASK_SCOTTIE.get("rulebook"),
    loadKb(env),
    env.ASK_SCOTTIE.get("voice"),
    env.ASK_SCOTTIE.get("playbook"),
    loadCatalog(env, request),
    loadPartners(env, request),
    loadBonuses()
  ]);
  const wallet = (m.member.json || {}).wallet;
  if (!rulebook) return json({ error: "not_configured", missing: ["rulebook in KV"] }, 503);

  const searchLimit = parseInt(env.DAILY_SEARCHES || "15", 10);
  const canSearch = LIVE_SEARCH && !!env.SEATS_AERO_KEY;
  const searchesLeft = canSearch ? await remaining(env, "search", m.id, searchLimit) : 0;

  const system = [
    { type: "text", text: rulebook },
    { type: "text", text: (voice ? "MY VOICE (how I talk; follow it closely):\n\n" + voice + "\n\n" : "") + (playbook ? "MY REDEMPTION PLAYBOOK FROM HONOLULU (approved by me; typical prices, they change):\n\n" + playbook : "(no playbook yet)"), cache_control: { type: "ephemeral" } },
    { type: "text", text: "" }
  ];
  const kbText = knowledgeText(kb, messages, { client: m.client });
  const tools = canSearch ? [SEARCH_TOOL, PLAN_TOOL, WATCH_TOOL, UNWATCH_TOOL] : undefined;
  const ctx = { held: memberBanks(wallet, catalog), partners, bonuses, budget: budgetFrom(wallet, null), hideAtmos: !m.pro };
  const alerts = canSearch ? (await loadAlerts(env, m.id)).filter((a) => a.end >= hawaiiDate()) : [];
  system[2].text = LIVE_SEARCH
    ? memberContext(m, describeWallet(wallet, catalog), { searchesLeft, alertsText: describeAlerts(alerts) }, describePartners(ctx.held, partners))
    : coachContext(m, describeWallet(wallet, catalog), ctx.held, partners, bonuses, describeHistory(await bonusHistory(env, bonuses)));
  system[2].text += "\n\nMY FAQ KNOWLEDGE BASE: the entries that best match this question (my approved answers):\n\n" + kbText;

  let convo = messages.slice();
  let seats = null;
  let trip = null;
  let watch = null;
  let watched = null;
  let reply = "";
  try {
    const ROUNDS = 4;
    for (let round = 0; round < ROUNDS; round++) {
      /* The last round may not search again: it has to answer with what it has. */
      const last = round === ROUNDS - 1;
      const out = await callClaude(env, system, convo, tools, last ? { type: "none" } : null);
      console.log("ask-scottie round", round, "stop", out.stop_reason, "blocks", (out.content || []).map((b) => b.type).join(","));
      const uses = (out.content || []).filter((b) => b.type === "tool_use");
      const text = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (out.stop_reason !== "tool_use" || !uses.length) { reply = text; break; }

      convo.push({ role: "assistant", content: out.content });
      const results = [];
      for (const u of uses) {
        let result;
        if (u.name === "plan_trip") {
          const q = checkPlan(u.input || {});
          if (q.error) result = q;
          else {
            const said = (u.input && u.input.points) || null;
            const planCtx = Object.assign({}, ctx, { budget: budgetFrom(wallet, said) });
            result = await planTrip(env, q, planCtx, async () => (await spend(env, "search", m.id, searchLimit)) >= 0);
            if (result.trips && result.trips.length) { trip = { travelers: result.travelers, cabin: q.cabin, options: result.trips }; seats = null; }
            if (!result.error) watch = watchFromPlan(q);
            if (result.error) console.log("ask-scottie plan problem", result.error);
          }
        } else if (u.name === "watch_seats") {
          result = await addAlerts(env, request, m, [u.input || {}]);
          if (result.ok) { watched = result.alerts; result = { ok: true, added: result.added, note: "Saved. Tell them you will show new seats here in the chat, with a badge on the Ask Scottie button." }; }
        } else if (u.name === "stop_watching") {
          const id = String((u.input || {}).alert_id || "");
          const before = await loadAlerts(env, m.id);
          const kept = before.filter((a) => a.id !== id);
          if (kept.length === before.length) result = { error: "No alert with that id." };
          else { await saveAlerts(env, m.id, kept); result = { ok: true, note: "Stopped. Confirm in one short sentence." }; }
        } else if (u.name !== "search_award_seats") {
          result = { error: "Unknown tool." };
        } else {
          const q = checkSearch(u.input || {});
          if (q.error) result = q;
          else if ((await spend(env, "search", m.id, searchLimit)) < 0) result = { error: "Daily search limit reached." };
          else {
            try { result = await searchSeats(env, q, ctx); }
            catch (e) { result = { error: "The award search service did not answer." }; }
            if (result.error) console.log("ask-scottie search problem", result.error);
            if (result.results) seats = result.results.slice(0, 3);
            if (!result.error) watch = watchFromSearch(q);
          }
        }
        if (result.error) result.note = "Do not retry the same search. Answer the member with what you know, or suggest other dates.";
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) });
      }
      convo.push({ role: "user", content: results });
    }
  } catch (e) {
    console.log("ask-scottie error", e && e.message);
    return json({ error: "ai_unavailable" }, 502);
  }

  if (!reply) reply = "Sorry, I got tangled up on that one. Could you ask it a different way?";
  const handoff = reply.indexOf(HANDOFF) > -1;
  const atmosPitch = !m.pro && reply.indexOf(ATMOS_PITCH) > -1;
  const offer = reply.indexOf(OFFER) > -1 && watch && !watched && alerts.length + watch.length <= MAX_ALERTS;
  reply = noDashes(reply.split(HANDOFF).join("").split(OFFER).join("").split(ATMOS_PITCH).join("").trim());

  return json({
    reply,
    handoff,
    textNumber: handoff ? (env.SCOTTIE_TEXT_NUMBER || "") : "",
    seats,
    trip,
    watch: offer ? watch : null,
    watched: watched ? true : false,
    atmosPitch,
    remaining: left
  });
}

/* POST { action: "watch" | "unwatch" | "read", ... } from the chat buttons and
   the Dashboard card. No AI involved, so these don't count as messages. */
async function alertAction(request, env, body) {
  const m = await loadMember(env, bearer(request));
  if (m.error) return json({ error: m.error }, 401);
  if (!m.client) return json({ error: "ohana_only" }, 403);
  if (!LIVE_SEARCH || !env.SEATS_AERO_KEY) return json({ error: "not_available" }, 403);
  if (body.action === "watch") {
    const r = await addAlerts(env, request, m, Array.isArray(body.watch) ? body.watch : [body.watch]);
    return json(r, r.error ? 400 : 200);
  }
  const list = await loadAlerts(env, m.id);
  if (body.action === "unwatch") {
    const left = list.filter((a) => a.id !== String(body.id || ""));
    await saveAlerts(env, m.id, left);
    return json({ ok: true, alerts: left.map(publicAlert) });
  }
  if (body.action === "read") {
    list.forEach((a) => { a.unread = 0; });
    await saveAlerts(env, m.id, list);
    return json({ ok: true });
  }
  return json({ error: "bad_request" }, 400);
}
