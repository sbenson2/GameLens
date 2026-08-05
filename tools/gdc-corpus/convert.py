#!/usr/bin/env python3
"""Convert downloaded .vtt captions into clean markdown transcripts.

Reads research/gdc/raw-subs/*.vtt (+ youtube-meta.tsv for metadata) and
writes research/transcripts/gdc-youtube/<id>.md. Auto-captions arrive as
rolling two-line windows, so consecutive duplicate lines are collapsed.
Resumable: existing .md files are skipped unless --force.
"""

import argparse
import re
from pathlib import Path

TAG_RE = re.compile(r"<[^>]+>")
TIMESTAMP_RE = re.compile(r"^\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->")


def parse_vtt(path: Path) -> str:
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if (
            not line
            or line.startswith(("WEBVTT", "Kind:", "Language:", "NOTE", "STYLE"))
            or TIMESTAMP_RE.match(line)
            or line.isdigit()
        ):
            continue
        text = TAG_RE.sub("", line).replace("&nbsp;", " ").replace("&amp;", "&").strip()
        if not text:
            continue
        if lines and lines[-1] == text:
            continue  # rolling-window duplicate
        lines.append(text)

    # Second pass: auto-captions also repeat lines with one-line offset
    deduped: list[str] = []
    for text in lines:
        if len(deduped) >= 2 and deduped[-2] == text:
            continue
        deduped.append(text)
    return "\n".join(deduped)


def load_meta(meta_file: Path) -> dict[str, dict[str, str]]:
    meta: dict[str, dict[str, str]] = {}
    if not meta_file.exists():
        return meta
    for row in meta_file.read_text(encoding="utf-8").splitlines():
        parts = row.split("\t")
        if len(parts) >= 5:
            meta[parts[0]] = {
                "date": parts[1],
                "duration": parts[2],
                "title": parts[3],
                "url": parts[4],
            }
    return meta


def best_vtt_per_video(subs_dir: Path) -> dict[str, Path]:
    """Pick one caption file per video id — manual `en` over `en-orig` over rest."""
    rank = {"en": 0, "en-orig": 1}
    best: dict[str, tuple[int, Path]] = {}
    for vtt in subs_dir.glob("*.vtt"):
        stem_parts = vtt.name.split(".")
        if len(stem_parts) < 3:
            continue
        vid, lang = stem_parts[0], ".".join(stem_parts[1:-1])
        score = rank.get(lang, 2)
        if vid not in best or score < best[vid][0]:
            best[vid] = (score, vtt)
    return {vid: path for vid, (_, path) in best.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="research/ directory")
    ap.add_argument("--force", action="store_true", help="rewrite existing .md files")
    args = ap.parse_args()

    out = Path(args.out)
    subs_dir = out / "gdc" / "raw-subs"
    dest = out / "transcripts" / "gdc-youtube"
    dest.mkdir(parents=True, exist_ok=True)
    meta = load_meta(out / "gdc" / "youtube-meta.tsv")

    written = skipped = 0
    for vid, vtt in sorted(best_vtt_per_video(subs_dir).items()):
        md_path = dest / f"{vid}.md"
        if md_path.exists() and not args.force:
            skipped += 1
            continue
        body = parse_vtt(vtt)
        if not body:
            continue
        m = meta.get(vid, {})
        title = m.get("title", vid)
        header = (
            "---\n"
            f"title: \"{title.replace(chr(34), chr(39))}\"\n"
            f"source: {m.get('url', f'https://www.youtube.com/watch?v={vid}')}\n"
            f"upload_date: {m.get('date', 'unknown')}\n"
            f"duration_seconds: {m.get('duration', 'unknown')}\n"
            "channel: GDC (YouTube)\n"
            "note: auto/official captions, cleaned; for local research only\n"
            "---\n\n"
        )
        md_path.write_text(header + f"# {title}\n\n{body}\n", encoding="utf-8")
        written += 1

    print(f"convert: wrote {written}, skipped {skipped} existing")


if __name__ == "__main__":
    main()
