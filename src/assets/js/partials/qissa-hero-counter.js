/**
 * Hero counter — the live packs-sold total inside the campaign banner's LED frame.
 *
 * The artwork (MAR-20260668) ships with an EMPTY chrome frame; this script
 * draws the number into it so the banner never has to be re-exported. The
 * frame's position is a set of percentages on the slide (merchant-tunable in
 * the dashboard), and the board scales itself to that box with container
 * units — see qissa-hero-counter.scss.
 *
 * Data contract (PACKS_COUNTER_SPEC.md):
 *   GET  {base}/api/packs-sold          → {total, target, updated_at}
 *   GET  {base}/api/packs-sold/stream   → SSE, same JSON per frame
 *
 * The board shows the running TOTAL sold, verbatim from the pipeline (which
 * already does the packs maths). The target is only used to decide how many
 * digit columns the board has, so the panel reads as the full "999,999,998"
 * strip of the campaign artwork from the first paint; a merchant-set target
 * overrides the pipeline's for that purpose.
 *
 * Rendering is the split-flap board from the LED notch: one windowed cell per
 * digit holding a reel of seven-segment glyphs; on change the reel slides one
 * cell-height, staggered from the least-significant column. Columns the figure
 * hasn't reached yet are UNLIT ghost digits, exactly as a real LED panel shows
 * its dark "8" skeletons, so the figure always fills the frame and the layout
 * never re-shapes as it grows.
 *
 * One transport per endpoint feeds every board on the page (several slides may
 * carry one), stream first, polling if EventSource is missing or the server
 * refuses. No `salla.*` anywhere: Rocket Loader reorders the SDK on the live
 * domain and a module-scope salla call would kill the file.
 */
(function () {
  var ROLL_MS    = 620;
  var STAGGER_MS = 45;
  var EASING     = 'cubic-bezier(0.3, 0.9, 0.3, 1)';
  var GHOST      = ' ';   // an unlit cell in the padded digit string

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  /* ── Glyphs ─────────────────────────────────────────────────────────── */

  // digit '' (or GHOST) renders the skeleton only: every segment unlit
  function makeGlyph(digit) {
    var glyph = document.createElement('span');
    glyph.className = 'qibc__glyph';
    glyph.setAttribute('data-d', digit === GHOST ? '' : digit);
    'abcdefg'.split('').forEach(function (s) {
      var seg = document.createElement('span');
      seg.className = 'qibc__seg qibc__seg--' + s;
      glyph.appendChild(seg);
    });
    return glyph;
  }

  /* ── One board ──────────────────────────────────────────────────────── */

  function Board(root) {
    this.root  = root;
    this.board = root.querySelector('[data-qibc-board]');
    this.num   = root.querySelector('[data-qibc-num]');
    this.text  = root.querySelector('[data-qibc-text]');
    this.sr    = root.querySelector('[data-qibc-sr]');

    var own = parseInt(root.getAttribute('data-target'), 10);
    this.ownTarget = isFinite(own) && own > 0 ? own : 0;
    this.arabic = root.getAttribute('data-numerals') !== 'latin';

    this.current = null;   // last figure displayed
    this.width   = 0;      // digit columns on the board
    this.cells   = [];
    this.seps    = [];
  }

  // Caption figure: thousands commas, then the merchant's choice of numerals.
  // The board itself is always Latin — seven segments cannot draw ٠-٩.
  Board.prototype.format = function (n) {
    var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (!this.arabic) return s;
    return s.replace(/\d/g, function (d) { return AR[+d]; });
  };

  // Left-pad to the board width, then lay out with thousands separators. Each
  // separator is lit only once a lit digit stands to its left.
  Board.prototype.layout = function (str) {
    var padded = str;
    while (padded.length < this.width) padded = GHOST + padded;
    var digits = [], seps = [];
    for (var i = 0; i < padded.length; i++) {
      if (i > 0 && (padded.length - i) % 3 === 0) seps.push(padded[i - 1] !== GHOST);
      digits.push(padded[i]);
    }
    return { digits: digits, seps: seps };
  };

  Board.prototype.build = function (lay) {
    this.board.textContent = '';
    this.cells = [];
    this.seps  = [];
    var sepIdx = 0;
    for (var i = 0; i < lay.digits.length; i++) {
      if (i > 0 && (lay.digits.length - i) % 3 === 0) {
        var sep = document.createElement('span');
        sep.className = 'qibc__sep' + (lay.seps[sepIdx++] ? '' : ' is-off');
        this.board.appendChild(sep);
        this.seps.push(sep);
      }
      var cell = document.createElement('span');
      cell.className = 'qibc__cell';
      var reel = document.createElement('span');
      reel.className = 'qibc__reel';
      reel.appendChild(makeGlyph(lay.digits[i]));
      cell.appendChild(reel);
      this.board.appendChild(cell);
      this.cells.push({ reel: reel, digit: lay.digits[i], timer: null, landing: null });
    }
  };

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
      cell.reel.appendChild(incoming);
      cell.reel.style.transform = 'translateY(0)';
    } else {
      cell.reel.insertBefore(incoming, cell.reel.firstChild);
      cell.reel.style.transform = 'translateY(-50%)';
    }

    void cell.reel.offsetHeight;   // commit the start position

    cell.reel.style.transition = 'transform ' + ROLL_MS + 'ms ' + EASING + ' ' + delay + 'ms';
    cell.reel.style.transform = up ? 'translateY(-50%)' : 'translateY(0)';

    // setTimeout, not transitionend: a throttled background tab can eat the
    // event and leave a stacked reel behind.
    cell.timer = setTimeout(function () { settle(cell); }, ROLL_MS + delay + 80);
  }

  /* ── Paint ──────────────────────────────────────────────────────────── */

  Board.prototype.paint = function (data) {
    var total  = Number(data.total);
    var target = this.ownTarget || Number(data.target);
    if (!isFinite(total) || !isFinite(target)) return;

    total = Math.max(0, Math.round(total));
    if (total === this.current) return;   // repeated frame: never replay the roll

    var prev = this.current;
    this.current = total;

    // Caption + screen reader. When a sentence is set it carries the whole
    // phrase, so announcing its text reads naturally; otherwise the bare figure.
    var caption = this.format(total);
    if (this.num) this.num.textContent = caption;
    if (this.sr) {
      this.sr.textContent = this.text ? this.text.textContent.replace(/\s+/g, ' ').trim() : caption;
    }

    var str = String(total);

    // Board width: the widest figure short of the goal (999,999,999 for a
    // billion), matching the artwork's nine-digit strip. Reaching the goal
    // re-shapes the board to fit — rare, handled by rebuild.
    var need = Math.max(String(Math.max(target - 1, 1)).length, str.length);
    var reshape = need !== this.width;
    this.width = need;

    var lay = this.layout(str);

    if (prev === null || reduceMotion || reshape) {
      this.build(lay);
      this.root.classList.add('is-live');
      return;
    }

    var up = total > prev;   // down for a cancelled order — roll, don't clamp
    var n = this.cells.length;
    for (var i = 0; i < n; i++) {
      if (lay.digits[i] === this.cells[i].digit) continue;
      // stagger from the least-significant column, like a mechanical counter
      roll(this.cells[i], lay.digits[i], up, (n - 1 - i) * STAGGER_MS);
    }
    for (var s = 0; s < this.seps.length; s++) {
      this.seps[s].classList.toggle('is-off', !lay.seps[s]);
    }
  };

  /* ── Transport: one feed per endpoint, shared by every board ────────── */

  var feeds = {};

  function feed(base) {
    if (feeds[base]) return feeds[base];

    var f = feeds[base] = { boards: [], latest: null, polling: null };

    function push(d) {
      f.latest = d;
      f.boards.forEach(function (b) { b.paint(d); });
    }

    function snapshot() {
      return fetch(base + '/api/packs-sold', { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(push);
    }

    function startPolling() {
      if (f.polling) return;
      f.polling = setInterval(function () { snapshot().catch(function () {}); }, 60000);
    }

    function startStream() {
      if (!window.EventSource) { startPolling(); return; }

      var stream = new EventSource(base + '/api/packs-sold/stream');
      var failures = 0;

      stream.onmessage = function (e) {
        failures = 0;
        try { push(JSON.parse(e.data)); } catch (err) { /* malformed frame */ }
      };

      // EventSource retries on its own; past 4 straight failures (or the
      // server's connection cap, which surfaces the same way) fall back to
      // polling — a supported mode per the spec, not an error state.
      stream.onerror = function () {
        if (++failures < 4) return;
        stream.close();
        startPolling();
      };
    }

    // No number, no digits — the empty frame in the artwork is the resting
    // state. Keep retrying quietly so a cold pipeline boot doesn't leave the
    // frame blank for the whole session.
    (function boot() {
      snapshot()
        .then(startStream)
        .catch(function () { setTimeout(boot, 60000); });
    })();

    return f;
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */

  function init() {
    var roots = document.querySelectorAll('[data-qibc]');
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      if (root.dataset.qibcInit) continue;
      root.dataset.qibcInit = '1';

      var base = (root.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
      if (!base || !root.querySelector('[data-qibc-board]')) continue;

      var board = new Board(root);
      var f = feed(base);
      f.boards.push(board);
      if (f.latest) board.paint(f.latest);   // a late board gets the current figure at once
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // the Salla editor re-renders blocks after a settings change
  document.addEventListener('theme::ready', init);
})();
