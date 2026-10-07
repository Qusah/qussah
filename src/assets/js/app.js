import MobileMenu from 'mmenu-light';
import Swal from 'sweetalert2';
import Anime from './partials/anime';
import initTootTip from './partials/tooltip';
import AppHelpers from "./app-helpers";
import { autoEnhanceCarousels } from "./partials/card-carousel";

class App extends AppHelpers {
  constructor() {
    super();
    window.app = this;
  }

  loadTheApp() {
    this.commonThings();
    this.initiateNotifier();
    this.initiateMobileMenu();
    if (header_is_sticky) {
      this.initiateStickyMenu();
    }
    this.initAddToCart();
    this.hookGuestWishlist();
    this.hydrateCardDescriptions();
    this.hydrateCardMeta();
    this.initiateDropdowns();
    this.initiateModals();
    this.initiateCollapse();
    
    // Ensure #more-menu-dropdown exists before running changeMenuDirection.
    // The dropdown is rendered by <custom-main-menu>; the Qussah header uses a
    // static pill nav instead, so on this theme the element never arrives. Poll
    // only where the menu is actually on the page, and give up after 5s either
    // way — an unbounded 10Hz timer ran for the whole session on every page and
    // showed up as main-thread work in the INP measurements.
    if (document.querySelector('custom-main-menu')) {
      let menuDirTries = 0;
      const menuDirInterval = setInterval(() => {
        if (document.querySelector('#more-menu-dropdown')) {
          this.changeMenuDirection();
          clearInterval(menuDirInterval);
        } else if (++menuDirTries > 50) {
          clearInterval(menuDirInterval);
        }
      }, 100);
    }

    initTootTip();
    this.loadModalImgOnclick();

    // Product-card image carousels: wire on every page and keep watching for
    // cards that salla-products-list adds/replaces (filters, sorting, paging).
    autoEnhanceCarousels();

    salla.comment.event.onAdded(() => window.location.reload());

    this.status = 'ready';
    document.dispatchEvent(new CustomEvent('theme::ready'));
    this.log('Theme Loaded 🎉');
  }

  log(message) {
    salla.log(`ThemeApp(Raed)::${message}`);
    return this;
  }

    changeMenuDirection() {
      setTimeout(() => {
        app.all('.root-level.has-children', item => {
          if (item.classList.contains('change-menu-dir')) return;
          app.on('mouseover', item, () => {
            let allSubMenus = item.querySelectorAll('.sub-menu');
            allSubMenus.forEach((submenu, idx) => {
              if (idx === 0) return;
              let rect = submenu.getBoundingClientRect();
              if (rect.left < 10 || rect.right > window.innerWidth - 10) {
                app.addClass(item, 'change-menu-dir');
              }
            });
          });
        });
      }, 1000);
    }

  loadModalImgOnclick(){
    document.querySelectorAll('.load-img-onclick').forEach(link => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        let modal = document.querySelector('#' + link.dataset.modalId),
          img = modal.querySelector('img'),
          imgSrc = img.dataset.src;
        modal.open();

        if (img.classList.contains('loaded')) return;

        img.src = imgSrc;
        img.classList.add('loaded');
      })
    })
  }

  commonThings() {
    this.cleanContentArticles('.content-entry');
  }

  cleanContentArticles(elementsSelector) {
    let articleElements = document.querySelectorAll(elementsSelector);

    if (articleElements.length) {
      articleElements.forEach(article => {
        article.innerHTML = article.innerHTML.replace(/\&nbsp;/g, ' ')
      })
    }
  }

// Resolves once `selector` appears. Bounded on purpose: an element that never
// arrives used to leave this polling at ~6Hz for the whole session. The promise
// simply never resolves after the deadline, which is what the callers expect
// when the element genuinely isn't on the page.
isElementLoaded(selector, timeout = 8000){
  return new Promise((resolve=>{
    const started = Date.now();
    const interval=setInterval(()=>{
    if(document.querySelector(selector)){
      clearInterval(interval)
      return resolve(document.querySelector(selector))
    }
    if (Date.now() - started > timeout) {
      clearInterval(interval)
    }
   },160)
}))


  };

  copyToClipboard(event) {
    event.preventDefault();
    let aux = document.createElement("input"),
    btn = event.currentTarget;
    aux.setAttribute("value", btn.dataset.content);
    document.body.appendChild(aux);
    aux.select();
    document.execCommand("copy");
    document.body.removeChild(aux);
    this.toggleElementClassIf(btn, 'copied', 'code-to-copy', () => true);
    setTimeout(() => {
      this.toggleElementClassIf(btn, 'code-to-copy', 'copied', () => true)
    }, 1000);
  }

  initiateNotifier() {
    salla.notify.setNotifier(function (message, type, data) {
      // The «وصل للسلة» pill (add-product-toast.js) confirms an add and shows
      // a refused one itself; it takes both toasts while its switch is on.
      if (window.qissaCartToast && window.qissaCartToast.claims(type, data)) {
        return;
      }
      if (window.enable_add_product_toast && data?.data?.googleTags?.event === "addToCart") {
        return;
      }
      if (typeof message == 'object') {
        return Swal.fire(message).then(type);
      }

      return Swal.mixin({
        toast: true,
        position: salla.config.get('theme.is_rtl') ? 'top-start' : 'top-end',
        showConfirmButton: false,
        timer: 2000,
        didOpen: (toast) => {
          toast.addEventListener('mouseenter', Swal.stopTimer)
          toast.addEventListener('mouseleave', Swal.resumeTimer)
        }
      }).fire({
        icon: type,
        title: message,
        showCloseButton: true,
        timerProgressBar: true
      })
    });
  }


  initiateMobileMenu() {

  this.isElementLoaded('#mobile-menu').then((menu) => {

 
  const mobileMenu = new MobileMenu(menu, "(max-width: 1024px)", "( slidingSubmenus: false)");

  salla.lang.onLoaded(() => {
    mobileMenu.navigation({ title: salla.lang.get('blocks.header.main_menu') });
  });
  const drawer = mobileMenu.offcanvas({ position: salla.config.get('theme.is_rtl') ? "right" : 'left' });

  this.onClick("a[href='#mobile-menu']", event => {
    document.body.classList.add('menu-opened');
    event.preventDefault() || drawer.close() || drawer.open()
    
  });
  this.onClick(".close-mobile-menu", event => {
    document.body.classList.remove('menu-opened');
    event.preventDefault() || drawer.close()
  });
  });

  }

  initiateStickyMenu() {
    let header = this.element('#mainnav'),
      height = this.element('#mainnav .inner')?.clientHeight;
    //when it's landing page, there is no header
    if (!header) {
      return;
    }

    window.addEventListener('load', () => setTimeout(() => this.setHeaderHeight(), 500))
    window.addEventListener('resize', () => this.setHeaderHeight())

    window.addEventListener('scroll', () => {
      window.scrollY >= header.offsetTop + height ? header.classList.add('fixed-pinned', 'animated') : header.classList.remove('fixed-pinned');
      window.scrollY >= 200 ? header.classList.add('fixed-header') : header.classList.remove('fixed-header', 'animated');
    }, { passive: true });
  }

  setHeaderHeight() {
    let height = this.element('#mainnav .inner').clientHeight,
      header = this.element('#mainnav');
    header.style.height = height + 'px';
  }

  initiateDropdowns() {
    this.onClick('.dropdown__trigger', ({ target: btn }) => {
      btn.parentElement.classList.toggle('is-opened');
      document.body.classList.toggle('dropdown--is-opened');
      // Click Outside || Click on close btn
      window.addEventListener('click', ({ target: element }) => {
        if (!element.closest('.dropdown__menu') && element !== btn || element.classList.contains('dropdown__close')) {
          btn.parentElement.classList.remove('is-opened');
          document.body.classList.remove('dropdown--is-opened');
        }
      });
    });
  }

  initiateModals() {
    this.onClick('[data-modal-trigger]', e => {
      let id = '#' + e.target.dataset.modalTrigger;
      this.removeClass(id, 'hidden');
      setTimeout(() => this.toggleModal(id, true)); //small amont of time to running toggle After adding hidden
    });
    salla.event.document.onClick("[data-close-modal]", e => this.toggleModal('#' + e.target.dataset.closeModal, false));
  }

  toggleModal(id, isOpen) {
    this.toggleClassIf(`${id} .s-salla-modal-overlay`, 'ease-out duration-300 opacity-100', 'opacity-0', () => isOpen)
      .toggleClassIf(`${id} .s-salla-modal-body`,
        'ease-out duration-300 opacity-100 translate-y-0 sm:scale-100', //add these classes
        'opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95', //remove these classes
        () => isOpen)
      .toggleElementClassIf(document.body, 'modal-is-open', 'modal-is-closed', () => isOpen);
    if (!isOpen) {
      setTimeout(() => this.addClass(id, 'hidden'), 350);
    }
  }

  initiateCollapse() {
    document.querySelectorAll('.btn--collapse')
      .forEach((trigger) => {
        const content = document.querySelector('#' + trigger.dataset.show);
        if (!content) return;

        const state = { isOpen: false }

        const toggleState = (isOpen) => {
          state.isOpen = !isOpen;
          this.toggleElementClassIf([content, trigger], 'is-closed', 'is-opened', () => isOpen);
        }

        trigger.addEventListener('click', () => {
          const { isOpen } = state;
          toggleState(isOpen);
        });
      });
  }


  /**
   * Workaround for seeking to simplify & clean, There are three ways to use this method:
   * 1- direct call: `this.anime('.my-selector')` - will use default values
   * 2- direct call with overriding defaults: `this.anime('.my-selector', {duration:3000})`
   * 3- return object to play it letter: `this.anime('.my-selector', false).duration(3000).play()` - will not play animation unless calling play method.
   * @param {string|HTMLElement} selector
   * @param {object|undefined|null|null} options - in case there is need to set attributes one by one set it `false`;
   * @return {Anime|*}
   */
  anime(selector, options = null) {
    let anime = new Anime(selector, options);
    return options === false ? anime : anime.play();
  }

  /**
   * These actions are responsible for pressing "add to cart" button,
   * they can be from any page, especially when mega-menu is enabled
   */
  initAddToCart() {
    // Seed cart count/total from Salla's client-side storage. The header is
    // server-rendered (and may be full-page cached), so its inline count can be
    // stale/0 — reading the live stored value fixes it on first paint, before
    // any onUpdated event fires.
    // PM: the header "إتمام الطلب" label is shown only when the cart has items.
    // Toggle `is-empty` on the cart CTA from the live count so it stays correct
    // even when the server-rendered header was full-page cached with a stale/0 count.
    const syncCartCta = count => {
      const empty = !(Number(count) > 0);
      document.querySelectorAll('.qheader-act--cart').forEach(el => el.classList.toggle('is-empty', empty));
    };

    const seedCount = salla.storage.get('cart.summary.count');
    if (seedCount != null) {
      document.querySelectorAll('[data-cart-count]').forEach(el => el.innerText = salla.helpers.number(seedCount));
      syncCartCta(seedCount);
    }
    const seedTotal = salla.storage.get('cart.summary.total');
    if (seedTotal != null) {
      document.querySelectorAll('[data-cart-total]').forEach(el => el.innerHTML = salla.money(seedTotal));
    }

    salla.cart.event.onUpdated(summary => {
      document.querySelectorAll('[data-cart-total]').forEach(el => el.innerHTML = salla.money(summary.total));
      document.querySelectorAll('[data-cart-count]').forEach(el => el.innerText = salla.helpers.number(summary.count));
      syncCartCta(summary.count);
    });

    salla.cart.event.onItemAdded((response, prodId) => {
      app.element('salla-cart-summary').animateToCart(app.element(`#product-${prodId} img`));
    });
  }

  /**
   * Server-rendered product cards carry the product description as HTML in
   * data-qdesc (theme setting card_show_description). Turn it into the plain
   * two-line excerpt the JS card shows, so both card kinds read the same.
   */
  hydrateCardDescriptions() {
    const toText = (html) => {
      if (window.QissaCardText) return window.QissaCardText.fromHtml(html, 220);
      let text = '';
      try {
        const body = new DOMParser().parseFromString(String(html), 'text/html').body;
        body.querySelectorAll('br').forEach(br => br.replaceWith(' '));
        body.querySelectorAll('td,th,tr,p,li,div,h1,h2,h3,h4,h5,h6').forEach(el => el.append(' '));
        text = body.textContent || '';
      }
      catch (e) { text = String(html).replace(/<[^>]*>/g, ' '); }
      text = text.replace(/\s+/g, ' ').trim();
      return text.length > 220 ? text.slice(0, 220).replace(/\s+\S*$/, '') + '…' : text;
    };
    document.querySelectorAll('[data-qdesc]').forEach((el) => {
      const text = toText(el.getAttribute('data-qdesc'));
      el.removeAttribute('data-qdesc');
      if (text) el.textContent = text; else el.remove();
    });
  }

  /**
   * Server-rendered product cards come without the rating and the sold count:
   * the page's product objects do not carry them, the products API does. Fetch
   * them once for the cards on the page and print the same two lines the JS
   * card (product-card.js) and partials/qprod-card.twig draw. A card with no
   * rating keeps an empty line in its place, so every card measures the same.
   */
  hydrateCardMeta() {
    const cards = [...document.querySelectorAll('.qprod')].filter(c => !c.querySelector('.qprod__rating, .qprod__sold') && c.querySelector('.qprod__info'));
    if (!cards.length || !(salla.product && salla.product.fetch)) return;
    const idOf = (card) => {
      const like = card.querySelector('.qprod__like[data-id]');
      if (like) return like.dataset.id;
      const m = /id:\s*'(\d+)'/.exec((card.querySelector('.qprod__add') || card).getAttribute('onclick') || '');
      return m ? m[1] : (card.dataset.qqvId || '');
    };
    const byId = new Map();
    cards.forEach((card) => { const id = idOf(card); if (id) byId.set(id, (byId.get(id) || []).concat(card)); });
    if (!byId.size) return;
    // the theme's own icons, from wherever this page already points at them
    const heart = document.querySelector('.qprod__like-ic');
    const base = heart ? ((/url\(['"]?(.*?)heart\.svg/.exec(heart.getAttribute('style') || '') || [])[1] || '') : '';
    const icon = name => `${base}${name}.svg`;
    const word = key => salla.lang.get(`blocks.qissa.${key}`);
    const paint = (product) => {
      const stars = parseFloat(product.rating && product.rating.stars) || 0;
      const sold = Number(product.sold_quantity) || 0;
      const filled = Math.floor(stars);
      const rating = `<div class="qprod__rating${stars ? '' : ' is-empty'}"${stars ? '' : ' aria-hidden="true"'}>
          <span class="qprod__stars"${stars ? ` role="img" aria-label="${stars} / 5"` : ''}>${base ? [1, 2, 3, 4, 5].map(i => `<img src="${icon(i <= filled ? 'star' : 'star-empty')}" alt="" width="12" height="12">`).join('') : ''}</span>
          <span class="qprod__rate">(${stars.toFixed(1)})</span>
        </div>`;
      const line = sold > 0 ? `<p class="qprod__sold">
          ${base ? `<img src="${icon('fire')}" alt="" width="20" height="20">` : ''}
          <span>${word('sold')} ${sold.toLocaleString('en-US')} ${word('times')}</span>
        </p>` : '';
      (byId.get(String(product.id)) || []).forEach((card) => {
        if (card.querySelector('.qprod__rating, .qprod__sold')) return;
        card.querySelector('.qprod__info').insertAdjacentHTML('beforeend', rating + line);
      });
    };
    const ids = [...byId.keys()];
    for (let i = 0; i < ids.length; i += 20) {
      salla.product.fetch({ source: 'selected', source_value: ids.slice(i, i + 20) })
        .then(res => (res && res.data || []).forEach(paint))
        .catch(() => { /* the cards stay as the page printed them */ });
    }
  }

  /**
   * Guests can't favorite: keep every heart empty and open the login modal on
   * a favorite attempt instead of failing with a "must login" error toast.
   */
  hookGuestWishlist() {
    if (!(salla.config && salla.wishlist && salla.wishlist.event)) return;
    const isGuest = () => !!(salla.config.isGuest && salla.config.isGuest());

    // strip the "wishlisted" state from every heart while logged out (guards
    // against stale storage marking a heart red for a guest)
    const stripHearts = () => {
      if (!isGuest()) return;
      document.querySelectorAll('.qprod__like[wishlisted], .qoffer__like[wishlisted], .s-product-card-wishlist-btn[wishlisted]').forEach(btn => {
        btn.removeAttribute('wishlisted');
        btn.setAttribute('aria-pressed', 'false');
      });
    };
    stripHearts();
    new MutationObserver(stripHearts).observe(document.body, {
      subtree: true, attributes: true, attributeFilter: ['wishlisted']
    });

    // intercept a guest's click on a heart (capture phase) BEFORE the inline
    // onclick runs → open the login modal, so wishlist.toggle never fires and
    // no "must login" toast appears
    document.addEventListener('click', (e) => {
      if (!isGuest()) return;
      const btn = e.target.closest('[onclick*="wishlist.toggle"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      salla.event.dispatch('login::open');
    }, true);

    // backup for component-based hearts that don't use an inline onclick
    salla.wishlist.event.onAdditionFailed(() => {
      stripHearts();
      if (isGuest()) salla.event.dispatch('login::open');
    });
  }
}

salla.onReady(() => (new App).loadTheApp());
