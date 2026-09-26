/**
 * Qussah add-to-cart pill — «وصل للسلة» (locked concept toast/qusah, opus-1:
 * Hazem's own Figma proposal, node 54:138, completed).
 *
 * One navy pill at the foot of the page confirms every add made outside the
 * quick view ticket: the product tile, «وصل للسلة ×n», the name and the line
 * price, the cart total inside the cyan «إتمام الطلب» and the piece count on
 * «عرض السلة». Adds while it is up merge into it (the new tile drops onto the
 * stack, the line rolls, the figures count up, the timer starts again), and
 * the card stepper's − / + update it in place. A refused add turns the same
 * pill into «ما وصل للسلة» with Salla's own message (role=alert).
 *
 * It replaces the SweetAlert «تمت إضافة المنتج بنجاح» bar: app.js's notifier
 * asks `window.qissaCartToast.claims()` first, and the pill takes the add's
 * success toast and its error toast. Theme setting `cart_toast_enabled`
 * (master.twig → window.cart_toast_enabled "on" / "off", unset reads on); off
 * leaves the old behaviour untouched — nothing here binds.
 *
 * Verified on the live store (26 Sep 2026):
 *   - an add fires cart::updated (whole cart, items included) and then
 *     salla.cart.event.onItemAdded(response, productId) with
 *     response.data.cart.{items[], count, total}; each item carries id (string),
 *     product_id, product_name, product_image, quantity, total.
 *   - the success toast reaches the notifier as (message, 'success', response)
 *     with response.data.googleTags.event === 'addToCart'.
 *   - a refused add: the notifier gets (message, 'error', axiosError) first
 *     (config.url …/item/{product}/add), then onItemAddedFailed(error,
 *     productId) with error.response.data.error.{message, fields}.
 *   - stepper changes are muted updateItem calls: cart::updated only.
 *   - salla.cart.submit() takes a guest straight to /checkout/{token}.
 *
 * ⚠ Cart item ids are ~19-digit STRINGS — never Number() them.
 * ⚠ No salla.* at module scope (Rocket Loader runs the SDK after this file).
 */

const T = {
  region: 'إشعار السلة',
  arrived: 'وصل للسلة',
  failed: 'ما وصل للسلة',
  unavailable: 'الكمية المطلوبة غير متوفرة',
  retry: 'تعذّر تنفيذ الطلب، حاول مرة أخرى',
  checkout: 'إتمام الطلب',
  view: 'عرض السلة',
  ok: 'حسنًا',
  close: 'إغلاق التنبيه',
  going: 'جاري تحويلك لإتمام الطلب…',
  viewLabel: n => `عرض السلة، فيها ${plural(n)}`,
  goLabel: t => `إتمام الطلب، الإجمالي ${t} ريال`,
};

const TIME = 5000;
const TAP = 'salla-add-product-button, [data-qpd-sticky-add], button';
const ADD_URL = /\/item\/[^/?#]+\/(add|quick-add)(?:[?#]|$)/;
const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const PHONE = window.matchMedia ? matchMedia('(max-width: 768px)') : { matches: false };
const IC = {
  x: '<svg class="qct__i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  alert: '<svg class="qct__i" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7.6v5.4M12 16.3v.1"/></svg>',
};

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const latin = t => String(t).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** The theme's money helper (cards, cart drawer, quick view): salla.money, Latin digits. */
const money = v => latin(window.salla && salla.money ? salla.money(num(v)) : num(v));
const plural = n => (n === 1 ? 'منتج واحد' : n === 2 ? 'منتجان' : n <= 10 ? `${latin(n)} منتجات` : `${latin(n)} منتج`);
const enabled = () => window.cart_toast_enabled !== 'off';
/** Adds made inside the quick view ticket land on its own «طلبك» step. */
const quietNow = () => document.documentElement.classList.contains('qqv-open');

/** Salla's own words for a refused add: the field message first («… غير متوفر بالكمية التي تريدها»). */
function errorText(error) {
  const data = error && error.response && error.response.data;
  if (!data) return T.retry; // no answer at all (offline, timeout)
  const fields = data.error && data.error.fields;
  if (fields) {
    for (const k of Object.keys(fields)) {
      const v = fields[k];
      const m = Array.isArray(v) ? v[0] : v;
      if (typeof m === 'string' && m.trim()) return m.trim();
    }
  }
  const m = data.error && data.error.message;
  return (typeof m === 'string' && m.trim()) || T.unavailable;
}

/* Auto-dismiss that holds while the pill is hovered, focused or touched. The
   cyan line along its foot shows what is left. */
function Timer(onEnd) {
  let left = TIME, t0 = 0, id = 0, anim = null, on = false;
  const reasons = new Set();
  const tick = () => {
    clearTimeout(id);
    if (!on || reasons.size) { if (anim) anim.pause(); return; }
    t0 = performance.now();
    if (anim) anim.play();
    id = setTimeout(() => { on = false; onEnd(); }, left);
  };
  return {
    start(bar) {
      left = TIME;
      on = true;
      if (anim) anim.cancel();
      anim = bar && bar.animate
        ? bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: TIME, easing: 'linear', fill: 'forwards' })
        : null;
      if (anim) anim.pause();
      tick();
    },
    stop() { on = false; clearTimeout(id); if (anim) anim.pause(); },
    pause(r) {
      if (reasons.has(r)) return;
      if (on && !reasons.size) left = Math.max(600, left - (performance.now() - t0));
      reasons.add(r);
      tick();
    },
    resume(r) { if (reasons.delete(r)) tick(); },
    reset() { reasons.clear(); },
  };
}

/* The control the shopper just pressed: the pill never sits on top of it. A
   window capture listener runs before the card flow's document capture
   handler, which stops the click from going any further. */
let tap = null;
function onTap(e) {
  if (!e.target || !e.target.closest || e.target.closest('.qct')) return;
  // a card's add slot as a whole: the add button folds into the − n + stepper in the same cell
  const el = e.target.closest('.qqv-slot') || e.target.closest(TAP);
  if (el) tap = { el, at: Date.now() };
}
const recentTap = () => (tap && Date.now() - tap.at < 20000 && tap.el.isConnected ? tap.el : null);

const Pill = {
  el: null,
  on: false,
  mode: 'ok',
  cart: null,       // the latest cart the SDK handed over
  before: null,     // the one before it (figures count up from here)
  frontId: null,    // cart item id of the line the pill is about
  target: null,
  shown: 0,         // total currently printed on «إتمام الطلب»
  adding: 0,
  going: false,

  build() {
    if (this.el) return;
    const el = document.createElement('div');
    el.className = 'qct';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', T.region);
    el.innerHTML = `<div class="qct__stack" aria-hidden="true"></div>`
      + `<div class="qct__txt"><div class="qct__msg" role="status" aria-live="polite" aria-atomic="true">`
      + `<p class="qct__title"><b>${T.arrived}</b><span class="qct__qty"></span></p>`
      + `<p class="qct__line"><span class="qct__name"></span><span class="qct__price"></span></p></div>`
      + `<div class="qct__err" role="alert"></div></div>`
      + `<div class="qct__acts">`
      + `<button class="qct__btn qct__go" type="button"><span class="qct__gl">${T.checkout}</span><span class="qct__total"></span><span class="qct__going"><span class="qct__spin" aria-hidden="true"></span>${T.going}</span></button>`
      + `<button class="qct__btn qct__view" type="button"><span class="qct__vl">${T.view}</span><span class="qct__count" aria-hidden="true"></span></button>`
      + `</div>`
      + `<button class="qct__x" type="button" aria-label="${T.close}">${IC.x}</button>`
      + `<span class="qct__bar" aria-hidden="true"></span>`;
    document.body.appendChild(el);
    // Where the pill's foot sits with no lift (desktop 24px, phone 12px + the
    // home bar, above the product page's sticky bar) — read from CSS.
    this.probe = document.createElement('span');
    this.probe.className = 'qct-probe';
    this.probe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.probe);

    this.el = el;
    const q = s => el.querySelector(s);
    this.stack = q('.qct__stack');
    this.msg = q('.qct__msg');
    this.qty = q('.qct__qty');
    this.name = q('.qct__name');
    this.price = q('.qct__price');
    this.line = q('.qct__line');
    this.err = q('.qct__err');
    this.go = q('.qct__go');
    this.total = q('.qct__total');
    this.view = q('.qct__view');
    this.vl = q('.qct__vl');
    this.count = q('.qct__count');
    this.bar = q('.qct__bar');
    this.timer = Timer(() => this.hide());

    q('.qct__x').addEventListener('click', () => this.hide());
    this.go.addEventListener('click', () => this.checkout());
    this.view.addEventListener('click', () => this.onView());

    // hold the timer while the shopper is on the pill
    const t = this.timer;
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') t.pause('hover'); });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') t.resume('hover'); });
    el.addEventListener('focusin', () => t.pause('focus'));
    el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) t.resume('focus'); });
    el.addEventListener('touchstart', () => { clearTimeout(this.touchT); t.pause('touch'); }, { passive: true });
    el.addEventListener('touchend', () => { this.touchT = setTimeout(() => t.resume('touch'), 1200); }, { passive: true });
    this.bindSwipe();
  },

  /* Swipe down to put it away (touch). One pointer at a time; a cancelled or
     lost gesture snaps back and the next one works. */
  bindSwipe() {
    const el = this.el;
    let drag = null;
    const end = (e, cancel) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const dy = drag.dy;
      drag = null;
      el.classList.remove('is-drag');
      el.style.removeProperty('--qct-dy');
      if (!cancel && dy > 46) this.hide();
    };
    el.addEventListener('pointerdown', e => {
      if (drag || e.pointerType === 'mouse' || (e.target.closest && e.target.closest('button'))) return;
      drag = { id: e.pointerId, y0: e.clientY, dy: 0 };
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* capture is a nicety */ }
      el.classList.add('is-drag');
    });
    el.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = Math.max(0, e.clientY - drag.y0);
      el.style.setProperty('--qct-dy', drag.dy + 'px');
    });
    el.addEventListener('pointerup', e => end(e));
    el.addEventListener('pointercancel', e => end(e, true));
    el.addEventListener('lostpointercapture', e => end(e));
    window.addEventListener('blur', () => end(null, true));
  },

  /* ---- cart events ---- */

  onCart(cart) {
    if (!cart) return;
    this.before = this.cart;
    this.cart = cart;
    if (!this.on || this.mode !== 'ok' || this.going) return;
    // An add is followed at once by onItemAdded, which does the merge; only a
    // stepper change (or a change elsewhere) is left to update the pill here.
    clearTimeout(this.syncT);
    this.syncT = setTimeout(() => this.sync(), 80);
  },

  beforeAdd() {
    if (this.adding > 0) this.overlap = true;
    this.adding++;
    clearTimeout(this.addingT);
    this.addingT = setTimeout(() => { this.adding = 0; }, 20000);
  },

  /** Overlapping adds can answer out of order, each with the cart as it stood
      then; once the last one is in, read the cart once more for the true figures. */
  settle() {
    this.adding = Math.max(0, this.adding - 1);
    if (this.adding || !this.overlap) return;
    this.overlap = false;
    salla.cart.api.details(null, [])
      .then(r => { const c = r && r.data && r.data.cart; if (c) this.onCart(c); })
      .catch(() => { /* the figures of the last answer stay */ });
  },

  added(res, productId) {
    this.settle();
    if (quietNow()) return;
    clearTimeout(this.syncT);
    const cart = res && res.data && res.data.cart;
    if (cart && Array.isArray(cart.items)) { this.showAdded(cart, productId); return; }
    salla.cart.api.details(null, [])
      .then(r => { const c = r && r.data && r.data.cart; if (c) this.showAdded(c, productId); })
      .catch(() => { /* nothing to show it with */ });
  },

  failed(error, productId) {
    this.settle();
    // A plain string is the SDK refusing before any request (no id, options
    // the product form has not filled) — the form reports those itself.
    if (quietNow() || !error || typeof error !== 'object') return;
    this.showError(error, String(productId || ''));
  },

  /** Several lines can share a product (options): the one that just grew. */
  pick(cart, productId) {
    const items = (cart.items || []).filter(i => String(i.product_id) === String(productId));
    if (items.length < 2) return items[0] || null;
    const was = new Map(((this.before && this.before.items) || []).map(i => [String(i.id), num(i.quantity)]));
    let best = items[items.length - 1];
    let gain = 0;
    items.forEach(i => { const g = num(i.quantity) - (was.get(String(i.id)) || 0); if (g > gain) { gain = g; best = i; } });
    return best;
  },

  showAdded(cart, productId) {
    this.build();
    const wasOn = this.on;
    const wasErr = this.mode === 'err';
    const before = this.before && this.before !== cart ? num(this.before.total) : null;
    this.cart = cart;
    this.target = recentTap();
    const item = this.pick(cart, productId);
    const render = () => {
      this.setMode('ok');
      this.frontId = item ? String(item.id) : null;
      this.putTile(item && item.product_image, String(productId), false, wasOn);
      this.qty.innerHTML = item ? `<bdi dir="ltr">×${latin(num(item.quantity))}</bdi>` : '';
      if (wasOn && !wasErr) this.pop(this.qty);
      this.name.textContent = item ? item.product_name || '' : '';
      this.price.innerHTML = item ? money(item.total) : '';
      this.price.hidden = !item;
      if (wasOn) this.roll(this.line);
      const to = num(cart.total);
      const from = wasOn ? this.shown : Math.min(to, before != null ? before : Math.max(0, to - num(item && item.price)));
      this.figures(cart, from);
      if (wasOn) this.pop(this.count);
    };
    this.show(render);
  },

  showError(error, pid) {
    this.build();
    this.target = recentTap();
    const info = this.productInfo(pid);
    const wasOn = this.on;
    const cart = this.cart;
    const count = cart ? num(cart.count) : num(window.salla && salla.storage && salla.storage.get('cart.summary.count'));
    const total = cart ? num(cart.total) : num(window.salla && salla.storage && salla.storage.get('cart.summary.total'));
    const render = () => {
      this.setMode('err');
      this.putTile(info.image, pid, true, wasOn);
      this.err.innerHTML = `<b>${T.failed}<span class="qct-sr">${info.name ? ': ' + esc(info.name) : ''}</span></b><span>${esc(errorText(error))}</span>`;
      // «إتمام الطلب» stays when the cart already holds something
      this.el.classList.toggle('is-solo', !(count > 0));
      if (count > 0) { this.total.innerHTML = money(total); this.shown = total; }
      this.go.setAttribute('aria-label', T.goLabel(latin(total)));
      this.count.textContent = '';
    };
    this.show(render);
  },

  /** A product that never reached the cart: its name and photo from the cart, the card pressed, or the product page. */
  productInfo(pid) {
    const line = this.cart && (this.cart.items || []).find(i => String(i.product_id) === pid);
    if (line) return { name: line.product_name, image: line.product_image };
    const card = this.target && this.target.closest('.qqv-card, .qprod, custom-salla-product-card');
    if (card) {
      const p = card.product;
      if (p && p.name) return { name: p.name, image: p.image && p.image.url };
      const n = card.querySelector('.qprod__name, .s-product-card-content-title a');
      const img = [...card.querySelectorAll('img')]
        .map(i => i.getAttribute('data-src') || i.currentSrc || i.getAttribute('src'))
        .find(u => u && !/^data:/.test(u));
      return { name: n ? n.textContent.replace(/\s+/g, ' ').trim() : '', image: img || '' };
    }
    if (window.salla && String(salla.config.get('page.id')) === pid) {
      const meta = p => { const m = document.querySelector(`meta[property="${p}"]`); return m ? m.getAttribute('content') : ''; };
      const h1 = document.querySelector('h1');
      return { name: h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : meta('og:title'), image: meta('og:image') };
    }
    return { name: '', image: '' };
  },

  /** A stepper − / + (or any change elsewhere) while the pill is up. */
  sync() {
    const cart = this.cart;
    if (!this.on || this.mode !== 'ok' || !cart) return;
    if (num(cart.count) === 0) { this.hide(); return; }
    if (Array.isArray(cart.items) && this.frontId) {
      const it = cart.items.find(i => String(i.id) === this.frontId);
      if (!it) { this.hide(); return; }
      const q = `×${latin(num(it.quantity))}`;
      if (this.qty.textContent !== q) { this.qty.innerHTML = `<bdi dir="ltr">${q}</bdi>`; this.pop(this.qty); }
      this.price.innerHTML = money(it.total);
    }
    const n = latin(num(cart.count));
    const changed = this.count.textContent !== n;
    this.figures(cart, this.shown);
    if (changed) this.pop(this.count);
    this.timer.start(this.bar);
  },

  figures(cart, from) {
    const count = num(cart.count);
    const total = num(cart.total);
    this.countTo(total, from);
    this.count.textContent = count ? latin(count) : '';
    this.view.setAttribute('aria-label', T.viewLabel(count));
    this.go.setAttribute('aria-label', T.goLabel(latin(total)));
  },

  countTo(to, from) {
    cancelAnimationFrame(this.raf);
    if (RM.matches || from == null || from === to) { this.total.innerHTML = money(to); this.shown = to; return; }
    this.total.innerHTML = money(from);
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / 420);
      const v = k < 1 ? Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) : to;
      this.total.innerHTML = money(v);
      this.shown = v;
      if (k < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },

  setMode(mode) {
    this.mode = mode;
    const err = mode === 'err';
    this.el.classList.toggle('is-err', err);
    if (!err) this.el.classList.remove('is-solo');
    this.vl.textContent = err ? T.ok : T.view;
    // ok: «عرض السلة» opens the cart drawer through its own [data-qcd-open] hook
    if (!err && document.querySelector('[data-qcd]')) this.view.setAttribute('data-qcd-open', '');
    else this.view.removeAttribute('data-qcd-open');
    if (err) this.view.removeAttribute('aria-label');
  },

  /** `drop`: the pill is already up, so the new tile falls onto the stack
      (the first one rides in with the pill itself). */
  putTile(src, pid, bad, drop) {
    const stack = this.stack;
    const front = stack.lastElementChild;
    // same product again: the tile stays, ×n moves
    if (!bad && front && front.dataset.id === pid && !front.classList.contains('is-bad')) return;
    [...stack.children].filter(t => t.dataset.id === pid || t.classList.contains('is-bad')).forEach(t => t.remove());
    const t = document.createElement('span');
    t.className = 'qct__tile' + (bad ? ' is-bad' : '');
    t.dataset.id = pid;
    if (src) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        const ph = window.salla && salla.url.asset(salla.config.get('theme.settings.placeholder') || 'images/placeholder.png');
        if (!img.dataset.fb && ph) { img.dataset.fb = '1'; img.src = ph; } else img.remove();
      });
      img.src = src;
      t.appendChild(img);
    }
    if (bad) t.insertAdjacentHTML('beforeend', `<span class="qct__bad">${IC.alert}</span>`);
    if (drop && !RM.matches) {
      t.classList.add('in');
      // the drop ends at transform:none — let go of it so the tile can fan out behind the next one
      t.addEventListener('animationend', () => t.classList.remove('in'), { once: true });
    }
    stack.appendChild(t);
    while (stack.children.length > 3) stack.firstElementChild.remove();
  },

  pop(n) {
    if (RM.matches) return;
    n.classList.remove('is-pop');
    void n.offsetWidth;
    n.classList.add('is-pop');
  },

  roll(n) {
    if (RM.matches) return;
    n.classList.remove('is-roll');
    void n.offsetWidth;
    n.classList.add('is-roll');
  },

  /* ---- show / hide ---- */

  show(render) {
    if (this.on) { render(); this.timer.start(this.bar); requestAnimationFrame(() => this.lift()); return; }
    this.on = true;
    this.timer.reset();
    this.el.classList.add('is-on');
    document.documentElement.classList.add('qct-up');
    // Filled once it is visible, so the status / alert is announced (a live
    // region that changes while hidden is not read). Focus is never moved.
    requestAnimationFrame(() => {
      if (!this.on) return;
      render();
      this.lift();
      this.timer.start(this.bar);
    });
  },

  hide(keepFocus) {
    if (!this.on) return;
    this.on = false;
    this.timer.stop();
    this.el.classList.remove('is-on');
    document.documentElement.classList.remove('qct-up');
    if (!keepFocus && this.el.contains(document.activeElement)) {
      // back to what was pressed (on a card: its stepper, or «أضف للسلة» again)
      const t = this.target;
      const f = t && t.isConnected && (t.matches('button') ? t : t.querySelector('button:not([inert]):not([tabindex="-1"])'));
      if (f && !f.closest('[inert]') && f.getClientRects().length) f.focus({ preventScroll: true });
      else document.activeElement.blur();
    }
    setTimeout(() => {
      if (this.on) return;
      this.stack.innerHTML = '';
      this.setMode('ok');
      this.el.style.setProperty('--qct-lift', '0px');
      this.frontId = null;
      this.done();
    }, 280);
  },

  /** Keep the pressed button (and the stepper it turns into) in sight. */
  lift() {
    let lift = 0;
    const t = this.target && this.target.isConnected ? this.target : null;
    if (t && this.on) {
      const b = t.getBoundingClientRect();
      const vh = window.innerHeight;
      const base = vh - this.probe.getBoundingClientRect().top;
      const w = this.el.offsetWidth;
      const top = vh - base - this.el.offsetHeight;
      const across = PHONE.matches || (b.left < (window.innerWidth + w) / 2 && b.right > (window.innerWidth - w) / 2);
      if (b.width && across && b.bottom > top - 8 && b.top < vh - base) {
        lift = Math.max(0, Math.min(vh - b.top + 10 - base, vh * 0.6));
      }
    }
    this.el.style.setProperty('--qct-lift', Math.round(lift) + 'px');
  },

  /* ---- actions ---- */

  onView() {
    if (this.mode === 'err') { this.hide(); return; }
    // The drawer's own click handler opens it from [data-qcd-open]; the pill steps aside.
    if (this.view.hasAttribute('data-qcd-open')) { this.hide(true); return; }
    window.location.href = salla.url.get('cart');
  },

  checkout() {
    if (this.going) return;
    this.going = true;
    this.timer.stop();
    this.go.classList.add('is-going');
    this.go.setAttribute('aria-busy', 'true');
    this.goLabel = this.go.getAttribute('aria-label');
    this.go.setAttribute('aria-label', T.going);
    Promise.resolve()
      .then(() => salla.cart.submit())
      // on the way to checkout (a login sheet, when the store asks for one, sits above at z-index 200)
      .then(() => { this.goingT = setTimeout(() => this.done(true), 8000); })
      .catch(() => this.done(true));
  },

  done(restart) {
    clearTimeout(this.goingT);
    if (!this.going) return;
    this.going = false;
    this.go.classList.remove('is-going');
    this.go.removeAttribute('aria-busy');
    if (this.goLabel) this.go.setAttribute('aria-label', this.goLabel);
    if (restart && this.on) this.timer.start(this.bar);
  },
};

/* ---- public hook for app.js's notifier ---- */

function claims(type, data) {
  if (!enabled() || !Pill.bound || quietNow()) return false;
  if (type === 'success') return !!(data && data.data && data.data.googleTags && data.data.googleTags.event === 'addToCart');
  if (type === 'error') {
    const url = data && data.config && data.config.url;
    if (url) return ADD_URL.test(String(url));
    // the same refusal, handed over as the response body instead of the request
    return Pill.adding > 0 && !!(data && (data.error || data.response));
  }
  return false;
}

window.qissaCartToast = { enabled, claims };

function boot() {
  if (Pill.bound || !enabled() || !window.salla || !salla.cart || !salla.cart.event) return;
  Pill.bound = true;
  window.addEventListener('click', onTap, true);
  const ev = salla.cart.event;
  ev.onUpdated(cart => Pill.onCart(cart));
  if (ev.onBeforeAddItem) ev.onBeforeAddItem(() => Pill.beforeAdd());
  ev.onItemAdded((res, productId) => Pill.added(res, productId));
  ev.onItemAddedFailed((error, productId) => Pill.failed(error, productId));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && Pill.on && !quietNow() && !document.body.classList.contains('qcd-open')) Pill.hide();
  });
  window.addEventListener('resize', () => { if (Pill.on) Pill.lift(); });
}

export function bootCartToast() {
  if (!enabled()) return;
  if (window.app && window.app.status === 'ready') boot();
  else document.addEventListener('theme::ready', boot, { once: true });
}
