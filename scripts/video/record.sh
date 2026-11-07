#!/usr/bin/env bash
#
# record.sh: capture one screen clip for the Ledger Odyssey demo video.
#
# Uses ffmpeg's avfoundation input (macOS only) to record the screen into an
# H.264 MP4 that assemble.sh can concat later. Pure shell plus ffmpeg: no
# Python, no uv environment.
#
# Capturing the built app (preferred over the dev server, judges see the
# same code that ships):
#     npm run build
#     npm run preview                 # serves dist/ at http://localhost:4173
#     open http://localhost:4173      # hide the bookmarks bar, pick a zoom
# Then minimize this terminal (or record a second screen with --device)
# before you start recording, so the terminal never appears in the shot.
#
# First run on a new Mac: System Settings > Privacy & Security > Screen
# Recording must allow your terminal app, otherwise ffmpeg captures black.
#
# Examples:
#     ./scripts/video/record.sh --list-devices
#     ./scripts/video/record.sh -d 14 -o scripts/video/captures/clip_01_question.mp4
#     ./scripts/video/record.sh -d 24 --mic -o scripts/video/captures/clip_04_game.mp4
#     ./scripts/video/record.sh -d 9 -i 5 -o scripts/video/captures/clip_07_second_screen.mp4

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Defaults, all overridable from the command line.
DURATION=30           # seconds, match the shot budget in docs/video/shots.md
FPS=30                # keep every clip at 30 fps so concat stays smooth
OUTPUT=""             # empty means captures/clip_<timestamp>.mp4
SCREEN_DEVICE=""      # empty means auto-detect "Capture screen 0"
AUDIO_DEVICE="none"   # "none" is silent, --mic flips it to the first microphone
SIZE=""               # optional scale, for example 1600x900

usage() {
    cat <<'EOF'
Usage: record.sh [options]

  -d, --duration SECONDS   how long to record (default 30)
  -o, --output PATH        where to write the clip
                           (default captures/clip_<timestamp>.mp4 next to this script)
  -f, --fps N              capture frame rate (default 30)
  -i, --device INDEX       avfoundation video device index (default: auto-detect)
      --mic                also record the first microphone (silent by default)
      --size WxH           scale the recording, for example 1600x900
      --list-devices       print the avfoundation device list and exit
  -h, --help               show this help

Notes:
  * Build and preview the app first: npm run build && npm run preview
  * macOS asks for Screen Recording permission the first time
    (System Settings > Privacy & Security > Screen Recording).
  * Keep duration, fps, and size identical across the clips of one video so
    assemble.sh can concat them without surprises.
EOF
}

need_value() {
    # Called as: need_value "$@" right after matching a flag that takes one.
    if [ $# -lt 2 ]; then
        echo "ERROR: $1 expects a value" >&2
        exit 2
    fi
}

list_devices() {
    # ffmpeg exits non-zero after printing the device list, hence the guard.
    ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1 || true
}

detect_screen_device() {
    # Matches a line like: [AVFoundation indev @ 0x...] [4] Capture screen 0
    list_devices | sed -n 's/.*\] \[\([0-9][0-9]*\)\] Capture screen 0.*/\1/p' | head -n 1
}

detect_first_microphone() {
    # First entry under the "AVFoundation audio devices" header.
    list_devices | sed -n '/AVFoundation audio devices:/,$s/.*\] \[\([0-9][0-9]*\)\] .*/\1/p' | head -n 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        -d|--duration) need_value "$@"; DURATION="$2"; shift 2 ;;
        -o|--output) need_value "$@"; OUTPUT="$2"; shift 2 ;;
        -f|--fps) need_value "$@"; FPS="$2"; shift 2 ;;
        -i|--device) need_value "$@"; SCREEN_DEVICE="$2"; shift 2 ;;
        --mic) AUDIO_DEVICE="auto"; shift ;;
        --size) need_value "$@"; SIZE="$2"; shift 2 ;;
        --list-devices) list_devices; exit 0 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "ERROR: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
    esac
done

command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg not found on PATH" >&2; exit 2; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe not found on PATH" >&2; exit 2; }

# Strict number shape: digits with at most one dot. The old character
# class accepted "1..2" and "30.", which ffmpeg then rejects raw.
if ! [[ "$DURATION" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "ERROR: --duration must be seconds as digits with at most one dot (for example 30 or 12.5), got '$DURATION'" >&2
    exit 2
fi
case "$FPS" in
    ''|*[!0-9]*) echo "ERROR: --fps must be a whole number, got '$FPS'" >&2; exit 2 ;;
esac
case "$SIZE" in
    '') ;;
    *[!0-9x]*) echo "ERROR: --size must look like 1600x900, got '$SIZE'" >&2; exit 2 ;;
esac

if [ -z "$OUTPUT" ]; then
    OUTPUT="$SCRIPT_DIR/captures/clip_$(date +%Y%m%d_%H%M%S).mp4"
fi
mkdir -p "$(dirname "$OUTPUT")"

if [ -z "$SCREEN_DEVICE" ]; then
    SCREEN_DEVICE="$(detect_screen_device || true)"
fi
if [ -z "$SCREEN_DEVICE" ]; then
    SCREEN_DEVICE=4
    echo "note: could not auto-detect 'Capture screen 0', falling back to device 4 (run --list-devices to check)" >&2
fi

if [ "$AUDIO_DEVICE" = "auto" ]; then
    AUDIO_DEVICE="$(detect_first_microphone || true)"
    if [ -z "$AUDIO_DEVICE" ]; then
        echo "ERROR: no microphone found, drop --mic or pass a device with --list-devices" >&2
        exit 2
    fi
fi

echo "Recording ${DURATION}s from video device ${SCREEN_DEVICE}, audio device ${AUDIO_DEVICE}, ${FPS} fps ..."

cmd=(ffmpeg -hide_banner -y
    -f avfoundation -framerate "$FPS" -capture_cursor 1
    -i "${SCREEN_DEVICE}:${AUDIO_DEVICE}"
    -t "$DURATION"
    -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p)

if [ "$AUDIO_DEVICE" != "none" ]; then
    cmd+=(-c:a aac -b:a 128k)
fi
if [ -n "$SIZE" ]; then
    cmd+=(-vf "scale=${SIZE}")
fi
cmd+=(-movflags +faststart "$OUTPUT")

"${cmd[@]}"

actual="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT")"
echo "Done: ${OUTPUT} (${actual}s)."
echo "Next: check it with 'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"$OUTPUT\"' and list it first in assemble.sh."
