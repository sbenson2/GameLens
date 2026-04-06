# Schema Quality Audit — gamecodex

**Date:** 2026-03-24
**Purpose:** Marketing ammunition + compliance with emerging agent-friendly schema standards

---

## Our Score

| Metric | Value | Grade |
|--------|-------|-------|
| Total tools | 10 | — |
| Total schema tokens | ~829 | A |
| Tokens per tool (avg) | ~83 | A |
| Largest tool schema | search_docs (~201 tokens) | B+ |
| Smallest tool schema | license_info (~19 tokens) | A+ |

## Competitive Comparison

| Server | Tools | Total Tokens | Per-Tool Avg | Grade |
|--------|-------|-------------|-------------|-------|
| **gamecodex** | 10 | ~829 | ~83 | **A** |
| PostgreSQL MCP | 1 | 46 | 46 | A+ |
| Context7 | 2 | 1,020 | 510 | F (7.5/100) |
| GoPeak/Godot MCP | 95+ | ~8,000+ (est.) | ~84 (est.) | D (volume) |
| StraySpark Unreal MCP | 207 | ~17,000+ (est.) | ~82 (est.) | F (volume) |

### Key Insights

1. **We're 6.1× more efficient per tool than Context7** (the #1 MCP server globally at 50K⭐)
2. **19% less total tokens despite 5× more tools** than Context7
3. **GoPeak (95 tools) and StraySpark (207 tools) consume 10-20× our total tokens** — massive context window overhead that directly harms agent performance
4. Perplexity CTO cited "72% context waste" from MCP tools — that's the tool-heavy problem, not us

## Marketing Copy

### One-Liner
> "10 tools, 829 tokens. Context7 uses 1,020 tokens for 2 tools."

### Longer Version
> "Most MCP servers waste your context window on tool schemas alone — the #1 MCP server globally burns 1,020 tokens before doing anything useful. gamecodex delivers 10 specialized tools in 829 tokens. That's 6× more efficient per tool and 19% less total, leaving your context window for actual game development."

### README Badge Idea
```
Schema Efficiency: A (83 tokens/tool)
```

### Social Media
> When Perplexity's CTO says MCP wastes 72% of context on schemas, he's talking about servers with 95+ tools.
>
> gamecodex: 10 tools, 829 tokens, zero bloat.
> Context7 (#1 MCP server, 50K⭐): 2 tools, 1,020 tokens.
>
> Knowledge > Tools.

## Optimization Opportunities

### search_docs (201 tokens → target: ~150)
Current description is verbose. Can trim "Use this when you need to find guides, references, or explanations for a specific gamedev topic." — the tool name is self-explanatory.

### get_doc (129 tokens → target: ~100)
"Returns the full document content" is implied. Trim to focus on section/maxLength guidance.

### list_docs (111 tokens → target: ~85)
"Use full mode (default) for titles and descriptions" can be removed.

## Schema Optimization Plan

After trimming, estimated total: ~680 tokens (10 tools at ~68 avg).
That's **33% less than Context7 with 5× more tools**.

---

## Notes

- Claude Code v2.1.7 shipped "MCP Tool Search" lazy loading (95-99% context savings for large tool sets) — partially neutralizes our advantage for Claude users specifically
- Cursor, Windsurf, Copilot, and other MCP clients do NOT have lazy loading — our efficiency matters most for them
- The DEV Community article scoring Context7 at F (7.5/100) uses the agent-friend scoring system — we should submit our server for scoring
