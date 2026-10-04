/**
 * Footer accordion — every titled footer section collapses under its heading
 * on small screens (chevron: ⌄ closed / ^ open). Open by default; closed by
 * default on the cart page (the footer carries `data-ftg-closed` there, set in
 * footer.twig from page.slug). Desktop is untouched: the CSS only honours
 * `.is-closed` below the breakpoint, and the heading is only a button there.
 *
 * Sections rendered later (Salla components, the footer menu) are picked up by
 * a MutationObserver, and a heading that a component re-renders is re-dressed
 * while the section keeps its open/closed state.
 *
 * No Salla SDK use — safe to run before it loads (Rocket Loader).
 */
(function () {
  const CFG = { footer: '.qfooter', section: '.qfooter__col', head: '.qfooter__title', maxWidth: 768 };
  const CHEV = '<svg class="ftg-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
  const mq = window.matchMedia(`(max-width: ${CFG.maxWidth}px)`);
  const heads = new Set();

  function syncRole(head, section) {
    if (mq.matches) {
      head.setAttribute('role', 'button');
      head.tabIndex = 0;
      head.setAttribute('aria-expanded', String(!section.classList.contains('is-closed')));
    } else {
      head.removeAttribute('role');
      head.removeAttribute('tabindex');
      head.removeAttribute('aria-expanded');
    }
  }

  function enhance(footer) {
    footer.querySelectorAll(CFG.section).forEach((section) => {
      const head = section.querySelector(CFG.head);
      if (!head || head.classList.contains('ftg-head')) return;
      if (!section.dataset.ftg) {
        section.dataset.ftg = '1';
        if (footer.hasAttribute('data-ftg-closed')) section.classList.add('is-closed');
      }
      head.classList.add('ftg-head');
      head.insertAdjacentHTML('beforeend', CHEV);
      heads.add(head);
      syncRole(head, section);
      const toggle = () => {
        if (!mq.matches) return;
        section.classList.toggle('is-closed');
        syncRole(head, section);
      };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  function init() {
    const footer = document.querySelector(CFG.footer);
    if (!footer) return;
    enhance(footer);
    new MutationObserver(() => enhance(footer)).observe(footer, { childList: true, subtree: true });
    const onChange = () => heads.forEach((head) => head.isConnected && syncRole(head, head.closest(CFG.section)));
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
