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
      // Un-hide the anchor once a real number exists; whether the notch is
      // actually on screen is the scroll threshold's call, not this one.
      // Re-measure first — the header may have compacted between load and the
      // number arriving. (Both are hoisted declarations below.)
      pinTop();
      root.hidden = false;
      syncVisibility();
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

  /* ── Notch: position + reveal on scroll ─────────────────────────────── */
  // The notch is the counter's only form — there is no in-flow card. It stays
  // hidden at the top of the page and drops in once the reader has scrolled
  // past REVEAL_AT, then remains for the rest of the page; coming back to the
  // very top puts it away again.
  //
  // Its top coordinate has to be MEASURED, not assumed: the header is sticky
  // and compacts with a 0.5s transition when pinned. Measure the visible dark
  // bar, not the .qheader wrapper — the wrapper's box runs past the bar (child
  // margins/spacers inside it), which left the notch floating with a strip of
  // page between it and the navbar.
  var header = document.querySelector('.qheader-nav') || document.querySelector('.qheader');

  // Far enough that it never flickers on the small scrolls of a tap or a
  // rubber-band bounce, low enough to arrive as soon as the reader is moving.
  var REVEAL_AT = 220;
  // Hysteresis: hide again slightly higher than the show point, so a reader
  // parked exactly on the threshold doesn't get a flapping notch.
  var HIDE_AT = 140;
  var shown = false;

  function pinTop() {
    var edge = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
    root.style.setProperty('--qpacks-top', edge + 'px');
  }

  function syncVisibility() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (!shown && y > REVEAL_AT) {
      // Position before the class lands, or it animates in from a stale
      // coordinate on the very first reveal.
      pinTop();
      root.classList.add('is-visible');
      shown = true;
    } else if (shown && y < HIDE_AT) {
      root.classList.remove('is-visible');
      shown = false;
    }
  }

  // Sample once up front — a reload partway down a page starts already past
  // the threshold, and the notch should simply be there.
  pinTop();
  syncVisibility();
  setTimeout(pinTop, 600);   // after the header's own 0.5s compaction
  window.addEventListener('resize', pinTop);

  // Passive, one frame at a time. pinTop() forces a synchronous layout via
  // getBoundingClientRect, so it is skipped entirely while the notch is off
  // screen — there is nothing to position then, and paying for a reflow on
  // every frame of every scroll on every page was pure waste.
  var queued = false;
  window.addEventListener('scroll', function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      syncVisibility();          // positions itself on the frame it turns on
      if (shown) { pinTop(); }   // afterwards, track the header while visible
    });
  }, { passive: true });

  // First paint decides everything: no number, no counter — but keep quietly
  // retrying so a transient pipeline boot doesn't blank the bar all session.
  (function boot() {
    snapshot()
      .then(startStream)
      .catch(function () { setTimeout(boot, 60000); });
  })();
})();
