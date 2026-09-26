# Evaluating whether the game does what you intend

Read this when deciding how to check a change, planning or reading a playtest, interpreting analytics, or reporting what has and has not been verified. It covers matching evidence to claims, playtesting, expert inspection, biometrics, telemetry, small samples, the limits of agent-run checks, and a compact evidence log.

## Match the evidence to the claim

Start from the claim you want to make, then pick the cheapest evidence that can support or weaken it. A deterministic rule can be settled by a test; "players understand this" can only be settled by watching players. Effort should scale with the size of the change and how uncertain the outcome is.

| Claim | Evidence that can support it | Limit |
| --- | --- | --- |
| A rule or state transition is correct | Invariant and boundary tests on the logic | Covers only the cases written down; tests written while the design is still moving tend to go stale [@murphyhill2014-cowboys; @masella2019-sea-of-thieves] |
| The feature runs without breaking | Driving the real input path, logs, soak runs with scripted bots | One path is not the whole game; Battlefield V's bots skipped the UI and could not reproduce hardware-specific crashes [@gillberg2019-battlefield-bots] |
| The game stays within its frame and memory budget | Per-build profiles on the target hardware and representative scenes | A desktop run says little about a phone or console; Call of Duty's pipeline records statistics per build and runs nightly captures at stored map locations against budget [@vanvalburg2018-cod-testing] |
| Controls feel more responsive | Comparable input-to-response measurements plus observed play | Measurement depends on capture method and device; feel still needs people |
| The UI is usable | Heuristic inspection [@pinelle2008-heuristics], then observed use at real screen sizes | Heuristics find usability problems, not whether the game is fun; a screenshot does not prove navigation works |
| Players understand a mechanic or goal | New players, unassisted, observed [@lemarchand2012-attention; @dejongh2017-evil-data] | A handful of sessions finds many problems, with diminishing returns per added session [@nielsen1993-usability-model]; it cannot tell you how common they are |
| A choice is meaningful or balanced | Telemetry on what players pick, plus observation or interviews on why [@kim2008-true] | Pick rates alone do not explain themselves; heavy players can dominate averages [@giovannetti2019-slay-the-spire] |
| Difficulty is where you want it | Deaths or failures per section and watched attempts [@lemarchand2012-attention] | Agent-based difficulty estimates exist but were calibrated on real player data and were least human-like on the hardest content [@gudmundsson2018-humanlike; @roohi2020-churn] |
| Players enjoy it and it meets the experience goal | Playtests with the intended audience against stated experience goals [@fullerton2018-workshop; @ambinder2009-playtesting] | Simulated or agent play is not evidence of human enjoyment [@holmgard2019-personas]; AI 'users' are proposed for some stages, such as navigation checks on levels, as a supplement to human tests [@stahlke2018-usertesting] |

Uncited rows and cells are this skill's reasoning.

Before changing anything to fix a reported problem, record how the build behaves now and write down what result would support or weaken your explanation. Change one thing where you can; if balance, presentation and level layout all change in one pass, a better or worse result cannot be traced to any of them.

## Playtesting practice

**Treat the design as a hypothesis.** Valve's user research framed game designs as hypotheses and playtests as experiments, run early and often. The goal was to test for fun, not to hunt bugs, tune balance or run a focus group [@ambinder2009-playtesting]. Fullerton's playcentric process begins with written player experience goals. These describe what players should find themselves doing and feeling, not features. A rough prototype is then tested against those goals, and the results decide whether to revise, restart or move on [@fullerton2018-workshop]. Sony Santa Monica put it as testing how well the team had realised a fixed vision, not asking players to redesign it, with goals clear enough to measure [@dearien2019-god-of-war].

**Run the session so the data stays clean.**

- Say as little as possible. De Jongh tells testers only that the game is unfinished, then watches where they get stuck [@dejongh2017-evil-data]. On Uncharted 3, testers who had never seen the game played once, got no help and did not talk to each other [@lemarchand2012-attention].
- Watch what players do before asking what they think. Valve's deck says nothing beats direct observation of play, while noting that observers bias sessions and one vivid moment can skew the reading. Players also cannot always say why they acted [@ambinder2009-playtesting].
- Collect undirected feedback before asking specific questions, so the questions do not suggest problems [@dearien2019-god-of-war].
- When a complaint is vague, follow up with a narrower session. God of War paired unguided playthroughs with one-on-one usability tests. One "combat isn't fun" report turned out to be camera sensitivity [@dearien2019-god-of-war].
- Treat suggested fixes as symptoms. Testers describe what feels wrong well, but often propose solutions to problems they have not diagnosed [@dejongh2017-evil-data]. Gingold and Hecker's rule for prototype tests is to record observations, not suggestions [@gingold2006-prototyping]. Dallas found it useful to trust that a player was upset, and less useful to trust their explanation of why [@dallas2018-edith-finch].
- Match the setting to how the game will be played. Bounden was tuned on five-minute sessions at events, for a game meant to take about an hour [@dejongh2017-evil-data].

**Fix between sessions and check the fix.** Naughty Dog made fixes between Uncharted 3 tests and checked them in the next [@lemarchand2012-attention]. De Jongh changes builds between sessions rather than holding the build constant [@dejongh2017-evil-data]. Medlock's chapter in *Games User Research* covers the Rapid Iterative Test and Evaluation method (RITE): its philosophy, definition, benefits and practical notes, and the case study behind the 2002 article that documented it [@drachen2018-gur]. This skill's reasoning: change only what an observation clearly explains, and keep testing afterwards so a bad fix shows up.

**Know who is playing.** Bungie recruited Destiny testers from fans. It countered their bias with comparative questions ("was this mission better than that one") and by checking that agency-recruited players gave essentially the same results [@hopson2015-destiny]. It also tested each piece of content both in tightly controlled sessions and in free-form play [@hopson2015-destiny]. Some lab findings were later contradicted by live players, because lab characters were throwaway [@hopson2015-destiny]. On skate., internal team playtests were quick and cheap, but the team was not the target audience and knew the game too well. They could not test the first-time experience, and some findings needed outside confirmation [@goncalves2023-skate]. The team collected written feedback before group discussion to limit groupthink [@goncalves2023-skate].

For a solo or jam project, the same principles apply at small scale. A few friends who have never seen the game, a silent observer, and notes taken during play can be enough.

## Expert inspection with heuristics

Heuristic evaluation means an evaluator checks the game against a list of principles. No players are involved.

- Desurvire, Caplan and Toth's short CHI 2004 study applied 43 playability heuristics to an early mock-up with no playable gameplay, and compared the results with four think-aloud sessions. The heuristics found more issues overall, while the players found more game-specific problems such as confusing terms. The authors recommend heuristics for early, general issues, combined with user testing [@desurvire2004-hep]. The evidence is one mock-up and four players.
- Pinelle, Wong and Stach derived ten usability heuristics from reviews of 108 PC games across six genres. They are aimed at early and functional prototypes [@pinelle2008-heuristics].
- Desurvire and Wixon's later chapter reports that their PLAY and GAP heuristics were much more effective than informal reviews [@drachen2018-gur].

This is something an agent can do: walk each screen and flow against a heuristic list and report likely problems. Label the result as an inspection, not a playtest.

## Biometrics

Valve's deck lists heart rate, skin conductance, eye tracking, facial coding, EEG and EMG. It describes them as more objective measures of player state, but expensive, intrusive and likely to make the session artificial. Skin conductance, for example, is listed as a strong correlate of arousal that is also susceptible to other factors [@ambinder2009-playtesting]. Mirza-Babaei and colleagues proposed Biometric Storyboards. In one CHI study, games revised after a Biometric Storyboards user test scored significantly better on visuals, fun and gameplay quality than games designed without user tests; a classic user test did not show that significant advantage [@mirzababaei2013-biost]. Chapters by Nacke and by Chalfoun and Dankoff in *Games User Research* cover when biometrics suit a research question and how to make the data actionable for a production team [@drachen2018-gur].

For most small projects, start with observation and simple telemetry. Consider biometrics only when the question is about moment-to-moment arousal and someone can interpret the signal properly.

## Telemetry and instrumentation

**Log the what, collect the why separately.** Behavioural logs alone cannot explain why players acted. The TRUE system combined instrumentation with attitudinal, demographic and contextual data from other methods [@kim2008-true]. Canossa argues in *Game Analytics* that behavioural data has no built-in meaning, and that the variables you choose to track limit which questions you can answer later [@elnasr2013-analytics]. De Jongh's funnels showed where Hidden Folks players stopped, but not why, so the reason had to be guessed; heatmaps narrowed the guesswork because they are spatial [@dejongh2017-evil-data].

**Small, purpose-built telemetry pays off.**

- On Uncharted 3 a deaths-per-section table flagged spikes. A "bad jumps" view, built in a few hours, marked every spot where a tester pressed jump without reaching a ledge; the markers clustered under objects that looked climbable but were not [@lemarchand2012-attention].
- On Destiny a button press logged a player-marked moment with its world position, and results were shown inside the designers' own world editor [@hopson2015-destiny].
- BioWare pointed telemetry at developers and testers using unfinished builds, not only at players after launch [@elnasr2013-analytics].

Red flags in an instrumented build:

- events without build id, session id, timestamp or position;
- only aggregates stored, so single sessions cannot be replayed or inspected;
- event names that change between builds;
- no way to join a log to the notes from the session that produced it.

For reproducing a run exactly, deterministic input recording and replay can serve as both a test and a debugging tool [@provinciano2015-replays].

## Analytics caveats

From Kongregate's experience with live games [@greer2018-data-blinded]:

- A shift in a metric often reflects a change in who is playing, not in the game.
- Averages hide small broken segments.
- Sliced cohorts quickly become too small to trust, so show the sample size on every chart.
- Revenue and play time follow power laws, so medians and rank tests describe them better than means.
- Almost everything correlates with engagement.
- Short tests over-represent the most engaged players.
- Most A/B tests show no significant difference.
- Data describes the known world. It cannot tell a team what new thing to make.

Other cautions:

- Valve's deck warns that averages hide extremes and that stats can show illusory patterns [@ambinder2009-playtesting].
- On Slay the Spire, one card looked strong mainly because players usually took it just before the Act 3 boss, and two heavy testers dominated aggregate averages [@giovannetti2019-slay-the-spire].
- Lemarchand cautions against following metrics further than your judgement [@lemarchand2012-attention].

## Interpreting small samples

When a playtest involves only a few people, the sample is good for finding problems and weak for measuring how common something is.

- Across 11 usability studies, Nielsen and Landauer found that each added user or evaluator finds fewer new problems, following a predictable curve. For their mid-sized example, 16 evaluations were worth their cost and the best return per evaluation came at four [@nielsen1993-usability-model]. Those figures describe finding problems in their example, not a universal sample size.
- On God of War, four of 20 players saying the Valkyries were too difficult was enough to review that balance item. The researchers said what mattered was the relevance and cause of a problem, not the count, and that 20 players per session was chosen for a range of player types [@dearien2019-god-of-war].
- Dallas found about five players per round gave most of the value for Edith Finch's narrative tests [@dallas2018-edith-finch].
- Ruskin's statistics primer, deliberately simplified, warns of several traps [@ruskin2016-statistics]:
  - small samples from the same population can produce very different averages;
  - choose the significance threshold before looking at the data;
  - a confidence interval that spans zero is no result;
  - skewed data such as play time needs medians and a rank test;
  - running many tests and keeping the one that "worked" produces false findings.

This skill's reasoning:

- Report counts ("3 of 5 players missed the door"), not percentages.
- One observation with an obvious cause can justify a fix.
- A preference or a rate needs many more players, or live data, before it supports a claim about the audience.

## What an AI coding agent can and cannot verify

This section is mostly the skill's own reasoning. The research cited below is about automated playtesting in general, not about coding agents specifically.

**Research and industry evidence:**

- Procedural personas are search agents given designer-written goals. They played MiniDungeons 2 levels in distinct styles and ran fast enough for iterative design. The study involved no human players, and the personas are only as good as the goals designers write for them [@holmgard2019-personas].
- A human-like agent trained on Candy Crush player data predicted level difficulty better than tree search, but it depended on large logs of real players' moves [@gudmundsson2018-humanlike].
- Agents plus a simulated player population predicted pass and churn rates across Angry Birds Dream Blast levels. The authors note the method was not yet validated in real design work, and that its estimates were least human-like on the hardest levels [@roohi2020-churn].
- Stahlke and Mirza-Babaei argue that AI "users" can supplement games user research, not replace it [@stahlke2018-usertesting].
- In industry, Battlefield V's bots aimed for test coverage, not human-like play. Over two months they had found about half the crashes seen in human playtests [@gillberg2019-battlefield-bots].
- Rare kept human testers because people are better at noticing audiovisual defects, exploring, and judging how the game feels [@masella2019-sea-of-thieves].
- A survey of game testing literature found developers rely almost entirely on manual play-testing [@politowski2021-testing].

| An agent can establish | An agent can gather evidence for | Only people can establish |
| --- | --- | --- |
| Code compiles, tests pass, invariants hold | Whether a level is completable, where scripted play gets stuck, crash and soak stability | Whether it is fun, readable to a newcomer, or matches the experience goal |
| A replayed input sequence reproduces a bug | Performance on the machine it runs on | How it feels on the target device and controller |
| Logged events fire with the right fields | Heuristic UI issues from screenshots | Whether players understand what the UI means |

Exercise the path you changed and the transitions most likely to break around it:

- entry and normal use;
- failure, interruption and restart;
- scene changes, and save and load where they apply.

Use fixed random seeds where that makes results repeatable. In early prototypes, strip detail to what the question needs, but keep enough feedback for testers to understand what happened; a prototype that hides key information gives misleading design feedback.

When reporting, keep four labels distinct:

- **implemented**: the code exists;
- **automatically checked**: tests or scripted runs passed;
- **played by the agent**: the agent drove the build and observed it;
- **tested by people**: humans played it and were observed.

If the agent had no runtime access, say so plainly instead of implying the game was played.

## Keep a compact evidence log

On sustained design work, keep one short project-local log, reusing existing notes rather than duplicating the design document. Each entry records:

- date and build or commit;
- the question;
- the method (who, how many, which build, what was logged);
- what was observed, as counts and short quotes;
- the interpretation;
- the decision and the next check.

Sony Santa Monica sent short top-line summaries after every test [@dearien2019-god-of-war]. Mirza-Babaei's chapter argues that a report has to motivate the team to act, not just be accurate [@drachen2018-gur]. The log should make it easy to see which beliefs rest on people, which on scripts, and which on nothing yet.

Size the effort to the project:

- **Game jam:** one line per test in a text file.
- **Commercial project:** the same log, plus links to recordings and telemetry queries.

## Sources

- `murphyhill2014-cowboys` Emerson Murphy-Hill et al. (2014). Cowboys, ankle sprains, and keepers of quality: how is video game development different from software development?. Proceedings of the 36th International Conference on Software Engineering (ICSE 2014). https://doi.org/10.1145/2568225.2568226 (peer-reviewed)
- `masella2019-sea-of-thieves` Robert Masella (2019). Automated Testing of Gameplay Features in 'Sea of Thieves'. Game Developers Conference 2019. https://gdcvault.com/play/1026042/Automated-Testing-of-Gameplay-Features (GDC talk)
- `gillberg2019-battlefield-bots` Jonas Gillberg (2019). AI for Testing: The Development of Bots that Play 'Battlefield V'. Game Developers Conference 2019. https://gdcvault.com/play/1025905/AI-for-Testing-The-Development (GDC talk)
- `vanvalburg2018-cod-testing` Jan van Valburg (2018). Automated Testing and Profiling for 'Call of Duty'. Game Developers Conference 2018. https://gdcvault.com/play/1025064/Automated-Testing-and-Profiling-for (GDC talk)
- `pinelle2008-heuristics` David Pinelle et al. (2008). Heuristic evaluation for games: usability principles for video game design. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI 2008). https://doi.org/10.1145/1357054.1357282 (peer-reviewed)
- `lemarchand2012-attention` Richard Lemarchand (2012). Attention, Not Immersion: Making Your Games Better with Psychology and Playtesting, the Uncharted Way. Game Developers Conference 2012. https://gdcvault.com/play/1015464/Attention-Not-Immersion-Making-Your (GDC talk)
- `dejongh2017-evil-data` Adriaan de Jongh (2017). Playtesting: Avoiding Evil Data. Game Developers Conference 2017. https://gdcvault.com/play/1024132/Playtesting-Avoiding-Evil (GDC talk)
- `nielsen1993-usability-model` Jakob Nielsen and Thomas K. Landauer (1993). A mathematical model of the finding of usability problems. Proceedings of the INTERACT and CHI Conference on Human Factors in Computing Systems (INTERCHI 1993). https://doi.org/10.1145/169059.169166 (peer-reviewed)
- `kim2008-true` Jun H. Kim et al. (2008). Tracking real-time user experience (TRUE): a comprehensive instrumentation solution for complex systems. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI 2008). https://doi.org/10.1145/1357054.1357126 (peer-reviewed)
- `giovannetti2019-slay-the-spire` Anthony Giovannetti (2019). 'Slay the Spire': Metrics Driven Design and Balance. Game Developers Conference 2019. https://gdcvault.com/play/1025731/-Slay-the-Spire-Metrics (GDC talk)
- `gudmundsson2018-humanlike` Stefan Freyr Gudmundsson et al. (2018). Human-like playtesting with deep learning. 2018 IEEE Conference on Computational Intelligence and Games (CIG). https://doi.org/10.1109/CIG.2018.8490442 (peer-reviewed)
- `roohi2020-churn` Shaghayegh Roohi et al. (2020). Predicting game difficulty and churn without players. Proceedings of the Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2020). https://doi.org/10.1145/3410404.3414235 (peer-reviewed)
- `fullerton2018-workshop` Tracy Fullerton (2018). Game Design Workshop: A Playcentric Approach to Creating Innovative Games. CRC Press, 4th edition. https://doi.org/10.1201/b22309 (book)
- `ambinder2009-playtesting` Mike Ambinder (2009). Valve's Approach to Playtesting: the Application of Empiricism. Game Developers Conference 2009. https://gdcvault.com/play/1566/Valve-s-Approach-to-Playtesting (GDC talk)
- `holmgard2019-personas` Christoffer Holmgård et al. (2019). Automated playtesting with procedural personas through MCTS with evolved heuristics. IEEE Transactions on Games. https://doi.org/10.1109/TG.2018.2808198 (peer-reviewed)
- `stahlke2018-usertesting` Samantha N. Stahlke and Pejman Mirza-Babaei (2018). Usertesting without the user: opportunities and challenges of an AI-driven approach in games user research. Computers in Entertainment. https://doi.org/10.1145/3183568 (peer-reviewed)
- `dearien2019-god-of-war` Ed Dearien et al. (2019). Playtesting 'God of War'. Game Developers Conference 2019. https://gdcvault.com/play/1025978/Playtesting-God-of-War (GDC talk)
- `gingold2006-prototyping` Chaim Gingold and Chris Hecker (2006). Advanced Prototyping. Game Developers Conference 2006. https://gdcvault.com/play/1013252/Advanced (GDC talk)
- `dallas2018-edith-finch` Ian Dallas (2018). Weaving 13 Prototypes into 1 Game: Lessons from 'Edith Finch'. Game Developers Conference 2018. https://gdcvault.com/play/1025016/Weaving-13-Prototypes-into-1 (GDC talk)
- `drachen2018-gur` Anders Drachen et al. (2018). Games User Research. Oxford University Press (edited volume). https://doi.org/10.1093/oso/9780198794844.001.0001 (book)
- `hopson2015-destiny` John Hopson (2015). User Research on Destiny. Game Developers Conference 2015. https://gdcvault.com/play/1022354/User-Research-on (GDC talk)
- `goncalves2023-skate` Andreia Goncalves (2023). UX Summit: Step Into Your Player's Shoes: Making the Most of Team Playtests on 'skate'. Game Developers Conference 2023. https://gdcvault.com/play/1028859/UX-Summit-Step-Into-Your (GDC talk)
- `desurvire2004-hep` Heather Desurvire et al. (2004). Using heuristics to evaluate the playability of games. CHI '04 Extended Abstracts on Human Factors in Computing Systems (Late Breaking Results). https://doi.org/10.1145/985921.986102 (peer-reviewed)
- `mirzababaei2013-biost` Pejman Mirza-Babaei et al. (2013). How does it play better? Exploring user testing and biometric storyboards in games user research. Proceedings of the SIGCHI Conference on Human Factors in Computing Systems (CHI 2013). https://doi.org/10.1145/2470654.2466200 (peer-reviewed)
- `elnasr2013-analytics` Magy Seif El-Nasr et al. (2013). Game Analytics: Maximizing the Value of Player Data. Springer (edited volume). https://doi.org/10.1007/978-1-4471-4769-5 (book)
- `provinciano2015-replays` Brian Provinciano (2015). Automated Testing and Instant Replays in Retro City Rampage. Game Developers Conference 2015. https://gdcvault.com/play/1021825/Automated-Testing-and-Instant-Replays (GDC talk)
- `greer2018-data-blinded` Emily Greer (2018). Data-Driven or Data-Blinded? Uses and Abuses of Analytics in Games. Game Developers Conference 2018. https://gdcvault.com/play/1025095/Data-Driven-or-Data-Blinded (GDC talk)
- `ruskin2016-statistics` Elan Ruskin (2016). Three Statistical Tests Every Game Developer Should Know. Game Developers Conference 2016. https://gdcvault.com/play/1023323/Three-Statistical-Tests-Every-Game (GDC talk)
- `politowski2021-testing` Cristiano Politowski et al. (2021). A Survey of Video Game Testing. 2021 IEEE/ACM International Conference on Automation of Software Test (AST). https://doi.org/10.1109/ast52587.2021.00018 (peer-reviewed)
