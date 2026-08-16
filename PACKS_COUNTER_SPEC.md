# Packs-Sold Counter — Backend Spec

Spec for the pipeline side of the global "total packs sold" counter that sits under
the Qussah storefront header. Written against `Hazem-Salama/salla-dashboard` @ `cbbc5c0`.

The theme side is read-only: it fetches one number and animates it. Everything in
this document is work for the pipeline.

---



## TL;DR

Extend the existing pipeline — don't build a new service. The Salla OAuth, token
refresh, webhook routing and BigQuery plumbing are already solid and are the
expensive parts to rebuild.

But this is **not** an endpoint-only change. The two values the counter needs are
not in BigQuery today:

| Needed | Status |
|---|---|
| `quantity` per line item | ✅ stored in `items_json` |
| `product_id` per line item | ❌ **dropped at transform time** |
| pack count (`68` from `"68 قطعة"`) | ❌ **never fetched — no products API client exists** |

So: capture the missing fields → backfill → materialize a total → expose it cached.

---

## Why the counter needs these two fields

The requirement is that ordering 1 × "قصة ٦٠٠ منديل" (which contains 32 inner packs)
adds **+32**, not +1. So per line item:

```
packs = pack_count(product) × item.quantity
```

`item.quantity` is present. `pack_count` is not — it lives in the Salla product's
**`subtitle`** field as merchant-typed Arabic text, e.g. `"68 قطعة، 3 طبقات"`.
The storefront renders that subtitle as chips by splitting on the Arabic comma `،`
(see `qissa-products.twig:46`), which is where the visible `68 قطعة` chip comes from.

To get from an order line to a pack count you need a stable join key — `product_id`.

---

## Blocker 1 — `product_id` is discarded

`src/transformers/order-transformer.ts`:

```ts
const mapped = items.map((item) => ({
  name:     item.name,
  sku:      item.sku      ?? null,
  quantity: item.quantity,
  price:    item.amounts?.price_without_tax?.amount ?? null,
  total:    item.amounts?.total?.amount             ?? null,
}));
```

`SallaOrderDetailItem` (`src/services/salla/salla-types.ts`) already carries
`item.id` and `item.product.id` — the data is in memory and thrown away.

`sku` is not a usable substitute: it is `?? null` here and optional in the Salla
type, so any product without a SKU becomes unjoinable.

**Fix** — add the identifier:

```ts
const mapped = items.map((item) => ({
  product_id: item.product?.id ?? null,   // ← join key for pack counts
  name:       item.name,
  sku:        item.sku      ?? null,
  quantity:   item.quantity,
  price:      item.amounts?.price_without_tax?.amount ?? null,
  total:      item.amounts?.total?.amount             ?? null,
}));
```

⚠️ **This does not repair history.** Existing rows are permanently missing
`product_id` — no query can recover it. A backfill is required (see step 4).

---

## Blocker 2 — product subtitle is never fetched

The pipeline has **no products API client at all**. `src/config/constants.ts`
defines paths for orders, webhooks and abandoned carts only. Confirmed by grep:
the only `subtitle` occurrences in `src/` are an unrelated variable in the OAuth
success page (`src/index.ts:419`).

So a new dimension table is needed.

### New table: `product_packs`

One row per product. Small, slow-changing.

| Column | Type | Mode | Notes |
|---|---|---|---|
| `product_id` | INTEGER | REQUIRED | Salla product id — join key |
| `store` | STRING | REQUIRED | which store it belongs to |
| `name` | STRING | NULLABLE | for debugging/audit |
| `subtitle` | STRING | NULLABLE | raw subtitle, kept verbatim |
| `pack_count` | INTEGER | NULLABLE | parsed; `NULL` when unparseable |
| `parse_ok` | BOOLEAN | REQUIRED | false ⇒ needs merchant attention |
| `synced_at` | TIMESTAMP | REQUIRED | |

Populate via `GET /products/{id}` (Admin API, `products.read`) — the same
`SALLA_API_BASE_URL` and per-store OAuth token the order sync already uses.

Refresh on `product.updated` webhook if subscribed; otherwise on the 6-hour cron.
Only fetch ids seen in orders — no need to walk the whole catalogue.

### Parsing `pack_count` from the subtitle

The subtitle is comma-separated chips; the pack count is the one containing the
unit word. **Do not blindly take the first integer** — `"3 طبقات، 68 قطعة"` would
yield `3`.

```ts
/** "68 قطعة، 3 طبقات" → 68 ; returns null when no packs chip is found */
export function parsePackCount(subtitle: string | null | undefined): number | null {
  if (!subtitle) return null;

  // Arabic-Indic digits (٠-٩) normalise to ASCII so the regex works either way
  const normalise = (s: string) =>
    s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660));

  // Unit words that denote inner packs/pieces. Extend as the merchant adds more.
  const UNIT = /(قطعة|قطع|عبوة|عبوات|منديل|مناديل)/;

  for (const chip of subtitle.split('،')) {
    if (!UNIT.test(chip)) continue;
    const m = normalise(chip).match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}
```

**Fallback policy — decide before shipping.** When `pack_count` is `NULL`:

- **Recommended:** count the item as `quantity × 1`, and log it. The counter stays
  truthful-ish and never silently drops sales.
- Alternative: skip the item entirely (undercounts).

Either way `parse_ok = false` rows should be reviewable so the merchant can fix the
subtitle. Do **not** guess a default like 32.

---

## Blocker 3 — reading `items_json` per request is expensive

`items_json` is a `STRING` column. Aggregating over it means
`JSON_EXTRACT_ARRAY(...)` + `UNNEST` across the full order history — a full-column
scan on every call.

The existing `/api/dashboard` runs BigQuery **live and uncached** on every request.
Copying that pattern for a storefront counter would mean a BigQuery query **per page
view**, on every page of the site except cart. That is unbounded cost.

`/api/analytics` already demonstrates the right instinct:

```ts
// Analytics queries hit every store table; cache to protect the BQ free tier
const CACHE_TTL_MS = 5 * 60 * 1000;
```

But an in-process `Map` dies on every Render restart and doesn't survive across
instances — and Render's free tier spins down when idle, so cold starts are common.

**Recommendation: materialize, don't aggregate on read.**

Maintain a single-row running total, updated by the sync/webhook path — not
recomputed per request. The counter endpoint then does a trivial point read (or
serves from memory), and cost stays flat no matter how much storefront traffic hits it.

### New table: `packs_total`

| Column | Type | Notes |
|---|---|---|
| `store` | STRING | or `"__all__"` for the global figure |
| `total_packs` | INTEGER | the number the counter displays |
| `orders_counted` | INTEGER | audit — how many orders it represents |
| `updated_at` | TIMESTAMP | |

Recompute after each sync batch:

```sql
SELECT SUM(item.quantity * IFNULL(p.pack_count, 1)) AS total_packs
FROM `{dataset}.store_{name}_orders` o,
UNNEST(JSON_EXTRACT_ARRAY(o.items_json, '$')) AS raw
CROSS JOIN UNNEST([STRUCT(
  CAST(JSON_VALUE(raw, '$.product_id') AS INT64) AS product_id,
  CAST(JSON_VALUE(raw, '$.quantity')   AS INT64) AS quantity
)]) AS item
LEFT JOIN `{dataset}.product_packs` p USING (product_id)
WHERE o.status NOT IN ('cancelled', 'refunded')   -- see below
```

**Order-status policy — confirm this.** Cancelled and refunded orders should almost
certainly *not* count toward "packs in customers' hands". The pipeline already
subscribes to `order.cancelled` and `order.refunded`, so the total must be
recomputed (not just incremented) when those fire — otherwise the counter only ever
goes up and drifts from reality.

---

## The endpoints

Two are needed: a snapshot for first paint, and a stream for live updates.

### 1. Snapshot — `GET /api/packs-sold`

```json
{
  "total": 1234567,
  "target": 999000000,
  "updated_at": "2026-08-16T09:12:00Z"
}
```

The theme calls this once on page load to paint an initial number, and falls back
to polling it if the stream is unavailable.

Requirements:

- **Public, read-only, no auth.** A theme is public source — it cannot hold a
  secret. This endpoint must be safe to call anonymously.
- **CORS**: the pipeline already sets `Access-Control-Allow-Origin: *`.
- **Cache**: `Cache-Control: public, max-age=60` plus a server-side TTL.
  Serve a stale value rather than blocking on BigQuery.
- **Never 5xx into the storefront.** On error return the last known good value.
  The theme hides the counter if the fetch fails, but a fast wrong-shaped response
  is worse than a stale correct one.
- Response must stay this small — it's on every page load.

### 2. Live stream — `GET /api/packs-sold/stream`

Server-Sent Events. Chosen over WebSocket because the traffic is strictly
one-way (server → browser), `EventSource` reconnects automatically, and it needs
no protocol upgrade or extra infrastructure.

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

On connect, immediately send the current total so a newly-opened tab is correct
without waiting for the next order:

```
data: {"total":1234567,"target":999000000,"updated_at":"2026-08-16T09:12:00Z"}

```

Then push the same shape whenever the total changes — i.e. after the recompute
triggered by `order.created`, `order.cancelled` or `order.refunded`.

**Heartbeat is mandatory.** Send a comment line every ~30s:

```
: ping

```

Without it, proxies and load balancers silently drop idle connections and the
counter goes stale while appearing connected.

**Only push on change.** If a recompute yields the same total, send nothing —
the theme animates on every message received, so a repeated identical value
would cause a visible no-op animation.

#### Hosting caveat — this one is decisive

SSE holds one open connection per viewing tab. Two consequences on Render:

- **The free tier will not work.** It spins down idle instances and terminates
  open connections; the stream would die constantly.
- Connection count scales with concurrent visitors, and each costs memory and a
  file descriptor. Set a sane cap and let the theme fall back to polling when the
  cap is hit — a degraded counter beats a dead server.

If the traffic shape makes SSE impractical, the theme's polling fallback (15s) is
a supported mode, not a failure state. Say so and the theme will use it.

---

## Work checklist

1. Add `product_id` to `serializeItems` — two lines, gates everything else.
2. Add a products API client + `product_packs` table + `parsePackCount`.
3. Add `packs_total` materialization; recompute on sync and on cancel/refund.
4. **Backfill** historical orders via the existing `POST /gapFill` route — required,
   since past rows have no `product_id`.
5. Add `GET /api/packs-sold`, cached.
6. Add `GET /api/packs-sold/stream` (SSE) + push on every recompute + heartbeat.

---

## Security notes (pre-existing, not caused by this feature)

Flagging these because this feature deliberately points **public storefront traffic**
at this host, which raises the stakes on all three:

- `POST /scheduledSync`, `/gapFill`, `/stopSync` are **unauthenticated mutating
  endpoints** on a public URL. Anyone can trigger a full re-sync.
- Webhook signature verification is **conditional** — an unsigned POST skips HMAC
  entirely, and `SALLA_WEBHOOK_SECRET` defaults to `''` rather than being required.
- `GET /oauth/callback` **writes both access and refresh tokens into the logs** and
  renders them into an HTML page.

None of these block the counter. All are worth fixing before the host is publicly
advertised by every page of the storefront.
