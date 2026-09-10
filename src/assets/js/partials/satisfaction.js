/* Satisfaction rating on the thank-you page.
 *
 * Five faces; picking one posts the rating at once (so a customer who leaves
 * without writing anything still counts), then a prompt and a textarea appear
 * — "what did you like most" on a 5, "how can we do better" below it — and
 * the send button posts again with the comment. The pipeline MERGEs on the
 * order, so the second post updates the first.
 *
 * The order is remembered in localStorage once anything was sent, and the
 * form is replaced by the thanks line on a reload — never ask twice.
 *
 * No `salla.*` at module scope (Rocket Loader reorders the SDK on the live
 * domains). The thanks is shown whatever the server said: an unpersisted
 * answer is a logging problem, not something to show a customer.
 */
(function () {
  var root = document.querySelector('[data-csat]');
  if (!root) { return; }

  var base = (root.getAttribute('data-endpoint') || '').replace(/\/+$/, '');
  var store = root.getAttribute('data-store') || '';
  var order = root.getAttribute('data-order') || '';
  var theme = root.getAttribute('data-theme') || '';
  var lang = document.documentElement.getAttribute('lang') || '';
  if (!base || !store || !order) { return; }

  var KEY = 'csat:' + store + ':' + order;
  var faces = root.querySelectorAll('[data-csat-face]');
  var more = root.querySelector('[data-csat-more]');
  var prompt = root.querySelector('[data-csat-prompt]');
  var comment = root.querySelector('[data-csat-comment]');
  var thanks = root.querySelector('[data-csat-thanks]');
  var facesWrap = faces.length ? faces[0].parentNode : null;
  var question = root.querySelector('h2');

  function done() {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ }
    if (more) { more.hidden = true; }
    if (facesWrap) { facesWrap.hidden = true; }
    if (question) { question.hidden = true; }
    if (thanks) { thanks.hidden = false; }
    root.classList.add('is-done');
  }

  var already = null;
  try { already = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
  if (already) { done(); return; }

  var rating = 0;

  function send(withComment) {
    var body = { store: store, order: order, rating: rating, theme: theme, lang: lang };
    if (withComment && comment) { body.comment = comment.value.trim(); }
    return fetch(base + '/api/satisfaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      keepalive: true,
      body: JSON.stringify(body)
    }).catch(function () { /* the thanks still shows */ });
  }

  Array.prototype.forEach.call(faces, function (btn) {
    btn.addEventListener('click', function () {
      rating = parseInt(btn.getAttribute('data-csat-face'), 10) || 0;
      Array.prototype.forEach.call(faces, function (b) {
        var on = b === btn;
        b.classList.toggle('is-picked', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      root.classList.add('has-rating');
      if (prompt) {
        prompt.textContent = root.getAttribute(rating === 5 ? 'data-prompt-top' : 'data-prompt-low') || '';
      }
      if (more) { more.hidden = false; }
      send(false);                            // count the face even if they leave now
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
      send(true).then(done);
    });
  }
})();
