# Input Handling and Events Reference

> **Category:** reference · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Getting Started](../guides/G1_getting_started.md), [Kotlin Patterns](../guides/G2_kotlin_patterns.md)

libGDX provides two complementary input systems: **polling** (query state each frame) and **event-driven** (receive callbacks when input occurs). Both are accessed through the `Gdx.input` interface and work consistently across desktop, Android, iOS, and web backends.

## Polling vs Events

| Approach | Best For | How It Works |
|----------|----------|-------------|
| Polling | Continuous movement, camera control | Check `Gdx.input.isKeyPressed()` etc. in `render()` |
| Events | Discrete actions, UI, gestures | Implement `InputProcessor`, receive callbacks |

Use polling for anything that needs smooth per-frame response (character movement, camera rotation). Use events for discrete one-shot actions (menu clicks, jump triggers, text input).

## Polling — Keyboard

Query keyboard state directly from `Gdx.input`:

```java
// In your render() method:
if (Gdx.input.isKeyPressed(Keys.LEFT)) {
    player.x -= speed * Gdx.graphics.getDeltaTime();
}
if (Gdx.input.isKeyPressed(Keys.RIGHT)) {
    player.x += speed * Gdx.graphics.getDeltaTime();
}

// Single-frame detection (true only on the frame the key goes down)
if (Gdx.input.isKeyJustPressed(Keys.SPACE)) {
    player.jump();
}
```

| Method | Returns | Purpose |
|--------|---------|---------|
| `isKeyPressed(int keycode)` | boolean | True while key is held down |
| `isKeyJustPressed(int keycode)` | boolean | True only on the frame key was pressed |

Key codes are constants in `com.badlogic.gdx.Input.Keys` — e.g., `Keys.A`, `Keys.SPACE`, `Keys.SHIFT_LEFT`, `Keys.ENTER`.

### Kotlin

```kotlin
if (Gdx.input.isKeyPressed(Keys.W)) {
    player.y += speed * Gdx.graphics.deltaTime
}
```

## Polling — Mouse and Touch

Mouse and touch share the same API. On desktop, pointer 0 is the mouse. On mobile, each finger gets a pointer index (0, 1, 2, ...).

```java
// Check if screen is being touched / mouse button held
if (Gdx.input.isTouched()) {
    int x = Gdx.input.getX();     // pointer 0 x (screen coords)
    int y = Gdx.input.getY();     // pointer 0 y (screen coords)
}

// Multi-touch: check specific pointer
if (Gdx.input.isTouched(1)) {
    int x2 = Gdx.input.getX(1);
    int y2 = Gdx.input.getY(1);
}

// Just-touched (single frame)
if (Gdx.input.justTouched()) {
    handleTap(Gdx.input.getX(), Gdx.input.getY());
}

// Delta movement (useful for camera dragging)
float dx = Gdx.input.getDeltaX();
float dy = Gdx.input.getDeltaY();
```

**Coordinate system:** Origin (0, 0) is at the **upper-left** corner. X increases rightward, Y increases downward. This differs from libGDX's rendering coordinate system (Y-up), so you typically need to unproject:

```java
Vector3 worldPos = camera.unproject(new Vector3(Gdx.input.getX(), Gdx.input.getY(), 0));
```

| Method | Purpose |
|--------|---------|
| `isTouched()` / `isTouched(int pointer)` | Any finger down / specific finger |
| `justTouched()` | True only on the frame of first touch |
| `getX()` / `getX(int pointer)` | X position in screen coords |
| `getY()` / `getY(int pointer)` | Y position in screen coords |
| `getDeltaX()` / `getDeltaX(int pointer)` | X movement since last frame |
| `getDeltaY()` / `getDeltaY(int pointer)` | Y movement since last frame |
| `isButtonPressed(int button)` | Mouse button state (`Buttons.LEFT`, `RIGHT`, `MIDDLE`) |
| `isButtonJustPressed(int button)` | Mouse button just pressed this frame |

## Polling — Accelerometer and Sensors

Available on mobile platforms (returns 0 on desktop):

```java
float accelX = Gdx.input.getAccelerometerX();
float accelY = Gdx.input.getAccelerometerY();
float accelZ = Gdx.input.getAccelerometerZ();

// Tilt-based movement
player.x += accelX * tiltSensitivity * delta;
```

| Method | Purpose |
|--------|---------|
| `getAccelerometerX/Y/Z()` | Acceleration in m/s² per axis |
| `getGyroscopeX/Y/Z()` | Angular velocity in rad/s |
| `getRotationMatrix(float[])` | Device orientation matrix |
| `getAzimuth()` | Compass heading (degrees) |
| `getPitch()` | Device tilt front/back |
| `getRoll()` | Device tilt left/right |

## Event-Driven — InputProcessor

Implement the `InputProcessor` interface to receive discrete input events. Events are dispatched on the rendering thread, right before `ApplicationListener.render()`.

```java
public class MyInputProcessor implements InputProcessor {
    @Override
    public boolean keyDown(int keycode) {
        if (keycode == Keys.ESCAPE) {
            Gdx.app.exit();
            return true;
        }
        return false;
    }

    @Override
    public boolean keyUp(int keycode) { return false; }

    @Override
    public boolean keyTyped(char character) {
        // Receives the actual Unicode character (for text input)
        textField.appendCharacter(character);
        return true;
    }

    @Override
    public boolean touchDown(int screenX, int screenY, int pointer, int button) {
        return false;
    }

    @Override
    public boolean touchUp(int screenX, int screenY, int pointer, int button) {
        return false;
    }

    @Override
    public boolean touchDragged(int screenX, int screenY, int pointer) {
        return false;
    }

    @Override
    public boolean mouseMoved(int screenX, int screenY) {
        return false;
    }

    @Override
    public boolean scrolled(float amountX, float amountY) {
        camera.zoom += amountY * 0.1f;
        return true;
    }
}

// Register it
Gdx.input.setInputProcessor(new MyInputProcessor());
```

### Return Value Convention

All `InputProcessor` methods return `boolean`:
- `true` — event was handled, stop propagation
- `false` — event was not handled, pass to next processor

### InputAdapter

Use `InputAdapter` to override only the methods you need instead of implementing all eight:

```java
Gdx.input.setInputProcessor(new InputAdapter() {
    @Override
    public boolean touchDown(int x, int y, int pointer, int button) {
        spawnParticle(x, y);
        return true;
    }
});
```

### Kotlin with InputAdapter

```kotlin
Gdx.input.setInputProcessor(object : InputAdapter() {
    override fun keyDown(keycode: Int): Boolean {
        if (keycode == Keys.SPACE) {
            player.jump()
            return true
        }
        return false
    }
})
```

## InputMultiplexer — Chaining Processors

When multiple systems need input (UI, game world, debug), use `InputMultiplexer` to chain processors. Events flow to each processor in order; the first one that returns `true` stops propagation.

```java
InputMultiplexer multiplexer = new InputMultiplexer();
multiplexer.addProcessor(stage);                    // UI first (highest priority)
multiplexer.addProcessor(new GameInputProcessor()); // game world second
multiplexer.addProcessor(new DebugInputProcessor());// debug last
Gdx.input.setInputProcessor(multiplexer);
```

This pattern is essential for Scene2D UI — the `Stage` must be the first processor so it can consume clicks on UI elements before the game world processes them.

## GestureDetector — Touch Gestures

`GestureDetector` is an `InputProcessor` that recognizes complex touch gestures and delegates them to a `GestureListener`:

```java
public class MyGestureListener implements GestureDetector.GestureListener {
    @Override
    public boolean tap(float x, float y, int count, int button) {
        // count = number of consecutive taps (double-tap = 2)
        if (count == 2) {
            zoomToPoint(x, y);
        }
        return true;
    }

    @Override
    public boolean longPress(float x, float y) {
        showContextMenu(x, y);
        return true;
    }

    @Override
    public boolean fling(float velocityX, float velocityY, int button) {
        // Swipe gesture — velocityX/Y in pixels per second
        if (Math.abs(velocityX) > Math.abs(velocityY)) {
            swipeHorizontal(velocityX > 0 ? Direction.RIGHT : Direction.LEFT);
        }
        return true;
    }

    @Override
    public boolean pan(float x, float y, float deltaX, float deltaY) {
        camera.translate(-deltaX, deltaY);
        return true;
    }

    @Override
    public boolean panStop(float x, float y, int pointer, int button) {
        return false;
    }

    @Override
    public boolean zoom(float initialDistance, float distance) {
        camera.zoom = initialZoom * (initialDistance / distance);
        return true;
    }

    @Override
    public boolean pinch(Vector2 initialPointer1, Vector2 initialPointer2,
                          Vector2 pointer1, Vector2 pointer2) {
        return false;
    }

    @Override
    public void pinchStop() {}

    @Override
    public boolean touchDown(float x, float y, int pointer, int button) {
        return false;
    }
}

// Register — GestureDetector IS an InputProcessor
Gdx.input.setInputProcessor(new GestureDetector(new MyGestureListener()));
```

### GestureDetector with InputMultiplexer

Combine gesture detection with other input handling:

```java
InputMultiplexer multiplexer = new InputMultiplexer();
multiplexer.addProcessor(stage);
multiplexer.addProcessor(new GestureDetector(new MyGestureListener()));
multiplexer.addProcessor(new KeyboardProcessor());
Gdx.input.setInputProcessor(multiplexer);
```

### Gesture Summary

| Gesture | Callback | Description |
|---------|----------|-------------|
| Tap | `tap(x, y, count, button)` | Quick touch and release; `count` tracks consecutive taps |
| Long press | `longPress(x, y)` | Finger held without moving |
| Fling | `fling(velX, velY, button)` | Quick drag and release (swipe) |
| Pan | `pan(x, y, deltaX, deltaY)` | Continuous finger drag |
| Pan stop | `panStop(x, y, pointer, button)` | Finger lifted after panning |
| Zoom | `zoom(initialDist, currentDist)` | Two-finger pinch distance change |
| Pinch | `pinch(init1, init2, cur1, cur2)` | Two-finger movement with position data |

## Combining Polling and Events

A common pattern uses events for discrete actions and polling for continuous movement:

```java
public class GameInput extends InputAdapter {
    private boolean jumping = false;

    @Override
    public boolean keyDown(int keycode) {
        if (keycode == Keys.SPACE) {
            jumping = true;  // event triggers the jump
            return true;
        }
        return false;
    }

    // Called from render()
    public void update(float delta) {
        // Polling for continuous movement
        if (Gdx.input.isKeyPressed(Keys.A)) {
            player.moveLeft(delta);
        }
        if (Gdx.input.isKeyPressed(Keys.D)) {
            player.moveRight(delta);
        }

        // Process event-set flags
        if (jumping) {
            player.jump();
            jumping = false;
        }
    }
}
```

## Other Input Features

### On-Screen Keyboard (Mobile)

```java
Gdx.input.setOnscreenKeyboardVisible(true);
// or with configuration:
Gdx.input.setOnscreenKeyboardVisible(true, OnscreenKeyboardType.Default);
```

### Vibration (Mobile)

```java
Gdx.input.vibrate(200);                    // vibrate for 200ms
Gdx.input.vibrate(new long[]{0, 100, 50, 100}, -1);  // pattern
```

### Cursor Control (Desktop)

```java
Gdx.input.setCursorCatched(true);          // lock cursor (FPS-style)
Gdx.input.setCursorPosition(400, 300);     // warp cursor
Gdx.input.setCursorImage(pixmap, hotX, hotY); // custom cursor
```

### Text Input Dialog

```java
Gdx.input.getTextInput(new Input.TextInputListener() {
    @Override
    public void input(String text) {
        playerName = text;
    }

    @Override
    public void canceled() {
        // user cancelled
    }
}, "Enter Name", "", "Your name here");
```

## Platform-Specific Notes

| Feature | Desktop | Android | iOS | Web |
|---------|---------|---------|-----|-----|
| Keyboard | Full | Virtual | Virtual | Full |
| Mouse | Full | N/A | N/A | Full |
| Touch | Simulated via mouse | Full | Full | Partial |
| Multi-touch | N/A | Up to 20 pointers | Up to 20 pointers | Varies |
| Accelerometer | N/A | Full | Full | N/A |
| Gyroscope | N/A | Full | Full | N/A |
| Vibration | N/A | Full | Limited | N/A |
| Cursor capture | Full | N/A | N/A | Full |
| Controllers | Via gdx-controllers | Via gdx-controllers | N/A | Via gdx-controllers |

## Controller Support (gdx-controllers)

Gamepad/controller input uses the separate `gdx-controllers` extension:

```java
// In build.gradle
implementation "com.badlogicgames.gdx-controllers:gdx-controllers-core:2.2.3"

// Query connected controllers
Array<Controller> controllers = Controllers.getControllers();

// Listen for events
Controllers.addListener(new ControllerAdapter() {
    @Override
    public boolean buttonDown(Controller controller, int buttonCode) {
        if (buttonCode == controller.getMapping().buttonA) {
            player.jump();
        }
        return true;
    }
});

// Poll axis values
float leftX = controller.getAxis(controller.getMapping().axisLeftX);
float leftY = controller.getAxis(controller.getMapping().axisLeftY);
```
