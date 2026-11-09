/**
 * The theme's own words (src/locales, `blocks.qissa.*`) for its scripts.
 *
 * salla.lang carried them until Nov 2026. With the store feature
 * «use-translations-cdn» Salla's SDK loads only its common language file
 * (cdn.files.salla.network/translations/common/<lang>.json), never the store's
 * file with the theme's locales, and salla.lang.get hands back the bare key —
 * cards read «blocks.qissa.sold +1,000 blocks.qissa.times». So
 * layouts/master.twig prints the words the scripts draw (window.qissaWords,
 * through trans(), which still works) and this reads them whenever salla.lang
 * has nothing better. `:name` parameters are filled as salla.lang fills them.
 */
export function qword(key, params) {
  const full = `blocks.qissa.${key}`;
  const said = window.salla && salla.lang ? salla.lang.get(full, params) : full;
  if (said && said !== full) return said;
  let word = (window.qissaWords && window.qissaWords[key]) || '';
  if (params) Object.keys(params).forEach((name) => { word = word.split(`:${name}`).join(params[name]); });
  return word;
}
