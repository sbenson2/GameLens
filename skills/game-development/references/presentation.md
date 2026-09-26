# Presentation: art direction, UI, motion and audio

Read this when the work concerns how a game looks, moves, sounds or communicates: art direction and asset consistency, readability of characters and effects, HUD and menus, UI text, animation clarity, sound as information and the mix. For player options (subtitles, colour-vision support, text scaling, reduced motion) read `accessibility.md` alongside it; for timing and input response read `game-feel.md`.

## Quick diagnosis

| Observed problem | Plausible causes | Smallest useful change | Evidence to collect |
| --- | --- | --- | --- |
| Players miss threats or confuse teams | Identity carried by hue only; background as saturated or as bright as characters; effects noise | Separate layers by value and shape; cap effect brightness; add a non-colour team cue | Grayscale and colour-blind captures; "who is the enemy?" test with fresh players |
| New assets look off-style | Rules never written down; generator or store asset defaults | Write the style rules; review each new asset beside three shipped ones in game | Side-by-side captures at gameplay camera |
| HUD ignored or misread | Critical values placed in the world or at the edges; too much shown at once | Put critical and continuous values in fixed overlay positions; remove what is not needed now | Five-second screenshot quiz; where players look during play |
| "The animation feels unclear" | Detail tuned in the content tool, not at gameplay distance; no readable wind-up | Exaggerate key poses; add holds and wind-up readable at gameplay distance | Captures at gameplay distance; players naming the attack |
| Important sounds lost in fights | Loudness decides priority; no ducking or voice limits | Priority from game state (threat, ownership), not amplitude | Recording of a busy encounter; eyes-closed location test |

These are starting hypotheses. The user's intended experience decides which problems matter; a deliberately murky horror scene is not a readability bug.

## Start from the identity the game already has

If the project has screens, assets, a palette, typography, a camera and sounds, those are the brief. Refine inside that identity unless the user asks for a redesign, and show before-and-after captures for any visible change. An agent's taste, or a generator's default look, is not a reason to drift.

A style name ("low poly", "cel-shaded", "pixel art") does not specify a game. What specifies it is a short list of decisions that every asset must share:

- scale and proportion, and the silhouette language that follows from them;
- value and colour hierarchy: which layer is darkest, brightest, most saturated;
- material or pixel density, and how much surface detail is allowed;
- animation rhythm (snappy or weighty, how long holds last);
- UI type, spacing and colour codes;
- sound character and loudness hierarchy.

The studios below wrote such rules down. Valve codified what it observed in early 20th-century illustration (shadows shift toward cool colours, folds echo the silhouette, high-frequency detail is omitted, rim highlights instead of outlines) and built both assets and shaders to those rules [@mitchell2007-tf2]. Journey's art director worked from a colour guide covering the whole game from start to finish and from a self-made canon of architectural proportions [@nava2013-journey]. On Fortnite, a simple transform guide (start from a box; taper, bulge or pinch it; remove parallel lines) let artists stylise props from photo reference instead of concept art [@ellis2018-fortnite].

Rules can also be over-applied. Fortnite's art lead found that forcing the shape language onto every asset slowed character work; the lesson Ellis drew was that a style is the sum of its parts, and its strongest moves belong where players look and interact most, such as door frames and windows [@ellis2018-fortnite].

Checks: Can the style rules be stated in one screen of text in the project's design notes? Does a new asset hold up placed beside three existing ones, in game, at gameplay camera distance, not only as an enlarged preview?

## When players cannot read the scene

Symptoms: "what hit me?", allies mistaken for enemies, pickups and interactables missed, the player losing their own character in effects.

Kamei, Capcom's art director on Street Fighter V, argues that in a fighting game art is the fastest feedback on the state of the match. Kamei judged characters and animation mainly by how they read from the battle camera, exaggerated silhouettes so poses read when characters are small, and rejected a realistic-proportion model early because attacks were hard to read [@kamei2017-street-fighter-v]. Team Fortress 2 validated its nine class designs in pure silhouette at the concept stage, kept high-frequency detail and repetitive geometry low to limit visual noise, and gave the two teams' bases contrasting colour, material and form [@mitchell2007-tf2].

A working value and colour hierarchy, synthesised from these sources:

| Layer | Job | Pattern used by the sources |
| --- | --- | --- |
| Environment | Set mood without competing | Narrower colour and value range than characters; no pure black or white [@kamei2017-street-fighter-v]; muted colours dominate, saturation kept to small areas [@mitchell2007-tf2] |
| Characters | Identity, pose, team | Wider value range than the environment [@kamei2017-street-fighter-v]; distinct silhouettes, rim highlights to emphasize them [@mitchell2007-tf2] |
| Gameplay effects | Threat, ability, hit | High saturation and emissive levels so abilities stand out from the environment [@kladis2017-vfx] |
| Critical UI feedback | Damage, danger | A reserved colour used sparingly (see red overload below) |

Value and colour can also carry pacing. Journey used clearer views and farther fog for happier areas, closer fog for frightening ones, and withheld blue sky until the final area as a reward [@nava2013-journey].

Hue alone fails colour-blind players; pair it with shape, pattern, an icon or text [@pennant2019-colorblind; @hamilton2021-shoestring]. Overused colour also stops working: Hodent found red overused in Unreal Tournament 3 and early Fortnite, so critical damage feedback no longer stood out; Fortnite reserved red for it, moved it near the reticle and made enemy health bars orange [@hodent2015-gamers-brain].

Red flags in code and content:

- Team identity is a hue tint on shared albedo, so a player skin or a lighting change can erase it.
- Additive VFX with no brightness cap wash out the characters they sit on.
- One colour grade is applied over world, characters and gameplay effects alike.
- "Enemy" and "ally" are separated by a material parameter that the skin pipeline can override.

Checks: a grayscale screenshot at gameplay resolution (the hierarchy should survive); a silhouette-only pass for characters; a colour-blindness simulation; a look at the target screen from the target distance.

## Keeping asset families consistent within pipeline limits

Build a family (props, enemies, icons, tiles) from shared constraints, and place the first few members in game before producing the rest. Keep names, dimensions, pivots, frame layout, transparency and import settings consistent with the actual pipeline, and push one sample asset through the real import path before a batch.

Published cases show where style and pipeline collided; check a new style against them:

- Gameplay constraints: Fortnite's stylised crates would not stack, some guns were so exaggerated that aim direction was unclear in third person, and doorways needed a standard minimum size so collision worked for every character [@ellis2018-fortnite].
- Construction limits: some of Fortnite's modular wall pieces could not follow the shape language, and an engine change forced the conversion of existing assets to physically based rendering [@ellis2018-fortnite].
- Engineering cost: a Journey character with fully animated fingers was dropped because programmers could not make it work, and the character was simplified by removing what gameplay did not need [@nava2013-journey].
- Noise and memory: Team Fortress 2 avoided overly complex or off-kilter geometry both as visual noise and as memory cost [@mitchell2007-tf2].
- Audio assets follow the same rule: PopCap's composer found that cues written against one sample library sounded wrong when moved to the one the game shipped with, and cut the number of music sets to fit mobile size and schedule budgets [@allen2017-pvz-heroes].

## UI and HUD

Decide first which information is critical or must be read continuously (health, ammo, timers, threat direction), and which can live in the world.

The evidence on diegetic (in-world) versus overlay UI is mixed and depends on the player and the information:

| Source | Setting | Finding |
| --- | --- | --- |
| [@llanos2011-integrated-ui] | Qualitative study, Assassin's Creed with HUD off, small sample | Removing the overlay did not by itself raise involvement; overlays that break the fiction were accepted when relevant; excess information annoyed; in-world UI is a poor fit for critical or continuously gauged values |
| [@iacovides2015-hud] | Lab, one Battlefield 3 level, novices and experts | No HUD did not hurt initial enjoyment; experts reported more immersion without it; one level of one game |
| [@peacocke2015-ammo] | Lab, five ammo displays in a test shooter | A number beside the weapon beat HUD icons on shots fired after running dry and on reload time, and most participants preferred it |

Shipped practice follows the same line. Dead Space's diegetic UI ran on explicit rules: the character keeps to one side of the screen so UI has a predictable home, important UI sits about 1.5 m above the floor because playtests showed players did not look higher or lower, menus that belong to the player rather than the character appear behind him, and a fixed colour code separates interactive, locked and decorative elements [@ignacio2013-dead-space-ui]. On Hardspace: Shipbreaker a fully diegetic helmet HUD from the prototype cut off elements and was hard to read, so the shipped HUD is mostly diegetic with deliberate exceptions, groups core information near the bottom centre, gives notifications and hazards fixed sides, and keeps subtitles clear of other UI [@shah2021-hardspace].

Perception limits to design around [@hodent2015-gamers-brain]:

- Grouping: elements placed close together, or sharing shape and colour, read as one group without separators.
- Icons: make the form suggest the function. Hodent tested icons by asking players who had not seen them to describe form and function, with icons shown at in-game size.
- Attention: it works like a spotlight, so a tip shown mid-combat is missed.
- Self-report: players' explanations of a problem may not name its cause; test the suspected variable directly.

Red flags: world-space widgets whose size changes with camera distance (Madden's enlarge option moved its kick meter to a fixed screen position for this reason [@stevens2017-madden]); layouts checked only on the developer's monitor; subtitles, notifications and prompts on one layer with no rule for overlap; tooltip numbers typed by hand instead of read from the data the simulation uses.

Checks: a five-second screenshot test ("what is your health, your objective, the nearest threat?"); an icon comprehension test with fresh players; full navigation with a controller only; everything inside the safe area.

## UI text and copy

Copy should say what a thing does in the game's own terms, and the numbers it shows should be the numbers the simulation uses. Avoid slogans, promotional one-liners, decorative statistics and web-style feature cards inside a game; they cost reading effort and say nothing about play.

Staying consistent with the fiction is compatible with clarity when information hierarchy comes first. Hardspace: Shipbreaker carried much of its world-building through in-world paperwork such as the hiring contract and a health-and-safety report on death, after first reorganising what the player needs moment to moment [@shah2021-hardspace]. Dead Space wanted a broken-looking font for its fiction but had to make it readable to pass certification [@ignacio2013-dead-space-ui].

For text-heavy screens, inkle's designer Humfrey ties readability to familiarity, so over-stylised fonts add friction, and suggests roughly 5 to 15 words per line, placing text near the action, breaking it into chunks, and never letting text animation slow fast readers, tuned by testing with readers of different speeds [@humfrey2018-text-ux]. Humfrey also notes console text is often too small because developers sit close to their screens [@humfrey2018-text-ux]; see `accessibility.md` for size targets.

Checks: keep a glossary so one mechanic has one name everywhere; confirm every label names an action or a state; compare displayed values against gameplay data in a test.

## Motion and animation readability

Readability depends on the camera. When Lab Zero moved from a fighting game to a platformer with a farther camera, detail that had worked became noise and animation had to be simplified and exaggerated; silhouettes also read differently from a top-down camera [@zadziuk2017-animation-tricks]. In the same session, Boss Key's animator advised breaking a first-person action into key beats with holds long enough to register before adding style, Sparkypants' lead started hit reactions from a bigger recovery pose for a quicker, clearer read, and another speaker asked of every gameplay animation whether it reads, how it feels and when control returns to the player [@zadziuk2017-animation-tricks].

Capcom turned Street Fighter V's poses slightly toward the battle camera and designed special moves so they can be described in a short phrase [@kamei2017-street-fighter-v]. For effects, Gigantic's many heroes risked effects noise that interfered with gameplay, and on Agents of Mayhem a timing pass using animation principles such as anticipation made layered effects more readable, while distance-dependent alpha erosion kept blood shapes bold far away [@kladis2017-vfx].

Red flags: animation reviewed only in the content tool's orbit camera; attacks with no readable wind-up at gameplay distance; hit reactions that start before the contact frame is visible; screen shake and flashes on every hit (they also affect players prone to motion sickness or seizures; see `accessibility.md`).

## Sound as information

Games differ from linear media because player actions trigger dialogue, effects, ambience and music, and nonlinearity complicates composition [@collins2008-game-sound]. Treat each sound as carrying a specific piece of information.

Evidence that sound changes play:

- In a lab study of one first-person shooter modification, switching sound effects on or off changed every Game Experience Questionnaire dimension, and sound and music interacted on tension and flow; physiological measures showed no effect [@nacke2010-sonic-ux].
- In multiplayer shooters, understanding audio cues was critical to how experts located opponents, and both a training system and a modified interface improved novices' accuracy and confidence at doing so [@johanson2016-audio-cues].
- Overwatch's director set the goal that the game be playable by sound. The team gave each hero distinct footsteps, processed friendly and enemy versions of the same sound differently, gave key abilities clear start and end sounds, and used path-length occlusion so players could hear when a threat was behind geometry [@lawlor2016-play-by-sound].

Adaptive music: on Plants vs. Zombies Heroes the on-screen phase indicator drove music changes, a shared tempo and a shared key per hand held different hero themes together, and transition timing was tuned by playing; an interruption that sounded better at a musical boundary felt unresponsive, so it was made immediate [@allen2017-pvz-heroes].

| Sound job | It must encode | Check |
| --- | --- | --- |
| Threat | Who, where, how close, whether blocked | Eyes closed, can a tester point to it? |
| Ability or state | Start, end, owner (friend or foe) | Can players tell when a buff ends without the HUD? |
| Feedback | Success, failure, magnitude | Does the 50th repetition still carry information? |
| Music | Phase, tension, progress | Do transitions land when the game state changes? |

## Mixing and priority

"Loudest wins" is not a priority system. In Overwatch a standard HDR mix buried the footsteps of enemies approaching from behind; the team replaced it with a threat score (built from factors such as distance, aim and damage dealt) that places one enemy in a high bucket, a couple in a medium one and the rest lower, and the bucket drives gain and filtering per sound category, with ultimates kept prominent [@lawlor2016-play-by-sound].

Just Cause 4's audio team treated the mix as a system from the design phase rather than a final pass. In the previous game's priority-and-sidechain mix, designers of low-priority sounds pushed their assets louder and the mix pumped; the new mix used context snapshots (global states such as combat or storms, local states such as an enemy targeting the player), routed the player's vehicle to higher-priority paths, lowered ambience as enemy count rose, and let storms start overwhelming and then fade to reduce fatigue [@vega2019-just-cause-4]. The approach depended on playtest feedback [@vega2019-just-cause-4].

Red flags: all effects normalised to one level with a single master fader; priority decided only by amplitude; mixing scheduled for the last month; UI, dialogue and combat on the same bus with no ducking rules; no per-category voice limits. Independent volume sliders per category are also an accessibility requirement (see `accessibility.md`).

Checks: record a busy encounter and list which cues were audible at each moment; play a round with the monitor off, Overwatch's own stated goal, and note what could not be heard.

## What to collect

For any presentation change, collect gameplay-resolution captures, a note of which rule the change serves, and observations from players who have not seen the build. Ask players what they saw or heard, then check their answer against what the game was showing; see `evaluation.md` for playtest method. These are hypotheses to test against the intended experience, not claims that a palette, curve or sound is better in general.

## Sources

- `mitchell2007-tf2` Jason Mitchell et al. (2007). Illustrative Rendering in Team Fortress 2. Proceedings of the 5th International Symposium on Non-Photorealistic Animation and Rendering (NPAR 2007). https://doi.org/10.1145/1274871.1274883 (peer-reviewed)
- `nava2013-journey` Matt Nava (2013). The Art of Journey. Game Developers Conference 2013. https://gdcvault.com/play/1017799/The-Art-of (GDC talk)
- `ellis2018-fortnite` Peter Ellis (2018). Developing the Art of 'Fortnite'. Game Developers Conference 2018. https://gdcvault.com/play/1024936/Developing-the-Art-of-Fortnite (GDC talk)
- `kamei2017-street-fighter-v` Toshiyuki Kamei (2017). Art Direction of 'Street Fighter V': The Role of Art in Fighting Games. Game Developers Conference 2017. https://gdcvault.com/play/1024506/Art-Direction-of-Street-Fighter (GDC talk)
- `kladis2017-vfx` Bill Kladis et al. (2017). Art Directing VFX for Stylized Games. Game Developers Conference 2017. https://gdcvault.com/play/1023999/Art-Directing-VFX-for-Stylized (GDC talk)
- `pennant2019-colorblind` Douglas Pennant (2019). Solving an Invisible Problem: Designing for Color-Blindness in Games. Game Developers Conference 2019. https://gdcvault.com/play/1025754/Solving-an-Invisible-Problem-Designing (GDC talk)
- `hamilton2021-shoestring` Ian Hamilton (2021). Independent Games Summit: Accessibility on a Shoestring. Game Developers Conference 2021, Independent Games Summit. https://gdcvault.com/play/1027108/Independent-Games-Summit-Accessibility-on (GDC talk)
- `hodent2015-gamers-brain` Celia Hodent (2015). The Gamer's Brain: How Neuroscience and UX Can Impact Design. Game Developers Conference 2015. https://gdcvault.com/play/1022309/The-Gamer-s-Brain-How (GDC talk)
- `allen2017-pvz-heroes` Becky Allen (2017). Always Be Composing: The Flexible Music System of 'Plants vs. Zombies Heroes'. Game Developers Conference 2017. https://gdcvault.com/play/1023974/Always-Be-Composing-The-Flexible (GDC talk)
- `llanos2011-integrated-ui` Stein C. Llanos and Kristine Jørgensen (2011). Do Players Prefer Integrated User Interfaces? A Qualitative Study of Game UI Design Issues. Proceedings of DiGRA 2011 Conference: Think Design Play. https://doi.org/10.26503/dl.v2011i1.514 (peer-reviewed)
- `iacovides2015-hud` Ioanna Iacovides et al. (2015). Removing the HUD: The Impact of Non-Diegetic Game Elements and Expertise on Player Involvement. Proceedings of the 2015 Annual Symposium on Computer-Human Interaction in Play (CHI PLAY 2015). https://doi.org/10.1145/2793107.2793120 (peer-reviewed)
- `peacocke2015-ammo` Margaree Peacocke et al. (2015). Evaluating the Effectiveness of HUDs and Diegetic Ammo Displays in First-Person Shooter Games. 2015 IEEE Games Entertainment Media Conference (GEM). https://doi.org/10.1109/GEM.2015.7377211 (peer-reviewed)
- `ignacio2013-dead-space-ui` Dino Ignacio (2013). Crafting Destruction: The Evolution of the Dead Space User Interface. Game Developers Conference 2013. https://gdcvault.com/play/1017723/Crafting-Destruction-The-Evolution-of (GDC talk)
- `shah2021-hardspace` Vidhi Shah (2021). Cutting Apart The Diegetic Interface of 'Hardspace: Shipbreaker'. Game Developers Conference 2021. https://gdcvault.com/play/1027036/Cutting-Apart-The-Diegetic-Interface (GDC talk)
- `stevens2017-madden` Karen Stevens (2017). Game Accessibility: Practical Visual Fixes from EA's 'Madden NFL' Franchise. Game Developers Conference 2017. https://gdcvault.com/play/1024114/Game-Accessibility-Practical-Visual-Fixes (GDC talk)
- `humfrey2018-text-ux` Joseph Humfrey (2018). Designing Text UX for Effortless Reading. Game Developers Conference 2018. https://gdcvault.com/play/1025104/Designing-Text-UX-for-Effortless (GDC talk)
- `zadziuk2017-animation-tricks` Kristjan Zadziuk et al. (2017). Animation Bootcamp: Tricks of the Trade. Game Developers Conference 2017, Animation Bootcamp. https://gdcvault.com/play/1024320/Animation-Bootcamp-Tricks-of-the (GDC talk)
- `collins2008-game-sound` Karen Collins (2008). Game Sound: An Introduction to the History, Theory, and Practice of Video Game Music and Sound Design. MIT Press. https://doi.org/10.7551/mitpress/7909.001.0001 (book)
- `nacke2010-sonic-ux` Lennart E. Nacke et al. (2010). More than a feeling: Measurement of sonic user experience and psychophysiology in a first-person shooter game. Interacting with Computers 22(5). https://doi.org/10.1016/j.intcom.2010.04.005 (peer-reviewed)
- `johanson2016-audio-cues` Colby Johanson and Regan L. Mandryk (2016). Scaffolding Player Location Awareness through Audio Cues in First-Person Shooters. Proceedings of the 2016 CHI Conference on Human Factors in Computing Systems. https://doi.org/10.1145/2858036.2858172 (peer-reviewed)
- `lawlor2016-play-by-sound` Scott Lawlor and Tomas Neumann (2016). Overwatch - The Elusive Goal: Play by Sound. Game Developers Conference 2016. https://gdcvault.com/play/1023010/Overwatch-The-Elusive-Goal-Play (GDC talk)
- `vega2019-just-cause-4` Dominic Vega (2019). Building a Mixing Sandbox for 'Just Cause 4'. Game Developers Conference 2019. https://gdcvault.com/play/1025999/Building-a-Mixing-Sandbox-for (GDC talk)
