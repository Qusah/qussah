/**
 * «آراء العملاء» — components/home/qissa-testimonials.twig. home.js runs it on
 * theme::ready. Latafa's marquee (two counter-scrolling rows on desktop, one
 * on phones, drag / swipe, optional pause on hover), rebuilt so it can run
 * through EVERY written store review without the page paying for them:
 *
 *   · Virtual rows. A row holds only the cards that cover its width plus a
 *     spare each side (8 on a 1440 desktop row, 6 on a phone). Each card owns
 *     a slot index on an endless line; once it has scrolled out behind, it is
 *     moved ahead and refilled with the next review. The DOM stays the same
 *     size for 20 reviews or 3,000.
 *   · Compositor motion. The track moves by one Web Animations transform the
 *     browser runs off the main thread, so busy third-party scripts can't make
 *     it stutter; this file wakes once per card width to recycle, not per
 *     frame.
 *   · Reviews on demand. Pages of 30 arrive only once the section is near the
 *     screen and only as fast as cards need them. Stars-only reviews (most of
 *     them) are skipped — a card needs a quote. When the store runs out, the
 *     rows cycle what they have.
 *   · Cached. The reviews fetched so far, and how far the walk got, are kept
 *     in localStorage for 6 h: the rows looping round again never refetch, a
 *     returning visitor starts from the cache and only asks for pages it
 *     hasn't seen, and two sections on one page share one walk.
 *   · Off screen it pauses; prefers-reduced-motion leaves it still (dragging
 *     still works).
 *
 * Source: the store's real reviews (use_real_reviews, default on); the
 * merchant's mock reviews when that switch is off or the store has none.
 * Neither → the section removes itself.
 *
 * Review text can carry HTML. It is read through DOMParser — an inert
 * document where nothing loads or runs — and only its text is kept.
 *
 * Reviews endpoint, measured on the live store 2026-07-22 (3,780 store
 * reviews): `per_page` and `page` are honoured, pagination.links.next is
 * always present, only ~17% of reviews carry text, and a setup that refuses
 * the params gets the bare {type:'store'} call instead.
 */
const PER_PAGE = 30;
const PAGES_PER_TOP_UP = 4;   // a run of stars-only pages can't stall a top-up forever
const LAP = 4000;             // cards per animation lap — ~10 h at the default speed
const CACHE_KEY = 'qtest:store-reviews';
const CACHE_VERSION = 1;
const CACHE_TTL = 6 * 60 * 60 * 1000;   // then a fresh walk picks up new reviews
const PHONE = '(max-width: 768px)';

const mod = (n, m) => ((n % m) + m) % m;
const clampStars = n => Math.max(0, Math.min(5, Math.round(Number(n) || 0))) || 5;

let parser = null;
function plain(value) {
  if (value == null) return '';
  const s = String(value);
  if (!/[<&]/.test(s)) return s.replace(/\s+/g, ' ').trim();
  parser = parser || new DOMParser();
  return (parser.parseFromString(s, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
}

/* ---- the store's written reviews, page by page ----------------------- */

class StoreReviews {
  constructor() {
    this.items = [];
    this.page = 0;
    this.done = false;
    this.bare = false;
    this.seen = new Set();
    this.pending = null;
    this.started = Date.now();
    this.restore();
  }

  // pick up where an earlier visit stopped: the reviews it fetched come from
  // storage and the walk carries on from the next page
  restore() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || c.v !== CACHE_VERSION || !(Date.now() - c.t < CACHE_TTL) || !Array.isArray(c.items)) return;
      this.items = c.items.filter(r => r && typeof r.text === 'string' && r.text);
      this.items.forEach(r => this.seen.add(r.k));
      this.page = c.page | 0;
      this.done = !!c.done;
      this.bare = !!c.bare;
      this.started = c.t;
    } catch (e) { /* storage blocked or unreadable — walk afresh */ }
  }

  save() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        v: CACHE_VERSION, t: this.started, page: this.page, done: this.done, bare: this.bare, items: this.items,
      }));
    } catch (e) { /* full or blocked — the list in memory still works */ }
  }

  request(params) {
    try {
      const p = salla.api.request('reviews', { params }, 'get');
      return p && typeof p.then === 'function' ? p : Promise.reject(new Error('no promise'));
    } catch (e) {
      return Promise.reject(e);   // the SDK can throw synchronously on params
    }
  }

  async pull() {
    if (this.done) return;
    const page = this.page + 1;
    const params = this.bare ? { type: 'store' } : { type: 'store', per_page: PER_PAGE };
    if (!this.bare && page > 1) params.page = page;

    let res;
    try {
      res = await this.request(params);
    } catch (e) {
      if (page === 1 && !this.bare) { this.bare = true; return this.pull(); }
      this.done = true;   // a later page failed: keep what we have and cycle it
      this.save();
      return;
    }
    const rows = Array.isArray(res?.data) ? res.data : [];
    if (page === 1 && !rows.length && !this.bare) { this.bare = true; return this.pull(); }
    this.page = page;

    let fresh = 0;
    for (const r of rows) {
      const text = plain(r?.content ?? r?.text);
      const key = r?.id != null ? `i${r.id}` : `t${plain(r?.name)}|${text.slice(0, 60)}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      fresh++;
      if (text) this.items.push({ k: key, text, name: plain(r.name), stars: clampStars(r.rating ?? r.stars) });
    }
    // no new rows means the endpoint ignored `page` — stop rather than repeat
    const p = res?.pagination || {};
    const next = (p.links && p.links.next) || ((p.currentPage || p.current_page) < (p.totalPages || p.total_pages));
    if (this.bare || !fresh || !next) this.done = true;
    this.save();
  }

  // top up until `want` reviews are held, the store runs out, or this top-up's
  // page budget is spent (the next call carries on)
  fill(want) {
    if (this.done || this.items.length >= want) return Promise.resolve();
    if (!this.pending) {
      this.pending = (async () => {
        for (let i = 0; i < PAGES_PER_TOP_UP && !this.done && this.items.length < want; i++) await this.pull();
      })().finally(() => { this.pending = null; });
    }
    return this.pending;
  }
}

let shared = null;
const storeReviews = () => (shared = shared || new StoreReviews());

function mockReviews(section) {
  const tpl = section.querySelector('template[data-qtest-mock]');
  if (!tpl) return [];
  return [...tpl.content.querySelectorAll('p')].map(p => ({
    text: p.textContent.replace(/\s+/g, ' ').trim(),
    name: p.dataset.name || '',
    meta: p.dataset.meta || '',
    stars: clampStars(p.dataset.stars),
  })).filter(r => r.text);
}

/* ---- one card -------------------------------------------------------- */

function paint(card, review, anon) {
  if (card._review === review) return;
  card._review = review;
  const f = card._f;
  card.classList.toggle('is-empty', !review);
  f.text.textContent = review ? review.text : '';
  f.name.textContent = review ? (review.name || anon) : '';
  f.meta.textContent = (review && review.meta) || '';
  f.meta.hidden = !(review && review.meta);
  const n = review ? review.stars : 0;
  f.starEls.forEach((s, i) => s.classList.toggle('is-off', i >= n));
  f.stars.setAttribute('aria-label', `${n} / 5`);
}

/* ---- one virtual row ------------------------------------------------- */

class Row {
  constructor(section, viewport, index, count, feed) {
    this.section = section;
    this.viewport = viewport;
    this.track = viewport.querySelector('.qtest__track');
    this.index = index;
    this.count = count;
    this.feed = feed;
    this.dir = Number(viewport.dataset.dir) || 1;
    this.phase = Number(viewport.dataset.phase) || 0;
    this.secondsPerCard = Number(section.dataset.qtestSpeed) || 9;
    this.anon = section.dataset.qtestAnon || '';
    this.template = section.querySelector('template[data-qtest-card]').content.firstElementChild;
    this.cards = [];
    this.flags = { inView: false, hover: false, drag: false };
    this.measure();
    this.animate();
    this.layout();
    this.bindDrag();
    if (section.hasAttribute('data-qtest-pause') && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      viewport.addEventListener('mouseenter', () => { this.flags.hover = true; this.sync(); });
      viewport.addEventListener('mouseleave', () => { this.flags.hover = false; this.sync(); });
    }
  }

  get active() { return this.viewport.offsetParent !== null; }   // phones hide row two

  measure() {
    const cs = getComputedStyle(this.viewport);
    this.cardW = parseFloat(cs.getPropertyValue('--qtest-card-w')) || 350;
    this.step = this.cardW + (parseFloat(cs.getPropertyValue('--qtest-gap')) || 20);
    this.V = this.viewport.clientWidth;
    this.rtl = cs.direction === 'rtl';
    this.sgn = this.rtl ? 1 : -1;   // rtl: later cards wait on the left, the row moves right
    this.speed = this.step / this.secondsPerCard;   // px per second
    this.slots = Math.ceil((this.V + this.cardW) / this.step) + 3;
  }

  // where the row stands, in px along its own line
  pos() {
    if (!this.anim) return this.p0;
    const progress = this.anim.effect.getComputedTiming().progress ?? 0.5;
    return this.p0 + this.dir * LAP * this.step * (progress - 0.5);
  }

  startPos() {
    // desktop: the frame's own phase; phones: the second card centred
    return matchMedia(PHONE).matches ? this.step + this.cardW / 2 - this.V / 2 : this.phase;
  }

  // the track runs a long lap with the start in the MIDDLE, so a drag backwards
  // has as much room as the motion forwards
  animate(from) {
    if (this.anim) this.anim.cancel();
    this.p0 = from ?? this.startPos();
    const half = this.dir * LAP * this.step / 2;
    if (typeof this.track.animate !== 'function') { this.anim = null; this.place(); return; }
    this.anim = this.track.animate(
      [
        { transform: `translate3d(${this.sgn * (this.p0 - half)}px,0,0)` },
        { transform: `translate3d(${this.sgn * (this.p0 + half)}px,0,0)` },
      ],
      { duration: (LAP * this.step / this.speed) * 1000, iterations: Infinity, easing: 'linear' },
    );
    this.anim.currentTime = this.anim.effect.getComputedTiming().duration / 2;
    this.anim.pause();
    this.sync();
  }

  place() { this.track.style.transform = `translate3d(${this.sgn * this.p0}px,0,0)`; }

  // a slot's spot on the track; the rtl line starts at the right edge
  x(k) { return this.rtl ? this.V - this.cardW - k * this.step : k * this.step; }

  // slot k → a review. Each row consumes its own sequence in the direction it
  // moves. With enough reviews the rows interleave (never the same one side
  // by side); a short list (a few mock reviews) runs whole on every row, the
  // second one started half way through.
  review(k) {
    const list = this.feed.items;
    if (!list.length) return null;
    const s = this.dir * k;
    const i = list.length >= this.slots * this.count
      ? s * this.count + this.index
      : s + this.index * Math.ceil(list.length / this.count);
    // a few cards of lead is ~30 s at the default pace — plenty for a page
    if (!this.feed.done && i + this.count * 3 >= list.length) {
      this.feed.fill(list.length + PER_PAGE).catch(() => {});   // the next recycled cards get them
    }
    return list[mod(i, list.length)];
  }

  newCard() {
    const card = this.template.cloneNode(true);
    card._f = {
      text: card.querySelector('[data-f="text"]'),
      name: card.querySelector('[data-f="name"]'),
      meta: card.querySelector('[data-f="meta"]'),
      stars: card.querySelector('[data-f="stars"]'),
    };
    card._f.starEls = [...card._f.stars.children];
    card._review = undefined;
    this.track.appendChild(card);
    this.cards.push(card);
    return card;
  }

  layout(repaint) {
    if (!this.active) return;
    const p = this.pos();
    const first = Math.floor((p - this.cardW) / this.step) - 1;
    const last = first + this.slots - 1;
    const keep = new Map();
    const free = [];
    for (const card of this.cards) {
      if (card._k != null && card._k >= first && card._k <= last && !keep.has(card._k)) keep.set(card._k, card);
      else free.push(card);
    }
    for (let k = first; k <= last; k++) {
      let card = keep.get(k);
      if (!card) {
        card = free.pop() || this.newCard();
        card._k = k;
        card.style.transform = `translate3d(${this.x(k)}px,0,0)`;
        paint(card, this.review(k), this.anon);
      } else if (repaint) {
        paint(card, this.review(k), this.anon);
      }
    }
    for (const card of free) card.remove();
    this.cards = this.cards.filter(c => c.isConnected);
  }

  // wake at the next card boundary, recycle, sleep again
  schedule() {
    clearTimeout(this.timer);
    if (!this.running) return;
    const into = mod(this.pos() - this.cardW, this.step);   // layout() turns over at these
    const left = this.dir > 0 ? this.step - into : (into || this.step);
    this.timer = setTimeout(() => { this.layout(); this.schedule(); }, (left / this.speed) * 1000 + 40);
  }

  sync() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const run = !!this.anim && this.active && this.flags.inView && !this.flags.hover && !this.flags.drag && !reduce;
    if (run === this.running) return;
    this.running = run;
    if (run) this.anim.play(); else if (this.anim) this.anim.pause();
    this.schedule();
  }

  resize() {
    const at = this.pos() / this.step;   // keep the same card in place
    this.measure();
    for (const card of this.cards) card.remove();
    this.cards = [];
    this.running = undefined;
    this.animate(at * this.step);
    this.layout();
  }

  // a finger or mouse takes the row and hands it back where it was left
  bindDrag() {
    const vp = this.viewport;
    let d = null;
    let frame = 0;
    vp.addEventListener('pointerdown', e => {
      if (!this.anim || (e.pointerType === 'mouse' && e.button !== 0)) return;
      d = { x: e.clientX, y: e.clientY, t: this.anim.currentTime, id: e.pointerId, on: false };
    });
    vp.addEventListener('pointermove', e => {
      if (!d) return;
      const dx = e.clientX - d.x;
      if (!d.on) {
        if (Math.abs(dx) < 6) return;
        if (Math.abs(e.clientY - d.y) > Math.abs(dx)) { d = null; return; }   // a vertical scroll
        d.on = true;
        d.t = this.anim.currentTime;
        d.x = e.clientX;
        this.flags.drag = true;
        this.sync();
        vp.classList.add('is-dragging');
        try { vp.setPointerCapture(d.id); } catch (err) { /* older engines */ }
        return;
      }
      // the finger moves the track by dx: the line moves by dx*sgn
      this.anim.currentTime = d.t + ((dx * this.sgn) / (this.dir * this.speed)) * 1000;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; this.layout(); });
    });
    const up = () => {
      if (!d) return;
      const was = d.on;
      try { vp.releasePointerCapture(d.id); } catch (err) { /* ignore */ }
      d = null;
      if (!was) return;
      vp.classList.remove('is-dragging');
      this.layout();
      this.flags.drag = false;
      this.sync();
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('lostpointercapture', up);
  }
}

/* ---- boot ------------------------------------------------------------ */

async function start(section) {
  const viewports = [...section.querySelectorAll('[data-qtest-row]')];
  const mock = mockReviews(section);
  const feed = { items: [], done: true, fill: () => Promise.resolve() };

  // the card shells first (fixed sizes — nothing shifts), the reviews into them
  const rows = viewports.map((vp, i) => new Row(section, vp, i, viewports.length, feed));
  const need = rows.reduce((n, r) => n + (r.active ? r.slots : 0), 0);

  let source = null;
  if (section.hasAttribute('data-qtest-real') && window.salla?.api?.request) {
    const store = storeReviews();
    try { await store.fill(need); } catch (e) { /* fall back below */ }
    if (store.items.length) source = store;
  }
  if (!source && mock.length) source = { items: mock, done: true, fill: () => Promise.resolve() };
  if (!source) { section.remove(); return; }

  rows.forEach(r => { r.feed = source; r.layout(true); });

  const io = new IntersectionObserver(entries => {
    const on = entries[entries.length - 1].isIntersecting;
    rows.forEach(r => { r.flags.inView = on; r.sync(); });
  }, { rootMargin: '100px 0px' });
  io.observe(section);

  let timer = 0;
  let width = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (window.innerWidth === width) return;   // phones fire resize on scroll (URL bar)
      width = window.innerWidth;
      rows.forEach(r => { r.resize(); r.sync(); });
    }, 200);
  }, { passive: true });
}

export function initTestimonials(root = document) {
  const sections = [...root.querySelectorAll('[data-qtest]:not([data-qtest-init])')];
  if (!sections.length) return;
  // nothing is fetched or animated until a section is near the screen
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      start(e.target);
    });
  }, { rootMargin: '400px 0px' });
  sections.forEach(s => {
    s.setAttribute('data-qtest-init', '');
    io.observe(s);
  });
}
