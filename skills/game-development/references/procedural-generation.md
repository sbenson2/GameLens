# Procedural generation

Read this when a project generates levels, maps, items, encounters or other content with code: deciding whether to generate at all, choosing a representation, making results reproducible, proving generated content is playable, and judging a generator as a whole. Room-by-room level craft is in [levels](levels.md), tuning numbers in [balance](balance.md), runtime spawning and save data in [systems](systems.md), and agent behavior in [ai](ai.md).

A generator is a design tool that produces a space of possible content, not one level. In this skill's view, many of the failures below come from judging a few outputs by eye instead of the space, or from leaving to chance something the design needed to control.

## Does generation serve this design?

Start from what the player should experience, then ask what generation buys.

| Reason to generate | Practitioner or research evidence |
| --- | --- |
| The design needs spaces the player cannot memorize | On Eldritch, Pittman generated levels because the roguelike structure asks players to learn systems, not layouts [@pittman2015-eldritch]. |
| Scope: too little time or art budget for hand-built content | Pittman, working alone, could not have hand-built hours of levels [@pittman2015-eldritch]; Firaxis's first goal on XCOM 2 was removing environment art as the bottleneck on map count [@hess2018-xcom2-plot-parcel]. |
| Map repetition is burning players out | XCOM: Enemy Unknown players met the same maps across campaigns; XCOM 2's goal was never seeing a map twice [@hess2018-xcom2-plot-parcel]. |
| Content reuse | Every module Pittman built went into the shared pool and showed up throughout the game [@pittman2015-eldritch]. |
| Adaptive or endless content, or design assistance | The PCG textbook lists these alongside cost reduction, with tailoring to players as a research direction rather than common practice [@shaker2016-pcg]. |

Generation has costs that the same sources report:

- **Identity and storytelling.** On XCOM 2, letting any mission run on any plot type made places generic; the fix was pairing plot types with specific missions, and Hess says the game was better for it. Environment artists felt they lost control, cinematics had to cope with framing that changed every run, and smaller map chunks held less visual storytelling. Hess resolved to be more careful about what to leave to chance, and framed the choice as a scale from replayability to character [@hess2018-xcom2-plot-parcel].
- **Design is still required.** Pittman argues a programmer without a sense of what makes a good level cannot write a good level generator, because they cannot evaluate its output [@pittman2015-eldritch]. Backus's chapter describes treating generation as a replacement for content design, not just content creation, as a common beginner pitfall [@short2017-pcgdesign].
- **Perceived sameness.** Output can be mathematically unique yet feel identical; Compton calls this the "10,000 bowls of oatmeal" problem and separates background content that only needs to look different from content that must carry character [@compton2017-practical-pcg].
- **Long tuning tail.** Grey's chapter notes that tuning of procedural systems can continue after release and small changes ripple through the whole experience; it names quilted generation from premade blocks as an approach that tends to pass what it calls a quality assurance test [@short2017-pcgdesign].

### Hybrids of generation and authoring

In this skill's view, the useful decision is usually not whether to generate but which parts to author and which to generate; each example below mixes the two.

| Pattern | Example | Fits when |
| --- | --- | --- |
| Hand-made blocks stitched by a generator | Spelunky's room templates on a 4x4 grid [@yu2011-spelunky]; XCOM 2 parcels in plots [@hess2018-xcom2-plot-parcel] | Local quality matters and blocks can be designed to connect |
| Prescribed special rooms, generated filler | Eldritch places shops and exits before the maze grows [@pittman2015-eldritch] | A few spaces must exist every run |
| Generated lead-up, authored set piece | XCOM 2 story missions end in one static parcel with cinematics and voice [@hess2018-xcom2-plot-parcel] | Narrative beats need control |
| Designer draws the flow, generator fills rooms | A team on the PCG Shotgun panel had designers sketch map flow and entrances first [@coleman2017-pcg-shotgun] | Level flow is the design's core; room contents are texture |
| Handcrafted zones inside generated play | Shepard's Dungeonmans chapter [@short2017-pcgdesign] | Variety and guidance both matter |
| Offline generation, human editing | Generation during development instead of at runtime [@togelius2011-sbpcg] | Output needs polish or certification |

Diagnostic questions:

- Which content is *necessary* (the player must traverse or defeat it) and which is *optional* (they can ignore it)? Necessary content must always be correct; optional content may occasionally fail if the fiction allows it [@togelius2011-sbpcg].
- What should a player notice differs between runs, and what should stay recognizable?
- Who judges output quality today, and how would they judge a thousand outputs?

## Representation and constraints

The PCG textbook describes a typical dungeon generator as three parts: an abstract model of the dungeon, a method that builds that model, and a method that turns it into geometry [@shaker2016-pcg]. In this skill's view, the same split applies to most generated content, and choosing the abstract model is the main design decision, because it decides which properties are easy to guarantee.

| Representation | Good at | Weak at |
| --- | --- | --- |
| Grid of rooms plus a guaranteed path, filled from templates | Traversal guarantees, authored local quality [@yu2011-spelunky] | Variety beyond the template library |
| Maze or graph over modules | Loops, branching, tunable openness; Eldritch knocked out extra walls to add loops [@pittman2015-eldritch] | Believable architecture; rooms that climb between floors were Eldritch's weakest [@pittman2015-eldritch] |
| Mission graph mapped onto space | Lock-and-key order and pacing; generating the task graph first, then space to fit it [@dormans2010-adventures] | Added loops can short-circuit the mission [@dormans2010-adventures]; implementation effort |
| Cellular automata | Organic caves; on Galak-Z good for fixed-size rooms, hard to control and populate at whole-level scale [@aikman2015-galak-z] | Guaranteed connectivity, placement of objectives |
| Example-driven tiles (WaveFunctionCollapse) | Matching the local style of a small drawn sample [@bucklew2019-qud-wfc] | Large-scale structure; homogeneous or overfitted output [@bucklew2019-qud-wfc] |
| Abstract-to-concrete pipeline | Coherent worlds: Caves of Qud generates a village's history, then culture, layout and objects in later steps [@bucklew2019-qud-villages] | Debugging across many stages |
| Parameter vector | Designer control and search | Indirect encodings can leave parts of the content space unreachable, with no simple way to detect it [@togelius2011-sbpcg] |

Uncited cells are the skill's reasoning.

Where a constraint lives determines its cost:

1. **By construction.** Only perform steps that cannot produce broken content [@togelius2011-sbpcg]. Spelunky draws the entrance-to-exit path first and picks room templates that respect it [@yu2011-spelunky]. Eldritch reserves an always-open region on every connecting module face so any two modules join traversably [@pittman2015-eldritch].
2. **By test.** Generate, check (for example, a path from entrance to exit), and regenerate on failure [@togelius2011-sbpcg]. Galak-Z discards layouts without enough dead ends for objectives, which was cheap because layout generation is fast [@aikman2015-galak-z]. Compton warns that a strict test with a loose generator can loop forever, and prefers ranking candidates to throwing them away [@compton2017-practical-pcg].
3. **By solver.** Declare what valid content is and let a solver find it; answer set programming can state reachability as a recursive constraint [@shaker2016-pcg]. WaveFunctionCollapse is itself a constraint solver that restarts rather than backtracks. When Karth and Smith added a global constraint, a restart-only solver found no solution within a one-minute limit in one of their test scenarios while backtracking solved it quickly, and they expect constraints such as reachability to need a mix of backtracking and restarts [@karth2017-wfc]. Compton advises using an existing solver rather than writing one [@compton2017-practical-pcg].

Constraints trade against variety. XCOM 2 added building facings, driveways and zones for believability; each cut how many parcels could fill a slot, and parcels with too many requirements rarely appeared at all [@hess2018-xcom2-plot-parcel]. When a generator feels samey, count how many candidates survive each constraint before adding content.

If you plan to search over content, the representation needs locality: small changes to the encoding should make small changes to the result. Searching over raw seeds is no better than random search, because neighboring seeds give unrelated output [@togelius2011-sbpcg].

## Seeds and reproducibility

A seed reproduces content only if everything else that feeds the generator is also the same. The platform may not promise that:

- Python documents that a reused seed reproduces the sequence from run to run as long as multiple threads are not running, and that most of its random algorithms and seeding functions may change across versions [@psf2026-python-random].
- .NET does not guarantee that `System.Random` produces the same sequence for a seed across major versions, and its instances are not thread safe [@microsoft2026-dotnet-random].

The same seed can also diverge after a change to generator code, content tables or the order of random calls. This is the skill's reasoning from how seeded pseudo-random streams work, and it explains why a "saved seed" can stop reproducing a bug.

Practices from shipped games:

- Caves of Qud draws every random call from a world seed, so the team can rebuild a zone from a player's save and see the same output [@bucklew2019-qud-villages].
- On Spore, Compton saved the seeds of generated planets that looked good and reused them, a whitelist that was faster than fixing the generator [@compton2017-practical-pcg].
- On Galak-Z, storing seeds and regenerating caves at runtime cost more processing than it saved in storage; the team stored run-length-encoded output instead [@coleman2017-pcg-shotgun].
- A panel segment described seeds as player-facing features: typed in, derived from positions or user IDs, shared between players, or split into sub-seeds that each control one part of a level [@coleman2017-pcg-shotgun].
- Search-based generators usually cannot reproduce a result except by saving it [@togelius2011-sbpcg].

Minimum record for a reproducible generated artifact (the skill's recommendation): seed, generator version or build id, content-data version, input parameters, and the platform RNG if it is not your own. Store it in bug reports and save files. When the generator changes, either version it and keep the old path for old saves, or store the generated output instead of the seed.

Red flags: one global RNG shared by generation, gameplay and cosmetic effects, so an extra particle burst changes the level; generation on several threads drawing from one stream; seeds derived from wall-clock time with nothing logged.

## Proving generated content is playable

Looking plausible is not the requirement. A generated level must be finishable, a generated staircase climbable [@shaker2016-pcg]. A dungeon with no exit is a catastrophic failure; a slightly odd flower is not [@shaker2016-pcg].

Guarantees that shipped games built in:

- Caves of Qud finds disconnected regions after WaveFunctionCollapse runs and paths between them, placing a door wherever the path crosses a wall [@bucklew2019-qud-wfc].
- Eldritch seeds required rooms into the maze before it grows and locks their walls, rather than searching a finished maze for somewhere they fit [@pittman2015-eldritch].
- Dormans's generator ties each key to the tests before it so keys land behind them [@dormans2010-adventures].
- Launchpad lays platform geometry from a model of player movement, so its levels are playable by construction [@smith2010-expressive].

Checks to run on output:

| Check | How | Source |
| --- | --- | --- |
| Reachability | Path search from start to every required objective, key and exit, using the player's actual movement rules and items | [@togelius2011-sbpcg; @shaker2016-pcg] |
| Order constraints | Every lock's key reachable without passing that lock | Mission and space model [@dormans2010-adventures] |
| Simulated play | An agent plays the content; measure completion, time, damage | Simulation-based evaluation [@togelius2011-sbpcg] |
| Resource sufficiency | Required items and currency exist before the gates that need them | Skill's reasoning; test like reachability |
| Missing pieces | Assert when no module or tile fits a slot; crash in test builds | Darkest Dungeon 2 [@fox2025-darkest-dungeon-2] |
| Cost | Performance captures on the same generated content every build | No Man's Sky smoke tests [@mckendrick2017-no-mans-sky] |

On Darkest Dungeon 2, with a two-person QA team, every internal test run generated a new random biome and deliberately crashed when a needed tile was missing, recording enough to reproduce it; the team reports launching early access without generation bugs [@fox2025-darkest-dungeon-2]. The transferable part is making the whole team's play sessions a generation test with reproducible failures.

Batch runs find what single runs hide. Pittman generated 10,000 mazes to count how often each room configuration occurred and built more module variants for common ones [@pittman2015-eldritch]. XCOM 2's team built a quick-launch tool that loaded a plot and let testers swap in any eligible parcel, instead of reloading until the parcel appeared [@hess2018-xcom2-plot-parcel].

Suggested harness (reasoning, adapt to the engine): a headless command that generates N seeds, runs the checks above, writes failing seeds with generator version to a file, and exits non-zero. Keep failing seeds as regression cases. Run it in CI when generator code or content tables change.

## Evaluating the generator, not a level

Hand-picked screenshots say little about a generator. The textbook's example: five impressive levels found among fifty you ignored or regenerated tell you little about what the generator usually produces [@shaker2016-pcg].

Expressive range analysis [@smith2010-expressive]:

1. Choose metrics of emergent properties (for platformer levels, linearity and leniency). Avoid metrics that restate input parameters, which can only confirm what you asked for [@smith2010-expressive; @shaker2016-pcg].
2. Generate a large sample; Smith and Whitehead used 10,000 levels. The textbook suggests increasing sample size until the plots stop changing [@shaker2016-pcg].
3. Plot 2D histograms of metric pairs and look for peaks, holes and biases.
4. Repeat across parameter settings to see what each control changes.

In the original study, the analysis showed a bias toward linear levels, which the authors attribute to a small late change to Launchpad (raising the chance of repeating a component) and say they would not have noticed without it [@smith2010-expressive]. Treat any "small tweak" to a generator as a change to the whole distribution, and rerun the analysis.

Expressive range metrics describe the output, not the player's experience. Pair them with player evidence: behavior in play (for example, players stuck in one spot) and questionnaires, where the textbook recommends asking players to rank content rather than rate it [@shaker2016-pcg]. For player-test methods see [evaluation](evaluation.md).

Perceived variety is its own test; one way (the skill's suggestion) is to show testers pairs of outputs and ask whether they seem different. Compton separates background content that only needs to avoid looking cloned, content that should be perceptibly different, and content with enough character that someone would write fan fiction about it. Compton also recommends letting players claim and share what they find [@compton2017-practical-pcg].

## Common failure cases

| Symptom | Likely cause | First check |
| --- | --- | --- |
| Objective unreachable, start blocked | Connectivity assumed, not checked | Reachability test over many seeds; connect regions as Caves of Qud does [@bucklew2019-qud-wfc] |
| Key behind its own lock | Mission order not modeled | Separate mission graph or order check [@dormans2010-adventures] |
| Generator hangs on some seeds | Generate-and-test with a test it rarely passes | Attempt cap with fallback; rank instead of reject [@compton2017-practical-pcg] |
| Required room missing on some seeds | Special rooms placed after layout | Prescribe them before generation [@pittman2015-eldritch] |
| Levels feel samey despite unique seeds | Variety below perception, or constraints too tight | Count candidates surviving each constraint (XCOM 2's believability constraints cut the parcels eligible per slot [@hess2018-xcom2-plot-parcel]); perception test [@compton2017-practical-pcg] |
| Output noisy, incoherent | No higher-level structure | Dominant theme per level (Eldritch) or segmentation first (Caves of Qud) [@pittman2015-eldritch; @bucklew2019-qud-wfc] |
| Saved seed no longer reproduces a bug | Generator, data or RNG changed | Version record; platform RNG guarantees [@psf2026-python-random; @microsoft2026-dotnet-random] |
| Some seeds run far slower | Output cost varies across the space | Fixed performance seed set per build [@mckendrick2017-no-mans-sky] |
| Unexpected bias after a small change | Emergent distribution shift | Rerun expressive range [@smith2010-expressive] |
| Art or story beats undermined | Generated where authored content was needed | Hybrid pattern from the table above [@hess2018-xcom2-plot-parcel] |

## What to report to the developer

When advising on a generator, state: which content is necessary and must be guaranteed; where each guarantee lives (construction, test or solver); what the reproducibility record contains; which batch checks run and on how many seeds; and which metrics and player tests judge the space. Mark anything not yet measured as a hypothesis to test.

## Sources

- `pittman2015-eldritch` David Pittman (2015). Level Design in a Day: Procedural Level Design in Eldritch. Game Developers Conference 2015. https://gdcvault.com/play/1022110/Level-Design-in-a-Day (GDC talk)
- `hess2018-xcom2-plot-parcel` Brian Hess (2018). Plot and Parcel: Procedural Level Design in 'XCom 2'. Game Developers Conference 2018. https://gdcvault.com/play/1025213/Plot-and-Parcel-Procedural-Level (GDC talk)
- `shaker2016-pcg` Noor Shaker et al. (2016). Procedural Content Generation in Games. Springer. https://link.springer.com/book/10.1007/978-3-319-42716-4 (book)
- `short2017-pcgdesign` Tanya Short and Tarn Adams (2017). Procedural Generation in Game Design. A K Peters/CRC Press. https://www.routledge.com/Procedural-Generation-in-Game-Design/Short-Adams/p/book/9781498799195 (book)
- `compton2017-practical-pcg` Kate Compton (2017). Practical Procedural Generation for Everyone. Game Developers Conference 2017. https://gdcvault.com/play/1024213/Practical-Procedural-Generation-for (GDC talk)
- `yu2011-spelunky` Derek Yu and Andy Hull (2011). The Full Spelunky on SPELUNKY XBLA. Game Developers Conference 2011. https://gdcvault.com/play/1014436/The-Full-Spelunky-on-SPELUNKY (GDC talk)
- `coleman2017-pcg-shotgun` Tyler Coleman et al. (2017). PCG Shotgun: 6 Techniques for Leveraging AI in Content Generation. Game Developers Conference 2017. https://gdcvault.com/play/1024146/PCG-Shotgun-6-Techniques-for (GDC talk)
- `togelius2011-sbpcg` Julian Togelius et al. (2011). Search-Based Procedural Content Generation: A Taxonomy and Survey. IEEE Transactions on Computational Intelligence and AI in Games 3(3). https://doi.org/10.1109/TCIAIG.2011.2148116 (peer-reviewed)
- `dormans2010-adventures` Joris Dormans (2010). Adventures in level design: generating missions and spaces for action adventure games. Proceedings of the 2010 Workshop on Procedural Content Generation in Games (PCGames '10). https://doi.org/10.1145/1814256.1814257 (peer-reviewed)
- `aikman2015-galak-z` Zach Aikman (2015). Galak-Z: Forever: Building Space-Dungeons Organically. Game Developers Conference 2015. https://gdcvault.com/play/1021999/Galak-Z-Forever-Building-Space (GDC talk)
- `bucklew2019-qud-wfc` Brian Bucklew (2019). Math for Game Developers: Tile-Based Map Generation using Wave Function Collapse in 'Caves of Qud'. Game Developers Conference 2019. https://gdcvault.com/play/1025913/Math-for-Game-Developers-Tile (GDC talk)
- `bucklew2019-qud-villages` Brian Bucklew and Jason Grinblat (2019). Math for Game Developers: End-to-End Procedural Generation in 'Caves of Qud'. Game Developers Conference 2019. https://gdcvault.com/play/1025914/Math-for-Game-Developers-End (GDC talk)
- `karth2017-wfc` Isaac Karth and Adam M. Smith (2017). WaveFunctionCollapse is constraint solving in the wild. Proceedings of the 12th International Conference on the Foundations of Digital Games (FDG '17). https://doi.org/10.1145/3102071.3110566 (peer-reviewed)
- `psf2026-python-random` Python Software Foundation (2026). random — Generate pseudo-random numbers. Python 3 documentation. https://docs.python.org/3/library/random.html (official documentation)
- `microsoft2026-dotnet-random` Microsoft (2026). Random Class (System). .NET API documentation, Microsoft Learn. https://learn.microsoft.com/en-us/dotnet/api/system.random (official documentation)
- `smith2010-expressive` Gillian Smith and Jim Whitehead (2010). Analyzing the expressive range of a level generator. Proceedings of the 2010 Workshop on Procedural Content Generation in Games (PCGames '10). https://doi.org/10.1145/1814256.1814260 (peer-reviewed)
- `fox2025-darkest-dungeon-2` Marielle Fox and Colin Towle (2025). Evolving Worlds from the Crumbling Chaos: The Art-Led Approach of 'Darkest Dungeon 2's' Procedural Generation System. Game Developers Conference 2025. https://gdcvault.com/play/1035493/Evolving-Worlds-from-the-Crumbling (GDC talk)
- `mckendrick2017-no-mans-sky` Innes McKendrick (2017). Continuous World Generation in 'No Man's Sky'. Game Developers Conference 2017. https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No (GDC talk)
