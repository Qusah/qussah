/**
 * Product Hero card (components/partials/qpack-card.twig) — qissa-package and
 * qissa-dual-hero. Wires every [data-qpack] card on the page once:
 *
 *   · the swipeable main image, synced with its thumbnails;
 *   · «ماذا يوجد في البكج» — the quick view's own description parser, so the
 *     card and the ticket list the same pack contents (subtitle split on «،»
 *     when the description has no list; hidden when there is nothing);
 *   · «اشترِ الآن» — add one, then straight to checkout, the quick view's buy
 *     flow (salla.cart.submit sends a guest to Salla's login first). If the add
 *     fails (options, stock…) the product's page takes over; if only the
 *     checkout step fails, the item is in the cart, so go there.
 *
 * product-card.js runs it on every page. Nothing here touches salla.* before a
 * click (Rocket Loader may run the SDK after this file).
 */
import { insideLines } from './qissa-quick-view';

const INSIDE_MAX = 6;   // Figma: three rows of two

function fillInside(card) {
  const list = card.querySelector('[data-qpack-inside]');
  if (!list) return;
  let items = insideLines(list.getAttribute('data-qpack-inside') || '');
  if (!items.length) {
    items = (list.getAttribute('data-qpack-sub') || '').split('،').map(s => s.trim()).filter(Boolean);
  }
  items.slice(0, INSIDE_MAX).forEach(text => {
    const li = document.createElement('li');
    li.className = 'qpack__inside-item';
    li.textContent = text;
    li.title = text;   // the wide layout's boxes are one line; the full line on hover
    list.appendChild(li);
  });
  if (items.length) list.hidden = false;
}

function gallery(card) {
  const main = card.querySelector('[data-qpack-main]');
  if (!main) return;
  const thumbs = card.querySelector('[data-qpack-thumbs]');
  const slides = [...main.querySelectorAll('.qpack__slide')];
  const thumbBtns = thumbs ? [...thumbs.querySelectorAll('.qpack__thumb')] : [];
  let idx = 0, lock = false, lockT, settleT, raf;

  // centre an element within its OWN scroll container (RTL-safe, no page jump)
  const centerIn = (container, el) => {
    if (!container || !el) return;
    const cr = container.getBoundingClientRect(), er = el.getBoundingClientRect();
    const delta = (er.left + er.width / 2) - (cr.left + cr.width / 2);
    if (Math.abs(delta) < 2) return;
    container.scrollBy({ left: delta, behavior: 'smooth' });
  };
  const thumbsScroll = () => thumbs && thumbs.scrollWidth > thumbs.clientWidth;
  const setActive = i => thumbBtns.forEach((b, k) => {
    if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
  // index of the image currently centred in the main viewport (RTL-safe)
  const current = () => {
    const r = main.getBoundingClientRect(), mid = r.left + r.width / 2;
    let best = 0, bd = Infinity;
    slides.forEach((s, k) => {
      const sr = s.getBoundingClientRect(), d = Math.abs(sr.left + sr.width / 2 - mid);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  };
  const go = i => {
    idx = Math.max(0, Math.min(slides.length - 1, i));
    lock = true;   // ignore the scroll events our own animation fires
    centerIn(main, slides[idx]);
    if (thumbsScroll()) centerIn(thumbs, thumbBtns[idx]);
    setActive(idx);
    clearTimeout(lockT);
    lockT = setTimeout(() => { lock = false; }, 450);
  };

  setActive(0);
  thumbBtns.forEach((btn, i) => btn.addEventListener('click', () => go(i)));

  main.addEventListener('scroll', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = current();
      setActive(i);
      if (lock) return;
      idx = i;
      clearTimeout(settleT);
      settleT = setTimeout(() => { if (thumbsScroll()) centerIn(thumbs, thumbBtns[idx]); }, 140);
    });
  }, { passive: true });

  // desktop mouse drag on the main image; a drag never counts as a click
  let down = false, sx = 0, sl = 0, moved = false;
  main.addEventListener('mousedown', e => { down = true; moved = false; sx = e.pageX; sl = main.scrollLeft; main.classList.add('is-grabbing'); });
  main.addEventListener('mousemove', e => {
    if (!down) return;
    const dx = e.pageX - sx;
    if (Math.abs(dx) > 3) moved = true;
    main.scrollLeft = sl - dx;
  });
  const endDrag = () => { down = false; main.classList.remove('is-grabbing'); };
  main.addEventListener('mouseup', endDrag);
  main.addEventListener('mouseleave', endDrag);
  main.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
}

function buyNow(card) {
  const buy = card.querySelector('[data-qpack-buy]');
  if (!buy) return;
  buy.addEventListener('click', () => {
    if (!(window.salla && salla.cart) || buy.getAttribute('aria-busy')) return;
    buy.setAttribute('aria-busy', 'true');
    const go = href => { if (href) window.location.href = href; };
    Promise.resolve(salla.cart.addItem({ id: buy.getAttribute('data-id'), quantity: 1 }))
      .then(
        () => Promise.resolve(salla.cart.submit()).catch(() => go(buy.getAttribute('data-cart'))),
        () => go(buy.getAttribute('data-url'))
      )
      .then(() => setTimeout(() => buy.removeAttribute('aria-busy'), 1200));
  });
}

export function initPackCards(root = document) {
  root.querySelectorAll('[data-qpack]:not([data-qpack-init])').forEach(card => {
    card.setAttribute('data-qpack-init', '');
    fillInside(card);
    gallery(card);
    buyNow(card);
  });
}
