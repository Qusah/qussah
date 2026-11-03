/**
 * Product page taps that used to go nowhere (Clarity dead clicks, Oct 2026;
 * ClickUp z91pu68wfh):
 *
 *  - «−» at quantity 1 looks disabled and, tapped, says «الحد الأدنى للكمية 1»
 *    (setting pdp_qty_min_hint, which puts data-qty-min-hint on .qpd__qty).
 *    It stays a live button: a disabled one that answers nothing is still a
 *    dead click.
 *  - «توصيل لبابك» and «الدفع عند الاستلام» open a bottom sheet with the
 *    merchant's text when single.twig printed them as buttons (setting
 *    pdp_trust_sheets and a non-empty pdp_delivery_info / pdp_payment_info).
 *
 * Opening a sheet and reaching the floor of the quantity are sent to Clarity
 * as events, so the next report can count them.
 */

const track = name => {
  try { if (typeof window.clarity === 'function') window.clarity('event', name); } catch (e) {}
};

/* ------------------------------------------------------------ quantity */

function initQtyMinHint() {
  document.querySelectorAll('.qpd__qty[data-qty-min-hint]').forEach(box => {
    const msg = box.getAttribute('data-qty-min-hint');
    const input = () => box.querySelector('.s-quantity-input-input, input[name="quantity"]');
    const minus = () => box.querySelector('.s-quantity-input-decrease-button');
    const value = () => parseInt(input()?.value || '1', 10) || 1;

    // Salla's component renders its buttons after it hydrates, and changes the
    // value from its own buttons, so the state is read again after every tap.
    const paint = () => {
      const btn = minus();
      if (!btn) return;
      const atMin = value() <= 1;
      btn.classList.toggle('is-at-min', atMin);
      btn.setAttribute('aria-disabled', atMin ? 'true' : 'false');
    };

    let hint;
    const say = () => {
      if (!hint) {
        hint = document.createElement('span');
        hint.className = 'qpd__qty-hint';
        hint.setAttribute('role', 'status');
        box.appendChild(hint);
      }
      hint.textContent = msg;
      hint.classList.remove('is-on');
      void hint.offsetWidth;   // restart the fade on a repeat tap
      hint.classList.add('is-on');
      clearTimeout(hint.t);
      hint.t = setTimeout(() => hint.classList.remove('is-on'), 2200);
    };

    box.addEventListener('click', e => {
      const btn = e.target.closest('.s-quantity-input-decrease-button');
      if (btn && value() <= 1) {
        say();
        track('pdp_qty_min');
      }
      setTimeout(paint, 0);
    }, true);
    box.addEventListener('input', () => setTimeout(paint, 0));
    box.addEventListener('change', () => setTimeout(paint, 0));

    paint();
    if (!minus()) {
      const mo = new MutationObserver(() => { if (minus()) { mo.disconnect(); paint(); } });
      mo.observe(box, { childList: true, subtree: true });
    }
  });
}

/* --------------------------------------------------------- trust sheets */

let sheet;

function buildSheet(closeLabel) {
  sheet = document.createElement('div');
  sheet.className = 'qsheet';
  sheet.hidden = true;
  sheet.innerHTML = `
    <div class="qsheet__backdrop" data-qsheet-dismiss></div>
    <div class="qsheet__panel" role="dialog" aria-modal="true" aria-labelledby="qsheet-title">
      <div class="qsheet__head">
        <h2 class="qsheet__title" id="qsheet-title"></h2>
        <button type="button" class="qsheet__close" data-qsheet-dismiss></button>
      </div>
      <div class="qsheet__body"></div>
    </div>`;
  const x = sheet.querySelector('.qsheet__close');
  x.setAttribute('aria-label', closeLabel || '');
  x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  sheet.addEventListener('click', e => { if (e.target.closest('[data-qsheet-dismiss]')) closeSheet(); });
  document.body.appendChild(sheet);
}

let opener = null;
const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); closeSheet(); } };

function openSheet(btn, closeLabel) {
  const key = btn.getAttribute('data-qsheet');
  const tpl = btn.closest('li')?.querySelector(`template[data-qsheet-body="${key}"]`);
  if (!tpl) return;
  if (!sheet) buildSheet(closeLabel);
  sheet.querySelector('.qsheet__title').textContent = btn.querySelector('b')?.textContent.trim() || '';
  sheet.querySelector('.qsheet__body').textContent = tpl.content.textContent.trim();
  opener = btn;
  sheet.hidden = false;
  document.documentElement.classList.add('qsheet-open');
  requestAnimationFrame(() => sheet.classList.add('is-open'));
  document.addEventListener('keydown', onKey, true);
  sheet.querySelector('.qsheet__close').focus({ preventScroll: true });
  track('pdp_sheet_' + key);
}

function closeSheet() {
  if (!sheet || sheet.hidden) return;
  sheet.classList.remove('is-open');
  document.documentElement.classList.remove('qsheet-open');
  document.removeEventListener('keydown', onKey, true);
  sheet.hidden = true;
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });
}

function initTrustSheets() {
  const list = document.querySelector('.qpd__trust');
  if (!list || !list.querySelector('[data-qsheet]')) return;
  const closeLabel = list.getAttribute('data-qsheet-close');
  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-qsheet]');
    if (btn) openSheet(btn, closeLabel);
  });
}

export default function initPdpTaps() {
  initQtyMinHint();
  initTrustSheets();
}
