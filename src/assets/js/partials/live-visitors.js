/* Live visitors — "N people are looking at this product right now".
 *
 * Two jobs:
 *
 * 1. PAGE line (product page, cart). Markup ships hidden with the config on
 *    the element ([data-live-visitors]). This POSTs a heartbeat to the
 *    pipeline — store, page, key, and a visitor id this browser made up and
 *    keeps — on load and once a minute while the tab is visible, then shows
 *    the line only when the reply is at or above the merchant's minimum
 *    (default 3). Below that, or on any error, nothing is shown.
 *
 * 2. CARD lines (product cards anywhere). Each card carries only its product
 *    id ([data-live-card]); the config lives once on <body> ([data-live-cards]
 *    + data-live-*). Cards never heartbeat — a listing is not "viewing" the
 *    product — they READ counts in one batched GET (?keys=a,b,c) and repaint
 *    every minute. Cards rendered later (sliders that build after
 *    theme::ready) are picked up by a MutationObserver.
 *
 * Numbers render in Arabic-Indic digits on an Arabic page. The two wordings
 * (few/many) are the Arabic plural split at 10: "٥ أشخاص" vs "١٥ شخصاً".
 *
 * No `salla.*` anywhere: Cloudflare Rocket Loader reorders the SDK on the
 * live domains, and a module-scope salla call throws before the SDK exists.
 */
(function () {
  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var arabic = (document.documentElement.getAttribute('lang') || '').indexOf('ar') === 0;
  function digits(n) {
    var s = String(n);
    return arabic ? s.replace(/\d/g, function (d) { return AR[+d]; }) : s;
  }

  function readMin(v) {
    var min = parseInt(v, 10);
    return (isFinite(min) && min >= 1) ? min : 3;
  }

  function paintInto(el, count, min, few, many) {
    if (!(count >= min)) { el.hidden = true; return; }
    var text = el.querySelector('[data-live-text]');
    if (!text) { return; }
    var tpl = (count <= 10 ? few : many) || '';
    text.textContent = tpl.replace('{count}', digits(count));
    el.hidden = false;
  }

  /* ---------------- 1. page line: heartbeat ---------------- */
  var nodes = document.querySelectorAll('[data-live-visitors]');
  if (nodes.length) {
    var KEY = 'lv:visitor';
    var visitor = null;
    try { visitor = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!visitor) {
      visitor = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(KEY, visitor); } catch (e) { /* session only, still fine */ }
    }

    Array.prototype.forEach.call(nodes, function (el) {
      var base = (el.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
      var store = el.getAttribute('data-store') || '';
      var page = el.getAttribute('data-page') || '';
      var key = el.getAttribute('data-key') || '';
      var min = readMin(el.getAttribute('data-min'));
      var few = el.getAttribute('data-few');
      var many = el.getAttribute('data-many');
      if (!base || !store || !page || !key) { return; }

      function beat() {
        if (document.hidden) { return; }
        fetch(base + '/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'omit',
          keepalive: true,
          body: JSON.stringify({ store: store, page: page, key: key, visitor: visitor })
        })
          .then(function (r) { return r.ok ? r.json() : { count: 0 }; })
          .then(function (d) { paintInto(el, Number(d && d.count) || 0, min, few, many); })
          .catch(function () { el.hidden = true; });
      }

      beat();
      var timer = setInterval(beat, 60000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { beat(); } });
      window.addEventListener('pagehide', function () { clearInterval(timer); });
    });
  }

  /* ---------------- 2. card lines: batched read ---------------- */
  var body = document.body;
  if (!body || !body.hasAttribute('data-live-cards')) { return; }

  var cBase = (body.getAttribute('data-live-endpoint') || '').replace(/\/+$/, '');
  var cStore = body.getAttribute('data-live-store') || '';
  var cMin = readMin(body.getAttribute('data-live-min'));
  var cFew = body.getAttribute('data-live-few');
  var cMany = body.getAttribute('data-live-many');
  if (!cBase || !cStore) { return; }

  var BATCH = 60;
  var inflight = false;
  var dirty = false;

  function refreshCards() {
    if (document.hidden) { return; }
    if (inflight) { dirty = true; return; }
    var cards = document.querySelectorAll('[data-live-card]');
    if (!cards.length) { return; }

    // product id → its card elements (a product can appear in two grids)
    var byKey = {};
    Array.prototype.forEach.call(cards, function (el) {
      var k = el.getAttribute('data-live-card') || '';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(k)) { return; }
      (byKey[k] = byKey[k] || []).push(el);
    });
    var keys = Object.keys(byKey);
    if (!keys.length) { return; }

    var chunks = [];
    for (var i = 0; i < keys.length; i += BATCH) { chunks.push(keys.slice(i, i + BATCH)); }

    inflight = true;
    Promise.all(chunks.map(function (chunk) {
      var url = cBase + '/api/presence?store=' + encodeURIComponent(cStore) +
        '&page=product&keys=' + encodeURIComponent(chunk.join(','));
      return fetch(url, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : { counts: {} }; })
        .then(function (d) { return (d && d.counts) || {}; })
        .catch(function () { return {}; });
    })).then(function (results) {
      var counts = {};
      results.forEach(function (c) { for (var k in c) { counts[k] = c[k]; } });
      keys.forEach(function (k) {
        var n = Number(counts[k]) || 0;
        byKey[k].forEach(function (el) { paintInto(el, n, cMin, cFew, cMany); });
      });
    }).then(function () {
      inflight = false;
      if (dirty) { dirty = false; refreshCards(); }
    });
  }

  // Cards that arrive after load (sliders render after theme::ready, infinite
  // scroll appends more): one debounced refresh per burst of insertions.
  var pending = null;
  function schedule() {
    if (pending) { return; }
    pending = setTimeout(function () { pending = null; refreshCards(); }, 400);
  }
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) { continue; }
          if (n.hasAttribute('data-live-card') || (n.querySelector && n.querySelector('[data-live-card]'))) { schedule(); return; }
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  refreshCards();
  var cTimer = setInterval(refreshCards, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { refreshCards(); } });
  window.addEventListener('pagehide', function () { clearInterval(cTimer); });
})();
