# Multiplayer and online play

Read this only when the game has, or is weighing, play between people on different machines, or online services such as matchmaking, ranking, moderation or live operations. A game may not need netcode at all: single-player, local multiplayer and many asynchronous designs avoid nearly everything below. Lifecycle and state rules for the simulation itself are in [architecture.md](architecture.md).

## First decide whether you need it

Netcode is expensive and it constrains everything else. Spelunky 2's netcode programmer says online multiplayer should not be a default: it takes a long time to build, so weigh what it adds against what else that time could produce [@garciaromero2021-spelunky2]. For scale, NetherRealm's rollback retrofit took about 7-8 engineer-years for the first release plus ongoing part-time support [@stallone2018-rollback], and Overwatch's scripted-ability networking was a large up-front and ongoing investment [@reed2017-overwatch-abilities].

| What the design needs | Smallest model to consider |
| --- | --- |
| Friends on one screen | Local multiplayer; no netcode |
| Turn-based or asynchronous play | Stored turns or platform services; latency matters little |
| Casual co-op among friends | A player host, or per-object authority between peers, accepting that cheating is possible |
| Competitive real-time play among strangers | Server authority with client prediction, or deterministic rollback |

Claire Blackshaw's advice for small teams: use platform services first, start real-time networking with middleware, send less data, keep servers small because running them is a large commitment, and check that the core game still works when your server is down [@blackshaw2017-online-features].

## How much latency matters depends on the action

- Claypool and Claypool, synthesizing earlier testbed studies, classify actions by the precision they need and the deadline for completing them; precise, tight-deadline actions degrade first. First-person avatar games were most sensitive, third-person avatar games less, and games where the player commands many units (strategy, simulation) least, with thresholds of roughly 100 ms, 500 ms and 1,000 ms for those groups [@claypool2006-latency].
- These come from a handful of older studies of specific games, and the perspective categories are contested: a 2023 lab study of one shooting game found added latency hurt performance and experience in first-person, third-person and bird's-eye views alike [@halbhuber2023-latency-perspective]. Use the precision-and-deadline idea to rank which actions need latency hiding, not the thresholds as targets. More latency research is in [game feel](game-feel.md).
- Within one game, perception also depends on presentation: Aldridge reports that players did not notice up to about 100-150 ms of delay on a Halo grenade throw hidden behind its throw animation [@aldridge2011-halo-reach].

## Authority and trust

Aldridge's rule from Halo: Reach: for each mechanic, decide which parts one authority adjudicates and which parts clients predict. More adjudication makes the game fairer and more consistent; more prediction makes it more responsive; and wherever the authority decides, the lag is hidden somewhere, so ask where [@aldridge2011-halo-reach].

- On Halo: Reach the host was authoritative for health, damage and projectiles because of cheating risk, while clients had bounded authority over their own character's position [@aldridge2011-halo-reach].
- On Overwatch the client has authority over nothing but its input [@ford2017-overwatch]; ability scripts send only button input and aim from the client [@reed2017-overwatch-abilities].
- Rocket League runs with full server authority, citing cheaters on PC [@cone2018-rocket-league].
- For peer-to-peer co-op physics, Fiedler gives each player authority over their own avatar and over objects they interact with, with the lowest player id winning ties. The same talk warns that this is open to cheating and recommends lockstep or client-server designs for competitive games [@fiedler2010-networked-physics].
- Destiny's cloud "activity host" was trusted for mission state, yet players defeated a raid boss by pulling a network cable because that boss's logic lived in client-only systems [@truman2015-destiny].
- Yan and Randell argue that fairness belongs alongside confidentiality, integrity, availability and authenticity when reasoning about cheating [@yan2005-cheating]; Blackshaw notes that client-side hit detection is open to cheating [@blackshaw2017-online-features].

Red flags: a client message that states an outcome ("I hit player 7 for 50"); rewards or currency granted by client code; server code accepting client positions without bounds; mission-critical logic that runs only on one player's machine.

## Choosing a topology

| Model | What is sent | Strengths | Costs | Shipped example |
| --- | --- | --- | --- | --- |
| Server authority with client prediction | Inputs up, state down | Cheat resistance; late join from current state | Server cost; prediction and correction code | Overwatch [@ford2017-overwatch]; Rocket League [@cone2018-rocket-league] |
| Player-hosted authority | Same, host is a player | No server bill | Host upload limits, host advantage, host migration | Halo: Reach multiplayer [@aldridge2011-halo-reach] |
| Hybrid | Combat peer-to-peer, mission state in the cloud | Low combat latency, persistent missions | Two systems to keep consistent | Destiny [@truman2015-destiny] |
| Deterministic lockstep | Inputs only | Tiny bandwidth for large simulations | Input delay grows with round trip; desyncs | Halo: Reach campaign and Firefight, rejected for competitive play because of that delay [@aldridge2011-halo-reach] |
| Deterministic rollback | Inputs only, with resimulation | Constant low input delay | Determinism, state save and restore, CPU for resimulation | Mortal Kombat and Injustice 2 [@stallone2018-rollback]; For Honor's rewind-and-resimulate model [@doll2017-for-honor-ai] |

## Hiding latency: prediction, reconciliation, lag compensation

- **Prediction and reconciliation.** Overwatch simulates in fixed 16 ms command frames with the client running ahead of the server by about half the round trip plus one buffered frame. The client keeps ring buffers of its inputs and results; when the server disagrees, it restores the server state and replays its stored inputs to the present. Each packet repeats every input the server has not yet acknowledged, and when the server's input buffer runs dry the client briefly shortens its step to refill it [@ford2017-overwatch]. Abilities use the same roll-back-and-replay approach, with prediction on by default [@reed2017-overwatch-abilities].
- **Predict what the player controls, interpolate the rest.** Overwatch draws remote players interpolated between the last two server states [@ford2017-overwatch]. Rocket League instead predicts every car and the ball; other cars' last known inputs decay toward neutral, and a server correction rewinds all objects and re-simulates, which is expensive [@cone2018-rocket-league].
- **Lag compensation.** Overwatch's server rewinds targets to the shooter's view before resolving a shot, favoring the shooter unless the victim did something to avoid it, and above roughly 220 ms round trip it stops predicting some impacts and limits how far it rewinds [@ford2017-overwatch]. Rocket League rejected lag compensation because a high-ping player's accepted hit made the ball jump for low-ping players, while noting it worked acceptably in their earlier game [@cone2018-rocket-league]. The difference is structural: rewinding a hit on one target affects mainly that target, while rewinding a shared physics object changes everyone's game.
- **Design the mechanic around the delay.** Halo: Reach predicted a grenade's throw animation but let the host create the grenade; shipped Armor Lock only after the host shortened its startup by the measured round trip, a deliberate mechanic change after two earlier versions failed, the second in public beta; and hid the correction at the start of assassinations inside a fast camera move [@aldridge2011-halo-reach].

## Rollback and deterministic simulation

- NetherRealm's rollback uses a constant three frames of input delay and up to seven frames of rollback, about 333 ms of round trip before the game pauses, which covered over 99% of their matches. It required bit-for-bit determinism, saving and restoring all mutable state, and heavy optimization toward fitting seven resimulated frames plus one rendered frame into a 16 ms frame. Instead of pausing near the limit they stretch frames by up to about 2 ms each, only at the top of the latency range. Lessons: let game systems drive visual state rather than read it back, run with a forced-rollback debug mode from day one, defer responses until they are outside the rollback window, and never roll back across a cinematic or camera cut [@stallone2018-rollback].
- Spelunky 2 simulates its whole world every frame, so rollback's state copying consumed 25-65% of frame time; after rollback on high-latency connections dropped to at most about 10 frames per second in the PS4 launch, the team shipped a propagation variant it had designed and shelved before release. Players could set input delay themselves, down to zero, and the speaker cares most that the delay is constant [@garciaromero2021-spelunky2].
- For Honor rewinds and resimulates on late inputs, runs about 200 ambient soldiers deterministically so they cost no bandwidth, and replicates hero bots from one peer; state outside the history buffers caused desyncs, and resimulation cost could snowball until very laggy players were removed [@doll2017-for-honor-ai].

Architecture requirements for determinism (random streams, uninitialized state, checksums) are in architecture.md.

## Networking physics

- Fiedler's guidance for rigid bodies: use UDP, because TCP's in-order delivery stalls every later packet behind a lost one; treat jitter and late packets as the main problem; send the highest-priority objects that fit each packet using a per-object priority accumulator; and consider a jitter buffer, which trades added latency for smoother playback [@fiedler2010-networked-physics].
- Rocket League runs physics at a fixed 120 Hz on the server and buffers client inputs there, which resists speed cheats at the cost of added latency. It also began applying the same quantization on server and clients, to remove a source of desyncs [@cone2018-rocket-league].
- The same team ships every physics or netcode change behind a server-side switch so it can be turned off after release [@cone2018-rocket-league].
- Destiny kept combat physics on a player's console, the "physics host", for latency, and moved only mission state to the cloud [@truman2015-destiny].

## Bandwidth and replication

- Halo: Reach split replicated data into droppable state, unguaranteed events and compact per-player control data, and filled each packet by per-object priority based on proximity, view, threat and recent damage [@aldridge2011-halo-reach].
- Aldridge reports that four of the five network optimizations in the talk were essentially game-mechanic changes rather than networking work, and that smarter host selection helped about as much as the bandwidth optimizations [@aldridge2011-halo-reach].
- Blackshaw's common mistakes: making every packet reliable and ordered, and replicating everything [@blackshaw2017-online-features].

## Matchmaking and skill rating

- Keep three systems separate: a hidden skill rating, matchmaking that trades match quality against wait time, and a visible ranking designed for the audience. Ranks that do not drive matching make players question their matches [@menke2016-ranking-design].
- TrueSkill extends Elo by tracking uncertainty and inferring individual skill from team results, and Xbox Live displayed a conservative skill estimate [@herbrich2007-trueskill]. On Halo 2 beta data, TrueSkill predicted the outcomes of closely matched games better than Elo in all four modes tested; in a separate match-quality test it picked out close games better in Free for All and Head to Head but not in Small Teams, possibly because that mode's capture-the-flag games broke its additive team model [@herbrich2007-trueskill]. Elo handles two sides and converges slowly for new players; TrueSkill ignores individual performance within a team, and players may distrust a system they cannot follow [@izquierdo2017-ranking].
- In Halo 5 data, quitting rose with the skill gap between a player and the opposing team and more steeply with the gap between team averages; stacked premade parties drove opponents away; losing streaks, search time and latency within existing limits showed no clear effect. Menke stresses these results are specific to Halo 5 [@menke2020-halo5-matchmaking].
- Population is the constraint: every extra queue, mode or region splits it. Menke recommends few playlists and widening search tolerance as players wait [@menke2016-ranking-design]; Blackshaw puts concurrency first for small games [@blackshaw2017-online-features].

## Social design and toxicity

- In over 10 million League of Legends reports, players reported relatively rarely, a teammate's explicit request to report raised reporting, reviewers pardoned a sizeable share of reported players, and match outcome was linked to toxic behavior [@kwak2015-toxicity]. In another League of Legends study, exposure to toxic players drove new players away while experienced players were more resilient [@grandpreyshores2014-deviance]. Both are single-game studies.
- Practitioner programs: Riot's session presents a player-run Tribunal and an Honor initiative as applications of behavioral research to toxic behavior [@lin2013-player-behavior]; Blizzard's talk on Overwatch's endorsement and group-finding systems covers their design and their effect on disruptive behavior [@miller2019-overwatch-social] (session descriptions only). Psyonix's report-triggered language ban system for Rocket League escalated bans from online play, stepped them back down after good behavior and left permanent bans to humans. Comparing the three months before and after launch, reports rose about a third, and 98% of players banned in its first 90 days came back to play [@connors2018-language-ban].
- Levers to review: who can talk to whom and how (text, voice, pings, none); whether reporting is easy and visibly acted on; whether new players are matched away from repeat offenders; and whether rewards or punishments land on the right player.

## Incentives in co-op and competitive play

- In an experiment with pairs of online strangers playing four versions of one game, both cooperation and interdependence between partners increased social closeness; interdependence worked through more conversation [@depping2017-interdependence]. Seif El-Nasr and colleagues derived cooperative design patterns from 14 co-op games, then used a 60-participant study of four commercial co-op games to identify which patterns worked [@seifelnasr2010-cooperative].
- Patrick Redding lists cooperative dynamics from coercive to voluntary (gating, exotic challenges, rescue states, buffs, asymmetric abilities, combined actions, survival), doubts that developers can police bad behavior, and advises against making co-op the hardcore mode [@redding2011-coop].
- Check the reward rules for accidental competition: shared or individual loot, kill credit, revive credit, and who loses what when a teammate fails.

## Disconnects and recovery

- Halo: Reach elected a new host by distributed vote, rebuilt replication from the new host's state, and had everyone else rejoin as if joining in progress; when the new host lacked current game state, for example after two host failures in quick succession, the world restarted from a clean slate keeping only statistics such as the score. Aldridge also recommends host migration as a way to escape a bad host within seconds [@aldridge2011-halo-reach].
- Destiny players in public areas saw a physics host migration about every 160 seconds. In the best case a planned migration had about 10 seconds of warning and was seamless; an unplanned loss took 15-20 seconds to time out, during which players saw predicted damage but no AI deaths or event progress [@truman2015-destiny].
- About 8% of Spelunky 2 players had connection drops longer than three seconds [@garciaromero2021-spelunky2]. In peer-to-peer designs, a peer leaving with state nobody else holds is a hole in the game [@blackshaw2017-online-features].
- Decide explicitly: timeouts, rejoining the same match, AI takeover or forfeit, pause rules, results and rewards for the players left behind, and whether a player who disconnected is penalized.

## Live operations basics

- Size the platform to the team. Reviewing the online services built for a small team's game, Erridge advises against pre-1.0 software, says to second-guess anything that takes a long time, and is unsure the move to microservices repaid its months of tooling [@erridge2020-indie-online].
- Odyssey Interactive, with two or three people on services, launched with managed services, scripted deploys, a single production environment behind feature flags, end-to-end tests, tracing kept for 30 days, and heavy over-provisioning scaled down after launch [@shankland2024-launch].
- Spelunky 2's public beta day was disrupted by a third-party service outage, a corrupted build and a denial-of-service attack on one server provider [@garciaromero2021-spelunky2].
- Capital Games tied live content to the game's pillars (a durable character economy, incremental progress, respect for player investment), released about every two weeks, and let designers build regular events in data without engineering [@reinhart2019-live-ops].

## Testing networked play

- Bungie ran monthly network playtests under lab-simulated loss, bandwidth limits and latency spikes, gave testers a button that marked "lag" in the replay, and found many marked moments were confusing mechanics rather than network problems [@aldridge2011-halo-reach].
- Spelunky 2's team names ambiguous player reports ("lag", "stutter", "crash" used interchangeably) as its biggest problem, and reproduced desyncs from replay files [@garciaromero2021-spelunky2].
- NetherRealm reproduced desyncs offline from recorded inputs with their network timing, and ran nightly soak tests [@stallone2018-rollback].
- Rare's automated suite included integration tests that pass execution between a server and several clients [@masella2019-sea-of-thieves].

Minimum for any networked build: play sessions under simulated loss, jitter and latency at your target limits; a desync or correction counter visible in debug builds; and a way to capture and replay a session. Treat a player's "lag" report as a symptom to reproduce, not a diagnosis.

## Sources

- `garciaromero2021-spelunky2` Guillermo García Romero (2021). Breaking the Ankh: Deterministic Propagation Netcode in 'Spelunky 2'. Game Developers Conference 2021. https://gdcvault.com/play/1027119/Breaking-the-Ankh-Deterministic-Propagation (GDC talk)
- `stallone2018-rollback` Michael Stallone (2018). 8 Frames in 16ms: Rollback Networking in 'Mortal Kombat' and 'Injustice 2'. Game Developers Conference 2018. https://gdcvault.com/play/1025021/8-Frames-in-16ms-Rollback (GDC talk)
- `reed2017-overwatch-abilities` Dan Reed (2017). Networking Scripted Weapons and Abilities in 'Overwatch'. Game Developers Conference 2017. https://gdcvault.com/play/1024041/Networking-Scripted-Weapons-and-Abilities (GDC talk)
- `blackshaw2017-online-features` Claire Blackshaw (2017). Crash Course in Online Features for Programmers. Game Developers Conference 2017. https://gdcvault.com/play/1024228/Crash-Course-in-Online-Features (GDC talk)
- `claypool2006-latency` Mark Claypool and Kajal Claypool (2006). Latency and player actions in online games. Communications of the ACM 49(11). https://doi.org/10.1145/1167838.1167860 (peer-reviewed)
- `halbhuber2023-latency-perspective` David Halbhuber et al. (2023). The Effects of Latency and In-Game Perspective on Player Performance and Game Experience. Proceedings of the ACM on Human-Computer Interaction 7 (CHI PLAY). https://doi.org/10.1145/3611070 (peer-reviewed)
- `aldridge2011-halo-reach` David Aldridge (2011). I Shot You First: Networking the Gameplay of HALO: REACH. Game Developers Conference 2011. https://gdcvault.com/play/1014345/I-Shot-You-First-Networking (GDC talk)
- `ford2017-overwatch` Timothy Ford (2017). 'Overwatch' Gameplay Architecture and Netcode. Game Developers Conference 2017. https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and (GDC talk)
- `cone2018-rocket-league` Jared Cone (2018). It IS Rocket Science! The Physics of 'Rocket League' Detailed. Game Developers Conference 2018. https://gdcvault.com/play/1024972/It-IS-Rocket-Science-The (GDC talk)
- `fiedler2010-networked-physics` Glenn Fiedler (2010). Physics for Programmers: Networking for Physics Programmers. Game Developers Conference 2010. https://gdcvault.com/play/1012528/Physics-for (GDC talk)
- `truman2015-destiny` Justin Truman (2015). Shared World Shooter: Destiny's Networked Mission Architecture. Game Developers Conference 2015. https://gdcvault.com/play/1022246/Shared-World-Shooter-Destiny-s (GDC talk)
- `yan2005-cheating` Jeff Yan and Brian Randell (2005). A systematic classification of cheating in online games. Proceedings of the 4th ACM SIGCOMM Workshop on Network and System Support for Games (NetGames '05). https://doi.org/10.1145/1103599.1103606 (peer-reviewed)
- `doll2017-for-honor-ai` Frederic Doll and Xavier Guilbeault (2017). Deterministic vs. Replicated AI: Building the Battlefield of 'For Honor'. Game Developers Conference 2017. https://gdcvault.com/play/1024035/Deterministic-vs-Replicated-AI-Building (GDC talk)
- `menke2016-ranking-design` Josh Menke (2016). Skill, Matchmaking, and Ranking Systems Design. Game Developers Conference 2016. https://gdcvault.com/play/1023014/Skill-Matchmaking-and-Ranking-Systems (GDC talk)
- `herbrich2007-trueskill` Ralf Herbrich et al. (2007). TrueSkill™: A Bayesian Skill Rating System. Advances in Neural Information Processing Systems 19 (NIPS 2006). https://doi.org/10.7551/mitpress/7503.003.0076 (peer-reviewed)
- `izquierdo2017-ranking` Mario Izquierdo (2017). Math for Game Programmers: Ranking Systems: Elo, TrueSkill and Your Own. Game Developers Conference 2017. https://gdcvault.com/play/1024369/Math-for-Game-Programmers-Ranking (GDC talk)
- `menke2020-halo5-matchmaking` Josh Menke (2020). Matchmaking for Engagement: Lessons from 'Halo 5'. Game Developers Conference 2020. https://gdcvault.com/play/1026588/Matchmaking-for-Engagement-Lessons-from (GDC talk)
- `kwak2015-toxicity` Haewoon Kwak et al. (2015). Exploring Cyberbullying and Other Toxic Behavior in Team Competition Online Games. Proceedings of the 33rd Annual ACM Conference on Human Factors in Computing Systems (CHI 2015). https://doi.org/10.1145/2702123.2702529 (peer-reviewed)
- `grandpreyshores2014-deviance` Kate Grandprey-Shores et al. (2014). The identification of deviance and its impact on retention in a multiplayer game. Proceedings of the 17th ACM Conference on Computer Supported Cooperative Work and Social Computing (CSCW 2014). https://doi.org/10.1145/2531602.2531724 (peer-reviewed)
- `lin2013-player-behavior` Jeffrey Lin (2013). The Science Behind Shaping Player Behavior in Online Games. Game Developers Conference 2013. https://gdcvault.com/play/1017940/The-Science-Behind-Shaping-Player (GDC talk)
- `miller2019-overwatch-social` Natasha Miller (2019). Social Systems Design, Implementation, and Impacts in 'Overwatch'. Game Developers Conference 2019. https://gdcvault.com/play/1026022/Social-Systems-Design-Implementation-and (GDC talk)
- `connors2018-language-ban` Devin Connors (2018). 'Rocket League': Language Ban System Postmortem. Game Developers Conference 2018. https://gdcvault.com/play/1024995/-Rocket-League-Language-Ban (GDC talk)
- `depping2017-interdependence` Ansgar E. Depping and Regan L. Mandryk (2017). Cooperation and Interdependence: How Multiplayer Games Increase Social Closeness. Proceedings of the Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2017). https://doi.org/10.1145/3116595.3116639 (peer-reviewed)
- `seifelnasr2010-cooperative` Magy Seif El-Nasr et al. (2010). Understanding and evaluating cooperative games. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI 2010). https://doi.org/10.1145/1753326.1753363 (peer-reviewed)
- `redding2011-coop` Patrick Redding (2011). Keep it Together: Encouraging Cooperative Behavior During Co-op Play. Game Developers Conference 2011. https://gdcvault.com/play/1014379/Keep-it-Together-Encouraging-Cooperative (GDC talk)
- `erridge2020-indie-online` Andrew Erridge (2020). Online Game Technology Summit: Scaling to 10 Concurrent Users: Online Infrastructure as an Indie. Game Developers Conference 2020. https://gdcvault.com/play/1026593/Online-Game-Technology-Summit-Scaling (GDC talk)
- `shankland2024-launch` Christopher Shankland (2024). How to Launch an Online Game and Still Attend the Launch Party. Game Developers Conference 2024. https://gdcvault.com/play/1034605/How-to-Launch-an-Online (GDC talk)
- `reinhart2019-live-ops` Nicolas Reinhart (2019). Live Ops in 'Star Wars: Galaxy of Heroes'. Game Developers Conference 2019. https://gdcvault.com/play/1025853/Live-Ops-in-Star-Wars (GDC talk)
- `masella2019-sea-of-thieves` Robert Masella (2019). Automated Testing of Gameplay Features in 'Sea of Thieves'. Game Developers Conference 2019. https://gdcvault.com/play/1026042/Automated-Testing-of-Gameplay-Features (GDC talk)
