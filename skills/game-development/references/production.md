# Production: scope, prototypes, milestones, pace and shipping

Read this when planning or re-planning a game project: deciding what to build first, whether scope is under control, how to prototype, when a vertical slice or milestone is done, how to avoid crunch, how to keep a team aligned, what a platform requires before release, and how to work with an AI coding agent without losing the design. Scale everything here to the project; a weekend jam needs a fraction of it.

## Size the process to the project

This table is the skill's own reasoning, not a finding.

| Project | Process that usually pays for itself |
| --- | --- |
| Game jam (hours to days) | One core question, one playable build early, cut aggressively, no schedule beyond "playable by the halfway point" |
| Solo or small hobby project | A written core and experience goal, a short cut list, a prototype per risky idea, a playtest whenever a milestone lands |
| Small commercial team | The above, plus a risk list, a slice or first-playable gate, estimates tracked against actuals, a shared design note, and platform requirements checked early |
| Large team | Formal milestones, embedded QA, dependency tracking and dedicated user research, drawn on by the larger-studio sources below |

Studio sources describe their own context. A large studio's slice process or a multi-studio test pipeline shows what worked there, not a minimum for a small team.

## Scope and feature creep: what postmortem studies show

Peer-reviewed analyses of published postmortems find scope and planning problems common, and those that compare causes rank people and process problems above technical ones:

- **Washburn et al.** coded 155 postmortems. The most frequent things that went wrong were [@washburn2016-postmortems]:
  - obstacles (37%);
  - schedule (25%), often estimation problems and optimistic scheduling;
  - development process (24%), often too little up-front planning;
  - game design (22%), often designs too ambitious to build in the time.

  Their recommendations: manage risk, prototype to prove features before committing to them, avoid over-ambitious designs, and distrust estimates that already feel optimistic.
- **Politowski et al.** coded 927 problems from 200 postmortems and found that most of the leading root causes concerned people rather than technology, among them too few people for the work, poor work environment, underestimation, unclear design vision, lack of fun, and misaligned teams. Scope problems recur. Feature creep persists, though it declined over the years [@politowski2021-problems].
- **Petrillo et al.** earlier surveyed development problems collected mainly from game postmortems [@petrillo2009-what-went-wrong]. Politowski et al. summarise that study's findings as management problems outweighing technical ones, with scope, feature creep and cut features among the most common [@politowski2021-problems].
- **Murphy-Hill et al.** found in interviews and a survey that game requirements are less clear than in other software: the target is that the game is fun, which is subjective, and a clear design may still turn out not to be fun once implemented [@murphyhill2014-cowboys].

Postmortems are self-reported and cover shipped games, so they may understate failures [@washburn2016-postmortems; @politowski2021-problems].

Practitioner lessons on keeping scope honest:

- Tom Francis, a solo developer, filters ideas by asking how much must be built before knowing whether they work. Francis found scope creep helped when it deepened the game's core and hurt when it did not, and warns that games needing many separate parts to be good are risky for one person [@francis2018-scope].
- Carrie Patel (Obsidian) shows how one "free" extra quest becomes work for design, narrative, combat, art, cinematics, lighting, audio and effects [@patel2022-mavericks].
- Edholm et al. found crunch was less pronounced in studios that regularly prioritise features [@edholm2017-crunch].

Red flags in a codebase or backlog:

- new systems land with no matching cut;
- "while I'm in here" features ride along with fixes;
- feature flags and debug modes pile up with no owner;
- the task list only grows between milestones.

The smallest useful change is a ranked feature list with a visible cut line. Every addition names what it displaces. This is the skill's reasoning.

## Prototyping: answer one question cheaply

Chris Hecker and Chaim Gingold's GDC 2006 talk on prototyping Spore and games at the Indie Game Jam gives a compact guide [@gingold2006-prototyping]:

- A prototype validates an idea; it does not generate one.
- Each prototype should make a falsifiable claim about one question. The question must be small enough to answer and relevant enough to matter to the real game.
- Break big problems into prototypable pieces, and write down what the prototype assumes about everything outside it.
- Spend effort only on the qualities the question needs. Write code only where you need understanding; fake the rest with content.
- Break software-engineering norms on purpose: don't commit to abstractions early.
- When testing, stay quiet and record what people do.

Other practitioners and educators describe related practice:

- Fullerton's process builds a rough physical prototype of the core mechanics right after brainstorming, with digital prototypes after that. Fullerton advises against starting production before the experience goals and core mechanics are understood [@fullerton2018-workshop].
- In Wilson and Foddy's game-a-week classes, each prototype had to answer an open question about a mechanic, an aesthetic or an experience. It did not need to be bug-free, and could reuse code and assets. The format existed to make students drop weak ideas early instead of polishing their first one [@wilson2018-game-a-week].
- Barrett aims for a "minimum viable interaction" rather than a minimum product, and built a testable prototype with a wireframing tool and no code [@barrett2017-rapid-prototypes].
- Dallas prototyped Edith Finch stories alone in Unity, although the game shipped in Unreal, to keep prototypes light, and dropped ideas that still felt like hard work after a couple of days [@dallas2018-edith-finch].
- Far Cry 4's gameplay team put prototypes in the real game, so people could play and argue about something concrete [@saulnier2015-far-cry-4].
- Rare kept new Sea of Thieves features on a prototype branch without automated tests. Tests written while still finding the fun would have kept breaking [@masella2019-sea-of-thieves].

Among Washburn et al.'s postmortems, teams whose process went well tended to have planned before development, used prototypes as proofs of concept and iterated [@washburn2016-postmortems].

For an agent, this skill's reasoning:

- Keep prototype code in a clearly named branch or folder.
- State the question the prototype answers in its header or note.
- Decide explicitly whether to throw the prototype away or harden it before building on it.

## Vertical slices and milestones

Volition defines a vertical slice as a section of the game that communicates the intended player experience. Major systems work together in it, at close to final quality. Volition uses it as the gate into production: does the team know what it is making and how, with acceptable tech debt [@donovan2015-vertical-slice]? Greg Donovan's lessons from six projects:

- Build the slice around the player experience, not a feature list.
- A tech demo or an aspirational visual target is not a slice.
- A team still proving core gameplay is not in production.
- Fixing issues in a small section does not reveal how much work there is at full scale.
- Unscheduled late features broke plans.
- On Saints Row 1 the studio asked for more hours instead of cutting scope, which led to heavy crunch [@donovan2015-vertical-slice].

Patel recommends working toward a minimum viable version at every stage, to catch scope and direction problems while there is still time to change course [@patel2022-mavericks].

For a small project, the skill's reasoning:

- A milestone is a playable build plus an evidence-log entry that says what was learned (see `evaluation.md`).
- Use two gates: a first playable of the core loop, then a slice that shows the intended experience.
- Anything that fails its gate goes back to prototyping or gets cut. It does not get carried forward.

## Risk-first planning

- Far Cry 4's gameplay team planned by de-risking first: it would prototype a risky minor feature before polishing a safe major one. It named four kinds of risk: realisation (can it look right), design (is it fun), technical (can the engine do it in time) and balance [@saulnier2015-far-cry-4].
- Washburn et al. recommend risk management, especially for newly formed teams [@washburn2016-postmortems].
- Francis's question of how much must be built before an idea can be judged is a cheap way to rank risk [@francis2018-scope].

This skill's reasoning:

- Keep a short list of open unknowns with the cheapest test for each, and work from the top.
- Typical entries include: is the core fun; can the target hardware run it; how many assets does the content plan imply; what does the store or platform require.

## Estimation, flow and schedule

- Chris Cobb treats estimates as predictions, not commitments, with coarse estimates far out and finer ones close in. Cobb tracks newly discovered work, calling a failure to factor it into projections probably the most common roadmap mistake, and never plans with unfilled headcount [@cobb2022-anti-crunch]. On League of Legends' Team Builder, velocity-based projections let the team push back when told to crunch [@cobb2022-anti-crunch].
- Patel warns that history inflated by unscheduled overtime corrupts later estimates, and that schedules cannot assume full efficiency [@patel2022-mavericks].
- Justin Fischer applies operations ideas [@fischer2017-science]:
  - limit work in progress;
  - add people one at a time;
  - don't keep everyone busy for its own sake;
  - write acceptance criteria so features don't churn;
  - fix defects when they appear instead of batching QA at the end.
- Francis publicly predicted that Gunpoint would take six months to a year ("surprised" if less, "sad" if more); it took three years of weekends [@francis2018-scope].

## Iteration speed and tools

- **Shorten the loop.** Gingold and Hecker's slides list the tuning options for a prototype: recompiling, data-driving, hot-loading, scripting and interactive editors [@gingold2006-prototyping]. Far Cry 4's team credits faster builds and per-change "preflight" builds checked on every platform [@saulnier2015-far-cry-4]. Its engine team cut an editor rebuild from about 40 minutes to about 4 [@quenin2015-iteration].
- **Test what pays off.** Automated tests go stale when the design changes constantly [@murphyhill2014-cowboys]. Rare preferred unit tests where possible and gave each feature an integration test for its main path; flaky tests were retried, then quarantined [@masella2019-sea-of-thieves]. Kevin Dill's advice when tests cost more than they return: write coarser tests through public interfaces, and add a test with each bug fix rather than chasing coverage [@dill2021-tests].
- **Point telemetry at the team too.** BioWare used telemetry to track how developers and testers worked with unfinished builds [@elnasr2013-analytics].

## Crunch and sustainable pace

The peer-reviewed studies of crunch cited here are qualitative:

- Edholm et al. (postmortems and interviews) describe four types of crunch. One type helped product and schedule, but every type raised stress [@edholm2017-crunch].
- Cote and Harris, analysing Game Developer magazine from 2000 to 2010, show how developer discourse framed crunch as inevitable, through ideas of unmanageable creativity, an anti-corporate ethos, and passion [@cote2021-crunch].
- Peticca-Harris et al., analysing two blogs by developers' spouses and their reader comments, challenge the belief that long hours are needed to make successful games, and argue that project-based work makes resisting them hard [@peticcaharris2015-perils].

IGDA developer survey reports are neither peer-reviewed nor another source type this skill admits, so this file does not rely on them.

Practitioner evidence, with its limits stated:

- Ian Schreiber's review of occupational-health research concludes that crunch usually signals an unrealistic schedule. The remedies are to cut scope, move the date, or add people early enough for them to ramp up. Schreiber sees no justification for crunch beyond about a month [@schreiber2022-crunch]. The studies are cited on the slides, not in the talk.
- Paul Tozour's Game Outcomes Project collected 273 survey responses from developers. Teams with the least crunch had the best outcomes. Tozour stresses that the survey was not peer-reviewed, relied on recall, and shows correlation only [@tozour2016-outcomes].
- Cobb recommends a steady pace, so that any push is an opt-in exception [@cobb2022-anti-crunch]. Patel describes how "mavericks" and "martyrs" pull whole teams into unscheduled overtime [@patel2022-mavericks].

An agent does not tire, but the people using it do. When a schedule slips, present the options in this order: cut, re-sequence, move the date, add help. Do not quietly absorb more work. This is the skill's reasoning.

## Team communication

- In Murphy-Hill et al.'s study, game teams valued the ability to communicate with non-engineers more than other software teams did [@murphyhill2014-cowboys]. Misaligned teams and an unclear design vision are among Politowski et al.'s leading root causes [@politowski2021-problems].
- In Tozour's survey, a shared vision was the strongest correlate of good outcomes, with the survey's limits above [@tozour2016-outcomes].
- Aaron Thibault (Gearbox) reviews communication failures from published postmortems [@thibault2015-communication]:
  - specs not kept current;
  - dependencies nobody planned;
  - cuts made late because nobody owned them.

  Thibault's recommendations: clear ownership and a named customer for each feature; retrospectives soon after milestones; showing the whole dependency chain when proposing a cut; and making "I don't know" an acceptable answer.
- Patel found cuts land better when people understand the reasons [@patel2022-mavericks].
- Fullerton treats design documentation as a living collaboration tool, not a static spec [@fullerton2018-workshop]. On Edith Finch the game itself became the design document [@dallas2018-edith-finch].

For a small team with an agent, this skill's reasoning:

- Keep one short design note stating the experience goal, core loop, current cut line and open risks.
- Keep the evidence log next to it.
- Update both when decisions change.

## Shipping checklists

Platform rules change. Recheck the official pages before relying on these, which were read on 26 September 2026.

- **Steam** reviews both the store page and the build before release. Each review typically takes 3 to 5 business days; Valve asks for at least 7 business days of lead time. The build must run on every listed OS and implement every feature the store page lists [@valve2026-steam-review]. A new product's Coming Soon page must be public for at least two weeks before release [@valve2026-steam-coming-soon].
- **Apple** requires final, complete submissions, tested on-device for crashes, with placeholder content removed and demo credentials for any login [@apple2026-app-review].
- **Google Play** requires new apps and updates to target Android 16 (API level 36) or higher from 31 August 2026, with different minimums for some device types [@google2026-target-api].

Beyond platform rules, the list is this skill's reasoning:

- a clean build from a fresh checkout;
- the full flow of first launch, save, quit and resume;
- settings that persist;
- input remapping and pause everywhere;
- graceful handling of missing saves and disconnected controllers;
- credits and third-party licences;
- store assets that match the build;
- a written list of known issues.

## Working with AI coding agents in production

This section is mostly the skill's reasoning. No admissible study of AI coding agents in game production was found.

- **Make the smallest change that can be reviewed and tested.** Pair each change with the evidence that it works, labelled as in `evaluation.md`. Separate refactors from behaviour changes.
- **Keep design intent in the project, not the chat.** The design note and evidence log above outlive any session. Read them before proposing work, and update them when a decision changes.
- **Don't over-build.** Build what the current question or milestone needs. Hecker and Gingold's advice to avoid committing to abstractions during prototyping [@gingold2006-prototyping] applies with more force when code is cheap to generate. Patel's hidden-scope point [@patel2022-mavericks] applies to agent-suggested extras: each one is work someone must test, balance and maintain.
- **Ask before adding scope.** Propose new features, systems or content as options with their cost and what they displace. Do not implement them unasked.
- **Respect the phase.** In prototyping, speed and throwaway code are fine. In production, match the project's tests and conventions. Do not harden prototype code without saying so.

## Sources

- `washburn2016-postmortems` Michael Washburn et al. (2016). "What went right and what went wrong": an analysis of 155 postmortems from game development. Proceedings of the 38th International Conference on Software Engineering Companion (ICSE SEIP 2016). https://doi.org/10.1145/2889160.2889253 (peer-reviewed)
- `politowski2021-problems` Cristiano Politowski et al. (2021). Game industry problems: an extensive analysis of the gray literature. Information and Software Technology. https://doi.org/10.1016/j.infsof.2021.106538 (peer-reviewed)
- `petrillo2009-what-went-wrong` Fábio Petrillo et al. (2009). What went wrong? A survey of problems in game development. Computers in Entertainment. https://doi.org/10.1145/1486508.1486521 (peer-reviewed)
- `murphyhill2014-cowboys` Emerson Murphy-Hill et al. (2014). Cowboys, ankle sprains, and keepers of quality: how is video game development different from software development?. Proceedings of the 36th International Conference on Software Engineering (ICSE 2014). https://doi.org/10.1145/2568225.2568226 (peer-reviewed)
- `francis2018-scope` Tom Francis (2018). Dealing with Scope Change in 'Heat Signature' and 'Gunpoint'. Game Developers Conference 2018. https://gdcvault.com/play/1024932/Dealing-with-Scope-Change-in (GDC talk)
- `patel2022-mavericks` Carrie Patel (2022). Production Essentials Summit: No Mavericks, No Martyrs: Sustainable, Collaborative Production. Game Developers Conference 2022. https://gdcvault.com/play/1027654/Production-Essentials-Summit-No-Mavericks (GDC talk)
- `edholm2017-crunch` Henrik Edholm et al. (2017). Crunch time: the reasons and effects of unpaid overtime in the games industry. 2017 IEEE/ACM 39th International Conference on Software Engineering: Software Engineering in Practice Track (ICSE-SEIP). https://doi.org/10.1109/ICSE-SEIP.2017.18 (peer-reviewed)
- `gingold2006-prototyping` Chaim Gingold and Chris Hecker (2006). Advanced Prototyping. Game Developers Conference 2006. https://gdcvault.com/play/1013252/Advanced (GDC talk)
- `fullerton2018-workshop` Tracy Fullerton (2018). Game Design Workshop: A Playcentric Approach to Creating Innovative Games. CRC Press, 4th edition. https://doi.org/10.1201/b22309 (book)
- `wilson2018-game-a-week` Douglas Wilson and Bennett Foddy (2018). Game a Week: Teaching Students to Prototype. Game Developers Conference 2018. https://gdcvault.com/play/1024954/Game-a-Week-Teaching-Students (GDC talk)
- `barrett2017-rapid-prototypes` Mark Barrett (2017). Hitchhiker's Guide to Rapid Prototypes!. Game Developers Conference 2017. https://gdcvault.com/play/1024136/Hitchhiker-s-Guide-to-Rapid (GDC talk)
- `dallas2018-edith-finch` Ian Dallas (2018). Weaving 13 Prototypes into 1 Game: Lessons from 'Edith Finch'. Game Developers Conference 2018. https://gdcvault.com/play/1025016/Weaving-13-Prototypes-into-1 (GDC talk)
- `saulnier2015-far-cry-4` Marc Andre Saulnier (2015). Far Cry 4: Gameplay Team Workflow, Iteration and Philosophy. Game Developers Conference 2015. https://gdcvault.com/play/1021974/Far-Cry-4-Gameplay-Team (GDC talk)
- `masella2019-sea-of-thieves` Robert Masella (2019). Automated Testing of Gameplay Features in 'Sea of Thieves'. Game Developers Conference 2019. https://gdcvault.com/play/1026042/Automated-Testing-of-Gameplay-Features (GDC talk)
- `donovan2015-vertical-slice` Greg Donovan (2015). The Vertical Slice Challenge. Game Developers Conference 2015. https://gdcvault.com/play/1022328/The-Vertical-Slice (GDC talk)
- `cobb2022-anti-crunch` Chris Cobb (2022). Production Essentials Summit: Anti-Crunch: Patterns and Practices. Game Developers Conference 2022. https://gdcvault.com/play/1027559/Production-Essentials-Summit-Anti-Crunch (GDC talk)
- `fischer2017-science` Justin Fischer (2017). Better Development Through Science: How Aliens, Odysseus, and Toyota Can Help Improve Production. Game Developers Conference 2017. https://gdcvault.com/play/1024005/Better-Development-Through-Science-How (GDC talk)
- `quenin2015-iteration` Remi Quenin (2015). Fast Iteration for Far Cry 4 - Optimizing Key Parts of the Dunia Pipeline. Game Developers Conference 2015. https://gdcvault.com/play/1021975/Fast-Iteration-for-Far-Cry (GDC talk)
- `dill2021-tests` Kevin Dill (2021). AI Summit: Where The $@*&% Are Your Tests?!. Game Developers Conference 2021. https://gdcvault.com/play/1027101/AI-Summit-Where-The-Are (GDC talk)
- `elnasr2013-analytics` Magy Seif El-Nasr et al. (2013). Game Analytics: Maximizing the Value of Player Data. Springer (edited volume). https://doi.org/10.1007/978-1-4471-4769-5 (book)
- `cote2021-crunch` Amanda C. Cote and Brandon C. Harris (2021). 'Weekends became something other people did': understanding and intervening in the habitus of video game crunch. Convergence: The International Journal of Research into New Media Technologies. https://doi.org/10.1177/1354856520913865 (peer-reviewed)
- `peticcaharris2015-perils` Amanda Peticca-Harris et al. (2015). The perils of project-based work: attempting resistance to extreme work practices in video game development. Organization. https://doi.org/10.1177/1350508415572509 (peer-reviewed)
- `schreiber2022-crunch` Ian Schreiber (2022). Physiological Effects of Crunch: A Look at the Science. Game Developers Conference 2022. https://gdcvault.com/play/1027660/Physiological-Effects-of-Crunch-A (GDC talk)
- `tozour2016-outcomes` Paul Tozour (2016). The Game Outcomes Project: How Teamwork, Leadership and Culture Drive Results. Game Developers Conference 2016. https://gdcvault.com/play/1022972/The-Game-Outcomes-Project-How (GDC talk)
- `thibault2015-communication` Aaron Thibault (2015). Producer Bootcamp: The Bane of All Development Postmortems: Communication is Hard So Give Up Now. Game Developers Conference 2015. https://gdcvault.com/play/1022223/Producer-Bootcamp-The-Bane-of (GDC talk)
- `valve2026-steam-review` Valve Corporation (2026). Review Process (Steamworks Documentation). Steamworks Documentation. https://partner.steamgames.com/doc/store/review_process (official documentation)
- `valve2026-steam-coming-soon` Valve Corporation (2026). Coming Soon (Steamworks Documentation). Steamworks Documentation. https://partner.steamgames.com/doc/store/coming_soon (official documentation)
- `apple2026-app-review` Apple Inc. (2026). App Review Guidelines. Apple Developer. https://developer.apple.com/app-store/review/guidelines/ (official documentation)
- `google2026-target-api` Google (2026). Meet Google Play's target API level requirement. Android Developers. https://developer.android.com/google/play/requirements/target-sdk (official documentation)
