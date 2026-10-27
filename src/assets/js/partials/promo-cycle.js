// ============================================================================
// Rotating promotion title — «النص الترويجي» with commas (shared).
//
// A merchant who writes the product's promotion title as «الأكثر طلبًا، شحن مجاني»
// gets each part in turn on the badge: two seconds each, a short fade between,
// back to the first after the last, for as long as the page is open. The
// comma can be the Latin «,» or the Arabic «،». One part (no comma) is left
// exactly as it was — nothing here touches it.
//
// The badge is printed with only the first part as its text and the full value
// in data-promo-cycle (partials/qpromo-badge.twig, and promoBadgeAttr() below
// for the JS card), so it reads well before this file runs. Here every part is
// stacked in one grid cell — the badge keeps the width of its longest part and
// never jumps — and one page-wide timer moves every badge together. The timer
// rests while the tab is hidden. Cards drawn later (Salla lists, infinite
// scroll) are picked up by one MutationObserver; each badge is set up once.
//
// Screen readers hear every part once (a visually hidden copy); the rotating
// parts are aria-hidden. Reduced motion keeps the rotation, without the fade
// (04-components/qprod-card.scss, .promo-cycle).
//
// No salla.* anywhere — it only needs the DOM.
// ============================================================================

const STEP_MS = 2000;
const SPLIT = /[,،]/;

// The trimmed, non-empty parts of a promotion title
export function promoParts(raw) {
  return String(raw == null ? '' : raw).split(SPLIT).map(s => s.trim()).filter(Boolean);
}

// The text a badge prints before the script runs: the value as it is when it
// has no comma, else its first part — the comma itself is never shown
export function promoFirst(raw) {
  const text = String(raw == null ? '' : raw);
  return SPLIT.test(text) ? (promoParts(text)[0] || '') : text;
}

// ` data-promo-cycle="…"` for a badge whose title has two parts or more, else ''.
// `escape` is the caller's HTML escaper.
export function promoBadgeAttr(raw, escape) {
  return promoParts(raw).length > 1 ? ` data-promo-cycle="${escape(raw)}"` : '';
}

const badges = [];
let step = 0;
let timer = null;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setUp(el) {
  if (el.hasAttribute('data-promo-ready')) return;
  el.setAttribute('data-promo-ready', '');
  const parts = promoParts(el.getAttribute('data-promo-cycle'));
  if (parts.length < 2) return;
  const on = step % parts.length;
  el.classList.add('promo-cycle');
  el.innerHTML = `<span class="promo-cycle__sr">${esc(parts.join(' · '))}</span>`
    + `<span class="promo-cycle__stack" aria-hidden="true">`
    + parts.map((p, i) => `<span class="promo-cycle__part${i === on ? ' is-on' : ''}">${esc(p)}</span>`).join('')
    + `</span>`;
  badges.push(el);
  run();
}

function tick() {
  step += 1;
  for (let i = badges.length - 1; i >= 0; i--) {
    const el = badges[i];
    if (!el.isConnected) { badges.splice(i, 1); continue; }
    const parts = el.querySelectorAll('.promo-cycle__part');
    const on = step % parts.length;
    parts.forEach((p, j) => p.classList.toggle('is-on', j === on));
  }
  if (!badges.length) stop();
}

function run() {
  if (timer || document.hidden || !badges.length) return;
  timer = setInterval(tick, STEP_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.hasAttribute('data-promo-cycle')) setUp(root);
  root.querySelectorAll('[data-promo-cycle]:not([data-promo-ready])').forEach(setUp);
}

export function bootPromoCycle() {
  if (window.__qPromoCycle) return;
  window.__qPromoCycle = true;
  const start = () => {
    scan(document.body);
    new MutationObserver(list => {
      list.forEach(m => m.addedNodes.forEach(scan));
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
}
