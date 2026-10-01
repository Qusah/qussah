import BasePage from './base-page';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
const path = href => {
    try {
        return decodeURI(new URL(href, location.href).pathname).replace(/\/$/, '');
    } catch (e) {
        return '';
    }
};

/**
 * Product listing (pages/product/index.twig): the two pills over Salla's list.
 * «تصفية» lists the store's categories, fetched on first open; «ترتيب» re-sorts
 * the list in place and keeps ?sort= in the URL, as the native select did.
 */
class Products extends BasePage {
    onReady() {
        this.root = app.element('[data-qlisting]');
        if (!this.root) {
            return;
        }
        this.productsList = this.root.querySelector('salla-products-list');
        this.open = null;

        this.root.querySelectorAll('[data-qlisting-drop]').forEach(drop => {
            drop.querySelector('.qlisting__pill').addEventListener('click', () => this.toggle(drop, !drop.classList.contains('is-open')));
        });
        this.root.addEventListener('click', event => {
            const option = event.target.closest('[data-qlisting-sort]');
            option && this.sortBy(option);
        });
        document.addEventListener('click', event => {
            this.open && !this.open.contains(event.target) && this.toggle(this.open, false);
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !this.open) {
                return;
            }
            const pill = this.open.querySelector('.qlisting__pill');
            this.toggle(this.open, false);
            pill.focus();
        });

        // a ?sort= the page was opened with — Salla's list reads it itself
        const sort = new URLSearchParams(location.search).get('sort');
        const option = sort && this.root.querySelector(`[data-qlisting-sort="${CSS.escape(sort)}"]`);
        option && this.markSort(option);

        this.markHere();
    }

    toggle(drop, on) {
        if (on && this.open && this.open !== drop) {
            this.toggle(this.open, false);
        }
        const menu = drop.querySelector('.qlisting__menu');
        drop.classList.toggle('is-open', on);
        drop.querySelector('.qlisting__pill').setAttribute('aria-expanded', on);
        menu.hidden = !on;
        this.open = on ? drop : null;
        on && menu.matches('[data-qlisting-cats]') && this.loadCategories(menu);
    }

    markSort(option) {
        this.root.querySelectorAll('[data-qlisting-sort]').forEach(btn => {
            btn.classList.toggle('is-on', btn === option);
            btn === option ? btn.setAttribute('aria-current', 'true') : btn.removeAttribute('aria-current');
        });
        const name = this.root.querySelector('[data-qlisting-sort-name]');
        name && (name.textContent = option.textContent);
    }

    async sortBy(option) {
        this.open && this.toggle(this.open, false);
        if (option.classList.contains('is-on') || !this.productsList) {
            return;
        }
        const sort = option.dataset.qlistingSort;
        this.markSort(option);
        window.history.replaceState(null, null, salla.helpers.addParamToUrl('sort', sort));
        this.productsList.sortBy = sort;
        await this.productsList.reload();
        this.productsList.setAttribute('filters', `{"sort": "${sort}"}`);
    }

    // the store's categories (and their subcategories) after «كل المنتجات»
    loadCategories(menu) {
        if (menu.dataset.loaded) {
            return;
        }
        menu.dataset.loaded = '1';
        const seen = new Set(Array.from(menu.querySelectorAll('a'), a => path(a.href)));
        salla.product.api.categories().then(res => {
            const rows = [];
            (res?.data || []).forEach(cat => {
                rows.push([cat, false]);
                (cat.sub_categories || []).forEach(sub => rows.push([sub, true]));
            });
            menu.insertAdjacentHTML('beforeend', rows
                .filter(([cat]) => cat?.url && !seen.has(path(cat.url)))
                .map(([cat, sub]) => `<li><a class="qlisting__opt${sub ? ' qlisting__opt--sub' : ''}" href="${esc(cat.url)}">${esc(cat.name)}</a></li>`)
                .join(''));
            this.markHere();
        }).catch(() => menu.removeAttribute('data-loaded'));
    }

    // the category this page shows
    markHere() {
        const here = path(location.href);
        this.root.querySelectorAll('[data-qlisting-cats] a').forEach(a => {
            const on = path(a.href) === here;
            a.classList.toggle('is-on', on);
            on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
        });
    }
}

Products.initiateWhenReady([
    'product.index',
    'product.index.latest',
    'product.index.offers', 'product.index.search',
    'product.index.tag',
]);
