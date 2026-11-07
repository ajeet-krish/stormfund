# Ledger Odyssey Architecture

Last updated: Thu Nov 05 2026 (Phase 1)
Status: Phase 1 in progress (report UI and renderer). Renderer research is
committed: Tier T1 on-rails true 3D with a 2D CRT phosphor fallback, see
docs/research.md.

## Concept

A 3D space travel game over a personal finance ledger (Tangerine transactions:
date, amount, merchant category, account balance). Category planets are sized by
annual spend, subscriptions ride stable orbits, one-time splurges are slingshot
burns, income is fuel depots, and savings are the ship altitude above a debt
horizon. The judge story is "serious analysis wearing a game": every game entity
traces back to source transaction rows.

## Stack

- React 19, Vite 6, TypeScript 5.7 strict, Tailwind 3.4.
- three 0.170 + @react-three/fiber 9 + @react-three/drei 10 (versions from
  zenith-web and Talon reference repos). Renderer verdict from research:
  Tier T1 on-rails true 3D, with the 2D CRT phosphor view as fallback
  (docs/research.md).
- Zustand 5 for state, Vitest for tests.
- Python 3.14 + uv + pandas for the offline data pipeline (pinned, seeded).
- GitHub Pages via GitHub Actions (copy Talon deploy.yml, base path aware).
- No router, no WASM, no runtime network calls. Booth machine is
  self-provided, so WebGL2 is under our control.

## Layering (load bearing)

1. Data: scripts/build_world.py turns CSV into public/data/world.json and
   public/data/transactions.json (compact row table with row ids).
2. Core: src/game holds GameCommand, GameState, and a pure reduce(state, cmd,
   world) function. It must never import three or react-three. Input adapters
   (keyboard, pointer) and the auto-demo player all emit commands into reduce.
3. Binding: src/data/worldToScene.ts maps World to deterministic scene layout
   (seeded angles, radii) and the balance series to ship altitude.
4. Render: src/components/scene renders layout + GameState via R3F. A 2.5D
   Canvas renderer can replace it without touching layers 1 to 3.

## Data Flow

tangerine.csv -> build_world.py -> world.json + transactions.json
  -> typed load (src/data/world.ts)
  -> layoutWorld (pure) -> Zustand store -> R3F scene + HUD
  -> Inspector resolvesRows(provenance) -> transactions.json (traceability)

## Traceability

Every entity (Category, Subscription, Splurge, IncomeEvent) carries a
Provenance { rowIds, filter, agg, checkSum }. The Inspector resolves row ids
against transactions.json, shows a mini ledger (a few rows + count + sum), and
verifies the checksum live. This is the honesty anchor of the project.

## Controls

Two keys plus click: Tab cycles focus, Space engages transfer, mouse click on a
planet selects and engages. Auto-demo starts after 45 s idle or a key toggle,
replays DEMO_SCRIPT (timed commands with captions) through the same reduce, and
any input exits to manual. AutoDemoBadge makes the mode visible.

## Gameplay (approved direction: true 3D)

User wants true 3D gameplay: inclined orbit transfers and vis-viva delta-v that
matter to strategy, not just presentation. Research closed Nov 04 2026: Tier
T1 on-rails true 3D is feasible inside the window, with the 2D vector CRT
phosphor view as the committed fallback (docs/research.md). Core gameplay
must stay in the pure reducer so the renderer remains swappable.

## Analysis Layer (added Nov 04 2026, findings-first hybrid)

The site leads with a findings report; the game is the exploration layer.
Layering addition, renderer-agnostic:

5. Analysis: scripts/analysis/ (Python, uv, seeded) computes findings F1 to F5
   from world.json and transactions.json:
   - F1 structural vs discretionary share (lag autocorrelation at 28 to 35 day
     lags per category, recurrence detector output).
   - F2 seasonality decomposition per category (calendar heatmap data, weekly
     and annual periodicity).
   - F3 deficit-day risk: logistic regression with train/test split, AUC, top
     coefficients, emitted as a model card (intended use and limitations).
   - F4 plane-change cost: counterfactual simulation, peak drawdown delta when
     discretionary spend shifts between pay-cycle phases. The game transfer
     option card and the report waterfall read from the SAME module.
   - F5 ranked interventions (consolidate subscriptions, remove top surge
     category, realign category to income phase).
   Each finding emits: numbers, method, limitations, and chart-twin data for
   the report page.
6. Report: a findings view in the React app (landing route) with hand-rolled
   SVG chart twins, honesty badges, and an "explore in game" deep link that
   jumps to the game with the finding selected. Every game-visible number
   exists first in the report. If the report were deleted, the entry must
   still compete.

Traceability and provenance from the Inspector are reused as the Data Use
judging artifact: row counts, checksums, cleaning steps, limitations.

## Performance Budget

Target 60 fps on integrated GPU. dpr capped at 1.5, no shadow maps, no
postprocessing by default, Html labels capped near 20 with distance culling,
all data bundled in the repo for offline booths.

## Fallback

If by event hour 6 there is no flying ship over the rendered galaxy, swap the
renderer layer for a 2D Canvas view (vector CRT phosphor with blueprint HUD,
the researched fallback in docs/research.md). Core, data, and traceability
layers are unchanged.
