# G9 — Threading & Channels

> **Category:** guide · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Why Threads in LÖVE?

LÖVE is single-threaded by default — `love.update` and `love.draw` run on the main thread. Long-running operations (network I/O, file parsing, procedural generation) will stall the frame rate if done inline. The `love.thread` module lets you offload work to separate Lua environments that run in parallel.

**Best candidates for threading:** networking, file I/O, asset loading, heavy computation (pathfinding, world generation). **Not suited for threading:** rendering (love.graphics is main-thread only), audio playback.

---

## Core Concepts

### Threads Are Isolated Lua States

Each thread is a **completely separate Lua environment**. It does not share variables, tables, or upvalues with the main thread. When a thread starts, only three modules are pre-loaded:

- `love.data`
- `love.filesystem`
- `love.thread`

Any other module must be explicitly loaded with `require` inside the thread code.

### Channels Are Thread-Safe Queues

Communication between threads happens through **Channels** — named, thread-safe message queues. Channels are not tied to any specific thread; any thread can push to or pop from any channel.

---

## Creating and Starting a Thread

```lua
-- main.lua
function love.load()
    -- Create from a separate file
    local worker = love.thread.newThread("worker.lua")
    worker:start()  -- Begins execution immediately

    -- Or create from a string of Lua code
    local inline = love.thread.newThread([[
        local ch = love.thread.getChannel("results")
        ch:push("Hello from inline thread!")
    ]])
    inline:start()
end
```

```lua
-- worker.lua
-- This runs in its own Lua state — no access to main.lua globals
local input  = love.thread.getChannel("work")
local output = love.thread.getChannel("results")

while true do
    -- demand() blocks until a message arrives
    local task = input:demand()
    if task == "quit" then break end

    -- Do expensive work here
    local result = doHeavyComputation(task)
    output:push(result)
end
```

---

## Channel API

Channels have four primary operations, and understanding the blocking behavior is critical:

| Method | Blocks? | Behavior |
|--------|---------|----------|
| `push(value)` | No | Adds value to the end of the queue |
| `pop()` | No | Removes and returns the first value, or `nil` if empty |
| `demand()` | **Yes** | Waits until a value is available, then removes and returns it |
| `supply(value)` | **Yes** | Pushes a value and waits until another thread reads it |

### Getting a Channel

```lua
-- By name (shared globally — same name = same channel from any thread)
local ch = love.thread.getChannel("my_channel")

-- Anonymous channel (only accessible if you pass the reference)
local ch = love.thread.newChannel()
```

### Additional Channel Methods

```lua
ch:peek()              -- Read first value without removing it
ch:getCount()          -- Number of messages in the queue
ch:hasRead(id)         -- Check if a specific push has been read
ch:clear()             -- Remove all messages
ch:performAtomic(func) -- Execute a function atomically on the channel
```

---

## What Can Be Sent Through Channels?

Channels can transport:

- **Primitives:** booleans, numbers, strings
- **LÖVE userdata:** Images, Sources, Fonts, etc. (passed by reference — the underlying C object is shared)
- **Nil** (useful as a sentinel)

Channels **cannot** transport:

- Lua tables (serialize to JSON/string first)
- Lua functions or closures
- Coroutines
- Non-LÖVE userdata

```lua
-- Sending a table: serialize it first
local json = require("json")  -- or any serialization lib
ch:push(json.encode({ x = 10, y = 20, type = "spawn" }))

-- Receiving side
local data = json.decode(ch:pop())
```

---

## Common Patterns

### Worker Pool

Distribute tasks across multiple threads for CPU-heavy work like chunk generation:

```lua
-- main.lua
local NUM_WORKERS = 4
local workers = {}

function love.load()
    for i = 1, NUM_WORKERS do
        workers[i] = love.thread.newThread("worker.lua")
        workers[i]:start()
    end
end

function love.update(dt)
    -- Distribute work round-robin
    local workCh = love.thread.getChannel("work")
    while hasMoreTasks() do
        workCh:push(getNextTask())
    end

    -- Collect results (non-blocking)
    local resultCh = love.thread.getChannel("results")
    while resultCh:getCount() > 0 do
        local result = resultCh:pop()
        applyResult(result)
    end
end
```

### Background Asset Loader

Load assets without freezing the game:

```lua
-- loader_thread.lua
local requests = love.thread.getChannel("load_requests")
local results  = love.thread.getChannel("load_results")

while true do
    local path = requests:demand()
    if path == "quit" then break end

    -- Read the file data (love.filesystem is available in threads)
    local fileData = love.filesystem.newFileData(path)
    results:push({ path = path, data = fileData })
end
```

```lua
-- main.lua: create the actual Image on main thread (graphics is main-only)
function love.update(dt)
    local results = love.thread.getChannel("load_results")
    local msg = results:pop()
    if msg then
        -- love.graphics calls must happen on the main thread
        local imageData = love.image.newImageData(msg.data)
        assets[msg.path] = love.graphics.newImage(imageData)
    end
end
```

### Request-Response with supply/demand

For synchronous-style communication where the worker waits for acknowledgment:

```lua
-- Thread A
ch:supply("important_data")  -- Blocks until Thread B reads it

-- Thread B
local val = ch:demand()  -- Blocks until Thread A supplies
```

---

## Error Handling

Thread errors are **silent by default**. If a thread throws an error, the main thread won't know unless you check:

```lua
function love.update(dt)
    local err = worker:getError()
    if err then
        print("Worker thread crashed: " .. err)
        -- Restart or handle gracefully
    end
end

-- Or use the global callback (called on main thread)
function love.threaderror(thread, errorstr)
    print("Thread error: " .. errorstr)
end
```

**Always implement `love.threaderror`** — silent thread deaths are one of the most common debugging headaches in LÖVE.

---

## Thread Lifecycle

```lua
local t = love.thread.newThread("worker.lua")

t:start()       -- Launch the thread
t:isRunning()   -- Check if still alive
t:wait()        -- Block main thread until this thread finishes (use sparingly!)
t:getError()    -- Get error string if thread crashed, or nil
```

A thread object can be reused — call `start()` again after it finishes. But you cannot start a thread that is already running.

---

## Performance Tips

1. **Batch your channel messages.** Each `push`/`pop` has synchronization overhead. Send chunks of data rather than individual items.

2. **Serialize tables efficiently.** JSON works but is slow for large data. Consider `love.data.pack` / `love.data.unpack` for binary serialization of simple structures, or MessagePack via a Lua library.

3. **Limit thread count.** Lua threads map to OS threads. Match your worker count to CPU cores minus one (leave one for the main thread). `love.system.getProcessorCount()` returns the core count.

4. **Don't over-thread.** Threads add complexity. For operations under ~2ms, the channel overhead may exceed the computation time. Profile first.

5. **Use `performAtomic` for multi-step channel operations** to avoid race conditions when checking count then popping:

```lua
-- WRONG: race condition between getCount and pop
if ch:getCount() > 0 then
    local val = ch:pop()  -- Another thread might have popped it first
end

-- RIGHT: atomic check-and-pop
local val = ch:performAtomic(function(c)
    if c:getCount() > 0 then
        return c:pop()
    end
end)
```

---

## Gotchas

- **love.graphics is main-thread only.** Load file data in threads, create GPU resources (Images, Canvases, Shaders) on the main thread.
- **Global state is not shared.** Setting a global in the main thread does not affect threads. Use channels.
- **require paths work normally** in threads because `love.filesystem` is pre-loaded.
- **Thread:wait() blocks the main thread** — avoid in `love.update`. Use non-blocking `pop()` to check results instead.
- **LÖVE objects are reference-counted** across threads. An Image pushed through a channel won't be garbage-collected until all references (in all threads) are gone.

---

## Quick Reference

```lua
-- love.thread module
love.thread.newThread(code_or_file)   --> Thread
love.thread.getChannel(name)          --> Channel
love.thread.newChannel()              --> Channel

-- Thread object
Thread:start(...)
Thread:wait()
Thread:isRunning()       --> boolean
Thread:getError()        --> string or nil

-- Channel object
Channel:push(value)
Channel:pop()            --> value or nil
Channel:demand([timeout]) --> value
Channel:supply(value, [timeout]) --> boolean
Channel:peek()           --> value or nil
Channel:getCount()       --> number
Channel:hasRead(id)      --> boolean
Channel:clear()
Channel:performAtomic(func) --> ...
```
