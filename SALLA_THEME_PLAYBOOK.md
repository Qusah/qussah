# Salla Theme Build Playbook (Figma → Theme)

A repeatable, mistake-proof procedure for rebuilding/extending a **Salla Twilight theme** to match a Figma design. Written from the Qussah project so the same approach transfers cleanly to any similar Salla project.

> Read this top-to-bottom **once before starting**, then use the checklists per task. The rules in "Hard Rules" exist because each one corresponds to a real mistake that broke the page.

---

## 0. Project anatomy (verify these first on a new project)

Salla themes share one layout. Confirm paths before assuming:

```
<project>/                     # repo root (may contain a nested theme dir, e.g. qussah/)
  package.json                 # scripts live HERE — note which dir it's in
  tailwind.config.js           # custom screens: xxs/xxxs/xs added on top of lg=1024
  twilight.json                # theme config, default component data, settings keys
  public/                      # COMMITTED compiled output (app.css, *.js bundles)
  src/
    assets/
      styles/
        01-settings 02-generic 03-elements 04-components 05-utilities
        app.scss               # the import manifest — every component @import lives here
      js/
        partials/              # web-component JS (e.g. add-product-toast.js)
    views/
      layouts/ components/ pages/
      pages/partials/          # ALL reusable twig includes live here (see Hard Rule #3)
    locales/                   # ar.json / en.json translation keys
```

**Action on a new project:**
1. Find where `package.json` lives (root vs nested theme dir). All build commands run from there.
2. Open `tailwind.config.js` → note the exact breakpoints (`lg` may be 1024; extra `xxs/xs` are project-specific).
3. Open `src/assets/styles/app.scss` → this is the only place a new SCSS partial becomes active.
4. `grep` for an existing `{% include %}` to learn the include namespace convention (see Hard Rule #3).

---

## 1. Hard Rules (each prevents a known breakage)

1. **CSS-first, scoped wrapper.** Add a single wrapper class per page/feature (e.g. `.qcart`, `.qpd`) and put ALL styling in a new `04-components/qissa-<name>.scss`. Mirror the existing scoped pattern. Touch Twig only to add the wrapper + semantic hook classes. **Never change Salla cart/checkout logic or remove Salla web components.**

2. **Register every new SCSS file in `app.scss`.** A new partial does nothing until `@import './04-components/qissa-<name>';` is added. Build won't error — the styles just silently won't exist.

3. **Twig includes have ONE working convention — match it exactly.** In this theme:
   - Partials live under `src/views/pages/partials/<name>.twig`.
   - Referenced as `{% include 'pages.partials.<name>' with { key: value } %}`.
   - **NO `only`. NO `is defined`.** These don't appear anywhere in the theme and caused a **blank page** when used.
   - A brand-new top-level `src/views/partials/` dir does **NOT resolve** → blank page.
   - Always `grep` an existing include first and copy its exact form.

4. **Preserve every Salla hook/component & ID.** Keep `salla-quantity-input`, `salla-cart-coupons`, `salla-button`, `salla-add-product-button`, `salla-slider`, `salla-social-share`, and IDs like `#sub-total`, `#total-discount`, `#tax-amount`, `#cart-submit`, `.item-total`, `.item-price`, `data-cart-total`. To hide something visually, use `display:none` — do not delete it from the DOM. Salla's JS updates these live.

5. **No hard-coded dynamic values.** Reuse existing translation keys (`trans('pages.products.tax_included')`) and gate on real settings (`store.settings.tax.taxable_prices_enabled`). Never hard-code "15٪", prices, or labels that the platform owns.

6. **Twig renders server-side — the build never validates it.** `webpack` only compiles SCSS/JS. Any Twig change (new include, new var) requires commit + restart `salla theme preview` + hard refresh to actually verify. Never claim a Twig change works without a live preview check.

7. **RTL-aware CSS.** This is an Arabic-first theme. Use logical properties (`border-inline`, `margin-inline`, `inset-inline-start`) and remember in RTL prev-arrow sits right, next-arrow sits left.

8. **Build = development mode, one-shot.** Use `pnpm run development` (or `pnpm -C <themedir> run development`). **Do NOT commit a `production` build** — it minifies JS bundles and creates huge noisy diffs against the repo's committed un-minified bundles. `public/app.css` and changed `public/*.js` are committed.

---

## 2. Salla web-component gotchas (learned the hard way)

- **`<salla-slider>`**: the element `<div class="swiper s-slider-container">` **is** the Swiper element. Read the instance via `container.swiper` (not `.s-slider-container .swiper`). Host exposes `slideNext()/slidePrev()` (+ `…Loop`) as a safe fallback. Built-in arrows only render with `show-controls`; custom arrows are injected into `.s-slider-container` by an inline script and centered with `position:absolute; top:50%`.

- **`<salla-button>` renders in light DOM**: `<button class="s-button-element s-button-btn"><span class="s-button-text"><slot></span></button>`. Slotted icons land inside `.s-button-text` and can get **clipped** — for an overlay icon (e.g. wishlist heart) prefer a plain `<button>` for full CSS control.

- **`<salla-button>` is lazy-defined → don't use it in dynamically-rendered cards.** On soft SPA navigation it may not upgrade for freshly-inserted nodes → renders as a zero-width empty element until hard refresh. Use a plain `<button>` (renders synchronously). `salla-add-product-button` is separately defined and unaffected.

- **Wishlist ID type exception**: `salla.wishlist.toggle(id)` needs a **NUMBER** — `salla.wishlist.toggle({{ product.id }})` (no quotes). Passing a quoted string fails the internal `.includes()` and always re-adds. (This is the exception; `salla.cart.*` IDs are passed as strings.)

- **Wishlist state**: `wishlist.js` toggles `.is-added` on any `.btn--wishlist[data-id]` and restores from `salla.storage.get('salla::wishlist', [])` on load — no custom state JS needed.

- **Live cart updates**: `salla.cart.event.onUpdated` / `salla.cart.api.details()` keep totals, quantities, and coupons live. A modal/mini-cart can reuse the cart page markup+classes and stay live for free.

---

## 3. Standard workflow for a new section/page

1. **Inspect Figma — only the agreed nodes.** Record node IDs for **both desktop and mobile** and the Figma file key. Extract tokens (colors, fonts, radii, spacing) into notes before coding.
2. **Phase it.** Get the overall structure/layout correct first (Phase 1), then per-section pixel polish in later phases. The user wants structure right before pixels.
3. **Add the wrapper + hook classes** in the Twig (minimal change).
4. **Create `04-components/qissa-<name>.scss`** scoped under the wrapper; **add the `@import` to `app.scss`.**
5. **Layout with CSS Grid `grid-template-areas`** for responsive restructures (e.g. cart item: mobile 2-row, desktop 1-row) — cleaner than reordering DOM.
6. **Build** (`pnpm run development`), commit `public/app.css` (+ any `public/*.js`).
7. **Verify live**: restart `salla theme preview`, hard refresh, check desktop AND mobile (use the real Figma widths, e.g. 1440 / 428, plus narrow phones 390/375/360).
8. **Record** node IDs, decisions, and any gotcha in a memory/notes file.

---

## 4. Responsive checklist

- Confirm breakpoints from `tailwind.config.js` (don't assume `lg`). Custom guards used real values (e.g. `@media (max-width:400px)` not 480) so the 428px Figma frame keeps exact sizes; only narrower phones get overflow fixes.
- Test the exact Figma frame widths first, then the awkward in-between widths.
- Desktop two-column layouts: `flex:1 1 0; min-width:0` on the fluid column, `flex:0 0 <Npx>; width:<Npx>` on the fixed sidebar. `min-width:0` prevents flex overflow.

---

## 5. Pre-commit / "am I done?" checklist

- [ ] New SCSS file is `@import`-ed in `app.scss`.
- [ ] All Salla components, hooks, and IDs preserved (hidden via `display:none`, never deleted).
- [ ] Twig includes use the project's exact namespace, no `only` / no `is defined`.
- [ ] No hard-coded prices/labels/percentages; reused translation + settings keys.
- [ ] Built with `development` (not `production`); `public/app.css` (+ changed JS) committed.
- [ ] Verified on a live `salla theme preview` (Twig is NOT validated by the build) — desktop + mobile.
- [ ] RTL checked (logical properties, arrow sides).
- [ ] If a homepage/global component was reused, the original was left untouched (no duplication, no homepage risk).

---

## 6. Common failure modes → first thing to check

| Symptom | Most likely cause |
|---|---|
| Blank page after a Twig change | Wrong include path / used `only` or top-level `partials/` dir. Match existing `pages.partials.*` form. |
| New styles not applying | Forgot the `@import` in `app.scss`, or stale/unsynced `app.css` in preview (commit + restart + hard refresh). |
| Layout looks right in CSS but broken in preview | Stale compiled `app.css`; rebuild + restart preview + hard refresh before deeper debugging. |
| Icon clipped / button zero-width | `salla-button` light-DOM clipping or lazy-define on SPA nav → use a plain `<button>`. |
| Wishlist always re-adds | Passed product id as a quoted string; pass it as a number. |
| Huge noisy JS diff | Accidentally ran a `production` build; rebuild with `development`. |
| Totals/qty/coupon not updating | A Salla hook/ID/component was removed; restore it (hide with `display:none` instead). |

---

### Build commands (copy-paste)
```bash
# from the dir containing package.json (root or nested theme dir, e.g. qussah/)
pnpm run development          # one-shot dev build (matches committed un-minified bundles)
pnpm run watch               # rebuild on change
# then: commit public/app.css (+ changed public/*.js), restart `salla theme preview`, hard refresh
```
