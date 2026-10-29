/**
 * «تفاصيل المنتج» as an accordion — Bareeq's, ported as is (Bareeq
 * src/assets/js/partials/bareq-product-details.js, 29 Oct 2026). Every function
 * below is Bareeq's line for line; only the class names and ids differ. Keep
 * the two in step: a change to how a description splits goes into both.
 *
 * Markup : src/views/pages/product/single.twig (.qpd-more__desc)
 * Styles : src/assets/styles/04-components/qissa-product-details.scss
 *
 * Salla has no "ingredients" or "how to use" product field, so the merchant
 * writes ONE description and starts each extra section with a label. The
 * template prints that description whole inside the first panel — so the full
 * text is server-rendered for crawlers, and a reader with JS off gets one long
 * open section rather than three sealed headers — and this module lifts each
 * label, plus everything under it, into its own accordion item.
 *
 * WHAT COUNTS AS A LABEL. Almost nobody reaches for the "Heading" style in a
 * product editor; they type the word and press B. So all of these split, which
 * is the difference between this working and not:
 *
 *     <h2>المكونات</h2>                  ← the clean one
 *     <p><strong>المكونات</strong></p>   ← a bolded line of its own
 *     <p><span style="font-weight:700">المكونات</span></p>
 *     …<br><strong>المكونات</strong><br> ← one big paragraph of <br> lines
 *
 * A bold run is a label when it is the whole line, or when it opens a line and
 * the copy runs on after it ("<strong>المكونات:</strong> ماء" — the label is
 * lifted out, the rest is its panel). A bold word inside a sentence is
 * emphasis, and 80 characters is the cutoff between a label and a sentence.
 *
 * Progressive enhancement over working HTML: the collapsing CSS only takes
 * effect once `--enhanced` lands on the root, which happens here. Nothing is
 * hidden before that.
 */

const HEADING_TAG = /^H[1-6]$/;
const BLOCK_TAG = /^(P|DIV)$/;
const BOLD_TAG = /^(STRONG|B)$/;
/** Elements that must not be swallowed into a generated <p>. */
const BLOCK_LEVEL = /^(P|DIV|UL|OL|TABLE|BLOCKQUOTE|PRE|FIGURE|SECTION|HR|H[1-6])$/;
/** A label is a name, not a sentence. */
const HEADING_MAX_CHARS = 80;

const ROOT = '.qpd-details';
const ITEM = '.qpd-details__item';
const HEAD = '.qpd-details__head';
const PANEL = '.qpd-details__panel';
const BODY = '.qpd-details__body';
const TOGGLE = '.qpd-details__toggle';

export default function initProductDetails() {
  const root = document.querySelector(ROOT),
        first = root?.querySelector(ITEM);

  if (!root || !first) {
    return;
  }

  splitSectionsIntoItems(root, first);

  root.classList.add('qpd-details--enhanced');

  root.querySelectorAll(ITEM).forEach((item, index) => {
    // The first section stays open, exactly as both design frames show it.
    setOpen(item, index === 0, false);

    item.querySelector(HEAD)?.addEventListener('click', () => {
      /* Independent toggles rather than one-at-a-time: the design's control is
         a plus/minus, which reads as "this section", where an exclusive
         accordion would carry a chevron. Nothing collapses under the reader. */
      setOpen(item, !item.classList.contains('is-open'), true);
    });
  });
}

/* ------------------------------------------------------------------ split */

function splitSectionsIntoItems(root, first) {
  const body = first.querySelector(BODY),
        toggle = first.querySelector(TOGGLE),
        productId = first.querySelector(HEAD)?.id.split('-').pop() || '0';

  if (!body || !toggle) {
    return;
  }

  const container = resolveContainer(body),
        sections = collectSections(container);

  // Everything was read off the live tree first; only now is anything moved.
  // Into the card the first item sits in, not the root: the root also holds
  // the section's «تفاصيل المنتج» heading.
  const card = first.parentElement;

  sections.forEach((section, index) => {
    card.appendChild(
      buildItem(section.title, normalise(section.nodes), toggle, index + 1, productId)
    );
    section.heading.remove();
    // A block emptied by the move would otherwise sit there as a blank line.
    section.emptied?.remove();
  });

  /* A description that OPENS with a label — «وصف المنتج», as on many of the
     stores' products — leaves the first item with nothing in it once that
     section has moved out, and the page would open on an empty panel above a
     second «وصف المنتج». The empty item goes; the next one becomes the first,
     and initProductDetails opens it. */
  if (sections.length && !body.textContent.trim() && !body.querySelector('img, video, iframe, table')) {
    first.remove();
  }
}

/**
 * Salla sometimes hands the description over inside a single wrapper. Scanning
 * that wrapper's children rather than the wrapper itself is what keeps the
 * labels visible to the split.
 */
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
 * Walk childNodes, not children: in a `<br>`-separated description the actual
 * copy lives in bare text nodes, and an element-only walk would move the label
 * out and leave its text behind in the first panel.
 */
function collectSections(container) {
  const sections = [];
  let current = null;

  Array.from(container.childNodes).forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE && isSectionHeading(node)) {
      current = { heading: node, title: title(node), nodes: [] };
      sections.push(current);
      return;
    }

    // "المكونات: ماء وإنزيمات" — the label opens the block and its copy runs on
    // from there. The label is lifted out and the rest of the block becomes the
    // panel, so the emptied block is flagged for removal too.
    const lead = node.nodeType === Node.ELEMENT_NODE ? leadingLabel(node) : null;

    if (lead) {
      current = {
        heading: lead,
        emptied: node,
        title: title(lead),
        nodes: Array.from(node.childNodes).filter(child => child !== lead),
      };
      sections.push(current);
      return;
    }

    // Nodes before the first label belong to the description panel and stay.
    current?.nodes.push(node);
  });

  return sections;
}

/** "المكونات:" reads as a label; the colon belongs to the punctuation, not the name. */
function title(el) {
  return el.textContent.trim().replace(/[:：\-–—\s]+$/, '');
}

/**
 * A bold run that OPENS a block but does not fill it. Requiring it to lead is
 * what keeps "هذه <strong>تركيبة</strong> مركزة" out — a bold word buried in a
 * sentence has text in front of it and is emphasis, not a section.
 */
function leadingLabel(block) {
  if (!BLOCK_TAG.test(block.tagName)) {
    return null;
  }

  const first = firstMeaningful(block);

  if (!first || first.nodeType !== Node.ELEMENT_NODE || !isBold(first)) {
    return null;
  }

  const text = first.textContent.trim();

  // An empty label, a sentence, or a block the run already fills (which
  // isSectionHeading has handled) are all not this case.
  return text && text.length <= HEADING_MAX_CHARS && block.textContent.trim() !== text
    ? first
    : null;
}

function firstMeaningful(el) {
  return Array.from(el.childNodes).find(
    node => node.nodeType !== Node.TEXT_NODE || node.textContent.trim()
  ) || null;
}

function isBold(el) {
  return BOLD_TAG.test(el.tagName)
    || parseInt(window.getComputedStyle(el).fontWeight, 10) >= 600;
}

function isSectionHeading(el) {
  if (HEADING_TAG.test(el.tagName)) {
    return true;
  }

  const text = el.textContent.trim();

  if (!text || text.length > HEADING_MAX_CHARS) {
    return false;
  }

  // A bare bold run standing alone between line breaks.
  if (BOLD_TAG.test(el.tagName)) {
    return isLineEdge(el, 'previousSibling') && isLineEdge(el, 'nextSibling');
  }

  // A block whose entire content is one bold run.
  if (!BLOCK_TAG.test(el.tagName) || el.children.length !== 1) {
    return false;
  }

  const inner = el.children[0];

  return inner.textContent.trim() === text && isBold(inner);
}

/** Is there a line break (or nothing at all) on this side of the element? */
function isLineEdge(el, direction) {
  let node = el[direction];

  while (node && node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
    node = node[direction];
  }

  return !node || (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR');
}

/**
 * Wrap loose text and `<br>` runs in a paragraph, pass real blocks through.
 * The panel body is a flex column, where a bare text node would become its own
 * anonymous item and lose the 12px rhythm every other block gets.
 */
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
      out.push(node);
      return;
    }

    buffer.push(node);
  });

  flush();

  return out;
}

/** Drop the blank lines a label leaves behind on either side of its content. */
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

  // "<strong>المكونات</strong>: ماء" leaves the colon behind on the content.
  if (buffer.length && buffer[0].nodeType === Node.TEXT_NODE) {
    buffer[0].textContent = buffer[0].textContent.replace(/^[\s:：\-–—]+/, '');
  }
}

/* ------------------------------------------------------------------ build */

/**
 * One accordion item, assembled with DOM calls rather than an HTML string so a
 * label the merchant typed can never be parsed as markup.
 */
function buildItem(title, content, toggleTemplate, index, productId) {
  const headId = `qpd-details-head-${index}-${productId}`,
        panelId = `qpd-details-panel-${index}-${productId}`;

  const item = document.createElement('section');
  item.className = 'qpd-details__item';
  item.setAttribute('data-details-item', '');

  // h3: the section's own «تفاصيل المنتج» heading is the h2 above them.
  const heading = document.createElement('h3');
  heading.className = 'qpd-details__heading';

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'qpd-details__head';
  head.id = headId;
  head.setAttribute('aria-controls', panelId);
  head.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'qpd-details__title';
  label.textContent = title;

  head.append(label, toggleTemplate.cloneNode(true));
  heading.appendChild(head);

  const panel = document.createElement('div');
  panel.className = 'qpd-details__panel';
  panel.id = panelId;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', headId);

  const body = document.createElement('div');
  body.className = 'qpd-details__body';
  body.append(...content);

  panel.appendChild(body);
  item.append(heading, panel);

  return item;
}

/* ----------------------------------------------------------------- toggle */

/**
 * `max-height` has to be a real number for the transition to run, and `none`
 * afterwards so an open panel reflows when the viewport or its content changes
 * — the same dance `product.js` does for the read-more block.
 */
function setOpen(item, open, animate) {
  const head = item.querySelector(HEAD),
        panel = item.querySelector(PANEL);

  if (!panel) {
    return;
  }

  item.classList.toggle('is-open', open);
  head?.setAttribute('aria-expanded', String(open));

  if (!animate) {
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
      panel.style.maxHeight = 'none';
    });
    return;
  }

  // Collapsing from `none` would have nothing to animate from, so the current
  // height is pinned and flushed before the target is set.
  panel.style.maxHeight = `${panel.scrollHeight}px`;
  void panel.offsetHeight;
  panel.style.maxHeight = '0px';
}
