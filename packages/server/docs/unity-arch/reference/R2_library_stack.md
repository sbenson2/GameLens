# R2 — Unity 6 Library & Package Stack

> **Category:** reference · **Engine:** Unity 6 (6000.x) · **Related:** [Capability Matrix](R1_capability_matrix.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Addressables](../guides/G9_addressables_asset_management.md) · [Unity Rules](../unity-arch-rules.md)

A curated map of Unity 6's package ecosystem — built-in modules, verified packages, and essential third-party libraries. Use this when starting a project to pick the right stack, or when evaluating whether to build a system yourself or adopt an existing package.

---

## How Unity's Package System Works

Unity 6 distributes engine features as **packages** managed through the Unity Package Manager (UPM). This matters because many critical systems (Input System, Cinemachine, Addressables) are not baked into the engine — they're packages you opt into.

**Package lifecycle tiers:**
- **Built-in** — compiled into the engine; always available (e.g., Physics, Animation)
- **Released / Verified** — fully tested and supported for a specific Unity version; safe for production
- **Pre-release** — functional but API may change; use with caution
- **Experimental** — early development; expect breaking changes

Starting with Unity 6.3 (2026), the editor supports **signed packages** with trust indicators in the Package Manager. Unsigned packages trigger warnings — this is Unity's supply-chain hygiene initiative.

---

## Core Built-in Modules

These are always available with no package installation required.

| Module | What It Does | Key Classes |
|--------|-------------|-------------|
| **Physics** | Collision detection, rigidbody simulation | `Rigidbody`, `Collider`, `Physics.Raycast()` |
| **Physics 2D** | Box2D-based 2D physics | `Rigidbody2D`, `Collider2D`, `Physics2D.Raycast()` |
| **Animation** | Animator state machines, blend trees | `Animator`, `AnimationClip`, `AnimatorController` |
| **Audio** | Clip playback, spatial audio, mixer groups | `AudioSource`, `AudioListener`, `AudioMixer` |
| **Rendering** | Core rendering loop, cameras, lights | `Camera`, `Light`, `Renderer`, `Shader` |
| **Particles** | Visual effects via Particle System | `ParticleSystem`, `ParticleSystemRenderer` |
| **Terrain** | Heightmap-based landscapes | `Terrain`, `TerrainData`, `TerrainCollider` |
| **AI / Navigation** | NavMesh pathfinding | `NavMeshAgent`, `NavMeshSurface`, `NavMeshObstacle` |
| **Video** | Video playback | `VideoPlayer`, `VideoClip` |
| **Cloth** | Cloth simulation on skinned meshes | `Cloth` |

---

## Essential Verified Packages

These are the packages most Unity 6 projects should evaluate. All are **Released** (production-ready) unless noted.

### Input & Control

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Input System** | `com.unity.inputsystem` | Action-based input with rebinding, composites, device awareness | Every new project — replaces `Input.GetKey()` |
| **Cinemachine 3** | `com.unity.cinemachine` | Smart camera management — follow, blend, shake, dolly | Any game with dynamic cameras. Note: Cinemachine 3 is a rewrite; upgrading from 2.x requires migration |

### Asset Management

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Addressables** | `com.unity.addressables` | Async asset loading by address/label, remote content delivery | Projects with DLC, large worlds, or memory management needs |
| **Addressables for Android** | `com.unity.addressables.android` | Play Asset Delivery integration for Addressables | Android projects using asset packs |

### Rendering & Visual

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **URP** | `com.unity.render-pipelines.universal` | Scalable render pipeline (mobile → console) | Default for most projects in Unity 6 |
| **HDRP** | `com.unity.render-pipelines.high-definition` | High-end rendering (volumetrics, ray tracing, area lights) | AAA / high-fidelity PC/console |
| **Shader Graph** | `com.unity.shadergraph` | Node-based shader authoring | Custom materials without hand-written HLSL |
| **VFX Graph** | `com.unity.visualeffectgraph` | GPU-accelerated particle effects (node-based) | Complex VFX — millions of particles, mesh output |
| **Post Processing** | Integrated into URP/HDRP Volume system | Bloom, color grading, DOF, motion blur | Use Volume overrides — no separate package needed |

### UI

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **UI Toolkit** | Built-in (Unity 6) | UXML + USS based UI (web-like architecture) | Runtime HUD, menus; editor tooling |
| **TextMeshPro** | `com.unity.textmeshpro` | Advanced text rendering with SDF fonts | Rich text, localized text, any in-game text |

### Multiplayer & Networking

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Netcode for GameObjects** | `com.unity.netcode.gameobjects` | NetworkObject syncing, RPCs, client/server | GameObject-based multiplayer (most projects) |
| **Multiplayer Tools** | `com.unity.multiplayer.tools` | Profiler, network simulator, runtime stats | Debugging netcode — always install alongside Netcode |
| **Transport (Unity Transport)** | `com.unity.transport` | Low-level networking layer | Automatic dependency of Netcode; rarely used directly |

### Animation & Cinematics

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Timeline** | `com.unity.timeline` | Sequenced animations, audio, events on a track editor | Cutscenes, scripted sequences, trailers |
| **Animation Rigging** | `com.unity.animation.rigging` | Runtime procedural rigging constraints (IK, aim, twist) | Dynamic aiming, foot placement, look-at |
| **Recorder** | `com.unity.recorder` | Capture gameplay as video / image sequences | Trailers, bug reports, GIF capture |

### Data & Performance

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Entities (ECS)** | `com.unity.entities` | Data-oriented entity system | High-entity-count simulations (1000+ identical objects) |
| **Burst Compiler** | `com.unity.burst` | LLVM-based compiler for C# Jobs → native SIMD code | CPU-bound workloads — always pair with Jobs |
| **Mathematics** | `com.unity.mathematics` | SIMD-friendly math library for Burst/ECS | Required by DOTS; optional for other code |
| **Collections** | `com.unity.collections` | Native containers (NativeArray, NativeHashMap) | Job-safe data structures for multithreaded code |
| **Profiling Core** | `com.unity.profiling.core` | Custom profiler markers and counters | Instrumenting your own systems for the Profiler |

### Platform & Services

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Localization** | `com.unity.localization` | String tables, asset tables, locale management | Any game shipping in multiple languages |
| **Unity Analytics** | `com.unity.services.analytics` | Player telemetry and custom events | Tracking player behavior post-launch |
| **Authentication** | `com.unity.services.authentication` | Anonymous and platform sign-in | Online games using Unity Gaming Services |
| **Cloud Save** | `com.unity.services.cloudsave` | Server-side save data | Cross-device save sync |
| **Remote Config** | `com.unity.services.remote-config` | Runtime-configurable settings without app update | Live tuning: difficulty, feature flags, AB tests |

### Testing & Debugging

| Package | ID | What It Does | When to Use |
|---------|----|-------------|-------------|
| **Test Framework** | `com.unity.test-framework` | NUnit-based Edit/Play mode tests | Automated testing in CI |
| **Test Framework Coverage** | `com.unity.testtools.codecoverage` | Code coverage reports | Identifying untested code paths |

---

## Popular Third-Party Libraries

These are widely adopted community or commercial packages used alongside Unity's official stack.

| Library | Source | What It Does | Notes |
|---------|--------|-------------|-------|
| **DOTween** | Asset Store | Fluent tweening API for transforms, colors, values | De facto standard; Pro version adds visual editor |
| **UniTask** | GitHub / OpenUPM | Zero-allocation async/await for Unity | Superior to Coroutines for async workflows |
| **VContainer** | GitHub / OpenUPM | Lightweight DI container optimized for Unity | Fast compile-time; pairs well with MessagePipe |
| **R3** | GitHub / OpenUPM | Reactive Extensions rewrite (successor to UniRx) | Reactive event streams; Unity 6 compatible |
| **NuGetForUnity** | GitHub | NuGet package manager integration | Install standard .NET libraries (Newtonsoft.Json, etc.) |
| **ParrelSync** | GitHub | Clone project for multiplayer testing | Test netcode without building a standalone |
| **Odin Inspector** | Asset Store | Powerful custom inspector/serialization | Commercial; dramatically speeds up editor tooling |
| **Feel / Nice Vibrations** | Asset Store | Game feel: screen shake, haptics, effects | Commercial; quick juice without custom code |
| **Mirror** | GitHub / Asset Store | Open-source networking (alternative to Netcode) | Mature community; battle-tested in shipped titles |
| **FishNet** | GitHub / Asset Store | High-performance networking with prediction | Strong server-authoritative model |

---

## Decision Flowchart: Choosing Packages

```
Starting a new project?
│
├── 2D or 3D? ──► 2D: URP (always)
│                  3D casual/mobile: URP
│                  3D AAA/PC: HDRP
│
├── Input ──► Always use Input System package (never legacy Input.GetKey)
│
├── Cameras ──► More than 1 camera behavior? → Cinemachine 3
│               Static camera? → Manual Camera component is fine
│
├── UI ──► Runtime HUD/menus → UI Toolkit (Unity 6 default)
│          World-space healthbars → uGUI Canvas (World Space mode)
│
├── Multiplayer? ──► Yes → Netcode for GameObjects + Multiplayer Tools
│                    Alt: Mirror (if you want open-source community support)
│
├── Lots of similar entities (1000+)? ──► Entities + Burst + Collections
│
├── DLC / remote assets? ──► Addressables
│
├── Async patterns ──► UniTask (community) or async/await with Coroutines
│
└── Need tweening? ──► DOTween (near-universal adoption)
```

---

## Package Management Tips

### Installing Packages

```
Window → Package Manager → Unity Registry → Search → Install
```

For GitHub / OpenUPM packages, add to `Packages/manifest.json`:

```json
{
  "dependencies": {
    "com.cysharp.unitask": "https://github.com/Cysharp/UniTask.git?path=src/UniTask/Assets/Plugins/UniTask"
  }
}
```

### Scoped Registries (OpenUPM)

Many community packages use OpenUPM. Add a scoped registry to `Packages/manifest.json`:

```json
{
  "scopedRegistries": [
    {
      "name": "OpenUPM",
      "url": "https://package.openupm.com",
      "scopes": [
        "com.cysharp",
        "jp.hadashikick"
      ]
    }
  ]
}
```

### Version Pinning

Always pin package versions in production. Unity's Package Manager supports semantic versioning:

```json
"com.unity.inputsystem": "1.11.2"
```

Avoid `"latest"` or branch references in shipped projects — a breaking upstream change can stall your build pipeline.
