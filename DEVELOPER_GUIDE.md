# Qussah Theme — Developer Guide

How we build the **Qussah / قصة** Salla Twilight theme. Read this fully before touching code.
Brand: Arabic RTL home-cleaning products. Navy/blue palette. Pixel-perfect to Figma.

---

## 0. The one rule

**Build exactly what the Figma design shows. Nothing more, nothing less.**
No improvising, no "nice to have" extras, no guessing values. Every size, color, spacing,
position, text direction, and button placement comes from Figma. If it's not in the design,
it doesn't go in the code.

---

## 1. Project facts

| | |
|---|---|
| Repo | `https://github.com/Qusah/qussah` (org `Qusah`, not personal) |
| Local path | `/Users/hazem/Desktop/tets/Qussah` |
| Theme | Qussah (Salla Twilight, theme-raed starter) |
| Auth | Each dev uses their **own** Salla PAT via `salla login`. Never a shared account. |
| Node | v24.x · pnpm 11.x |
| Design | Figma (desktop frame `100:2` @1440px, mobile frame `187:1492` @428px) |
| Fonts | **GE SS Two** (Arabic) + Poppins (Latin numerals). GE SS Two is base64-embedded in `src/assets/styles/01-settings/fonts.scss`. |

### Homepage sections (top → bottom) and status
1. Hero + header — **done** (`qissa-hero` + `header.twig`)
2. Categories "تسوق حسب الفئات" — **done** (`qissa-categories`)
3. Products grid "منتجات مميزة" — **done** (`qissa-products`)
4. Banner "نظافة بيتك تبدأ من هنا" — **done** (`qissa-banner`)
5. Products carousel "عرض كل المنتجات" — todo
6. 3-up banner strip "+152 منتج" — todo
7. Offers "عروض تنتهى قريبا" + countdown — **done** (`qissa-offers`)
8. Banner "لأن بيتك يستاهل الأفضل" — todo
9. Testimonials carousel — todo
10. Trust badges strip — todo
11. Footer + newsletter — todo

---

## 2. How a homepage section gets built (the flow)

Every custom section is **3 files + 1 registration**:

```
src/views/components/home/<name>.twig            # markup
src/assets/styles/04-components/<name>.scss      # styles
src/assets/styles/app.scss                       # add @import line
twilight.json                                    # register the component (dashboard fields)
```

### Step by step
1. **Pull exact specs from Figma** (use the Figma MCP / Dev Mode):
   - `get_screenshot` on the section node → see it
   - `get_design_context` on the node → exact px, colors, fonts, gaps
   - `get_metadata` → exact x/y positions of every element (confirms RTL order)
2. **Write the twig** in `src/views/components/home/`. Read merchant fields as `{{ component.fieldId }}` (NOT bare `{{ fieldId }}`).
3. **Write the scss** in `src/assets/styles/04-components/`, BEM naming (`.block__element`). Use the EXACT Figma values.
4. **Add the import** to `app.scss` (next to the other `qissa-*` imports).
5. **Register in `twilight.json`** — add a component object with a **fresh UUID** `key`, `path: "home.<name>"`, and the merchant `fields`. (See §4.)
6. **Build CSS** → **commit** → **push** → **restart preview**. (See §3.)

---

## 3. How to test (CRITICAL — read carefully)

### Build the CSS before committing
SCSS does NOT compile itself on commit. Run the watcher to compile `public/app.css`:
```
npm run development      # compiles + watches; Ctrl+C when app.css is updated
```
`public/app.css` is COMMITTED. If you forget to rebuild + commit it, your styles will NOT
appear in the preview even though the .scss is correct. (This bit us repeatedly.)

### Commit + push (sync needs committed state)
```
git add -A
git commit -m "..."      # NO AI references in commit messages — production theme
git push
```

### Preview
```
salla theme preview
# select  Qussah-Test  →  no  →  yes
# wait for "preview is ready" + a signed URL
```
Open the **fresh signed URL** in Chrome (`salla.design/dev-...`).

### When to RESTART vs just REFRESH
- **CSS-only change** (.scss) → just **hard refresh** (Cmd+Shift+R). Hot-reloads.
- **Twig or twilight.json change** → **restart** `salla theme preview` (Ctrl+C, run again).
  The CLI only re-syncs committed Twig/JSON on a fresh run.

### Header/footer don't show in the editor canvas
The Salla **editor canvas** (`/themes/editor/...`) renders ONLY the page body — no header,
footer, or master layout. To test the header/nav you MUST use the **store preview URL**
(`salla.design/dev-...`), opened fresh from the latest `salla theme preview`.

### Test mobile
Chrome DevTools → device toolbar (Cmd+Shift+M) → set width **428px** (iPhone Pro Max) =
the exact Figma mobile frame. Or open the preview URL on a real phone.

---

## 4. twilight.json — registering a custom component

```jsonc
{
  "key": "<FRESH-UUID>",                 // node -e "console.log(crypto.randomUUID())"
  "title": { "en": "Qissa X", "ar": "اسم عربي" },
  "icon": "sicon-...",                   // any sicon-* icon
  "path": "home.qissa-x",                // → src/views/components/home/qissa-x.twig
  "fields": [ ... ]                      // merchant-editable dashboard fields
}
```

### Field types we use
| Need | Schema |
|---|---|
| short text | `"type":"string","format":"text"` |
| paragraph | `"type":"string","format":"textarea"` |
| image upload | `"type":"string","format":"image"` |
| number (stepper) | `"type":"number","format":"integer","minimum":0,"maximum":N` |
| on/off | `"type":"boolean","format":"switch"` |
| repeatable group | `"type":"collection","format":"collection"` with nested `fields` |
| **pick products** | see below — copy it EXACTLY |

### Products / categories / brands dropdown (MUST copy all keys)
A dropdown that won't open in the editor is almost always a **missing-key** schema.
This is the working shape — copy it verbatim, only change `source`:
```jsonc
{
  "id": "products",
  "type": "items",
  "icon": "sicon-keyboard_arrow_down",
  "label": "المنتجات",
  "format": "dropdown-list",
  "description": null,
  "selected": [],
  "options": [],
  "required": true,
  "multichoice": true,
  "source": "products",          // or "categories" / "brands"
  "searchable": true,
  "maxLength": 8,
  "minLength": 1,
  "value": []
}
```

### Reading fields in the twig
- Simple field: `{{ component.heading }}`
- Collection: `{% for item in component.cards %} {{ item.image }} {{ item.name }} {% endfor %}`
- Selected products: `{% for product in component.products %} ... {% endfor %}`
  Product fields: `product.id`, `.name`, `.url`, `.image.url`/`.images[0].url`,
  `.price`, `.sale_price`, `.regular_price`, `.is_on_sale`, `.promotion_title`,
  `.brand.name`, `.subtitle`, `.rating.stars`.

---

## 5. Hard-won gotchas (do NOT repeat these)

- **`public/app.css` must be committed.** SCSS changes won't show until you rebuild it
  (`npm run development`) and commit the compiled file.
- **Prices need the `|money` filter** to show the currency: `{{ product.sale_price|money }}`.
  Bare `{{ product.sale_price }}` is just a number, no "رس".
- **RTL flex alignment is inverted.** Inside a `direction: rtl` container,
  `flex-end`/`justify-content: flex-end` = **LEFT**, and `flex-start` = **RIGHT**.
  To pin content to the visual right in an RTL block, use `flex-start`.
- **`salla-add-product-to-cart` does NOT exist** in this theme version. Use a plain button:
  `onclick="salla.cart.addItem({ id: {{ product.id }}, quantity: 1 })"`.
  Wishlist: `onclick="salla.wishlist.toggle({{ product.id }})"`.
- **Never use risky Twig helpers** like `link('page','refund')` / `link('products')` — they
  throw server-side and silently drop the WHOLE block (e.g. the entire header disappears).
  Use `store.url` or known-safe links only.
- **Custom component `key` MUST be a valid UUID.** A non-UUID key makes the editor spin
  forever ("Should be validated UUID"). Generate with `crypto.randomUUID()`.
- **Title text glued together** (e.g. `تسوق حسبالفئات`) = HTML collapsed the space between
  two `<span>`s. Put an explicit literal space between them in the twig.
- **Stars:** `sicon-star` is outline-only (can't fill). For a real visible rating use the
  glyphs `★` (filled) / `☆` (empty) colored yellow, filled = floor(rating).
- **No date-picker field exists** in Salla's editor. For a countdown use number fields
  (days/hours/minutes) and compute the end time in JS.
- **Fonts:** don't reference external font file paths in CSS (`/images/fonts/...` → 410 in
  the editor). GE SS Two is base64-embedded in `01-settings/fonts.scss`. Keep it that way.
- **Sync delay:** after editing twig/twilight.json, edits won't appear until you commit +
  push AND restart `salla theme preview`. A clean restart fixes most "it's not updating".

---

## 6. Conventions

- **Class prefix:** every custom section uses a `q`-prefixed BEM root
  (`qhero`, `qcats`, `qprods`/`qprod`, `qoffers`/`qoffer`, `qbanner`). Keeps custom styles
  isolated from the starter theme.
- **Commits:** clear message, present tense. **No AI references anywhere in commits** —
  this is a production theme.
- **Branch off `main`** before non-trivial work; open a PR for review.
- **Match the surrounding code** — comment density, naming, idiom.

---

## 7. Quick reference — build a new section

```
# 1. inspect Figma node (screenshot + design_context + metadata)
# 2. create the two files:
#    src/views/components/home/qissa-<name>.twig
#    src/assets/styles/04-components/qissa-<name>.scss
# 3. add import to app.scss
# 4. register in twilight.json (fresh UUID, path home.qissa-<name>, fields)
node -e "console.log(crypto.randomUUID())"        # for the key
node -e "JSON.parse(require('fs').readFileSync('twilight.json','utf8'))"  # validate JSON
# 5. build + commit + push
npm run development     # Ctrl+C once public/app.css updates
git add -A && git commit -m "Add qissa-<name> section" && git push
# 6. restart preview, drag the new block onto the homepage, fill fields
salla theme preview    # Qussah-Test → no → yes
```
