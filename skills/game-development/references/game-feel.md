# Game feel

Read this when controls feel late, floaty, slippery or unfair; when tuning jumps, movement or cameras; when hits lack impact; or when deciding how much feedback ("juice") a game should have. Engine timing details (physics ticks, interpolation, input APIs) are in [engines](engines.md). Motion, flash and assist options are covered in full in [accessibility](accessibility.md).

Game feel is not one target. Swink describes it as real-time control of a virtual object, in a simulated space that gives motion context, with polish that emphasizes interactions [@swink2009-gamefeel]. A survey of over 200 academic and practitioner sources sorts feel work by purpose: tuning physicality for predictability, juicing for amplification and clear feedback, and streamlining so the game acts on what the player meant [@pichlmair2022-game-feel-survey]. A heavy, deliberate character and a quick, precise one can both be well made. Start from the feel the developer intends, then find which layer is off.

Player vocabulary is a symptom, not a diagnosis. Swink notes that designers have no shared definition and describe feel with words like floaty, responsive or loose [@swink2009-gamefeel]. When players of a 2D platformer described avatars with varied acceleration and deceleration, most used basic words such as heavy, slow or responsive; some noticed small changes, others noticed none, and they did not agree on how to describe a given feel [@dahl2015-acceleration]. Ask testers to show the moment, then inspect the numbers behind it.

## Separate the causes

| Symptom | Inspect before changing anything |
| --- | --- |
| Input seems late | Where in the frame input is sampled; thread and vsync queuing [@hogge2019-cod-latency]; animation blend and startup frames [@cofino2022-dreamscaper]; input read only inside a fixed tick with no buffer; camera smoothing |
| Jump feels floaty | Apex height, time to apex, fall gravity, early-release rule [@pittman2016-jump]; how the camera follows vertically [@keren2015-cameras]; character size on screen |
| Movement slippery or sluggish | Acceleration and braking time, turn-around, surface friction, air control [@cofino2022-dreamscaper; @dahl2015-acceleration] |
| "I pressed it and nothing happened" | Input consumed in the wrong state, zero-width timing windows, collision edges snagging the body [@coster2020-forgiveness] |
| Combat feels unfair | Enemy wind-ups that are unclear rather than too short, missing audio cues, no priority among simultaneous threats, unreadable recovery, strict player hitboxes [@cofino2022-dreamscaper] |
| Hit lacks impact | Hit reaction, hitstop, sound, camera response [@lin2022-impact-feel; @cofino2022-dreamscaper]; whether the contact frame is readable |
| Motion looks jittery | Simulation versus render cadence, missing interpolation, camera updated before its target moves, several systems writing one transform; camera constraints pushing against each other [@nesky2014-camera-mistakes]; shake from per-frame random values [@eiserloh2016-camera-shake] |
| Camera makes people ill or lost | Narrow or rapidly changing field of view, shake, walk bob, jump-locked vertical follow, cuts that remap the stick [@nesky2014-camera-mistakes] |
| Everything feels noisy | Feedback out of proportion to events, effects covering telegraphs [@kao2020-juiciness]; effects that ignore the game world's context [@kelly2014-dont-juice] |

Red flags in code (this skill's reasoning): input polled only in the physics step with no buffer; `speed` and `gravity` set once and never tied to a design target; animation events deciding whether input is accepted in a game meant to feel quick; shake written into the camera's real position; hitstop that sets a global time scale and later "restores" it to 1.0.

## Input latency: what the research says

Do not judge latency against one cut-off such as 100 ms. The studies below support no single threshold: sensitivity depends on the action, the game's speed, and whether the delay is constant.

| Study | Conditions | Finding |
| --- | --- | --- |
| Claypool & Claypool 2006 [@claypool2006-latency] | Synthesis of earlier network-latency testbeds on commercial online games | Sensitivity rises with the precision an action needs and the tightness of its deadline. Proposed tolerances: about 100 ms for first-person avatar games (shooters, racing), 500 ms for third-person avatar games (sports, RPGs), 1,000 ms for omnipresent games (RTS). High-precision weapon accuracy in Unreal Tournament 2003 fell about 35% at 100 ms. |
| Halbhuber et al. 2023 [@halbhuber2023-latency-perspective] | One shooting game in three perspectives; 36 participants; about 48 ms baseline versus 150 ms added | Latency hurt performance and experience in every perspective; the data favored no interaction with perspective, contradicting perspective-based categories. |
| Long & Gutwin 2018 [@long2018-local-latency] | Two studies of simple game actions under local latency | Earlier studies report thresholds from 50 to 500 ms. A model built on lag and game speed predicted performance, most accurately for faster games and higher lag. |
| Liu et al. 2021 [@liu2021-local-latency] | 43 experienced CS:GO players; 25 to 125 ms total local latency | Accuracy, score and rated experience improved roughly linearly as latency fell across the range; scores at 25 ms averaged about 20% above 125 ms. |
| Jörg et al. 2012 [@jorg2012-responsiveness] | 3D platformer with a motion-captured character; about 150 ms of slightly varying controller delay | Harder perceived control, more frustration, lower performance on some tasks; response mattered most for precise, challenging tasks. |
| Normoyle et al. 2014 [@normoyle2014-latency-jitter] | Similar platformer, 89 students and researchers, one condition each; 0 to 500 ms constant delay, or 200 ms with jitter | Constant delay had little effect on experience until very high values, and fewer than half noticed 300 ms. Jitter was noticed more often than constant delay, caused more failures and hindered improvement. |

How to use this:

- Place each action on precision and deadline [@claypool2006-latency]. On that scale, aiming at a moving target, parrying and timing a jump over a narrow gap are sensitive; menu navigation and strategy orders much less so. Game speed matters too [@long2018-local-latency].
- Do not promise that "under 100 ms is fine." For skilled players of one competitive shooter, overall performance kept improving as latency fell toward 25 ms [@liu2021-local-latency].
- Prefer consistent latency to lower but variable latency. In the platformer study, 200 ms with jitter was noticed more often than constant delays up to 500 ms, and the authors suggest accepting a larger constant delay to remove jitter [@normoyle2014-latency-jitter]. Frame-pacing spikes and uneven input sampling produce varying delay, which is jitter in this sense (reasoning).
- Look for latency in the pipeline. A Call of Duty engine talk traces input from sampling to display scan-out, measures each segment, and uses a dynamic throttle to sample input as late in the frame as possible without dropping frames; it singles out the interaction of GPU work and scan-out under vsync [@hogge2019-cod-latency]. On Dreamscaper, engine thread syncing on Switch caused about 130 ms of input latency; a low-latency frame-sync option nearly halved it, and the team widened the Switch parry window so parrying felt comparable to PC [@cofino2022-dreamscaper].
- Measure before arguing. Halbhuber et al. measured their setup by filming mouse and screen with a 240 fps camera and comparing the click with the on-screen shot [@halbhuber2023-latency-perspective]. A frame-counted screen recording without the physical input in view shows in-game response delay, not device-to-display latency; label it that way.

## Authoring movement and jumps

Pittman builds a jump from what the designer wants, a height and a distance, instead of starting from a gravity constant and tweaking [@pittman2016-jump]. For constant gravity with up as positive, velocity is `v(t) = g·t + v0` and height is `y(t) = ½·g·t² + v0·t`. Requiring `v = 0` and `y = h` at the apex time `t_h` gives:

```
v0 = 2h / t_h          g = -2h / t_h²
with t_h = x_h / v_x   (horizontal distance to apex / air speed):
v0 = 2h·v_x / x_h      g = -2h·v_x² / x_h²
```

In magnitude, `|g| = 2h/t_h²` and `|v0| = 2h/t_h`, where `t_h` is the time to the apex, not total air time. A symmetric arc lands at `2·t_h`. Keep horizontal and vertical velocity separate so a jump never zeroes running speed [@pittman2016-jump].

Axis conventions flip the signs. In Godot's 2D coordinate system positive y points down [@godot2026-vector-math], so ascent is a negative velocity and gravity is positive. Check the engine, the space (2D or 3D) and the units before writing constants, and require `h > 0` and `t_h > 0`.

Shaping the arc [@pittman2016-jump]:

- Join partial parabolas. Switch to heavier gravity when vertical velocity changes sign so the fall is faster than the rise; Pittman cites the original Super Mario Bros. as doing this.
- For variable height, launch with the velocity for the maximum height and switch to heavier gravity if the button is released early; that release gravity sets the minimum jump.
- Give each extra jump in a multi-jump its own height, distance and launch velocity.
- Explicit Euler integration can change how the character handles when frame rate drops. Under constant acceleration, `p += v·dt + ½·a·dt²` with `v += a·dt` matches the projectile formula exactly; Pittman measured the error from a mid-step gravity switch at about half a pixel in their own game, cleared on landing.

Once gravity varies, air time is no longer `2·t_h`. Verify the real arc in the controller, with collisions, at shipping frame rates, against the level's actual gaps and ledges. Asymmetric gravity, apex hang and instant turn-around suit a responsive platformer; they are not requirements, and a game meant to feel weighty may want longer acceleration. Cofino notes that longer acceleration adds weight but feels less responsive; Dreamscaper's movement has almost no acceleration because the team wanted it as responsive as possible [@cofino2022-dreamscaper].

Expose the few values that express intent (height, distance or time to apex, fall multiplier, ground and air acceleration) and tune them live while playing.

## Input forgiveness

Expect presses that are early, late or on the wrong button. Coster's forgiveness mechanics for the platformer Levelhead [@coster2020-forgiveness]:

| Problem | Levelhead's rule |
| --- | --- |
| Jump pressed just after leaving a ledge | "Can jump" became a timer: jumping stays allowed for 0.1 s (coyote jump) |
| Jump pressed just before landing | Input buffering: a press counts for 0.2 s until the action becomes valid; later applied to almost every action |
| Button still held from an earlier action | Input reset: jumping cancels fall-through mode, so a held down input no longer drops the player through the platform they land on |
| Accidental press of a costly button | Restart requires a 0.3 s hold; about a third of players had restarted by accident while squeezing the controller |
| Snagging on ledges and ceiling corners | Pinched movement hitbox: shorter when moving sideways, very narrow when jumping up, full width when falling, with a pop-out correction |
| Hazards and pickups | Hazard hitboxes smaller than the art, pickup hitboxes larger, magnetism on gems, and hit checks that test the favorable outcome first |

The game-feel survey classes coyote time, jump buffering and corner correction as support techniques that act on the player's intent, often without the player noticing [@pichlmair2022-game-feel-survey]. Dreamscaper buffers early combat inputs generously but guards against mashed presses being over-registered [@cofino2022-dreamscaper].

Implementation (this skill's reasoning): express windows in seconds or in documented simulation ticks; tune them separately from jump height; consume a buffered press once and clear it when used; decide deliberately what happens to buffers on pause, respawn, cutscenes and state changes; test ledge exits, moving platforms, rapid repeated presses and presses during hitstop. Window size is a design choice. A game about exact timing may want small windows.

## Camera

Keren frames 2D camera work around three goals: keep what the player needs in frame, keep camera motion predictable and tied to the controls, and keep it comfortable, since conflicting signals from the eyes and the vestibular system can cause nausea [@keren2015-cameras]. Keren's catalog, drawn from decades of side-scrollers:

| Technique | Behavior and fit |
| --- | --- |
| Camera window | The player moves freely inside a box; the camera moves only when pushed |
| Platform snapping | Vertical follow happens when the player lands (Super Mario World), so jumps do not jolt the view |
| Lerp or physics smoothing | Close part of the gap each frame; Mushroom 11 varies smoothing time with the character's speed |
| Dual forward focus | Look ahead in the facing direction, with a threshold so small backtracks do not swing the view |
| Projected focus | Look where velocity leads; poor for vertical platformer motion because a jump changes vertical speed abruptly |
| Target and cue focus | Bias toward aim, stick input, or attractors placed in the level |
| Regions and zoom-to-fit | Per-area anchors and zoom; zoom out to keep several players or a boss in view |

For 3D, Nesky's list from Journey [@nesky2014-camera-mistakes] includes: orbit the avatar rather than pivot in place; swing away from obstacles early rather than snapping closer; group competing constraints by degree of freedom (yaw, pitch, roll, three offsets, field of view) and give player input priority; limit how far the avatar can drift from center; do not lock vertical follow to every jump; treat a cut as remapping the stick; and avoid a general constraint solver, whose output is hard to predict and therefore hard to design.

Eiserloh smooths following with a per-frame asymptotic average, tuned separately for horizontal and vertical motion and for rising and falling, and notes that it is frame-rate dependent as written [@eiserloh2016-camera-shake]. A frame-rate-independent blend factor is `1 - exp(-rate·dt)`; that is standard math, not from the talk.

One system should own the final camera transform, with follow, look-ahead, bounds, cuts and shake as inputs to it (reasoning). Check aiming, level edges, teleports, respawns, cuts and aspect ratios. Heavy smoothing can make responsive controls look late.

## Camera shake

Eiserloh's model [@eiserloh2016-camera-shake]:

- Events add to a 0-to-1 trauma value that decays linearly. Shake is trauma squared or cubed, so light and heavy hits read differently and repeated hits compound.
- In 2D, combine translation and rotation. In 3D, prefer rotation: translation feels worse and can push the camera into walls.
- Apply shake as an offset on a copy of the base camera each frame; never move the real camera.
- Drive it with smooth noise sampled by time, with a different seed per axis, not per-frame random numbers. It then respects slow motion and frame rate, and its frequency can be tuned.
- Eiserloh advises against shake in VR because it is forced motion. The Until You Fall team found screen flash and camera shake worked better in their VR melee game than expected, with minor tweaks [@bennett2020-until-you-fall]. Test VR shake with players rather than assuming either way.

On Dreamscaper, shake strength follows the hit class, and shake when the player is hit is much weaker than when an enemy is hit, because players rarely expect being hit [@cofino2022-dreamscaper].

## Animation versus control

Decide per action whether gameplay or animation owns timing. On Just Cause 3 the goal was that the player never waits for an animation to finish before the next maneuver. The team contrasts game-driven movement (responsive, flexible) with animation-driven root motion (highest fidelity, less responsive, needs more animation) and mixes the two: they separate an animation's extracted motion from its pose, then keep, correct or override facing, direction and speed per segment, for example spreading a turn correction across a start animation so the character ends up facing the stick direction [@shroff2015-just-cause].

Practitioner rules for responsive actions:

- Player moves get little anticipation; enemy attacks need wind-ups players can read. A player move can snap to its key pose and let follow-through and smears carry the motion (Skullgirls) [@cartwright2014-skullgirls]. Dreamscaper starts attacks directly in the anticipation pose and found shorter blend times more responsive, with too-long blends reading as sluggish [@cofino2022-dreamscaper].
- Define an interrupt hierarchy. Dreamscaper lets dodge and block break out of almost any action, while attacks keep startup and recovery so offense stays a commitment [@cofino2022-dreamscaper].
- Let design own frame data. Skullgirls moves were playable at standard frame counts before the art was finished, and the animator made each move read within those frames [@cartwright2014-skullgirls].

Make cancel windows explicit data (which action may cancel which, from which frame to which frame) rather than side effects of animation events (reasoning). Test interruption at every phase, input during hitstop, and what happens when the target dies or disappears mid-action.

## Hit feedback and hitstop

A hit should answer: did it connect, where, to whom, and how hard? In an analysis of Steam reviews, the action games players rated best and worst for impact differed most in hit stop, sound coherence and camera control. That is a correlational comparison of commercial games, not an experiment [@lin2022-impact-feel].

- **Hitstop** pauses the characters involved at impact. Skullgirls' lead animator found impacts looked weak without it [@cartwright2014-skullgirls]. Dreamscaper freezes only attacker and target for about 115 ms (about 7 frames at 60 fps), eases in and out on an authored curve, and lets effects and camera keep playing; stopping everything felt more disruptive [@cofino2022-dreamscaper]. A freeze frame that halts all game time is a different effect [@pichlmair2022-game-feel-survey].
- **Hit reactions**: Dreamscaper plays them without blending and starts mid-reaction so the pose change sells the force; its distant camera allowed this, and a closer camera may need some blending [@cofino2022-dreamscaper].
- **Sound** is often what players cannot name when combat feels off, and thin impact sounds undercut hits [@cofino2022-dreamscaper]. Berbece keeps repeated movement sounds quiet and bends their pitch each time they play, as with the jump sound in Move or Die [@berbece2015-death-animation].

Hitstop implementation (reasoning): give it an owner and a clock. Decide whether it freezes two entities, a group or the whole simulation; resolve overlapping requests (longest wins, or extend); never restore a global time scale to 1.0 blindly, because pause or slow motion may be active; run feedback timers on unscaled time; keep buffered input alive through the stop. In networked games, a local hitstop must not freeze the authoritative simulation.

## Juice: what the evidence says

Swink defines polish as non-simulated cues about objects' physical properties: remove them and the game still works, but players read its physics differently [@swink2009-gamefeel]. Jonasson and Purho demonstrated layering such effects onto a plain game live on stage [@jonasson2012-juice]. Berbece rebuilt a death effect layer by layer and argued that feedback is functional, because it confirms an input registered [@berbece2015-death-animation].

Player studies support some juice, not unlimited amounts, and show its limits:

- In a study of an action RPG (N = 3,018), both no juice and extreme juice produced less play time, worse player experience, lower intrinsic motivation and lower performance than medium or high juice [@kao2020-juiciness].
- Across a Frogger-style game, a research first-person shooter and Quake 3 Arena, visual embellishments raised visual appeal in every game but affected competence only in specific circumstances [@hicks2019-juicy].

A practitioner counterpoint: Kelly argues that embellishment applied without regard to the world, such as dust clouds where there is no dust, can cost immersion [@kelly2014-dont-juice].

Treat juice as a quantity to tune, not a checklist to max out (reasoning). Rank events by importance and scale feedback to match. Compare no, moderate and heavy versions with players, and check that effects never hide telegraphs, hitboxes or selection states. Juice will not rescue a weak mechanic, so test the plain version for the decision or skill it is meant to carry.

## Feedback excess and reduced motion

Nesky lists small or rapidly changing field of view, screen shake and walk-cycle camera bob as simulation-sickness triggers, asks for options to widen the field of view and to reduce or disable shake and bob, and warns that some testers will not admit to feeling sick [@nesky2014-camera-mistakes]. Cofino recommends letting players at least turn off, and ideally scale, screen shake and controller rumble [@cofino2022-dreamscaper]. Build an intensity scalar into shake, flashes, bob and field-of-view effects from the start so the option costs little later (reasoning). See [accessibility](accessibility.md) for motion, flashing and photosensitivity guidance and assist options.

## Evidence to collect

- End-to-end latency filmed with the input device and screen in frame, plus frame-to-frame variation.
- The real jump arc and air time at shipping frame rates, overlaid on the level's key gaps.
- Recordings of players' mistimed presses, with buffer and coyote state logged.
- Playtests at none, moderate and heavy feedback settings, noting misread telegraphs.
- Private questions to testers about discomfort.

## Sources

- `swink2009-gamefeel` Steve Swink (2009). Game Feel: A Game Designer's Guide to Virtual Sensation. Morgan Kaufmann. https://www.routledge.com/Game-Feel-A-Game-Designers-Guide-to-Virtual-Sensation/Swink/p/book/9780123743282 (book)
- `pichlmair2022-game-feel-survey` Martin Pichlmair and Mads Johansen (2022). Designing Game Feel: A Survey. IEEE Transactions on Games 14(2). https://doi.org/10.1109/TG.2021.3072241 (peer-reviewed)
- `dahl2015-acceleration` Gustav Dahl and Martin Kraus (2015). Measuring how game feel is influenced by the player avatar's acceleration and deceleration: using a 2D platformer to describe players' perception of controls in videogames. Proceedings of the 19th International Academic Mindtrek Conference. https://doi.org/10.1145/2818187.2818275 (peer-reviewed)
- `hogge2019-cod-latency` Akimitsu Hogge (2019). Controller to Display Latency in 'Call of Duty'. Game Developers Conference 2019. https://gdcvault.com/play/1025968/Controller-to-Display-Latency-in (GDC talk)
- `cofino2022-dreamscaper` Ian Cofino (2022). 'Dreamscaper': Killer Combat on an Indie Budget. Game Developers Conference 2022. https://gdcvault.com/play/1027585/-Dreamscaper-Killer-Combat-on (GDC talk)
- `pittman2016-jump` Kyle Pittman (2016). Math for Game Programmers: Building A Better Jump. Game Developers Conference 2016. https://gdcvault.com/play/1023148/Math-for-Game-Programmers-Building (GDC talk)
- `keren2015-cameras` Itay Keren (2015). Scroll Back: The Theory and Practice of Cameras in Side-Scrollers. Game Developers Conference 2015, Independent Games Summit. https://gdcvault.com/play/1022243/Scroll-Back-The-Theory-and (GDC talk)
- `coster2020-forgiveness` Seth Coster (2020). Forgiveness Mechanics: Reading Minds for Responsive Gameplay. Game Developers Conference 2020. https://gdcvault.com/play/1026606/Forgiveness-Mechanics-Reading-Minds-for (GDC talk)
- `lin2022-impact-feel` Zhonghao Lin et al. (2022). What Features Influence Impact Feel? A Study of Impact Feedback in Action Games. 2022 IEEE Games, Entertainment, Media Conference (GEM). https://doi.org/10.1109/GEM56474.2022.10017782 (peer-reviewed)
- `nesky2014-camera-mistakes` John Nesky (2014). 50 Camera Mistakes. Game Developers Conference 2014. https://gdcvault.com/play/1020460/50-Camera (GDC talk)
- `eiserloh2016-camera-shake` Squirrel Eiserloh (2016). Math for Game Programmers: Juicing Your Cameras With Math. Game Developers Conference 2016. https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing (GDC talk)
- `kao2020-juiciness` Dominic Kao (2020). The effects of juiciness in an action RPG. Entertainment Computing 34. https://doi.org/10.1016/j.entcom.2020.100359 (peer-reviewed)
- `kelly2014-dont-juice` Folmer Kelly (2014). Don't Juice It or Lose It. GDC Europe 2014, Independent Games Summit. https://gdcvault.com/play/1020861/Don-t-Juice-It-or (GDC talk)
- `claypool2006-latency` Mark Claypool and Kajal Claypool (2006). Latency and player actions in online games. Communications of the ACM 49(11). https://doi.org/10.1145/1167838.1167860 (peer-reviewed)
- `halbhuber2023-latency-perspective` David Halbhuber et al. (2023). The Effects of Latency and In-Game Perspective on Player Performance and Game Experience. Proceedings of the ACM on Human-Computer Interaction 7 (CHI PLAY). https://doi.org/10.1145/3611070 (peer-reviewed)
- `long2018-local-latency` Michael Long and Carl Gutwin (2018). Characterizing and Modeling the Effects of Local Latency on Game Performance and Experience. Proceedings of the 2018 Annual Symposium on Computer-Human Interaction in Play (CHI PLAY '18). https://doi.org/10.1145/3242671.3242678 (peer-reviewed)
- `liu2021-local-latency` Shengmei Liu et al. (2021). Lower is Better? The Effects of Local Latencies on Competitive First-Person Shooter Game Players. Proceedings of the 2021 CHI Conference on Human Factors in Computing Systems. https://doi.org/10.1145/3411764.3445245 (peer-reviewed)
- `jorg2012-responsiveness` Sophie Jörg et al. (2012). How responsiveness affects players' perception in digital games. Proceedings of the ACM Symposium on Applied Perception (SAP '12). https://doi.org/10.1145/2338676.2338683 (peer-reviewed)
- `normoyle2014-latency-jitter` Aline Normoyle et al. (2014). Player perception of delays and jitter in character responsiveness. Proceedings of the ACM Symposium on Applied Perception (SAP '14). https://doi.org/10.1145/2628257.2628263 (peer-reviewed)
- `godot2026-vector-math` Godot Engine contributors (2026). Vector math. Godot Engine 4.7 documentation. https://docs.godotengine.org/en/4.7/tutorials/math/vector_math.html (official documentation)
- `bennett2020-until-you-fall` Dave Bennett and Patrick Jalbert (2020). Game VR/AR: Until You Fall: Building Satisfying VR Combat on a Budget. Game Developers Conference 2020, Game VR/AR. https://gdcvault.com/play/1026740/Game-VR-AR-Until-You (GDC talk)
- `shroff2015-just-cause` Jeet Shroff and Alex Crowhurst (2015). Finding Balance: Realizing Responsive High Fidelity Character Movement in Just Cause 3. Game Developers Conference 2015. https://gdcvault.com/play/1021981/Finding-Balance-Realizing-Responsive-High (GDC talk)
- `cartwright2014-skullgirls` Mariel Cartwright (2014). Animation Bootcamp: Fluid and Powerful Animation within Frame Restrictions. Game Developers Conference 2014, Animation Bootcamp. https://gdcvault.com/play/1020017/Animation-Bootcamp-Fluid-and-Powerful (GDC talk)
- `berbece2015-death-animation` Nicolae Berbece (2015). Game Feel: Why Your Death Animation Sucks. GDC Europe 2015, Independent Games Summit. https://gdcvault.com/play/1022759/Game-Feel-Why-Your-Death (GDC talk)
- `jonasson2012-juice` Martin Jonasson and Petri Purho (2012). Juice It or Lose It. GDC Europe 2012, Independent Games Summit. https://gdcvault.com/play/1016487/Juice-It-or-Lose (GDC talk)
- `hicks2019-juicy` Kieran Hicks et al. (2019). Juicy Game Design: Understanding the Impact of Visual Embellishments on Player Experience. Proceedings of the Annual Symposium on Computer-Human Interaction in Play (CHI PLAY '19). https://doi.org/10.1145/3311350.3347171 (peer-reviewed)
