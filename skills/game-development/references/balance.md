# Balance: numbers, randomness, progression and economies

Read this when the question is about numbers: costs, stats, drop rates, level and XP curves, currencies and prices, win and pick rates, or a complaint that something is overpowered, useless, unfair, too random, grindy or pay-to-win. Difficulty curves and failure costs inside a level belong in [levels](levels.md), matchmaking in [multiplayer](multiplayer.md), and playtest and telemetry method in [evaluation](evaluation.md).

Balance serves the experience the developer wants. A single-player power fantasy, a roguelike, a family co-op game and a ranked ladder need different balance goals, so treat each heuristic here as a hypothesis to test in that game.

## Start from the intended experience

Schreiber and Romero describe two common meanings. A single-player game feels balanced when players are challenged at their current ability without sudden spikes. A competitive game is balanced when every player has a similar chance to win at the start, given equal skill [@schreiber2021-balance]. Schreiber also calls balance the appearance of fairness: perception counts as much as the numbers [@schreiber2016-balance-course].

| Intended experience | Balance goal | What sources report tolerating |
| --- | --- | --- |
| Competitive ladder or esport | Many viable picks, each with counterplay; skill decides matches, not the patch | Riot targets 50% champion win rates at every skill tier, but reads that number alongside other signals [@street2017-lol-balance] |
| Single-player roguelike | Every option has a place; no warping strategy that is both strong and easy to set up | Slay the Spire accepts rare, hard-to-assemble combos that make the player feel extremely powerful, since no opponent suffers [@giovannetti2019-slay-the-spire] |
| Single-player RPG | Choices that matter, flavour over parity | Darkest Dungeon left its 15 hero classes deliberately "spiky" and said strict parity mattered for a game like Hearthstone, not here [@sigman2016-darkest-dungeon] |
| Children and family co-op | Every character viable and fun; little PvP pressure | Skylanders ranked PvP lowest for its audience; children made up their own house rules [@gallerani2014-character-balance] |
| Narrative-heavy, low challenge | Pacing and clarity over parity | Schreiber and Romero note balance matters less in such games [@schreiber2021-balance] |

Perfect parity is not always the target. If every PvE option sits exactly on the cost curve, choices can feel meaningless. Options slightly off the curve give players a game of finding the best ones [@schreiber2021-balance].

**Check what the numbers teach.** Assume players will optimize, and that the most rewarded path will become the game. Rosewater's rule from Magic is to make the fun part also the correct strategy to win. The talk's example is an Unhinged mechanic whose winning strategy was to sit silently and not react [@rosewater2016-lessons]. Woodward describes an economy as one large incentive structure. On Albion Online the aim was to make the most enjoyable activities also the most rewarding [@woodward2017-albion]. Slay the Spire removed slow, grindy strategies that were optimal but boring, such as farming healing, and kept feel-good power spikes [@giovannetti2019-slay-the-spire].

## Methods: cost curves, counters and models

Schreiber lists four balance methods: designer intuition, playtesting, analytics and mathematical modelling [@schreiber2016-balance-course].

**Transitive objects (better costs more).** Build a cost curve in a spreadsheet. Use one row per object and one column per cost, drawback or benefit. A formula then reports how far each object sits from balanced and in which direction [@schreiber2016-balance-course]. For a conditional benefit ("only when enemies are clustered"), estimate how often it triggers and treat it as a probability. Tower defense is almost entirely this kind of situational value [@schreiber2016-balance-course; @schreiber2021-balance]. Anchor the model on one number, usually the win or loss stat, and derive the rest from it [@schreiber2021-balance].

**The curve is rarely a straight line.** Mayo's card-game analysis:

- Expensive cards must be more than proportionally stronger, because the game may end before they can be played and they are less flexible.
- Judge a card by its proportional distance above the curve. The same bonus matters far more on a cheap card than an expensive one.
- The resource system shapes the curve. Hearthstone's automatic mana means cheap cards must be relatively strong to be worth playing; in Magic, where mana grows more slowly, expensive cards must pay off more.
- Small integers are coarse knobs, because 1 to 2 doubles a value [@mayo2018-power-curve].

**Intransitive relationships (rock-paper-scissors, counters).** These have no single "best" object, only matchups. They can be modelled with payoff matrices, though real play drifts from the game-theoretic optimum [@schreiber2016-balance-course]. Jaffe treats a character matchup chart as its own game. Linear programming then gives the range of play rates each character could have in a stable expert metagame. That flags characters no strong community would play and characters that must dominate. In Super Smash Bros. Brawl data, Meta Knight had to be at least 55% of picks [@jaffe2015-metagame].

**Counterplay and skill tiers.** At Riot, a champion with a win rate near 55% was left alone. Players could counterpick it in champion select and avoid its spells in play [@street2017-lol-balance]. Power also shifts with skill. Execution-heavy abilities, interruptible channels, AI-controlled power (turrets, pets), short power windows and early snowballing all value differently at low and high tiers [@street2017-lol-balance].

**Try the price before the system.** Meier's first check for an uninteresting choice is plain balance. If nobody buys the 300-gold sword, try 200; if everyone carries one, try 500 [@meier2012-decisions].

**Simulate cheaply.** Run thousands of random trials in a spreadsheet or a short script (Monte Carlo) to estimate outcomes. It also checks hand-calculated odds [@schreiber2016-balance-course].

## Is it popular or overpowered?

A high pick rate alone does not show that an option is too strong. Check these explanations before tuning:

| Explanation | Evidence it applies | Source case |
| --- | --- | --- |
| Availability and timing | Obtained late, or only in easy states, so it co-occurs with wins | Slay the Spire's Madness card looked strong because players usually got it from an event just before the Act 3 boss [@giovannetti2019-slay-the-spire] |
| Encounter distribution | The content keeps rewarding one archetype | Skylanders matched how many encounters favoured each attack archetype to how many characters had it [@gallerani2014-character-balance] |
| Visibility of power | Big numbers and flashy effects read as strength | A large red "10" was read as more damage than a small "88". One child still judged Magna Charge more powerful after taking 36 s to clear an encounter that the same child had cleared in 20 s with another character [@gallerani2014-character-balance] |
| Feel-bad, not power | Complaints about how it feels to face it | Hearthstone's Mind Control was called the strongest card while its numbers were fine; its cost was raised to make it niche [@dodds2014-hearthstone] |
| Theme and appeal | Popular for looks, fantasy or identity | Riot does not nerf a champion for play rate driven by theme; aesthetics dominate Skylanders' first picks [@street2017-lol-balance; @gallerani2014-character-balance] |
| Learning cost and sample | Win rate low at first and rising with games played; tiny samples | Riot reads win rate by games played on the champion, by tier and by sample size [@street2017-lol-balance] |
| Frequency frustration | Complaints track how often players face it, not its win rate | In PlayStation All-Stars, the characters called overpowered had middling win rates but the highest play rates [@jaffe2015-metagame] |
| Genuinely too strong | Wins with equal resources across segments, and alternatives stop being picked | Brawl's Meta Knight [@jaffe2015-metagame]; Darkest Dungeon's focus-the-front-rank strategy [@sigman2016-darkest-dungeon] |

Riot also reports champions, such as Yasuo, whose win rates are fair but whom many players find frustrating [@street2017-lol-balance]. Number tuning alone is unlikely to fix that.

## Worked example: everyone builds the same tower

The following steps are this skill's synthesis of the sources cited above.

1. **Restate the intent.** For example: "Waves should reward mixing tower types, and there should be more than one winning build."
2. **Measure before tuning.** Log each placement with wave number, cost, damage dealt, the enemy types it hit and whether the wave was cleared. Compare cost-equal alternatives against the same waves. Split results by player experience, and do not let a few heavy players dominate the averages [@giovannetti2019-slay-the-spire].
3. **Rank the hypotheses** from the table above:
   - The tower sits above the cost curve, so it is a price problem [@meier2012-decisions].
   - Every wave has the same enemy mix, so its situational advantage always triggers [@schreiber2016-balance-course; @gallerani2014-character-balance].
   - Alternatives are hard to read or show weak feedback, so they seem weaker than they are [@gallerani2014-character-balance].
   - It is simply the most fun or best-looking, which is not a problem if others remain viable [@street2017-lol-balance].
4. **Make the smallest change that tests one hypothesis.** Options are a price or stat change, one wave where an existing alternative has a readable advantage, or clearer feedback for the alternative. Gallerani suggests effects, sound and screen shake for options perceived as weak [@gallerani2014-character-balance]. Hold off on a new elemental or counter system until the simple changes fail.
5. **Check the result.** Did alternatives gain use without the old favourite becoming useless? Did clear rates stay on target? Can players say why they chose what they chose?

## Randomness and perceived fairness

**Where the randomness sits.** Engelstein separates two kinds:

- Input randomness randomizes the situation before the player decides, as in a dealt hand or Into the Breach's telegraphed enemy attacks.
- Output randomness decides the result after the choice, as in a Risk dice roll.

As broad tendencies, input randomness feels strategic and rewards skill; output randomness feels tactical and shortens planning. Many small rolls average out [@engelstein2018-randomness]. Output randomness adds excitement and is prominent in gambling games [@schreiber2021-balance]. On Slay the Spire, early enemies with random movesets felt too random on top of the card draw, and the team replaced them with visible intents [@giovannetti2019-slay-the-spire].

**Players are not statisticians.** Tversky and Kahneman found that even trained researchers expect a small random sample to look like the population it came from [@tversky1971-small-numbers]. Meier's team met this in Civilization Revolution:

- Players shown 3:1 odds felt cheated when they lost. Around 3:1 to 4:1 they expected to win every time.
- They treated 20 against 10 as better odds than 2:1.
- Losing two 2:1 battles in a row felt rigged, so later rolls took earlier results into account [@meier2010-psychology].

Large random events such as natural disasters prompted the most paranoid explanation available [@meier2010-psychology]. Players accept random rewards more readily than random setbacks [@schreiber2021-balance]. After players raged at a random event that knocked a trinket out of the party's pack, Darkest Dungeon's team adopted a rule: punish hard, but never take things away arbitrarily at random [@sigman2016-darkest-dungeon].

**Tools for controlling streaks**, from Pierce:

- **Bagging:** shuffle a set and draw without replacement. It still allows a doubled run where one bag ends and the next begins.
- **Pity timers:** raise a rare item's weight after each miss, then reset it.
- **Weighted, nested loot tables:** they can express dice, decks and pity timers, and keep drop rules easy to change.

Pierce also warns that any possible random edge case will eventually reach a live player [@pierce2017-rng]. Lewis-Evans cites Destiny's streak bonus, which raised loot odds over consecutive runs. As Lewis-Evans understood it, Bungie changed engram colours to show the minimum possible reward instead of the maximum, without changing drop tables [@lewisevans2017-rewards].

**Decide how honest to be.** Schreiber raises the ethical question of fudging rolls to match players' intuitions [@schreiber2016-balance-course]. On Skylanders, a hidden PvP handicap was noticed and read as cheating, so the team exposed it as a toggle [@gallerani2014-character-balance]. Lewis-Evans calls silently raising odds after a purchase "perhaps a dark pattern", and warns that optimizing players will work out the base rates, so decide now how you will feel when they do [@lewisevans2017-rewards].

**Randomness serves some players and not others:**

- Rosewater's coin-flip card satisfied neither thrill-seekers nor competitive players. The lesson Rosewater draws is to design each component for the audience it is meant for [@rosewater2016-lessons].
- In Yin and Xiao's interviews with 14 players, a common view was that random rewards kept games fresh. Many welcomed luck levelling out skill in casual play but saw it as less welcome in competitive settings [@yin2022-random-rewards].
- Skylanders avoided chance-based enemy blocks, because young children could learn a fixed rule but only button-mashed against a percentage [@gallerani2014-character-balance].

**Implementation traps.** Reloading to reroll removes risk. Civilization Revolution stored the random seed in the save file [@meier2010-psychology]. In online games, pseudorandom numbers generated on each client can disagree and desync [@schreiber2021-balance].

## Progression and reward pacing

Progression trades a resource, usually time, for power or access. Compare the player's power curve against the opposition's curve, not either one alone [@schreiber2021-balance]. Schreiber notes that when both grow polynomially, the relationship between them can end up linear [@schreiber2016-balance-course].

**Keep power gaps deliberate:**

- **Albion Online:** equipment power rises about 1.2x per tier, so tier 8 gear is roughly twice as strong as tier 4, while resource rarity triples per tier. Newer players stay competitive and top-end gear works as a wealth sink [@woodward2017-albion].
- **Skylanders:** enemy health varied only about 200% from first level to last, so a freshly placed low-level character stayed useful. Harder difficulties raised enemy damage instead. A +20% damage bonus that did not cut the number of hits to kill did not feel stronger [@gallerani2014-character-balance].
- **Ghost of Tsushima:** RPG level scaling turned enemies into "sword sponges". The team kept hits-to-kill in short bands and raised enemy damage and aggression, not health, on harder difficulties. Region gating capped the worst case, and bands were checked against linear, average and completionist player models [@fishman2021-ghost-lethality].

**Reward schedules shape behaviour.** Lewis-Evans summarizes the classic patterns:

- Fixed ratio: a pause after each reward.
- Fixed interval: appointment play.
- Variable ratio: high, steady effort, the pattern gambling uses.
- Variable interval: players wait around for events.

Rewards are feedback. Long goals need visible progress along the way, and a hard fight followed by nothing breaks the expectation that effort pays [@lewisevans2017-rewards].

**Grind.** Woodward defines grind as activity that is rewarded but no longer intrinsically engaging, such as killing the millionth wolf because wolves are the most efficient source of experience [@woodward2017-albion]. Zagal and colleagues class grinding as a dark pattern when players cannot judge how much time the game will demand, and playing by appointment as one when progress depends on keeping the game's schedule [@zagal2013-dark-patterns]. One of Yin and Xiao's interviewees preferred a deterministic grind to waiting on a random drop [@yin2022-random-rewards]. On Darkest Dungeon, losing a whole veteran party made some players quit, so catch-up options were added [@sigman2016-darkest-dungeon].

Schreiber and Romero report that players tend to perceive difficulty as higher than it is and mastery as further away than it is [@schreiber2021-balance]. Budget progression against a real playthrough. Skylanders sized XP and gold so the main path alone maxed out the starter characters [@gallerani2014-character-balance]. Keep a long-term goal in reserve: Woodward recalls that many EVE players who built the largest ship then unsubscribed [@woodward2017-albion].

## Economies: sources, sinks and currencies

**Map every source (faucet) and sink.** NetEase monitors each currency's daily issuance, collection and outstanding stock, broken down by source and sink. It also tracks the exchange rate between paid and earned currency and the prices of key items. Liu and Ying list five common causes of inflation:

- too much currency issued;
- too few key items produced;
- a shrinking player base, including the players who farm;
- market manipulation by organized traders;
- "sleeping money" released when lapsed players return [@liu2020-inflation].

Lehdonvirta surveys six currency sinks and eleven item sinks, and argues that players accept some more readily than others, for behavioural-economic reasons [@lehdonvirta2014-sinks].

**Design structure drives outcomes:**

- In transaction data from a large commercial virtual world, macroeconomic aggregates moved as real-world theory predicts. A new server with the same rules quickly reproduced the old servers' aggregates [@castronova2009-macroeconomic].
- In player-driven markets, prices converge quickly on what supply and demand predict [@schreiber2021-balance].
- Albion's salvage and transmutation conversions set a price floor and ceiling for resources [@woodward2017-albion].
- Loot tables are economy inputs. Pierce reweights drops by class popularity when one class's legendary drops fetch far more at auction than another's [@pierce2017-rng].

**Currencies.** A currency lets players time-shift trades that barter would block [@woodward2017-albion]. Each extra currency layer is another place prices can hide. Players report multiple premium currencies as obscuring real cost, and currency bundle sizes as set to leave them short and push further spending [@petrovskaya2021-predatory-monetisation]. On EVE, Woodward reports that money supply grew while market prices stayed fairly flat. Woodward reads this as rich players treating their wallets as a high score, and notes that the data were two years old [@woodward2017-albion].

**Engineering hygiene.** Export spreadsheet values to the game automatically; hand entry lets a single typo break an economy. Expect players to solve a simple economy and post the answer, and keep price-bounding mechanisms for when the model is wrong [@woodward2017-albion].

## Telemetry: what the numbers can and cannot tell you

- **Confounds.** Slay the Spire's Madness card won because of when it was obtained, not because of what it did. Two heavy testers skewed the averages. Ascension levels let data be split by skill [@giovannetti2019-slay-the-spire]. Correlation is easy to misread as cause [@schreiber2021-balance].
- **Segments and samples.** Riot reads win rate by tier, by games played on the champion and by sample size, and a champion that looked collapsing at high tier turned out to be barely played there. The team relies on designers' judgment rather than machine learning [@street2017-lol-balance].
- **Stable versus volatile signals.** After a patch, PlayStation All-Stars play rates swung from week to week while win rates held [@jaffe2015-metagame].
- **Plan the question first.** Write down the question, the data that would answer it, and what a positive or negative result would look like [@schreiber2016-balance-course]. Analytics is good at finding objects that are never used or always used [@schreiber2021-balance].
- **Models over hill-climbing.** Woodward uses metrics to refine a causal model of the economy, and warns that blindly optimizing one metric can overshoot the peak [@woodward2017-albion].
- **What dashboards miss.** On War Robots, retention and conversion stayed healthy while ratings, community trust and team morale fell [@krasilnikov2019-gacha]. Riot found betas poor for balance testing, and warns that high-skill testers propose fixes for their own tier [@street2017-lol-balance]. Rosewater's lesson is that players are good at recognizing problems and poor at solving them [@rosewater2016-lessons].

## Lessons from card games

Rosewater's lessons from twenty years of Magic that bear on balance [@rosewater2016-lessons]:

- **Interesting is not the same as fun.** A mechanic that paid players to discard their hand was clever on paper, but players did not want to throw away their cards.
- **Be blunt when players miss a strong play.** Testers would not attack with a powerful creature for fear of losing it, so a common version had to attack every turn.
- **Prefer strong reactions to mild approval.** In internal polls, Magic's designers prefer a card rated half very low and half very high to one rated 7 out of 10 by everyone.
- **Design for a specific audience** (the coin-flip card above).

Other card-game practice:

- **Emotional balance.** Hearthstone left out discard and counterspell effects because facing them felt powerless. It targeted one-turn-kill decks because opponents got no "little victories" before losing [@dodds2014-hearthstone].
- **Power creep and rotation.** Mayo treats occasional power creep and format rotation as normal, and argues that a team that never has to pull a card back is probably not pushing hard enough [@mayo2018-power-curve].

## Monetization ethics and manipulative design

**Definitions.**

- King and Delfabbro define predatory monetization as purchasing systems that disguise or withhold the long-term cost until players are already financially and psychologically committed [@king2018-predatory-monetization].
- Zagal and colleagues define a dark pattern as design intended to cause negative experiences that are against players' interests and happen without their consent. They separate this from honest mistakes and from hardship players choose [@zagal2013-dark-patterns].

**Evidence, with its limits:**

- **Loot boxes and problem gambling.** In a self-selected survey of 7,422 adult gamers recruited via Reddit, loot box spending was linked to problem gambling severity (eta squared 0.054). The link was much weaker for other microtransactions (0.004). The design is correlational and cannot say which causes which [@zendle2018-loot-boxes].
- **What players call unfair.** Asked for such transactions, 1,104 players described 35 techniques. Examples: pay or grind, pay or wait, paid items weakened after sale (the "nerf cycle"), in-game currency hiding real prices, unfair matchups against payers, and pay-to-win. These are perceptions, not verified mechanisms [@petrovskaya2021-predatory-monetisation].
- **Patented systems.** Thirteen monetization patents describe matching novices against players who own purchasable items, personal prices and offers from behavioural data, and drop rates tuned by past spending. Patents show intent, not deployment [@king2019-unfair-play].
- **Pity systems.** In Yin and Xiao's interviews, players valued pity systems as guarantees but also saw them as a push to keep paying. They also noticed near-miss presentations [@yin2022-random-rewards].

**Practitioner accounts:**

- On War Robots, Krasilnikov describes gacha as a way to sell content indirectly and hide its real price. Revenue rose two to three times, but ratings fell, developers were attacked online, and production slowed [@krasilnikov2019-gacha].
- Schreiber and Romero describe free-to-play games that "ramp the player out", sharply raising difficulty at a set point so that only paying players keep up [@schreiber2021-balance].
- Sanusi catalogues UX-level examples: ad close buttons that open the store, default-highlighted expensive bundles, and guilt-tripping notifications [@sanusi2017-dark-patterns].

**Questions to ask of any spending feature.** The first two adapt Zagal and colleagues' guiding questions [@zagal2013-dark-patterns]; the rest are this skill's additions drawn from the sources above.

- Can players tell what they will get and what reaching their goal will cost in time and money?
- Is anyone likely to lose track of spending or regret it?
- Is difficulty, scarcity or grind tuned to create the need the purchase removes?
- Does paying change competitive outcomes against people who did not pay?
- Could a child or a person with gambling problems reach it?

Where rules on paid random items apply, they are a legal matter to check for each platform and region, outside this file.

## Live tuning

- **Set expectations, then iterate.** Slay the Spire's weekly Early Access patches were accepted because change was expected. A daily beta branch took the rough builds [@giovannetti2019-slay-the-spire].
- **Big mechanical changes need a runway.** Darkest Dungeon fixed a dominant strategy by leaving corpses in place. The patch set off a severe backlash and a wave of negative reviews. The team's lessons were to warn players first, try big changes on a beta branch, offer toggles and staff community management [@sigman2016-darkest-dungeon].
- **Cadence and communication.** Riot groups disruptive system changes into preseason and midseason and explains them. Repeated nerfs to the same champion feel bad, and nerfing is easier than buffing. Street also advises sometimes waiting, because a community can take a while to find a counter to a dominant strategy [@street2017-lol-balance].
- **Paid items.** Players in Petrovskaya and Zendle's survey read the weakening of items after sale as a deliberate cycle to sell the next one [@petrovskaya2021-predatory-monetisation].
- **Tuning the feeling.** Hearthstone changed a card's cost to reduce how often players faced it, even though its power was fine [@dodds2014-hearthstone].

## Before recommending a change

- State the experience goal and the player segment the change is for.
- Name the hypothesis: price, encounter mix, visibility, learning cost, theme, or genuine strength.
- Check the data for timing confounds, heavy-player skew, sample size and skill tier.
- Prefer the smallest change that tests one hypothesis, then define what result would confirm or refute it.
- For anything involving money or random rewards, answer the questions in the monetization section before shipping.

## Sources

- `schreiber2021-balance` Ian Schreiber and Brenda Romero (2021). Game Balance. CRC Press. https://doi.org/10.1201/9781315156422 (book)
- `schreiber2016-balance-course` Ian Schreiber (2016). A Course About Game Balance. Game Developers Conference 2016. https://gdcvault.com/play/1023032/A-Course-About-Game (GDC talk)
- `street2017-lol-balance` Greg Street (2017). Balancing 'League of Legends' for Every Player, from Bronze to Bengi. Game Developers Conference 2017. https://gdcvault.com/play/1024237/Balancing-League-of-Legends-for (GDC talk)
- `giovannetti2019-slay-the-spire` Anthony Giovannetti (2019). 'Slay the Spire': Metrics Driven Design and Balance. Game Developers Conference 2019. https://gdcvault.com/play/1025731/-Slay-the-Spire-Metrics (GDC talk)
- `sigman2016-darkest-dungeon` Tyler Sigman (2016). Darkest Dungeon: A Design Postmortem. Game Developers Conference 2016. https://gdcvault.com/play/1023089/Darkest-Dungeon-A-Design (GDC talk)
- `gallerani2014-character-balance` Robert Gallerani (2014). Character Balance: More than the Numbers. Game Developers Conference 2014. https://gdcvault.com/play/1020431/Character-Balance-More-than-the (GDC talk)
- `rosewater2016-lessons` Mark Rosewater (2016). Twenty Years, Twenty Lessons. Game Developers Conference 2016. https://gdcvault.com/play/1022941/Twenty-Years-Twenty (GDC talk)
- `woodward2017-albion` Matt Woodward (2017). Balancing the Economy for 'Albion Online'. Game Developers Conference 2017. https://gdcvault.com/play/1024070/Balancing-the-Economy-for-Albion (GDC talk)
- `mayo2018-power-curve` Dylan Mayo (2018). Board Game Design Day: Balancing Mechanics for Your Card Game's Unique "Power Curve". Game Developers Conference 2018. https://gdcvault.com/play/1024913/Board-Game-Design-Day-Balancing (GDC talk)
- `jaffe2015-metagame` Alexander Jaffe (2015). Metagame Balance. Game Developers Conference 2015. https://gdcvault.com/play/1022155/Metagame (GDC talk)
- `meier2012-decisions` Sid Meier (2012). Interesting Decisions. Game Developers Conference 2012. https://gdcvault.com/play/1015756/Interesting (GDC talk)
- `dodds2014-hearthstone` Eric Dodds (2014). Hearthstone: 10 Bits of Design Wisdom. Game Developers Conference 2014. https://gdcvault.com/play/1020775/Hearthstone-10-Bits-of-Design (GDC talk)
- `engelstein2018-randomness` Geoff Engelstein (2018). Board Game Design Day: White, Brown, and Pink: The Flavors of Tabletop Game Randomness. Game Developers Conference 2018. https://gdcvault.com/play/1024920/Board-Game-Design-Day-White (GDC talk)
- `tversky1971-small-numbers` Amos Tversky and Daniel Kahneman (1971). Belief in the law of small numbers. Psychological Bulletin. https://doi.org/10.1037/h0031322 (peer-reviewed)
- `meier2010-psychology` Sid Meier (2010). The Psychology of Game Design (Everything You Know Is Wrong). Game Developers Conference 2010. https://gdcvault.com/play/1012186/The-Psychology-of-Game-Design (GDC talk)
- `pierce2017-rng` Shay Pierce (2017). Math for Game Programmers: Dark Secrets of the RNG. Game Developers Conference 2017. https://gdcvault.com/play/1024367/Math-for-Game-Programmers-Dark (GDC talk)
- `lewisevans2017-rewards` Ben Lewis-Evans (2017). Throwing Out the Dopamine Shots: Reward Psychology Without the Neurotrash. Game Developers Conference 2017. https://gdcvault.com/play/1024181/Throwing-Out-the-Dopamine-Shots (GDC talk)
- `yin2022-random-rewards` Michael Yin and Robert Xiao (2022). The Reward for Luck: Understanding the Effect of Random Reward Mechanisms in Video Games on Player Experience. CHI Conference on Human Factors in Computing Systems (CHI '22). https://doi.org/10.1145/3491102.3517642 (peer-reviewed)
- `fishman2021-ghost-lethality` Theodore Fishman (2021). Honoring the Blade: Lethality and Combat Balance in 'Ghost of Tsushima'. Game Developers Conference 2021. https://gdcvault.com/play/1027076/Honoring-the-Blade-Lethality-and (GDC talk)
- `zagal2013-dark-patterns` José P. Zagal et al. (2013). Dark Patterns in the Design of Games. Proceedings of the 8th International Conference on the Foundations of Digital Games (FDG 2013). https://dblp.org/rec/conf/fdg/ZagalBL13.html (peer-reviewed)
- `liu2020-inflation` Yongcheng Liu and Qinfang Ying (2020). How to Restrain Inflation in Game? Monitoring and Alerting of Economic System. Game Developers Conference 2020. https://gdcvault.com/play/1026913/How-to-Restrain-Inflation-in (GDC talk)
- `lehdonvirta2014-sinks` Vili Lehdonvirta (2014). Economic Balancing and Improved Monetization Through Clever Sink Design. Game Developers Conference 2014. https://gdcvault.com/play/1020085/Economic-Balancing-and-Improved-Monetization (GDC talk)
- `castronova2009-macroeconomic` Edward Castronova et al. (2009). As real as real? Macroeconomic behavior in a large-scale virtual world. New Media & Society. https://doi.org/10.1177/1461444809105346 (peer-reviewed)
- `petrovskaya2021-predatory-monetisation` Elena Petrovskaya and David Zendle (2021). Predatory Monetisation? A Categorisation of Unfair, Misleading and Aggressive Monetisation Techniques in Digital Games from the Player Perspective. Journal of Business Ethics. https://doi.org/10.1007/s10551-021-04970-6 (peer-reviewed)
- `krasilnikov2019-gacha` Vladimir Krasilnikov (2019). Monetization Design: The Dark Side of Gacha. Game Developers Conference 2019. https://gdcvault.com/play/1025720/Monetization-Design-The-Dark-Side (GDC talk)
- `king2018-predatory-monetization` Daniel L. King and Paul H. Delfabbro (2018). Predatory monetization schemes in video games (e.g. 'loot boxes') and internet gaming disorder. Addiction. https://doi.org/10.1111/add.14286 (peer-reviewed)
- `zendle2018-loot-boxes` David Zendle and Paul Cairns (2018). Video game loot boxes are linked to problem gambling: Results of a large-scale survey. PLOS ONE. https://doi.org/10.1371/journal.pone.0206767 (peer-reviewed)
- `king2019-unfair-play` Daniel L. King et al. (2019). Unfair play? Video games as exploitative monetized services: An examination of game patents from a consumer protection perspective. Computers in Human Behavior. https://doi.org/10.1016/j.chb.2019.07.017 (peer-reviewed)
- `sanusi2017-dark-patterns` Anisa Sanusi (2017). Dark Patterns: How Good UX Can Be Bad UX. Game Developers Conference 2017. https://gdcvault.com/play/1024180/Dark-Patterns-How-Good-UX (GDC talk)
