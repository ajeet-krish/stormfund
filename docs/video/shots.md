# Capture checklist: what to record on Sunday Nov 8

Mechanical runbook for the 2 minute demo. The shot copy lives in
`docs/video/script-template.md`; this file lists what exists today, the exact
record commands, and the shooting order. Final submission is Sun Nov 8 12:00 PM,
demos at 12:30 PM, so the budget is: record about 40 minutes, assemble 10,
upload 10, leave buffer.

## What exists today (verified against `src/`)

| # | Surface | Clip | Proof it works |
|---|---------|------|----------------|
| 1 | Findings landing: five F1 to F5 cards, one headline number each, `SYNTHETIC DATA` badge | `clip_01` to `clip_03` | `src/components/FindingsView.tsx` loads `public/data/findings.json` (stopgap summary, tested) |
| 2 | Findings headline strings (safe to overlay as text) | all beats | rendered by `src/data/findings.ts` `headlineFor`, matches `docs/findings.md` |
| 3 | Play view shell: `Play auto-demo` button, caption line, month counter | `clip_04` | `src/components/PlayViewBody.tsx`, smoke test asserts the label |
| 4 | Deterministic auto-demo: 18 timed commands, 16 captions, ends at 22.4s | `clip_04` | `src/game/demoScript.ts` with tests in `src/game/` |
| 5 | Inspector panel: click entity, `Rows` / `Sum` / `Checksum: verified`, provenance filter line | `clip_06` | `src/components/InspectorPanel.tsx`, `src/data/resolveRows.ts` (tested) |
| 6 | Mock CSV header for the dataset flash | `clip_01` | `data/mock/tangerine_transactions.csv`, 5,702 rows, seed 20261107 |

## What is still pending (do not wait on it, degrade instead)

| Surface | Clip | Fallback if it is not ready at shoot time |
|---------|------|-------------------------------------------|
| 3D renderer scene in the Play view (Tier T1, `docs/research.md`) | `clip_04`, `clip_05` | record the 2D CRT phosphor fallback; a running scene beats an empty canvas |
| Full report with animated chart twins (F1 bars, F2 lifts) | `clip_02` | record the `FindingsView` cards and add the chart as an editor overlay |
| Model card panel | `clip_03` | text strip over `public/data/model_card.json` |
| F4/F5 counterfactual waterfall module | `clip_07` | editor waterfall built from the `docs/findings.md` F4 and F5 tables |
| Timing-friction number card next to the plane change option | `clip_05` | editor text card: `+ $1,005.93 of drawdown (4.6% of baseline)` |
| Question title card | `clip_01` | editor title card with the three lines from the script template |
| Repo URL and booth location | `clip_08` | leave `[REPO URL]` and `[BOOTH LOCATION]` placeholders, fill at upload time |

## Pre flight (about 10 minutes, before any recording)

```bash
# 1. tooling
ffmpeg -version                       # expect 9.0.2 (scripts/video/README.md)
./scripts/video/record.sh --list-devices
./scripts/video/test_assemble.sh      # must print ALL TESTS PASSED

# 2. app builds and tests are green (CI runs the same checks)
npm run typecheck
npx vitest run
npm run build

# 3. serve the built app and keep it running for the whole session
npm run preview                       # http://localhost:4173
```

Browser hygiene, once, before the first shot:

* [ ] Full screen browser or a dedicated second screen, bookmarks bar hidden,
      zoom set so text is crisp, dark mode consistent with the site theme.
* [ ] Terminal minimized or on the other screen (never in frame).
* [ ] macOS Screen Recording permission granted to the terminal
      (System Settings > Privacy & Security > Screen Recording).
* [ ] Notifications off, battery plugged in, energy saver off.
* [ ] Same window size and browser zoom for every app clip: `assemble.sh`
      refuses resolution mismatches.

## Record commands and target durations

Clip names are zero padded so alphabetical order equals shot order, which is
the order `assemble.sh` needs. Targets total 112s, 8s under the 120s hard cap.

| Order | Clip | Beat | Command |
|-------|------|------|---------|
| 1 | `clip_01_question.mp4` | 0:00 to 0:15 | `./scripts/video/record.sh -d 14 -o scripts/video/captures/clip_01_question.mp4` |
| 2 | `clip_02_f1_f2.mp4` | 0:15 to 0:45 | `./scripts/video/record.sh -d 28 -o scripts/video/captures/clip_02_f1_f2.mp4` |
| 3 | `clip_03_f3_model.mp4` | 0:45 to 0:55 | `./scripts/video/record.sh -d 9 -o scripts/video/captures/clip_03_f3_model.mp4` |
| 4 | `clip_04_game_auto.mp4` | 0:55 to 1:20 | `./scripts/video/record.sh -d 24 -o scripts/video/captures/clip_04_game_auto.mp4` |
| 5 | `clip_05_game_plane.mp4` | 1:20 to 1:30 | `./scripts/video/record.sh -d 8 -o scripts/video/captures/clip_05_game_plane.mp4` |
| 6 | `clip_06_game_inspector.mp4` | 1:30 to 1:35 | `./scripts/video/record.sh -d 5 -o scripts/video/captures/clip_06_game_inspector.mp4` |
| 7 | `clip_07_f4_f5.mp4` | 1:35 to 1:50 | `./scripts/video/record.sh -d 14 -o scripts/video/captures/clip_07_f4_f5.mp4` |
| 8 | `clip_08_limits_cta.mp4` | 1:50 to 2:00 | `./scripts/video/record.sh -d 10 -o scripts/video/captures/clip_08_limits_cta.mp4` |

After every clip:

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
    scripts/video/captures/<clip>.mp4
```

If a clip comes out short, re-record it right away (cheap), do not plan to
stretch it later: `assemble.sh` refuses any list over 120.000s and there is no
footage to pad with.

## Shooting order on Sunday (dependency order, not screen order)

1. **Findings landing** (`clip_01` to `clip_03`): the page exists today, take
   these first while nothing else can break them. Scroll slowly, hold each
   headline for at least 3 seconds so it reads at 1080p.
2. **Inspector** (`clip_06`): needs entity selection in the Play view, take it
   while the app state is clean. Click Travel, hold on `Checksum: verified`.
3. **Auto-demo** (`clip_04`): reload the page so the demo starts from its
   reset entry, let the whole 22.4s script run, keep the cursor out of frame.
4. **Plane-change decision** (`clip_05`): the live take, one attempt per
   recording since it is only 8 seconds. Engage the Travel plane change, then
   hold on the number card overlay.
5. **Pending surfaces** (`clip_07`, title card, model card, waterfall): shoot
   whatever landed by then; apply the fallbacks table above for anything that
   did not.
6. **Limitations and CTA** (`clip_08`): static card, 10 seconds, end frame
   holds the URL.

## Assemble and check

```bash
# dry run without captions, confirm the hard cap passes
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    scripts/video/captures/clip_01_question.mp4 \
    scripts/video/captures/clip_02_f1_f2.mp4 \
    scripts/video/captures/clip_03_f3_model.mp4 \
    scripts/video/captures/clip_04_game_auto.mp4 \
    scripts/video/captures/clip_05_game_plane.mp4 \
    scripts/video/captures/clip_06_game_inspector.mp4 \
    scripts/video/captures/clip_07_f4_f5.mp4 \
    scripts/video/captures/clip_08_limits_cta.mp4

# if the build has libass, burn captions on the final run
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    --subtitles scripts/video/captions.srt \
    scripts/video/captures/clip_0*.mp4
```

Never pass `--allow-trim` on a recording day: it means footage was shot over
budget, and the fix is a re-record, not a silent cut.

## Hand off to the upload

The upload checklist (Unlisted visibility, title and description drafts with
the question asked, repo link, captions, Devpost deadline) is the last section
of `docs/video/script-template.md`.
