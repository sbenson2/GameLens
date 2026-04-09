# G1 — Message Passing

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Component Reference](../reference/R1_component_reference.md)

---

## Why Message Passing?

Defold's inter-object communication is built on **asynchronous message passing** instead of direct function calls. This is the single most important concept to internalize when learning Defold.

In a typical OOP engine, you might write:
```lua
-- NOT how Defold works
local enemy = get_object("enemy")
enemy:take_damage(10)
```

In Defold, you write:
```lua
-- Defold way: post a message, the receiver handles it
msg.post("enemy#script", "take_damage", { amount = 10 })
```

The message goes into a queue and is delivered to the target's `on_message` callback during the same frame's message dispatch phase. This keeps game objects fully decoupled — the sender doesn't need a reference to the receiver, only its address.

---

## Addressing

Every component in Defold has a unique address (URL) with three parts:

```
[collection]:/game_object#component
```

### Address Examples

| Address | Meaning |
|---------|---------|
| `#script` | The script component on **this** game object |
| `#sprite` | The sprite component on **this** game object |
| `/player#script` | The script on the "player" game object in the **current** collection |
| `/enemies/boss#script` | The script on "boss" inside the "enemies" sub-collection |
| `main:/player#script` | Full absolute address including collection name |

### Shorthand Rules

- **Omit collection** when targeting objects in the same collection (most common case).
- **Omit game object** (use `#component`) when targeting a component on the same game object.
- **Omit component** when targeting a game object's default script.

---

## Sending Messages

### msg.post(receiver, message_id, [message])

```lua
-- Simple message with no payload
msg.post("#sprite", "disable")

-- Message with data
msg.post("/enemy#script", "take_damage", { amount = 10, type = "fire" })

-- Message to a URL object
local target = msg.url("main", "/player", "script")
msg.post(target, "heal", { amount = 25 })
```

**Important:** `msg.post()` is asynchronous. The message is not delivered instantly — it's queued and delivered later in the same frame. This means:
- You cannot get a return value from a message.
- Delivery order within a frame is deterministic but not customizable.
- If you need a response, the receiver must post a message back to the `sender`.

---

## Receiving Messages

Handle incoming messages in the `on_message` lifecycle callback:

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("take_damage") then
        self.health = self.health - message.amount
        if self.health <= 0 then
            -- Notify the attacker that the kill landed
            msg.post(sender, "kill_confirmed")
            go.delete()
        end
    elseif message_id == hash("heal") then
        self.health = math.min(self.health + message.amount, self.max_health)
    end
end
```

**Parameters:**
- `self` — the script instance's state table
- `message_id` — a hash of the message name (use `hash("name")` to compare)
- `message` — the data table sent with the message (or `nil`)
- `sender` — the URL of the component that sent the message (use to reply)

---

## Built-In System Messages

Defold's engine components send and respond to many built-in messages:

### Sprite Messages
```lua
msg.post("#sprite", "play_animation", { id = hash("walk") })
msg.post("#sprite", "disable")   -- hide
msg.post("#sprite", "enable")    -- show
```

### Collision Messages (Received Automatically)
```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("collision_response") then
        -- message.other_id = game object id of the other object
        -- message.other_group = collision group hash
        -- message.own_group = this object's collision group hash
    elseif message_id == hash("contact_point_response") then
        -- Detailed collision: normal, distance, applied impulse
    elseif message_id == hash("trigger_response") then
        -- Trigger volume entered/exited
        -- message.enter = true/false
    end
end
```

### Sound Messages
```lua
msg.post("#sound", "play_sound", { gain = 0.8 })
msg.post("#sound", "stop_sound")
```

### Factory Messages
```lua
-- Spawn a game object from a factory component
local id = factory.create("#enemy_factory", pos, rot, { health = 100 }, scale)
```

Note: `factory.create()` is a direct function call, not a message — it returns the new game object's ID synchronously.

---

## Common Patterns

### Request-Response

When you need data back from another object, use a two-message pattern:

```lua
-- requester.script
function init(self)
    msg.post("/inventory#script", "get_item_count", { item = "potion" })
end

function on_message(self, message_id, message, sender)
    if message_id == hash("item_count_response") then
        self.potions = message.count
    end
end

-- inventory.script
function on_message(self, message_id, message, sender)
    if message_id == hash("get_item_count") then
        local count = self.items[message.item] or 0
        msg.post(sender, "item_count_response", { count = count })
    end
end
```

### Broadcast to Multiple Objects

Defold has no built-in broadcast. Common approaches:

1. **Manager pattern** — a central script tracks registered objects and forwards messages:
```lua
-- manager.script
function init(self)
    self.listeners = {}
end

function on_message(self, message_id, message, sender)
    if message_id == hash("register") then
        table.insert(self.listeners, sender)
    elseif message_id == hash("broadcast") then
        for _, listener in ipairs(self.listeners) do
            msg.post(listener, message.event, message.data)
        end
    end
end
```

2. **Lua module** — use a shared Lua module as an event bus (breaks pure message passing, but pragmatic).

### Acquiring Input Focus

A game object's script must explicitly request input:

```lua
function init(self)
    msg.post(".", "acquire_input_focus")
end

function final(self)
    msg.post(".", "release_input_focus")
end

function on_input(self, action_id, action)
    if action_id == hash("jump") and action.pressed then
        -- Handle jump
    end
end
```

Input bindings are defined in `game.input_binding` and map device inputs to action names.

---

## Debugging Messages

Use `print()` or `pprint()` (pretty-print) to inspect messages:

```lua
function on_message(self, message_id, message, sender)
    print("Received:", message_id, "from:", sender)
    pprint(message)
end
```

In the Defold editor, the Console panel shows all print output. The built-in Profiler (accessible via `game.project` settings) can show message throughput.

---

## Common Pitfalls

1. **Messages are asynchronous** — you cannot read a return value from `msg.post()`. If you need a response, implement request-response.

2. **String hashing** — message IDs are hashes. If you misspell a message name, it silently goes undelivered. Use constants or a shared Lua module for message names to catch typos early.

3. **Addressing errors** — posting to a non-existent address prints a warning in the console but doesn't crash. Check the console when messages seem to "disappear."

4. **Deleted objects** — posting a message to a deleted game object is safe (the message is silently dropped), but relying on this is fragile. Clean up references when objects are destroyed.

5. **Frame timing** — messages posted during `update()` are delivered in the same frame's message pass. Messages posted during `on_message()` are also delivered in the same frame if the target hasn't been processed yet, otherwise next frame.
