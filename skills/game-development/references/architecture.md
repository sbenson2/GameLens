# Architecture and programming patterns

Read this when a change touches who owns game state, how a frame is ordered, whether to adopt a pattern or framework (state machines, events, components, ECS, pools), how content is authored as data, whether the simulation must be deterministic, or how to test and profile the game. Engine-specific lifecycle rules live in [engines.md](engines.md); networked games also need [multiplayer.md](multiplayer.md).

Start from the feature, not the pattern. Trace the authoritative state, who may change it, what outlives a level or session, and how changes reach presentation and saves. Keep an established design unless the requested behavior exposes a concrete problem with it.

## Structure is a bet on future change

Nystrom's framing is the useful default: every abstraction or extension point speculates that you will need that flexibility later. It adds code, indirection, debugging time and often runtime cost, and when the guess is wrong it makes the codebase harder to work in [@nystrom2014-patterns]. Flexibility and performance also pull against each other; Nystrom finds it easier to make a fun game fast than a fast game fun, and suggests keeping code flexible while the design moves, then removing abstraction where profiling says it costs too much [@nystrom2014-patterns]. Throwaway prototype code is legitimate only if the team can actually throw it away.

Diagnostic questions before adding structure:

- Which specific change should this make cheaper? If nobody can name one, write the direct version.
- Who reads the code afterwards, and can they find where behavior actually happens?
- What does the alternative cost in files, indirection and per-frame work?

## State ownership and lifetimes

- Give each piece of mutable state one authoritative owner. UI may request changes and display results; a UI copy of gameplay data must not silently become a second authority.
- Separate reusable definitions (item type, attack configuration) from per-instance state (quantity, cooldown, health). Moving "kinds" into data objects makes variation cheap, but behavior per kind becomes harder to express and the program, not the compiler, now tracks those definitions' lifetimes [@nystrom2014-patterns]. Shared definition assets need an explicit policy for runtime mutation; see engines.md for how Godot and Unity share them.
- Define lifetimes: frame, encounter, level, run, profile, install. Clear run state on restart and keep only what the design intends to persist.
- Treat globals as a cost. Global state makes code harder to reason about and encourages coupling, and lazy initialization of a global service hands control of expensive setup to whichever call happens first, which can land mid-combat as a stutter [@nystrom2014-patterns]. A global service is justified by lifetime and access needs, not by convenience.
- On Overwatch, state that lived inside systems and was reached through global accessors caused compile-time coupling and broke when the kill cam needed a second simulation world; the team moved it into "singleton components" owned by the world, and about 40% of component types ended up that way [@ford2017-overwatch]. State with an explicit owner is easier to duplicate, reset and inspect.

Red flags in code review: a UI script writing gameplay values directly; a static or autoload holding run state that survives "restart run"; a definition asset mutated at runtime so one enemy's change hits every enemy; save code reading from view objects; two systems each "fixing up" the same value every frame.

## The loop, the timestep and update order

With an engine, the engine owns the loop and calls your code; with a library, you own it [@nystrom2014-patterns]. A project built on an engine therefore works inside the engine's phases (engines.md) rather than writing its own loop, but the same questions apply.

**Timestep.**

- Scaling every update by elapsed real time keeps the game at the same speed on all hardware, but Nystrom shows it also makes results depend on frame rate: floating-point error accumulates differently over more, smaller steps, and physics damping tuned for one step size becomes unstable at others [@nystrom2014-patterns].
- The common alternative runs the simulation in fixed steps consumed from an accumulator, renders whenever there is time, and hands the leftover fraction of a step to rendering so it can draw objects between steps; the fixed step must stay longer than one update's cost on the slowest target hardware [@nystrom2014-patterns]. Overwatch converts render-frame time into fixed 16 ms command frames this way [@ford2017-overwatch].
- The step size can matter for gameplay, not only stability. Rocket League runs physics at a fixed 120 Hz because larger steps changed how far a car penetrated the ball and therefore the direction of a hit; the speaker adds that the rate made everything more expensive and was chosen under time pressure [@cone2018-rocket-league].
- Even turn-based games keep animation and audio running while game state waits for the player [@nystrom2014-patterns].

**Update order.**

- In a sequential update, an object updated early has already changed when a later object reads it, so behavior can depend on list order. Spawning or removing objects during the loop also needs a rule about whether a new object acts in the frame it was created [@nystrom2014-patterns].
- Gregory describes the standard responses: phase updates around engine subsystems (before animation, after animation, after physics), bucket objects so that what others depend on updates first, and watch for the "one frame off" inconsistency when some objects hold the new frame's state and others the old, which caching or time-stamping each object's previous state can address [@gregory2018-engine].
- Overwatch deferred complex side effects into queues resolved at one fixed point in the frame. It switched from deferred to immediate entity creation after ship because deferral caused off-by-one-frame bugs, and it avoided double-buffering game state because reading last frame's state added a frame of delay that hurt responsiveness [@ford2017-overwatch].

Checks: write down the order where results depend on it (input capture, simulation, collision resolution, events, presentation interpolation). Reverse the order of two interacting objects in a test and see whether the outcome changes. If one fixed step costs more than it simulates, frame time spirals: Ford describes a slow frame forcing two steps into the next frame, which forces three into the one after [@ford2017-overwatch].

## When patterns pay for themselves

| Pattern | Useful when | Cost and simpler option |
| --- | --- | --- |
| Finite state machine | Behavior depends on internal state that divides into a few distinct modes, and the entity responds to a sequence of inputs over time [@nystrom2014-patterns] | An enum and switch is enough until a state needs data and code of its own; state classes add indirection. Parallel concerns may need separate machines, and Nystrom notes complex AI has moved toward behavior trees and planners [@nystrom2014-patterns]. |
| Command | Actions need undo and redo, remappable input, queuing or replay, or one interface shared by players and AI [@nystrom2014-patterns] | A direct method call when none of those needs exists. Undo needs command instances bound to a target plus recoverable prior state, not just an execute method [@nystrom2014-patterns]. |
| Observer, signals, events | Largely unrelated domains need to react to each other, such as physics and achievements [@nystrom2014-patterns] | Notification is synchronous, so a slow listener blocks the sender; forgotten unregistration leaks listeners even in garbage-collected languages; call paths exist only at runtime. If you must read both sides to understand a feature, use an explicit call [@nystrom2014-patterns]. |
| Event queue | Sender and receiver must be decoupled in time | A central queue is global state; the world may have changed before an event is handled, so capture needed data when sending; queued cycles fail quietly, so avoid sending events from inside handlers [@nystrom2014-patterns]. |
| Components | One class spans several domains, has grown unmanageable, or objects need capabilities that inheritance cannot mix [@nystrom2014-patterns] | Each object becomes several objects to create and wire, components must communicate, and access adds indirection [@nystrom2014-patterns]. Prefer coherent components over many tiny wrappers. |
| ECS and data-oriented storage | See the next section | Migration and tooling cost can exceed the gain; name the scaling or coupling problem first. |
| Object pool | Objects of similar size are created and destroyed often and allocation is measured to be slow or fragmenting [@nystrom2014-patterns] | Pool size needs tuning and an exhaustion policy (prevent, skip the new object, or evict an old one), and reused objects are not cleared automatically, so initialization must reset everything [@nystrom2014-patterns]. |
| Spatial partition | Many positioned objects, and location queries are the measured bottleneck [@nystrom2014-patterns] | Small populations may not benefit; moving objects must be re-filed, which costs code and CPU; the structure costs memory [@nystrom2014-patterns]. |
| Data-driven definitions | Designers need to add or tune many related kinds without code changes [@nystrom2014-patterns] | See "Data-driven design". Avoid inventing a general rule language before the content needs it. |

## ECS and data-oriented design

Keep two goals apart: organizing gameplay code, and laying out memory for speed.

- **Organizing code.** Overwatch adopted strict rules: components hold state and no behavior, systems hold behavior and no state, shared utility functions called from many places should read little and cause few side effects, and a behavior's major side effects should sit in one call site, which Ford calls the talk's main lesson [@ford2017-overwatch]. The rules took about 1.5 years to settle; old code that did not follow them remained a main source of bugs; and Ford advises wrapping legacy subsystems in a proxy component rather than forcing them into ECS [@ford2017-overwatch].
- **Memory layout.** Nystrom's data-locality guidance is to apply it only when you have a performance problem that a profiler attributes to cache misses, because arranging data for the cache means giving up interfaces and inheritance [@nystrom2014-patterns]. Remedy moved Alan Wake 2's gameplay code to a data-oriented ECS and cites cache coherency and multithreading among the gains [@balakshin2024-ecs].
- **Concurrency.** Bungie restructured Destiny's engine into jobs linked by explicit dependencies, with debug-only checks that flagged any two jobs that could run at once with conflicting data access; conflicts were fixed by adding a dependency, double-buffering, queuing writes or restructuring [@genova2015-destiny-threading]. Velan's Knockout City entity system was built for deterministic parallel updates and rewinding world state within a time window, which also served client-side prediction [@mcevoy2022-knockout-city].

This skill's default for most small and mid-sized games is the engine's own node or actor model with plain composition. Evidence to collect before migrating: a profile showing per-entity update cost or cache misses dominating the frame, or a concrete coupling problem that the current structure keeps reproducing.

## Data-driven design

- On For Honor, one generic modifier system combined a handful of programmer-written effect types with designer-authored conditions and durations, so designers built status effects, feats, gear and boss behavior in data [@lechevalier2017-for-honor].
- The same talk lists what followed: duplicated data and no naming standards once many designers used it, stacking that needed per-stat limits and an explicit ordering of sources, an always-on debug display that became essential, and no unit tests [@lechevalier2017-for-honor].
- On Assassin's Creed Origins, nightly scripts checked placed world data (zipline clearance, spawners on navmesh, reachable AI schedules, location contents against a design-intent sheet) and delivered results as editor links and daily per-team deltas [@routhier2018-aco-validation].

Minimum for data the game depends on: a schema and validation that runs before the build does, stable IDs that survive renames, checked references, a version field with migration for saved data, a stated rule for combining values from several sources, and a debug view showing which data is active and why.

## Determinism and replays

Determinism is a requirement only for some features: lockstep or rollback netcode, input-replay testing, replays and kill cams, reproducible bug reports. Do not impose it on a game that needs none of these.

- Brian Provinciano recorded only input in Retro City Rampage and replayed sessions for automated playthroughs, bug reproduction and leaderboard replays. The threats to determinism the talk names are uninitialized variables, one random generator shared across purposes, engine callbacks, middleware, per-frame accumulation, asynchronous file loads and floating-point differences on PC; Provinciano used separate random streams, per-frame checksums of entity state, and diffed logs of recording versus playback [@provinciano2015-replays].
- Asked in Q&A, Media Molecule's Phillips estimated that about half of its out-of-sync failures came from uninitialized variables, and said that staying deterministic takes continuing effort [@phillips2018-bug-tools].
- For Honor found that any state kept outside its rewindable history buffers caused desyncs; Intel and AMD processors initially gave different results, which the engine team fixed, and the deterministic engine was one reason the speakers gave for having no cross-platform play [@doll2017-for-honor-ai]. Overwatch settled for "deterministic enough", using quantization and smoothing rather than strict lockstep [@ford2017-overwatch].
- In Spelunky 2, a desync that could not be reproduced for about a month was fixed within hours once the team had a replay of it: the random-number helper skipped advancing its state when the minimum equalled the maximum, a harmless shortcut in single-player code that broke online synchronization [@garciaromero2021-spelunky2].

Check: record a session, replay it twice on each target platform and build configuration, and compare per-frame checksums.

## Tools and iteration speed

Measure the loops people wait on: code build, data build, editor start, edit-to-see-in-game, and deploy to device.

- For Far Cry 4, Ubisoft Montreal cut an editor rebuild from about 40 to about 4 minutes with distributed, cached builds, and the nightly data build from about 6 hours for three platforms to about 1.5 hours for five, largely by profiling the distributed pipeline and caching results so that work was not repeated [@quenin2015-iteration].
- Niklas Gray recalls runtime features that took a day while their tooling took one to two weeks, and argues for an editor data model that gives every feature undo, copy and paste and serialization without extra code. Gray names its costs: complexity, risk to saved projects, and poor fit for large blobs [@gray2020-tools].
- Vicarious Visions' tool guidelines, drawn from observation rather than measurement, include making tools easy to use correctly and hard to use incorrectly, presenting data in the user's terms, and error messages that say how to fix the problem [@stewart2018-tools-workflow].
- Nystrom's shortest version: a level editor without undo is the surest way to make designers hate you [@nystrom2014-patterns].

For an agent-assisted workflow the same logic applies to scripts: a one-command check that reproduces a bug or validates data is a tool, and it pays back each time the loop repeats.

## Performance, profiling and budgets

A frame-rate target is a product decision set by platform, genre and audience, not a universal rule. Shadow of War targeted 30 fps on console and 60 on PC [@mintus2018-shadow-of-war]; Call of Duty's nightly captures report the share of time at its 60 fps target [@vanvalburg2018-cod-testing]. In a user study with more than 25 participants and a purpose-built game, frame rate affected shooting and navigation performance much more than resolution did [@claypool2009-frame-rate]; treat that as evidence for protecting frame rate when trading against resolution, not as a threshold.

- **Budget early and per system.** Content growth left Shadow of War near 90 ms per frame against a 33 ms target about a year before ship; recovery took per-system CPU budgets, pipelining, runtime fallbacks such as dynamic resolution and pushing out character detail, and texture streaming [@mintus2018-shadow-of-war].
- **Automate captures.** Call of Duty records performance and memory per build as graphs linked to changelists and captures fixed map locations nightly [@vanvalburg2018-cod-testing].
- **Profile before restructuring.** Optimizations add complexity and remove flexibility, so confirm the cause first [@nystrom2014-patterns].
- **Spread latency-tolerant work.** Pathfinding and similar deliberation can run in a fixed slice per frame, accepting later results in exchange for a stable frame; reactive systems cannot [@sunshinehill2017-timeslice].

Evidence to collect: a capture on the lowest target hardware in the heaviest representative scene, before and after the change, with the same camera path.

## Automated testing

The research and the practitioner record point in different directions, and the conditions explain why.

- A survey of the academic and grey literature found game teams relying almost entirely on manual play-testing [@politowski2021-testing]. In interviews, developers who had worked on both games and other software said automated tests go stale because game designs keep changing [@murphyhill2014-cowboys].
- Rare's Sea of Thieves shows conditions under which automation paid off: a live-service game with frequent releases; tests written after a feature worked, with prototypes kept on an untested branch; most tests at the level of a minimal ticked world rather than full maps; tests that poll for a condition instead of waiting a fixed number of frames; and explicit handling of flaky tests. Rare reports build verification falling from about two weeks on its earlier Kinect Sports Rivals to about a day and a half [@masella2019-sea-of-thieves].
- Activision automates the repetitive checks and leaves playthroughs and exploratory testing to people [@vanvalburg2018-cod-testing].

Useful invariants at state boundaries: an invalid action leaves state unchanged; restarting clears transient state; save then load preserves exactly the intended state; disposed listeners do not fire; repeating a command does not duplicate rewards; a recorded replay produces the same checksums. A passing headless test does not show that the game feels right; see evaluation.md.

## Make the change reviewable

For a meaningful architecture decision, state the problem it solves, who owns the state, the dependency direction, and what the simpler alternative would cost. An inventory might have an item-definition catalog, a run-owned inventory model, a view and a persistence boundary; it does not need four frameworks. Performance claims need before-and-after measurements on a representative workload.

## Sources

- `nystrom2014-patterns` Robert Nystrom (2014). Game Programming Patterns. Genever Benning. https://gameprogrammingpatterns.com/ (book)
- `ford2017-overwatch` Timothy Ford (2017). 'Overwatch' Gameplay Architecture and Netcode. Game Developers Conference 2017. https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and (GDC talk)
- `cone2018-rocket-league` Jared Cone (2018). It IS Rocket Science! The Physics of 'Rocket League' Detailed. Game Developers Conference 2018. https://gdcvault.com/play/1024972/It-IS-Rocket-Science-The (GDC talk)
- `gregory2018-engine` Jason Gregory (2018). Game Engine Architecture, Third Edition. CRC Press. https://www.gameenginebook.com/ (book)
- `balakshin2024-ecs` Alexander Balakshin (2024). ECS in Practice: The Case Board of 'Alan Wake 2'. Game Developers Conference 2024. https://gdcvault.com/play/1034295/ECS-in-Practice-The-Case (GDC talk)
- `genova2015-destiny-threading` Barry Genova (2015). Multithreading the Entire Destiny Engine. Game Developers Conference 2015. https://gdcvault.com/play/1022164/Multithreading-the-Entire-Destiny (GDC talk)
- `mcevoy2022-knockout-city` Chris McEvoy (2022). 'Knockout City's' Parallel, Deterministic, and Rewindable Entity System. Game Developers Conference 2022. https://gdcvault.com/play/1027634/-Knockout-City-s-Parallel (GDC talk)
- `lechevalier2017-for-honor` Aurelie Le Chevalier (2017). Modify Everything! Data-Driven Dynamic Gameplay Effects on 'For Honor'. Game Developers Conference 2017. https://gdcvault.com/play/1024050/Modify-Everything-Data-Driven-Dynamic (GDC talk)
- `routhier2018-aco-validation` Nicholas Routhier (2018). 'Assassin's Creed Origins': Monitoring and Validation of World Design Data. Game Developers Conference 2018. https://gdcvault.com/play/1025054/-Assassin-s-Creed-Origins (GDC talk)
- `provinciano2015-replays` Brian Provinciano (2015). Automated Testing and Instant Replays in Retro City Rampage. Game Developers Conference 2015. https://gdcvault.com/play/1021825/Automated-Testing-and-Instant-Replays (GDC talk)
- `phillips2018-bug-tools` Amy Phillips (2018). Tools Tutorial Day: Tools to Reduce Open Bug Count at Media Molecule. Game Developers Conference 2018. https://gdcvault.com/play/1025013/Tools-Tutorial-Day-Tools-to (GDC talk)
- `doll2017-for-honor-ai` Frederic Doll and Xavier Guilbeault (2017). Deterministic vs. Replicated AI: Building the Battlefield of 'For Honor'. Game Developers Conference 2017. https://gdcvault.com/play/1024035/Deterministic-vs-Replicated-AI-Building (GDC talk)
- `garciaromero2021-spelunky2` Guillermo García Romero (2021). Breaking the Ankh: Deterministic Propagation Netcode in 'Spelunky 2'. Game Developers Conference 2021. https://gdcvault.com/play/1027119/Breaking-the-Ankh-Deterministic-Propagation (GDC talk)
- `quenin2015-iteration` Remi Quenin (2015). Fast Iteration for Far Cry 4 - Optimizing Key Parts of the Dunia Pipeline. Game Developers Conference 2015. https://gdcvault.com/play/1021975/Fast-Iteration-for-Far-Cry (GDC talk)
- `gray2020-tools` Niklas Gray (2020). Tools Summit: Writing Tools Faster: Design Decisions to Accelerate Tool Development. Game Developers Conference 2020. https://gdcvault.com/play/1026597/Tools-Summit-Writing-Tools-Faster (GDC talk)
- `stewart2018-tools-workflow` Jeff Stewart (2018). Build Great Tools: Workflow Guidelines from Vicarious Visions. Game Developers Conference 2018. https://gdcvault.com/play/1025074/Build-Great-Tools-Workflow-Guidelines (GDC talk)
- `mintus2018-shadow-of-war` Piotr Mintus (2018). Performance and Memory Postmortem for 'Middle-earth: Shadow of War'. Game Developers Conference 2018. https://gdcvault.com/play/1025209/Performance-and-Memory-Postmortem-for (GDC talk)
- `vanvalburg2018-cod-testing` Jan van Valburg (2018). Automated Testing and Profiling for 'Call of Duty'. Game Developers Conference 2018. https://gdcvault.com/play/1025064/Automated-Testing-and-Profiling-for (GDC talk)
- `claypool2009-frame-rate` Mark Claypool and Kajal Claypool (2009). Perspectives, frame rates and resolutions: it's all in the game. Proceedings of the 4th International Conference on Foundations of Digital Games (FDG 2009). https://doi.org/10.1145/1536513.1536530 (peer-reviewed)
- `sunshinehill2017-timeslice` Ben Sunshine-Hill (2017). Beyond Framerate: Taming Your Timeslice Through Asynchrony. Game Developers Conference 2017. https://gdcvault.com/play/1024202/Beyond-Framerate-Taming-Your-Timeslice (GDC talk)
- `politowski2021-testing` Cristiano Politowski et al. (2021). A Survey of Video Game Testing. 2021 IEEE/ACM International Conference on Automation of Software Test (AST). https://doi.org/10.1109/ast52587.2021.00018 (peer-reviewed)
- `murphyhill2014-cowboys` Emerson Murphy-Hill et al. (2014). Cowboys, ankle sprains, and keepers of quality: how is video game development different from software development?. Proceedings of the 36th International Conference on Software Engineering (ICSE 2014). https://doi.org/10.1145/2568225.2568226 (peer-reviewed)
- `masella2019-sea-of-thieves` Robert Masella (2019). Automated Testing of Gameplay Features in 'Sea of Thieves'. Game Developers Conference 2019. https://gdcvault.com/play/1026042/Automated-Testing-of-Gameplay-Features (GDC talk)
