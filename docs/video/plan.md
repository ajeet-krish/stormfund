# Video Plan: Storm Fund 2 Minute Demo

Screen recording plan for the 120 second Devpost and YouTube unlisted video.
Shot copy lives in `docs/video/script.md`; this file is the setup, the shot list
with exact clicks and keys, the retake rules, and the pre upload checklist.
Format follows `/Users/ajeet/Projects/Hackathons/Meta Global 2026/docs/VIDEO_PLAN.md`
(purpose, format concepts, style guide, stand out strategy, production
checklist, upload logistics).

## Purpose and audience

* Purpose: win Best Data Visualization and Storytelling through the population
  finding plus the live shock, and support the Tangerine sponsor track with a
  live run of the exact judge definitions.
* Primary audience: judges scanning the entry in about five minutes of attention.
* Secondary audience: Devpost reviewers checking that the shipped claims match
  the video.
* Success: a viewer can repeat the one line pitch (one percent of accounts hold
  under three months of runway at baseline, ten percent under a layoff twist)
  and remembers the verdict falling to 1.5 months with the pin matching it.

## Ranked format concepts

* Option 1, chosen: full screen recording of the built app, six clips, voice
  over recorded with each clip, no camera.
  * Pros: fastest to retake per scene, the interface is the product, the sticky
    judge bar and every honesty label stay legible at 1080p.
  * Cons: no human face, so the narration has to carry the trust.
* Option 2: face cam in the corner plus screen recording.
  * Pros: human connection.
  * Cons: the keycaps, guard chips, and provenance line are small; a corner cam
    covers the judge bar, which is a required frame.
* Option 3: one continuous 120 second take with live narration.
  * Pros: no edit, perfect pacing.
  * Cons: one flub anywhere forces a full re record; the brief asks for one to
    two retakes per scene, which only works in pieces.

## Style guide

* Palette: the app's own dark console tokens, so nothing in the edit competes
  with the band colors (critical, storm warning, watch, fair skies, clear).
* Type: no burned in typography except the app's own. Any editor overlay (lower
  third, end card) uses monospace to match the header, and carries no em dash,
  en dash, minus sign, double hyphen, or spaced hyphen, per `src/dashScan.test.ts`.
* Captions: export an SRT from the edit and upload it as YouTube captions. The
  local Homebrew ffmpeg has no libass, so `assemble.sh --subtitles` exits 3
  (see `scripts/video/README.md`); do not burn captions.
* Music: none, or a bed at minus 24 dB under the voice. The narration must stay
  intelligible on a laptop speaker.
* Pacing: hold every headline at least 2 seconds, let the forecast strip finish
  its roughly 1 second tile animation before moving, and never cut while a
  number is still changing.

## Stand out strategy

* First 5 seconds: the atlas headline alone, no title card, no logo animation.
  The first spoken words are the finding.
* Gifable moment: the `1` keypress that moves the headline from 1% to 10% with
  `At baseline: 1% (60 of 4,500)` staying printed underneath.
* Second moment: the verdict badge falling to `1.5 months` while the landfall
  pin prints the identical figure on the strip.
* Honesty as differentiator: the recorded check sum line, the simulated
  counterfactual caveats, the `Context only` note, the `Beyond the answer key`
  marker, and the receipt stamp are all held in frame long enough to read.
* Thumbnail: the closing frame, headline at 10% with the baseline subline,
  readable at 168x94.

## Setup: machine, browser, viewport, offline

Machine and tools (verify before the first take):

* This MacBook, macOS, Homebrew ffmpeg 9.0.2 with avfoundation.
* `ffmpeg -version`, `./scripts/video/record.sh --list-devices`,
  `./scripts/video/test_assemble.sh` (must print ALL TESTS PASSED).
* Screen Recording permission granted to the terminal app, otherwise the capture
  is black (System Settings, Privacy and Security, Screen Recording).

Build and serve the shipped code, never the dev server:

```bash
npm run typecheck && npx vitest run && npm run build
npm run preview                      # http://localhost:4173
```

Browser and viewport:

* One browser (Chrome recommended), window sized to 1440x900 CSS pixels, zoom
  100%, bookmarks bar hidden, dark appearance, one tab only.
* devicePixelRatio: 2 on this Retina panel, so the capture is native resolution
  with crisp small type. If the session moves to an external 1080p display at
  DPR 1, keep that display for all six clips and write the choice on the take
  sheet. Never change display scaling or window size mid session:
  `assemble.sh` fails loudly on a resolution mismatch.
* Terminal minimized or on a second screen (record a second screen with
  `--device N` if needed), notifications off, Do Not Disturb on, battery
  plugged in, energy saver off.
* Cursor: keep it out of frame between actions, and keep it visible during the
  clicks so the action reads (`record.sh` captures the cursor by default).

Offline discipline (the app is fully bundled):

* Turn Wi Fi off for the whole session. Before the first take, load
  `http://localhost:4173` with Wi Fi off and confirm the page works.
* Open DevTools Network once: the only requests are same origin
  `/data/engine/profiles.json`, `/data/engine/atlas.json`, and the static
  bundle. No external host appears anywhere.
* Do not press `Read the sky`. It is the only code path that calls out
  (`src/lib/shockParse.ts` `GEMINI_URL`) and it needs `VITE_GEMINI_KEY` plus
  network. Build without the key so the mode badge reads `preset cards`, which
  is the honest offline state the video shows.
* If the typed row appears on camera at all, show the badge and the preset
  cards only. The video never depends on it.

Bundle paths that must exist in `dist/` before recording:

| Path in dist | Role on camera |
|--------------|----------------|
| `data/engine/profiles.json` | 4,500 profiles, console boot, atlas counts |
| `data/engine/atlas.json` | district cartogram tables |
| `data/memo-devnet.json`, `data/memo-devnet-modelcard.json`, `data/memo-devnet-fingerprint.json` | receipt evidence links (the same bytes are inlined into the JS by `import.meta.glob`) |
| `judge-sheet.html` | the `Judge sheet` link target, printable offline |
| `logo.svg` | header mark |

## Recording approach

* Tool: `scripts/video/record.sh` (ffmpeg avfoundation, H.264 MP4, 30 fps,
  `--mic` adds the first microphone so narration is locked to its clip).
* Six clips, one per block, durations exactly as in the script budget:
  15, 20, 30, 20, 20, 15 seconds. Zero padded names so alphabetical order equals
  shot order, which is the order `assemble.sh` needs.
* Record screen with `--mic` and read the block's narration in the same take.
  If narration quality is poor, re record the block; the fallback is silent
  clips plus one separate voice over pass muxed after assembly.
* After every clip: probe the duration and scrub the first and last second.

```bash
./scripts/video/record.sh -d 15 --mic -o scripts/video/captures/clip_01_hook.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_02_customer.mp4
./scripts/video/record.sh -d 30 --mic -o scripts/video/captures/clip_03_shock.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_04_plan.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_05_depth.mp4
./scripts/video/record.sh -d 15 --mic -o scripts/video/captures/clip_06_close.mp4

ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
    scripts/video/captures/<clip>.mp4

./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    scripts/video/captures/clip_0*.mp4
```

Budget rule: the planned timeline is exactly 120.0s. If the assembled list
totals more than 120.000s, `assemble.sh` exits 4 and writes nothing; re record
`clip_06_close.mp4` shorter by the overshoot. Never pass `--allow-trim`.

## Scene and shot list, in order

State at the start of every take: fresh reload of `http://localhost:4173`, page
scrolled to the top, no account selected, twist idle, focus on the page body.
Wait until `1% of accounts have under 3 months of runway at baseline` is
rendered before you run `record.sh`, because the clip starts on the command and
the `Counting the population...` state must never be the first frame. Keys only
fire when focus is outside a text input (`src/lib/judgeMode.ts`
`resolveJudgeKey`), so after every lookup Enter the plan blurs the input before
the next key.

| # | Block | Exact actions | Frame must contain |
|---|-------|---------------|--------------------|
| 1 | Hook 0:00 to 0:15 | (a) hold 7s on the idle headline. (b) Press `1`. (c) Hold 2s, then scroll down past the cartogram to the strip plot and hold 6s. | `1% of accounts have under 3 months of runway at baseline`, `60 of 4,500 accounts`, then `10% ... under the laid off twist`, `435 of 4,500 accounts`, `At baseline: 1% (60 of 4,500)`, then the dot field with its caption. |
| 2 | Customer 0:15 to 0:35 | (a) Press `r` (reset the twist while focus is still on the body). (b) Scroll down into the console. (c) Press `/`, type `68257`, Enter. (d) Hold 8s on the baseline card. (e) Press `/`, type `42988`, Enter, small scroll down to the guard chips, hold 5s. (f) Press `/`, type `68257`, Enter, scroll back up to the card grid, hold 3s. | Lookup eyebrow `Know the customer`; baseline card with all eight metric rows, `Baseline / Fair skies / 9.8 months`, five flag chips off, the `Recorded check sum ... does not recompute it` line; then `! negative buffer` and `! defaulted loan` chips with the two guard messages in the sticky bar; finally `No guard flags on this account`. |
| 3 | Shock 0:35 to 1:05 | (a) Click the `Take a shock` panel heading once (blurs the lookup, no other effect), 2s. (b) Press `4`, 4s on the preset header. (c) Hold 6s on the hero badge and the before and after table. (d) Scroll to the forecast panel and let the strip animation finish, 11s. (e) Hold on the EI marker for 7s. | Preset button `Laid off and bills up` pressed, card sentence, `Horizon: 6 months, set by the preset.`, sliders at `55% of usual income` and `+15%`; badge `After the shock / Storm warning / 1.5 months / steady state, 1.0 to 2.9 months`; table income $6,503.26 to $3,576.79, spending $7,160.84 to $7,806.85, gap $657.58 to $4,230.06; `Storm front` plus card sentence, pin chip `1.5 months`, `Projection horizon: 12 months`, the `Context only` note; marker `Beyond the answer key: EI income stops after month 6`. |
| 4 | Plan 1:05 to 1:25 | (a) Scroll to the plan card. (b) Hold 5s on the goal and backup blocks. (c) Scroll to the lever table: 7s on the trim row while the line runs, 6s on the defer row. | `Starter cushion: $21,482.52 (3 months of typical spending).`, the cut line with $982.74 and 67 months, all four chips with `goal` and `stretch` badges, `Baseline steady state: 9.8 months. Shocked steady state: 1.5 months (Storm warning).`, caption `Simulated counterfactuals, applied one after another`, both caveat sentences, `+0.0 months` and `+3.2 months`, `1.5 months` and `4.7 months`, `How the plan counts`. |
| 5 | Depth 1:25 to 1:45 | (a) Scroll so the sticky bar is fully in frame, click `Rehearsal`, then hold 7s on the dock. (b) Scroll up to the receipt stamp, hold 7s. (c) Scroll to the typed row, hold 6s. | All nine keycaps with labels, `Rehearsal` now reading `Hide rehearsal`, `Judge sheet`; dock `Rehearsal step 1 of 5`, card sentence, script line, `Account 68257, card Laid off, target 2000 ms`, `Run step`; badge `Anchored on Solana devnet, verified`, three receipt rows with `evidence` and `explorer` links and the stamp note; badge `preset cards` above the four preset cards. |
| 6 | Close 1:45 to 2:00 | (a) Confirm focus is not in a text input (it is on the `Rehearsal` button after block 5; click the page header once if a retake left focus in the lookup). (b) Press `1`. (c) Scroll to the top over 8s (1:45 to 1:53). (d) Hold motionless from 1:53 to 2:00.0. | Header `Resilience Weather Station`, `Tangerine track, Sheridan Datathon 2026`, headline `10% of accounts would have under 3 months of runway under the laid off twist`, subline `435 of 4,500 accounts` and `At baseline: 1% (60 of 4,500)`. |

Optional B roll, only if a retake needs it: hover the `Judge sheet` link to
show its status bar URL, or open `judge-sheet.html` and press browser Back
before the next clip. Do not add a clip that pushes the total over 120.000s.

## Retake strategy

* Budget: one to two retakes per scene, six scenes, about 40 minutes of
  recording total. Record the hook first (it is the pitch), then the customer
  block, then the rest in shot order.
* After each clip: probe the duration, then check the three things that block
  needs (listed in the Frame must contain column). Fix immediately while the
  state is still fresh; never plan to repair a flub in the editor.
* Known flubs and their fixes:

  | Symptom | Cause | Fix |
  |---------|-------|-----|
  | Typing `4` lands in the lookup field | focus still in `#account-lookup` after Enter | click the `Take a shock` panel heading once, then press `4`, re record the block |
  | Guard chips not visible | chip row sits just below the fold | small scroll until both chips and the badge are in frame, re record block 2 |
  | Keys do nothing | focus on a button is fine, focus in an input is not | click the page header, then press the key |
  | Strip animation already finished when the frame lands | scroll was too slow | start the scroll earlier in the take, re record block 3 |
  | Narration overruns the block | reading too fast or adding words | read the line again at the printed pace, re record; never speed up in post |
  | Assembled total above 120.000s | clips ran long | re record `clip_06_close.mp4` shorter by the overshoot |
  | Audio level differs between clips | mic gain or distance changed | re record the quieter block; do not normalize one clip alone |

* Go or no go before the session: typecheck green, vitest green, build green,
  preview loads with Wi Fi off, `test_assemble.sh` prints ALL TESTS PASSED,
  one dry run of blocks 1 and 3 recorded and probed.

## Never show on camera

* Any loading or error state: `Profiles failed to load`, `Counting the
  population...`, `forecast not wired yet`. Reload and re record instead.
* A failed or pending typed shock (`reading the sky`, a fallback note). The
  preset cards are the path.
* DevTools, the terminal, browser chrome other than the address bar, bookmarks,
  other tabs, notifications.
* Any sentence containing a dash character in an overlay you add.
* Any claim of synthetic data, any unmeasured number, any invented account id.

## Production checklist

Audio

* [ ] Mic test recorded and played back at phone speaker volume before shot 1.
* [ ] Narration read verbatim from `docs/video/script.md`, about 256 words,
      digits read as printed, half second hold after each line.
* [ ] No keyboard clatter drowning the voice; if it does, re record with the
      laptop farther from the mic rather than muting the take.
* [ ] Voice over level near minus 16 LUFS in the edit; test once with sound off
      (the video must still read) and once at laptop speaker volume.

Pace

* [ ] Every headline held at least 2 seconds.
* [ ] Forecast strip animation completes before the scroll away.
* [ ] Six block durations recorded at 15, 20, 30, 20, 20, 15 seconds and the
      assembled total at most 120.000s, stated as 120.0s planned.
* [ ] Closing hold reaches 2:00.0 with no cursor movement.

Dashes and copy

* [ ] No em dash, en dash, minus sign, double hyphen, or spaced hyphen in any
      overlay, lower third, end card, or caption text (same patterns as
      `src/dashScan.test.ts`).
* [ ] Money cells that print a leading minus (`-$9.19`, `-$2,844.93`) are app
      output, allowed as formatted numbers, not prose.
* [ ] Spoken and printed numbers agree with the Number verification table in
      `docs/video/script.md`.

Honesty labels visible in the final cut

* [ ] `Recorded check sum ... This page shows the recorded value and does not
      recompute it.`
* [ ] `Simulated counterfactuals, applied one after another` plus both lever
      caveat sentences.
* [ ] `Context only: the projection starts from buffer B, the mean of the last 6
      recorded balances, not the last recorded balance.`
* [ ] `Beyond the answer key: EI income stops after month 6`
* [ ] `Anchored on Solana devnet, verified` plus the stamp note about bundled
      evidence files and no writes to chain.
* [ ] `At baseline: 1% (60 of 4,500)` in the closing frame.
* [ ] `preset cards` badge next to the typed row.
* [ ] Guard chip messages for 42988 in the sticky bar.

## Upload and submission logistics

* Assemble, then re probe: duration at most 120.000s, codec h264, pix_fmt
  yuv420p (`assemble.sh` asserts all three).
* Upload to YouTube as **Unlisted**, audience Not for Kids. Private would hide
  it from judges.
* Title and description: paste the drafts in `docs/devpost.md` section 5
  (title `Storm Fund: your rainy day fund, as weather | Sheridan Datathon 2026`),
  then fill the bracketed links. The description's numbers (4,500 accounts,
  1.06M transactions, five verdict bands, integer cents, Gemini for typed input)
  must match what the video shows.
* Captions: export the SRT from the edit and upload it, since the local ffmpeg
  cannot burn subtitles.
* Thumbnail: the closing headline frame, 10% readable at 168x94.
* Logged out playback test in a private window at 1080p, sound off, then sound
  on, then links in the description clickable.
* Paste the YouTube link into the Devpost submission before the submission
  freeze at Sun Nov 8 11:00 AM (hard deadline 12:00 PM).
* Keep a local MP4 backup plus the six clips; `scripts/video/captures/` and
  `scripts/video/final/` are git ignored, so copy the final file somewhere safe
  before any cleanup.
