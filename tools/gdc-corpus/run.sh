#!/usr/bin/env bash
# GDC corpus fetcher — see README.md. All stages resumable.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/research"
GDC="$OUT/gdc"
CHANNEL="https://www.youtube.com/channel/UC0JB7TSe49lg56u6qH8y_MQ/videos"

mkdir -p "$GDC/raw-subs" "$OUT/transcripts/gdc-youtube" "$OUT/slides"

youtube() {
  local extra=("$@")
  local tab=$'\t'
  yt-dlp \
    --skip-download \
    --write-subs --write-auto-subs \
    --sub-langs "en,en-orig" --sub-format vtt \
    --sleep-requests 2.5 \
    --download-archive "$GDC/youtube-archive.txt" \
    --force-write-archive \
    --print-to-file "%(id)s${tab}%(upload_date)s${tab}%(duration)s${tab}%(title)s${tab}%(webpage_url)s" "$GDC/youtube-meta.tsv" \
    --no-warnings --ignore-errors \
    -o "$GDC/raw-subs/%(id)s.%(ext)s" \
    ${extra[@]+"${extra[@]}"} \
    "$CHANNEL"
}

case "${1:-}" in
  sample)
    youtube --playlist-items 1-8
    python3 "$HERE/vault.py" --out "$OUT" --conferences gdc-24 --limit 5
    python3 "$HERE/convert.py" --out "$OUT"
    ;;
  youtube)
    youtube
    ;;
  vault)
    python3 "$HERE/vault.py" --out "$OUT"
    ;;
  convert)
    python3 "$HERE/convert.py" --out "$OUT"
    ;;
  *)
    echo "usage: $0 {sample|youtube|vault|convert}" >&2
    exit 1
    ;;
esac
