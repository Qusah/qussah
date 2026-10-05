/**
 * «أعد طلبك بسرعة» — components/home/qissa-reorder.twig. home.js runs it on
 * theme::ready, so the SDK is there by now.
 *
 *   · A signed-in customer's last order replaces the merchant's picks: the
 *     newest order that can be reordered → its items' products → those
 *     products fetched fresh (today's price and stock) and drawn by the
 *     theme's JS card. The order's product ids are kept for the browser
 *     session, so the two order calls run once per visit. Anything missing or
 *     failing keeps the picks; a section without picks stays hidden unless
 *     this fills it. The item shape (items[].product.id from orders/{id}) is
 *     the one Salla's own salla-order-summary reads.
 *   · «أعد طلب الكل» adds one of each in-stock product to the current cart,
 *     one after another. The cart pill (qissa-cart-toast.js) merges the adds
 *     and reports a refused one — a product that needs its options chosen.
 *   · Phones open the slider on the second card, as the frame draws it.
 *   · A mouse can drag the desktop row when it holds more than three.
 *
 * Product ids stay strings (salla.* calls expect them so).
 */
const MAX = 12;
const KEY = 'qreorder:last-order';
const PHONE = '(max-width: 768px)';

const api = ns => window.salla?.[ns]?.api || window.salla?.[ns];
const isGuest = () => !(window.salla?.config?.isGuest && !salla.config.isGuest());
const idsOf = section => (section.dataset.qreorderIds || '').split(',').filter(Boolean);

async function lastOrderIds() {
  const key = `${KEY}:${salla.config.get('user.id') || ''}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (Array.isArray(hit)) return hit;
  } catch (e) { /* storage blocked — ask the API */ }

  const orders = (await api('order').fetch({}))?.data || [];
  const order = orders.find(o => o?.can_reorder === true)
    || orders.find(o => o?.id && !/cancel|restor|refund/i.test(o.status?.slug || ''));
  let ids = [];
  if (order?.id) {
    const res = await api('order').getDetails(order.id);
    const items = (res?.data || res)?.items || [];
    ids = [...new Set(items.map(i => i?.product?.id).filter(Boolean).map(String))].slice(0, MAX);
  }
  try { sessionStorage.setItem(key, JSON.stringify(ids)); } catch (e) { /* fine */ }
  return ids;
}

async function productsFor(ids) {
  const res = await api('product').fetch({ source: 'selected', source_value: ids, limit: ids.length });
  const byId = new Map((res?.data || []).map(p => [String(p.id), p]));
  return ids.map(id => byId.get(id)).filter(Boolean);   // the order's own order
}

function showProducts(section, products) {
  const track = section.querySelector('[data-qreorder-track]');
  track.replaceChildren(...products.map(p => {
    const card = document.createElement('custom-salla-product-card');
    card.product = p;   // the card reads this before its attribute
    return card;
  }));
  section.dataset.qreorderIds = products
    .filter(p => !p.is_out_of_stock && p.is_available !== false)
    .map(p => p.id).join(',');

  const sub = section.querySelector('[data-qreorder-subtitle]');
  const line = section.dataset.qreorderSub;
  if (sub && line) {
    sub.textContent = line;
    sub.hidden = false;
  }
  section.classList.add('is-personal');
  section.hidden = false;
}

function wireAll(section) {
  const btn = section.querySelector('[data-qreorder-all]');
  if (!btn) return () => {};
  const sync = () => { btn.disabled = !idsOf(section).length; };
  sync();
  btn.addEventListener('click', async () => {
    const ids = idsOf(section);
    if (!ids.length || btn.getAttribute('aria-busy') === 'true') return;
    btn.setAttribute('aria-busy', 'true');
    for (const id of ids) {
      try {
        await salla.cart.addItem({ id, quantity: 1 });
      } catch (e) { /* the cart pill shows why; carry on with the rest */ }
    }
    btn.removeAttribute('aria-busy');
  });
  return sync;
}

// mouse drag for a desktop row of more than three (touch and trackpads
// scroll it natively); a drag never counts as a click on what it started on
function dragToScroll(track) {
  let down = false, moved = false, x0 = 0, s0 = 0;
  track.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || track.scrollWidth <= track.clientWidth) return;
    if (e.target.closest('.qprod__img')) return;   // the photo swipes its own images
    down = true; moved = false; x0 = e.clientX; s0 = track.scrollLeft;
  });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - x0;
    if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('is-dragging'); }
    if (moved) track.scrollLeft = s0 - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    track.classList.remove('is-dragging');   // snapping comes back and settles the row
  });
  track.addEventListener('click', e => {
    if (!moved) return;
    moved = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}

export async function initReorder(root = document) {
  for (const section of root.querySelectorAll('[data-qreorder]:not([data-qreorder-init])')) {
    section.setAttribute('data-qreorder-init', '');
    const track = section.querySelector('[data-qreorder-track]');
    const sync = wireAll(section);
    dragToScroll(track);

    if (!section.hasAttribute('data-qreorder-personal') || isGuest()) continue;
    try {
      const ids = await lastOrderIds();
      const products = ids.length ? await productsFor(ids) : [];
      if (!products.length) continue;
      showProducts(section, products);
      sync();
    } catch (e) { /* keep the merchant's picks */ }
  }
}
