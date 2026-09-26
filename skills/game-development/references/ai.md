# Game AI: opponents, NPCs and companions

Read this when a task involves how non-player characters decide, perceive, move or accompany the player: choosing a decision architecture, fixing behavior that looks stupid or unfair, building a companion, debugging "why did it do that", or fitting AI into a frame budget. Inventory, saves and combat rules are in [systems](systems.md); generated levels are in [procedural generation](procedural-generation.md); engine structure is in [architecture](architecture.md); dialogue content is in [narrative](narrative.md).

## Start from what the player should perceive

In Game AI Pro, Dill describes game AI's job as creating the intended player experience, not maximizing an agent's chance of success [@rabin2013-gameaipro]. Dill also argues that players readily invent rich explanations for simple behavior, but one visibly wrong action (walking into walls, ignoring a player who is shooting at it) breaks that belief, and an AI that reasons more cleverly than the player can follow may simply look random [@rabin2013-gameaipro]. Voll frames AI as a perception problem for the same reason: players pattern-match and anthropomorphize, and once an AI has looked stupid the impression is hard to undo [@voll2015-less-is-more].

Clarify these before choosing any technique:

- What should the player believe this character wants, and what on screen tells them?
- Should the behavior be learnable and predictable or surprising? Yannakakis and Togelius note that stealth patrols and boss patterns are often meant to be memorized, and that AI built to win can be dull or unsporting to face [@yannakakis2018-aigames].
- Which failure would hurt most here: getting stuck, dithering, unfair detection, a companion giving the player away?
- How many of these characters does the player watch closely at once? Detail that helps one companion can be noise across a crowd.

### Make intent readable

The player sees behavior, never internal state.

- On F.E.A.R., squad dialogue was chosen after the squad logic had decided what to do, so the player heard the plan being carried out, and a soldier with no better cover could say so instead of looking broken [@orkin2006-fear].
- Rabin recommends investing in the AI's visible vocabulary: animation, head look that shows a character sizing up targets, speed of movement, and lines of dialogue [@rabin2017-gameaipro3].
- Isla counts transparency, meaning an untrained observer can guess the AI's state and predict its actions, among the costs that growing complexity threatened on Halo 2 [@isla2005-halo2-ai].
- In a small informal test (12 game-design students playing one turn-based strategy game), players rarely identified an AI's targeting strategy, even for an opponent that chose targets at random [@rabin2017-gameaipro3]. Assume reasoning the player cannot see is reasoning the player will not credit.
- Dill notes that an AI changing its mind tends to read as a faulty algorithm rather than reconsideration; Creatures showed a puzzled icon at such moments so the change read as deliberate [@rabin2013-gameaipro].

Red flags: the chosen action can change on consecutive ticks with no animation or bark; the behavior only makes sense with a debug overlay; a decision system with dozens of weighted inputs where playtesters describe the character as "random".

## Triage by symptom

This table is the skill's synthesis, with sources for specific cases. A useful first check is often a per-tick log or overlay of the agent's inputs, believed state and chosen action at the moment of failure.

| Symptom | Plausible causes | First check |
| --- | --- | --- |
| Flips between two actions | No commitment or inertia; two thresholds set to the same value; a stateless tree re-selecting each tick | Log decision and inputs per tick; draw both thresholds [@johansen2017-brittle; @rabin2013-gameaipro] |
| Stands idle when it should act | No valid option and no fallback; failed plan with nothing lower to fall back on; failing path query | Confirm a lowest-priority behavior always exists; on F.E.A.R. a rat with no attack actions failed to plan an attack and fell back to patrolling [@orkin2006-fear] |
| Knows where the player is through walls | Decisions read world truth instead of perceived state | Compare the agent's believed target position with the true one [@isla2005-halo2-ai] |
| Detection feels unfair | Stimulus the player could not see or infer; no feedback before detection | Replay from the player's camera, not a free camera [@walsh2014-splinter-cell] |
| Gets stuck or never arrives | Disconnected navmesh region; representation too coarse for the creature; steering requests cancelling | Draw the path and navmesh connectivity for that creature size [@rabin2017-gameaipro3; @reynolds1987-flocks] |
| Player swarmed by simultaneous attacks | No global limit on concurrent attackers | Count concurrent attackers; consider attack tokens [@loudy2018-doom] |
| Companion is annoying | Too far away, in the way, giving the player away, or doing the player's job | Measure waiting, blocking and rescues [@rabin2015-gameaipro2] |
| Frame spikes as NPC count rises | Many agents raycasting or re-planning on the same frame | Count queries per frame and spread them through a prioritized queue [@martel2017-sensory] |

## Fairness, cheating and reaction time

For Splinter Cell: Blacklist, Walsh judged perception by three goals that often conflict: detection that feels fair, consistent feedback, and behavior that is plausible rather than maximally smart [@walsh2014-splinter-cell]. What counted was what the player could believe the guard perceived. Off-screen guards far enough away had their hearing halved for some events, which made the game more fun, while guards just around a corner still heard the player so they did not look deaf [@walsh2014-splinter-cell; @rabin2015-gameaipro2].

On cheating, Dill's rule is to cheat only when it improves the experience, remembering that a player who catches it has a different, usually worse, experience; on Kohan 2 the AI occasionally explored where it knew resources were and tracked approximate enemy strength without exact positions [@rabin2013-gameaipro]. On The Last of Us, Naughty Dog made companions invisible to enemies while the player was sneaking, judging that a companion exposing the player would damage the relationship more than an occasional implausible moment [@rabin2015-gameaipro2]. In the informal strategy-game test above, AIs that quietly eased off when far ahead were rated as difficult as their full-strength versions [@rabin2017-gameaipro3]. That is one small test of one game; [balance](balance.md) describes a hidden handicap that players did notice and read as cheating.

- Reaction delay: Rabin's summary of reaction-time research (average lab times for people pressing a button) gives about 0.2 s for a simple reaction and about 0.4 s when the character must first recognize friend from foe, longer for faint stimuli, added aiming or lapses of attention [@rabin2015-gameaipro2]. Use these as starting values between stimulus and visible response, then tune by feel.
- Attack pacing: on DOOM (2016), demons needed a token to perform certain attacks so the player could read each attacker; token counts rose with difficulty, and a demon directly in front of the player could take a token so it did not stand there looking passive [@loudy2018-doom].

Red flags: an enemy fires on the frame the player becomes visible; perception reads world truth instead of the NPC's knowledge; detection by characters the player could not see or reasonably infer.

## Choosing a decision architecture

Dill places the common approaches on a spectrum from authorial control (scripts, rules) to autonomy (utility, planning), and argues the choice should follow the experience wanted, not the reverse [@rabin2013-gameaipro].

| Approach | Fits when | Typical failure | Sources |
| --- | --- | --- | --- |
| Finite state machine, hierarchical FSM | Few modes with clear transitions; designers need to read it | Transitions multiply as states grow; reused behaviors need duplicate states unless nested with a history state | [@rabin2013-gameaipro; @yannakakis2018-aigames] |
| Behavior tree | Prioritized reactive behavior; sequencing actions | Context-dependent priorities and cyclic mode changes; control flags leaking into the blackboard; stateless re-selection loops | [@isla2005-halo2-ai; @anguelov2017-arborist; @rabin2013-gameaipro] |
| Utility scoring | Many options with no single right answer (RPG action choice, economy, needs) | Hard to tune; less predictable; scripted moments must override it; option flip-flopping | [@rabin2013-gameaipro; @dill2010-utility; @yannakakis2018-aigames] |
| Goal-oriented action planning | Many character types pursuing shared goals with different actions; recovery from blocked plans | Less authorial control; long plans; hard to see why a plan formed | [@orkin2006-fear; @rabin2013-gameaipro; @conway2015-goap] |
| Hierarchical task network | Designer-authored decomposition of tasks; longer-term behavior | Only finds plans designers wrote; frequent re-planning under real-time change erodes long-term intent | [@rabin2013-gameaipro; @mori2021-art-htn] |
| Scripts and schedules | Many background characters with routine lives; set pieces | Break outside the authored situation | [@rabin2017-gameaipro3; @rabin2013-gameaipro] |

What the sources add:

- Halo 2 used mostly prioritized lists where higher-priority children can interrupt, "impulses" to reorder priorities in specific situations, cheap state tags to skip whole branches, and event-driven stimulus behaviors inserted into the tree so higher priorities still apply [@isla2005-halo2-ai].
- Anguelov argues that behavior trees are acyclic and poor at cyclic mode changes and transitions, and that forcing them into that role spreads implicit flags through agent knowledge. In Anguelov's approach, small trees execute a behavior chosen by a state machine or another method [@anguelov2017-arborist].
- The Game AI Pro overview warns that stateless trees can loop, for example a fleeing citizen who, once safe, re-selects the behavior that walks back into the fight [@rabin2013-gameaipro].
- Utility systems need something that holds a choice; Yannakakis and Togelius give inertia toward the current weapon as a consideration so selections do not flicker [@yannakakis2018-aigames]. Dill and Mark present response curves and weighted random selection as ways to replace abrupt if/then switches [@dill2010-utility].
- F.E.A.R. separated goals from per-character action sets, which let the team build a new enemy late from existing goals and actions; procedural preconditions deferred expensive checks such as finding an escape path until needed [@orkin2006-fear]. Jacopin's analysis of logged plans from GOAP games, including F.E.A.R. and Shadow of Mordor, found plans were short and a few actions carried most of the planning [@conway2015-goap].
- On the management sim Project Highrise, Zubek dropped a working planner for daily schedule scripts because the team wanted authored routines. The team also removed an earlier model of internal needs, whose hidden state made individual and crowd behavior hard for designers and players to understand. Zubek's conclusion is that per-NPC detail should fall as the number of NPCs the player manages rises [@rabin2017-gameaipro3].

Smallest useful change: when an existing FSM or tree mostly works, add hierarchy, a top-level mode machine or a utility selector at the one troublesome decision before replacing the system. A mid-project rewrite throws away tuning that already works, so it needs a specific failure the new architecture fixes.

### Designer control

Halo 2's designers directed squads through orders (sets of firing positions plus triggers for moving between them) and behavior styles that allowed or disallowed behaviors; styles came from a small library approved by the lead designer and AI programmer, because a bad style could leave an AI unable to act. Character parameter files inherited from parents so a variant only stated what differed [@isla2005-halo2-ai]. Keeping sensors, knowledge, decisions and actions separate lets each be tested with mocked inputs [@johansen2017-brittle].

## Perception and knowledge

- Keep believed state separate from world truth. Halo 2's per-actor records of perceived objects let AI be fooled or surprised and search where it last saw a target [@isla2005-halo2-ai].
- Order vision checks from cheap to expensive: filter candidates, test sensor shapes, raycast last [@martel2017-sensory].
- Martel recommends several target points instead of one pivot so a twig does not hide a whole body, a sensor bone the animator controls so idle glances do not sweep the vision cone, the same reference point for line of sight and line of fire, and perception modifiers that stack and only reduce perception so rules the player has learned still hold [@martel2017-sensory].
- Blacklist used nested cone and box shapes, raycasts to several body points, and lighting; the model needed playtest tuning until the end of the project, and players wanted a less forgiving model than the team expected [@walsh2014-splinter-cell].
- Environmental awareness can be cheap and visible: Blacklist's guards noticed changed objects such as opened doors, which reviewers remarked on, while its larger room-and-chokepoint model also gave sound distances that did not pass through walls [@walsh2014-splinter-cell].
- Blacklist spread detection between guards only through gunfire or shouts, and used specific barks the first few times before falling back to generic ones [@walsh2014-splinter-cell].

Red flags: line of sight tested to a target point at floor level or to a single origin point; a flashbang's timed effect that resets a designer's "blind" flag when it expires; hearing computed from straight-line distance.

## Navigation and steering

Diagnose three problems separately: choosing where to go (decision), finding a route (pathfinding), and moving along it (steering and locomotion). "The enemy won't flank" can be any of the three.

- Representation: Sturtevant compares grids (quick to build, easy to change at runtime, memory-heavy), waypoint graphs (cheap, but poor localization and smoothing) and navigation meshes (accurate and fast to search, but costly to implement and to change) [@rabin2013-gameaipro]. Zubek replaced a building-sized grid with a graph of floor plates and connectors, and found that shrinking the search space mattered more than the choice of search algorithm [@rabin2017-gameaipro3].
- The creature set drives navigation: Guerrilla had to rework navigation and animation to go from one human enemy type in corridors to more than 25 very different characters in a large open world [@berteling2018-horizon]. God of War Ragnarök used character-specific navmesh traversal and level-designer setup for several independently moving companions [@kohari2023-companion-traversal].
- Steering: Reynolds' flocking steers each agent from local perception, and the paper shows why plain weighted averaging fails: opposing requests cancel and the agent drifts into the obstacle. Reynolds allocated a fixed acceleration budget by priority instead [@reynolds1987-flocks]. Fray found blended steering acceptable for flocks, where individuals go unwatched, but not for F1 cars racing wheel to wheel with the player, and replaced it with context maps [@rabin2015-gameaipro2].
- Tooling: the Final Fantasy XV team rendered navmesh connectivity per creature size and diffs between navmesh versions to catch newly disconnected areas [@rabin2017-gameaipro3].

For implementation detail, Millington's AI for Games has chapters on movement, pathfinding and decision making [@millington2019-ai].

## Companions

Dyckhoff's account of Ellie in The Last of Us is the most detailed of these sources [@rabin2015-gameaipro2]:

- Keep the companion close. Near the player, her mistakes can be no worse than the player's own, she stays in view, and she has chances to comment and call out threats.
- Generate and rate candidate follow and cover positions around the player each frame, and filter out unneeded short moves and runs past the player.
- Never teleport to keep up; the team allowed it only during a grapple when the camera was locked.
- Ration help: thrown bricks and ammo gifts ran on long timers so they stayed memorable; a playtester stuck in one spot received ammo every minute, which cheapened it.
- Invert the shooting default: Ellie did not fire unless the player was already loud or in immediate danger, and her shots often did no damage unless the player would see the hit.
- Tune effectiveness mainly through visibility: Dyckhoff kept Ellie's damage per shot equal to the player's so she did not feel broken, changed her fire rate and accuracy only within believable limits, and chose when her hits landed, such as when the player had not seen her help recently or was in danger.

Abercrombie describes Elizabeth in BioShock Infinite as having to be leader and follower, scripted and dynamic, at once [@abercrombie2014-elizabeth]. Test companions for escort-quest failure: count how often the player waits for, rescues or routes around the companion.

Red flags: the companion stands on the far side of a doorway or fence from the player; it is teleported into view; enemies can detect it while the player is hidden; a helpful action fires on a short fixed timer.

## Debugging, testing and visualization

Debugging AI shifted from checking what a character did to explaining why it did or did not act [@merrill2014-ai-visualization]. At Crystal Dynamics, designers who could not see why a planner-driven NPC acted fell back to scripting it [@conway2015-goap].

Tools that practitioners describe [@johansen2017-brittle; @anguelov2017-arborist; @rabin2017-gameaipro3]:

- Debug drawing added with every feature, such as the ranges at which a sniper switches weapons, which exposes thresholds set to the same distance.
- A visible marker on characters under scripted control, so reports go to the right owner.
- Per-agent breakpoints and tags, including behavior-tree decorators that label or pause on a node.
- A state dump of what the agent believes, and runtime overrides, such as making an agent act as if it had no ammo.
- Spawn and cheat commands to build a test situation quickly, rolling session recordings a tester can flag, and fast headless AI-versus-AI runs to find crashes.
- An in-game recorder with a fixed memory budget that lets you scrub back through positions, poses and recorded debug shapes (Treyarch).

The panel also advises agreeing in advance what "broken" means for each character and whether a surprising but plausible action counts as a bug [@johansen2017-brittle].

## CPU and memory budgets

- Structure first: Halo 2 kept one static tree and allocated state only for the running branch of each actor, and used tags to skip relevancy tests [@isla2005-halo2-ai]. F.E.A.R. kept pathfinding out of the planner's world state and ran it only when an action needed it [@orkin2006-fear].
- Queue expensive queries: defer vision raycasts into a prioritized queue (distance to camera, gameplay state, interaction with the player) and cache shared results [@martel2017-sensory]. DOOM updated the visibility of its tactical positions with a small fixed number of traces per frame, refreshing the combat space over time [@loudy2018-doom].
- Level of detail: Assassin's Creed Unity ran distant crowd members as cheap instanced meshes with scripted reactions, promoted nearer ones through a visual-only tier, and fully simulated only a few near the player; entities were recycled, so references used stable ids rather than pointers [@cournoyer2015-crowd].
- Simplify execution: because selection was cheap and its world mostly benign, Project Highrise ran action queues open-loop and simply re-selected when an action failed instead of monitoring the world during every action [@rabin2017-gameaipro3].
- Watch scaling: naive neighbor checks grow with the square of agent count [@reynolds1987-flocks].

Profile AI per subsystem (perception, decision, pathfinding, animation queries) under the worst expected count of active agents, and set update rates from measurements rather than running everything every render frame.

## Evidence to collect

- A capture of the failure with the agent's perceived state, current decision and inputs at that moment.
- For a fairness complaint: what the player could see and hear when detected, compared with the NPC's sensor result.
- Playtest descriptions of what players think each character is trying to do, compared with the design intent.
- Frame-time breakdown for AI at peak agent count, and counts of queries per frame.
- For companions: time the player spends waiting for, rescuing or blocked by them.

## Sources

- `rabin2013-gameaipro` Steve Rabin (2013). Game AI Pro: Collected Wisdom of Game AI Professionals. CRC Press. https://www.routledge.com/Game-AI-Pro-Collected-Wisdom-of-Game-AI-Professionals/Rabin/p/book/9781466565968 (book)
- `voll2015-less-is-more` Kimberly Voll (2015). Less is More: Designing Awesome AI. Game Developers Conference 2015. https://gdcvault.com/play/1022104/Less-is-More-Designing-Awesome (GDC talk)
- `yannakakis2018-aigames` Georgios N. Yannakakis and Julian Togelius (2018). Artificial Intelligence and Games. Springer. https://link.springer.com/book/10.1007/978-3-319-63519-4 (book)
- `orkin2006-fear` Jeff Orkin (2006). Three States and a Plan: The AI of F.E.A.R. Game Developers Conference 2006. https://gdcvault.com/play/1013282/Three-States-and-a-Plan (GDC talk)
- `rabin2017-gameaipro3` Steve Rabin (2017). Game AI Pro 3: Collected Wisdom of Game AI Professionals. CRC Press. https://www.routledge.com/Game-AI-Pro-3-Collected-Wisdom-of-Game-AI-Professionals/Rabin/p/book/9781498742580 (book)
- `isla2005-halo2-ai` Damian Isla (2005). Managing Complexity in the Halo 2 AI System. Game Developers Conference 2005. https://gdcvault.com/play/1020270/Managing-Complexity-in-the-Halo (GDC talk)
- `johansen2017-brittle` Emil Johansen et al. (2017). Behavior is Brittle: Testing Game AI. Game Developers Conference 2017 (AI Summit). https://gdcvault.com/play/1024564/Behavior-is-Brittle-Testing-Game (GDC talk)
- `walsh2014-splinter-cell` Martin Walsh (2014). Modeling AI Perception and Awareness in Splinter Cell: Blacklist. Game Developers Conference 2014. https://gdcvault.com/play/1020195/Modeling-AI-Perception-and-Awareness (GDC talk)
- `reynolds1987-flocks` Craig W. Reynolds (1987). Flocks, herds and schools: A distributed behavioral model. SIGGRAPH '87: Proceedings of the 14th Annual Conference on Computer Graphics and Interactive Techniques. https://doi.org/10.1145/37401.37406 (peer-reviewed)
- `loudy2018-doom` Kurt Loudy and Jake Campbell (2018). Embracing Push Forward Combat in 'DOOM'. Game Developers Conference 2018. https://gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in (GDC talk)
- `rabin2015-gameaipro2` Steve Rabin (2015). Game AI Pro 2: Collected Wisdom of Game AI Professionals. CRC Press. https://www.routledge.com/Game-AI-Pro-2-Collected-Wisdom-of-Game-AI-Professionals/Rabin/p/book/9781482254792 (book)
- `martel2017-sensory` Eric Martel (2017). Can You See Me Now? Building Robust AI Sensory Systems. Game Developers Conference 2017 (AI Summit). https://gdcvault.com/play/1026497/Can-You-See-Me-Now (GDC talk)
- `anguelov2017-arborist` Bobby Anguelov et al. (2017). AI Arborist: Proper Cultivation and Care for Your Behavior Trees. Game Developers Conference 2017 (AI Summit). https://gdcvault.com/play/1024218/AI-Arborist-Proper-Cultivation-and (GDC talk)
- `dill2010-utility` Kevin Dill and Dave Mark (2010). Improving AI Decision Modeling Through Utility Theory. Game Developers Conference 2010 (AI Summit). https://gdcvault.com/play/1012410/Improving-AI-Decision-Modeling-Through (GDC talk)
- `conway2015-goap` Chris Conway et al. (2015). Goal-Oriented Action Planning: Ten Years Old and No Fear!. Game Developers Conference 2015 (AI Summit). https://gdcvault.com/play/1022019/Goal-Oriented-Action-Planning-Ten (GDC talk)
- `mori2021-art-htn` Tomohiro Mori and Kousuke Namiki (2021). AI Summit: Advanced Real-Time Hierarchical Task Networks: A New Approach. Game Developers Conference 2021 (AI Summit). https://gdcvault.com/play/1027232/AI-Summit-Advanced-Real-Time (GDC talk)
- `berteling2018-horizon` Julian Berteling (2018). Beyond 'Killzone': Creating New AI Systems for 'Horizon Zero Dawn'. Game Developers Conference 2018 (AI Summit). https://gdcvault.com/play/1024912/Beyond-Killzone-Creating-New-AI (GDC talk)
- `kohari2023-companion-traversal` Salaar Kohari (2023). Companion Traversal in 'God of War Ragnarok'. Game Developers Conference 2023. https://gdcvault.com/play/1029003/Companion-Traversal-in-God-of (GDC talk)
- `millington2019-ai` Ian Millington (2019). AI for Games. CRC Press (3rd edition). https://www.routledge.com/AI-for-Games-Third-Edition/Millington/p/book/9781138483972 (book)
- `abercrombie2014-elizabeth` John Abercrombie (2014). Bringing BioShock Infinite's Elizabeth to Life: An AI Development Postmortem. Game Developers Conference 2014 (AI Summit). https://gdcvault.com/play/1020831/Bringing-BioShock-Infinite-s-Elizabeth (GDC talk)
- `merrill2014-ai-visualization` Bill Merrill and Mika Vehkala (2014). Out of Sight, Out of Mind: Improving Visualization of AI Info. Game Developers Conference 2014 (AI Summit). https://gdcvault.com/play/1020091/Out-of-Sight-Out-of (GDC talk)
- `cournoyer2015-crowd` Francois Cournoyer (2015). Massive Crowd on Assassin's Creed Unity: AI Recycling. Game Developers Conference 2015. https://gdcvault.com/play/1022141/Massive-Crowd-on-Assassin-s (GDC talk)
