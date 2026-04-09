# G34 — Release Lifecycle & Extension Policy

> **Category:** guide · **Engine:** FNA · **Related:** [G21 Environment Variables Runtime Config](./G21_environment_variables_runtime_config.md) · [G22 Platform Backend Architecture](./G22_platform_backend_architecture.md) · [G32 Build Targets & .NET Configuration](./G32_build_targets_dotnet_configuration.md) · [FNA Architecture Rules](../fna-arch-rules.md)

FNA follows a monthly release cadence with strict versioning, a well-defined SDL migration timeline, and a formal extension policy that changed significantly in 26.01. This guide covers how to stay current with FNA releases, what the version numbers mean, and how the extension model works (and why it ended).

---

## Table of Contents

1. [Release Cadence](#1--release-cadence)
2. [Version Numbering](#2--version-numbering)
3. [SDL2 to SDL3 Transition Timeline](#3--sdl2-to-sdl3-transition-timeline)
4. [Tracking Native Library Versions](#4--tracking-native-library-versions)
5. [The Extension Model (Historical)](#5--the-extension-model-historical)
6. [Extension Policy Change (26.01)](#6--extension-policy-change-2601)
7. [Updating FNA in Your Project](#7--updating-fna-in-your-project)
8. [Breaking Changes by Release](#8--breaking-changes-by-release)
9. [Staying on Older Versions](#9--staying-on-older-versions)
10. [FNA vs MonoGame: Release Philosophy](#10--fna-vs-monogame-release-philosophy)

---

## 1 — Release Cadence

FNA ships on a **monthly cadence**, with releases on the first of each month. Each release bundles:

- FNA framework updates (the managed C# code)
- Updated native library recommendations (FNA3D, FAudio, Theorafile, dav1dfile)
- SDL version bumps when applicable

Monthly releases are tagged in the GitHub repository (e.g., `26.04`, `26.03`). There are no LTS branches or backports — FNA moves forward in a single line.

---

## 2 — Version Numbering

FNA uses a `YY.MM` versioning scheme:

| Version | Meaning |
|---|---|
| `26.04` | April 2025 release |
| `26.03` | March 2025 release |
| `25.12` | December 2024 release |

The native libraries (FNA3D, FAudio) follow the same `YY.MM` scheme, and each FNA release specifies which native library versions it was tested against. Always use matching versions.

There are no patch releases (no `26.04.1`). If a critical bug is found, the fix lands in the next monthly release. For urgent fixes between releases, pin to a specific commit on the `main` branch.

---

## 3 — SDL2 to SDL3 Transition Timeline

FNA's migration from SDL2 to SDL3 is the most significant platform change in recent history. Here is the timeline based on release notes:

| Release | SDL Status |
|---|---|
| **Pre-25.03** | SDL2 is the default backend |
| **25.03** | SDL3 becomes the default for FNA, FNA3D, and FAudio. SDL3 support marked "production ready" |
| **25.12** | `GraphicsAdapter.MonitorHandle` returns `SDL_DisplayID` (SDL3-style) |
| **26.01** | SDL updated to v3.4 |
| **26.04** | SDL3 is the standard; SDL2 supported via `FNA_PLATFORM_BACKEND=SDL2` env var |

### Choosing SDL2 vs SDL3

SDL3 is the default and recommended backend. To fall back to SDL2:

```bash
# Environment variable (runtime selection)
export FNA_PLATFORM_BACKEND=SDL2
```

FNA's delegate-based platform abstraction selects the backend at startup. The same compiled binary works with either — no rebuild needed.

**When to stay on SDL2:**
- Your target platform's SDL3 port is immature (check SDL3 platform support matrix)
- You depend on SDL2-specific behavior in custom P/Invoke code
- You're shipping imminently and don't want to change the audio/input stack

**When to use SDL3:**
- New projects (SDL3 is the future)
- You want SDL_GPU graphics backend (default in FNA3D since 25.03)
- You need SDL3-specific features (haptics improvements, pen input, updated gamepad DB)

---

## 4 — Tracking Native Library Versions

Each FNA release lists its companion native library versions. Keep them in sync:

| FNA Release | FNA3D | FAudio | SDL | Notes |
|---|---|---|---|---|
| 26.04 | 26.04 | 26.04 | 3.4+ | armhf crash fix |
| 26.03 | 26.03 | 26.03 | 3.4+ | — |
| 26.02 | 26.02 | 26.02 | 3.4+ | AV1 support, ByteEXT/UShortEXT |
| 26.01 | 26.01 | 26.01 | 3.4 | Extension model ended |

Download matching fnalibs from the FNA-XNA GitHub releases page. Mismatched versions (e.g., FNA 26.04 with FNA3D 25.12) may work but are untested and unsupported.

---

## 5 — The Extension Model (Historical)

FNA historically accepted community-contributed **extensions** — additions to the FNA API surface that went beyond XNA 4.0. These were clearly marked (typically with `EXT` suffix or separate namespaces) and documented in release notes.

Examples of past extensions:
- `SurfaceFormat` extensions (additional texture formats)
- `ByteEXT`, `UShortEXT` surface format extensions (added in 26.02)
- Window pointer wrap/unwrap functions for wine-mono compatibility (added in 26.04)

Extensions were carefully gated: they had to be useful, non-breaking, and not contradict XNA's API design. They were the mechanism by which FNA evolved beyond pure XNA 4.0 compatibility.

---

## 6 — Extension Policy Change (26.01)

**Starting with FNA 26.01, the extension model has ended.** From the release notes:

> "The FNA extension model has now ended — extensions without prior written approval will no longer be considered for inclusion."

This is a significant policy change. What it means:

- **No new community-contributed extensions** will be merged without prior written approval from the FNA maintainer
- **Existing extensions remain** — `ByteEXT`, `UShortEXT`, and other previously merged extensions are part of FNA permanently
- **Bug fixes and XNA-accuracy improvements** continue as normal
- **SDL updates** continue as normal

### Why the change happened

FNA's primary mission is XNA 4.0 accuracy and game preservation. Every extension increases the API surface that must be maintained, tested, and documented. The extension model served its purpose (filling gaps for practical game development) but was becoming a maintenance burden.

### Impact on your game

If your game uses existing FNA extensions, nothing changes — they remain supported. If you were planning to propose a new extension, you'll need to either:

1. Contact the FNA maintainer for prior written approval
2. Implement the feature in your own code (P/Invoke to SDL3 directly, write a helper library, etc.)
3. Use the SDL_GPU API directly for graphics features beyond FNA3D's scope (see G03, G18)

---

## 7 — Updating FNA in Your Project

Since FNA is a Git submodule, updating is straightforward:

```bash
# Update to latest release
cd lib/FNA
git fetch origin
git checkout 26.04   # or the desired release tag

# Update fnalibs
# Download matching fnalibs from GitHub releases
# Extract to lib/fnalibs/

# Return to your game root and commit the submodule update
cd ../..
git add lib/FNA
git commit -m "Update FNA to 26.04"
```

### Update checklist:

1. Read the release notes for every version between your current and target
2. Check for breaking changes (rare but they happen — see Section 8)
3. Update fnalibs to matching versions
4. Build and run your test suite
5. Test on all target platforms (native library behavior may change)
6. If updating across the SDL2→SDL3 boundary, test both backends

---

## 8 — Breaking Changes by Release

FNA rarely introduces breaking changes, but they do occur. Notable recent ones:

| Release | Change | Impact |
|---|---|---|
| **26.01** | Extension model ended | No new extensions accepted without approval |
| **26.01** | SDL updated to v3.4 | P/Invoke code targeting SDL3 < 3.4 may need updates |
| **25.12** | `GraphicsAdapter.MonitorHandle` returns `SDL_DisplayID` | Code using this property may need updating for SDL3 type |
| **25.12** | `KeyboardState` function naming changes | Minor renames for XNA accuracy |
| **25.03** | SDL3 becomes default backend | Games using SDL2-specific P/Invoke need `FNA_PLATFORM_BACKEND=SDL2` |

---

## 9 — Staying on Older Versions

There's no requirement to update FNA monthly. Many shipping games pin to a specific release for stability. If your game works on FNA 25.12, you can ship on 25.12.

**When to update:**
- A release fixes a bug you've encountered
- You need a new feature (e.g., AV1 video in 26.02)
- Your target platform requires a newer SDL version
- Security fixes in native libraries

**When not to update:**
- You're in the final weeks before ship — stability over freshness
- The release notes don't contain anything relevant to your project
- You're on console and need to re-certify after changes

---

## 10 — FNA vs MonoGame: Release Philosophy

| Aspect | FNA | MonoGame |
|---|---|---|
| Cadence | Monthly (`YY.MM`) | Irregular (major releases every 1–2 years) |
| Versioning | Calendar-based | Semantic (3.8, 3.9, etc.) |
| Breaking changes | Very rare, documented | Possible between majors |
| Extension policy | Ended (26.01) | Open contribution model |
| API stability | XNA 4.0 anchor — changes are corrections, not evolution | Evolves beyond XNA |
| Backports | None — single forward line | None for old majors |
| Native libs | Matched YY.MM versions | Bundled in NuGet |

FNA's monthly cadence with minimal changes means updates are low-risk. MonoGame's less frequent but larger releases require more careful migration planning. FNA's strict XNA compatibility anchor means the API surface is essentially frozen — updates are bug fixes, native library bumps, and SDL integration improvements, not new features.
