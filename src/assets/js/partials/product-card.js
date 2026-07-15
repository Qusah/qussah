import BasePage from '../base-page';
class ProductCard extends HTMLElement {
  constructor(){
    super()
  }
  
  connectedCallback(){
    // Parse product data
    this.product = this.product || JSON.parse(this.getAttribute('product')); 

    if (window.app?.status === 'ready') {
      this.onReady();
    } else {
      document.addEventListener('theme::ready', () => this.onReady() )
    }
  }

  onReady(){
      this.fitImageHeight = salla.config.get('store.settings.product.fit_type');
      this.placeholder = salla.url.asset(salla.config.get('theme.settings.placeholder'));
      this.getProps()

	  this.source = salla.config.get("page.slug");
      // If the card is in the landing page, hide the add button and show the quantity
	  if (this.source == "landing-page") {
	  	this.hideAddBtn = true;
	  	this.showQuantity = window.showQuantity;
	  }

      salla.lang.onLoaded(() => {
        // Language
        this.remained = salla.lang.get('pages.products.remained');
        this.donationAmount = salla.lang.get('pages.products.donation_amount');
        this.startingPrice = salla.lang.get('pages.products.starting_price');
        this.addToCart = salla.lang.get('pages.cart.add_to_cart');
        this.outOfStock = salla.lang.get('pages.products.out_of_stock');

        // re-render to update translations
        this.render();
      })
      
      this.render()
  }

  initCircleBar() {
    let qty = this.product.quantity,
      total = this.product.quantity > 100 ? this.product.quantity * 2 : 100,
      roundPercent = (qty / total) * 100,
      bar = this.querySelector('.s-product-card-content-pie-svg-bar'),
      strokeDashOffsetValue = 100 - roundPercent;
    bar.style.strokeDashoffset = strokeDashOffsetValue;
  }

  formatDate(date) {
    let d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  } 

  // Discount percentage for the sale badge — prefers Salla's discount_percentage
  // field, falls back to computing it from regular vs sale price. Digits localized.
  getDiscountPercent() {
    let pct = parseFloat(this.product?.discount_percentage);
    if ((!pct || isNaN(pct)) && this.product?.regular_price > 0 && this.product?.sale_price >= 0) {
      pct = (this.product.regular_price - this.product.sale_price) / this.product.regular_price * 100;
    }
    pct = Math.round(pct);
    return pct > 0 ? salla.helpers.number(pct) : 0;
  }

  getProductBadge() {
    if (this.product?.preorder?.label) {
      return `<div class="s-product-card-promotion-title">${this.product.preorder.label}</div>`
    }

    // Plain vertical (reusable Figma) card: show the discount percentage on sale.
    if (this.isPlainVertical && this.product?.is_on_sale) {
      const pct = this.getDiscountPercent();
      if (pct) {
        return `<div class="s-product-card-promotion-title">خصم ${pct}%</div>`
      }
    }

    if (this.product.promotion_title) {
      return `<div class="s-product-card-promotion-title">${this.product.promotion_title}</div>`
    }
    if (this.showQuantity && this.product?.quantity) {
      return `<div
        class="s-product-card-quantity">${this.remained} ${salla.helpers.number(this.product?.quantity)}</div>`
    }
    if (this.showQuantity && this.product?.is_out_of_stock) {
      return `<div class="s-product-card-out-badge">${this.outOfStock}</div>`
    }
    return '';
  }

  getPriceFormat(price) {
    if (!price || price == 0) {
      return salla.config.get('store.settings.product.show_price_as_dash')?'-':'';
    }

    return salla.money(price);
  }

  getProductPrice() {
    let price = '';
    if (this.product.is_on_sale) {
      price = `<div class="s-product-card-sale-price">
                <h4>${this.getPriceFormat(this.product.sale_price)}</h4>
                <span>${this.getPriceFormat(this.product?.regular_price)}</span>
              </div>`;
    }
    else if (this.product.starting_price) {
      price = `<div class="s-product-card-starting-price">
                  <p>${this.startingPrice}</p>
                  <h4> ${this.getPriceFormat(this.product?.starting_price)} </h4>
              </div>`
    }
    else{
      price = `<h4 class="s-product-card-price">${this.getPriceFormat(this.product?.price)}</h4>`
    }

    return price;
  }

  getAddButtonLabel() {
    if(this.product.has_preorder_campaign) {
        return salla.lang.get('pages.products.pre_order_now');
    }

    if (this.product.status === 'sale' && this.product.type === 'booking') {
      return salla.lang.get('pages.cart.book_now');
    }

    if (this.product.status === 'sale') {
      return salla.lang.get('pages.cart.add_to_cart');
    }

    if (this.product.type !== 'donating') {
      return salla.lang.get('pages.products.out_of_stock');
    }

    // donating
    return salla.lang.get('pages.products.donation_exceed');
  }

  getProps(){

    /**
     *  Horizontal card.
     */
    this.horizontal = this.hasAttribute('horizontal');
  
    /**
     *  Support shadow on hover.
     */
    this.shadowOnHover = this.hasAttribute('shadowOnHover');
  
    /**
     *  Hide add to cart button.
     */
    this.hideAddBtn = this.hasAttribute('hideAddBtn');
  
    /**
     *  Full image card.
     */
    this.fullImage = this.hasAttribute('fullImage');
  
    /**
     *  Minimal card.
     */
    this.minimal = this.hasAttribute('minimal');
  
    /**
     *  Special card.
     */
    this.isSpecial = this.hasAttribute('isSpecial');
  
    /**
     *  Show quantity.
     */
    this.showQuantity = this.hasAttribute('showQuantity');

    /**
     *  Plain (default) vertical card — the reusable Figma card. Excludes the
     *  special / minimal / full-image / horizontal variants.
     */
    this.isPlainVertical = !this.horizontal && !this.fullImage && !this.minimal && !this.isSpecial;
  }

  escapeHTML(str = '') {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  }

  // ---- Image carousel -----------------------------------------------------
  // Collect the product photos shown in the card slider. Skips videos / 3D
  // models (a card can't play them) and always falls back to the primary image
  // so single-image products render exactly as before. Capped for page speed.
  getCardImages() {
    const MAX = 6;
    const primaryUrl = this.product?.image?.url;
    const list = Array.isArray(this.product?.images) ? this.product.images : [];

    let photos = list.filter(im =>
      im && im.url && !im.video_url && !im.three_d_image_url && im.type !== 'video');

    // Keep the primary image first so the LCP slide matches the old markup.
    if (primaryUrl && photos.length) {
      photos.sort((a, b) => (b.url === primaryUrl) - (a.url === primaryUrl));
    }

    if (!photos.length) {
      const primary = primaryUrl
        ? this.product.image
        : (this.product?.thumbnail ? { url: this.product.thumbnail, alt: this.product?.name } : null);
      photos = primary ? [primary] : [{ url: this.placeholder || '', alt: this.product?.name }];
    }

    // De-dupe by url, preserve order, cap the count.
    const seen = new Set();
    return photos.filter(p => !seen.has(p.url) && seen.add(p.url)).slice(0, MAX);
  }

  buildCardImg(img) {
    const url = img?.url || this.placeholder || '';
    const fit = salla.url.is_placeholder(url)
      ? 'contain'
      : (this.fitImageHeight ? this.fitImageHeight : 'cover');
    const alt = this.escapeHTML(img?.alt || this.product?.name || '');
    return `<img class="s-product-card-image-${fit}" src="${url}" alt="${alt}" loading="lazy" />`;
  }

  // Media inside .s-product-card-image: a single <a><img> as before, or a
  // native scroll-snap swipe carousel when the product has multiple photos.
  getCardMedia() {
    const photos = this.cardPhotos || (this.cardPhotos = this.getCardImages());
    const href = this.product?.url;
    const aria = this.escapeHTML(this.product?.image?.alt || this.product?.name || '');

    if (photos.length < 2) {
      return `<a href="${href}" aria-label="${aria}">${this.buildCardImg(photos[0] || this.product?.image)}</a>`;
    }

    const slides = photos
      .map(img => `<a href="${href}" aria-label="${aria}" class="qpc-slide">${this.buildCardImg(img)}</a>`)
      .join('');

    return `<div class="qpc-carousel" data-qpc>${slides}</div>`;
  }

  getCarouselDots() {
    const count = (this.cardPhotos || (this.cardPhotos = this.getCardImages())).length;
    if (count < 2) return '';
    let dots = '';
    for (let i = 0; i < count; i++) {
      dots += `<button type="button" class="qpc-dot${i === 0 ? ' is-active' : ''}" data-i="${i}" aria-label="${i + 1}"></button>`;
    }
    return `<div class="qpc-dots" aria-hidden="true">${dots}</div>`;
  }

  // Sync the active dot to the centered slide and let dot taps glide to a slide.
  initCarousels() {
    const car = this.querySelector('[data-qpc]');
    if (!car) return;
    const slides = Array.from(car.querySelectorAll('.qpc-slide'));
    const dots = Array.from(this.querySelectorAll('.qpc-dot'));
    if (slides.length < 2 || !dots.length) return;

    const activate = (i) => dots.forEach((d, di) => d.classList.toggle('is-active', di === i));

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) activate(slides.indexOf(e.target));
        });
      }, { root: car, threshold: 0.6 });
      slides.forEach((s) => io.observe(s));
    }

    dots.forEach((dot) => {
      dot.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const i = Number(dot.dataset.i) || 0;
        slides[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      });
    });
  }

  render(){
    this.classList.add('s-product-card-entry'); 
    this.setAttribute('id', this.product.id);
    !this.horizontal && !this.fullImage && !this.minimal? this.classList.add('s-product-card-vertical') : '';
    this.horizontal && !this.fullImage && !this.minimal? this.classList.add('s-product-card-horizontal') : '';
    this.fitImageHeight && !this.isSpecial && !this.fullImage && !this.minimal? this.classList.add('s-product-card-fit-height') : '';
    this.isSpecial? this.classList.add('s-product-card-special') : '';
    this.fullImage? this.classList.add('s-product-card-full-image') : '';
    this.minimal? this.classList.add('s-product-card-minimal') : '';
    this.product?.donation?  this.classList.add('s-product-card-donation') : '';
    this.shadowOnHover?  this.classList.add('s-product-card-shadow') : '';
    this.product?.is_out_of_stock?  this.classList.add('s-product-card-out-of-stock') : '';
    this.isInWishlist = !salla.config.isGuest() && salla.storage.get('salla::wishlist', []).includes(Number(this.product.id));
    this.effectiveStatus = (this.product.is_out_of_stock && window.notify_when_available_in_card && !['donating', 'financial_support'].includes(this.product?.type))
      ? 'out-and-notify'
      : this.product.status;
    // Info chips for the plain vertical card — derived from the product subtitle
    // (Arabic-comma separated), mirroring the homepage card convention.
    this.chips = (this.isPlainVertical && this.product?.subtitle)
      ? String(this.product.subtitle).split('،').map(c => c.trim()).filter(Boolean)
      : [];
    // Recompute the card photos for this render (translation reloads re-render).
    this.cardPhotos = this.getCardImages();
      this.innerHTML = `
        <div class="${!this.fullImage ? 's-product-card-image' : 's-product-card-image-full'}">
          ${this.fullImage
            ? `<a href="${this.product?.url}" aria-label="${this.escapeHTML(this.product?.image?.alt || this.product.name)}">
                 <img
                    class="s-product-card-image-${salla.url.is_placeholder(this.product?.image?.url)
                      ? 'contain'
                      : this.fitImageHeight
                      ? this.fitImageHeight
                      : 'cover'}"
                    src="${this.product?.image?.url || this.product?.thumbnail || this.placeholder || ''}"
                    alt="${this.escapeHTML(this.product?.image?.alt || this.product.name)}"
                    loading="lazy"
                  />
               </a>`
            : `${this.getCardMedia()}
               ${!this.minimal ? this.getProductBadge() : ''}
               ${this.getCarouselDots()}`
          }
          ${this.fullImage ? `<a href="${this.product?.url}" aria-label=${this.product.name} class="s-product-card-overlay"></a>`:''}
          ${(!this.horizontal && !this.fullImage && !this.isPlainVertical) || (this.isPlainVertical && this.hideAddBtn) ?
            `<button type="button"
              name="product-name-${this.product.id}"
              aria-label="Add or remove to wishlist"
              class="s-product-card-wishlist-btn animated ${this.isInWishlist ? 's-product-card-wishlist-added pulse-anime' : 'not-added un-favorited'}"
              onclick="salla.wishlist.toggle(${this.product.id})"
              data-id="${this.product.id}">
              <i class="sicon-heart"></i>
            </button>` : ``
          }
        </div>
        <div class="s-product-card-content">
          ${this.isSpecial && this.product?.quantity ?
            `<div class="s-product-card-content-pie">
              <span>
                <b>${salla.helpers.number(this.product?.quantity)}</b>
                ${this.remained}
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -1 36 34" class="s-product-card-content-pie-svg">
                <circle cx="16" cy="16" r="15.9155" class="s-product-card-content-pie-svg-base" />
                <circle cx="16" cy="16" r="15.9155" class="s-product-card-content-pie-svg-bar" />
              </svg>
            </div>`
            : ``}

          <div class="s-product-card-content-main ${this.isSpecial ? 's-product-card-content-extra-padding' : ''}">
            ${this.isPlainVertical && this.product?.brand?.name ?
              `<p class="s-product-card-content-category">${this.escapeHTML(this.product.brand.name)}</p>`
              : ``}
            <h3 class="s-product-card-content-title">
              <a href="${this.product?.url}">${this.product?.name}</a>
            </h3>

            ${this.isPlainVertical
              ? (this.chips.length
                  ? `<div class="s-product-card-chips">${this.chips.map(chip => `<span class="s-product-card-chip">${this.escapeHTML(chip)}</span>`).join('')}</div>`
                  : ``)
              : (this.product?.subtitle && !this.minimal
                  ? `<p class="s-product-card-content-subtitle opacity-80">${this.product?.subtitle}</p>`
                  : ``)}
          </div>
          ${this.product?.donation && !this.minimal && !this.fullImage ?
          `<salla-progress-bar donation=${JSON.stringify(this.product?.donation)}></salla-progress-bar>
          <div class="s-product-card-donation-input">
            ${this.product?.donation?.can_donate && this.product?.donation?.custom_amount_enabled  ?
              `<label for="donation-amount-${this.product.id}">${this.donationAmount} <span>*</span></label>
              <input
                type="text"
                onInput="${e => {
                  salla.helpers.inputDigitsOnly(e.target);
                  this.addBtn.donatingAmount = (e.target).value;
                }}"
                id="donation-amount-${this.product.id}"
                name="donating_amount"
                class="s-form-control"
                placeholder="${this.donationAmount}" />`
              : ``}
          </div>`
            : ''}
          <div class="s-product-card-content-sub ${this.isSpecial ? 's-product-card-content-extra-padding' : ''}">
            ${this.product?.donation?.can_donate ? '' : this.getProductPrice()}
            ${this.product?.rating?.stars ?
              `<div class="s-product-card-rating">
                <i class="sicon-star2 before:text-orange-300"></i>
                <span>${this.product.rating.stars}</span>
              </div>`
               : ``}
          </div>

          ${this.isSpecial && this.product.discount_ends
            ? `<salla-count-down date="${this.formatDate(this.product.discount_ends)}" end-of-day=${true} boxed=${true}
              labeled=${true} />`
            : ``}


          ${!this.hideAddBtn ?
            `<div class="s-product-card-content-footer gap-2">
              <salla-add-product-button fill="outline" width="wide"
                product-id="${this.product.id}"
                product-status="${this.effectiveStatus}"
                product-type="${this.product.type}">
                ${this.product.status == 'sale' ?
                    `<i class="text-base sicon-${ this.product.type == 'booking' ? 'calendar-time' : 'shopping-bag'}"></i>` : ``
                  }
                <span>${this.product.add_to_cart_label ? this.product.add_to_cart_label : this.getAddButtonLabel() }</span>
              </salla-add-product-button>

              ${this.horizontal || this.fullImage || (this.isPlainVertical && !this.hideAddBtn) ?
                `<button type="button"
                  id="card-wishlist-btn-${this.product.id}-horizontal"
                  aria-label="Add or remove to wishlist"
                  class="s-product-card-wishlist-btn animated ${this.isInWishlist ? 's-product-card-wishlist-added pulse-anime' : 'not-added un-favorited'}"
                  onclick="salla.wishlist.toggle(${this.product.id})"
                  data-id="${this.product.id}">
                  <i class="sicon-heart"></i>
                </button>`
                : ``}
            </div>`
            : ``}
        </div>
      `

      this.querySelectorAll('[name="donating_amount"]').forEach((element)=>{
        element.addEventListener('input', (e) => {
          e.target
            .closest(".s-product-card-content")
            .querySelector("salla-add-product-button")
            .setAttribute("donating-amount", e.target.value); 
        });
      })

      if (this.product?.quantity && this.isSpecial) {
        this.initCircleBar();
      }

      // Optimistic & Per-card wishlist toggle
      this.querySelectorAll('.s-product-card-wishlist-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const willBeAdded = !btn.classList.contains('s-product-card-wishlist-added');
          app.toggleElementClassIf(btn, 's-product-card-wishlist-added', 'not-added', () => willBeAdded);
          app.toggleElementClassIf(btn, 'pulse-anime', 'un-favorited', () => willBeAdded);
        });
      });

      // Wire the image swipe carousel + dot indicators (multi-image products).
      this.initCarousels();
    }
}

customElements.define('custom-salla-product-card', ProductCard);
