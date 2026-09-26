# Narrative, dialogue and quests

Read this when story, dialogue, quests or player choice have to work as game systems: tracking what happened, choosing what a character says, structuring branches, placing story in space, budgeting text and voice, and preparing for other languages. For story conventions by genre, see [genres.md](genres.md).

The user's intended experience comes first. A linear, authored story is a legitimate goal, and so is a sprawling reactive one. The job is to make the chosen structure hold together under real play.

## Narrative state is game state

Treat a narrative bug as a possible state bug first. Before changing content, find out:

- **Where is story state stored?** Flags, counters, quest stages, dialogue memory, a script runtime's variables, per-object data. List every store and who writes to it.
- **What does the game track, and what does the player know?** In quest-driven open worlds, both plot state and player knowledge usually come out of the quest system. On the Sorcery! games, inkle tracked them separately in small state machines. Each state implies every earlier one ("seen the wolf" implies "heard of the wolf"). A scene can then test a range ("heard of it but not yet killed it"), and new in-between states can be added without breaking existing checks [@ingold2017-narrative-sorcery].
- **Is one fact recorded twice under different names?** On Firewatch, two writers could create "Delilah knows about Julia" and "Henry told Delilah about Julia". Scenes checking different names produced false negatives hours into a playthrough. The fix was a shared registry of what each character knew, checked before anyone added a fact [@remo2019-firewatch-design].
- **How is state scoped?** Firewatch kept facts on separate blackboards per object, per in-game day and global. A "left the tower today" fact therefore could not leak into the next day's logic [@armstrong2017-firewatch-dialog].
- **Are transient events stored as moments?** Valve's dialogue system stored when something last happened ("shot within the last quarter second"), not a flag that is true for one frame [@ruskin2012-dynamic-dialog].

Red flags, in programmer terms:

- Story flags are written from UI callbacks or animation events, so skipping a cutscene skips the write.
- A conversation enters a modal state (no interruptions, letterboxing, disabled radio), and only its happy path restores it. On Firewatch, adding one branch to a working conversation could disable the radio for the rest of the game until a reload. The team concluded that conversations should be a first-class object that owns and releases that state [@armstrong2017-firewatch-dialog].
- The save file stores quest stage but not the dialogue runtime's variables or visit counts, or the reverse.
- Content checks a fact name that nothing ever sets. Firewatch's team ran searches over its human-readable data for exactly this [@armstrong2017-firewatch-dialog].

**Save and load must agree.** Narrative runtimes keep their own state. ink serializes story state to JSON and restores it through its runtime API, and it keeps read counts for knots and stitches [@inkle2026-ink-docs]. Yarn Spinner keeps variables in a replaceable variable storage the game can supply, and exposes `visited()` for nodes [@yarnspinner2026-docs]. Persisting the script runtime and the world in the same save operation, and reloading mid-conversation as a routine test, follows from this. That is engineering reasoning, not a sourced rule.

## Choosing what a character says

A reasonable default is a dialogue tree for authored conversations and rule matching for reactive barks and ambient remarks.

- **Rule and query.** Valve's system builds one flat query of every known fact (speaker, health, map, allies, memory). It matches the query against rules, which are lists of criteria. Among rules whose criteria all match, the one with the most criteria wins, and ties are picked at random, so specific lines override general ones. Responses can write facts back into memory, which gives running gags and follow-ups. A reply is looked up only when the previous line finishes, so a conversation interrupted by danger ends by itself [@ruskin2012-dynamic-dialog].
- **Writers own the rules.** Ruskin argues that the tool should fit the writers you actually have. Valve's writers rejected a node-graph editor in favor of a database. Debug tools should show where each fact came from and which rules matched, with their scores [@ruskin2012-dynamic-dialog].
- **"Most specific wins" has limits.** Sorting by requirement count assumes facts are independent. Once one fact implies others, designers need a priority override. On Firewatch, the absence of a fact was also useful context: Delilah guessed at what Henry had not told her [@armstrong2017-firewatch-dialog].
- **Eligibility lists.** On Hades, each character's story events carry requirements and are ordered from specific to generic. New requirement types were added as new systems (such as fishing) appeared. Repeatable barks play from a table that empties before it refills, to avoid back-to-back repeats [@kasavin2021-hades-dialogue].
- **Scopes.** Heaven's Vault writes content into nested buckets: the current moment, the room, the episode and the whole game. Each scope shadows the next, so a remark about the planet plays only when nothing more local applies [@ingold2018-heavens-vault].
- **Built-in salience.** Yarn Spinner 3's node groups and line groups choose among eligible content with a saliency strategy. "Best" prefers the most complex conditions, and the default is a random choice among the best, least recently viewed items [@yarnspinner2026-docs].

In this skill's view, repetition breaks the sense that time moves. Heaven's Vault removes a question once it has been asked [@ingold2018-heavens-vault]. Firewatch made choices mutually exclusive and usually timed, so silence is also an answer [@remo2019-firewatch-design].

## Structure and the cost of branching

| Structure | Where it fits | Main cost |
| --- | --- | --- |
| Linear, with every choice acknowledged | Tight authored stories | Players may notice that paths reconverge |
| Branch and bottleneck | Episodic drama | Content grows with every level of subdivision |
| Storylets (quality or salience) | Open, replayable or live stories | Hard to guarantee coherence and pacing |
| Encounters with separate state tracking | Free exploration with authored scenes | Every scene must handle any state |

Storylets are discrete chunks of content gated by preconditions on game state. Systems differ in how they pick the next chunk: player choice, weighted random (Reigns), salience matching with generic fallbacks, search, or a drama manager [@kreminski2018-storylets]. Fallen London is one documented example of quality-based design. Thousands of variables ("qualities") gate storylets and are changed by choices, which allows callbacks anywhere in the game [@wood2019-fallen-london].

What branching costs, from practitioners:

- **Redundancy.** inkle accepted that most content goes unseen by any one player. Variant text was cheap for them because they did not record voice for every line [@ingold2017-narrative-sorcery].
- **Combinatorics.** On As Dusk Falls, the team stopped subdividing at roughly eight to ten outcomes per junction, because players stopped feeling finer distinctions. They placed choices on the story's turning points so each path kept a dramatic shape, and allowed no game overs or weak branches [@kane2023-as-dusk-falls].
- **Replay is weak justification.** Episode, a mobile story platform, reported from its own data, without giving figures, that heavy branching did not raise replay rates much. In a test on one story, a version with no choices retained first-time players worse, and doubling the number of choices from 10 to 20 did not change retention [@phillipps2016-all-choice].
- **Defensive logic.** inkle guarded nearly every line and option with preconditions and wrote fallbacks that are "competent but not interesting". Most of their bugs were missing preconditions, and those were easy to fix once found [@ingold2017-narrative-sorcery].

A cheaper option may be good enough. In an online study of a short text adventure, a linear version that acknowledged each choice with specific feedback scored close to a branching version on most agency ratings. Branching still scored higher on "the story would have been different", and a version with minimal feedback scored lower than branching on every item [@fendt2012-illusion-agency]. That was one short text story with a snowball sample of about 150 people, so treat it as a hypothesis for your game, not a rule.

## Agency and meaningful choice

Agency is not "the player can do anything". Wardrip-Fruin and colleagues describe it as happening when the actions a player wants are among the actions the game supports through an underlying model. Adventure games often fail by offering many actions with no dramatic reason to prefer one [@wardripfruin2009-agency-reconsidered]. Their practical implications: make the fiction suggest desires the systems can satisfy; expect players to move from their initial assumptions toward the real model; and let plans fail without ending play [@wardripfruin2009-agency-reconsidered].

Other sources on what makes a choice feel meaningful:

- In a mixed-method study, players described moral, social and consequential qualities as what makes a choice meaningful, and meaningful choices raised appreciation [@iten2018-meaningful-choices].
- On The Witcher 3 and Cyberpunk 2077, Sasko's rule was to offer a choice when the situation makes players expect one. Rival options need equal build-up, since a better-written or star-cast character skews the choice. Consequences must be telegraphed: subtle ones, such as changed radio and TV content, went largely unnoticed [@sasko2023-quest-lessons].
- Ingold set three conditions for Heaven's Vault: every decision at least appears to change state, there is always a way forward, and no space is empty of things to do [@ingold2018-heavens-vault].
- Phillipps' warning signs: false choices that the character immediately contradicts, misleading labels, vague options, and yes/no/maybe menus or two-option choices where one option is an afterthought [@phillipps2016-all-choice].

## Mechanics and story alignment

Portal's writer and team lead framed this as two stories: the one told by dialogue and cutscenes, and the one told by the player's actions. They tried to keep the gap between them small and cut exposition whenever playtesters could not retell the plot. Story and mechanics also fed each other. Dialogue made players attached to the companion cube, and its incineration then trained the mechanic the final fight needed [@swift2008-portal].

Other cases:

- **Firewatch** had no failure state. It captured implicit choices through verbs players already used, such as how much food they picked up. It dropped prototyped mechanics, such as fire-spotting with the tower's equipment, that spoke to the character's job rather than the story [@remo2019-firewatch-design].
- **What Remains of Edith Finch** found that players have limited attention, and simplified a mechanic that divided it. It built some stories around playtesters' habit of fixating on objectives [@dallas2018-edith-finch].

Diagnostic question: does the verb set the story leans on actually exist and work well? If the story is about persuasion but the only reliable verb is combat, expect the mismatch Wardrip-Fruin and colleagues describe [@wardripfruin2009-agency-reconsidered].

## Environmental storytelling

Environmental storytelling asks players to pull information from the space instead of receiving exposition. Its tools include props, scripted events, texturing, lighting and composition. Smith and Worch also proposed systems that visibly react to what the player has done [@smith2010-what-happened-here].

On Spider: Rite of the Shrouded Moon, Randy Smith told a nonlinear story without dialogue, mainly through props and with sparing text [@smith2016-spider]:

- **Hard to show:** timelines, causality, motives and missing objects. Realistic set dressing produced red herrings, and inconsistent clue density misled players.
- **Smith's method:** list every inference a player must make and tie each one to a specific prop. Keep one convention for how clues are drawn, and use recurring "calling cards" (one character's candy wrappers) to mark who was where.

Other cases:

- On Edith Finch, bedrooms were rebuilt late with more exaggerated character, so each could be read in a minute or two [@dallas2018-edith-finch].
- On Portal, a fellow test subject the small team could not afford to build as a character survived as wall scribbles in behind-the-scenes areas [@swift2008-portal].
- Critical information does not belong only in environment text. If art is not localized, players in other languages cannot read it. Destiny moved that information into localizable UI and icons [@slattery2015-destiny-localization].

## Quest design

Aarseth describes quests as the designer's main way to set the player's agenda, and distinguishes place, time and objective goals (and their combinations), set in corridors, hubs or open landscapes. In Aarseth's analysis, the more story-like the game, the more spatially constrained it tends to be [@aarseth2005-quest-theory].

Common failures and responses:

- **The waiting quest-giver.** In a talk-go-fetch-return quest, the peasant waits forever, and nobody else can mention the wolf because the quest must start with him. Ingold's alternative was two encounters (the house and the woods) that handle any order, backed by state machines. Anyone could then start the plot, and new outcomes appeared, such as the peasant going after the wolf himself [@ingold2017-narrative-sorcery].
- **Too many open leads.** Heaven's Vault generates its clues procedurally, which gives one point of control over how many destinations are open. Ingold wanted players choosing among about three [@ingold2018-heavens-vault].
- **Exposition lost in play.** Sasko's team gave low-priority information while players were free to act, and key information when camera and attention were controlled. They cut scenes that repeated what players already knew [@sasko2023-quest-lessons].
- **Ownership gaps between disciplines.** At Bethesda, level design owned locations and combat, and quest design owned story, dialogue and non-combat NPCs. Level designers who learned the quest tools built a shared language that made collaboration faster and widened what their content could do. On Far Harbor, optional puzzle levels not marked as optional were treated as mandatory. Slow multiplayer iteration later reduced bespoke scripting, because hard-to-implement content gets made less [@shen2024-skyrim-starfield].
- **Plan changes with no way back.** CD Projekt Red's pipeline (outline, quest design document, playable draft) lets any stage be sent back to the one before [@sasko2023-quest-lessons].

## Writing budgets, voice and localization

Text and voice have budgets, just like frame time.

- **Pacing.** Firewatch timed the fastest route between objectives and cut critical-path conversations to fit within it [@remo2019-firewatch-design].
- **Scope growth.** Hades' voice-over grew far beyond early plans. Regular recording sessions through early access kept that manageable [@kasavin2021-hades-dialogue].
- **Constraints help output.** Fallen London's small content team used themed story runs to make a steady writing schedule manageable [@wood2019-fallen-london].

Localization boundaries to set early:

- **Stable line IDs.** Firewatch keyed translations on English text, so every English typo fix broke existing translations. Its team recommends persistent unique IDs [@armstrong2017-firewatch-dialog]. Yarn Spinner requires line IDs to be unique across a project and uses them to link voice-over and translations [@yarnspinner2026-docs].
- **Pseudo-localization before translation.** Firewatch generated a widened English to catch overflow and a variant full of non-ASCII characters to test Unicode [@armstrong2017-firewatch-dialog].
- **Text that expands.** Destiny used throwaway early translations to find UI space problems. It added auto-resizing, second lines and font scaling, and freed mission voice lines from matching English length (lip-synced cinematics excepted) [@slattery2015-destiny-localization].
- **Grammatical gender.** Destiny branched a dialogue line only where some language needed a gendered form [@slattery2015-destiny-localization]. SIE's localization group asks for line variants (gender, age) and context for translators, with images, inside the localization tool [@josa2017-localization].
- **Length limits.** Communicate and enforce text-length and audio specifications before translation starts [@josa2017-localization].
- **No meaning in English spelling.** Destiny's faction logo was an English acronym, so it matched few languages [@slattery2015-destiny-localization].

## Tools: ink, Yarn Spinner, Twine

These are tool facts only. The choice should follow the team's writers and engine.

| Tool | Relevant facts |
| --- | --- |
| ink | Knots and stitches; once-only and sticky choices; automatic read counts; lists for state; runtime state saved and loaded as JSON; external functions and variable observers [@inkle2026-ink-docs] |
| Yarn Spinner | Nodes and lines; `visited()` and `visited_count()`; storylet-style node and line groups with saliency strategies; replaceable variable storage; unique line IDs for voice-over and localization [@yarnspinner2026-docs] |
| Twine | Stories made of passages; four bundled story formats (Harlowe is the default); publishes one HTML file that runs in a browser [@twine2026-reference] |

Writers on As Dusk Falls drafted in a screenplay format rather than in flowchart tools, and kept a flowchart tool as a visual map for the rest of the team [@kane2023-as-dusk-falls]. Ruskin's point applies here too: ask your writers what they want before building a tool [@ruskin2012-dynamic-dialog].

## Checks before calling it done

- **Automated random walks through the story.** Heaven's Vault ran one as a script against its story logic. It found places where the content ran out, but it could not judge whether the story made sense or test anything in the 3D layer [@ingold2018-heavens-vault].
- **Log every event, requirement check and rule match,** so a tester's playthrough can be reconstructed from the log [@armstrong2017-firewatch-dialog].
- **Unreachable lines.** Record which lines are ever played. Firewatch briefly sent played-line data to its content tool and found unreachable lines this way [@armstrong2017-firewatch-dialog].
- **Deliberately odd play.** Firewatch's designer played through without ever initiating conversation, letting choices time out, and checked that the story still made sense and that no character referred to things they could not know [@remo2019-firewatch-design].
- **Retelling.** Ask playtesters to retell the story. If they cannot, cut or restage exposition before adding more [@swift2008-portal].
- **Clues are read, not only found.** For environmental story, check that the intended inferences are made, not just that the props are seen [@smith2016-spider].

## Sources

- `ingold2017-narrative-sorcery` Jon Ingold (2017). Narrative Sorcery: Coherent Storytelling in an Open World. Game Developers Conference 2017. https://gdcvault.com/play/1023989/Narrative-Sorcery-Coherent-Storytelling-in (GDC talk)
- `remo2019-firewatch-design` Chris Remo (2019). Interactive Story Without Challenge Mechanics: The Design of 'Firewatch'. Game Developers Conference 2019. https://gdcvault.com/play/1026087/Interactive-Story-Without-Challenge-Mechanics (GDC talk)
- `armstrong2017-firewatch-dialog` William Armstrong and Patrick Ewing (2017). Do You Copy? Dialog System and Tools in 'Firewatch'. Game Developers Conference 2017. https://gdcvault.com/play/1024000/Do-You-Copy-Dialog-System (GDC talk)
- `ruskin2012-dynamic-dialog` Elan Ruskin (2012). AI-driven Dynamic Dialog through Fuzzy Pattern Matching. Empower Your Writers!. Game Developers Conference 2012. https://gdcvault.com/play/1015317/AI-driven-Dynamic-Dialog-through (GDC talk)
- `inkle2026-ink-docs` inkle (2026). ink documentation: Writing with ink; Running your ink. inkle/ink GitHub repository documentation. https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md (official documentation)
- `yarnspinner2026-docs` Yarn Spinner (2026). Yarn Spinner documentation: Saliency, Functions, Variable Storage, Line Tagging. Yarn Spinner documentation (Yarn Spinner 3). https://docs.yarnspinner.dev/write-yarn-scripts/advanced-scripting/saliency (official documentation)
- `kasavin2021-hades-dialogue` Greg Kasavin and Darren Korb (2021). Breathing Life into Greek Myth: The Dialogue of 'Hades'. Game Developers Conference 2021. https://gdcvault.com/play/1026975/Breathing-Life-into-Greek-Myth (GDC talk)
- `ingold2018-heavens-vault` Jon Ingold (2018). 'Heaven's Vault': Creating a Dynamic Detective Story. Game Developers Conference 2018. https://gdcvault.com/play/1025149/-Heaven-s-Vault-Creating (GDC talk)
- `kreminski2018-storylets` Max Kreminski and Noah Wardrip-Fruin (2018). Sketching a Map of the Storylets Design Space. Interactive Storytelling: ICIDS 2018, Lecture Notes in Computer Science 11318. https://doi.org/10.1007/978-3-030-04028-4_14 (peer-reviewed)
- `wood2019-fallen-london` Olivia Wood (2019). Feeding the Maw: Managing a Live Narrative Game in 'Fallen London'. Game Developers Conference 2019. https://gdcvault.com/play/1025735/Feeding-the-Maw-Managing-a (GDC talk)
- `kane2023-as-dusk-falls` Brad Kane (2023). A Narrative Multiverse: The Branching Structure of 'As Dusk Falls'. Game Developers Conference 2023. https://gdcvault.com/play/1028903/A-Narrative-Multiverse-The-Branching (GDC talk)
- `phillipps2016-all-choice` Cassie Phillipps (2016). All Choice No Consequence: Efficiently Branching Narrative. Game Developers Conference 2016. https://gdcvault.com/play/1023072/All-Choice-No-Consequence-Efficiently (GDC talk)
- `fendt2012-illusion-agency` Matthew William Fendt et al. (2012). Achieving the Illusion of Agency. Interactive Storytelling: ICIDS 2012, Lecture Notes in Computer Science 7648. https://doi.org/10.1007/978-3-642-34851-8_11 (peer-reviewed)
- `wardripfruin2009-agency-reconsidered` Noah Wardrip-Fruin et al. (2009). Agency Reconsidered. DiGRA 2009: Breaking New Ground: Innovation in Games, Play, Practice and Theory. https://doi.org/10.26503/dl.v2009i1.369 (peer-reviewed)
- `iten2018-meaningful-choices` Glena H. Iten et al. (2018). Choosing to Help Monsters: A Mixed-Method Examination of Meaningful Choices in Narrative-Rich Games and Interactive Narratives. Proceedings of the 2018 CHI Conference on Human Factors in Computing Systems. https://doi.org/10.1145/3173574.3173915 (peer-reviewed)
- `sasko2023-quest-lessons` Paweł Sasko (2023). 10 Key Quest Design Lessons from 'The Witcher 3' and 'Cyberpunk 2077'. Game Developers Conference 2023. https://gdcvault.com/play/1028897/10-Key-Quest-Design-Lessons (GDC talk)
- `swift2008-portal` Kim Swift and Erik Wolpaw (2008). A PORTAL Post-Mortem: Integrating Writing and Design. Game Developers Conference 2008. https://gdcvault.com/play/197/A-PORTAL-Post-Mortem-Integrating (GDC talk)
- `dallas2018-edith-finch` Ian Dallas (2018). Weaving 13 Prototypes into 1 Game: Lessons from 'Edith Finch'. Game Developers Conference 2018. https://gdcvault.com/play/1025016/Weaving-13-Prototypes-into-1 (GDC talk)
- `smith2010-what-happened-here` Harvey Smith and Matthias Worch (2010). What Happened Here? Environmental Storytelling. Game Developers Conference 2010. https://gdcvault.com/play/1012647/What-Happened-Here-Environmental (GDC talk)
- `smith2016-spider` Randy Smith (2016). Advanced Environmental Storytelling in 'Spider: Rite of the Shrouded Moon'. Game Developers Conference 2016. https://gdcvault.com/play/1023388/Advanced-Environmental-Storytelling-in-Spider (GDC talk)
- `slattery2015-destiny-localization` Tom Slattery (2015). Manifest Destiny: Localizing Bungie's Destiny for the World. Game Developers Conference 2015. https://gdcvault.com/play/1022138/Manifest-Destiny-Localizing-Bungie-s (GDC talk)
- `aarseth2005-quest-theory` Espen Aarseth (2005). From Hunt the Wumpus to EverQuest: Introduction to Quest Theory. Entertainment Computing: ICEC 2005, Lecture Notes in Computer Science 3711. https://doi.org/10.1007/11558651_48 (peer-reviewed)
- `shen2024-skyrim-starfield` William Shen and Daryl Brigner (2024). Level Design Summit: Level and Quest Design Collaboration from 'Skyrim' to 'Starfield'. Game Developers Conference 2024. https://gdcvault.com/play/1034611/Level-Design-Summit-Level-and (GDC talk)
- `josa2017-localization` Nadege Josa (2017). Steps for Effective Localization. Game Developers Conference 2017. https://gdcvault.com/play/1024064/Steps-for-Effective (GDC talk)
- `twine2026-reference` Twine (2026). Twine Reference: Basic Concepts. Twine Reference (twinery.org). https://twinery.org/reference/en/getting-started/basic-concepts.html (official documentation)
