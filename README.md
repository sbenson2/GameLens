# game-development

A game development advisor skill for AI coding agents. It helps you design, diagnose and build games, and it traces its guidance to peer-reviewed research, GDC Vault talks and established books. Every source is cited so you can check it.

The skill is named `game-development` and follows the open [Agent Skills](https://agentskills.io) format. Agents that support skills load it on their own when a request calls for it. Any other agent that can read files can use it through a short pointer in its instructions file.

## Install

```bash
npx skills add sbenson2/game-development
```

The [skills CLI](https://github.com/vercel-labs/skills) supports 79 agents as of version 1.7.0, among them Claude Code, Codex, Cursor, GitHub Copilot, Gemini CLI, opencode, Qwen Code, Windsurf, Cline, Goose, Amp and Warp. It asks which agents to install for. Use `-a <agent>` to name them, and `-g` to install for your user account instead of the current project.

In Claude Code you can install it as a plugin instead:

```text
/plugin marketplace add sbenson2/game-development
/plugin install game-development@game-development
```

Use one method, not both; with both, the skill loads twice.

To install by hand, copy or symlink `skills/game-development` into a skills folder your agent reads. Many agents share `.agents/skills`:

| Agent | Project folder | User folder |
| --- | --- | --- |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| opencode | `.agents/skills/` | `~/.agents/skills/` or `~/.config/opencode/skills/` |
| Qwen Code | `.agents/skills/` or `.qwen/skills/` | `~/.agents/skills/` or `~/.qwen/skills/` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` |
| GitHub Copilot | `.agents/skills/` | `~/.copilot/skills/` |
| Gemini CLI | `.agents/skills/` | `~/.gemini/skills/` |
| Cline, Warp, Zed | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Goose | `.goose/skills/` | `~/.config/goose/skills/` |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` |

Folders for agents not tested here come from the skills CLI's agent list, which also covers the rest. Install the skill in one folder per agent; an agent that reads two folders may list the skill twice.

The lookup script needs Python 3. Without it, the agent searches the source lists in the reference files instead.

### Agents without skill support

An agent that follows a project instructions file and can read files can use the skill through a pointer. Copy `skills/game-development` into your project as `docs/game-development`. Then add this to the instructions file the agent reads, such as `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, or a Cursor or Windsurf rule:

```markdown
## Game development

When designing, reviewing or diagnosing a game, writing or changing gameplay code (player movement, jumps, cameras, combat, enemy AI, inventories, saves), or looking for GDC talks or research on a game-design question, first read `docs/game-development/SKILL.md` and follow it. Paths in it are relative to that folder. Skip it for tasks that only involve games in passing, such as game trivia, tool setup, or code that is not part of a game.
```

Aider works from the files you add to the chat. Add SKILL.md and the reference for your question as read-only files; the routing table in SKILL.md says which reference covers what:

```bash
aider --read docs/game-development/SKILL.md --read docs/game-development/references/game-feel.md
```

In a chat app that supports skills, such as Claude's apps, zip the `game-development` folder and upload it as a skill. In other chat apps, attach SKILL.md and the relevant references to the conversation.

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

The registry (`references/sources.jsonl`) holds 355 sources:

| Tier | Count | Used for |
| --- | --- | --- |
| GDC Vault talks | 206 | Practitioner methods and lessons from shipped games |
| Peer-reviewed papers | 86 | Measured player behavior, validated methods, frameworks |
| Books | 21 | Durable concepts and vocabulary |
| Official engine and platform docs | 42 | API and platform facts only, never design claims |

How the sources were checked:

- **Existence.** Every entry was confirmed against Crossref (DOI), the GDC Vault page (title, speaker, conference), ISBN records, or, for documentation, the cited page at its version. `tools/verify_sources.py` re-runs this check.
- **Content.** Each entry records what was read to write its summary: a talk transcript (184), the full text (93), the abstract (54) or an excerpt (24). Claims stay within what was read, and numbers and quotations come only from transcripts or full texts.
- **Claim audit.** Every sentence in the references that cites a source was checked against that source, 1,146 citations in all. 1,102 were supported as written. The other 44 were corrected: 35 overstated a finding or dropped its conditions, 7 had a wrong detail, 1 cited the wrong source, and 1 was unsupported.
- **Uncited text.** Guidance without a citation is the skill's own reasoning, and it is written as such.

Look up sources from the skill directory:

```bash
python3 scripts/sources.py find jump buffering
python3 scripts/sources.py show fan2012-pvz
```

No skill, source or test guarantees a good game. Treat design advice as hypotheses, and verify it with your own playtests.

## Tested

Behavior evals from 2026-09-26. Every agent ran the same cases from `evals/` in isolated sessions where this was the only skill available:

- **Claude Code** (Haiku 4.5, Sonnet 5, Opus 5.5) through `claude plugin eval`: 3 runs per trigger case and 4 per quality case in each arm.
- **Codex** (gpt-6-sol, medium reasoning) and **opencode** (DeepSeek V4.1 Flash) through `tools/agent_evals.py`: 2 runs per case in each arm.

| | Haiku 4.5 | Sonnet 5 | Opus 5.5 | Codex | opencode |
| --- | --- | --- | --- | --- | --- |
| Skill loaded when it should (design questions, gameplay code, finding talks) | 32/33 | 33/33 | 33/33 | 22/22 | 22/22 |
| Skill loaded on near misses (game trivia, emulator setup, general code) | 0/30 | 0/30 | 0/30 | 0/20 | 3/20 |
| Advice rubric passed, with vs. without the skill | 13/20 vs. 5/20 | 20/20 vs. 9/20 | 20/20 vs. 16/20 | 10/10 vs. 10/10 | 10/10 vs. 10/10 |
| Replies linking a registered source, with vs. without | 7/20 vs. 0/20 | 18/20 vs. 0/20 | 20/20 vs. 3/20 | 10/10 vs. 4/10 | 10/10 vs. 2/10 |
| Replies with no link outside the registry, with vs. without | 19/20 vs. 19/20 | 20/20 vs. 20/20 | 20/20 vs. 19/20 | 8/10 vs. 2/10 | 10/10 vs. 10/10 |

The pointer for agents without skill support was tested the same way, 1 run per case. The skill was in `docs/game-development`, and the snippet above in AGENTS.md was the only way to find it:

- **Codex and opencode** each read SKILL.md on 11/11 should-fire prompts and on 2/10 near misses.
- **Quality questions:** replies linked a registered source 5/5 times, against 2/5 (Codex) and 1/5 (opencode) without the skill.

Qwen Code 0.21.8 had a smoke test only: it lists the skill from `.agents/skills` and calls it on a game-feel question.

How to read these results:
- **Trigger rates are an upper bound.** In a real setup, other installed skills compete for the same prompts.
- **Scoring:** advice was scored by a Sonnet judge against written rubrics. Codex and opencode passed the rubrics with or without the skill; for them, the skill's effect shows in the sourcing rows.
- **What the link check counts:** any URL not in the registry, including real pages the registry doesn't list. It measures unverified links, not broken ones.
- **The near misses opencode loaded the skill on** were a Flask leaderboard bug (twice) and a Blender glTF export question (once).
- **Other paths to sources:** in 2 of opencode's 10 with-skill quality runs, it used its built-in web search instead of the skill.
- **The pointer's wording was revised once.** The first version named only what the skill is for, and opencode read the skill on 6 of 10 near misses. Adding what it is not for brought that to 2 of 10. The near-miss cases informed that change, so treat the pointer's rates as less independent than the others.
- **Smaller models use the skill less faithfully:** Haiku improves its advice but links its sources less often.

`evals/` holds the suite. CONTRIBUTING.md explains how to run it against Claude Code or any other agent CLI.

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
