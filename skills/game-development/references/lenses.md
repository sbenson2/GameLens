# Diagnostic lenses

Read this when a developer describes a symptom and you need to pick an angle quickly: "feels grindy", "nobody uses the shotgun", "players quit at level 2". Each lens names when it applies, the idea behind it, questions to ask, red flags you can spot in code or data, first moves, and the reference file that goes deeper. Pick one or two lenses, apply them to the developer's intended experience, and drop any advice that conflicts with it. The lens names are this skill's own labels; the ideas are attributed to their sources.

| Lens | Typical phrasing | Deeper reference |
| --- | --- | --- |
| 1. Experience first | "works but isn't fun", "what should this feel like?" | [design](design.md) |
| 2. Prototype the question | "we'll know once the systems are in" | [production](production.md) |
| 3. Interesting decisions | "nobody uses the shotgun", "everyone picks the same build" | [design](design.md), [balance](balance.md) |
| 4. Loops and sessions | "feels grindy", "what does the player actually do?" | [design](design.md), [systems](systems.md) |
| 5. Learnable patterns | "boring after an hour", "players bounce off" | [design](design.md), [levels](levels.md) |
| 6. Challenge and control | "players quit at level 2", "difficulty spike" | [levels](levels.md), [accessibility](accessibility.md) |
| 7. Teach through play | "nobody reads the tutorial", "first minutes are confusing" | [levels](levels.md) |
| 8. One idea at a time | "levels feel samey", "how do I order puzzles?" | [levels](levels.md) |
| 9. Needs over types | "who is this for?", "explorers vs achievers" | [design](design.md), [evaluation](evaluation.md) |
| 10. Readable uncertainty | "RNG feels unfair", "players say it cheats" | [design](design.md), [balance](balance.md) |
| 11. Systems that multiply | "we need more content", "only one solution" | [systems](systems.md), [design](design.md) |
| 12. Numbers that tell the truth | "X is overpowered", "economy is inflating" | [balance](balance.md) |
| 13. Feel and feedback | "floaty", "combat lacks impact" | [game-feel](game-feel.md) |
| 14. Watch, don't ask | "testers said it was fine", "add what players asked for?" | [evaluation](evaluation.md) |
| 15. A whole game you can finish | "just one more system", "90% done for months" | [production](production.md) |
| 16. Mechanics carry the fiction | "story and gameplay feel disconnected" | [narrative](narrative.md), [presentation](presentation.md) |

## 1. Experience first

- **Applies when:** "it works but it isn't fun", "the game feels generic", "lots of features, no identity", or at the start of a project.
- **Idea:** MDA separates rules (mechanics), their run-time behavior (dynamics) and the emotional responses sought (aesthetics); designers build from mechanics while players meet aesthetics first [@hunicke2004-mda]. Fullerton's process starts from written player experience goals rather than features [@fullerton2018-workshop].
- **Ask:**
  - What should players feel and do in a typical minute?
  - Which observable behavior would show that is happening?
  - Which experience goal does each backlog item serve?
  - When a test felt wrong, was it the rule, the behavior it produced, or the feeling?
  - Would anyone notice the experience change if this feature were removed?
- **Red flags:** backlog items with no linked goal; constants tuned by feel with no named target behavior; a mechanic that works as specified while testers use it to avoid the intended play (hoarding, kiting, camping).
- **Try:** write two or three experience goals and tag each backlog item to one; for each mechanic write "this should make players ___, which should feel ___"; build toward the key moment, as Hi-Fi RUSH did by guaranteeing that hits land on the beat [@johanas2024-hifi-rush].
- **Deeper:** [design](design.md).

## 2. Prototype the question

- **Applies when:** "we'll know if it's fun once the systems are in", "architecture first", months of framework code and no playable build, "is this idea any good?"
- **Idea:** A prototype should answer one clearly stated, falsifiable question cheaply and fake whatever the question does not need [@gingold2006-prototyping]. Breath of the Wild's team first tested multiplicative interactions in a prototype drawn with simple top-down 2D graphics [@fujibayashi2017-botw], and Francis filters ideas by how much must be built before knowing whether they work [@francis2018-scope].
- **Ask:**
  - What is the riskiest assumption in the design?
  - Which question does the current work answer?
  - What is the smallest build that would answer it?
  - How much has to exist before you can tell?
  - Who outside the team has played it?
- **Red flags:** save systems, settings menus, ECS or editor tooling before a playable loop; tuning values still compiled constants at first guesses; prototype code being hardened for production.
- **Try:** state the question and the observation that would answer it; fake assets, AI and UI the question does not need; discard the code once answered.
- **Deeper:** [production](production.md), [evaluation](evaluation.md).

## 3. Interesting decisions

- **Applies when:** "nobody uses the shotgun", "everyone picks the same build", "choices feel pointless", "players click through the upgrade screen".
- **Idea:** Meier calls a choice uninteresting when players always pick the same option or pick at random; interesting choices carry a trade-off, depend on the situation, can express style, and come with information proportional to how long they last [@meier2012-decisions]. Players pursue good strategies, so a dull optimal strategy makes a dull game [@juul2002-emergence].
- **Ask:**
  - Would two skilled players choose differently here?
  - In which situations does the unused option win, and do those situations occur?
  - Can a new player reason about the consequence before committing?
  - Does the information available match how long the choice persists?
  - Is the effective strategy also the enjoyable one?
- **Red flags:** upgrade nodes that are only `stat *= 1.1`; pick rates aggregated across all situations; encounter tables where one enemy mix dominates; a resource that never runs short, so options never compete.
- **Try:** change the situation mix or price before redesigning the option; make each option situationally strong and readable; cut choices that never matter; prefer new capabilities to stacked stats, as Deathloop did [@mcclure2024-deathloop].
- **Deeper:** [design](design.md), [balance](balance.md).

## 4. Loops and sessions

- **Applies when:** "what does the player actually do?", "feels grindy", "players stop after one session", "the meta feels bolted on", "the endgame is empty".
- **Idea:** Koster describes play as a loop of action, mechanic, feedback and an updated mental model [@koster2012-fun-10-years]. Meier attributes Civilization's pull to short, medium and long-term goals running at once, and warns that something interesting once is not interesting ten times [@meier2012-decisions].
- **Ask:**
  - Can you state the 30-second loop as verbs?
  - What does one iteration pay the player: information, resources, progress?
  - Where does a session end, and is that by design or by frustration?
  - Which systems feed no loop at all?
  - What differs between the first and the fiftieth iteration?
- **Red flags:** fixed waits (respawns, transitions) longer than the actions they frame; meta-progression whose only input is time or logins; late tiers built as scaled copies of early ones.
- **Try:** time real iterations including menus and deaths; give sessions a designed stopping point; keep the number of things to manage roughly constant as power grows [@meier2012-decisions]; check return incentives against dark patterns such as playing by appointment [@zagal2013-dark-patterns].
- **Deeper:** [design](design.md), [systems](systems.md).

## 5. Learnable patterns

- **Applies when:** "boring after an hour", "players figured it out and stopped", "players bounce off immediately", "it's solved", "repetitive".
- **Idea:** Koster argues that fun is the feedback of absorbing patterns, so a game bores both when its pattern is mastered and when it is too hard to read [@koster2013-fun]. Deterding and colleagues model enjoyment as reducing uncertainty faster than expected, which tracks learning progress [@deterding2022-uncertainty].
- **Ask:**
  - What is the player learning in minute one, hour one, hour ten?
  - When testers got bored, had they mastered the pattern or failed to find it?
  - Does new content change how existing patterns read, or only the numbers?
  - Is there skill in when to act, not only in what to do [@koster2024-revisiting-fun]?
- **Red flags:** new content added as data rows reusing the same behavior; identical opening sequences across logged runs; input variety that flattens after the first hour.
- **Try:** list what is learned at each stage and fill flat stretches with variations that force a re-read; run Koster's missing-fun checklist on each feature (more than one good arrangement, skill in timing, graded rather than pass-fail outcomes) [@koster2024-revisiting-fun].
- **Deeper:** [design](design.md), [levels](levels.md).

## 6. Challenge and control

- **Applies when:** "too hard", "too easy", "players quit at level 2", "difficulty spike", "rage quits", "should we add difficulty settings or adaptive difficulty?"
- **Idea:** GameFlow organizes enjoyment heuristics around flow elements such as challenge, skills, clear goals and feedback [@sweetser2005-gameflow], while Koster separates flow from fun and notes that games often create fun through frustration then breakthrough [@koster2024-revisiting-fun]. Who controls difficulty is contested: Chen favored player-steered challenge over visible computer adjustment [@chen2007-flow], yet in one short lab study hidden adaptation raised immersion and went unnoticed [@denisova2015-adaptation].
- **Ask:**
  - Where exactly do players fail and quit, according to data rather than memory?
  - After failing, do they know why?
  - How long from failure to the next attempt?
  - Which challenges are the intended experience and which are incidental barriers?
  - Who chooses the difficulty, and do players know the options exist?
- **Red flags:** no per-encounter death or retry logging; respawn far from the challenge; difficulty settings that only multiply health and damage; an assist that stays on silently (God of War Ragnarok moved a forgotten checkpoint option and added a reminder on death) [@oliver2023-ragnarok].
- **Try:** log failures per encounter and look for spikes; shorten the retry loop; separate access options from challenge options [@cairns2019-apx-vocabulary]; add optional teaching routes where most testers stall, as Celeste did [@thorson2017-celeste].
- **Deeper:** [levels](levels.md), [accessibility](accessibility.md), [balance](balance.md).

## 7. Teach through play

- **Applies when:** "nobody reads the tutorial", "players don't understand X", "the first five minutes are confusing", "people quit during onboarding".
- **Idea:** For Plants vs. Zombies, Fan blended the tutorial into play, had players do rather than read, spread teaching across the game, kept on-screen words few, and showed some hints only to players who made the specific mistake [@fan2012-pvz]. Tutorials are not always worth it: in an online experiment with three of the researchers' own games, they raised engagement only in the most complex one [@andersen2012-tutorials].
- **Ask:**
  - Could a player who reads nothing reach minute ten?
  - How many new concepts arrive in the first five minutes?
  - Does the player perform each new action soon after it is introduced?
  - Can testers state the current objective when asked [@hodent2016-onboarding]?
  - Does anything pause play to explain?
- **Red flags:** modal popups that freeze the game loop; every system unlocked at the start; onboarding that kills or penalizes new players (in Fortnite's alpha, players who struggled during onboarding were more likely to leave) [@hodent2016-onboarding].
- **Try:** introduce each mechanic where failure is cheap and the mechanic is the way forward; trigger hints from the specific failure; watch three new players without helping and fix the first thing all of them hit.
- **Deeper:** [levels](levels.md), [presentation](presentation.md).

## 8. One idea at a time

- **Applies when:** "levels feel samey", "filler levels", "we introduce a mechanic and never use it again", "how do I order my puzzles?", or the developer frames levels as "introduce, develop, twist, conclude" (kishōtenketsu); treat that framing as a working tool to test, not a documented Nintendo method ([levels](levels.md) covers one practitioner's use of it and why the attribution is unverified).
- **Idea:** Taylor's level principles include levels that keep introducing or subverting mechanics [@taylor2013-principles]; Celeste primes each mechanic before requiring it [@thorson2017-celeste]; Traynor treated puzzle ordering as a skill as important as making puzzles and found ideas by pairing each mechanic with every other [@traynor2024-parabox].
- **Ask:**
  - What is this level about, in one phrase?
  - Where is the idea met safely, then developed, then combined with something known?
  - Is any mechanic introduced and then abandoned?
  - Could the level teach its idea without text?
- **Red flags:** levels named only by number with no stated idea; a mechanic flag enabled in one level's data and never again; the hardest moment in the middle followed by a flat walk to the exit.
- **Try:** write each level's idea and beats before building; pair each mechanic with every other to generate candidates; reorder by observed completion rather than intended difficulty.
- **Deeper:** [levels](levels.md).

## 9. Needs over types

- **Applies when:** "who is this for?", "we need something for explorers", "retention is low", "players don't care about progression", "should we add PvP or crafting for other player types?"
- **Idea:** In lab and survey studies, perceived autonomy, competence and, in multiplayer games, relatedness predicted enjoyment and intended future play [@ryan2006-motivation]. In an MMORPG sample, motivation components did not suppress each other [@yee2006-motivations], and a meta-synthesis warns that "player type" wrongly implies exclusive categories [@hamari2014-player-types].
- **Ask:**
  - Where in the loop does the player feel competent, choose freely, or connect with others?
  - Can players feel themselves improving apart from stat increases?
  - Are the controls a barrier to competence [@przybylski2010-engagement]?
  - Which motives does the game serve strongly, and which not at all?
- **Red flags:** progression that is only numeric; one optimal path through all content; streaks and dailies added before the core loop satisfies anyone.
- **Try:** write a motive profile (served strongly, deliberately not served); mark competence, autonomy and relatedness moments on the loop; test control mastery separately from challenge.
- **Deeper:** [design](design.md), [evaluation](evaluation.md).

## 10. Readable uncertainty

- **Applies when:** "RNG feels unfair", "players say the game cheats", "players save-scum", "the fog of war is annoying", "matches are decided early".
- **Idea:** Interviews link engaging uncertainty to three sources (the game, the player, the outcome) and to curiosity and competence [@kumari2019-uncertainty]. Meier treats information as a lever that can make a decision more or less interesting, and reports that Civilization Revolution players felt cheated by losses at odds they considered safe and objected to losing two 2:1 battles in a row, so later rolls took earlier results into account [@meier2012-decisions; @meier2010-psychology].
- **Ask:**
  - Which uncertainty is intended: how the system behaves, whether the player can execute, or how it turns out?
  - What does the player know at the moment of commitment?
  - Do the odds players feel match the odds in the code?
  - Does the outcome stay open until late in a match or run [@koster2024-revisiting-fun]?
  - Do players know why they were rewarded [@lewisevans2017-rewards]?
- **Red flags:** `Random.value < p` with p never shown; independent rolls that allow long losing streaks on important actions; reloading rerolls outcomes because the seed is not saved (Civilization Revolution saved it) [@meier2010-psychology]; the winner obvious long before the end.
- **Try:** show odds or ranges before commitment; decide per mechanic whether streaks should be bounded; reveal information in stages that shape decisions instead of hiding everything.
- **Deeper:** [design](design.md), [balance](balance.md).

## 11. Systems that multiply

- **Applies when:** "we need more content", "the world feels static", "every puzzle has one solution", "players can't be creative", "combinations don't work".
- **Idea:** Breath of the Wild replaced puzzle-specific objects with consistent rules under which objects react to actions and to each other; its chemistry engine lets elements change materials and each other, but not materials change materials [@fujibayashi2017-botw]. Juul separates emergence (few rules, many variations, strategy guides) from progression (authored sequences, walkthroughs) [@juul2002-emergence].
- **Ask:**
  - How many pairs of systems actually interact?
  - Is each interaction derived from shared properties or special-cased?
  - Does the same cause always produce the same effect?
  - Can testers name a solution nobody planned?
  - Can players see when an effect fired [@mcclure2024-deathloop]?
- **Red flags:** pairwise checks such as `if (a is Fire && b is Grass)`; a reaction present on one object type and silently missing on a similar one; no tag or category list for effects; interaction testing left to chance.
- **Try:** define a small set of properties and route interactions through them; group effects into categories and test interacting categories together, as Deathloop did [@mcclure2024-deathloop]; use data-driven modifiers with debug displays [@lechevalier2017-for-honor].
- **Deeper:** [systems](systems.md), [design](design.md), [ai](ai.md).

## 12. Numbers that tell the truth

- **Applies when:** "X is overpowered", "nerf or buff?", "the economy is inflating", "players hoard currency", "grind wall".
- **Idea:** Schreiber and Romero treat balance through cost curves, progression curves, economies and randomness [@schreiber2021-balance]. Complaints and popularity mislead: in PlayStation All-Stars, characters called overpowered had middling win rates but the highest play rates [@jaffe2015-metagame], and children testing Skylanders judged power by big damage numbers rather than actual effect [@gallerani2014-character-balance].
- **Ask:**
  - Is every option's cost and benefit in one table?
  - Are you reading pick rate, win rate, or complaints?
  - Is the data split by skill level [@giovannetti2019-slay-the-spire]?
  - Is the problem strength, or how it feels to face [@dodds2014-hearthstone]?
  - What are the sources and sinks per hour of play?
- **Red flags:** balance values scattered as literals through code; changes made one complaint at a time with no changelog; averages dominated by a few heavy testers [@giovannetti2019-slay-the-spire].
- **Try:** build the cost table for one system; log runs with choices and outcomes; separate "feels bad to play against" from "wins too often".
- **Deeper:** [balance](balance.md).

## 13. Feel and feedback

- **Applies when:** "floaty", "sluggish", "unresponsive", "combat lacks impact", "the jump feels wrong".
- **Idea:** Swink describes game feel as real-time control of a virtual object in a simulated space, with interactions emphasized by polish [@swink2009-gamefeel]. Feedback helps within limits: in a large study of one action RPG, versions with no juice and with extreme juice both did worse than medium and high levels [@kao2020-juiciness].
- **Ask:**
  - How many frames pass from input to visible response, measured rather than assumed?
  - Are movement curves derived from targets such as apex height and time [@pittman2016-jump]?
  - Which complaints are latency, which are curves, which are missing feedback?
  - Are near-miss inputs forgiven [@coster2020-forgiveness]?
- **Red flags:** input read only in the fixed physics step; `gravity` and `speed` untouched since day one; animation locks that swallow input; one shake magnitude for every event.
- **Try:** derive gravity and launch velocity from jump height and time to apex [@pittman2016-jump]; add late-jump grace and input buffering [@coster2020-forgiveness]; expose tuning values for live editing.
- **Deeper:** [game-feel](game-feel.md).

## 14. Watch, don't ask

- **Applies when:** "testers said it was fine", "friends like it", "should we add what players asked for?", "we haven't playtested yet".
- **Idea:** At Valve, designs are hypotheses and playtests are experiments, and what players do outweighs what they say, though observers can bias sessions [@ambinder2009-playtesting]. De Jongh finds that testers describe symptoms well but propose fixes for problems they do not understand [@dejongh2017-evil-data].
- **Ask:**
  - When did someone new last play while you watched without helping?
  - What did they do that surprised you?
  - Are you asking what they felt, or asking them to design the fix?
  - Does the test setting match how the game will be played [@dejongh2017-evil-data]?
- **Red flags:** help given during sessions; feature requests implemented verbatim; no logging of deaths, quits or time per section; the same few friends every time.
- **Try:** a standing test rhythm with new players; a deaths-per-section table to flag spikes, as on Uncharted 3 [@lemarchand2012-attention]; log requests as symptoms and diagnose them.
- **Deeper:** [evaluation](evaluation.md).

## 15. A whole game you can finish

- **Applies when:** "just one more system", "90% done for months", "scope creep", "should I add crafting?", "we need a vertical slice".
- **Idea:** In an analysis of 155 self-reported postmortems, mostly from small teams, over-ambitious design was a frequent cause of what went wrong, and successful processes combined planning, prototypes and iteration [@washburn2016-postmortems]. At Volition a vertical slice gated production: a section showing the intended experience with major systems working together near final quality, not a tech demo [@donovan2015-vertical-slice]. By Meier's estimate, a third or more of what gets tried on Meier's games is eventually cut [@meier2012-decisions].
- **Ask:**
  - What is the irreducible core?
  - Can the game be played start to finish today, at any quality?
  - What was cut this month?
  - How much must be built before you know a feature works [@francis2018-scope]?
- **Red flags:** menus, saves and builds deferred to "the end"; no end-to-end playable build; new features started midway through others.
- **Try:** keep a visible cut list; keep an end-to-end build playable from early on; price features by the time to finish them, not to prototype them.
- **Deeper:** [production](production.md).

## 16. Mechanics carry the fiction

- **Applies when:** "the story and gameplay feel disconnected", "ludonarrative dissonance", "the theme feels pasted on", "the art is pretty but players can't read it".
- **Idea:** Meier makes decisions feel more important by tying them to what the game is about and flavoring them with art, writing and sound [@meier2012-decisions]. Breath of the Wild's art aimed to stay readable for play while looking real enough to suggest physics players already know [@fujibayashi2017-botw]. Schell's Lens of Unification asks whether every means reinforces the theme [@schell2019-lenses].
- **Ask:**
  - Do player actions express the fiction?
  - Do incentives reward the behavior the story says matters?
  - Does the art tell players what they can interact with?
  - When players retell the story, do they mention their own actions? Portal's team tried to keep the story told by dialogue close to the story told by the player's actions [@swift2008-portal].
- **Red flags:** non-interactive props rendered like interactive ones; dialogue explaining a mechanic that the level contradicts; rewards paying for behavior the narrative condemns.
- **Try:** check that each major fantasy beat has a mechanical expression; ask playtesters to retell the story, as Portal's team did [@swift2008-portal]; block or restyle props that suggest false affordances [@lee2017-holistic].
- **Deeper:** [narrative](narrative.md), [presentation](presentation.md), [holistic design](holistic-design.md).

## Sources

- `hunicke2004-mda` Robin Hunicke et al. (2004). MDA: A Formal Approach to Game Design and Game Research. AAAI-04 Workshop on Challenges in Game Artificial Intelligence (AAAI Technical Report WS-04-04). https://aaai.org/papers/ws04-04-001-mda-a-formal-approach-to-game-design-and-game-research/ (peer-reviewed)
- `fullerton2018-workshop` Tracy Fullerton (2018). Game Design Workshop: A Playcentric Approach to Creating Innovative Games. CRC Press, 4th edition. https://doi.org/10.1201/b22309 (book)
- `johanas2024-hifi-rush` John Johanas (2024). Developing 'Hi-Fi RUSH' Backwards and Finding Our Positive Gameplay Loop. Game Developers Conference 2024. https://gdcvault.com/play/1034256/Developing-Hi-Fi-RUSH-Backwards (GDC talk)
- `gingold2006-prototyping` Chaim Gingold and Chris Hecker (2006). Advanced Prototyping. Game Developers Conference 2006. https://gdcvault.com/play/1013252/Advanced (GDC talk)
- `fujibayashi2017-botw` Hidemaro Fujibayashi et al. (2017). Change and Constant: Breaking Conventions with 'The Legend of Zelda: Breath of the Wild'. Game Developers Conference 2017. https://gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions (GDC talk)
- `francis2018-scope` Tom Francis (2018). Dealing with Scope Change in 'Heat Signature' and 'Gunpoint'. Game Developers Conference 2018. https://gdcvault.com/play/1024932/Dealing-with-Scope-Change-in (GDC talk)
- `meier2012-decisions` Sid Meier (2012). Interesting Decisions. Game Developers Conference 2012. https://gdcvault.com/play/1015756/Interesting (GDC talk)
- `juul2002-emergence` Jesper Juul (2002). The Open and the Closed: Games of Emergence and Games of Progression. Computer Games and Digital Cultures Conference Proceedings (Tampere). https://doi.org/10.26503/dl.v2002i1.9 (peer-reviewed)
- `mcclure2024-deathloop` David McClure (2024). 'DEATHLOOP': Designing Trinkets for Freedom, Choice, and Emergence. Game Developers Conference 2024. https://gdcvault.com/play/1034227/-DEATHLOOP-Designing-Trinkets-for (GDC talk)
- `koster2012-fun-10-years` Raph Koster (2012). A Theory of Fun 10 Years Later. GDC Online 2012. https://gdcvault.com/play/1016632/A-Theory-of-Fun-10 (GDC talk)
- `zagal2013-dark-patterns` José P. Zagal et al. (2013). Dark Patterns in the Design of Games. Proceedings of the 8th International Conference on the Foundations of Digital Games (FDG 2013). https://dblp.org/rec/conf/fdg/ZagalBL13.html (peer-reviewed)
- `koster2013-fun` Raph Koster (2013). A Theory of Fun for Game Design. O'Reilly Media (2nd edition). https://www.theoryoffun.com/ (book)
- `deterding2022-uncertainty` Sebastian Deterding et al. (2022). Mastering uncertainty: A predictive processing account of enjoying uncertain success in video game play. Frontiers in Psychology 13. https://doi.org/10.3389/fpsyg.2022.924953 (peer-reviewed)
- `koster2024-revisiting-fun` Raph Koster (2024). Revisiting Fun: 20 Years of "A Theory of Fun". Game Developers Conference 2024. https://gdcvault.com/play/1034362/Revisiting-Fun-20-Years-of (GDC talk)
- `sweetser2005-gameflow` Penelope Sweetser and Peta Wyeth (2005). GameFlow: A Model for Evaluating Player Enjoyment in Games. Computers in Entertainment 3(3). https://doi.org/10.1145/1077246.1077253 (peer-reviewed)
- `chen2007-flow` Jenova Chen and Kellee Santiago (2007). Classroom to the Console: The Autobiography of flOw. Game Developers Conference 2007. https://gdcvault.com/play/685/Classroom-to-the-Console-The (GDC talk)
- `denisova2015-adaptation` Alena Denisova and Paul Cairns (2015). Adaptation in digital games: the effect of challenge adjustment on player performance and experience. Proceedings of the 2015 Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2015). https://doi.org/10.1145/2793107.2793141 (peer-reviewed)
- `oliver2023-ragnarok` Adam Oliver (2023). Breaking Barriers: Combat Accessibility in 'God of War Ragnarok'. Game Developers Conference 2023. https://gdcvault.com/play/1028726/Breaking-Barriers-Combat-Accessibility-in (GDC talk)
- `cairns2019-apx-vocabulary` Paul Cairns et al. (2019). Future design of accessibility in games: A design vocabulary. International Journal of Human-Computer Studies 131. https://doi.org/10.1016/j.ijhcs.2019.06.010 (peer-reviewed)
- `thorson2017-celeste` Maddy Thorson (2017). Level Design Workshop: Designing 'Celeste'. Game Developers Conference 2017, Level Design Workshop. https://gdcvault.com/play/1024307/Level-Design-Workshop-Designing-Celeste (GDC talk)
- `fan2012-pvz` George Fan (2012). How I Got My Mom to Play Through Plants vs. Zombies. Game Developers Conference 2012. https://gdcvault.com/play/1015327/How-I-Got-My-Mom (GDC talk)
- `andersen2012-tutorials` Erik Andersen et al. (2012). The impact of tutorials on games of varying complexity. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI 2012). https://doi.org/10.1145/2207676.2207687 (peer-reviewed)
- `hodent2016-onboarding` Celia Hodent (2016). The Gamer's Brain, Part 2: UX of Onboarding and Player Engagement. Game Developers Conference 2016. https://gdcvault.com/play/1022951/The-Gamer-s-Brain-Part (GDC talk)
- `taylor2013-principles` Dan Taylor (2013). Ten Principles for Good Level Design. Game Developers Conference 2013. https://gdcvault.com/play/1017803/Ten-Principles-for-Good-Level (GDC talk)
- `traynor2024-parabox` Patrick Traynor (2024). System-Centric Puzzle Design in 'Patrick's Parabox'. Game Developers Conference 2024. https://gdcvault.com/play/1034267/System-Centric-Puzzle-Design-in (GDC talk)
- `ryan2006-motivation` Richard M. Ryan et al. (2006). The Motivational Pull of Video Games: A Self-Determination Theory Approach. Motivation and Emotion 30(4). https://doi.org/10.1007/s11031-006-9051-8 (peer-reviewed)
- `yee2006-motivations` Nick Yee (2006). Motivations for Play in Online Games. CyberPsychology & Behavior 9(6). https://doi.org/10.1089/cpb.2006.9.772 (peer-reviewed)
- `hamari2014-player-types` Juho Hamari and Janne Tuunanen (2014). Player Types: A Meta-synthesis. Transactions of the Digital Games Research Association 1(2). https://doi.org/10.26503/todigra.v1i2.13 (peer-reviewed)
- `przybylski2010-engagement` Andrew K. Przybylski et al. (2010). A Motivational Model of Video Game Engagement. Review of General Psychology 14(2). https://doi.org/10.1037/a0019440 (peer-reviewed)
- `kumari2019-uncertainty` Shringi Kumari et al. (2019). The Role of Uncertainty in Moment-to-Moment Player Motivation: A Grounded Theory. CHI PLAY '19: Proceedings of the Annual Symposium on Computer-Human Interaction in Play. https://doi.org/10.1145/3311350.3347148 (peer-reviewed)
- `meier2010-psychology` Sid Meier (2010). The Psychology of Game Design (Everything You Know Is Wrong). Game Developers Conference 2010. https://gdcvault.com/play/1012186/The-Psychology-of-Game-Design (GDC talk)
- `lewisevans2017-rewards` Ben Lewis-Evans (2017). Throwing Out the Dopamine Shots: Reward Psychology Without the Neurotrash. Game Developers Conference 2017. https://gdcvault.com/play/1024181/Throwing-Out-the-Dopamine-Shots (GDC talk)
- `lechevalier2017-for-honor` Aurelie Le Chevalier (2017). Modify Everything! Data-Driven Dynamic Gameplay Effects on 'For Honor'. Game Developers Conference 2017. https://gdcvault.com/play/1024050/Modify-Everything-Data-Driven-Dynamic (GDC talk)
- `schreiber2021-balance` Ian Schreiber and Brenda Romero (2021). Game Balance. CRC Press. https://doi.org/10.1201/9781315156422 (book)
- `jaffe2015-metagame` Alexander Jaffe (2015). Metagame Balance. Game Developers Conference 2015. https://gdcvault.com/play/1022155/Metagame (GDC talk)
- `gallerani2014-character-balance` Robert Gallerani (2014). Character Balance: More than the Numbers. Game Developers Conference 2014. https://gdcvault.com/play/1020431/Character-Balance-More-than-the (GDC talk)
- `giovannetti2019-slay-the-spire` Anthony Giovannetti (2019). 'Slay the Spire': Metrics Driven Design and Balance. Game Developers Conference 2019. https://gdcvault.com/play/1025731/-Slay-the-Spire-Metrics (GDC talk)
- `dodds2014-hearthstone` Eric Dodds (2014). Hearthstone: 10 Bits of Design Wisdom. Game Developers Conference 2014. https://gdcvault.com/play/1020775/Hearthstone-10-Bits-of-Design (GDC talk)
- `swink2009-gamefeel` Steve Swink (2009). Game Feel: A Game Designer's Guide to Virtual Sensation. Morgan Kaufmann. https://www.routledge.com/Game-Feel-A-Game-Designers-Guide-to-Virtual-Sensation/Swink/p/book/9780123743282 (book)
- `kao2020-juiciness` Dominic Kao (2020). The effects of juiciness in an action RPG. Entertainment Computing 34. https://doi.org/10.1016/j.entcom.2020.100359 (peer-reviewed)
- `pittman2016-jump` Kyle Pittman (2016). Math for Game Programmers: Building A Better Jump. Game Developers Conference 2016. https://gdcvault.com/play/1023148/Math-for-Game-Programmers-Building (GDC talk)
- `coster2020-forgiveness` Seth Coster (2020). Forgiveness Mechanics: Reading Minds for Responsive Gameplay. Game Developers Conference 2020. https://gdcvault.com/play/1026606/Forgiveness-Mechanics-Reading-Minds-for (GDC talk)
- `ambinder2009-playtesting` Mike Ambinder (2009). Valve's Approach to Playtesting: the Application of Empiricism. Game Developers Conference 2009. https://gdcvault.com/play/1566/Valve-s-Approach-to-Playtesting (GDC talk)
- `dejongh2017-evil-data` Adriaan de Jongh (2017). Playtesting: Avoiding Evil Data. Game Developers Conference 2017. https://gdcvault.com/play/1024132/Playtesting-Avoiding-Evil (GDC talk)
- `lemarchand2012-attention` Richard Lemarchand (2012). Attention, Not Immersion: Making Your Games Better with Psychology and Playtesting, the Uncharted Way. Game Developers Conference 2012. https://gdcvault.com/play/1015464/Attention-Not-Immersion-Making-Your (GDC talk)
- `washburn2016-postmortems` Michael Washburn et al. (2016). "What went right and what went wrong": an analysis of 155 postmortems from game development. Proceedings of the 38th International Conference on Software Engineering Companion (ICSE SEIP 2016). https://doi.org/10.1145/2889160.2889253 (peer-reviewed)
- `donovan2015-vertical-slice` Greg Donovan (2015). The Vertical Slice Challenge. Game Developers Conference 2015. https://gdcvault.com/play/1022328/The-Vertical-Slice (GDC talk)
- `schell2019-lenses` Jesse Schell (2019). The Art of Game Design: A Book of Lenses. CRC Press (3rd edition). https://www.routledge.com/The-Art-of-Game-Design-A-Book-of-Lenses-Third-Edition/Schell/p/book/9781138632059 (book)
- `swift2008-portal` Kim Swift and Erik Wolpaw (2008). A PORTAL Post-Mortem: Integrating Writing and Design. Game Developers Conference 2008. https://gdcvault.com/play/197/A-PORTAL-Post-Mortem-Integrating (GDC talk)
- `lee2017-holistic` Steve Lee (2017). Level Design Workshop: An Approach to Holistic Level Design. Game Developers Conference 2017, Level Design Workshop. https://gdcvault.com/play/1024301/Level-Design-Workshop-An-Approach (GDC talk)
