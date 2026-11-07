# Sheridan Datathon 2026 Test Results

Last updated: Nov 05 2026

## Nov 05 2026 - Phase 0: Zero Byte CSV Fix Re-run

Re-run of every suite after the zero byte CSV fix landed: both
`scripts/build_world.py` and `scripts.build_players.py` now route
`pd.errors.EmptyDataError` and `OSError` from the CSV read through
`fail()`, so an empty file exits 1 with a friendly one liner instead of
a raw pandas traceback. A mirror test for build_players
(`test_players_zero_byte_csv_fails_cleanly`) was added with the fix, so
pytest is now 41 tests.

### Suite results

| Suite | Command | Verdict | Notes |
|-------|---------|---------|-------|
| Web build | `npm run build` | PASS | tsc build config plus vite, 47 modules, 508 ms |
| Typecheck | `npm run typecheck` | PASS | strict `tsc --noEmit`, clean |
| Vitest | `npx vitest run` | PASS | 106 tests in 13 files, all pass |
| Python sync | `uv sync` | PASS | 17 packages resolved, lockfile honored |
| Pytest | `uv run pytest` | PASS | 41 of 41, was 39 of 40 with the one zero byte failure |
| Verify findings | `uv run python -m scripts.analysis.verify_findings` | PASS | 6 of 6 checks |
| build_world | `uv run python -m scripts.build_world` | PASS | 46 of 46 provenance checksums |
| build_players | `uv run python -m scripts.build_players` | PASS | 1200 of 1200 provenance checksums |

### Fix verification (manual zero byte run)

An empty CSV written inside the repository root and passed to
`uv run python -m scripts.build_world --input <csv> --out-dir <dir>`
exits with code 1 and prints exactly one line on stderr:

`error: <path>: No columns to parse (empty or comment-only CSV)`

No traceback, no pandas frames, and no output directory was created
(the failure happens before any write). The identical run through
`scripts.build_players.py` behaves the same: exit 1, friendly one
liner, zero traceback markers.

### Coverage and status

- Pytest: 41 tests, 41 pass, 0 fail. The former product bug
  (`test_world_zero_byte_csv_fails_cleanly`) is now green, and the
  build_players mirror test covers the same guard on the second
  builder.
- Vitest: 106 tests in 13 files, unchanged and all pass.
- No open product bugs remain from the Phase 0 pass.

## Nov 05 2026 - Phase 0: Test Report

Full test pass over the Phase 0 build with the review and security fix
cycle in the working tree. 43 new tests were written for the gaps below;
every prior test was left untouched and still passes.

### Suite results

| Suite | Command | Verdict | Notes |
|-------|---------|---------|-------|
| Web build | `npm run build` | PASS | tsc build config plus vite, 47 modules, 522 ms |
| Typecheck | `npm run typecheck` | PASS | strict `tsc --noEmit` including all test files |
| Vitest | `npx vitest run` | PASS | 106 tests in 13 files (75 prior plus 31 new) |
| Python sync | `uv sync` | PASS | 17 packages resolved, lockfile honored |
| Pytest | `uv run pytest` | PASS (41 of 41) | the zero byte CSV failure recorded below was fixed and re-verified in the re-run entry above; the build_players mirror test was added with the fix |
| Verify findings | `uv run python -m scripts.analysis.verify_findings` | PASS | 6 of 6 checks, artifacts byte stable after rebuilds |
| build_world | `uv run python -m scripts.build_world` | PASS | 46 of 46 provenance checksums, writes world.json and transactions.json |
| build_players | `uv run python -m scripts.build_players` | PASS | 1200 of 1200 provenance checksums |

### Manual sanity pass

`npm run preview` served the built app: index, findings.json, world.json,
and transactions.json all returned HTTP 200 with the expected sizes. A
temporary end to end test then fetched findings.json over HTTP, parsed it
through `parseFindingsSummary`, rendered the five line landing summary
with `FindingsSummaryBody` (all F1 to F5 ids, headlines, and the
SYNTHETIC DATA badge present), and replayed the auto demo command stream
against the live world.json and transactions.json through `reduce` to a
`yearComplete` state with the final caption (2 of 2 PASS). That test was
deleted after the run; the committed smoke tests keep equivalent
coverage.

No headless browser is installed in this environment, so a real click
through of the PLAY button and the 45 second idle auto demo start was
not automated. Those paths rest on `src/app.smoke.test.ts` (SSR shell and
play view) and the deterministic DEMO_SCRIPT replay in
`src/game/reduce.test.ts`.

### New tests added (43)

| File | Tests | What they cover |
|------|-------|-----------------|
| `src/game/reduce.edge.test.ts` | 7 | transfer arriving exactly on the closing close completes in the report; a transfer arriving after month 12 stays pending at yearComplete with transfersCompleted 0; loss exactly AT the debt horizon on the closing close (equality loses, horizon plus one cent completes the year); sequential burns against a shrinking fuel budget (accept, reject by identity, accept, reject); unknown selectEntity and rejected engageTransfer still exit auto demo and freeze the clock |
| `src/game/orbit.edge.test.ts` | 9 | zero, negative, NaN, and infinite radii rejected by visViva, circularSpeed, orbitalPeriod, meanMotion, hohmannDeltaV, hohmannTransferTime; bad mu; plane change rejects negative or non finite speeds and inclinations; phaseWaitTime rejects non finite mean motions; plane change at 180 degrees costs exactly 2v (pure) and v1 plus v2 (combined); combined 0 degrees between equal speeds costs 0; Hohmann with equal radii costs nothing and takes half the circular period |
| `src/data/resolveRows.edge.test.ts` | 5 | well formed but wrong 64 hex digest reports checksumOk false without throwing and still resolves rows; truncated garbage digest reports failure; empty rowIds verify against the empty digest; empty rowIds vouched by a non empty digest fail; rowIds that all miss resolve to an empty broken set with missingIds reported |
| `src/data/findings.edge.test.ts` | 10 | rejection matrix over the shipped findings.json: non object roots (null, array, string, number), missing or mistyped meta and syntheticNotice, missing or mistyped sections, missing or mistyped questions, missing or array headline block, NaN, Infinity, and string headline numbers across all seven guarded fields, empty or mistyped headline strings, empty or mixed structuralCategories arrays, NaN and missing values inside section numbers |
| `scripts/analysis/test_boundaries.py` | 9 | F1 eligibility boundary at exactly MIN_DEBIT_ROWS (20 eligible, 19 not tested); F1 peak equal to threshold classifies discretionary (strict greater than rule, collaborator stubbed to force float equality); F1 peak one float step above classifies structural; F1 threshold falls back to the white noise band when the control band is lower; F4 category with zero debit rows (Income, credits only) reports all zero deltas and defaults classification to discretionary; F4 category whose rows all sit in the income window has zero aligned deltas while anti aligned still moves them; F4 headline numbers present and integral; aligned_dates_for_mask phase 6 stays and phase 7 moves boundary, phase 25 target arithmetic, NaT next payday never moves, empty mask leaves dates untouched; anti_dates_for_mask moves only masked rows with a next payday |
| `scripts/test_build_validation.py` | 3 | header only CSV fails cleanly with "no data rows"; CSV missing account_balance fails cleanly naming the column; zero byte CSV fails cleanly (this test originally exposed the product bug below, now fixed and passing; a fourth build_players zero byte mirror test was added with the fix) |

### Failure analysis

The single open failure from the original run,
`scripts/test_build_validation.py::test_world_zero_byte_csv_fails_cleanly`
(a zero byte CSV raising a raw pandas `EmptyDataError` traceback that
escaped `fail()`), was fixed in `build_world.py` and the same gap in
`build_players.py`, then re-verified on Nov 05 2026 (see the re-run
entry above). No other product or test failures were open after that
pass.

Test bugs found and fixed in this pass (all in the tester's own new
tests, not product issues): (1) an anti aligned trough delta assertion
used a wrong hand computation, the synthetic ledger's monotone path keeps
the trough at the conserved final balance, so the assertion now checks
that monthly closes move instead; (2) two empty mask assertions compared
against the modified series instead of the original input; (3) one
findings parser expectation added a `findings.` prefix the
`numbersOf` guard never emits. After those fixes every pre existing
test and every other new test passes.

No product bugs were found in the reducer, orbit math, resolveRows, or
the findings parser. Every documented boundary behaved as specified:
loss precedence over yearComplete on the closing month, auto demo exit
on rejected manual input, strict greater than threshold in F1, and
verification failure without throwing on a corrupted checksum.

### Coverage summary

- Vitest: 106 tests, 13 files, all pass. Happy path, edge cases, and
  error conditions covered for the pure game core, orbit closed forms,
  data loaders, checksums, resolveRows, findings parser, and the
  findings view stopgap.
- Pytest: 41 tests, all pass (39 of 40 at the time of the original run,
  with the one zero byte CSV product bug since fixed). F1 to F5
  artifact equality, verification checks, builder validation guards
  (NaN, inf, range, containment, size, and empty or missing column
  CSV shapes including zero byte files for both builders), and
  unit level classifier and counterfactual boundaries.
- Not covered anywhere: real browser interaction, renderer (still the
  pending scene summary), performance budget, and the GitHub Pages
  deploy workflow.

### Gaps the Saturday hackathon window should still test

- Browser level end to end: PLAY button click through, 45 second idle
  auto demo start, keyboard Tab and Space input adapters, pointer
  selection, and the Inspector click to expand provenance rows. No
  headless browser exists in this environment; install Playwright or
  drive a real browser at the booth rehearsal.
- Renderer once Tier T1 lands: WebGL2 frame output, the 2D CRT
  phosphor fallback, 60 fps budget, dpr cap 1.5, and label culling near
  20 entities.
- F3 beyond artifact equality: model card rendering, AUC drift when the
  mock ledger is regenerated with a different seed, and the disclosed
  split rule behavior.
- Full report UI when it is approved: chart twins, honesty badges, and
  explore in game deep link, plus sharing the F4 counterfactual module
  between report and game as promised in docs/decisions.md.
- CI and deploy: run the web and python jobs in .github/workflows/ci.yml
  on a clean clone, and verify the Pages deploy with base path aware
  assets.
- Data regeneration flow: change the mock generator seed, rerun
  build_world, build_findings, verify_findings, and confirm the report
  regenerates with derived narrative sentences.
