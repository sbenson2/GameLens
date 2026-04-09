# G46 — Unity AI Editor Tools (Unity AI / Muse Successor)

> **Category:** guide · **Engine:** Unity 6.2+ (6000.x) · **Related:** [G22 Sentis AI Inference](G22_sentis_ai_inference.md) · [G32 Editor Scripting](G32_editor_scripting_custom_tools.md) · [Unity Rules](../unity-arch-rules.md)

Unity AI is the editor-integrated AI toolset introduced in Unity 6.2 (August 2025), replacing the separate Unity Muse subscription (retired October 2025). It embeds an AI assistant, asset generators, and a local inference engine directly into the Unity Editor. This guide covers what's available, how to use each pillar effectively, and the practical limitations game developers should know.

---

## Overview: Three Pillars

Unity AI comprises three integrated components:

| Pillar | Replaces | What It Does |
|--------|----------|-------------|
| **Assistant** | Muse Chat | Project-aware chat inside the Editor — answers docs questions, writes C# code, batch-renames assets, places objects in scenes |
| **Generators** | Muse Texture/Sprite/Animate | Creates sprites, textures, materials, sounds, and animations from text prompts using Unity's models or third-party providers (Scenario, Inc.) |
| **Inference Engine** | Sentis | Runs ML models locally at runtime — same neural network inference as Sentis but rebranded under the Unity AI umbrella |

> **Availability:** Unity AI requires **Unity 6.3 or later** (the 6.2 release was preview-only). It ships as built-in packages, not an Asset Store download.

---

## Pricing & Access

Unlike Muse ($30/month separately), Unity AI is included with paid Unity subscriptions:

- **Unity Points** are consumed for each AI action (chat query, asset generation)
- Points are included with Unity Pro, Enterprise, and Industry licenses
- Additional points can be purchased separately
- The Inference Engine (runtime ML) has no per-query cost — it runs locally on the user's hardware

> **WHY this matters for teams:** No separate subscription management. The per-action cost model means occasional use is cheap, but heavy generation workloads should be budgeted.

---

## Pillar 1: Assistant (AI Chat)

The Assistant is a context-aware chat panel docked in the Editor (Window → Unity AI → Assistant).

### Capabilities

```
┌─────────────────────────────────────────────────┐
│  What the Assistant CAN do                      │
├─────────────────────────────────────────────────┤
│  • Answer Unity documentation questions         │
│  • Write and execute C# scripts in-editor       │
│  • Batch rename assets with pattern rules       │
│  • Place and arrange objects in the scene        │
│  • Explain error messages and suggest fixes      │
│  • Generate boilerplate (MonoBehaviours, SOs)    │
│  • Query project structure and asset metadata    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  What the Assistant CANNOT do                   │
├─────────────────────────────────────────────────┤
│  • Modify shader code or Shader Graph nodes     │
│  • Create complex multi-file architectures      │
│  • Access external APIs or the internet         │
│  • Run builds or deploy to devices              │
│  • Replace a senior programmer's judgment       │
└─────────────────────────────────────────────────┘
```

### Using the Assistant Effectively

**Be specific about context.** The Assistant indexes your project's assets and scripts. Reference them by name:

```
// VAGUE (poor results):
"Make a player controller"

// SPECIFIC (good results):
"Create a PlayerMovement MonoBehaviour that uses the Input System package
to read the 'Move' action from my GameInputActions asset, applies
movement to a CharacterController at 5 units/sec, and includes
gravity handling."
```

**Review all generated code.** The Assistant shows a Git-style diff before applying changes. Always review:

1. Check that generated code uses Unity 6 APIs (not deprecated `FindObjectOfType`, `Input.GetKey`, etc.)
2. Verify it references the correct render pipeline (URP vs HDRP)
3. Ensure generated MonoBehaviours follow single-responsibility principles
4. Watch for hardcoded magic numbers — ask the Assistant to extract them as `[SerializeField]` fields

### Agentic Capabilities (Unity 6.3+)

In Unity 6.3 and the 2026 beta, the Assistant gained "agentic" behavior:

- **Profiler analysis** — point the Assistant at a Profiler capture and it identifies bottlenecks, suggesting specific optimizations
- **UI Toolkit layout assistance** — describe a UI and the Assistant generates UXML + USS, placing the `UIDocument` in the scene
- **Multi-step task execution** — "Set up a basic inventory system" can trigger multiple file creations and scene modifications in sequence

> **IMPORTANT:** All agentic code changes require manual approval via the diff viewer. The Assistant will never silently modify your project.

---

## Pillar 2: Generators (Asset Creation)

Generators create assets from text prompts or reference images. Access via Window → Unity AI → Generators.

### Supported Asset Types (as of Unity 6.3)

| Asset Type | Output Format | Notes |
|-----------|---------------|-------|
| **Sprites** | PNG (2D) | Supports style references, transparency, sprite sheet layouts |
| **Textures** | PNG/EXR | PBR-ready: albedo, normal, roughness maps from a single prompt |
| **Materials** | URP/HDRP Material | Applies generated textures to a material with correct shader settings |
| **Audio/SFX** | WAV | Short sound effects — impacts, UI clicks, ambient loops |
| **Animations** | Humanoid AnimClip | Basic locomotion and gesture animations from text descriptions |

### Best Practices for Generation Prompts

```
// WEAK prompt:
"sword texture"

// STRONG prompt:
"Hand-painted fantasy sword texture, 512x512 albedo map, warm steel
blade with blue rune engravings, leather-wrapped grip, stylized art
style matching Torchlight/Hades aesthetic, transparent background"
```

**Tips for consistent results:**
1. Specify resolution explicitly (256, 512, 1024, 2048)
2. Reference art style by naming published games, not artists (avoids copyright concerns)
3. For texture sets, generate the albedo first, then request matching normal/roughness maps referencing the albedo result
4. Use the "Variations" feature to get 4 alternatives from one prompt

### Copyright & Licensing Considerations

Unity AI uses third-party generative models. Key points from Unity's terms:

- **You own the generated output** — Unity claims no rights to assets you generate
- **You bear liability for copyright issues** — Unity does not guarantee that generated assets are free from resemblance to copyrighted works
- **No indemnification** — unlike some AI providers, Unity does not offer IP indemnity for generated content
- **Recommendation:** Use generated assets as placeholders or style references during prototyping. For shipping games, treat generated art as a starting point that should be reviewed and modified by your art team

---

## Pillar 3: Inference Engine (Runtime ML)

The Inference Engine is the rebranded Sentis runtime for executing neural networks in your game at runtime.

> **For full coverage of the Inference Engine API, see [G22 Sentis AI Inference](G22_sentis_ai_inference.md).** The underlying API (`Unity.Sentis`) has not changed with the rebrand — existing Sentis code continues to work.

### What Changed from Sentis to Inference Engine

| Aspect | Sentis (pre-6.2) | Inference Engine (6.2+) |
|--------|-----------------|------------------------|
| Package name | `com.unity.sentis` | `com.unity.ai.inference` (alias exists) |
| Namespace | `Unity.Sentis` | `Unity.Sentis` (unchanged for compatibility) |
| Pricing | Included with Muse | Included with Unity license (no points cost) |
| ONNX support | Up to opset 15 | Opset 15+ with expanded operator coverage |
| GPU backends | Compute shaders | Compute + optional DirectML acceleration |

> **Migration note:** If upgrading from Sentis, update your package reference in the manifest. The C# API is source-compatible — no code changes needed.

---

## Integration with External AI Tools

Unity AI is designed for in-editor assistance. For production AI in your shipped game, the architecture typically looks like:

```
┌──────────────────────────────────────────┐
│  EDITOR TIME (Unity AI)                  │
│  • Assistant writes/reviews code         │
│  • Generators create placeholder assets  │
│  • Profiler analysis suggests fixes      │
└──────────────────────────────────────────┘
              ↓ (exported models)
┌──────────────────────────────────────────┐
│  RUNTIME (Inference Engine / Sentis)     │
│  • NPC behavior (ONNX models)            │
│  • Image super-resolution                │
│  • Voice/gesture recognition             │
│  • Procedural content via neural nets    │
└──────────────────────────────────────────┘
```

Unity AI's Assistant and Generators are **editor-only** — they require a network connection and consume Unity Points. They are not available in built players. For runtime AI, use the Inference Engine with pre-exported ONNX models.

---

## Practical Workflow: Prototyping with Unity AI

Here's how a solo developer might use all three pillars in a prototyping session:

1. **Assistant:** "Create a top-down 2D player controller using Rigidbody2D with the Input System. Add a dash ability on Shift with a 2-second cooldown."
2. **Review the diff**, approve the generated `PlayerController.cs`
3. **Generators:** Generate a 64×64 pixel-art character sprite — "top-down knight character, 4-directional, pixel art, transparent background"
4. **Assistant:** "Set up a 2D animation controller with idle and walk states, transitioning based on a 'Speed' float parameter"
5. **Generators:** Generate a footstep sound effect — "light footstep on stone floor, short, subtle"
6. **Test in Play mode**, use the Assistant to diagnose any runtime errors

> **Time saved:** What might take 2–3 hours of boilerplate setup can be reduced to 30–45 minutes of reviewing and refining AI output.

---

## Limitations & Gotchas

1. **Network dependency** — the Assistant and Generators require an internet connection. No offline fallback for these features
2. **Points consumption** — heavy use during game jams or prototyping sprints can exhaust your monthly point allocation
3. **Code quality varies** — the Assistant sometimes generates Unity 2021-era patterns. Always cross-reference with the [Unity Rules](../unity-arch-rules.md) for correct Unity 6 APIs
4. **No console platform awareness** — generated code may not account for console-specific requirements (memory budgets, certification rules)
5. **Inference Engine model size** — shipping ONNX models increases build size. Quantize models (INT8/FP16) and profile memory on target hardware
6. **Third-party model changes** — Generator output quality may change as Unity updates its AI model providers

---

## Further Reading

- [Unity AI Features Overview](https://unity.com/features/ai)
- [Unity AI Beta 2026 Discussion](https://discussions.unity.com/t/unity-ai-beta-2026-is-here/1703625)
- [Muse Chat Documentation (legacy reference)](https://docs.unity3d.com/Packages/com.unity.muse.chat@1.1/manual/index.html)
- [G22 Sentis AI Inference](G22_sentis_ai_inference.md) — runtime ML model execution guide
