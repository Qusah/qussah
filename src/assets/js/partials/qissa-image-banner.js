/**
 * Qissa banners — the slider behind home.qissa-image-banner.
 *
 * The track is a flex row translated by whole slides; there is no cloning and
 * no scroll-position juggling, because that is what made the earlier featured-
 * pair carousel jitter: with few slides the copies land on top of each other and
 * re-centring swaps identical cards in place. A transform to a known index
 * cannot drift.
 *
 * Fade mode stacks every slide and cross-fades opacity instead of translating.
 *
 * Touch: a horizontal drag moves the track live and settles on the nearest
 * slide. Vertical intent is detected first and handed back to the page, so the
 * banner never traps a scroll.
 */

function initBanner(root) {
  if (root.dataset.qibInit) return;
  root.dataset.qibInit = '1';

  var track = root.querySelector('[data-qib-track]');
  var slides = [].slice.call(root.querySelectorAll('[data-qib-slide]'));
  if (!track || slides.length < 2) return;   /* one banner needs no slider */

  var dots = [].slice.call(root.querySelectorAll('[data-qib-dot]'));
  var fade = root.classList.contains('qibanner--fade');
  var loop = root.getAttribute('data-qib-loop') !== '0';
  var rtl = getComputedStyle(root).direction === 'rtl';

  var index = parseInt(root.getAttribute('data-qib-start'), 10) || 0;
  var autoSecs = parseFloat(root.getAttribute('data-qib-autoplay')) || 0;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var timer = null, resumeTimer = null;
  var RESUME_AFTER = 30000;   /* a human swipe wins for this long */

  function render(animate) {
    slides.forEach(function (s, i) {
      var on = i === index;
      s.classList.toggle('is-active', on);
      if (on) s.removeAttribute('aria-hidden');
      else s.setAttribute('aria-hidden', 'true');
    });
    dots.forEach(function (d, i) { d.classList.toggle('is-active', i === index); });

    if (fade) return;   /* fade mode is pure CSS off .is-active */

    track.style.transition = animate === false ? 'none' : '';
    /* RTL lays the track out right-to-left, so advancing means +% not -% */
    track.style.transform = 'translateX(' + (rtl ? index * 100 : -index * 100) + '%)';
    if (animate === false) {
      /* force a reflow so the next change animates from here */
      void track.offsetWidth;
      track.style.transition = '';
    }
  }

  function go(i) {
    var last = slides.length - 1;
    if (i < 0) index = loop ? last : 0;
    else if (i > last) index = loop ? 0 : last;
    else index = i;
    render();
  }

  var prev = root.querySelector('[data-qib-prev]');
  var next = root.querySelector('[data-qib-next]');
  if (prev) prev.addEventListener('click', function () { go(index - 1); holdOff(); });
  if (next) next.addEventListener('click', function () { go(index + 1); holdOff(); });
  dots.forEach(function (d, i) {
    d.addEventListener('click', function () { go(i); holdOff(); });
  });

  /* ---- autoplay --------------------------------------------------------- */
  function start() {
    if (timer || resumeTimer || !autoSecs || reduced) return;
    timer = setInterval(function () { go(index + 1); }, Math.max(2, autoSecs) * 1000);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  /* any manual move pauses the timer, which then comes back on its own */
  function holdOff() {
    if (!autoSecs) return;
    stop();
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { resumeTimer = null; start(); }, RESUME_AFTER);
  }

  /* ---- touch ------------------------------------------------------------ */
  var sx = 0, sy = 0, dx = 0, dragging = false, decided = false;

  root.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    dx = 0; dragging = true; decided = false;
    stop();
  }, { passive: true });

  root.addEventListener('touchmove', function (e) {
    if (!dragging) return;
    var mx = e.touches[0].clientX - sx;
    var my = e.touches[0].clientY - sy;

    if (!decided) {
      /* vertical intent belongs to the page, not the banner */
      if (Math.abs(my) > Math.abs(mx)) { dragging = false; return; }
      decided = true;
    }
    dx = mx;
    if (!fade) {
      var pct = (dx / root.clientWidth) * 100;
      track.style.transition = 'none';
      track.style.transform =
        'translateX(' + ((rtl ? index * 100 : -index * 100) + pct) + '%)';
    }
  }, { passive: true });

  root.addEventListener('touchend', function () {
    if (!dragging) return;
    dragging = false;
    track.style.transition = '';

    var threshold = root.clientWidth * 0.15;
    if (Math.abs(dx) > threshold) {
      /* in RTL a drag to the right advances */
      var forward = rtl ? dx > 0 : dx < 0;
      go(forward ? index + 1 : index - 1);
    } else {
      render();   /* snap back */
    }
    holdOff();
  }, { passive: true });

  /* ---- boot ------------------------------------------------------------- */
  render(false);

  if (autoSecs && !reduced) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.25 }).observe(root);
    } else {
      start();
    }
  }
}

function boot() {
  document.querySelectorAll('.qibanner[data-qib]').forEach(initBanner);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
/* the Salla editor re-renders blocks after a settings change */
document.addEventListener('theme::ready', boot);
