# GameLens

This repository publishes one agent skill, **`skills/game-development`**. It is a game development advisor for AI coding agents, and all of its guidance traces to verified sources: peer-reviewed research, GDC Vault talks, and canonical books. It was an MCP server through v3.0.0; the server was retired in favor of the skill. The last server code is at commit `031d4aa` (the parent of the conversion).

## Layout

```
skills/game-development/     <- the product; everything here ships to users
  SKILL.md                   <- entry point: advisor role, routing table, citation rules
  references/*.md            <- topic references, each ending in a generated ## Sources
  references/sources.jsonl   <- verified source registry (one JSON object per line)
  scripts/sources.py         <- runtime lookup over the registry (stdlib only)
tools/                       <- maintainer tooling, not shipped
  sourcelib.py               <- schema, topics, citation parsing
  check_citations.py         <- offline integrity check; --write regenerates Sources sections
  verify_sources.py          <- network check against Crossref / GDC Vault / ISBN records
  lookup.py                  <- inspect a candidate source (vault / doi / isbn / title)
  talk_transcript.py         <- captions for a talk from the official GDC YouTube channel
  merge_fragments.py         <- merge draft registries (build/fragments/*.jsonl) into the registry
  audit_manifest.py          <- claim audit: every source with every line citing it; --coverage
  apply_findings.py          <- apply audit verdicts (exact-quote fixes, registry corrections)
  search_corpus.py           <- search the local research corpus
  gdc-corpus/                <- bulk corpus downloaders (yt-dlp, Vault crawler)
tests/                       <- python -m unittest discover -s tests
research/                    <- local research corpus; gitignored, never commit or redistribute
build/                       <- scratch for drafting; gitignored
```

## Commands

```bash
python3 -m unittest discover -s tests          # tool tests (offline)
python3 tools/check_citations.py --write       # after editing references or the registry
python3 tools/verify_sources.py                # after adding sources (network; cached in tools/.verify-cache/)
python3 skills/game-development/scripts/sources.py find <words>
```

## Rules

- `CONTRIBUTING.md` is the authoring standard for sources and reference text. Read it before changing content.
- Every attributed claim cites a registry entry inline as `[@id]`. Uncited text is the skill's own reasoning and must read that way.
- Read a source before citing it, and record what was read in `checked.content`. After substantial new content, run a claim audit (CONTRIBUTING.md, "Claim audits"). Never add a source from memory. `verify_sources.py` must report 0 failed.
- Engine and platform documentation (`official-docs`) backs API facts only, never design claims.
- Summaries are original wording. Never copy transcripts, slides or book text into the skill.
- Keep the skill portable: no machine-specific paths, tool names or services in `skills/`.
- Plain, factual language in all content: no slogans, hype or invented metrics.

## Remotes

GitHub `sbenson2/GameLens` (origin) is canonical; GitLab `sbenson2/GameCodex` is a mirror. The local directory is still `~/Developer/GameCodex`. npm `gamecodex` (last 2.0.1) is retired, and `gamelens` was never published. Nothing in this repository publishes to npm.
