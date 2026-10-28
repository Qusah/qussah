/**
 * «تفاصيل المنتج» as an accordion — ported from the Bareq theme
 * (partials/bareq-product-details.js), in Qusah's look.
 *
 * Markup : pages/product/single.twig (.qacc, only when the theme setting
 *          pdp_accordion_enabled is on — null reads as on)
 * Styles : 04-components/qissa-product-accordion.scss
 *
 * Salla has one description field, so the merchant starts each section with a
 * label. The template prints the description WHOLE in the first panel (open,
 * server-rendered, readable with JS off); this module splits it:
 *
 *   · 2+ labels           → everything before the 2nd label goes to the short
 *                           description under the rating (.qpd__lead, as HTML,
 *                           the first label still bold); one item per label
 *                           from the 2nd on.
 *   · 1 label, text first → the text before it to .qpd__lead; one item.
 *   · 1 label, at start   → all of it to .qpd__lead; no accordion (hidden).
 *   · no label            → .qpd__lead stays the plain excerpt (app.js); one
 *                           item «وصف المنتج» with the whole description.
 *
 * A LABEL (identical to Bareq): <h1-6>; a <p>/<div> whose whole text is one
 * bold run (strong, b, or font-weight ≥ 600); a bold run that is a whole
 * <br>-separated line. At most 80 characters, with letters or digits in it
 * (not «<h3><br></h3>» or «****»), and with something under it before the next
 * label or the end (two or more such empty bold lines mean the description is
 * written in bold body text: then nothing is a label). A paragraph that merely starts
 * with a bold word is body copy (Bareq's script also split those; the brief
 * for this port says not to: «<strong>مناديل قصة 600</strong> صُممت…» is copy).
 *
 * Nothing collapses until `qacc--enhanced` is on the root. No salla.* here.
 */

const HEADING_TAG = /^H[1-6]$/;
const BLOCK_TAG = /^(P|DIV)$/;
const BOLD_TAG = /^(STRONG|B)$/;
const BLOCK_LEVEL = /^(P|DIV|UL|OL|TABLE|BLOCKQUOTE|PRE|FIGURE|SECTION|HR|H[1-6])$/;
const HEADING_MAX_CHARS = 80;
const MEDIA = 'img, video, iframe, table';

export default function initProductAccordion() {
  const root = document.querySelector('[data-qacc]'),
        first = root?.querySelector('[data-qacc-item]');

  if (!root || !first || root.classList.contains('qacc--enhanced')) {
    return;
  }

  split(root, first);

  const items = root.querySelectorAll('[data-qacc-item]');
  const more = root.closest('[data-qpd-more]');

  // Nothing left for the accordion: the whole description went to the lead.
  if (!items.length) {
    root.hidden = true;
    more?.classList.add('is-acc-empty');
    return;
  }

  root.classList.add('qacc--enhanced');

  items.forEach((item, index) => {
    setOpen(item, index === 0, false);
    item.querySelector('.qacc__head')?.addEventListener('click', () => {
      setOpen(item, !item.classList.contains('is-open'), true);
    });
  });
}

/* ------------------------------------------------------------------ split */

function split(root, first) {
  const body = first.querySelector('.qacc__body'),
        toggle = first.querySelector('.qacc__toggle'),
        productId = first.querySelector('.qacc__head')?.id.split('-').pop() || '0';

  if (!body || !toggle) {
    return;
  }

  const container = resolveContainer(body),
        sections = collectSections(container);

  if (!sections.length) {
    return;   // no label: one «وصف المنتج» item, the lead stays the plain excerpt
  }

  // What goes to the short description: up to the 2nd label, or — one label
  // with text in front of it — the text in front.
  const nodes = Array.from(container.childNodes),
        before = nodes.slice(0, nodes.indexOf(sections[0].start)),
        hasBefore = before.some(meaningful);

  let leadNodes, itemSections;

  if (sections.length >= 2) {
    leadNodes = nodes.slice(0, nodes.indexOf(sections[1].start));
    itemSections = sections.slice(1);
  } else if (hasBefore) {
    leadNodes = before;
    itemSections = sections;
  } else {
    leadNodes = nodes;
    itemSections = [];
  }

  writeLead(leadNodes);

  const card = first.parentElement;

  itemSections.forEach((section, index) => {
    card.appendChild(buildItem(section.title, normalise(section.nodes), toggle, index + 1, productId));
    section.heading.remove();
  });

  // The first (server) item is empty now: everything moved out of it.
  if (!body.textContent.trim() && !body.querySelector(MEDIA)) {
    first.remove();
  }
}

/** The short description under the rating: the merchant's own HTML, unclamped. */
function writeLead(nodes) {
  const old = document.querySelector('[data-qacc-lead]') || document.querySelector('.qpd__lead');

  if (!old || !nodes.some(meaningful)) {
    nodes.forEach(node => node.remove());
    return;
  }

  const lead = document.createElement('div');
  lead.className = 'qpd__lead qpd__lead--rich';
  lead.append(...normalise(nodes));
  old.replaceWith(lead);
}

function meaningful(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return !!node.textContent.trim();
  }

  return node.nodeType === Node.ELEMENT_NODE
    && (!!node.textContent.trim() || node.matches(MEDIA) || !!node.querySelector(MEDIA));
}

function resolveContainer(body) {
  let container = body;

  while (
    container.children.length === 1 &&
    BLOCK_TAG.test(container.children[0].tagName) &&
    container.children[0].childNodes.length > 1
  ) {
    container = container.children[0];
  }

  return container;
}

/**
 * Each section: `start`/`heading` is the label element, `nodes` what follows it.
 * A label with nothing under it before the next label (or the end) is body copy:
 * some descriptions bold every line. Judged against the first-pass labels, so a
 * run of bold lines stays together as copy under whatever came before it.
 */
function collectSections(container) {
  const nodes = Array.from(container.childNodes),
        candidate = nodes.map(node => node.nodeType === Node.ELEMENT_NODE && isSectionHeading(node));

  const isLabel = nodes.map((node, i) => {
    if (!candidate[i]) {
      return false;
    }
    for (let k = i + 1; k < nodes.length && !candidate[k]; k++) {
      if (hasWords(nodes[k]) || (nodes[k].nodeType === Node.ELEMENT_NODE && (nodes[k].matches(MEDIA) || nodes[k].querySelector(MEDIA)))) {
        return true;
      }
    }
    return false;
  });

  // Two or more bold lines with nothing under them: the description is written
  // in bold body text, not labelled — treat it as having no labels at all.
  const empty = candidate.filter((c, i) => c && !isLabel[i]).length;
  if (empty >= 2) {
    return [];
  }

  const sections = [];
  let current = null;

  nodes.forEach((node, i) => {
    if (isLabel[i]) {
      current = { start: node, heading: node, title: title(node), nodes: [] };
      sections.push(current);
      return;
    }

    current?.nodes.push(node);
  });

  return sections;
}

/** Letters or digits — a line of only symbols («****») or blanks says nothing. */
function hasWords(node) {
  return /[\p{L}\p{N}]/u.test(node.textContent || '');
}

function title(el) {
  return el.textContent.trim().replace(/[:：\-–—\s]+$/, '');
}

function isBold(el) {
  return BOLD_TAG.test(el.tagName)
    || parseInt(window.getComputedStyle(el).fontWeight, 10) >= 600;
}

function isSectionHeading(el) {
  const text = el.textContent.trim();

  // an empty heading (<h3><br></h3>) or a line of symbols is never a label
  if (!hasWords(el) || text.length > HEADING_MAX_CHARS) {
    return false;
  }

  if (HEADING_TAG.test(el.tagName)) {
    return true;
  }

  if (!text || text.length > HEADING_MAX_CHARS) {
    return false;
  }

  if (BOLD_TAG.test(el.tagName)) {
    return isLineEdge(el, 'previousSibling') && isLineEdge(el, 'nextSibling');
  }

  if (!BLOCK_TAG.test(el.tagName) || el.children.length !== 1) {
    return false;
  }

  const inner = el.children[0];

  return inner.textContent.trim() === text && isBold(inner);
}

function isLineEdge(el, direction) {
  let node = el[direction];

  while (node && node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
    node = node[direction];
  }

  return !node || (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR');
}

/** Loose text and <br> runs become a <p>; real blocks pass through. */
function normalise(nodes) {
  const out = [];
  let buffer = [];

  const flush = () => {
    trimEdges(buffer);

    if (buffer.length) {
      const paragraph = document.createElement('p');
      paragraph.append(...buffer);
      out.push(paragraph);
    }

    buffer = [];
  };

  nodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_LEVEL.test(node.tagName)) {
      flush();
      // an empty «<p><br></p>» spacer would only add a gap in the column
      if (BLOCK_TAG.test(node.tagName) && !meaningful(node)) {
        node.remove();
        return;
      }
      out.push(node);
      return;
    }

    buffer.push(node);
  });

  flush();

  return out;
}

function trimEdges(buffer) {
  const isBlank = node =>
    (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) ||
    (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR');

  while (buffer.length && isBlank(buffer[0])) {
    buffer.shift();
  }

  while (buffer.length && isBlank(buffer[buffer.length - 1])) {
    buffer.pop();
  }

  if (buffer.length && buffer[0].nodeType === Node.TEXT_NODE) {
    buffer[0].textContent = buffer[0].textContent.replace(/^[\s:：\-–—]+/, '');
  }
}

/* ------------------------------------------------------------------ build */

function buildItem(text, content, toggleTemplate, index, productId) {
  const headId = `qacc-head-${index}-${productId}`,
        panelId = `qacc-panel-${index}-${productId}`;

  const item = document.createElement('section');
  item.className = 'qacc__item';
  item.setAttribute('data-qacc-item', '');

  const heading = document.createElement('h3');
  heading.className = 'qacc__heading';

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'qacc__head';
  head.id = headId;
  head.setAttribute('aria-controls', panelId);
  head.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'qacc__title';
  label.textContent = text;

  head.append(label, toggleTemplate.cloneNode(true));
  heading.appendChild(head);

  const panel = document.createElement('div');
  panel.className = 'qacc__panel';
  panel.id = panelId;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', headId);

  const body = document.createElement('div');
  body.className = 'qacc__body article--main';
  body.append(...content);

  panel.appendChild(body);
  item.append(heading, panel);

  return item;
}

/* ----------------------------------------------------------------- toggle */

function setOpen(item, open, animate) {
  const head = item.querySelector('.qacc__head'),
        panel = item.querySelector('.qacc__panel');

  if (!panel) {
    return;
  }

  item.classList.toggle('is-open', open);
  head?.setAttribute('aria-expanded', String(open));

  const still = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (still) {
    panel.style.maxHeight = open ? 'none' : '0px';
    return;
  }

  if (open) {
    panel.style.maxHeight = `${panel.scrollHeight}px`;
    panel.addEventListener('transitionend', function release(event) {
      if (event.propertyName !== 'max-height') {
        return;
      }
      panel.removeEventListener('transitionend', release);
      item.classList.contains('is-open') && (panel.style.maxHeight = 'none');
    });
    return;
  }

  panel.style.maxHeight = `${panel.scrollHeight}px`;
  void panel.offsetHeight;
  panel.style.maxHeight = '0px';
}
