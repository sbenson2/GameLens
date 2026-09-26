# Contributing

This repository publishes one agent skill, `skills/game-development`. It advises game developers who work with AI coding agents, using design, engineering and production knowledge that traces to checkable sources. This guide is the authoring standard for the skill's text and its source registry.

## What may back a claim

| Tier | Admissible | Verified by |
| --- | --- | --- |
| `peer-reviewed` | Journal articles and full conference papers from peer-reviewed venues (for example CHI, CHI PLAY, FDG, DiGRA, AIIDE, IEEE CoG/ToG, Entertainment Computing, Games and Culture, Game Studies). | DOI metadata from Crossref. A venue without DOIs (DiGRA library, AAAI workshop reports) needs a stable URL and `notes` naming the venue and its review. |
| `gdc` | Talks in the GDC Vault, including GDC Europe, GDC Online, GDC Next, GDC China, GDC Austin, VRDC and the GDC Summer and Showcase events. | The Vault page's session title, speaker and conference. |
| `book` | Books from established publishers or well-known practitioner books. | ISBN metadata from Open Library or Google Books. |
| `official-docs` | Engine, platform or middleware documentation. **Only** for API behavior, platform requirements and tool facts, never for design claims. | The page loads. |

Not admissible as a source: blogs, magazine articles, forum posts, YouTube channels other than GDC's official uploads of Vault talks, preprints that were never peer-reviewed, extended abstracts presented as full papers, AI summaries, and other agent skills. They may help you find a source; the claim must still cite the source itself.

Choose the source that actually supports the claim, not the most famous name. Measured player-behavior claims need empirical research. A practitioner's lesson is evidence of what worked on their project, stated with that context. A book is a durable synthesis; cite it for concepts, not for measured effects it does not report.

## Registry entries

`skills/game-development/references/sources.jsonl`, one JSON object per line:

```json
{"id": "meier2012-decisions", "tier": "gdc", "title": "Interesting Decisions", "authors": ["Sid Meier"], "year": 2012, "venue": "Game Developers Conference 2012", "url": "https://gdcvault.com/play/1015756/Interesting", "access": "free", "topics": ["design", "decisions"], "summary": "...", "evidence": "practitioner", "checked": {"date": "2026-09-26", "metadata": "vault", "content": "transcript"}}
```

- `id`: first author's surname + year + a short slug, lowercase ASCII (`hunicke2004-mda`). Keep an existing id when the source is already registered.
- `title`, `authors`, `year`, `venue`: as published. For a talk, the year is the conference year.
- `url`: canonical location (Vault page, publisher page, or DOI landing). Also give `doi` (bare, `10.1145/...`) or `isbn` (13 digits, no hyphens) where they exist. `alt_urls` may list a free copy such as the official GDC YouTube upload or an author-hosted PDF.
- `access`: `free`, `paywalled`, `members` (Vault members only) or `purchase`.
- `topics`: tags from the controlled list in `tools/sourcelib.py`.
- `summary`: at most 700 characters, original wording, with no gendered pronouns for real people. State what the source argues or found and under what conditions (population, genre, method, scale). No quotations longer than a short phrase.
- `evidence`: `empirical` (a measured study), `practitioner` (experience from shipped work), `theory` (a conceptual framework), `technical` (an engineering method or documented behavior).
- `checked.metadata`: how existence was confirmed (`crossref`, `vault`, `openlibrary`, `publisher`, `manual`). `checked.content`: what you actually read to confirm the summary: `full-text`, `transcript`, `abstract` or `excerpt` (for example publisher sample chapters or a free online edition). Summaries and the claims that cite them must stay within what you read. If you only read an abstract, claim only what the abstract says.
- `notes` (optional): anything a later reviewer needs, such as a venue's review process or a known erratum.

## Verification

```bash
python3 tools/lookup.py vault 1015756          # title, speakers, year, abstract, local transcript
python3 tools/lookup.py doi 10.1007/s11031-006-9051-8
python3 tools/lookup.py isbn 9781138632059
python3 tools/lookup.py title "GameFlow: a model for evaluating player enjoyment"
python3 tools/talk_transcript.py "How I Got My Mom to Play Through Plants vs. Zombies" --speaker "George Fan"
python3 tools/search_corpus.py --query 'camera' --source talks --full-text   # local research corpus
python3 tools/verify_sources.py                 # every registry entry; must report 0 failed
python3 tools/check_citations.py --write        # citations resolve; regenerates Sources sections
python3 -m unittest discover -s tests
```

### Claim audits

A claim audit checks every sentence that cites a source against the source itself. The skill's first full audit (2026-09-26) checked 1,146 citation uses; 1,102 were supported as written and 44 were corrected (35 overstated, 7 wrong details, 1 misattributed, 1 unsupported). Re-run an audit after substantial new content:

```bash
python3 tools/audit_manifest.py --out build/audit --batches 10   # every source with every line that cites it
# auditors append one verdict per use (and one per registry entry) to build/audit/findings/*.jsonl
python3 tools/audit_manifest.py --coverage --out build/audit      # every use must have a verdict
python3 tools/apply_findings.py                                  # exact-quote fixes; conflicts go to build/audit/manual.jsonl
```

Verdicts are `supported`, `overstated`, `wrong-detail`, `unsupported`, `misattributed` and `unverifiable`. A non-supported record carries the exact `quote` from the line and its `fix`. After applying the fixes, read each edited file in full to repair the prose, then run the checks below.

`verify_sources.py` proves a source exists as cited. It cannot prove a summary is faithful: that is the author's responsibility, recorded in `checked.content`. Captions can mistranscribe names and numbers; check anything exact against slides or a second source. The `research/` corpus (transcripts, Vault catalog, slides) is local research material: never commit or redistribute it.

## Writing reference files

Reference files live in `skills/game-development/references/`. An agent loads one or two per task, so each must stand alone.

- Open with one or two sentences saying when to read the file.
- Organize by the problems a developer brings, not by source. Each section should help the agent diagnose, advise and choose a check.
- Cite inline with `[@id]` or `[@id-one; @id-two]` directly after the claim the source supports. Uncited guidance is the skill's own engineering or design synthesis; write it as reasoning, not as a finding.
- Attribute practitioner advice to its context: "On Plants vs. Zombies, Fan introduced one mechanic per level [@fan2012-pvz]", not "games should introduce one mechanic per level".
- For empirical findings, give the condition that limits them ("in a lab study of a single action RPG"). Do not generalize a single study into a law.
- Numbers (latency thresholds, frame windows, word limits) appear only when the cited source states them and `checked.content` covers where it does. Present them as that source's values, not universal targets.
- Where sources disagree, keep both and state the conditions under which each applies.
- Keep the user's intended experience first. Heuristics are hypotheses to test against it.
- Refer to speakers, authors and other real people by surname or role ("the speaker", "the authors"). Never use gendered pronouns for them, because a name does not tell you someone's pronouns.
- Plain, factual language. No slogans, hype, invented metrics or rhetorical flourishes. Short paragraphs and tables where they aid scanning.
- Target 150 to 250 lines per file. End with a `## Sources` section generated by `tools/check_citations.py --write`; do not edit it by hand.
