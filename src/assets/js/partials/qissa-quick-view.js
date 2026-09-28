/**
 * Qussah quick view — «تذكرة الطلب» (locked concept, quick-view/BUILD.md).
 *
 * Two independent pieces live here, both wired to every product card on the
 * site: the hand-built Twig cards (`.qprod`, home grids + the listing page)
 * and the JS card (`custom-salla-product-card`, sliders / related products).
 *
 *   1. Card add flow. «أضف للسلة» shows a short «✓ أُضيف», then morphs in place
 *      into a − n + stepper that drives that product's cart line
 *      (salla.cart.updateItem / deleteItem; back to «أضف للسلة» at 0). Cards
 *      whose product is already in the cart come up as steppers. Products with
 *      options, out of stock, bookings and donations keep the theme's own
 *      button. This part runs whatever the quick-view switches say.
 *
 *   2. The ticket. An eye button beside «أضف للسلة» (hover/focus on desktop,
 *      always on phones) opens one page-level dark ticket anchored to the card.
 *      Product step: gallery, name, subtitle, rating, «ماذا يوجد في البكج» read
 *      from the description, price + saving, qty + add, buy now, trust lines.
 *      After an add it slides to «طلبك», built from the cart the add returned.
 *      Off when the theme setting `quick_view_enabled` is off, or for one
 *      section when it carries data-qv="off" — then no trigger is drawn and the
 *      ticket is never built.
 *
 * Verified against the live store (26 Sep 2026): getDetails(id, ['images',
 * 'options', 'rating']) returns images / options / rating; addItem,
 * updateItem({id, quantity}) and deleteItem(id) resolve with the whole cart in
 * `data.cart` and fire cart::updated with the same cart (items included);
 * `salla.api.withoutNotifier(fn)` mutes the SDK's success toast for adds made
 * inside the ticket; errors reject with `response.data.error.{message,fields}`.
 *
 * ⚠ Cart item ids are ~19-digit STRINGS — never Number() them.
 * ⚠ No salla.* at module scope (Rocket Loader runs the SDK after this file).
 */

import { enhanceCarousel } from './card-carousel';

const T = {
  add: 'أضف للسلة',
  added: 'أُضيف',
  buy: 'اشترِ الآن',
  qv: 'نظرة سريعة',
  qvOn: name => `نظرة سريعة على ${name}`,
  stepProduct: 'المنتج',
  stepOrder: 'طلبك',
  steps: 'خطوات الطلب',
  close: 'إغلاق النظرة السريعة',
  images: 'صور المنتج',
  photo: (k, n) => `الصورة ${k} من ${n}`,
  imageN: (k, n) => `عرض ${T.photo(k, n)}`,
  inside: box => `ماذا يوجد في ${box}`,
  more: n => `عرض ${n === 1 ? 'عنصر آخر' : n + ' عناصر أخرى'}`,
  less: 'أقل',
  lessLabel: 'إخفاء العناصر الإضافية',
  instead: 'بدلًا من',
  save: 'وفّر',
  qty: 'الكمية',
  inc: 'زيادة الكمية',
  dec: 'إنقاص الكمية',
  remove: 'إزالة من السلة',
  cardQty: name => `كمية ${name} في السلة`,
  pdp: 'صفحة المنتج كاملة',
  options: 'اختر الخيارات',
  ordered: 'أضفناه لطلبك',
  inOrder: n => `في طلبك ${n} ${n === 1 ? 'منتج' : n === 2 ? 'منتجان' : n <= 10 ? 'منتجات' : 'منتج'}`,
  lines: 'منتجات الطلب',
  subtotal: 'المجموع الفرعي',
  discount: 'الخصم',
  shipping: 'الشحن',
  shipLater: 'يحسب عند الدفع',
  total: 'الإجمالي',
  checkout: 'إتمام الشراء',
  keepShopping: 'أكمل التسوق',
  back: 'رجوع للمنتج',
  cod: 'الدفع عند الاستلام أو تقسيط تابي وتمارا',
  going: 'جاري تحويلك لإتمام الطلب…',
  goingSr: 'جاري تحويلك لصفحة إتمام الطلب',
  trust: 'مزايا الشراء من قصة',
  trustItems: [
    ['box', 'من المصنع مباشرة', 'بدون وسيط'],
    ['truck', 'توصيل لبابك', 'لكل مدن المملكة'],
    ['shield', 'الدفع عند الاستلام', 'أو تقسيط تابي وتمارا'],
  ],
  rating: s => `التقييم ${s} من 5`,
  ratings: n => (n === 1 ? 'تقييم واحد' : n === 2 ? 'تقييمان' : n <= 10 ? `${n} تقييمات` : `${n} تقييم`),
  addedSr: (name, n) => `أُضيف ${name} للسلة. في السلة ${n}`,
  qtySr: (name, n) => `${name}: الكمية في السلة ${n}`,
  removedSr: name => `أُزيل ${name} من السلة`,
  failed: 'تعذّر تنفيذ الطلب، حاول مرة أخرى',
  removeLine: name => `حذف ${name}`,
  incLine: name => `زيادة كمية ${name}`,
  decLine: name => `إنقاص كمية ${name}`,
};

const svg = (d, cls = 'qqv-i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
const IC = {
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  left: svg('<path d="m15 6-6 6 6 6"/>'),
  right: svg('<path d="m9 6 6 6-6 6"/>'),
  star: '<svg class="qqv-st" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z"/></svg>',
  box: svg('<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5"/>'),
  truck: svg('<path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3v3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'),
  shield: svg('<path d="M12 3 19 6v5.5c0 4.3-2.9 7.8-7 9.5-4.1-1.7-7-5.2-7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
};

/* ------------------------------------------------------------------ helpers */

const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const PHONE = window.matchMedia ? matchMedia('(max-width: 768px)') : { matches: false };
const E_IN = 'cubic-bezier(.16,1,.3,1)';
const CONFIRM_MS = 850;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const latin = t => String(t).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** The theme's money helper (cards and cart drawer): salla.money, Latin digits. */
const money = v => latin(window.salla && salla.money ? salla.money(num(v)) : num(v));
const sdkReady = () => !!(window.salla && salla.cart && salla.cart.api && window.app && window.app.status === 'ready');
const quiet = fn => (salla.api && typeof salla.api.withoutNotifier === 'function' ? salla.api.withoutNotifier(fn) : fn());
const qvGlobalOn = () => window.quick_view_enabled !== 'off';
const qvOnFor = card => qvGlobalOn() && !card.closest('[data-qv="off"]');

function errorText(error) {
  const data = error && error.response && error.response.data;
  const fields = data && data.error && data.error.fields;
  if (fields) {
    for (const k of Object.keys(fields)) {
      const v = fields[k];
      if (Array.isArray(v) && v[0]) return String(v[0]);
      if (typeof v === 'string' && v) return v;
    }
  }
  return (data && data.error && data.error.message) || (typeof error === 'string' ? error : '') || T.failed;
}
const needsOptions = error => {
  const f = error && error.response && error.response.data && error.response.data.error && error.response.data.error.fields;
  return !!(f && f.options);
};

function textOf(html) {
  let text = '';
  try {
    const body = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
    // cells and blocks sit flush in the markup — without a gap a size table
    // reads «المقاس36نصف محيط»
    body.querySelectorAll('br').forEach(br => br.replaceWith(' '));
    body.querySelectorAll('td,th,tr,p,li,div,h1,h2,h3,h4,h5,h6').forEach(el => el.append(' '));
    text = body.textContent || '';
  }
  catch (e) { text = String(html || '').replace(/<[^>]*>/g, ' '); }
  return text.replace(/\s+/g, ' ').trim();
}

let liveT;
function announce(text) {
  let live = $('#qqv-live');
  if (!live) {
    live = document.createElement('div');
    live.id = 'qqv-live';
    live.className = 'qqv-sr';
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
  }
  live.textContent = '';
  clearTimeout(liveT);
  liveT = setTimeout(() => { live.textContent = text; }, 60);
}

/* ------------------------------------------------ «ماذا يوجد في البكج» parser
 * The store keeps no structured contents field, so the lines come from the
 * description the merchant wrote: the lines under «محتويات …:» first, then the
 * lines under a short «المواصفات» heading, then the first bulleted list, then a
 * leading run of quantity lines («1 كرتون …»). Nothing found → block hidden. */

const LINE_MAX = 110;
const STOP = /^(ال)?(مميزات|المميزات|الاستخدام|استخدام|طريقة|تنبيه|ملاحظة|ملاحظات|تحذير)/;

function descLines(doc) {
  const body = doc.body.cloneNode(true);
  body.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  body.querySelectorAll('td,th').forEach(el => el.append(' '));
  body.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,div,ul,ol,tr').forEach(el => el.append('\n'));
  return (body.textContent || '').split('\n').map(clean);
}
function clean(t) {
  return String(t).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
function tidy(t) {
  return clean(t).replace(/^[*•\-–—·]+\s*/, '').replace(/[.،,\s]+$/, '').trim();
}
function collect(lines, from) {
  const out = [];
  for (let i = from; i < lines.length && out.length < 12; i++) {
    const l = lines[i];
    if (!l) { if (out.length) break; continue; }
    if (STOP.test(l)) break;
    if (/[:：]\s*$/.test(l) && l.length <= 32) break;
    if (l.length > LINE_MAX) { if (out.length) break; continue; }
    const t = tidy(l);
    if (t && !/^السعر\s*[:：]/.test(t)) out.push(t);
  }
  return out;
}
function insideLines(html) {
  if (!html) return [];
  let doc;
  try { doc = new DOMParser().parseFromString(String(html), 'text/html'); } catch (e) { return []; }
  const lines = descLines(doc);

  // 1 · «محتويات البكج:» / «مكونات …»
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/(محتويات|مكونات)/.test(l)) continue;
    const colon = l.search(/[:：]/);
    if (colon === -1 && l.length > 32) continue;
    const head = colon === -1 ? l : l.slice(0, colon);
    if (head.length > 40) continue;
    const rest = colon === -1 ? '' : tidy(l.slice(l.lastIndexOf(':') + 1));
    const got = collect(lines, i + 1);
    if (rest && rest.length <= LINE_MAX && !/(محتويات|مكونات)/.test(rest)) got.unshift(rest);
    if (got.length) return got;
  }
  // 2 · a short «المواصفات» / «تفاصيل المنتج» heading
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/[:：]\s*$/, '').trim();
    if (l.length <= 24 && /^((ال)?مواصفات|تفاصيل (ال)?(منتج|بكج|عبوة))/.test(l)) {
      const got = collect(lines, i + 1);
      if (got.length >= 2) return got;
    }
  }
  // 3 · the first bulleted list
  const list = doc.querySelector('ul, ol');
  if (list) {
    const got = $$(':scope > li', list).map(li => tidy(li.textContent || ''))
      .filter(t => t && t.length <= LINE_MAX && !/^السعر\s*[:：]/.test(t)).slice(0, 12);
    if (got.length >= 2) return got;
  }
  // 4 · a leading run of quantity lines
  const run = [];
  for (const l of lines) {
    if (!l) { if (run.length) break; continue; }
    if (/^\d/.test(latin(l)) && l.length <= LINE_MAX) run.push(tidy(l)); else break;
  }
  return run.length >= 2 ? run : [];
}

/* ============================================================== cart state */

const Cart = {
  lines: new Map(), // product id (string) → { itemId (string), qty, max }
  bound: false,

  apply(cart) {
    if (!cart || !Array.isArray(cart.items)) return;
    const next = new Map();
    cart.items.forEach(item => {
      const pid = String(item.product_id);
      if (next.has(pid)) return;
      next.set(pid, { itemId: String(item.id), qty: num(item.quantity), max: num(item.max_quantity) });
    });
    this.lines = next;
    this.cart = cart;
    Cards.syncAll();
  },

  bind() {
    if (this.bound) return;
    this.bound = true;
    salla.cart.event.onUpdated(cart => this.apply(cart));
    // Cards on a fresh page load: read the cart once, but only when the
    // stored summary says there is something in it (no request, no cart
    // creation for an empty session).
    const count = salla.storage && salla.storage.get('cart.summary.count');
    if (count === 0 || count === '0') return;
    salla.cart.api.details(null, [])
      .then(res => this.apply(res && res.data && res.data.cart))
      .catch(() => { /* no cart yet */ });
  },
};

/* ================================================================== cards */


const Cards = {
  /** Hand-built Twig card: wrap the add button, add the stepper + trigger. */
  enhanceTwig(card) {
    if (card.dataset.qqv) return;
    const row = $('.qprod__btns', card);
    const add = row && $('.qprod__add', row);
    const id = cardId(card);
    card.dataset.qqv = '1';
    if (!add || !id) return;
    card.dataset.qqvId = id;
    const slot = document.createElement('div');
    slot.className = 'qqv-slot';
    add.before(slot);
    slot.appendChild(add);
    this.fill(card, slot, !add.classList.contains('qprod__add--oos'));
  },

  /** JS card: product-card.js renders the slot; called after every render. */
  enhanceJs(card) {
    const slot = $('.qqv-slot', card);
    if (!slot || slot.dataset.ready) return;
    const p = card.product || {};
    card.dataset.qqvId = String(p.id);
    const canStep = p.status === 'sale' && !p.is_out_of_stock && !p.has_options
      && !['booking', 'donating', 'financial_support'].includes(p.type) && !p.donation;
    this.fill(card, slot, canStep);
  },

  fill(card, slot, canStep) {
    slot.dataset.ready = '1';
    slot.dataset.s = 'add';
    card.classList.add('qqv-card');
    const name = cardName(card);
    if (canStep) {
      slot.dataset.step = '1';
      slot.insertAdjacentHTML('beforeend',
        `<span class="qqv-done qqv-c" aria-hidden="true"><span class="qqv-spin"></span>${IC.check}<span>${T.added}</span></span>`
        + `<div class="qqv-step" role="group" aria-label="${esc(T.cardQty(name))}">`
        + `<button type="button" data-qqv-d="1" aria-label="${T.inc}" tabindex="-1">${IC.plus}</button>`
        + `<output class="qqv-c">0</output>`
        + `<button type="button" data-qqv-d="-1" aria-label="${T.dec}" tabindex="-1">${IC.minus}</button></div>`);
    }
    if (qvOnFor(card)) {
      card.classList.add('qqv-has-trig');
      // Visually always heart · eye · add: the Twig row runs LTR, the JS card's RTL.
      slot.insertAdjacentHTML(card.product ? 'afterend' : 'beforebegin',
        `<button type="button" class="qqv-trig qqv-c" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(T.qvOn(name))}">${IC.eye}<span aria-hidden="true">${T.qv}</span></button>`);
    }
    this.sync(card);
  },

  scan(root = document) {
    $$('.qprod', root).forEach(c => this.enhanceTwig(c));
    $$('custom-salla-product-card', root).forEach(c => this.enhanceJs(c));
  },

  slotOf(card) { return $('.qqv-slot', card); },

  sync(card, focus = false) {
    const slot = this.slotOf(card);
    if (!slot || !slot.dataset.step) return;
    const s = slot.dataset.s;
    if (s === 'busy' || s === 'done') return;
    const line = Cart.lines.get(card.dataset.qqvId);
    const n = slot._target != null ? slot._target : (line ? line.qty : 0);
    const out = $('.qqv-step output', slot);
    if (out) out.textContent = latin(n);
    const dec = $('[data-qqv-d="-1"]', slot);
    if (dec) dec.setAttribute('aria-label', n > 1 ? T.dec : T.remove);
    const next = n > 0 ? 'qty' : 'add';
    slot.dataset.s = next;
    $$('.qqv-step button', slot).forEach(b => { b.tabIndex = next === 'qty' ? 0 : -1; });
    const add = addBtn(slot);
    if (add) {
      if (next === 'qty') add.setAttribute('inert', ''); else add.removeAttribute('inert');
    }
    if (focus && s !== next) {
      const target = next === 'qty' ? $('[data-qqv-d="1"]', slot) : focusable(add);
      if (target) target.focus({ preventScroll: true });
    }
  },

  syncAll() {
    $$('.qqv-card').forEach(c => this.sync(c));
    Ticket.syncFromCart();
  },

  /** «أضف للسلة» on the card: add one, confirm, then become the stepper. */
  add(card) {
    const slot = this.slotOf(card);
    if (!slot || slot.dataset.s !== 'add') return;
    const kb = slot.contains(document.activeElement);
    const id = card.dataset.qqvId;
    slot.dataset.s = 'busy';
    slot.setAttribute('aria-busy', 'true');
    // Not muted: the add's confirmation is the theme's (the «وصل للسلة» pill,
    // or the green toast when the pill is switched off).
    salla.cart.addItem({ id, quantity: 1 })
      .then(res => {
        slot.removeAttribute('aria-busy');
        slot.dataset.s = 'done';
        const cart = res && res.data && res.data.cart;
        if (cart) Cart.apply(cart);
        const line = Cart.lines.get(id);
        // the «وصل للسلة» pill announces the add itself when it is on
        if (!(window.qissaCartToast && window.qissaCartToast.enabled())) {
          announce(T.addedSr(cardName(card), latin(num(cart && cart.count) || (line ? line.qty : 1))));
        }
        clearTimeout(slot._t);
        slot._t = setTimeout(() => { slot.dataset.s = 'add'; this.sync(card, kb); }, CONFIRM_MS);
      })
      .catch(error => {
        slot.removeAttribute('aria-busy');
        slot.dataset.s = 'add';
        // A product that needs options: the theme's own behaviour is its
        // product page, where the options live.
        if (needsOptions(error)) { slot.removeAttribute('data-step'); }
        this.sync(card);
      });
  },

  /** − / + on the card stepper. Optimistic, one request in flight per card. */
  step(card, d) {
    const slot = this.slotOf(card);
    const line = Cart.lines.get(card.dataset.qqvId);
    if (!slot || !line) return;
    const cur = slot._target != null ? slot._target : line.qty;
    const max = line.max > 0 ? line.max : Infinity;
    const next = Math.max(0, Math.min(max, cur + d));
    if (next === cur) return;
    slot._target = next;
    const out = $('.qqv-step output', slot);
    if (out) out.textContent = latin(next);
    if (next === 0) {
      // Fold back to «أضف للسلة» straight away; the delete follows.
      slot.dataset.s = 'add';
      const add = addBtn(slot);
      if (add) { add.removeAttribute('inert'); const f = focusable(add); if (f) f.focus({ preventScroll: true }); }
    }
    this.send(card, slot);
  },

  send(card, slot) {
    if (slot._flight) return;
    const line = Cart.lines.get(card.dataset.qqvId);
    const target = slot._target;
    if (!line || target == null) { slot._target = null; this.sync(card); return; }
    if (target === line.qty) { slot._target = null; this.sync(card); return; }
    slot._flight = true;
    const req = target <= 0
      ? quiet(() => salla.cart.deleteItem(line.itemId))
      : quiet(() => salla.cart.updateItem({ id: line.itemId, quantity: target }));
    const name = cardName(card);
    req.then(res => {
      slot._flight = false;
      if (slot._target === target) slot._target = null;
      const cart = res && res.data && res.data.cart;
      if (cart) Cart.apply(cart);
      announce(target > 0 ? T.qtySr(name, latin(target)) : T.removedSr(name));
      if (slot._target != null) this.send(card, slot); else this.sync(card);
    }).catch(error => {
      slot._flight = false;
      slot._target = null;
      if (salla.notify) salla.notify.error(errorText(error));
      this.sync(card);
    });
  },
};

function cardId(card) {
  if (card.product && card.product.id) return String(card.product.id);
  const like = $('.qprod__like[data-id]', card);
  if (like) return String(like.dataset.id).replace(/\D/g, '');
  const add = $('.qprod__add[onclick]', card);
  const m = add && /id:\s*'?(\d+)/.exec(add.getAttribute('onclick'));
  if (m) return m[1];
  const a = $('a[href*="/p"]', card);
  const h = a && /\/p(\d+)(?:[/?#]|$)/.exec(a.getAttribute('href') || '');
  return h ? h[1] : '';
}
function cardName(card) {
  if (card.product && card.product.name) return card.product.name;
  const n = $('.qprod__name, .s-product-card-content-title a', card);
  return n ? clean(n.textContent) : '';
}
function addBtn(slot) {
  return slot.querySelector(':scope > .qprod__add, :scope > salla-add-product-button');
}
function focusable(el) {
  if (!el) return null;
  return el.matches('button') ? el : el.querySelector('button');
}

/** Everything the ticket can show before getDetails answers — never an empty shell. */
function cardData(card) {
  const id = card.dataset.qqvId;
  if (card.product) {
    const p = card.product;
    // The list feed's description is already flattened to text — show it, but
    // leave «ماذا يوجد» to the HTML getDetails returns.
    return Object.assign({}, p, { id: String(p.id), images: [], description: '', plain: textOf(p.description) });
  }
  const nameEl = $('.qprod__name', card);
  const imgs = $$('.qprod__img img', card)
    .map(i => i.getAttribute('data-src') || i.currentSrc || i.getAttribute('src'))
    .filter(u => u && !/^data:/.test(u));
  const price = el => { const t = el ? latin(el.textContent).replace(/[^\d.]/g, '') : ''; return t ? Number(t) : 0; };
  const now = price($('.qprod__price-now', card));
  const old = price($('.qprod__price-old', card));
  const chips = $$('.qprod__chip', card).map(c => clean(c.textContent)).filter(Boolean);
  const desc = $('.qprod__desc', card);
  return {
    id,
    name: nameEl ? clean(nameEl.textContent) : '',
    url: nameEl ? nameEl.href : '',
    image: imgs[0] ? { url: imgs[0] } : null,
    images: imgs.map(url => ({ url })),
    subtitle: chips.join('، '),
    plain: desc ? clean(desc.textContent) : '',
    price: now,
    sale_price: now,
    regular_price: old || now,
    is_on_sale: old > now,
    status: $('.qprod__add--oos', card) ? 'out' : 'sale',
    is_out_of_stock: !!$('.qprod__add--oos', card),
  };
}

const details = new Map();
function getDetails(id) {
  if (!details.has(id)) {
    details.set(id, salla.product.getDetails(id, ['images', 'options', 'rating'])
      .then(res => res && res.data)
      .catch(error => { details.delete(id); throw error; }));
  }
  return details.get(id);
}

/* ================================================================= ticket */

const Ticket = {
  built: false,
  open: false,
  card: null,
  data: null,
  q: 1,
  im: 0,
  back: null,
  closing: null,
  busy: false,
  raf: 0,

  build() {
    if (this.built) return;
    this.built = true;
    const html = `<div class="qqv-veil" hidden></div><div class="qqv-wrap" hidden data-side="left"><span class="qqv-notch" aria-hidden="true"></span><div class="qqv-ticket" role="dialog" aria-modal="true" aria-labelledby="qqv-title"><div class="qqv-top"><ol class="qqv-steps" aria-label="${T.steps}"><li class="is-on" data-st="1" aria-current="step"><i>${latin(1)}</i>${T.stepProduct}</li><li class="qqv-line" aria-hidden="true"></li><li data-st="2"><i>${latin(2)}</i>${T.stepOrder}</li></ol><button class="qqv-x qqv-c" type="button" data-act="close" aria-label="${T.close}">${IC.x}</button></div><div class="qqv-scroll"><div class="qqv-stack"><section class="qqv-pane qqv-prod" aria-labelledby="qqv-title"><div class="qqv-gal"><div class="qqv-img"></div><div class="qqv-ths" role="group" aria-label="${T.images}"></div></div><h2 id="qqv-title" tabindex="-1"></h2><div class="qqv-meta"><span class="qqv-pill"></span><div class="qqv-rate"></div></div><section class="qqv-in" aria-labelledby="qqv-in-h"><div class="qqv-in-hd"><h3 id="qqv-in-h"></h3><button class="qqv-more" type="button" data-act="more" aria-expanded="false" aria-controls="qqv-in-list"></button></div><ul class="qqv-in-list" id="qqv-in-list"></ul></section><div class="qqv-price"></div><p class="qqv-desc"></p><div class="qqv-buy"><div class="qqv-row"><div class="qqv-qty" role="group" aria-label="${T.qty}"><button type="button" data-q="1" aria-label="${T.inc}">${IC.plus}</button><output aria-live="polite">1</output><button type="button" data-q="-1" aria-label="${T.dec}">${IC.minus}</button></div><button class="qqv-btn qqv-w qqv-c" type="button" data-act="add"><span class="qqv-spin"></span><span class="qqv-lbl">${T.add}</span></button></div><button class="qqv-btn qqv-cy qqv-c" type="button" data-act="buy"><span class="qqv-spin"></span><span class="qqv-lbl">${T.buy}</span></button><a class="qqv-btn qqv-w qqv-c qqv-opts" href="#" hidden>${T.options}</a><p class="qqv-err" role="alert" hidden></p></div><ul class="qqv-trust" aria-label="${T.trust}">
            ${T.trustItems.map(([i, b, s]) => `<li>${IC[i]}<b>${b}</b><small>${s}</small></li>`).join('')}
          </ul><a class="qqv-pdp" href="#">${T.pdp}${IC.left}</a></section><section class="qqv-pane qqv-order" aria-labelledby="qqv-order-h" inert><div class="qqv-okh"><span class="qqv-okc qqv-c">${IC.check}</span><div><h2 id="qqv-order-h" tabindex="-1">${T.ordered}</h2><p class="qqv-order-sub"></p></div></div><ul class="qqv-lines" aria-label="${T.lines}"></ul><dl class="qqv-sum"></dl><p class="qqv-err qqv-order-err" role="alert" hidden></p><button class="qqv-btn qqv-cy qqv-c" type="button" data-act="checkout"><span class="qqv-lbl">${T.checkout}</span></button><button class="qqv-btn qqv-gh qqv-c" type="button" data-act="continue">${T.keepShopping}</button><p class="qqv-cod qqv-c">${IC.shield}${T.cod}</p><button class="qqv-back" type="button" data-act="back">${IC.right}${T.back}</button></section></div></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    this.veil = $('.qqv-veil');
    this.wrap = $('.qqv-wrap');
    this.tk = $('.qqv-ticket', this.wrap);
    this.scroller = $('.qqv-scroll', this.wrap);
    this.prod = $('.qqv-prod', this.wrap);
    this.order = $('.qqv-order', this.wrap);

    this.veil.addEventListener('click', () => this.close());
    document.addEventListener('keydown', e => { if (this.open && e.key === 'Escape') this.close(); });
    this.tk.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); this.close(); } else trapTab(this.tk, e);
    });
    this.tk.addEventListener('click', e => this.onClick(e));
    let rz = 0;
    window.addEventListener('resize', () => {
      if (!this.open) return;
      cancelAnimationFrame(rz);
      rz = requestAnimationFrame(() => {
        if (!this.card || !this.card.isConnected || !this.card.getClientRects().length) { this.close(); return; }
        this.place();
      });
    });
  },

  onClick(e) {
    const b = e.target.closest('[data-act],[data-img],[data-q],[data-lq]');
    if (!b || b.disabled) return;
    if (b.dataset.img) { this.go(+b.dataset.img); return; }
    if (b.dataset.q) {
      this.q = Math.max(1, Math.min(this.maxQ(), this.q + (+b.dataset.q)));
      $('.qqv-qty output', this.prod).textContent = latin(this.q);
      return;
    }
    if (b.dataset.lq) { this.lineQty(b.dataset.lq, +b.dataset.d, b); return; }
    const a = b.dataset.act;
    if (a === 'close' || a === 'continue') this.close();
    else if (a === 'add') this.add(false);
    else if (a === 'buy') this.add(true);
    else if (a === 'checkout') this.checkout(b);
    else if (a === 'back') this.step(false);
    else if (a === 'more') {
      const box = $('.qqv-in', this.prod);
      const on = !box.classList.contains('is-open');
      const n = $$('.qqv-in-list li.is-more', box).length;
      box.classList.toggle('is-open', on);
      b.setAttribute('aria-expanded', String(on));
      b.textContent = on ? T.less : plusN(n);
      b.setAttribute('aria-label', on ? T.lessLabel : T.more(n));
    }
  },

  maxQ() {
    const d = this.data || {};
    let max = num(d.max_quantity) > 0 ? num(d.max_quantity) : 99;
    if (num(d.quantity) > 0 && !d.unlimited_quantity) max = Math.min(max, num(d.quantity));
    return Math.max(1, max);
  },

  /* ---- product step ---- */

  fill(data, first) {
    const d = this.data = data;
    const prod = this.prod;
    const name = d.name || '';
    $('#qqv-title').textContent = name;
    const pill = $('.qqv-pill', prod);
    pill.textContent = d.subtitle || '';
    pill.hidden = !d.subtitle;
    const rate = $('.qqv-rate', prod);
    const stars = num(d.rating && d.rating.stars);
    const count = num(d.rating && d.rating.count);
    rate.hidden = !stars;
    rate.innerHTML = stars
      ? `<span class="qqv-stars" role="img" aria-label="${T.rating(latin(stars))}">${IC.star.repeat(5)}</span>${count ? `<span>(${latin(T.ratings(count))})</span>` : ''}`
      : '';
    $('.qqv-meta', prod).hidden = !d.subtitle && !stars;

    // «ماذا يوجد في البكج»
    // Only the HTML from getDetails is parsed; card data carries plain text.
    const list = d.description ? insideLines(d.description) : (first ? [] : this._inside || []);
    this._inside = list;
    const box = $('.qqv-in', prod);
    const openNow = box.classList.contains('is-open') && !first;
    box.hidden = !list.length;
    box.classList.toggle('is-open', openNow);
    $('#qqv-in-h').textContent = T.inside(/بكج|باقة|مجموعة|بكجات/.test(name) ? 'البكج' : 'الكرتون');
    $('.qqv-in-list', prod).innerHTML = list.map((t, k) => `<li${k >= 3 ? ' class="is-more"' : ''}>${IC.check}<span>${esc(latin(t))}</span></li>`).join('');
    const extra = list.length - 3;
    const more = $('.qqv-more', prod);
    more.hidden = extra <= 0;
    more.textContent = openNow ? T.less : plusN(extra);
    more.setAttribute('aria-expanded', String(openNow));
    more.setAttribute('aria-label', openNow ? T.lessLabel : T.more(extra));

    // price + saving
    const onSale = !!d.is_on_sale && num(d.regular_price) > num(d.sale_price);
    const now = onSale ? num(d.sale_price) : num(d.price || d.sale_price);
    const was = onSale ? num(d.regular_price) : 0;
    $('.qqv-price', prod).innerHTML = now
      ? `<span class="qqv-now">${money(now)}</span>${was ? `<span class="qqv-sr">${T.instead}</span><span class="qqv-was">${money(was)}</span><span class="qqv-save">${T.save} <span>${money(was - now)}</span></span>` : ''}`
      : '';

    const desc = $('.qqv-desc', prod);
    const plain = d.plain || (d.description ? textOf(d.description) : '');
    desc.textContent = plain;
    desc.hidden = !plain;

    const url = d.url || '#';
    $('.qqv-pdp', prod).href = url;

    // buy area: stock / options
    const out = d.is_out_of_stock || (d.status && d.status !== 'sale');
    const opts = !out && ((Array.isArray(d.options) && d.options.length > 0) || d.has_options === true);
    const addB = $('[data-act="add"]', prod);
    const buyB = $('[data-act="buy"]', prod);
    $('.qqv-row', prod).hidden = opts;
    $('.qqv-qty', prod).hidden = out;
    addB.disabled = !!out;
    $('.qqv-lbl', addB).textContent = out ? (salla.lang.get('pages.products.out_of_stock') || T.add) : T.add;
    buyB.hidden = !!out || opts;
    const optsLink = $('.qqv-opts', prod);
    optsLink.hidden = !opts;
    optsLink.href = url;
    if (first) {
      this.q = 1;
      $('.qqv-qty output', prod).textContent = latin(1);
      this.err('');
    } else if (this.q > this.maxQ()) {
      this.q = this.maxQ();
      $('.qqv-qty output', prod).textContent = latin(this.q);
    }

    // gallery
    const photos = (Array.isArray(d.images) ? d.images : [])
      .filter(im => im && im.url && !im.video_url && im.type !== 'video' && !im.three_d_image_url)
      .map(im => im.url);
    // `image` is a resized copy of images[0]; only fall back to it.
    if (!photos.length && d.image && d.image.url) photos.push(d.image.url);
    const seen = new Set();
    const ph = this.photos = photos.filter(u => !seen.has(u) && seen.add(u));
    if (!ph.length) ph.push(salla.url.asset(salla.config.get('theme.settings.placeholder') || 'images/placeholder.png'));
    const n = ph.length;
    const keep = first ? 0 : Math.min(this.im, n - 1);
    // Every photo is its own <img> in a scroll-snap track, the first eight
    // requested as the ticket opens (the rest lazily, as the strip or the track
    // brings them near): picking a thumbnail moves the track at once. (The old
    // stage swapped one <img>'s src, and the browser keeps painting the previous
    // picture until the new file arrives — a tap looked ignored.)
    const lz = k => (k > 7 ? ' loading="lazy"' : '');
    if (first || ph.join() !== this._gk) {
      this._gk = ph.join();
      $('.qqv-img', prod).innerHTML = `<div class="qpc-carousel" data-qpc>${ph.map((u, k) => `<div class="qpc-slide"><img src="${esc(u)}" alt="${esc(n > 1 ? `${name}، ${T.photo(latin(k + 1), latin(n))}` : name)}"${lz(k)} decoding="async" draggable="false"></div>`).join('')}</div>`;
      const ths = $('.qqv-ths', prod);
      ths.hidden = n < 2;
      ths.innerHTML = n < 2 ? '' : ph.map((u, k) => `<button type="button" data-img="${k}" aria-label="${T.imageN(latin(k + 1), latin(n))}" aria-pressed="false"><img src="${esc(u)}" alt=""${lz(k)} draggable="false"></button>`).join('');
      const track = this.track = $('.qpc-carousel', prod);
      enhanceCarousel(track); // mouse drag-to-swipe on desktop; touch swipes natively
      let r = 0;
      track.addEventListener('scroll', () => { cancelAnimationFrame(r); r = requestAnimationFrame(() => this.synced()); }, { passive: true });
    }
    this.go(keep, true);
  },

  /** Show photo k: the track glides there; the thumbnail is marked at once. */
  go(k, instant) {
    const t = this.track;
    const s = t && t.children[k];
    if (!s) return;
    this.mark(k);
    this._to = k;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { this._to = null; this.synced(); }, 900);
    // An absolute target, never scrollBy: a relative scroll counts as a
    // "directional" one, and the track's scroll-snap-stop: always then lets it
    // pass a single photo — tap photo 5 from photo 1 and it stopped on 2 (one
    // photo per tap). scrollLeft + a physical delta holds for every RTL
    // scrollLeft convention.
    t.scrollTo({ left: t.scrollLeft + s.getBoundingClientRect().left - t.getBoundingClientRect().left, behavior: instant || RM.matches ? 'auto' : 'smooth' });
  },

  /** After a swipe / drag / glide: mark the photo that sits in the track. */
  synced() {
    const t = this.track;
    if (!t || !this.open) return;
    const x = t.getBoundingClientRect().left;
    let k = 0;
    let d = 1e9;
    Array.from(t.children).forEach((s, j) => { const e = Math.abs(s.getBoundingClientRect().left - x); if (e < d) { d = e; k = j; } });
    if (this._to != null) { if (k !== this._to) return; this._to = null; }
    this.mark(k);
  },

  mark(k) {
    this.im = k;
    const ths = $('.qqv-ths', this.prod);
    $$('button', ths).forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    // 8+ thumbnails overflow a phone: keep the current one in view (instant —
    // a second smooth scroll could cut the track's glide short)
    const b = ths.children[k];
    if (!b || ths.scrollWidth <= ths.clientWidth) return;
    const r = b.getBoundingClientRect();
    const w = ths.getBoundingClientRect();
    const dx = r.left < w.left ? r.left - w.left - 8 : r.right > w.right ? r.right - w.right + 8 : 0;
    if (dx) ths.scrollBy(dx, 0);
  },

  err(msg, order = false) {
    const el = $(order ? '.qqv-order-err' : '.qqv-prod .qqv-err', this.wrap);
    el.textContent = msg || '';
    el.hidden = !msg;
  },

  /* ---- steps ---- */

  step(order, focus = true) {
    const h0 = this.tk.offsetHeight;
    this.tk.classList.toggle('is-ordered', order);
    this.prod.inert = order;
    this.order.inert = !order;
    const [s1, s2] = $$('.qqv-steps li[data-st]', this.wrap);
    s1.classList.toggle('is-on', !order);
    s1.classList.toggle('is-done', order);
    s2.classList.toggle('is-on', order);
    s1.toggleAttribute('aria-current', !order);
    s2.toggleAttribute('aria-current', order);
    (order ? s2 : s1).setAttribute('aria-current', 'step');
    this.scroller.scrollTop = 0;
    if (this.open) this.place();
    const h1 = this.tk.offsetHeight;
    if (!RM.matches && this.open && h0 && h0 !== h1) this.tk.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 440, easing: E_IN });
    if (focus) $(order ? '#qqv-order-h' : '#qqv-title').focus({ preventScroll: true });
  },

  renderOrder(cart) {
    this.cart = cart;
    const items = (cart.items || []).slice();
    const cur = this.data && String(this.data.id);
    items.sort((a, b) => (String(b.product_id) === cur) - (String(a.product_id) === cur));
    const count = num(cart.count) || items.reduce((s, i) => s + num(i.quantity), 0);
    $('.qqv-order-sub', this.order).textContent = latin(T.inOrder(count));
    $('.qqv-lines', this.order).innerHTML = items.map(item => {
      const name = esc(item.product_name || item.name || '');
      const qty = num(item.quantity) || 1;
      return `<li><img src="${esc(item.product_image || '')}" alt="" width="52" height="52" loading="lazy"><div><b>${name}</b><small>${latin(qty)} × <span class="qqv-u">${money(item.price)}</span></small></div><div class="qqv-qty" role="group" aria-label="${esc(T.cardQty(item.product_name || ''))}"><button type="button" data-lq="${esc(item.id)}" data-d="1" aria-label="${esc(T.incLine(item.product_name || ''))}">${IC.plus}</button><output>${latin(qty)}</output><button type="button" data-lq="${esc(item.id)}" data-d="-1" aria-label="${esc(qty > 1 ? T.decLine(item.product_name || '') : T.removeLine(item.product_name || ''))}">${qty > 1 ? IC.minus : IC.x}</button></div></li>`;
    }).join('');
    const t = totals(cart);
    $('.qqv-sum', this.order).innerHTML = `
      <div><dt>${T.subtotal}</dt><dd>${money(t.regular)}</dd></div>
      ${t.discount > 0.009 ? `<div class="is-neg"><dt>${T.discount}</dt><dd>&minus; ${money(t.discount)}</dd></div>` : ''}
      <div class="is-ship"><dt>${T.shipping}</dt><dd>${T.shipLater}</dd></div><div class="is-tot"><dt>${T.total}</dt><dd><span class="qqv-now">${money(t.total)}</span></dd></div>`;
  },

  lineQty(itemId, d, btn) {
    const cart = this.cart;
    const item = cart && (cart.items || []).find(i => String(i.id) === String(itemId));
    if (!item || this.busy) return;
    const next = num(item.quantity) + d;
    const max = num(item.max_quantity);
    if (max > 0 && next > max) return;
    this.busy = true;
    $$('.qqv-lines button', this.order).forEach(b => { b.disabled = true; });
    this.err('', true);
    const req = next <= 0
      ? quiet(() => salla.cart.deleteItem(String(itemId)))
      : quiet(() => salla.cart.updateItem({ id: String(itemId), quantity: next }));
    req.then(res => {
      this.busy = false;
      const c = res && res.data && res.data.cart;
      if (!c) return;
      Cart.apply(c);
      if (!(c.items || []).length) { this.step(false); return; }
      this.renderOrder(c);
      const again = $(`[data-lq="${CSS.escape(String(itemId))}"][data-d="${d}"]`, this.order);
      (again || $('#qqv-order-h')).focus({ preventScroll: true });
      if (btn) announce(next > 0 ? T.qtySr(item.product_name || '', latin(next)) : T.removedSr(item.product_name || ''));
    }).catch(error => {
      this.busy = false;
      $$('.qqv-lines button', this.order).forEach(b => { b.disabled = false; });
      this.err(errorText(error), true);
    });
  },

  /** Keeps «طلبك» honest when the cart changes elsewhere (drawer, card steppers). */
  syncFromCart() {
    if (!this.open || !this.tk.classList.contains('is-ordered') || this.busy || !Cart.cart) return;
    if (!(Cart.cart.items || []).length) { this.step(false, false); return; }
    this.renderOrder(Cart.cart);
  },

  /* ---- add / buy / checkout ---- */

  add(buy) {
    if (!this.open || this.busy || !this.data) return;
    const addB = $('[data-act="add"]', this.prod);
    const buyB = $('[data-act="buy"]', this.prod);
    const btn = buy ? buyB : addB;
    this.busy = true;
    this.err('');
    addB.disabled = true;
    buyB.disabled = true;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    const id = String(this.data.id);
    quiet(() => salla.cart.addItem({ id, quantity: this.q }))
      .then(res => {
        const cart = res && res.data && res.data.cart;
        return cart && Array.isArray(cart.items) ? cart : salla.cart.api.details(null, []).then(r => r.data.cart);
      })
      .then(cart => {
        this.busy = false;
        btn.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
        addB.disabled = false;
        buyB.disabled = false;
        if (!this.open) return;
        Cart.apply(cart);
        this.renderOrder(cart);
        this.step(true);
        if (buy) this.checkout($('[data-act="checkout"]', this.order));
        else announce(T.addedSr(this.data.name || '', latin(num(cart.count))));
      })
      .catch(error => {
        this.busy = false;
        btn.classList.remove('is-busy');
        btn.removeAttribute('aria-busy');
        addB.disabled = false;
        buyB.disabled = false;
        if (needsOptions(error) && this.data.url) { window.location.href = this.data.url; return; }
        this.err(errorText(error));
      });
  },

  checkout(btn) {
    if (!btn || btn.classList.contains('is-going')) return;
    btn.classList.add('is-going');
    btn.setAttribute('aria-busy', 'true');
    const lbl = $('.qqv-lbl', btn);
    lbl.innerHTML = `<span class="qqv-spin is-on"></span>${T.going}`;
    announce(T.goingSr);
    this.err('', true);
    const done = () => {
      btn.classList.remove('is-going');
      btn.removeAttribute('aria-busy');
      lbl.textContent = T.checkout;
    };
    const guest = salla.config.isGuest && salla.config.isGuest();
    Promise.resolve()
      .then(() => salla.cart.submit())
      // A guest gets Salla's login modal (z-index 200, above the ticket);
      // a signed-in customer is on the way to checkout.
      .then(() => { setTimeout(done, guest ? 600 : 8000); })
      .catch(error => { done(); this.err(errorText(error), true); });
  },

  /* ---- open / place / close ---- */

  toggle(card, trig) {
    if (this.open && this.card === card) { this.close(); return; }
    this.show(card, trig);
  },

  show(card, trig) {
    this.build();
    if (this.closing) { this.closing.cancel(); this.closing = null; this.finishClose(); }
    const again = this.open;
    if (!again) this.back = trig || $('.qqv-trig', card);
    if (this.card && this.card !== card) this.unlight(this.card);
    this.card = card;
    card.classList.add('qqv-lit');
    const t = $('.qqv-trig', card);
    if (t) t.setAttribute('aria-expanded', 'true');

    const id = card.dataset.qqvId;
    const cached = details.get(id);
    this.fill(Object.assign(cardData(card), this._last && this._last.id === id ? this._last : {}), true);
    this.step(false, false);
    if (!this.open && !PHONE.matches) ensureVisible(card);

    this.open = true;
    document.documentElement.classList.add('qqv-open');
    lockScroll(true);
    this.wrap.hidden = false;
    this.veil.hidden = false;
    this.wrap.getAnimations().forEach(a => a.cancel());
    this.place();
    this.loop();

    if (RM.matches) this.wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    else if (again) this.wrap.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: E_IN });
    else {
      // Drop the clip once it has spread: details arriving later can make the
      // ticket taller than the circle it was drawn with.
      const ink = this.ink(true);
      ink.finished.then(() => { if (this.open && !this.closing) ink.cancel(); }).catch(() => {});
      this.prod.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: 140, easing: E_IN, fill: 'backwards' });
      this.veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    }
    $('#qqv-title').focus({ preventScroll: true });

    (cached || getDetails(id)).then(d => {
      if (!d || this.card !== card || !this.open) return;
      this._last = Object.assign({}, d, { id: String(d.id), plain: '' });
      this.fill(Object.assign(cardData(card), this._last), false);
      this.place();
    }).catch(() => { /* card data stays; the PDP link is there */ });
  },

  place() {
    const card = this.card;
    const wrap = this.wrap;
    const tk = this.tk;
    if (!card) return;
    tk.style.maxHeight = '';
    const c = card.getBoundingClientRect();
    const trig = $('.qqv-trig', card);
    const t = (trig || card).getBoundingClientRect();
    const hdrEl = $('.qheader');
    const hdr = hdrEl ? Math.max(0, hdrEl.getBoundingClientRect().bottom) : 0;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const W = tk.offsetWidth;
    const H = tk.offsetHeight;
    let x;
    let y;
    let side;
    if (PHONE.matches) {
      side = 'none';
      x = 10;
      y = Math.max(10, Math.min(c.top, vh - H - 10));
    } else {
      side = 'left';
      x = c.left - 18 - W;
      if (x < 16) { side = 'right'; x = c.right + 18; }
      if (x + W > vw - 16) { side = 'none'; x = Math.max(16, (vw - W) / 2); }
      y = Math.max(hdr + 8, Math.min(c.top, vh - H - 16));
      y = Math.max(12, Math.min(y, vh - 160));
      wrap.style.setProperty('--qqv-ny', `${Math.max(34, Math.min(H - 34, t.top + t.height / 2 - y))}px`);
    }
    wrap.dataset.side = side;
    wrap.style.left = `${x}px`;
    wrap.style.top = `${y}px`;
    tk.style.maxHeight = `${vh - y - (PHONE.matches ? 10 : 14)}px`;
    this.origin = { x: t.left + t.width / 2 - x, y: t.top + t.height / 2 - y };
    this.hole();
  },

  /** The veil leaves the card lit: a rounded hole cut where the card sits. */
  hole() {
    const card = this.card;
    if (!card || PHONE.matches) { this.veil.style.clipPath = ''; return; }
    const r = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 3;
    const x = r.left - pad;
    const y = r.top - pad;
    const w = r.width + pad * 2;
    const h = r.height + pad * 2;
    const rad = Math.min(parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0, w / 2, h / 2) + pad;
    const key = [x, y, w, h, vw, vh].map(Math.round).join(',');
    if (key === this._hole) return;
    this._hole = key;
    const f = n => Math.round(n * 10) / 10;
    const p = `M0 0H${vw}V${vh}H0Z M${f(x + rad)} ${f(y)}H${f(x + w - rad)}A${f(rad)} ${f(rad)} 0 0 1 ${f(x + w)} ${f(y + rad)}V${f(y + h - rad)}A${f(rad)} ${f(rad)} 0 0 1 ${f(x + w - rad)} ${f(y + h)}H${f(x + rad)}A${f(rad)} ${f(rad)} 0 0 1 ${f(x)} ${f(y + h - rad)}V${f(y + rad)}A${f(rad)} ${f(rad)} 0 0 1 ${f(x + rad)} ${f(y)}Z`;
    this.veil.style.clipPath = `path(evenodd, "${p}")`;
  },

  /** Sliders can move the card while the ticket is open — keep the hole on it. */
  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.open) return;
      this.hole();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  ink(outward) {
    const W = this.tk.offsetWidth;
    const H = this.tk.offsetHeight;
    const o = this.origin || { x: W / 2, y: 0 };
    const R = Math.ceil(Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([a, b]) => Math.hypot(a - o.x, b - o.y)))) + 30;
    const from = `circle(0px at ${o.x}px ${o.y}px)`;
    const to = `circle(${R}px at ${o.x}px ${o.y}px)`;
    return this.wrap.animate([{ clipPath: outward ? from : to }, { clipPath: outward ? to : from }], {
      duration: outward ? 620 : 320,
      easing: outward ? E_IN : 'cubic-bezier(.5,0,.75,0)',
      fill: 'forwards',
    });
  },

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    lockScroll(false);
    const back = this.back;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    if (RM.matches) { this.finishClose(); return; }
    this.closing = this.ink(false);
    this.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    this.closing.finished.then(() => this.finishClose()).catch(() => {});
  },

  finishClose() {
    this.closing = null;
    if (this.open) return;
    this.wrap.hidden = true;
    this.veil.hidden = true;
    this.veil.style.clipPath = '';
    this._hole = '';
    this.wrap.getAnimations().forEach(a => a.cancel());
    this.veil.getAnimations().forEach(a => a.cancel());
    this.tk.classList.remove('is-ordered');
    this.prod.inert = false;
    this.order.inert = true;
    document.documentElement.classList.remove('qqv-open');
    if (this.card) this.unlight(this.card);
    this.card = null;
    const going = $('.is-going', this.order);
    if (going) { going.classList.remove('is-going'); going.removeAttribute('aria-busy'); $('.qqv-lbl', going).textContent = T.checkout; }
  },

  unlight(card) {
    card.classList.remove('qqv-lit');
    const t = $('.qqv-trig', card);
    if (t) t.setAttribute('aria-expanded', 'false');
  },
};

function totals(cart) {
  const items = cart.items || [];
  const regular = items.reduce((sum, item) => {
    const qty = num(item.quantity) || 1;
    const unit = Math.max(num(item.product_price), num(item.original_price), num(item.price));
    return sum + (unit > 0 ? unit * qty : num(item.total));
  }, 0);
  const sub = num(cart.sub_total);
  const productDisc = regular > sub + 0.01 ? regular - sub : 0;
  const discount = Math.round((productDisc + num(cart.total_discount)) * 100) / 100;
  return { regular: Math.round(regular * 100) / 100, discount, total: num(cart.total) || sub };
}

/** «+5» reads left-to-right inside the RTL line (isolated, not mirrored to «5+»). */
const plusN = n => `\u2066+${latin(n)}\u2069`;

/* Page scroll is held while the ticket is open without touching overflow:
   overflow:hidden on <html> turns <body> (overflow-x:hidden) into the scroll
   container and the sticky header scrolls away under the veil. Wheel and
   touch are stopped instead, except inside the ticket's own scroller. */
function scrollsInside(e) {
  const t = e.target && e.target.closest ? e.target : null;
  const sc = t && t.closest('.qqv-scroll');
  return !!(t && t.closest('.qqv-gal')) || !!(sc && sc.scrollHeight > sc.clientHeight + 1);
}
function blockScroll(e) { if (!scrollsInside(e)) e.preventDefault(); }
function blockKeys(e) {
  if (!['PageUp', 'PageDown', 'Home', 'End', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const t = e.target;
  if (t && t.closest && (t.closest('.qqv-wrap') || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return;
  e.preventDefault();
}
function lockScroll(on) {
  const m = on ? 'addEventListener' : 'removeEventListener';
  document[m]('wheel', blockScroll, { passive: false });
  document[m]('touchmove', blockScroll, { passive: false });
  document[m]('keydown', blockKeys);
}

function ensureVisible(card) {
  const r = card.getBoundingClientRect();
  const hdrEl = $('.qheader');
  const hdr = hdrEl ? Math.max(0, hdrEl.getBoundingClientRect().bottom) : 0;
  if (r.top < hdr + 8 || r.bottom > window.innerHeight - 8) {
    window.scrollBy({ top: r.top - hdr - 16, behavior: 'auto' });
  }
}

function trapTab(root, e) {
  if (e.key !== 'Tab') return;
  const f = $$('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])', root)
    .filter(x => x.getClientRects().length && !x.closest('[inert],[hidden]') && getComputedStyle(x).visibility !== 'hidden');
  if (!f.length) return;
  const a = f[0];
  const z = f[f.length - 1];
  if (e.shiftKey && (document.activeElement === a || !root.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}

/* ================================================================== boot */

function onClickCapture(e) {
  if (!sdkReady()) return;
  const slot = e.target.closest('.qqv-slot[data-step]');
  if (slot) {
    const card = slot.closest('.qqv-card');
    const add = addBtn(slot);
    if (card && add && add.contains(e.target)) {
      // The theme's own handler (inline onclick / salla-add-product-button)
      // never sees this click: the card flow owns the add from here.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      Cards.add(card);
      return;
    }
    const d = e.target.closest('[data-qqv-d]');
    if (card && d) {
      e.preventDefault();
      Cards.step(card, +d.dataset.qqvD);
      return;
    }
  }
  const trig = e.target.closest('.qqv-trig');
  if (trig) {
    const card = trig.closest('.qqv-card');
    if (!card || !qvOnFor(card)) return;
    e.preventDefault();
    Ticket.toggle(card, trig);
  }
}

function onIntent(e) {
  const trig = e.target && e.target.closest && e.target.closest('.qqv-trig');
  if (!trig || !sdkReady()) return;
  const card = trig.closest('.qqv-card');
  const id = card && card.dataset.qqvId;
  if (id && !details.has(id)) getDetails(id).catch(() => {});
}

/* Eye colour — theme setting `quick_view_button_color` (master.twig, a #rrggbb
   from the colour picker). Unset, invalid or the default navy: nothing is set
   and the CSS defaults draw today's eye. A colour dark enough for 3:1 on white
   (relative luminance ≤ .3) draws the eye's edge and icon, and on hover/open
   fills the button under a white icon; a lighter one becomes the button's
   background under a navy icon (> 4.7:1). Tailwind scans this file: keep
   utility names out of these comments. */
function tint() {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(window.quick_view_button_color || '').trim());
  if (!m || /^2e3793$/i.test(m[1])) return;
  const c = `#${m[1]}`;
  const lum = [0, 2, 4].reduce((s, i, j) => {
    const v = parseInt(m[1].substr(i, 2), 16) / 255;
    return s + [0.2126, 0.7152, 0.0722][j] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  }, 0);
  const st = document.body.style;
  if (lum <= 0.3) { st.setProperty('--qqv-tc', c); st.setProperty('--qqv-th', c); }
  else { st.setProperty('--qqv-tb', c); st.setProperty('--qqv-tc', '#172951'); }
}

let booted = false;
function boot() {
  if (booted) return;
  booted = true;
  tint();
  Cards.scan();
  Cart.bind();
  document.addEventListener('click', onClickCapture, true);
  if (qvGlobalOn()) {
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
  }
  // Server-rendered grids that arrive later (filters, lazy sections).
  const main = document.getElementById('main-content') || document.body;
  if ('MutationObserver' in window) {
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => Cards.scan(), 120); })
      .observe(main, { childList: true, subtree: true });
  }
}

export function bootQuickView() {
  if (window.app && window.app.status === 'ready') boot();
  else document.addEventListener('theme::ready', boot, { once: true });
}

/** product-card.js calls this after every render of a JS card. */
export function enhanceJsCard(card) {
  if (!booted) return; // boot() → Cards.scan() does not reach JS cards; render after ready will.
  Cards.enhanceJs(card);
}

export { insideLines };
