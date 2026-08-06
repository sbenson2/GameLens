#!/usr/bin/env python3
"""Crawl the GDC Vault free section (gdcvault.com/free).

Stages (all resumable via research/gdc/vault-done/ markers):
1. Fetch /free → discover per-conference listing slugs (gdc-24, cgdc-96, …).
2. Fetch each conference listing → collect /play/<id>/ talk links.
3. Fetch each talk page → title, description, speakers, any .pdf links,
   any embedded YouTube id. Append to vault-catalog.jsonl.
4. Download linked PDFs into research/slides/.

Stdlib only. Polite: one request per DELAY seconds, custom UA.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path

BASE = "https://gdcvault.com"
UA = "gdc-corpus-research/1.0 (personal research; contact: 46143954+sbenson2@users.noreply.github.com)"
DELAY = 1.0

CONF_RE = re.compile(r'href="/free/([a-zA-Z0-9-]+)/?"')
PLAY_RE = re.compile(r'href="(/play/(\d+)[^"]*)"')
TITLE_RE = re.compile(r"<title>\s*GDC Vault\s*-\s*(.*?)\s*</title>", re.S)
PDF_RE = re.compile(r'href="([^"]+\.pdf)"', re.I)
YT_RE = re.compile(r'(?:youtube\.com/embed/|youtu\.be/|youtube\.com/watch\?v=)([A-Za-z0-9_-]{11})')
META_DESC_RE = re.compile(
    r'<meta\s+(?:name|property)="(?:og:)?description"\s+content="([^"]*)"', re.I
)


def fetch(url: str) -> str | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as err:
        print(f"  ! {url}: {err}", file=sys.stderr)
        return None
    finally:
        time.sleep(DELAY)


def discover_conferences() -> list[str]:
    html = fetch(f"{BASE}/free") or ""
    slugs = sorted(set(CONF_RE.findall(html)))
    return [s for s in slugs if s.lower() != "free"]


def talks_for_conference(slug: str) -> dict[str, str]:
    """Return {talk_id: play_path} for one conference's free listing."""
    html = fetch(f"{BASE}/free/{slug}") or ""
    talks: dict[str, str] = {}
    for path, talk_id in PLAY_RE.findall(html):
        talks.setdefault(talk_id, path)
    return talks


def parse_talk(talk_id: str, path: str, slug: str) -> dict | None:
    html = fetch(BASE + urllib.parse.quote(path, safe="/:?&=()-"))
    if html is None:
        return None
    title_m = TITLE_RE.search(html)
    desc_m = META_DESC_RE.search(html)
    yt_m = YT_RE.search(html)
    return {
        "id": talk_id,
        "url": BASE + path,
        "conference": slug,
        "title": unescape(title_m.group(1)).strip() if title_m else None,
        "description": unescape(desc_m.group(1)).strip() if desc_m else None,
        "pdfs": sorted(set(PDF_RE.findall(html))),
        "youtube_id": yt_m.group(1) if yt_m else None,
    }


def download_pdf(pdf_url: str, talk_id: str, slides_dir: Path) -> None:
    if pdf_url.startswith("//"):
        pdf_url = "https:" + pdf_url
    elif pdf_url.startswith("/"):
        pdf_url = BASE + pdf_url
    name = f"{talk_id}-{Path(urllib.parse.urlparse(pdf_url).path).name}"
    dest = slides_dir / name
    if dest.exists():
        return
    req = urllib.request.Request(pdf_url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
            fh.write(resp.read())
        print(f"  pdf: {name}")
    except (urllib.error.URLError, TimeoutError) as err:
        print(f"  ! pdf {pdf_url}: {err}", file=sys.stderr)
        dest.unlink(missing_ok=True)
    finally:
        time.sleep(DELAY)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="research/ directory")
    ap.add_argument("--conferences", help="comma-separated slugs (default: all discovered)")
    ap.add_argument("--limit", type=int, help="max talks per conference (for sampling)")
    ap.add_argument("--no-pdfs", action="store_true")
    args = ap.parse_args()

    out = Path(args.out)
    gdc = out / "gdc"
    done_dir = gdc / "vault-done"
    slides_dir = out / "slides"
    for d in (gdc, done_dir, slides_dir):
        d.mkdir(parents=True, exist_ok=True)
    catalog = gdc / "vault-catalog.jsonl"

    slugs = (
        [s.strip() for s in args.conferences.split(",") if s.strip()]
        if args.conferences
        else discover_conferences()
    )
    print(f"vault: {len(slugs)} conference listings")

    for slug in slugs:
        talks = talks_for_conference(slug)
        items = sorted(talks.items())
        if args.limit:
            items = items[: args.limit]
        pending = [(tid, p) for tid, p in items if not (done_dir / tid).exists()]
        print(f"{slug}: {len(items)} free talks, {len(pending)} to crawl")
        for talk_id, path in pending:
            record = parse_talk(talk_id, path, slug)
            if record is None:
                continue  # transient failure — retried on next run
            with open(catalog, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False) + "\n")
            if not args.no_pdfs:
                for pdf in record["pdfs"]:
                    download_pdf(pdf, talk_id, slides_dir)
            (done_dir / talk_id).touch()

    print("vault: done")


if __name__ == "__main__":
    main()
