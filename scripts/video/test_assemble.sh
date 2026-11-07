#!/usr/bin/env bash
#
# test_assemble.sh: synthetic end to end check for assemble.sh.
#
# No real footage needed. It builds tiny color clips with ffmpeg, runs the
# real assemble.sh over them, and asserts:
#   1. three 5s clips assemble to about 15s, h264/yuv420p output,
#   2. a 150s clip list is REFUSED without --allow-trim (exit code 4,
#      loud message, no output file),
#   3. the same 150s list assembles to at most 120s WITH --allow-trim,
#   4. a missing --subtitles path fails with the friendly message (exit 2,
#      no raw cd error from abspath, no output file).
#
# Usage: ./scripts/video/test_assemble.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ASSEMBLE="$HERE/assemble.sh"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/video_kit_test.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

failures=0

pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; failures=$((failures + 1)); }

dur() {
    ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$1"
}

stream_field() {
    # stream_field FILE FIELD
    ffprobe -v error -select_streams v:0 -show_entries "stream=$2" -of csv=p=0 "$1"
}

make_clip() {
    # make_clip PATH SECONDS COLOR
    ffmpeg -hide_banner -loglevel error -y \
        -f lavfi -i "color=c=$3:s=320x240:r=30:d=$2" \
        -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$1"
}

close_to() {
    # close_to VALUE TARGET TOLERANCE
    awk -v v="$1" -v t="$2" -v tol="$3" 'BEGIN { d = v - t; if (d < 0) d = -d; exit !(d <= tol) }'
}

echo "== test 1: three 5s clips assemble to about 15s =="
make_clip "$WORK/a.mp4" 5 red
make_clip "$WORK/b.mp4" 5 lime
make_clip "$WORK/c.mp4" 5 blue

if "$ASSEMBLE" -o "$WORK/short.mp4" "$WORK/a.mp4" "$WORK/b.mp4" "$WORK/c.mp4" > "$WORK/short.log" 2>&1; then
    pass "assemble.sh exited 0 on a valid 15s input"
    d="$(dur "$WORK/short.mp4")"
    if close_to "$d" 15 0.6; then
        pass "output duration ${d}s is within 0.6s of 15s"
    else
        fail "output duration ${d}s should be about 15s"
    fi
    if [ "$(stream_field "$WORK/short.mp4" codec_name)" = "h264" ]; then
        pass "output video codec is h264"
    else
        fail "output video codec should be h264, got $(stream_field "$WORK/short.mp4" codec_name)"
    fi
    if [ "$(stream_field "$WORK/short.mp4" pix_fmt)" = "yuv420p" ]; then
        pass "output pix_fmt is yuv420p"
    else
        fail "output pix_fmt should be yuv420p, got $(stream_field "$WORK/short.mp4" pix_fmt)"
    fi
else
    fail "assemble.sh exited non-zero on a valid 15s input"
    cat "$WORK/short.log" >&2
fi

echo "== test 2: 150s input is refused without --allow-trim =="
make_clip "$WORK/long1.mp4" 50 red
make_clip "$WORK/long2.mp4" 50 lime
make_clip "$WORK/long3.mp4" 50 blue

if "$ASSEMBLE" -o "$WORK/should_not_exist.mp4" \
        "$WORK/long1.mp4" "$WORK/long2.mp4" "$WORK/long3.mp4" > "$WORK/long.log" 2>&1; then
    fail "assemble.sh accepted a 150s input without --allow-trim"
else
    rc=$?
    if [ "$rc" -eq 4 ]; then
        pass "refused with exit code 4 (over the hard maximum)"
    else
        fail "expected exit code 4 for an overlong input, got $rc"
    fi
    if grep -q "hard maximum" "$WORK/long.log"; then
        pass "refusal message mentions the hard maximum"
    else
        fail "refusal message missing 'hard maximum'"
        cat "$WORK/long.log" >&2
    fi
    if [ -e "$WORK/should_not_exist.mp4" ]; then
        fail "no output file should exist after a refusal"
    else
        pass "no output file was written on refusal"
    fi
fi

echo "== test 3: --allow-trim cuts the 150s input to at most 120s =="
if "$ASSEMBLE" -o "$WORK/trimmed.mp4" --allow-trim \
        "$WORK/long1.mp4" "$WORK/long2.mp4" "$WORK/long3.mp4" > "$WORK/trim.log" 2>&1; then
    pass "assemble.sh exited 0 with --allow-trim"
    d="$(dur "$WORK/trimmed.mp4")"
    if awk -v v="$d" 'BEGIN { exit !(v >= 119.0 && v <= 120.5) }'; then
        pass "trimmed duration ${d}s is inside [119.0, 120.5]s"
    else
        fail "trimmed duration ${d}s should be about 120s"
        cat "$WORK/trim.log" >&2
    fi
else
    fail "assemble.sh failed with --allow-trim"
    cat "$WORK/trim.log" >&2
fi

echo "== test 4: a missing --subtitles path fails with the friendly message =="
if "$ASSEMBLE" -o "$WORK/should_not_exist_subs.mp4" \
        --subtitles "$WORK/does_not_exist.srt" "$WORK/a.mp4" > "$WORK/subs.log" 2>&1; then
    fail "assemble.sh accepted a missing --subtitles file"
else
    rc=$?
    if [ "$rc" -eq 2 ] \
            && grep -q "subtitle file not found" "$WORK/subs.log" \
            && ! grep -q "cd:" "$WORK/subs.log" \
            && [ ! -e "$WORK/should_not_exist_subs.mp4" ]; then
        pass "missing subtitles exit 2 with the friendly message, no cd error, no output"
    else
        fail "expected exit 2 'subtitle file not found' without a cd error, got rc=$rc"
        cat "$WORK/subs.log" >&2
    fi
fi

echo "== result =="
if [ "$failures" -eq 0 ]; then
    echo "ALL TESTS PASSED"
    exit 0
fi
echo "$failures TEST(S) FAILED" >&2
exit 1
