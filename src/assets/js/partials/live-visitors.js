/* Live visitors — "N people are looking at this product right now".
 *
 * Markup ships hidden on the product and cart pages (see the twig there).
 * This POSTs a heartbeat to the pipeline — store, page, key, and a visitor id
 * this browser made up and keeps — on load and once a minute while the tab is
 * visible, then shows the line only when the reply is at or above the
 * merchant's minimum (default 3, per the brief). Below that, or on any
 * error, nothing is shown: a wrong or empty line is worse than none.
 *
 * Numbers render in Arabic-Indic digits on an Arabic page. The two wordings
 * (few/many) are the Arabic plural split at 10: "٥ أشخاص" vs "١٥ شخصاً".
 *
 * No `salla.*` anywhere: Cloudflare Rocket Loader reorders the SDK on the
 * live domains, and a module-scope salla call throws before the SDK exists.
 */
(function () {
  var nodes = document.querySelectorAll('[data-live-visitors]');
  if (!nodes.length) { return; }

  var KEY = 'lv:visitor';
  function visitorId() {
    var id = null;
    try { id = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!id) {
      id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(KEY, id); } catch (e) { /* session only, still fine */ }
    }
    return id;
  }

  var AR = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  var arabic = (document.documentElement.getAttribute('lang') || '').indexOf('ar') === 0;
  function digits(n) {
    var s = String(n);
    return arabic ? s.replace(/\d/g, function (d) { return AR[+d]; }) : s;
  }

  var visitor = visitorId();

  Array.prototype.forEach.call(nodes, function (el) {
    var base = (el.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
    var store = el.getAttribute('data-store') || '';
    var page = el.getAttribute('data-page') || '';
    var key = el.getAttribute('data-key') || '';
    var min = parseInt(el.getAttribute('data-min'), 10);
    if (!isFinite(min) || min < 1) { min = 3; }
    var text = el.querySelector('[data-live-text]');
    if (!base || !store || !page || !key || !text) { return; }

    function paint(count) {
      if (!(count >= min)) { el.hidden = true; return; }
      var tpl = el.getAttribute(count <= 10 ? 'data-few' : 'data-many') || '';
      text.textContent = tpl.replace('{count}', digits(count));
      el.hidden = false;
    }

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
        .then(function (d) { paint(Number(d && d.count) || 0); })
        .catch(function () { el.hidden = true; });
    }

    beat();
    var timer = setInterval(beat, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { beat(); } });
    window.addEventListener('pagehide', function () { clearInterval(timer); });
  });
})();
