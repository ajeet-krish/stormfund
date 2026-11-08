<!-- entire-agent:begin -->
Read .entire/agent-guide.md for this repository's workflow, source inspection, and verification guidance.
@.entire/agent-guide.md
<!-- entire-agent:end -->

# Sheridan Datathon 2026: Financial Resilience Engine

Full pivot to the Tangerine "Resilience Rewired" Financial Resilience Engine (C-1 Resilience Weather Station). Orbit game and findings-first report dropped as surfaces; machinery reusable internally.

## Quick Commands

- Engine build: `uv run python -m scripts.engine.build`
- Engine verify: `uv run python -m scripts.engine.verify`
- Python tests: `uv run pytest -q`
- Frontend tests: `npx vitest run`
- Frontend build: `npx vite build`

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| E1 | Profile precompute (profiles.json + golden fixtures) | Complete |
| E2 | Console base (lookup, baseline card, shocks, verdict, plan text) | Complete |
| E3 | Weather viz (forecast strip, bands, EI-cliff overlay) | Complete |
| E4 | Plan engine (goal math + backup levers) | Complete |
| E5 | Storm Atlas (population headline + drill-down) | Complete |
| E6 | Judge mode (shortcuts, edge guards, rehearsal, fallback) | Complete |
| E7 | Solana A+ touch (gated, receipt badge) | Complete |

Hard stops: findings freeze Sat 6 PM, Devpost draft Sat 8 PM, submit Sun 12 PM. Headline numbers must match docs/tangerine-challenge.md answer key exactly.

## Coordination note (Nov 08, user decision, resolved)

The seven-state weather ladder is retired on every surface, and the
reband is DONE (commits ac6b652 and f5cb657: weather_state.py and its
goldens deleted, atlas.json rebuilt on the five bands, correction entry
in docs/decisions.md). The rule stands for any future work: do not
reintroduce clear, cloudy, overcast, rain, drought, storm, or flood in
code, artifacts, or docs. The single vocabulary is src/lib/verdict.ts
(five bands).

Both earlier routing items are also resolved: the E7 future work
sentence is in docs/devpost.md "Limits we declare up front", and
npm run typecheck is green (0 errors).
