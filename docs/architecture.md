# Financial Resilience Engine Architecture

Last updated: Sat Nov 07 2026 (Phase E1 complete).
Status: E1 profile precompute shipped and verified. E2 console base
next.

## Product

A financial resilience engine for real bank customers, built for the
Tangerine track of the Sheridan Datathon 2026. At judging a judge picks
an `account_id` and a twist card, and the engine runs live in about five
minutes:

1. **Know the customer.** Any account shows typical income I, fixed
   costs F, spending S, savings buffer B, household bills H, loan
   payment P, gap, and months of runway, all from the precomputed
   profile artifact.
2. **Take a shock.** A shock (job loss with EI at 55 percent, bills up
   15 percent, a one-off repair, or a mix) changes income or spending
   and the runway recomputes with the judge's branch rules.
3. **Make a plan.** A goal plan (emergency fund) and a backup plan
   (if the shock lands) built from the same numbers.

The engine is the primary demo surface (full pivot, approved Nov 07
2026). The orbit game and the findings first report framing are dropped
as surfaces; their machinery (F1 structural and discretionary spend, F5
ranked interventions, BalanceRiver canvas, provenance stamps) may be
reused internally inside the engine. Every number a judge sees traces
back to source rows through provenance checksums.

## Hard constraints

- **Judge definitions are the contract.** I, F, S, B, H, P and the
  runway come from docs/tangerine-challenge.md. Any deviation must be
  deliberate, documented in docs/decisions.md, and explainable to a
  judge.
- **Integer cents end to end.** Dollars convert with
  `np.rint(dollars * 100)` once at load; every metric, mean, median and
  runway division afterwards is integer arithmetic with ROUND_HALF_UP
  (ties away from zero). No float may decide a branch.
- **Deterministic offline artifact.** profiles.json carries no
  timestamps, no randomness, and no floats; two consecutive builds are
  byte identical. All data is bundled for an offline booth.
- **Checksummed sources fail loud.** The three canonical CSVs are
  verified against data/tangerine/SHA256SUMS before any row is read.
- **Any account must work.** All 4500 accounts, including the five edge
  flags (pensioner, thin history, zero income, defaulted loan, negative
  buffer), must render without a special case.
- **Content convention:** no em dashes, en dashes, minus signs, double
  hyphens, or spaced hyphens in shipped strings. verify.py scans the
  artifact and exits non zero on a violation.
- **Static hosting only.** GitHub Pages, no server, no runtime network
  calls beyond bundled assets.

## Stack

- Python 3.14 + uv + pandas + numpy for the offline engine pipeline;
  pytest for tests. Modules are header-style, snake_case, type hinted.
- React 19, Vite 6, TypeScript 5.7 strict, Tailwind 3.4, Zustand 5,
  Vitest for the site.
- three 0.170 + @react-three/fiber is legacy from the dropped game
  layer (PlayView); not part of the engine surface.
- GitHub Pages via GitHub Actions, base path aware.
- Entire for graph queries, checkpoints, and the build trail.

## Phases E1 to E7

- **E1 profile precompute (COMPLETE).** scripts/engine loads checksum
  verified CSVs, computes the judge metrics in integer cents, and
  writes public/data/engine/profiles.json (meta plus one profile per
  account). Shipped and verified Nov 07 2026.
- **E2 console base.** Account lookup over 4500 ids, baseline card,
  shock presets plus sliders, verdict, and plan text.
- **E3 weather viz.** Forecast strip, storm front, landfall pin,
  verdict bands, and the EI-cliff overlay.
- **E4 plan engine.** Goal math plus backup levers with +N months
  effects.
- **E5 Storm Atlas.** Population headline plus strip-plot drill-down.
- **E6 judge mode.** Keyboard shortcuts, edge-account guards,
  rehearsal, and paper fallback.
- **E7 Solana A+ touch.** Gated memo package plus honest receipt badge
  in the verdict card.

### Considered enhancements (secondary)

- **Natural language shock input via the Gemini API.** User provided
  idea, secondary to the approved phase list above, and not yet
  scheduled. A judge or user types a phrase like "laid off and rent up
  15%" and it maps to the twist fields incomeFactor, billsDeltaPct,
  and oneOffMonthsOfSpend instead of clicking preset buttons. Risks:
  live API dependency at the booth (network is allowed but must never
  be required, so it must degrade gracefully to the preset buttons);
  parsing must be validated against the twist schema before applying;
  and it belongs after E2 where the shock presets exist.

## Data layer

```
data/tangerine/*.csv (checksums in SHA256SUMS)
    -> scripts/engine/load.py      (verify, integer cent parse, grouping)
    -> scripts/engine/metrics.py   (pure I, F, S, B, H, gap, flags)
    -> scripts/engine/shocks.py    (pure runway function)
    -> scripts/engine/build.py     (meta + profiles, deterministic)
    -> public/data/engine/profiles.json
    -> scripts/engine/verify.py    (naive csv recompute, drift diff, SHA256)
```

- Sources: monthly_summary.csv (185,326 rows), loans.csv (682),
  accounts.csv (4,500), over 2020-01 to 2025-12.
- The artifact: about 4.7 MB compact JSON, 4500 profiles, meta block
  with sources, definitions, checksum recipe, and edge flag counts
  (pensioner 740, thin_history 377, zero_income 14, defaulted_loan 45,
  negative_buffer 23 in the shipped build).
- Loan cross check in the build report: 448 loans running by the status
  rule (C or D), 448 running by schedule (end month past 2025-12), 0
  disagreements.
- Provenance: each profile carries a check_sum over
  `account_id:month` rows and `money_in` cents, recipe in
  pipeline_lib.checksum and mirrored by src/data/checksum.ts.
- Existing site data (world.json, transactions.json, findings.json,
  model_card.json) is unchanged; the engine adds public/data/engine/.

## Verification

- `uv run python -m scripts.engine.build`: checksum gate, build report
  with source sha256 prefixes, edge flag counts (all five must be
  nonzero), loan cross check, artifact size, PASS line.
- `uv run python -m scripts.engine.verify`: independent naive csv
  recomputation of all 4500 accounts with no pandas, no numpy, and no
  import of scripts.engine.metrics; exact field by field diff; dash
  violation scan over every artifact string; prints the artifact SHA256;
  exits non zero on any drift.
- `uv run pytest -q`: golden fixtures asserted against both
  metrics.pipeline and the shipped artifact entry (five real accounts
  covering odd and even medians, the half cent tie, thin history with
  zero income, a running loan, a defaulted loan, and every runway
  branch), schema validation, check_sum recomputation for all accounts,
  determinism (two consecutive builds byte identical and equal to the
  shipped file).
- `scripts/engine/test_metrics.py`: rounding ties, every runway branch
  including buffer_depleted, no_shortfall, cap and deci half ties, thin
  history buffer, flag thresholds.
- Rule drift guard: contract strings in verify.py are duplicated from
  build.py on purpose, so a silent edit to a definition fails
  verification.

## Frontend layering

1. **Data (src/data):** typed loaders with schema validation
   (profiles loader lands in E2), checksum mirror, resolveRows for
   provenance. No math, no React.
2. **Core (src/lib):** pure functions only. The E2 shock math and E4
   plan math live here as TypeScript twins of the Python rules; they
   must never import React and must operate on integer cents.
3. **Views (src/components):** engine console view (E2), weather
   forecast views (E3), Storm Atlas (E5). Views render numbers from
   loaders and core functions; inline money math in a component is a
   review failure. Old report and game views are dropped as surfaces.
4. **Render (src/components/river, scene):** presentation only, swappable
   without touching layers 1 to 3.

Load once, memoize: profiles.json is fetched a single time and parsed
once per session (the same pattern as loadSharedFindingsReport).

## Performance budget

- Artifact: keep profiles.json under 5 MB and a single request; parse
  once, index 4500 account ids for search under 10 ms.
- Shock recalculation: integer arithmetic, under 1 ms per interaction,
  no async hop for a slider move.
- Existing game budget unchanged: 60 fps on integrated GPU, dpr capped
  at 1.5, no shadow maps, Html labels capped near 20 with distance
  culling.
- Everything bundled for offline booths; no runtime network calls
  required (network allowed as a bonus, never a dependency).
