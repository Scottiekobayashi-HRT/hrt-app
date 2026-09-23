
/* =====================================================================
   HRT FREE TOOLS: APP SHELL + TOOLS
   One router, one design system. Each tool below is its own block
   with its own data at the top of that block.
   ===================================================================== */
(function(){
 "use strict";

 /* ============== EDIT POINTS (links used across the dashboard) ============== */
 var SITE          = "https://www.hawaiirewardtravel.com";
 var PRO_URL       = SITE + "/pro";                    /* Try HRT PRO */
 var ATMOS_URL     = SITE + "/atmosrewardscalendar";   /* members open the calendar here */
 var COACHING_URL  = SITE + "/our-accelerated-program";
 var DISCLOSURE_URL= SITE + "/hawaiirewardtravelcomaffiliate-disclosure";
 var TB_FEED       = "https://raw.githubusercontent.com/Scottiekobayashi-HRT/hrt-bonuses/main/bonuses.json";
 var TB_FEED_BACKUP= "https://cdn.jsdelivr.net/gh/Scottiekobayashi-HRT/hrt-bonuses@main/bonuses.json";
 var VALUATIONS_UPDATED = "June 2026";
 var MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
 var MAP_STYLE_DARK  = "https://tiles.openfreemap.org/styles/dark";
 /* =========================================================================== */

 var $ = function(id){ return document.getElementById(id); };
 function esc(s){
  return String(s == null ? "" : s).replace(/\s*[\u2013\u2014]\s*/g, ", ")
   .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
 }
 function setHref(id, url){ var el = $(id); if(el) el.href = url; }
 ["navPro","topPro","homePro","atmosPro"].forEach(function(id){ setHref(id, PRO_URL); });
 ["homeCal","atmosCal"].forEach(function(id){ setHref(id, ATMOS_URL); });
 setHref("navHome", SITE); setHref("navDisc", DISCLOSURE_URL); setHref("welcomeCoach", COACHING_URL);
 setTimeout(function(){ setHref("coachLink", COACHING_URL); }, 0);

 /* ============================== ROUTER ============================== */
 var ROUTES = {
  home:{ title:"Dashboard", hint:"Free tools for Hawaiʻi points travelers" },
  kamaaina:{ title:"Kamaʻāina Deals", hint:"Resident staycation rates by island" },
  atmos:{ title:"Atmos Award Calendar", hint:"Included with HRT PRO" },
  lounges:{ title:"HNL Lounge Map", hint:"Every lounge at HNL" },
  transfers:{ title:"Transfer Bonuses", hint:"Checked daily" },
  values:{ title:"Points Valuations", hint:"Benchmarks for " + VALUATIONS_UPDATED },
  welcome:{ title:"Welcome Bonuses", hint:"Coming soon" },
  resy:{ title:"Resy Hawaiʻi Map", hint:"Amex Resy Credit status" }
 };
 var shown = {}, current = null;
 var onShow = {};
 function parentHash(){ try{ if(window.parent !== window) return window.parent.location.hash; }catch(e){} return ""; }
 function route(name, noScroll){
  if(!ROUTES[name]) name = "home";
  current = name;
  document.querySelectorAll(".view").forEach(function(v){ v.classList.toggle("on", v.getAttribute("data-page") === name); });
  document.querySelectorAll("#sideNav [data-route]").forEach(function(a){
   var on = a.getAttribute("data-route") === name;
   a.classList.toggle("on", on); a.setAttribute("aria-current", on ? "page" : "false");
  });
  $("crumb").innerHTML = name === "home" ? "Dashboard" : '<a href="#home" data-route="home">Dashboard</a> <span aria-hidden="true">/</span> ' + esc(ROUTES[name].title);
  $("tbHint").textContent = ROUTES[name].hint;
  try{ history.replaceState(null, "", "#" + name); }catch(e){}
  try{ if(window.parent !== window) window.parent.history.replaceState(null, "", "#" + name); }catch(e){}
  if(onShow[name]) onShow[name](!shown[name]);
  shown[name] = true;
  if(!noScroll){
   var main = document.querySelector(".hrt-main");
   if(document.documentElement.classList.contains("auto-h")) document.querySelector(".hrt-app").scrollIntoView({block:"start"});
   else if(main) main.scrollTop = 0;
  }
 }
 document.addEventListener("click", function(ev){
  var a = ev.target.closest("[data-route]");
  if(!a) return;
  ev.preventDefault();
  route(a.getAttribute("data-route"));
 });
 window.addEventListener("hashchange", function(){ var h = location.hash.replace("#",""); if(h && h !== current) route(h); });

 /* ============================ SHARED MAP ============================ */
 function mapStyle(){ return document.documentElement.getAttribute("data-theme") === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT; }
 function localFile(){ return location.protocol === "file:" || location.href.indexOf("blob:null") === 0; }
 function makeMap(box, msg, opts){
  if(localFile()){ msg.textContent = "The map appears on your live website. Browsers block it when this file is opened from your computer."; return null; }
  if(typeof maplibregl === "undefined"){ msg.textContent = "The map could not load. The list below still works."; return null; }
  var m = new maplibregl.Map(Object.assign({ container:box, style:mapStyle(), attributionControl:{ compact:true },
   cooperativeGestures:true, dragRotate:false, pitchWithRotate:false, maxZoom:18 }, opts || {}));
  m.touchZoomRotate.disableRotation();
  m.addControl(new maplibregl.NavigationControl({ showCompass:false }), "top-right");
  m.on("load", function(){ msg.hidden = true; });
  m.on("error", function(){});
  new MutationObserver(function(){ m.setStyle(mapStyle()); })
   .observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] });
  return m;
 }

 /* ======================= TRANSFER BONUSES ======================= */
 var TB = { list:[], expired:[], bank:"all", type:"all", loaded:false };
 var BANK_ORDER = ["amex","bilt","capital-one","chase","citi","rove"];
 var BANK_NAMES = { "amex":"American Express Membership Rewards","bilt":"Bilt Rewards","capital-one":"Capital One Miles","chase":"Chase Ultimate Rewards","citi":"Citi ThankYou Points","rove":"Rove Rewards" };
 var BANK_SHORT = { "amex":"Amex","bilt":"Bilt","capital-one":"Capital One","chase":"Chase","citi":"Citi","rove":"Rove" };
 function daysUntil(s){ if(!s) return 999; var t = new Date(s + "T23:59:59"); if(isNaN(t)) return 999; return Math.ceil((t - new Date()) / 86400000); }
 function fmtDate(s){ if(!s) return "No end date"; var d = new Date(s + "T12:00:00"); if(isNaN(d)) return s || ""; var o = { month:"short", day:"numeric" }; if(d.getFullYear() !== new Date().getFullYear()) o.year = "numeric"; return d.toLocaleDateString("en-US", o); }
 function daysLabel(n){ if(n === 999) return "End date not announced"; if(n < 0) return "Ended"; if(n === 0) return "Ends today"; if(n === 1) return "Ends tomorrow"; if(n <= 21) return n + " days left"; if(n <= 60) return Math.round(n/7) + " weeks left"; return Math.round(n/30) + " months left"; }
 function xfer(r){ if(!r) return null; var p = String(r).replace(/\s/g,"").split(":"); if(p.length !== 2) return null; var a = parseFloat(p[0]), b = parseFloat(p[1]); if(!(a > 0) || isNaN(b)) return null; var k = 1000 / a; return { from:Math.round(a*k).toLocaleString(), to:Math.round(b*k).toLocaleString() }; }

 function tbLoad(){
  function use(data){
   var raw = data.bonuses || [];
   TB.list = raw.filter(function(b){ return b && daysUntil(b.expiresDate) > 0; });
   var seenX = {}; TB.expired = (data.recentlyExpired || []).filter(function(b){ var k = b.bank + "|" + String(b.partner).toLowerCase().replace(/[^a-z]/g,"").slice(0,10); if(seenX[k]) return false; seenX[k] = 1; return true; }).slice(0, 8);
   TB.status = (data.meta && data.meta.bankStatus) || null;
   TB.checked = data.lastUpdated;
   TB.loaded = true;
   var d = new Date(data.lastUpdated);
   $("tbUpdated").textContent = isNaN(d) ? "Updated daily" : "Updated " + d.toLocaleString("en-US",{ month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
   tbStats(); tbRender(); homeTb();
   if(raw.length && !TB.list.length) tbState("Bonus data looks out of date", "The file loaded but every entry has expired. The daily check may not have run.");
  }
  fetch(TB_FEED + "?t=" + Date.now(), { cache:"no-store" })
   .then(function(r){ if(!r.ok) throw 0; return r.json(); })
   .catch(function(){ return fetch(TB_FEED_BACKUP, { cache:"no-cache" }).then(function(r){ if(!r.ok) throw 0; return r.json(); }); })
   .then(use)
   .catch(function(){
    tbState("Could not load bonus data", "We are having trouble reaching the bonus data right now. Please check back shortly.");
    $("tbUpdated").textContent = "Live data unavailable";
    var h = $("hmTbList"); if(h) h.innerHTML = '<div class="mini-empty">Live bonuses are unavailable right now.</div>';
   });
 }
 function tbState(t, b){ $("tbBody").innerHTML = '<div class="tb-state"><b>'+esc(t)+'</b>'+esc(b)+'</div>'; }
 function tbStats(){
  var soon = TB.list.filter(function(b){ var d = daysUntil(b.expiresDate); return d > 0 && d <= 7; }).length;
  var best = Math.max.apply(null, TB.list.map(function(b){ return +b.bonusPct || 0; }).concat([0]));
  $("tbS1").textContent = TB.list.length; $("tbS2").textContent = soon; $("tbS3").textContent = best ? "+" + best + "%" : "none";
  $("navTb").textContent = TB.list.length || "";
  $("hmTb").textContent = TB.list.length; $("hmTbBest").textContent = best ? "+" + best + "%" : "none";
  $("ttTb").textContent = TB.list.length + " live" + (best ? ", best +" + best + "%" : "");
  var counts = {}; TB.list.forEach(function(b){ counts[b.bank] = (counts[b.bank]||0) + 1; });
  $("tbBanks").innerHTML = '<button type="button" class="chipf'+(TB.bank==="all"?'':' plain')+'" data-t-bank="all" aria-pressed="'+(TB.bank==="all")+'">All banks<span class="n">'+TB.list.length+'</span></button>'
   + BANK_ORDER.map(function(k){ var on = TB.bank === k; return '<button type="button" class="chipf'+(on?'':' plain')+'" data-t-bank="'+k+'" aria-pressed="'+on+'">'+BANK_SHORT[k]+'<span class="n">'+(counts[k]||0)+'</span></button>'; }).join("");
 }
 function tbRow(b){
  var d = daysUntil(b.expiresDate), u = d <= 3 ? "critical" : d <= 7 ? "soon" : "";
  var x = xfer(b.bonusRatio || b.transferRatio);
  var icon = b.partnerType === "hotel" ? "&#127976;" : "&#9992;&#65039;";
  return '<div class="tb-row">'
   + '<div class="tb-p"><span class="tb-ic">'+icon+'</span><div><b>'+esc(b.partner)+'</b><small>'+(b.partnerType === "hotel" ? "Hotel" : "Airline")+(b.method === "manual" ? ' <span class="tb-ver">Verified by HRT</span>' : '')+'</small></div></div>'
   + '<span class="tb-pill'+(b.bonusPct >= 40 ? " hot" : "")+'">+'+esc(b.bonusPct)+'%</span>'
   + '<div class="tb-x">'+(x ? x.from + ' &rarr; ' + x.to : '&ndash;')+'<small>pts to '+(b.partnerType === "hotel" ? "points" : "miles")+'</small></div>'
   + '<div class="tb-e '+u+'">'+esc(fmtDate(b.expiresDate))+'<small>'+esc(daysLabel(d))+'</small></div>'
   + '<button type="button" class="tb-calc" data-t-use="'+esc(b.bank)+'|'+esc(b.bonusPct)+'">Calculate</button>'
   + '</div>';
 }
 function tbRender(){
  if(!TB.loaded) return;
  var vis = TB.list.filter(function(b){ return (TB.bank === "all" || b.bank === TB.bank) && (TB.type === "all" || b.partnerType === TB.type); })
   .sort(function(a,b){ return daysUntil(a.expiresDate) - daysUntil(b.expiresDate); });
  if(!vis.length){ tbState(TB.list.length ? "No bonuses in this view" : "No active bonuses right now", TB.list.length ? "Try a different filter." : "Our latest check found no active transfer bonuses. Check back soon."); }
  else {
   var g = {}; vis.forEach(function(b){ (g[b.bank] = g[b.bank] || []).push(b); });
   var order = BANK_ORDER.filter(function(k){ return g[k]; }); Object.keys(g).forEach(function(k){ if(order.indexOf(k) < 0) order.push(k); });
   $("tbBody").innerHTML = order.map(function(k){
    return '<div class="tb-group"><div class="tb-gh"><b>'+esc(BANK_NAMES[k] || g[k][0].bankName || k)+'</b><span>'+g[k].length+' active</span></div>'+g[k].map(tbRow).join("")+'</div>';
   }).join("");
  }
  /* banks with nothing live: say so, so a quiet bank never looks broken */
  var quiet = BANK_ORDER.filter(function(k){ return (TB.bank === "all" || TB.bank === k) && !TB.list.some(function(b){ return b.bank === k && (TB.type === "all" || b.partnerType === TB.type); }); });
  if(quiet.length){
   var when = TB.checked ? new Date(TB.checked) : null;
   var whenTxt = when && !isNaN(when) ? when.toLocaleDateString("en-US",{ month:"short", day:"numeric" }) : "today";
   var note = '<div class="tb-quiet"><b>No live bonus right now:</b> ' + quiet.map(function(k){ var st = TB.status && TB.status[k]; return esc(BANK_SHORT[k]) + (st && st.ok === false ? " (check failed, retrying)" : ""); }).join(", ") + '. Checked ' + esc(whenTxt) + '.</div>';
   if(vis.length) $("tbBody").insertAdjacentHTML("beforeend", note); else $("tbBody").innerHTML = note;
  }
  var expV = TB.expired.filter(function(b){ return TB.bank === "all" || b.bank === TB.bank; });
  $("tbExpired").innerHTML = expV.length ? '<div class="tb-exp"><h4>Recently ended</h4><div>'+expV.map(function(b){ return '<span>'+esc(BANK_SHORT[b.bank] || b.bankName)+' to '+esc(b.partner)+' +'+esc(b.bonusPct)+'%</span>'; }).join("")+'</div></div>' : "";
 }
 /* transfer calculator (partner lists and ratios) */
 var PROGRAMS = {
  "chase":{ name:"Chase Ultimate Rewards", p:[["United MileagePlus","airline",1,1,1],["Southwest Rapid Rewards","airline",1,1],["Air Canada Aeroplan","airline",1,1],["British Airways Avios","airline",1,1],["Iberia Avios","airline",1,1],["Aer Lingus Avios","airline",1,1],["Air France/KLM Flying Blue","airline",1,1],["Singapore KrisFlyer","airline",1,1],["Emirates Skywards","airline",1,1],["JetBlue TrueBlue","airline",1,1],["Virgin Atlantic Flying Club","airline",1,1],["World of Hyatt","hotel",1,1,1],["Marriott Bonvoy","hotel",1,1,1],["IHG One Rewards","hotel",1,1]] },
  "amex":{ name:"Amex Membership Rewards", p:[["ANA Mileage Club","airline",1,1,1],["JAL Mileage Bank","airline",1,1,1],["Delta SkyMiles","airline",1,1],["Air Canada Aeroplan","airline",1,1],["Air France/KLM Flying Blue","airline",1,1],["British Airways Avios","airline",1,1],["Iberia Avios","airline",1,1],["Singapore KrisFlyer","airline",1,1],["Cathay Asia Miles","airline",1,1],["Emirates Skywards","airline",1,1],["Etihad Guest","airline",1,1],["Qantas Frequent Flyer","airline",1,1],["JetBlue TrueBlue","airline",250,200],["Virgin Atlantic Flying Club","airline",1,1],["Hawaiian/Atmos Rewards","airline",1,1,1],["Marriott Bonvoy","hotel",1,1,1],["Hilton Honors","hotel",1,2,1],["Choice Privileges","hotel",1,1]] },
  "capital-one":{ name:"Capital One Miles", p:[["Air Canada Aeroplan","airline",1,1],["Turkish Airlines Miles&Smiles","airline",1,1],["Emirates Skywards","airline",1,1],["Avianca LifeMiles","airline",1,1],["British Airways Avios","airline",1,1],["Air France/KLM Flying Blue","airline",1,1],["Singapore KrisFlyer","airline",1,1],["Cathay Asia Miles","airline",1,1],["TAP Air Portugal Miles&Go","airline",1,1],["Finnair Plus","airline",1,1],["Qantas Frequent Flyer","airline",1,1],["Japan Airlines Mileage Bank","airline",4,3,1],["Wyndham Rewards","hotel",1,1],["Accor Live Limitless","hotel",2,1]] },
  "citi":{ name:"Citi ThankYou Points", p:[["Japan Airlines Mileage Bank","airline",1,1,1],["Aeromexico Rewards","airline",1,1],["EVA Air Infinity MileageLands","airline",1,1],["Qantas Frequent Flyer","airline",1,1],["Thai Royal Orchid Plus","airline",1,1],["Choice Privileges","hotel",1,2],["Accor Live Limitless","hotel",2,1],["Leading Hotels of the World Leaders Club","hotel",5,1],["Air France/KLM Flying Blue","airline",1,1],["Singapore KrisFlyer","airline",1,1],["Turkish Airlines Miles&Smiles","airline",1,1],["Emirates Skywards","airline",1,1],["Etihad Guest","airline",1,1],["Qatar Airways Privilege Club","airline",1,1],["Virgin Atlantic Flying Club","airline",1,1],["Avianca LifeMiles","airline",1,1],["Cathay Asia Miles","airline",1,1],["JetBlue TrueBlue","airline",1,1],["Wyndham Rewards","hotel",1,1]] },
  "bilt":{ name:"Bilt Rewards", p:[["United MileagePlus","airline",1,1,1],["American Airlines AAdvantage","airline",1,1,1],["Alaska Atmos Rewards","airline",1,1,1],["Japan Airlines Mileage Bank","airline",1,1,1],["Air Canada Aeroplan","airline",1,1],["British Airways Avios","airline",1,1],["Iberia Avios","airline",1,1],["Aer Lingus Avios","airline",1,1],["Air France/KLM Flying Blue","airline",1,1],["Emirates Skywards","airline",1,1],["Cathay Asia Miles","airline",1,1],["Turkish Airlines Miles&Smiles","airline",1,1],["Virgin Atlantic Flying Club","airline",1,1],["Singapore KrisFlyer","airline",1,1],["Avianca LifeMiles","airline",1,1],["ITA Airways Volare","airline",1,1],["World of Hyatt","hotel",1,1,1],["Marriott Bonvoy","hotel",1,1,1],["IHG One Rewards","hotel",1,1],["Hilton Honors","hotel",1,1,1],["Wyndham Rewards","hotel",1,1]] }
 };
 var TC = { cat:"all" };
 function tcPts(){ var n = parseInt(($("tcPts").value || "").replace(/[^0-9]/g,""), 10); return isNaN(n) ? 0 : n; }
 function tcRender(){
  var prog = $("tcProg").value, pts = tcPts(), bonus = Math.max(0, parseFloat($("tcBonus").value) || 0), sort = $("tcSort").value;
  if(!prog){ $("tcResults").innerHTML = '<div class="cg-empty">Choose a points program to see every transfer partner and your miles.</div>'; $("tcCount").textContent = "Select a program above"; return; }
  var list = PROGRAMS[prog].p.filter(function(p){ return TC.cat === "all" || p[1] === TC.cat; });
  function miles(p){ return pts * (p[3]/p[2]) * (1 + bonus/100); }
  if(sort === "most") list.sort(function(a,b){ return miles(b) - miles(a) || a[0].localeCompare(b[0]); });
  else if(sort === "alpha") list.sort(function(a,b){ return a[0].localeCompare(b[0]); });
  else list.sort(function(a,b){ return a[1] === b[1] ? a[0].localeCompare(b[0]) : (a[1] === "airline" ? -1 : 1); });
  $("tcCount").textContent = list.length + " partner" + (list.length === 1 ? "" : "s");
  $("tcResults").innerHTML = list.map(function(p){
   var base = Math.floor(pts * p[3] / p[2]), tot = Math.floor(miles(p)), has = bonus > 0 && pts > 0;
   return '<div class="cg"><span class="tb-ic">'+(p[1] === "hotel" ? "&#127976;" : "&#9992;&#65039;")+'</span><div class="cg-i"><b>'+esc(p[0])+'</b><small>Ratio '+(p[2] === 1 && p[3] === 1 ? "1:1" : p[2] + ":" + p[3])+(p[4] ? '<span class="hi">Hawaiʻi pick</span>' : '')+'</small></div>'
    + '<div class="cg-m"><b class="'+(has ? "bn" : "")+'">'+(pts ? tot.toLocaleString() : "&ndash;")+'</b><small>'+(has ? "+" + (tot - base).toLocaleString() + " bonus" : (p[1] === "hotel" ? "points" : "miles"))+'</small></div></div>';
  }).join("");
 }
 $("tcProg").addEventListener("change", tcRender);
 $("tcBonus").addEventListener("input", tcRender);
 $("tcSort").addEventListener("change", tcRender);
 $("tcPts").addEventListener("input", function(){ var r = this.value.replace(/[^0-9]/g,""); this.value = r ? parseInt(r,10).toLocaleString("en-US") : ""; tcRender(); });
 document.addEventListener("click", function(ev){
  var t = ev.target;
  var b = t.closest("[data-t-bank]"); if(b){ TB.bank = b.getAttribute("data-t-bank"); tbStats(); tbRender(); return; }
  var ty = t.closest("[data-t-type]"); if(ty){ TB.type = ty.getAttribute("data-t-type"); document.querySelectorAll("[data-t-type]").forEach(function(x){ var on = x === ty; x.classList.toggle("plain", !on); x.setAttribute("aria-pressed", on); }); tbRender(); return; }
  var cf = t.closest("[data-t-cf]"); if(cf){ TC.cat = cf.getAttribute("data-t-cf"); document.querySelectorAll("[data-t-cf]").forEach(function(x){ var on = x === cf; x.classList.toggle("plain", !on); x.setAttribute("aria-pressed", on); }); tcRender(); return; }
  var use = t.closest("[data-t-use]"); if(use){
   var parts = use.getAttribute("data-t-use").split("|");
   if(PROGRAMS[parts[0]]){ $("tcProg").value = parts[0]; $("tcBonus").value = parts[1]; if(!$("tcPts").value) $("tcPts").value = "50,000"; tcRender(); $("tbCalc").scrollIntoView({ behavior:"smooth", block:"start" }); }
   return;
  }
 });
 tcRender();

 /* ========================== VALUATIONS ========================== */
 var VALS = [
  ["Bilt Rewards","cc",2.2],["Chase Ultimate Rewards","cc",2.05],["Amex Membership Rewards","cc",2.0],["Citi ThankYou Rewards","cc",1.9],["Capital One Miles","cc",1.85],["Wells Fargo Rewards","cc",1.65],
  ["American AAdvantage","airline",1.6],["Avios (BA/Iberia/Aer Lingus)","airline",1.4],["Air Canada Aeroplan","airline",1.4],["Alaska Atmos Rewards","airline",1.4],["ANA Mileage Club","airline",1.4],["Avianca LifeMiles","airline",1.4],["JetBlue TrueBlue","airline",1.35],["United MileagePlus","airline",1.35],["Cathay Asia Miles","airline",1.3],["Flying Blue (AF/KLM)","airline",1.3],["Frontier Miles","airline",1.3],["Qantas Frequent Flyer","airline",1.3],["Singapore KrisFlyer","airline",1.3],["Virgin Atlantic Flying Club","airline",1.3],["Southwest Rapid Rewards","airline",1.25],["Delta SkyMiles","airline",1.2],["Emirates Skywards","airline",1.2],["Etihad Guest","airline",1.2],["Spirit Free Spirit","airline",1.1],["Turkish Miles&Smiles","airline",1.1],["Aeromexico Rewards","airline",0.8],
  ["World of Hyatt","hotel",1.7],["Accor Live Limitless","hotel",2.0],["Marriott Bonvoy","hotel",0.75],["Wyndham Rewards","hotel",0.65],["IHG One Rewards","hotel",0.6],["Best Western Rewards","hotel",0.6],["Choice Privileges","hotel",0.6],["Hilton Honors","hotel",0.4]
 ];
 var HPICKS = [
  ["Chase Ultimate Rewards","2.05¢","/ pt","Transfers to United, Hyatt and more. The best all around currency for Hawaiʻi families."],
  ["Amex Membership Rewards","2.0¢","/ pt","Transfers to ANA, JAL and 17+ partners. Ideal for premium cabins to Japan."],
  ["ANA Mileage Club","1.4¢","/ mi","HNL to Tokyo routes with Business and First sweet spots from Hawaiʻi."],
  ["Alaska Atmos Rewards","1.4¢","/ mi","Formerly HawaiianMiles. Covers Hawaiʻi routes plus the Alaska network."],
  ["United MileagePlus","1.35¢","/ mi","Nonstops to HNL from mainland hubs and good partner space to Asia."],
  ["World of Hyatt","1.7¢","/ pt","Several Hyatt resorts in Hawaiʻi. The best hotel currency for island stays."]
 ];
 var CATC = { cc:"#e8824c", airline:"#3a7bb5", hotel:"#1f9d57" };
 var vCat = "all";
 $("valUpd").textContent = VALUATIONS_UPDATED;
 function vOptions(){ return '<option value="">Select a program</option>' + VALS.map(function(v,i){ return '<option value="'+i+'">'+esc(v[0])+' ('+v[2].toFixed(2)+'¢)</option>'; }).join(""); }
 function vRow(){
  var r = document.createElement("div"); r.className = "vc-row";
  r.innerHTML = '<select aria-label="Program">'+vOptions()+'</select><input type="text" inputmode="numeric" placeholder="Balance" aria-label="Balance"><div class="vc-res">$0.00</div><button type="button" class="vc-del" aria-label="Remove">&times;</button>';
  r.querySelector("select").addEventListener("change", vCalc);
  r.querySelector("input").addEventListener("input", function(){ var x = this.value.replace(/[^0-9]/g,""); this.value = x ? parseInt(x,10).toLocaleString("en-US") : ""; vCalc(); });
  r.querySelector(".vc-del").addEventListener("click", function(){ r.remove(); if(!$("vcRows").children.length) vRow(); vCalc(); });
  $("vcRows").appendChild(r);
 }
 function money(n){ return "$" + n.toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 }); }
 function vCalc(){
  var total = 0;
  Array.prototype.forEach.call($("vcRows").children, function(r){
   var i = r.querySelector("select").value, pts = parseInt((r.querySelector("input").value || "").replace(/[^0-9]/g,""),10) || 0;
   var v = (i === "" || !pts) ? 0 : pts * VALS[i][2] / 100; total += v;
   r.querySelector(".vc-res").textContent = money(v);
  });
  $("vcTotal").textContent = money(total).replace(".00","");
 }
 function vList(){
  var list = VALS.filter(function(v){ return vCat === "all" || v[1] === vCat; }).sort(function(a,b){ return b[2] - a[2]; });
  $("vList").innerHTML = list.map(function(v){ return '<div class="vitem"><span><i style="background:'+CATC[v[1]]+'"></i>'+esc(v[0])+'</span><b style="color:'+CATC[v[1]]+'">'+v[2].toFixed(2)+'¢</b></div>'; }).join("");
 }
 $("vcAdd").addEventListener("click", vRow);
 document.addEventListener("click", function(ev){ var c = ev.target.closest("[data-v-cat]"); if(!c) return; vCat = c.getAttribute("data-v-cat"); document.querySelectorAll("[data-v-cat]").forEach(function(x){ var on = x === c; x.classList.toggle("plain", !on); x.setAttribute("aria-pressed", on); }); vList(); });
 $("vPicks").innerHTML = HPICKS.map(function(h){ return '<div class="hpick"><b>'+esc(h[0])+'</b><strong>'+h[1]+' <small>'+h[2]+'</small></strong><p>'+esc(h[3])+'</p></div>'; }).join("");
 vRow(); vRow(); vCalc(); vList();

 /* ========================== RESY MAP ========================== */
 var V = [
  {n:"@SUSHI",i:"Oʻahu",a:"Restaurant Row",ad:"500 Ala Moana Blvd",c:"Japanese",s:"eligible",lat:21.3021,lng:-157.8617,u:"https://resy.com/cities/honolulu-hi/venues/sushi"},
  {n:"Brix and Stones",i:"Oʻahu",a:"Kakaʻako",ad:"999 Waimanu St",c:"Lounge and cigar bar",s:"eligible",lat:21.2954,lng:-157.8571,u:"https://resy.com/cities/honolulu-hi/venues/brix-and-stones"},
  {n:"DOMODOMO Hawaii",i:"Oʻahu",a:"ʻEwa Beach",ad:"91-050 Fort Weaver Rd",c:"Japanese, hand rolls, sushi",s:"eligible",lat:21.3199,lng:-158.0131,u:"https://resy.com/cities/ewa-beach-hi-hi/venues/domodomo-hawaii"},
  {n:"Empire Steakhouse Hawaii",i:"Oʻahu",a:"Waikīkī, Ilikai",ad:"1777 Ala Moana Blvd",c:"Steakhouse",s:"eligible",lat:21.2846,lng:-157.8376,u:"https://resy.com/cities/honolulu-hi/venues/empire-steakhouse-hawaii"},
  {n:"Lava Lounge Waikiki",i:"Oʻahu",a:"Waikīkī, Twin Fin",ad:"2570 Kalākaua Ave",c:"Cocktail bar",s:"eligible",lat:21.2719,lng:-157.8241,u:"https://resy.com/cities/honolulu-hi/venues/lava-lounge-waikiki"},
  {n:"Nanzan Giro Giro",i:"Oʻahu",a:"Ala Moana",ad:"560 Pensacola St",c:"Japanese",s:"eligible",lat:21.2986,lng:-157.8481,u:"https://resy.com/cities/honolulu-hi/venues/nanzan-giro-giro"},
  {n:"OKDONGSIK Hawaii",i:"Oʻahu",a:"Ala Moana",ad:"1388 Kapiolani Blvd #3",c:"Korean",s:"eligible",lat:21.2931,lng:-157.8421,u:"https://resy.com/cities/honolulu-hi/venues/okdongsik-hawaii"},
  {n:"Olay's Thai Lao Cuisine",i:"Oʻahu",a:"Chinatown",ad:"66 N Hotel St",c:"Thai and Lao",s:"eligible",lat:21.3129,lng:-157.8609,u:"https://resy.com/cities/honolulu-hi/venues/olays-thai-lao-cuisine"},
  {n:"Pigeonhole",i:"Oʻahu",a:"Chinatown",ad:"Chinatown, Honolulu",c:"Cocktail bar",s:"eligible",lat:21.3122,lng:-157.8631,u:"https://resy.com/cities/honolulu-hi/venues/pigeonhole"},
  {n:"Rinka",i:"Oʻahu",a:"Kakaʻako, AEʻO",ad:"1001 Queen St #105",c:"Japanese",s:"eligible",lat:21.2948,lng:-157.8549,u:"https://resy.com/cities/honolulu-hi/venues/rink"},
  {n:"Silver Lining Wine Bar",i:"Oʻahu",a:"Kakaʻako",ad:"999 Waimanu St",c:"Natural wine",s:"eligible",lat:21.2952,lng:-157.8569,u:"https://resy.com/cities/honolulu-hi/venues/silver-lining-wine-bar"},
  {n:"Skull & Crown Trading Co.",i:"Oʻahu",a:"Chinatown",ad:"62 N Hotel St",c:"Tiki and cocktail bar",s:"eligible",lat:21.3127,lng:-157.8607,u:"https://resy.com/cities/honolulu-hi/venues/skull-and-crown-trading-co"},
  {n:"Tanaka Ramen & Izakaya",i:"Oʻahu",a:"Ala Moana Center",ad:"1450 Ala Moana Blvd #2054",c:"Ramen and izakaya",s:"eligible",lat:21.2912,lng:-157.8435,u:"https://resy.com/cities/honolulu-hi/venues/tanaka-ramen-and-izakaya"},
  {n:"Torishin Hawaii",i:"Oʻahu",a:"Kakaʻako, AEʻO",ad:"1001 Queen St",c:"Japanese",s:"eligible",lat:21.2946,lng:-157.8551,u:"https://resy.com/cities/honolulu-hi/venues/torishin-hawaii"},
  {n:"Toro",i:"Oʻahu",a:"Iwilei",ad:"1130 N Nimitz Hwy C130",c:"Sushi",s:"eligible",lat:21.3161,lng:-157.8721,u:"https://resy.com/cities/honolulu-hi/venues/toro"},
  {n:"Vein At Kakaʻako",i:"Oʻahu",a:"Kakaʻako",ad:"685 Auahi St Bldg 2 Ste 121",c:"Japanese-Italian",s:"eligible",lat:21.2939,lng:-157.8525,u:"https://resy.com/cities/honolulu-hi/venues/vein-at-kakaako"},
  {n:"Mina's Fish House",i:"Oʻahu",a:"Kapolei, Ko Olina",ad:"Four Seasons Resort Oahu",c:"Seafood",s:"pending",lat:21.3352,lng:-158.1228,u:"https://www.exploretock.com/minasfishhouse/"},
  {n:"Noe",i:"Oʻahu",a:"Kapolei, Ko Olina",ad:"Four Seasons Resort Oahu",c:"Southern Italian",s:"pending",lat:21.3349,lng:-158.1232,u:"https://www.exploretock.com/noe/"},
  {n:"Sushi Sho",i:"Oʻahu",a:"Waikīkī",ad:"The Ritz-Carlton Residences",c:"Edomae omakase",s:"pending",lat:21.2795,lng:-157.8290,u:"https://www.exploretock.com/sushisho/"},
  {n:"Dragon Upstairs",i:"Oʻahu",a:"Chinatown",ad:"1038 Nuʻuanu Ave",c:"Jazz bar and lounge",s:"unconfirmed",lat:21.3140,lng:-157.8621,u:"https://resy.com/cities/honolulu-hi/venues/dragon-upstairs"},
  {n:"Lady Elaine",i:"Oʻahu",a:"Honolulu",ad:"Address not confirmed",c:"Restaurant and bar",s:"unconfirmed",lat:21.3069,lng:-157.8583,u:"https://resy.com/cities/honolulu-hi/venues/lady-elaine-hi"},
  {n:"The Boardroom",i:"Oʻahu",a:"Kailua",ad:"Kailua",c:"Fusion",s:"unconfirmed",lat:21.3926,lng:-157.7396,u:"https://resy.com/cities/kailua-hi/venues/the-boardroom-hi"},
  {n:"Banyan Tree at The Ritz-Carlton Maui",i:"Maui",a:"Kapalua",ad:"Ritz-Carlton Maui",c:"Pacific Rim",s:"unconfirmed",lat:20.9990,lng:-156.6432,u:"https://resy.com/cities/lahaina-hi/venues/banyan-tree-restaurant-ritz-carlton-maui"},
  {n:"Humuhumunukunukuāpuaʻa",i:"Maui",a:"Wailea",ad:"Grand Wailea",c:"Seafood, Hawaiʻi regional",s:"unconfirmed",lat:20.6889,lng:-156.4432,u:"https://resy.com/cities/wailea-makena-hi-hi/venues/humuhumunukunukuapuaa"},
  {n:"Isana",i:"Maui",a:"Kīhei",ad:"515 S Kīhei Rd",c:"Korean barbecue and sushi",s:"unconfirmed",lat:20.7279,lng:-156.4535,u:"https://resy.com/cities/kihei-hi/venues/isana"},
  {n:"MauiWine",i:"Maui",a:"Kula",ad:"Ulupalakua",c:"Winery tasting room",s:"unconfirmed",lat:20.6440,lng:-156.3962,u:"https://resy.com/cities/kula-hi/venues/mauiwine"},
  {n:"Nobu Grand Wailea",i:"Maui",a:"Wailea",ad:"Grand Wailea",c:"Japanese",s:"unconfirmed",lat:20.6893,lng:-156.4427,u:"https://resy.com/cities/wailea-makena-hi-hi/venues/nobu-grand-wailea"},
  {n:"Pita Paradise",i:"Maui",a:"Kīhei",ad:"Wailea Gateway",c:"Mediterranean",s:"unconfirmed",lat:20.6972,lng:-156.4421,u:"https://resy.com/cities/kihei-hi/venues/pita-paradise"},
  {n:"Sale Pepe",i:"Maui",a:"Lahaina",ad:"Lahaina",c:"Italian",s:"unconfirmed",lat:20.8788,lng:-156.6791,u:"https://resy.com/cities/lahaina-hi/venues/sale-pepe"},
  {n:"Lehua at ʻImiloa",i:"Hawaiʻi Island",a:"Hilo",ad:"600 ʻImiloa Pl",c:"Modern Hawaiian",s:"unconfirmed",lat:19.7016,lng:-155.0959,u:"https://resy.com/cities/hilo-hi-united-states/venues/lehua-at-lmiloa"},
  {n:"Jackie Rey's Ohana Grill",i:"Hawaiʻi Island",a:"Hilo",ad:"64 Keawe St",c:"Seafood and grill",s:"unconfirmed",lat:19.7208,lng:-155.0885,u:"https://resy.com/cities/hilo-hi/venues/jackie-reys-ohana-grill-hilo"},
  {n:"Bar Acuda",i:"Kauaʻi",a:"Hanalei",ad:"Hanalei",c:"Tapas",s:"unconfirmed",lat:22.2039,lng:-159.4993,u:"https://resy.com/cities/hanalei-hi-hi/venues/bar-acuda"}
 ];
 var RS = { isl:"all", st:"all", q:"", all:false, active:-1, map:null, markers:[] };
 var RS_LABEL = { eligible:"Credit eligible", pending:"Not yet eligible", unconfirmed:"Verify in app" };
 var RS_ISL = ["Oʻahu","Maui","Hawaiʻi Island","Kauaʻi"];
 var RS_BOUNDS = { oahu:[[-158.17,21.25],[-157.72,21.42]], maui:[[-156.72,20.60],[-156.35,21.03]], hawaii:[[-155.25,19.55],[-154.95,19.85]], kauai:[[-159.65,21.85],[-159.30,22.25]], all:[[-160.0,19.5],[-154.9,22.3]] };
 function rsMatch(v){ if(RS.isl !== "all" && v.i !== RS.isl) return false; if(RS.st !== "all" && v.s !== RS.st) return false; if(RS.q && (v.n+" "+v.a+" "+v.ad+" "+v.c+" "+v.i).toLowerCase().indexOf(RS.q) < 0) return false; return true; }
 function rsList(){ var rank = { eligible:0, pending:1, unconfirmed:2 }; return V.map(function(v,i){ return { v:v, i:i }; }).filter(function(o){ return rsMatch(o.v); }).sort(function(a,b){ return rank[a.v.s] - rank[b.v.s] || a.v.n.localeCompare(b.v.n); }); }
 function rsHost(v){ return v.u.indexOf("exploretock") > -1 ? "Tock" : "Resy"; }
 function rsPop(v){ return '<div class="rs-pop"><b>'+esc(v.n)+'</b><span>'+esc(v.c)+'<br>'+esc(v.ad)+'<br><strong>'+RS_LABEL[v.s]+'</strong></span><a href="'+esc(v.u)+'" target="_blank" rel="noopener">Open on '+rsHost(v)+' &rarr;</a></div>'; }
 function rsChips(){
  var base = V.filter(function(v){ return (RS.st === "all" || v.s === RS.st) && (!RS.q || (v.n+" "+v.a+" "+v.c+" "+v.i).toLowerCase().indexOf(RS.q) > -1); });
  $("rsIsl").innerHTML = '<button type="button" class="chipf'+(RS.isl==="all"?'':' plain')+'" data-r-isl="all">All<span class="n">'+base.length+'</span></button>' + RS_ISL.map(function(k){ var on = RS.isl === k; return '<button type="button" class="chipf'+(on?'':' plain')+'" data-r-isl="'+k+'">'+k+'<span class="n">'+base.filter(function(v){ return v.i === k; }).length+'</span></button>'; }).join("");
  var st = [["all","All"],["eligible","Eligible"],["pending","Not yet"],["unconfirmed","Unconfirmed"]];
  $("rsStat").innerHTML = st.map(function(s){ var on = RS.st === s[0]; return '<button type="button" class="chipf'+(on?'':' plain')+'" data-r-st="'+s[0]+'">'+s[1]+'</button>'; }).join("");
 }
 function rsRender(fit){
  var list = rsList(), elig = list.filter(function(o){ return o.v.s === "eligible"; }).length;
  rsChips();
  $("rsCount").innerHTML = list.length + " " + (list.length === 1 ? "venue" : "venues") + ' <span class="hl">&middot; ' + elig + ' credit eligible</span>';
  var shown = RS.all ? list : list.slice(0, 24);
  $("rsGrid").innerHTML = list.length ? shown.map(function(o){ var v = o.v;
   return '<button type="button" class="rsi s-'+v.s+(RS.active === o.i ? ' on' : '')+'" data-r-i="'+o.i+'"><i></i><span><b>'+esc(v.n)+'</b><small>'+esc(v.a)+' &middot; '+esc(v.c)+'</small></span>'
    + '<a href="'+esc(v.u)+'" target="_blank" rel="noopener" aria-label="Open '+esc(v.n)+' on '+rsHost(v)+'"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a></button>';
  }).join("") : '<div class="rs-empty">No venues match that. Try clearing the search or switching islands.</div>';
  $("rsMore").hidden = list.length <= 24; $("rsMore").textContent = RS.all ? "Show fewer" : "Show all " + list.length + " venues";
  rsPins(list, fit);
 }
 function rsPins(list, fit){
  if(!RS.map) return;
  RS.markers.forEach(function(m){ if(m) m.remove(); }); RS.markers = [];
  var b = null;
  list.forEach(function(o){
   var v = o.v, el = document.createElement("button");
   el.type = "button"; el.className = "rs-pin s-" + v.s + (RS.active === o.i ? " on" : ""); el.setAttribute("aria-label", v.n);
   var mk = new maplibregl.Marker({ element:el }).setLngLat([v.lng, v.lat]).setPopup(new maplibregl.Popup({ offset:12, maxWidth:"260px" }).setHTML(rsPop(v))).addTo(RS.map);
   el.addEventListener("click", function(){ RS.active = o.i; rsHighlight(); });
   RS.markers[o.i] = mk;
   if(!b) b = new maplibregl.LngLatBounds([v.lng, v.lat],[v.lng, v.lat]); else b.extend([v.lng, v.lat]);
  });
  if(fit && b) RS.map.fitBounds(b, { padding:50, maxZoom:14, duration:600 });
 }
 function rsHighlight(){ document.querySelectorAll(".rsi").forEach(function(x){ x.classList.toggle("on", +x.getAttribute("data-r-i") === RS.active); }); document.querySelectorAll(".rs-pin").forEach(function(x){ x.classList.remove("on"); }); var m = RS.markers[RS.active]; if(m) m.getElement().classList.add("on"); }
 function rsFly(k){ if(RS.map) RS.map.fitBounds(RS_BOUNDS[k] || RS_BOUNDS.all, { padding:30, duration:800 }); document.querySelectorAll("[data-r-fly]").forEach(function(x){ x.setAttribute("aria-pressed", x.getAttribute("data-r-fly") === k); }); }
 onShow.resy = function(first){
  if(first){ RS.map = makeMap($("resyMap"), $("resyMsg"), { bounds:RS_BOUNDS.oahu, fitBoundsOptions:{ padding:30 } }); rsRender(false); }
  else if(RS.map) RS.map.resize();
 };
 $("rsQ").addEventListener("input", function(){ RS.q = this.value.trim().toLowerCase(); RS.all = false; RS.active = -1; rsRender(true); });
 $("rsMore").addEventListener("click", function(){ RS.all = !RS.all; rsRender(false); });
 document.addEventListener("click", function(ev){
  var t = ev.target;
  var i = t.closest("[data-r-isl]"); if(i){ RS.isl = i.getAttribute("data-r-isl"); RS.all = false; RS.active = -1; rsRender(true); return; }
  var s = t.closest("[data-r-st]"); if(s){ RS.st = s.getAttribute("data-r-st"); RS.all = false; RS.active = -1; rsRender(true); return; }
  var f = t.closest("[data-r-fly]"); if(f){ rsFly(f.getAttribute("data-r-fly")); return; }
  var it = t.closest("[data-r-i]"); if(it && !t.closest("a")){
   RS.active = +it.getAttribute("data-r-i"); rsHighlight();
   var v = V[RS.active], m = RS.markers[RS.active];
   if(RS.map){ RS.map.flyTo({ center:[v.lng, v.lat], zoom:15.5, duration:700 }); if(m) setTimeout(function(){ if(!m.getPopup().isOpen()) m.togglePopup(); }, 720); $("resyMap").scrollIntoView({ behavior:"smooth", block:"center" }); }
  }
 });
 (function(){ var c = { eligible:0, pending:0, unconfirmed:0 }; V.forEach(function(v){ c[v.s]++; });
  $("rsS1").textContent = V.length; $("rsS2").textContent = c.eligible; $("rsS3").textContent = c.pending; $("rsS4").textContent = c.unconfirmed;
  $("navResy").textContent = V.length; $("hmResy").textContent = c.eligible; $("ttResy").textContent = c.eligible + " credit eligible spots";
  rsChips(); rsRender(false);
 })();

 /* ========================== HNL LOUNGES ========================== */
 var LOUNGES = [
  { id:"plumeria", name:"Plumeria Lounge", op:"Hawaiian / Atmos", t:"t1", gate:"T1 · 3rd floor", r:3.5, x:86, y:67, url:"/hnl-lounges/plumeria", access:["Biz/First Class","Atmos Elite","Day Pass"], tags:["day-pass"], blurb:"Serene, island inspired space with local food, drinks and quiet seating. Better than Premier Club but not as impressive as the international lounges.", note:"Priority Pass access ended April 1, 2025." },
  { id:"premier", name:"Premier Club", op:"Hawaiian Airlines", t:"t1", gate:"T1 · Gate A18", r:2.5, x:91.5, y:62, url:"/hnl-lounges/premier-club", access:["Priority Pass","First Class HA","Pualani Plat/Gold","Day Pass"], tags:["priority-pass","day-pass"], blurb:"Modest lounge with snacks, Hawaiian coffee and comfortable seating. As of 2025, Priority Pass is accepted here.", note:"Newly added to Priority Pass in 2025." },
  { id:"ana", name:"ANA Lounge & Suite Lounge", op:"All Nippon Airways", t:"t2", gate:"T2 · above Gate C4", r:4.2, x:85, y:14, url:"/hnl-lounges/ana", access:["ANA First (Suite)","ANA Business","Star Alliance Gold"], tags:["star-alliance"], blurb:"Highest rated lounge at HNL. Hawaiian motifs meet Japanese design, with exceptional service.", note:"Transfer Amex MR to ANA to fly Biz HNL to NRT for automatic access." },
  { id:"qantas", name:"Qantas Business Lounge", op:"Qantas Airways", t:"t2", gate:"T2 · Gate 26 / Garden Court", r:4.1, x:48, y:30, url:"/hnl-lounges/qantas", access:["Qantas Biz/First","Oneworld Sapphire/Emerald"], tags:["oneworld"], blurb:"Stylish, full dining, attentive service. One of the better lounges outside ANA." },
  { id:"sakura", name:"Sakura Lounge", op:"Japan Airlines", t:"t2", gate:"T2 · above The Local @HNL", r:4.0, x:53.5, y:40, url:"/hnl-lounges/sakura", access:["JAL Biz/First","Oneworld Sapphire/Emerald"], tags:["oneworld"], blurb:"Serene, Japanese and Western cuisine, excellent service. Popular with Japan bound travelers.", note:"Book JAL Biz with Bilt or Capital One for automatic access." },
  { id:"delta", name:"Delta Sky Club (current)", op:"Delta Air Lines", t:"t2", gate:"T2 · across from F1", r:4.0, x:35, y:47, url:"/hnl-lounges/delta-sky-club", access:["Delta Sky Club","Delta One","Eligible premium cards"], tags:["skyteam","amex"], blurb:"Modern lounge with Hawaiian artwork, often praised for the best food at HNL. Small, and fills up fast on Sunday red eyes.", note:"A much larger Sky Club is being built next to gate F2." },
  { id:"united", name:"United Club", op:"United Airlines", t:"t2", gate:"T2 · above Gate G3", r:3.8, x:18.5, y:20, url:"/hnl-lounges/united-club", access:["United Club","Polaris Biz","Star Alliance Gold","Eligible premium cards"], tags:["star-alliance","chase"], blurb:"Comfortable and spacious with big tarmac view windows. Solid for United flyers or Star Alliance Gold." },
  { id:"admirals", name:"Admirals Club", op:"American Airlines", t:"t2", gate:"T2 · 3rd level above The Local", r:3.7, x:49, y:38, url:"/hnl-lounges/admirals-club", access:["Admirals Club","AA First/Biz","Day Pass"], tags:["oneworld","day-pass"], blurb:"Comfortable lounge, quiet atmosphere, friendly staff. A solid choice for American Airlines flyers." },
  { id:"iass", name:"IASS Hawaii Lounge", op:"Independent", t:"t2", gate:"T2 · near Gate 14, ground level", r:2.5, x:57, y:39, url:"/hnl-lounges/iass", access:["Priority Pass","Eligible premium travel cards"], tags:["priority-pass"], blurb:"A Priority Pass lounge at HNL. Basic but convenient for T2 departures.", note:"Two Priority Pass options at HNL now: IASS (T2) and Premier Club (T1)." },
  { id:"korean", name:"Korean Air Lounge", op:"Korean Air", t:"t2", gate:"T2 · near Gate 31", r:null, x:57, y:35, url:"/hnl-lounges/korean-air", access:["Korean Air First/Biz","SkyTeam Elite Plus"], tags:["skyteam"], blurb:"Comfortable lounge for Korean Air passengers on transpacific routes." },
  { id:"fslanai", name:"Four Seasons Lanai Lounge", op:"Four Seasons Resort Lanai", t:"t2", gate:"T2 · near Gates D1 and D2", r:4.0, x:68, y:41, url:"/hnl-lounges/four-seasons-lanai", access:["Four Seasons Lanai guests","Sensei Lanai guests"], tags:["resort-only"], blurb:"A hidden gem tucked into T2, exclusive to Four Seasons Lanai and Sensei Lanai guests.", note:"New April 2026: a separate Lanai Air Lounge for private charter guests." },
  { id:"koolina", name:"Ko Olina Lounge", op:"Ko Olina Resorts", t:"t2", gate:"T2 · Cultural Garden · ground level", r:3.0, x:43, y:38, url:"/hnl-lounges/ko-olina", access:["Aulani guests","Four Seasons Ko Olina","Marriott Ko Olina","Beach Villas at Ko Olina"], tags:["resort-only"], blurb:"Small, serene resort lounge overlooking the Cultural Garden. Water, coffee and seating. No food and no alcohol.", note:"Resort guests only. Advance reservation required." },
  { id:"deltanew", name:"New Delta Sky Club", op:"Delta Air Lines", t:"t2", gate:"T2 · next to gate F2 · 2nd level", r:null, x:29, y:39, url:"/hnl-lounges/delta-sky-club-new", access:["Opening late 2027 to mid 2028"], tags:["coming-soon","skyteam","amex"], soon:true, blurb:"12,280 sq ft across four rooms in Buildings 341 and 363, about three times the size of the current Sky Club.", note:"Lease approved March 27, 2026." },
  { id:"southwest", name:"Southwest VIP Lounge", op:"Southwest Airlines", t:"t2", gate:"T2 · Building 342", r:null, x:50, y:35, url:"/hnl-lounges/southwest-vip", access:["Coming soon, access to be announced"], tags:["coming-soon"], soon:true, blurb:"A historic first. Southwest has never run an airport lounge anywhere, and HNL is its debut.", note:"Lease approved October 2025." },
  { id:"alaskahawaiian", name:"New Alaska/Hawaiian Premium Lounge", op:"Alaska Air Group", t:"t1", gate:"T1 · Mauka Concourse entrance", r:null, x:84, y:73, url:"/hnl-lounges/alaska-hawaiian-premium", access:["Opening late 2027"], tags:["coming-soon"], soon:true, blurb:"15,000 sq ft, five times larger than the current Plumeria. Expected to rival Delta One and United Polaris lounges.", note:"May carry the Atmos brand and will serve both Alaska and Hawaiian guests." }
 ];
 var LG_F = [ ["all","All lounges",function(){ return true; }], ["t1","Terminal 1",function(l){ return l.t === "t1"; }], ["t2","Terminal 2",function(l){ return l.t === "t2"; }], ["pp","Priority Pass",function(l){ return l.tags.indexOf("priority-pass") > -1; }], ["soon","Coming soon",function(l){ return !!l.soon; }] ];
 var LG_TAG = { "priority-pass":["Priority Pass","pp"], "star-alliance":["Star Alliance",""], "oneworld":["Oneworld",""], "skyteam":["SkyTeam",""], "amex":["Amex",""], "chase":["Chase",""], "day-pass":["Day Pass",""], "resort-only":["Resort only","resort"], "coming-soon":["Coming soon","soon"] };
 var LG = { f:"all", active:null };
 function lgNum(l){ return l.soon ? "&#10022;" : (LOUNGES.indexOf(l) + 1); }
 function lgStars(r){ if(r == null) return '<span class="lg-rate none">No rating</span>'; return '<span class="lg-rate">'+"★".repeat(Math.floor(r))+(r % 1 >= .5 ? "½" : "")+" "+r.toFixed(1)+'</span>'; }
 function lgTags(l){ return l.tags.map(function(t){ var x = LG_TAG[t] || [t,""]; return '<span class="lg-tag '+x[1]+'">'+x[0]+'</span>'; }).join(""); }
 function lgMatch(l){ return LG_F.filter(function(f){ return f[0] === LG.f; })[0][2](l); }
 function lgRender(){
  $("lgFilters").innerHTML = LG_F.map(function(f){ var on = LG.f === f[0]; return '<button type="button" class="chipf'+(on?'':' plain')+'" data-l-f="'+f[0]+'">'+f[1]+'<span class="n">'+LOUNGES.filter(f[2]).length+'</span></button>'; }).join("");
  $("lgMarkers").innerHTML = LOUNGES.map(function(l){ return '<button type="button" class="lg-mk'+(l.soon?' soon':'')+(lgMatch(l)?'':' off')+(LG.active === l.id ? ' on' : '')+'" data-l-id="'+l.id+'" style="left:'+l.x+'%;top:'+l.y+'%" aria-label="'+esc(l.name)+'"><span>'+lgNum(l)+'</span></button>'; }).join("");
  var n = LOUNGES.filter(lgMatch).length; $("lgCount").textContent = n + (n === 1 ? " lounge" : " lounges");
  $("lgList").innerHTML = LOUNGES.map(function(l){
   return '<div role="button" tabindex="0" class="lg-card'+(l.soon?' soon':'')+(lgMatch(l)?'':' off')+(LG.active === l.id ? ' on' : '')+'" data-l-id="'+l.id+'">'
    + '<div class="lg-top"><span class="lg-num">'+lgNum(l)+'</span><span class="lg-name">'+esc(l.name)+'</span>'+lgStars(l.r)+'</div>'
    + '<div class="lg-meta">'+esc(l.gate)+' &middot; '+esc(l.op)+'</div><div class="lg-tags">'+lgTags(l)+'</div>'
    + '<div class="lg-det"><p>'+esc(l.blurb)+'</p>'+(l.note ? '<p class="nt">'+esc(l.note)+'</p>' : '')+'<p><b>Access:</b> '+esc(l.access.join(" · "))+'</p><a class="btn coral" href="'+SITE+l.url+'" target="_top">View full review &rarr;</a></div></div>';
  }).join("");
 }
 function lgPop(){
  var pop = $("lgPop"), l = LOUNGES.filter(function(x){ return x.id === LG.active; })[0];
  if(!l){ pop.hidden = true; return; }
  pop.innerHTML = '<button type="button" class="x" data-l-close aria-label="Close">&times;</button><b>'+esc(l.name)+'</b><small>'+esc(l.gate)+' &middot; '+esc(l.op)+'</small><div class="lg-tags" style="margin:0">'+lgTags(l)+'</div>'
   + (l.note ? '<div style="color:#c25c26;margin-top:6px;font-style:italic">'+esc(l.note)+'</div>' : '') + '<div style="margin-top:6px"><b style="display:inline;font-size:12px">Access:</b> '+esc(l.access.join(" · "))+'</div>'
   + '<a class="btn coral" href="'+SITE+l.url+'" target="_top">View full review &rarr;</a>';
  pop.hidden = false;
  var w = pop.parentElement.offsetWidth, h = pop.parentElement.offsetHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
  var mx = l.x / 100 * w, my = l.y / 100 * h;
  var left = Math.max(8, Math.min(w - pw - 8, mx - pw / 2)), top = my - ph - 22; if(top < 8) top = my + 22; top = Math.max(8, Math.min(h - ph - 8, top));
  pop.style.left = left + "px"; pop.style.top = top + "px";
 }
 function lgSet(id){ LG.active = LG.active === id ? null : id; lgRender(); lgPop(); }
 document.addEventListener("click", function(ev){
  var t = ev.target;
  var f = t.closest("[data-l-f]"); if(f){ LG.f = f.getAttribute("data-l-f"); var a = LOUNGES.filter(function(x){ return x.id === LG.active; })[0]; if(a && !lgMatch(a)) LG.active = null; lgRender(); lgPop(); return; }
  if(t.closest("[data-l-close]")){ LG.active = null; lgRender(); lgPop(); return; }
  if(t.closest(".lg-det a, .lg-pop a")) return;
  var c = t.closest("[data-l-id]"); if(c){ lgSet(c.getAttribute("data-l-id")); return; }
 });
 window.addEventListener("resize", function(){ if(LG.active) lgPop(); });
 (function(){
  var open = LOUNGES.filter(function(l){ return !l.soon; }), pp = LOUNGES.filter(function(l){ return l.tags.indexOf("priority-pass") > -1; });
  var top = Math.max.apply(null, LOUNGES.map(function(l){ return l.r || 0; }));
  $("lgS1").textContent = open.length; $("lgS2").textContent = pp.length; $("lgS3").textContent = LOUNGES.length - open.length; $("lgS4").textContent = top.toFixed(1);
  $("navLounge").textContent = LOUNGES.length; $("ttLounge").textContent = open.length + " open, " + pp.length + " with Priority Pass";
  lgRender();
 })();

 /* ============================== HOME ============================== */
 function homeTb(){
  var el = $("hmTbList"); if(!el) return;
  var list = TB.list.slice().sort(function(a,b){ return daysUntil(a.expiresDate) - daysUntil(b.expiresDate); }).slice(0,5);
  el.innerHTML = list.length ? list.map(function(b){ var d = daysUntil(b.expiresDate);
   return '<button type="button" class="mrow" data-route="transfers"><span class="mi">'+(b.partnerType === "hotel" ? "&#127976;" : "&#9992;&#65039;")+'</span><span class="mt"><b>'+esc(BANK_SHORT[b.bank] || b.bankName)+' to '+esc(b.partner)+'</b><span>Ends '+esc(fmtDate(b.expiresDate))+'</span></span><span class="mv">+'+esc(b.bonusPct)+'%<small class="'+(d <= 7 ? "soon" : "")+'">'+esc(daysLabel(d))+'</small></span></button>';
  }).join("") : '<div class="mini-empty">No live transfer bonuses right now.</div>';
 }
 function homeKama(){
  var D = window.HRT_KAMAAINA_DEALS || [];
  var hotels = D.filter(function(d){ return d.g === "Stays"; });
  $("hmKama").textContent = hotels.length; $("navKama").textContent = D.length; $("ttKama").textContent = hotels.length + " hotel deals, " + (D.length - hotels.length) + " activities";
  var seen = {}, top = hotels.slice().sort(function(a,b){ return b.s - a.s; }).filter(function(d){ if(seen[d.b]) return false; seen[d.b] = 1; return true; }).slice(0,5);
  var isl = { oahu:"Oʻahu", maui:"Maui", hawaii:"Hawaiʻi Island", kauai:"Kauaʻi", lanai:"Lānaʻi", molokai:"Molokaʻi" };
  $("hmKamaList").innerHTML = top.map(function(d){
   var head = d.p ? d.p + "% off" : (d.v ? "From $" + d.v : "Resident rate");
   return '<button type="button" class="mrow" data-kopen="'+D.indexOf(d)+'"><span class="mi">'+d.s+'</span><span class="mt"><b>'+esc(d.b)+'</b><span>'+esc(d.i.length === 1 ? isl[d.i[0]] : "Several islands")+(d.h ? ", " + esc(d.h) : "")+'</span></span><span class="mv">'+esc(head)+'<small>'+esc(d.r)+'</small></span></button>';
  }).join("");
 }
 function homeVals(){
  var top = VALS.filter(function(v){ return v[1] === "cc"; }).sort(function(a,b){ return b[2] - a[2]; });
  var max = 2.4;
  $("hmValBars").innerHTML = top.map(function(v){ return '<div class="bar"><span>'+esc(v[0])+'</span><div class="bartrack"><i style="width:'+(v[2]/max*100).toFixed(1)+'%"></i></div><b>'+v[2].toFixed(2)+'¢</b></div>'; }).join("")
   + '<div class="bar"><span>World of Hyatt</span><div class="bartrack"><i class="hotel" style="width:'+(1.7/max*100)+'%"></i></div><b>1.70¢</b></div>'
   + '<div class="bar"><span>American AAdvantage</span><div class="bartrack"><i class="air" style="width:'+(1.6/max*100)+'%"></i></div><b>1.60¢</b></div>';
  $("hmValNote").textContent = "Cents per point, " + VALUATIONS_UPDATED;
  $("ttVal").textContent = "Top: Bilt Rewards at 2.2¢";
 }
 function homeLounges(){
  var picks = ["ana","iass","premier","united","deltanew"];
  $("hmLounge").innerHTML = picks.map(function(id){ var l = LOUNGES.filter(function(x){ return x.id === id; })[0]; if(!l) return "";
   var tag = l.soon ? "Coming soon" : (l.tags.indexOf("priority-pass") > -1 ? "Priority Pass" : (l.r ? "★ " + l.r.toFixed(1) : ""));
   return '<button type="button" class="mrow" data-hlounge="'+l.id+'"><span class="mi">'+lgNum(l)+'</span><span class="mt"><b>'+esc(l.name)+'</b><span>'+esc(l.gate)+'</span></span><span class="mv" style="font-size:12px">'+esc(tag)+'</span></button>';
  }).join("");
 }
 document.addEventListener("click", function(ev){
  var k = ev.target.closest("[data-kopen]");
  if(k){ route("kamaaina"); var i = +k.getAttribute("data-kopen"); setTimeout(function(){ if(window.HRT_KAMA) window.HRT_KAMA.open(i); }, 60); return; }
  var hl = ev.target.closest("[data-hlounge]");
  if(hl){ route("lounges"); LG.f = "all"; LG.active = null; lgSet(hl.getAttribute("data-hlounge")); return; }
 });
 onShow.kamaaina = function(){ if(window.HRT_KAMA) window.HRT_KAMA.show(); };

 /* ============================== BOOT ============================== */
 homeKama(); homeVals(); homeLounges(); tbLoad();
 var start = (location.hash || parentHash() || "").replace("#","");
 route(ROUTES[start] ? start : "home", true);
})();
