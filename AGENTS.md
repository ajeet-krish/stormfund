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
| E7 | Solana A+ touch (gated, receipt badge) | In progress |

Hard stops: findings freeze Sat 6 PM, Devpost draft Sat 8 PM, submit Sun 12 PM. Headline numbers must match docs/tangerine-challenge.md answer key exactly.

## Coordination note (Nov 08, user decision)

The seven-state weather ladder is retired on every surface. The single
vocabulary is src/lib/verdict.ts (five bands), per the E5 record and
the user's confirmed decision. The session that added
scripts/engine/weather_state.py, scripts/engine/weather_state_goldens.json,
and the seven-state shading in public/data/engine/atlas.json must
reband the district cartogram to the five verdict bands (keep the
cartogram feature, drop the ladder), unhook the ladder assertions from
verify.py's drift gate (profiles.json gate stays), and append a
correction entry to docs/decisions.md noting the misfiled Phase E5
atlas precompute record. Do not reintroduce clear/cloudy/overcast/
rain/drought/storm/flood in code, artifacts, or docs.

Two more routing items for the session owning docs/devpost.md:
(1) paste the approved E7 sentence verbatim into "Limits we declare
up front": future work: a behavioral score attested on chain could
gate a credit line or automate surplus sweeps; not implemented, and
the underlying model (F3, AUC 0.590) is not strong enough to gate
credit
(2) `npm run typecheck` is red with 12 TS2532/TS2345 errors in
src/lib/atlasData.test.ts (your in-progress file); it blocks the repo
gate and must be fixed before the Devpost draft hard stop.
