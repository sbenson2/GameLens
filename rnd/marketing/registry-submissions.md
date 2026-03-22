# MCP Registry Submission Drafts

Prepared: 2026-03-20 | Updated: 2026-03-22

---

## 1. mcp.so

**URL:** https://mcp.so/submit (or GitHub PR to their registry repo)

### Listing Details

- **Name:** GameDev MCP Server
- **Short description:** Permanent game development knowledge for AI coding assistants. 138+ curated docs covering design patterns, engine architecture, and implementation guides for MonoGame, Godot, and Unity.
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

**138+ curated docs** covering:
- Game design (genres, game feel, balancing, progression)
- Architecture (ECS, state machines, scene management, signals)
- Programming patterns (19 game-specific patterns with implementation)
- Engine guides: MonoGame/Arch ECS (78 guides), Godot 4.4+ (9 docs, growing), Unity (planned)
- Core concepts (camera, physics, pathfinding, networking, combat, particles)

**Context-efficient:** Section extraction and maxLength params mean your AI gets precisely the knowledge it needs without burning your context window. 9 focused tools, not 50.

**Cross-engine comparison:** `compare_engines("camera")` shows how Godot and MonoGame each approach the same topic, with engine-agnostic theory as foundation.

**Free tier included.** Core docs are always free. Pro unlocks engine-specific modules and the session co-pilot.

Works with Claude Code, Claude Desktop, Cursor, Windsurf, and Cline.

---

## 2. smithery.ai

**URL:** https://smithery.ai/submit (typically a GitHub integration)

### Listing Details

- **Name:** gamedev-mcp-server
- **Display Name:** GameDev MCP Server
- **Description:** Your AI forgets everything mid-project. Give it permanent game development knowledge. 138+ curated docs — design patterns, architecture, engine-specific guides for MonoGame, Godot, and more. Secure stdio-only transport.
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
- **Tools:** search_docs, get_doc, list_docs, list_modules, compare_engines, random_doc, genre_lookup, session, license_info
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
- **Subtitle:** 138+ curated game development docs for AI coding assistants
- **Category:** Development / Game Development
- **Pricing:** Free tier + Pro ($9/mo)
- **Platform compatibility:** Claude Code, Claude Desktop, Cursor, Windsurf, Cline
- **Install method:** npm (`npx -y gamedev-mcp-server`)

### Feature Highlights (for listing)

1. **138+ curated docs** — not scraped, hand-written with AI code generation in mind
2. **Multi-engine** — MonoGame (78 guides), Godot (9 docs), Unity (planned), plus engine-agnostic core
3. **Cross-engine comparison** — `compare_engines` tool shows how different engines approach the same topic
4. **Context-efficient** — section extraction + maxLength params, 9 focused tools (not 50)
5. **Genre system** — 11 genre profiles mapping to required systems with starter checklists
6. **Session co-pilot** — structured workflows for planning, debugging, and scoping
7. **Secure by design** — stdio-only transport, no network exposure, no open ports
8. **Free tier** — core docs always free, no signup required

---

## 4. Cline Marketplace (if applicable)

### Listing Details

- **Name:** GameDev MCP Server
- **Description:** Permanent game dev knowledge for your AI. 138+ curated docs on design, architecture, and engine-specific implementation. MonoGame, Godot, Unity. Cross-engine comparison, context-efficient section extraction, stdio-only security.
- **Install:** Add to Cline MCP Servers in VS Code settings
- **Config:**
  ```json
  {
    "command": "npx",
    "args": ["-y", "gamedev-mcp-server"]
  }
  ```

---

## 5. mcpservers.org (Awesome MCP Servers)

**URL:** https://mcpservers.org/submit (form-based, powers wong2/awesome-mcp-servers 83K⭐)

### Notes
- wong2/awesome-mcp-servers repo says "We do not accept PRs. Please submit on the website."
- Form at mcpservers.org/submit — likely GitHub URL + description
- This powers the largest awesome-mcp-servers list (83K stars)
- HIGH priority — largest single discovery surface

---

## 6. LobeHub MCP Marketplace

**URL:** https://lobehub.com/mcp (PR-based)

### Notes
- LobeHub is a popular AI chat client with built-in MCP support
- Submit via PR to their marketplace repo
- Listing shows install instructions + tool descriptions
- Medium-High priority — growing user base

---

## 7. punkpeye/awesome-mcp-servers

**URL:** https://github.com/punkpeye/awesome-mcp-servers (PR-based)

### Notes
- Second major awesome list
- PR with entry in appropriate category
- Category: "Knowledge & Data" or "Development Tools"

---

## 8. appcypher/awesome-mcp-servers

**URL:** https://github.com/appcypher/awesome-mcp-servers (PR-based)

### Notes
- Third major awesome list
- PR-based submission

---

## Submission Checklist

- [ ] mcpservers.org — Form submission (mcpservers.org/submit) — **HIGHEST PRIORITY** (powers 83K⭐ awesome list)
- [ ] mcp.so — GitHub issue on their repo
- [ ] smithery.ai — GitHub integration (auto-indexes from npm/GitHub)
- [ ] Cline marketplace — PR to github.com/cline/mcp-marketplace
- [ ] LobeHub MCP Marketplace — PR to their marketplace repo
- [ ] punkpeye/awesome-mcp-servers — GitHub PR
- [ ] appcypher/awesome-mcp-servers — GitHub PR
- [ ] mcpmarket.com — Submit via their form
- [ ] claudefa.st — Submit for "50+ Best MCP Servers" list
- [ ] Verify npm package has correct metadata (`description`, `keywords`, `repository`)
- [ ] Ensure GitHub repo description matches listing
- [ ] Add "MCP" topic to GitHub repo
- [ ] Add AGENTS.md to repo root
- [ ] Screenshot of tool usage for visual listings

---

## GitHub Repo Description (update)

Current: (check and update if needed)

**Suggested:** `🎮 AI game dev knowledge server (MCP). 138+ curated docs — design patterns, architecture, MonoGame, Godot, Unity. Cross-engine comparison. Give your AI permanent gamedev expertise.`

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
