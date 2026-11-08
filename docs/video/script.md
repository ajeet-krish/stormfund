# Video Script: Storm Fund 2 Minute Demo (about 256 words spoken)

Read this file as one continuous voice over: every narration line is read
verbatim, in order, over the frame named in the same row. Format follows
`/Users/ajeet/Projects/Hackathons/Meta Global 2026/docs/VIDEO_SCRIPT.md` (one
read aloud script, numbers spoken exactly as printed, intro then demo then
close). Two additions over that reference, both required here: every line is
paired with its time window and its on screen action, and the duration budget
at the end sums to exactly 120.0 seconds.

Hard rules:

* Timeline is exactly 120.0 seconds across six blocks (see Duration budget).
  `scripts/video/assemble.sh` refuses any clip list over 120.000s.
* Every number spoken is also printed on screen, so the video works with sound
  off. Read digits as printed (say `1.5 months` as "one point five months").
* Every number is pinned to the shipped app; the Number verification table at
  the end names the file that asserts each one.
* No em dash, en dash, minus sign, double hyphen, or spaced hyphen in narration
  or in any overlay text. This is the repo content rule enforced by
  `src/dashScan.test.ts`.
* The data is real anonymized bank data (PKDD'99, 4,500 accounts, 1.06M
  transactions). Never say synthetic anywhere in the video.
* Pause about half a second after each line so the frame can be read. If a line
  runs long, cut the words, never the hold.

## Full timed script

A narration line is written once, in the row where it starts. `(line continues)`
and `(line finishes here)` mark the rows it spans, so the reading pace stays
near 150 words per minute and every hold still gets its time.

### 0:00 to 0:15 | Hook: the population finding (31 words)

| Time | On screen | Narration (read verbatim) |
|------|-----------|---------------------------|
| 0:00 to 0:07 | Page loaded at the top, no shock yet, no account selected. Header reads `Resilience Weather Station` with `Tangerine track, Sheridan Datathon 2026` at the right. Atlas headline panel: `1% of accounts have under 3 months of runway at baseline`, subline `60 of 4,500 accounts`, five band cells beneath it. | The finding first: 1% of accounts have under 3 months of runway at baseline. 60 of 4,500. |
| 0:07 to 0:09 | Press key `1` (focus is on the page body; the sticky judge bar shows the `1` keycap labelled `Laid off`). The headline swaps in place to `10% of accounts would have under 3 months of runway under the laid off twist`, the subline becomes `435 of 4,500 accounts` plus `At baseline: 1% (60 of 4,500)`. | Press 1 for laid off: 10% now, 435 of 4,500, baseline still printed underneath. |
| 0:09 to 0:15 | Scroll down through the district cartogram to the strip plot: 4,500 dots, now re colored, sitting on band tinted axis segments. Caption under the plot: `Every dot is one account. Axis segments follow the verdict bands, not equal months.` | (line finishes here) |

### 0:15 to 0:35 | Know the customer (42 words)

| Time | On screen | Narration (read verbatim) |
|------|-----------|---------------------------|
| 0:15 to 0:17 | Press key `r` (judge bar keycap `r`, label `Reset the twist`; the atlas returns to baseline off screen), then keep scrolling down into the console: the `Know the customer` lookup panel. | Now one customer: account 68257, the six judge numbers and the monthly gap, a baseline of 9.8 months in fair skies, with a recorded check sum the page never recomputes. |
| 0:17 to 0:19 | Press `/` (focus jumps to `#account-lookup`), type `68257`, press Enter. Hint reads `One match. Press Enter to open the first.` and the account opens. | (line continues) |
| 0:19 to 0:27 | Baseline card in frame: `Current conditions`, `Account 68257`, `History 2024-04 to 2025-12, 21 monthly rows.` Metric rows: `Typical monthly money in (I)` $6,503.26, `Typical fixed costs (F)` $4,306.72, `Typical monthly spending (S)` $7,160.84, `Savings buffer (B)` $6,437.85, `Household bills (H)` $4,306.72, `Loan payment (P)` $2,844.93, `Monthly gap (spending minus income)` $657.58, `Loan status` C. Compact badge: `Baseline`, `Fair skies`, `9.8 months`, `steady state, 6.0 to 11.9 months`. Five flag chips all off. Provenance line: `Recorded check sum <64 hex characters> from <source>, written by scripts.engine.build. This page shows the recorded value and does not recompute it.` | (line finishes here) |
| 0:27 to 0:32 | Press `/`, type `42988`, Enter, small scroll so the guard chip row sits in frame: `! negative buffer`, `! defaulted loan`. The sticky bar prints the full messages: `Savings buffer is below zero: the baseline already reads 0.0 months of runway` and `Loan in arrears (status D): the account still pays a loan it is behind on.` The baseline badge now reads `0.0 months` in `Critical`. | Swap to 42988 and the guard speaks first: negative buffer, defaulted loan. |
| 0:32 to 0:35 | Press `/`, type `68257`, Enter, scroll back up so the lookup and the two card panels share the frame. The sticky bar reads `No guard flags on this account`. | (hold, no narration) |

### 0:35 to 1:05 | Take a shock (63 words)

| Time | On screen | Narration (read verbatim) |
|------|-----------|---------------------------|
| 0:35 to 0:37 | Click once on the `Take a shock` panel heading. This only moves focus out of the lookup input so single keys fire again. | Now the judge's twist: key 4 is laid off and bills up. Income drops to 55%, bills rise 15%, and the verdict falls from 9.8 to 1.5 months, storm warning. |
| 0:37 to 0:41 | Press key `4` (keycap `4`, label `Laid off and bills up`). The `Laid off and bills up` preset button becomes pressed, the panel header prints the card sentence `They lose their job (EI at 55%) and their household bills go up 15% in the same month.`, and the horizon line reads `Horizon: 6 months, set by the preset.` Sliders read `55% of usual income`, `+15%`, `0.0 months of spending`, `$0.00 a month`. | (line continues) |
| 0:41 to 0:47 | Hero verdict badge under the presets: caption `After the shock`, glyph, `Storm warning`, `1.5 months`, `steady state, 1.0 to 2.9 months`. Before and after table (`Before and after, in dollars`): income $6,503.26 to $3,576.79, spending $7,160.84 to $7,806.85, one off cost $0.00, buffer left $6,437.85, monthly gap $657.58 to $4,230.06. | (line finishes here) |
| 0:47 to 0:58 | Scroll to the `Forecast` panel: `Your buffer, month by month`, `Storm front` tag plus the card sentence. The strip draws: recorded balance line left of the front, band colored month slots fading in one after another, horizon note `Projection horizon: 12 months`. The landfall pin chip prints `1.5 months` on the curve. Under the strip: `Context only: the projection starts from buffer B, the mean of the last 6 recorded balances, not the last recorded balance.` and `Band key, lowest runway first`. | The forecast draws the storm front, and the landfall pin prints 1.5 months, the same figure as the verdict. |
| 0:58 to 1:05 | The EI cliff marker sits over the strip at month 6 with its printed label `Beyond the answer key: EI income stops after month 6`. Hold this frame to the end of the block. | The marker reads beyond the answer key: Employment Insurance income stops after month 6. |

### 1:05 to 1:25 | Make a plan (44 words)

| Time | On screen | Narration (read verbatim) |
|------|-----------|---------------------------|
| 1:05 to 1:07 | Scroll down to the plan card: `Make a plan`, `Goal and backup`. | Make a plan: the cushion goal prints 3 and 6 months of spending as chips. |
| 1:07 to 1:12 | Left block `Goal: build the cushion`: `Starter cushion: $21,482.52 (3 months of typical spending).`, `Monthly deficit: $657.58 (spending exceeds income).`, `A monthly cut of $982.74 for 67 months makes the cushion reachable.` Chip row: `1 month of spending` $7,160.84 / `23 months of new savings`, `2 months of spending` $14,321.68 / `45 months of new savings`, `3 months of spending` $21,482.52 / `67 months of new savings` with the `goal` badge, `6 months of spending` $42,965.04 / `133 months of new savings` with the `stretch` badge. Right block `Backup: if the shock lands` reads `Baseline steady state: 9.8 months. Shocked steady state: 1.5 months (Storm warning).` | (line finishes here) |
| 1:12 to 1:19 | Scroll to `Backup levers, in order`, table caption `Simulated counterfactuals, applied one after another`. First row `Trim discretionary` with caveat `simulated counterfactual: all discretionary spending above the fixed cost floor trimmed`, monthly effect `-$9.19`, `Runway after` `1.5 months`, `Gain` `+0.0 months`. | Levers run in order: trimming discretionary buys nothing here, an honest zero; deferring the loan adds 3.2 months, and the runway climbs to 4.7. Every row says simulated counterfactual. |
| 1:19 to 1:25 | Second row `Defer loan` with caveat `simulated counterfactual: hardship deferral, the payment resumes later and interest cost is not modeled`, monthly effect `-$2,844.93`, `Runway after` `4.7 months`, `Gain` `+3.2 months`. The `How the plan counts` definition strip is visible below the table. | (line finishes here) |

### 1:25 to 1:45 | Robustness and depth (48 words)

These three lines fill the block, so read them at a steady 150 to 160 words per
minute and keep the scrolls short.

| Time | On screen | Narration (read verbatim) |
|------|-----------|---------------------------|
| 1:25 to 1:32 | Scroll so the sticky judge bar fills the lower frame: keycaps `1 Laid off`, `2 Bills up 15%`, `3 Furnace repair`, `4 Laid off and bills up`, `r Reset the twist`, `R Reset everything`, `/ Focus the lookup`, `Escape Dismiss`, `n Random account`, plus the `Rehearsal` and `Judge sheet` controls. Click `Rehearsal`: the dock opens with `Rehearsal step 1 of 5`, the twist card sentence, the operator script line, `Account 68257, card Laid off, target 2000 ms`, and the `Run step` button. | Three things judges asked for: the sticky key bar, a 5 step rehearsal dock, a printable judge sheet. |
| 1:32 to 1:39 | Scroll back up to the baseline card, under the provenance line: the receipt stamp. Badge reads `Anchored on Solana devnet, verified` next to an `explorer` link, then three rows: `findings.json root memo, devnet`, `model_card.json hash, devnet`, `F1 aggregate fingerprint, aggregates only, no raw rows`, each with an 8 character signature prefix and `evidence` and `explorer` links. Note beneath: `Anchored at build time on Solana devnet when the analysis was frozen. This page reads the bundled evidence files only and never writes to chain.` | The verdict card stamps 3 finalized Solana devnet memos from bundled files, zero network calls at runtime. |
| 1:39 to 1:45 | Scroll to the typed row above the preset cards: label `Say the shock`, mode badge reading `preset cards`, placeholder `for example: they lose their job, EI covers half, and the furnace dies next month`, `Read the sky` button, and the four preset cards still rendered below it. | Everything else is offline; the typed sentence is an optional Gemini extra. |

### 1:45 to 2:00 | Close (28 words)

| Time | On screen | Narration (read verbatim) |
|------|-----------|---------------------------|
| 1:45 to 1:48 | Focus check: after the previous block focus sits on the `Rehearsal` button, which is safe for keys. If a retake left focus in the lookup input, click the page header once first. Press key `1` so the twist reads `Laid off` again. | Back to the headline: 10% under the laid off twist, against 1% at baseline. |
| 1:48 to 1:53 | Scroll to the top: header plus atlas headline `10% of accounts would have under 3 months of runway under the laid off twist`, subline `435 of 4,500 accounts` and `At baseline: 1% (60 of 4,500)`. | (line finishes here) |
| 1:53 to 2:00 | Hold this frame, motionless, to 2:00.0. No zoom, no cursor movement. | 4,500 real anonymized accounts, every number reproducible. Resilience Rewired, Tangerine track, Sheridan Datathon 2026. |

## Duration budget

| Block | Window | Duration | Clip file |
|-------|--------|----------|-----------|
| 1 Hook | 0:00 to 0:15 | 15s | `clip_01_hook.mp4` |
| 2 Know the customer | 0:15 to 0:35 | 20s | `clip_02_customer.mp4` |
| 3 Take a shock | 0:35 to 1:05 | 30s | `clip_03_shock.mp4` |
| 4 Make a plan | 1:05 to 1:25 | 20s | `clip_04_plan.mp4` |
| 5 Depth | 1:25 to 1:45 | 20s | `clip_05_depth.mp4` |
| 6 Close | 1:45 to 2:00 | 15s | `clip_06_close.mp4` |
| **Total** | 0:00 to 2:00 | **120.0s** | six clips, alphabetical order equals shot order |

Narration word count by block: 31, 42, 63, 44, 48, 28 = 256 words. At 150
words per minute that is about 102 seconds of speech inside 120 seconds, which
leaves roughly 18 seconds of holds for reading the frames.

Recording targets are the same numbers as the durations above. If the assembled
list lands above 120.000s, shave the overshoot off `clip_06_close.mp4` (a static
hold) and record it again. Never trim a narration line to fix the budget, and
never pass `--allow-trim`.

## Assembly

```bash
npm run build && npm run preview          # capture from the built app at :4173
./scripts/video/record.sh --list-devices  # expect the avfoundation screen input
./scripts/video/test_assemble.sh          # must print ALL TESTS PASSED

./scripts/video/record.sh -d 15 --mic -o scripts/video/captures/clip_01_hook.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_02_customer.mp4
./scripts/video/record.sh -d 30 --mic -o scripts/video/captures/clip_03_shock.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_04_plan.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_05_depth.mp4
./scripts/video/record.sh -d 15 --mic -o scripts/video/captures/clip_06_close.mp4

./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    scripts/video/captures/clip_0*.mp4

ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
    scripts/video/final/demo.mp4
```

`--mic` locks the narration to its clip, so a block can be re recorded on its
own. The fallback path is silent clips plus one separate voice over pass muxed
after assembly; `assemble.sh` does not mix a narration track (see
`scripts/video/README.md`).

## Number verification

| Number or string on screen | Value used | Verified by |
|----------------------------|------------|-------------|
| Atlas baseline headline and count | `1% of accounts have under 3 months of runway at baseline`, `60 of 4,500 accounts` | `src/components/atlas/AtlasSection.test.ts:96` to `99` |
| Atlas laid off headline, count, comparison | `10% ... under the laid off twist`, `435 of 4,500 accounts`, `At baseline: 1% (60 of 4,500)` | `src/components/atlas/AtlasSection.test.ts:132` to `136` |
| Baseline runway and band | 98 tenths = `9.8 months`, `Fair skies` | `scripts/engine/golden_fixtures.json` expected `runway_deci_months` 98; band from `src/lib/verdict.ts` (6.0 to 11.9) |
| Baseline metrics for 68257 | I $6,503.26, F $4,306.72, S $7,160.84, B $6,437.85, H $4,306.72, P $2,844.93, gap $657.58, status C | `scripts/engine/golden_fixtures.json` expected cents; `src/components/console/console.smoke.test.ts:146` to `149` |
| Shocked verdict under combo | `1.5 months`, `Storm warning`, income $3,576.79, spending $7,806.85, gap $4,230.06 | `scripts/engine/golden_plans.json` plans[0] `expected.shocked`; `src/lib/shocks.golden.test.ts:206`; `console.smoke.test.ts:159` to `164` |
| Landfall pin equals the verdict | `1.5 months` on both | `console.smoke.test.ts:166` to `173` |
| EI marker label | `Beyond the answer key: EI income stops after month 6` | `src/lib/forecast.ts:59`; `console.smoke.test.ts:174` |
| Storm front sentence | `They lose their job (EI at 55%) and their household bills go up 15% in the same month.` | `src/lib/shockPresets.ts` combo card; `console.smoke.test.ts:175` |
| Goal cushion and chips | `Starter cushion: $21,482.52`, chips $7,160.84 / $14,321.68 / $21,482.52 / $42,965.04 reached in 23 / 45 / 67 / 133 months | `scripts/engine/golden_plans.json` plans[0] `expected.goal` milestones; `src/lib/planText.ts` |
| Backup lines | `Baseline steady state: 9.8 months. Shocked steady state: 1.5 months (Storm warning).`, runs out before the 6 month horizon | `scripts/engine/golden_plans.json` `expected.backup`; `console.smoke.test.ts:179` to `184` |
| Lever ladder | Trim discretionary `+0.0 months` after `1.5 months`, Defer loan `+3.2 months` after `4.7 months`, effects `-$9.19` and `-$2,844.93` | `scripts/engine/golden_plans.json` plans[0] `expected.ladder` (deci 15, 47, step 32); `src/lib/planMath.golden.test.ts:271` to `274` |
| Guard chips on 42988 | `negative buffer`, `defaulted loan` | `src/lib/judgeMode.ts` `GUARD_LABELS`; `scripts/engine/golden_fixtures.json` flags for 42988 |
| Judge keycaps | `1`, `2`, `3`, `4`, `r`, `R`, `/`, `Escape`, `n` with their labels | `src/lib/judgeMode.ts` `JUDGE_SHORTCUTS` |
| Rehearsal dock | `Rehearsal step 1 of 5`, `target 2000 ms` | `src/lib/rehearsal.ts` (`REHEARSAL_SCRIPT` length 5, `REHEARSAL_TARGET_MS` 2000) |
| Receipts | three rows, `confirmation_status` finalized, `matches_local` true, badge `Anchored on Solana devnet, verified` | `public/data/memo-devnet.json`, `memo-devnet-modelcard.json`, `memo-devnet-fingerprint.json`; `src/data/receipts.ts` labels; `src/components/console/ReceiptStamp.tsx` |
| Typed row badge offline | `preset cards` | `src/components/console/TypedShock.tsx`; `shockMode` stays `preset` without `VITE_GEMINI_KEY` |

## Deviations from the reference template

* The reference (`Meta Global 2026/docs/VIDEO_SCRIPT.md`) groups the script
  into `Intro` and `Demo` sections with a single word count and no time windows.
  This file keeps the read aloud tone, the verbatim rule, and the "say the
  number exactly as printed" habit, but splits every line into time windows
  because the brief requires each line paired with its frame.
* The reference has slides and a face cam. This video is pure screen recording
  of the shipped single page, because the runbook kit
  (`scripts/video/record.sh`) captures the screen only and the product's story
  is the interface changing under a judge's keys.
* `docs/video/script-template.md` and `docs/video/shots.md` described the
  retired Ledger Odyssey findings and orbit game build (question card, F1 to F5
  cards, auto demo, inspector). None of that exists in this app, so those files
  were retired at commit d775a1f instead of rewritten; this file and
  `docs/video/plan.md` are the replacements.
* The old template's "synthetic data said in the first 15 seconds" rule is
  inverted: this entry runs on real anonymized bank data, and the video says so
  in the closing line instead.
