import BasePage from './base-page';

class ThankYou extends BasePage {
    onReady() {
        document.querySelectorAll('.thanks-item').forEach((item, i) => {
            item.style.animationDelay = `${i * 100}ms`;
            item.classList.add('slide-in-start');
        });
        let form = document.querySelector('#invoice-form');
        salla.order.event.onInvoiceSent(res =>{
            form.innerHTML = res.data.message;
            form.classList.add('sent');
        });
        this.fixReceiptSum();
        this.loadItemPhotos();
    }

    /**
     * The order ticket (thank_you_redesign). Salla gives this page item.image as its grey
     * placeholder, so the real photos are read from the products themselves. Any failure
     * leaves the page as it rendered.
     */
    loadItemPhotos() {
        const nodes = Array.from(document.querySelectorAll('.qty [data-qty-pid]'));
        const ids = Array.from(new Set(nodes.map(node => node.getAttribute('data-qty-pid')).filter(Boolean)));
        if (!ids.length || !salla.product || typeof salla.product.fetch !== 'function') return;
        salla.product.fetch({source: 'selected', source_value: ids.slice(0, 20)})
            .then(res => {
                const photos = {};
                ((res && res.data) || []).forEach(product => {
                    if (product && product.image && product.image.url) photos[String(product.id)] = product.image.url;
                });
                nodes.forEach(node => {
                    const url = photos[node.getAttribute('data-qty-pid')];
                    if (!url) return;
                    if (node.tagName === 'IMG') { node.src = url; return; }
                    const img = document.createElement('img');
                    img.src = url; img.alt = ''; img.width = 76; img.height = 76;
                    node.replaceWith(img);
                });
            })
            .catch(() => {});
    }

    /**
     * The receipt on the order ticket. When the lines above the total do not add up to it
     * (this page gets no shipping cost on some orders), one line carries the difference so
     * the receipt reads true. Nothing is added when a shipping line is already printed.
     */
    fixReceiptSum() {
        const sum = document.querySelector('.qty [data-qty-sum]');
        if (!sum || sum.querySelector('[data-qty-row="ship"]')) return;
        const total = sum.querySelector('[data-qty-row="total"]');
        const parts = Array.from(sum.querySelectorAll('[data-qty-row="part"]'));
        if (!total || !parts.length) return;
        const digits = {'٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9};
        const read = row => {
            const text = (row.querySelector('dd').textContent || '').replace(/[٠-٩]/g, d => digits[d]).replace(/٫/g, '.').replace(/[٬,]/g, '');
            const match = text.match(/\d+(\.\d+)?/);
            if (!match) return NaN;
            return (/[-−]/.test(text) ? -1 : 1) * parseFloat(match[0]);
        };
        const rest = Math.round((read(total) - parts.reduce((all, row) => all + read(row), 0)) * 100) / 100;
        if (!(rest > 0)) return;                       // NaN, zero and negative all leave the receipt alone
        const row = parts[0].cloneNode(true);
        row.setAttribute('data-qty-row', 'rest');
        row.querySelector('dt').textContent = sum.getAttribute('data-rest-label') || '';
        const walker = document.createTreeWalker(row.querySelector('dd'), NodeFilter.SHOW_TEXT);
        let node, done = false;
        while ((node = walker.nextNode())) {
            if (!done && /[\d٠-٩]/.test(node.nodeValue)) {
                node.nodeValue = node.nodeValue.replace(/[-−]?[\d٠-٩][\d٠-٩.,٫٬]*/, rest.toLocaleString('en-US', {maximumFractionDigits: 2}));
                done = true;
            }
        }
        if (done) total.parentNode.insertBefore(row, total);
    }
}

ThankYou.initiateWhenReady(['thank-you']);
