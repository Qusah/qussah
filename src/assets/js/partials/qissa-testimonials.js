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
 *   · Chosen, not just newest. Most written reviews are one word and one
 *     customer often writes several in a row, so the first batch is ranked:
 *     the most specific first (longer, naming delivery / softness / price /
 *     service, carrying a number), one per customer, and the top one rides in
 *     the navy card. Later pages join in the order they arrive.
 *   · Honest count line. The store's own total; «the latest N are all five
 *     stars» only while every review walked so far is five stars; «verified
 *     buyers» because only reviews with an order behind them are shown.
 *   · Keyboard. A focused row holds still and the arrow keys step it a card.
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
 * the params gets the bare {type:'store'} call instead. Measured again
 * 2026-10-05 (4,119): every review carries name, city, date, stars and
 * has_order; none carries photos, replies or a product; pagination.total is
 * the store's count; created_at is { date: 'Y-m-d H:i:s', timezone } and
 * date a unix time.
 */
const PER_PAGE = 30;
const PAGES_PER_TOP_UP = 4;   // a run of stars-only pages can't stall a top-up forever
const PAGES_FIRST = 6;        // the first batch is ranked, so it reads a little further (cached 6 h)
const LAP = 4000;             // cards per animation lap — ~10 h at the default speed
const CACHE_KEY = 'qtest:store-reviews';
const CACHE_VERSION = 2;   // 2: city, date, the order flag, the store's total
const CACHE_TTL = 6 * 60 * 60 * 1000;   // then a fresh walk picks up new reviews
const PHONE = '(max-width: 768px)';

const mod = (n, m) => ((n % m) + m) % m;
const clampStars = n => Math.max(0, Math.min(5, Math.round(Number(n) || 0))) || 5;
const RECENT_MIN = 30;        // «the latest N are all five stars» needs at least a page behind it

// how much a review says: its length, the things shoppers ask about, a number
const TOPICS = ['توصيل', 'وصل', 'يوم', 'ايام', 'أيام', 'سنوات', 'سنين', 'ناعم', 'نعوم', 'ملمس', 'سعر', 'اسعار', 'أسعار', 'عروض', 'خدمة', 'جود', 'مشكل', 'تعويض', 'اول مره', 'أول تجربه',
  'deliver', 'soft', 'price', 'quality', 'service', 'days', 'years'];
function score(text) {
  const t = text.toLowerCase();
  const words = t.split(/\s+/).length;
  let hits = 0;
  for (const k of TOPICS) if (t.includes(k)) hits++;
  return Math.min(words, 24) + hits * 5 + (/[0-9٠-٩]/.test(t) ? 4 : 0);
}
const who = r => `${r.name}|${r.city || ''}`;

let dateFmt = null;
// created_at is { date: '2026-10-04 03:34:56…', timezone }, date a unix time in seconds
function day(value) {
  let v = (value && value.date) || value || '';
  if (typeof v === 'number') {
    try { v = new Date(v * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' }); } catch (e) { v = ''; }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return '';
  try {
    if (!dateFmt) {
      const lang = (document.documentElement.lang || 'ar').toLowerCase().startsWith('ar') ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB';
      dateFmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    return dateFmt.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])));
  } catch (e) {
    return `${+m[3]}/${+m[2]}/${m[1]}`;
  }
}

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
    this.total = 0;        // the store's own count
    this.walked = 0;       // reviews read so far, stars-only ones included
    this.allFive = true;   // …and whether every one of them was five stars
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
      this.total = c.total | 0;
      this.walked = c.walked | 0;
      this.allFive = c.allFive !== false;
      this.started = c.t;
    } catch (e) { /* storage blocked or unreadable — walk afresh */ }
  }

  save() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        v: CACHE_VERSION, t: this.started, page: this.page, done: this.done, bare: this.bare, items: this.items,
        total: this.total, walked: this.walked, allFive: this.allFive,
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
      const stars = clampStars(r.rating ?? r.stars);
      this.walked++;
      if (stars !== 5) this.allFive = false;
      // a card needs a quote, and an order behind it — the count line says «verified buyers»
      if (text && r.has_order !== false) {
        this.items.push({ k: key, text, name: plain(r.name), stars, city: plain(r.city), date: day(r.created_at ?? r.date), ok: r.has_order === true });
      }
    }
    // no new rows means the endpoint ignored `page` — stop rather than repeat
    const p = res?.pagination || {};
    if (Number(p.total) > 0) this.total = Number(p.total);
    const next = (p.links && p.links.next) || ((p.currentPage || p.current_page) < (p.totalPages || p.total_pages));
    if (this.bare || !fresh || !next) this.done = true;
    this.save();
  }

  // top up until `want` reviews are held, the store runs out, or this top-up's
  // page budget is spent (the next call carries on)
  fill(want, pages = PAGES_PER_TOP_UP) {
    if (this.done || this.items.length >= want) return Promise.resolve();
    if (!this.pending) {
      this.pending = (async () => {
        for (let i = 0; i < pages && !this.done && this.items.length < want; i++) await this.pull();
      })().finally(() => { this.pending = null; });
    }
    return this.pending;
  }
}

let shared = null;
const storeReviews = () => (shared = shared || new StoreReviews());

// what the rows read from: the first batch ranked (the most specific first, one
// per customer, the top one marked for the navy card); later pages join behind
// it in the order they arrive, so cards already on screen never reshuffle
function rankedFeed(store) {
  const best = new Map();
  for (const r of store.items) {
    r.s = r.s ?? score(r.text);
    r.lead = false;   // a cached list carries the last visit's mark
    const had = best.get(who(r));
    if (!had || r.s > had.s) best.set(who(r), r);
  }
  const items = [...best.values()].sort((a, b) => b.s - a.s);
  if (items.length) items[0].lead = true;
  const feed = {
    items,
    done: store.done,
    used: store.items.length,
    fill() {
      return store.fill(store.items.length + PER_PAGE).then(() => {
        for (; feed.used < store.items.length; feed.used++) {
          const r = store.items[feed.used];
          if (best.has(who(r))) continue;
          best.set(who(r), r);
          items.push(r);
        }
        feed.done = store.done;
      });
    },
  };
  return feed;
}

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
  // a mock review's grey line as typed; a real one's city and date
  const meta = review ? (review.meta || [review.city, review.date].filter(Boolean).join(' · ')) : '';
  f.meta.textContent = meta;
  f.meta.hidden = !meta;
  f.ok.hidden = !(review && review.ok);
  const len = review ? [...review.text].length : 99;
  card.classList.toggle('is-short', len <= 16);
  card.classList.toggle('is-mid', len > 16 && len <= 48);
  card.classList.toggle('is-lead', !!(review && review.lead));
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
    this.flags = { inView: false, hover: false, drag: false, focus: false };
    this.measure();
    this.animate();
    this.layout();
    this.bindDrag();
    this.bindKeys();
    if (section.hasAttribute('data-qtest-pause') && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      viewport.addEventListener('mouseenter', () => { this.flags.hover = true; this.sync(); });
      viewport.addEventListener('mouseleave', () => { this.flags.hover = false; this.sync(); });
    }
  }

  get active() { return this.viewport.offsetParent !== null; }   // phones hide row two

  measure() {
    const cs = getComputedStyle(this.viewport);
    this.cardW = parseFloat(cs.getPropertyValue('--qtest-card-w')) || 352;
    this.step = this.cardW + (parseFloat(cs.getPropertyValue('--qtest-gap')) || 16);
    this.pad = parseFloat(cs.getPropertyValue('--qtest-pad')) || 16;
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
    // desktop: the frame's own phase; phones: the first card at the right edge, the panel's padding in
    return this.still || matchMedia(PHONE).matches ? -this.pad : this.phase;
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
    if (this.still) return list[k] || null;   // a handful of reviews: each one once, in order
    // a row running the other way reads its line backwards; started a window's
    // worth along, so what it opens on is the head of its sequence, not the tail
    const s = this.dir * k + (this.dir < 0 ? Math.ceil(this.V / this.step) : 0);
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
      ok: card.querySelector('[data-f="ok"]'),
    };
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
    const run = !!this.anim && !this.still && this.active && this.flags.inView && !this.flags.hover && !this.flags.drag && !this.flags.focus && !reduce;
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

  // a keyboard: the focused row holds still, the arrows step it one card
  bindKeys() {
    const vp = this.viewport;
    vp.addEventListener('focus', () => { if (vp.matches(':focus-visible')) { this.flags.focus = true; this.sync(); } });
    vp.addEventListener('blur', () => { this.flags.focus = false; this.sync(); });
    vp.addEventListener('keydown', e => {
      if (!this.anim || this.still || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? this.step : -this.step;   // the track moves by dx
      this.anim.currentTime += ((dx * this.sgn) / (this.dir * this.speed)) * 1000;
      this.layout();
    });
  }

  // a finger or mouse takes the row and hands it back where it was left
  bindDrag() {
    const vp = this.viewport;
    let d = null;
    let frame = 0;
    vp.addEventListener('pointerdown', e => {
      if (!this.anim || this.still || (e.pointerType === 'mouse' && e.button !== 0)) return;
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

/* ---- the count line -------------------------------------------------- */

// every part is shown only when the store's own answer makes it true
function proof(section, store) {
  const line = section.querySelector('[data-qtest-proof]');
  if (!line || !(store.total > 0)) return;
  const n = v => Number(v).toLocaleString('en-US');
  const ar = (document.documentElement.lang || 'ar').toLowerCase().startsWith('ar');
  const t = store.total;
  // Arabic counts its nouns differently below eleven
  const count = ar && t === 1 ? 'تقييم واحد' : ar && t === 2 ? 'تقييمان' : ar && t <= 10 ? `${t} تقييمات`
    : !ar && t === 1 ? '1 review' : (section.dataset.qtestCount || ':n').replace(':n', n(t));
  line.querySelector('[data-f="count"]').textContent = count;
  const recent = line.querySelector('[data-f="recent"]');
  if (store.allFive && store.walked >= RECENT_MIN) {
    line.querySelector('[data-f="recent-text"]').textContent = (section.dataset.qtestRecent || '').replace(':n', n(store.walked));
    recent.hidden = false;
  }
  line.querySelector('[data-f="trust"]').hidden = !store.items.every(r => r.ok);
  line.hidden = false;
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
    // more than the rows hold, so the ranking has something to choose from
    try { await store.fill(need * 3, PAGES_FIRST); } catch (e) { /* fall back below */ }
    if (store.items.length) { source = rankedFeed(store); proof(section, store); }
  }
  if (!source && mock.length) source = { items: mock, done: true, fill: () => Promise.resolve() };
  if (!source) { section.remove(); return; }

  // so few reviews that one row shows them all: they stand still, each once —
  // a row of the same card passing again and again would read as padding
  const few = () => {
    const r = rows[0];
    const on = !!source.done && source.items.length <= Math.max(1, Math.floor((r.V - r.pad) / r.step));
    section.classList.toggle('is-few', on);
    rows.forEach(x => { if (x.still !== on) { x.still = on; x.resize(); } x.viewport.tabIndex = on ? -1 : 0; });
  };
  rows.forEach(r => { r.feed = source; });
  few();
  rows.forEach(r => r.layout(true));

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
      rows.forEach(r => r.measure());
      few();
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
