# G87 — 3D Spatial Audio & Audio Middleware Integration

> **Category:** guide · **Engine:** MonoGame · **Related:** [G6 Audio](./G6_audio.md) · [G20 Camera Systems](./G20_camera_systems.md) · [G21 Coordinate Systems](./G21_coordinate_systems.md) · [G10 Custom Game Systems](./G10_custom_game_systems.md) · [G77 ECS Event & Messaging](./G77_ecs_event_messaging.md)

How to implement true 3D positional audio in MonoGame using the built-in `Apply3D` API and FMOD Studio's 3D event system. Covers `AudioListener`/`AudioEmitter` setup, 2D-to-3D coordinate mapping, distance attenuation models, occlusion, Doppler, and architectural patterns for managing hundreds of spatial sound sources in an ECS world.

---

## MonoGame Built-in 3D Audio (Apply3D)

MonoGame inherits XNA's 3D audio system through `SoundEffectInstance.Apply3D()`. It handles panning, distance attenuation, and Doppler automatically — but requires mono audio files and manual per-frame updates.

### Core API

```csharp
// AudioListener — represents the player's ears in 3D space
var listener = new AudioListener
{
    Position = new Vector3(playerX, playerY, 0f),
    Forward  = Vector3.Forward,  // -Z by default
    Up       = Vector3.Up,       // +Y
    Velocity = new Vector3(playerVelX, playerVelY, 0f)
};

// AudioEmitter — represents a sound source in the world
var emitter = new AudioEmitter
{
    Position = new Vector3(enemyX, enemyY, 0f),
    Forward  = Vector3.Forward,
    Up       = Vector3.Up,
    Velocity = new Vector3(enemyVelX, enemyVelY, 0f),
    DopplerScale = 1f  // 0 = no Doppler, 1 = realistic
};

// Apply — must call EVERY frame while the sound plays
SoundEffectInstance instance = explosionSfx.CreateInstance();
instance.Apply3D(listener, emitter);
instance.Play();
```

### Critical Requirements

1. **Mono audio only.** `Apply3D` throws an exception on stereo files. Export all spatial sound effects as mono `.wav` / `.ogg`. Stereo is fine for music and UI sounds that skip 3D processing.

2. **Call Apply3D every frame.** Position changes are not tracked automatically. If you call `Apply3D` once and never again, the sound stays panned to its initial position even as entities move.

3. **Set Velocity for Doppler.** The `Velocity` property on both listener and emitter is NOT calculated automatically from position deltas. You must set it yourself from your physics/movement system.

4. **Units matter.** `SoundEffect.DistanceScale` (static) controls the scale factor for distance calculations. The default is 1.0 — meaning 1 unit = 1 meter for attenuation purposes. If your game world uses pixels, set this appropriately:

```csharp
// If 1 world unit = 1 pixel at 64 pixels per meter:
SoundEffect.DistanceScale = 64f;

// Controls how quickly volume drops with distance.
// Default 1.0 = inverse-square rolloff starting at DistanceScale units.
SoundEffect.MasterVolume = 1f;
```

---

## 2D Game Coordinate Mapping

Most MonoGame games are 2D but still want spatial audio. The trick is mapping 2D world coordinates into the 3D space that `Apply3D` expects.

### Strategy: Flatten onto the XY Plane

```csharp
public class SpatialAudioSystem
{
    private readonly AudioListener _listener = new();

    // Call once per frame with camera/player position
    public void UpdateListener(Vector2 worldPos, Vector2 velocity)
    {
        _listener.Position = new Vector3(worldPos.X, worldPos.Y, 0f);
        _listener.Velocity = new Vector3(velocity.X, velocity.Y, 0f);
        _listener.Forward  = -Vector3.UnitZ; // looking "into" the screen
        _listener.Up       = Vector3.UnitY;
    }

    public void Apply(SoundEffectInstance instance, Vector2 sourcePos, Vector2 sourceVel)
    {
        var emitter = new AudioEmitter
        {
            Position = new Vector3(sourcePos.X, sourcePos.Y, 0f),
            Velocity = new Vector3(sourceVel.X, sourceVel.Y, 0f)
        };
        instance.Apply3D(_listener, emitter);
    }
}
```

### Why Not Just Use Pan + Volume?

The manual approach from G6 (`SpatialAudio2D.Calculate`) gives you volume and pan, which is sufficient for many games. Use `Apply3D` when you need:

- **Doppler effect** — pitch shifting for fast-moving objects (racing games, projectiles).
- **Multiple listeners** — split-screen with `Apply3D(AudioListener[], AudioEmitter)`.
- **Consistent attenuation model** — the built-in inverse-distance rolloff matches industry standards without manual tuning.

---

## Managing Many Spatial Sources

Games with hundreds of entities emitting sounds need careful management. Calling `Apply3D` on 200+ `SoundEffectInstance` objects per frame is wasteful if most are out of earshot.

### Hybrid Pool with Distance Culling

```csharp
public class SpatialSoundManager
{
    private readonly AudioListener _listener = new();
    private readonly List<TrackedSound> _active = new(64);
    private float _cullDistanceSq;

    public SpatialSoundManager(float cullDistance = 1200f)
    {
        _cullDistanceSq = cullDistance * cullDistance;
    }

    public void UpdateListener(Vector2 pos, Vector2 vel)
    {
        _listener.Position = new Vector3(pos, 0f);
        _listener.Velocity = new Vector3(vel, 0f);
    }

    /// <summary>
    /// Play a spatial sound. Returns null if source is beyond cull distance.
    /// </summary>
    public TrackedSound? Play(SoundEffect sfx, Vector2 sourcePos, Vector2 sourceVel,
                              bool loop = false)
    {
        float distSq = Vector2.DistanceSquared(
            new Vector2(_listener.Position.X, _listener.Position.Y), sourcePos);

        if (distSq > _cullDistanceSq) return null; // too far, don't even start

        var instance = sfx.CreateInstance();
        instance.IsLooped = loop;

        var tracked = new TrackedSound
        {
            Instance = instance,
            Emitter = new AudioEmitter
            {
                Position = new Vector3(sourcePos, 0f),
                Velocity = new Vector3(sourceVel, 0f)
            }
        };
        instance.Apply3D(_listener, tracked.Emitter);
        instance.Play();
        _active.Add(tracked);
        return tracked;
    }

    public void Update()
    {
        for (int i = _active.Count - 1; i >= 0; i--)
        {
            var s = _active[i];
            if (s.Instance.State == SoundState.Stopped)
            {
                s.Instance.Dispose();
                _active.RemoveAt(i);
                continue;
            }

            // Cull sounds that have moved too far away
            float distSq = Vector2.DistanceSquared(
                new Vector2(_listener.Position.X, _listener.Position.Y),
                new Vector2(s.Emitter.Position.X, s.Emitter.Position.Y));

            if (distSq > _cullDistanceSq)
            {
                s.Instance.Stop();
                s.Instance.Dispose();
                _active.RemoveAt(i);
                continue;
            }

            s.Instance.Apply3D(_listener, s.Emitter);
        }
    }

    public class TrackedSound
    {
        public SoundEffectInstance Instance;
        public AudioEmitter Emitter;

        public void UpdatePosition(Vector2 pos, Vector2 vel)
        {
            Emitter.Position = new Vector3(pos, 0f);
            Emitter.Velocity = new Vector3(vel, 0f);
        }
    }
}
```

### Priority System

When the pool approaches the platform limit (~256 concurrent `SoundEffectInstance`), prioritize:

1. **Player-triggered sounds** (attacks, footsteps) — always play.
2. **Nearby enemy actions** — play if within half the cull distance.
3. **Ambient loops** — play the closest N, fade the rest.
4. **Distant one-shots** — drop silently.

---

## FMOD 3D Event Positioning

For games using FMOD via FmodForFoxes (setup in [G6](./G6_audio.md)), 3D positioning is handled through the FMOD Studio event system with richer control than the built-in API.

### Setting 3D Attributes on Events

```csharp
using FmodForFoxes;
using FmodForFoxes.Studio;

// Create and position a 3D event instance
var eventDesc = StudioSystem.GetEvent("event:/SFX/Explosion");
var eventInst = eventDesc.CreateInstance();

// FMOD uses a right-handed coordinate system.
// For a 2D game, map X → X, Y → Z, and leave Y (up) at 0.
var attributes = new FMOD.ATTRIBUTES_3D
{
    position = new FMOD.VECTOR { x = worldX, y = 0f, z = worldY },
    velocity = new FMOD.VECTOR { x = velX,   y = 0f, z = velY },
    forward  = new FMOD.VECTOR { x = 0f,     y = 0f, z = 1f },
    up       = new FMOD.VECTOR { x = 0f,     y = 1f, z = 0f }
};
eventInst.Set3DAttributes(attributes);
eventInst.Start();

// Update listener every frame
var listenerAttr = new FMOD.ATTRIBUTES_3D
{
    position = new FMOD.VECTOR { x = camX, y = 0f, z = camY },
    velocity = new FMOD.VECTOR { x = camVelX, y = 0f, z = camVelY },
    forward  = new FMOD.VECTOR { x = 0f, y = 0f, z = 1f },
    up       = new FMOD.VECTOR { x = 0f, y = 1f, z = 0f }
};
StudioSystem.SetListenerAttributes(0, listenerAttr);
```

### FMOD Advantages over Built-in Apply3D

| Feature | MonoGame Apply3D | FMOD Studio 3D |
|---------|-----------------|----------------|
| Distance attenuation curves | Inverse-distance only | Custom curves in Studio GUI |
| Occlusion | Manual (see below) | Built-in occlusion parameter |
| Reverb zones | Not supported | Snapshot-based reverb zones |
| Doppler | Basic, via Velocity | Per-event Doppler tuning |
| Spatializer plugins | None | Steam Audio, Oculus Spatializer |
| Max simulteness | ~256 platform limit | Virtual voices — thousands |
| Runtime parameter control | Volume/pitch only | Named parameters (surface type, health, intensity) |

---

## Occlusion (Walls Blocking Sound)

Neither MonoGame's built-in audio nor basic FMOD setup handles sound blocked by walls automatically. You need gameplay-side raycasting to detect obstruction, then apply a low-pass filter or volume reduction.

### Raycast-Based Occlusion

```csharp
public class AudioOcclusion
{
    /// <summary>
    /// Returns 0.0 (fully occluded) to 1.0 (line of sight clear).
    /// Uses your game's collision system to count wall intersections.
    /// </summary>
    public static float Calculate(Vector2 listener, Vector2 source,
                                   Func<Vector2, Vector2, int> raycastWallCount)
    {
        int walls = raycastWallCount(listener, source);
        if (walls == 0) return 1f;

        // Each wall reduces the openness factor.
        // Tune the per-wall factor for your game (0.3–0.5 is typical).
        float factor = MathF.Pow(0.4f, walls);
        return MathHelper.Clamp(factor, 0.05f, 1f); // never fully silent
    }
}

// Usage with built-in audio:
float openness = AudioOcclusion.Calculate(playerPos, enemyPos, MyPhysics.CountWalls);
soundInstance.Volume = baseVolume * openness;

// Usage with FMOD (set a parameter the sound designer controls in Studio):
eventInst.SetParameterByName("Occlusion", 1f - openness);
```

### Reverb Zones (FMOD)

In FMOD Studio, create **Snapshots** for different environments (cave, forest, interior). Trigger them based on which zone the listener occupies:

```csharp
private FMOD.Studio.EventInstance _activeReverb;

public void EnterZone(string zone)
{
    _activeReverb?.Stop(FMOD.Studio.STOP_MODE.ALLOWFADEOUT);

    string snapshotPath = zone switch
    {
        "cave"     => "snapshot:/Reverb_Cave",
        "forest"   => "snapshot:/Reverb_Forest",
        "interior" => "snapshot:/Reverb_Interior",
        _          => null
    };

    if (snapshotPath != null)
    {
        var snapshot = StudioSystem.GetEvent(snapshotPath);
        _activeReverb = snapshot.CreateInstance();
        _activeReverb.Start();
    }
}
```

---

## ECS Integration Pattern (Arch)

In an Arch ECS architecture, spatial audio becomes a system that queries entities with position and audio components.

```csharp
// Components
public record struct AudioSource(
    string EventName,
    bool Loop,
    float MaxDistance
);

public record struct PlayingAudio(
    SoundEffectInstance Instance,
    AudioEmitter Emitter
);

// System — runs each frame
public class SpatialAudioUpdateSystem : GameSystem
{
    private readonly AudioListener _listener = new();
    private readonly QueryDescription _newSources;
    private readonly QueryDescription _playing;

    public SpatialAudioUpdateSystem(World world) : base(world)
    {
        _newSources = new QueryDescription()
            .WithAll<AudioSource, Position>()
            .WithNone<PlayingAudio>();

        _playing = new QueryDescription()
            .WithAll<PlayingAudio, Position>();
    }

    public override void Update(in GameTime gt)
    {
        // Update listener from camera/player entity
        // (assumes a singleton Camera component)
        _listener.Position = new Vector3(CameraPos.X, CameraPos.Y, 0f);

        // Start new sounds
        World.Query(in _newSources, (Entity entity,
            ref AudioSource src, ref Position pos) =>
        {
            var sfx = ContentCache.Get<SoundEffect>(src.EventName);
            var instance = sfx.CreateInstance();
            instance.IsLooped = src.Loop;

            var emitter = new AudioEmitter
            {
                Position = new Vector3(pos.X, pos.Y, 0f)
            };
            instance.Apply3D(_listener, emitter);
            instance.Play();

            World.Add(entity, new PlayingAudio(instance, emitter));
        });

        // Update active sounds
        World.Query(in _playing, (Entity entity,
            ref PlayingAudio audio, ref Position pos) =>
        {
            if (audio.Instance.State == SoundState.Stopped)
            {
                audio.Instance.Dispose();
                World.Remove<PlayingAudio>(entity);
                World.Remove<AudioSource>(entity);
                return;
            }

            audio.Emitter.Position = new Vector3(pos.X, pos.Y, 0f);
            audio.Instance.Apply3D(_listener, audio.Emitter);
        });
    }
}
```

---

## Performance Guidelines

| Concern | Recommendation |
|---------|---------------|
| Apply3D cost | Negligible per call, but 200+ per frame adds up — cull by distance first |
| SoundEffectInstance limit | ~256 concurrent on most platforms; use priority + pooling |
| Mono file requirement | Enforce at asset import — add a content pipeline check |
| Garbage from `new AudioEmitter` | Reuse emitter structs; `AudioEmitter` is a class — cache per entity |
| FMOD virtual voices | FMOD handles voice stealing internally — let it manage limits |
| Doppler at low framerates | Large position deltas cause pitch spikes — clamp velocity or disable Doppler below 30fps |

---

## Decision Guide: Built-in vs FMOD

**Use MonoGame Apply3D** when:
- Your game has < 50 simultaneous spatial sounds.
- You only need basic distance attenuation and panning.
- You want zero external dependencies.
- You're building a jam game or prototype.

**Use FMOD** when:
- Sound design is a core pillar of your game (horror, rhythm, narrative).
- You need runtime parameter control (adaptive music, surface-aware footsteps).
- You need reverb zones, occlusion, or advanced spatializers.
- Your game ships on consoles (FMOD's virtual voice system handles platform limits).
- Your audio team uses FMOD Studio for authoring.

---
