/* Account page (#account): photo, name, badges, email, password, plan, log out.
   Everything goes through Memberstack's own browser API. Nothing here writes
   Member JSON (wallet-store.js stays the only writer). Styles: #acct-host in app.css. */
(function(){
 "use strict";
 var host = document.getElementById("acct-host");
 var member = null, busy = false;

 function ms(){ return window.$memberstackDom; }
 function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
 function cf(){ return (member && member.customFields) || {}; }
 function first(){ return String(cf()["first-name"] || cf().firstName || "").trim(); }
 function last(){ return String(cf()["last-name"] || cf().lastName || "").trim(); }
 function email(){ return (member && (member.email || (member.auth && member.auth.email))) || ""; }
 function hasLastField(){ var c = cf(); return ("last-name" in c) || ("lastName" in c); }
 function initials(){
  var a = first(), b = last();
  if(a) return (a[0] + (b ? b[0] : "")).toUpperCase();
  var e = email(); return e ? e[0].toUpperCase() : "?";
 }
 function okImg(u){ return /^https:\/\/[^\s"'()<>\\]+$/i.test(u || "") ? u : ""; }
 function photo(){ return okImg(member && member.profileImage); }
 function isPro(){ return document.documentElement.classList.contains("ms-pro"); }
 function isClient(){ return document.documentElement.classList.contains("ms-client"); }

 var OH_STAR = '<svg width="100%" height="100%" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7.5-6.5-4-6.5 4 2-7.5L2 9.5 9 9z" fill="currentColor"/></svg>';
 /* ʻOhana Members get a gold ring and a small gold star on their photo (like a verified mark) */
 function avatarHtml(cls){
  var p = photo(), oh = isClient();
  return '<span class="' + cls + (oh ? ' ac-oh' : '') + '">' + (p ? '<img src="' + esc(p) + '" alt="">' : '<span>' + esc(initials()) + '</span>') + '</span>'
   + (oh ? '<span class="ac-oh-star" title="ʻOhana Member">' + OH_STAR + '</span>' : '');
 }

 /* the small avatar in the top bar */
 function paintTop(){
  var t = document.getElementById("tbAvatar");
  if(!t) return;
  if(!member){ t.hidden = true; return; }
  t.hidden = false;
  t.innerHTML = avatarHtml("ac-av ac-av-sm");
  t.setAttribute("aria-label", "My account" + (first() ? ", " + first() : "") + (isClient() ? ", ʻOhana Member" : ""));
 }

 var ICON_CAM = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
 var ICON_STAR = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/></svg>';
 var ICON_CHECK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
 var ICON_OUT = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/></svg>';

 function render(){
  paintTop();
  if(!host) return;
  if(!member){ host.innerHTML = '<div class="ac-card"><p class="ac-note">Log in to see your account.</p></div>'; return; }
  var name = (first() + " " + last()).trim();
  var badges = (isPro() ? '<span class="ac-badge ac-pro">' + ICON_STAR + 'HRT PRO</span>' : '')
   + (isClient() ? '<span class="ac-badge ac-client"><span class="ac-bstar">' + OH_STAR + '</span>ʻOhana</span>' : '')
   + (!isPro() && !isClient() ? '<span class="ac-badge ac-free">Free account</span>' : '');

  host.innerHTML =
   '<div class="ac-wrap">'
   + '<section class="ac-card ac-head">'
   +  '<div class="ac-photo">' + avatarHtml("ac-av ac-av-lg")
   +   '<label class="ac-cam" title="Change photo"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic" id="acFile"><span class="ac-sr">Change profile photo</span>' + ICON_CAM + '</label></div>'
   +  '<div class="ac-who"><h2 class="ac-name">' + esc(name || "Your account") + '</h2><p class="ac-mail">' + esc(email()) + '</p>'
   +   '<div class="ac-badges">' + badges + '</div>'
   +   '<p class="ac-hint" id="acPhotoMsg">' + (photo() ? '<button type="button" class="ac-link" id="acPhotoDel">Remove photo</button>' : 'Tap the camera to add a photo.') + '</p></div>'
   + '</section>'

   + '<div class="ac-grid">'
   + '<section class="ac-card">'
   +  '<h3 class="ac-h">Profile</h3>'
   +  '<form id="acProfile" class="ac-form" novalidate>'
   +   '<div class="ac-row2"><label class="ac-lab">First name<input class="ac-in" name="first" autocomplete="given-name" maxlength="40" value="' + esc(first()) + '"></label>'
   +   (hasLastField() ? '<label class="ac-lab">Last name<input class="ac-in" name="last" autocomplete="family-name" maxlength="40" value="' + esc(last()) + '"></label>' : '')
   +   '</div>'
   +   '<div class="ac-actions"><button type="submit" class="ac-btn ac-primary">Save</button><span class="ac-msg" role="status"></span></div>'
   +  '</form>'
   + '</section>'

   + '<section class="ac-card">'
   +  '<h3 class="ac-h">Login and security</h3>'
   +  '<div class="ac-line"><div><span class="ac-k">Email</span><span class="ac-v">' + esc(email()) + '</span></div><button type="button" class="ac-btn" data-ac-open="acEmail">Change</button></div>'
   +  '<form id="acEmail" class="ac-form ac-fold" hidden novalidate>'
   +   '<label class="ac-lab">New email<input class="ac-in" type="email" name="email" autocomplete="email" required></label>'
   +   '<label class="ac-lab">Current password<input class="ac-in" type="password" name="pw" autocomplete="current-password" required></label>'
   +   '<div class="ac-actions"><button type="submit" class="ac-btn ac-primary">Update email</button><button type="button" class="ac-btn" data-ac-close>Cancel</button><span class="ac-msg" role="status"></span></div>'
   +  '</form>'
   +  '<div class="ac-line"><div><span class="ac-k">Password</span><span class="ac-v ac-dots">••••••••</span></div><button type="button" class="ac-btn" data-ac-open="acPw">Change</button></div>'
   +  '<form id="acPw" class="ac-form ac-fold" hidden novalidate>'
   +   '<label class="ac-lab">Current password<input class="ac-in" type="password" name="old" autocomplete="current-password" required></label>'
   +   '<label class="ac-lab">New password<input class="ac-in" type="password" name="new" autocomplete="new-password" minlength="8" required></label>'
   +   '<div class="ac-actions"><button type="submit" class="ac-btn ac-primary">Update password</button><button type="button" class="ac-btn" data-ac-close>Cancel</button><span class="ac-msg" role="status"></span></div>'
   +   '<p class="ac-note">Forgot it, or signed up with Google? <button type="button" class="ac-link" id="acForgot">Reset by email</button></p>'
   +  '</form>'
   + '</section>'

   + '<section class="ac-card">'
   +  '<h3 class="ac-h">Plan and billing</h3>'
   +  (isPro()
      ? '<div class="ac-line"><div><span class="ac-v ac-strong">HRT PRO</span><span class="ac-k">$9.99 a month</span></div><span class="ac-on">Active</span></div>'
        + '<div class="ac-actions"><button type="button" class="ac-btn" id="acBilling">Manage billing</button></div>'
        + '<p class="ac-note">Update your card, see invoices, or cancel in one click.</p>'
      : '<p class="ac-note">You are on the free account. HRT PRO adds the Atmos Award Calendar for $9.99 a month.</p>'
        + '<div class="ac-actions"><a class="ac-btn ac-primary" href="#atmos" data-route="atmos">See HRT PRO</a></div>')
   + '</section>'
   + '</div>'

   + '<div class="ac-foot"><button type="button" class="ac-btn ac-out" id="acLogout">' + ICON_OUT + 'Log out</button></div>'
   + '</div>';
 }

 function setMsg(form, text, bad){
  var m = form && form.querySelector(".ac-msg");
  if(m){ m.textContent = text; m.classList.toggle("bad", !!bad); }
 }
 function errText(e, fallback){
  var t = e && (e.message || (e.data && e.data.message) || e.code);
  return t ? String(t).replace(/^Error:\s*/, "") : fallback;
 }
 function refresh(){
  var m = ms(); if(!m) return Promise.resolve();
  return m.getCurrentMember({ useCache: false }).then(function(r){ member = (r && r.data) || null; render(); }).catch(function(){});
 }

 /* shrink any photo to a 400px square JPEG before it leaves the phone */
 function squareJpeg(file){
  return new Promise(function(resolve, reject){
   var url = URL.createObjectURL(file), img = new Image();
   img.onload = function(){
    var s = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(400, s);
    var c = document.createElement("canvas"); c.width = out; c.height = out;
    c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
    URL.revokeObjectURL(url);
    c.toBlob(function(b){ b ? resolve(new File([b], "profile.jpg", { type: "image/jpeg" })) : reject(new Error("Could not read that photo")); }, "image/jpeg", 0.86);
   };
   img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error("That file is not a photo we can read. Try a JPG or PNG.")); };
   img.src = url;
  });
 }

 function photoMsg(t){ var p = document.getElementById("acPhotoMsg"); if(p) p.textContent = t; }

 document.addEventListener("change", function(e){
  if(!e.target || e.target.id !== "acFile" || !e.target.files || !e.target.files[0]) return;
  var f = e.target.files[0];
  if(f.size > 20 * 1024 * 1024){ photoMsg("That photo is too big. Try one under 20MB."); return; }
  photoMsg("Uploading...");
  squareJpeg(f).then(function(file){ return ms().updateMemberProfileImage({ profileImage: file }); })
   .then(function(r){ if(r && r.data && r.data.profileImage && member) member.profileImage = r.data.profileImage; render(); photoMsg("Photo saved."); })
   .catch(function(err){ photoMsg(errText(err, "Could not save that photo. Please try again.")); });
 });

 document.addEventListener("click", function(e){
  if(!e.target.closest || !host || !host.contains(e.target)) return;
  var open = e.target.closest("[data-ac-open]");
  if(open){ var f = document.getElementById(open.getAttribute("data-ac-open")); if(f){ f.hidden = !f.hidden; if(!f.hidden){ var i = f.querySelector("input"); if(i) i.focus(); } } return; }
  if(e.target.closest("[data-ac-close]")){ var fm = e.target.closest("form"); if(fm){ fm.reset(); fm.hidden = true; } return; }
  if(e.target.closest("#acBilling")){ var b = document.querySelector('.topbar [data-ms-action="customer-portal"]'); if(b) b.click(); return; }
  if(e.target.closest("#acLogout")){ var l = document.querySelector('.topbar [data-ms-action="logout"]'); if(l) l.click(); else if(ms()) ms().logout(); return; }
  if(e.target.closest("#acForgot")){
   try{ ms().openModal("FORGOT_PASSWORD"); }catch(x){ var n = e.target.closest(".ac-note"); if(n) n.textContent = "Log out, then choose Log in and Forgot password."; }
   return;
  }
  if(e.target.closest("#acPhotoDel")){
   if(!confirm("Remove your profile photo?")) return;
   photoMsg("Removing...");
   ms().updateMemberProfileImage({ profileImage: null })
    .then(function(){ if(member) member.profileImage = null; render(); photoMsg("Photo removed."); })
    .catch(function(err){ photoMsg(errText(err, "Could not remove it. Please try again.")); });
  }
 });

 document.addEventListener("submit", function(e){
  var form = e.target; if(!host || !host.contains(form)) return;
  e.preventDefault();
  if(busy) return;
  var d = new FormData(form), p, ok;
  if(form.id === "acProfile"){
   var fields = Object.assign({}, cf()), fn = String(d.get("first") || "").trim();
   if(!fn){ setMsg(form, "Please add your first name.", true); return; }
   fields["first-name"] = fn;
   if(hasLastField()) fields["last-name"] = String(d.get("last") || "").trim();
   p = ms().updateMember({ customFields: fields }); ok = "Saved.";
  } else if(form.id === "acEmail"){
   var em = String(d.get("email") || "").trim().toLowerCase(), pw = String(d.get("pw") || "");
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ setMsg(form, "That email does not look right.", true); return; }
   if(!pw){ setMsg(form, "Enter your current password.", true); return; }
   p = ms().updateMemberAuth({ email: em, oldPassword: pw }); ok = "Email updated.";
  } else if(form.id === "acPw"){
   var o = String(d.get("old") || ""), n = String(d.get("new") || "");
   if(!o){ setMsg(form, "Enter your current password.", true); return; }
   if(n.length < 8){ setMsg(form, "Use at least 8 characters.", true); return; }
   p = ms().updateMemberAuth({ oldPassword: o, newPassword: n }); ok = "Password updated.";
  } else return;
  busy = true; setMsg(form, "Saving...");
  p.then(function(){
   busy = false;
   return refresh().then(function(){
    var f2 = document.getElementById(form.id);
    if(f2){ setMsg(f2, ok); if(form.id !== "acProfile"){ f2.hidden = false; } }
    document.querySelectorAll(".ms-first-name").forEach(function(el){ if(first()) el.textContent = first(); });
   });
  }).catch(function(err){ busy = false; setMsg(form, errText(err, "That did not work. Please try again."), true); });
 });

 function start(){
  var m = ms(); if(!m) return setTimeout(start, 250);
  m.getCurrentMember().then(function(r){ member = (r && r.data) || null; render(); }).catch(render);
  if(m.onAuthChange) m.onAuthChange(function(x){ member = (x && x.data ? x.data : x) || null; render(); });
 }
 /* badges follow the plan check in index.html */
 window.addEventListener("hrt:member", function(){ render(); });
 start();
})();
