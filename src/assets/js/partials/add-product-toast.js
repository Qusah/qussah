// ====================================================================
// Add-to-cart mini-cart modal
// Figma node 6036:6374 (السلة popup). On "Product Added" this opens a
// centered modal (backdrop + close X) showing the WHOLE cart: every item
// (image / name / quantity stepper / price / remove) plus the order summary
// (coupon, المجموع, قيمة الخصم, الإجمالى, إتمام الطلب).
//
// It reuses the cart-page styles (.qcart, qissa-cart.scss) by rendering the
// same markup + Salla web components, so quantity changes, coupons, totals
// and delete keep working. This file's own SCSS only owns the modal shell.
// No auto-hide / progress bar — closed manually via X, backdrop or ESC.
// ====================================================================

class AddToCartToast extends HTMLElement {
  constructor() {
    super();
    this.classList.add("s-add-product-toast");
    this.isVisible = false;
    this.onKeydown = this.onKeydown.bind(this);
  }

  connectedCallback() {
    if (window.app?.status === "ready") {
      this.init();
    } else {
      document.addEventListener("theme::ready", () => this.init());
    }
  }

  disconnectedCallback() {
    document.removeEventListener("keydown", this.onKeydown);
  }

  init() {
    salla.lang.onLoaded(() => {
      this.cartTitle = salla.lang.get("blocks.header.cart") || "السلة";
      this.checkoutText = salla.lang.get("pages.cart.complete_order") || "إتمام الطلب";
    });

    salla.event.on("Product Added", () => this.handleProductAdded());

    // Keep the modal's totals in sync with Salla's live cart updates.
    salla.cart.event.onUpdated(() => this.refreshSummary());

    this.render();
  }

  // Combined discount = product sale savings (Σ line regular − line sale over
  // on-sale items) + Salla's coupon/offer discount. The shown المجموع is the
  // pre-sale (regular) sum so the summary reads coherently: subtotal − discount
  // = total. Offer-only items are left out of `savings` (their discount is
  // already in cart.total_discount) to avoid double-counting.
  discountInfo(cart) {
    let savings = 0;
    (cart.items || []).forEach((it) => {
      if (!it.is_on_sale) return;
      const lineRegular = (it.original_price || 0) * (it.quantity || 1);
      const lineSale = it.total != null ? it.total : lineRegular;
      if (lineRegular > lineSale) savings += lineRegular - lineSale;
    });
    const coupon = (cart.total_discount != null ? cart.total_discount : cart.discount) || 0;
    return {
      savings,
      combined: savings + coupon,
      regularSubtotal: (cart.sub_total || 0) + savings,
    };
  }

  async handleProductAdded() {
    try {
      const cartResponse = await salla.cart.api.details(null, ["options"]);
      const cart = cartResponse?.data?.cart;
      if (!cart?.items?.length) return;
      this.open(cart);
    } catch (error) {
      salla.log("Error processing product added event:", error);
    }
  }

  open(cart) {
    this.cart = cart;
    this.isVisible = true;

    this.updateDOM();
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", this.onKeydown);

    requestAnimationFrame(() => {
      this.classList.add("s-add-product-toast--visible");
    });
  }

  close() {
    this.classList.remove("s-add-product-toast--visible");
    document.removeEventListener("keydown", this.onKeydown);
    document.body.style.overflow = "";

    setTimeout(() => {
      this.isVisible = false;
      this.cart = null;
      this.updateDOM();
    }, 300);
  }

  onKeydown(event) {
    if (event.key === "Escape") this.close();
  }

  // Called from each item's inline delete handler after the row is removed.
  afterItemRemoved() {
    if (!this.querySelector(".s-add-product-toast__items form")) this.close();
  }

  async refreshSummary() {
    if (!this.isVisible) return;

    // Re-fetch the full cart so we have per-item prices to compute the savings
    // (the onUpdated summary doesn't carry item-level original prices).
    let cart;
    try {
      const res = await salla.cart.api.details(null, ["options"]);
      cart = res?.data?.cart;
    } catch (error) {
      salla.log("Error refreshing mini-cart summary:", error);
      return;
    }
    if (!cart || !this.isVisible) return;
    this.cart = cart;

    const info = this.discountInfo(cart);

    const subtotal = this.querySelector("[data-cart-subtotal]");
    if (subtotal) subtotal.innerHTML = salla.money(info.regularSubtotal);

    const discountRow = this.querySelector("[data-discount-row]");
    const discountEl = this.querySelector("[data-cart-discount]");
    if (discountEl) discountEl.innerHTML = "- " + salla.money(info.combined);
    // inline display wins over .qcart__summary-row flex → fully hide when zero
    if (discountRow) discountRow.style.display = info.combined > 0 ? "flex" : "none";

    const totalEl = this.querySelector("[data-cart-total]");
    if (totalEl && cart.total != null) totalEl.innerHTML = salla.money(cart.total);
  }

  escapeHTML(str = "") {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  renderItem(item) {
    const name = this.escapeHTML(item.product_name);
    const total = salla.money(item.total);
    const original = salla.money(item.original_price * item.quantity);
    const showOriginal = item.has_discount || item.is_on_sale;

    return `
      <form onchange="salla.form.onChange('cart.updateItem', event)" id="item-${item.id}">
        <section class="cart-item qcart__item relative">
          <input type="hidden" name="id" value="${item.id}">
          <div class="qcart__item-row">
            <a href="${item.url}" class="qcart__item-thumb relative overflow-hidden shrink-0">
              <img src="${item.product_image}" alt="${name}" loading="lazy"
                   class="flex-none border border-gray-200 bg-gray-100 rounded-md object-center object-cover">
            </a>
            <div class="qcart__item-info space-y-1">
              <h1 class="text-gray-900 leading-6 text-lg"><a href="${item.url}" class="text-base">${name}</a></h1>
            </div>
            <div class="qcart__item-qty">
              <salla-quantity-input cart-item-id="${item.id}" max="${item.max_quantity || ""}"
                class="transtion transition-color duration-300" aria-label="Quantity"
                value="${item.quantity}" name="quantity"></salla-quantity-input>
            </div>
            <div class="qcart__item-price">
              <span class="item-total ${item.has_discount ? "is-sale" : ""}">${item.is_available ? total : salla.lang.get("pages.cart.out_of_stock")}</span>
              <span class="inline-flex gap-1 leading-4 text-sm text-gray-500 line-through item-original-price ${showOriginal ? "" : "hidden"}">${original}</span>
            </div>
            <span class="qcart__item-remove">
              <salla-button type="button" shape="icon" size="small" color="danger" class="btn--delete" aria-label="Remove from the cart"
                onclick="salla.cart.deleteItem('${item.id}').then(() => { document.querySelector('#item-${item.id}')?.remove(); document.querySelector('salla-add-product-toast')?.afterItemRemoved(); })">
                <i class="sicon-cancel"></i>
              </salla-button>
            </span>
          </div>
        </section>
      </form>
    `;
  }

  updateDOM() {
    if (!this.isVisible || !this.cart) {
      this.innerHTML = "";
      return;
    }

    const cart = this.cart;
    const info = this.discountInfo(cart);

    this.innerHTML = `
      <div class="s-add-product-toast__dialog" role="dialog" aria-modal="true">
        <button type="button" class="s-add-product-toast__close" aria-label="إغلاق"><i class="sicon-cancel"></i></button>
        <div class="s-add-product-toast__head">
          <h2 class="s-add-product-toast__title">${this.cartTitle}</h2>
        </div>
        <div class="qcart">
          <div class="s-add-product-toast__items">
            ${cart.items.map((item) => this.renderItem(item)).join("")}
          </div>
          <div class="qcart__totals">
            <h2 class="qcart__summary-title">ملخص الطلب</h2>

            <div class="qcart__coupon">
              <salla-cart-coupons></salla-cart-coupons>
            </div>

            <div class="qcart__summary-row qcart__summary-row--subtotal">
              <span class="qcart__summary-label">المجموع</span>
              <b class="qcart__summary-value" data-cart-subtotal>${salla.money(info.regularSubtotal)}</b>
            </div>

            <div class="qcart__summary-row qcart__summary-row--discount" data-discount-row style="display:${info.combined > 0 ? "flex" : "none"}">
              <span class="qcart__summary-label">قيمة الخصم</span>
              <b class="qcart__summary-value" data-cart-discount>- ${salla.money(info.combined)}</b>
            </div>

            <div class="qcart__summary-divider" aria-hidden="true"></div>

            <div class="qcart__summary-total">
              <div class="qcart__summary-total-row">
                <span class="qcart__summary-total-label">الإجمالى</span>
                <b class="qcart__summary-total-value" data-cart-total>${salla.money(cart.total)}</b>
              </div>
              <p class="qcart__totals-taxnote">الاسعار شاملة للضريبة 15٪ <span>*</span></p>
            </div>

            <div class="cart-submit-wrap">
              <salla-button id="cart-submit" loader-position="center" width="wide">${this.checkoutText}</salla-button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.querySelector(".s-add-product-toast__close").addEventListener("click", () => this.close());
    this.querySelector("#cart-submit").addEventListener("click", () => salla.cart.submit());

    // Backdrop click (outside the dialog) closes the modal.
    this.addEventListener("click", (event) => {
      if (!event.target.closest(".s-add-product-toast__dialog")) this.close();
    });
  }

  render() {
    this.innerHTML = "";
  }
}

customElements.define("salla-add-product-toast", AddToCartToast);
