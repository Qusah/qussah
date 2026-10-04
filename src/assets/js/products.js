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
 * «تصفية» opens Salla's own filters (<salla-filters>, which talks to the list
 * itself) when the store has product filtering on — this only counts what is
 * picked and resets it — and otherwise lists the store's categories, fetched
 * on first open. «ترتيب» re-sorts the list in place and keeps ?sort= in the
 * URL, as the native select did.
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
        // composedPath, not contains(): Salla's filter widgets re-render on a click,
        // and a target already replaced would read as a click outside
        document.addEventListener('click', event => {
            this.open && !event.composedPath().includes(this.open) && this.toggle(this.open, false);
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !this.open) {
                return;
            }
            const pill = this.open.querySelector('.qlisting__pill');
            this.toggle(this.open, false);
            pill.focus();
        });

        // a ?sort= the page was opened with — Salla's list reads it itself; the
        // «كل المنتجات» page first needs the source Salla sorts (sortableSource)
        const sort = new URLSearchParams(location.search).get('sort');
        const option = sort && this.root.querySelector(`[data-qlisting-sort="${CSS.escape(sort)}"]`);
        if (option) {
            this.markSort(option);
            this.productsList.hasAttribute('data-qlisting-all') && customElements.whenDefined('salla-products-list')
                .then(() => this.sortableSource())
                .then(() => this.productsList.source === 'categories' && this.productsList.reload());
        }

        this.markHere();
        this.initFilters();
    }

    initFilters() {
        this.filters = this.root.querySelector('salla-filters');
        if (!this.filters) {
            return;
        }
        const drop = this.filters.closest('[data-qlisting-drop]');
        const sync = () => this.filters.getFilters && this.filters.getFilters().then(filters => this.markFilters(filters));

        salla.event.on('salla-filters::changed', filters => this.markFilters(filters));
        // after <salla-filters> has taken the new set in (it listens to the same event)
        salla.event.on('filters::fetched', () => {
            drop.hidden = false;
            setTimeout(sync);
        });
        // Salla has no filters for this listing: nothing to open
        salla.event.on('filters::hidden', () => {
            this.open === drop && this.toggle(drop, false);
            drop.hidden = true;
        });
        this.root.querySelector('[data-qlisting-reset]').addEventListener('click', () => this.filters.resetFilters && this.filters.resetFilters());
        sync();
    }

    // «تصفية: كل المنتجات» with nothing picked, «تصفية (2)» otherwise
    markFilters(filters) {
        const page = String(salla.config.get('page.id'));
        const filled = value => value != null && value !== '' && (typeof value !== 'object' || Object.keys(value).length > 0);
        let count = 0;
        Object.keys(filters || {}).forEach(key => {
            const value = filters[key];
            // Salla's payload carries extras (`event`, an empty `param`); the page's
            // own category is the filter Salla adds by itself on a category page
            if (key === 'event' || !filled(value) || (key === 'category_id' && [].concat(value).every(id => String(id) === page))) {
                return;
            }
            count += key === 'variants' ? Object.keys(value || {}).length : 1;
        });
        const badge = this.root.querySelector('[data-qlisting-filter-count]');
        this.root.querySelector('[data-qlisting-filter-all]').hidden = count > 0;
        badge.hidden = !count;
        badge.textContent = ` (${salla.helpers.number(count)})`;
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
        await this.sortableSource();
        this.productsList.sortBy = sort;
        await this.productsList.reload();
        this.productsList.setAttribute('filters', `{"sort": "${sort}"}`);
    }

    // The «كل المنتجات» page lists source "latest" (every product), which Salla
    // never sorts. A sort moves it, once, onto all the store's categories — the
    // widest source Salla does sort.
    async sortableSource() {
        const list = this.productsList;
        if (!list.hasAttribute('data-qlisting-all') || list.source === 'categories') {
            return;
        }
        const ids = (await this.categories()).map(([cat]) => cat.id_).filter(Boolean);
        if (ids.length) {
            list.source = 'categories';
            list.sourceValue = JSON.stringify(ids);
        }
    }

    // the store's categories with their subcategories: [category, is a sub] rows
    categories() {
        this.cats = this.cats || salla.product.api.categories().then(res => {
            const rows = [];
            (res?.data || []).forEach(cat => {
                rows.push([cat, false]);
                (cat.sub_categories || []).forEach(sub => rows.push([sub, true]));
            });
            return rows;
        }).catch(() => {
            this.cats = null;   // ask again next time
            return [];
        });
        return this.cats;
    }

    // «تصفية» without Salla's filters: the categories, after «كل المنتجات»
    loadCategories(menu) {
        if (menu.dataset.loaded) {
            return;
        }
        menu.dataset.loaded = '1';
        const seen = new Set(Array.from(menu.querySelectorAll('a'), a => path(a.href)));
        this.categories().then(rows => {
            if (!rows.length) {
                return menu.removeAttribute('data-loaded');
            }
            menu.insertAdjacentHTML('beforeend', rows
                .filter(([cat]) => cat?.url && !seen.has(path(cat.url)))
                .map(([cat, sub]) => `<li><a class="qlisting__opt${sub ? ' qlisting__opt--sub' : ''}" href="${esc(cat.url)}">${esc(cat.name)}</a></li>`)
                .join(''));
            this.markHere();
        });
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
