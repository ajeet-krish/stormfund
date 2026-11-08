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
| E4 | Plan engine (goal math + backup levers) | Not started |
| E5 | Storm Atlas (population headline + drill-down) | Not started |
| E6 | Judge mode (shortcuts, edge guards, rehearsal, fallback) | Not started |
| E7 | Solana A+ touch (gated, receipt badge) | Not started |

Hard stops: findings freeze Sat 6 PM, Devpost draft Sat 8 PM, submit Sun 12 PM. Headline numbers must match docs/tangerine-challenge.md answer key exactly.
