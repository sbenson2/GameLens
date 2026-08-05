/**
 * The lens library — the game designer's judgment layer.
 *
 * Each lens distills one industry-proven design philosophy into a form an AI
 * coding assistant can apply while a programmer builds: the idea itself, the
 * questions a designer would ask right now, red flags phrased in code/backlog
 * terms, and concrete prescriptions. Provenance is real and attributed; the
 * distillations are original text.
 *
 * The "lens" framing (a named perspective you deliberately look through)
 * follows Jesse Schell's *The Art of Game Design: A Book of Lenses* — the
 * lenses here are not Schell's; each comes from its own primary source.
 */

export interface Lens {
  /** Stable kebab-case id, e.g. "game-feel" */
  id: string;
  name: string;
  oneLiner: string;
  /** Who/what this comes from — real, checkable sources */
  provenance: string;
  /** The philosophy distilled — written to be internalized, not summarized */
  philosophy: string;
  /** The questions a designer would ask about the current work */
  questions: string[];
  /** Warning signs, phrased in terms a programmer will recognize in their
   *  own codebase, backlog, or playtest notes */
  redFlags: string[];
  /** Concrete moves — what to actually do */
  prescriptions: string[];
  /** Development phases where this lens earns its keep */
  phases: Array<"prototype" | "production" | "polish" | "launch">;
  /** Matching vocabulary — lowercase; multi-word phrases match as substrings */
  keywords: string[];
  /** Source pointers for going deeper */
  furtherReading: string[];
}

export const LENSES: Lens[] = [
  {
    id: "find-the-fun",
    name: "Find the Fun First",
    oneLiner: "Prove the game is fun before you build the game.",
    provenance:
      "Mark Cerny's \"Method\" (D.I.C.E. Summit, 2002); Shigeru Miyamoto's find-the-fun prototyping; Will Wright's toys-before-games approach.",
    philosophy:
      "Cerny's Method draws one hard line through development: preproduction is not planning, it is *searching* — and it ends only when you have a publishable first playable, a slice so representative that a stranger can feel the finished game in it. Everything before that point is cheap, disposable exploration; everything after is expensive, schedulable execution. The failure mode it prevents is the most common one in game development: building production-quality systems around a core that was never proven fun. Fun is discovered, not specified — no GDD paragraph has ever been fun. The corollary for programmers: your architecture's job in preproduction is to be throwaway-fast, not correct. If the core loop isn't fun with placeholder art and hardcoded values, it will not become fun by adding systems on top.",
    questions: [
      "Can someone play the core loop *today*? If not, what is the smallest thing that would make that true this week?",
      "Have you felt the fun yourself, or are you trusting the design doc that it will emerge later?",
      "What is the riskiest unproven assumption in the design, and is the current work testing it or avoiding it?",
      "If a stranger played your current build for three minutes, would anything make them smile?",
      "Is this system you're building in service of a proven-fun core, or a bet that fun will show up?",
      "What would a 'first playable' actually contain for this game — and how far away is it?",
    ],
    redFlags: [
      "Weeks of commits on save systems, settings menus, inventory frameworks — and no playable core loop yet.",
      "The prototype is being built 'properly' (ECS, DI, editor tooling) instead of fast.",
      "You can't answer 'what's fun about this game' in one sentence without the word 'will'.",
      "Playtesting is scheduled for 'when there's more to show'.",
      "The core mechanic has never been tuned live — all values still at their first guess.",
    ],
    prescriptions: [
      "Build the ugliest possible version of the core mechanic — hardcoded values, primitive shapes, one screen — and play it today.",
      "Timebox prototypes in days, not weeks, and throw them away without guilt; the knowledge is the deliverable.",
      "Attack the riskiest assumption first (Cerny: preproduction exists to kill risk, not to plan).",
      "Expose tuning values (jump force, fire rate, speeds) to live editing before writing any other tooling.",
      "Declare preproduction over only when a vertical slice is genuinely fun — then, and only then, invest in architecture.",
    ],
    phases: ["prototype"],
    keywords: [
      "prototype", "new game", "starting", "core mechanic", "core loop", "is this fun",
      "not fun", "boring", "first playable", "vertical slice", "preproduction",
      "game idea", "concept", "mvp", "where to start", "architecture first",
    ],
    furtherReading: [
      "Mark Cerny — \"Method\" (D.I.C.E. Summit 2002 talk)",
      "GameLens docs: E6 — Game Design Fundamentals",
    ],
  },
  {
    id: "mda",
    name: "MDA — Design Backward from Feeling",
    oneLiner: "You build mechanics, players experience aesthetics — design from the feeling backward.",
    provenance:
      "Robin Hunicke, Marc LeBlanc, Robert Zubek — \"MDA: A Formal Approach to Game Design and Game Research\" (2004).",
    philosophy:
      "MDA names the pipeline between what you type and what players feel: Mechanics (rules and code) generate Dynamics (runtime behavior of players and systems) which produce Aesthetics (the emotional experience — the paper's word for kinds of fun: sensation, fantasy, narrative, challenge, fellowship, discovery, expression, submission). The designer's trap is working in the same direction as the compiler: mechanics-first, hoping feelings emerge. MDA says design in the player's direction: pick the target aesthetic, imagine the dynamics that produce it, then choose mechanics that create those dynamics. The framework's sharpest edge is diagnostic — when a game 'isn't working', locate the layer: the mechanic may be implemented perfectly while producing the wrong dynamic (campers, degenerate strategies, hoarded consumables) and therefore the wrong feeling.",
    questions: [
      "Which specific aesthetic is this feature serving — challenge, discovery, fantasy, fellowship, expression? Name it.",
      "What player behavior (dynamic) do you expect this mechanic to produce — and what degenerate behavior *could* it produce?",
      "If the target feeling is X, is this mechanic actually known to produce it, or does it just seem related?",
      "When a playtest 'felt wrong', which layer failed — the rule, the behavior it induced, or the feeling that resulted?",
      "What does the player *do* moment to moment because this system exists?",
    ],
    redFlags: [
      "Feature list has no corresponding feeling list — you can say what the game has, not what it evokes.",
      "A mechanic works exactly as coded but players use it in a way that kills the intended experience (hoarding, kiting, cheesing).",
      "Design conversations are entirely about content ('add dash, add crafting') and never about target emotion.",
      "You tune mechanics by intuition ping-pong instead of asking which dynamic is off.",
    ],
    prescriptions: [
      "Write the target aesthetics for your game as a ranked list of 2-3 feelings; tape it above the backlog — every feature must serve one.",
      "For each new mechanic, write one sentence: 'this rule should cause players to ___, which feels like ___'. If you can't, park it.",
      "Diagnose problems layer by layer: reproduce the bad dynamic, then change the smallest mechanic that shifts it.",
      "Playtest for feelings, not bugs: ask testers what they felt, watch what they did, and map both back to rules.",
    ],
    phases: ["prototype", "production", "polish"],
    keywords: [
      "mda", "aesthetics", "feeling", "emotion", "experience", "fun type", "why fun",
      "mechanic design", "dynamics", "player behavior", "degenerate", "exploit",
      "feature design", "what to add", "design framework", "kinds of fun",
    ],
    furtherReading: [
      "Hunicke, LeBlanc & Zubek — \"MDA: A Formal Approach to Game Design and Game Research\" (2004 paper, free online)",
      "Marc LeBlanc's 8 Kinds of Fun (8kindsoffun.com)",
    ],
  },
  {
    id: "interesting-decisions",
    name: "Interesting Decisions",
    oneLiner: "A game is a series of interesting decisions — audit yours for tradeoffs, tension, and consequence.",
    provenance:
      "Sid Meier's design maxim (elaborated in his GDC 2012 talk \"Interesting Decisions\"); dominant-strategy analysis from classic game design theory.",
    philosophy:
      "Meier's definition is a scalpel: strip the rendering, the story, the juice — is the player making decisions, and are they interesting? A decision is interesting when it offers real tradeoffs (each option gives up something), reflects the player's situation and style (the right answer differs by context), and carries consequence the player can anticipate but not fully compute. A decision dies three ways: a dominant strategy (one option is simply best — the others are noise), a blind gamble (no information to reason with), or irrelevance (the outcome doesn't matter). Most 'boring game' complaints are decision-quality problems wearing a content costume: adding more weapons does nothing if one is strictly best; adding more choices does nothing if they don't compete for the same scarce resource.",
    questions: [
      "What is the player actually deciding in this system — and would two skilled players ever choose differently?",
      "What does each option cost? If an option has no cost, why would anyone pick anything else?",
      "Can the player reason about the consequence, or is it a coin flip with extra steps?",
      "Is there a dominant strategy? Have you searched for one the way you'd search for a bug?",
      "How often does the player make a meaningful decision — every few seconds, once a minute, once a session?",
      "Does this new feature create a decision, or just a task?",
    ],
    redFlags: [
      "Telemetry or playtests show everyone picking the same option (build, weapon, route) — a dominant strategy is live.",
      "An upgrade system where every node is a pure stat increase — those are chores, not choices.",
      "Choices whose consequences the player cannot foresee at all — they'll decide randomly and disengage.",
      "'More content' is the standing answer to 'the game is boring'.",
      "Resources so abundant that spending decisions never compete (mana that never runs out, currency with nothing to buy).",
    ],
    prescriptions: [
      "For every choice surface, write the tradeoff sentence: 'A gives X at the cost of Y; B gives Y at the cost of X.' If you can't, redesign it.",
      "Hunt dominant strategies deliberately: play to break the game, ask testers to play 'optimally ugly', check what they never pick.",
      "Couple choices to a shared scarce resource (time, slots, currency, risk) so options genuinely compete.",
      "Prefer situational answers over universal ones: make the best option depend on state the player can read.",
      "Kill or merge decisions that don't matter — fewer, weightier choices beat many trivial ones.",
    ],
    phases: ["prototype", "production"],
    keywords: [
      "decision", "choice", "strategy", "balance", "dominant", "upgrade", "skill tree",
      "boring", "shallow", "depth", "meaningful", "tradeoff", "options", "loadout",
      "build variety", "everyone picks", "no reason to", "card", "deck", "strongest",
      "best option", "spam", "same build", "always use", "optimal", "obvious choice",
    ],
    furtherReading: [
      "Sid Meier — \"Interesting Decisions\" (GDC 2012 talk, free on GDC Vault)",
      "GameLens docs: E6 — Game Design Fundamentals",
    ],
  },
  {
    id: "game-feel",
    name: "Game Feel",
    oneLiner: "The tactile sensation of control — latency, response curves, and simulated physicality decide it.",
    provenance:
      "Steve Swink — *Game Feel: A Game Designer's Guide to Virtual Sensation* (2008).",
    philosophy:
      "Swink defines game feel as real-time control of virtual objects in a simulated space, amplified by polish. It lives in the first 100 milliseconds: input latency above ~100ms reads as 'floaty' or 'unresponsive' no matter what the animation looks like. Feel is authored in the response curves — how velocity ramps when a key is pressed, how it decays when released, how much mid-air control exists, what happens in the first three frames of a jump. These are programmer-owned numbers; feel is a programming discipline as much as a design one. The classic diagnosis chain: 'floaty' usually means slow acceleration, low gravity, or input-to-response delay; 'twitchy' means instant velocity with no ramp; 'heavy' can be intentional (Souls) or accidental (animation-gated input). Feel is also context: the same controller code feels different as camera, FOV, hitstop, and sound change around it.",
    questions: [
      "How many frames elapse between input and the first visible response? Have you actually measured it?",
      "Is the character's acceleration/deceleration authored (curves, ramp times) or emergent from whatever physics defaults you started with?",
      "What should this game's movement *feel* like in three adjectives — and do the numbers implement those adjectives?",
      "Can the player adjust their trajectory mid-air / mid-action, and is that a deliberate choice?",
      "Which of the current 'feel' complaints are latency, which are curves, and which are missing feedback (a different lens)?",
      "Are you tuning feel with live-editable values, or recompiling for every tweak?",
    ],
    redFlags: [
      "Input handled in a physics/fixed tick without interpolation — up to a full physics-step of added latency plus render misalignment.",
      "Movement constants named `speed` and `gravity` set once on day one and never revisited.",
      "Jump implemented as a single impulse with default gravity — no variable height, no rising/falling gravity split, no apex control.",
      "Animation events gate input response (the character can't act until the animation says so) in a game meant to feel snappy.",
      "'Feels floaty/sluggish/slippery' feedback dismissed as taste rather than traced to numbers.",
    ],
    prescriptions: [
      "Measure input-to-photon latency (screen recording, frame counting) before arguing about feel.",
      "Author jumps from designer intent: pick jump height and time-to-apex, derive gravity and initial velocity from them (g = 2h/t², v0 = 2h/t).",
      "Split gravity: heavier falling than rising; add apex hang; cut jump velocity on early release for variable height.",
      "Put every movement constant behind live tuning (hot-reload, debug sliders) and tune while playing, not from code.",
      "Steal shamelessly from the canon: coyote time (~5 frames), input buffering (~6-10 frames), instant turn-around — players read these as 'good controls', never as cheats.",
    ],
    phases: ["prototype", "production", "polish"],
    keywords: [
      "feel", "floaty", "sluggish", "unresponsive", "snappy", "movement", "controller",
      "character controller", "jump", "input", "latency", "physics", "acceleration",
      "friction", "responsive", "tight controls", "slippery", "heavy", "platformer",
    ],
    furtherReading: [
      "Steve Swink — *Game Feel* (2008)",
      "GameLens docs: C2 — Game Feel & Genre Design Craft",
    ],
  },
  {
    id: "juice",
    name: "Juice & Feedback",
    oneLiner: "Maximum output for every input — every player action deserves an acknowledgment.",
    provenance:
      "Martin Jonasson & Petri Purho — \"Juice it or lose it\" (2012 talk); Jan Willem Nijman (Vlambeer) — \"The art of screenshake\" (2013).",
    philosophy:
      "Juice is the principle that a single input should produce cascading, layered output: hit a block and it flashes, spawns particles, plays a pitched sound, nudges the camera, and bounces neighbors. Jonasson and Purho demonstrated it live: the same Breakout clone, mechanically identical, transforms from lifeless to delightful purely through feedback layers. Nijman's version is a checklist of cheap wins — hitstop, screenshake, muzzle flash, knockback, sound variation, permanence (casings, corpses, craters that stay). Two disciplines keep juice honest: proportionality (feedback scale must match event importance, or everything shouts and nothing lands) and the sober warning that juice amplifies a good mechanic but cannot rescue a bad one — if the unjuiced prototype isn't at least interesting, juice is makeup on a mannequin.",
    questions: [
      "For each core player action: what does the player see, hear, and feel at the moment it happens? List them — is any action silent?",
      "Does your biggest moment (boss kill, level clear) produce more feedback than your smallest (footstep, pickup)? By how much?",
      "Do repeated sounds vary (pitch/sample), or does the 400th coin sound identical to the first?",
      "What persists after the action — holes, casings, scorch marks — or does the world forget instantly?",
      "Is the mechanic under all this juice actually fun when the effects are turned off?",
    ],
    redFlags: [
      "Hits land with no hitstop, no flash, no sound — playtesters say combat 'lacks impact' and you've been tuning damage numbers.",
      "One global screenshake magnitude for everything from footsteps to explosions.",
      "Effects added as one-off hacks (a particle spawn hardcoded in the bullet class) instead of a reusable feedback layer (events → effect handlers).",
      "No hit flash because 'the shader system isn't built yet' — a white flash is ten lines.",
      "Juice work scheduled before the core loop is proven (see Find the Fun First).",
    ],
    prescriptions: [
      "Build the cheap seven first: hitstop (2-6 frames), hit flash, screenshake (scaled + clamped), knockback, particles, pitched sound variation (±10%), squash & stretch.",
      "Route feedback through events: gameplay code emits 'EnemyDied(at, size)', a juice layer decides effects — keeps mechanics testable and juice swappable.",
      "Make a feedback budget: rank events by importance, assign feedback intensity accordingly, and enforce the proportion.",
      "Add trauma-style screenshake (accumulate, decay, shake = trauma², use noise not random) instead of naive position jitter.",
      "Do a 'silent playthrough' audit: play with effects off; every action that feels dead gets an acknowledgment pass.",
    ],
    phases: ["production", "polish"],
    keywords: [
      "juice", "feedback", "impact", "punch", "satisfying", "screenshake", "hitstop",
      "particles", "polish", "flat", "lifeless", "boring combat", "lacks impact",
      "effects", "vfx", "sound effects", "camera shake", "flash",
    ],
    furtherReading: [
      "Jonasson & Purho — \"Juice it or lose it\" (2012, free online)",
      "Nijman — \"The art of screenshake\" (2013, free online)",
      "GameLens docs: C2 — Game Feel & Genre Design Craft",
    ],
  },
  {
    id: "flow-difficulty",
    name: "Flow & Difficulty",
    oneLiner: "Hold every player in the channel between anxiety and boredom — and let them tune the channel.",
    provenance:
      "Mihaly Csikszentmihalyi — *Flow* (1990); Jenova Chen's flow-in-games thesis (2006); Celeste's Assist Mode (Maddy Makes Games, 2018).",
    philosophy:
      "Flow is the absorbed state where challenge and skill rise together; too much challenge for the skill produces anxiety and quitting, too little produces boredom and quitting. Games fail flow in both directions, often simultaneously for different players — which is why one difficulty curve cannot serve everyone. The craft answers: a sawtooth curve (rising challenge with deliberate relief valleys — the post-boss breather, the reward room), skill gates that verify learning before escalating, and player-controlled valves. Celeste's Assist Mode is the modern reference: the game states its intended experience plainly, then hands players the dials (speed, stamina, invincibility) without shame, on the reasoning that the difficulty serves the experience, not the designer's ego. Flow also requires clear goals and immediate feedback — a player who can't tell whether they're progressing exits the channel regardless of balance.",
    questions: [
      "Where do players quit? Do you know (telemetry, playtests), or are you guessing?",
      "Does challenge relent anywhere on purpose, or does the curve only climb?",
      "When a player fails, do they know *why* — and does retrying cost seconds or minutes?",
      "What does a player who's stuck do — grind, lower difficulty, look up a guide, or leave?",
      "Which knobs could you hand players without breaking the experience you're protecting?",
      "Is early game teaching skills the late game actually tests?",
    ],
    redFlags: [
      "A difficulty spike where your own playtesting says 'this part is fine, they just need to git gud'.",
      "Death restarts far from the challenge — retry loop measured in minutes, learning loop broken.",
      "Difficulty settings that only multiply HP/damage — changes tedium, not challenge.",
      "No difficulty analytics at all: no death heatmap, no attempt counts, no completion funnel.",
      "The first hour is hardest (unforgiving tutorial-adjacent deaths) because the dev has 500 hours of skill.",
    ],
    prescriptions: [
      "Instrument deaths/failures per encounter now — a CSV log is enough; design against data, not memory.",
      "Shape a sawtooth: after each peak (boss, gauntlet), give a valley (reward, safe exploration, power moment).",
      "Make retry instant and information-rich: fast respawn at the challenge, failure that shows what to do differently.",
      "Add an assist/accessibility layer Celeste-style: state the intended experience, then give unashamed dials — reach without diluting.",
      "Playtest with genuinely new players regularly; your own difficulty perception is permanently miscalibrated.",
    ],
    phases: ["production", "polish", "launch"],
    keywords: [
      "difficulty", "too hard", "too easy", "flow", "balance", "curve", "spike",
      "players quit", "rage quit", "frustrating", "boring", "challenge", "assist",
      "accessibility", "checkpoint", "death", "punishing", "difficulty settings",
    ],
    furtherReading: [
      "Csikszentmihalyi — *Flow* (1990)",
      "Jenova Chen — \"Flow in Games\" (2006 thesis, free online)",
      "Celeste — Assist Mode design discussions (Maddy Makes Games, 2018)",
    ],
  },
  {
    id: "onboarding",
    name: "Invisible Onboarding",
    oneLiner: "Teach through play, one concept at a time — if players notice the tutorial, it failed.",
    provenance:
      "George Fan — \"How I Got My Mom to Play Through Plants vs. Zombies\" (GDC 2012); Nintendo's introduce→develop→twist level grammar.",
    philosophy:
      "Fan's rules from Plants vs. Zombies are the canonical onboarding playbook: blur the line between tutorial and game (players should be *playing* from second one), teach one thing at a time, let players learn by doing rather than reading, spread mechanics across the whole game instead of front-loading, and cut text ruthlessly (his working limit: ~8 words on screen). The deeper principle is trust in design over instruction: if a mechanic needs a paragraph, the level that introduces it is doing too little work. Nintendo's level grammar operationalizes this — introduce a mechanic in a safe context where experimentation can't fail badly, develop it through escalating use, then twist it in combination with known elements. Onboarding is also pacing: unlocking mechanics gradually isn't condescension, it's protecting early players from decision overload while giving progression its spine.",
    questions: [
      "Could a player who reads nothing reach minute ten? What exactly would stop them?",
      "How many new concepts does the first five minutes introduce? (Count honestly — controls, currencies, meters, menus all count.)",
      "Is each mechanic introduced in a context where failure is safe and the mechanic is the only way forward?",
      "How much tutorial text exists, and which sentences could a level redesign delete?",
      "Does anything interrupt play to explain (modal popups, forced tooltips), and what would teaching-by-level-design look like instead?",
      "When did you last watch a new player's first ten minutes without helping?",
    ],
    redFlags: [
      "The tutorial is a separate non-game sequence players endure before the game starts.",
      "Wall-of-text popups explaining systems the player hasn't touched yet.",
      "All mechanics available from minute one because 'players aren't stupid' — overload isn't an intelligence question.",
      "New players in playtests ask 'what am I supposed to do?' — goal clarity failed before mechanics did.",
      "The first level was built last-minute by the person who knows the game best (and therefore can't see it fresh).",
    ],
    prescriptions: [
      "Design introduction levels per mechanic: safe space to discover it, a beat that requires it, then combination with known mechanics (introduce → develop → twist).",
      "Run the 8-word audit: every tutorial string over ~8 words gets rewritten, replaced by level design, or cut.",
      "Gate complexity: unlock systems as prior ones are demonstrably used, not on a timer.",
      "Watch three fresh players play the opening, silently, and fix the first thing all three stumble on. Repeat.",
      "Make the first minute a real play moment — an action with feedback — before any menu, lore, or configuration.",
    ],
    phases: ["production", "polish", "launch"],
    keywords: [
      "tutorial", "onboarding", "teach", "learn", "first level", "new player",
      "confusing", "complexity", "overwhelming", "explain", "text", "popup",
      "players don't understand", "intro", "first minutes", "ftue",
    ],
    furtherReading: [
      "George Fan — \"How I Got My Mom to Play Through Plants vs. Zombies\" (GDC 2012, free on GDC Vault)",
      "GameLens docs: E8 — Level Design",
    ],
  },
  {
    id: "kishotenketsu",
    name: "Kishōtenketsu Level Design",
    oneLiner: "Introduce, develop, twist, conclude — structure levels as four-act statements about one idea.",
    provenance:
      "Koichi Hayashida on Super Mario 3D Land's level grammar (GDC 2012); the kishōtenketsu narrative structure from East Asian composition.",
    philosophy:
      "Nintendo's Mario teams structure levels on kishōtenketsu, a four-beat form: *ki* (introduce the level's one idea in safety), *shō* (develop it through escalating variations), *ten* (the twist — collide the idea with something that reframes it), *ketsu* (conclude with a confident final test and a satisfying close). The discipline underneath: each level is *about one thing*. A mechanic, a hazard, a combination — one. The twist beat is what separates memorable levels from filler; it's where the player's understanding gets stretched sideways (the moving platform now moves through walls; the light mechanic now attracts enemies). This structure also teaches without words — World 1-1 is the standing masterclass: the first Goomba's placement teaches walking, jumping, and death before any text could. For programmers, the lens reorients level work from 'arrange challenges' to 'compose an argument about a mechanic'.",
    questions: [
      "What is this level about — in one noun phrase? If the answer is a list, it's several levels wearing one trenchcoat.",
      "Where does the player meet the idea safely? Where does it escalate? Where does it twist? Where does it conclude?",
      "Does the twist beat exist at all, or does the level just repeat beat two louder?",
      "Could the level teach its idea with zero text if it had to?",
      "Does the finale demand fluency in the level's idea, and does the level end shortly after its best moment?",
    ],
    redFlags: [
      "Levels assembled as 'a bit of everything' difficulty gradients with no per-level identity.",
      "Mechanics introduced and never developed — used once, then abandoned (content masquerading as design).",
      "The hardest moment is the middle, and the ending is a flat walk to the exit.",
      "Level names in the editor are 'level_07', 'level_08' because there's nothing distinct to name.",
      "You can't storyboard the level's four beats on one index card.",
    ],
    prescriptions: [
      "Write each level's card first: IDEA / INTRODUCE / DEVELOP / TWIST / CONCLUDE — five lines before any editor time.",
      "Introduce new mechanics where failure can't kill (Mario shows the mechanic in open space before it guards a pit).",
      "Bank twist ideas: whenever a mechanic combination surprises *you* in testing, that's a *ten* beat — file it.",
      "Cut levels that are variations of another level's shō beat; ship fewer levels with clearer arguments.",
      "End levels one beat after their climax — linger and the statement blurs.",
    ],
    phases: ["production", "polish"],
    keywords: [
      "level design", "level structure", "levels", "stage", "pacing", "world design",
      "level ideas", "filler", "repetitive levels", "mario", "twist", "variety",
      "level editor", "campaign structure",
    ],
    furtherReading: [
      "Koichi Hayashida — Super Mario 3D Land level design talk (GDC 2012)",
      "Any close reading of Super Mario Bros. World 1-1 (widely analyzed, e.g. in Miyamoto/Tezuka interviews)",
    ],
  },
  {
    id: "core-loop",
    name: "Core Loop & Session Shape",
    oneLiner: "Name the 30-second loop, nest it in the session loop, and make every system feed one of them.",
    provenance:
      "Standard loop-analysis practice from systems design (loop diagrams via Machinations/Joris Dormans' *Game Mechanics: Advanced Game Design*, 2012) and free-to-play/roguelike session design craft.",
    philosophy:
      "Every game that holds attention has a loop hierarchy: a moment loop measured in seconds (aim-shoot-loot, jump-land-plan), a session loop measured in minutes (run, level, match — with a natural start and stop), and a meta loop across sessions (progression, unlocks, mastery). The lens asks you to *name* each loop, then audit two properties: closure (each loop pays off — action produces visible consequence that feeds the next iteration) and nesting (the moment loop's output is the session loop's input; the session's output feeds the meta). Systems that feed no loop are decoration with a maintenance bill. The loop lens also owns the ethical line: a loop can pull because mastery is deepening (Koster's learning) or because a variable-ratio reward schedule is exploiting habit machinery; the same diagram serves both, so the designer must decide which pull they're building and be honest about it.",
    questions: [
      "Describe your 30-second loop as verbs. Now the session loop. Now the meta loop. Can you?",
      "What does one iteration of the moment loop *pay* the player — information, resource, progress, spectacle?",
      "Where does a session naturally end? Is that a designed stopping point or an exhaustion point?",
      "Which current systems feed none of the loops? Why do they exist?",
      "Is the pull mastery (players get better) or schedule (players get fed)? Is that the pull you want?",
      "What breaks the loop — friction, load times, menus — between iterations?",
    ],
    redFlags: [
      "You can demo every system but can't state what the player does for 30 seconds on repeat.",
      "Sessions end when players are annoyed (long death runback, no save point) rather than satisfied.",
      "A meta-progression system bolted on because the genre has one, feeding nothing in moment-to-moment play.",
      "Loop iterations separated by dead time — 20-second respawns, unskippable transitions — in a game whose loop is 15 seconds.",
      "Engagement built on daily-login mechanics while the moment loop stays unfun (schedule pull compensating for mastery absence).",
    ],
    prescriptions: [
      "Draw the loop diagram — three nested circles, verbs on arrows — and pin it in the repo README; evaluate features by which arrow they strengthen.",
      "Time real loop iterations with a stopwatch, including menus and deaths; cut friction until the loop's rhythm is felt.",
      "Give sessions a shape: an opening beat, an arc, and a designed exit (run end, chapter close, 'good place to stop' save).",
      "For each meta system, trace the wire: what in-session action feeds it, and what does it feed back into sessions?",
      "If the loop only pulls via reward schedule, fix the loop before scaling content — schedule pull without mastery is churn with extra steps.",
    ],
    phases: ["prototype", "production"],
    keywords: [
      "loop", "core loop", "gameplay loop", "session", "retention", "progression",
      "meta", "unlock", "what do players do", "engagement", "roguelike run",
      "repetitive", "grind", "systems design", "economy design",
    ],
    furtherReading: [
      "Joris Dormans — *Game Mechanics: Advanced Game Design* (2012) and the Machinations framework",
      "GameLens docs: C1 — Genre Reference",
    ],
  },
  {
    id: "scope",
    name: "Scope & Finishing",
    oneLiner: "Cut to the core, finish small, ship — a finished small game beats an abandoned big one, every time.",
    provenance:
      "Derek Yu — \"Finishing a Game\" (2010 essay); vertical-slice and minimum-viable-fun practice from indie postmortem canon.",
    philosophy:
      "Yu's essay is the honest mirror for every programmer-designer: the graveyard of unfinished games isn't full of bad ideas, it's full of good ideas scoped for a team of twelve. His discipline: finishing is a skill you build by finishing — small, complete, shipped things — and the final 10% (menus, saves, edge cases, builds, store assets) is brutally underestimated, so everything before it must be smaller than feels right. The operational lens: identify the irreducible core — the one mechanic-and-loop the game cannot exist without — and treat everything else as staged, cuttable expansions. 'Would this game still be this game without X?' If yes, X goes below the line. Scope creep rarely announces itself; it arrives as reasonable-sounding two-week features, each defensible, collectively fatal. The counter is a visible cut list and the habit of shipping milestones that are *playable end to end*, however thin.",
    questions: [
      "What is the irreducible core — the one thing this game cannot lose and still be itself?",
      "What did you add to the design this month? What did you cut? (If the second list is empty, the first is the problem.)",
      "Can the game be played start to finish *today*, at any quality level?",
      "For the feature you're about to build: would you delay the release six weeks for it? Because that's often the real price.",
      "What does 'done' mean for this project, in one paragraph you've actually written down?",
      "Which current systems exist because a bigger game you admire has them?",
    ],
    redFlags: [
      "The design grows mid-implementation — every feature spawns two 'while I'm in here' siblings.",
      "No end-to-end playable build exists after months of work; everything is 80% done, nothing is done.",
      "The feature list contains systems from three different genres because each seemed essential.",
      "You estimate the remaining work as 'a few weeks' and have for several months.",
      "Menus, save/load, settings, and build pipeline are all deferred to 'the end' (they are the end — and they take longer than the game).",
    ],
    prescriptions: [
      "Write the one-sentence core; maintain a public cut list; move features below the line by default and promote them only with a reason.",
      "Ship a complete vertical slice early: title screen → play → win/lose → restart. Thin, but *whole*. Keep it whole forever after.",
      "Adopt Yu's arithmetic: whatever scope feels right, halve it, and expect the last 10% to take a third of the schedule.",
      "Timebox new-feature proposals against release cost, not implementation cost ('two days to build' usually means two weeks to finish).",
      "Finish something small this quarter even if it's not The Game — finishing is trained, not summoned.",
    ],
    phases: ["prototype", "production", "launch"],
    keywords: [
      "scope", "scope creep", "cut", "feature creep", "too big", "finish", "finishing",
      "ship", "release", "never done", "add a system", "crafting system", "should i add",
      "one more feature", "abandoned", "restart project", "new idea", "estimate",
    ],
    furtherReading: [
      "Derek Yu — \"Finishing a Game\" (2010, derekyu.com, free)",
      "GameLens docs: E10 — Shipping Lessons from Postmortems",
    ],
  },
  {
    id: "playtesting",
    name: "Playtest Reality",
    oneLiner: "Watch real players early and often — observed behavior outranks stated opinion, and both outrank your intuition.",
    provenance:
      "Valve's playtest-driven development culture (Half-Life and Portal postmortems); the RITE method — Medlock, Wixon et al., Microsoft Games User Research (2002).",
    philosophy:
      "Valve's rule of thumb from the Half-Life era: playtest constantly, and treat every stumble as the game's fault, not the player's. The postmortem canon is unambiguous — designs that survived contact with playtesters were rebuilt weekly, and the games are classics *because* of it. The method matters as much as the frequency: watch silently (helping contaminates the data), value what players *do* over what they *say* (opinions are polite; behavior is honest), and ask experience questions ('what was that like?') rather than leading ones ('was the boss too hard?'). RITE adds the iteration cadence: fix the biggest observed problem immediately, then test again with fresh players — five one-hour tests with fixes between beat fifty tests analyzed at the end. The lens's hardest truth for solo programmers: you are the least qualified playtester of your own game, permanently, and every week without external eyes is a week of building on guesses.",
    questions: [
      "When did someone outside the project last play the current build while you watched silently?",
      "What did the last three playtesters *do* that surprised you — and what did you change because of it?",
      "Are you asking players what they felt and watching what they did, or asking them to design the fix?",
      "What's the biggest known problem from the last test, and why is it still in the build for the next one?",
      "Do you have a repeatable test protocol (same intro script, same tasks, same questions), or is every session improvised?",
    ],
    redFlags: [
      "Months of development, zero external playtests — 'it's not ready to show' (it never will feel ready; test anyway).",
      "During tests you explain controls, hint at solutions, or apologize for rough edges — the data is now fiction.",
      "Feedback collected as feature requests ('add a map') and implemented verbatim instead of diagnosed ('players are lost — why?').",
      "Only friends who like you test, and only once — no fresh eyes, so onboarding problems are invisible.",
      "Test findings live in your memory, not a list ranked by observed frequency and severity.",
    ],
    prescriptions: [
      "Schedule a standing playtest rhythm now (weekly or biweekly), sized to your reality — even one fresh player beats zero.",
      "Run tests RITE-style: observe silently, note stumbles, fix the top problem immediately, retest with someone new.",
      "Script the session: consistent intro, no help unless truly stuck (note when), end with open questions — 'describe the game to a friend', 'when were you most/least engaged?'.",
      "Treat player suggestions as symptoms: log the request, diagnose the underlying failure, design your own fix.",
      "Instrument the build (deaths, time per section, quit points) so small test groups still produce trend data.",
    ],
    phases: ["prototype", "production", "polish", "launch"],
    keywords: [
      "playtest", "playtesting", "feedback", "testers", "players said", "watch players",
      "user testing", "iterate", "confusing", "validate", "is it good", "show my game",
      "demo feedback", "friends played",
    ],
    furtherReading: [
      "Medlock, Wixon et al. — \"Using the RITE Method to improve products\" (2002 paper)",
      "Valve — Half-Life and Portal development postmortems (GDC talks and interviews)",
    ],
  },
  {
    id: "player-motivation",
    name: "Player Motivation",
    oneLiner: "Autonomy, competence, relatedness — know which needs your game feeds and who it's for.",
    provenance:
      "Self-Determination Theory applied to games — Ryan, Rigby & Przybylski, \"The Motivational Pull of Video Games\" (2006); Richard Bartle's player types (1996); Quantic Foundry's Gamer Motivation Model (Yee, 2015+).",
    philosophy:
      "The durable finding across motivation research: games hold players when they satisfy basic psychological needs — *competence* (I'm getting visibly better; challenge meets skill), *autonomy* (my choices are mine; there's more than one way), and *relatedness* (I matter to others, human or believable NPC). Rewards layered on top of need-starvation produce the hollow compulsion players describe as 'I don't even know why I still play this' — and eventually churn. Bartle's achievers/explorers/socializers/killers began as MUD taxonomy and survives as a reminder that audiences are plural: the feature that thrills optimizers bores explorers. Quantic Foundry's empirical model (action, social, mastery, achievement, immersion, creativity) is the modern, data-backed version — useful as a positioning tool: pick the two or three motivations your game serves deeply, and stop guiltily bolting on features for the audiences you didn't choose.",
    questions: [
      "Which needs does your game feed — competence, autonomy, relatedness? Where, concretely, in the loop?",
      "Who is this game for, stated as motivations ('mastery + immersion players') rather than demographics?",
      "Where can a player express a choice that another player would make differently?",
      "Does visible skill growth exist — can players *feel* themselves improving, independent of stat inflation?",
      "Which features exist for an audience this game isn't actually for?",
    ],
    redFlags: [
      "Progression is entirely numeric (bigger numbers, same play) — competence theater without competence.",
      "One optimal path through everything — autonomy exists in the menu, not the play.",
      "Retention mechanics (dailies, streaks) added while the core need-satisfaction is unproven.",
      "The pitch says 'for everyone' — which is a positioning for no one.",
      "Feature debates that never mention the player type they serve.",
    ],
    prescriptions: [
      "Write the motivation profile: 'this game primarily serves ___ and ___; it deliberately does not serve ___.' Use it as a feature filter.",
      "Audit the loop for the three needs; where one is absent by design, be sure it's by design.",
      "Build competence visibility: replays of improvement, mastery challenges, skill-expressive mechanics — not just +5% items.",
      "Offer meaningful strategy/style alternatives (build variety, route choice, expression) where they serve your chosen motivations.",
      "When cutting features, cut the ones serving audiences outside the profile first — they cost focus twice.",
    ],
    phases: ["prototype", "production", "launch"],
    keywords: [
      "motivation", "audience", "player types", "who is this for", "retention",
      "engagement", "why play", "target player", "achievers", "explorers", "casual",
      "hardcore", "demographics", "positioning", "churn",
    ],
    furtherReading: [
      "Ryan, Rigby & Przybylski — \"The Motivational Pull of Video Games\" (2006)",
      "Quantic Foundry — Gamer Motivation Model (quanticfoundry.com, free profiles)",
      "Richard Bartle — \"Hearts, Clubs, Diamonds, Spades: Players Who Suit MUDs\" (1996)",
    ],
  },
  {
    id: "balance",
    name: "Balance & Economy",
    oneLiner: "Balance is cost curves and honest tradeoffs; economies are faucets and drains — do the bookkeeping.",
    provenance:
      "David Sirlin's balance writings (*Playing to Win*, 2005, and multiplayer balance essays); Ian Schreiber — \"Game Balance Concepts\" (2010 course; *Game Balance* with Brenda Romero, 2021); virtual-economy faucet/drain analysis.",
    philosophy:
      "Balance work is applied bookkeeping, not vibes. Schreiber's cost-curve method: everything has a cost (resources, time, risk, opportunity) and a benefit; plot them, and outliers above the curve are your overpowered options, below it your dead content. Sirlin's competitive lens adds the human layer: perfect numeric balance is neither achievable nor the goal — the goal is *viable diversity* (multiple defensible strategies) and counterplay (every strong option has an answer the opponent can execute). Asymmetric-but-fair beats symmetric-and-sterile. For economies, the model is faucets (sources injecting currency/resources) and drains (sinks removing them): when faucets outpace drains, inflation makes rewards meaningless; when drains dominate, scarcity curdles into frustration. Most 'endgame is pointless' complaints are faucet/drain imbalances, and they're findable with a spreadsheet before any player finds them for you.",
    questions: [
      "Do you have the spreadsheet — every option's cost and benefit in one table — or is balance living in your head?",
      "What are the faucets and drains for each resource, per hour of play? Which side is winning?",
      "For your strongest option: what's the counterplay, and can an average player actually execute it?",
      "Which options does nobody use? (Dead content is a balance bug with the same severity as overpowered content.)",
      "Are you balancing for perception too? (Players must *believe* it's fair — Sirlin: a balanced game that feels unfair plays as unfair.)",
      "What data do you have on actual pick/win/usage rates?",
    ],
    redFlags: [
      "Balance changes made one complaint at a time, each patch creating the next outlier — whack-a-mole without a curve.",
      "A currency players stop caring about mid-game (faucet won) or a grind wall players quit at (drain won).",
      "Every new item/unit must be stronger than the last to feel exciting — power creep as content strategy.",
      "No usage telemetry, so 'balanced' means 'nobody complained loudly this week'.",
      "One strategy wins every internal test and the plan is to buff everything else (the fix is usually to shave the outlier).",
    ],
    prescriptions: [
      "Build the cost-benefit table for one system this week; fit the curve; nerf above-curve, buff or rework below-curve.",
      "Map each economy: list faucets and drains with rates, simulate an hour/session/full run in a spreadsheet before tuning in-engine.",
      "Design counterplay explicitly: for each strong tool, name its answer and make sure the answer is learnable and available.",
      "Prefer small, frequent, explained tuning changes over rare sweeping ones; log every change and the reasoning.",
      "Instrument pick rates and win rates (even single-player: usage and completion) — balance against measured behavior.",
    ],
    phases: ["production", "polish", "launch"],
    keywords: [
      "balance", "overpowered", "op", "underpowered", "useless", "economy", "currency",
      "inflation", "grind", "power creep", "nerf", "buff", "meta", "pick rate",
      "stats", "damage numbers", "cost", "pricing items", "loot",
    ],
    furtherReading: [
      "Ian Schreiber — \"Game Balance Concepts\" (2010, free online course); Schreiber & Romero — *Game Balance* (2021)",
      "David Sirlin — *Playing to Win* (2005, free online) and balance essays (sirlin.net)",
    ],
  },
  {
    id: "theory-of-fun",
    name: "Fun Is Learning",
    oneLiner: "Fun is the feeling of mastering patterns — when learning stops, fun stops.",
    provenance:
      "Raph Koster — *A Theory of Fun for Game Design* (2004).",
    philosophy:
      "Koster's thesis: fun is the brain's reward for successful pattern-learning. A game is a pattern-delivery machine; play is practice; the grin is a mastery chemical. The model predicts both ways games die: when the pattern is fully mastered, the game becomes a chore (players 'solve' it and optimal play turns mechanical), and when the pattern is unreadable noise, players bounce off before learning starts. Design, in this lens, is the pacing of learnable depth — each session should teach something: a new pattern, a variation, a deeper read of a known system. It also reframes 'players are optimizing the fun out of my game': players *always* optimize; if the optimal path is boring, the boring path is what you built, and the fix is making the interesting play and the effective play the same play. Depth that keeps producing new patterns (chess, tetris) is what 'timeless' means mechanically.",
    questions: [
      "What is the player learning in minute 1? Minute 30? Hour 5? If the answers repeat, where does mastery go next?",
      "What does your game look like when 'solved' — and how far away is that for a dedicated player?",
      "Is the optimal strategy also the interesting one? Where do effectiveness and engagement diverge?",
      "Which systems have depth (patterns behind patterns) vs. complexity (more stuff, same patterns)?",
      "When playtesters got bored, had they mastered the pattern — or failed to find it?",
    ],
    redFlags: [
      "Mid-game content is the same pattern as early game with larger numbers — nothing new to learn, only more to repeat.",
      "Players discover one reliable tactic and the game never pressures them off it.",
      "'Depth' delivered as complexity: more systems, more currencies, more menus — none changing how existing patterns read.",
      "The skill ceiling is reachable in an afternoon and the content lasts forty hours.",
      "Boredom feedback answered with content volume instead of pattern variety.",
    ],
    prescriptions: [
      "Map the mastery curve: list what a player learns at each stage; fill the flat stretches with new patterns or retire them.",
      "Add pattern modifiers that force re-reads (new enemy mixes, rule twists, mutators) before adding parallel content.",
      "Align optimal with interesting: if the effective strategy is dull, tax it or empower the expressive alternatives until they compete.",
      "Design a visible mastery ladder — challenges that certify deeper reads of systems players think they know.",
      "Watch for 'solved' signals in tests (identical runs, autopilot play) and treat them as end-of-content markers, wherever they appear.",
    ],
    phases: ["prototype", "production", "polish"],
    keywords: [
      "fun", "boring", "gets old", "repetitive", "depth", "mastery", "learning",
      "skill ceiling", "solved", "optimal", "same thing", "stale", "variety",
      "content", "replayability", "longevity",
    ],
    furtherReading: [
      "Raph Koster — *A Theory of Fun for Game Design* (2004)",
      "Koster's follow-up talks: \"A Theory of Fun 10 Years Later\" (GDCNext 2013)",
    ],
  },
  {
    id: "emergence",
    name: "Emergence & Systemic Design",
    oneLiner: "Multiplicative systems beat additive content — build rules that interact, then let players surprise you.",
    provenance:
      "\"Breaking Conventions with The Legend of Zelda: Breath of the Wild\" — Fujibayashi, Dohta & Takizawa (GDC 2017); the immersive-sim tradition (Looking Glass, Warren Spector).",
    philosophy:
      "The BotW team's formulation: instead of adding content (which players consume linearly and forget), multiply systems — their 'chemistry engine' made fire, wind, electricity, metal, and wood into universal rules that every object obeys, so grass + fire + wind becomes a tactic no designer scripted. Multiplicative design means each new system doesn't add its content, it multiplies against every existing system. The immersive-sim lineage (Ultima Underworld through Deus Ex) states the same creed: simulate rules, not outcomes; when a player combines two systems and something *reasonable* happens, trust blooms — the game world becomes a place where thinking is rewarded. The costs are real and worth naming: systemic games are harder to balance and QA (the interaction space explodes), and emergence without readable rules is chaos. The discipline is small rule count, universal application, aggressive consistency: if fire burns wood, it burns *all* wood, including the bridge the designer needed.",
    questions: [
      "List your systems, then draw the interaction matrix — how many cells actually do something? How many could?",
      "When two systems touch, is the result simulated from rules or special-cased per pairing?",
      "Can players discover a tactic you never designed? Has a playtester ever surprised you? (If never, nothing emergent exists.)",
      "Are your rules universal — does fire burn *every* flammable thing — or do exceptions teach players not to experiment?",
      "Is this new feature a content addition (consumed once) or a system multiplication (combines with everything)?",
    ],
    redFlags: [
      "Interactions implemented as special cases per pair (`if (arrow && torch)`) — the combinatorial content is hand-authored, so it stops at what you typed.",
      "Player experiments fail silently: the 'obvious' combination (electricity + water) does nothing, teaching players to stop trying.",
      "Every encounter has one authored solution and the systems exist only to deliver it.",
      "Content treadmill: the roadmap is all new items/enemies/levels, none of which change how existing pieces interact.",
      "Systemic dreams in a game whose core fantasy needs authored set-pieces (emergence is a tool, not a religion — mismatch cuts both ways).",
    ],
    prescriptions: [
      "Choose a small set of universal properties (burnable, conductive, wet, metallic, heavy) and route interactions through them — tags + rules, not pair-wise ifs.",
      "Make every rule universal, then handle the fallout (yes, the player can burn the quest bridge; design for it) — exceptions are where trust dies.",
      "Before adding content, ask the multiplication question: what does this combine with? Prefer one new system that touches ten old ones over ten items that touch nothing.",
      "Feed emergent moments back: when testers discover a tactic, amplify it (make it visible, viable, teachable) rather than patching it out — unless it's degenerate (see Interesting Decisions).",
      "Budget QA for the interaction matrix explicitly; systemic bugs hide in the cells no one authored.",
    ],
    phases: ["prototype", "production"],
    keywords: [
      "emergence", "emergent", "systemic", "systems", "interaction", "simulation",
      "immersive sim", "sandbox", "physics interactions", "chemistry", "combine",
      "player creativity", "special case", "scripted", "set piece", "botw", "zelda",
    ],
    furtherReading: [
      "Fujibayashi, Dohta & Takizawa — \"Breaking Conventions with The Legend of Zelda: Breath of the Wild\" (GDC 2017, free on GDC Vault)",
      "Warren Spector — Deus Ex postmortem (GDC 2000 / Game Developer magazine)",
    ],
  },
];

// ---- Matching ----

export interface LensMatch {
  lens: Lens;
  score: number;
}

/** Tokenize a situation description for matching (lowercase words, len ≥ 3) */
function situationTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** Light word-form normalization so natural phrasing meets the keyword
 *  vocabulary: plurals, -ing/-ed, and adjective -y ("grindy" → "grind",
 *  "jumps" → "jump"). Applied identically to both sides of the match, so
 *  keywords written in any of these forms still align. */
function normalizeWord(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith("y")) w = w.slice(0, -1);
  return w;
}

/**
 * Match lenses to a described situation.
 *
 * Scoring is deliberately simple and deterministic: multi-word keyword
 * phrases that appear in the text score 3, single-word keywords score 1,
 * with a small bonus when the lens id/name itself is mentioned. The model
 * consuming this tool provides the semantic understanding; this just has
 * to surface the right 2-4 candidates with their full content.
 */
export function matchLenses(situation: string, limit: number = 3): LensMatch[] {
  const text = ` ${situation.toLowerCase().replace(/[^a-z0-9\s-]/g, " ")} `;
  const rawTokens = situationTokens(situation);
  const tokens = new Set(rawTokens);
  const normTokens = new Set(rawTokens.map(normalizeWord));

  const scored: LensMatch[] = [];
  for (const lens of LENSES) {
    let score = 0;
    for (const kw of lens.keywords) {
      if (kw.includes(" ")) {
        if (text.includes(` ${kw} `) || text.includes(kw)) score += 3;
      } else if (tokens.has(kw) || normTokens.has(normalizeWord(kw))) {
        score += 1;
      }
    }
    if (text.includes(lens.id.replace(/-/g, " ")) || text.includes(lens.id)) score += 4;
    if (text.includes(lens.name.toLowerCase())) score += 4;
    if (score > 0) scored.push({ lens, score });
  }

  scored.sort((a, b) => b.score - a.score || a.lens.id.localeCompare(b.lens.id));
  return scored.slice(0, limit);
}

/** Look up a lens by id or name, tolerating close misses */
export function findLens(nameOrId: string): Lens | null {
  const needle = nameOrId.trim().toLowerCase();
  const direct = LENSES.find(
    (l) => l.id === needle || l.name.toLowerCase() === needle
  );
  if (direct) return direct;

  // Substring convenience: "feel" → game-feel, "decisions" → interesting-decisions
  const contains = LENSES.filter(
    (l) => l.id.includes(needle) || l.name.toLowerCase().includes(needle)
  );
  if (contains.length === 1) return contains[0];

  return null;
}
