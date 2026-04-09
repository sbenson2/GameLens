# Babylon.js Audio & Spatial Sound for Games

> **Category:** guide · **Engine:** Babylon.js v7+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Physics with Havok](G1_physics_havok.md), [Babylon.js Rules](../babylonjs-rules.md)

Babylon.js ships a full audio engine built on the Web Audio API. Version 7+ introduces **Audio Engine V2** — a ground-up rewrite with spatial audio sources, audio buses for routing and mixing, streaming support, and HRTF-based binaural rendering. This guide covers both ambient and spatial sound, bus architecture, and game-specific patterns.

---

## Audio Engine Setup

### Audio Engine V2 (Recommended)

Audio Engine V2 is the modern audio system. It must be created explicitly and assigned to the scene:

```typescript
import { AudioEngineV2, Scene } from "@babylonjs/core";

const audioEngine = new AudioEngineV2();

const scene = new Scene(engine);
scene.audioEngine = audioEngine;

// Audio engines require a user gesture to unlock (browser autoplay policy)
document.addEventListener("click", () => {
  audioEngine.unlock();
}, { once: true });
```

> **Why V2?** The original `AudioEngine` (V1) is a thin wrapper around Web Audio with limited bus routing and no built-in spatial model. V2 adds audio buses, spatial sources with HRTF, streaming, and better lifecycle management. New projects should use V2.

### Checking Audio State

```typescript
if (audioEngine.isUnlocked) {
  // Safe to play sounds
}

audioEngine.onUnlockedObservable.add(() => {
  console.log("Audio engine unlocked — autoplay is now allowed");
});
```

---

## Playing Sounds

### Static Sounds (Loaded in Memory)

Best for short, frequently-played audio like SFX (gunshots, footsteps, UI clicks):

```typescript
import { Sound } from "@babylonjs/core";

// V1-style (still works with V2 as the scene engine)
const shootSfx = new Sound("shoot", "audio/shoot.wav", scene, null, {
  loop: false,
  volume: 0.8,
  playbackRate: 1.0,
});

// Play on demand
shootSfx.play();

// Play with a delay (seconds)
shootSfx.play(0.5);
```

### Streaming Sounds

Best for music and ambient loops — data is decoded on the fly, lower memory:

```typescript
const bgMusic = new Sound("music", "audio/background.ogg", scene, null, {
  loop: true,
  volume: 0.4,
  streaming: true,
  autoplay: true, // plays once audio engine is unlocked
});
```

### Sound Sprites

When you pack multiple short SFX into a single file (common in web games to reduce HTTP requests), use offset and length:

```typescript
const sfxAtlas = new Sound("atlas", "audio/sfx-atlas.mp3", scene, null, {
  loop: false,
});

// Play a specific sprite: offset 2.0s, length 0.5s
sfxAtlas.play(0, 2.0, 0.5);
```

---

## Spatial Audio

Spatial audio positions sound sources in 3D space so they pan, attenuate, and filter based on the listener's (camera's) position and orientation.

### Enabling Spatial Sound

```typescript
const engineSound = new Sound("engine", "audio/engine-loop.wav", scene, null, {
  loop: true,
  spatialSound: true,       // Enable 3D positioning
  distanceModel: "linear",  // "linear" | "inverse" | "exponential"
  maxDistance: 100,          // Distance at which sound is silent (linear model)
  rolloffFactor: 1,         // How fast volume drops with distance
  refDistance: 1,            // Distance at which volume is 100%
});
```

### Distance Models

| Model | Behaviour | Best for |
|-------|-----------|----------|
| `"linear"` | Volume drops linearly from `refDistance` to `maxDistance`, then silent | Predictable, easy to tune |
| `"inverse"` | Realistic inverse-square falloff, never fully silent | Outdoor environments, realism |
| `"exponential"` | Steep falloff | Close-range emphasis, horror |

### Attaching Sound to a Mesh

The easiest way to position spatial audio is to attach it to a game object:

```typescript
import { MeshBuilder } from "@babylonjs/core";

const car = MeshBuilder.CreateBox("car", { size: 2 }, scene);

engineSound.attachToMesh(car);
// Sound position now follows the mesh's world position automatically
```

When the mesh moves, the sound's 3D position updates every frame. The listener position tracks the active camera by default.

### Manual Positioning

If you need to position a sound without a mesh:

```typescript
import { Vector3 } from "@babylonjs/core";

engineSound.setPosition(new Vector3(10, 0, 5));

// Update each frame for moving sources:
scene.onBeforeRenderObservable.add(() => {
  engineSound.setPosition(movingTarget.position);
});
```

### Directional Sound (Cones)

Directional sound emits in a cone — like a loudspeaker or a character's voice:

```typescript
const speaker = new Sound("announcement", "audio/announcement.mp3", scene, null, {
  spatialSound: true,
  loop: true,
});

speaker.setDirectionalCone(90, 180, 0.1);
// innerAngle: 90° — full volume within this cone
// outerAngle: 180° — transition zone
// outerGain: 0.1 — volume outside the outer cone (10% of max)

speaker.setLocalDirectionToMesh(new Vector3(0, 0, 1)); // Forward direction
speaker.attachToMesh(speakerMesh);
```

### HRTF (Binaural) Rendering

For headphone users, HRTF (Head-Related Transfer Function) provides convincing 3D positioning:

```typescript
const spatialSound = new Sound("footstep", "audio/footstep.wav", scene, null, {
  spatialSound: true,
  useCustomAttenuation: false,
});

// The underlying PannerNode uses "HRTF" model by default when spatialSound is true
// This is the W3C Web Audio standard HRTF panning
```

> **Note:** HRTF quality depends on the browser's built-in HRTF dataset. Results vary across browsers and platforms. Test on target devices.

---

## Audio Buses

Audio buses let you group sounds and control them together — essential for separate volume sliders (master, music, SFX, voice).

```typescript
import { AudioBus } from "@babylonjs/core";

// Create buses
const masterBus = new AudioBus("master", audioEngine);
const sfxBus    = new AudioBus("sfx", audioEngine);
const musicBus  = new AudioBus("music", audioEngine);
const voiceBus  = new AudioBus("voice", audioEngine);

// Route sub-buses to master
sfxBus.connectTo(masterBus);
musicBus.connectTo(masterBus);
voiceBus.connectTo(masterBus);

// Connect master to output
masterBus.connectToOutput();

// Route individual sounds to buses
shootSfx.connectToBus(sfxBus);
bgMusic.connectToBus(musicBus);

// Volume control per bus
sfxBus.volume = 0.8;
musicBus.volume = 0.4;
masterBus.volume = 1.0;
```

### Muting Categories

```typescript
function muteMusic(muted: boolean): void {
  musicBus.volume = muted ? 0 : savedMusicVolume;
}

// Or use the global mute
audioEngine.setGlobalVolume(0); // Mute everything
```

---

## Game Audio Patterns

### Pooling SFX for Rapid Playback

Rapid-fire sounds (e.g., machine gun) can overlap. Use `Sound` with `{ loop: false }` — Babylon.js allows overlapping plays of the same Sound instance by default:

```typescript
const gunshot = new Sound("gun", "audio/gunshot.wav", scene, null, {
  loop: false,
  volume: 0.6,
  spatialSound: true,
});

function fireWeapon(position: Vector3): void {
  gunshot.setPosition(position);
  gunshot.play(); // Can overlap with previous play
}
```

### Random Pitch Variation

Repeated identical sounds feel robotic. Randomise pitch:

```typescript
function playFootstep(position: Vector3): void {
  footstepSound.setPosition(position);
  footstepSound.setPlaybackRate(0.9 + Math.random() * 0.2); // 0.9–1.1
  footstepSound.play();
}
```

### Crossfading Music Tracks

```typescript
function crossfadeTo(next: Sound, duration: number = 2): void {
  const current = bgMusic;
  const startVolume = current.getVolume();

  next.setVolume(0);
  next.play();

  let elapsed = 0;
  scene.onBeforeRenderObservable.add(function fade() {
    elapsed += scene.getEngine().getDeltaTime() / 1000;
    const t = Math.min(elapsed / duration, 1);
    current.setVolume(startVolume * (1 - t));
    next.setVolume(startVolume * t);
    if (t >= 1) {
      current.stop();
      scene.onBeforeRenderObservable.removeCallback(fade);
    }
  });
}
```

### Ambient Sound Zones

Trigger ambient audio when the player enters an area:

```typescript
import { ActionManager, ExecuteCodeAction, MeshBuilder } from "@babylonjs/core";

const zoneMesh = MeshBuilder.CreateBox("zone", { width: 20, height: 5, depth: 20 }, scene);
zoneMesh.isVisible = false;
zoneMesh.actionManager = new ActionManager(scene);

const caveAmbience = new Sound("cave", "audio/cave-drip.ogg", scene, null, {
  loop: true,
  volume: 0,
  autoplay: true,
});

zoneMesh.actionManager.registerAction(
  new ExecuteCodeAction(ActionManager.OnIntersectionEnterTrigger, () => {
    caveAmbience.setVolume(0.6, 1.5); // Fade in over 1.5s
  })
).then(
  new ExecuteCodeAction(ActionManager.OnIntersectionExitTrigger, () => {
    caveAmbience.setVolume(0, 1.5);   // Fade out
  })
);
```

---

## Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| File format | Use `.ogg` (Vorbis) for cross-browser compressed audio. Fall back to `.mp3` for Safari older than v17. `.wav` only for very short SFX where decode latency matters. |
| Preloading | Load all game SFX during a loading screen. Use `Sound`'s ready callback to track progress. |
| Simultaneous sounds | Browsers limit concurrent `AudioBufferSourceNode`s (typically 32–128). Use buses and priority to cull low-priority sounds. |
| Mobile autoplay | Always wait for a user gesture before calling `play()`. Use `audioEngine.unlock()` on the first tap. |
| Spatial sound overhead | Each spatial source uses a `PannerNode` — lightweight individually but adds up. Pool and reuse sounds rather than creating new instances per play. |
| Memory | Streaming is cheaper for long tracks (music, ambient). Static sounds are cheaper per-play for short SFX. |
| HRTF vs equal-power | HRTF is more CPU-intensive but better for headphones. Equal-power panning is cheaper and fine for speaker output. |

---

## Common Pitfalls

1. **Forgetting to unlock the audio engine** — browsers block autoplay. Always call `audioEngine.unlock()` on a user gesture.
2. **Using V1 API patterns with V2** — `Sound` still works, but bus routing and spatial APIs differ. Check the [migration guide](https://doc.babylonjs.com/features/featuresDeepDive/audio/migrate).
3. **Not setting `maxDistance`** — with `"inverse"` distance model, sound never reaches zero. Set a practical `maxDistance` and cull sounds beyond it.
4. **Creating sounds in the render loop** — allocates `AudioBufferSourceNode`s every frame. Create sounds once, reuse.
5. **Ignoring `scene.audioEnabled`** — set to `false` when the scene is paused to stop all processing.
