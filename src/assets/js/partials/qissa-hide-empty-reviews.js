/**
 * «إخفاء قسم التقييمات عند عدم وجود تقييمات أو تعليقات» (pdp_hide_empty_reviews).
 * The template marks the section with `data-hide-empty-reviews="<product id>"`. It goes only once Salla answers
 * that the product has no rating and no comment, so a failed call leaves the section as it was.
 */
const quiet = fn => (salla.api && typeof salla.api.withoutNotifier === 'function' ? salla.api.withoutNotifier(fn) : fn());

export default function initHideEmptyReviews() {
  const root = document.querySelector('[data-hide-empty-reviews]'),
        id = root?.dataset.hideEmptyReviews;

  if (!id || !window.salla?.api?.request) {
    return;
  }

  quiet(() => Promise.all([
    salla.api.request(`rating/summary/${id}`, {}, 'get'),
    salla.api.request('comments', {params: {per_page: 1, page: 1, type: 'products', ids: [id]}}, 'get'),
  ])).then(([summary, comments]) => {
    if (Number(summary?.data?.count) || Number(comments?.pagination?.total) || comments?.data?.length) {
      return;
    }
    root.style.setProperty('display', 'none', 'important');
    // a package: the graphic beside the card takes the whole row
    root.closest('.qpd-more')?.classList.add('qpd-more--no-reviews');
  }).catch(() => {});
}
