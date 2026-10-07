import 'lite-youtube-embed';
import BasePage from './base-page';
import Fslightbox from 'fslightbox';
window.fslightbox = Fslightbox;
import { zoom } from './partials/image-zoom';
import { initCompare } from './partials/qissa-compare';

const quiet = fn => (salla.api && typeof salla.api.withoutNotifier === 'function' ? salla.api.withoutNotifier(fn) : fn());

class Product extends BasePage {
    onReady() {
        app.watchElements({
            totalPrice: '.total-price',
            productWeight: '.product-weight',
            beforePrice: '.before-price',
            startingPriceTitle: '.starting-price-title',
            productSku: '.product-sku',
        });

        this.initProductOptionValidations();
        this.initPack();
        initCompare();   // «جدول المقارنة»: shown on the products it was added for
        this.initRelated();
        this.initComments();
        // A click on a gallery photo opens the zoomable viewer instead of
        // fslightbox (videos still go to fslightbox) — bound by product-card.js,
        // which loads on every page and already carries partials/image-viewer.js.

        if(imageZoom){
            // call the function when the page is ready
            this.initImagesZooming();
            // listen to screen resizing
            window.addEventListener('resize', () => this.initImagesZooming());
        }
    }

    initProductOptionValidations() {
      document.querySelector('.product-form')?.addEventListener('change', function(){
        this.reportValidity() && salla.product.getPrice(new FormData(this));
      });
    }

    // A package is a product whose page the merchant gave a «محتويات البكج» block
    // (components/home/qissa-pack-contents; Salla prints it on that product's page
    // only). Let it take the description's place.
    initPack() {
        const more = document.querySelector('[data-qpd-more]');
        const packs = document.querySelectorAll('[data-qpd-pack]');
        if (!more || !packs.length) {
            return;
        }
        // wherever on the page the block was added, it belongs in the details column's slot
        const slot = more.querySelector('.qpd-more__details > .s-blocks-wrapper');
        packs.forEach(pack => {
            slot.contains(pack) || slot.append(pack);
            pack.hidden = false;
        });
        more.classList.add('is-pack');
    }

    // «يشترونها معها»: Salla's related products of this one, four in the theme card
    initRelated() {
        const section = document.querySelector('[data-qpd-related]');
        if (!section) {
            return;
        }
        const id = section.dataset.qpdRelated;
        quiet(() => salla.product.api.fetch({source: 'related', source_value: id, limit: 4})).then(res => {
            const products = (res?.data || []).filter(product => String(product.id) !== id).slice(0, 4);
            const grid = section.querySelector('[data-qpd-related-grid]');
            products.forEach(product => grid.append(Object.assign(document.createElement('custom-salla-product-card'), {product})));
            section.hidden = !products.length;
        }).catch(() => {});
    }

    // The comments run in one row. Scrolled near its end, press Salla's own
    // «عرض المزيد» (hidden) for the next page; scroll does not bubble — capture.
    // Ratings left without words are not shown (the stylesheet hides them), so
    // while fewer than four comments show, ask for more — a few pages at most.
    initComments() {
        const comments = document.querySelector('.qpd-more salla-comments');
        if (!comments) {
            return;
        }
        let busy = false, count = -1, tries = 0;
        const more = () => {
            const button = comments.querySelector('.s-infinite-scroll-btn');
            if (busy || !button) {
                return;
            }
            busy = true;
            button.click();
            setTimeout(() => { busy = false; }, 1500);
        };
        comments.addEventListener('scroll', ({target: row}) => {
            row.matches?.('.s-comments-container > div') && Math.abs(row.scrollLeft) + row.clientWidth > row.scrollWidth - 400 && more();
        }, true);
        new MutationObserver(() => {
            const items = comments.querySelectorAll('.s-comments-item');
            if (items.length === count) {
                return;
            }
            count = items.length;
            busy = false;
            Array.from(items).filter(item => item.offsetParent).length < 4 && tries++ < 6 && more();
        }).observe(comments, {childList: true, subtree: true});
    }

    initImagesZooming() {
      // skip if the screen is not desktop or if glass magnifier
      // is already crated for the image before
      const imageZoom = document.querySelector('.image-slider .magnify-wrapper.swiper-slide-active .img-magnifier-glass');
      if (window.innerWidth  < 1024 || imageZoom) return;
      setTimeout(() => {
          // set delay after the resizing is done, start creating the glass
          // to create the glass in the proper position
          const image = document.querySelector('.image-slider .swiper-slide-active img');
          zoom(image?.id, 2);
      }, 250);
  

      document.querySelector('salla-slider.details-slider').addEventListener('slideChange', (e) => {
          // set delay till the active class is ready
          setTimeout(() => {
              const imageZoom = document.querySelector('.image-slider .swiper-slide-active .img-magnifier-glass');
    
              // if the zoom glass is already created skip
              if (window.innerWidth  < 1024 || imageZoom) return;
              const image = document.querySelector('.image-slider .magnify-wrapper.swiper-slide-active img');
              zoom(image?.id, 2);
          }, 250)
      })
    }

    registerEvents() {
      salla.event.on('product::price.updated.failed',()=>{
        app.element('.price-wrapper').classList.add('hidden');
        const outOfStock = app.element('.out-of-stock');
        outOfStock.classList.remove('hidden');
        outOfStock.classList.remove('scale-pulse');
        void outOfStock.offsetWidth; // trigger reflow
        outOfStock.classList.add('scale-pulse');
      })
      salla.product.event.onPriceUpdated((res) => {

        app.element('.out-of-stock').classList.add('hidden')
        app.element('.price-wrapper').classList.remove('hidden')

        let data = res.data,
            is_on_sale = data.has_sale_price && data.regular_price > data.price;

        app.startingPriceTitle?.classList.add('hidden');

        app.productWeight.forEach((el) => {el.innerHTML = data.weight || ''});
        app.totalPrice.forEach((el) => {el.innerHTML = salla.money(data.price)});
        app.beforePrice.forEach((el) => {el.innerHTML = salla.money(data.regular_price)});
        app.productSku.forEach((el) => {el.innerHTML = data.sku || ''});

        app.toggleClassIf('.price_is_on_sale','showed','hidden', ()=> is_on_sale)
        app.toggleClassIf('.starting-or-normal-price','hidden','showed', ()=> is_on_sale)

        document.querySelectorAll('.total-price, .product-weight').forEach(el => {
          el.classList.remove('scale-pulse');
          void el.offsetWidth; // trigger reflow
          el.classList.add('scale-pulse');
        });
      });

      app.onClick('#btn-show-more', e => app.all('#more-content', div => {
        e.target.classList.add('is-expanded');
        div.style = `max-height:${div.scrollHeight}px`;
      }) || e.target.remove());
    }
}

Product.initiateWhenReady(['product.single']);
