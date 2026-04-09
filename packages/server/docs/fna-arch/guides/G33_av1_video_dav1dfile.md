# G33 — AV1 Video Support with dav1dfile

> **Category:** guide · **Engine:** FNA · **Related:** [G04 Audio System](./G04_audio_system.md) · [G06 Content Loading Without Pipeline](./G06_content_loading_without_pipeline.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [FNA Architecture Rules](../fna-arch-rules.md)

FNA 26.02 introduced experimental AV1 video stream support via **dav1dfile**, a thin C wrapper around the dav1d AV1 decoder. This guide covers when to use AV1 vs Ogg Theora, how to set up dav1dfile, and how to integrate AV1 video playback into your FNA game.

---

## Table of Contents

1. [Video Playback in FNA](#1--video-playback-in-fna)
2. [Theora vs AV1: When to Use Which](#2--theora-vs-av1-when-to-use-which)
3. [dav1dfile Architecture](#3--dav1dfile-architecture)
4. [Setting Up AV1 Playback](#4--setting-up-av1-playback)
5. [Encoding AV1 Video for FNA](#5--encoding-av1-video-for-fna)
6. [YUV-to-RGB GPU Conversion](#6--yuv-to-rgb-gpu-conversion)
7. [Performance Considerations](#7--performance-considerations)
8. [Platform Support Status](#8--platform-support-status)
9. [Common Pitfalls](#9--common-pitfalls)
10. [FNA vs MonoGame: Video Differences](#10--fna-vs-monogame-video-differences)

---

## 1 — Video Playback in FNA

FNA provides video playback through the `Microsoft.Xna.Framework.Media` namespace, matching XNA's `VideoPlayer` API. Under the hood, FNA decodes video frames to YUV data using a native decoder, then converts them to RGB on the GPU using an embedded `YUVToRGBA` effect shader.

FNA supports two video codecs:

| Codec | Library | Status | Container |
|---|---|---|---|
| **Ogg Theora** | Theorafile | Stable, default | `.ogv` |
| **AV1** | dav1dfile | Experimental (26.02+) | `.mp4` / `.mkv` / `.webm` |

Ogg Theora remains the recommended format for most games. AV1 is available for projects that need better compression ratios or are already invested in the AV1 ecosystem.

---

## 2 — Theora vs AV1: When to Use Which

### Use Ogg Theora when:
- You want maximum compatibility across all FNA versions
- Your videos are cutscenes or UI backgrounds (Theora is well-suited for game video)
- You need the smallest possible native library footprint
- You're targeting consoles (Theora support is mature on all console ports)

### Use AV1 when:
- You have large amounts of video content and need 30–50% better compression than Theora
- Your content pipeline already produces AV1 output
- You're targeting desktop platforms (Windows, Linux, macOS) where dav1dfile is well-tested
- You need higher quality at the same bitrate (AV1 excels at preserving detail in game footage)

### File size comparison (approximate, 1080p 30fps 60-second clip):

| Quality | Theora (.ogv) | AV1 (.mp4) | Savings |
|---|---|---|---|
| Low | ~12 MB | ~7 MB | ~42% |
| Medium | ~25 MB | ~15 MB | ~40% |
| High | ~45 MB | ~28 MB | ~38% |

---

## 3 — dav1dfile Architecture

dav1dfile is structured identically to Theorafile — a minimal C library that wraps the codec (dav1d, from VideoLAN/FFmpeg contributors) and exposes a simple frame-by-frame API:

```
Your Game
  ↓
Microsoft.Xna.Framework.Media.VideoPlayer  (managed, FNA)
  ↓
dav1dfile  (native, C wrapper)
  ↓
dav1d  (native, AV1 decoder)
```

Like all FNA native libraries, dav1dfile ships as a prebuilt binary in the `fnalibs` package. You do not link against dav1d directly.

**Key files:**
- `dav1dfile.dll` / `libdav1dfile.so` / `libdav1dfile.dylib` — the native library
- FNA's `Dav1dfile.cs` — P/Invoke bindings (internal to FNA, you don't call these directly)
- FNA's `VideoPlayer.cs` — the public API, shared between Theora and AV1 paths

---

## 4 — Setting Up AV1 Playback

### Step 1: Get the dav1dfile native library

Download the latest `fnalibs` package from the FNA repository. Since 26.02, it includes dav1dfile binaries alongside the existing Theorafile binaries. Copy the appropriate library for your platform to your build output directory.

### Step 2: Prepare your video file

Encode your video as AV1 in a supported container (see Section 5 for encoding commands).

### Step 3: Load and play via the standard Video API

```csharp
using Microsoft.Xna.Framework.Media;

// In LoadContent:
Video introVideo = Content.Load<Video>("intro"); // loads intro.mp4 or equivalent

// In Update:
if (GamePad.GetState(PlayerIndex.One).Buttons.A == ButtonState.Pressed)
{
    videoPlayer.Play(introVideo);
}

// In Draw:
if (videoPlayer.State == MediaState.Playing)
{
    Texture2D frame = videoPlayer.GetTexture();
    spriteBatch.Begin();
    spriteBatch.Draw(frame, GraphicsDevice.Viewport.Bounds, Color.White);
    spriteBatch.End();
}
```

The `VideoPlayer` API is identical whether the underlying file is Theora or AV1. FNA detects the codec from the container and routes to the appropriate native decoder.

---

## 5 — Encoding AV1 Video for FNA

Use FFmpeg to encode game video into AV1. FNA's dav1dfile expects standard AV1 bitstreams in MP4 or WebM containers.

### Basic encode (good quality, reasonable speed):

```bash
ffmpeg -i source.mp4 \
  -c:v libaom-av1 -crf 30 -cpu-used 4 \
  -c:a libvorbis -q:a 4 \
  -pix_fmt yuv420p \
  output.mp4
```

### High quality (slower encode, better compression):

```bash
ffmpeg -i source.mp4 \
  -c:v libaom-av1 -crf 24 -cpu-used 2 \
  -row-mt 1 -tiles 2x2 \
  -c:a libvorbis -q:a 6 \
  -pix_fmt yuv420p \
  output.mp4
```

### Using SVT-AV1 (faster encoding):

```bash
ffmpeg -i source.mp4 \
  -c:v libsvtav1 -crf 30 -preset 6 \
  -c:a libvorbis -q:a 4 \
  -pix_fmt yuv420p \
  output.mp4
```

**Important notes:**
- Always use `-pix_fmt yuv420p` — FNA's YUV-to-RGB shader expects YUV 4:2:0
- Audio should be Ogg Vorbis (`libvorbis`), matching FNA's audio pipeline
- Avoid HDR or 10-bit color — FNA's shader targets 8-bit sRGB
- Test at your target resolution; AV1 decode is more CPU-intensive than Theora

---

## 6 — YUV-to-RGB GPU Conversion

Both Theora and AV1 decoders output raw YUV pixel data. FNA uploads three textures (Y, U, V planes) to the GPU and runs an embedded `YUVToRGBA` effect shader to produce the final RGB frame.

This happens inside `VideoPlayer.GetTexture()` — you don't need to handle it manually. The conversion runs on the GPU, so the CPU cost is limited to decoding frames and uploading plane data.

For advanced use cases (custom post-processing on video frames), you can access the YUV textures before conversion by examining FNA's `VideoPlayer` source. However, the public API only exposes the final RGB `Texture2D`.

---

## 7 — Performance Considerations

AV1 decoding is significantly more CPU-intensive than Theora decoding. On typical hardware:

| Codec | 720p CPU usage | 1080p CPU usage | Notes |
|---|---|---|---|
| Theora | ~2–5% | ~5–10% | Very lightweight |
| AV1 | ~8–15% | ~15–30% | dav1d is well-optimized but AV1 is complex |

**Recommendations:**
- Profile on your minimum-spec target hardware
- For cutscenes, AV1's compression advantage often outweighs the CPU cost
- For in-game video (e.g., TV screens in a 3D world), prefer Theora for lower overhead
- dav1d uses SIMD (SSE4, AVX2, NEON) automatically — ensure you're distributing optimized builds
- On NativeAOT console builds, test AV1 decode performance early; console CPUs vary significantly

---

## 8 — Platform Support Status

| Platform | Theora | AV1 | Notes |
|---|---|---|---|
| Windows (x64) | Stable | Experimental | Full dav1dfile support |
| Linux (x64) | Stable | Experimental | Full dav1dfile support |
| macOS (arm64/x64) | Stable | Experimental | Full dav1dfile support |
| Nintendo Switch | Stable | TBD | Check fnalibs for Switch dav1dfile builds |
| Xbox (GDK) | Stable | TBD | Check fnalibs for GDK dav1dfile builds |
| PlayStation 5 | Stable | TBD | Check fnalibs for PS5 dav1dfile builds |

AV1 support was introduced as experimental in FNA 26.02. Console support depends on dav1dfile being included in the platform-specific fnalibs package. Always verify with the latest fnalibs release before committing to AV1 for a console title.

---

## 9 — Common Pitfalls

**"Video won't play, no error":** The dav1dfile native library isn't in the output directory. FNA silently falls back if the native library is missing. Ensure `libdav1dfile` is alongside your executable.

**Green or corrupted frames:** Your video isn't encoded as YUV 4:2:0. Re-encode with `-pix_fmt yuv420p`.

**Stuttering playback:** AV1 decoding can't keep up with the frame rate. Lower the video resolution, reduce encoding complexity, or switch to Theora.

**Audio out of sync:** Encode audio and video with matching frame rates and sample rates. FNA synchronizes playback to audio timing, so a mismatch causes drift.

**"Content.Load<Video>() fails":** The content file may need to be processed through the XNA/MGCB pipeline, or you may need to use raw file loading. Check that the file extension is recognized.

---

## 10 — FNA vs MonoGame: Video Differences

| Aspect | FNA | MonoGame |
|---|---|---|
| Theora support | All platforms | Varies by platform |
| AV1 support | Experimental (26.02+) | Not supported |
| Video format | Standardized (Theora/AV1) | Platform-varies |
| Decoder | Theorafile / dav1dfile (native) | Platform media APIs |
| GPU conversion | YUVToRGBA shader (all platforms) | Platform-varies |

FNA's video pipeline is consistent across all platforms — the same file plays everywhere. MonoGame delegates to platform-specific media frameworks, which means different format requirements per platform and less predictable behavior.
