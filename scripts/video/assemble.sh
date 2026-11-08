#!/usr/bin/env bash
#
# assemble.sh: concat recorded clips into the final demo MP4.
#
# What it does, in order:
#   1. reads the clip list in the order given (ffmpeg concat demuxer),
#   2. measures every clip with ffprobe and sums the durations,
#   3. refuses to encode anything when the total is over the HARD 120 second
#      maximum (Sheridan Datathon 2026 mandatory demo video), unless the
#      operator passes --allow-trim to cut the result at exactly 120s,
#   4. optionally burns an .srt caption file with a readable forced style,
#   5. encodes one MP4: H.264 (libx264), yuv420p, +faststart, AAC audio if
#      any clip carries audio. That is the combination YouTube accepts
#      without re-encoding complaints,
#   6. re-probes the result and fails loudly if it exceeds 120s plus the
#      0.5s AAC frame padding slack (120.5s), or if the codec is wrong.
#
# The 120s input maximum is hard. The post-encode re-probe is the only
# place with slack: AAC frame padding can read a cut of exactly 120s as
# 120.2s, so the verify limit is 120.5s (MAX_SECONDS plus SLACK_SECONDS)
# and nothing beyond it.
#
# Options must come before the clip list.
#
# Examples:
#   ./scripts/video/assemble.sh -o scripts/video/final/demo.mp4 \
#       scripts/video/captures/clip_01_hook.mp4 \
#       scripts/video/captures/clip_02_customer.mp4 \
#       scripts/video/captures/clip_03_shock.mp4 \
#       scripts/video/captures/clip_04_plan.mp4 \
#       scripts/video/captures/clip_05_depth.mp4 \
#       scripts/video/captures/clip_06_close.mp4
#
#   ./scripts/video/assemble.sh -o final.mp4 --subtitles captions.srt clip_01_hook.mp4 clip_02_customer.mp4
#
#   ./scripts/video/assemble.sh -o final.mp4 --allow-trim clip_01_hook.mp4 clip_02_customer.mp4
#
# Exit codes: 2 input or usage error, 3 subtitles unavailable in this ffmpeg
# build, 4 over the 120s maximum without --allow-trim, 5 output verification
# failed.

set -euo pipefail

MAX_SECONDS=120
# The pre-encode guard over inputs is a hard maximum. The post-encode
# re-probe allows SLACK_SECONDS of AAC frame padding over that maximum (a
# cut at exactly 120s can probe as 120.2s), so the verify limit is 120.5s.
SLACK_SECONDS=0.5
OUTPUT=""
SUBTITLES=""
ALLOW_TRIM=0

usage() {
    cat <<'EOF'
Usage: assemble.sh [options] CLIP [CLIP...]

  -o, --output PATH      final MP4 path (required)
      --subtitles FILE   burn this .srt (needs an ffmpeg built with libass)
      --allow-trim       permit cutting the result at exactly 120s when the
                         clip list runs long (explicit opt-in, otherwise refuse)
  -h, --help             show this help

Rules:
  * Clips play in the order given and must share resolution and frame rate.
  * The summed clip duration must be at most 120 seconds. The check runs
    BEFORE any encoding; an overlong list exits with code 4 and no output.
  * After encoding, the re-probe allows 0.5s of AAC frame padding over the
    120s maximum (120.5s limit); anything beyond that exits with code 5.
  * Output is H.264, yuv420p, faststart, ready for YouTube.
EOF
}

need_value() {
    if [ $# -lt 2 ]; then
        echo "ERROR: $1 expects a value" >&2
        exit 2
    fi
}

abspath() {
    case "$1" in
        /*) printf '%s' "$1" ;;
        *) printf '%s' "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")" ;;
    esac
}

while [ $# -gt 0 ]; do
    case "$1" in
        -o|--output) need_value "$@"; OUTPUT="$2"; shift 2 ;;
        -s|--subtitles) need_value "$@"; SUBTITLES="$2"; shift 2 ;;
        --allow-trim) ALLOW_TRIM=1; shift ;;
        -h|--help) usage; exit 0 ;;
        -*) echo "ERROR: unknown option '$1'" >&2; usage >&2; exit 2 ;;
        *) break ;;
    esac
done
CLIPS=("$@")

command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg not found on PATH" >&2; exit 2; }
command -v ffprobe >/dev/null 2>&1 || { echo "ERROR: ffprobe not found on PATH" >&2; exit 2; }

if [ -z "$OUTPUT" ]; then
    echo "ERROR: --output is required" >&2
    usage >&2
    exit 2
fi
if [ ${#CLIPS[@]} -eq 0 ]; then
    echo "ERROR: no clips given" >&2
    usage >&2
    exit 2
fi

# Validate the subtitles path before anything touches it: abspath runs cd
# on the directory, which would die with a raw cd error instead of this
# friendly message when the file (or its folder) is missing.
if [ -n "$SUBTITLES" ] && [ ! -f "$SUBTITLES" ]; then
    echo "ERROR: subtitle file not found: $SUBTITLES" >&2
    exit 2
fi

# Subtitles need the libass based 'subtitles' filter. Check before encoding
# so the operator gets an actionable message instead of a filter crash.
if [ -n "$SUBTITLES" ]; then
    if ! ffmpeg -hide_banner -filters 2>/dev/null | grep -Eq '[[:space:]]subtitles[[:space:]]'; then
        cat >&2 <<'EOF'
ERROR: this ffmpeg build cannot burn subtitles (no 'subtitles' filter,
which means it was built without libass).

Options:
  * install a libass enabled ffmpeg and rerun, for example:
      sudo port install ffmpeg                    (MacPorts, libass enabled)
      or a static build from https://ffmpeg.martin-riedl.de/
    (a plain 'brew reinstall ffmpeg' does NOT help: the Homebrew formula on
     this machine ships without libass, verified with 'brew deps ffmpeg')
  * or drop --subtitles and upload the .srt as YouTube captions instead
    (the upload checklist in docs/video/plan.md covers this).
EOF
        exit 3
    fi
fi

# === measure ===
plan=""
total=0.0
idx=1
first_size=""
first_fps=""
first_audio=""
for clip in "${CLIPS[@]}"; do
    if [ ! -f "$clip" ]; then
        echo "ERROR: clip not found: $clip" >&2
        exit 2
    fi
    dur="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$clip")"
    # Strict number shape: digits with at most one dot, so "1..2" or "N/A"
    # is rejected with context instead of reaching awk as garbage.
    if ! [[ "$dur" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
        echo "ERROR: cannot read the duration of $clip (ffprobe said '$dur')" >&2
        exit 2
    fi
    has_audio="no"
    if [ -n "$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$clip")" ]; then
        has_audio="yes"
    fi
    if [ -z "$first_audio" ]; then
        first_audio="$has_audio"
    elif [ "$has_audio" != "$first_audio" ]; then
        echo "warning: $clip has audio=$has_audio but the first clip has audio=$first_audio; concat needs matching streams" >&2
    fi
    size="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$clip")"
    if [ -z "$size" ]; then
        echo "ERROR: $clip has no video stream" >&2
        exit 2
    fi
    if [ -z "$first_size" ]; then
        first_size="$size"
    elif [ "$size" != "$first_size" ]; then
        echo "ERROR: resolution mismatch: $clip is ${size}, first clip is ${first_size} (concat needs identical frames)" >&2
        exit 2
    fi
    fps="$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$clip")"
    if [ -z "$first_fps" ]; then
        first_fps="$fps"
    elif [ "$fps" != "$first_fps" ]; then
        echo "warning: frame rate of $clip is ${fps}, first clip is ${first_fps}; playback may judder" >&2
    fi
    line="$(printf '  %2d. %8.3fs  %s' "$idx" "$dur" "$clip")"
    plan="${plan}${line}
"
    total="$(awk -v t="$total" -v d="$dur" 'BEGIN { printf "%.3f", t + d }')"
    idx=$((idx + 1))
done

echo "Clip plan (concat order):"
printf '%s' "$plan"
echo "    total: ${total}s (maximum ${MAX_SECONDS}s)"

# === hard guard ===
over="$(awk -v t="$total" -v m="$MAX_SECONDS" 'BEGIN { print (t > m) ? "yes" : "no" }')"
if [ "$over" = "yes" ]; then
    over_by="$(awk -v t="$total" -v m="$MAX_SECONDS" 'BEGIN { printf "%.3f", t - m }')"
    if [ "$ALLOW_TRIM" != "1" ]; then
        cat >&2 <<EOF
ERROR: clip list totals ${total}s, which is ${over_by}s OVER the ${MAX_SECONDS}s hard maximum.
Refusing to assemble. Re-record or cut a clip, or pass --allow-trim to cut
the result at exactly ${MAX_SECONDS}s (explicit operator opt-in only).
EOF
        exit 4
    fi
    echo "warning: clip list totals ${total}s; --allow-trim given, output will be cut at ${MAX_SECONDS}s" >&2
fi

# === assemble ===
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/assemble.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

LIST_FILE="$WORK_DIR/clips.txt"
: > "$LIST_FILE"
for clip in "${CLIPS[@]}"; do
    abs="$(abspath "$clip")"
    case "$abs" in
        *"'"*) echo "ERROR: clip paths must not contain single quotes: $abs" >&2; exit 2 ;;
    esac
    printf "file '%s'\n" "$abs" >> "$LIST_FILE"
done

trim_needed="$(awk -v t="$total" -v m="$MAX_SECONDS" 'BEGIN { print (t > m) ? "yes" : "no" }')"

cmd=(ffmpeg -hide_banner -y -f concat -safe 0 -i "$LIST_FILE")

if [ -n "$SUBTITLES" ]; then
    # Existence was checked before abspath above, so the cd inside is safe.
    srt_abs="$(abspath "$SUBTITLES")"
    # Escape the path for an ffmpeg filter argument: backslash, colon, and
    # single quote are the metacharacters that matter here.
    srt_esc="$(printf '%s' "$srt_abs" | sed -e 's/\\/\\\\/g' -e 's/:/\\:/g' -e "s/'/\\\\'/g")"
    vf="subtitles=filename=${srt_esc}:force_style='FontName=Helvetica,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=26'"
    cmd+=(-vf "$vf")
fi

cmd+=(-map 0:v:0)

if [ "$first_audio" = "yes" ]; then
    cmd+=(-map 0:a:0? -c:a aac -b:a 128k)
else
    cmd+=(-an)
fi

cmd+=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p
    -movflags +faststart)

if [ "$trim_needed" = "yes" ]; then
    cmd+=(-t "$MAX_SECONDS")
fi
cmd+=("$OUTPUT")

mkdir -p "$(dirname "$OUTPUT")"
echo "Encoding $OUTPUT ..."
"${cmd[@]}"

# === verify ===
out_dur="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT")"
codec="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$OUTPUT")"
pix="$(ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 "$OUTPUT")"

# SLACK_SECONDS covers AAC frame padding and frame rounding on the final
# probe: a cut at exactly 120s may read up to 120.5s, and anything past
# that limit means the output is genuinely over the maximum.
verify_limit="$(awk -v m="$MAX_SECONDS" -v s="$SLACK_SECONDS" 'BEGIN { printf "%.1f", m + s }')"
still_over="$(awk -v t="$out_dur" -v m="$MAX_SECONDS" -v s="$SLACK_SECONDS" 'BEGIN { print (t > m + s) ? "yes" : "no" }')"
if [ "$still_over" = "yes" ]; then
    echo "ERROR: output is ${out_dur}s, over the ${MAX_SECONDS}s hard maximum after encoding (re-probe limit ${verify_limit}s = ${MAX_SECONDS}s plus ${SLACK_SECONDS}s of AAC frame padding). Inspect ${OUTPUT} and re-cut." >&2
    exit 5
fi
if [ "$codec" != "h264" ] || [ "$pix" != "yuv420p" ]; then
    echo "ERROR: output is ${codec}/${pix}, expected h264/yuv420p for YouTube compatibility" >&2
    exit 5
fi

echo "OK: ${OUTPUT}"
echo "    duration ${out_dur}s (hard max ${MAX_SECONDS}s, re-probe limit ${verify_limit}s with ${SLACK_SECONDS}s AAC padding, inputs ${total}s), codec ${codec}, pix_fmt ${pix}, faststart enabled"
