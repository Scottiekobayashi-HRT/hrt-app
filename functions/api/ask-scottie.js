/* ---------------------------------------------------------------------------
   Ask Scottie: the server side of the chat.
   Lives at /api/ask-scottie on the hrt-app Cloudflare Pages project.

   NOTHING SECRET IS IN THIS FILE. The repo is public. Everything private is
   set in Cloudflare (hrt-app > Settings > Variables and Secrets / Bindings):

     ANTHROPIC_API_KEY      secret   Claude API key
     MEMBERSTACK_SECRET_KEY secret   Memberstack secret key (sk_sb_... in test mode)
     SEATS_AERO_KEY         secret   seats.aero key (award search for ʻOhana)
     SCOTTIE_TEXT_NUMBER    variable Scottie's business text number, e.g. +18085551234
     ASK_SCOTTIE            KV binding. Keys "rulebook" and "knowledge" hold the
                            private instructions and knowledge base. Daily
                            counters are kept here too.
     ASK_MODEL              variable optional, defaults to claude-sonnet-5-5
     DAILY_MESSAGES         variable optional, messages per member per day (default 40)
     DAILY_SEARCHES         variable optional, award searches per member per day (default 15)

   Who gets what (see the rulebook):
     ʻOhana (HRT Client plan)  coach mode, My Wallet, seats.aero when asked
     HRT PRO only              not built yet (Atmos Rewards Seat Finder comes next)
     Free                      nothing
--------------------------------------------------------------------------- */

const CLIENT_PLANS = ["pln_hrt-client-fddt0cb9"];
const PRO_PLANS = ["pln_atmos-calendar-irdd08f8", "pln_all-access-xsc20cqf"];
const MS_API = "https://admin.memberstack.com";
const SEATS_API = "https://seats.aero/partnerapi/search";
const HANDOFF = "[[TEXT_SCOTTIE]]";
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
let bonusCache = null, bonusAt = 0;
async function loadBonuses() {
  if (bonusCache && Date.now() - bonusAt < 3600000) return bonusCache;
  try {
    const r = await fetch(BONUS_FEED, { cf: { cacheTtl: 1800 } });
    const d = await r.json();
    const today = hawaiiDate();
    bonusCache = (d.bonuses || []).filter((x) => !x.expiresDate || x.expiresDate >= today);
    bonusAt = Date.now();
  } catch (e) {
    bonusCache = bonusCache || [];
  }
  return bonusCache;
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
function memberBanks(wallet, catalog) {
  const cards = (wallet && Array.isArray(wallet.cards)) ? wallet.cards.filter((c) => c && c.status !== "closed") : [];
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
  const live = cards.filter((c) => c && c.status !== "closed");
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
    .filter((r) => r.miles && (r.seats === null || r.seats >= q.travelers))
    .sort((a, b) => a.miles - b.miles || a.date.localeCompare(b.date))
    .slice(0, 12);
  if (ctx) rows.forEach((r) => { r.book = bookingFor(r.program, ctx.held, ctx.partners, ctx.bonuses); });
  return { results: rows, travelers: q.travelers };
}

/* ----------------------------- prompts ----------------------------- */

function memberContext(m, walletText, opts, partnerText) {
  const lines = [
    "MEMBER CONTEXT (from the HRT dashboard, not from the member):",
    "- Today in Hawaii: " + hawaiiDate(),
    "- First name: " + (m.firstName || "unknown"),
    "- Plans: " + [m.client ? "ʻOhana Member" : null, m.pro ? "HRT PRO" : null].filter(Boolean).join(" and "),
    "- Mode: Coach Mode (Part 3 of the rulebook)." + (m.pro ? " This member also has HRT PRO, but the Atmos Rewards Seat Finder is not switched on yet, so for Atmos calendar data point them to the Atmos Award Calendar in the sidebar." : ""),
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
  const messages = cleanHistory(body && body.messages);
  if (!messages) return json({ error: "bad_request" }, 400);

  const m = await loadMember(env, bearer(request));
  if (m.error) return json({ error: m.error }, 401);
  if (!m.client) return json({ error: m.pro ? "pro_coming_soon" : "ohana_only" }, 403);

  const msgLimit = parseInt(env.DAILY_MESSAGES || "40", 10);
  const left = await spend(env, "msg", m.id, msgLimit);
  if (left < 0) return json({ error: "daily_limit" }, 429);

  const [rulebook, knowledge, catalog, partners, bonuses] = await Promise.all([
    env.ASK_SCOTTIE.get("rulebook"),
    env.ASK_SCOTTIE.get("knowledge"),
    loadCatalog(env, request),
    loadPartners(env, request),
    loadBonuses()
  ]);
  const wallet = (m.member.json || {}).wallet;
  if (!rulebook) return json({ error: "not_configured", missing: ["rulebook in KV"] }, 503);

  const searchLimit = parseInt(env.DAILY_SEARCHES || "15", 10);
  const canSearch = !!env.SEATS_AERO_KEY;
  const searchesLeft = canSearch ? await remaining(env, "search", m.id, searchLimit) : 0;

  const system = [
    { type: "text", text: rulebook },
    { type: "text", text: "HRT KNOWLEDGE BASE (approved answers):\n\n" + (knowledge || "(empty)"), cache_control: { type: "ephemeral" } },
    { type: "text", text: "" }
  ];
  const tools = canSearch ? [SEARCH_TOOL] : undefined;
  const ctx = { held: memberBanks(wallet, catalog), partners, bonuses };
  system[2].text = memberContext(m, describeWallet(wallet, catalog), { searchesLeft }, describePartners(ctx.held, partners));

  let convo = messages.slice();
  let seats = null;
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
        if (u.name !== "search_award_seats") {
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
  reply = noDashes(reply.split(HANDOFF).join("").trim());

  return json({
    reply,
    handoff,
    textNumber: handoff ? (env.SCOTTIE_TEXT_NUMBER || "") : "",
    seats,
    remaining: left
  });
}
