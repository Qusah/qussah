/**
 * The thank-you page, filled from Salla at view time. Shared by the four themes (Qusah, Bareq, Latafa, Nsmat):
 * keep the copies identical.
 *
 * 1. THE STATUS. The status this page is rendered with is not the order's live status (a brand-new COD order read
 *    «تم التنفيذ», 18 Oct 2026), so the template prints none: the status line ships hidden, with an empty
 *    `[data-ty-status-name]`, and is shown only once Salla answers `salla.order.getDetails(order.id)` — the id
 *    from `[data-ty-order]` on the page —
 *    (GET orders/{id}, the customer's own order) with a status name. No answer = no status line, never a guess.
 *    Anything that waits on the status (a wrapper box) carries `data-ty-status-wrap` and is shown with it; a timeline
 *    inside the slot is set from the live status too (placeOnTrack).
 *
 * 2. THE PHOTOS. `item.image` arrives as Salla's grey placeholder. Every item photo slot carries
 *    `data-ty-pid="<product id>"`; the products are read with `salla.product.fetch` (one request) and their own
 *    photo replaces the slot. A failure leaves the page as it rendered.
 */

const PLACEHOLDER = /placeholder/i;

function statusName(order) {
    const s = order && order.status;
    if (!s) return '';
    if (typeof s === 'string') return s.trim();
    return String((s.customized && s.customized.name) || s.name || '').trim();
}

/**
 * A status track (`[data-ty-track]`, steps `[data-ty-step="name|other name"]`): the step naming the live status is
 * the current one, the steps before it are done. A status on no step hides the track and shows `[data-ty-line]`
 * (the status alone) instead.
 */
function placeOnTrack(slot, name) {
    const track = slot.querySelector('[data-ty-track]');
    const line = slot.querySelector('[data-ty-line]');
    if (!track) { if (line) line.hidden = false; return; }
    const steps = Array.from(track.querySelectorAll('[data-ty-step]'));
    const at = steps.findIndex(step => step.getAttribute('data-ty-step').split('|').map(v => v.trim()).includes(name));
    steps.forEach((step, i) => {
        step.classList.toggle('is-now', i === at);
        step.classList.toggle('is-done', at > -1 && i < at);
        if (i === at) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
    track.hidden = at < 0;
    if (line) line.hidden = at > -1;
}

export function loadLiveStatus() {
    const holder = document.querySelector('[data-ty-order]');
    const orderId = holder && holder.getAttribute('data-ty-order');
    const slots = Array.from(document.querySelectorAll('[data-ty-status]'));
    if (!slots.length || !orderId || !window.salla || !salla.order || typeof salla.order.getDetails !== 'function') return;
    const ask = () => salla.order.getDetails(orderId);
    const run = (salla.api && typeof salla.api.withoutNotifier === 'function') ? salla.api.withoutNotifier(ask) : ask();
    Promise.resolve(run)
        .then(res => {
            const order = res && res.data && (res.data.order || res.data);
            const name = statusName(order);
            if (!name) return;
            slots.forEach(slot => {
                slot.querySelectorAll('[data-ty-status-name]').forEach(el => { el.textContent = name; });
                placeOnTrack(slot, name);
                slot.hidden = false;
                const color = order.status && order.status.color;
                if (color && /^#[0-9a-f]{3,8}$/i.test(color)) slot.style.setProperty('--ty-status-color', color);
            });
            document.querySelectorAll('[data-ty-status-wrap]').forEach(el => { el.hidden = false; });
            document.dispatchEvent(new CustomEvent('ty::status', { detail: { name, status: order.status } }));
        })
        .catch(() => {});
}

export function loadItemPhotos() {
    const nodes = Array.from(document.querySelectorAll('[data-ty-pid]'));
    const ids = Array.from(new Set(nodes.map(node => node.getAttribute('data-ty-pid')).filter(Boolean)));
    if (!ids.length || !window.salla || !salla.product || typeof salla.product.fetch !== 'function') return;
    salla.product.fetch({ source: 'selected', source_value: ids.slice(0, 20) })
        .then(res => {
            const photos = {};
            ((res && res.data) || []).forEach(product => {
                const url = product && product.image && product.image.url;
                if (url && !PLACEHOLDER.test(url)) photos[String(product.id)] = url;
            });
            nodes.forEach(node => {
                const url = photos[node.getAttribute('data-ty-pid')];
                if (!url) return;
                const img = node.tagName === 'IMG' ? node : node.querySelector('img');
                if (img) { img.src = url; img.hidden = false; return; }
                const fresh = document.createElement('img');
                fresh.src = url;
                fresh.alt = '';
                fresh.decoding = 'async';
                node.textContent = '';
                node.appendChild(fresh);
            });
        })
        .catch(() => {});
}
