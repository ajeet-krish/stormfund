# Storm Fund: A resilience weather station for bank customers

Sheridan Datathon 2026, Tangerine track. A financial resilience engine
dressed as a weather station: pick any account, apply a shock, and watch
the forecast change.

## What it does

See your money move like weather. Storm Fund is a resilience financial engine that visualizes a bank account as a real-time weather forecast. Anonymized bank data maps runway and buffer to a pixel sky. Inject a shock and watch the forecast change.

### Features

1. **Know the customer.** Income, fixed costs, spending, savings buffer, household bills, loan payment, and months of runway for any account_id.
2. **Take a shock.** Apply a job loss with EI, a furnace repair, a bills increase, or any mix, and recompute runway live.
3. **Make a plan.** An emergency fund goal plan and a shock backup plan built from the customer's own numbers.

Your savings buffer is a reservoir, your income is rain, your spending is evaporation, and a job loss is a drought front rolling in. Seven weather states map onto runway and buffer bands.

## Quick commands

```bash
# Web app (React + Vite + TypeScript + Tailwind)
npm install
npm run typecheck
npx vitest run
npm run build

# Python engine (pinned by uv)
uv sync
uv run python -m scripts.engine.build
uv run python -m scripts.engine.verify
uv run pytest -q
```

## Architecture in one paragraph

A vectorized Python pipeline (pandas, numpy, integer cents, no per-account loops) reads the raw CSVs, verifies them against a committed SHA256SUMS manifest, computes the six judge metrics for every account into
`public/data/engine/profiles.json`, and an independent verifier recomputes a seeded sample straight from the raw files to catch drift. The React app reads only those published numbers: a pure `weatherState` function maps
metrics to weather, the forecast strip and bands are hand-rolled SVG, and everything is bundled as JSON so the booth demo needs no network. A gated Gemini add-on lets a judge type a shock in their own words; the model is a parser only, a human confirms the parsed chips, and the rules engine does
the math.

## Data and credits

- PKDD'99 Discovery Challenge Financial dataset (real anonymized bank
  data), CTU Prague Relational Dataset Repository:
  https://relational.fel.cvut.cz/dataset/Financial
- Statistics Canada and Government of Canada sources where used
- Raw sponsor CSVs are gitignored; `data/tangerine/SHA256SUMS` is the
  committable record of the exact bytes analyzed

## Project map

- `scripts/engine/` Python pipeline: load, metrics, shocks, plans, build,
  verify, with golden tests
- `src/` React app: weather station components, pure state functions,
  provenance stack
- `public/data/engine/` bundled JSON artifacts (profiles, aggregates)
- `data/tangerine/` ingest runbook and checksum manifest (raw CSVs
  ignored)
- `docs/` architecture, decisions, research, reviews, tests, Devpost
  draft, competition day runbook

## Hard deadlines (Nov 7 to 8, 2026)

Findings freeze Sat 6:00 PM, Devpost draft Sat 8:00 PM, code freeze Sun
9:00 AM, submission freeze Sun 11:00 AM, final deadline Sun 12:00 PM.
See `docs/competition-day-runbook.md` for the full plan.
