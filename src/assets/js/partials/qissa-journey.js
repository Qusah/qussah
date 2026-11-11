/**
 * «نوافذ تحفيز قرار الشراء» — the decision journey (components/partials/qissa-journey.twig).
 *
 * One visitor, one journey, kept in localStorage under `qissa-journey`:
 *
 *   browses product pages, cart empty
 *     → after N distinct product pages (+ a delay): the «محتار؟» HELP popup —
 *       the merchant's packages, cheapest first, «أضف للسلة» on each.
 *
 *     → ADDED FROM THE HELP POPUP (review, 11 Nov): the popup closes and the
 *       "added but did not buy" clock starts — after A minutes of visible-tab
 *       browsing without reaching the thank-you page, OFFER step 1 opens and the
 *       coupon goes on the cart at once. A = 0 turns this path off.
 *
 *     → CLOSED THE HELP POPUP: the browsing clock starts — after M minutes of
 *       visible-tab browsing with the cart still empty, OFFER step 1 opens; the
 *       coupon goes on the cart (quietly, salla.cart.addCoupon) at the first add
 *       inside the window. Anything added from elsewhere ends this path (deck
 *       rule: a visitor who decided gets no discount).
 *
 *   OFFER popup: per-step title and text, «أكمل التسوّق» closes it and leaves
 *   the countdown pill; «لا، شكراً» exists only when the merchant switches it on.
 *   When the window ends the coupon comes off. A window that ends without a
 *   purchase → step 2 («باقي لك فرصة», 5%, 15 min), right away if the tab is
 *   open, else on the next page. Then the journey is over.
 *
 *   Never a popup on cart / checkout / thank-you pages (the pill may show on the
 *   cart page — it is not a popup). Thank-you marks the journey bought and leaves
 *   the coupon alone (the order is placed). Every popup shows once per visitor.
 *
 *   The timer is a nudge, not an enforcement: the codes are the merchant's shared
 *   dashboard coupons, valid until their dashboard expiry. No server, no
 *   per-visitor code.
 *
 * QA switches on the URL: ?qj=reset clears the visitor's state, ?qj=help opens
 * the help popup on this page, ?qj=offer opens offer step 1 on this page.
 *
 * Lean on purpose (the theme sits at Salla's 1 MB JS+CSS limit): one file, no
 * library, the SDK's own money/cart/product calls.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-qj]');
  if (!root) return;
  var cfg, W;
  try { cfg = JSON.parse(root.dataset.config || '{}'); W = JSON.parse(root.dataset.words || '{}'); } catch (e) { return; }
  var help = cfg.help || {}, offer = cfg.offer || {}, steps = offer.steps || [];
  var page = cfg.page || '';
  var quiet = /^(cart|checkout|thank)/.test(page);     // no popups here
  var thanks = /^thank/.test(page);
  var qs = (location.search.match(/[?&]qj=(reset|help|offer)\b/) || [])[1];

  /* ---------- state ---------- */
  var KEY = 'qissa-journey', mem = null;
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return mem || {}; }
  }
  function save() {
    mem = S;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: this page only */ }
  }
  if (qs === 'reset') { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  var S = qs === 'reset' ? {} : load();
  S.seen = S.seen || [];                 // distinct product ids viewed
  var now = Date.now;

  /* ---------- helpers ---------- */
  function $(sel, el) { return (el || root).querySelector(sel); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fill(s, vars) { return String(s || '').replace(/\{(دقائق|نسبة)\}/g, function (m, k) { return k in vars ? vars[k] : m; }); }
  function money(n) { try { return salla.money(n); } catch (e) { return String(n); } }
  function silent(fn) { return salla.api && typeof salla.api.withoutNotifier === 'function' ? salla.api.withoutNotifier(fn) : fn(); }
  function cartCount() {
    var n = Number(salla.storage && salla.storage.get('cart.summary.count'));
    return n > 0 ? n : 0;
  }
  function clock(ms) {
    var s = Math.max(0, Math.round(ms / 1000)), m = Math.floor(s / 60);
    return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function text(sel, s) { var el = $(sel); if (el) el.textContent = s; }

  /* ---------- dialogs ---------- */
  var openName = null, lastFocus = null, hiding = {};
  function dlg(name) { return $('[data-qj-bd="' + name + '"]'); }
  function open(name) {
    var bd = dlg(name);
    if (!bd || openName) return false;
    openName = name;
    lastFocus = document.activeElement;
    clearTimeout(hiding[name]);                      // a close still fading out must not hide this open
    root.hidden = false;
    bd.hidden = false;
    if (name === 'offer') pill(false);               // the dialog carries the clock while it is open
    document.body.classList.add('qj-lock');
    // Shown in this same task (a forced reflow starts the fade): requestAnimationFrame
    // does not run in a background tab, which would leave a locked page under a
    // backdrop nobody can see when the second offer opens while the visitor is
    // elsewhere. (Wording note: Tailwind scans this file — naming one of its
    // utility classes in a comment adds that rule to app.css.)
    void bd.offsetWidth;
    bd.classList.add('is-in');
    $('.qj__dlg', bd).focus({ preventScroll: true });
    return true;
  }
  function close(name) {
    var bd = dlg(name);
    if (!bd || openName !== name) return;
    openName = null;
    bd.classList.remove('is-in');
    document.body.classList.remove('qj-lock');
    clearTimeout(hiding[name]);
    hiding[name] = setTimeout(function () { bd.hidden = true; }, reduced() ? 0 : 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function trap(e) {
    // Tab stays inside the open dialog; Escape closes it the neutral way.
    if (!openName) return;
    var bd = dlg(openName);
    if (e.key === 'Escape') { e.preventDefault(); act(openName === 'help' ? 'help-close' : 'offer-cta'); return; }
    if (e.key !== 'Tab') return;
    var f = bd.querySelectorAll('button:not([disabled]), a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---------- the help popup ---------- */
  function notePage() {
    var id = String(cfg.pid || (salla.config && salla.config.get('page.id')) || '');
    if (id && S.seen.indexOf(id) < 0) { S.seen.push(id); save(); }
  }
  function helpDue() {
    if (qs === 'help') return true;
    return !S.help && !S.stop && !quiet && S.seen.length >= Number(help.minPages || 2);
  }
  function maybeHelp() {
    if (!helpDue() || cartCount() > 0) return;
    if (S.helpTry && now() - S.helpTry < 6e4 && qs !== 'help') return;   // the API failed a moment ago
    var t0 = now();
    var ids = (help.ids || []).map(String).filter(Boolean).slice(0, 3);
    if (!ids.length) return;
    salla.product.api.fetch({ source: 'selected', source_value: ids, limit: ids.length }).then(function (res) {
      var byId = {};
      ((res && res.data) || []).forEach(function (p) { byId[String(p.id)] = p; });
      var products = ids.map(function (id) { return byId[id]; }).filter(function (p) { return p && p.name; });
      if (!products.length) throw new Error('no products');
      renderHelp(products);
      var wait = Math.max(0, Number(qs === 'help' ? 0 : help.delay || 0) * 1000 - (now() - t0));
      setTimeout(function () {
        if (!helpDue() || cartCount() > 0 || !open('help')) return;
        S.help = now(); save();
      }, wait);
    }).catch(function () { S.helpTry = now(); save(); });
  }
  function renderHelp(products) {
    var featured = Number(help.featured);
    $('[data-qj-list]').innerHTML = products.map(function (p, k) {
      var badge = (help.badges || [])[k] || '', note = (help.notes || [])[k] || '';
      var sale = p.is_on_sale && Number(p.regular_price) > Number(p.price);
      var gone = p.is_out_of_stock || p.is_available === false;
      var canAdd = !p.has_options && !gone;
      return '<li class="qj__card' + (k + 1 === featured ? ' is-featured' : '') + '">'
        + '<div class="qj__info">'
        + (badge ? '<span class="qj__badge">' + esc(badge) + '</span>' : '')
        + '<a class="qj__name" href="' + esc(p.url || '#') + '">' + esc(p.name) + '</a>'
        + '<p class="qj__price"><b>' + money(Number(p.price)) + '</b>'
        + (sale ? ' <span class="qj__was">' + esc(W.instead) + ' ' + money(Number(p.regular_price)) + '</span>' : '')
        + (note ? ' <span class="qj__dot" aria-hidden="true">·</span> <span class="qj__note">' + esc(note) + '</span>' : '')
        + '</p></div>'
        + (canAdd
          ? '<button class="qj__add" type="button" data-qj-add="' + esc(p.id) + '">' + esc(W.add) + '</button>'
          : '<a class="qj__add qj__add--link' + (gone ? ' is-out' : '') + '" href="' + esc(p.url || '#') + '">' + esc(gone ? W.out : W.options) + '</a>')
        + '</li>';
    }).join('');
  }
  function add(btn) {
    if (btn.dataset.s) return;
    btn.dataset.s = 'busy';
    btn.textContent = W.busy;
    Promise.resolve(salla.cart.addItem({ id: String(btn.dataset.qjAdd), quantity: 1 })).then(function () {
      btn.textContent = W.added;
      S.stop = true;                                       // decided: no help popup again
      if (!S.path) { S.path = 'add'; S.browse = 0; S.tick = now(); }   // the "added but did not buy" clock
      save();
      setTimeout(function () { close('help'); }, 500);
      watchBrowsing();
    }).catch(function () {
      delete btn.dataset.s;
      btn.textContent = W.add;
    });
  }
  function helpClosed() {
    close('help');
    if (!S.path) { S.path = 'help'; S.helpAt = now(); S.browse = 0; S.tick = now(); save(); }
    watchBrowsing();
  }

  /* ---------- the browsing clock (visible tab only, across pages) ---------- */
  var ticking = false;
  function waitFor() {                                    // minutes this path has to browse before the offer
    return S.path === 'add' ? Number(offer.afterAdd || 0) : Number(offer.wait || 3);
  }
  function offerDue() {
    if (!steps.length || S.offer || S.next != null || S.buy || !S.path) return false;
    if (S.path === 'add') return waitFor() > 0;
    return !S.stop;                                        // closed-help path: any add from elsewhere ends it
  }
  function watchBrowsing() {
    if (ticking || !offerDue()) return;
    ticking = true;
    S.tick = now();
    setInterval(function () {
      if (!offerDue()) return;
      var t = now();
      if (document.visibilityState !== 'hidden') S.browse = (S.browse || 0) + Math.min(2000, t - S.tick);
      S.tick = t;
      save();
      if (S.browse >= waitFor() * 6e4 && !quiet && !openName && (S.path === 'add' || cartCount() === 0)) openOffer(0);
    }, 1000);
  }

  /* ---------- the offer popup, its clock and the coupon ---------- */
  var timer = null;
  function step() { return steps[S.offer ? S.offer.i : -1]; }
  function nextAllowed() {                                // may the next step open here and now?
    return !quiet && !S.buy && !openName && (S.path === 'add' || (!S.stop && cartCount() === 0));
  }
  function openOffer(i) {
    var st = steps[i];
    if (!st || !st.code) return;
    S.offer = { i: i, at: now(), end: now() + Number(st.min || 10) * 6e4, applied: false, hid: false, done: false };
    delete S.next;
    save();
    paintOffer();
    open('offer');
    runClock();
    if (cartCount() > 0) applyCoupon();                  // added from the help popup: the discount goes on now
  }
  function paintOffer() {
    var st = step();
    if (!st) return;
    text('[data-qj-kicker]', st.title || '');
    text('[data-qj-pct]', st.pct + '%');
    text('[data-qj-txt]', fill(st.text, { 'دقائق': st.min, 'نسبة': st.pct }));
    text('[data-qj-pill-text]', fill(S.offer.applied ? W.applied : W.pill, { 'نسبة': st.pct, 'دقائق': st.min }));
  }
  function pill(show) {
    var p = $('[data-qj-pill]');
    if (!p) return;
    if (show) root.hidden = false;
    p.hidden = !show;
  }
  function runClock() {
    clearInterval(timer);
    var paint = function () {
      var left = S.offer.end - now();
      var txt = clock(left);
      text('[data-qj-time]', txt);
      text('[data-qj-pill-time]', txt);
      if (left <= 0) endOffer();
    };
    paint();
    timer = setInterval(paint, 1000);
    pill(!S.offer.hid && !thanks && openName !== 'offer');
  }
  function applyCoupon() {
    var st = step();
    if (!st || !S.offer || S.offer.done || S.offer.applied || now() >= S.offer.end) return;
    if (S.offer.tried && now() - S.offer.tried < 15e3) return;
    S.offer.tried = now(); save();
    Promise.resolve(silent(function () { return salla.cart.addCoupon(st.code); })).then(function () {
      S.offer.applied = true; save();
      paintOffer();
    }).catch(function () { /* min amount / already used: nothing to say */ });
  }
  function endOffer() {
    clearInterval(timer);
    var st = step(), o = S.offer;
    if (!o || o.done) return;
    o.done = true; save();
    close('offer');
    if (o.applied && st && !thanks) silent(function () { return salla.cart.deleteCoupon(st.code); });
    var p = $('[data-qj-pill]');
    if (p && !o.hid && !thanks) {
      text('[data-qj-pill-text]', W.ended);
      text('[data-qj-pill-time]', '');
      p.classList.add('is-ended');
      pill(true);
      setTimeout(function () { pill(false); p.classList.remove('is-ended'); }, 4000);
    }
    // the next step: right away if they are still browsing (and, on the closed-help path, the cart is still empty), else on the next page
    if (steps[o.i + 1]) {
      S.next = o.i + 1; save();
      setTimeout(function () { if (S.next === o.i + 1 && nextAllowed()) openOffer(o.i + 1); }, 4500);
    }
  }
  function resumeOffer() {
    if (S.next != null) {                            // a step that was due when the last page ended
      if (nextAllowed()) openOffer(S.next);
      return;
    }
    var o = S.offer;
    if (!o || o.done || !step()) return;
    if (now() >= o.end) { runClock(); return; }     // paints 00:00 and ends it (coupon removed, next step)
    paintOffer();
    runClock();
    if (cartCount() > 0) applyCoupon();
  }

  /* ---------- the cart decides ---------- */
  function onCartFilled() {
    // A journey under way ends here for good — unless the add came from the help
    // popup itself, which has its own clock. A cart that merely holds something
    // before any popup only pauses the help popup (maybeHelp checks the live
    // cart), so a visitor who empties the cart later is not locked out.
    if (!S.stop && (S.help || S.offer)) { S.stop = true; save(); }
    if (openName === 'help') close('help');
    applyCoupon();
  }

  /* ---------- actions ---------- */
  function act(name) {
    if (name === 'help-close') helpClosed();
    else if (name === 'offer-cta') { if (S.offer) { S.offer.hid = false; save(); } close('offer'); pill(true); }
    else if (name === 'offer-dismiss') { if (S.offer) { S.offer.hid = true; save(); } close('offer'); pill(false); }
  }
  function bind() {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-qj-act], [data-qj-add], [data-qj-pill]');
      if (t && t.dataset.qjAct) act(t.dataset.qjAct);
      else if (t && t.dataset.qjAdd != null) add(t);
      else if (t && t.hasAttribute('data-qj-pill')) { if (S.offer && !S.offer.done) open('offer'); }
      else if (e.target.matches('.qj__bd')) act(openName === 'help' ? 'help-close' : 'offer-cta');
    });
    document.addEventListener('keydown', trap);
    document.addEventListener('visibilitychange', function () { S.tick = now(); });
  }

  /* ---------- boot ---------- */
  function boot() {
    bind();
    if (thanks) {                                   // bought: the journey is over, the coupon stays on the order
      S.buy = true; S.stop = true;
      if (S.offer) S.offer.done = true;
      delete S.next; save();
      return;
    }
    if (!steps.length) { delete S.offer; delete S.next; }   // the offer was switched off since: forget it
    if (qs === 'offer' && steps.length) { S.path = S.path || 'help'; S.helpAt = S.helpAt || now(); S.browse = 9e9; delete S.offer; delete S.next; S.stop = false; S.buy = false; save(); }
    salla.cart.event.onUpdated(function (sum) { if (sum && Number(sum.count) > 0) onCartFilled(); });
    salla.cart.event.onItemAdded(function () { onCartFilled(); });
    if (cartCount() > 0) onCartFilled();
    if (page === 'product.single') notePage();
    resumeOffer();
    if (qs === 'offer' && !S.offer) openOffer(0);
    if (!quiet) { watchBrowsing(); maybeHelp(); }
  }

  /* Never touch salla.* before the SDK is up (Cloudflare Rocket Loader runs it
     after theme scripts on live). app.js dispatches `theme::ready` from inside
     salla.onReady and sets app.status. */
  var booted = false;
  function go() { if (!booted) { booted = true; boot(); } }
  if (window.app && window.app.status === 'ready') go();
  else {
    document.addEventListener('theme::ready', go, { once: true });
    (function poll(tries) {
      if (booted) return;
      if (window.salla && typeof salla.onReady === 'function') return salla.onReady(go);
      if (tries < 40) setTimeout(function () { poll(tries + 1); }, 250);
    })(0);
  }
})();
