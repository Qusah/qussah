/* Promotional packs bar — the strip above the navbar.
 *
 *   GET  {base}/api/packs-sold          → {total, target, updated_at}
 *   GET  {base}/api/packs-sold/stream   → SSE, same JSON per frame
 *
 * Same endpoints and the same fallback ladder as the LED notch: stream first,
 * drop to polling if EventSource is missing or the server refuses (503 past its
 * 200-connection cap). The two components are otherwise independent — either
 * can be switched off in the dashboard without touching the other.
 *
 * This one shows what is LEFT (target − total), not the running total, so the
 * bar reads as a countdown to the campaign goal.
 *
 * No `salla.*` anywhere on purpose: Cloudflare Rocket Loader reorders the SDK
 * on the live domain, and a module-scope salla call throws on line 1 and kills
 * the whole file. Everything here is plain DOM + fetch.
 */
(function () {
  var root = document.querySelector('[data-qpbar]');
  if (!root) { return; }

  var base   = (root.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
  var numEl  = root.querySelector('[data-qpbar-num]');
  var srEl   = root.querySelector('[data-qpbar-sr]');
  var barEl  = root.querySelector('[data-qpbar-progress]');
  if (!base || !numEl) { return; }

  // A merchant-set target overrides the pipeline's own, so a campaign can aim
  // at a milestone the API knows nothing about. 0/blank = use the API's.
  var ownTarget = parseInt(root.getAttribute('data-target'), 10);
  if (!isFinite(ownTarget) || ownTarget <= 0) { ownTarget = 0; }

  /* ── dismissal ─────────────────────────────────────────────────────────── */
  // Keyed by a merchant-bumped version: closing hides THIS campaign, not the
  // bar forever, so the next one is still seen by everyone.
  var KEY = 'qpbar_dismissed';
  var version = root.getAttribute('data-key') || 'v1';

  if (root.getAttribute('data-dismissible') === '1') {
    var stored = null;
    try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (stored === version) { return; }              // already closed: never paint

    var closeBtn = root.querySelector('[data-qpbar-close]');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        root.classList.add('is-closing');
        // let the collapse finish before the element leaves the flow
        setTimeout(function () { root.hidden = true; }, 260);
        try { localStorage.setItem(KEY, version); } catch (e) { /* ignore */ }
      });
    }
  }

  /* ── formatting ────────────────────────────────────────────────────────── */
  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  // Merchant's choice, not the page direction: an Arabic store may still want
  // Latin digits, which is a typographic decision rather than a language one.
  var arabicNumerals = root.getAttribute('data-numerals') !== 'latin';

  function format(n) {
    var s = String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (!arabicNumerals) { return s; }
    return s.replace(/\d/g, function (d) { return AR[+d]; });
  }

  /* ── paint ─────────────────────────────────────────────────────────────── */
  var prev = null;

  function paint(data) {
    var total  = Number(data.total);
    var target = ownTarget || Number(data.target);
    if (!isFinite(total) || !isFinite(target)) { return; }

    // Past the goal the countdown would go negative, which is worse than
    // nothing — the bar simply retires itself.
    var left = target - total;
    if (left <= 0) { root.hidden = true; return; }

    if (left === prev) { return; }
    prev = left;

    numEl.textContent = format(left);
    if (srEl) { srEl.textContent = format(left); }

    if (barEl && target > 0) {
      var pct = Math.max(0, Math.min(100, (total / target) * 100));
      barEl.style.width = pct.toFixed(2) + '%';
    }

    root.hidden = false;
  }

  /* ── transport: stream, falling back to polling ────────────────────────── */
  function snapshot() {
    return fetch(base + '/api/packs-sold', { credentials: 'omit' })
      .then(function (r) { if (!r.ok) { throw new Error(r.status); } return r.json(); })
      .then(paint);
  }

  var polling = null;
  function startPolling() {
    if (polling) { return; }
    polling = setInterval(function () { snapshot().catch(function () {}); }, 60000);
  }

  function startStream() {
    if (!window.EventSource) { startPolling(); return; }

    var stream = new EventSource(base + '/api/packs-sold/stream');
    var failures = 0;

    stream.onmessage = function (e) {
      failures = 0;
      try { paint(JSON.parse(e.data)); } catch (err) { /* ignore a bad frame */ }
    };

    // EventSource retries on its own; past 4 straight failures give up on the
    // stream (the server caps connections) and fall back to polling.
    stream.onerror = function () {
      if (++failures < 4) { return; }
      stream.close();
      startPolling();
    };
  }

  // No number, no bar — but keep retrying quietly so a cold pipeline boot
  // doesn't blank the strip for the whole session.
  (function boot() {
    snapshot()
      .then(startStream)
      .catch(function () { setTimeout(boot, 60000); });
  })();
})();
