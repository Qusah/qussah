/**
 * Qussah cart drawer — the approved «الإجمالي أولاً» design.
 *
 * Replaces the trip to /cart with a panel that slides in over the page from the
 * LEFT edge (a physical side, whichever direction the store reads). The
 * header's cart button opens it; everything inside is rendered from
 * `salla.cart.api.details()` and re-fetched on the SDK's own cart events.
 *
 * Layout, top to bottom:
 *   head      navy hero gradient: title, item count, close, and ONE compact
 *             free-shipping line (truck, «باقي X على الشحن المجاني», a slim
 *             track). `free_shipping_bar` comes from Salla, so the threshold
 *             is the merchant's dashboard figure, never a theme constant.
 *   items     thumb in the cream image well · name + the SDK's quantity
 *             stepper · a side column with the delete button ABOVE the price
 *             (struck regular line price, current price, red «-N%» badge).
 *   rows      three plain lines, one idea each — «سعر المنتجات قبل الخصم»,
 *             «الخصم (N%)» in red, and the coupon link — shown only when there
 *             is a discount (the coupon link always).
 *   bottom    navy strip pinned at the foot: «المبلغ النهائي · N منتجات», the
 *             total, and the cyan checkout pill.
 *   empty     the cart page's own empty state, server-rendered into a
 *             <template> in layouts/master.twig (the basket SVG lives in
 *             components/partials/empty-bag.twig) and cloned here.
 *
 * The figures follow the store's live custom code for the cart page so the
 * drawer and the page never disagree: the "before discount" subtotal is the
 * sum of each line's regular unit price (max of product_price /
 * original_price / price) × quantity; the discount is that minus
 * `sub_total`, plus `total_discount` (the coupon); the final amount is `total`.
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

const ICON = {
  close: '<svg class="qcd__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  trash: '<svg class="qcd__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12h9.4l.8-12M10 11v5M14 11v5"/></svg>',
  truck: '<svg class="qcd__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5h11v8.5H3zM14 10.5h3.5l3.5 3v2.5h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  arrow: '<svg class="qcd__i" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5.5M11 6.5L5.5 12l5.5 5.5"/></svg>',
};

class QissaCartDrawer {
  constructor(root) {
    this.root = root;
    this.panel = root.querySelector('.qcd__panel');
    this.emptyTpl = root.querySelector('[data-qcd-empty]');
    this.cart = null;
    this.isOpen = false;
    this.clearing = false;
    this.eventsBound = false;

    let strings = {};
    try { strings = JSON.parse(root.querySelector('[data-qcd-i18n]')?.textContent || '{}'); } catch (e) { /* defaults below */ }
    this.s = Object.assign({
      title: 'سلة المشتريات',
      count: '{count} منتجات في السلة',
      none: 'لا منتجات بعد',
      remaining: 'باقي {amount} على الشحن المجاني',
      free_at: 'الشحن مجاني للطلبات فوق {amount}',
      free_done: 'تهانينا! حصلت على الشحن المجاني',
      before: 'سعر المنتجات قبل الخصم',
      discount: 'الخصم',
      coupon: 'عندك كوبون خصم؟ اضغط هنا',
      final: 'المبلغ النهائي',
      checkout: 'إتمام الشراء',
      clear: 'تفريغ السلة',
      remove: 'حذف المنتج',
      close: 'إغلاق السلة',
      out: 'غير متوفر',
      qty_failed: 'تعذّر تحديث الكمية',
      clear_failed: 'تعذّر تفريغ السلة',
    }, strings);

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
      if (this.isOpen && !this.clearing) { this.fetch(); }
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
        if (cart) { this.cart = cart; this.render(); }
      })
      .catch(() => this.render());
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

    this.panel.innerHTML = `
      ${this.renderHead(cart, items, pending)}
      ${pending ? this.renderLoading() : (items.length ? this.renderItems(items) : '')}
      ${!pending && !items.length ? '<div class="qcd__body qcd__body--empty" data-qcd-empty-slot></div>' : ''}
      ${items.length ? this.renderFoot(cart, items) : ''}
    `;

    if (!pending && !items.length && this.emptyTpl) {
      this.panel.querySelector('[data-qcd-empty-slot]')?.appendChild(this.emptyTpl.content.cloneNode(true));
    }
    this.bindPanel();
  }

  renderHead(cart, items, pending) {
    const count = QissaCartDrawer.num(cart.count) || items.reduce((n, i) => n + (QissaCartDrawer.num(i.quantity) || 1), 0);
    const sub = pending
      ? ''
      : (count ? this.s.count.replace('{count}', this.number(count)) : this.s.none);

    return `
      <header class="qcd__head">
        <div class="qcd__titles">
          <h2 class="qcd__title">${this.s.title}</h2>
          <p class="qcd__count">${sub}</p>
        </div>
        <button type="button" class="qcd__close" data-qcd-close aria-label="${QissaCartDrawer.attr(this.s.close)}">${ICON.close}</button>
        ${this.renderShipping(cart, items.length)}
      </header>`;
  }

  /** One compact line. Absent when the merchant has no free-shipping threshold. */
  renderShipping(cart, hasItems) {
    const bar = cart.free_shipping_bar;
    if (!bar || !bar.minimum_amount) { return ''; }

    const done = !!bar.has_free_shipping;
    const percent = done ? 100 : Math.max(0, Math.min(100, QissaCartDrawer.num(bar.percent)));
    let text;
    if (done) { text = this.s.free_done; }
    else if (!hasItems) { text = this.s.free_at.replace('{amount}', `<b>${this.money(bar.minimum_amount)}</b>`); }
    else { text = this.s.remaining.replace('{amount}', `<b>${this.money(bar.remaining)}</b>`); }

    return `
      <div class="qcd__ship${done ? ' is-done' : ''}">
        <p class="qcd__ship-text"><span class="qcd__ship-icon">${ICON.truck}</span><span>${text}</span></p>
        <div class="qcd__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">
          <span class="qcd__fill" style="width:${percent}%"></span>
        </div>
      </div>`;
  }

  renderItems(items) {
    return `
      <div class="qcd__body">
        ${items.map(item => this.renderItem(item)).join('')}
        <button type="button" class="qcd__clear" data-qcd-clear>${this.s.clear}</button>
      </div>`;
  }

  /**
   * The stepper is `salla-quantity-input` inside a form — the cart page's own
   * wiring — so the SDK sends the change and clamps to stock. The chosen
   * options are re-emitted as hidden fields: `cart.updateItem` validates the
   * whole line and refuses a product with a required option without them.
   */
  renderItem(item) {
    const name = QissaCartDrawer.esc(item.product_name || item.name);
    const image = item.product_image || item.image?.url || '';
    const url = item.url || '#';
    const qty = QissaCartDrawer.num(item.quantity) || 1;
    const current = QissaCartDrawer.num(item.total);
    const regular = QissaCartDrawer.regularLine(item);
    const off = regular > current + 0.01 ? Math.round((1 - current / regular) * 100) : 0;

    return `
      <div class="qcd__item" data-item-id="${item.id}">
        <a class="qcd__thumb" href="${QissaCartDrawer.attr(url)}">
          ${image ? `<img src="${QissaCartDrawer.attr(image)}" alt="${QissaCartDrawer.attr(name)}" width="68" height="68" loading="lazy" />` : ''}
        </a>
        <div class="qcd__main">
          <a class="qcd__name" href="${QissaCartDrawer.attr(url)}">${name}</a>
          <form class="qcd__form" id="qcd-item-${item.id}" onchange="salla.form.onChange('cart.updateItem', event)">
            <input type="hidden" name="id" value="${item.id}" />
            ${QissaCartDrawer.optionFields(item)}
            <salla-quantity-input class="qcd__qty" cart-item-id="${item.id}" ${QissaCartDrawer.maxAttr(item)}
                                  value="${qty}" name="quantity"></salla-quantity-input>
          </form>
        </div>
        <div class="qcd__side">
          <button type="button" class="qcd__remove" data-qcd-remove aria-label="${QissaCartDrawer.attr(this.s.remove)}">${ICON.trash}</button>
          <div class="qcd__price">
            ${off ? `<s class="qcd__was">${this.money(regular)}</s>` : ''}
            <span class="qcd__now${off ? ' is-sale' : ''}">${item.is_available === false ? this.s.out : this.money(current)}</span>
            ${off ? `<span class="qcd__off" dir="ltr">-${this.number(off)}%</span>` : ''}
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
    const count = QissaCartDrawer.num(cart.count) || items.length;
    const cartUrl = (typeof salla !== 'undefined' && salla.url?.get) ? salla.url.get('cart') : '/cart';

    return `
      <footer class="qcd__foot">
        <div class="qcd__rows">
          ${t.discount > 0.009 ? `
            <div class="qcd__row"><span>${this.s.before}</span><span>${this.money(t.regular)}</span></div>
            <div class="qcd__row qcd__row--discount"><span>${this.s.discount}<small>(${this.number(t.percent)}%)</small></span><span>&minus; ${this.money(t.discount)}</span></div>` : ''}
          <a class="qcd__coupon" href="${QissaCartDrawer.attr(cartUrl)}">${this.s.coupon}</a>
        </div>
        <div class="qcd__bottom">
          <div class="qcd__total">
            <span class="qcd__total-count">${this.s.count.replace('{count}', this.number(count))}</span>
            <span class="qcd__total-label">${this.s.final}</span>
            <b class="qcd__total-value">${this.money(t.total)}</b>
          </div>
          <button type="button" class="qcd__checkout" data-qcd-checkout>
            <span>${this.s.checkout}</span>${ICON.arrow}
          </button>
        </div>
      </footer>`;
  }

  /* ------------------------------------------------------------ interactions */

  bindPanel() {
    this.panel.querySelectorAll('[data-qcd-remove]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.closest('.qcd__item')?.dataset.itemId; // a STRING, never Number()
        if (!id) { return; }
        button.disabled = true;
        salla.cart.deleteItem(id)
          .then(() => this.fetch())
          .catch(error => { button.disabled = false; salla.logger?.error('qissa-cart-drawer:: deleteItem failed', error); });
      });
    });

    // `salla.cart.reset()` is client-side only; emptying the cart is N
    // sequential deletes with `onUpdated` muted for the run.
    const clear = this.panel.querySelector('[data-qcd-clear]');
    clear?.addEventListener('click', () => {
      if (clear.disabled) { return; }
      const ids = Array.from(this.panel.querySelectorAll('.qcd__item')).map(row => row.dataset.itemId).filter(Boolean);
      if (!ids.length) { return; }
      this.clearing = true;
      clear.disabled = true;
      ids
        .reduce((chain, id) => chain.then(() => salla.cart.deleteItem(id)), Promise.resolve())
        .catch(error => {
          salla.logger?.error('qissa-cart-drawer:: clear failed', error);
          salla.notify?.error(this.s.clear_failed);
        })
        .then(() => { this.clearing = false; this.fetch(); });
    });

    // `submit()` takes a guest through login, which a plain /checkout link would not.
    this.panel.querySelector('[data-qcd-checkout]')?.addEventListener('click', () => salla.cart.submit());
  }

  /* ----------------------------------------------------------------- helpers */

  /** The SDK formats with Arabic-Indic digits on an Arabic store; the cart
   *  page's server-side `|money` prints Latin ones (the theme's WesternDigits
   *  face renders them). The drawer matches the page. */
  static latin(text) {
    return String(text).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
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

  static maxAttr(item) {
    const max = Number(item.max_quantity ?? item.product?.max_quantity);
    return Number.isFinite(max) && max > 0 ? `max="${max}"` : '';
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
