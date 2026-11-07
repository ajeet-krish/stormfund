# Tangerine dataset runbook (Saturday Nov 07 2026)

The real dataset drops Saturday. This folder holds the real file once it
arrives. The schema stays unknown until the probe runs, so the order below
is fixed: probe first, write the adapter against the real headers, then run
the pipeline commands in sequence.

## Privacy rule (docs/decisions.md, Nov 06 2026)

Decide by data type on Saturday:

* Sponsor competition data may be committed raw.
* Personal statement data publishes aggregates, checksums, and k=10
  suppressed cells only, never raw rows.
* Any published table suppresses category or month buckets with fewer than
  10 transactions as "suppressed (k less than 10)".
* Record the raw file SHA256 either way; the probe prints it.

## Probe first (already built, schema agnostic)

`scripts/ingest/probe_schema.py` works on any csv or tsv file, plus xlsx
only when an engine is installed (openpyxl is not in this environment, so
export a workbook to csv and probe that). One run prints filename plus
sha256, size, detected encoding (utf-8-sig, utf-8, latin-1), detected
delimiter (comma, semicolon, tab), columns with dtypes, three sample rows,
null counts per column, date range candidates with a DD/MM versus MM/DD
verdict, the sign convention verdict, numeric amount and balance
candidates, category like columns with their top 10 value counts, and a
final VERDICT block.

The full adapter gets written tomorrow (Saturday) against the probe output
and the REAL headers: map them onto the canonical CSV contract below, fail
loudly listing any unmapped column, and record the mapping table in the
write up.

## Canonical CSV contract

build_world reads a CSV whose headers normalize (case insensitive,
camelCase split, punctuation collapsed) to:

| Column | Required | Rule |
|--------|----------|------|
| transaction_id | yes | unique row id string, for example TAN-000001 |
| date | yes | ISO calendar date, YYYY-MM-DD |
| hour | no | integer 0 to 23; falls back to a timestamp column, else 12 |
| amount | yes | CAD decimal; debits negative, deposits positive |
| merchant_category | yes | category label, for example Groceries |
| account_balance | yes | CAD decimal balance after the transaction |

Optional builder columns the adapter may pass through: minute (0 to 59),
merchant_name (subscription grouping key), transaction_type ("debit" or
"credit"; when present the column wins over the sign of amount), timestamp
(ISO datetime used only to derive hour).

## Saturday command order

Run everything from the repository root, in this exact order:

```bash
# 1. Probe the real file (prints the VERDICT block to map against)
uv run python -m scripts.ingest.probe_schema --input data/tangerine/<real-file>.csv

# 2. Write the adapter mapping against the REAL headers from the VERDICT
#    block, emitting a CSV that satisfies the canonical contract above.
#    The full adapter gets written tomorrow against this probe output.

# 3. Build world.json and transactions.json from the mapped CSV
uv run python -m scripts.build_world --input data/tangerine/<mapped-file>.csv

# 4. Rebuild the findings artifacts from the new world
uv run python -m scripts.analysis.build_findings

# 5. Verify the artifacts did not drift
uv run python -m scripts.analysis.verify_findings

# 6. Full python suite; the mock fallback must stay green
uv run pytest
```

## Fallback and limits

* build_world rejects inputs above 50 MB (MAX_INPUT_CSV_BYTES). Decide
  deliberately: aggregate to daily category rows in the adapter, or raise
  the cap with a logged decision. Never edit the cap silently.
* If the real dataset is late, mislicensed, or too messy, run the whole
  chain against `data/mock/tangerine_transactions.csv` and state in the
  write up that the methods transfer from the synthetic mock.
* The probe is read only and contains no path restriction, so any location
  works as `--input`.
