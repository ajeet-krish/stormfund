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

## Gemini shock input (gated add-on, post E2)

This section settles the natural language shock input listed under
Considered enhancements above and supersedes its placeholder field
names. It is a gated add-on, not a phase: it ranks with the Solana and
Entire secondary tracks, is funded only from slack, and starts only
after E2 console base is green. Hard abort at 00:30 Saturday: if it is
not live on the deployed origin by then, the Best Use of Gemini API
track checkbox stays unchecked at the Devpost draft and the preset
twist cards carry the demo. It must never touch the findings freeze
(Saturday 6:00 PM) or the code freeze (Sunday 9:00 AM).

### Purpose and prize lane

A judge or presenter types a shock sentence in their own words (for
example "they lose their job, EI covers half, and the furnace dies
next month") instead of picking a preset twist card. Gemini maps it to
structured shock parameters that feed the same runway formula the
presets feed. Best Use of Gemini API is an active MLH prize category
for this event (prize: MLH Swag Kit), so this is a fifth prize lane
alongside Tangerine, Entire, Solana, and GoDaddy.

### Request shape

- Plain fetch to
  https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
  with the x-goog-api-key header. No SDK: the newer JS client sends an
  Api-Revision header that fails CORS preflight with 403.
- Model gemini-3.5-flash-lite or 3.6-flash with thinkingLevel minimal
  and store false. store true adds about 2.7 seconds; 3.8 Flash
  thinking can take 10 to 25 seconds.
- Structured output: responseMimeType application/json with a strict
  responseSchema, all fields required, additionalProperties false. The
  schema returns intent (enum job_loss, bills_up, one_off_cost, mixed,
  no_shock), incomeFactor (number 0 to 1), billsPct (number 0 to 1),
  oneOffMonths (number 0 to 12), durationMonths (integer 0 to 120,
  display only), confidence (enum high, medium, low), and summary
  (string, at most 90 characters).
- Prompt payload (user decision, recorded honestly): the request
  carries the twist sentence, the account_id string, and the account's
  six judge baseline metrics as plain numbers (I, F, S, B, H, P and
  baseline runway). It does not carry raw rows, transaction history, or
  any other customer data. The competition privacy rule is respected
  at the row level; the account identifier and aggregate metrics do
  leave the browser, which the user explicitly approved on Nov 07
  2026.

### Shared ShockSpec

Exactly three math fields (incomeFactor, billsPct, oneOffMonths) plus
display only durationMonths. They map one to one onto the judge
formula: income_after = incomeFactor x I, spending_after = S + billsPct
x H, one_off_costs = oneOffMonths x S. Preset twist cards produce the
same ShockSpec, so one consumer handles both the typed path and the
preset path.

### Validation before state change

TypeScript validation runs before any state change:

1. JSON.parse in try/catch, then a hand written type guard (no zod; the
   repo uses pure functions plus vitest).
2. Percent detection: if a value is greater than 1 and at most 100,
   divide by 100 and flag autoCorrected.
3. Clamping to the schema ranges, flagged when clamped.
4. Rounding for display: incomeFactor 2 dp, billsPct 2 dp, oneOffMonths
   1 dp.
5. Reject to fallback when intent is no_shock, confidence is low, or
   every field sits at its neutral value (1, 0, 0).

### Confirmation before apply

Nothing writes to app state until the presenter confirms the parsed
chips with one explicit click or Enter. The chips show each parameter
with a one click stepper for correction, plus a formula strip showing
income and spending in dollars so the presenter can verify against the
judge's hand calculation. The runway number does not exist until
confirmation. This is mandatory, not polish: a misparse visible to a
judge computing by hand is the worst failure mode.

### Failure mode and timeout

- Timeout is AbortSignal.timeout(3000), a hard 3 seconds, then
  automatic fallback to preset cards.
- Preset twist cards are always rendered and always clickable. A mode
  badge next to the input reads "typed shock Gemini" or "preset
  cards".
- On 429, 403, abort, or network error: no retry on 429, an inline
  note reads "Gemini unavailable, using preset cards", the storm
  animation continues into the preset apply, and total delay stays
  under 3 seconds. The mode badge keeps showing the origin of the
  shock that is currently applied (user decision Nov 07 2026): a
  later failed parse does not relabel an applied Gemini shock as
  preset. The note alone reports the failed attempt.
- A hash cache makes repeated identical sentences free.

### Key management

The key is already created with $25 of credits on the paid tier, so
free tier quota limits do not apply and content is not used for
product improvement under paid terms. It is stored as
import.meta.env.VITE_GEMINI_KEY, inlined into the bundle as expected
for a static site, never in a file under public/, and never printed in
the UI. HTTP referrer restriction is recommended: github.io, localhost,
and the final custom domain. Delete the key after Sunday submission.

### UX timing budget (3 minute live twist)

The input row sits directly above the preset twist cards, labeled "Say
the shock". The storm front rolling in is the loading state (no
spinner, label "reading the sky"). Target latency is about 1 second,
hard cap 3 seconds. Stretch after P0 ships: the judge speaks the shock
via the browser Web Speech API at no extra API cost.

### Effort and testing

- Core effort 5.5 to 7.5 hours: parser module 1.5 to 2, UI input row
  and chips 2 to 2.5, loading state 0.5 to 1, tests 1, key setup and
  smoke test 0.5 to 1. Stretch mic input adds 1 to 1.5 hours.
- Testing: vitest for the clamp table, percent detection, fallback on
  429 and abort, and the chip correction path, with mocked fetch. Log
  every response (sentence hash, latency ms, raw JSON, clamped JSON)
  to console.info so the write-up can quote a measured p50.

### Fit with hard constraints

This is the "network allowed as a bonus, never a dependency" pattern
made concrete: the console is fully usable offline with preset cards,
and the typed path is the only code that touches the network. The
Gemini path reuses the E2 shock math unchanged, so the judge
definitions contract and the integer cents rule are untouched, and a
misparse can never reach state without the confirmation step.

### Implementation layout

- Files: src/lib/shockParse.ts with shockParse.test.ts and
  shockParse.dash.test.ts; src/components/console/TypedShock.tsx and
  ShockChips.tsx with typedShock.smoke.test.ts; the consoleStore typed
  slice with consoleStore.typed.test.ts; the cp- block in src/index.css;
  and .env.example plus the .env rules appended to .gitignore.
- Typed boundary: parseShockSentence returns one union (ok, rejected,
  timeout) and shockSpecToTwist converts the confirmed spec, so the
  preset path and the typed path converge on one Twist consumer and one
  runway formula.
- Confirmation model: pendingShock never writes twist, so the runway
  cannot move until confirmTypedShock runs; the chips step through
  applySpecStep, the formula strip shows income and spending in
  dollars, and the confirm button is auto focused.
- Failure model: each reject reason maps to one fallback note, the
  mode badge always shows the origin of the applied shock rather than
  flipping on a failed parse (user decision Nov 07 2026), and the
  sentence hash cache is namespaced by account id because a one off
  cost converts through that account's spending.
