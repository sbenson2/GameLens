# Pixel Streaming & Remote Rendering

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G20 Performance Optimization & Memory](G20_performance_optimization_memory.md), [G5 Networking & Replication](G5_networking_replication.md), [G10 Debugging & Profiling](G10_debugging_profiling.md)

Pixel Streaming renders your Unreal Engine application on a powerful server and streams the output to lightweight clients (web browsers, mobile devices) over WebRTC. Users interact via standard input (mouse, keyboard, touch) transmitted back to the server. This enables high-fidelity 3D experiences on devices that could never run them locally — from product configurators and architectural walkthroughs to cloud gaming and digital twins.

---

## Architecture Overview

Pixel Streaming involves three core components:

```
┌─────────────────┐     WebRTC      ┌──────────────────┐     HTTP/WS     ┌─────────────┐
│  UE Application │ ◄──────────────► │  Signaling Server │ ◄────────────► │   Browser    │
│  + Pixel Stream │   video/audio   │  (Node.js)        │   signaling    │   Client     │
│    Plugin        │   input         │                    │                │              │
│  [GPU Server]    │                 │                    │                │              │
└─────────────────┘                 └──────────────────┘                 └─────────────┘
```

### Rendering Server

- Runs the packaged UE application with the **Pixel Streaming** plugin enabled.
- Requires a GPU supporting hardware video encoding: **NVIDIA NVENC**, **AMD AMF**, or **Apple VideoToolbox**.
- Encodes rendered frames to H.264 or H.265 and streams them over WebRTC.
- Receives user input (mouse, keyboard, touch, gamepad) from the WebRTC data channel.

### Signaling Server

- A lightweight Node.js application (shipped with the plugin) that brokers the initial WebRTC handshake.
- Manages SDP offer/answer exchange and ICE candidate negotiation.
- Does NOT relay video/audio — once the peer connection is established, media flows directly between the UE app and the browser.

### Browser Client

- A vanilla HTML/JavaScript frontend (also shipped with the plugin) that connects to the Signaling Server.
- Renders the incoming video stream in a `<video>` element.
- Captures user input and sends it back over the WebRTC data channel.
- Fully customizable — you can embed the player in your own web application.

---

## Supported Platforms (UE 5.5+)

| Component | Supported OS |
|-----------|-------------|
| Rendering Server | Windows 10/11, Ubuntu 18.04–24.04, macOS Ventura+ |
| Signaling Server | Any platform running Node.js 16+ |
| Browser Client | Chrome, Edge, Firefox, Safari (WebRTC-capable) |

### GPU Requirements

| Vendor | Technology | Minimum |
|--------|-----------|---------|
| NVIDIA | NVENC | GTX 1060+ / RTX series (Turing+ recommended) |
| AMD | AMF | RX 5000+ series |
| Apple | VideoToolbox | M1+ or dedicated AMD GPU on Intel Macs |

---

## Setup Guide

### 1. Enable the Plugin

In **Edit → Plugins**, search for **Pixel Streaming** and enable it. Restart the editor.

### 2. Launch Arguments

```bash
# Standalone packaged build
MyGame.exe \
  -AudioMixer \
  -PixelStreamingIP=127.0.0.1 \
  -PixelStreamingPort=8888 \
  -RenderOffscreen \
  -ResX=1920 -ResY=1080 \
  -ForceRes \
  -FullScreen
```

Key flags:
- `-AudioMixer` — Required for audio streaming.
- `-PixelStreamingIP` / `-PixelStreamingPort` — Signaling Server address.
- `-RenderOffscreen` — No local display window (headless server mode).
- `-ForceRes` — Lock resolution regardless of client viewport.

### 3. Start the Signaling Server

```bash
cd Engine/Source/Programs/PixelStreamingInfrastructure/SignallingWebServer

# Install dependencies (first time only)
npm install

# Launch
node cirrus.js --HttpPort=80 --StreamerPort=8888
```

### 4. Connect from a Browser

Navigate to `http://<server-ip>:80` — the default frontend loads automatically.

---

## Deployment Architectures

### Single Server (Development / Small Scale)

```
[ GPU VM ] ── UE App + Signaling Server
   └── Direct WebRTC to 1–5 concurrent users
```

Suitable for demos, internal tools, and product configurators with limited concurrent users.

### Matchmaker (Multi-Session Scale-Out)

```
[ Matchmaker VM ]  ── routes clients to available instances
   ├── [ GPU VM 1 ] ── UE App + Signaling (Session A)
   ├── [ GPU VM 2 ] ── UE App + Signaling (Session B)
   └── [ GPU VM N ] ── UE App + Signaling (Session N)
```

- The **Matchmaker** (included with the plugin) assigns each incoming client to an available UE instance.
- Each client gets their own interactive session.
- Scale horizontally by adding GPU VMs.

### Multi-Region (Production / Cloud Gaming)

```
[ DNS / Traffic Manager ]
   ├── [ Region A: Matchmaker → GPU VMSS ]
   ├── [ Region B: Matchmaker → GPU VMSS ]
   └── [ Region C: Matchmaker → GPU VMSS ]
```

- Use Azure VMSS, AWS EC2 GPU instances, or GCP GPU VMs.
- Traffic Manager routes clients to the nearest region for lowest latency.
- Auto-scaling policies spin up GPU VMs based on demand.

---

## Performance Best Practices

### Frame Rate

- **Target 30 fps** when possible — consistent 30 fps often provides a smoother streaming experience than unstable 60 fps due to reduced network and encoding pressure.
- Use `t.MaxFPS 30` or lock frame rate in Project Settings.
- For interactive applications (games), test at 60 fps but budget GPU headroom for encoding overhead.

### Encoding Settings

```ini
; DefaultEngine.ini — Pixel Streaming tuning
[PixelStreaming]
Encoder.TargetBitrate=20000000       ; 20 Mbps — adjust per resolution
Encoder.MinQP=18                      ; Minimum quantization (lower = higher quality)
Encoder.MaxQP=35                      ; Maximum quantization
Encoder.RateControl=CBR              ; Constant bitrate for stable streaming
WebRTC.MaxFps=60                      ; Cap WebRTC frame rate
```

### Resolution & Quality

- Stream at **1080p** for most use cases — 4K streaming is possible but doubles bandwidth and encoding cost.
- Use **dynamic resolution scaling** (`r.DynamicRes.OperationMode=2`) to maintain frame rate under load.
- Enable **Temporal Super Resolution (TSR)** to upscale from a lower internal resolution.

### Network

- **Bandwidth:** Budget 10–20 Mbps per stream at 1080p/30fps H.264.
- **Latency:** Target < 50ms round-trip for interactive applications.
- **TURN servers:** Deploy TURN for clients behind restrictive NATs/firewalls where direct WebRTC peer connections fail.
- **Monitor packet loss** — even 1–2% packet loss degrades quality significantly with real-time video.

### Input Optimization

- Reduce touch sensitivity for mobile clients to minimize input lag.
- Use virtual joysticks for pawn movement on touch devices.
- Debounce high-frequency input events (mouse move) to avoid saturating the data channel.

---

## Custom Frontend Integration

The default player page is a starting point. For production, embed the Pixel Streaming player in your own web application:

```javascript
// Minimal integration using the Pixel Streaming frontend library
import { Config, PixelStreaming } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.5';

const config = Config.config;
config.setFlagEnabled(Flags.AutoConnect, true);
config.setFlagEnabled(Flags.AutoPlayVideo, true);

const stream = new PixelStreaming(config);
document.getElementById('player-container').appendChild(stream.videoElementParent);

// Send custom commands to the UE app
stream.emitUIInteraction({ action: 'resetCamera' });
```

The UE application handles custom commands via the `FPixelStreamingInputComponent`:

```cpp
// In your PlayerController or Pawn
void AMyPlayerController::BeginPlay()
{
    Super::BeginPlay();

    // Listen for UI interaction events from the browser
    UPixelStreamingInput* PSInput = FindComponentByClass<UPixelStreamingInput>();
    if (PSInput)
    {
        PSInput->OnInputEvent.AddDynamic(this, &AMyPlayerController::HandlePixelStreamingInput);
    }
}

void AMyPlayerController::HandlePixelStreamingInput(const FString& Descriptor)
{
    // Parse JSON from the browser's emitUIInteraction call
    TSharedPtr<FJsonObject> JsonObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Descriptor);
    if (FJsonSerializer::Deserialize(Reader, JsonObject))
    {
        FString Action;
        if (JsonObject->TryGetStringField(TEXT("action"), Action))
        {
            if (Action == TEXT("resetCamera"))
            {
                ResetCameraToDefault();
            }
        }
    }
}
```

---

## Common Use Cases

| Use Case | Session Model | Typical Scale |
|----------|--------------|---------------|
| Product Configurator | 1 user per instance | 10–100 concurrent |
| Architectural Walkthrough | 1 user per instance | 5–50 concurrent |
| Cloud Gaming | 1 user per instance | 100–10,000+ (multi-region) |
| Digital Twin Dashboard | Shared session | 1–20 viewers |
| Training Simulation | 1 user per instance | 10–200 concurrent |
| Trade Show / Kiosk | Shared session | 1–5 per kiosk |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Black screen in browser | WebRTC handshake failed | Check Signaling Server logs; verify ports are open |
| High latency (>100ms) | Geographic distance or NAT traversal | Deploy closer to users; add TURN server |
| Encoding artifacts | Bitrate too low | Increase `Encoder.TargetBitrate` |
| No audio | Missing `-AudioMixer` flag | Add `-AudioMixer` to launch args |
| Dropped frames | GPU overloaded (rendering + encoding) | Lower resolution, cap FPS, or use dedicated encoding GPU |

---

## Version History

| Version | Notes |
|---------|-------|
| UE 4.27 | Initial Pixel Streaming release |
| UE 5.0–5.3 | Stability improvements, Linux support |
| UE 5.4 | H.265 encoding support, improved matchmaker |
| UE 5.5+ | Frontend library refactor (`@epicgames-ps/lib-pixelstreamingfrontend-ue5.5`), macOS support |

---

## Further Reading

- [Pixel Streaming Overview — UE 5.7 Docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-pixel-streaming-in-unreal-engine)
- [Hosting & Networking Guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/hosting-and-networking-guide-for-pixel-streaming-in-unreal-engine)
- [Pixel Streaming at Scale on Azure](https://learn.microsoft.com/en-us/gaming/azure/reference-architectures/unreal-pixel-streaming-at-scale)
- [G5 Networking & Replication](G5_networking_replication.md) — Core UE networking concepts
- [G20 Performance Optimization](G20_performance_optimization_memory.md) — GPU profiling and optimization
