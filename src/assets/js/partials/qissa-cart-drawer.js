/**
 * Qussah cart drawer — Figma "Qusah Re-Vamp" 339:3416: empty (339:3553),
 * free shipping to go (341:463), free shipping reached (339:3489).
 *
 * Replaces the trip to /cart with a panel that slides in over the page from the
 * LEFT edge (a physical side, whichever direction the store reads). The
 * header's cart button opens it; everything inside is rendered from
 * `salla.cart.api.details()` and re-fetched on the SDK's own cart events.
 *
 * Layout, top to bottom:
 *   head      title, item count, the grey close square.
 *   shipping  grey strip: truck + «باقي X على الشحن المجاني» over a navy bar,
 *             or the green «مبروك…» line over a full green bar.
 *             `free_shipping_bar` comes from Salla, so the threshold is the
 *             merchant's dashboard figure, never a theme constant. No strip on
 *             an empty cart or a store without a threshold.
 *   items     name, a grey second line (the product's subtitle when Salla
 *             sends one, else the chosen options), price · − n + stepper, and
 *             the photo on the right. No delete button: − at 1 removes the
 *             line (the user's call, 1 Oct 2026). No «تفريغ السلة», no coupon
 *             link — the design has neither.
 *   foot      المجموع الفرعي · الخصم (N%) when there is one · الشحن (مجاني /
 *             يحسب عند الدفع) · dashed rule · الإجمالي · «إتمام الشراء».
 *   empty     server-rendered into a <template> in layouts/master.twig (copy,
 *             illustration, «تصفح المنتجات») and cloned here.
 *
 * The figures follow the store's live custom code for the cart page so the
 * drawer and the page never disagree: the subtotal is the sum of each line's
 * regular unit price (max of product_price / original_price / price) ×
 * quantity; the discount is that minus `sub_total`, plus `total_discount` (the
 * coupon); the total is `total`.
 *
 * The stepper sends the line through `salla.cart.updateItem(FormData)` — the
 * same form the SDK's quantity input used: the id, the chosen options as hidden
 * fields (updateItem validates the whole line and refuses a product with a
 * required option without them) and the new quantity.
 *
 * ⚠ CART ITEM IDS ARE STRINGS. Salla's are ~19 digits, past JavaScript's safe
 * integer range, so `Number()` rounds them to a DIFFERENT id and the server
 * answers 422. Read them from `dataset` and pass them through untouched.
 *
 * No `salla.*` at module scope: Cloudflare Rocket Loader runs the SDK after
 * the theme's `data-cfasync="false"` scripts on the live domain. The cart
 * events are therefore subscribed on `theme::ready` (dispatched by app.js from
 * inside `salla.onReady`) and again, idempotently, when the drawer opens.
 */

class QissaCartDrawer {
  constructor(root) {
    this.root = root;
    this.panel = root.querySelector('.qcd__panel');
    this.emptyTpl = root.querySelector('[data-qcd-empty]');
    this.cart = null;
    this.isOpen = false;
    this.eventsBound = false;

    let strings = {};
    try { strings = JSON.parse(root.querySelector('[data-qcd-i18n]')?.textContent || '{}'); } catch (e) { /* defaults below */ }
    this.s = Object.assign({
      title: 'سلة المشتريات',
      count: '{count} منتج في السلة',
      remaining: 'باقي {amount} على الشحن المجاني',
      free_done: 'مبروك لقد حصلت على شحن مجاني لطلبك',
      subtotal: 'المجموع الفرعي',
      discount: 'الخصم',
      shipping: 'الشحن',
      shipping_free: 'مجاني',
      shipping_later: 'يحسب عند الدفع',
      total: 'الإجمالي',
      checkout: 'إتمام الشراء',
      inc: 'زيادة الكمية',
      dec: 'إنقاص الكمية',
      remove: 'حذف المنتج',
      close: 'إغلاق السلة',
      out: 'غير متوفر',
      qty_failed: 'تعذّر تحديث الكمية',
    }, strings);
    this.icons = Object.assign({ close: '', minus: '', plus: '', truck: '' }, strings.icons || {});

    this.bindTriggers();
    this.bindCartEvents();
    document.addEventListener('theme::ready', () => this.bindCartEvents());
  }

  /* ---------------------------------------------------------------- opening */

  bindTriggers() {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-qcd-open], salla-cart-summary');
      if (trigger) {
        event.preventDefault();
        this.open();
        return;
      }
      if (event.target.closest('[data-qcd-close]')) {
        event.preventDefault();
        this.close();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.isOpen) { this.close(); }
    });
  }

  /** Idempotent: the constructor, `theme::ready` and open() all call it. */
  bindCartEvents() {
    if (this.eventsBound || typeof salla === 'undefined' || !salla.cart?.event) { return; }
    this.eventsBound = true;

    // Adds, deletes and quantity changes alike (the SDK's `itemUpdated` calls
    // `updated` first). The summary it hands over has totals but not lines, so
    // it only triggers a full re-fetch.
    salla.cart.event.onUpdated(() => {
      if (this.isOpen) { this.fetch(); }
    });

    // A refused quantity change: say why, then re-read what the server holds.
    salla.cart.event.onItemUpdatedFailed?.(error => {
      salla.logger?.error('qissa-cart-drawer:: item update refused', error);
      const reason = error?.response?.data?.error?.message
        || error?.response?.error?.message
        || error?.message
        || (typeof error === 'string' ? error : '');
      salla.notify?.error(reason || this.s.qty_failed);
      if (this.isOpen) { this.fetch(); }
    });

    salla.cart.event.onSuccessReset?.(() => {
      if (this.isOpen) { this.cart = null; this.fetch(); }
    });
  }

  open() {
    this.bindCartEvents();
    this.isOpen = true;
    this.root.hidden = false;
    document.body.classList.add('qcd-open');
    this.render();
    this.fetch();
  }

  close() {
    this.isOpen = false;
    this.root.hidden = true;
    document.body.classList.remove('qcd-open');
  }

  /** `cart.api.details`, not `latest`: only `details` carries the lines. */
  fetch() {
    if (typeof salla === 'undefined' || !salla.cart?.api?.details) { return; }
    salla.cart.api.details(null, ['options'])
      .then(response => {
        const cart = response?.data?.cart;
        if (cart) { this.cart = cart; this.render(); } else { this.settleEmpty(); }
      })
      .catch(() => this.settleEmpty());
  }

  /** No answer and nothing in the cart (a visitor has no cart until the first add): the empty state, not the skeleton. */
  settleEmpty() {
    if (this.cart === null && !QissaCartDrawer.num(salla.storage?.get('cart.summary.count'))) { this.cart = {}; }
    this.render();
  }

  /* --------------------------------------------------------------- figures */

  static num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  /** Regular (pre-discount) line price: the store's custom-code rule. */
  static regularLine(item) {
    const qty = QissaCartDrawer.num(item.quantity) || 1;
    const unit = Math.max(
      QissaCartDrawer.num(item.product_price),
      QissaCartDrawer.num(item.original_price),
      QissaCartDrawer.num(item.price)
    );
    const current = QissaCartDrawer.num(item.total);
    return unit > 0 ? unit * qty : current;
  }

  totals(cart, items) {
    const regular = items.reduce((sum, item) => sum + QissaCartDrawer.regularLine(item), 0);
    const subTotal = QissaCartDrawer.num(cart.sub_total);
    const productDisc = regular > subTotal + 0.01 ? regular - subTotal : 0;
    const couponDisc = QissaCartDrawer.num(cart.total_discount);
    const discount = productDisc + couponDisc;
    const percent = regular > 0 ? Math.round((discount / regular) * 100) : 0;
    return { regular, discount, percent, total: QissaCartDrawer.num(cart.total) || subTotal };
  }

  /* --------------------------------------------------------------- rendering */

  render() {
    if (!this.panel) { return; }
    const cart = this.cart || {};
    const items = Array.isArray(cart.items) ? cart.items : [];
    const pending = this.cart === null;
    const empty = !pending && !items.length;

    this.panel.classList.toggle('is-empty', empty);
    this.panel.innerHTML = `
      ${this.renderHead(cart, items, pending)}
      ${items.length ? this.renderShipping(cart) : ''}
      ${pending ? this.renderLoading() : (items.length ? this.renderItems(items) : '')}
      ${empty ? '<div class="qcd__empty-slot" data-qcd-empty-slot></div>' : ''}
      ${items.length ? this.renderFoot(cart, items) : ''}
    `;

    if (empty && this.emptyTpl) {
      this.panel.querySelector('[data-qcd-empty-slot]')?.appendChild(this.emptyTpl.content.cloneNode(true));
    }
    this.bindPanel();
  }

  /** RTL: the titles on the right, the close square on the left. */
  renderHead(cart, items, pending) {
    const count = QissaCartDrawer.num(cart.count) || items.reduce((n, i) => n + (QissaCartDrawer.num(i.quantity) || 1), 0);
    const sub = pending ? '' : this.s.count.replace('{count}', this.number(count));

    return `
      <header class="qcd__head">
        <div class="qcd__titles">
          <h2 class="qcd__title">${this.s.title}</h2>
          <p class="qcd__count">${sub}</p>
        </div>
        <button type="button" class="qcd__close" data-qcd-close aria-label="${QissaCartDrawer.attr(this.s.close)}">${this.icon('close', 'qcd__close-i')}</button>
      </header>`;
  }

  /** Absent when the merchant has no free-shipping threshold. */
  renderShipping(cart) {
    const bar = cart.free_shipping_bar;
    if (!bar || !bar.minimum_amount) { return ''; }

    const done = !!bar.has_free_shipping;
    const percent = done ? 100 : Math.max(0, Math.min(100, QissaCartDrawer.num(bar.percent)));
    const text = done
      ? `<span class="qcd__ship-done">${this.s.free_done}</span>`
      : `${this.icon('truck', 'qcd__ship-i')}<span>${this.s.remaining.replace('{amount}', `<b class="qcd__ship-amount">${this.money(bar.remaining)}</b>`)}</span>`;

    return `
      <div class="qcd__ship${done ? ' is-done' : ''}">
        <p class="qcd__ship-text">${text}</p>
        <div class="qcd__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">
          <span class="qcd__fill" style="width:${percent}%"></span>
        </div>
      </div>`;
  }

  renderItems(items) {
    return `<div class="qcd__body">${items.map(item => this.renderItem(item)).join('')}</div>`;
  }

  /** RTL row: the details (right of the photo in the design's mirror), then the photo. */
  renderItem(item) {
    const name = QissaCartDrawer.esc(item.product_name || item.name);
    const image = item.product_image || item.image?.url || '';
    const url = item.url || '#';
    const qty = QissaCartDrawer.num(item.quantity) || 1;
    const max = QissaCartDrawer.max(item);
    const note = QissaCartDrawer.note(item);
    const out = item.is_available === false;
    // the regular line price, struck beside the price, when the line is discounted
    const regular = QissaCartDrawer.regularLine(item);
    const was = !out && regular > QissaCartDrawer.num(item.total) + 0.01 ? `<s class="qcd__was">${this.money(regular)}</s>` : '';

    return `
      <div class="qcd__item" data-item-id="${item.id}" data-qty="${qty}"${max ? ` data-max="${max}"` : ''}>
        <a class="qcd__thumb" href="${QissaCartDrawer.attr(url)}" tabindex="-1" aria-hidden="true">
          ${image ? `<img src="${QissaCartDrawer.attr(image)}" alt="" width="133" height="119" loading="lazy" />` : ''}
        </a>
        <div class="qcd__main">
          <div class="qcd__names">
            <a class="qcd__name" href="${QissaCartDrawer.attr(url)}">${name}</a>
            ${note ? `<p class="qcd__note">${QissaCartDrawer.esc(note)}</p>` : ''}
          </div>
          <div class="qcd__line">
            <span class="qcd__prices"><span class="qcd__price">${out ? this.s.out : this.money(item.total)}</span>${was}</span>
            <form class="qcd__form" id="qcd-item-${item.id}" onsubmit="return false">
              <input type="hidden" name="id" value="${item.id}" />
              ${QissaCartDrawer.optionFields(item)}
              <input type="hidden" name="quantity" value="${qty}" />
              <div class="qcd__qty" role="group" aria-label="${QissaCartDrawer.attr(name)}">
                <button type="button" class="qcd__step" data-qcd-step="1" aria-label="${QissaCartDrawer.attr(this.s.inc)}"${max && qty >= max ? ' disabled' : ''}>${this.icon('plus')}</button>
                <output class="qcd__n" aria-live="polite">${this.number(qty)}</output>
                <button type="button" class="qcd__step" data-qcd-step="-1" aria-label="${QissaCartDrawer.attr(qty > 1 ? this.s.dec : this.s.remove)}">${this.icon('minus')}</button>
              </div>
            </form>
          </div>
        </div>
      </div>`;
  }

  renderLoading() {
    return `
      <div class="qcd__body">
        ${[1, 2].map(() => `
          <div class="qcd__item is-loading">
            <span class="qcd__thumb"></span>
            <div class="qcd__main"><span class="qcd__skel qcd__skel--title"></span><span class="qcd__skel qcd__skel--row"></span></div>
          </div>`).join('')}
      </div>`;
  }

  renderFoot(cart, items) {
    const t = this.totals(cart, items);
    const free = !!cart.free_shipping_bar?.has_free_shipping;

    return `
      <footer class="qcd__foot">
        <div class="qcd__row"><span>${this.s.subtotal}</span><span class="qcd__val">${this.money(t.regular)}</span></div>
        ${t.discount > 0.009 ? `<div class="qcd__row"><span>${this.s.discount} <em class="qcd__pct" dir="ltr">(${this.number(t.percent)}%)</em></span><span class="qcd__val">${this.money(t.discount)}</span></div>` : ''}
        <div class="qcd__row"><span>${this.s.shipping}</span>${free ? `<span class="qcd__free">${this.s.shipping_free}</span>` : `<span class="qcd__later">${this.s.shipping_later}</span>`}</div>
        <div class="qcd__row qcd__row--total"><span>${this.s.total}</span><b class="qcd__total">${this.money(t.total)}</b></div>
        <button type="button" class="qcd__btn" data-qcd-checkout>${this.s.checkout}</button>
      </footer>`;
  }

  /* ------------------------------------------------------------ interactions */

  bindPanel() {
    this.panel.querySelectorAll('[data-qcd-step]').forEach(button => {
      button.addEventListener('click', () => this.step(button, Number(button.dataset.qcdStep)));
    });

    // `submit()` takes a guest through login, which a plain /checkout link would not.
    this.panel.querySelector('[data-qcd-checkout]')?.addEventListener('click', () => salla.cart.submit());
  }

  /** + / −. At 1, − removes the line. The cart events re-render the panel. */
  step(button, delta) {
    const row = button.closest('.qcd__item');
    const id = row?.dataset.itemId; // a STRING, never Number()
    if (!id || row.classList.contains('is-busy')) { return; }
    const next = QissaCartDrawer.num(row.dataset.qty) + delta;
    const max = QissaCartDrawer.num(row.dataset.max);
    if (max && next > max) { return; }

    row.classList.add('is-busy');
    row.querySelectorAll('[data-qcd-step]').forEach(b => { b.disabled = true; });
    const settle = () => this.fetch();

    if (next < 1) {
      salla.cart.deleteItem(id)
        .then(settle)
        .catch(error => { salla.logger?.error('qissa-cart-drawer:: deleteItem failed', error); settle(); });
      return;
    }

    const form = row.querySelector('.qcd__form');
    form.elements.quantity.value = String(next);
    row.querySelector('.qcd__n').textContent = this.number(next);
    salla.cart.updateItem(new FormData(form))
      .catch(() => { /* onItemUpdatedFailed says why and re-fetches */ });
  }

  /* ----------------------------------------------------------------- helpers */

  icon(name, cls = 'qcd__i') {
    const src = this.icons[name];
    return src ? `<img class="${cls}" src="${QissaCartDrawer.attr(src)}" alt="" aria-hidden="true" />` : '';
  }

  /** The SDK formats with Arabic-Indic digits on an Arabic store; the cart
   *  page's server-side `|money` prints Latin ones (the theme's WesternDigits
   *  face renders them). The drawer matches the page. */
  static latin(text) {
    return String(text).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));
  }

  money(value) {
    const amount = QissaCartDrawer.num(value);
    return QissaCartDrawer.latin((typeof salla !== 'undefined' && salla.money) ? salla.money(amount) : amount);
  }

  number(value) {
    return QissaCartDrawer.latin((typeof salla !== 'undefined' && salla.helpers?.number) ? salla.helpers.number(value) : value);
  }

  static esc(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  static attr(value) { return QissaCartDrawer.esc(value).replace(/"/g, '&quot;'); }

  static max(item) {
    const max = Number(item.max_quantity ?? item.product?.max_quantity);
    return Number.isFinite(max) && max > 0 ? max : 0;
  }

  /** The grey line under the name: the product's subtitle when the cart
   *  carries one, else the chosen options («اللون: أزرق · المقاس: كبير»). */
  static note(item) {
    const sub = item.product?.subtitle || item.subtitle;
    if (sub) { return String(sub); }
    const options = Array.isArray(item.options) ? item.options : [];
    return options.map(option => {
      if (!option || option.type === 'splitter') { return ''; }
      const picked = Array.isArray(option.details) ? option.details.filter(detail => detail.is_selected) : [];
      const value = picked.length
        ? picked.map(detail => detail.name || detail.value || '').filter(Boolean).join('، ')
        : (typeof option.value === 'string' || typeof option.value === 'number' ? String(option.value) : '');
      return value ? (option.name ? `${option.name}: ${value}` : value) : '';
    }).filter(Boolean).join(' · ');
  }

  /** The chosen options as hidden fields — `options[{id}]` holding the optionDetail id. */
  static optionFields(item) {
    const options = Array.isArray(item.options) ? item.options : [];
    return options.map(option => {
      if (!option || !option.id || option.type === 'splitter') { return ''; }
      if (Array.isArray(option.details) && option.details.length) {
        const selected = option.details.filter(detail => detail.is_selected);
        if (!selected.length) { return ''; }
        const suffix = option.type === 'multiple-options' ? '[]' : '';
        return selected.map(detail => `<input type="hidden" name="options[${option.id}]${suffix}" value="${QissaCartDrawer.attr(detail.id)}" />`).join('');
      }
      if (option.value !== undefined && option.value !== null && option.value !== '') {
        return `<input type="hidden" name="options[${option.id}]" value="${QissaCartDrawer.attr(option.value)}" />`;
      }
      return '';
    }).join('');
  }
}

function initQissaCartDrawer() {
  const root = document.querySelector('[data-qcd]');
  if (root && !root.dataset.ready) {
    root.dataset.ready = '1';
    new QissaCartDrawer(root);
  }
}

if (document.readyState !== 'loading') {
  initQissaCartDrawer();
} else {
  document.addEventListener('DOMContentLoaded', initQissaCartDrawer);
}
