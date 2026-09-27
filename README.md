# game-development

A game development advisor skill for AI coding agents. It helps you design, diagnose and build games, and it traces its guidance to peer-reviewed research, GDC Vault talks and established books. Every source is cited so you can check it.

The skill is named `game-development`. It follows the [Agent Skills](https://agentskills.io) format, so it works in Claude Code, Codex, opencode, Cursor and other agents that load skills.

## Install

```bash
npx skills add sbenson2/game-development
```

Or copy `skills/game-development` into your agent's skills directory:

| Agent | Directory |
| --- | --- |
| Claude Code | `~/.claude/skills/` |
| Codex, opencode | `~/.agents/skills/` |

The runtime script needs Python 3; nothing else is required.

## What it does

The agent works in two modes:

- **Consulting**: review a design, diagnose a problem ("the jump feels floaty", "everyone picks the same card", "players quit after the first boss"), or answer a design question. It gives a considered opinion and names the sources behind it.
- **Building**: implement or fix a feature, applying the relevant guidance as it goes. It raises only the design decisions that matter.

For any consequential recommendation it connects the intended experience, the observed problem, plausible causes, the smallest useful change, and the evidence that would confirm it. It keeps a source's context attached: a lesson from one shipped game or one lab study is not presented as a universal rule.

The agent loads only the references a task needs:

| Area | Reference |
| --- | --- |
| Diagnosing vague complaints | `lenses.md` (16 named lenses) |
| Core design, motivation, emergence; whole-game review | `design.md`, `holistic-design.md` |
| Balance, economies, randomness, monetization ethics | `balance.md` |
| Controls, latency, jumps, camera, juice | `game-feel.md` |
| Levels, onboarding, difficulty, puzzles | `levels.md` |
| Narrative, dialogue, quests; genre notes | `narrative.md`, `genres.md` |
| Gameplay systems, game AI, procedural generation | `systems.md`, `ai.md`, `procedural-generation.md` |
| Architecture, multiplayer, engine integration | `architecture.md`, `multiplayer.md`, `engines.md` |
| Art, UI, audio; accessibility | `presentation.md`, `accessibility.md` |
| Playtesting and evidence; production and scope | `evaluation.md`, `production.md` |

## Sources

The registry (`references/sources.jsonl`) holds 354 sources:

| Tier | Count | Used for |
| --- | --- | --- |
| GDC Vault talks | 206 | Practitioner methods and lessons from shipped games |
| Peer-reviewed papers | 86 | Measured player behavior, validated methods, frameworks |
| Books | 21 | Durable concepts and vocabulary |
| Official engine and platform docs | 41 | API and platform facts only, never design claims |

How the sources were checked:

- **Existence.** Every entry was confirmed against Crossref (DOI), the GDC Vault page (title, speaker, conference), ISBN records, or, for documentation, the cited page at its version. `tools/verify_sources.py` re-runs this check.
- **Content.** Each entry records what was read to write its summary: a talk transcript (184), the full text (92), the abstract (54) or an excerpt (24). Claims stay within what was read, and numbers and quotations come only from transcripts or full texts.
- **Claim audit.** Every sentence in the references that cites a source was checked against that source, 1,146 citations in all. 1,102 were supported as written. The other 44 were corrected: 35 overstated a finding or dropped its conditions, 7 had a wrong detail, 1 cited the wrong source, and 1 was unsupported.
- **Uncited text.** Guidance without a citation is the skill's own reasoning, and it is written as such.

Look up sources from the skill directory:

```bash
python3 scripts/sources.py find jump buffering
python3 scripts/sources.py show fan2012-pvz
```

No skill, source or test guarantees a good game. Treat design advice as hypotheses, and verify it with your own playtests.

## Tested

Behavior evals with `claude plugin eval`, run on 2026-09-26. Each run is an isolated session with only this skill installed, 2 runs per case, and the latest run per model:

| | Haiku 4.5 | Sonnet 5 | Opus 5.5 |
| --- | --- | --- | --- |
| Skill loaded on 11 should-fire prompts (design questions, gameplay code, finding talks) | 100% | 100% | 100% |
| Skill loaded on 10 near misses (game trivia, emulator setup, general web and backend code) | 0% | 0% | 0% |
| Advice rubric passed, with vs. without the skill | 6/10 vs. 3/10 | 8/10 vs. 6/10 | 10/10 vs. 8/10 |
| Replies linking a registered source | 2/10 | 8/10 | 10/10 |
| Replies containing a URL outside the registry | 0/10 | 0/10 | 0/10 |

How to read these results:
- **Trigger rates are an upper bound.** In a real setup, other installed skills compete for the same prompts.
- **Samples are small.** Each result comes from 2 runs per case.
- **Advice was scored by a Sonnet judge** against written rubrics.
- **Smaller models use the skill less faithfully:** Haiku improves its advice but rarely links its sources.

`evals/` holds the suite. See CONTRIBUTING.md to run it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the source policy, registry schema, writing standard and maintainer tools. The main checks:

```bash
python3 -m unittest discover -s tests
python3 tools/check_citations.py
python3 tools/verify_sources.py
```

## History

This repository previously held an MCP server, published to npm as `gamecodex` (now deprecated, with a pointer here). The skill replaces it: it needs no server and carries its own verified sources. The server code remains in the git history.

## License

MIT for the skill's text and tools. Cited works belong to their authors and publishers. The skill contains only original summaries and links, never transcripts or excerpts.
