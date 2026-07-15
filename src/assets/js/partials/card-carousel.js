// ============================================================================
// Product-card image carousel behavior (shared).
// Markup contract (built by product-card.js and components.partials.qprod-image):
//   <wrapper position:relative>
//     <div class="qpc-carousel" data-qpc>
//       <a class="qpc-slide"><img/></a> ...
//     </div>
//     <div class="qpc-dots"><button class="qpc-dot" data-i="0">...</div>
//   </wrapper>
//
// Touch swipe is handled natively by CSS scroll-snap (fast, GPU-accelerated).
// This module adds: active-dot sync, tap-a-dot-to-glide, and MOUSE drag-to-swipe
// for desktop (native scroll only swipes with touch/trackpad). A real drag is
// prevented from triggering the slide's product link.
// ============================================================================

const DRAG_THRESHOLD = 6; // px moved before a mouse gesture counts as a drag

// Snap to whichever slide is closest to the carousel center. Uses viewport
// rects so it is correct in both RTL and LTR (no scrollLeft sign math).
function snapNearest(carousel, slides) {
  const box = carousel.getBoundingClientRect();
  const center = box.left + box.width / 2;
  let best = null;
  let bestDist = Infinity;
  slides.forEach((slide) => {
    const r = slide.getBoundingClientRect();
    const dist = Math.abs(r.left + r.width / 2 - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = slide;
    }
  });
  if (best) best.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

export function enhanceCarousel(carousel) {
  if (!carousel || carousel.dataset.qpcReady) return;
  const slides = Array.from(carousel.querySelectorAll('.qpc-slide'));
  if (slides.length < 2) return;
  carousel.dataset.qpcReady = '1';

  // Dots live as a sibling under the same positioned wrapper.
  const wrap = carousel.parentElement;
  const dots = wrap ? Array.from(wrap.querySelectorAll('.qpc-dot')) : [];
  const activate = (i) => dots.forEach((d, di) => d.classList.toggle('is-active', di === i));

  // ---- sync the active dot to the centered slide ----
  if ('IntersectionObserver' in window && dots.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) activate(slides.indexOf(e.target));
      });
    }, { root: carousel, threshold: 0.6 });
    slides.forEach((s) => io.observe(s));
  }

  // ---- tap a dot → glide to that slide ----
  dots.forEach((dot) => {
    dot.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const i = Number(dot.dataset.i) || 0;
      if (slides[i]) slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  // ---- mouse drag-to-swipe (touch already swipes natively) ----
  // Links and images are natively draggable; that native drag would preempt our
  // pointer scroll, so cancel it inside the carousel.
  carousel.addEventListener('dragstart', (e) => e.preventDefault());

  let down = false;
  let moved = false;
  let suppressClick = false;
  let startX = 0;
  let startLeft = 0;

  carousel.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;   // leave touch / pen to native scroll
    down = true;
    moved = false;
    startX = e.clientX;
    startLeft = carousel.scrollLeft;
    // NOTE: no setPointerCapture here — capturing the pointer makes the trailing
    // click fire on the carousel instead of the link, which blocks navigation.
  });

  carousel.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    moved = true;
    carousel.classList.add('is-dragging');   // suspends snap while dragging
    carousel.scrollLeft = startLeft - dx;     // content follows the pointer (RTL-safe)
    e.preventDefault();
  });

  const end = () => {
    if (!down) return;
    down = false;
    if (!moved) return;
    carousel.classList.remove('is-dragging');
    snapNearest(carousel, slides);
    // Swallow the click that fires right after a drag so it doesn't open the product.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
  };

  carousel.addEventListener('pointerup', end);
  carousel.addEventListener('pointercancel', end);
  carousel.addEventListener('pointerleave', end);

  carousel.addEventListener('click', (e) => {
    if (suppressClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    }
  }, true);
}

// Enhance every carousel found under `root` (a document, element, or component).
export function enhanceCarousels(root) {
  const scope = root || document;
  scope.querySelectorAll('.qpc-carousel[data-qpc]').forEach(enhanceCarousel);
}
