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

async function searchSeats(env, q) {
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
  return { results: rows, travelers: q.travelers };
}

/* ----------------------------- prompts ----------------------------- */

function memberContext(m, walletText, opts) {
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
    "HOW YOUR ANSWER IS SHOWN:",
    "- Plain text in a phone chat bubble. Keep it short. You may use **bold** and short lists with '- '. No headings, no tables.",
    "- Never use em dashes or en dashes.",
    "- When you hand off to the real Scottie, end your message with " + HANDOFF + " on its own line. The app turns it into a Text Scottie button. Never write a phone number.",
    "- After a search, the app shows the 3 cheapest results as cards under your message. Point out the best one or two in a sentence instead of listing every number again. Always say the results are cached, show when they were last seen if it matters, and remind them to confirm on the airline's site before transferring points."
  ];
  return lines.join("\n");
}

async function callClaude(env, system, messages, tools) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.ASK_MODEL || "claude-sonnet-5-5",
      max_tokens: 900,
      system,
      messages,
      tools
    })
  });
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

  const [rulebook, knowledge, catalog] = await Promise.all([
    env.ASK_SCOTTIE.get("rulebook"),
    env.ASK_SCOTTIE.get("knowledge"),
    loadCatalog(env, request)
  ]);
  if (!rulebook) return json({ error: "not_configured", missing: ["rulebook in KV"] }, 503);

  const searchLimit = parseInt(env.DAILY_SEARCHES || "15", 10);
  const canSearch = !!env.SEATS_AERO_KEY;
  const searchesLeft = canSearch ? await remaining(env, "search", m.id, searchLimit) : 0;

  const system = [
    { type: "text", text: rulebook },
    { type: "text", text: "HRT KNOWLEDGE BASE (approved answers):\n\n" + (knowledge || "(empty)"), cache_control: { type: "ephemeral" } },
    { type: "text", text: memberContext(m, describeWallet((m.member.json || {}).wallet, catalog), { searchesLeft }) }
  ];
  const tools = canSearch ? [SEARCH_TOOL] : undefined;

  let convo = messages.slice();
  let seats = null;
  let reply = "";
  try {
    for (let round = 0; round < 3; round++) {
      const out = await callClaude(env, system, convo, tools);
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
            try { result = await searchSeats(env, q); }
            catch (e) { result = { error: "The award search service did not answer." }; }
            if (result.results) seats = result.results.slice(0, 3);
          }
        }
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
