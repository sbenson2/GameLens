# R2 — Community Libraries & Asset Portal

> **Category:** reference · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G6 Native Extensions & Build](../guides/G6_native_extensions_and_build.md) · [R1 API Reference](R1_api_reference.md)

---

Defold has a first-party **Asset Portal** (defold.com/assets) and a library dependency system built into the editor. Community libraries are ZIP archives hosted on GitHub (or anywhere) and added via URL in `game.project`. This reference catalogues the most widely used libraries by domain.

---

## Adding a Library Dependency

1. Open `game.project` in the editor.
2. Under **Project → Dependencies**, add the library's ZIP URL (typically a GitHub release archive).
3. Select **Project → Fetch Libraries** (or reopen the project).
4. The library's files appear in a read-only mount in the editor's asset browser.

```ini
# game.project excerpt
[project]
dependencies = https://github.com/britzl/monarch/archive/refs/tags/5.2.0.zip,https://github.com/Insality/druid/archive/refs/tags/1.2.zip
```

**Tip:** Pin to a specific tag or commit hash rather than `master.zip` to avoid surprise breakages.

---

## UI & Screen Management

| Library | Description | Use when… |
|---|---|---|
| **Druid** | Full-featured UI component framework — buttons, text input, scroll, data list, rich text, hotkeys, layout. The most comprehensive Defold UI solution. | You need production UI: menus, HUDs, settings screens, scrollable lists. |
| **Monarch** | Screen manager with stack-based navigation, transitions, popups, and focus handling. Works via collection proxies. | You need scene/screen transitions with back-stack support. |
| **Gooey** | Lightweight GUI framework — buttons, checkboxes, radio buttons, lists, text input. | You want something simpler than Druid for jam-scale projects. |
| **Flow** | Flexbox-style declarative UI with markdown rendering. | You prefer layout-driven UI composition. |
| **Dear ImGUI** | Immediate-mode debug GUI — panels, sliders, trees, plots. Rendered as a native extension. | Debug tooling and runtime inspectors, not shipping UI. |

---

## Camera & Rendering

| Library | Description | Use when… |
|---|---|---|
| **Orthographic** | Orthographic camera with screen-to-world projection, follow targets, shake, bounds, and zoom. The de facto standard Defold camera. | Any 2D game that scrolls or needs coordinate conversion. |
| **Defold Rendy** | Versatile camera suite and render pipeline replacement. Supports multiple cameras, layers, and post-processing. | You need multi-camera setups or custom render pipeline features. |
| **Scene3D** | 3D model rendering, prefabs, and basic 3D camera. | Rapid prototyping of 3D or 2.5D games in Defold. |

---

## Physics & Collision

| Library | Description | Use when… |
|---|---|---|
| **DAABBCC** | Dynamic AABB tree for fast overlap queries and raycasts — a lightweight alternative to Box2D. | You want spatial queries without full rigid-body physics. |
| **defold-box2d** | Direct Lua bindings for Box2D, bypassing Defold's built-in physics wrapper for full control. | You need joints, motors, or Box2D features not exposed by Defold's built-in physics. |
| **Platypus** | 2D platformer physics — ground detection, slopes, one-way platforms, wall jumps. Kinematic-based, no Box2D. | You are building a platformer and want ready-made movement logic. |

---

## Networking & Multiplayer

| Library | Description | Use when… |
|---|---|---|
| **Nakama** | Client SDK for Nakama open-source server — matchmaking, realtime multiplayer, leaderboards, chat, storage. | Full multiplayer backend with self-hosted or Heroic Cloud. |
| **Colyseus** | Client for Colyseus Node.js multiplayer framework — room-based state sync. | Room-based realtime multiplayer on Node.js. |
| **WebSocket** | Native WebSocket extension for persistent connections. | Custom server protocols or simple realtime communication. |
| **Photon Realtime** | Official Photon Realtime extension (partnership with Exit Games). | Hosted multiplayer infrastructure via Photon. |
| **DefNet** | Lightweight networking — TCP, UDP, HTTP helpers, and P2P discovery. | Simple networking or LAN multiplayer. |

---

## Animation & VFX

| Library | Description | Use when… |
|---|---|---|
| **Rive** | Runtime for Rive animations — state machines, interactive motion graphics. | Designers use Rive for UI animation or character rigs. |
| **Panthera 2.0** | Runtime for Panthera animation editor — skeletal and keyframe animation. | You use the Panthera tool for sprite animation. |
| **Acid Rain** | Pure-Lua particle system with emitter presets. | You want particles without native extensions. |

---

## Audio

| Library | Description | Use when… |
|---|---|---|
| **FMOD** | Native extension binding for FMOD Studio — events, buses, spatial audio. | Production audio with designer-driven sound design in FMOD Studio. |
| **OpenAL** | 3D spatial audio with pitch, gain, and positioning. | Lightweight 3D audio without a middleware dependency. |
| **Debeat** | Simple Lua audio manager — play, loop, fade, duck. | Jam-scale audio management. |

---

## Input & Controls

| Library | Description | Use when… |
|---|---|---|
| **Defold-Input** | Gesture detection (swipe, pinch, long press) and input state querying (is_pressed, is_released). | Mobile games or any project needing gesture recognition. |
| **Kinematic Walker** | 3D character controller — smooth movement, slopes, steps, and collision response. | 3D first/third-person movement. |

---

## AI & Pathfinding

| Library | Description | Use when… |
|---|---|---|
| **A\* Pathfinding** | Grid-based A\* using the MicroPather algorithm (native extension, fast). | Grid or tile-based pathfinding for NPCs. |
| **DefGraph** | Graph data structure with Dijkstra/BFS pathfinding. | Waypoint-based or non-grid navigation. |
| **DefArmy** | Group/formation management for game objects — steering, spacing, selection. | RTS-style unit management. |

---

## Monetization, Analytics & Services

| Library | Description |
|---|---|
| **Google AdMob** | Banner, interstitial, and rewarded ads via native extension. |
| **Firebase Remote Config** | A/B testing and feature flags from Firebase console. |
| **PlayFab SDK** | Backend platform — player data, leaderboards, economy, matchmaking. |
| **Game Analytics** | Event tracking and analytics dashboard integration. |

---

## Dev Tools

| Library | Description |
|---|---|
| **DefCon** | In-game developer console — run Lua at runtime, inspect state. |
| **ts-defold** | Write Defold scripts in TypeScript with full type checking and autocompletion. |
| **VS Code Defold Kit** | Extensions for VS Code — autocompletion, API docs, build integration. |
| **Tiled** | TMX/TSX tilemap import via community exporter. |

---

## Choosing Libraries

1. **Check the Asset Portal** (defold.com/assets) — it is the canonical index and shows compatibility info.
2. **Pin versions** — use tagged release ZIPs in your dependency URL.
3. **Prefer official extensions** — libraries under the `defold` GitHub org receive maintenance from the Defold team.
4. **Watch dependency size** — each library adds to the build. Remove unused dependencies to keep bundle size small.
5. **Test on target platforms** — native extensions compile per-platform. Verify on mobile/web/console early.
