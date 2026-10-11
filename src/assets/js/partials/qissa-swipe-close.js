// ============================================================================
// Swipe a drawer shut (shared) — drag the panel back toward the edge it slid
// in from and let go: the cart drawer (left edge) closes on a swipe to the
// left, the menu (right edge in Arabic) on a swipe to the right.
//
//   swipeToClose(panel, {
//     side,      'left' | 'right', or a function returning one: the edge the
//                panel sits against
//     close,     the drawer's own close()
//     backdrop,  optional: the dim layer, faded as the panel leaves
//     enabled,   optional: () => bool, asked when a finger lands
//   })
//
// The panel follows the finger. Let go past 30% of its width, or with a quick
// flick, and it slides the rest of the way and close() runs; anything less
// and it springs back. A drag the other way does nothing.
//
// What it leaves alone:
//   - scrolling: `touch-action: pan-y` keeps the up-and-down scroll with the
//     browser, and a gesture that starts more vertical than sideways is never
//     read as a swipe;
//   - a row that scrolls sideways (a carousel inside the drawer), and text
//     fields: a finger that lands on one keeps its own behaviour;
//   - the mouse: touch and pen only.
//
// Used by: app.js (the mobile menu), qissa-cart-drawer.js.
// ============================================================================

const SLOP = 10;      // px the finger travels before the gesture is read at all
const CLOSE_AT = 0.3; // share of the panel's width: let go past it and it closes
const FLICK = 0.45;   // px per ms: a flick this fast closes it from anywhere
const SETTLE = 200;   // ms: the slide after the finger lifts

// a finger on one of these keeps the element's own behaviour
const OWN_GESTURE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-no-swipe]';

function keepsItsGesture(target, panel) {
  for (let el = target; el && el !== panel; el = el.parentElement) {
    if (el.matches(OWN_GESTURE)) return true;
    if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

export function swipeToClose(panel, { side, close, backdrop = null, enabled = null }) {
  if (!panel || typeof close !== 'function' || !window.PointerEvent) return;

  panel.style.touchAction = 'pan-y';

  let gesture = null; // the finger on the panel, from pointerdown to pointerup
  let timer = 0;      // set while the panel slides after the finger lifts

  const reset = () => {
    timer = 0;
    panel.style.transition = '';
    panel.style.transform = '';
    if (backdrop) {
      backdrop.style.transition = '';
      backdrop.style.opacity = '';
    }
  };

  // slide the rest of the way out and close, or back into place
  const settle = (shut, dir) => {
    const done = () => {
      if (shut) close();
      reset();
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
    panel.style.transition = `transform ${SETTLE}ms ease-out`;
    panel.style.transform = shut ? `translateX(${dir * 100}%)` : 'translateX(0)';
    if (backdrop) {
      backdrop.style.transition = `opacity ${SETTLE}ms ease-out`;
      backdrop.style.opacity = shut ? '0' : '';
    }
    timer = setTimeout(done, SETTLE + 30);
  };

  const end = (event, cancelled) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (!g.dragging) return;
    settle(!cancelled && (g.offset > g.width * CLOSE_AT || (g.speed > FLICK && g.offset > SLOP)), g.dir);
  };

  panel.addEventListener('pointerdown', (event) => {
    if (timer || (gesture && gesture.dragging)) return;
    gesture = null;
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    if (enabled && !enabled()) return;
    if (keepsItsGesture(event.target, panel)) return;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dir: (typeof side === 'function' ? side() : side) === 'right' ? 1 : -1,
      dragging: false,
    };
  });

  panel.addEventListener('pointermove', (event) => {
    const g = gesture;
    if (!g || event.pointerId !== g.id) return;

    if (!g.dragging) {
      const dx = event.clientX - g.x;
      const dy = event.clientY - g.y;
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // a scroll, or a drag away from the drawer's own edge: not a swipe to close
      if (Math.abs(dy) >= Math.abs(dx) || dx * g.dir <= 0) { gesture = null; return; }
      g.dragging = true;
      g.x = event.clientX; // the panel starts moving from where it is, not SLOP px on
      g.width = panel.getBoundingClientRect().width || 1;
      g.offset = 0;
      g.speed = 0;
      g.lastX = event.clientX;
      g.lastT = event.timeStamp;
      // the lines under the finger can be redrawn mid-swipe: keep the events on the panel
      try { panel.setPointerCapture(event.pointerId); } catch (e) { /* not a live pointer */ }
      panel.style.transition = 'none';
      if (backdrop) backdrop.style.transition = 'none';
    }

    g.offset = Math.min(Math.max((event.clientX - g.x) * g.dir, 0), g.width);
    const dt = event.timeStamp - g.lastT;
    if (dt > 0) {
      g.speed = g.speed * 0.4 + (((event.clientX - g.lastX) * g.dir) / dt) * 0.6;
      g.lastX = event.clientX;
      g.lastT = event.timeStamp;
    }
    panel.style.transform = `translateX(${g.dir * g.offset}px)`;
    if (backdrop) backdrop.style.opacity = String(1 - g.offset / g.width);
  });

  panel.addEventListener('pointerup', event => end(event, false));
  // the browser took the gesture over (a scroll): back into place
  panel.addEventListener('pointercancel', event => end(event, true));
  // the panel's own loss only: on a touch screen the element under the finger holds the
  // pointer first, and its loss, as the panel takes over, bubbles up to here mid-swipe
  panel.addEventListener('lostpointercapture', (event) => { if (event.target === panel) end(event, true); });
}
