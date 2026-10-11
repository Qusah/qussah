/**
 * Stats block (home.qissa-trust-stats) — the customers / rating / reviews row.
 * Markup: views/components/home/qissa-trust-stats.twig · Styles: 04-components/qissa-trust-stats.scss
 *
 * WHAT THIS FILE DOES
 *   1. Lays the row out from what is actually shown: marks the first visible
 *      figure as the main one and hands the stylesheet the lengths it sizes
 *      the type from (a typed value can be "+45,000" or "+1,250,000").
 *   2. With «أرقام المتجر الحقيقية» on, reads the store's reviews and fills the
 *      rating (average of the latest 30) and the reviews total. Until that
 *      answer arrives those two figures stay hidden; if the request fails the
 *      merchant's typed values are shown instead, and if nothing was typed
 *      they stay hidden. Under «الحد الأدنى للتقييمات» both stay hidden.
 *   3. Adds `is-seen` once and toggles `is-inview`, which is all the motion in
 *      the stylesheet waits for.
 *
 * `salla.api.request('reviews', {params:{type:'store', per_page:30, page:1}}, 'get')`
 * answers { data: [{stars}], pagination: {total} } (measured on the live stores,
 * 11 Oct 2026). There is no store-wide average in any API.
 */
(function () {
  var SECTION = '[data-stats]';

  function all(root, selector) {
    return Array.prototype.slice.call(root.querySelectorAll(selector));
  }

  /* A leading "+" is wrapped so the stylesheet can colour it on its own. */
  function paint(el, text) {
    text = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    el.textContent = '';
    if (text.charAt(0) === '+' && text.length > 1) {
      var plus = document.createElement('b');
      plus.textContent = '+';
      el.appendChild(plus);
      el.appendChild(document.createTextNode(text.slice(1)));
    } else {
      el.textContent = text;
    }
  }

  function textOf(el) {
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
  }

  function layout(section) {
    var list = section.querySelector('[data-stats-list]');
    if (!list) return;
    var stats = all(list, '[data-stat]').filter(function (stat) { return !stat.hidden; });
    var lengths = stats.map(function (stat) { return textOf(stat.querySelector('[data-stat-num]')).length; });
    var rest = Math.max.apply(null, [3].concat(lengths.slice(1)));

    all(list, '[data-stat]').forEach(function (stat) {
      stat.classList.remove('is-main');
      stat.classList.remove('is-long');
    });
    stats.forEach(function (stat, i) {
      var unit = stat.querySelector('[data-stat-unit]');
      stat.classList.toggle('is-main', i === 0);
      stat.classList.toggle('is-long', lengths[i] > 6);
      stat.style.setProperty('--chars', i === 0 ? Math.max(3, lengths[i]) : rest);
      stat.style.setProperty('--len', Math.max(1, lengths[i]));
      stat.style.setProperty('--col', i + 1);
      stat.style.setProperty('--u', (unit && textOf(unit) ? textOf(unit).length * 10 + 16 : 0) + 'px');

      var stars = stat.querySelector('[data-stat-stars]');
      if (stars) {
        var score = parseFloat(textOf(stat.querySelector('[data-stat-num]')));
        if (score > 0) stars.style.setProperty('--pct', Math.max(0, Math.min(100, score / 5 * 100)).toFixed(1) + '%');
        stars.hidden = !(score > 0);
      }
    });

    var main = lengths.length ? Math.max(3, lengths[0]) : 3;
    var columns = [Math.max(1.7, Math.min(3.4, main * 0.34)) + 'fr'];
    for (var i = 1; i < stats.length; i++) columns.push('1fr');
    list.style.setProperty('--cols', columns.join(' '));
    list.style.setProperty('--main-len', main);
    list.setAttribute('data-count', stats.length);
    section.setAttribute('data-count', stats.length);
    list.hidden = !stats.length;
    fit(section, list);
  }

  /* Last line of defence for themes whose row is sized by its content: a long
     typed value may never be wider than the panel. */
  function fit(section, list) {
    var box = section.querySelector('[data-stats-fit]');
    var num = list.querySelector('.is-main [data-stat-num]');
    if (!box || !num) return;
    num.style.removeProperty('font-size');
    var style = window.getComputedStyle(box);
    var room = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    for (var i = 0; i < 12; i++) {
      var width = Math.max(list.scrollWidth, num.getBoundingClientRect().width);
      if (width <= room + 0.5) break;
      num.style.fontSize = Math.floor(parseFloat(window.getComputedStyle(num).fontSize) * Math.max(0.8, room / width) * 0.98) + 'px';
    }
  }

  /* The line under the rating: «{n}» in the merchant's text is the reviews total
     (the real one, or the typed one when the real one is not used). */
  function note(section, total) {
    all(section, '[data-stat-note]').forEach(function (el) {
      var template = el.getAttribute('data-template') || '';
      var count = total == null ? (el.getAttribute('data-typed-n') || '') : Number(total).toLocaleString('en-US');
      if (!template || (!count && template.indexOf('{n}') > -1)) return;
      el.textContent = template.replace(/\{n\}/g, count);
      el.hidden = false;
    });
  }

  function load(section) {
    if (section.getAttribute('data-stats-auto') !== '1') return;
    var rating = section.querySelector('[data-stat="rating"]');
    var reviews = section.querySelector('[data-stat="reviews"]');
    if (!rating && !reviews) return;
    var min = parseInt(section.getAttribute('data-stats-min'), 10) || 0;

    /* The request failed: show what the merchant typed, if anything. */
    function typed() {
      [rating, reviews].forEach(function (stat) {
        if (stat && stat.getAttribute('data-typed') === '1') stat.hidden = false;
      });
      note(section, null);
      layout(section);
    }

    if (!window.salla || !salla.api || typeof salla.api.request !== 'function') return typed();

    salla.api.request('reviews', { params: { type: 'store', per_page: 30, page: 1 } }, 'get')
      .then(function (response) {
        var rows = (response && response.data) || [];
        var total = Number(response && response.pagination && response.pagination.total) || rows.length;
        var stars = rows.map(function (row) { return Number(row && row.stars); })
                        .filter(function (value) { return value > 0; });
        if (!stars.length || total < min) return layout(section);   // too few: both stay hidden

        var average = stars.reduce(function (sum, value) { return sum + value; }, 0) / stars.length;
        if (rating) {
          paint(rating.querySelector('[data-stat-num]'), (Math.round(average * 10) / 10).toFixed(1));
          rating.hidden = false;
        }
        if (reviews) {
          paint(reviews.querySelector('[data-stat-num]'), total.toLocaleString('en-US'));
          reviews.hidden = false;
        }
        note(section, total);
        layout(section);
      })
      .catch(typed);
  }

  function watch(section) {
    if (!('IntersectionObserver' in window)) {
      section.classList.add('is-seen', 'is-inview');
      return;
    }
    new IntersectionObserver(function (entries) {
      var on = entries[0].isIntersecting;
      section.classList.toggle('is-inview', on);
      if (on) section.classList.add('is-seen');
    }, { threshold: 0.25 }).observe(section);
  }

  /* Never touch salla.* before the SDK is up (Cloudflare Rocket Loader runs it
     after theme scripts on live). app.js dispatches `theme::ready` from inside
     salla.onReady and sets app.status. */
  function whenReady(fn) {
    var done = false, tries = 0;
    function go() { if (!done) { done = true; fn(); } }
    if (window.app && window.app.status === 'ready') return go();
    document.addEventListener('theme::ready', go, { once: true });
    (function poll() {
      if (done) return;
      if (window.salla && typeof salla.onReady === 'function') return salla.onReady(go);
      if (++tries < 40) setTimeout(poll, 250);
    })();
  }

  var booted = false;
  function boot() {
    if (booted) return;       // Rocket Loader fires DOMContentLoaded a second time
    booted = true;
    var sections = all(document, SECTION);
    if (!sections.length) return;
    sections.forEach(function (section) {
      all(section, '[data-stat-num]').forEach(function (el) { paint(el, el.textContent); });
      if (section.getAttribute('data-stats-auto') !== '1') note(section, null);
      layout(section);
      watch(section);
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { sections.forEach(layout); });
    }
    var timer = null;
    window.addEventListener('resize', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { sections.forEach(layout); }, 200);
    }, { passive: true });
    whenReady(function () { sections.forEach(load); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
