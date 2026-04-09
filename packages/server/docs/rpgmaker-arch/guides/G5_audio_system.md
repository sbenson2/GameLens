# G5 — Audio System in RPG Maker MZ

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](G1_plugin_development.md) · [G2 Event System Mastery](G2_event_system_mastery.md) · [R1 Database Configuration](../reference/R1_database_configuration.md)

---

## Architecture Overview

RPG Maker MZ's audio system is built on the **Web Audio API** and consists of three layers:

```
Event Commands / Plugin Commands
        ↓
  AudioManager           ← static class — routing, volume, save/restore
        ↓
  WebAudio               ← wrapper around Web Audio API — playback, fading, seeking
        ↓
  Browser AudioContext    ← the actual Web Audio API nodes (GainNode, BufferSourceNode)
```

**AudioManager** is the high-level interface your events and plugins call. It manages playback of all four audio channels, applies master volume settings, and handles save/restore of the current audio state. **WebAudio** is the low-level class that wraps a single audio buffer — it handles loading, decoding, playback, looping, fading, and seeking.

---

## The Four Audio Channels

RPG Maker MZ defines four distinct audio categories. Each has its own purpose, volume slider (in Options), and behaviour:

| Channel | Full Name | Loop? | Purpose | Typical Use |
|---------|-----------|-------|---------|-------------|
| **BGM** | Background Music | Yes | The main music track — one plays at a time | Town themes, battle music, overworld music |
| **BGS** | Background Sound | Yes | Ambient loops layered on top of BGM | Rain, wind, crowd noise, machinery |
| **ME** | Music Effect | No | A short music clip that temporarily ducks the BGM | Victory fanfare, level-up jingle, inn rest |
| **SE** | Sound Effect | No | One-shot sounds — multiple can play simultaneously | Sword slash, menu cursor, door open |

```
Rule: Only one BGM and one BGS can play at a time.
      Playing a new BGM automatically stops the current one (with optional fade).
      Multiple SEs can overlap — there is no channel limit enforced by the engine,
      but browsers may throttle if you fire too many simultaneously.
```

---

## AudioManager API

`AudioManager` is a static class (no instantiation needed). All methods are called directly.

### Playback

```javascript
// Play BGM — the object format all audio commands use
AudioManager.playBgm({
    name: "Battle1",     // filename without extension (from audio/bgm/)
    volume: 90,          // 0–100
    pitch: 100,          // percentage (100 = normal, 150 = 1.5x speed)
    pan: 0               // -100 (left) to 100 (right), 0 = center
});

// Same pattern for all channels
AudioManager.playBgs({ name: "Rain1", volume: 70, pitch: 100, pan: 0 });
AudioManager.playMe({ name: "Victory1", volume: 90, pitch: 100, pan: 0 });
AudioManager.playSe({ name: "Cursor2", volume: 80, pitch: 100, pan: 0 });
```

### Stopping

```javascript
AudioManager.stopBgm();    // stops immediately
AudioManager.stopBgs();
AudioManager.stopMe();
AudioManager.stopSe();     // stops ALL currently playing SEs
AudioManager.stopAll();    // stops everything
```

### Fading

```javascript
AudioManager.fadeOutBgm(duration);   // duration in seconds
AudioManager.fadeOutBgs(duration);
AudioManager.fadeOutMe(duration);
AudioManager.fadeInBgm(duration);    // fades in the currently playing BGM
AudioManager.fadeInBgs(duration);
```

### Save and Restore (used by the battle system and scene transitions)

```javascript
// Save the current BGM including its playback position
AudioManager.saveBgm();
// Returns an object: { name, volume, pitch, pan, pos }

// Later — replay the BGM from where it left off
AudioManager.replayBgm(savedBgm);

// Save/restore BGS works the same way
AudioManager.saveBgs();
AudioManager.replayBgs(savedBgs);
```

The engine uses save/restore internally when entering battle (saves the map BGM, plays battle BGM, restores map BGM after victory) and during ME playback (the BGM is ducked, then restored when the ME finishes).

---

## The WebAudio Class

Each audio buffer is managed by a `WebAudio` instance. You rarely create these directly — `AudioManager` handles that — but understanding the class is essential for plugin development.

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `url` | string | The source file path |
| `volume` | number | Gain level (0.0 – 1.0) |
| `pitch` | number | Playback rate (1.0 = normal) |
| `pan` | number | Stereo panning (-1.0 to 1.0) |
| `_playing` | boolean | Whether the audio is currently playing |
| `_loop` | boolean | Whether the audio loops |
| `_loopStart` | number | Loop start point in seconds |
| `_loopLength` | number | Loop length in seconds (0 = loop entire file) |

### Key Methods

```javascript
const audio = new WebAudio(url);

audio.play(loop, offset);  // loop: boolean, offset: start position in seconds
audio.stop();               // stops playback, clears nodes
audio.fadeIn(duration);     // ramp gain from 0 to volume over duration (seconds)
audio.fadeOut(duration);    // ramp gain from volume to 0 over duration (seconds)
audio.seek();               // returns current playback position in seconds
audio.isPlaying();          // true if actively playing
audio.isReady();            // true if the audio data has been decoded and is ready
audio.destroy();            // clean up all audio nodes and buffers
```

### How Fading Works Internally

Fading uses the Web Audio API's `linearRampToValueAtTime` on a GainNode:

```javascript
// Simplified from the source — fadeIn sets gain to 0, then ramps up
WebAudio.prototype.fadeIn = function(duration) {
    if (this.isReady()) {
        this._gainNode.gain.setValueAtTime(0, currentTime);
        this._gainNode.gain.linearRampToValueAtTime(this._volume, currentTime + duration);
    }
};
```

---

## Audio in Events (No Code Required)

The event editor provides commands for all standard audio operations:

| Event Command | Parameters | Notes |
|--------------|------------|-------|
| **Play BGM** | File, Volume, Pitch, Pan | Replaces any currently playing BGM |
| **Fadeout BGM** | Duration (seconds) | Gradual fade, then stops |
| **Save BGM** | (none) | Saves current BGM + position for later |
| **Replay BGM** | (none) | Restores the saved BGM from where it left off |
| **Play BGS** | File, Volume, Pitch, Pan | Replaces current BGS |
| **Fadeout BGS** | Duration (seconds) | |
| **Play ME** | File, Volume, Pitch, Pan | Ducks the BGM, auto-restores after |
| **Play SE** | File, Volume, Pitch, Pan | Stacks — multiple SEs play simultaneously |
| **Stop SE** | (none) | Stops ALL SEs |

### ME Ducking Behaviour

When you play an ME (Music Effect), the engine:
1. Saves the current BGM and its position
2. Reduces the BGM volume (ducks it)
3. Plays the ME to completion
4. Restores the BGM volume and resumes from the saved position

This is why the Victory fanfare transitions back to the battle theme's ending smoothly. You get this behaviour automatically — no scripting needed.

---

## Audio File Formats and Directories

| Channel | Directory | Supported Formats |
|---------|-----------|-------------------|
| BGM | `audio/bgm/` | `.ogg`, `.m4a` |
| BGS | `audio/bgs/` | `.ogg`, `.m4a` |
| ME | `audio/me/` | `.ogg`, `.m4a` |
| SE | `audio/se/` | `.ogg`, `.m4a` |

```
Rule: Always provide both .ogg and .m4a versions of every audio file.
      Browsers vary in codec support — Chrome/Firefox prefer OGG,
      Safari/iOS require M4A (AAC). RPG Maker MZ automatically
      selects the compatible format at runtime.
```

RPG Maker MZ's deployment tool can convert formats, but it's better practice to prepare both from your source audio.

---

## Plugin Development Patterns

### Custom Volume Control Per Channel

```javascript
// Plugin that adds independent volume control for a custom audio channel
(() => {
    const _alias_updateBufferParameters = AudioManager.updateBufferParameters;
    AudioManager.updateBufferParameters = function(buffer, configVolume, audio) {
        _alias_updateBufferParameters.call(this, buffer, configVolume, audio);
        // Apply additional processing after the base volume is set
    };
})();
```

### Cross-Fade Between BGMs

The engine doesn't support cross-fading natively (it stops one, starts the other). Here's a plugin pattern:

```javascript
// Cross-fade: fade out current BGM while fading in the new one
AudioManager.crossFadeBgm = function(newBgm, duration) {
    const currentBgm = this.saveBgm();
    if (this._bgmBuffer) {
        this._bgmBuffer.fadeOut(duration);
    }
    // Start the new BGM at volume 0, then fade in
    const originalVolume = newBgm.volume;
    newBgm.volume = 0;
    this.playBgm(newBgm);
    if (this._bgmBuffer) {
        this._bgmBuffer.fadeIn(duration);
        // Restore target volume after fade
        setTimeout(() => {
            if (this._bgmBuffer) {
                this._bgmBuffer.volume = originalVolume / 100;
            }
        }, duration * 1000);
    }
};
```

### Hooking into Save/Load for Custom Audio State

If your plugin plays audio outside the standard channels (e.g., a radio system), you need to save and restore that state:

```javascript
// Save custom audio state when the game is saved
const _alias_makeSaveContents = DataManager.makeSaveContents;
DataManager.makeSaveContents = function() {
    const contents = _alias_makeSaveContents.call(this);
    contents.customAudio = {
        radioStation: MyPlugin._currentStation,
        radioVolume: MyPlugin._radioVolume
    };
    return contents;
};

// Restore custom audio state when the game is loaded
const _alias_extractSaveContents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function(contents) {
    _alias_extractSaveContents.call(this, contents);
    if (contents.customAudio) {
        MyPlugin.playStation(contents.customAudio.radioStation);
        MyPlugin.setRadioVolume(contents.customAudio.radioVolume);
    }
};
```

---

## Looping with Intro Sections

Many RPG soundtracks have a non-repeating intro followed by a looping body. RPG Maker MZ supports this through the OGG `LOOPSTART` and `LOOPLENGTH` metadata tags:

| Metadata Tag | Unit | Purpose |
|-------------|------|---------|
| `LOOPSTART` | samples | The sample position where the loop begins |
| `LOOPLENGTH` | samples | How many samples the loop section spans |

The `WebAudio` class reads these tags from the OGG Vorbis comment header and sets `_loopStart` and `_loopLength` accordingly. When the playback reaches the end of the loop section, it jumps back to `LOOPSTART`.

You can set these tags using tools like **vorbiscomment** (command line) or audio editors that support OGG metadata.

---

## Performance and Troubleshooting

1. **Autoplay restrictions.** Modern browsers block audio until the user interacts with the page. RPG Maker MZ handles this by resuming the AudioContext on the first touch/click, but test your game's title screen in a fresh browser tab.
2. **Memory.** Each loaded audio file consumes memory proportional to its decoded PCM size, not the file size. A 3-minute OGG at 44.1 kHz stereo ≈ 30 MB decoded. The engine caches recently played files but will evict old ones.
3. **SE spam.** If a player mashes a button, you might fire the same SE dozens of times per second. Use a cooldown variable in your event or plugin to throttle SE playback.
4. **Mobile latency.** On iOS, the first audio play may have noticeable latency due to AudioContext initialization. Pre-loading critical SEs in Scene_Boot can help.
5. **Volume settings.** Player-configured volumes (Options menu) are stored in `ConfigManager.bgmVolume`, `ConfigManager.bgsVolume`, `ConfigManager.meVolume`, and `ConfigManager.seVolume` (all 0–100). These multiply against the per-audio volume value.
