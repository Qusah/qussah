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
 *      the stylesheet waits for, and counts every figure up from 0 that first
 *      time (not with the motion switch off or under reduced motion).
 *   4. Writes long numbers grouped: a typed 1000000 shows as 1,000,000, in
 *      English digits, or Arabic ones (١٬٠٠٠٬٠٠٠) with «أرقام عربية» on.
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

  /* A figure as written: any prefix ("+"), the number, any suffix ("K", "٪").
     Arabic-Indic digits are read as Latin ones, the store's digit set. */
  var FIGURE = /^(\D*?)(\d[\d,]*)(?:\.(\d+))?(.*)$/;
  function latin(text) {
    return String(text).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
                       .replace(/[٬،]/g, ',').replace(/٫/g, '.');
  }

  /* 1000000 → 1,000,000. A number the merchant already grouped is left alone. */
  function group(text) {
    var m = latin(text).match(FIGURE);
    if (!m || m[2].indexOf(',') > -1 || m[2].length < 4) return text;
    return m[1] + Number(m[2]).toLocaleString('en-US') + (m[3] ? '.' + m[3] : '') + m[4];
  }

  /* The digit set the merchant chose («أرقام عربية»): English by default. */
  function digits(el, text) {
    var section = el.closest('[data-stats]');
    if (section && section.getAttribute('data-stats-digits') === 'ar') {
      return text.replace(/\d/g, function (d) { return String.fromCharCode(0x0660 + Number(d)); })
                 .replace(/(\S),(?=\S)/g, '$1٬').replace(/([٠-٩])\.(?=[٠-٩])/g, '$1٫');
    }
    return latin(text);
  }

  /* A leading "+" is wrapped so the stylesheet can colour it on its own. */
  function paint(el, text) {
    text = digits(el, group(String(text == null ? '' : text).replace(/\s+/g, ' ').trim()));
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
        var score = parseFloat(latin(textOf(stat.querySelector('[data-stat-num]'))));
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
      el.textContent = template.replace(/\{n\}/g, digits(el, count));
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
      if (section.__countStarted) {
        count(section, [rating, reviews].filter(Boolean).map(function (stat) { return stat.querySelector('[data-stat-num]'); }));
      }
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
        if (section.__countStarted) {
          count(section, [rating, reviews].filter(Boolean).map(function (stat) { return stat.querySelector('[data-stat-num]'); }));
        }
      })
      .catch(typed);
  }

  /* --- the count: every figure runs from 0 to its value the first time the
     section comes into view. Off with the block's «تشغيل الحركة» switch (the
     section then carries a `--still` class) and under reduced motion. The
     figure's final width is held while it counts, so the row never jumps. */
  var COUNT_MS = 1600;
  /* the visitor has scrolled: what is on screen now is where they are reading */
  var scrolled = false;
  window.addEventListener('scroll', function () { scrolled = true; }, { once: true, passive: true });
  function still(section) {
    return /--still(\s|$)/.test(section.className) ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function count(section, nums) {
    if (still(section)) return;
    nums.forEach(function (el) {
      var stat = el.closest('[data-stat]');
      if (el.__counted || (stat && stat.hidden)) return;
      var final = textOf(el);
      var m = latin(final).match(FIGURE);
      if (!m) return;
      el.__counted = true;
      var target = Number(m[2].replace(/,/g, '') + (m[3] ? '.' + m[3] : ''));
      var places = m[3] ? m[3].length : 0;
      var grouped = m[2].indexOf(',') > -1 || m[2].length > 3;
      if (!(target > 0)) return;

      var inline = window.getComputedStyle(el).display === 'inline';
      el.style.minWidth = el.getBoundingClientRect().width + 'px';
      if (inline) el.style.display = 'inline-block';

      var start = null;
      function frame(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / COUNT_MS);
        var eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);   // ease-out, fast then settling
        var value = target * eased;
        var shown = places ? value.toFixed(places) : String(Math.floor(value));
        if (grouped) {
          var parts = shown.split('.');
          shown = Number(parts[0]).toLocaleString('en-US') + (parts[1] ? '.' + parts[1] : '');
        }
        if (t < 1) {
          paint(el, m[1] + shown + m[4]);
          window.requestAnimationFrame(frame);
        } else {
          paint(el, final);
          el.style.removeProperty('min-width');
          if (inline) el.style.removeProperty('display');
        }
      }
      paint(el, m[1] + (places ? (0).toFixed(places) : '0') + m[4]);
      window.requestAnimationFrame(frame);
    });
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
    /* The count starts the moment the section's edge comes on screen, before
       its figures do, so nobody sees the final number and then a reset to 0. */
    /* Only after the visitor's first scroll: until then the rows above it may
       not be drawn yet (Salla's product lists render after the page loads), so
       the section can sit on the first screen for a moment and be pushed down,
       and the count would be over before anyone reaches it. A section that
       really is on the first screen just shows its figures. And only once it
       has stayed on screen for a beat. */
    var counter = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting || section.__countStarted) return;
      if (!scrolled) {
        window.addEventListener('scroll', function () { counter.unobserve(section); counter.observe(section); }, { once: true, passive: true });
        return;
      }
      setTimeout(function () {
        var box = section.getBoundingClientRect();
        if (section.__countStarted || box.bottom <= 0 || box.top >= window.innerHeight) return;
        counter.disconnect();
        section.__countStarted = true;
        count(section, all(section, '[data-stat-num]'));
      }, 60);
    }, { threshold: 0 });
    counter.observe(section);
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
      all(section, '[data-stat-unit]').forEach(function (el) { el.textContent = digits(el, el.textContent); });   // «من 5»
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
