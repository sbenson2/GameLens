# Three.js Audio System — Spatial Sound for Games

> **Category:** guide · **Engine:** Three.js r160+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Camera Systems](G4_camera_systems.md), [Three.js Rules](../threejs-rules.md)

Three.js wraps the Web Audio API into a scene-graph-aware audio system. An `AudioListener` attached to the camera acts as the player's ears, while `Audio` (non-positional) and `PositionalAudio` (3D spatialized) nodes emit sound. Because Three.js is a rendering library, the audio system is intentionally minimal — it handles spatial playback but leaves advanced mixing, ducking, and music systems to the developer.

## Core Classes

### AudioListener

A single `AudioListener` represents the player. Attach it to the camera so head position and orientation update automatically:

```typescript
import * as THREE from "three";

const listener = new THREE.AudioListener();
camera.add(listener); // moves with camera each frame

// Master volume (affects ALL audio nodes)
listener.setMasterVolume(0.8);
```

**Key properties:**

| Property | Type | Description |
|----------|------|-------------|
| `context` | `AudioContext` | The underlying Web Audio context (readonly) |
| `gain` | `GainNode` | Master gain node for volume control (readonly) |
| `filter` | `AudioNode \| null` | Optional global filter (e.g., low-pass for underwater) |

**Important:** Browsers require a user gesture before an `AudioContext` can start. Call `listener.context.resume()` inside a click/touch handler if audio doesn't play on page load.

### Audio (Non-Positional)

`Audio` plays sound at constant volume regardless of position — use it for background music and UI sounds:

```typescript
const bgMusic = new THREE.Audio(listener);

const loader = new THREE.AudioLoader();
loader.load("music/theme.ogg", (buffer: AudioBuffer) => {
  bgMusic.setBuffer(buffer);
  bgMusic.setLoop(true);
  bgMusic.setVolume(0.5);
  bgMusic.play();
});
```

### PositionalAudio (3D Spatial)

`PositionalAudio` attaches to an `Object3D` and spatializes sound using a Web Audio `PannerNode` with HRTF panning. Volume, panning, and filtering change as the listener moves relative to the source:

```typescript
const footstepSound = new THREE.PositionalAudio(listener);

loader.load("sfx/footstep.ogg", (buffer: AudioBuffer) => {
  footstepSound.setBuffer(buffer);
  footstepSound.setRefDistance(10);    // full volume within 10 units
  footstepSound.setRolloffFactor(1.5); // how fast it fades
  footstepSound.setDistanceModel("inverse"); // inverse, linear, or exponential
  footstepSound.setMaxDistance(200);
});

// Attach to an enemy mesh — sound follows the enemy
enemyMesh.add(footstepSound);
```

## Distance Models

The `distanceModel` property controls how volume decreases with distance:

| Model | Formula | Best for |
|-------|---------|----------|
| `"inverse"` (default) | `refDist / (refDist + rolloff * (dist - refDist))` | Most games — natural falloff |
| `"linear"` | `1 - rolloff * (dist - refDist) / (maxDist - refDist)` | Hard cutoff at max distance |
| `"exponential"` | `(dist / refDist) ^ -rolloff` | Large open worlds |

**Tuning tips:**
- `refDistance` = the radius where sound is at full volume. For footsteps, 1–3 units; for explosions, 20–50 units.
- `rolloffFactor` = speed of falloff. Higher values = faster fade. Start with 1.0 and adjust.
- `maxDistance` only matters for the `"linear"` model.

## Directional Audio (Cones)

`PositionalAudio` supports directional cones for sounds that project in a specific direction (e.g., a loudspeaker, a car horn):

```typescript
sound.setDirectionalCone(
  180,  // inner cone angle (degrees) — full volume
  360,  // outer cone angle (degrees) — reduced volume
  0.1   // outer cone gain (0 = silent outside cone)
);
```

The cone direction is the local +Z axis of the `Object3D` the sound is attached to.

## Audio Management Patterns for Games

### Sound Pool (Avoid Overlapping One-Shots)

Playing the same sound effect rapidly (gunshots, footsteps) can cause clipping. Use a pool:

```typescript
class SoundPool {
  private pool: THREE.PositionalAudio[];
  private index = 0;

  constructor(
    listener: THREE.AudioListener,
    buffer: AudioBuffer,
    size: number,
    parent: THREE.Object3D
  ) {
    this.pool = Array.from({ length: size }, () => {
      const audio = new THREE.PositionalAudio(listener);
      audio.setBuffer(buffer);
      audio.setRefDistance(5);
      parent.add(audio);
      return audio;
    });
  }

  play(): void {
    const sound = this.pool[this.index];
    if (sound.isPlaying) sound.stop();
    sound.play();
    this.index = (this.index + 1) % this.pool.length;
  }
}
```

### Audio Bus with Filters

Apply effects like low-pass filtering when the player goes underwater:

```typescript
function setUnderwaterEffect(listener: THREE.AudioListener, active: boolean): void {
  if (active) {
    const lowpass = listener.context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 400;
    listener.setFilter(lowpass);
  } else {
    listener.removeFilter();
  }
}
```

### Preloading Audio Assets

Load all audio during a loading screen to avoid playback delays:

```typescript
async function preloadAudio(
  loader: THREE.AudioLoader,
  urls: string[]
): Promise<Map<string, AudioBuffer>> {
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          loader.load(
            url,
            (buffer) => { buffers.set(url, buffer); resolve(); },
            undefined,
            reject
          );
        })
    )
  );
  return buffers;
}
```

## Debugging

Use `PositionalAudioHelper` to visualize the inner/outer cones of a directional source:

```typescript
import { PositionalAudioHelper } from "three/addons/helpers/PositionalAudioHelper.js";

const helper = new PositionalAudioHelper(sound, 10); // range = 10
sound.add(helper);
```

## Performance Considerations

- **Limit concurrent sources.** Mobile GPUs and low-end devices struggle with > 20–30 simultaneous `PannerNode` instances. Use sound pools and distance culling (stop sounds beyond `maxDistance`).
- **Prefer `.ogg` format.** Widely supported, smaller than `.wav`, and decodes faster than `.mp3`. Provide `.mp3` fallback for Safari (which added OGG support in Safari 17+).
- **Use `AudioLoader` not `<audio>` elements.** `AudioLoader` decodes audio into an `AudioBuffer` for precise playback control. `MediaElementAudioSource` (from HTML `<audio>`) cannot be used with `PositionalAudio` reliably.
- **Suspend the context when paused.** Call `listener.context.suspend()` when the game is paused and `listener.context.resume()` when unpaused to free CPU.
- **Memory:** Decoded audio buffers are large (a 1-minute 44.1kHz stereo clip ≈ 10 MB in memory). Share buffers across multiple `Audio`/`PositionalAudio` instances — don't decode the same file twice.
