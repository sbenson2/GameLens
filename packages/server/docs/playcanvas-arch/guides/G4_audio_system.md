# PlayCanvas Audio System — Spatial Sound for Games

> **Category:** guide · **Engine:** PlayCanvas v2+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Scripting System](G1_scripting_system.md), [PlayCanvas Rules](../playcanvas-rules.md)

PlayCanvas provides a component-based audio system built on the Web Audio API. The `SoundComponent` and `AudioListenerComponent` work together to deliver 2D and 3D positional audio with distance-based attenuation, making it straightforward to add immersive game audio.

---

## Core Concepts

PlayCanvas audio is entity-driven:

- **`SoundComponent`** — attached to an entity that emits sound. Manages one or more named **SoundSlots**, each playing a different audio asset.
- **`AudioListenerComponent`** — attached to the entity that "hears" sound (typically the camera or player). Acts as a virtual microphone. Only one listener should be active at a time.
- **`SoundSlot`** — a named entry within a SoundComponent, with its own asset reference, volume, pitch, loop, and autoPlay settings.

---

## Setting Up the Listener

The listener must exist in the scene for positional audio to work. Attach it to the camera or player entity:

```typescript
// In an ESM script attached to the camera entity
import { Script } from 'playcanvas';

export class AudioSetup extends Script {
  initialize() {
    // The AudioListenerComponent is typically added via the Editor,
    // but you can also add it in code:
    if (!this.entity.audiolistener) {
      this.entity.addComponent('audiolistener');
    }
  }
}
```

> **One listener rule:** If multiple entities have `AudioListenerComponent`, only the last one activated will be used. Remove or disable listeners on inactive cameras.

---

## SoundComponent Basics

### Adding a 2D Sound (Non-Positional)

2D sounds play at constant volume regardless of position — use for music, UI feedback, and narration.

```typescript
import { Script } from 'playcanvas';

export class BackgroundMusic extends Script {
  initialize() {
    this.entity.addComponent('sound');

    this.entity.sound.addSlot('bgm', {
      asset: this.app.assets.find('background-music.mp3')?.id,
      loop: true,
      autoPlay: true,
      volume: 0.4,
      pitch: 1.0,
      positional: false  // 2D — no spatialization
    });
  }

  // Fade out helper
  fadeOut(duration: number) {
    const slot = this.entity.sound.slot('bgm');
    if (!slot) return;

    const startVol = slot.volume;
    let elapsed = 0;

    this.on('update', (dt: number) => {
      elapsed += dt;
      const t = Math.min(elapsed / duration, 1);
      slot.volume = startVol * (1 - t);
      if (t >= 1) {
        slot.stop();
        this.off('update');
      }
    });
  }
}
```

### Adding a 3D Positional Sound

Positional sounds are spatialized — volume and panning change based on the listener's distance and orientation.

```typescript
import { Script } from 'playcanvas';

export class AmbientFire extends Script {
  initialize() {
    this.entity.addComponent('sound');

    this.entity.sound.addSlot('fire', {
      asset: this.app.assets.find('fire-crackle.ogg')?.id,
      loop: true,
      autoPlay: true,
      volume: 0.8,
      pitch: 1.0,
      positional: true,       // 3D spatialization enabled
      refDistance: 2,          // full volume within this range
      maxDistance: 50,         // silent beyond this range
      rollOffFactor: 1.5,     // how quickly volume drops off
      distanceModel: 'inverse' // 'inverse' | 'linear' | 'exponential'
    });
  }
}
```

---

## Distance Models

The `distanceModel` property controls the volume falloff curve:

| Model | Formula (simplified) | Best for |
|-------|---------------------|----------|
| `'inverse'` | `refDist / (refDist + rollOff * (dist - refDist))` | Natural falloff — most common for games |
| `'linear'` | `1 - rollOff * (dist - refDist) / (maxDist - refDist)` | Predictable cutoff — good for UI or dialogue range |
| `'exponential'` | `(dist / refDist) ^ -rollOff` | Dramatic falloff — explosions, alarms |

**Key parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `refDistance` | 1 | Distance at which volume is at full level |
| `maxDistance` | 10000 | Maximum distance (mainly affects `linear` model) |
| `rollOffFactor` | 1 | Multiplier for falloff rate — higher = faster drop |

> **Tuning tip:** Start with `inverse` model, `refDistance: 3`, `rollOffFactor: 1`. Adjust `refDistance` to match the visual size of the sound source (e.g., a campfire might be 2–3 units, a waterfall 8–10 units).

---

## Controlling Playback

SoundSlots provide full playback control:

```typescript
const sound = this.entity.sound;

// Play / stop / pause
sound.slot('fire')?.play();
sound.slot('fire')?.stop();
sound.slot('fire')?.pause();
sound.slot('fire')?.resume();

// Dynamic property changes
const slot = sound.slot('fire');
if (slot) {
  slot.volume = 0.5;    // range: 0–1
  slot.pitch = 1.2;     // 1.0 = normal speed
  slot.loop = false;
}

// One-shot sounds (play overlapping instances)
sound.slot('gunshot')?.play(); // each call creates a new instance
```

### Events

```typescript
const slot = this.entity.sound.slot('voiceline');
if (slot) {
  slot.on('end', () => {
    console.log('Voice line finished');
    showNextDialogueOption();
  });

  slot.on('play', () => {
    subtitleUI.show(currentLine);
  });
}
```

---

## Game Audio Patterns

### Sound Pooling for Frequent Effects

For rapid-fire sounds (footsteps, bullets), manage volume overlap:

```typescript
import { Script } from 'playcanvas';

export class FootstepAudio extends Script {
  private cooldown = 0;
  private stepInterval = 0.35; // seconds between steps

  update(dt: number) {
    this.cooldown -= dt;

    if (this.isWalking() && this.cooldown <= 0) {
      // Randomize pitch for variety
      const slot = this.entity.sound.slot('step');
      if (slot) {
        slot.pitch = 0.9 + Math.random() * 0.2;
        slot.play();
      }
      this.cooldown = this.stepInterval;
    }
  }

  private isWalking(): boolean {
    // Check player velocity or animation state
    return this.entity.rigidbody?.linearVelocity.length() > 0.5;
  }
}
```

### Music Crossfade

```typescript
import { Script } from 'playcanvas';

export class MusicManager extends Script {
  private fadeDuration = 2.0;

  crossfadeTo(newTrackName: string) {
    const sound = this.entity.sound;

    // Fade out all current slots
    for (const name in sound.slots) {
      const slot = sound.slot(name);
      if (slot && slot.isPlaying) {
        this.fadeSlot(slot, slot.volume, 0, this.fadeDuration, true);
      }
    }

    // Fade in new track
    const newSlot = sound.slot(newTrackName);
    if (newSlot) {
      newSlot.volume = 0;
      newSlot.play();
      this.fadeSlot(newSlot, 0, 0.4, this.fadeDuration, false);
    }
  }

  private fadeSlot(
    slot: any,
    from: number,
    to: number,
    duration: number,
    stopOnComplete: boolean
  ) {
    let elapsed = 0;
    const handler = (dt: number) => {
      elapsed += dt;
      const t = Math.min(elapsed / duration, 1);
      slot.volume = from + (to - from) * t;
      if (t >= 1) {
        if (stopOnComplete) slot.stop();
        this.off('update', handler);
      }
    };
    this.on('update', handler);
  }
}
```

### Audio Zones (Reverb / Environment)

PlayCanvas does not have built-in audio zones, but you can use trigger volumes and the Web Audio API directly:

```typescript
import { Script } from 'playcanvas';

export class AudioZone extends Script {
  private convolver: ConvolverNode | null = null;

  initialize() {
    // Access the underlying Web Audio context
    const ctx = this.app.systems.sound.manager.context as AudioContext;

    this.convolver = ctx.createConvolver();
    // Load an impulse response for reverb
    this.loadImpulseResponse(ctx, '/audio/reverb-cave.wav');

    // Listen for trigger events (requires rigidbody + collision)
    this.entity.collision?.on('triggerenter', this.onEnterZone, this);
    this.entity.collision?.on('triggerleave', this.onLeaveZone, this);
  }

  private async loadImpulseResponse(ctx: AudioContext, url: string) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    if (this.convolver) {
      this.convolver.buffer = await ctx.decodeAudioData(buffer);
    }
  }

  private onEnterZone() {
    // Connect the convolver to the audio graph
    // Implementation depends on your audio routing
    console.log('Entered reverb zone');
  }

  private onLeaveZone() {
    console.log('Left reverb zone');
  }
}
```

---

## Performance Considerations

1. **Audio format:** Use `.ogg` (Vorbis) for best compression/quality ratio on web. Provide `.mp3` fallback for Safari (which may lack Ogg support on older iOS). PlayCanvas will auto-select.

2. **Concurrent sounds:** Web Audio API has soft limits on simultaneous sources. On mobile, keep concurrent positional sounds under 16. Prioritize sounds closest to the listener and cull distant ones.

3. **Autoplay restrictions:** Browsers block audio playback until a user gesture. PlayCanvas handles resume-on-interaction, but always start gameplay audio inside a click/touch handler or after the user has interacted. Call `this.app.systems.sound.manager.context.resume()` if needed.

4. **Asset preloading:** Mark audio assets as `preload: true` in the Editor (or via `app.assets.load(asset)`) to avoid playback delays. For large music files, consider streaming rather than preloading.

5. **Memory:** Uncompressed audio in memory can be large (a 3-minute stereo track at 44.1 kHz = ~30MB). Keep ambient loops short (15–30s) and layer them for variety.

6. **Mobile GPU budget:** Audio processing happens on the CPU, but decoding large files during gameplay can cause frame drops. Decode during loading screens using `AudioContext.decodeAudioData()`.

---

## WebGPU Notes

The audio system is independent of the rendering backend. `SoundComponent`, `AudioListenerComponent`, and the Web Audio API work identically whether PlayCanvas is rendering via WebGL2 or WebGPU — audio is always processed on the CPU through the browser's Web Audio implementation.
