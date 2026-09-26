# GDC corpus tools

Downloads the freely available GDC knowledge for **local research use**:

1. **YouTube transcripts** — every talk on the official GDC channel
   (`UC0JB7TSe49lg56u6qH8y_MQ`, "GDC Festival of Gaming") has English
   captions. We fetch captions + metadata only, never video.
2. **GDC Vault free section** (gdcvault.com/free) — per-conference catalogs
   of every free talk (title, description, speakers) and any slide PDFs
   linked from talk pages.

Everything lands in `research/` (gitignored — this corpus must never be
committed or redistributed; GDC talks are copyrighted, "free to watch" is
not "free to republish"). Its only sanctioned use here is as background
reading when writing **original distillations** for lens content, per the
content rules in `CONTRIBUTING.md`.

## Requirements

`yt-dlp` and `python3` (both on PATH; `brew install yt-dlp` if missing).

## Usage

```bash
cd tools/gdc-corpus

./run.sh sample   # smoke test: 8 videos + 1 vault conference
./run.sh youtube  # full transcript pull (resumable; hours on first run)
./run.sh vault    # full vault catalog + PDFs (resumable; ~1h)
./run.sh convert  # raw .vtt → clean markdown in research/transcripts/
```

Every stage is resumable — rerun the same command and it continues where it
stopped (`--download-archive` for YouTube, done-markers for the vault).

## Output layout

```
research/
├── gdc/
│   ├── youtube-meta.tsv         id, upload date, duration, title, url
│   ├── youtube-archive.txt      yt-dlp resume state
│   ├── raw-subs/                as-downloaded .vtt captions
│   ├── vault-catalog.jsonl      one JSON object per free vault talk
│   └── vault-done/              per-talk crawl markers
├── transcripts/gdc-youtube/     <id>.md — cleaned transcript + frontmatter
└── slides/                      <talk id>-<file>.pdf from vault pages
```
