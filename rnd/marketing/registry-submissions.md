# MCP Registry Submission Drafts

Prepared: 2026-03-20

---

## 1. mcp.so

**URL:** https://mcp.so/submit (or GitHub PR to their registry repo)

### Listing Details

- **Name:** GameDev MCP Server
- **Short description:** Permanent game development knowledge for AI coding assistants. 130+ curated docs covering design patterns, engine architecture, and implementation guides for MonoGame, Godot, and Unity.
- **Category:** Development Tools / Game Development
- **Tags:** `game-development`, `gamedev`, `godot`, `monogame`, `unity`, `game-design`, `mcp`, `knowledge-base`
- **npm package:** `gamedev-mcp-server`
- **GitHub:** https://github.com/sbenson2/gamedev-mcp-server
- **Author:** sbenson2
- **License:** MIT
- **Transport:** stdio
- **Install command:** `npx -y gamedev-mcp-server`

### Long Description

GameDev MCP Server gives your AI assistant permanent game development knowledge — design patterns, architecture guides, and engine-specific implementation details delivered through MCP.

**130+ curated docs** covering:
- Game design (genres, game feel, balancing, progression)
- Architecture (ECS, state machines, scene management, signals)
- Programming patterns (19 game-specific patterns with implementation)
- Engine guides: MonoGame/Arch ECS (68 guides), Godot 4.4+ (5 docs, growing), Unity (planned)
- Core concepts (camera, physics, pathfinding, networking, particles)

**Context-efficient:** Section extraction and maxLength params mean your AI gets precisely the knowledge it needs without burning your context window. 6 focused tools, not 50.

**Free tier included.** Core docs are always free. Pro unlocks engine-specific modules and the session co-pilot.

Works with Claude Code, Claude Desktop, Cursor, Windsurf, and Cline.

---

## 2. smithery.ai

**URL:** https://smithery.ai/submit (typically a GitHub integration)

### Listing Details

- **Name:** gamedev-mcp-server
- **Display Name:** GameDev MCP Server
- **Description:** Your AI forgets everything mid-project. Give it permanent game development knowledge. 130+ curated docs — design patterns, architecture, engine-specific guides for MonoGame, Godot, and more.
- **Category:** Developer Tools
- **Tags:** `gamedev`, `game-development`, `godot`, `monogame`, `knowledge`, `documentation`
- **Install:**
  ```json
  {
    "mcpServers": {
      "gamedev": {
        "command": "npx",
        "args": ["-y", "gamedev-mcp-server"]
      }
    }
  }
  ```
- **Tools:** search_docs, get_doc, list_docs, list_modules, genre_lookup, session, license_info
- **Resources:** gamedev://docs/{module}/{id}, gamedev://prompts/session, gamedev://prompts/code-rules

### Smithery-Specific Notes

Smithery typically auto-indexes from GitHub. Ensure:
1. Package.json has correct `repository` field
2. README has MCP config examples
3. Tools are well-documented in the MCP manifest (tool descriptions in code)

---

## 3. mcpmarket.com

**URL:** https://mcpmarket.com (submit via their form or API)

### Listing Details

- **Title:** GameDev MCP Server — AI Game Dev Knowledge Base
- **Subtitle:** 130+ curated game development docs for AI coding assistants
- **Category:** Development / Game Development
- **Pricing:** Free tier + Pro ($9/mo)
- **Platform compatibility:** Claude Code, Claude Desktop, Cursor, Windsurf, Cline
- **Install method:** npm (`npx -y gamedev-mcp-server`)

### Feature Highlights (for listing)

1. **130+ curated docs** — not scraped, hand-written with AI code generation in mind
2. **Multi-engine** — MonoGame (68 guides), Godot (5+), Unity (planned), plus engine-agnostic core
3. **Context-efficient** — section extraction + maxLength params, 6 focused tools (not 50)
4. **Genre system** — 11 genre profiles mapping to required systems with starter checklists
5. **Session co-pilot** — structured workflows for planning, debugging, and scoping
6. **Zero deps** — all search and logic built-in, no database, no network exposure (stdio only)
7. **Free tier** — core docs always free, no signup required

---

## 4. Cline Marketplace (if applicable)

### Listing Details

- **Name:** GameDev MCP Server
- **Description:** Permanent game dev knowledge for your AI. 130+ curated docs on design, architecture, and engine-specific implementation. MonoGame, Godot, Unity. Context-efficient with section extraction.
- **Install:** Add to Cline MCP Servers in VS Code settings
- **Config:**
  ```json
  {
    "command": "npx",
    "args": ["-y", "gamedev-mcp-server"]
  }
  ```

---

## Submission Checklist

- [ ] mcp.so — Submit listing (check if PR-based or form-based)
- [ ] smithery.ai — Connect GitHub repo or submit
- [ ] mcpmarket.com — Submit via their form
- [ ] Cline marketplace — Check submission process
- [ ] Verify npm package has correct metadata (`description`, `keywords`, `repository`)
- [ ] Ensure GitHub repo description matches listing
- [ ] Add "MCP" topic to GitHub repo
- [ ] Screenshot of tool usage for visual listings

---

## GitHub Repo Description (update)

Current: (check and update if needed)

**Suggested:** `🎮 AI game dev knowledge server (MCP). 130+ curated docs — design patterns, architecture, MonoGame, Godot, Unity. Give your AI permanent gamedev expertise.`

## npm Keywords (verify in package.json)

```json
"keywords": [
  "mcp",
  "model-context-protocol",
  "game-development",
  "gamedev",
  "godot",
  "monogame",
  "unity",
  "game-design",
  "ai",
  "knowledge-base",
  "claude",
  "cursor",
  "windsurf"
]
```
