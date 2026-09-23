
(function(){
 "use strict";

 /* ========================================================
    EDIT POINTS
    ======================================================== */
 var SNAPSHOT_LABEL = "September 20, 2026";
 var HRT_HOME = "https://www.hawaiirewardtravel.com";
 var COACHING_URL = "https://www.hawaiirewardtravel.com/our-accelerated-program";
 var PRO_URL = "https://www.hawaiirewardtravel.com/pro";
 /* Hero tile background, same image as the HRT PRO dashboard */
 var HERO_IMG_OPACITY = 0.4;  /* 0 = hidden, 1 = full photo */
 var HERO_IMG = "https://images.squarespace-cdn.com/content/67cfe44f78d8ac79bcf6ec19/6a6fffa2-d2f7-456f-bfcf-c92232c98f1a/524f980d-83f5-4e88-9401-95c8c24e57a9.png?content-type=image%2Fpng";
 /* Card photos. Hotels use their island photo, everything else uses its category photo.
    Swap any URL for your own Squarespace CDN image. Blank = navy gradient. */
 var U = function(id){ return "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=640&q=70"; };
 var ISLAND_IMG = {
  oahu:   U("photo-1507876466758-bc54f384809c"),
  maui:   U("photo-1542259009477-d625272157b7"),
  hawaii: U("photo-1547537069-537b37a02069"),
  kauai:  U("photo-1562191326-0da0767cfffe"),
  lm:     U("photo-1568576599263-ad9f374633d4")
 };
 var CAT_IMG = {
  ocean:  U("photo-1450045439515-ff27c2f2e6b1"),
  tour:   U("photo-1511936606692-5e0d73f6b638"),
  attr:   U("photo-1562191326-7a067408be55"),
  spa:    U("photo-1491597779497-038f35d6beb2"),
  dining: U("photo-1641857054776-4cc0af4a429a"),
  around: U("photo-1558108401-e45afa05deb8"),
  svc:    U("photo-1641857054776-4cc0af4a429a")
 };
 var HOTELS_PER_ISLAND_PREVIEW = 8;   /* hotels shown per island in the All islands view (tiles) */
 var HOTELS_PER_ISLAND_LIST = 15;     /* same, in list view */
 /* Kamaʻāina links. If a business's button should go to a better kamaʻāina page,
    add it here by business name exactly as shown on the card. This wins over the data. */
 var KAMAAINA_LINKS = {
  /* "Four Seasons Resort Oahu at Ko Olina": "https://...", */
 };
 var ACTS_PREVIEW = 9;                /* activities shown before "Show all" */
 /* ======================================================== */

 var _cl = document.getElementById("coachLink"); if(_cl) _cl.href = COACHING_URL;
 if(HERO_IMG){ document.documentElement.style.setProperty("--hero-img", 'url("' + HERO_IMG + '")'); document.documentElement.style.setProperty("--hero-op", HERO_IMG_OPACITY); }

 var DEALS = window.HRT_KAMAAINA_DEALS || [];
 var $ = function(id){ return document.getElementById(id); };

 /* ---------- embedded on the website: on phones, grow the frame to fit the whole
    dashboard so the page scrolls normally and the site footer sits below it ---------- */
 var FRAME = null, PARENT = null;
 try{ if(window.frameElement && window.parent !== window){ FRAME = window.frameElement; PARENT = window.parent; } }catch(e){}
 var MOBILE_MAX = 900;
 function isAuto(){ return document.documentElement.classList.contains("auto-h"); }
 function sizeFrame(){
  if(!FRAME) return;
  var auto = window.innerWidth < MOBILE_MAX;
  document.documentElement.classList.toggle("auto-h", auto);
  FRAME.setAttribute("data-auto", auto ? "1" : "0");
  if(auto){
   var app = document.querySelector(".hrt-app");
   var h = Math.ceil(app.getBoundingClientRect().height);
   if(Math.abs((parseInt(FRAME.style.height,10)||0) - h) > 2) FRAME.style.height = h + "px";
  }
 }
 if(FRAME){
  if("ResizeObserver" in window){
   var ro = new ResizeObserver(function(){ sizeFrame(); });
   var appEl = document.querySelector(".hrt-app");
   if(appEl) ro.observe(appEl); else document.addEventListener("DOMContentLoaded", function(){ ro.observe(document.querySelector(".hrt-app")); });
  }
  window.addEventListener("resize", sizeFrame);
  window.addEventListener("load", sizeFrame);
 }

 /* ---------- keep the deal popup inside the visible part of the screen ---------- */
 function parentHeaderBottom(){
  try{
   var hd = PARENT.document.querySelector("#header, header.header, header");
   if(!hd) return 0;
   var pos = PARENT.getComputedStyle(hd).position;
   var r = hd.getBoundingClientRect();
   return (pos === "fixed" || pos === "sticky") && r.bottom > 0 ? r.bottom : 0;
  }catch(e){ return 0; }
 }
 var lockedScroll = null;
 function placeDialog(dlg){
  if(!FRAME || !isAuto()){ dlg.removeAttribute("style"); return; }
  var fr = FRAME.getBoundingClientRect();
  var top = Math.max(0, parentHeaderBottom() - fr.top) + 10;
  var bottom = Math.min(fr.height, PARENT.innerHeight - fr.top) - 10;
  dlg.style.position = "fixed";
  dlg.style.top = top + "px";
  dlg.style.bottom = "auto";
  dlg.style.left = "0"; dlg.style.right = "0";
  dlg.style.margin = "0 auto";
  dlg.style.maxHeight = Math.max(280, bottom - top) + "px";
  /* stop the page behind from scrolling while the popup is open */
  try{
   var pd = PARENT.document.documentElement, pb = PARENT.document.body;
   lockedScroll = { h: pd.style.overflow, b: pb.style.overflow };
   pd.style.overflow = "hidden"; pb.style.overflow = "hidden";
  }catch(e){}
 }
 function unlockParent(){
  if(!lockedScroll) return;
  try{ PARENT.document.documentElement.style.overflow = lockedScroll.h; PARENT.document.body.style.overflow = lockedScroll.b; }catch(e){}
  lockedScroll = null;
 }

 /* ---------- islands ---------- */
 var ISL = [
  { k:"oahu",   name:"Oʻahu" },
  { k:"maui",   name:"Maui" },
  { k:"hawaii", name:"Hawaiʻi Island" },
  { k:"kauai",  name:"Kauaʻi" },
  { k:"lm",     name:"Lānaʻi & Molokaʻi" }
 ];
 var ISL_NAME = { oahu:"Oʻahu", maui:"Maui", hawaii:"Hawaiʻi Island", kauai:"Kauaʻi", lanai:"Lānaʻi", molokai:"Molokaʻi", lm:"Lānaʻi & Molokaʻi" };
 var OAHU_AREAS = /Waik|Honolulu|Kapolei|Kahuku|Aiea|Haleiwa|Laie/i;
 function homeIsland(d){
  if(d.i.length === 1) return d.i[0] === "lanai" || d.i[0] === "molokai" ? "lm" : d.i[0];
  if(d.h && OAHU_AREAS.test(d.h) && d.i.indexOf("oahu") > -1) return "oahu";
  return "all";
 }
 function onIsland(d, k){
  if(k === "all") return true;
  if(k === "lm") return d.i.indexOf("lanai") > -1 || d.i.indexOf("molokai") > -1;
  return d.i.indexOf(k) > -1;
 }
 function where(d){ var h = homeIsland(d); return h === "all" ? "Statewide" : ISL_NAME[h]; }

 /* ---------- categories ---------- */
 var OCEAN = /snorkel|sail|boat|dolphin|turtle|whale|kayak|charter|cruise|manta|captain|pride of maui|four winds|fair wind|hula kai|ocean and you|paddl/i;
 var ATTR  = /waimea valley|polynesian cultural|cirque|l\u016b\u02bbau|luau|dinner detective|world of aloha|timeless princess|show/i;
 var SPA   = /massage|spa\b/i;
 var CATS = [
  { k:"ocean",  name:"Ocean adventures",    short:"Ocean",      ic:"boat" },
  { k:"tour",   name:"Tours & adventures",  short:"Tour",       ic:"compass" },
  { k:"attr",   name:"Attractions & shows", short:"Attraction", ic:"ticket" },
  { k:"spa",    name:"Spa & wellness",      short:"Spa",        ic:"leaf" },
  { k:"dining", name:"Dining",              short:"Dining",     ic:"fork" },
  { k:"around", name:"Getting around",      short:"Transport",  ic:"car" },
  { k:"svc",    name:"Services & shopping", short:"Services",   ic:"bag" }
 ];
 var CAT_NAME = { stay:"Hotel" }; CATS.forEach(function(c){ CAT_NAME[c.k] = c.short; });
 DEALS.forEach(function(d){
  var hay = d.b + " " + d.t;
  if(d.g === "Stays") d._c = "stay";
  else if(d.g === "Dining") d._c = "dining";
  else if(d.g === "Getting around") d._c = "around";
  else if(d.g === "Services" || d.g === "Shopping") d._c = "svc";
  else if(OCEAN.test(hay)) d._c = "ocean";
  else if(SPA.test(hay) && !/resort/i.test(d.b)) d._c = "spa";
  else if(ATTR.test(hay)) d._c = "attr";
  else d._c = "tour";
  d._isl = homeIsland(d);
 });
 /* booking link quality: does the button land on a kamaʻāina offer or rate? */
 var KLINK = /kama|resident|local|love-?hawaii|staycation|special|offer|promo|rate(code)?=|srpcodes|spec_plan|cc=z43|offercode|[?&]rate=|kam\b|deal|discount|la-ohana|keikiday|huakai|gold-card|km-discount|welovekamaaina|affiliate|reservation-link|be\.synxis\.com/i;
 var CODE_RE = [
  /(?:promo(?:tion)?|offer|special offer|coupon|teller coupon|plan|rate)\s*code[s]?\s*(?:is|:)?\s*[\u201c"']?([A-Za-z0-9][A-Za-z0-9-]{2,})/gi,
  /\b(?:use|using|enter|with|search under)\s+(?:the\s+)?(?:promo\s+)?code[:\s]*[\u201c"']?([A-Za-z0-9][A-Za-z0-9-]{2,})/gi,
  /\bask for package\s+([A-Z0-9]{1,6})/gi,
  /\bpackage\s+([A-Z][0-9])\b/g
 ];
 var CODE_STOP = /^(at|to|the|and|when|below|here|must|online|can|be|is|will|for|only|kamaaina,?)$/i;
 function codesFor(d){
  var txt = [d.t, d.d, d.f].join(" "), out = [];
  CODE_RE.forEach(function(re){ re.lastIndex = 0; var m; while((m = re.exec(txt))){ var c = m[1].replace(/[.,]$/,""); if(!CODE_STOP.test(c) && out.indexOf(c) < 0) out.push(c); } });
  if(/code\s*[\u201c"']kamaaina[\u201d"']/i.test(txt) && out.indexOf("kamaaina") < 0) out.push("kamaaina");
  return out.slice(0,2);
 }
 function phoneFor(d){ var m = [d.t,d.d,d.f].join(" ").match(/\(?808\)?[\s.-]?\d{3}[\s.-]\d{4}/); return m ? m[0] : ""; }
 DEALS.forEach(function(d){
  if(KAMAAINA_LINKS[d.b]) d.u = KAMAAINA_LINKS[d.b];
  d._kl = !!(d.u && KLINK.test(d.u));
  d._codes = codesFor(d);
  d._ph = phoneFor(d);
  d._callOnly = /call (us|to book)|by phone only|must call|call the resort|please call/i.test([d.f,d.d,d.t].join(" "));
 });
 var HOTELS = DEALS.filter(function(d){ return d._c === "stay"; });
 var ACTS = DEALS.filter(function(d){ return d._c !== "stay"; });

 /* ---------- hotel quick filters ---------- */
 var QUICK = [
  { k:"top",   name:"Top picks",      test:function(d){ return d.r === "Top pick"; } },
  { k:"park",  name:"Free parking",   test:function(d){ return d.k.indexOf("Free parking") > -1; } },
  { k:"fee",   name:"No resort fee",  test:function(d){ return d.k.indexOf("Resort fee waived") > -1; } },
  { k:"bfast", name:"Breakfast",      test:function(d){ return d.k.indexOf("Breakfast included") > -1; } },
  { k:"upg",   name:"Room upgrade",   test:function(d){ return d.k.indexOf("Room upgrade") > -1; } },
  { k:"late",  name:"Late check out", test:function(d){ return d.k.indexOf("Late check-out") > -1; } },
  { k:"loyal", name:"Earns hotel points", test:function(d){ return !!d.m; } },
  { k:"soon",  name:"Ending soon",    test:function(d){ return !!d.x; } }
 ];
 var TIERS = { "Top pick":"top", "Strong":"strong", "Solid":"solid", "Worth a look":"look" };

 var savedView = "tiles"; try{ savedView = localStorage.getItem("hrtKamaView") || "tiles"; }catch(e){}
 var state = { view:savedView, q:"", hIsl:"all", hArea:"", hQuick:{}, hSort:"score", aCat:"all", aIsl:"all", aAll:false, nav:"all" };

 /* ---------- helpers ---------- */
 var IC = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bed:'<path d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="11" r="1.6"/>',
  pin:'<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11Z"/><circle cx="12" cy="10" r="2.2"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  boat:'<path d="M3 15h18l-2.5 4.5h-13Z"/><path d="M12 3v12M12 4l6 8h-6"/>',
  compass:'<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  ticket:'<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M14 7v10" stroke-dasharray="2 2"/>',
  leaf:'<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
  fork:'<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M17 21V3c-2 1.5-3 4-3 7h3"/>',
  car:'<path d="M5 16h14M6 16l1.5-5.5A2 2 0 0 1 9.4 9h5.2a2 2 0 0 1 1.9 1.5L18 16"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  bag:'<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  home:'<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
  crown:'<path d="M3.5 8.5 8 12.5l4-7 4 7 4.5-4-2 10.5h-13Z"/><path d="M6 21h12"/>'
 };
 function svg(name, size){ return '<svg width="'+(size||16)+'" height="'+(size||16)+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[name]+'</svg>'; }
 function esc(s){
  return String(s == null ? "" : s)
   .replace(/\s*[\u2013\u2014]\s*/g, ", ")
   .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
   .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 }
 function tierOf(d){ return TIERS[d.r] || "look"; }
 function daysLabel(d){
  if(d.dl < 0) return "Ended";
  if(d.dl === 0) return "Ends today";
  if(d.dl === 1) return "Ends tomorrow";
  if(d.dl <= 60) return d.dl + " days left";
  return "Through " + new Date(d.e + "T12:00:00").toLocaleDateString("en-US",{month:"short", year:"numeric"});
 }
 function headline(d){
  if(d.p) return { big: d.p + "% off", small: d.a ? "+ " + d.a + "% off fees" : (d.k[0] ? "+ " + d.k[0].toLowerCase() : "") };
  if(d.v) return { big: "From $" + d.v, small: d.k[0] ? "+ " + d.k[0].toLowerCase() : "per night" };
  if(d.k[0]) return { big: d.k[0], small: d.k[1] ? "+ " + d.k[1].toLowerCase() : "" };
  return { big: "Resident rate", small: "" };
 }
 function imgFor(d){
  if(d._c !== "stay" && CAT_IMG[d._c]) return CAT_IMG[d._c];
  return ISLAND_IMG[d._isl] || ISLAND_IMG.oahu || "";
 }
 function thumbStyle(d){
  var src = imgFor(d);
  if(src) return ' style="background-image:url(\'' + src + '\')"';
  return ' style="background:linear-gradient(135deg,#0e1b2c,#1d3350)"';
 }
 function matchQ(d){
  if(!state.q) return true;
  var hay = (d.b+" "+d.t+" "+d.d+" "+d.h+" "+d.g+" "+(d.m||"")+" "+d.k.join(" ")+" "+where(d)+" "+(CAT_NAME[d._c]||"")).toLowerCase();
  var words = state.q.toLowerCase().split(/\s+/);
  for(var w=0;w<words.length;w++){ if(words[w] && hay.indexOf(words[w]) === -1) return false; }
  return true;
 }
 var SORTS = {
  score: function(a,b){ return b.s - a.s || a.b.localeCompare(b.b); },
  soon:  function(a,b){ return a.dl - b.dl || b.s - a.s; },
  pct:   function(a,b){ return (b.p||0) - (a.p||0) || b.s - a.s; },
  price: function(a,b){ var av = a.v == null ? 1e9 : a.v, bv = b.v == null ? 1e9 : b.v; return av - bv || b.s - a.s; },
  az:    function(a,b){ return a.b.localeCompare(b.b); }
 };

 /* big hotel card */
 function fcard(d){
  var t = tierOf(d), h = headline(d);
  var flag = d.x ? '<span class="flag soon">Ending soon</span>' : (d.n ? '<span class="flag fresh">New</span>' : "");
  var meta = [];
  if(d.h && d._isl !== "all") meta.push(esc(d.h));
  if(d.m) meta.push(esc(d.m));
  return '<button type="button" class="fcard" data-tier="'+t+'" data-idx="'+DEALS.indexOf(d)+'">'
   + '<div class="fthumb"'+thumbStyle(d)+'><span class="isl">'+svg("pin",12)+esc(where(d))+'</span>'+flag
   + '<span class="band '+t+'">'+esc(d.r)+'</span><span class="cab">'+esc(CAT_NAME[d._c]||d.g)+'</span></div>'
   + '<div class="fbody">'
   + '<div class="frow"><span class="fcity">'+esc(d.b)+'</span><span class="fscore">SCORE <b class="tnum">'+d.s+'</b></span></div>'
   + '<div class="fdesc">'+esc(d.t)+'</div>'
   + '<div class="fprice tnum">'+esc(h.big)+(h.small ? ' <small>'+esc(h.small)+'</small>' : '')+'</div>'
   + (meta.length ? '<div class="fmeta">'+meta.join('<span aria-hidden="true">&middot;</span>')+'</div>' : '')
   + '<div class="fend'+(d.dl <= 60 ? ' soon' : '')+'">'+esc(daysLabel(d))+'</div>'
   + '<div class="fbook">View offer &rarr;</div>'
   + '</div></button>';
 }
 /* compact card for activities and dining */
 function acard(d){
  var t = tierOf(d), h = headline(d);
  return '<button type="button" class="acard" data-idx="'+DEALS.indexOf(d)+'">'
   + '<span class="athumb"'+thumbStyle(d)+'></span>'
   + '<span class="abody"><span class="atop"><span class="aname">'+esc(d.b)+'</span><span class="band '+t+'">'+d.s+'</span></span>'
   + '<span class="aoffer">'+esc(d.t)+'</span>'
   + '<span class="ameta"><b>'+esc(h.big)+'</b><span>'+esc(where(d))+'</span><span class="'+(d.dl<=60?'soon':'')+'">'+esc(daysLabel(d))+'</span></span>'
   + '</span></button>';
 }

 /* list row */
 function lrow(d){
  var t = tierOf(d), h = headline(d);
  return '<button type="button" class="lrow" data-idx="'+DEALS.indexOf(d)+'">'
   + '<span class="lthumb"'+thumbStyle(d)+'></span>'
   + '<span class="lname"><b>'+esc(d.b)+'</b><span>'+esc(d.t)+'</span></span>'
   + '<span class="lwhere">'+esc(where(d))+(d.h && d._isl !== "all" ? '<small>'+esc(d.h)+'</small>' : '')+'</span>'
   + '<span class="ldeal tnum">'+esc(h.big)+(h.small ? '<small>'+esc(h.small)+'</small>' : '')+'</span>'
   + '<span class="lscore band '+t+'">'+d.s+'</span>'
   + '<span class="lend'+(d.dl <= 60 ? ' soon' : '')+'">'+esc(daysLabel(d))+'</span>'
   + '<span class="lgo" aria-hidden="true">&rsaquo;</span>'
   + '</button>';
 }
 var LHEAD = '<div class="lhead"><span></span><span>Hotel and offer</span><span>Island</span><span>Deal</span><span>Score</span><span>Good through</span><span></span></div>';
 function isPhone(){ return window.matchMedia("(max-width:760px)").matches; }
 function block(list, seeAll){
  if(!list.length) return "";
  if(state.view === "list") return '<div class="llist">'+LHEAD+list.map(lrow).join("")+'</div>';
  var tail = seeAll ? '<button type="button" class="seeall" data-isl="'+seeAll.k+'"><b>+'+seeAll.more+'</b>See all on '+esc(seeAll.name)+'</button>' : '';
  return '<div class="dgrid">'+list.map(fcard).join("")+tail+'</div>';
 }

 /* ---------- sidebar ---------- */
 function hotelCount(k){ return HOTELS.filter(function(d){ return k === "all" || d._isl === k || (d._isl === "all" && onIsland(d,k)); }).length; }
 function buildNav(){
  var html = '<span class="hrt-lbl">Overview</span>'
   + navItem("all","Dashboard","grid",DEALS.length,false)
   + '<a class="hrt-navi pro" href="'+esc(PRO_URL)+'" target="_top" rel="noopener"><span class="hic">'+svg("crown",17)+'</span><span class="nm">Try HRT PRO</span><span class="cnt">&rarr;</span></a>'
   + '<span class="hrt-lbl">Staycations</span>'
   + navItem("h-all","All hotels","bed",HOTELS.length,false);
  ISL.forEach(function(i){ var n = hotelCount(i.k); if(n) html += navItem("h-"+i.k, i.name, "pin", n, true); });
  html += '<span class="hrt-lbl">Deals</span>' + navItem("soon","Ending soon","clock",DEALS.filter(function(d){ return d.x; }).length,false);
  html += '<span class="hrt-lbl">Activities &amp; dining</span>';
  CATS.forEach(function(c){ var n = ACTS.filter(function(d){ return d._c === c.k; }).length; if(n) html += navItem("a-"+c.k, c.name, c.ic, n, false, true); });
  html += '<span class="hrt-lbl">Hawaii Reward Travel</span><a class="hrt-navi" href="'+esc(HRT_HOME)+'" target="_blank" rel="noopener"><span class="hic">'+svg("home")+'</span><span class="nm">Back to main site</span></a>';
  $("sideNav").innerHTML = html;
 }
 function navItem(id, name, ic, n, sub, minor){
  return '<a class="hrt-navi'+(sub?' sub':'')+(minor?' minor':'')+'" href="#" data-nav="'+id+'"><span class="hic">'+svg(ic, sub?14:16)+'</span><span class="nm">'+esc(name)+'</span><span class="cnt tnum">'+n+'</span></a>';
 }
 function syncNav(){
  document.querySelectorAll(".hrt-navi[data-nav]").forEach(function(a){
   var on = a.getAttribute("data-nav") === state.nav;
   a.classList.toggle("on", on);
   a.setAttribute("aria-current", on ? "page" : "false");
  });
  var parts = [];
  if(state.nav.indexOf("h-") === 0){ parts.push("Hotels"); if(state.hIsl !== "all") parts.push(ISL_NAME[state.hIsl]); }
  else if(state.nav.indexOf("a-") === 0){ parts.push("Activities & dining"); if(state.aCat !== "all") parts.push(CATS.filter(function(c){ return c.k === state.aCat; })[0].name); }
  else if(state.nav === "soon") parts.push("Ending soon");
  var kc = $("kCrumb"); if(kc) kc.innerHTML = parts.length ? '<a href="#" data-nav="all">Dashboard</a> <span aria-hidden="true">/</span> ' + parts.map(esc).join(' <span aria-hidden="true">/</span> ') : "Dashboard";
 }

 /* ---------- top area ---------- */
 function renderTop(){
  var top = HOTELS.slice().sort(SORTS.score)[0];
  if(!top){ $("spot").hidden = true; return; }
  var h = headline(top), si = imgFor(top);
  if(si) $("spotImg").style.backgroundImage = "url('" + si + "')";
  $("spotIsl").textContent = where(top) + (top.h && top._isl !== "all" ? ", " + top.h : "");
  $("spotName").textContent = top.b;
  $("spotHead").textContent = h.big;
  $("spotSub").textContent = top.v && top.p ? "from $" + top.v + " a night" : "";
  $("spotType").textContent = "Hotel";
  $("spotMeta").innerHTML = "Value score <b>" + top.s + "</b>" + (top.m ? " &middot; " + esc(top.m) : "")
   + " &middot; " + esc(top.dl <= 60 ? daysLabel(top).toLowerCase() : "good t" + daysLabel(top).slice(1));
  $("spotChips").innerHTML = top.k.map(function(p){ return '<span class="chip">'+esc(p)+'</span>'; }).join("");
  $("spotBtn").onclick = function(){ openDialog(top); };
 }

 /* ---------- hotels ---------- */
 function hotelBase(){
  return HOTELS.filter(function(d){
   if(!matchQ(d)) return false;
   for(var k in state.hQuick){ if(state.hQuick[k]){ var q = QUICK.filter(function(x){ return x.k === k; })[0]; if(q && !q.test(d)) return false; } }
   return true;
  });
 }
 function inIsl(d, k){ return k === "all" || d._isl === k || (d._isl === "all" && onIsland(d,k)); }
 function renderHotels(){
  var base = hotelBase();
  /* island tabs with live counts */
  var tabs = '<button type="button" class="itab'+(state.hIsl==="all"?' on':'')+'" data-isl="all" role="tab" aria-selected="'+(state.hIsl==="all")+'"><span class="in">All islands</span><span class="ic tnum">'+base.length+'</span></button>';
  ISL.forEach(function(i){
   var n = base.filter(function(d){ return inIsl(d, i.k); }).length;
   if(!hotelCount(i.k)) return;
   tabs += '<button type="button" class="itab'+(state.hIsl===i.k?' on':'')+'" data-isl="'+i.k+'" role="tab" aria-selected="'+(state.hIsl===i.k)+'"'+(n?'':' disabled')+'><span class="in">'+esc(i.name)+'</span><span class="ic tnum">'+n+'</span></button>';
  });
  $("itabs").innerHTML = tabs;

  var list = base.filter(function(d){ return inIsl(d, state.hIsl); });
  /* area chips inside one island */
  if(state.hIsl !== "all"){
   var ac = {};
   list.forEach(function(d){ if(d.h) ac[d.h] = (ac[d.h]||0)+1; });
   var areas = Object.keys(ac).filter(function(a){ return ac[a] >= 2; }).sort(function(a,b){ return ac[b]-ac[a]; });
   $("areaRow").hidden = areas.length < 2;
   if(state.hArea && !ac[state.hArea]) state.hArea = "";
   $("hAreas").innerHTML = '<button type="button" class="chipf'+(state.hArea?' plain':'')+'" data-area="" aria-pressed="'+(!state.hArea)+'">All areas</button>'
    + areas.map(function(a){ var on = state.hArea === a; return '<button type="button" class="chipf'+(on?'':' plain')+'" data-area="'+esc(a)+'" aria-pressed="'+on+'">'+esc(a)+'<span class="n">'+ac[a]+'</span></button>'; }).join("");
   if(state.hArea) list = list.filter(function(d){ return d.h === state.hArea; });
  } else { $("areaRow").hidden = true; state.hArea = ""; }

  list.sort(SORTS[state.hSort] || SORTS.score);
  $("hN").textContent = list.length;
  $("hL").textContent = (list.length === 1 ? "hotel deal" : "hotel deals") + (state.hIsl === "all" ? " across the islands" : " on " + ISL_NAME[state.hIsl]);

  var html = "";
  if(state.hIsl === "all"){
   ISL.forEach(function(i){
    var g = list.filter(function(d){ return d._isl === i.k; });
    if(!g.length) return;
    var cap = state.view === "list" ? HOTELS_PER_ISLAND_LIST : HOTELS_PER_ISLAND_PREVIEW;
    var more = g.length > cap;
    html += '<section class="igroup"><div class="ih"><span class="ipin">'+svg("pin",15)+'</span><h3>'+esc(i.name)+'</h3><span class="icount">'+g.length+' hotel deal'+(g.length===1?'':'s')+'</span>'
     + '<button type="button" class="chipf" data-isl="'+i.k+'">'+(more ? 'See all '+g.length+' on '+esc(i.name) : 'Open '+esc(i.name))+' &rarr;</button></div>'
     + block(g.slice(0, cap), more ? { k:i.k, name:i.name, more:g.length - cap } : null)+'</section>';
   });
   var sw = list.filter(function(d){ return d._isl === "all"; });
   if(sw.length) html += '<section class="igroup"><div class="ih"><span class="ipin">'+svg("pin",15)+'</span><h3>Statewide</h3><span class="icount">'+sw.length+'</span></div>'+block(sw)+'</section>';
  } else {
   if(isPhone() && state.view === "tiles" && !state.hArea && list.length > 4){
    var byArea = {}, order = [];
    list.forEach(function(d){ var a = d.h || "More on " + ISL_NAME[state.hIsl]; if(!byArea[a]){ byArea[a] = []; order.push(a); } byArea[a].push(d); });
    order.sort(function(x,y){ return byArea[y].length - byArea[x].length; });
    html = order.map(function(a){ return '<div class="rowhead"><h4>'+esc(a)+'</h4><span>'+byArea[a].length+' deal'+(byArea[a].length===1?'':'s')+'</span></div>'+block(byArea[a]); }).join("");
   } else {
    html = block(list);
   }
  }
  $("hotelBody").innerHTML = html;
  $("hEmpty").hidden = list.length > 0;

  var act = QUICK.filter(function(q){ return state.hQuick[q.k]; }).map(function(q){ return q.name; });
  if(state.hArea) act.push(state.hArea);
  $("mfN").hidden = !act.length; $("mfN").textContent = act.length;
  $("mfSum").textContent = act.length ? act.join(", ") : "Parking, breakfast, upgrades and more";
  $("mfClear").hidden = !act.length;
  $("hQuick").innerHTML = QUICK.map(function(q){
   var on = !!state.hQuick[q.k];
   return '<button type="button" class="chipf'+(on?'':' plain')+'" data-quick="'+q.k+'" aria-pressed="'+on+'">'+esc(q.name)+'</button>';
  }).join("");
 }

 /* ---------- ending soon ---------- */
 function renderSoon(){
  var soon = DEALS.filter(function(d){ return d.x && matchQ(d); }).sort(function(a,b){
   /* hotels first, then soonest */
   return (a._c === "stay" ? 0 : 1) - (b._c === "stay" ? 0 : 1) || SORTS.soon(a,b);
  }).slice(0,8);
  $("soonGrid").innerHTML = block(soon);
  $("soon").hidden = soon.length === 0;
 }

 /* ---------- activities ---------- */
 function renderActs(){
  var counts = {};
  var base = ACTS.filter(function(d){ return matchQ(d) && onIsland(d, state.aIsl); });
  base.forEach(function(d){ counts[d._c] = (counts[d._c]||0)+1; });
  $("aCats").innerHTML = '<button type="button" class="chipf'+(state.aCat==="all"?'':' plain')+'" data-cat="all" aria-pressed="'+(state.aCat==="all")+'">All<span class="n">'+base.length+'</span></button>'
   + CATS.filter(function(c){ return counts[c.k]; }).map(function(c){
     var on = state.aCat === c.k;
     return '<button type="button" class="chipf'+(on?'':' plain')+'" data-cat="'+c.k+'" aria-pressed="'+on+'">'+esc(c.name)+'<span class="n">'+counts[c.k]+'</span></button>';
    }).join("");
  var list = base.filter(function(d){ return state.aCat === "all" || d._c === state.aCat; }).sort(SORTS.score);
  var show = state.aAll ? list : list.slice(0, ACTS_PREVIEW);
  $("actGrid").innerHTML = show.map(acard).join("");
  $("aN").textContent = list.length;
  $("aL").textContent = list.length === 1 ? "offer" : "offers";
  $("aMore").hidden = list.length <= ACTS_PREVIEW;
  $("aMore").textContent = state.aAll ? "Show fewer" : "Show all " + list.length;
  $("aEmpty").hidden = list.length > 0;
 }

 function syncView(){ document.querySelectorAll("[data-view]").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-view") === state.view ? "true" : "false"); }); }
 function renderAll(){ syncView(); renderHotels(); renderSoon(); renderActs(); syncNav(); }

 /* ---------- dialog ---------- */
 function openDialog(d){
  var t = tierOf(d), rows = [];
  rows.push("<dt>Where</dt><dd>" + esc(d.i.length > 2 && d._isl === "all" ? "Statewide" : d.i.map(function(k){ return ISL_NAME[k]; }).join(", ")) + (d.h ? ", " + esc(d.h) : "") + "</dd>");
  rows.push("<dt>Type</dt><dd>" + esc(d._c === "stay" ? "Hotel stay" : (CATS.filter(function(c){ return c.k === d._c; })[0]||{name:d.g}).name) + "</dd>");
  if(d.p) rows.push("<dt>Discount</dt><dd>" + d.p + "% off" + (d.a ? ", plus " + d.a + "% off an add on such as parking or fees" : "") + "</dd>");
  if(d.v) rows.push("<dt>Rates from</dt><dd>$" + d.v + "</dd>");
  if(d.k.length) rows.push("<dt>Included</dt><dd>" + d.k.map(esc).join(", ") + "</dd>");
  if(d.m) rows.push("<dt>Loyalty</dt><dd>" + esc(d.m) + ". Confirm points and elite night credit at booking, since some resident rates are excluded.</dd>");
  var exact = new Date(d.e + "T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  rows.push("<dt>Good through</dt><dd>" + esc(exact) + (d.dl <= 60 ? ", " + esc(daysLabel(d).toLowerCase()) : "") + "</dd>");
  rows.push("<dt>Value score</dt><dd>" + d.s + " out of 99</dd>");
  var dlg = $("dlg");
  dlg.innerHTML = '<div class="dh"><button class="x" type="button" data-close aria-label="Close">&times;</button>'
   + '<span class="band '+t+'">'+esc(d.r)+'</span><h3>'+esc(d.b)+'</h3><p>'+esc(d.t)+'</p></div>'
   + '<div class="db">'
   + (d.d ? '<p class="ex">'+esc(d.d)+'</p>' : '')
   + '<dl>'+rows.join("")+'</dl>'
   + howTo(d)
   + (d.f ? '<p class="fine"><b>Fine print:</b> '+esc(d.f)+'</p>' : '')
   + (d.u ? '<a class="btn coral" href="'+esc(d.u)+'" target="_blank" rel="noopener">'+(d._kl ? 'Book the kamaʻāina rate' : 'Go to '+esc(d.b))+' &rarr;</a>' : '')
   + '<p class="src">'+(d._kl ? 'This link opens the business\'s kamaʻāina offer or rate. ' : '')+'Confirm the current rate and terms with the business before booking.</p>'
   + '</div>';
  if(typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open","");
  placeDialog(dlg); dlg.scrollTop = 0;
 }

 function howTo(d){
  var steps = [];
  var codes = d._codes.map(function(c){ return '<button type="button" class="codechip" data-copy="'+esc(c)+'">'+esc(c)+'<small>Copy</small></button>'; }).join(" ");
  if(d._callOnly && d._ph) steps.push('Call <b>'+esc(d._ph)+'</b> and ask for the kamaʻāina rate.');
  else if(d._kl) steps.push('Use the button below. It opens the kamaʻāina offer or rate directly.');
  else steps.push('Open the business site with the button below and look for the kamaʻāina or resident offer.' + (d._ph ? ' Or call <b>'+esc(d._ph)+'</b>.' : ''));
  if(codes) steps.push('Enter this code when you book: ' + codes);
  steps.push('Bring a valid Hawaiʻi ID. Most offers check it at arrival.');
  return '<div class="howto"><h4>How to get this kamaʻāina rate</h4><ol>'+steps.map(function(x){ return '<li>'+x+'</li>'; }).join("")+'</ol></div>';
 }
 /* ========================================================
    DEALS MAP (MapLibre + OpenFreeMap: free, no API key, no limits)
    ======================================================== */
 var MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
 var MAP_STYLE_DARK  = "https://tiles.openfreemap.org/styles/dark";
 /* Pin locations by business name [latitude, longitude]. Fix or add any spot here. */
 var LOC = {
  /* Oʻahu */
  "Waikiki Resort Hotel":[21.2753,-157.8238], "The Kahala Hotel & Resort":[21.2710,-157.7735],
  "Four Seasons Resort Oahu at Ko Olina":[21.3389,-158.1255], "Sheraton Waikiki Beach Resort":[21.2780,-157.8310],
  "ʻAlohilani Resort Waikiki Beach":[21.2745,-157.8242], "Hyatt Place Waikiki Beach":[21.2735,-157.8227],
  "Aston Waikiki Banyan":[21.2723,-157.8205], "Aston Waikiki Sunset":[21.2712,-157.8207], "Hotel Renew":[21.2727,-157.8216],
  "Moana Surfrider, A Westin Resort & Spa, Waikiki Beach":[21.2768,-157.8268],
  "The Royal Hawaiian, a Luxury Collection Resort, Waikiki":[21.2771,-157.8290],
  "Lotus Honolulu at Diamond Head":[21.2640,-157.8200], "Waikiki Malia":[21.2811,-157.8317],
  "Holiday Inn Express Waikiki":[21.2848,-157.8370], "Embassy Suites by Hilton Waikiki Beach Walk":[21.2800,-157.8330],
  "Hyatt Regency Waikiki Beach Resort & Spa":[21.2764,-157.8246], "White Sands Hotel":[21.2819,-157.8330],
  "Park Shore Waikiki":[21.2719,-157.8217], "Ka Laʻi Waikiki Beach":[21.2814,-157.8318],
  "Aqua Aloha Surf Waikiki":[21.2807,-157.8249], "Aston Waikiki Beach Tower":[21.2750,-157.8247],
  "Aston at the Executive Centre Hotel":[21.3093,-157.8618], "Aulani, A Disney Resort & Spa":[21.3395,-158.1233],
  "Ilikai Hotel & Luxury Suites":[21.2848,-157.8384], "Kaimana Beach Hotel":[21.2662,-157.8219],
  "Pacific Monarch":[21.2750,-157.8238], "Luana Waikiki Hotel & Suites":[21.2825,-157.8335],
  "The Laylow, Autograph Collection":[21.2799,-157.8272], "The Twin Fin":[21.2767,-157.8248],
  "DoubleTree by Hilton Alana, Waikiki Beach":[21.2843,-157.8353], "Aqua Palms Waikiki":[21.2842,-157.8374],
  "Embassy Suites by Hilton Oahu Kapolei":[21.3312,-158.0854], "Oasis Hotel Waikiki":[21.2830,-157.8290],
  "The Ritz-Carlton Oʻahu, Turtle Bay":[21.7053,-157.9975], "Pagoda Hotel":[21.2958,-157.8403],
  "Ohia Waikiki Studio Suites":[21.2786,-157.8268], "Hilton Vacation Club The Modern Honolulu":[21.2853,-157.8382],
  "OUTRIGGER Waikīkī Beachcomber Hotel":[21.2775,-157.8265],
  "Airport Honolulu Hotel, Trademark Collection by Wyndham":[21.3354,-157.9135],
  "Best Western The Plaza Hotel":[21.3339,-157.9145], "Hilton Hawaiian Village Waikiki Beach Resort":[21.2830,-157.8377],
  "Royal Grove Hotel & Apts":[21.2755,-157.8240], "Sheraton Princess Kaiulani Waikiki Beach":[21.2779,-157.8262],
  "Waikiki Beach Marriott Resort & Spa":[21.2717,-157.8227],
  "Waimea Valley":[21.6315,-158.0490], "Polynesian Cultural Center":[21.6403,-157.9208],
  "Aloha Sails Waikiki":[21.2779,-157.8295], "Coral Crater Adventure Park":[21.3337,-158.0673],
  "Hard Rock Cafe - Honolulu":[21.2848,-157.8363], "Cirque du Soleil ʻAuana":[21.2790,-157.8300],
  /* Maui */
  "Aston Kaanapali Shores":[20.9564,-156.6906], "Aston Mahana at Kaanapali":[20.9544,-156.6899],
  "Aston Maui Hill":[20.7090,-156.4460], "Aston Maui Kaanapali Villas":[20.9422,-156.6926],
  "Aston at Papakea Resort":[20.9510,-156.6891], "Aston at The Whaler on Kaanapali Beach":[20.9187,-156.6955],
  "Aston at the Maui Banyan":[20.7110,-156.4445], "Wailea Beach Resort":[20.6878,-156.4428],
  "Sheraton Maui Resort & Spa":[20.9265,-156.6950], "Hampton Inn & Suites Maui North Shore":[20.8880,-156.4540],
  "Maui Beach Hotel":[20.8932,-156.4670], "OUTRIGGER Kāʻanapali Beach Resort":[20.9222,-156.6947],
  "Maui Seaside Hotel":[20.8935,-156.4686], "Grand Wailea":[20.6843,-156.4430], "Polo Beach Club":[20.6770,-156.4420],
  "Maui Bay Villas by Hilton Grand Vacations":[20.7400,-156.4550], "CoralTree Residence Collection Hawaii":[20.7200,-156.4450],
  "Hilton Vacation Club Ka'anapali Beach Maui":[20.9346,-156.6940], "Kaanapali Alii":[20.9290,-156.6950],
  "Makena Surf":[20.6590,-156.4410], "Wailea Ekahi Village":[20.6960,-156.4420], "Wailea Ekolu Village":[20.6890,-156.4380],
  "Wailea Elua Village":[20.6810,-156.4410], "Wailea Grand Champions Villas":[20.6875,-156.4380],
  "Andaz Maui at Wailea Resort, by Hyatt":[20.6900,-156.4428],
  "Old Lahaina Lūʻau":[20.8913,-156.6834], "Māla Ocean Tavern":[20.8837,-156.6840], "Pride of Maui":[20.7920,-156.5110],
  "Four Winds III Snorkel Tours":[20.7925,-156.5118], "Maui Pineapple Tour":[20.8686,-156.3391],
  /* Hawaiʻi Island */
  "The Westin Hapuna Beach Resort":[20.0077,-155.8237], "PACIFIC 19":[19.6390,-155.9930],
  "Aston Kona by the Sea":[19.6205,-155.9855], "Royal Kona Resort":[19.6340,-155.9920],
  "Waikoloa Beach Marriott Resort & Spa":[19.9170,-155.8880], "Holiday Inn Express Hotel & Suites Kailua-Kona":[19.6400,-155.9960],
  "Grand Naniloa Resort - a DoubleTree by Hilton":[19.7275,-155.0700], "Mauna Lani, Auberge Collection":[19.9480,-155.8630],
  "SCP Hilo Hotel":[19.7240,-155.0640], "Fairmont Orchid, Hawaii":[19.9467,-155.8667], "Hilton Waikoloa Village":[19.9240,-155.8880],
  "Hilton Grand Vacations Club Ocean Tower Waikoloa Village":[19.9250,-155.8870],
  "Kohala Suites by Hilton Grand Vacations":[19.9180,-155.8770], "Kings' Land by Hilton Grand Vacations Club":[19.9160,-155.8600],
  "Mauna Lani Point":[19.9420,-155.8650], "Volcano Village Estates":[19.4380,-155.2350], "Volcano Village Lodge":[19.4340,-155.2400],
  "Fair Wind":[19.5616,-155.9637], "Hula Kai":[19.5616,-155.9637], "Kona Snorkel Trips":[19.6718,-156.0243],
  /* Kauaʻi */
  "Hale Hokuala Kauai, Curio Collection by Hilton":[21.9580,-159.3540], "Grand Hyatt Kauai Resort & Spa":[21.8790,-159.4600],
  "Aston Islander on the Beach":[22.0580,-159.3180], "Aston at Poipu Kai":[21.8800,-159.4520],
  "Plantation Hale Suites":[22.0560,-159.3200], "Ko’a Kea Resort on Poipu Beach":[21.8745,-159.4570],
  "Banyan Harbor Resort":[21.9580,-159.3570], "Waimea Plantation Cottages":[21.9550,-159.6750],
  "Hilton Garden Inn Kauai Wailua Bay":[22.0440,-159.3360], "Hilton Vacation Club The Point at Poipu Kauai":[21.8790,-159.4520],
  "Kauai Shores Hotel":[22.0610,-159.3170], "The Lodge at Kukuiʻula":[21.8860,-159.4870],
  "Sheraton Kauai Coconut Beach Resort":[22.0590,-159.3190],
  "Blue Dolphin Charters":[21.8968,-159.5908], "Captain Andy's Sailing Adventures":[21.8968,-159.5908],
  "Kayak Kauai":[22.0445,-159.3380], "Aloha with Touch Kauai":[22.0750,-159.3190],
  /* Lānaʻi */
  "Hotel Lanai":[20.8280,-156.9200]
 };
 /* Fallback: town or area centers, then island centers */
 var AREA_LOC = {
  "Waikīkī":[21.2793,-157.8292], "Honolulu":[21.3069,-157.8583], "Kapolei":[21.3355,-158.0580], "Aiea":[21.3861,-157.9420],
  "Haleiwa":[21.5928,-158.1034], "Laie":[21.6490,-157.9250], "Kahuku":[21.6800,-157.9500],
  "Lahaina":[20.8783,-156.6825], "Kihei":[20.7640,-156.4450], "Wailea":[20.6890,-156.4410], "Makena":[20.6500,-156.4400],
  "Kahului":[20.8893,-156.4729], "Wailuku":[20.8911,-156.5047], "Haliimaile":[20.8686,-156.3391],
  "Kailua-Kona":[19.6400,-155.9969], "Kailua Kona":[19.6400,-155.9969], "Kohala Coast":[19.9500,-155.8600],
  "Waikoloa":[19.9186,-155.8800], "Kamuela":[20.0200,-155.6690], "Hilo":[19.7241,-155.0868], "Volcano":[19.4290,-155.2340],
  "Honomu":[19.8710,-155.1140], "Hawi":[20.2410,-155.8330],
  "Lihue":[21.9789,-159.3711], "Koloa":[21.8790,-159.4600], "Kapaa":[22.0750,-159.3190], "Waimea":[21.9570,-159.6690],
  "Eleele":[21.8968,-159.5908], "Lanai City":[20.8270,-156.9190]
 };
 var ISL_CENTER = { oahu:[21.3069,-157.8583], maui:[20.8893,-156.4729], hawaii:[19.6400,-155.9969], kauai:[21.9789,-159.3711], lm:[20.8270,-156.9190] };
 var ISL_BOUNDS = {
  all:[[-160.35,18.85],[-154.75,22.30]],
  oahu:[[-158.30,21.24],[-157.64,21.73]], maui:[[-156.72,20.55],[-155.95,21.05]],
  hawaii:[[-156.10,18.90],[-154.80,20.30]], kauai:[[-159.80,21.85],[-159.28,22.25]], lm:[[-157.35,20.70],[-156.75,21.25]]
 };
 var map = null, mapReady = false, mapKinds = { stay:true, act:true };

 function locFor(d){
  if(LOC[d.b]) return LOC[d.b];
  if(d._isl === "all") return null;               /* statewide offers have no single spot */
  if(d.h && AREA_LOC[d.h]) return AREA_LOC[d.h];
  return ISL_CENTER[d._isl] || null;
 }
 function geojson(){
  var feats = [], seen = {};
  DEALS.forEach(function(d, idx){
   var p = locFor(d); if(!p) return;
   var key = p[0].toFixed(4) + "," + p[1].toFixed(4);
   var n = seen[key] = (seen[key] || 0) + 1;
   var lat = p[0], lng = p[1];
   if(n > 1){ var a = n * 2.4, r = 0.0011 * Math.sqrt(n); lat += Math.sin(a) * r; lng += Math.cos(a) * r; }
   var h = headline(d);
   feats.push({ type:"Feature", geometry:{ type:"Point", coordinates:[lng, lat] },
    properties:{ idx:idx, kind:d._c === "stay" ? "stay" : "act", score:d.s, label:h.big, rank:-d.s } });
  });
  return { type:"FeatureCollection", features:feats };
 }
 function pillImage(fill){
  var c = document.createElement("canvas"), w = 40, h = 28, r = 14, dpr = 2;
  c.width = w * dpr; c.height = h * dpr;
  var x = c.getContext("2d"); x.scale(dpr, dpr);
  x.fillStyle = fill; x.strokeStyle = "#ffffff"; x.lineWidth = 2;
  x.beginPath(); x.moveTo(r,1); x.lineTo(w-r,1); x.arc(w-r,h/2,h/2-1,-Math.PI/2,Math.PI/2); x.lineTo(r,h-1); x.arc(r,h/2,h/2-1,Math.PI/2,Math.PI*1.5); x.closePath();
  x.fill(); x.stroke();
  return { img:x.getImageData(0,0,w*dpr,h*dpr), opts:{ pixelRatio:dpr, stretchX:[[r*dpr,(w-r)*dpr]], stretchY:[[(h/2-2)*dpr,(h/2+2)*dpr]], content:[8*dpr,4*dpr,(w-8)*dpr,(h-4)*dpr] } };
 }
 function addDealLayers(){
  if(map.getSource("deals")) return;
  ["stay","act"].forEach(function(k){
   var p = pillImage(k === "stay" ? "#e8824c" : "#2b5c86");
   if(!map.hasImage("pill-"+k)) map.addImage("pill-"+k, p.img, p.opts);
  });
  /* two copies of the same data: dots and labels are kept apart so a font hiccup can never hide the pins */
  map.addSource("deals", { type:"geojson", data:geojson(), cluster:true, clusterRadius:42, clusterMaxZoom:11 });
  map.addSource("dealsTxt", { type:"geojson", data:geojson(), cluster:true, clusterRadius:42, clusterMaxZoom:11 });
  var font = ["Noto Sans Bold"];
  map.addLayer({ id:"clusters", type:"circle", source:"deals", filter:["has","point_count"],
   paint:{ "circle-color":"#0e1b2c", "circle-stroke-color":"#e8824c", "circle-stroke-width":3,
    "circle-radius":["step",["get","point_count"],16,10,20,30,25] } });
  map.addLayer({ id:"cluster-count", type:"symbol", source:"dealsTxt", filter:["has","point_count"],
   layout:{ "text-field":["get","point_count_abbreviated"], "text-font":font, "text-size":13, "text-allow-overlap":true },
   paint:{ "text-color":"#ffffff" } });
  map.addLayer({ id:"deal-dots", type:"circle", source:"deals", filter:["!",["has","point_count"]],
   paint:{ "circle-radius":["case",["==",["get","kind"],"stay"],6,5],
    "circle-color":["case",["==",["get","kind"],"stay"],"#e8824c","#2b5c86"],
    "circle-stroke-color":"#ffffff", "circle-stroke-width":2 } });
  map.addLayer({ id:"deal-pills", type:"symbol", source:"dealsTxt", filter:["!",["has","point_count"]],
   layout:{ "icon-image":["case",["==",["get","kind"],"stay"],"pill-stay","pill-act"], "icon-text-fit":"both",
    "text-field":["get","label"], "text-font":font, "text-size":12.5, "text-anchor":"bottom", "icon-anchor":"bottom",
    "text-offset":[0,-0.9], "symbol-sort-key":["get","rank"], "icon-allow-overlap":false, "text-allow-overlap":false },
   paint:{ "text-color":"#ffffff" } });
  applyKindFilter();

  map.on("click","clusters",function(e){
   var f = map.queryRenderedFeatures(e.point,{ layers:["clusters"] })[0];
   map.getSource("deals").getClusterExpansionZoom(f.properties.cluster_id).then(function(z){
    map.easeTo({ center:f.geometry.coordinates, zoom:z + 0.3 });
   }).catch(function(){});
  });
  ["deal-dots","deal-pills"].forEach(function(id){
   map.on("click", id, function(e){ showPopup(e.features[0]); });
   map.on("mouseenter", id, function(){ map.getCanvas().style.cursor = "pointer"; });
   map.on("mouseleave", id, function(){ map.getCanvas().style.cursor = ""; });
  });
  map.on("mouseenter","clusters",function(){ map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave","clusters",function(){ map.getCanvas().style.cursor = ""; });
 }
 var popup = null;
 function showPopup(f){
  var d = DEALS[f.properties.idx]; if(!d) return;
  var h = headline(d), t = tierOf(d);
  var html = '<div class="mpop"><span class="band '+t+'">'+esc(d.r)+' &middot; '+d.s+'</span>'
   + '<b>'+esc(d.b)+'</b><span class="mdeal">'+esc(h.big)+(h.small ? ' <small>'+esc(h.small)+'</small>' : '')+'</span>'
   + '<span class="mwhere">'+esc(where(d))+(d.h && d._isl !== "all" ? ', '+esc(d.h) : '')+' &middot; '+esc(daysLabel(d))+'</span>'
   + '<button type="button" class="btn coral" data-open="'+f.properties.idx+'">View offer &rarr;</button></div>';
  if(popup) popup.remove();
  popup = new maplibregl.Popup({ offset:14, closeButton:true, maxWidth:"280px" }).setLngLat(f.geometry.coordinates).setHTML(html).addTo(map);
 }
 function applyKindFilter(){
  if(!mapReady || !map.getSource("deals")) return;
  var fc = geojson();
  fc.features = fc.features.filter(function(f){ return mapKinds[f.properties.kind]; });
  map.getSource("deals").setData(fc);
  map.getSource("dealsTxt").setData(fc);
 }
 function mapFly(k){
  if(!map) return;
  var b = ISL_BOUNDS[k] || ISL_BOUNDS.all;
  map.fitBounds(b, { padding:24, duration:900 });
  document.querySelectorAll("[data-mapisl]").forEach(function(x){ x.setAttribute("aria-pressed", x.getAttribute("data-mapisl") === k ? "true" : "false"); });
 }
 function currentStyle(){ return document.documentElement.getAttribute("data-theme") === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT; }
 function initMap(){
  var box = $("dealMap"); if(!box) return;
  /* browsers block the map's background workers for files opened from a computer */
  var localFile = location.protocol === "file:" || location.href.indexOf("blob:null") === 0;
  if(localFile){ $("mapMsg").textContent = "The map appears on your live website. Browsers block it when this file is opened from your computer."; return; }
  if(typeof maplibregl === "undefined"){ $("mapMsg").textContent = "The map could not load. Browse the deals below."; return; }
  try{
   map = new maplibregl.Map({ container:box, style:currentStyle(), bounds:ISL_BOUNDS.all, fitBoundsOptions:{ padding:20 },
    attributionControl:{ compact:true }, cooperativeGestures:true, dragRotate:false, pitchWithRotate:false, maxZoom:17.5 });
  }catch(e){ $("mapMsg").textContent = "The map could not load. Browse the deals below."; return; }
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass:false }), "top-right");
  map.on("style.load", function(){ mapReady = true; addDealLayers(); $("mapMsg").hidden = true; });
  map.on("error", function(){ /* a missing tile or icon should never break the page */ });
  /* follow the light / dark toggle */
  new MutationObserver(function(){ if(map){ mapReady = false; map.setStyle(currentStyle()); } })
   .observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
 }

 function go(id){ var el = $(id); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); }

 function wire(){
  document.addEventListener("click", function(ev){
   var t = ev.target;
   var nav = t.closest("[data-nav]");
   if(nav){
    ev.preventDefault();
    var id = nav.getAttribute("data-nav");
    state.nav = id;
    if(id === "all"){ if(isAuto()) document.querySelector(".hrt-app").scrollIntoView({behavior:"smooth", block:"start"}); else document.querySelector(".hrt-main").scrollTo({top:0, behavior:"smooth"}); }
    else if(id.indexOf("h-") === 0){ state.hIsl = id.slice(2); state.hArea = ""; renderHotels(); mapFly(state.hIsl); go("hotels"); }
    else if(id.indexOf("a-") === 0){ state.aCat = id.slice(2); state.aAll = false; renderActs(); go("acts"); }
    else if(id === "soon"){ go("soon"); }
    syncNav(); return;
   }
   var op = t.closest("[data-open]");
   if(op){ var od = DEALS[+op.getAttribute("data-open")]; if(od) openDialog(od); return; }
   var kt = t.closest("[data-kind-toggle]");
   if(kt){ var kk = kt.getAttribute("data-kind-toggle"); mapKinds[kk] = !mapKinds[kk]; if(!mapKinds.stay && !mapKinds.act){ mapKinds[kk] = true; } document.querySelectorAll("[data-kind-toggle]").forEach(function(b){ b.setAttribute("aria-pressed", mapKinds[b.getAttribute("data-kind-toggle")] ? "true" : "false"); }); applyKindFilter(); return; }
   var mi = t.closest("[data-mapisl]");
   if(mi){ mapFly(mi.getAttribute("data-mapisl")); return; }
   var vb = t.closest("[data-view]");
   if(vb){ state.view = vb.getAttribute("data-view"); try{ localStorage.setItem("hrtKamaView", state.view); }catch(e){} syncView(); renderHotels(); renderSoon(); return; }
   var cc = t.closest("[data-copy]");
   if(cc){ var code = cc.getAttribute("data-copy"); try{ navigator.clipboard.writeText(code); cc.querySelector("small").textContent = "Copied"; }catch(e){} return; }
   var isl = t.closest("[data-isl]");
   if(isl){ state.hIsl = isl.getAttribute("data-isl"); state.hArea = ""; state.nav = "h-" + state.hIsl; renderHotels(); syncNav(); mapFly(state.hIsl); if(!isl.classList.contains("itab")) go("hotels"); return; }
   var area = t.closest("[data-area]");
   if(area){ state.hArea = area.getAttribute("data-area"); renderHotels(); return; }
   var qk = t.closest("[data-quick]");
   if(qk){ var k = qk.getAttribute("data-quick"); state.hQuick[k] = !state.hQuick[k]; renderHotels(); return; }
   var cat = t.closest("[data-cat]");
   if(cat){ state.aCat = cat.getAttribute("data-cat"); state.aAll = false; state.nav = state.aCat === "all" ? state.nav : "a-" + state.aCat; renderActs(); syncNav(); return; }
   var c = t.closest(".fcard,.acard,.lrow");
   if(c){ var d = DEALS[+c.getAttribute("data-idx")]; if(d) openDialog(d); return; }
   if(t.closest("[data-close]")){ $("dlg").close(); return; }
   var j = t.closest("[data-jump]");
   if(j){ ev.preventDefault(); go(j.getAttribute("data-jump")); }
  });
  $("dlg").addEventListener("click", function(ev){ if(ev.target === this) this.close(); });
  $("dlg").addEventListener("close", unlockParent);
  $("mfBtn").addEventListener("click", function(){
   var card = $("hotels"), open = !card.classList.contains("mf-open");
   card.classList.toggle("mf-open", open);
   this.setAttribute("aria-expanded", open ? "true" : "false");
  });
  $("mfClear").addEventListener("click", function(){ state.hQuick = {}; state.hArea = ""; renderHotels(); });
  $("aMore").addEventListener("click", function(){ state.aAll = !state.aAll; renderActs(); });
  $("hSort").addEventListener("change", function(){ state.hSort = this.value; renderHotels(); });
  $("aIsl").addEventListener("change", function(){ state.aIsl = this.value; state.aAll = false; renderActs(); });
  var tm;
  $("q").addEventListener("input", function(){
   clearTimeout(tm); var v = this.value;
   tm = setTimeout(function(){ var was = state.q; state.q = v.trim(); renderAll(); if(state.q && !was) go("hotels"); }, 160);
  });
 }

 function boot(){
  $("kHotels").textContent = HOTELS.length;
  $("kTop").textContent = HOTELS.filter(function(d){ return d.r === "Top pick" || d.r === "Strong"; }).length;
  $("kSoon").textContent = DEALS.filter(function(d){ return d.x; }).length;
  $("kActs").textContent = ACTS.length;
  $("snapLine").textContent = "Last updated " + SNAPSHOT_LABEL + ".";
  $("footSnap").textContent = "Kamaʻāina offers last updated " + SNAPSHOT_LABEL;
  renderTop(); renderAll(); wire(); sizeFrame();
  window.HRT_KAMA = { show:function(){ if(!map) initMap(); else map.resize(); }, open:function(i){ var d = DEALS[i]; if(d) openDialog(d); } };
  var mq = window.matchMedia("(max-width:760px)");
  var onMq = function(){ renderHotels(); renderSoon(); };
  if(mq.addEventListener) mq.addEventListener("change", onMq); else if(mq.addListener) mq.addListener(onMq);
 }
 if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
