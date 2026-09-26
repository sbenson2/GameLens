# Design decisions

Read this when a developer is deciding what the game is: the intended experience, the core loop, the choices players make, how uncertainty and information are handled, why players stay, and whether to build systems or authored content. For numeric tuning go to [balance](balance.md); for prototyping and scope go to [production](production.md); for a quick symptom-to-lens index use [lenses](lenses.md).

The developer's intended experience outranks every heuristic below. Treat each one as a hypothesis to test in play, and expect genre conventions to be options rather than requirements.

## Start from the intended experience

A vague goal ("tense", "cozy", "deep") cannot be implemented or tested. Translate it into player behavior first, then choose mechanics that should produce that behavior, then check whether they do.

MDA gives the vocabulary. Mechanics are the rules and algorithms, dynamics are the run-time behavior of those mechanics acting on player input and on each other, and aesthetics are the emotional responses the designer wants; the designer builds from mechanics outward, while the player meets the aesthetics first [@hunicke2004-mda]. Fullerton's playcentric process starts by writing player experience goals, meaning the situations and feelings players should have rather than features, then prototypes the core mechanics and playtests against those goals [@fullerton2018-workshop]. Schell's Lens of Essential Experience asks the same thing in three questions: what experience you want, what is essential to it, and how the game can capture that essence [@schell2019-lenses].

Two shipped examples of designing backwards from the experience:

- On Hi-Fi RUSH, Johanas started from the feeling of actions landing on the music's beat and built systems to guarantee it, stretching or speeding animations so an attack lands on the beat whatever the input timing. The team found that designing a feature first and adding musicality afterwards felt tacked on, so features were designed from their musical moment [@johanas2024-hifi-rush].
- On What Remains of Edith Finch, each short-story prototype aimed at a target feeling rather than a challenge, and the story was rewritten to fit what prototypes and playtests produced [@dallas2018-edith-finch].

A working translation, as reasoning rather than a rule:

| Stated goal | Observable behavior to aim for | Mechanic hypotheses | Evidence that it works |
| --- | --- | --- | --- |
| "Tense exploration" | Player weighs pushing deeper against returning; checks supplies before corners | Scarce light or ammo, a known route home, threats heard before seen | Players hesitate at thresholds; retreat decisions vary between players |
| "Feels like a heist planner" | Player scouts, commits to a plan, improvises when it breaks | Information gathered before commitment, costly mid-mission changes | Players describe their plan unprompted; failures are blamed on the plan, not the controls |
| "Relaxing" | Player sets their own pace and goals | No timers, low failure cost, many small completable tasks | Session ends by choice, not by frustration |

Diagnostic questions:

- What should the player be paying attention to, deciding and feeling in a typical minute? In a typical session?
- Which behavior would prove the intended experience is happening? Can you observe it in a playtest or log it?
- Is each mechanic in the backlog tied to a behavior on this list, or is it there because the genre usually has one?

## Using MDA without over-trusting it

MDA is most useful as a debugging trace. When a playtest feels wrong, locate the layer: the mechanic may be implemented exactly as specified and still produce the wrong dynamic. The MDA paper's Monopoly example shows a feedback loop in which leaders grow richer and punish others more effectively, so trailing players disengage; the fix is a mechanics change (bonuses for trailing players, taxes on leaders, time pressure) chosen to alter that dynamic, followed by tuning [@hunicke2004-mda]. Its tag-game example argues that AI cannot be designed apart from the target aesthetic: the same game of hiding needs different agents for young children, older children and a stealth game [@hunicke2004-mda].

Peer-reviewed critiques narrow what the framework can carry:

- Sicart argues that MDA's definition of mechanics is too loose to identify a mechanic, because "behaviors afforded to the player" mixes strategies a level merely suggests (taking cover in Gears of War) with calculations the system runs in the background; Sicart defines mechanics instead as methods invoked by agents to interact with the game world [@sicart2008-mechanics].
- Natucci and Borges summarize further criticisms: "mechanics" lumps code, technology and game rules together; "aesthetics" covers only player emotion, leaving art style and UI inside mechanics; and saying players meet aesthetics first sits oddly with controls and UI being their first contact. They review extensions such as DDE that split design into blueprint, mechanics and interface [@natucci2021-eda].

In practice: use MDA's layers to ask where intent and behavior diverge, but name the concrete thing you will change (a rule, a number, an interface cue, a level layout) instead of stopping at "the mechanics".

## Core loop and session shape

Describe the loop as verbs and consequences at more than one time scale. Koster's game-grammar notation reduces a game to a loop in which the player acts, a mechanic responds, feedback arrives, and the player updates their mental model [@koster2012-fun-10-years]. Meier attributes Civilization's "one more turn" pull to goals running at short, medium and long time scales at once, so finishing one goal leaves another in progress [@meier2012-decisions].

Practitioner lessons about loops:

- Hi-Fi RUSH found a self-correcting loop: because every impact lands on the beat, attacking again when a hit lands keeps the player in rhythm, which helped players keep time without UI prompting them; the team still added rhythm UI for special attacks and parries where timing decides success [@johanas2024-hifi-rush].
- Meier warns that something interesting to do once is not interesting to do ten times. During development of the original Civilization the team removed a secondary tech tree and shrank a map that had been twice as large; in Civilization, as players' capacity grows, the things they build get bigger and costlier so the number of items to manage stays roughly constant [@meier2012-decisions].
- On Deathloop, McClure judged in retrospect that the loop's excitement fell off in the final third, and links this to the late decisions about item count and distribution [@mcclure2024-deathloop].

Plan session shape around platform and audience. Hayashida describes Super Mario 3D Land as a handheld game players expect to play in shorter sittings; the team also placed the normal ending earlier than usual so beginners could finish, then added harder special worlds for advanced players [@hayashida2012-3d-land]. Designing around forced return visits is a different matter: Zagal and colleagues list playing by appointment and grinding among dark patterns when they work against players' interests without their consent [@zagal2013-dark-patterns].

Red flags in the code or backlog:

- The per-iteration loop includes fixed waits (unskippable transitions, long respawn timers) longer than the actions it frames.
- A meta-progression system reads from no moment-to-moment event; its only input is a timer or login.
- Late-game content is early-game content with multiplied numbers: `enemyHP *= tier`, no new verbs or combinations.
- Session end is detected only as a quit event; there is no designed stopping point to measure against.

## Meaningful decisions

Meier's criteria are a practical starting point. A decision is not interesting if players always pick the same option (the game could pick it for them) or pick at random. Interesting decisions involve a trade-off, depend on the current situation, can express a player's style, and have a persistence: the longer a choice affects play, the more information players need to feel comfortable making it [@meier2012-decisions].

Three failure modes and where they show up:

| Failure | What you see | Plausible causes | Smallest useful change |
| --- | --- | --- | --- |
| Dominant option | Everyone buys the same tower or takes the same build | Cost below its value in every situation; encounters never punish it; alternatives unreadable | Change the situation mix or price first; see [balance](balance.md) |
| Uninformed gamble | Choices look random; players reload or look up answers | Long persistence with hidden consequences; too many options | Show the trade-off before commitment; shorten persistence; cut options |
| Irrelevant choice | Players click through without pausing | No effect on outcomes, and no link to the fantasy | Tie it to the theme or cut it; keep it only if it invests players |

Meier's levers for weak decisions are rebalancing the cost, tying the choice more closely to what the game is about, adding or withholding information, offering fewer options (Civilization players were more comfortable choosing among about three to five technologies than among the larger sets of early designs), changing the time allowed, adding flavor through art and sound, and cutting the decision [@meier2012-decisions]. Meier also notes that choices with no effect on play, such as naming a city, can still invest players in the game [@meier2012-decisions], so "irrelevant" should mean irrelevant to both outcome and attachment.

Supporting views and cautions:

- Players pursue good strategies, so a game whose optimal strategy produces dull sessions is dull [@juul2002-emergence]. Rosewater's version for Magic: The Gathering is to make the fun part also the correct way to win [@rosewater2016-lessons]; on Slay the Spire, slow and grindy optimal strategies were cut [@giovannetti2019-slay-the-spire].
- Popularity is not proof of power. In PlayStation All-Stars data, characters called overpowered had middling win rates but the highest play rates [@jaffe2015-metagame].
- On Deathloop, choices were kept meaningful by preferring new capabilities over stat increases, making each effect strong enough to notice, forbidding stacking, and limiting loadout slots so every pick had an opportunity cost [@mcclure2024-deathloop].
- A large possibility tree is not depth: Koster notes that players prune trivial choices, so counting options says little [@koster2024-revisiting-fun].

For cost curves, win rates and tuning methods, continue in [balance](balance.md).

## Uncertainty and information

Uncertainty is a design material, not noise to remove. In an interview study, Kumari and colleagues found uncertainty central to moment-to-moment motivation and described engaging uncertainty arising from the game, the player and the outcome, tied mainly to curiosity and competence [@kumari2019-uncertainty]. Deterding and colleagues propose that players enjoy reducing uncertainty faster than they expected, which tracks learning progress; this is a theory article, not a test [@deterding2022-uncertainty].

Information is the main lever. Meier points out that Civilization's gradually revealed map shapes many of the player's decisions, and that a fully revealed map would be a different game; in other cases more information makes a decision more interesting [@meier2012-decisions]. Koster contrasts Set, a bounded problem that teaches its own machinery, with Connections, where limited guesses stop players learning to search the possibilities, so what they learn is how the puzzle author thinks [@koster2024-revisiting-fun]. Koster also describes outcomes that stay undecided until the end as the most enjoyable for both sides, compared with early blowouts [@koster2024-revisiting-fun].

Perceived randomness matters as much as the numbers. Meier reports that Civilization Revolution players shown 3:1 odds felt cheated by losses and objected to losing two 2:1 battles in a row, so the team factored earlier results into later rolls [@meier2010-psychology]. Lewis-Evans stresses that players must know that, why and how much they were rewarded [@lewisevans2017-rewards].

Diagnostic questions:

- Which uncertainty is intended here: what the system will do, whether the player can execute, or how it will turn out?
- For each long-lasting decision, what does the player know at the moment of commitment? Could a first-time player explain their reasoning?
- Is a random roll presented so players can read the odds, and do the odds they feel match the odds you coded?

## Motivation: needs rather than types

Among the sources used here, self-determination theory has the most direct game research behind it. In lab sessions with mostly undergraduate players and a survey of 730 MMO players, perceived autonomy and competence predicted enjoyment and intended future play, relatedness added to this in multiplayer games, and intuitive controls were associated with competence and presence [@ryan2006-motivation]. The authors' later review adds that mastering the controls is necessary but not sufficient, that a steep learning curve is felt as a price of admission, and that presence depended more on need satisfaction than on audiovisual fidelity in their studies [@przybylski2010-engagement]. These are short-term measures, largely from the authors' own instruments.

Player-type labels need care. Yee's factor analysis of about 3,000 MMORPG players found achievement, social and immersion components that were weakly correlated and did not suppress each other, contrary to the trade-off assumed by Bartle's types [@yee2006-motivations]. A meta-synthesis of typologies found they reduce to a handful of dimensions and warns that "type" wrongly implies each player belongs to one category [@hamari2014-player-types]. The practical implication: describe the audience as a profile of motives the game serves strongly, not as a set of exclusive people to satisfy one by one. Hayashida's son, playing Super Mario 3D Land for the first time, enjoyed it as a game about collecting coins, which Hayashida took as a reason to let people play the way they want [@hayashida2012-3d-land].

Meier's named tester archetypes (the player who only cares about winning, the genre loyalist, the min-maxer, the player convinced the computer cheats) are a way to filter playtest feedback, not audience segments [@meier2012-decisions].

## Fun as learning and mastery

Koster's thesis is that fun is the feedback the brain gives while absorbing patterns: players drop a game once they have seen its pattern, and a game can bore from both sides, too easy or too hard to read [@koster2013-fun]. In 2012 Koster described games as deliberate-practice machines and argued that art, sound and story act as feedback on an invisible system [@koster2012-fun-10-years]. A 2024 talk widened the claim: patterns include social and physical ones, fun differs by person because players bring different pattern libraries, and people also play for reasons other than fun, such as practice or something close to meditation [@koster2024-revisiting-fun]. The same talk offers a checklist for missing fun to run on every feature, down to single buttons, asking for example whether there is more than one good arrangement, whether timing the choice takes skill, and whether results are graded rather than pass or fail [@koster2024-revisiting-fun].

When a playtester says "it got boring", ask which side of the pattern they were on:

- Mastered: identical runs, autopilot inputs, the same opener every time. Add variations that force a re-read, or accept that the game is finished for them.
- Never found: flailing, random inputs, quitting before the first success. Make the pattern readable: fewer simultaneous elements, clearer feedback, a safer place to experiment (see [levels](levels.md)).

## Flow, challenge and enjoyment

GameFlow organizes enjoyment heuristics under flow's elements (concentration, challenge, player skills, control, clear goals, feedback, immersion and social interaction), and in its initial validation expert reviews using the criteria separated a highly rated and a poorly rated strategy game [@sweetser2005-gameflow]. It is a heuristic model checked by expert review in one genre, not a measured law.

Sources disagree about how central flow is:

- Koster separates fun from flow: flow is a near-meditative optimal state that need not deliver the pleasure of learning [@koster2012-fun-10-years], and games often create fun through frustration followed by a breakthrough [@koster2024-revisiting-fun]. Deterding and colleagues argue that their predictive-processing account explains balanced games, Idle games where success is guaranteed, and Soulslike games built on repeated failure [@deterding2022-uncertainty].
- On who controls difficulty, Chen argued that one static difficulty cannot serve a wide audience and that visible computer-controlled adjustment can feel intimidating, so flOw let players steer their own challenge through in-game choices [@chen2007-flow]. Evidence points both ways: in one short lab study of a shooter, secretly adapted difficulty raised immersion and nobody noticed it [@denisova2015-adaptation], while in two studies of casual games most players said they preferred choosing difficulty themselves and the adjustment type affected perceived autonomy, though automatic adjustment did not notably change other experience measures [@smeddinck2016-difficulty-choices].
- Failure itself is not the problem. In one physiological study of a shooter, players smiled after dying but the response weakened as deaths repeated; the authors suggest dying stops being enjoyable once it brings no clear progress [@vandenhoogen2012-player-death].

For pacing and difficulty curves see [levels](levels.md); for assist options see [accessibility](accessibility.md).

## Emergence versus progression

Juul distinguishes games of emergence, where a few rules combine into many variations that players meet with strategies, from games of progression, where challenges arrive in sequence with predefined solutions and the designer keeps strong control [@juul2002-emergence]. Juul's quick test is what players write: emergence games get strategy guides, progression games get walkthroughs. Most games mix the two; Juul reads EverQuest as emergence with embedded quest progression [@juul2002-emergence].

Choose deliberately. Progression suits authored pacing, story beats and precise teaching; emergence suits replay, player expression and strategies the designer did not script. The cost of emergence is that some outcomes are only discoverable by play, including exploits.

## Systemic design

Breath of the Wild's GDC talk documents a switch from authored puzzles to systemic play in detail. Its team described earlier Zelda puzzles as built from objects made for each puzzle, "development by addition", and replaced them with "multiplicative" play in which objects react to player actions and to each other; the idea was first tested in a prototype drawn with top-down 2D graphics, running on early versions of the physics and chemistry engines [@fujibayashi2017-botw]. Its "chemistry engine" is a rule-based state calculator with three rules: elements (fire, water, ice, electricity, wind) change the state of materials, elements change each other, and materials do not change each other [@fujibayashi2017-botw]. The team stressed that consistent rules invite players to try ideas, that intended solutions exist but players' own count as correct, and that the art had to look real enough to suggest physics from everyday experience [@fujibayashi2017-botw].

Deathloop's trinkets show the same approach applied to build items. McClure aimed for at least one trinket per game element, relied on consistent systemic rules (an explosion always ignites gas) so players could plan, and handled a combination space far too large to test by grouping effects into categories and tuning only interacting categories together [@mcclure2024-deathloop]. Players hated effects that fired without visible feedback, and one unplanned interaction was kept because clever players would enjoy finding it [@mcclure2024-deathloop]. For implementation, For Honor's data-driven modifier system is a worked example (see [systems](systems.md)) [@lechevalier2017-for-honor].

Red flags in code:

- Interactions written per pair, such as `if (arrow.isFire && target is Grass)`, so combinations stop at what someone typed.
- A reaction that works on one object type and silently fails on a similar one, teaching players to stop experimenting.
- No effect categories or tags, so nobody can list which systems can touch a new item.
- Effects that change outcomes with no audiovisual acknowledgment.

## Evidence to collect

| Question | Cheapest evidence |
| --- | --- |
| Is the intended behavior happening? | Silent observation of new players; a log of the specific actions that define it |
| Is a decision interesting? | Pick rates by situation, not overall; players explaining their choice aloud |
| Is uncertainty readable? | Ask players to predict an outcome before it resolves |
| Why do players stop? | Quit points against loop and session boundaries; exit questions about what they were trying to do |
| Is the system emergent or just combinatorial? | Count solutions testers used that no designer planned |

Methods for running these checks are in [evaluation](evaluation.md). Prototype the riskiest question first, as described in [production](production.md): a prototype should answer one clearly stated question cheaply [@gingold2006-prototyping].

## Sources

- `hunicke2004-mda` Robin Hunicke et al. (2004). MDA: A Formal Approach to Game Design and Game Research. AAAI-04 Workshop on Challenges in Game Artificial Intelligence (AAAI Technical Report WS-04-04). https://aaai.org/papers/ws04-04-001-mda-a-formal-approach-to-game-design-and-game-research/ (peer-reviewed)
- `fullerton2018-workshop` Tracy Fullerton (2018). Game Design Workshop: A Playcentric Approach to Creating Innovative Games. CRC Press, 4th edition. https://doi.org/10.1201/b22309 (book)
- `schell2019-lenses` Jesse Schell (2019). The Art of Game Design: A Book of Lenses. CRC Press (3rd edition). https://www.routledge.com/The-Art-of-Game-Design-A-Book-of-Lenses-Third-Edition/Schell/p/book/9781138632059 (book)
- `johanas2024-hifi-rush` John Johanas (2024). Developing 'Hi-Fi RUSH' Backwards and Finding Our Positive Gameplay Loop. Game Developers Conference 2024. https://gdcvault.com/play/1034256/Developing-Hi-Fi-RUSH-Backwards (GDC talk)
- `dallas2018-edith-finch` Ian Dallas (2018). Weaving 13 Prototypes into 1 Game: Lessons from 'Edith Finch'. Game Developers Conference 2018. https://gdcvault.com/play/1025016/Weaving-13-Prototypes-into-1 (GDC talk)
- `sicart2008-mechanics` Miguel Sicart (2008). Defining Game Mechanics. Game Studies 8(2). https://gamestudies.org/0802/articles/sicart (peer-reviewed)
- `natucci2021-eda` Gabriel C. Natucci and Marcos A. F. Borges (2021). The Experience, Dynamics and Artifacts Framework: Towards a Holistic Model for Designing Serious and Entertainment Games. 2021 IEEE Conference on Games (CoG). https://doi.org/10.1109/cog52621.2021.9619144 (peer-reviewed)
- `koster2012-fun-10-years` Raph Koster (2012). A Theory of Fun 10 Years Later. GDC Online 2012. https://gdcvault.com/play/1016632/A-Theory-of-Fun-10 (GDC talk)
- `meier2012-decisions` Sid Meier (2012). Interesting Decisions. Game Developers Conference 2012. https://gdcvault.com/play/1015756/Interesting (GDC talk)
- `mcclure2024-deathloop` David McClure (2024). 'DEATHLOOP': Designing Trinkets for Freedom, Choice, and Emergence. Game Developers Conference 2024. https://gdcvault.com/play/1034227/-DEATHLOOP-Designing-Trinkets-for (GDC talk)
- `hayashida2012-3d-land` Koichi Hayashida (2012). Thinking In 3D: The Development of Super Mario 3D Land. Game Developers Conference 2012. https://gdcvault.com/play/1015833/Thinking-In-3D-The-Development (GDC talk)
- `zagal2013-dark-patterns` José P. Zagal et al. (2013). Dark Patterns in the Design of Games. Proceedings of the 8th International Conference on the Foundations of Digital Games (FDG 2013). https://dblp.org/rec/conf/fdg/ZagalBL13.html (peer-reviewed)
- `juul2002-emergence` Jesper Juul (2002). The Open and the Closed: Games of Emergence and Games of Progression. Computer Games and Digital Cultures Conference Proceedings (Tampere). https://doi.org/10.26503/dl.v2002i1.9 (peer-reviewed)
- `rosewater2016-lessons` Mark Rosewater (2016). Twenty Years, Twenty Lessons. Game Developers Conference 2016. https://gdcvault.com/play/1022941/Twenty-Years-Twenty (GDC talk)
- `giovannetti2019-slay-the-spire` Anthony Giovannetti (2019). 'Slay the Spire': Metrics Driven Design and Balance. Game Developers Conference 2019. https://gdcvault.com/play/1025731/-Slay-the-Spire-Metrics (GDC talk)
- `jaffe2015-metagame` Alexander Jaffe (2015). Metagame Balance. Game Developers Conference 2015. https://gdcvault.com/play/1022155/Metagame (GDC talk)
- `koster2024-revisiting-fun` Raph Koster (2024). Revisiting Fun: 20 Years of "A Theory of Fun". Game Developers Conference 2024. https://gdcvault.com/play/1034362/Revisiting-Fun-20-Years-of (GDC talk)
- `kumari2019-uncertainty` Shringi Kumari et al. (2019). The Role of Uncertainty in Moment-to-Moment Player Motivation: A Grounded Theory. CHI PLAY '19: Proceedings of the Annual Symposium on Computer-Human Interaction in Play. https://doi.org/10.1145/3311350.3347148 (peer-reviewed)
- `deterding2022-uncertainty` Sebastian Deterding et al. (2022). Mastering uncertainty: A predictive processing account of enjoying uncertain success in video game play. Frontiers in Psychology 13. https://doi.org/10.3389/fpsyg.2022.924953 (peer-reviewed)
- `meier2010-psychology` Sid Meier (2010). The Psychology of Game Design (Everything You Know Is Wrong). Game Developers Conference 2010. https://gdcvault.com/play/1012186/The-Psychology-of-Game-Design (GDC talk)
- `lewisevans2017-rewards` Ben Lewis-Evans (2017). Throwing Out the Dopamine Shots: Reward Psychology Without the Neurotrash. Game Developers Conference 2017. https://gdcvault.com/play/1024181/Throwing-Out-the-Dopamine-Shots (GDC talk)
- `ryan2006-motivation` Richard M. Ryan et al. (2006). The Motivational Pull of Video Games: A Self-Determination Theory Approach. Motivation and Emotion 30(4). https://doi.org/10.1007/s11031-006-9051-8 (peer-reviewed)
- `przybylski2010-engagement` Andrew K. Przybylski et al. (2010). A Motivational Model of Video Game Engagement. Review of General Psychology 14(2). https://doi.org/10.1037/a0019440 (peer-reviewed)
- `yee2006-motivations` Nick Yee (2006). Motivations for Play in Online Games. CyberPsychology & Behavior 9(6). https://doi.org/10.1089/cpb.2006.9.772 (peer-reviewed)
- `hamari2014-player-types` Juho Hamari and Janne Tuunanen (2014). Player Types: A Meta-synthesis. Transactions of the Digital Games Research Association 1(2). https://doi.org/10.26503/todigra.v1i2.13 (peer-reviewed)
- `koster2013-fun` Raph Koster (2013). A Theory of Fun for Game Design. O'Reilly Media (2nd edition). https://www.theoryoffun.com/ (book)
- `sweetser2005-gameflow` Penelope Sweetser and Peta Wyeth (2005). GameFlow: A Model for Evaluating Player Enjoyment in Games. Computers in Entertainment 3(3). https://doi.org/10.1145/1077246.1077253 (peer-reviewed)
- `chen2007-flow` Jenova Chen and Kellee Santiago (2007). Classroom to the Console: The Autobiography of flOw. Game Developers Conference 2007. https://gdcvault.com/play/685/Classroom-to-the-Console-The (GDC talk)
- `denisova2015-adaptation` Alena Denisova and Paul Cairns (2015). Adaptation in digital games: the effect of challenge adjustment on player performance and experience. Proceedings of the 2015 Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2015). https://doi.org/10.1145/2793107.2793141 (peer-reviewed)
- `smeddinck2016-difficulty-choices` Jan D. Smeddinck et al. (2016). How to Present Game Difficulty Choices? Exploring the Impact on Player Experience. Proceedings of the 2016 CHI Conference on Human Factors in Computing Systems. https://doi.org/10.1145/2858036.2858574 (peer-reviewed)
- `vandenhoogen2012-player-death` Wouter van den Hoogen et al. (2012). Between challenge and defeat: repeated player-death and game enjoyment. Media Psychology. https://doi.org/10.1080/15213269.2012.723117 (peer-reviewed)
- `fujibayashi2017-botw` Hidemaro Fujibayashi et al. (2017). Change and Constant: Breaking Conventions with 'The Legend of Zelda: Breath of the Wild'. Game Developers Conference 2017. https://gdcvault.com/play/1024562/Change-and-Constant-Breaking-Conventions (GDC talk)
- `lechevalier2017-for-honor` Aurelie Le Chevalier (2017). Modify Everything! Data-Driven Dynamic Gameplay Effects on 'For Honor'. Game Developers Conference 2017. https://gdcvault.com/play/1024050/Modify-Everything-Data-Driven-Dynamic (GDC talk)
- `gingold2006-prototyping` Chaim Gingold and Chris Hecker (2006). Advanced Prototyping. Game Developers Conference 2006. https://gdcvault.com/play/1013252/Advanced (GDC talk)
