import "lite-youtube-embed";
import BasePage from "./base-page";
import Lightbox from "fslightbox";
window.fslightbox = Lightbox;

class Home extends BasePage {
    onReady() {
        this.initFeaturedTabs();
        this.initCardCarousels();
    }

    /**
     * Swipe carousel + dot indicators for the hand-built qprod grid cards
     * (qissa-products / qissa-all-products / qissa-listing). The reusable
     * <custom-salla-product-card> wires its own carousel, so those are skipped.
     * Native scroll-snap owns the swipe; here we only sync the active dot and
     * let a dot tap glide to its slide.
     */
    initCardCarousels() {
        document.querySelectorAll('.qpc-carousel[data-qpc]').forEach((car) => {
            if (car.closest('custom-salla-product-card') || car.dataset.qpcReady) return;
            car.dataset.qpcReady = '1';

            const slides = Array.from(car.querySelectorAll('.qpc-slide'));
            const dotsWrap = car.parentElement && car.parentElement.querySelector('.qpc-dots');
            const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll('.qpc-dot')) : [];
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
                    slides[i] && slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                });
            });
        });
    }

    /**
     * used in views/components/home/featured-products-style*.twig
     */
    initFeaturedTabs() {
        app.all('.tab-trigger', el => {
            el.addEventListener('click', ({ currentTarget: btn }) => {
                let id = btn.dataset.componentId;
                // btn.setAttribute('fill', 'solid');
                app.toggleClassIf(`#${id} .tabs-wrapper>div`, 'is-active opacity-0 translate-y-3', 'inactive', tab => tab.id == btn.dataset.target)
                    .toggleClassIf(`#${id} .tab-trigger`, 'is-active', 'inactive', tabBtn => tabBtn == btn);

                // fadeIn active tabe
                setTimeout(() => app.toggleClassIf(`#${id} .tabs-wrapper>div`, 'opacity-100 translate-y-0', 'opacity-0 translate-y-3', tab => tab.id == btn.dataset.target), 100);
            })
        });
        document.querySelectorAll('.s-block-tabs').forEach(block => block.classList.add('tabs-initialized'));
    }
}

Home.initiateWhenReady(['index']);