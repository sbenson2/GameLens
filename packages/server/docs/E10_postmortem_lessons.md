# E10 — Shipping Lessons from Postmortems

> **Category:** Explanation · **Related:** [E6 Game Design Fundamentals](E6_game_design_fundamentals.md) · [E9 Solo Dev Playbook](../project-management/E9_solo_dev_playbook.md) · [P8 Pitfalls](../project-management/P8_pitfalls.md) · [P15 Postmortem Template](../project-management/P15_postmortem_template.md) · [R4 Game Design Resources](R4_game_design_resources.md)

---

Postmortems are game development's real literature — the place where shipped-game reality gets written down. This doc distills recurring lessons from the freely available postmortem canon (GDC's Classic Game Postmortem series, the Game Developer/Gamasutra archive, and modern indie postmortems like Slay the Spire and Into the Breach) into patterns a programmer can act on.

---

## Why Postmortems Beat Theory

Design books tell you what should work; postmortems tell you what happened. Three properties make them uniquely valuable:

- **They're adversarially honest.** The format demands a "what went wrong" section from people with no reason to lie anymore — the game already shipped.
- **They're specific.** Not "playtest early" but "we discovered our core loop wasn't fun in month 14 of 18."
- **They're free.** GDC's Classic Game Postmortem series (Pac-Man by Toru Iwatani, DOOM by John Romero, Prince of Persia by Jordan Mechner, Civilization by Sid Meier & Bruce Shelley, and dozens more) is on the free GDC Vault section and YouTube; the Game Developer (ex-Gamasutra) written postmortem archive — Deus Ex by Warren Spector, Diablo II by Erich Schaefer — is free to read; and the complete Game Developer magazine run (1994–2013), whose Postmortem column started the whole format, is free as PDFs on the GDC Vault (see [R5 Free Knowledge Sources](R5_free_knowledge_sources.md)).

Reading five postmortems in your genre before starting a project is the cheapest risk reduction available.

---

## Lesson: Instrument the Game from Day One

**Source: Anthony Giovannetti, "'Slay the Spire': Metrics Driven Design and Balance," GDC 2019 (free on YouTube).**

Mega Crit — a two-person team — balanced a card game with a combinatorial state space by logging structured run data from the earliest Early Access builds and letting the data argue with intuition:

- **Log runs as structured events, not analytics pageviews.** Card picked/skipped, floor reached, HP lost per fight, win rate per character. The schema is a design tool, not telemetry overhead.
- **Data finds what playtests can't.** Individual testers report feelings ("the Defect seems weak"); aggregated runs reveal facts (pick rates, win-rate deltas) across thousands of games — a sample no studio playtest lab can match.
- **Data informs, feel decides.** They deliberately shipped some "suboptimal by the numbers" cards because the cards created stories players loved. The metric proposes; the designer disposes.
- **Community balance discourse is a feature.** Engaging publicly with the player community's balance arguments during Early Access built trust and surfaced edge cases — but only worked because the devs had better data than the loudest forum voice.

Programmer translation: a `RunLog` events table costs a day to build in week one and is nearly impossible to retrofit meaningfully in year two — the historical baseline is gone.

---

## Lesson: Design by Subtraction Until the System Is Legible

**Source: Matthew Davis, "'Into the Breach' Design Postmortem," GDC 2019 (free GDC Vault section).**

Subset Games followed FTL by cutting toward clarity: a tiny 8×8 grid, few units, and — the defining decision — **showing the player exactly what the enemy will do next turn**. Perfect information turned a strategy game into a puzzle of consequences.

- **Small and finished beats large and vague.** Every system that survived had to justify itself against the clarity budget: if players couldn't predict its interaction with the grid at a glance, it got cut or simplified.
- **Cutting is slow, expensive work.** The postmortem's uncomfortable truth: a small polished game isn't a large game minus effort. Subset spent years *removing* systems that worked but muddied the core.
- **Player-visible determinism is a design asset.** Telegraphed attacks convert "the AI cheated" into "I made a bad trade." The same mechanic with hidden rolls would produce identical outcomes and furious players.

Programmer translation: legibility is an architectural property. If resolving a turn requires simulating hidden state the player can't inspect, the design has a trust bug, not a balance bug.

---

## Lesson: Difficulty Can Serve Aliveness, Not Punishment

**Source: Derek Yu, "One More Run: The Making of Spelunky 2," GDC 2021 (see [R4](R4_game_design_resources.md)).**

Yu's "spiky design": danger that feels like a property of a living world (shopkeepers with grudges, liquids that flow, chain-reaction traps) rather than a tuned gauntlet. The spikes create stories; stories create "one more run." The lesson generalizes: before raising a number to add difficulty, ask whether a *system interaction* could produce the challenge instead — it will be remembered better and blamed less.

---

## Patterns That Recur Across the Whole Canon

Read enough postmortems and the same items appear in "what went wrong" regardless of era, budget, or genre:

| Recurring pattern | The shipped-game evidence |
|-------------------|---------------------------|
| **The fun was found late** | Teams repeatedly report discovering the core loop 60–80% through the schedule. The mitigations that work: prototype the core verb first; greybox playtests before content production (see [E8 Level Design](E8_level_design.md)). |
| **Scope grew silently** | Almost no postmortem says "we planned too little." Features enter as "small additions" and exit as schedule slips. A written cut-list maintained from week one is the cheap defense. |
| **The last 10% took 40%** | Menus, save systems, options, edge cases, platform cert. Teams that shipped calm had a [P11-style polish checklist](../project-management/P11_polish_checklist.md) early; teams that crunched discovered the list in the final quarter. |
| **Playtesting was postponed to protect feelings** | "We knew it wasn't fun but kept polishing art" appears constantly. Watching a stranger play the ugly build is the correction (see [P4 Playtesting](../project-management/P4_playtesting.md)). |
| **Early Access / demos worked as design instruments** | Modern indie postmortems (Slay the Spire above; Supergiant's documented Hades process) treat public builds not as marketing but as the balance and iteration engine. The precondition is instrumentation (see above) — a public build without data collection is only marketing. |
| **The team survived on morale systems, not heroics** | Sustainable pace, visible progress rituals, and finishing *something* regularly appear in "what went right" as often as any design decision. |

---

## Run Your Own

The habit matters more than the reading: after every release, jam, or milestone, write the honest five-and-five. The repo ships a ready-made structure — [P15 Postmortem Template](../project-management/P15_postmortem_template.md). Future-you is the audience; write what you'd want to have known this time.
