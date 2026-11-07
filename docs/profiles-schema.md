# profiles.json Schema (Phase E1 Artifact)

Field by field contract for the Phase E2 loader. The artifact lives at
`public/data/engine/profiles.json`, is written by
`uv run python -m scripts.engine.build`, and is gated by
`uv run python -m scripts.engine.verify`.

## Guarantees

- Compact JSON (no spaces), one trailing newline, LF line endings.
- No timestamps and no floating point values anywhere: two consecutive
  builds of unchanged sources are byte identical.
- `profiles` keys are account id strings in ascending numeric order.
- Every money value is an integer in CAD cents. Every runway value is an
  integer count of tenths of a month.
- Sources are verified against `data/tangerine/SHA256SUMS` before any row
  is read; a mismatch fails the build loudly.

## Top level shape

```json
{
  "meta": {
    "schema_version": 1,
    "generated_by": "scripts.engine.build",
    "sources": [
      {"path": "data/tangerine/monthly_summary.csv", "sha256": "64 hex chars", "rows": 185326},
      {"path": "data/tangerine/loans.csv", "sha256": "64 hex chars", "rows": 682},
      {"path": "data/tangerine/accounts.csv", "sha256": "64 hex chars", "rows": 4500}
    ],
    "account_count": 4500,
    "date_range": {"start": "2020-01", "end": "2025-12"},
    "money_unit": "integer CAD cents",
    "runway_unit": "tenths of a month",
    "rounding": "...",
    "definitions": {"income_cents": "...", "runway_deci_months": "..."},
    "checksum_recipe": "...",
    "edge_flag_counts": {"pensioner": 740, "thin_history": 377, "zero_income": 14,
                         "defaulted_loan": 45, "negative_buffer": 23}
  },
  "profiles": {
    "20111": {"account_id": "20111", "income_cents": 0}
  }
}
```

## meta block

- `schema_version` (int): currently `1`. The E2 loader must refuse any
  other value instead of guessing.
- `generated_by` (string): always `scripts.engine.build`.
- `sources` (array of 3): one entry per canonical CSV in fixed order
  (monthly_summary, loans, accounts) with `path`, `sha256` (64 lowercase
  hex), `rows` (data rows, header excluded).
- `account_count` (int): equals the number of entries in `profiles`.
- `date_range` (object): `start` and `end` as `YYYY-MM`, the minimum
  `history.first_month` and maximum `history.last_month` over all
  profiles.
- `money_unit` (string): `integer CAD cents`.
- `runway_unit` (string): `tenths of a month`, so 1200 means 120.0
  months.
- `rounding` (string): the human readable rounding contract. Dollars
  convert to cents with `np.rint(dollars * 100)` (half to even), and
  every median, mean, and runway division afterwards uses
  ROUND_HALF_UP (ties away from zero) exactly once at the metric
  boundary.
- `definitions` (object): judge definitions for `income_cents`,
  `fixed_costs_cents`, `spending_cents`, `buffer_cents`,
  `household_bills_cents`, `loan_payment_cents`, `gap_cents`,
  `runway_deci_months`. These strings are duplicated on purpose in
  `scripts/engine/verify.py`; drift fails verification.
- `checksum_recipe` (string): the provenance recipe (see below).
- `edge_flag_counts` (object): accounts per flag across the whole
  dataset. The E2 UI should treat a count of 0 as "this flag never fires
  in this data". All five are nonzero in the shipped build.

## profiles entry (one per account)

Exactly these keys, no more, no less:

### Identity and judge metrics

- `account_id` (string): digits, matches the key.
- `income_cents` (int): I, median of `money_in` over all monthly rows.
- `fixed_costs_cents` (int): F, median over months of the per row sum
  `household_bills + insurance + loan_payments`. Part 1 display only,
  never used in the runway.
- `spending_cents` (int): S, median of `money_out` over all rows.
- `buffer_cents` (int): B, mean of `avg_daily_balance` over the last
  `min(6, n)` rows sorted by month, rounded half up. May be negative.
- `household_bills_cents` (int): H, median of `household_bills`.
- `loan_payment_cents` (int): P, `monthly_payment` when the loan status
  is `C` or `D` (running at the end of 2025), otherwise 0. Accounts with
  no loan are 0.
- `insurance_cents` (int): median of `insurance`.
- `loan_payments_median_cents` (int): median of `loan_payments`.
- `pension_in_cents` (int): sum of `pension_in` over all rows, not a
  median and not windowed.
- `gap_cents` (int): S minus I. Positive means typical spending exceeds
  typical income.

### Runway (baseline, before any shock)

- `runway_state` (string): exactly one of `finite`, `no_shortfall`,
  `buffer_depleted`.
- `runway_deci_months` (int): 0 for `buffer_depleted`, 1200 for
  `no_shortfall`, otherwise `ROUND_HALF_UP(10 * buffer_left / gap)`
  capped at 1200. Branch order is fixed: `buffer_left <= 0` first, then
  `gap <= 0`, then the finite branch. The E3 shock engine must reuse
  this branch order so live shock numbers match the artifact baseline.

### history

- `history.first_month`, `history.last_month` (string): `YYYY-MM`.
- `history.row_count` (int): monthly rows, at least 1, at most 72.
- `history.months_contiguous` (bool): true when the sorted months fill
  one unbroken span (true for every account in the shipped build).
- `history.months` (array of `YYYY-MM`, optional): present only when
  `months_contiguous` is false, one entry per row in month order.

### loan

`null` when the account has no row in `loans.csv`, otherwise an object:

- `loan_id` (int), `status` (string `A`, `B`, `C`, `D`),
  `defaulted` (bool, true for `B` and `D`),
  `amount_cents` (int), `duration_months` (int),
  `monthly_payment_cents` (int), `loan_start` (string `YYYY-MM-DD`),
  `scheduled_end_month` (string `YYYY-MM`, `loan_start` month plus
  `duration_months`).

The P rule reads `status` only: `C` or `D` pays, `A` or `B` is 0. The
build report logs the schedule versus status disagreement count so a
future data refresh that breaks the rule shows up immediately (0
disagreements in the shipped build).

### flags

Exactly five booleans:

- `pensioner`: `pension_in_cents > 0`.
- `thin_history`: `row_count < 18`, a quarter of the 72 month dataset
  span. The B window itself is still `min(6, n)` rows regardless of this
  flag.
- `zero_income`: `income_cents == 0`.
- `defaulted_loan`: `loan.status == "D"` (no loan means false).
- `negative_buffer`: `buffer_cents < 0`.

### balance_series

- `start_month` (string): month of the first value.
- `values_cents` (array of int): the last `min(12, row_count)`
  `avg_daily_balance` values in month order. Chart input for the E2
  profile view.

### provenance

- `source` (string): `data/tangerine/monthly_summary.csv`.
- `filter` (string): `account_id = <id> ordered by month ascending`.
- `agg` (string): judge aggregation text, ends with
  `checksum value = money_in_cents`.
- `check_sum` (string): 64 lowercase hex.

Recompute recipe (mirrored by `src/data/checksum.ts`): build row ids
`<account_id>:<month>`, sort them ascending, pair each with the row's
`money_in` in cents, join `id:value` lines with a single LF, SHA256 the
UTF-8 bytes.

## E2 loader validation checklist

1. `JSON.parse` the fetch of `profiles.json` (single bundled file, no
   runtime network beyond the static asset).
2. Refuse unless `schema_version === 1` and the top level keys are
   exactly `meta` and `profiles`.
3. For each entry, check the key set above, integer money fields (not
   `NaN`, not fractional), `runway_state` enum, `runway_deci_months` in
   `[0, 1200]`, five boolean flags, `provenance.check_sum` hex length 64.
4. Check `meta.account_count === Object.keys(profiles).length`.
5. Keys arrive in numeric order already; a search index may assume it.

## Regeneration and verification

```bash
uv run python -m scripts.engine.build     # writes the artifact and prints the report
uv run python -m scripts.engine.verify    # naive csv recompute, drift diff, dash scan, SHA256
uv run pytest scripts/engine -q           # golden fixtures, schema, determinism
```
