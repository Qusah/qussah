/* Satisfaction rating on the thank-you page — "would you recommend us?", 1 to 5.
 *
 * Two markups share this file (thank-you.twig, switch `thank_you_redesign`):
 *  · the order ticket (default): five numbered punch-holes in the ticket's stub,
 *    a radiogroup of [data-rate] buttons;
 *  · the old tissue-box card (switch off): five [data-csat-face] buttons.
 *
 * Picking posts the rating at once (a customer who leaves without writing still
 * counts); then a prompt and an optional comment appear — "what did you like
 * most" on a 5, "how can we do better" below it — and sending posts again with
 * the comment. The pipeline MERGEs on the order, so the second post updates the
 * first. Every post carries order (order.id, what the answers table has always
 * stored) AND order_ref (order.reference_id, the #number the customer and Salla's
 * order list show), with keepalive; errors are swallowed and the thanks shows
 * whatever the server said.
 *
 * The answer is remembered in localStorage (csat:<store>:<order>); any stored
 * value shows the thanks straight away on a reload — never ask twice.
 *
 * No `salla.*` anywhere in here, and nothing runs before the markup exists
 * (Rocket Loader reorders the SDK on the live domain).
 */
(function () {
  var page = document.querySelector('[data-qty]');
  // the floating WhatsApp bubble covers the punch-holes on phones; the page has its own
  if (page) { document.documentElement.classList.add('qty-page'); }

  var root = document.querySelector('[data-csat]');
  if (!root) { return; }

  var base = (root.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
  var store = root.getAttribute('data-store') || '';
  var order = root.getAttribute('data-order') || '';
  var ref = root.getAttribute('data-order-ref') || '';
  var theme = root.getAttribute('data-theme') || '';
  var lang = document.documentElement.getAttribute('lang') || '';
  if (!base || !store || !order) { return; }

  var KEY = 'csat:' + store + ':' + order;
  var more = root.querySelector('[data-csat-more]');
  var prompt = root.querySelector('[data-csat-prompt]');
  var comment = root.querySelector('[data-csat-comment]');
  var thanks = root.querySelector('[data-csat-thanks]');
  var rating = 0;

  // text: the comment to send along (a string, even empty, is sent as is)
  function post(text) {
    var body = { store: store, order: order, order_ref: ref, rating: rating, theme: theme, lang: lang };
    if (typeof text === 'string') { body.comment = text; }
    try {
      return fetch(base + '/api/satisfaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        keepalive: true,
        body: JSON.stringify(body)
      }).catch(function () { /* the thanks still shows */ });
    } catch (e) { return Promise.resolve(); }
  }
  function remember(state) {
    try { localStorage.setItem(KEY, JSON.stringify({ rating: rating, state: state })); } catch (e) { /* private mode */ }
  }
  function stored() {
    var v = null;
    try { v = localStorage.getItem(KEY); } catch (e) { return null; }
    if (!v) { return null; }
    try { v = JSON.parse(v); } catch (e) { v = null; }
    // older pages stored '1' / 'rated': answered, rating unknown
    return { rating: (v && +v.rating) || 0 };
  }

  if (root.querySelector('[data-rate]')) { ticket(); } else { faces(); }

  /* ── the order ticket's stub ── */
  function ticket() {
    var opts = [].slice.call(root.querySelectorAll('[data-rate]'));   // 1..5 in markup order
    var group = root.querySelector('[role="radiogroup"]');
    function el(n) { return root.querySelector('[data-csat-' + n + ']'); }
    function hide(list, on) { list.forEach(function (e) { if (e) { e.hidden = on; } }); }
    var done = root.querySelector('[data-csat-done]');
    var chosen = root.querySelector('[data-csat-chosen]');
    var live = root.querySelector('[data-csat-live]');
    var words = (root.getAttribute('data-words') || '').split('|');
    var sent = false, keyTimer = 0, liveTimer = 0;
    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function word(n) { return words[n - 1] || String(n); }
    function fill(t, n) { return (t || '').replace('{n}', n).replace('{word}', word(n)); }
    function say(t) {
      if (!live) { return; }
      clearTimeout(liveTimer); live.textContent = '';
      liveTimer = setTimeout(function () { live.textContent = t; }, 60);
    }
    function paint() {
      opts.forEach(function (b) {
        var n = +b.getAttribute('data-rate'), on = n === rating;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = (rating ? on : n === 1) ? 0 : -1;
        b.classList.toggle('is-on', on);
      });
      root.setAttribute('data-state', sent ? 'done' : (rating ? 'rated' : 'idle'));
    }
    // the focal moment: the picked number is punched through; its paper disc drops away
    function punch(n) {
      if (reduced) { return; }
      var chad = root.querySelector('[data-rate="' + n + '"] .qty-punch__chad');
      if (!chad || !chad.animate) { return; }
      var d = (n % 2 ? -1 : 1) * (6 + n * 2);
      chad.animate([
        { opacity: 1, transform: 'translate(0,0) rotate(0deg) scale(1)' },
        { opacity: 1, transform: 'translate(' + d * 0.3 + 'px,6px) rotate(' + d * 3 + 'deg) scale(.96)', offset: 0.18 },
        { opacity: 0, transform: 'translate(' + d + 'px,64px) rotate(' + d * 14 + 'deg) scale(.9)' }
      ], { duration: 680, easing: 'cubic-bezier(.5,0,.75,0)' });
    }
    function showDone(still) {
      hide([more, el('ask'), group, el('ends'), el('foot')], true);
      if (chosen) { chosen.textContent = rating ? fill(root.getAttribute('data-chosen'), rating) : ''; chosen.hidden = !rating; }
      if (done) { done.hidden = false; }
      // the stub tears off along the perforation; a reload shows it already torn
      if (still || reduced) {
        root.style.transition = 'none'; root.classList.add('is-torn');
        void root.offsetWidth; root.style.transition = '';
      } else {
        requestAnimationFrame(function () { root.classList.add('is-torn'); });
      }
    }
    function pick(n, viaKey) {
      if (sent || n === rating) { return; }
      rating = n; paint();
      if (prompt) { prompt.textContent = root.getAttribute(n === 5 ? 'data-prompt-top' : 'data-prompt-low') || ''; }
      hide([more, el('got')], false);              // the box is never focused: it would open the phone keyboard
      hide([el('hint')], true);
      punch(n);
      clearTimeout(keyTimer);
      if (viaKey) { keyTimer = setTimeout(function () { post(); }, 700); } else { post(); }
      remember('rated');
      say(fill(root.getAttribute('data-live'), n) + ' ' + (prompt ? prompt.textContent : '') + ' ' + (root.getAttribute('data-optional') || ''));
    }
    function send() {
      if (!rating || sent) { return; }
      clearTimeout(keyTimer);
      sent = true;
      var text = comment ? comment.value.trim() : '';
      post(text || undefined);
      remember('done');
      paint(); showDone(false);
      if (done) { try { done.focus({ preventScroll: true }); } catch (e) { done.focus(); } }
      say(thanks ? thanks.textContent : '');
    }

    var was = stored();
    if (was) { rating = was.rating; sent = true; paint(); showDone(true); return; }
    paint();

    opts.forEach(function (b) { b.addEventListener('click', function () { pick(+b.getAttribute('data-rate'), false); }); });
    if (group) {
      group.addEventListener('keydown', function (e) {
        var i = opts.indexOf(document.activeElement), k = e.key, j;
        if (i < 0 || sent) { return; }
        var rtl = getComputedStyle(group).direction === 'rtl';
        if (k === 'ArrowLeft') { j = rtl ? i + 1 : i - 1; }
        else if (k === 'ArrowRight') { j = rtl ? i - 1 : i + 1; }
        else if (k === 'ArrowDown') { j = i + 1; } else if (k === 'ArrowUp') { j = i - 1; }
        else if (k === 'Home') { j = 0; } else if (k === 'End') { j = opts.length - 1; }
        else { return; }
        e.preventDefault();
        j = (j + opts.length) % opts.length;
        opts[j].focus(); pick(j + 1, true);         // arrows choose, and post after a 0.7s pause
      });
    }
    if (more) { more.addEventListener('submit', function (e) { e.preventDefault(); send(); }); }
  }

  /* ── the old tissue-box card (switch off): today's behaviour, plus order_ref ── */
  function faces() {
    var list = root.querySelectorAll('[data-csat-face]');
    var facesWrap = list.length ? list[0].parentNode : null;
    var question = root.querySelector('h2');

    function done() {
      try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
      if (more) { more.hidden = true; }
      if (facesWrap) { facesWrap.hidden = true; }
      if (question) { question.hidden = true; }
      if (thanks) { thanks.hidden = false; }
      root.classList.add('is-done');
    }

    if (stored()) { done(); return; }

    Array.prototype.forEach.call(list, function (btn) {
      btn.addEventListener('click', function () {
        rating = parseInt(btn.getAttribute('data-csat-face'), 10) || 0;
        Array.prototype.forEach.call(list, function (b) {
          var on = b === btn;
          b.classList.toggle('is-picked', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        root.classList.add('has-rating');
        if (prompt) {
          prompt.textContent = root.getAttribute(rating === 5 ? 'data-prompt-top' : 'data-prompt-low') || '';
        }
        if (more) { more.hidden = false; }
        post();                                   // count the face even if they leave now
        try { localStorage.setItem(KEY, 'rated'); } catch (e) { /* ignore */ }
        if (comment) { setTimeout(function () { comment.focus(); }, 60); }
      });
    });

    if (more) {
      more.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!rating) { return; }
        var btn = more.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; }
        post(comment ? comment.value.trim() : '').then(done);
      });
    }
  }
})();
