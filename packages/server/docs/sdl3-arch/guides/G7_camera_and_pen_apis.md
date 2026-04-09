# G7 — SDL3 Camera and Pen APIs

> **Category:** guide · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Events & Windows](../reference/R2_events_and_windows.md) · [Gamepad & Haptics](G5_gamepad_and_haptics.md) · [SDL3 Rules](../sdl3-arch-rules.md)

---

## Overview

SDL3 introduced two hardware-access APIs that had no equivalent in SDL2:

- **Camera API** — cross-platform webcam access for video capture
- **Pen API** — pressure-sensitive stylus/tablet input (Wacom, Apple Pencil, etc.)

Both APIs follow SDL3's event-driven design and integrate cleanly with the existing event loop. They were added as part of the SDL3 rewrite (first stable release: SDL 3.2.0, January 2025).

---

## Camera API

The Camera API provides cross-platform access to webcam devices. Common game dev use cases include AR overlays, face tracking for avatar animation, QR/barcode scanning in-game, and video chat integration.

### Core Types

| Type | Purpose |
|------|---------|
| `SDL_Camera` | Opaque handle to an open camera device |
| `SDL_CameraID` | Unique identifier for a camera (used before opening) |
| `SDL_CameraSpec` | Configuration struct: resolution, pixel format, framerate |
| `SDL_CameraPosition` | Physical location enum: `SDL_CAMERA_POSITION_FRONT_FACING`, `SDL_CAMERA_POSITION_BACK_FACING`, `SDL_CAMERA_POSITION_UNKNOWN` |

### Device Discovery

```c
// Get all available cameras
int count = 0;
SDL_CameraID *cameras = SDL_GetCameras(&count);

if (cameras) {
    for (int i = 0; i < count; i++) {
        // Human-readable name ("FaceTime HD Camera", etc.)
        const char *name = SDL_GetCameraName(cameras[i]);

        // Physical position (front/back on mobile, unknown on desktop)
        SDL_CameraPosition pos = SDL_GetCameraPosition(cameras[i]);

        // List supported formats
        int formatCount = 0;
        SDL_CameraSpec **specs = SDL_GetCameraSupportedFormats(
            cameras[i], &formatCount
        );

        SDL_Log("Camera: %s (%d formats)", name, formatCount);

        if (specs) {
            for (int j = 0; j < formatCount; j++) {
                SDL_Log("  %dx%d @ %ffps, format=%d",
                    specs[j]->width, specs[j]->height,
                    (float)specs[j]->framerate_numerator /
                        specs[j]->framerate_denominator,
                    specs[j]->format);
            }
            SDL_free(specs);
        }
    }
    SDL_free(cameras);
}
```

### Opening a Camera and Capturing Frames

```c
// Request a specific format (SDL will pick closest match)
SDL_CameraSpec desired = {
    .width = 640,
    .height = 480,
    .framerate_numerator = 30,
    .framerate_denominator = 1,
    .format = SDL_PIXELFORMAT_NV12  // Common webcam format
};

SDL_Camera *camera = SDL_OpenCamera(cameraID, &desired);
if (!camera) {
    SDL_Log("Failed to open camera: %s", SDL_GetError());
    return;
}
```

### Permission Handling

Camera access requires user permission on most platforms (macOS, iOS, Android, web). SDL3 handles this asynchronously:

```c
// Poll permission state (non-blocking)
int permission = SDL_GetCameraPermissionState(camera);

switch (permission) {
    case 0:   // Permission not yet determined — waiting for user
        DrawText("Waiting for camera permission...");
        break;
    case 1:   // Approved — can acquire frames
        break;
    case -1:  // Denied — handle gracefully
        DrawText("Camera access denied by user");
        break;
}
```

**Important:** On some platforms the permission dialog appears automatically when you call `SDL_OpenCamera()`. On others (Android) you may need platform-specific handling. Always check permission state before attempting to acquire frames.

### Frame Acquisition Loop

```c
// Inside your game loop, after permission is granted:
Uint64 timestampNS = 0;
SDL_Surface *frame = SDL_AcquireCameraFrame(camera, &timestampNS);

if (frame) {
    // frame->pixels contains the image data
    // frame->w, frame->h for dimensions
    // frame->format for pixel format

    // Example: create a texture for rendering
    // (Do this once, recreate only if format changes)
    if (!cameraTexture) {
        cameraTexture = SDL_CreateTexture(renderer,
            frame->format,
            SDL_TEXTUREACCESS_STREAMING,
            frame->w, frame->h);
    }

    // Update texture with frame data
    SDL_UpdateTexture(cameraTexture, NULL,
        frame->pixels, frame->pitch);

    // MUST release the frame when done
    SDL_ReleaseCameraFrame(camera, frame);
}

// Render the camera feed
if (cameraTexture) {
    SDL_RenderTexture(renderer, cameraTexture, NULL, NULL);
}
```

**Critical:** Always call `SDL_ReleaseCameraFrame()` after processing. Failing to release frames will stall the camera pipeline.

### Cleanup

```c
SDL_CloseCamera(camera);
// Also destroy any textures created from camera frames
SDL_DestroyTexture(cameraTexture);
```

---

## Pen API

The Pen API provides access to pressure-sensitive input devices — graphics tablets (Wacom, Huion, XP-Pen), tablet PCs, and stylus-equipped mobile devices (Apple Pencil, Samsung S-Pen). This enables drawing applications, handwriting recognition, and pressure-sensitive game input.

### Core Types

| Type | Purpose |
|------|---------|
| `SDL_PenID` | Unique identifier for a pen device (stable for process lifetime) |
| `SDL_PenInputFlags` | Bitmask of available pen capabilities |
| `SDL_PenAxis` | Enum for input axes: pressure, tilt X/Y, distance, rotation, slider |
| `SDL_PenDeviceType` | Device classification (pen, eraser, brush, pencil, airbrush, unknown) |

### Pen Axes

Pens can report multiple axes beyond simple position:

| Axis | Enum Value | Range | Description |
|------|-----------|-------|-------------|
| Pressure | `SDL_PEN_AXIS_PRESSURE` | 0.0 – 1.0 | How hard the tip is pressed |
| Tilt X | `SDL_PEN_AXIS_XTILT` | -90.0 – 90.0 | Left/right tilt in degrees |
| Tilt Y | `SDL_PEN_AXIS_YTILT` | -90.0 – 90.0 | Forward/backward tilt in degrees |
| Distance | `SDL_PEN_AXIS_DISTANCE` | 0.0 – 1.0 | Height above surface (hover) |
| Rotation | `SDL_PEN_AXIS_ROTATION` | 0.0 – 359.0 | Barrel rotation in degrees |
| Slider | `SDL_PEN_AXIS_SLIDER` | 0.0 – 1.0 | Finger slider on pen barrel (some Wacom models) |

Not all pens support all axes. Check capabilities before relying on specific axis data.

### Event-Driven Input

Pen input arrives through SDL's standard event loop via these event types:

```c
SDL_Event event;
while (SDL_PollEvent(&event)) {
    switch (event.type) {

        // Pen enters detection range (hovering above tablet)
        case SDL_EVENT_PEN_PROXIMITY_IN: {
            SDL_PenID penID = event.pproximity.which;
            SDL_PenDeviceType type = SDL_GetPenDeviceType(penID);
            SDL_Log("Pen entered: type=%d", type);
            break;
        }

        // Pen leaves detection range
        case SDL_EVENT_PEN_PROXIMITY_OUT: {
            SDL_Log("Pen left proximity");
            break;
        }

        // Pen tip touches surface
        case SDL_EVENT_PEN_DOWN: {
            float x = event.ptouch.x;
            float y = event.ptouch.y;
            SDL_Log("Pen down at (%.1f, %.1f)", x, y);
            // Start a stroke
            BeginStroke(x, y);
            break;
        }

        // Pen tip lifts from surface
        case SDL_EVENT_PEN_UP: {
            // End the current stroke
            EndStroke();
            break;
        }

        // Pen moves (while touching or hovering)
        case SDL_EVENT_PEN_MOTION: {
            float x = event.pmotion.x;
            float y = event.pmotion.y;
            // Continue stroke if pen is down
            if (penIsDown) {
                ContinueStroke(x, y);
            }
            break;
        }

        // Axis value changes (pressure, tilt, etc.)
        case SDL_EVENT_PEN_AXIS: {
            SDL_PenAxis axis = event.paxis.axis;
            float value = event.paxis.value;

            if (axis == SDL_PEN_AXIS_PRESSURE) {
                currentPressure = value;  // 0.0 to 1.0
            } else if (axis == SDL_PEN_AXIS_XTILT) {
                currentTiltX = value;
            }
            break;
        }

        // Barrel button pressed
        case SDL_EVENT_PEN_BUTTON_DOWN: {
            int button = event.pbutton.button;  // 1-based
            SDL_Log("Pen button %d pressed", button);
            break;
        }

        // Barrel button released
        case SDL_EVENT_PEN_BUTTON_UP: {
            break;
        }
    }
}
```

### Pen vs. Mouse Coexistence

SDL3 provides special constants to distinguish pen-emulated mouse events:

- `SDL_PEN_MOUSEID` — if a mouse event's `which` field matches this, it was actually generated by a pen
- `SDL_PEN_TOUCHID` — if a touch event's `touchID` field matches this, it was generated by a pen

```c
case SDL_EVENT_MOUSE_BUTTON_DOWN: {
    if (event.button.which == SDL_PEN_MOUSEID) {
        // This "mouse click" is actually a pen tap — ignore it
        // (handle via PEN_DOWN instead for full axis data)
        break;
    }
    // Handle real mouse click
    HandleMouseClick(event.button.x, event.button.y);
    break;
}
```

**Best practice:** If you support both mouse and pen input, filter out pen-emulated mouse events and handle pen events through the dedicated `SDL_EVENT_PEN_*` types to get full axis data.

---

## Game Dev Use Cases

### Camera: AR Card Game Overlay

```c
// Pseudocode: detect cards via camera, overlay game state
void UpdateAROverlay(void) {
    SDL_Surface *frame = SDL_AcquireCameraFrame(camera, NULL);
    if (frame) {
        // Process frame for marker detection
        DetectCardMarkers(frame->pixels, frame->w, frame->h);

        // Update texture for background rendering
        SDL_UpdateTexture(bgTexture, NULL, frame->pixels, frame->pitch);
        SDL_ReleaseCameraFrame(camera, frame);
    }

    // Render camera feed as background
    SDL_RenderTexture(renderer, bgTexture, NULL, NULL);

    // Overlay game elements on detected markers
    for (int i = 0; i < detectedCardCount; i++) {
        RenderCardOverlay(&detectedCards[i]);
    }
}
```

### Pen: Pressure-Sensitive Drawing Tool

```c
typedef struct {
    float x, y;
    float pressure;
    float tiltX, tiltY;
} StrokePoint;

void ContinueStroke(float x, float y) {
    StrokePoint point = {
        .x = x,
        .y = y,
        .pressure = currentPressure,
        .tiltX = currentTiltX,
        .tiltY = currentTiltY
    };

    // Brush size varies with pressure
    float brushSize = MIN_BRUSH + (MAX_BRUSH - MIN_BRUSH) * point.pressure;

    // Tilt affects brush angle for calligraphy effects
    float brushAngle = atan2f(point.tiltY, point.tiltX);

    DrawBrushStamp(point.x, point.y, brushSize, brushAngle);
}
```

---

## Platform Notes

### Camera API Platform Support

| Platform | Driver | Notes |
|----------|--------|-------|
| Windows | MediaFoundation | Works with most USB webcams |
| macOS | AVFoundation | Includes FaceTime cameras |
| Linux | V4L2 | Video4Linux2 devices |
| iOS | AVFoundation | Front and back cameras |
| Android | Camera2 | Requires camera permission in manifest |
| Web/Emscripten | MediaDevices | Requires HTTPS for getUserMedia |

### Pen API Platform Support

| Platform | Backend | Notes |
|----------|---------|-------|
| Windows | WinTab / Windows Ink | Broadest tablet support (Wacom, Huion, etc.) |
| macOS | NSEvent | Apple Pencil on iPad (Catalyst), some Wacom support |
| Linux | XInput2 | Wacom drivers via libwacom |
| iOS | UITouch (Pencil) | Apple Pencil 1st and 2nd gen |
| Android | MotionEvent | Samsung S-Pen, other active styluses |

---

## Migration Note (SDL2 → SDL3)

Neither the Camera API nor the Pen API existed in SDL2. If migrating from SDL2:

- **Camera:** SDL2 had no camera support. You likely used platform-specific code (DirectShow on Windows, AVFoundation on macOS) or a third-party library (OpenCV). SDL3's Camera API replaces all of that with a single cross-platform interface.
- **Pen:** SDL2 routed tablet input through mouse events with no pressure/tilt data. SDL3's Pen API provides full axis information. If you were using platform-specific tablet APIs, you can now use SDL3's unified events instead.
