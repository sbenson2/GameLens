# Accessibility

Read this when adding or reviewing accessibility options, planning an accessibility pass on a build, or deciding whether an assist changes the intended challenge. It covers motor, vision, hearing, cognitive, and photosensitivity and motion barriers, how to prioritise them, and how to test with disabled players. For readability of art, UI and sound in general, read `presentation.md`.

## Frame the work as barriers, not diagnoses

Hamilton describes disability as a mismatch between a person and a designed barrier (steps, small text, inflexible controls, colour use), and groups the barriers by what the player has to do: see, hear, take in and process information, operate the controls, and speak where players talk to each other [@hamilton2021-shoestring]. Yuan, Folmer and Harris model play as three steps (receive stimuli, decide a response, provide input) and map impairments onto them: sensory impairments block the first step, cognitive impairments the second, motor impairments the third [@yuan2011-accessibility]. Their high-level strategies follow from that: enhance or replace stimuli; reduce stimuli, time pressure or input; replace input [@yuan2011-accessibility].

Disability labels do not define who uses an option. In one AbleGamers sample, 27 players reported a hearing impairment but 83 used subtitles [@cairns2019-apx-vocabulary].

Questions to ask of any build:

1. Which information reaches the player through only one channel (colour, sound, small text, a flash)?
2. What does input demand: precision, speed, simultaneous buttons, long holds, repeated pressing?
3. What must the player remember, or decide under time pressure?
4. Which of these demands is the challenge the designer intends, and which is incidental?

## Access options and challenge options

Cairns, Power, Barlet and Haynes distinguish two kinds of option [@cairns2019-apx-vocabulary]:

| Kind | Categories | What it does |
| --- | --- | --- |
| Access options | Input, control, presentation, output | Let players into the play loop without changing the game: devices, remapping, sensitivity, subtitles, text, colour, flashing, audio channels |
| Challenge options | Performance, training, progress, social, moderation | Change the game so players can meet its challenges: game speed, timers, practice modes, skips and checkpoints, co-operation rules, content warnings |

Their framing is that games should be difficult but not difficult to access [@cairns2019-apx-vocabulary]. A practical consequence, as this skill reads it: because access options leave the game's challenges unchanged, they seldom conflict with design intent and need not be locked behind a difficulty level. Challenge options need an explicit decision about what the intended experience is.

Challenge options can bring a player closer to that experience rather than further from it. Hamilton describes a player who controls games by voice: by default Celeste is unplayable for this player, but with invincibility and slow motion each screen still takes practice and persistence, the experience its developers intended [@hamilton2021-shoestring]. Stevens, who plays with hand impairments, found half speed was not enough in Celeste and that invincibility made most of the game playable [@stevens2021-mobility].

When an assist does conflict with intent, the God of War Ragnarök combat team's approach is a useful model [@oliver2023-ragnarok]:

- Each assist was weighed on player value (how many players would use it and how much it changes their experience), on cost, and on conflict with design intent; the team started with work that did not conflict, such as expanded remapping.
- An evade assist adds some invulnerability frames but still requires timing and direction, and it is unavailable on the higher difficulties, where precise timing is part of the intended challenge.
- A mini-boss checkpoint option first sat in the main gameplay settings; players who did not need it switched it on and lost the challenge they wanted without knowing why. It moved to the accessibility menu, was locked out of the two highest difficulties, and now reminds the player on each death.

On presentation, two studies with casual games found that the type of adjustment (menu, embedded or automatic) affected perceived autonomy and that most players said they preferred choosing difficulty manually, although automatic adjustment did not notably change overall player experience [@smeddinck2016-difficulty-choices]. In multiplayer, automating input can give one player an unfair edge over others [@yuan2011-accessibility], so assists in competitive modes need separate decisions.

Some assists may already exist as debug tools. Hamilton points out that options in games like Celeste resemble debug switches developers build and hide, suggests exposing them, and reports that Celeste's assist feature set took two weeks to build [@hamilton2021-shoestring].

Red flags in code: timing windows, damage values and enemy speeds as literals scattered through gameplay scripts, so no global setting can scale them; game speed tied to frame rate instead of a scalable time step; assist state stored nowhere the UI or save file can show.

## Priorities for a build

Hamilton lists the five most-complained-about issues as text size, remapping, colour-blindness, subtitles, and intensity (camera motion and flashing); most complained about is not the same as most important, but covering these efficiently helps many players [@hamilton2021-shoestring]. In interviews, developers said colour-blind palettes and subtitles tend to be done first because they are easiest, and that motor needs vary too much for one fix [@porter2013-barriers].

In this skill's view, planning access early costs less than retrofitting it. For comparison, Hamilton cites a text-size patch that took The Outer Worlds three months after launch [@hamilton2021-shoestring]; Stevens built Madden NFL 17's visual options in about a month [@stevens2017-madden].

A suggested order for a first pass, based on risk and breadth (the ordering is this skill's judgement):

| Order | Area | Minimum to check |
| --- | --- | --- |
| 1 | Photosensitivity | Flash and pattern analysis on captured footage; no reliance on a warning screen |
| 2 | Input | Every action remappable, no required chords or long holds without a toggle |
| 3 | Text and subtitles | Default size, scaling, contrast, subtitle basics |
| 4 | Colour | No information carried by colour alone |
| 5 | Motion and effects intensity | Toggles or sliders for shake, blur, bob and flashing |
| 6 | Difficulty and assists | Options chosen against the intended experience |
| 7 | Cognitive supports | Saving, objective reminders, replayable tutorials |
| 8 | Audio description and screen reading | Scoped as a project, not a checkbox |

## Motor: remapping and input alternatives

Stevens' list of motor practices, drawn from personal experience of hand impairments [@stevens2021-mobility]: support many devices including keyboard-only play; configurable dead zones and sensitivity per axis; one-stick play; swapping sticks; toggles instead of holds; optional button mashing and quick-time events; automatic actions such as auto-aim, auto-jump and auto-grab; reduced-button modes (FIFA shipped a one-button mode); optional haptics with levels; a friendly-fire toggle; chat wheels; flexible saving.

Hamilton adds that simpler control schemes make remapping more effective, and that mashing and holding are worth designing around [@hamilton2021-shoestring]. On God of War Ragnarök, expanded remapping took a great deal of work because of how the engine handled input [@oliver2023-ragnarok]. In a survey of 55 gamers with disabilities, most of them with motor impairments, the most common barrier was games not working with the assistive technology players rely on, such as on-screen keyboards, voice commands and adapted controllers [@porter2013-barriers].

Red flags in code:

- Gameplay code reads physical keys or buttons instead of named actions from one mapping layer.
- Button prompts are fixed images rather than looked up from the current binding.
- Actions need simultaneous buttons, or long holds, with no toggle.
- Dead zones and sensitivity are constants, not settings per stick and axis.
- Input from virtual or remapped devices is filtered out.

Checks: finish the critical path with a full remap, one-handed, keyboard only and with one stick; list every moment that needs simultaneous inputs or a hold, and decide which are intended challenge.

## Subtitles and captions

Subtitle use can be widespread: Hamilton cites Ubisoft data showing just over 60% of Assassin's Creed Origins players with subtitles on [@hamilton2019-subtitles]. Hamilton's basics are size, contrast and the amount of text on screen [@hamilton2019-subtitles]. Combined practice from Hamilton and Stevens:

- Size: Hamilton cites 46 px at 1080p [@hamilton2019-subtitles; @hamilton2021-shoestring]; Stevens suggests about 3% of screen height (roughly 32 px at 1080p) and never below 28 px [@stevens2019-deaf-gamers]. The values differ; offer scaling either way.
- Contrast: a background box with adjustable opacity [@hamilton2019-subtitles; @stevens2019-deaf-gamers].
- Amount: at most two lines, about 38 characters per line in Hamilton's figures, broken where the sense breaks [@hamilton2019-subtitles].
- Speakers: names shown, not colour alone [@hamilton2019-subtitles]; a speech bubble or name for unnamed NPCs [@stevens2019-deaf-gamers].
- Placement and timing: a consistent position that does not cover important UI, and timing matched to speech so punchlines are not revealed early [@stevens2019-deaf-gamers].
- Captions: important sounds in brackets, describing the sound rather than the action [@stevens2019-deaf-gamers], plus direction indicators [@hamilton2019-subtitles].
- Coverage: every line, including the opening cinematic, with a prompt to turn subtitles on before the first line if they are off by default [@hamilton2019-subtitles].
- Settings: a live preview and presets, since a long list of options is itself a barrier [@hamilton2019-subtitles].
- Separate channels (main dialogue, background chatter) that players can turn on and off [@stevens2019-deaf-gamers].

Red flags: subtitle strings that no longer match recorded lines (Hamilton recommends a dedicated accuracy pass [@hamilton2019-subtitles]); subtitles rendered beneath HUD elements; text drawn without a size parameter; line breaks by character count only; off-screen threats with no caption.

## Hearing: cues beyond text

Offer separate volume channels, since removing crowd or music lets remaining speech be heard [@stevens2019-deaf-gamers]. Important sounds need a visual or haptic equivalent, and the more important the sound, the more it needs one; direction indicators matter for players without directional hearing [@stevens2019-deaf-gamers]. Developers who play muted still know the cues, so Stevens recommends testing with deaf or hard-of-hearing players, or failing that with fresh testers who only ever play muted [@stevens2019-deaf-gamers]. Hamilton recounts that Valve added closed captions after deaf players wrote asking for them, and afterwards included players with hearing loss in its user research [@hamilton2019-subtitles]. Where a game is designed to be played by sound (`presentation.md`), each of those cues needs such an equivalent.

## Colour-vision support

Pennant and Stevens both cite about 1 in 12 men and 1 in 200 women as colour-blind [@pennant2019-colorblind; @stevens2017-madden].

- Never carry information by colour alone; add shape, pattern, icon or text [@pennant2019-colorblind; @hamilton2021-shoestring].
- Define semantic colour presets (friend, enemy, faction) from colour-safe palettes, so artists pick a role rather than rebalancing hues each time, and one fix updates every use [@pennant2019-colorblind].
- Let players pick colours for team markers and UI where possible; Pennant highlights a free hue picker for squad, team and enemy colours [@pennant2019-colorblind].

Sources disagree on full-screen filters. Hamilton advises against them, saying they are not what colour-blind players ask for and cause as many problems as they solve, and treats modes as a last resort after accessible defaults [@hamilton2021-shoestring]. Pennant prefers control over UI colours to changing the whole screen [@pennant2019-colorblind]. Madden shipped a tuned full-screen filter because uniforms are player-chosen and re-authoring assets was not feasible; the standard Daltonize algorithm pushed a game's bright colours together, so Stevens modified it and tuned it with colour-blind testers [@stevens2017-madden]. Reading them together: make defaults accessible first; a filter is a fallback for content that is player-customised or too large to re-author, and it needs testing with colour-blind players.

Testing: simulators catch many problems, but test in context with colour-blind players [@pennant2019-colorblind], and ask neutral questions such as "how many colours do you see?" [@stevens2017-madden].

Red flags: health or state shown as a green-yellow-red gradient only; teams distinguished by red and green; hardcoded RGB values in widgets instead of named colour roles.

## Low vision, text size and UI scaling

Recommended minimum sizes differ by source and use:

| Source | Applies to | Value (at 1080p unless noted) |
| --- | --- | --- |
| Xbox platform guidance [@microsoft2022-xag-text] | Default text, console / PC and VR | 26 px / 18 px, scalable to 200% |
| Hamilton [@hamilton2021-shoestring] | UI text | not below 28 px |
| Stevens [@stevens2017-madden] | Text and UI size, general advice | 30 px floor (resolution not stated), complaints rise below it; larger where possible |
| Stevens [@stevens2019-deaf-gamers] | Subtitles | about 3% of screen height, never below 28 px |
| Hamilton [@hamilton2019-subtitles] | Subtitles | 46 px |

The platform numbers are minimum defaults in Microsoft's guidance; the advocates' figures come from their experience of player complaints and from subtitle practice in other screen industries. Pick defaults at or above the platform minimum for the target device and viewing distance, and let players scale up. Stevens recommends a 4.5:1 contrast ratio for text [@stevens2019-deaf-gamers; @stevens2017-madden]. The Xbox guidance also asks for a sans-serif option, a plain alternative to stylised fonts, and icon glyphs that scale with text, and says platform magnification is not a substitute [@microsoft2022-xag-text].

Other low-cost fixes from shipped games:

- Madden's enlarge option scaled on-field icons and moved the kick meter from world space to a fixed screen position [@stevens2017-madden].
- A high-contrast mode need not be a reskin. Hamilton describes a solo developer's tintable layer between foreground and background, which by Hamilton's account took 15 minutes to implement [@hamilton2021-shoestring]; Cosmonious High extended its existing grab highlight with a second highlight colour chosen to contrast with the environment [@cano2024-cosmonious-high].

Red flags: text baked into textures; font sizes fixed in pixels regardless of output resolution; layouts that clip or overlap at 200% text; glyphs that do not scale with text.

## Cognitive load

A 2024 panel of accessibility specialists named cognitive and sensory overload, unclear objectives, over-stimulation, illegible text and over-complicated instructions as barriers [@baker2024-cognitive]. Practices they recommend [@baker2024-cognitive]:

- manual saving at any time;
- content warnings that are specific and timed so players can decide;
- always-available practice areas and tutorials, and toggleable on-screen control prompts;
- navigation help toward the current objective;
- letting players turn off UI animation that is not essential;
- publishing accessibility information before launch;
- both options and accessible default design.

In Cosmonious High, automatic spoken descriptions overwhelmed players, so speech moved to a player-triggered button that can also cancel it; descriptions were reordered to give state and name first, and flavour text was cut on a tester's advice [@cano2024-cosmonious-high]. Reducing stimuli and time pressure are the general strategies [@yuan2011-accessibility].

Red flags: an objective stated once in a cutscene and nowhere else; tutorial text that cannot be reopened; autosave only at level start; notifications stacking with no priority.

Check: the two-week test. Can a player returning after a break find the controls, the current objective and a recent save?

## Photosensitivity, flashing and motion

A review for the Epilepsy Foundation of America reports that flashes at 15 to 25 Hz are most provocative (range 1 to 65 Hz), that high-contrast patterns and red contribute, that video games are among known triggers, and that in one broadcast incident only about a quarter of the children who had a seizure had had one before [@fisher2005-photic]. A warning screen therefore does not protect players who do not know they are susceptible [@hamilton2021-shoestring]. Hamilton recounts that Ubisoft made epilepsy testing mandatory across its games after a boy had a first seizure while playing Raving Rabbids [@hamilton2021-shoestring].

- Platform guidance: Xbox asks that every game be tested, prefers removing risky content to showing warnings, and defines failures by luminance change, frequency (roughly more than three flashes per second) and screen area (roughly 20% or more), with a stricter test for saturated red flashes and a separate one for high-contrast patterns [@microsoft2022-xag-photosensitivity].
- Tools: the Harding analyser is the paid option Hamilton names, and the international standard it tests against is public [@hamilton2021-shoestring]; the 2024 panel mentions EA's free IRIS tool and recommends testing throughout production [@baker2024-cognitive].
- Even content that passes can hurt some players; Hamilton points to a game that offers a switch for flashing effects anyway, for players with conditions such as migraine or autism [@hamilton2021-shoestring].

Motion sickness is not limited to VR. In a lab study, 42% to 56% of 40 undergraduates became motion sick while playing an off-the-shelf console game for up to 50 minutes [@stoffregen2008-motion-sickness]. Hamilton names camera motion that does not match the player's head, such as screen shake, motion blur and weapon bob, and advises minimising it or letting players turn it off [@hamilton2021-shoestring].

Red flags: full-screen luminance inversion on hits; strobing effects with no rate limit; camera shake amplitude not multiplied by a global setting; motion blur or view bob with no toggle; a fixed field of view.

## Making options findable

- Put accessibility settings at first launch and in the pause menu; duplicating them across menus is fine [@stevens2019-deaf-gamers].
- Tell players the options exist: two puzzle games had colour-blind support that players did not know about, while other developers used loading-screen hints and a bullet point in a press kit [@hamilton2021-shoestring].
- Location matters: God of War Ragnarök's checkpoint assist was misused while it sat in the main settings [@oliver2023-ragnarok].
- Madden shows a faint watermark when accessibility settings are on, so footage that looks different can be explained [@stevens2017-madden].
- The option to enable an assist mode must itself be accessible: Cosmonious High's vision mode first needed sighted help to switch on, and the later gesture was not announced well [@cano2024-cosmonious-high].

## Testing with disabled players

- Colleagues with impairments can catch problems early: in one studio, a tester who could not use a key layout prompted remappable controls [@porter2013-barriers].
- Players can be reached cheaply through social media call-outs, beta questionnaires, forums, Discord, early access and in-game feedback buttons; respect their time and offer something in return [@hamilton2021-shoestring].
- A team's familiarity can hide problems: external testers unfamiliar with Cosmonious High's layout got lost where the team did not [@cano2024-cosmonious-high].
- God of War Ragnarök validated its combat assists with a consultant with a motor disability [@oliver2023-ragnarok].
- Ask neutral questions and observe [@stevens2017-madden]; test colour in context [@pennant2019-colorblind].
- Expert judgement and player experience do not always line up, which is why the players' own accounts matter [@cairns2019-apx-vocabulary].

Record, per session, which options each player used, which barrier remained, and whether they reached the experience the design intends, not only whether a feature exists. See `evaluation.md` for playtest method.

## Platform guidelines

The Xbox Accessibility Guidelines are written as ideas for designers, guardrails for developers and a checklist for test teams, not as a compliance standard [@microsoft2023-xag]. Use platform documents for platform requirements. Guidelines work well for evaluating a finished design but do not say what to build for a particular game [@cairns2019-apx-vocabulary]; that decision comes from the intended experience and from players.

## Sources

- `hamilton2021-shoestring` Ian Hamilton (2021). Independent Games Summit: Accessibility on a Shoestring. Game Developers Conference 2021, Independent Games Summit. https://gdcvault.com/play/1027108/Independent-Games-Summit-Accessibility-on (GDC talk)
- `yuan2011-accessibility` Bei Yuan et al. (2011). Game accessibility: a survey. Universal Access in the Information Society 10(1). https://doi.org/10.1007/s10209-010-0189-5 (peer-reviewed)
- `cairns2019-apx-vocabulary` Paul Cairns et al. (2019). Future design of accessibility in games: A design vocabulary. International Journal of Human-Computer Studies 131. https://doi.org/10.1016/j.ijhcs.2019.06.010 (peer-reviewed)
- `stevens2021-mobility` Karen Stevens (2021). Accessibility Best Practices: Mobility Considerations. Game Developers Conference 2021. https://gdcvault.com/play/1027111/Accessibility-Best-Practices-Mobility (GDC talk)
- `oliver2023-ragnarok` Adam Oliver (2023). Breaking Barriers: Combat Accessibility in 'God of War Ragnarok'. Game Developers Conference 2023. https://gdcvault.com/play/1028726/Breaking-Barriers-Combat-Accessibility-in (GDC talk)
- `smeddinck2016-difficulty-choices` Jan D. Smeddinck et al. (2016). How to Present Game Difficulty Choices? Exploring the Impact on Player Experience. Proceedings of the 2016 CHI Conference on Human Factors in Computing Systems. https://doi.org/10.1145/2858036.2858574 (peer-reviewed)
- `porter2013-barriers` John R. Porter and Julie A. Kientz (2013). An empirical study of issues and barriers to mainstream video game accessibility. Proceedings of the 15th International ACM SIGACCESS Conference on Computers and Accessibility (ASSETS 2013). https://doi.org/10.1145/2513383.2513444 (peer-reviewed)
- `stevens2017-madden` Karen Stevens (2017). Game Accessibility: Practical Visual Fixes from EA's 'Madden NFL' Franchise. Game Developers Conference 2017. https://gdcvault.com/play/1024114/Game-Accessibility-Practical-Visual-Fixes (GDC talk)
- `hamilton2019-subtitles` Ian Hamilton (2019). Subtitles Are Changing, Don't Be Left Behind. Game Developers Conference 2019. https://gdcvault.com/play/1025738/Subtitles-Are-Changing-Don-t (GDC talk)
- `stevens2019-deaf-gamers` Karen Stevens (2019). I Can't Hear You: Considering Deaf Gamers. Game Developers Conference 2019. https://gdcvault.com/play/1025716/I-Can-t-Hear-You (GDC talk)
- `pennant2019-colorblind` Douglas Pennant (2019). Solving an Invisible Problem: Designing for Color-Blindness in Games. Game Developers Conference 2019. https://gdcvault.com/play/1025754/Solving-an-Invisible-Problem-Designing (GDC talk)
- `microsoft2022-xag-text` Microsoft (2022). Xbox Accessibility Guideline 101. Microsoft Learn, Xbox Accessibility Guidelines. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101 (official documentation)
- `cano2024-cosmonious-high` Jazmin Cano and Peter Galbraith (2024). UX Summit: Loud and Clear: Improving Accessibility for Low Vision Players in 'Cosmonious High'. Game Developers Conference 2024, UX Summit. https://gdcvault.com/play/1034562/UX-Summit-Loud-and-Clear (GDC talk)
- `baker2024-cognitive` Morgan Baker et al. (2024). Building Cognitive Accessibility Into Your Games. Game Developers Conference 2024. https://gdcvault.com/play/1034270/Building-Cognitive-Accessibility-Into-Your (GDC talk)
- `fisher2005-photic` Robert S. Fisher et al. (2005). Photic- and Pattern-induced Seizures: A Review for the Epilepsy Foundation of America Working Group. Epilepsia 46(9). https://doi.org/10.1111/j.1528-1167.2005.31405.x (peer-reviewed)
- `microsoft2022-xag-photosensitivity` Microsoft (2022). Xbox Accessibility Guideline 118: Photosensitivity. Microsoft Learn, Xbox Accessibility Guidelines. https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118 (official documentation)
- `stoffregen2008-motion-sickness` Thomas A. Stoffregen et al. (2008). Motion Sickness and Postural Sway in Console Video Games. Human Factors 50(2). https://doi.org/10.1518/001872008X250755 (peer-reviewed)
- `microsoft2023-xag` Microsoft (2023). Xbox Accessibility Guidelines. Microsoft Learn, Microsoft Game Development Kit documentation (version 3.2). https://learn.microsoft.com/en-us/gaming/accessibility/guidelines (official documentation)
