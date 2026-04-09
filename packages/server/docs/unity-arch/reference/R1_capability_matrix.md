# R1 — Unity 6 Capability Matrix

> **Category:** reference · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unity Rules](../unity-arch-rules.md)

A quick-reference table of Unity 6's major subsystems, the recommended approach for each, legacy alternatives to avoid, and when each choice applies. Use this when starting a project, evaluating a system, or migrating from older Unity versions.

---

## Subsystem Decision Matrix

### Programming Model

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| General gameplay | MonoBehaviour (GameObject/Component) | — | Default for most projects |
| 1000+ similar entities | DOTS / ECS (`ISystem` + `SystemAPI`) | `SystemBase`, `Entities.ForEach` | Requires Burst + Unity.Mathematics |
| CPU-intensive parallel work | C# Job System + Burst Compiler | Threads via `System.Threading` | Jobs are safety-checked; raw threads are not |
| Data assets (configs, stats) | ScriptableObject | Static classes, JSON in Resources | Editable in Inspector, version-control friendly |

### Rendering

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Most games (mobile → PC) | URP (Universal Render Pipeline) | Built-in Render Pipeline | Default in Unity 6 |
| AAA / high-end PC/console | HDRP (High Definition RP) | Built-in Render Pipeline | Volumetrics, ray tracing, area lights |
| Custom shader authoring | Shader Graph | Hand-written .shader files | Node-based; works with URP and HDRP |
| Draw call optimization | GPU Resident Drawer (Unity 6) | SRP Batcher alone | Enable in Project Settings → Graphics |
| Post-processing | URP/HDRP Volume system | Post Processing Stack v2 | Integrated into the render pipeline |

### UI

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Runtime game UI (HUD, menus) | UI Toolkit (UIDocument, UXML, USS) | Unity UI (uGUI) Canvas | Web-like architecture; data binding support |
| Editor custom inspectors/windows | UI Toolkit | IMGUI (`OnGUI`) | IMGUI still works but is maintenance-mode |
| World-space UI (healthbars on 3D objects) | Unity UI (uGUI) Canvas in World Space | — | UI Toolkit world-space is limited in Unity 6 |
| Debug overlays (dev-only) | IMGUI (`OnGUI`) | — | Fast to prototype; stripped in builds |

### Input

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| All player input | Input System package (`InputAction`) | `UnityEngine.Input` (legacy) | Asset-based actions; supports rebinding |
| Action maps per context | One `ActionMap` per context (Gameplay, UI, Vehicle) | Single map with enable/disable per action | Disable current map → enable next |
| Generated C# bindings | Enable in .inputactions asset | String-based lookups | Type-safe; compile-time error detection |

### Physics

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| 3D physics | PhysX (built-in) | — | `Rigidbody` + `Collider` components |
| 2D physics | Box2D (built-in) | — | `Rigidbody2D` + `Collider2D` components |
| Physics logic timing | `FixedUpdate()` | `Update()` for physics | Fixed timestep ensures determinism |
| Collision filtering | Layer-based collision matrix | Tag string comparisons | Set in Project Settings → Physics |
| DOTS physics | Unity Physics or Havok for Unity | — | Stateless (Unity Physics) vs. stateful (Havok) |

### Audio

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Basic SFX + music | AudioSource + AudioMixer | — | Built-in; sufficient for most games |
| Adaptive / procedural audio | FMOD or Wwise integration | Built-in audio alone | Professional middleware; free tiers available |
| Spatial audio (3D) | AudioSource with 3D spatial blend | — | Configure rolloff curves per source |

### Scene & Asset Management

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Loading game content | Addressables (`Addressables.LoadAssetAsync`) | `Resources.Load()` | Async, supports remote bundles, memory-managed |
| Scene transitions | `SceneManager.LoadSceneAsync` (additive) | Synchronous `LoadScene` | Additive loading avoids DontDestroyOnLoad hacks |
| Persistent managers | Bootstrap scene pattern | `DontDestroyOnLoad` | One persistent scene; game scenes load/unload additively |
| Large open worlds | Addressables + Scene streaming | Single scene with everything | Load/unload areas based on player position |

### Animation

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Character animation | Animator + Animation Controller | Legacy Animation component | State machine–based; supports blend trees |
| Skeletal animation (DOTS) | DOTS Animation (com.unity.animation) | — | Preview package; use cautiously |
| UI / tween animation | USS transitions + DOTween | Animation component on Canvas | USS handles simple transitions natively |
| Cutscenes / cinematics | Timeline + Cinemachine | — | Director-based sequencing |

### Networking

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Multiplayer (small-medium) | Netcode for GameObjects | UNet (removed) | Official Unity package; server-authoritative |
| Multiplayer (DOTS-scale) | Netcode for Entities | — | For DOTS/ECS projects with many replicated entities |
| Transport layer | Unity Transport Package | — | Low-level; used by Netcode packages |
| Relay / matchmaking | Unity Gaming Services (Relay, Lobby) | — | Cloud services; free tier available |

### Build & Tooling

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Compilation speed | Assembly Definitions (.asmdef) | Single assembly | Splits compilation; faster iteration |
| Package management | Unity Package Manager (UPM) | Manual .unitypackage imports | Semantic versioning; git URL support |
| Version control | Unity Version Control (Plastic SCM) or Git LFS | Perforce (if not already invested) | Large binary assets need LFS |
| Profiling | Unity Profiler + Frame Debugger | — | Always profile before optimizing |
| Automated testing | Unity Test Framework (NUnit) | — | Edit-mode and play-mode tests |

---

## Platform Support Quick Reference

| Platform | Render Pipeline | Input | Notes |
|----------|----------------|-------|-------|
| PC (Windows/Mac/Linux) | URP or HDRP | Keyboard + Mouse + Gamepad | Full feature set |
| Mobile (iOS/Android) | URP | Touch + Gyro | HDRP not supported |
| Consoles (PS5, Xbox, Switch) | URP or HDRP | Gamepad | HDRP for PS5/Xbox; URP for Switch |
| WebGL | URP | Keyboard + Mouse + Touch | No multithreading (no Jobs), limited audio |
| VR (Quest, PCVR) | URP (Single Pass Instanced) | XR controllers | Use XR Interaction Toolkit |

---

## Package Essentials

Commonly needed packages to install via the Package Manager:

| Package | ID | Purpose |
|---------|------|---------|
| Input System | `com.unity.inputsystem` | Modern input handling |
| Addressables | `com.unity.addressables` | Async asset loading |
| Cinemachine | `com.unity.cinemachine` | Camera management |
| Timeline | `com.unity.timeline` | Cutscenes, sequencing |
| TextMeshPro | `com.unity.textmeshpro` | High-quality text rendering |
| Entities | `com.unity.entities` | DOTS / ECS |
| Burst | `com.unity.burst` | Native code compilation |
| Netcode for GameObjects | `com.unity.netcode.gameobjects` | Multiplayer networking |
| Test Framework | `com.unity.test-framework` | Unit and integration tests |
| UI Toolkit | (built-in) | Runtime and editor UI |

---

## Version Reference

This document targets **Unity 6** (internal version 6000.x), the successor to Unity 2022 LTS. Key differences from 2022 LTS:

- GPU Resident Drawer (new rendering optimization)
- UI Toolkit runtime data binding
- `ISystem` + `SystemAPI` as the preferred DOTS pattern
- `FindAnyObjectByType<T>()` replaces `FindObjectOfType<T>()`
- Addressables as the default asset loading strategy
- Input System as the default input handling approach
