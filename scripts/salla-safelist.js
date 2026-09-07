#!/usr/bin/env node
/**
 * Curates the Salla Tailwind safelist for this theme.
 *
 * Why this exists
 * ---------------
 * `@salla.sa/twilight-tailwind-theme` registers ~2,500 `.s-*` utilities (one per
 * Salla component class). Theme Raed lists the plugin's `safe-list-css.txt`
 * under Tailwind `content`, which marks every one of those classes as "used",
 * so all of them land in app.css (~506 KB raw of the 985 KB file) on every
 * page, including the homepage where a handful match anything.
 *
 * Meanwhile the Salla web components (Stencil, `/*!twlt*\/` marker) inject
 * their own stylesheet when they hydrate, so for most components the theme
 * copy is a byte-for-byte duplicate.
 *
 * What it does
 * ------------
 * 1. Builds the FULL `.s-*` utility CSS exactly as Tailwind would emit it with
 *    the plugin's complete safelist (reference).
 * 2. Parses every component stylesheet shipped in
 *    `@salla.sa/twilight-components/dist/collection/components`.
 * 3. A reference rule is "duplicated" only if EVERY component whose JS renders
 *    one of its classes ships, in its own stylesheet, the same selector under
 *    the same media query with every declaration of the reference rule (same
 *    property, same value). A class no component JS mentions needs any one
 *    stylesheet to reproduce it. Shared utilities such as `.s-hidden` are thus
 *    dropped only when all twelve components that use them carry their own copy.
 * 4. A safelist class is dropped only if EVERY rule that mentions it is
 *    duplicated AND its family is not written anywhere in the theme's own
 *    twig/JS (server-rendered `.s-*` markup has nothing else to style it).
 * 5. Writes the kept lines to `src/assets/styles/salla-safelist.txt`, which
 *    `tailwind.config.js` reads instead of the plugin's file.
 *
 * Usage
 * -----
 *   node scripts/salla-safelist.js            regenerate the curated safelist
 *   node scripts/salla-safelist.js --verify   after `pnpm run production`:
 *                                             assert that every non-duplicated
 *                                             reference rule is in public/app.css
 *   node scripts/salla-safelist.js --explain s-cart-summary-wrapper
 *                                             show why one class is kept/dropped
 *
 * Re-run the generator whenever @salla.sa/twilight-tailwind-theme or
 * @salla.sa/twilight-components is bumped, then rebuild and verify.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIR = path.join(ROOT, 'node_modules/@salla.sa/twilight-tailwind-theme');
const FULL_SAFELIST = path.join(PLUGIN_DIR, 'safe-list-css.txt');
const COMPONENTS_DIR = path.join(
  ROOT,
  'node_modules/@salla.sa/twilight-components/dist/collection/components'
);
const OUT_FILE = path.join(ROOT, 'src/assets/styles/salla-safelist.txt');
const BUILT_CSS = path.join(ROOT, 'public/app.css');
const THEME_SRC_DIRS = ['src/views', 'src/assets/js'].map((d) => path.join(ROOT, d));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function walk(dir, predicate, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

/** Whitespace/quote/leading-zero insensitive form used for all comparisons. */
function norm(str) {
  return String(str)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/["']/g, '')
    .replace(/(^|[^0-9.])0\./g, '$1.')
    .replace(/;$/, '');
}

/** Selector form used for lookups. Tailwind spells dark variants either as
 *  `.x:is(.dark *)` (3.4.1+) or `.dark .x` (older); the reference build and the
 *  webpack pipeline currently disagree, so both collapse to `.dark.x`. */
function normSel(sel) {
  // the minifier shortens `::after` to `:after`; treat both spellings as one
  const s = norm(sel).replace(/::/g, ':');
  return s.includes(':is(.dark*)') ? '.dark' + s.replace(/:is\(\.dark\*\)/g, '') : s;
}

/** Two-segment family: `.s-product-card-image` -> `s-product-card`. */
function familyOf(token) {
  const m = /^s-[a-z0-9]+(?:-[a-z0-9]+)?/.exec(token);
  return m ? m[0] : token;
}

/** The theme's own twig/JS renders this class (or may build it dynamically):
 *  the class itself, any class extending a written one (`s-block` written ->
 *  `s-block-title` kept), or any class sharing a written class's family. */
function isThemeRendered(token, srcTokens) {
  const fam = familyOf(token);
  for (const written of srcTokens) {
    if (token === written || token.startsWith(written + '-') || fam === familyOf(written)) return true;
  }
  return false;
}

/** Class tokens inside a selector or a safelist line. */
function classTokens(text) {
  const out = new Set();
  const re = /(?:^|[.\s\[>+~:(),])([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let m;
  while ((m = re.exec(text))) {
    // attribute names/values (`collapsible`, `false`) are not classes; the
    // plugin only registers `s-*` classes plus a few colour utilities.
    if (/^s-/.test(m[1]) || /^(text|bg|border)-/.test(m[1])) out.add(m[1]);
  }
  return [...out];
}

/** Flatten a postcss root into rule records with their @media chain. */
function collectRules(root, file) {
  const rules = [];
  root.walkRules((rule) => {
    const media = [];
    let p = rule.parent;
    while (p && p.type !== 'root') {
      if (p.type === 'atrule') {
        if (p.name === 'media' || p.name === 'supports') media.unshift(`@${p.name}${norm(p.params)}`);
        else return; // @keyframes / @font-face internals: not comparable
      }
      p = p.parent;
    }
    const decls = new Map();
    rule.each((node) => {
      if (node.type === 'decl') decls.set(node.prop.toLowerCase(), norm(node.value) + (node.important ? '!' : ''));
    });
    rules.push({
      file,
      selectors: rule.selectors.map((s) => s.trim()),
      media: media.join(''),
      decls,
      text: rule.toString(),
    });
  });
  return rules;
}

// ---------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------

async function buildReference() {
  const baseConfig = require(path.join(ROOT, 'tailwind.config.js'));
  const config = { ...baseConfig, content: [FULL_SAFELIST] };
  const result = await postcss([tailwindcss(config)]).process('@tailwind utilities;', {
    from: undefined,
  });
  return collectRules(result.root, '<reference>');
}

/**
 * index       : `selector|media` -> file -> merged declarations
 * usersByToken: `s-*` class -> component directories whose JS mentions it
 * dirOf(file) : component directory a stylesheet belongs to
 */
function buildCorpus() {
  const cssFiles = walk(COMPONENTS_DIR, (f) => f.endsWith('.css'));
  const jsFiles = walk(COMPONENTS_DIR, (f) => f.endsWith('.js'));
  const dirOf = (file) => path.relative(COMPONENTS_DIR, file).split(path.sep)[0];

  const usersByToken = new Map();
  for (const file of jsFiles) {
    const dir = dirOf(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const tok of text.match(/\bs-[a-z0-9]+(?:-[a-z0-9]+)*/g) || []) {
      if (!usersByToken.has(tok)) usersByToken.set(tok, new Set());
      usersByToken.get(tok).add(dir);
    }
  }

  const index = new Map();
  for (const file of cssFiles) {
    const root = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    for (const rule of collectRules(root, file)) {
      for (const sel of rule.selectors) {
        const key = `${normSel(sel)}|${rule.media}`;
        if (!index.has(key)) index.set(key, new Map());
        const byFile = index.get(key);
        if (!byFile.has(file)) byFile.set(file, new Map());
        const merged = byFile.get(file);
        for (const [prop, val] of rule.decls) merged.set(prop, val);
      }
    }
  }
  return {
    index,
    usersByToken,
    dirOf,
    fileCount: cssFiles.length,
    componentCount: new Set(jsFiles.map(dirOf)).size,
  };
}

function themeSourceText() {
  const files = THEME_SRC_DIRS.flatMap((d) =>
    walk(d, (f) => /\.(twig|js)$/.test(f))
  );
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

// ---------------------------------------------------------------------------
// core decision
// ---------------------------------------------------------------------------

/** True when every component that renders one of the rule's classes ships the
 *  rule itself (same selectors, same media query, all declarations). With no
 *  known renderer, any one component stylesheet reproducing it is enough. */
function isDuplicated(rule, corpus) {
  if (rule.decls.size === 0) return true; // nothing to lose

  const users = new Set();
  for (const tok of rule.selectors.flatMap(classTokens)) {
    for (const dir of corpus.usersByToken.get(tok) || []) users.add(dir);
  }
  const covers = (merged) => {
    for (const [prop, val] of rule.decls) if (merged.get(prop) !== val) return false;
    return true;
  };

  return rule.selectors.every((sel) => {
    const byFile = corpus.index.get(`${normSel(sel)}|${rule.media}`);
    if (!byFile) return false;
    if (users.size === 0) {
      for (const merged of byFile.values()) if (covers(merged)) return true;
      return false;
    }
    for (const dir of users) {
      let ok = false;
      for (const [file, merged] of byFile) {
        if (corpus.dirOf(file) === dir && covers(merged)) {
          ok = true;
          break;
        }
      }
      if (!ok) return false;
    }
    return true;
  });
}

async function generate() {
  const reference = await buildReference();
  const corpus = buildCorpus();
  const srcText = themeSourceText();

  const safelistLines = fs
    .readFileSync(FULL_SAFELIST, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length);

  // classes written in the theme's own markup/JS protect themselves, their
  // extensions and their family, which also covers names built dynamically.
  const srcTokens = new Set(srcText.match(/\bs-[a-z0-9]+(?:-[a-z0-9]+)*/g) || []);

  // token -> does any rule mentioning it survive (not duplicated)?
  const tokenNeedsTheme = new Map();
  const tokenSeen = new Set();
  let duplicatedRules = 0;
  let removableBytes = 0;
  const survivors = [];
  for (const rule of reference) {
    const toks = rule.selectors.flatMap(classTokens);
    const dup = isDuplicated(rule, corpus);
    if (dup) duplicatedRules++;
    else survivors.push(rule);
    for (const t of toks) {
      tokenSeen.add(t);
      if (!dup) tokenNeedsTheme.set(t, true);
    }
  }

  const keepToken = (t) => {
    if (isThemeRendered(t, srcTokens)) return true; // nothing else would style it
    if (!tokenSeen.has(t)) return true; // unknown to the reference: never drop blind
    return tokenNeedsTheme.get(t) === true;
  };

  const kept = [];
  const dropped = [];
  for (const line of safelistLines) {
    const toks = classTokens(line);
    if (toks.length === 0 || toks.some(keepToken)) kept.push(line);
    else dropped.push(line);
  }

  // a rule is really removed only when none of its tokens survive
  const keptTokens = new Set(kept.flatMap(classTokens));
  for (const rule of reference) {
    const toks = rule.selectors.flatMap(classTokens);
    if (toks.length && !toks.some((t) => keptTokens.has(t))) removableBytes += rule.text.length;
  }

  fs.writeFileSync(OUT_FILE, kept.join('\n') + '\n');

  const fmtKB = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`components scanned           : ${corpus.componentCount} (${corpus.fileCount} stylesheets)`);
  console.log(`reference .s-* rules         : ${reference.length}`);
  console.log(`  duplicated by a component  : ${duplicatedRules}`);
  console.log(`  must stay in theme         : ${survivors.length}`);
  console.log(`classes written in theme src : ${srcTokens.size} (their extensions and families are kept)`);
  console.log(`safelist lines               : ${safelistLines.length} -> kept ${kept.length}, dropped ${dropped.length}`);
  console.log(`unminified CSS removed       : ~${fmtKB(removableBytes)}`);
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
}

// ---------------------------------------------------------------------------
// --verify: after a production build, every reference rule that is NOT
// duplicated by a component must be present in public/app.css.
// ---------------------------------------------------------------------------

async function verify() {
  const reference = await buildReference();
  const corpus = buildCorpus();
  const built = postcss.parse(fs.readFileSync(BUILT_CSS, 'utf8'), { from: BUILT_CSS });
  const present = new Set();
  for (const rule of collectRules(built, BUILT_CSS)) {
    for (const sel of rule.selectors) present.add(`${normSel(sel)}|${rule.media}`);
  }
  const missing = [];
  for (const rule of reference) {
    if (isDuplicated(rule, corpus)) continue;
    for (const sel of rule.selectors) {
      if (!present.has(`${normSel(sel)}|${rule.media}`)) missing.push(`${rule.media} ${sel}`);
    }
  }
  if (missing.length) {
    console.error(`FAIL: ${missing.length} rule(s) the theme must style are missing from public/app.css:`);
    for (const m of missing.slice(0, 40)) console.error('  ' + m);
    process.exit(1);
  }
  console.log(`OK: every non-duplicated Salla rule (${reference.length} checked) is present in public/app.css`);
}

// ---------------------------------------------------------------------------
// --explain <class>: show why a class was kept or dropped.
// ---------------------------------------------------------------------------

async function explain(token) {
  const reference = await buildReference();
  const corpus = buildCorpus();
  const srcTokens = new Set(themeSourceText().match(/\bs-[a-z0-9]+(?:-[a-z0-9]+)*/g) || []);
  const users = [...(corpus.usersByToken.get(token) || [])];
  const rules = reference.filter((r) => r.selectors.flatMap(classTokens).includes(token));

  console.log(`class               : ${token}`);
  console.log(`written in theme src: ${isThemeRendered(token, srcTokens)}`);
  console.log(`component JS users  : ${users.join(', ') || '(none)'}`);
  console.log(`reference rules     : ${rules.length}`);
  let survivors = 0;
  for (const r of rules) {
    const dup = isDuplicated(r, corpus);
    if (!dup) survivors++;
    console.log(`\n  ${dup ? 'DUPLICATED' : 'THEME-ONLY'}  ${r.media} ${r.selectors.join(', ')}  (${r.decls.size} decls)`);
    for (const sel of r.selectors) {
      const byFile = corpus.index.get(`${normSel(sel)}|${r.media}`);
      if (!byFile) {
        console.log(`      ${sel}: no component stylesheet has this selector`);
        continue;
      }
      for (const [file, merged] of byFile) {
        const lacking = [...r.decls].filter(([p, v]) => merged.get(p) !== v).map(([p]) => p);
        console.log(`      ${sel}: ${path.relative(COMPONENTS_DIR, file)} ${lacking.length ? 'lacks ' + lacking.join(', ') : 'covers all'}`);
      }
    }
  }
  const kept = isThemeRendered(token, srcTokens) || rules.length === 0 || survivors > 0;
  console.log(`\nverdict: ${kept ? 'KEPT in theme CSS' : 'DROPPED (every rule is shipped by its component)'}`);
}

const argv = process.argv.slice(2);
const explainAt = argv.indexOf('--explain');
const run = argv.includes('--verify')
  ? verify()
  : explainAt !== -1
    ? explain(argv[explainAt + 1] || '')
    : generate();
run.catch((err) => {
  console.error(err);
  process.exit(1);
});
