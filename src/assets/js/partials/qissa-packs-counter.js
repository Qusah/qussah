/**
 * Packs-sold counter — the live board under the header.
 *
 * Data contract (PACKS_COUNTER_SPEC.md + the pipeline integration artifact):
 *   GET  {base}/api/packs-sold          → {total, target, updated_at}
 *   GET  {base}/api/packs-sold/stream   → SSE, same JSON per frame; the server
 *        sends the current value once on connect, then only on change, plus a
 *        `: ping` comment every 30s that EventSource swallows on its own.
 *
 * Behaviour the spec pins down, all handled here:
 *   – First value paints instantly (counting up from zero to 999M looks broken)
 *   – Animate only when `total` actually changes; repeats are no-ops
 *   – The number may go DOWN (cancelled orders) — roll down, don't clamp
 *   – Stream trouble (503 past the 200-connection cap, EventSource missing,
 *     4 consecutive errors) degrades to polling the snapshot every 15s
 *   – Snapshot failure on first paint keeps the bar hidden — no zero, no
 *     spinner. A quiet 60s retry recovers from transient boots.
 *
 * The board itself is a split-flap display: each digit is a windowed cell
 * holding a reel of seven-segment glyphs. On change, the reel gets the new
 * glyph stacked against the old one and slides one cell-height — which is
 * exactly the "9 over 8 mid-roll" frame in the campaign banner. Digits are
 * staggered from the least-significant side like a mechanical counter.
 */
(function () {
  var root = document.querySelector('[data-qpacks]');
  if (!root) return;

  var base = (root.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
  if (!base) return;

  var board = root.querySelector('[data-qpacks-board]');
  var sr    = root.querySelector('[data-qpacks-sr]');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ROLL_MS    = 620;
  var STAGGER_MS = 45;
  var EASING     = 'cubic-bezier(0.3, 0.9, 0.3, 1)';

  var current = null;   // last total actually displayed
  var cells   = [];     // digit cells, DOM order (most-significant first)
  var pollId  = null;

  function format(n) {
    return n.toLocaleString('en-US'); // 999,000,000
  }

  /* ── Board construction ─────────────────────────────────────────────── */

  function makeGlyph(digit) {
    var glyph = document.createElement('span');
    glyph.className = 'qpacks__glyph';
    glyph.setAttribute('data-d', digit);
    'abcdefg'.split('').forEach(function (s) {
      var seg = document.createElement('span');
      seg.className = 'qpacks__seg qpacks__seg--' + s;
      glyph.appendChild(seg);
    });
    return glyph;
  }

  function build(str) {
    board.textContent = '';
    cells = [];
    str.split('').forEach(function (ch) {
      if (ch >= '0' && ch <= '9') {
        var cell = document.createElement('span');
        cell.className = 'qpacks__cell';
        var reel = document.createElement('span');
        reel.className = 'qpacks__reel';
        reel.appendChild(makeGlyph(ch));
        cell.appendChild(reel);
        board.appendChild(cell);
        cells.push({ el: cell, reel: reel, digit: ch, timer: null });
      } else {
        var sep = document.createElement('span');
        sep.className = 'qpacks__sep';
        board.appendChild(sep);
      }
    });
  }

  /* ── The roll ───────────────────────────────────────────────────────── */

  // Settle a mid-flight cell instantly: keep only the glyph it was headed to.
  function settle(cell) {
    if (!cell.timer) return;
    clearTimeout(cell.timer);
    cell.timer = null;
    cell.reel.style.transition = 'none';
    cell.reel.style.transform = '';
    while (cell.reel.children.length > 1) {
      cell.reel.removeChild(cell.reel.firstChild === cell.landing
        ? cell.reel.lastChild
        : cell.reel.firstChild);
    }
    cell.landing = null;
  }

  function roll(cell, nextDigit, up, delay) {
    settle(cell);
    cell.digit = nextDigit;

    var incoming = makeGlyph(nextDigit);
    cell.landing = incoming;
    cell.reel.style.transition = 'none';

    if (up) {
      // Old glyph slides up and out; the new one rises into the window.
      cell.reel.appendChild(incoming);
      cell.reel.style.transform = 'translateY(0)';
    } else {
      cell.reel.insertBefore(incoming, cell.reel.firstChild);
      cell.reel.style.transform = 'translateY(-50%)';
    }

    // Commit start position before animating out of it
    void cell.reel.offsetHeight;

    cell.reel.style.transition = 'transform ' + ROLL_MS + 'ms ' + EASING + ' ' + delay + 'ms';
    cell.reel.style.transform = up ? 'translateY(-50%)' : 'translateY(0)';

    // setTimeout rather than transitionend: a background tab can throttle the
    // transition and eat the event, which would leave a stacked reel behind.
    cell.timer = setTimeout(function () { settle(cell); }, ROLL_MS + delay + 80);
  }

  /* ── Rendering ──────────────────────────────────────────────────────── */

  function render(next) {
    if (typeof next !== 'number' || !isFinite(next)) return;
    next = Math.round(next);
    if (next === current) return;   // repeated frame: never replay the roll

    var prev = current;
    current = next;

    var str = format(next);
    sr.textContent = str + ' ' + (root.querySelector('.qpacks__label') || {}).textContent;

    var digits = str.replace(/\D/g, '');

    // First paint, reduced motion, or a digit-count change (999,999,999 →
    // 1,000,000,000 re-shapes the board): set outright, no roll.
    if (prev === null || reduceMotion || digits.length !== cells.length) {
      build(str);
      root.hidden = false;
      return;
    }

    var prevDigits = format(prev).replace(/\D/g, '');
    var up = next > prev;
    var n = cells.length;

    for (var i = 0; i < n; i++) {
      if (digits[i] === prevDigits[i]) continue;
      // Stagger from the least-significant column, like a mechanical counter
      roll(cells[i], digits[i], up, (n - 1 - i) * STAGGER_MS);
    }
  }

  /* ── Data ───────────────────────────────────────────────────────────── */

  function snapshot() {
    return fetch(base + '/api/packs-sold', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (d) { render(d.total); });
  }

  function startPolling() {
    if (pollId) return;
    pollId = setInterval(function () { snapshot().catch(function () {}); }, 15000);
  }

  function startStream() {
    if (!window.EventSource) { startPolling(); return; }

    var stream = new EventSource(base + '/api/packs-sold/stream');
    var failures = 0;

    stream.onmessage = function (e) {
      failures = 0;
      try { render(JSON.parse(e.data).total); } catch (err) { /* malformed frame */ }
    };

    // EventSource retries by itself; past 4 straight failures (or the server's
    // 503 connection cap, which surfaces the same way) fall back to polling —
    // a supported mode per the spec, not an error state.
    stream.onerror = function () {
      if (++failures < 4) return;
      stream.close();
      startPolling();
    };
  }

  /* ── Notch on scroll ────────────────────────────────────────────────── */
  // Once the card scrolls off the top, only the board follows — a compact
  // notch hung off the sticky navbar's bottom edge (styles: .qpacks--stuck).
  // The header is sticky at z 100 and compacts with a 0.5s transition when
  // pinned, so the notch's top coordinate has to be MEASURED, not assumed:
  // --qpacks-top tracks the navbar's live bottom edge, re-sampled after the
  // compaction settles and on resize. The root keeps its measured height
  // while the inner goes fixed, so the page never jumps and the observer's
  // geometry stays stable (no stick/unstick flicker).
  if ('IntersectionObserver' in window) {
    var header = document.querySelector('.qheader');

    var pinTop = function () {
      if (!root.classList.contains('qpacks--stuck')) return;
      var edge = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
      root.style.setProperty('--qpacks-top', edge + 'px');
    };

    new IntersectionObserver(function (entries) {
      var e = entries[0];
      // bottom < 0 ⇒ scrolled off the TOP — never stick while the card is
      // still below the fold on a page that renders it late
      if (!e.isIntersecting && e.boundingClientRect.bottom < 0) {
        root.style.minHeight = root.offsetHeight + 'px';
        // Position before painting the class, or the notch flashes at 0
        var edge = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
        root.style.setProperty('--qpacks-top', edge + 'px');
        root.classList.add('qpacks--stuck');
        setTimeout(pinTop, 600);   // after the header's own 0.5s compaction
      } else {
        root.classList.remove('qpacks--stuck');
        root.style.minHeight = '';
      }
    }).observe(root);

    window.addEventListener('resize', pinTop);
  }

  // First paint decides everything: no number, no counter — but keep quietly
  // retrying so a transient pipeline boot doesn't blank the bar all session.
  (function boot() {
    snapshot()
      .then(startStream)
      .catch(function () { setTimeout(boot, 60000); });
  })();
})();
