# Levels: space, teaching and challenge

Read this for questions about a level's layout, flow or pacing, how players learn a mechanic, whether a section is too hard or unfair, what failure should cost, difficulty options and assists, or puzzle design. Jump arcs and control response belong in [game feel](game-feel.md), access settings in [accessibility](accessibility.md), and playtest method in [evaluation](evaluation.md).

The experience the developer wants comes first. A punishing climb, a wordless puzzle box and a relaxed stroll need different answers, so treat each heuristic below as a hypothesis to test in that game.

## Start from the level's job

Before changing geometry, pin down what the level is for:

- Which mechanic, idea or feeling is this space about? If the answer is a long list, the level may be doing several jobs badly.
- What must the player notice, and from where will they first see it?
- What does the player know on entry, and what should they be able to do on exit?
- When they fail, how much time, progress or resource do they lose, and how fast are they back in control?
- Which parts are required and which optional, and how can the player tell?

Dan Taylor describes a level as a delivery system for the game's mechanics: the layout, objectives and encounters exist to put those mechanics to work [@taylor2013-principles]. Totten, writing from architecture, defines level design as turning gameplay into a space the player inhabits. Totten argues that an architectural vocabulary for sight lines, orientation and spatial sequence complements playtesting rather than replacing it [@totten2019-architecture].

## Layout, sightlines and wayfinding

**Name the structures.** Hullett and Whitehead catalogued recurring structures in single-player shooter levels. They include sniper locations, choke points, arenas, strongholds, flanking routes, split levels and hidden areas. Each is described by the parameters a designer can change (height, cover, width, number of entrances) and its effect on pace, tension and challenge [@hullett2010-fps-patterns]. The catalogue comes from analysing shipped shooters, not from player studies. A shared vocabulary makes a layout review concrete. "The arena has one entrance and no cover, so the enemy holds a stronghold" can be tested; "the room feels off" cannot.

**Affordances are a contract.** Shaver's rules for blockouts are:

- Anything the player can use should look the same everywhere and follow the game's movement metrics.
- Anything they cannot use should look unusable for a visible reason, not be blocked by an invisible wall [@shaver2018-blockmesh].
- At Arkane, doors that do not open are physically blocked so they cannot read as usable, and every powered barrier has a visible cable to its source [@lee2017-holistic].
- Naughty Dog's playtest builds record every failed grab attempt as a marker in the level. That shows where geometry looks climbable but is not [@shaver2018-blockmesh].

**Put information where eyes already are.** In single-player levels, reliable places to show an objective or story beat are:

- the moment of leaving a door or elevator;
- the top of a ladder;
- the base of a T-junction [@beinkeschwartz2017-multiplayer].

Portal 2's playtesters rarely looked up, and Valve ended up adding a sign, against its own rule, so players would watch one key event [@faliszek2012-portal2]. Lee counters the folk rule that players never look up. In Dishonored, where high ground is taught as safe and useful, players look up all the time [@lee2017-holistic].

**Sightlines cut both ways.** A vantage point that invites action has to be honest about what follows. In The Last of Us, many playtesters died in a dock area. A raised position with cover invited a firefight while most enemies were out of sight. The area was also shrunk and some enemies cut, but the main problem was the layout. The fix had the characters drop down during the cutscene, removed the cover, and showed every enemy as the player arrived [@silli2014-tlou]. In multiplayer, an unintended sightline that feels clever against AI feels unfair to a human who cannot tell why they died [@beinkeschwartz2017-multiplayer].

**Let players form plans.** Lee lists four conditions for acting with intention:

- a choice;
- a motive;
- information from consistent affordances;
- time to take it in.

Safe vantage points and vertical layouts support the observe and plan steps of an observe, plan, execute, react loop [@lee2017-holistic].

**Wayfinding.** Oueijan treats getting lost as a mismatch between the player's mental map and the space. Landmarks orient only if they stay put, and they work better when they look different from each side. A route learned walking one way is not automatically learned in reverse [@oueijan2021-cognitive-maps]. Shaver places a landmark first and builds the level back from it. In Shaver's approach, breadcrumbs come only after early playtests, because they can hide a layout that does not guide on its own, and scripted motion is a late patch, not a plan [@shaver2018-blockmesh]. Taylor calls for a consistent visual language along the critical path, and notes that deliberate confusion can be memorable when it is intended [@taylor2013-principles].

Red flags in code and content:

- Collision and visuals disagree: a ledge mesh with no grab volume, or a grab volume on decorative trim.
- Interactables marked by colour alone. This also fails colour-blind players, so pair colour with shape or value contrast [@shaver2018-blockmesh].
- Objective markers or breadcrumbs added before anyone has played the bare layout.
- A moving or symmetric landmark used as the main orientation cue.

## Metrics and blockout

Derive distances from what the avatar can do, not by eye. Smith and colleagues' platformer generator makes this explicit. It models the avatar's size, top speed, jump height for each length of button press and time in the air. That model constrains every gap and ledge, which keeps every generated level playable [@smith2009-rhythm].

The same idea works for hand-built levels. Keep movement constants in one data source and derive the maximum gap and ledge sizes from them. A reachability check or test level can then flag geometry the current constants cannot clear, so a tuning change shows which levels it breaks. This is this skill's engineering suggestion, not a sourced finding.

Iterate while changes are cheap:

- Block out the whole level roughly and early, watch anyone play it, and repeat until the layout locks for art [@shaver2018-blockmesh].
- Grey-box risky ideas first. On Medal of Honor, a puzzle type built around throwing grenades down vents was cut late because it had never been tested early [@taylor2013-principles].
- On The Last of Us Part II, Hill built 3D blockouts quickly and tested scale, camera and reveals in engine. Hill expected to throw the blockouts away and spent 4 to 12 weeks in total iterating them, depending on complexity. Once someone could play without explanation, outside playtests ran every 2 to 3 weeks [@hill2022-museum].
- Read feedback carefully. Hill's rule is that players are usually right that something is wrong but usually wrong about the cause [@hill2022-museum].

## Pacing and rhythm

Pacing is the sequence of load and rest the player feels. Sources describe it at different scales.

- **Moment to moment.** Smith and colleagues build platformer levels from short "rhythm groups" of timed actions, joined by small rest platforms. Rhythm is kept separate from geometry, so the same rhythm can take many shapes [@smith2009-rhythm].
- **Encounter to encounter.** Hullett and Whitehead walk through a BioShock level. A run of similar small rooms sets a rhythm, and one room without cover breaks it for surprise. A hidden cache after a hard arena lets tension fall and restocks the player [@hullett2010-fps-patterns].
- **Safety.** In Celeste, safe footholds between moves are the main pacing control. Hard moves with rests feel slow and tense; easy moves with no rest feel like one fluid run [@thorson2017-celeste].
- **Rest after peaks.** Trainyard dips difficulty every few levels so players get easier wins between climbs [@rix2012-trainyard]. After Celeste's climactic chase, the cool-down levels improved once every hazard was removed [@thorson2017-celeste].
- **Endings.**
  - Valve kept a lesson from Portal: the final puzzle should not be the hardest, because long careful solving does not feel like a climax [@faliszek2012-portal2].
  - Zachtronics hold the same rule and admit they often break it [@barth2019-zachtronics].
  - In Cut the Rope, the hardest level of each 25-level box is usually the second to last [@rix2012-trainyard].

Sources disagree about regular curves. Taylor argues that the familiar pattern of rising peaks and troughs becomes predictable and should sometimes be subverted. Taylor's example is Dead Space 2's return to the Ishimura, where no enemy appears for about 15 minutes [@taylor2013-principles]. The puzzle designers above use regular dips on purpose. Each fits its context: surprise matters where tension is the product, and predictable relief matters where players are working hard to learn.

**Optional content.** Hill sorts a level's content into four kinds:

- unmissable **focal points**;
- visible optional **prospects** of similar size;
- **threads** that extend a prospect when the player engages with it;
- **secrets** that break expectation.

Hill's museum level shows two small optional exhibits before a larger cluster, so players learn that skipping is allowed. A one-way "hard valve" then signals the move on. Asked in Q&A about one optional moment, Hill recalled, without the exact figure, that the team would have been content if roughly 10 to 20 percent of players found it, and added cues when playtests came in lower [@hill2022-pacing].

**A four-beat structure.** Hill sequences the museum level's moments with a four-part structure of introduction, development, twist and conclusion [@hill2022-pacing; @hill2022-museum], which Hill names kishōtenketsu [@hill2022-museum]. The structure often circulates as Nintendo's level grammar and is attributed to Koichi Hayashida. That attribution could not be verified: Hayashida's GDC 2012 talk on Super Mario 3D Land does not describe the structure [@hayashida2012-3d-land], and Hill's own Mario claim rests on a YouTube video. Use the four beats as a working tool, not as a documented Nintendo method. Taylor makes a related point: good levels keep teaching by continually introducing or subverting mechanics [@taylor2013-principles].

## Teaching mechanics

**Fan's techniques.** On Plants vs. Zombies, the goal was to teach a strategy game to Fan's non-gamer mother without boring experienced players [@fan2012-pvz]. Several of Fan's techniques are level design:

- **Teach inside play.** No screen is labelled tutorial. The first level has one plant, one zombie type and one lane, so players see how peas and zombies move without any text [@fan2012-pvz].
- **Spread teaching out.** Fan asks whether the player needs a mechanic yet. The shovel arrives at level 1-5, money about ten levels in, and a store with a limited selection about 25 levels in, with more items added later. A new zombie arrived on every other level, first on an easier level and then combined with the others on the next [@fan2012-pvz].
- **Make the right action the obvious one.** Novices planted attackers instead of sunflowers. Lowering the sunflower's price and the starting sun made it the only affordable plant at the start of early levels. The change forced a rebalance of the whole game [@fan2012-pvz].
- **Hint only to players who need it.** A message about planting further left appears only if a player loses a peashooter placed in the rightmost columns [@fan2012-pvz].
- **Use few words.** Fan's personal rule is at most eight words on screen at once. Fan calls it nearly impossible to keep and admits breaking it. Treat it as a personal rule of thumb for one casual game, not a measured threshold [@fan2012-pvz].

**Teach through levels.**

- **Celeste.** The only instructional text is the list of controls. A mechanic first appears where it does not matter, then in a room that demands a conscious insight, with quick deaths as feedback. Where most testers stalled, an optional two-room branch teaches the missing step. Players who solve the room alone never see it [@thorson2017-celeste].
- **Trainyard.** It teaches one element at a time and treats each combination as a new element: A, B, A+B, C, A+C, B+C. It brings taught elements back rather than saving them for a late surprise [@rix2012-trainyard].
- **HITMAN.** Isolated test chambers that each taught one mechanic did not prepare players for the full sandbox, so the team replaced them with small but real sandboxes [@andersen2016-hitman].
- **Portal 2.** A portal originally moved around the room on its own schedule. Letting players open it with a button made the puzzle faster to solve and taught the mechanic better [@faliszek2012-portal2].

**Do not punish learning.** Hodent reports on Fortnite's alpha. Players who died or struggled during onboarding were more likely to leave, so Hodent advises against punishing players while they are still learning. Eye tracking also showed a player ignoring an important prompt shown in the middle of combat [@hodent2016-onboarding].

**How much instruction?** The evidence says it depends on the game.

- Andersen and colleagues ran an online experiment with over 45,000 players of three research games [@andersen2012-tutorials]:
  - Tutorials raised play time by up to 29 percent, but only in the most complex and unusual game.
  - In the two simpler games they made no significant difference.
  - Forcing players through each step showed no benefit.
  - A help button reduced progress in one game.
- The authors conclude that mechanics players can discover by experimenting may not need tutorials. Their games were not commercial titles [@andersen2012-tutorials].
- Cheung and colleagues analysed reviews of games' first hours. Players quit over "pitfalls", a missed piece of information, and wanted both direction and discovery. The authors recommend clear direction early that hints at depth, with discovery saved for later [@cheung2014-first-hour].

Together: teach what players cannot find by trying, and let them find the rest.

## What kind of hard?

"Too hard" hides different problems, so separate them before tuning. This three-way split is this skill's synthesis. The sources below support the separations it draws.

| Kind | What the player lacks | Typical signal | Smallest useful change |
| --- | --- | --- | --- |
| Conceptual | Knowing what to do: the rule, the idea, the solution | Wandering, repeated wrong approaches, skipping, "was that right?" | Show the idea alone first; make wrong approaches look wrong; add an optional teaching step |
| Execution | Doing it: timing, precision, speed | Repeated failure at the same spot with the right plan | Widen timing, slow the threat, shorten the retry, or move action off the puzzle's critical path |
| Combinatorial | Holding several things at once: elements, steps, threats | Parts succeed alone, then collapse when combined | Fewer simultaneous elements, fewer steps before feedback, teach the combination as its own step |

- Cut the Rope tracks two rates for every level [@rix2012-trainyard]:
  - a high failing rate means players understand the level but cannot execute it, so simplify the action;
  - a high skipping rate means they do not understand the puzzle, so simplify it or add a tip.
- Keren advises that a boss test logic or skill but not both at the same instant. Succeeding at one and then failing at the other feels unsatisfying [@keren2018-bosses].
- Brett Taylor makes the same point for puzzles: knowing the answer but being unable to execute it is not fun [@taylor2019-puzzle-magic].
- Menzel's three puzzle difficulty dials describe the combinatorial load [@menzel2016-puzzles]:
  - how many steps pass before feedback;
  - how many new mechanics or how much new information is introduced;
  - how many new uses of known mechanics are asked for.

  Menzel describes too many steps as a very common reason a puzzle is too hard [@menzel2016-puzzles].
- Scaling numbers is not the same as adding challenge. On Halo 1's Legendary setting, doubled damage to the player stacked with the shield multiplier. Dodging was no harder, but hits killed quickly, so the setting was more punishing, not more demanding. Halo 3 made the higher difficulties faster instead [@griesemer2011-halo].

## Failure, recovery and checkpoints

Treat the cost of failing as part of the difficulty. In this skill's view, two sections with the same challenge are different experiences if one puts the player back in control in two seconds and the other replays five minutes.

- **Punishment and time.** Juul distinguishes four punishments: losing energy, losing a life, game over, and setback (replaying part of the game or losing abilities). Juul argues that they all end up as setbacks, so the player's time and energy are the underlying cost [@perron2008-vgtr2]. In The Art of Failure, Juul adds that the more time a player has invested, the greater the sense of loss on failing [@juul2013-failure].
- **Short retries.** Celeste has almost no checkpoints, but rooms are short and death returns the player to the room start, so little is lost. Thorson asks why a room should continue past a fully safe spot, because extra length raises the stakes [@thorson2017-celeste].
- **Where the player returns.**
  - Menzel contrasts Wind Waker's Forsaken Fortress, where a fall means replaying the level, with Portal, which respawns the player near the failure so each attempt teaches [@menzel2016-puzzles].
  - In God of War Ragnarök, checkpoints between boss phases let each phase be longer and harder than a single-run fight could be [@oliver2023-ragnarok].
  - Halo 3 pushes back harder the more the player pushes, but forgives retreat: shields recover and enemies do not chase [@griesemer2011-halo].
- **Wait time.** Portal 2 dropped a hazard partly because of its long wait after failure and deaths players could not explain; lasers gave instant feedback [@faliszek2012-portal2]. In first-hour reviews, players complained less about dying than about imprecise controls and slow loading between deaths [@cheung2014-first-hour].
- **Legible failure.**
  - Meier observed that players read setbacks as the game cheating unless they understand why a setback happened and how to avoid it [@meier2010-psychology].
  - In Juul's small online test of one prototype, players who blamed their own mistake rated the game higher than players who blamed the game [@perron2008-vgtr2].
  - Cuphead shows how far the player got at the moment of death [@keren2018-bosses].
- **Stalled progress.** In a facial-EMG study with a shooter, players' smiles after dying weakened as deaths repeated. The authors suggest death stops reading as challenge once progress stalls [@vandenhoogen2012-player-death].
- **Saving.** Meier found players reloading saves to avoid a designed decline in Civilization. Civilization Revolution stores the random seed in the save, and Pirates! allows saving only in port [@meier2010-psychology].

Red flags: respawn that triggers a full scene reload; an unskippable cutscene or dialogue before a hard section; a checkpoint placed before a long walk rather than at the challenge; death with no visible cause, such as an off-screen hit or an ambiguous hitbox.

## Difficulty options, assistance and adaptation

Choose the mechanism deliberately, because each has costs.

- **Choices inside the level.** Taylor prefers routes to a difficulty menu: an easy-to-medium main path plus clearly signalled riskier routes with obvious rewards, like Burnout's shortcuts [@taylor2013-principles].
- **Settings.** Civilization IV has nine difficulty levels so players always have a next step [@meier2010-psychology]. Keren asks whether a boss needs to block progress at all, suggests easy modes, alternative challenges or skips, and notes that easy-mode labels carry stigma [@keren2018-bosses].
- **Assists.** God of War Ragnarök weighed each assist on player value, cost and conflict with design intent [@oliver2023-ragnarok]:
  - A mini-boss checkpoint was first shown in the main settings.
  - Players switched it on and forgot it. One who picked a higher difficulty for the challenge found a mini-boss trivial without knowing why.
  - It moved to the accessibility menu and was locked on the two highest difficulties.
  - It now reminds the player on each death.

  See [accessibility](accessibility.md) for access options that are not about challenge.
- **Structure.**
  - Patrick's Parabox always keeps several puzzles open so players cannot get stuck [@traynor2024-parabox].
  - Opus Magnum made finishing puzzles easier and put its depth into optional optimisation scores [@barth2019-zachtronics].
  - Celeste's optional teaching branch helps without slowing strong players [@thorson2017-celeste].
- **Hidden adaptation.**
  - Hunicke starts from the worry that players feel cheated when a game adjusts itself. The paper sets out requirements for adjustment that does not disrupt the core experience, presents an adjustment system, and reports preliminary results that, by the author's account, challenge common assumptions about enjoyment and adjustment [@hunicke2005-dda].
  - In one lab study, a timer secretly ran slower for struggling players and faster for strong ones. It raised reported immersion and nobody noticed, though this was one 90-second session of one game [@denisova2015-adaptation].
  - A follow-up found that telling players the game adapts also raised reported immersion, whether or not adaptation was present, without weakening the effect of real adaptation [@denisova2019-expectations].
  - So disclosure need not hurt, and a playtest that mentions adaptation can inflate ratings.

## Puzzle design

- **Define the insight.** Menzel defines a puzzle as a challenge with one best solution [@menzel2016-puzzles].
  - Brett Taylor states each solution in a sentence and removes anything the sentence does not mention, because unrelated elements use up working memory. Every level needs a purpose: teaching, reinforcing, a unique moment, or a breather after hard levels [@taylor2019-puzzle-magic].
  - Traynor cut steps and options unrelated to the core idea and moved harder variants to optional puzzles [@traynor2024-parabox].
- **Limit what must be held at once.** Menzel reports a Telltale rule of never more than about five puzzle-relevant things on screen [@menzel2016-puzzles].
- **Make possible and impossible obvious.**
  - A route that is impossible must look impossible, or players keep trying it [@thorson2017-celeste].
  - Brett Taylor's warning signs are a player asking "was that right?" or repeating an impossible action [@taylor2019-puzzle-magic].
  - Cut the Rope aims for wrong approaches that look wrong [@rix2012-trainyard].
- **Ordering is design work.**
  - Traynor treats puzzle ordering as a skill as important as making puzzles, and inserts, reorders, rewrites or makes puzzles optional to patch conceptual leaps and misunderstandings [@traynor2024-parabox].
  - Menzel shows how Portal teaches the parts of a later puzzle several chambers earlier, and follows hard puzzles with easier "breather" ones [@menzel2016-puzzles].
- **Tutorials for open-ended puzzles.** Zachtronics found that full screens of text and click-here walkthroughs failed. They now build spaces where players try things while being steered toward the goal. Removing arbitrary constraints widens the range of solutions [@barth2019-zachtronics].
- **Watch the thinking.** Traynor ran about 15 full-game playtests with new players recording video and narrating their thoughts [@traynor2024-parabox].

## Evidence to collect

- **Failure:** positions, attempts per room, and time from failure back to control. Compare them with the kind of difficulty you intended.
- **Fail versus skip or quit** per level or puzzle, as Cut the Rope tracks [@rix2012-trainyard]. Zachtronics watch "bounce", players who open a puzzle and never solve it; a spike usually points at one bad puzzle [@barth2019-zachtronics].
- **Misread geometry:** log failed interactions, as Naughty Dog does with failed grabs [@shaver2018-blockmesh].
- **Comprehension:** ask testers to state the objective rather than whether it was clear [@hodent2016-onboarding]. When navigation is the question, test without the HUD or minimap [@oueijan2021-cognitive-maps], preferably with players new to the level.
- **The first session:** where new players stop, and what information they missed [@cheung2014-first-hour].
- **Discovery rate** of optional content against the rate you intended [@hill2022-pacing].

Automated playthroughs can check reachability and timing. They cannot show that people read the space, grasp the idea or enjoy the challenge. See [evaluation](evaluation.md) for playtest methods.

## Sources

- `taylor2013-principles` Dan Taylor (2013). Ten Principles for Good Level Design. Game Developers Conference 2013. https://gdcvault.com/play/1017803/Ten-Principles-for-Good-Level (GDC talk)
- `totten2019-architecture` Christopher W. Totten (2019). An Architectural Approach to Level Design: Second Edition. CRC Press. https://www.routledge.com/Architectural-Approach-to-Level-Design-Second-edition/Totten/p/book/9780815361367 (book)
- `hullett2010-fps-patterns` Kenneth Hullett and Jim Whitehead (2010). Design patterns in FPS levels. Proceedings of the Fifth International Conference on the Foundations of Digital Games (FDG 2010). https://doi.org/10.1145/1822348.1822359 (peer-reviewed)
- `shaver2018-blockmesh` David Shaver and Robert Yang (2018). Level Design Workshop: Invisible Intuition: Blockmesh and Lighting Tips to Guide Players and Set the Mood. Game Developers Conference 2018, Level Design Workshop. https://gdcvault.com/play/1025179/Level-Design-Workshop-Invisible-Intuition (GDC talk)
- `lee2017-holistic` Steve Lee (2017). Level Design Workshop: An Approach to Holistic Level Design. Game Developers Conference 2017, Level Design Workshop. https://gdcvault.com/play/1024301/Level-Design-Workshop-An-Approach (GDC talk)
- `beinkeschwartz2017-multiplayer` Elisabeth Beinke-Schwartz (2017). Level Design Workshop: Singleplayer vs. Multiplayer Level Design: A Paradigm Shift. Game Developers Conference 2017, Level Design Workshop. https://gdcvault.com/play/1024304/Level-Design-Workshop-Singleplayer-vs (GDC talk)
- `faliszek2012-portal2` Chet Faliszek and Erik Wolpaw (2012). Creating a Sequel to a Game That Doesn't Need One. Game Developers Conference 2012. https://gdcvault.com/play/1015821/Creating-a-Sequel-to-a (GDC talk)
- `silli2014-tlou` Elisabetta Silli (2014). Level Design in a Day: The Last of Us: Casting Shadows. Game Developers Conference 2014, Level Design in a Day. https://gdcvault.com/play/1020174/Level-Design-in-a-Day (GDC talk)
- `oueijan2021-cognitive-maps` Nicolas Oueijan (2021). Stop Getting Lost: Make Cognitive Maps, Not Levels. Game Developers Conference 2021. https://gdcvault.com/play/1027206/Stop-Getting-Lost-Make-Cognitive (GDC talk)
- `smith2009-rhythm` Gillian Smith et al. (2009). Rhythm-based level generation for 2D platformers. Proceedings of the 4th International Conference on Foundations of Digital Games (FDG 2009). https://doi.org/10.1145/1536513.1536548 (peer-reviewed)
- `hill2022-museum` Evan Hill (2022). Level Design Summit: Designing the Museum Flashback: 'The Last of Us Part II'. Game Developers Conference 2022, Level Design Summit. https://gdcvault.com/play/1027683/Level-Design-Summit-Designing-the (GDC talk)
- `thorson2017-celeste` Maddy Thorson (2017). Level Design Workshop: Designing 'Celeste'. Game Developers Conference 2017, Level Design Workshop. https://gdcvault.com/play/1024307/Level-Design-Workshop-Designing-Celeste (GDC talk)
- `rix2012-trainyard` Matt Rix and Semyon Voinov (2012). Level Design Case Studies: Trainyard and Cut the Rope. Game Developers Conference 2012. https://gdcvault.com/play/1015343/Level-Design-Case-Studies-Trainyard (GDC talk)
- `barth2019-zachtronics` Zach Barth and Drew Messinger-Michaels (2019). Open-Ended Puzzle Design at Zachtronics. Game Developers Conference 2019. https://gdcvault.com/play/1025715/Open-Ended-Puzzle-Design-at (GDC talk)
- `hill2022-pacing` Evan Hill (2022). Game Narrative Summit: Interactive Pacing from the Museum Flashback Level in 'The Last of Us Part II'. Game Developers Conference 2022, Game Narrative Summit. https://gdcvault.com/play/1027629/Game-Narrative-Summit-Interactive-Pacing (GDC talk)
- `hayashida2012-3d-land` Koichi Hayashida (2012). Thinking In 3D: The Development of Super Mario 3D Land. Game Developers Conference 2012. https://gdcvault.com/play/1015833/Thinking-In-3D-The-Development (GDC talk)
- `fan2012-pvz` George Fan (2012). How I Got My Mom to Play Through Plants vs. Zombies. Game Developers Conference 2012. https://gdcvault.com/play/1015327/How-I-Got-My-Mom (GDC talk)
- `andersen2016-hitman` Mette Poedenphant Andersen and Jacob Mikkelsen (2016). Level Design in 'HITMAN': Guiding Players in a Non-Linear Sandbox. GDC Europe 2016. https://gdcvault.com/play/1023849/Level-Design-in-HITMAN-Guiding (GDC talk)
- `hodent2016-onboarding` Celia Hodent (2016). The Gamer's Brain, Part 2: UX of Onboarding and Player Engagement. Game Developers Conference 2016. https://gdcvault.com/play/1022951/The-Gamer-s-Brain-Part (GDC talk)
- `andersen2012-tutorials` Erik Andersen et al. (2012). The impact of tutorials on games of varying complexity. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI 2012). https://doi.org/10.1145/2207676.2207687 (peer-reviewed)
- `cheung2014-first-hour` Gifford K. Cheung et al. (2014). The first hour experience: how the initial play can engage (or lose) new players. Proceedings of the First ACM SIGCHI Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2014). https://doi.org/10.1145/2658537.2658540 (peer-reviewed)
- `keren2018-bosses` Itay Keren (2018). Boss Up: Boss Battle Design Fundamentals and Retrospective. Game Developers Conference 2018. https://gdcvault.com/play/1024921/Boss-Up-Boss-Battle-Design (GDC talk)
- `taylor2019-puzzle-magic` Brett Taylor (2019). Puzzle Game Magic Secrets. Game Developers Conference 2019. https://gdcvault.com/play/1026440/Puzzle-Game-Magic (GDC talk)
- `menzel2016-puzzles` Jolie Menzel (2016). Level Design Workshop: Solving Puzzle Design. Game Developers Conference 2016, Level Design Workshop. https://gdcvault.com/play/1023139/Level-Design-Workshop-Solving-Puzzle (GDC talk)
- `griesemer2011-halo` Jaime Griesemer (2011). Design in Detail: Tuning the Muzzle Velocity of the Plasma Rifle Bolt on Legendary Difficulty Across the HALO Franchise. Game Developers Conference 2011. https://gdcvault.com/play/1014704/Design-in-Detail-Tuning-the (GDC talk)
- `perron2008-vgtr2` Bernard Perron and Mark J. P. Wolf (2008). The Video Game Theory Reader 2. Routledge. https://doi.org/10.4324/9780203887660-18 (book)
- `juul2013-failure` Jesper Juul (2013). The Art of Failure: An Essay on the Pain of Playing Video Games. MIT Press. https://mitpress.mit.edu/9780262529952/the-art-of-failure/ (book)
- `oliver2023-ragnarok` Adam Oliver (2023). Breaking Barriers: Combat Accessibility in 'God of War Ragnarok'. Game Developers Conference 2023. https://gdcvault.com/play/1028726/Breaking-Barriers-Combat-Accessibility-in (GDC talk)
- `meier2010-psychology` Sid Meier (2010). The Psychology of Game Design (Everything You Know Is Wrong). Game Developers Conference 2010. https://gdcvault.com/play/1012186/The-Psychology-of-Game-Design (GDC talk)
- `vandenhoogen2012-player-death` Wouter van den Hoogen et al. (2012). Between challenge and defeat: repeated player-death and game enjoyment. Media Psychology. https://doi.org/10.1080/15213269.2012.723117 (peer-reviewed)
- `traynor2024-parabox` Patrick Traynor (2024). System-Centric Puzzle Design in 'Patrick's Parabox'. Game Developers Conference 2024. https://gdcvault.com/play/1034267/System-Centric-Puzzle-Design-in (GDC talk)
- `hunicke2005-dda` Robin Hunicke (2005). The case for dynamic difficulty adjustment in games. Proceedings of the 2005 ACM SIGCHI International Conference on Advances in Computer Entertainment Technology (ACE 2005). https://doi.org/10.1145/1178477.1178573 (peer-reviewed)
- `denisova2015-adaptation` Alena Denisova and Paul Cairns (2015). Adaptation in digital games: the effect of challenge adjustment on player performance and experience. Proceedings of the 2015 Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2015). https://doi.org/10.1145/2793107.2793141 (peer-reviewed)
- `denisova2019-expectations` Alena Denisova and Paul Cairns (2019). Player experience and deceptive expectations of difficulty adaptation in digital games. Entertainment Computing. https://doi.org/10.1016/j.entcom.2018.12.001 (peer-reviewed)
