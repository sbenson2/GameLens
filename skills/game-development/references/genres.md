# Genre notes

Read this when a project is described by genre ("a roguelike deckbuilder", "a cozy sim", "a VR shooter") and you need the tensions and failure points that genre tends to bring. Genres mix, and conventions are options, not requirements. A convention earns its place only if it serves the experience the developer intends. Each block below names core tensions, common failure points and a few sourced cases, then points to the reference that goes deeper.

The cases are practitioners' lessons from specific games unless marked as research. Treat them as hypotheses to test in the project at hand.

## Platformers

**Tensions.** Precision against forgiveness. Readable hazards against visual interest. Pacing through safety, checkpoints and room length.

**Failure points.**
- Jump physics tuned by trial and error from real-world gravity, then retuned after "floaty" feedback, which breaks levels already built. Pittman instead derives gravity and launch speed from designer-facing targets (apex height, time or distance to apex), and uses a second, heavier gravity for the fall or for an early button release [@pittman2016-jump].
- Routes that look possible but are not. On Celeste, players kept attempting a tempting shortcut until the spikes were raised so it looked clearly impossible [@thorson2017-celeste].
- Safe spots placed where they drain tension. Thorson treats safety as the main pacing tool, keeping the parts of a level that do not matter to its intent easy and putting the tension where it does [@thorson2017-celeste].
- Skipping playtests. Celeste's playtests found misleading routes like the one above, and a momentum level that stumped most playtesters got an optional side path that skilled players never see [@thorson2017-celeste].

**Go deeper.** [game-feel.md](game-feel.md), [levels.md](levels.md).

## Action and melee combat

**Tensions.** Enemy count against readability. Camera closeness against awareness. Lethality against a long progression curve.

**Failure points.**
- Enemies attacking from off screen. God of War's close camera made early players panic and mash buttons. The team kept off-screen enemies in stable positions around the player, and added indicators that distinguish incoming attacks from idle and ranged enemies. Reticle-centered targeting failed, and lock-on was added late because playtesters kept asking for it [@sheth2019-god-of-war].
- Health inflation. On Ghost of Tsushima, enemy levels and armor shields made enemies feel like "sword sponges". The team kept hits-to-kill in a narrow band and moved challenge into enemy defense, aggression and damage. Harder difficulties raised enemy damage but never enemy health or stagger values [@fishman2021-ghost-lethality].

**Go deeper.** [game-feel.md](game-feel.md), [ai.md](ai.md), [balance.md](balance.md).

## Shooters

**Tensions.** Movement against cover. Weapon variety against a dominant weapon. Accuracy against pace.

**Failure points.**
- Players who retreat, hold doorways, snipe from range or kite enemies. On DOOM, those behaviors were the signs an arena was failing. The team cut reloading because players emptied every gun and then backed off. Enemies deliberately miss a moving player, and health drops scale up when the player is low [@loudy2018-doom].
- One weapon filling every role. On Halo 3, the sniper rifle had become a close-range weapon with no counter. Griesemer's approach: give each weapon a unique role, and rein in an overpowered weapon by limiting its strengths rather than adding weaknesses. The shipped fix changed the time between shots from 0.5 to 0.7 seconds, which Griesemer verified in play with both reasoning and trained gut feel [@griesemer2010-halo3-sniper].
- Telling playtesters what changed. Griesemer advises not to, and to prefer "I don't like this because" over suggested fixes [@griesemer2010-halo3-sniper].

**Go deeper.** [balance.md](balance.md), [ai.md](ai.md), [levels.md](levels.md).

## Fighting games

**Tensions.** Depth against approachability. Perfect information and near-zero randomness against the pain of losing. Tight timing against network latency.

**Failure points.**
- Assuming a training mode fixes onboarding. Sasso notes that fighters give little randomness to soften skill gaps. Good training modes mainly help players who are already motivated, and can widen the gap between players. Toggled assist modes carry stigma and wall players off from real play. Sasso prefers always-on simplified inputs built from real techniques, and input rules shared across characters [@sasso2019-fighting-approachability].
- Delay-based netcode whose input lag varies with the connection. NetherRealm moved to rollback with a constant input delay plus rollback frames. It kept cinematics outside rollback and, for user-experience reasons, never rolled back across a camera cut [@stallone2018-rollback].

**Go deeper.** [multiplayer.md](multiplayer.md), [accessibility.md](accessibility.md), [game-feel.md](game-feel.md).

## Roguelikes and deckbuilders

**Tensions.** Randomness against planning. Build variety against dominant combinations. Repetition against freshness across runs.

**Failure points.**
- Stacked unpredictability. Slay the Spire's early enemies rolled random moves, so players could not judge how much to block. The team went through many versions of enemy intents to fix it. Their balance goal was that every card has a place, not equal power [@giovannetti2019-slay-the-spire].
- Reading raw win data naively. On Slay the Spire, one card looked strong in winning decks only because players usually got it from an event late in Act 3, just before the boss [@giovannetti2019-slay-the-spire].
- Missing tools. On Spelunky 2, Derek Yu invested in debug tools (spawning, replays, slow motion) that Yu had avoided on the first game. Its rollback online mode launched in poor shape on console [@yu2021-spelunky2].
- A story that ignores repetition. Hades was built so that each death advances the story, with dialogue eligibility rules that track what the player has done [@kasavin2021-hades-dialogue].

**Go deeper.** [balance.md](balance.md), [procedural-generation.md](procedural-generation.md), [narrative.md](narrative.md).

## Card games

**Tensions.** Complexity against depth. Fun against correct play. Rules text against learnability.

**Failure points.**
- Mechanics that ask players to act against their habits. Magic's designers changed a rule rather than keep fighting players' instinct, and learned that an interesting mechanic is not necessarily fun. They want the fun play to also be the winning one [@rosewater2016-lessons].
- Simplifying away depth. Hearthstone removed summoning sickness to simplify and found the game much worse, so it went back in [@dodds2014-hearthstone].
- Cards new players must stop and parse. Hearthstone reworded or cut them [@dodds2014-hearthstone].
- Effects that feel bad for the opponent. Hearthstone avoided discard and counterspell effects, and raised a card's cost for emotional rather than numerical reasons [@dodds2014-hearthstone].

**Go deeper.** [balance.md](balance.md), [design.md](design.md).

## Strategy and 4X

**Tensions.** Decision depth against decision count. Hidden information against planning. Early-game ease against late-game tedium.

**Failure points.**
- Decisions that are dominant, random or irrelevant. Meier's markers of interesting decisions are trade-offs, dependence on the current situation, persistence, and enough information. For Civilization's technology choices, Meier's team found three to five options comfortable, where early designs offering seven to twelve risked overwhelming players [@meier2012-decisions].
- Rules that produce the opposite of the intended play. Civilization's wargame-style zones of control, meant to create border lines, produced unit stacks instead. Randomly withholding a technology frustrated players who planned routes. A rise-and-fall design failed because players reloaded to avoid setbacks [@meier2017-civilization].
- Full information that trivializes threat. On Into the Breach, showing every enemy attack made dodging trivial until immobile buildings gave players something to defend. A turn limit replaced kill-all victory. The strategy layer shrank from a board-game map to picking missions [@davis2019-into-the-breach].

**Go deeper.** [design.md](design.md), [balance.md](balance.md), [ai.md](ai.md).

## Puzzle games

**Tensions.** Discovery against frustration. Rule purity against edge cases. Difficulty against the number of things to consider.

**Failure points.**
- Puzzles that are too hard because of too many steps, or because the needed information was given long ago. Puzzles that are too easy because they are over-tutorialized or pure lock-and-key. Menzel describes three dials: steps before feedback, new mechanics or information, and new uses of known mechanics. At Telltale, puzzles kept to about five relevant things on screen [@menzel2016-puzzles].
- Rule systems whose edge cases players can reach. Baba Is You hid known parser edge cases by not giving players the pieces to trigger them. A level editor with sharing removes that protection [@teikari2020-baba-is-you].
- Complexity used for climax. Portal's complex boss prototypes slowed pacing. A simple puzzle under time pressure felt more climactic [@swift2008-portal].

**Go deeper.** [levels.md](levels.md).

## Role-playing games

**Tensions.** Role-play against optimization. Build freedom against viability. Branching against production cost.

**Failure points.**
- The best mechanical option clashes with the character the player is playing. Sawyer calls this choice conflict and saw it in Fallout: New Vegas speech checks. Players could kill almost anyone, and the first main quest used independent information steps that players could skip or take in any order. Many small, local reactions read as a rich world while staying cheap to script [@sawyer2012-new-vegas-choice].
- Builds that are traps. Pillars of Eternity aimed for no unviable builds. Re-centering attributes so 10 is neutral made players refuse to go below 10. Sawyer attributes this to loss aversion and calls the evidence anecdotal [@sawyer2016-pillars-attributes].
- Quests and consequences players never notice. See the quest lessons in [narrative.md](narrative.md) [@sasko2023-quest-lessons].

**Go deeper.** [narrative.md](narrative.md), [balance.md](balance.md), [systems.md](systems.md).

## Open worlds

**Tensions.** Freedom against pacing and coherence. Density against believability. Guidance against discovery.

**Failure points.**
- Empty stretches. On Ghost of Tsushima, Sucker Punch set a limit, learned from players' patience, of about 30 seconds of travel without something visible drawing the player, and thinned foliage to open sight lines [@hamilton2021-tsushima-exploration].
- A compass that pulls eyes off the world. Ghost of Tsushima replaced it with a guiding wind [@hamilton2021-tsushima-exploration].
- Quest structures that break under free order. Aarseth notes the more story-like games tend to be more spatially constrained [@aarseth2005-quest-theory]. inkle's encounter-based alternative is in [narrative.md](narrative.md) [@ingold2017-narrative-sorcery].
- Even small open worlds need observed playtests. Several of A Short Hike's fixes came from watching playtesters: a cave back to the tutorial for players who swam around it, and a missed optional item placed in several spots [@robinsonyu2020-short-hike].

**Go deeper.** [levels.md](levels.md), [narrative.md](narrative.md), [procedural-generation.md](procedural-generation.md).

## Horror

**Tensions.** Dread against repetition. Vulnerability against frustration. Safety against the fear of its loss.

**Failure points.**
- Deaths that turn the unknown into the known. On FAITH, one-hit deaths raised tension, but retries drained it. Mason Smith used QA playthroughs to find deaths and added generous respawn and save points. Smith's other methods: judge every feature by the intended emotion (dread more than shock), turn existing mechanics against the player, and remove detail to keep the unknown [@smith2021-faith-horror].
- Assuming the display does not matter. In a lab experiment with students, playing a survival horror game in VR produced more presence than on a TV; self-reported fear was not significantly higher overall, but presence had an indirect effect that raised fear [@lemmens2022-fear-vr].

**Go deeper.** [presentation.md](presentation.md), [levels.md](levels.md), [accessibility.md](accessibility.md).

## Simulation, management and cozy games

**Tensions.** Simulation fidelity against legibility. Challenge against a low-stress promise. Emergent story against player control.

**Failure points.**
- Failure spirals that end the story. On RimWorld, Sylvester made failure elastic: raiders often loot or kidnap and leave, and poor colonies get lower expectations. Sylvester tests features by whether they enrich characters' emotional stories, which ruled out requested deep crafting chains [@sylvester2017-rimworld].
- Correct but lifeless behavior. The Sims picks randomly among top-scoring actions so characters make mistakes players want to fix. Ambiguity (Simlish, thought balloons) leaves room for the player's story, and a wrong specific detail is worse than none [@brown2018-sims-storytelling].
- Timers or decay tuned to realism. The Sims 2 tuned wants and fears to fade over a span players would remember, rather than to realism [@brown2018-sims-storytelling].

**Go deeper.** [systems.md](systems.md), [ai.md](ai.md), [balance.md](balance.md).

## Sports and racing

**Tensions.** Physical plausibility against responsive handling. Stakes against frustration. Social competition against schedules.

**Failure points.**
- Physics that are realistic but not playable. Rocket League runs physics at a fixed 120 Hz with deliberately simplified car handling [@cone2018-rocket-league].
- Friends who are never online together. Need for Speed: Hot Pursuit built asynchronous competition around "a friend beat you", because players' friends were rarely online at the same time [@svensson2016-hot-pursuit].
- Nothing at stake. Foddy argues that quicksave, freely repeatable attempts and pay-to-win erode the stakes and integrity that make real sports matter [@foddy2013-real-sports].

**Go deeper.** [game-feel.md](game-feel.md), [multiplayer.md](multiplayer.md).

## Mobile and free-to-play

**Tensions.** Session length against depth. Revenue against trust. Content pace against production pace.

**Failure points.**
- Economies balanced on stats alone. Losi balances around time: how fast players acquire content. Losi's constraints: players must not earn content faster than the team makes it, events must be finishable in their window, and an upgrade must never pay less [@losi2018-mobile-time].
- Optimizing one revenue line in isolation. Kongregate's data showed spending concentrated in a small share of players. In some of its A/B tests, making incentivized ad offers more prominent raised offer revenue but lowered total revenue, though Greer did not think that outcome was inevitable [@greer2015-whales].
- Chance-based paid rewards. In a large self-selected survey, loot box spending was linked to problem gambling severity more strongly than other in-game spending. The direction of cause was not established [@zendle2018-loot-boxes].

**Go deeper.** [balance.md](balance.md), [evaluation.md](evaluation.md).

## VR

**Tensions.** Presence against comfort. Physical freedom against a small play space. Expectation that objects behave like real ones against scope.

**Failure points.**
- Locomotion chosen by habit. In one study, steering locomotion was more sickening than teleporting on average, but some participants were sicker when teleporting, and standing raised presence without changing sickness [@clifton2020-vr-locomotion].
- Point-anywhere teleport. Owlchemy found it tiring and hard to judge. Automatic world rotation disoriented players in every test. Food that could not really be eaten confused players, so it was rebuilt as general systems (stacking, slicing, bites) [@reimer2019-job-vacation-sim].
- Camera moves the player did not make. Astro Bot made the head the only camera, ran levels in one direction, never moved the player backwards, and cut most full 360-degree moments as tiring [@doucet2019-astro-bot].
- Underestimating presence. In the lab study cited under Horror, VR increased presence in a horror game and presence was linked to more fear, though overall fear was not significantly higher than on a TV [@lemmens2022-fear-vr].

**Go deeper.** [game-feel.md](game-feel.md), [accessibility.md](accessibility.md), [presentation.md](presentation.md).

## Narrative-focused games

**Tensions.** Authorship against agency. Pacing against exploration. Branching against production cost.

**Failure points.**
- Pushing story at players. Outer Wilds uses curiosity as the only driver and knowledge as the only reward. Information is pulled, not pushed. With no gates, small story arcs pay off in any order, and the ship log records only what the player certainly knows [@beachum2021-outer-wilds].
- Failure states that break the story's continuity. Firewatch had none, and treated every player action as part of one continuous story [@remo2019-firewatch-design].
- Branches that multiply without being felt. As Dusk Falls stopped subdividing at roughly eight to ten outcomes per junction [@kane2023-as-dusk-falls].

**Go deeper.** [narrative.md](narrative.md).

## Sources

- `pittman2016-jump` Kyle Pittman (2016). Math for Game Programmers: Building A Better Jump. Game Developers Conference 2016. https://gdcvault.com/play/1023148/Math-for-Game-Programmers-Building (GDC talk)
- `thorson2017-celeste` Maddy Thorson (2017). Level Design Workshop: Designing 'Celeste'. Game Developers Conference 2017, Level Design Workshop. https://gdcvault.com/play/1024307/Level-Design-Workshop-Designing-Celeste (GDC talk)
- `sheth2019-god-of-war` Mihir Sheth (2019). Evolving Combat in 'God of War' for a New Perspective. Game Developers Conference 2019. https://gdcvault.com/play/1026085/Evolving-Combat-in-God-of (GDC talk)
- `fishman2021-ghost-lethality` Theodore Fishman (2021). Honoring the Blade: Lethality and Combat Balance in 'Ghost of Tsushima'. Game Developers Conference 2021. https://gdcvault.com/play/1027076/Honoring-the-Blade-Lethality-and (GDC talk)
- `loudy2018-doom` Kurt Loudy and Jake Campbell (2018). Embracing Push Forward Combat in 'DOOM'. Game Developers Conference 2018. https://gdcvault.com/play/1024940/Embracing-Push-Forward-Combat-in (GDC talk)
- `griesemer2010-halo3-sniper` Jaime Griesemer (2010). Design in Detail: Changing the Time Between Shots for the Sniper Rifle from 0.5 to 0.7 Seconds for Halo 3. Game Developers Conference 2010. https://gdcvault.com/play/1012211/Design-in-Detail-Changing-the (GDC talk)
- `sasso2019-fighting-approachability` Noah Sasso (2019). '09 to '19: A Decade of Approachability in Fighting Games. Game Developers Conference 2019. https://gdcvault.com/play/1025792/-09-to-19-A (GDC talk)
- `stallone2018-rollback` Michael Stallone (2018). 8 Frames in 16ms: Rollback Networking in 'Mortal Kombat' and 'Injustice 2'. Game Developers Conference 2018. https://gdcvault.com/play/1025021/8-Frames-in-16ms-Rollback (GDC talk)
- `giovannetti2019-slay-the-spire` Anthony Giovannetti (2019). 'Slay the Spire': Metrics Driven Design and Balance. Game Developers Conference 2019. https://gdcvault.com/play/1025731/-Slay-the-Spire-Metrics (GDC talk)
- `yu2021-spelunky2` Derek Yu (2021). Independent Games Summit: One More Run: The Making of 'Spelunky 2'. Game Developers Conference 2021. https://gdcvault.com/play/1027187/Independent-Games-Summit-One-More (GDC talk)
- `kasavin2021-hades-dialogue` Greg Kasavin and Darren Korb (2021). Breathing Life into Greek Myth: The Dialogue of 'Hades'. Game Developers Conference 2021. https://gdcvault.com/play/1026975/Breathing-Life-into-Greek-Myth (GDC talk)
- `rosewater2016-lessons` Mark Rosewater (2016). Twenty Years, Twenty Lessons. Game Developers Conference 2016. https://gdcvault.com/play/1022941/Twenty-Years-Twenty (GDC talk)
- `dodds2014-hearthstone` Eric Dodds (2014). Hearthstone: 10 Bits of Design Wisdom. Game Developers Conference 2014. https://gdcvault.com/play/1020775/Hearthstone-10-Bits-of-Design (GDC talk)
- `meier2012-decisions` Sid Meier (2012). Interesting Decisions. Game Developers Conference 2012. https://gdcvault.com/play/1015756/Interesting (GDC talk)
- `meier2017-civilization` Sid Meier and Bruce Shelley (2017). Classic Game Postmortem: 'Sid Meier's Civilization'. Game Developers Conference 2017. https://gdcvault.com/play/1024294/Classic-Game-Postmortem-Sid-Meier (GDC talk)
- `davis2019-into-the-breach` Matthew Davis (2019). 'Into the Breach' Design Postmortem. Game Developers Conference 2019. https://gdcvault.com/play/1025772/-Into-the-Breach-Design (GDC talk)
- `menzel2016-puzzles` Jolie Menzel (2016). Level Design Workshop: Solving Puzzle Design. Game Developers Conference 2016, Level Design Workshop. https://gdcvault.com/play/1023139/Level-Design-Workshop-Solving-Puzzle (GDC talk)
- `teikari2020-baba-is-you` Arvi Teikari (2020). Reading the Rules of 'Baba Is You'. Game Developers Conference 2020. https://gdcvault.com/play/1026590/Reading-the-Rules-of-Baba (GDC talk)
- `swift2008-portal` Kim Swift and Erik Wolpaw (2008). A PORTAL Post-Mortem: Integrating Writing and Design. Game Developers Conference 2008. https://gdcvault.com/play/197/A-PORTAL-Post-Mortem-Integrating (GDC talk)
- `sawyer2012-new-vegas-choice` Joshua Sawyer (2012). Do (Say) The Right Thing: Choice Architecture, Player Expression, and Narrative Design in Fallout: New Vegas. Game Developers Conference 2012. https://gdcvault.com/play/1015758/Do-(Say)-The-Right-Thing (GDC talk)
- `sawyer2016-pillars-attributes` Josh Sawyer (2016). Gods and Dumps: Attribute Tuning in 'Pillars of Eternity'. Game Developers Conference 2016. https://gdcvault.com/play/1023117/Gods-and-Dumps-Attribute-Tuning (GDC talk)
- `sasko2023-quest-lessons` Paweł Sasko (2023). 10 Key Quest Design Lessons from 'The Witcher 3' and 'Cyberpunk 2077'. Game Developers Conference 2023. https://gdcvault.com/play/1028897/10-Key-Quest-Design-Lessons (GDC talk)
- `hamilton2021-tsushima-exploration` Parker Hamilton (2021). Exploration in Ghost of Tsushima: Letting the Island Guide You. Game Developers Conference 2021. https://gdcvault.com/play/1027399/Exploration-in-Ghost-of-Tsushima (GDC talk)
- `aarseth2005-quest-theory` Espen Aarseth (2005). From Hunt the Wumpus to EverQuest: Introduction to Quest Theory. Entertainment Computing: ICEC 2005, Lecture Notes in Computer Science 3711. https://doi.org/10.1007/11558651_48 (peer-reviewed)
- `ingold2017-narrative-sorcery` Jon Ingold (2017). Narrative Sorcery: Coherent Storytelling in an Open World. Game Developers Conference 2017. https://gdcvault.com/play/1023989/Narrative-Sorcery-Coherent-Storytelling-in (GDC talk)
- `robinsonyu2020-short-hike` Adam Robinson-Yu (2020). Independent Games Summit: Crafting A Tiny Open World: 'A Short Hike' Postmortem. Game Developers Conference 2020. https://gdcvault.com/play/1026613/Independent-Games-Summit-Crafting-A (GDC talk)
- `smith2021-faith-horror` Mason Smith (2021). MORTIS 101: 'FAITH's' Horror Design Toolkit. Game Developers Conference 2021. https://gdcvault.com/play/1027195/MORTIS-101-FAITH-s-Horror (GDC talk)
- `lemmens2022-fear-vr` Jeroen S. Lemmens et al. (2022). Fear and loathing in VR: the emotional and physiological effects of immersive games. Virtual Reality. https://doi.org/10.1007/s10055-021-00555-w (peer-reviewed)
- `sylvester2017-rimworld` Tynan Sylvester (2017). 'RimWorld': Contrarian, Ridiculous, and Impossible Game Design Methods. Game Developers Conference 2017. https://gdcvault.com/play/1024232/-RimWorld-Contrarian-Ridiculous-and (GDC talk)
- `brown2018-sims-storytelling` Matt Brown (2018). Emergent Storytelling Techniques in 'The Sims'. Game Developers Conference 2018. https://gdcvault.com/play/1025112/Emergent-Storytelling-Techniques-in-The (GDC talk)
- `cone2018-rocket-league` Jared Cone (2018). It IS Rocket Science! The Physics of 'Rocket League' Detailed. Game Developers Conference 2018. https://gdcvault.com/play/1024972/It-IS-Rocket-Science-The (GDC talk)
- `svensson2016-hot-pursuit` James Svensson (2016). Beat it. A Retrospective of 'Need for Speed: Hot Pursuit'. Game Developers Conference 2016. https://gdcvault.com/play/1022991/Beat-it-A-Retrospective-of (GDC talk)
- `foddy2013-real-sports` Bennett Foddy (2013). Making it Matter: Lessons from Real Sports. Game Developers Conference 2013. https://gdcvault.com/play/1017925/Making-it-Matter-Lessons-from (GDC talk)
- `losi2018-mobile-time` Evan Losi (2018). It's About Time: System Design for Mobile Free-to-Play. Game Developers Conference 2018. https://gdcvault.com/play/1025168/It-s-About-Time-System (GDC talk)
- `greer2015-whales` Emily Greer (2015). Don't Call Them Whales: F2P Spenders and Virtual Value. Game Developers Conference 2015. https://gdcvault.com/play/1021941/Don-t-Call-Them-Whales (GDC talk)
- `zendle2018-loot-boxes` David Zendle and Paul Cairns (2018). Video game loot boxes are linked to problem gambling: Results of a large-scale survey. PLOS ONE. https://doi.org/10.1371/journal.pone.0206767 (peer-reviewed)
- `clifton2020-vr-locomotion` Jeremy Clifton and Stephen Palmisano (2020). Effects of steering locomotion and teleporting on cybersickness and presence in HMD-based virtual reality. Virtual Reality. https://doi.org/10.1007/s10055-019-00407-8 (peer-reviewed)
- `reimer2019-job-vacation-sim` Devin Reimer and Andrew Eiche (2019). Lessons Learned from 'Job Simulator' to 'Vacation Simulator': Advanced Interactions for Room-Scale VR. Game Developers Conference 2019. https://gdcvault.com/play/1025757/Lessons-Learned-from-Job-Simulator (GDC talk)
- `doucet2019-astro-bot` Nicolas Doucet (2019). Making of 'ASTRO BOT Rescue Mission': Reinventing Platformers for VR. Game Developers Conference 2019. https://gdcvault.com/play/1025746/Making-of-ASTRO-BOT-Rescue (GDC talk)
- `beachum2021-outer-wilds` Kelsey Beachum (2021). Independent Games Summit: Sparking Curiosity-Driven Exploration Through Narrative in 'Outer Wilds'. Game Developers Conference 2021. https://gdcvault.com/play/1027008/Independent-Games-Summit-Sparking-Curiosity (GDC talk)
- `remo2019-firewatch-design` Chris Remo (2019). Interactive Story Without Challenge Mechanics: The Design of 'Firewatch'. Game Developers Conference 2019. https://gdcvault.com/play/1026087/Interactive-Story-Without-Challenge-Mechanics (GDC talk)
- `kane2023-as-dusk-falls` Brad Kane (2023). A Narrative Multiverse: The Branching Structure of 'As Dusk Falls'. Game Developers Conference 2023. https://gdcvault.com/play/1028903/A-Narrative-Multiverse-The-Branching (GDC talk)
