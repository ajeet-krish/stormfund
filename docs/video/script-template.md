# Ledger Odyssey: 2 minute demo video script (template)

Structure source: the findings-first hybrid decision in `docs/decisions.md`
(findings lead, the game is the exploration layer) and the video guidance in
`docs/research.md` (front load the finding in the first 30 seconds, then the
game, then the charts; story clear in the first minute for Communication 25).
Beat layout matches the approved 2:00 outline.

Hard rules:

* Total runtime at most 120.000 seconds. `scripts/video/assemble.sh` enforces
  it before encoding, so the beat times below are targets, not entitlements.
  Record to the budget in `docs/video/shots.md` (112s of footage, 8s slack).
* Every headline number on screen must match `public/data/findings.json`
  exactly. The strings in the "On-screen copy" columns below are the rendered
  headlines from `src/data/findings.ts`, safe to paste.
* The video must work with sound off: on-screen copy carries every number.
  Narration is optional (pre-generated files are the interim plan per
  `docs/decisions.md`, ElevenLabs credits unconfirmed).
* Synthetic data is said out loud in the first 15 seconds, never buried.

Status legend: **READY** = recordable today, **PENDING** = waiting on a build
(frontend agents own `src/`), **PLACEHOLDER** = copy or URL to confirm.

---

## 0:00 to 0:15 | Question card, dataset flash, methods sentence

| Field | Content |
|-------|---------|
| Visual | Dark title card, the question types on line by line. Then a fast flash of the CSV header and row counter (2 seconds), then one methods sentence. |
| On-screen copy, line 1 | `Q: Of one year of Tangerine style transactions, how much spending is locked by the calendar rather than by choice, when does the balance actually run out, and what would it cost to move spending onto the payday cycle?` |
| On-screen copy, line 2 (dataset flash) | `data/mock/tangerine_transactions.csv \| 5,702 rows \| 2025-11-01 to 2026-10-31 \| seed 20261107 \| SYNTHETIC, no real bank data` |
| On-screen copy, line 3 (methods) | `One pipeline: build_world stamps per-row provenance, five analyses F1 to F5, then verify_findings recomputes every published number.` |
| Voice-over (optional) | Same three lines, read fast, about 40 words. |
| Capture source | Title card from an editor or a static HTML page. The CSV flash can be a 2 second screen capture of the mock file header in an editor. |
| Status | **PLACEHOLDER**: no title card exists in `src/` yet. Cheapest path: one editor title card with the three lines above. The methods sentence and dataset facts are **READY** (`docs/findings.md`, `public/data/findings.json` meta). |

## 0:15 to 0:45 | F1 and F2, chart twins animated

| Field | Content |
|-------|---------|
| Visual | Findings landing page, F1 card then F2 card, each with its chart twin animating in: F1 bar chart of annual spend per category with Subscriptions and Utilities marked structural; F2 grouped bars of holiday lift per category with Retail highlighted. |
| On-screen copy, F1 headline | `5.08% of annual spend is structural (Subscriptions, Utilities)` |
| On-screen copy, F1 caption | `Only $4,268.38 of $83,994.93 annual spend survives the recurrence test: the problem is behavioral, not structural.` |
| On-screen copy, F2 headline | `Retail holiday lift 1.80x (strongest calendar category)` |
| On-screen copy, F2 caption | `Retail and Travel are calendar driven; Groceries is behavioral; Dining and Transit are mixed.` |
| Voice-over (optional) | "Only five percent of the year is locked by the calendar. The calendar still owns Retail: one point eight times its holiday share." |
| Capture source | `src/components/FindingsView.tsx` for the cards (loads `public/data/findings.json`), chart twins from the full report page. |
| Status | Card numbers **READY** today (the stopgap summary shows exactly these headline strings). Chart twin animation **PENDING** (full report UI, frontend agent, per `docs/decisions.md` Phase 1). |

## 0:45 to 0:55 | F3 forecast and model card line

| Field | Content |
|-------|---------|
| Visual | F3 card, then a one-line model card strip. Hold steady, this beat is 10 seconds of reading time. |
| On-screen copy, headline | `test AUC 0.590 (time ordered split 2026-02-01)` |
| On-screen copy, caption | `Night-before features only, 86 deficit days: accuracy 62.6% against an 86.1% majority baseline, train AUC 0.957 flags drift.` |
| On-screen copy, model card line | `Model card: intended use, drift limitation, fairness caveats, correlation not causation. public/data/model_card.json` |
| Voice-over (optional) | "Can the ledger see a deficit day coming? Weakly: zero point five nine AUC, honestly reported with a model card." |
| Capture source | F3 card from `FindingsView.tsx`; model card line from the report panel (**PENDING**) or a text strip over `public/data/model_card.json`. |
| Status | Numbers **READY** (`findings.json` headline `deficitModelTestAuc` 0.58981 renders as 0.590). Model card panel **PENDING**. |

## 0:55 to 1:35 | THE GAME: auto-demo, one live plane-change decision, inspector

Split the 40 seconds across three clips (see `docs/video/shots.md`).

### 0:55 to 1:20 | Auto-demo (about 24 seconds)

| Field | Content |
|-------|---------|
| Visual | Play view opens with the auto-demo already running: glowing orbits, caption line at the bottom, month counter advancing. Do not show menus or a tutorial. |
| Captions visible in the demo (in order) | `Ledger Odyssey: one year in orbit`, `December close: holiday spending dives at the horizon`, `Burn 90 m/s into the Dining orbit`, `April: income refuels the tank`, `Plane change plus circularization: 160 m/s`, `June: the plane change lands`, `Year complete: report ready` |
| Status | Script and captions **READY** (`src/game/demoScript.ts`: 18 timed commands, 16 captions, deterministic, ends at 22.4s). The 3D scene it drives is **PENDING** until the renderer lands (Tier T1, `docs/research.md`). If the renderer misses the window, record the 2D CRT fallback instead of skipping the beat. |

### 1:20 to 1:30 | One live plane-change decision with the timing-friction number

| Field | Content |
|-------|---------|
| Visual | Cursor clicks the Travel planet, the option card shows its dv and time cost, the player engages the plane change. A number card lands next to it. |
| On-screen copy (the number card) | `Timing friction (F4): moving Travel onto the payday cycle buys +$1,005.93 of drawdown (4.6% of the $21,884.01 baseline)` |
| Alternate line if space is tight | `Plane change now, or wait: the real ledger number is +$1,005.93` |
| Voice-over (optional) | "This burn is the real thing: shifting Travel to the payday cycle is worth a thousand dollars of drawdown." |
| Capture source | Play view option card, plus an overlay number card. |
| Status | Decision interaction **PENDING** (renderer). The number itself is **READY** (`findings.json` headline: `bestAlignedDrawdownImprovementCents` 100593, `bestAlignedDrawdownPctOfBaseline` 4.6, baseline drawdown $21,884.01 from `docs/findings.md` F4). Overlay card **PLACEHOLDER**: not in the UI yet, build it as a text strip or an editor overlay. |

### 1:30 to 1:35 | Inspector click showing the rows

| Field | Content |
|-------|---------|
| Visual | Click Travel (or any entity), the Inspector panel resolves provenance: three tiles light up, checksum reads verified. |
| On-screen copy (already in the UI) | `Inspector \| travel \| Rows \| Sum \| Checksum: verified` plus the provenance filter line under it |
| Voice-over (optional) | "Every number resolves back to raw rows, checksum verified." |
| Capture source | `src/components/InspectorPanel.tsx` with `src/data/resolveRows.ts`. |
| Status | **READY** today (panel exists, tests cover the resolve path). Needs the Play view entity selection working, which the renderer beat provides. |

## 1:35 to 1:50 | F4 and F5 counterfactual waterfall, recommended intervention

| Field | Content |
|-------|---------|
| Visual | F4 waterfall: baseline balance path, the Travel aligned path lifting the trough. Then F5 ranked intervention list, winner highlighted. |
| On-screen copy, F4 headline | `+$1,005.93 tighter drawdown aligning Travel (4.6% of baseline)` |
| On-screen copy, F4 caption | `Timing buys the trough (+$1,005.93 on 2025-12-24), not the month end floor: -$80.24 stays put in December.` |
| On-screen copy, F5 headline | `+$2,366.72 floor gain from Cap the top surge category at its baseline rate` |
| On-screen copy, F5 caption | `Floor moves from -$80.24 to +$2,286.48. Honest null: the auto save row moves neither metric.` |
| Voice-over (optional) | "Timing alone cannot fix the floor. Capping the holiday surge can: twenty three hundred dollars." |
| Capture source | F5 card **READY** in `FindingsView.tsx`; the F4/F5 counterfactual waterfall module **PENDING** (shared module moved to Phase 1 in `docs/decisions.md`). |
| Status | All five numbers **READY** in `public/data/findings.json`. Waterfall visualization **PENDING**. |

## 1:50 to 2:00 | Limitations honesty beat, repo, booth CTA

| Field | Content |
|-------|---------|
| Visual | Three limitation lines stack on, then the repo URL and the booth call to action. End frame holds the URL for 3 full seconds. |
| On-screen copy, limitation 1 | `Synthetic ledger, seed 20261107: no real bank data anywhere in this repo.` |
| On-screen copy, limitation 2 | `One year, 365 daily samples: uncertainty around AUC 0.590 is wide, no confidence interval claimed.` |
| On-screen copy, limitation 3 | `Counterfactuals bound an opportunity, they do not measure an achievable effect.` |
| On-screen copy, repo line | `Code, findings, and reproduction steps: [REPO URL]` |
| On-screen copy, CTA | `Play it live at our booth: [BOOTH LOCATION] \| Sheridan Datathon 2026` |
| Voice-over (optional) | "All of it is synthetic, all of it is reproducible. Come play it at the booth." |
| Status | Limitation copy **READY** (`docs/findings.md` limitations section). Repo URL **PLACEHOLDER**: no git remote is configured yet, set it after the push. Booth location **PLACEHOLDER**. |

---

## Duration budget

| Beat | Target | Clip file |
|------|--------|-----------|
| 0:00 to 0:15 question | 14s | `clip_01_question.mp4` |
| 0:15 to 0:45 F1 F2 | 28s | `clip_02_f1_f2.mp4` |
| 0:45 to 0:55 F3 | 9s | `clip_03_f3_model.mp4` |
| 0:55 to 1:20 auto-demo | 24s | `clip_04_game_auto.mp4` |
| 1:20 to 1:30 plane change | 8s | `clip_05_game_plane.mp4` |
| 1:30 to 1:35 inspector | 5s | `clip_06_game_inspector.mp4` |
| 1:35 to 1:50 F4 F5 | 14s | `clip_07_f4_f5.mp4` |
| 1:50 to 2:00 limitations CTA | 10s | `clip_08_limits_cta.mp4` |
| **Total** | **112s** (8s under the cap) | alphabetical clip order equals shot order |

If a clip runs long, cut it in `record.sh` by shortening `-d`, not in the
editor after the fact: `assemble.sh` refuses any list over 120.000s unless
`--allow-trim` is passed, and trimming burns footage you cannot get back.

## Assembly

```bash
npm run build && npm run preview          # capture from the built app
./scripts/video/record.sh -d 14 -o scripts/video/captures/clip_01_question.mp4
# ... one record command per row of the budget table ...

./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    scripts/video/captures/clip_01_question.mp4 \
    scripts/video/captures/clip_02_f1_f2.mp4 \
    scripts/video/captures/clip_03_f3_model.mp4 \
    scripts/video/captures/clip_04_game_auto.mp4 \
    scripts/video/captures/clip_05_game_plane.mp4 \
    scripts/video/captures/clip_06_game_inspector.mp4 \
    scripts/video/captures/clip_07_f4_f5.mp4 \
    scripts/video/captures/clip_08_limits_cta.mp4
```

Add `--subtitles scripts/video/captions.srt` only if the ffmpeg build has
libass (see `scripts/video/README.md`), otherwise upload the `.srt` as YouTube
captions.

## YouTube upload checklist

* [ ] Final MP4 assembled and re-probed: `ffprobe` duration at most 120.0s,
      codec h264, pix_fmt yuv420p (the script asserts all three).
* [ ] Spot check the file: first frame is the question card, no black frames
      at cuts, last frame holds the URL for 3 seconds.
* [ ] Visibility: **Unlisted** (anyone with the link can watch, nothing in
      search or the channel listing). Do not use Private, judges cannot open it.
* [ ] Title draft: `Ledger Odyssey: what one year of a Tangerine style ledger actually says | Sheridan Datathon 2026`
* [ ] Description draft, paste and fill the bracketed fields:

      The question we asked: of one year of Tangerine style transactions, how
      much spending is locked by the calendar rather than by choice, when does
      the balance actually run out, and what would it cost to move spending
      onto the payday cycle?

      What we did: one offline pipeline (build_world, five analyses F1 to F5,
      verify_findings recomputes every published number) over a synthetic
      Tangerine style ledger (5,702 rows, 2025-11-01 to 2026-10-31, seed
      20261107). Every method transfers unchanged to the real dataset.

      What we found: only 5.08% of annual spend is calendar locked; Retail
      holiday lift is 1.80x; the night-before deficit model reaches test AUC
      0.590; aligning Travel to the payday cycle buys +$1,005.93 of drawdown;
      capping the holiday surge category lifts the floor by +$2,366.72.

      Repo: [REPO URL]
      Write up: [DEVPOST SUBMISSION URL]
      All numbers are synthetic. No real bank data appears in this repository.

* [ ] Thumbnail: F1 chart frame with the 5.08% figure readable at 168x94.
* [ ] Captions: upload `scripts/video/captions.srt` if not burned in; check
      that auto captions read the numbers right (5.08 percent, 0.590,
      1,005.93, 2,366.72).
* [ ] Playback test logged out in a private window: 1080p, sound off, links
      in the description clickable.
* [ ] Video URL pasted into the Devpost submission before the final deadline,
      Sun Nov 8 12:00 PM (draft deadline Sat Nov 7 8:00 PM does not need it).
* [ ] Track selected: Best Data Visualization and Storytelling.
