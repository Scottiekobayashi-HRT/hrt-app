/* ---------------------------------------------------------------------------
   /api/site-news  (Cloudflare Pages Function, Oct 25 2026)

   The newest blog article and the newest travel deal from hawaiirewardtravel.com,
   for the Dashboard's "Today for you" lines.

   Why this exists: the Dashboard runs on tools.hawaiirewardtravel.com, and
   Squarespace's ?format=json feeds do not allow other sites to read them from
   a browser. This function reads them on Cloudflare's side and hands back a
   tiny JSON. It is the same two feeds the homepage uses:
     /bloghome?format=json      (articles)
     /traveldeals?format=json   (deals; optional tags "price:$238", "route:HNL to LAX")

   Also: Scottie's Deal Drop / HRT Update, any post tagged "drop" or "update"
   (see dropOf below).

   Cached for 15 minutes so Squarespace sees at most a few requests an hour.
   Any failure answers { article:null, deal:null } and the Dashboard simply
   skips that line. No keys, nothing secret.
--------------------------------------------------------------------------- */
const SITE = "https://www.hawaiirewardtravel.com";
const FEEDS = { article: "/bloghome?format=json", deal: "/traveldeals?format=json" };
const TTL = 900;

function clean(s, n) {
  const t = String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ").trim();
  return n && t.length > n ? t.slice(0, n - 1).trim() + "…" : t;
}
function tag(tags, prefix) {
  const hit = (tags || []).find((t) => String(t).toLowerCase().indexOf(prefix) === 0);
  return hit ? clean(String(hit).slice(prefix.length), 40) : "";
}
function absUrl(u) {
  if (!u) return "";
  if (/^https:\/\//i.test(u)) return u;
  return u.charAt(0) === "/" ? SITE + u : "";
}

/* Scottie's Deal Drop or HRT Update: the newest post tagged "drop" (a deal) or
   "update" (an announcement; "announcement" and "news" work too) on either feed.
   Optional tags: "ends:2026-11-15" (comes down after that day, Hawaii time;
   no ends tag = up for 7 days after it was published) and "for:pro" /
   "for:ohana" (who sees it; default everyone). */
export function dropOf(datas, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const today = new Date(now - 10 * 3600e3).toISOString().slice(0, 10);
  const items = [];
  (datas || []).forEach((d) => (d && Array.isArray(d.items) ? d.items : []).forEach((i) => { if (i && i.title && i.fullUrl) items.push(i); }));
  const KINDS = { drop: "drop", update: "update", announcement: "update", news: "update" };
  const kindOf = (i) => { const t = (i.tags || []).map((x) => String(x).trim().toLowerCase()).find((x) => KINDS[x]); return t ? KINDS[t] : ""; };
  const hits = items.filter((i) => !!kindOf(i)).filter((i) => {
    const ends = tag(i.tags, "ends:") || tag(i.tags, "expires:");
    if (/^\d{4}-\d\d-\d\d$/.test(ends)) return ends >= today;
    return (+i.publishOn || 0) > now - 7 * 864e5;
  }).sort((a, b) => (+b.publishOn || 0) - (+a.publishOn || 0));
  if (!hits.length) return null;
  const i = hits[0];
  const who = (tag(i.tags, "for:") || "all").toLowerCase();
  return {
    title: clean(i.title, 120),
    text: clean(i.excerpt, 140),
    url: absUrl(i.fullUrl),
    date: +i.publishOn || 0,
    image: /^https:\/\//i.test(i.assetUrl || "") ? i.assetUrl : "",
    price: tag(i.tags, "price:"),
    ends: tag(i.tags, "ends:") || tag(i.tags, "expires:"),
    for: who === "pro" || who === "ohana" ? who : "all",
    kind: kindOf(i)
  };
}

/* The newest published item of one feed, trimmed to what the Dashboard needs. */
export function newest(data) {
  const items = (data && Array.isArray(data.items) ? data.items : []).filter((i) => i && i.title && i.fullUrl);
  if (!items.length) return null;
  items.sort((a, b) => (+b.publishOn || 0) - (+a.publishOn || 0));
  const i = items[0];
  return {
    title: clean(i.title, 120),
    url: absUrl(i.fullUrl),
    date: +i.publishOn || 0,
    image: /^https:\/\//i.test(i.assetUrl || "") ? i.assetUrl : "",
    price: tag(i.tags, "price:"),
    route: tag(i.tags, "route:")
  };
}

async function grabRaw(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(SITE + path, { signal: ctrl.signal, headers: { "accept": "application/json", "user-agent": "HRT-Dashboard/1.0 (+https://tools.hawaiirewardtravel.com)" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequestGet(ctx) {
  const cache = caches.default;
  const key = new Request(new URL(ctx.request.url).origin + "/api/site-news?v=2");
  const hit = await cache.match(key);
  if (hit) return hit;
  const [blog, deals] = await Promise.all([grabRaw(FEEDS.article), grabRaw(FEEDS.deal)]);
  const article = newest(blog), deal = newest(deals), drop = dropOf([deals, blog]);
  const ok = !!(article || deal);
  const res = new Response(JSON.stringify({ article, deal, drop, at: Date.now() }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=" + (ok ? TTL : 60) }
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
