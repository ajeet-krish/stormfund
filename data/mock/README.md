# Mock datasets

Every file in this directory is SYNTHETIC. The two generators are seeded, log
their seed on stdout, and repeat the seed plus a disclaimer inside a header
comment on line 1 of each CSV. No real bank statements or employee records
are used anywhere in this repository.

## Files

| File | Generator | Seed | Rows | Feeds |
|------|-----------|------|------|-------|
| tangerine_transactions.csv | scripts/generate_mock_ledger.py | 20261107 | about 5800 | scripts/build_world.py |
| ibm_hr.csv | scripts/generate_mock_ibm_hr.py | 20261107 | 1200 | scripts/build_players.py |

Output note: `public/data/players.json`, built from `ibm_hr.csv`, is a parked
backup artifact for the Attrition FC fallback game; nothing in `src/` consumes
it yet.

Dataset version: seed 20261107, ledger year 2025-11-01 to 2026-10-31, IBM HR
table generated 2026-11-04. Record new seeds here whenever a generator rerun
changes the data.

## Regenerate

```bash
uv sync
uv run python -m scripts.generate_mock_ledger
uv run python -m scripts.generate_mock_ibm_hr
uv run python -m scripts.build_world
uv run python -m scripts.build_players
```

## Schemas

tangerine_transactions.csv (line 1 is a `#` comment, headers on line 2):

| Column | Type | Meaning |
|--------|------|---------|
| transaction_id | string | unique row id, for example TAN-000001 |
| date | YYYY-MM-DD | transaction date |
| hour | 0 to 23 | posting hour |
| minute | 0 to 59 | ordering helper for same day rows |
| amount | decimal | CAD, negative for debits, positive for deposits |
| merchant_category | string | Groceries, Dining, Transit, Subscriptions, Utilities, Retail, Travel, Income |
| merchant_name | string | merchant label used for subscription detection |
| account_balance | decimal | CAD balance after the transaction |
| transaction_type | string | debit or credit |

ibm_hr.csv (line 1 is a `#` comment, headers on line 2):

| Column | Type | Meaning |
|--------|------|---------|
| EmployeeNumber | integer | unique row id starting at 1001 |
| Age | integer | 18 to 60 |
| Department | string | Research & Development, Sales, Human Resources |
| DistanceFromHome | integer | 1 to 29 |
| JobSatisfaction | integer | 1 to 4 |
| EnvironmentSatisfaction | integer | 1 to 4 |
| OverTime | Yes or No | about 28 percent Yes |
| YearsAtCompany | integer | tenure, never above Age minus 18 |
| MonthlyIncome | integer | CAD per month |
| PerformanceRating | integer | 3 or 4 |
| TrainingTimesLastYear | integer | 0 to 6 |
| Attrition | Yes or No | about 16 percent Yes, correlated with OverTime |

## Provenance

Both builders stamp every emitted entity with Provenance `{rowIds, filter,
agg, checkSum}` and reverify all checksums after writing JSON. The checksum
recipe lives in scripts/pipeline_lib.py and is mirrored by the TypeScript
Inspector.
