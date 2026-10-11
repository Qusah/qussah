// ============================================================================
// Sold-count figure — the rounded «مباع +300 مرة» form (shared).
//
// The lifetime count (`sold_quantity`) is not printed as it is. It is rounded
// down — to the ten under 100, to the hundred under 1,000, to the thousand
// from there up — and shown with a "+" on the left of the digits, in Latin
// digits with a thousands comma. Under 10 the line is not drawn at all.
//
//        7  →  ''
//       34  →  '+30'
//      470  →  '+400'
//    6,072  →  '+6,000'
//   17,177  →  '+17,000'
//  109,798  →  '+109,000'
//
// It rounds down, never up, so the "+" stays true: the real count is always
// at least the number shown.
//
// Every «مباع» line on the store follows this ladder — change them together:
//   product-card.js                          the JS card
//   app.js hydrateCardMeta()                 page-rendered cards, filled after load
//   components/partials/qsold-count.twig     the same ladder in Twig (product
//                                            page, qprod-card, qpack-card)
// ============================================================================

const MIN_SHOWN = 10;           // under this the line is not drawn
const MAX_ROUNDED = 1000000000; // the Twig ladder stops here too; no catalogue reaches it

// '+6,000', or '' when the count is under 10, missing or not a number. The
// caller wraps it in <bdi>, which keeps the "+" on the number's left inside
// the Arabic sentence.
export function soldLabel(value) {
  const n = Math.floor(Number(value) || 0);
  if (n < MIN_SHOWN) return '';
  if (n >= MAX_ROUNDED) return format(n);
  const step = n < 100 ? 10 : n < 1000 ? 100 : 1000;
  return `+${format(Math.floor(n / step) * step)}`;
}

// Latin digits and a thousands comma on every store language
function format(n) {
  return n.toLocaleString('en-US');
}
