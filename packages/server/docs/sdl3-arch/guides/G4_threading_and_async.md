# G4 — SDL3 Threading and Async Patterns

> **Category:** guide · **Engine:** SDL3 · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [Events & Windows](../reference/R2_events_and_windows.md)

This guide covers SDL3's threading primitives and concurrency patterns: creating threads, synchronization with mutexes and condition variables, atomic operations, and the new `SDL_RunOnMainThread` dispatch mechanism. All examples use C with SDL 3.2+.

---

## Threading Overview

SDL3 provides a portable threading API that abstracts OS-specific implementations (pthreads on Unix, Win32 threads on Windows). Key differences from SDL2:

- `SDL_LockMutex()`, `SDL_UnlockMutex()`, `SDL_WaitCondition()`, `SDL_SignalCondition()`, and `SDL_BroadcastCondition()` now return `void` — they cannot fail if given a valid object. No more checking return codes on lock/unlock.
- New `SDL_RunOnMainThread()` lets any thread dispatch work to the main thread.
- New `SDL_IsMainThread()` checks whether the calling thread is the main thread.
- Threading is always available — no `SDL_INIT_*` flag is needed.

---

## Creating Threads

### Basic Thread Creation

```c
#include <SDL3/SDL_thread.h>

// Thread function signature: returns int, takes void* userdata
int asset_loader(void *data) {
    const char *path = (const char *)data;
    // ... load assets from path ...
    SDL_Log("Loaded assets from: %s", path);
    return 0; // return value retrievable via SDL_WaitThread
}

int main(int argc, char *argv[]) {
    SDL_Init(SDL_INIT_VIDEO);

    // Create a named thread (name is for debugging — shows in profilers/debuggers)
    SDL_Thread *thread = SDL_CreateThread(asset_loader, "AssetLoader", "resources/");

    if (!thread) {
        SDL_Log("Failed to create thread: %s", SDL_GetError());
        return 1;
    }

    // ... do main thread work ...

    // Wait for thread to finish and get its return value
    int result;
    SDL_WaitThread(thread, &result);
    SDL_Log("Asset loader returned: %d", result);

    SDL_Quit();
    return 0;
}
```

### Detached Threads

If you don't need to wait for a thread to finish, detach it:

```c
SDL_Thread *thread = SDL_CreateThread(background_task, "BGTask", data);
SDL_DetachThread(thread);
// Thread will clean up its own resources when it exits.
// You cannot call SDL_WaitThread on a detached thread.
```

### Thread Identification

```c
// Get the current thread's OS-level ID
SDL_ThreadID my_id = SDL_GetCurrentThreadID();

// Get a specific thread's ID
SDL_ThreadID loader_id = SDL_GetThreadID(thread);

// Check if we're on the main thread
if (SDL_IsMainThread()) {
    // Safe to call SDL video/window functions here
}
```

---

## Mutexes

SDL mutexes are **reentrant** (recursive): the owning thread can lock the same mutex multiple times without deadlocking, but must unlock the same number of times before other threads can acquire it.

### Basic Mutex Usage

```c
#include <SDL3/SDL_mutex.h>

typedef struct {
    SDL_Mutex *lock;
    int score;
    char player_name[64];
} GameState;

GameState *create_game_state(void) {
    GameState *state = SDL_calloc(1, sizeof(GameState));
    state->lock = SDL_CreateMutex();
    return state;
}

void update_score(GameState *state, int points) {
    SDL_LockMutex(state->lock);    // Blocks until lock is acquired
    state->score += points;         // Safe — we hold the lock
    SDL_UnlockMutex(state->lock);  // Release for other threads
}

int read_score(GameState *state) {
    SDL_LockMutex(state->lock);
    int score = state->score;
    SDL_UnlockMutex(state->lock);
    return score;
}

void destroy_game_state(GameState *state) {
    SDL_DestroyMutex(state->lock);
    SDL_free(state);
}
```

### Read-Write Locks

For data that is read frequently but written rarely, use `SDL_RWLock` to allow concurrent readers:

```c
SDL_RWLock *rwlock = SDL_CreateRWLock();

// Multiple threads can read simultaneously
SDL_LockRWLockForReading(rwlock);
// ... read shared data ...
SDL_UnlockRWLock(rwlock);

// Only one thread can write (blocks all readers and writers)
SDL_LockRWLockForWriting(rwlock);
// ... modify shared data ...
SDL_UnlockRWLock(rwlock);

SDL_DestroyRWLock(rwlock);
```

---

## Condition Variables

Condition variables let threads wait efficiently for a specific condition to become true, rather than spinning in a loop.

### Producer-Consumer Pattern

```c
typedef struct {
    SDL_Mutex *lock;
    SDL_Condition *not_empty;
    SDL_Condition *not_full;
    int buffer[64];
    int count;
    int read_pos;
    int write_pos;
} WorkQueue;

// Producer: add work item
void enqueue(WorkQueue *q, int item) {
    SDL_LockMutex(q->lock);

    // Wait until there's space in the buffer
    while (q->count == 64) {
        SDL_WaitCondition(q->not_full, q->lock);
        // WaitCondition atomically unlocks the mutex and sleeps.
        // When signaled, it re-acquires the lock before returning.
    }

    q->buffer[q->write_pos] = item;
    q->write_pos = (q->write_pos + 1) % 64;
    q->count++;

    SDL_SignalCondition(q->not_empty);  // Wake one waiting consumer
    SDL_UnlockMutex(q->lock);
}

// Consumer: take work item
int dequeue(WorkQueue *q) {
    SDL_LockMutex(q->lock);

    while (q->count == 0) {
        SDL_WaitCondition(q->not_empty, q->lock);
    }

    int item = q->buffer[q->read_pos];
    q->read_pos = (q->read_pos + 1) % 64;
    q->count--;

    SDL_SignalCondition(q->not_full);  // Wake one waiting producer
    SDL_UnlockMutex(q->lock);
    return item;
}
```

### Timed Waits

```c
// Wait with a timeout (in nanoseconds)
// Returns true if signaled, false if timed out
bool signaled = SDL_WaitConditionTimeout(cond, mutex, 1000000000); // 1 second
```

---

## Atomic Operations

For simple counters and flags, atomics avoid the overhead of a full mutex. Use them for lock-free patterns — but prefer mutexes for anything complex.

### SDL_AtomicInt

```c
#include <SDL3/SDL_atomic.h>

SDL_AtomicInt frame_counter = { 0 };

// Increment atomically (returns the previous value)
int prev = SDL_AddAtomicInt(&frame_counter, 1);

// Read the current value
int current = SDL_GetAtomicInt(&frame_counter);

// Set a new value (returns the previous value)
int old_val = SDL_SetAtomicInt(&frame_counter, 0);

// Compare-and-swap: set to new_val only if current value == expected
// Returns true if the swap happened
bool swapped = SDL_CompareAndSwapAtomicInt(&frame_counter, expected, new_val);
```

### Atomic Pointers

```c
// Useful for lock-free data structure swaps
SDL_AtomicPointer config_ptr = { NULL };

Config *new_config = load_config("game.cfg");
SDL_SetAtomicPointer(&config_ptr, new_config);

Config *current = SDL_GetAtomicPointer(&config_ptr);
```

### When to Use Atomics vs Mutexes

Use **atomics** for simple counters, boolean flags, and single-pointer swaps where only one variable is involved. Use **mutexes** when you need to update multiple related values together — atomics cannot guarantee consistency across multiple variables.

---

## SDL_RunOnMainThread (New in SDL3)

Many SDL subsystems (video, windows, events) must be called from the main thread. `SDL_RunOnMainThread` lets worker threads safely dispatch code back to the main thread.

### Basic Usage

```c
#include <SDL3/SDL_init.h>

// Callback that will run on the main thread
void update_window_title(void *userdata) {
    const char *title = (const char *)userdata;
    SDL_SetWindowTitle(game_window, title);
}

// Called from a worker thread
int network_thread(void *data) {
    // ... receive data from server ...

    // We need to update the window title, but that's a main-thread operation.
    // wait_complete=true blocks until the callback finishes.
    SDL_RunOnMainThread(update_window_title, "Connected to Server", true);

    return 0;
}
```

### Fire-and-Forget vs Blocking

```c
// Fire-and-forget: queue the callback and return immediately
SDL_RunOnMainThread(my_callback, data, false);

// Blocking: wait until the callback has executed on the main thread
SDL_RunOnMainThread(my_callback, data, true);
```

### When Called from the Main Thread

If you call `SDL_RunOnMainThread` while already on the main thread, the callback executes **immediately** (synchronously). This makes it safe to use unconditionally without checking `SDL_IsMainThread()` first.

### Main Thread Definition

The "main thread" depends on the platform:

- **Apple platforms (macOS, iOS):** The thread running `main()`.
- **All other platforms:** The thread that called `SDL_Init(SDL_INIT_VIDEO)`.

The callbacks are processed during the SDL event loop — so your main loop must be pumping events (via `SDL_PollEvent`, `SDL_WaitEvent`, or similar) for queued callbacks to execute.

---

## Game Architecture: Asset Loading Thread

A practical pattern combining multiple threading primitives:

```c
typedef struct {
    SDL_Mutex *lock;
    SDL_Condition *ready;
    SDL_AtomicInt progress;    // 0–100, read by main thread for progress bar
    Texture *textures;
    int texture_count;
    bool done;
    bool error;
    char error_msg[256];
} AssetLoadContext;

int asset_load_thread(void *data) {
    AssetLoadContext *ctx = (AssetLoadContext *)data;
    const char *files[] = { "player.png", "enemy.png", "tileset.png", /* ... */ };
    int total = sizeof(files) / sizeof(files[0]);

    for (int i = 0; i < total; i++) {
        // Load the raw pixel data (thread-safe — no GPU calls)
        SDL_Surface *surface = IMG_Load(files[i]);
        if (!surface) {
            SDL_LockMutex(ctx->lock);
            ctx->error = true;
            SDL_snprintf(ctx->error_msg, sizeof(ctx->error_msg),
                         "Failed to load %s", files[i]);
            SDL_SignalCondition(ctx->ready);
            SDL_UnlockMutex(ctx->lock);
            return 1;
        }

        // Store the surface for the main thread to upload to GPU
        SDL_LockMutex(ctx->lock);
        ctx->textures[i].surface = surface;
        SDL_UnlockMutex(ctx->lock);

        // Update progress atomically (no mutex needed for a single int)
        SDL_SetAtomicInt(&ctx->progress, ((i + 1) * 100) / total);
    }

    SDL_LockMutex(ctx->lock);
    ctx->done = true;
    SDL_SignalCondition(ctx->ready);
    SDL_UnlockMutex(ctx->lock);
    return 0;
}

// Main thread: poll progress and show a loading bar
void loading_screen(AssetLoadContext *ctx) {
    while (true) {
        int pct = SDL_GetAtomicInt(&ctx->progress);
        draw_progress_bar(pct);

        SDL_LockMutex(ctx->lock);
        if (ctx->done || ctx->error) {
            SDL_UnlockMutex(ctx->lock);
            break;
        }
        SDL_UnlockMutex(ctx->lock);

        SDL_Delay(16); // ~60fps polling
    }
}
```

---

## Common Pitfalls

1. **Calling SDL video/window functions from worker threads** — Most SDL_Video and SDL_Window functions must be called from the main thread. Use `SDL_RunOnMainThread` to dispatch these calls safely.

2. **Forgetting to pump events** — `SDL_RunOnMainThread` callbacks only execute when the main thread processes events. If your main loop stalls or skips `SDL_PollEvent`, queued callbacks won't run.

3. **GPU API threading constraints** — `SDL_AcquireGPUSwapchainTexture` must be called from the thread that created the window. SDL3's GPU API is not fully thread-safe — keep all GPU submission on one thread.

4. **Deadlocking with blocking dispatch** — Calling `SDL_RunOnMainThread(..., true)` from the main thread is safe (it runs inline), but calling it from a worker thread while holding a mutex that the main thread also needs will deadlock.

5. **Over-using atomics** — Atomics are great for single values but cannot protect multi-variable invariants. If you need to update a position (x, y) atomically, use a mutex — two separate atomic writes can be observed in an inconsistent state.
