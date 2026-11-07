# Ledger Odyssey data schema

Source of truth: `scripts/build_world.py` (and `scripts/pipeline_lib.py` for
provenance). This file documents what the Python pipeline emits and what the
TypeScript loaders (`src/data/loaders.ts`) validate on the way in. If the two
ever disagree, Python wins and the loader changes.

Last updated: Nov 04 2026 (schemaVersion 1).

## Money and identifiers

- All money is integer CAD cents (`annualSpendCents`, `balanceCents`,
  `valueCents`). The app divides by 100 for display and keeps stored values
  in cents so tests compare exactly.
- Row ids are strings as they appear in the source CSV (for example
  `TAN-000001`). `Provenance.rowIds` is sorted ascending by code point.
- Dates are ISO `yyyy-mm-dd`; month labels in the balance series are
  `yyyy-mm`.

## world.json

Top-level keys (snake_case, exactly these six plus `meta`):

| Key | Type | Meaning |
|-----|------|---------|
| `meta` | object | Generator provenance: `schemaVersion`, `generatedBy`, `source`, `sourceSha256`, `rowCount`, `dateRange {start, end}`, `moneyUnit`, `checksumRecipe`, `entityCounts {categories, subscriptions, splurges, income_events, monthly_balance_series}`. |
| `categories` | array | One planet per merchant category of debit rows. |
| `subscriptions` | array | Detected recurring charges (25 to 35 day runs). |
| `splurges` | array | One-off spends above 3 times the category median. |
| `income_events` | array | One entity per positive deposit row. |
| `monthly_balance_series` | array | 12 month end closes for the shipped fixture year (`BALANCE_SERIES_LENGTH`); the loader currently requires exactly 12 (known coupling, see below). |
| `debt_horizon` | object | `valueCents = minBalanceCents - bufferCents` (fixed 50000 buffer) plus `derivation` and `provenance`. |

Known coupling: 12 is the fixture-year length (one month end close per
month over the shipped full-year CSV), and `parseWorld` in
`src/data/loaders.ts` requires exactly `BALANCE_SERIES_LENGTH` points. A
source CSV covering fewer than 12 months builds a shorter series that the
loader rejects on the way in. The pipeline deliberately does not pad (no
synthetic points, see the opening balance note below), so shipping a partial
year requires a loader decision first; this is that documented seam.

### Entity fields

- `categories[i]`: `id`, `name`, `annualSpendCents`, `transactionCount`,
  `medianAmountCents`, `recurrencesPerMonth`, `medianGapDays` (number or
  null), `timeOfDay` (24 bins summing to 1), `inclinationDeg`,
  `ascendingNodeDeg`, `orbitPhaseDeg` (derived from sha256 of the id, so any
  layout drawn from them is deterministic; no shipped surface reads them
  since src/game was removed), `provenance`.
- `subscriptions[i]`: `id`, `merchant`, `category`, `monthlyAmountCents`,
  `chargeCount`, `firstDate`, `lastDate`, `medianGapDays`, `provenance`.
- `splurges[i]`: `id`, `date`, `amountCents` (signed, negative),
  `spendCents` (absolute), `category`, `merchant`, `thresholdCents`,
  `ratioToMedian`, `provenance`.
- `income_events[i]`: `id`, `date`, `amountCents` (positive), `label`,
  `category`, `provenance`.
- `monthly_balance_series[i]`: `month` (`yyyy-mm`), `date` (last row of that
  month), `balanceCents`, `provenance`.

### Provenance (every block, all entities, series points, and debt horizon)

```json
{
  "rowIds": ["TAN-000001", "TAN-000008"],
  "filter": "human readable rule the generator applied",
  "agg": "aggregation text; checksum value = amountCents",
  "checkSum": "64 lowercase hex digits"
}
```

- `agg` always ends with `checksum value = <column>`; the column is
  `amountCents` for transaction entities and `balanceCents` for the balance
  series and the debt horizon.
- `checkSum` is SHA256 of the LF joined `{rowId}:{valueCents}` lines sorted
  ascending by row id (recipe echoed in `meta.checksumRecipe`). The
  TypeScript side reproduces it byte for byte in `src/data/checksum.ts` and
  verifies it live in the report's provenance stamps through
  `src/data/resolveRows.ts`.

## transactions.json

Column oriented row table:

```json
{
  "columns": ["id", "date", "hour", "amountCents", "balanceCents", "type", "category", "merchant"],
  "rows": [["TAN-000001", "2025-11-01", 1, -1544, 358456, "debit", "Dining", "Starbucks"]]
}
```

- `rows` are arrays indexed by `columns`; `type` is `debit` or `credit`;
  `merchant` may be an empty string when the source CSV has no merchant
  column.
- `parseTransactions` validates the column list, the value types, and id
  uniqueness, then materializes each row into the `TransactionRow` object
  form the provenance stamps and loaders use.

## Fields the app derives (not in world.json)

Python emits data only; the app derives one value in TypeScript:

- Layout seed: `worldSeed()` in `src/data/types.ts` takes the first 8 hex
  digits of `meta.sourceSha256` (stable for an unchanged CSV). No shipped
  surface reads it right now: it stayed behind when `src/game` was removed,
  ready for the Balance River layout next phase. `fnv1a32()` in
  `src/data/checksum.ts` is its hashing helper and is in the same position.

The galaxy game's `FUEL_RATE` tuning (`src/game/types.ts`) left with the
cancelled game; `src/game` was removed in the Balance River pivot (see
docs/decisions.md).

## Opening balance note

`monthly_balance_series` starts at the first observed month end close, so a
monthly view opens on month 1 with that close as its starting value. Each
entry lands the next observed close; entry 12 completes the year. No
synthetic points are inserted: what a view steps over is exactly what the
pipeline wrote.
