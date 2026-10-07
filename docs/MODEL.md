# How a team's strength becomes results

The browser, the notebook and the command-line bridge all run the same JavaScript in `app/engine/`. Python builds the data and fits the models described here; it never runs a second match simulator. Every source file opens with a legend of its short names, and the notebook prints the live parameters.

## A card's rating comes from a game when one rates the player

A card is one person at one club in one decade. The pipeline takes its rating from the first source that has the player, in this order:

| Code | Source | When it applies |
| --- | --- | --- |
| `f` | EA FIFA / FC | an EA rating for this player at this club, from a season inside his stint (FIFA 07 to FC 26) |
| `c` | Championship Manager 01/02 | a CM database season for this player at this club inside his stint |
| `i` | EA Icon or Hero card | a legend card matched to the player |
| `n` | EA, nearby season | an EA rating within two seasons of either recorded stint boundary, at any club |
| `m` | CM, nearby season | a CM rating within two seasons of either recorded stint boundary, at any club |
| `e` | estimate | none of the above |

With several EA or CM seasons inside a stint, the card takes the mean of the best three. Nearby seasons and Icon cards are moved by an age curve: no change from age 25 to 30, minus 0.8 points per year younger and minus 1.2 per year older, never more than 12 points. Every final rating sits between 45 and 95.

The nearby fallback currently measures distance to stint boundaries rather than the whole interval. It can miss an interior snapshot at another club when the recorded stint is long. A whole-interval comparison is a pending data-pipeline correction; the shipped ratings retain the boundary policy, and inaccurate upstream stint dates also need checking before a rebuild.

Championship Manager rates ability from 1 to 200. The pipeline puts it on EA's scale with a curve fitted where both games rate the same player in the same season (CM's 2020-21 and 2021-22 community data against EA's FIFA 21 and FIFA 22 rows, 6,954 matched player-seasons). On people held out of the fit, the curve misses EA's overall by 2.43 points on average, against 4.91 for guessing the average; for keepers 2.58 against 5.58. Ability 140 maps to about 76, 160 to 82, 180 to 88 and 195 to 92.

The estimate, used where no game rates the player, is a gradient-boosted tree model fitted on the 11,493 cards that EA or CM rate (1989 to 2025). It reads appearances per season, goals per game, international caps, Wikipedia coverage, club results, age and position group. On people held out of the fit it misses by 2.67 points on average, against 4.89 for the average of the player's position group. Most estimates are for the 1950s to 1970s, so they extrapolate the fit to decades it never saw; read them as the model's guess.

## Every player has a rating in every slot

Where a card comes from EA or CM it carries the player's rating in each of the fifteen slots (GK, LB, CB, RB, LWB, RWB, CDM, CM, CAM, LM, RM, LW, RW, CF, ST). EA publishes these per-position ratings for FIFA 15 to FC 24. For the other EA sources the pipeline computes them from the player's detailed attributes with weights fitted to the FC 24 rows: the fitted formulas reproduce EA's published ratings with R² of at least 0.9976 and a mean error of 0.27 to 0.47 points per slot. For CM cards the slot ratings come from the player's CM attributes and position proficiencies, fitted on the same 2020-21 and 2021-22 overlap; those miss EA's slot ratings by 2.8 to 4.9 points on average, against 4.1 to 10.2 for an average offset. All engine slot ratings are capped at the card's overall; a CM card's best outfield slot is anchored to that overall so its fitted offsets do not penalize its strongest slot.

Playing a card in a slot costs the gap between his overall and his rating there:

```text
position loss = 1 - slot rating / overall      (capped at 90%)
```

A card without slot ratings (Icon cards and estimates) uses distance on a graph of neighbouring positions instead: natural 0%, one step 10%, two steps 22%, further 35%, and 75% for a keeper outfield or an outfielder in goal. Natural positions for those cards come from the nearest EA or CM season of the same person, then Transfermarkt's sub-position, and only then Wikidata's position labels. Wikidata's "wing half" label is used mostly for wingers, so it reads as a winger when the person was born in 1950 or later, also has a forward or winger label, or scored at least 0.15 league goals per game; otherwise as a holding or central midfielder. Bench places carry no position loss.

## Players lose rating away from their own decade

The season is played in one decade. A card from another decade is multiplied by a factor that falls with the number of decades between them:

| Decades apart | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Older player in a later decade | 1 | 0.97 | 0.94 | 0.91 | 0.88 | 0.85 | 0.82 | 0.79 |
| Newer player in an earlier decade | 1 | 0.985 | 0.97 | 0.955 | 0.94 | 0.925 | 0.91 | 0.895 |

Players tagged Timeless keep a quarter (tier I) or half (tier II) of that loss. These factors are game design, chosen to make travelling across time cost something; they are not a measurement.

## Links, managers and formation shape

For each starter:

```text
adjusted rating = base rating * (1 - position loss) * era factor + link points
```

A starter earns 3 link points for each famous partner (a curated duo) who also starts, and 1 point for each teammate from the same club and decade within 34 pitch units, at most 2 such points. Link points per starter stop at 5.

Each outfield slot splits its player between attack, midfield and defence (a centre back is 2% attack, 8% midfield, 90% defence; a striker 90%, 8%, 2%; the full table is `W` in `app/engine/rate.js`). Each line's strength is the weighted average of its players, adjusted for how many players the formation commits to it compared with a 4-4-2:

```text
line strength = sum(slot weight * adjusted rating) / sum(slot weights) + 6 * log(sum(slot weights) / 4-4-2 weight)
```

The 4-4-2 weights are 3.24 for attack, 2.86 for midfield and 3.90 for defence. The defence an opponent's attack faces is 70% outfield defence and 30% keeper. Talisman, Rock and Maestro tags add up to 4%, 4% and 5% to attack, defence and midfield.

A manager's attack and defence grades scale the matching lines: S +4%, A +3%, B +1.5%, C 0, D -1.5%, F -3%, and midfield takes the average of the two. Drafting one of the manager's signature players raises both grades one step. The overall rating shown on screen is 85% the starters' average and 15% the bench's, times the manager's average grade bonus; matches use the lines, not the overall.

The assignment helper `best` maximizes position-adjusted and era-adjusted base ratings for the eleven slots and picks the remaining bench. It does not optimize chemistry or season win probability. Browser placement stays under the player's control.

## Matches: goals from a model fitted on real results

Each team's goals in a match follow a Poisson distribution with this expected value over 90 minutes:

```text
expected goals = decade level * exp(0.4115 * ((attack - opponent's keeper-weighted defence) / 10
                                              + 0.5566 * (midfield - opponent's midfield) / 10)
                                    + 0.2621 if at home)
```

The three numbers were fitted by maximum likelihood on real league results from 2014-15 to 2019-20 (6,716 matches), with each club rated from its actual FIFA edition squad, its best eleven in a 4-3-3 and EA's per-position ratings, a neutral manager and no tags. On the held-out seasons 2020-21 to 2023-24 (4,354 matches) the model's average Poisson log loss is 1.476 against 1.540 for a home-and-away average, and its error in goals is 1.188 against 1.265. The JavaScript reproduces the fitted expectations to within 1e-10. The decade level is 1.231 goals per team for the 2010s and 2020s; earlier decades are scaled by the measured ratio of goals per game in their top-flight results, giving 1.459 for the 1950s, 1.279, 1.186, 1.176, 1.154 and 1.149 for the 1960s to 2000s.

Inside a match each starter has a 5% chance of missing it, replaced by the best-fitting bench player (or an academy player rated 55 if none is left). Starters tire by 4% late in the game, and up to three substitutions come in two windows at minutes 60 and 75 when a bench player would do better than the tired starter. Cup matches add a small boost for players who have won the European Cup (3%, 4.5% or 6% for one, two or three and more wins). Level knockout ties go to 30 minutes of extra time and then penalties, where each kick scores with probability 0.75 plus 0.005 per point of the taker's rating above 75 minus 0.006 per point of the keeper's, kept between 0.55 and 0.92.

## Who scores follows the players' real scoring

When a goal is drawn, its scorer is chosen in proportion to each outfield player's scoring weight. The engine uses recorded xG per 90 minutes from Understat (top five leagues and Russia, 2014 onwards), else goals per 90 from Transfermarkt (2012 onwards), when the source records at least 450 minutes. Otherwise it uses Wikidata league goals per game when at least fifteen appearances are recorded, put on the 2010s scoring level by the ratio of decade levels above. That historical fallback counts each appearance as 80 minutes for weighting. The rate is blended with a prior from the current slot and adjusted rating, weighted as if the prior were 900 minutes of play:

```text
prior goals per 90 = 0.6 * slot attack weight * (adjusted rating / 80)^4
scoring weight = (900 * prior + minutes * real rate * slot factor) / (900 + minutes)
```

The slot factor is `(current slot weight + 0.02) / (first natural slot weight + 0.02)`, kept between 0.1 and 1.5. Assists use the same 450-minute threshold and 900-minute prior blend with xA or Transfermarkt assists, using midfield weights for the slot factor. Their prior is `0.35 * (midfield weight + 0.4 * attack weight) * (adjusted rating / 80)^3`. Both priors floor adjusted rating at 30. If no usable real rate exists, the prior alone is used. About 72% of goals receive an assist. Poacher and Maestro tags multiply scorer and assister weights by up to 1.5 and 1.4.

## Season, cup and awards

The league is twenty clubs: your team and nineteen eligible club-decades selected by the season decade's domestic/European result ranks, each with its best eleven in its manager's formation. Everyone plays everyone home and away; a win is 3 points and a draw 1, ranked by points, goal difference, then goals scored. The European Cup takes your team and the fifteen strongest by engine rating within that field, seeds the top eight against the rest, plays two legs to the semi-finals and a neutral final, with no away-goals rule. Player of the season scores 4 per goal, 3 per assist, 3 per clean sheet and 0.1 per appearance. Goals, assists and clean sheets are simulated events.

## Spins favour the great squads

A squad spin picks a decade, weighted toward the season's decade, then a club-decade inside it, weighted toward the strongest:

```text
decade weight = exp(-|decade - season decade| / (10 * 1.5))
club weight   = exp(-(strength rank in its decade - 1) / 3)
```

About 35% of spins land in the season's own decade. These settings were chosen by simulation (see [VALIDATION.md](VALIDATION.md)). The tested draft policy won 42 of 320 titles across all decades, with no unbeaten seasons. Difficulty varies by decade; this aggregate does not establish a one-in-ten chance in each era. Only club-decades with at least fifteen players and a keeper are drafted or play.

## The Era Gauntlet run

The Gauntlet follows Eraball's run with your drafted fifteen. Each decade from the 1950s to the 2020s is an act of two segments of six matches against that decade's clubs, then its boss, the decade's strongest club, in one neutral match with extra time and penalties. The board's patience starts at 8 and cannot pass 20:

| Event | Patience |
| --- | --- |
| Segment of 13 points or more | +2 |
| Segment of 9 to 12 points | 0 |
| Segment of 5 to 8 points | -2 |
| Segment of 4 points or fewer | -3 |
| Boss won | +4 |
| Boss lost | -4 the first time in a decade, -6 after |

A lost boss can be played again while patience lasts; the run ends at zero patience or after the eighth boss. Between segments you choose one of up to three reward cards. A boost card upgrades one of your players to his best card (the same person at his highest-rated club-decade) for 1 patience inside his rating tier, 2 for one tier up, 3 for two and 4 for three or more, plus 1 to reach tier S (tiers: S 90 and over, A 85, B 80, C 75, D below). A free agent swaps one of your players for one of three from a spun squad, for 2, 3 or 4 patience by tier, keeping at most two S-tier and four A-tier players. Developing a Talisman, Maestro or Rock tag costs 2. Resting pays 2, then 1, then nothing when taken back to back. Spending can never leave less than 1 patience. Eraball's own numbers are used where they translate directly (starting and maximum patience, boss results, upgrade costs, the squad cap, rest); the segment length and point thresholds are this game's scaling to football.

## The other modes

The tournament circuit plays 10 to 20 events, one decade after another from the season's decade, rotating an eight-club league, a sixteen-club European Cup, an eight-club knockout, a sixteen-club group stage with knockout, and a one-match super cup against the decade's strongest club. Head to Head plays two legs between your team and a friend's team code, each team at home in its own decade; a level aggregate goes to extra time and penalties in the second leg. The Weekly Challenge gives everyone the same seed and decade for an ISO week (Monday to Sunday, UTC).

## What the model leaves out

Pressing, tactics during a match and individual defending are not modelled. The same modern league and cup formats apply to every decade. The match fit covers modern club seasons; mixed-era teams and historical squads are outside anything it was checked against.
