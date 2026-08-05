# E11 — Difficulty & Accessibility

> **Category:** Explanation · **Related:** [C2 Game Feel & Genre Craft](C2_game_feel_and_genre_craft.md) · [E6 Game Design Fundamentals](E6_game_design_fundamentals.md) · [E8 Level Design](E8_level_design.md) · [Input Handling Theory](../concepts/input-handling-theory.md) · [P11 Polish Checklist](../project-management/P11_polish_checklist.md)

---

Difficulty as a design system rather than a slider: kinds of challenge, curves, dynamic difficulty adjustment and its pitfalls, the Celeste assist-mode model, and accessibility as an engineering checklist grounded in the free Game Accessibility Guidelines.

---

## Difficulty Is a Distribution Problem

You tune for one player — yourself, after hundreds of hours — but ship to a population whose skill, hardware, and bodies vary enormously. "Is my game too hard?" is unanswerable; "which players does each challenge exclude, and on purpose?" is a design question with actionable answers.

Separate three kinds of challenge, because they fail differently:

- **Execution** — can the player physically perform the input? (frame windows, mash rates, simultaneous buttons)
- **Knowledge** — does the player know the thing? (enemy patterns, hidden rules, genre conventions)
- **Strategy** — can the player out-think the system given full information?

A player bouncing off a boss might be failing any of the three, and each has a different fix: widen the timing window, telegraph the pattern, or improve the information display. Raising or lowering "difficulty" as a single scalar conflates them.

---

## Curves: Author the Failure Rate

- **Saw-tooth ramps** (see pacing in [E8 Level Design](E8_level_design.md)): peaks with recovery valleys. The valley after a spike is where mastery consolidates.
- **Skill floor vs ceiling.** Floor: what's demanded to progress. Ceiling: what's rewarded for mastery. Genres live or die on the gap — a low floor with a high ceiling (score systems, optional challenges, speedrun-friendly movement) serves the whole distribution at once.
- **The developer-blindness correction.** By ship time you are in roughly the 99th percentile at your own game. The playtest rule of thumb: if fresh testers rate a section "about right," it is probably too hard for launch audiences; if it feels almost embarrassingly easy to you, it may be correctly tuned.
- **Death should teach.** After a failure the player should be able to name what to do differently. Deaths with no articulable lesson are where "unfair" reviews come from — and they're usually information bugs, not tuning bugs.

---

## Dynamic Difficulty Adjustment (DDA)

Adapting challenge to measured performance at runtime. It has a long, mostly *hidden* pedigree: Crash Bandicoot shipped invisible aid (extra checkpoints, slight slowdowns of hazards after repeated deaths — described in Naughty Dog's own retrospectives), and Resident Evil 4's internal rank system quietly scaled enemy aggression and drops with player performance. Players praised both games' "fair" difficulty without knowing why.

Design rules that fall out of the shipped examples:

- **Adjust inputs the player can't directly observe** (spawn tables, item drops, checkpoint density), not ones they can (a visible health bar that refills is noticed instantly).
- **Hysteresis, or it oscillates.** A DDA controller that reacts to every death/success whipsaws between states and becomes perceptible. Adjust on windows of evidence, with dead zones.
- **Never punish improvement mid-encounter.** Rubber-banding that visibly strengthens enemies as the player performs well reads as betrayal — the racing-genre lesson.
- **Failure-repetition triggers are the safest form:** aid that only ever activates after N consecutive failures, and only removes friction (more checkpoints, more resources), preserves both challenge and dignity.
- **DDA is not an accessibility strategy.** It helps the middle of the distribution; players excluded by execution demands need explicit options (below), not a hidden thumb on the scale.

---

## Assist Modes: The Celeste Model

Celeste — a deliberately hardcore precision platformer — shipped the genre's most-cited accessibility feature, and the design generalizes:

1. **The default experience is untouched.** Assist Mode is opt-in, opens with a short, respectful preamble stating the game's intended challenge, and never interrupts standard play.
2. **Orthogonal toggles, not one "easy mode."** Game speed (percentage), infinite stamina, extra/infinite dashes, invincibility, chapter skip — each addresses a *different* barrier, so players remove only the barrier that excludes them and keep every other part of the challenge.
3. **No penalties, no shaming.** Progress counts. The framing is "tune the experience," not "admit defeat."
4. **It's cheap to build if designed early.** Speed scaling, damage toggles, and resource multipliers are trivial engineering *if* the systems read tuning from data rather than hardcoding constants — and miserable to retrofit if not.

Maddy Thorson on letting go of tuned difficulty: "I spent many hours fine-tuning the difficulty of Celeste, so it's easy for me to feel precious about my designs. But ultimately, we want to empower the player and give them a good experience, and sometimes that means letting go." The Game Accessibility Guidelines site hosts a full Celeste assist-mode case study (free — see below).

Keep **challenge-intent settings** (Sekiro-style "the difficulty is the point" stances are a valid artistic choice) distinct from **access settings** (remapping, text size, photosensitivity) — the second category is never legitimately optional, whatever the artistic stance on the first.

---

## Accessibility as an Engineering Checklist

The canonical free resource: **Game Accessibility Guidelines** (gameaccessibilityguidelines.com) — a collaborative checklist by accessibility specialists including Ian Hamilton, tiered into basic/intermediate/advanced across motor, cognitive, vision, hearing, and speech. Microsoft's **Xbox Accessibility Guidelines** and AbleGamers' **APX** patterns are the other two free pillars. Most "basic" tier items are engineering decisions that cost near-zero early and are expensive late:

Red flags, in programmer terms:

- **Input bindings hardcoded** — no remapping path. The single highest-impact motor accessibility failure, and purely architectural.
- **Meaning carried by color alone** (red vs green wires, team colors) with no shape/pattern/label channel — excludes the ~8% of men with color vision deficiency.
- **Text rendered into bitmaps or sized in fixed pixels** — no scaling without re-authoring assets.
- **Timing windows expressed as magic-number frame counts** scattered through code — impossible to offer a global "input leniency" option later. Centralize them as tunable data.
- **Mash/hold requirements with no toggle alternative**, and simultaneous multi-button chords with no remap.
- **Audio-only critical cues** (off-screen attacks, timers) with no visual channel; dialogue without subtitles; subtitles without size options or speaker labels.
- **Uncontrolled flashing/strobing** — photosensitivity risk; a hard limit checked in the effects system, not a QA hope.
- **Cutscenes and tutorials unskippable / unrepeatable** — cognitive-access and replay failure in one.

Two facts worth internalizing: the CVAA (US law) already *requires* accessible communication features in games with chat; and every accessibility option has a large non-disabled audience (subtitles-on rates are famously majority-of-players). Access work is not niche work.

---

## Free Sources

- **Game Accessibility Guidelines** — gameaccessibilityguidelines.com, including the Celeste assist-mode case study.
- **Xbox Accessibility Guidelines** — Microsoft Learn, free, with per-guideline test steps.
- **AbleGamers APX** — Accessible Player Experiences design patterns.
- **Celeste's own Assist Mode** — study the preamble text and toggle taxonomy in-game; it's the reference implementation.
