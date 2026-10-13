/**
 * Typing a cart line's quantity: the number between + and −. One script, the
 * same in the four themes.
 *
 * Two steppers carry that number:
 *   · a cart drawer's own — the number is a field marked `data-qty-field`
 *     (bindQuantityFields);
 *   · Salla's <salla-quantity-input> on a cart line — its own <input>
 *     (guardSallaQuantity): every cart page, and a drawer built on it.
 * Both follow one rule: digits only; Enter or leaving the field applies it; an
 * empty value or a zero goes back to the quantity the line had; nothing above
 * the product's limit is sent. + and − are untouched.
 *
 * The limit. A cart line does not carry one. It is the product's
 * `max_quantity` — the figure the product page hands its own quantity input —
 * read once per product, the first time one of its fields is touched. The
 * server keeps the last word: a variant with less stock refuses, and the line
 * keeps the quantity it had.
 *
 * No `salla.*` at module scope: every call sits inside a listener.
 */

const WAIT = 1500; // ms: how long an apply waits for a limit that has not answered yet

const quiet = fn => (salla.api && typeof salla.api.withoutNotifier === 'function' ? salla.api.withoutNotifier(fn) : fn());

/** Latin digits only: «١٢» → 12, anything that is not a digit dropped. */
export function digitsOnly(text) {
  return String(text ?? '').replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 15)).replace(/\D/g, '');
}

/* ------------------------------------------------------------------ the limit */

const limits = new Map(); // product id → the most one order may hold (0: none stated)
const reads = new Map();  // product id → the read in flight

export function quantityLimit(productId) {
  const id = Number(productId);
  if (!id) { return Promise.resolve(0); }
  if (limits.has(id)) { return Promise.resolve(limits.get(id)); }
  if (!reads.has(id)) {
    reads.set(id, Promise.resolve()
      .then(() => quiet(() => salla.product.api.getDetails(id, [])))
      .then(response => {
        const max = Number(response?.data?.max_quantity);
        limits.set(id, Number.isFinite(max) && max > 0 ? max : 0);
        return limits.get(id);
      })
      .catch(() => 0)
      .finally(() => reads.delete(id)));
  }
  return reads.get(id);
}

/** A product's limit if it has been read already, else 0: for a stepper drawn before anyone asks. */
export function knownLimit(productId) {
  return limits.get(Number(productId)) || 0;
}

let lines = null; // cart line id → product id, read once

/** The product of a cart line the page printed without saying which it is. */
export function lineProduct(lineId, again = true) {
  const key = String(lineId); // a STRING: line ids are past JavaScript's safe integers
  lines = lines || Promise.resolve()
    .then(() => quiet(() => salla.cart.api.details(null, ['options'])))
    .then(response => new Map((response?.data?.cart?.items || []).map(item => [String(item.id), item.product_id])))
    .catch(() => { lines = null; return new Map(); });
  return lines.then(map => {
    if (map.has(key) || !again) { return map.get(key) || 0; }
    lines = null; // a line added since the read
    return lineProduct(key, false);
  });
}

/* ------------------------------------------------------- the drawer's own field */

const FIELD = 'input[data-qty-field]';
const SALLA_FIELD = 'salla-quantity-input[cart-item-id] input';

/** The first key replaces the number: selected now, and again once the tap that brought the focus has placed its caret. */
function selectNumber(f) {
  const shown = f.value;
  f.select();
  requestAnimationFrame(() => { if (document.activeElement === f && f.value === shown) { f.select(); } });
}

/**
 * True while the shopper types in one of `root`'s quantity fields, the
 * drawer's own or Salla's. A drawer holds its redraw back meanwhile: it would
 * take the field, and on a phone the keyboard, from under them.
 */
export function typingIn(root) {
  const el = document.activeElement;
  return el instanceof Element && (el.matches(FIELD) || el.matches(SALLA_FIELD)) && root.contains(el);
}

/**
 * `root` holds the lines and outlives their redraws. A field names its line in
 * `data-qty-field` and its product in `data-product`; its `value` attribute
 * is the quantity the line has. `apply(line, quantity)` is called with a
 * quantity that is valid and new; `left()` each time a field is left, for the
 * redraw that was held back.
 */
export function bindQuantityFields(root, apply, left = null) {
  const field = event => (event.target instanceof Element ? event.target.closest(FIELD) : null);
  const fieldOf = line => [...root.querySelectorAll(FIELD)].find(f => f.dataset.qtyField === line);

  root.addEventListener('focusin', event => {
    const f = field(event);
    if (!f) { return; }
    quantityLimit(f.dataset.product); // read ahead: known by the time the typing ends
    selectNumber(f);
  });

  root.addEventListener('input', event => {
    const f = field(event);
    if (!f) { return; }
    const clean = digitsOnly(f.value);
    if (clean !== f.value) { f.value = clean; }
  });

  root.addEventListener('keydown', event => {
    const f = field(event);
    if (!f) { return; }
    if (event.key === 'Enter') { event.preventDefault(); f.blur(); }
    // Escape puts the number back and is the field's alone: the drawer stays open
    if (event.key === 'Escape') { event.stopPropagation(); f.value = f.defaultValue; f.blur(); }
  });

  root.addEventListener('focusout', event => {
    const f = field(event);
    if (!f) { return; }
    commit(f, apply, fieldOf);
    if (left) { left(); }
  });
}

function commit(f, apply, fieldOf) {
  const was = Number(f.defaultValue) || 1;
  const typed = parseInt(digitsOnly(f.value), 10);
  if (!Number.isFinite(typed) || typed < 1) { f.value = String(was); return; } // empty, or a zero: not a quantity
  f.value = String(typed);
  if (typed === was) { return; }

  const line = f.dataset.qtyField;
  const send = max => {
    // the lines may have been redrawn while the limit was read: the line's field as it is now
    const now = f.isConnected ? f : fieldOf(line);
    if (!now || now.disabled || (Number(now.defaultValue) || 1) !== was) { return; } // gone, being saved, or changed meanwhile
    const next = max && typed > max ? max : typed;
    now.value = String(next);
    if (next !== was) { apply(line, next); }
  };
  const id = Number(f.dataset.product);
  if (!id || limits.has(id)) { send(limits.get(id) || 0); return; }
  Promise.race([quantityLimit(id), new Promise(resolve => setTimeout(resolve, WAIT, 0))]).then(send);
}

/* ------------------------------------------------------------------ Salla's field */

/**
 * <salla-quantity-input cart-item-id> already takes typing where the store
 * allows it (store.settings.product.manual_quantity), and sends each change
 * through the form around it. Left alone it reads an emptied field as 1 and
 * sends that, lets Enter submit the one-field form (a page reload), and knows no
 * limit on a cart line. This keeps those three out and selects the number when
 * the field is entered, as the drawer's own field does; everything else is the
 * component's own doing.
 *
 * `productOf(host)` → the line's product id, or a promise of it. Listeners are
 * on the capture side: they run before the component's own on the field.
 */
export function guardSallaQuantity(root, productOf) {
  if (root.qtyGuarded) { return; }
  root.qtyGuarded = true;

  const field = event => (event.target instanceof Element && event.target.matches(SALLA_FIELD) ? event.target : null);
  const hostOf = f => f.closest('salla-quantity-input');
  const limitOf = f => parseInt(hostOf(f).getAttribute('max'), 10) || 0;
  const quantity = f => { const n = parseInt(digitsOnly(f.value), 10); return Number.isFinite(n) && n > 0 ? n : 0; };

  root.addEventListener('focusin', event => {
    const f = field(event);
    if (!f) { return; }
    f.dataset.qtyWas = String(quantity(f) || 1);
    selectNumber(f);
    if (limitOf(f)) { return; } // the page states the limit itself
    const host = hostOf(f);
    Promise.resolve(productOf(host)).then(quantityLimit).then(max => {
      // the component clamps typing and + to its `max` attribute by itself
      if (max && host.isConnected) { host.setAttribute('max', String(max)); }
    });
  }, true);

  root.addEventListener('input', event => {
    const f = field(event);
    if (!f) { return; }
    const typed = quantity(f);
    if (typed) {
      const max = limitOf(f);
      f.dataset.qtyWas = String(max && typed > max ? max : typed);
      return;
    }
    // not a quantity yet: kept from the component, which would send 1
    const clean = digitsOnly(f.value);
    if (clean !== f.value) { f.value = clean; }
    event.stopPropagation();
  }, true);

  root.addEventListener('keydown', event => {
    const f = field(event);
    if (f && event.key === 'Enter') { event.preventDefault(); f.blur(); }
  }, true);

  // left empty: the quantity the line had, and no word of it to the form
  root.addEventListener('change', event => {
    const f = field(event);
    if (f && !quantity(f)) { f.value = f.dataset.qtyWas || '1'; event.stopPropagation(); }
  }, true);
  root.addEventListener('focusout', event => {
    const f = field(event);
    if (f && !quantity(f)) { f.value = f.dataset.qtyWas || '1'; }
  }, true);
}
