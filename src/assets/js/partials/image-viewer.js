/**
 * Image viewer — the product photo, full screen, with a real zoom.
 *
 * The product page used to hand a click on the photo to fslightbox, which
 * shows the picture fitted to the screen and nothing more: no way to look
 * closer. This viewer keeps the full-screen stage and adds the zoom:
 *
 *   click / tap            zoom in on that point; again to zoom out
 *   drag                   move the zoomed picture; swipe to the next one at 1×
 *   pinch                  zoom with two fingers (1× – 4×)
 *   wheel                  zoom at the pointer
 *   + / −  ·  0            zoom in / out  ·  back to 1×
 *   ← →                    previous / next (mirrored in Arabic)
 *   Esc, ✕, the backdrop   close; focus goes back to what opened it
 *
 * Used by the product page gallery (bindGallery) and by the quick view's photo
 * (openImageViewer). One instance for the page, kept on `window` because two
 * bundles import this file (product.js and product-card.js).
 *
 * Binding is safe at any point of the page load. The labels are the theme's
 * translations (blocks.qissa.*), read from `salla.lang` when the viewer first
 * opens — always after a click, so the SDK is there by then.
 * Videos are not handled: a video slide keeps fslightbox.
 * Switch: Theme Settings → «تكبير صورة المنتج عند الضغط» (`image_viewer`);
 * off puts `window.image_viewer = 'off'` and the photo opens as it used to.
 * Styles: 04-components/image-viewer.scss.
 */

const MAX = 4;
const STEP = 2.5;             // what one click zooms to
const TAP_MOVE = 8;           // px a pointer may travel and still be a tap
const SWIPE = 56;             // px of horizontal travel that turns the page at 1×

const tr = (key, params) => (window.salla && salla.lang ? salla.lang.get(`blocks.qissa.${key}`, params) : '');

const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const svg = d => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const IC = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5"/>'),
  minus: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8.5 11h5"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  right: svg('<path d="M9 6l6 6-6 6"/>'),
};

class ImageViewer {
  constructor() {
    this.root = null;
    this.items = [];
    this.i = 0;
    this.s = 1;
    this.x = 0;
    this.y = 0;
    this.pointers = new Map();
    this.onKey = this.onKey.bind(this);
  }

  get rtl() { return document.documentElement.dir !== 'ltr'; }

  build() {
    if (this.root) return;
    const root = document.createElement('div');
    root.className = 'imgv';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', tr('viewer_title'));
    // Physical arrows: «next» sits on the left in Arabic, on the right in English.
    root.innerHTML = `
      <div class="imgv__bar">
        <span class="imgv__count" aria-live="polite"></span>
        <span class="imgv__tools">
          <button type="button" class="imgv__btn" data-imgv="zoom" aria-label="${esc(tr('zoom_in'))}">${IC.plus}</button>
          <button type="button" class="imgv__btn" data-imgv="close" aria-label="${esc(tr('viewer_close'))}">${IC.close}</button>
        </span>
      </div>
      <div class="imgv__stage" data-imgv="stage"><img class="imgv__img" alt="" draggable="false" decoding="async"></div>
      <button type="button" class="imgv__nav imgv__nav--l" data-imgv="left" aria-label="${esc(tr(this.rtl ? 'next_photo' : 'prev_photo'))}">${IC.left}</button>
      <button type="button" class="imgv__nav imgv__nav--r" data-imgv="right" aria-label="${esc(tr(this.rtl ? 'prev_photo' : 'next_photo'))}">${IC.right}</button>
      <p class="imgv__hint">${esc(tr('zoom_hint'))}</p>`;
    document.body.appendChild(root);
    this.root = root;
    this.stage = root.querySelector('.imgv__stage');
    this.img = root.querySelector('.imgv__img');
    this.count = root.querySelector('.imgv__count');
    this.zoomBtn = root.querySelector('[data-imgv="zoom"]');

    root.addEventListener('click', e => {
      const b = e.target.closest('[data-imgv]');
      const a = b && b.dataset.imgv;
      if (a === 'close') this.close();
      else if (a === 'zoom') this.toggle();
      else if (a === 'left') this.step(this.rtl ? 1 : -1);
      else if (a === 'right') this.step(this.rtl ? -1 : 1);
    });

    const st = this.stage;
    st.addEventListener('pointerdown', e => this.down(e));
    st.addEventListener('pointermove', e => this.move(e));
    st.addEventListener('pointerup', e => this.up(e));
    st.addEventListener('pointercancel', e => this.up(e, true));
    st.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoomAt(this.s * Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY, true);
    }, { passive: false });
    this.img.addEventListener('load', () => { this.root.classList.remove('is-loading'); this.apply(true); });
    window.addEventListener('resize', () => { if (this.isOpen) this.apply(true); }, { passive: true });
  }

  /* ---- open / close ---- */

  open(items, index = 0, opts = {}) {
    const list = (items || []).filter(it => it && it.url);
    if (!list.length) return false;
    this.build();
    this.items = list;
    this.trigger = opts.trigger || document.activeElement;
    this.isOpen = true;
    this.root.hidden = false;
    this.root.classList.toggle('is-single', list.length < 2);
    this.root.classList.remove('is-touched');
    // The page behind must not scroll under the stage.
    this.pageOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', this.onKey, true);
    this.show(clamp(index, 0, list.length - 1));
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.root.querySelector('[data-imgv="close"]').focus({ preventScroll: true });
    return true;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.pointers.clear();
    this.root.classList.remove('is-open');
    this.root.hidden = true;
    document.documentElement.style.overflow = this.pageOverflow || '';
    document.removeEventListener('keydown', this.onKey, true);
    const back = this.trigger;
    if (back && back.isConnected && back.focus) back.focus({ preventScroll: true });
  }

  show(i) {
    this.i = i;
    const it = this.items[i];
    this.s = 1; this.x = 0; this.y = 0;
    this.root.classList.add('is-loading');
    this.img.alt = it.alt || '';
    if (this.img.getAttribute('src') !== it.url) this.img.src = it.url;
    else this.root.classList.remove('is-loading');
    this.count.textContent = this.items.length > 1 ? tr('photo_count', { current: i + 1, total: this.items.length }) : '';
    this.apply(true);
    // The neighbours, so the next step does not wait on the network.
    [i - 1, i + 1].forEach(k => { const n = this.items[k]; if (n) { const p = new Image(); p.src = n.url; } });
  }

  step(d) {
    const n = this.items.length;
    if (n < 2) return;
    this.show((this.i + d + n) % n);
  }

  /* ---- zoom + pan ---- */

  /** Half the distance the picture overhangs the stage on each axis at scale s. */
  bounds(s = this.s) {
    const w = this.img.offsetWidth * s;
    const h = this.img.offsetHeight * s;
    return { x: Math.max(0, (w - this.stage.clientWidth) / 2), y: Math.max(0, (h - this.stage.clientHeight) / 2) };
  }

  apply(instant) {
    const b = this.bounds();
    this.x = clamp(this.x, -b.x, b.x);
    this.y = clamp(this.y, -b.y, b.y);
    this.img.style.transition = instant || reduced() ? 'none' : '';
    this.img.style.transform = `translate3d(${this.x}px,${this.y}px,0) scale(${this.s})`;
    const zoomed = this.s > 1.01;
    this.root.classList.toggle('is-zoomed', zoomed);
    this.zoomBtn.innerHTML = zoomed ? IC.minus : IC.plus;
    this.zoomBtn.setAttribute('aria-label', tr(zoomed ? 'zoom_out' : 'zoom_in'));
  }

  /** Zoom to `s`, keeping the picture point under (cx, cy) where it is. */
  zoomAt(s, cx, cy, instant) {
    const next = clamp(s, 1, MAX);
    const r = this.stage.getBoundingClientRect();
    const px = cx - (r.left + r.width / 2);
    const py = cy - (r.top + r.height / 2);
    const k = next / this.s;
    this.x = px - (px - this.x) * k;
    this.y = py - (py - this.y) * k;
    this.s = next;
    if (next === 1) { this.x = 0; this.y = 0; }
    this.root.classList.add('is-touched');
    this.apply(instant);
  }

  toggle(cx, cy) {
    const r = this.stage.getBoundingClientRect();
    this.zoomAt(this.s > 1.01 ? 1 : STEP, cx == null ? r.left + r.width / 2 : cx, cy == null ? r.top + r.height / 2 : cy);
  }

  /* ---- pointers: tap, drag, swipe, pinch ---- */

  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.stage.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.g = { x0: e.clientX, y0: e.clientY, tx: this.x, ty: this.y, moved: 0, onImg: e.target === this.img, pinch: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.g.pinch = true;
      this.g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.g.s0 = this.s;
    }
  }

  move(e) {
    if (!this.pointers.has(e.pointerId) || !this.g) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = this.g;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.zoomAt(g.s0 * (d / g.d0), (a.x + b.x) / 2, (a.y + b.y) / 2, true);
      return;
    }
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    g.moved = Math.max(g.moved, Math.hypot(dx, dy));
    if (g.pinch || this.s <= 1.01) return;   // at 1× a drag is a swipe, read on release
    this.x = g.tx + dx;
    this.y = g.ty + dy;
    this.root.classList.add('is-dragging');
    this.apply(true);
  }

  up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.g;
    if (!g || this.pointers.size) return;   // a finger of a pinch is still down
    this.g = null;
    this.root.classList.remove('is-dragging');
    if (cancelled || g.pinch) { this.apply(); return; }
    const dx = e.clientX - g.x0;
    if (g.moved <= TAP_MOVE) {
      // A tap on the picture zooms; a tap on the dark around it closes.
      if (g.onImg) this.toggle(e.clientX, e.clientY);
      else if (this.s <= 1.01) this.close();
      else this.zoomAt(1, e.clientX, e.clientY);
      return;
    }
    if (this.s <= 1.01 && Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(e.clientY - g.y0)) {
      // The picture follows the finger: dragging it away brings the next one in.
      this.step((dx < 0) === this.rtl ? -1 : 1);
    }
  }

  onKey(e) {
    if (!this.isOpen) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); this.step((k === 'ArrowLeft') === this.rtl ? 1 : -1); return; }
    if (k === '+' || k === '=') { e.preventDefault(); this.zoomAt(this.s * 1.5, innerWidth / 2, innerHeight / 2); return; }
    if (k === '-' || k === '_') { e.preventDefault(); this.zoomAt(this.s / 1.5, innerWidth / 2, innerHeight / 2); return; }
    if (k === '0') { e.preventDefault(); this.zoomAt(1, innerWidth / 2, innerHeight / 2); return; }
    if (k === 'Tab') {
      // keep focus on the viewer's own controls
      const f = [...this.root.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !this.root.contains(at))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !this.root.contains(at))) { e.preventDefault(); first.focus(); }
    }
  }
}

const viewer = () => (window.__imageViewer = window.__imageViewer || new ImageViewer());

/** Off when the merchant switched it off (master.twig prints the setting). */
export const imageViewerOn = () => window.image_viewer !== 'off';

/** items: [{ url, alt }] · index: which one to start on · opts.trigger: where focus returns. */
export function openImageViewer(items, index = 0, opts = {}) {
  return imageViewerOn() ? viewer().open(items, index, opts) : false;
}

/**
 * The product page gallery: a click on a photo opens the viewer on it.
 *
 * The gallery's slides are `a[data-fslightbox]` (href = the full-size file),
 * which fslightbox binds itself. This listens on the document in the CAPTURE
 * phase, so it gets the click first and keeps it from fslightbox — no template
 * change, and the anchors still work as plain links without JS. Video slides
 * are left to fslightbox.
 *
 * Swiper cancels the click that ends a swipe further down the tree, after this
 * listener has run, so the pointer's travel is checked here instead. A click
 * made without a pointer (`detail` 0: Enter on a slide, or the gallery's own
 * zoom button pressing the active slide — single.twig) has no travel to check.
 */
export function bindGallery(selector = '.image-slider') {
  if (window.__imageViewerBound) return;
  window.__imageViewerBound = true;
  let x0 = 0;
  let y0 = 0;
  document.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY; }, true);
  const isPhoto = a => !a.classList.contains('video-entry') && !a.querySelector('video, lite-youtube, iframe')
    && /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(a.getAttribute('href') || '');
  document.addEventListener('click', e => {
    if (!imageViewerOn() || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[data-fslightbox]');
    const box = a && a.closest(selector);
    if (!box || !isPhoto(a)) return;
    if (e.detail && Math.hypot(e.clientX - x0, e.clientY - y0) > TAP_MOVE) return;   // the end of a swipe
    const seen = new Set();
    const items = [];
    box.querySelectorAll('a[data-fslightbox]').forEach(el => {
      // a looping slider repeats its slides; each photo goes in once
      if (!isPhoto(el) || seen.has(el.href)) return;
      seen.add(el.href);
      const img = el.querySelector('img');
      items.push({ url: el.href, alt: (img && img.alt) || '' });
    });
    const index = Math.max(0, items.findIndex(it => it.url === a.href));
    // the zoom button's press: focus goes back to the button, not the slide
    const from = !e.detail && document.activeElement && document.activeElement.closest(selector) ? document.activeElement : a;
    if (!openImageViewer(items, index, { trigger: from })) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}
