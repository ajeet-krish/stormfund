# Video kit: recording, assembly, and self test for the 2 minute demo

The Sheridan Datathon 2026 submission needs a demo video of at most 120
seconds (mandatory in 2026, see docs/research.md). This directory holds the
two shell tools that produce it plus a synthetic self test. Everything here is
shell plus ffmpeg: no Python, no uv environment, no npm scripts.

| File | Purpose |
|------|---------|
| `record.sh` | capture one screen clip with ffmpeg avfoundation (macOS) |
| `assemble.sh` | concat clips, optionally burn an .srt, enforce the 120s hard cap, emit a YouTube ready MP4 |
| `test_assemble.sh` | synthetic end to end test of `assemble.sh` (color clips, no footage) |
| `../video/` (docs) | timed shot script and the capture plan: `docs/video/script.md`, `docs/video/plan.md` |

## Tool requirements

| Tool | Verified version on this machine | Check |
|------|----------------------------------|-------|
| bash | 3.2.57 (macOS default, scripts avoid bash 4 features) | `bash --version` |
| ffmpeg | 9.0.2 (Homebrew `/opt/homebrew/Cellar/ffmpeg/9.0.2_1`, Apple clang 21.0.0) | `ffmpeg -version` |
| ffprobe | 9.0.2 (ships with ffmpeg, used for every duration check) | `ffprobe -version` |
| avfoundation | built into this ffmpeg (macOS screen capture input) | `./scripts/video/record.sh --list-devices` |

Verified `ffmpeg -version` header on this machine:

```
ffmpeg version 9.0.2 Copyright (c) 2000-2026 the FFmpeg developers
built with Apple clang version 21.0.0 (clang-2100.3.34.2)
```

The build configuration includes `--enable-libx264` and
`--enable-videotoolbox` (recording and encoding are covered) but does NOT
include `--enable-libass`, so the `subtitles` filter is missing here. See
"Burning subtitles" below.

## Quick start

```bash
# 0. one time checks
ffmpeg -version
./scripts/video/record.sh --list-devices
./scripts/video/test_assemble.sh

# 1. build and serve the app the judges will see
npm run build
npm run preview            # http://localhost:4173

# 2. record each shot (six clips, durations 15, 20, 30, 20, 20, 15 seconds;
#    full shot copy in docs/video/plan.md, budget in docs/video/script.md)
./scripts/video/record.sh -d 15 --mic -o scripts/video/captures/clip_01_hook.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_02_customer.mp4
./scripts/video/record.sh -d 30 --mic -o scripts/video/captures/clip_03_shock.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_04_plan.mp4
./scripts/video/record.sh -d 20 --mic -o scripts/video/captures/clip_05_depth.mp4
./scripts/video/record.sh -d 15 --mic -o scripts/video/captures/clip_06_close.mp4

# 3. assemble in shot order (the hard 120s check runs before encoding)
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    scripts/video/captures/clip_01_hook.mp4 \
    scripts/video/captures/clip_02_customer.mp4 \
    scripts/video/captures/clip_03_shock.mp4 \
    scripts/video/captures/clip_04_plan.mp4 \
    scripts/video/captures/clip_05_depth.mp4 \
    scripts/video/captures/clip_06_close.mp4
# clip list order must match the shot order in docs/video/script.md

# 4. verify what you would upload
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \
    scripts/video/final/demo.mp4
```

## record.sh

Records the whole screen (or `--device N` for a second screen) to H.264 MP4
at 30 fps, silent by default (`--mic` adds the first microphone).

```bash
./scripts/video/record.sh --help
./scripts/video/record.sh --list-devices
./scripts/video/record.sh -d 30 --mic -o scripts/video/captures/clip_03_shock.mp4
./scripts/video/record.sh -d 15 -i 5 -o scripts/video/captures/clip_01_hook.mp4
```

Practical notes:

* Capture the built app, not the dev server: `npm run build && npm run preview`
  then open `http://localhost:4173`. The judges run the same static build.
* macOS requires Screen Recording permission for your terminal the first time
  (System Settings > Privacy & Security > Screen Recording), otherwise the
  capture is black.
* Minimize the terminal or shoot a second screen so tooling never appears.
* Keep fps, size, and duration settings consistent across clips of one video
  so `assemble.sh` can concat them.

## assemble.sh

Concatenates with the ffmpeg concat demuxer, then performs one re-encode.

```bash
./scripts/video/assemble.sh --help

# normal case, six clips in shot order, exactly 120s, under the cap
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    scripts/video/captures/clip_01_hook.mp4 scripts/video/captures/clip_02_customer.mp4 \
    scripts/video/captures/clip_03_shock.mp4 scripts/video/captures/clip_04_plan.mp4 \
    scripts/video/captures/clip_05_depth.mp4 scripts/video/captures/clip_06_close.mp4

# burn captions (needs a libass build, see below)
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    --subtitles scripts/video/captions.srt scripts/video/captures/*.mp4

# overlong input: refused by default (exit 4)
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 scripts/video/captures/*.mp4
#   ERROR: clip list totals 134.500s, which is 14.500s OVER the 120s hard maximum.

# only an explicit operator flag may cut at exactly 120s
./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
    --allow-trim scripts/video/captures/*.mp4
```

Guarantees:

* upfront `ffprobe` duration sum, loud refusal over 120s, exit code 4,
  no output file written,
* `--allow-trim` is the only way to get a cut at 120s, and it prints a warning,
* resolution mismatch between clips fails loudly before encoding,
* output is H.264 (libx264), yuv420p, `+faststart`, AAC audio when the clip
  set has audio (`-an` keeps silent clip sets clean, no unused-option noise),
  and an audio presence mismatch between clips warns before encoding,
* the finished file is re-probed: over 120.5s or wrong codec/pix_fmt exits 5.

Exit codes: `2` usage or input error, `3` subtitles unavailable, `4` over the
hard maximum without `--allow-trim`, `5` output verification failed.

## Burning subtitles

`--subtitles file.srt` burns captions with this forced style (readable at
phone size): Helvetica 22, white with a black 2px outline, bottom center,
26px bottom margin.

The current Homebrew ffmpeg 9.0.2 on this machine has no `subtitles` filter
(no libass), so the script detects that up front and exits 3 with instructions
instead of failing mid encode. Ways to get a capable build:

```bash
sudo port install ffmpeg                     # MacPorts, libass enabled
# or a static arm64 build: https://ffmpeg.martin-riedl.de/
# 'brew reinstall ffmpeg' does not help: the Homebrew formula here has no libass
# (verify with: brew deps ffmpeg)
```

Fallback with zero extra tooling: assemble without `--subtitles` (all key
numbers are already on screen as text cards) and upload the same `.srt` as
YouTube captions, which the upload checklist in `docs/video/plan.md`
covers.

Known gap: `assemble.sh` does not mix a separate narration track. Per
docs/decisions.md the interim plan is pre-generated narration, so if voice-over
is used, mux it in an editor after assembly or extend this script.

## Self test

```bash
./scripts/video/test_assemble.sh
```

It generates three 5s color clips, assembles them (expects about 15s,
h264/yuv420p), then builds a 150s input and asserts that `assemble.sh`
refuses it without `--allow-trim` (exit 4, message, no output file) and cuts
it to at most 120s with the flag. Exit code 0 means all assertions passed.

Syntax check both scripts at any time:

```bash
bash -n scripts/video/record.sh scripts/video/assemble.sh scripts/video/test_assemble.sh
```

## Conventions in this directory

* 4 space indent in shell bodies where indented, K&R style case/if braces,
  `snake_case` functions, `SCREAMING_SNAKE` for the `MAX_SECONDS` constant.
* No em dashes, double hyphens, or dash equivalents in prose (shell flags such
  as `--allow-trim` are fine).
* Captured media lands in `captures/` and `final/`, both git ignored; nothing
  in this directory should be committed by hand.
