# Financial Resilience Engine Architecture

Last updated: Sun Nov 08 2026 (phases E1 to E7 all complete).
Status: E1 profile precompute, E2 console base, E3 weather viz, E4 plan
engine, E5 Storm Atlas, E6 judge mode, and E7 Solana receipt touch all
shipped, reviewed PASS, and committed. The district cartogram and rain
gauge shipped as an E5 extension on the five verdict bands.

## Product

A financial resilience engine for real bank customers, built for the
Tangerine track of the Sheridan Datathon 2026. At judging a judge picks
an `account_id` and a twist card, and the engine runs live in about five
minutes: know the customer (I, F, S, B, H, P, gap, runway from the
precomputed profile artifact), take a shock (job loss with EI at 55
percent, bills up, one-off repair, or a mix), make a plan (goal plan
plus backup levers). The one minute pitch opens with the Storm Atlas:
the runway distribution across all 4,500 accounts, then one click drills
into any account for the live twist. The engine is the primary demo
surface (full pivot, approved Nov 07 2026); the orbit game and
findings first report are dropped as surfaces, and their machinery is
reused internally.

## Hard constraints

- Judge definitions are the contract (docs/tangerine-challenge.md).
- Integer cents end to end, ROUND_HALF_UP, no float decides a branch.
- Deterministic offline artifact: profiles.json is byte identical across
  builds and carries no timestamps or randomness.
- Checksummed sources fail loud (data/tangerine/SHA256SUMS).
- Any of the 4500 accounts must work, including the five edge flags.
- One weather vocabulary: src/lib/verdict.ts owns the five bands
  (critical, storm warning, watch, fair skies, clear) over integer deci
  months (10, 30, 60, 120). The seven state ladder was deleted in E5
  and must not be reintroduced (AGENTS.md coordination note, user
  decision Nov 08).
- Honest sentences: scenario wording derives from the same Twist object
  the math ran (stormAtlas.shockedAtlasScenario).
- Content convention: no em dashes, en dashes, minus signs, double
  hyphens, or spaced hyphens in shipped strings. verify.py scans the
  artifact and dashScan.test.ts scans the site strings.
- Static hosting only. Network allowed as a bonus, never a dependency.
  The Gemini typed shock path is the only network code and degrades to
  preset cards under a 3 second timeout.
- Solana scope lock: memo anchor only. No wallet UI, no Anchor, no
  tokens, no runtime RPC (docs/decisions.md Nov 06 LOCKED).

## Stack

- Python 3.14 + uv + pandas + numpy for the offline engine pipeline;
  pytest for tests. Modules are header style, snake_case, type hinted.
- React 19, Vite 6, TypeScript 5.7 strict, Tailwind 3.4, Zustand 5,
  Vitest for the site.
- GitHub Pages via GitHub Actions, base path aware.
- Entire for graph queries, checkpoints, and the build trail.

## Phases E1 to E7 (all complete)

- E1 profile precompute: scripts/engine writes
  public/data/engine/profiles.json (meta plus 4500 profiles), verified
  by naive recompute, five golden fixtures, deterministic builds.
- E2 console base: account lookup, baseline card, shock presets plus
  sliders, verdict badge, plan text; consoleStore with the key map
  delegated to JUDGE_SHORTCUTS.
- E3 weather viz: forecast projection (src/lib/forecast.ts), storm
  front, landfall pin agreeing exactly with the headline runway,
  verdict band colors, EI cliff overlay labeled beyond the answer key.
- E4 plan engine: goal math (3x starter, 6x stretch chips, definition
  strip) plus the ordered lever ladder (shop_insurance,
  trim_discretionary, defer_loan), every +N months a difference of two
  shocks.runway re-runs, goldens in scripts/engine/golden_plans.json
  asserted by both vitest and pytest (test side Python twin in
  scripts/engine/plans.py).
- E5 Storm Atlas: population headline quoting accounts under 3.0 months
  of runway (1 percent baseline, 10 percent under the laid off twist),
  strip plot with one dot per account on a band aligned axis, drill
  down via selectAccount, bank wide scenario mode; weatherState.ts
  deleted in the fold. Extension (concurrent session): district storm
  cartogram and population rain gauge, public/data/engine/atlas.json
  precomputed on the five verdict bands by scripts/engine/atlas.py.
- E6 judge mode: one authoritative JUDGE_SHORTCUTS table (1 to 4, r,
  Shift + R, slash, Esc layered dismiss, N safe random account), edge
  guards reading E1 flags (inform, never gate), five step rehearsal
  dock over golden fixture accounts, public/judge-sheet.html printable
  fallback linked from the runbook.
- E7 Solana touch: three build time devnet memos (findings.json root
  5YPxwK9, model_card.json hash 3BJiraS5, F1 aggregate fingerprint
  Q7evLcRb, aggregates only) bundled under public/data/, surfaced by
  ReceiptStamp in BaselineCard reading bundled evidence via
  import.meta.glob (zero runtime network); ReceiptBadge wording pinned
  to docs/solana.md; digest honesty tests recompute artifact SHA256s.

## Data layer

```
data/tangerine/*.csv (checksums in SHA256SUMS)
    -> scripts/engine/load.py      (verify, integer cent parse, grouping)
    -> scripts/engine/metrics.py   (pure I, F, S, B, H, gap, flags)
    -> scripts/engine/shocks.py    (pure runway function, scale_cents)
    -> scripts/engine/build.py     (meta + profiles + atlas, deterministic)
    -> public/data/engine/profiles.json  (4500 profiles, about 4.7 MB)
    -> public/data/engine/atlas.json      (district precompute, five bands)
    -> scripts/engine/verify.py    (naive csv recompute, drift diff, SHA256)
```

- Sources: monthly_summary.csv (185,326 rows), loans.csv (682),
  accounts.csv (4,500), districts.csv, over 2020-01 to 2025-12.
- Provenance: each profile carries a check_sum over account_id:month
  rows and money_in cents, recipe in pipeline_lib.checksum mirrored by
  src/data/checksum.ts; the receipt stamp says recorded, never
  reverified in the browser.

## Solana receipt layer (E7)

Evidence flow: frozen artifact -> scripts/solana/send_memo.py (devnet
memo tx, genesis guard, read back verified) ->
scripts/solana/evidence/memo-devnet*.json -> copied to public/data/ ->
src/data/receipts.ts (import.meta.glob eager, hand guards) ->
ReceiptStamp (console/) -> mounted once in BaselineCard under the
provenance line. Zero runtime RPC: the badge reads bundled JSON
statically; links (bundled evidence file, Solana explorer) are plain
anchors only. Gate conditions, cap, cut order, and the skip silently
rule live in docs/ideas-tangerine-solana.md plus the Phase E7 decisions
record. The future work sentence is in docs/devpost.md "Limits we
declare up front".

## Judge mode (E6)

One authoritative keyboard table (JUDGE_SHORTCUTS in
src/lib/judgeMode.ts) drives the bar, the tests, and the printable
judge sheet: 1 to 4 apply the twist presets, r resets the twist,
Shift + R resets everything, slash focuses the account lookup, Esc
dismisses layer by layer (typed gate, then query, then the whole
console), N opens a pseudo random safe demo account. A window level
adapter (src/components/judge/useJudgeShortcuts.ts) owns the DOM facts
(text entry focus, typed gate open, key repeat) and fires exactly one
existing consoleStore action per keystroke; all rules stay pure and
unit tested in src/lib.

Edge guards read the E1 profile flags plus two numeric rules (no
running loan, zero household bills) and one contextual rule (pensioner
under a live layoff twist): they inform the operator in the judge bar
and the judges as chips near the verdict, and they never block an
account selection. Rehearsal is a timed five step dry run over the
golden fixture accounts (src/lib/rehearsal.ts, RehearsalDock), and
public/judge-sheet.html is the one page printable fallback (formula,
verdict bands, worked example from fixture 68257, twist arithmetic,
guards, keys) linked from the competition day runbook.

## Frontend layering

1. Data (src/data): typed loaders with schema validation, checksum
   mirror, receipts registry. No math, no React.
2. Core (src/lib): pure functions only (shocks, verdict, planMath,
   planText, forecast, stormAtlas, atlasPlot, judgeMode, rehearsal).
   Integer cents, never React.
3. Views (src/components): console, weather, atlas, judge. One
   derivation pass in ConsoleView; inline money math in a component is
   a review failure.
4. Render: presentation only.

Load once, memoize: profiles.json is fetched a single time and parsed
once per session. App mounts the Atlas section above the console
(id="atlas", id="console") and the JudgeBar as a sticky bottom bar.

## Verification

- uv run python -m scripts.engine.build and -m scripts.engine.verify
  (independent naive recompute, dash scan, artifact SHA256, exit non
  zero on drift; profiles.json sha256 9ec428bf1a78b35703aa3d36311d4ee0
  61eac7fbd1176cfcbf111acc5c40a858).
- uv run pytest -q: golden fixtures, plan goldens, atlas conservation,
  schema, check_sum recomputation, determinism.
- npx vitest run: loader guards, shock/plan/forecast twins over shared
  goldens, 4500 profile cross checks, atlas conservation, headline
  honesty, receipt wording and digest honesty, judge key matrix, dash
  scan (589 tests at last run).
- Rule drift guard: verify.py duplicates contract strings on purpose.

## Performance and offline

profiles.json under 5 MB, one fetch, parsed once; shock math under 1 ms
per account; the atlas population pass about 2 ms per twist change in
one useMemo. Everything bundled for offline booths; network allowed as
a bonus, never a dependency (Gemini typed input is the sole exception
with a 3 second abort to preset cards).
