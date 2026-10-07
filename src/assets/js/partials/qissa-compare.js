/**
 * «جدول المقارنة» — components/home/qissa-compare.twig, a product-page block.
 * product.js runs it. The Twig prints the whole table, hidden; this file
 *
 *   · decides whether it belongs on this page: on a product page, and — when
 *     the block lists products — only on one of those;
 *   · makes it speak for the product it is on: the name, subtitle, photo and
 *     price under our column are the page's own wherever the merchant left
 *     them empty (pages/product/single.twig carries them in an inert
 *     <template data-qcmp-product>);
 *   · sets a leading figure larger than its unit («3 طبقات», «0.52 هللة»);
 *   · takes the block out of the narrow details column if it was added there;
 *   · shows the arrows only while the alternatives' columns overflow, and
 *     lets the pillar rise once when the table first comes into view.
 *
 * Nothing is fetched and nothing here touches Salla's own elements.
 */

const FIG = /^([\d.,٠-٩٫٬]+)\s+(\S.*)$/;

function pageProduct() {
  const tpl = document.querySelector('template[data-qcmp-product]');
  if (!tpl) return null;
  const now = tpl.content.querySelector('[data-now]');
  const was = tpl.content.querySelector('[data-was]');
  return {
    id: String(tpl.dataset.id || ''),
    name: tpl.dataset.name || '',
    sub: tpl.dataset.sub || '',
    image: tpl.dataset.image || '',
    now: now ? now.innerHTML.trim() : '',
    was: was ? was.innerHTML.trim() : '',
  };
}

function fill(section, product) {
  const name = section.querySelector('[data-qcmp-f="name"]');
  const sub = section.querySelector('[data-qcmp-f="sub"]');
  const image = section.querySelector('[data-qcmp-f="image"]');
  if (name && !name.textContent.trim()) name.textContent = product.name;
  if (sub && !sub.textContent.trim()) sub.textContent = product.sub;
  if (sub && !sub.textContent.trim()) sub.hidden = true;
  if (image) {
    if (!image.getAttribute('src') && product.image) image.src = product.image;
    image.hidden = !image.getAttribute('src');
  }
  const price = section.querySelector('[data-qcmp-price]');
  if (price && product.now) {
    // Salla's own money markup (the currency mark is its icon), struck price under it
    price.innerHTML = `<span class="qcmp-now">${product.now}</span>`
      + (product.was ? `<span class="qcmp-was"><s>${product.was}</s></span>` : '');
  }
  const caption = document.createElement('caption');
  caption.className = 'qcmp-sr';
  caption.textContent = [name && name.textContent.trim(), ...[...section.querySelectorAll('thead .qcmp-comp')].map(th => th.textContent.trim())].filter(Boolean).join(' · ');
  section.querySelector('table').prepend(caption);
}

function figures(section) {
  section.querySelectorAll('[data-qcmp-fig]').forEach(el => {
    const m = FIG.exec(el.textContent.trim());
    if (!m) return;
    el.textContent = '';
    const n = document.createElement('span');
    n.className = 'qcmp-n';
    n.textContent = m[1];
    const u = document.createElement('span');
    u.className = 'qcmp-u';
    u.textContent = m[2];
    el.append(n, ' ', u);
  });
}

function scrolling(section) {
  const scroller = section.querySelector('[data-qcmp-scroll]');
  const wrap = section.querySelector('[data-qcmp-wrap]');
  const nav = section.querySelector('[data-qcmp-nav]');
  const prev = section.querySelector('[data-qcmp-prev]');
  const next = section.querySelector('[data-qcmp-next]');
  const count = section.querySelector('[data-qcmp-count]');
  const cols = Number(section.dataset.c) || 1;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = () => {
    const th = scroller.querySelector('thead .qcmp-comp');
    return th ? th.getBoundingClientRect().width : 110;
  };
  const sync = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    const can = max > 4;
    nav.hidden = !can;
    if (can) scroller.setAttribute('tabindex', '0'); else scroller.removeAttribute('tabindex');
    const x = Math.abs(scroller.scrollLeft);
    prev.disabled = x < 4;
    next.disabled = x > max - 4;
    wrap.classList.toggle('is-more', can && !next.disabled);
    if (can) count.textContent = `${Math.min(cols, Math.round(x / step()) + 1)} / ${cols}`;
  };
  // rtl: forward is towards the left
  const move = dir => scroller.scrollBy({ left: -dir * step(), behavior: still ? 'auto' : 'smooth' });
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  scroller.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  sync();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);

  // the pillar rises once, when the table first enters the screen; everything is in place without it
  if (!still && section.hasAttribute('data-qcmp-motion') && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      section.classList.add('is-rising');
      io.disconnect();
    });
    io.observe(scroller);
  }
}

export function initCompare(root = document) {
  const sections = [...root.querySelectorAll('[data-qcmp]:not([data-qcmp-init])')];
  if (!sections.length) return;
  const product = pageProduct();
  sections.forEach(section => {
    section.setAttribute('data-qcmp-init', '');
    const only = (section.dataset.qcmpProducts || '').split(',').map(s => s.trim()).filter(Boolean);
    // not a product page, or a product this block was not picked for: it stays out
    if (!product || (only.length && !only.includes(product.id))) { section.remove(); return; }
    // added in the «before reviews» slot it would sit in the narrow details column: give it the page's width
    const more = section.closest('[data-qpd-more]');
    if (more) more.after(section);
    fill(section, product);
    figures(section);
    section.hidden = false;
    scrolling(section);
  });
}
