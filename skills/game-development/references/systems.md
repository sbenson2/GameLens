# Gameplay systems

Read this when implementing or debugging inventory and equipment, saves, combat and abilities, spawning and encounters, input and menus, data-driven content pipelines, or quest and dialogue state. Architecture choices such as ECS, event buses and update loops are in [architecture](architecture.md). Enemy decision-making is in [AI](ai.md), generators are in [procedural generation](procedural-generation.md), and netcode is in [multiplayer](multiplayer.md).

Start from the row that matches the problem, then read the project's actual implementation. The rows list engineering decisions and test candidates. They are not a checklist of features every game needs.

## Questions to ask before changing a system

These are this skill's diagnostic questions, aimed at the failure cases in the next table. Ask them before writing code.

- Who owns this state, and who only reads it or requests changes to it?
- What must survive a save, a scene change, a respawn, a pause and, if relevant, a disconnect?
- What happens if this runs twice, or is interrupted halfway?
- In which frame phase does it run, and in what order relative to physics, animation, AI and UI?
- Which values will designers tune, where do those values live, and how will they see the effect?
- What would a failure look like in a log or a debug view, and does that view exist yet?
- What is the smallest automated test or repeatable manual check that reproduces the reported problem?

## Failure cases to test first

| System | Decisions that shape the implementation | Failure cases worth a test |
| --- | --- | --- |
| Inventory and equipment | Definition id versus instance id; what makes two items stackable; capacity; transfers; one authoritative model | Partial stacks, full destination, duplicated unique item, invalid equip, restart or load mid-transfer |
| Save and load | Persisted state versus definitions; schema version; stable ids; migration policy; write and recovery strategy | Missing file, interrupted write, unsupported version, unknown item id, partial corruption, modal state stuck after a bad exit [@armstrong2017-firewatch-dialog] |
| Combat and abilities | Target validity; action phases; costs and cooldowns; damage authority; collision and event ordering | Repeated contacts, interruption, dead or freed target, double payment, pause or respawn mid-ability |
| Spawning and waves | Encounter budget, attack budget, pacing, placement constraints, completion rule | Blocked or off-navmesh spawn point [@routhier2018-aco-validation], exhausted pool, double completion, restart during a wave |
| Input and menus | Action mapping, focus, device switching, pause ownership, UI versus gameplay input | Held button across a scene change, remapping conflicts, lost focus, controller disconnect, two systems pausing at once |
| Data pipelines | Where definitions live, who edits them, validation, live reload | Dangling reference, duplicated definition, value out of range, buy-and-sell profit loop [@yan2005-cheating], data broken by a code change [@routhier2018-aco-validation] |
| Dialogue and quests | Fact store, rule matching, persistent flags, reward ownership; existing Ink, Yarn or custom runner | Reload mid-conversation, repeated completion, missing node, unreachable or never-played line [@armstrong2017-firewatch-dialog] |
| Enemy AI | Perception, decision, navigation and steering kept separate; update budget. See [AI](ai.md) | No path, stale target, conflicting actions, unreachable goal, reset |
| Procedural levels | Seed, representation, connectivity, constraints. See [procedural generation](procedural-generation.md) | Unreachable objective, invalid start, unwinnable resource placement, seed that does not reproduce |
| Networking | Authority, replication, prediction, trust boundaries. See [multiplayer](multiplayer.md); only if multiplayer is in scope | Packet loss, reconnect, duplicate or out-of-order actions, desync |

## Inventory and equipment

Separate what an item is from what the player owns. Nystrom's Type Object pattern keeps shared per-kind data (name, base stats, stack limit, icon) in a definition object and per-instance data in the object that references it. Defining kinds in data lets designers add and tune them without recompiling. The costs are that you must load and track the definitions yourself, and per-kind behavior is harder than per-kind data. The usual workarounds are choosing from a fixed set of coded behaviors, or a scripting layer [@nystrom2014-patterns].

Decisions to make explicitly:

- **Stack identity.** A workable rule: two entries stack only when every persisted field except the count matches. Durability, rolled affixes, binding or provenance make items non-interchangeable, so decide per definition whether it is counted (stackable) or tracked (unique, with its own instance id).
- **Capacity.** Slots, weight or a grid. Decide which rule rejects a transfer and where the rejection is shown to the player.
- **Transfers.** Validate against the destination before changing either side. Apply both sides as one operation, and leave both unchanged on failure. The same applies to trades, crafting, shops and loot pickups.
- **Equipment.** Treat equipping as a move between containers with slot rules. Derive final stats from their sources each time, as in the modifier systems below, rather than adding to base stats on equip and subtracting on unequip.
- **One authoritative model.** Menus and HUD read from it and send requests to it; they do not keep their own copy. In multiplayer the server owns it.

Red flags: an item identified by a scene-node reference or an array index; `source.Remove(item); dest.Add(item)` with the result of `Add` ignored; a stack merge that compares only the definition id; equip code that writes into base stats.

Checks: a test that any sequence of transfers conserves the total count of every definition; tests for a full destination, a partial stack, a second copy of a unique item, and saving and reloading mid-transfer.

## Save and load

**What to persist.** Persist what the player produced and the game cannot recompute: owned instances, world facts and progress. Definitions are re-read from data. Respawn's talk on the Star Wars Jedi games describes persistent facts such as a shortcut being unlocked, a line of dialogue having played or a boss being beaten. In a non-linear game these facts depend on one another but have no required order. The talk reviews the failures of the unstructured tracking on Fallen Order and the centralized state system built for Survivor (session description only) [@wilkinson2024-jedi-state].

**Stable ids.** Serialize definition ids and authored object ids that survive reordering, renaming and rebuilding, such as strings or GUIDs. Do not serialize memory addresses, scene paths or list positions. Decide what loading does with an id the game no longer knows: drop it with a log entry, substitute a replacement, or refuse the save.

**Versions and migration.** Write a schema version into every save and migrate step by step from each released version. In this skill's view, import and migration logic is where saves are most likely to break. On Dragon Age, importing saves between games produced errors such as dead characters reappearing and choices being overturned. The plot dependencies were hard to test, and fixes required client patches. The Dragon Age Keep stored a chosen set of key decisions together with the plot rules and preconditions. A solver resolved conflicting selections to a valid world state, and each game read only the facts it needed [@shinkewski2015-dragon-age-keep]. The smaller lesson for most projects is to validate a loaded state against explicit rules instead of trusting it. Keep a fixture save from every released version and load each one in automated tests. Compatibility work should be proportional to the released data you must support.

**Safe writes.** On POSIX systems, `rename()` over an existing file is atomic in one respect: the name always refers to either the old file or the new one [@opengroup2024-rename]. The specification states no durability requirement after a crash, and `rename()` can fail when the two paths are on different file systems [@opengroup2024-rename]. `fsync()` requests that the data reach storage, but how it does so is implementation-defined [@opengroup2024-fsync]. So a temporary file alone does not prove crash safety. A reasonable desktop sequence: write to a temporary file in the same directory, flush and `fsync` it, rename it over the old save, and keep the previous save as a fallback. On consoles, mobile and cloud-synced storage, use the platform's save API and read its documented guarantees.

**Loading.** Parse and validate into a candidate state, and replace the live state only when that succeeds. Rebuild transient locks such as cutscene, input and pause locks from persisted facts rather than carrying them over. On Firewatch, a conversation branch that skipped its cleanup could leave the radio disabled until the player reloaded [@armstrong2017-firewatch-dialog]. Loading is the player's escape hatch, so it must not restore the broken lock.

Checks: a missing file; a truncated file; a process killed mid-write; fixtures from older versions; unknown ids; saving during a scene transition, a cutscene or combat.

## Combat and abilities

**Action phases.** Model an ability as explicit states, such as wind-up, active, recovery and cooldown or whatever the design needs, each with enter and exit handlers. Nystrom's State chapter covers several variants. A finite state machine fits behavior that divides into a few exclusive states. Concurrent machines avoid multiplying states (what the character is doing times what it is carrying). Hierarchical states share transitions. A pushdown stack returns to the previous state after an interruption such as firing [@nystrom2014-patterns]. In Overwatch's Statescript, every state undoes what it started when it deactivates: animations, effects, variable changes and sub-graphs. Reed credits that contract for fewer bugs where something stays on, or exists on the server but not on the client [@reed2017-overwatch-abilities]. Test every exit: completion, interruption by a hit or stun, death, cancel, pause, and scene unload.

**Costs and cooldowns.** Deduct costs at one commit point, and decide what an interruption refunds. Red flags: a cost deducted on the button press and again on an animation event; a cooldown started from two places; an ability that can commit while its previous activation is still resolving.

**Effects and modifiers.** On For Honor, one modifier system served feats, gear, status effects and campaign bosses. Each modifier paired programmer-written effects (change a stat, disable a capability, add a tag, remove modifiers, spawn effects) with a duration and designer-combinable conditions [@lechevalier2017-for-honor]. Stacking them naively produced far too much power. The team added a minimum and maximum per stat. They also applied intrinsic sources such as gear and difficulty before dynamic ones such as feats, because summing the percentages gave wrong results. Damage over time used a snapshot of the modifiers taken when it was applied, so a later buff did not change an ongoing bleed [@lechevalier2017-for-honor]. An always-on compact debug display caught modifiers that never expired and conditions that were never met [@lechevalier2017-for-honor].

**Authority.** Give health, resources and cooldowns one owner. In Overwatch the server is authoritative. Clients send only button input and aim, predict their own hero, and roll back and re-simulate when corrected [@reed2017-overwatch-abilities]. Damage is applied only on the server, while hit registration is predicted on the client [@ford2017-overwatch]. In a single-player game the equivalent rule is that one system writes health and the others request changes.

**Event ordering.**

- In a per-object update loop, order matters. An object sees the new state of objects updated before it and the old state of those after it. An object spawned mid-loop may act before it is ever drawn. Removing objects mid-iteration can skip one, so mark them dead and remove them after the pass [@nystrom2014-patterns]. Gregory describes updates phased around engine subsystems and dependency-ordered buckets to respect these dependencies, and caching or time-stamping each object's previous state to handle the one-frame-off inconsistencies that remain [@gregory2018-engine].
- A queued event may be handled after the world has changed, so copy the data the handler needs into the event. Queues can hide feedback loops; avoid sending events from inside a handler [@nystrom2014-patterns].
- Overwatch queues large side effects, such as impact effects and damage or healing, and resolves them at one point in the frame instead of from many call sites [@ford2017-overwatch].

Red flags: damage applied in a collision callback that fires for every contact on every frame; a target freed between hit detection and damage; kill credit computed after the attacker despawned. For input buffering, hit-stop and hit reactions, see [game feel](game-feel.md).

## Spawning, waves and encounter budgets

**Encounter structure.** On DOOM (2016), id found that teleported wave fights felt contrived and left players hunting stragglers. Arena fights instead kept a steady stream of reinforcements and ended when no "heavy" enemy remained. Reinforcements were triggered by a heavy's remaining health rather than its death, and each wave had one "captain". Some pairings of enemy roles were banned. The team treated players retreating, holding a doorway, sniping from a distance or kiting as signs that an encounter was failing [@loudy2018-doom].

**Attack budgets.** Both DOOM and God of War (2018) use tokens to cap how many enemies attack at once. In DOOM an attack needs a token from a limited pool. Tokens have cooldowns, difficulty changes the counts, and an enemy directly in front of the player may steal a token so it does not stand idle [@loudy2018-doom]. God of War periodically scores enemies on whether they may attack, a designer priority applied within a range, whether the player is targeting them, and their screen position and distance. It hands out tokens from a fixed pool, larger enemy types claiming more, and enemies without tokens hang back. An enemy interrupted by a hit keeps its tokens briefly, which rewards sustained offense [@sheth2019-god-of-war]. What the budget counts (simultaneous attackers, attack types, or a weighted threat) should follow from the intended experience and from what the camera lets the player see.

**Directors and authored overrides.** One GDC 2025 talk describes growing a spawn director into a director that paced the whole combat experience of a co-op game. Level designers got tools to override map sections with authored gameplay and to control the flow of spawns (session description only) [@mejerwall2025-adventure-director]. Decide early which of the two has the final say in a given space.

**Spawn mechanics.**

- Pools: size pools for important objects so they never run out. For other objects, choose what happens when a pool is exhausted: skip the spawn, recycle the least noticeable object, or grow the pool. Reused objects must be fully reinitialized, and in garbage-collected languages their references cleared [@nystrom2014-patterns].
- Placement: validate spawn points as data. Assassin's Creed Origins checked nightly that spawners stood on navmesh, and boat spawners over water [@routhier2018-aco-validation].
- Completion: count completion in one place and make it idempotent. Test a restart during a wave, a kill on the frame an enemy spawns, and an enemy that falls out of the world.

## Input and menus

**Action mapping.** Map devices to named actions, and have gameplay read actions. Nystrom's Command pattern binds each button to a command object. The bindings can then be swapped, and the same commands can come from AI to drive an actor [@nystrom2014-patterns]. On God of War Ragnarok, full controller remapping required re-architecting input, because designers had hard-coded specific buttons for every action. Afterwards they chose an action, such as aim, interact or evade, for each interaction. Bohn calls full remapping the most requested accessibility feature by far [@bohn2023-ragnarok-ui]. Build the action layer before content depends on raw buttons, since retrofitting it means revisiting that content. See [accessibility](accessibility.md).

**Device switching.** The Division's UI automatically chose which prompt to show for a game action on console, on PC and on PC with a controller [@savoie2017-division-ui]. Derive prompts from the action map and the last device used. Ignore stick drift when deciding which device is active. Rebuild prompts after remapping, and decide what a controller disconnect does, such as pausing and asking the player to reconnect.

**Focus.** Give focus one owner. A screen that opens takes focus. When it closes, focus returns to the element that opened it. Test every screen with each supported device, including a mouse hover followed by gamepad input.

**Menu stacks and pause ownership.** A stack of screens returns to the previous screen without each screen knowing where it came from. It works like the pushdown automaton in Nystrom's State chapter, which keeps a stack of states so the machine can go back to whichever state came before [@nystrom2014-patterns]. Pause and input locks are shared state. If the pause menu, a cutscene and a tutorial each set one `paused` flag, the first to close unpauses the others. Keep a set or stack of named requests instead, and pause while any is held. Firewatch shows the same failure with modal state. A lock switched on when a conversation started had to be switched off at every exit, and branching added exits that skipped it. The team concluded that the guarantee should belong to the conversation as a whole, and added debug commands to force the state back [@armstrong2017-firewatch-dialog]. God of War Ragnarok's in-menu tutorials take over input so that only the action being taught advances the step [@bohn2023-ragnarok-ui].

Red flags: gameplay polling raw key codes; one press consumed by both the UI and gameplay, so closing a menu also jumps; edge detection that treats a button held across a scene change as a new press; remapping that allows one key for two actions active in the same context.

## Data-driven content and tuning

**What data buys.** Definitions in data let non-programmers add and tune content without recompiling [@nystrom2014-patterns]. On For Honor, designers built and tuned new modifiers from the existing effects and conditions without waiting on programmers [@lechevalier2017-for-honor]. Valve's writers authored dialogue rules directly; Ruskin's framing is that writers should get tools, not spreadsheets of blanks to fill in [@ruskin2012-dynamic-dialog]. Overwatch heroes were almost entirely script, with native code added only for new node types [@reed2017-overwatch-abilities].

**Where to draw the line.** Reed keeps complex loops and expensive work such as raycasts in code, exposed to scripts as nodes [@reed2017-overwatch-abilities]. For Honor found some always-true rules cheaper as code: campaign friendly fire was a modifier on every soldier [@lechevalier2017-for-honor]. The Division shipped a menu system built on global variables that worked but was hacky [@savoie2017-division-ui].

**Keeping data maintainable.**

- Reduce duplication with inheritance in data, such as a `parent` field from which a definition inherits the values it does not set [@nystrom2014-patterns]. For Honor's shared status effects with power levels worked for designers who understood them, and were an extra layer for those who did not [@lechevalier2017-for-honor].
- As more designers used For Honor's modifiers, duplicated definitions and missing naming conventions accumulated. Keeping each modifier in its own file gave it a readable version history [@lechevalier2017-for-honor]. Overwatch's scripts were exclusive-checkout binary assets, and the mitigation for contention was splitting large scripts into smaller ones [@reed2017-overwatch-abilities].
- Export several outputs from one source. On Dota, a writer's spreadsheet produced both the engine's rules and the actors' recording script [@ruskin2012-dynamic-dialog].

**Validate continuously.** On Assassin's Creed Origins, data broke from every direction: content placement, a prop fix reused elsewhere, code changes that moved a legal threshold, procedural placement and build order. Nightly editor scripts ran objective pass/fail checks on placed objects, the AI network and each location's contents against a design-intent spreadsheet. They reported errors in plain language with object ids and links into the editor, a daily summary with changes since the previous day, and a map view [@routhier2018-aco-validation]. Economic invariants deserve the same treatment. In Lucasfilm's Habitat, a pricing error let players buy items from a vending machine, sell them to a pawn shop for more, and repeat [@yan2005-cheating]. A check that no buy-and-sell, craft-and-salvage or trade cycle yields a net gain is cheap to run.

**Iteration and visibility.** In The Division's editor, saving data updated the running game, and holding a key while hovering over any UI element showed which file drew it [@savoie2017-division-ui]. Overwatch's Statescript debugger recorded every entity's history, which could be stepped through from the server's or a client's view [@reed2017-overwatch-abilities]. Budget for the debugger along with the data format.

## Quest and dialogue state

This section covers state and engineering. For structure, choices and writing, see [narrative](narrative.md).

**Facts and rules.** Valve's speech system builds a flat query of facts about the world, the speaker and writer-defined memory each time a character might speak. The matching rule with the most criteria wins, and ties are broken at random, so specific lines override general fallbacks. A response can write facts back to memory, such as that a line has been said, and a fact can expire so the lines of a running gag stay spaced out. A reply is looked up only after the previous line finishes, so a conversation stops by itself when its conditions no longer hold [@ruskin2012-dynamic-dialog]. Firewatch adapted this approach with designer-named events and blackboards of facts. Ordering by requirement count stopped picking the most specific line once facts implied one another, so designers needed a manual priority [@armstrong2017-firewatch-dialog].

**One store for persistent facts.** Keep quest and world facts in one named store with an owner for each fact and a debug view that lists them. The Jedi talk's move from unstructured tracking to a centralized system is the same point at a larger scale [@wilkinson2024-jedi-state]. Where facts constrain each other, write the constraints down as rules and check them on load and in tests, as the Dragon Age Keep's solver did across games [@shinkewski2015-dragon-age-keep].

**Rewards.** Record completion before granting a reward, or key the grant by quest id so that repeating it is harmless. Two triggers firing on the same frame should not pay twice.

**Debugging and coverage.** Firewatch logged every event fired, every requirement checked and every response matched, so a tester's playthrough could be reconstructed from the log. Tracking which lines had played revealed lines no one reached [@armstrong2017-firewatch-dialog].

Checks: reload mid-conversation; complete a quest twice; a missing node; an unreachable branch; every exit of a conversation that sets modal state.

## Where to go deeper

- State ownership, update loops, ECS and automated testing: [architecture](architecture.md).
- Enemy decision-making, perception and navigation: [AI](ai.md).
- Numbers, economies and progression tuning: [balance](balance.md).
- Encounter placement and pacing in levels: [levels](levels.md).
- Engine APIs for input, serialization and file access: the project's code and version-matched official documentation, via [engines](engines.md).

The recommendations above on stable ids, ownership, transfers and pause requests are this skill's own engineering reasoning. Check file, database and concurrency behavior against the platform the game runs on.

## Sources

- `armstrong2017-firewatch-dialog` William Armstrong and Patrick Ewing (2017). Do You Copy? Dialog System and Tools in 'Firewatch'. Game Developers Conference 2017. https://gdcvault.com/play/1024000/Do-You-Copy-Dialog-System (GDC talk)
- `routhier2018-aco-validation` Nicholas Routhier (2018). 'Assassin's Creed Origins': Monitoring and Validation of World Design Data. Game Developers Conference 2018. https://gdcvault.com/play/1025054/-Assassin-s-Creed-Origins (GDC talk)
- `yan2005-cheating` Jeff Yan and Brian Randell (2005). A systematic classification of cheating in online games. Proceedings of the 4th ACM SIGCOMM Workshop on Network and System Support for Games (NetGames '05). https://doi.org/10.1145/1103599.1103606 (peer-reviewed)
- `nystrom2014-patterns` Robert Nystrom (2014). Game Programming Patterns. Genever Benning. https://gameprogrammingpatterns.com/ (book)
- `wilkinson2024-jedi-state` Bobby Wilkinson (2024). Saving the Galaxy: Managing State in 'Star Wars Jedi: Survivor'. Game Developers Conference 2024. https://gdcvault.com/play/1034348/Saving-the-Galaxy-Managing-State (GDC talk)
- `shinkewski2015-dragon-age-keep` Leah Shinkewski (2015). Connecting Players and Franchise: A Compelling Solution to the Cross-Platform Challenge. Game Developers Conference 2015. https://gdcvault.com/play/1021875/Connecting-Players-and-Franchise-A (GDC talk)
- `opengroup2024-rename` The Open Group (2024). rename, renameat — rename file. The Open Group Base Specifications Issue 8 (IEEE Std 1003.1-2024). https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html (official documentation)
- `opengroup2024-fsync` The Open Group (2024). fsync — synchronize changes to a file. The Open Group Base Specifications Issue 8 (IEEE Std 1003.1-2024). https://pubs.opengroup.org/onlinepubs/9799919799/functions/fsync.html (official documentation)
- `reed2017-overwatch-abilities` Dan Reed (2017). Networking Scripted Weapons and Abilities in 'Overwatch'. Game Developers Conference 2017. https://gdcvault.com/play/1024041/Networking-Scripted-Weapons-and-Abilities (GDC talk)
- `lechevalier2017-for-honor` Aurelie Le Chevalier (2017). Modify Everything! Data-Driven Dynamic Gameplay Effects on 'For Honor'. Game Developers Conference 2017. https://gdcvault.com/play/1024050/Modify-Everything-Data-Driven-Dynamic (GDC talk)
- `ford2017-overwatch` Timothy Ford (2017). 'Overwatch' Gameplay Architecture and Netcode. Game Developers Conference 2017. https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and (GDC talk)
- `gregory2018-engine` Jason Gregory (2018). Game Engine Architecture, Third Edition. CRC Press. https://www.gameenginebook.com/ (book)
- `loudy2018-doom` Kurt Loudy and Jake Campbell (2018). Embracing Push Forward Combat in 'DOOM'. Game Developers Conference 2018. https://gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in (GDC talk)
- `sheth2019-god-of-war` Mihir Sheth (2019). Evolving Combat in 'God of War' for a New Perspective. Game Developers Conference 2019. https://gdcvault.com/play/1026085/Evolving-Combat-in-God-of (GDC talk)
- `mejerwall2025-adventure-director` Marie Mejerwall (2025). Game AI Summit: Growing an AI Director into a Full Adventure Director. Game Developers Conference 2025. https://gdcvault.com/play/1035589/Game-AI-Summit-Growing-an (GDC talk)
- `bohn2023-ragnarok-ui` Zach Bohn (2023). 'God of War Ragnarok': Building the UI for a AAA Sequel. Game Developers Conference 2023. https://gdcvault.com/play/1029143/-God-of-War-Ragnarok (GDC talk)
- `savoie2017-division-ui` Christian Savoie (2017). Lessons Learned Creating UI for 'The Division'. Game Developers Conference 2017. https://gdcvault.com/play/1024026/Lessons-Learned-Creating-UI-for (GDC talk)
- `ruskin2012-dynamic-dialog` Elan Ruskin (2012). AI-driven Dynamic Dialog through Fuzzy Pattern Matching. Empower Your Writers!. Game Developers Conference 2012. https://gdcvault.com/play/1015317/AI-driven-Dynamic-Dialog-through (GDC talk)
