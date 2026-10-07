# How the game turns a squad into results

A player's card supplies his starting rating. Your placement, the season decade, his teammates and the manager change what he contributes. The match engine combines those contributions into attack, midfield, defence and goalkeeper strength, then uses the difference between two teams to draw a score.

This document gives the rules behind those steps. [DATA.md](DATA.md) explains where the cards come from; [VALIDATION.md](VALIDATION.md) records the checks and measurements. The browser, notebook and command-line bridge use the same JavaScript in [app/engine/](../app/engine/index.js). Python prepares the data and fits the models. Each source file includes a key to its abbreviated names.

## Which version of the player gets rated

A card identifies one person at one club in one decade. The first available source in this table supplies its overall rating:

| Badge | Rating evidence | Required match |
| --- | --- | --- |
| `f` | EA FIFA/FC, from FIFA 07 to FC 26 | The same player and club, in a season inside his recorded spell there. |
| `c` | Championship Manager 01/02 | The same player and club, in a database season inside that spell. |
| `i` | EA Icon or Hero | A legend card matched to the person, with an age adjustment. |
| `n` | A nearby EA edition | The person at any club, within two seasons of either recorded spell boundary. |
| `m` | A nearby CM database | The person at any club, within two seasons of either recorded spell boundary. |
| `e` | A fitted estimate | None of the preceding sources supplies a rating. |

When several same-club seasons are available, the overall is the mean of the best three ratings, or fewer if fewer exist. Nearby editions and Icon cards receive an age adjustment: ages 25 to 30 keep the source rating; younger ages lose 0.8 points per year and older ages lose 1.2 points per year, with a maximum loss of 12. Final overall ratings are kept between 45 and 95.

The nearby-edition rule currently compares dates with the two ends of a recorded spell. It can miss a snapshot from another club that sits well inside a long interval. Comparing with the whole interval is a pending correction to the data pipeline. The shipped bundle keeps the boundary rule; incorrect upstream club dates also need checking before another build.

CM uses an ability scale from 1 to 200. A conversion fitted on 6,954 player-seasons with both CM and EA ratings puts those values on EA's scale. The overlap uses CM's 2020-21 and 2021-22 community databases and FIFA 21 and FIFA 22. Ability 140 converts to about 76, 160 to 82, 180 to 88 and 195 to 92. On players excluded from the fit, the average absolute difference from EA is 2.43 points, compared with 4.91 when assigning everyone the average. The goalkeeper figures are 2.58 and 5.58.

Cards without a game rating use a prediction model fitted on 11,493 EA- or CM-rated cards from 1989 to 2025. It uses appearances per season, goals per game, international caps, Wikipedia language coverage, club results, age and position group. On people excluded from the fit, its average absolute error against game ratings is 2.67 points, compared with 4.89 for the average within each position group. Most 1950s to 1970s cards are estimates. Applying a fit from later generations to those players is an extrapolation, and its error against later game ratings does not establish historical accuracy.

## Why placement changes a player's value

EA and CM cards carry a rating for each of fifteen positions. The codes used on the pitch and in the notebook mean:

| Codes | Positions |
| --- | --- |
| `GK` | Goalkeeper |
| `LB`, `CB`, `RB` | Left back, centre back, right back |
| `LWB`, `RWB` | Left wing-back, right wing-back |
| `CDM`, `CM`, `CAM` | Defensive, central and attacking midfielder |
| `LM`, `RM` | Left and right midfielder |
| `LW`, `RW` | Left and right winger |
| `CF`, `ST` | Support or withdrawn forward, and striker |

EA publishes position ratings for FIFA 15 to FC 24. For the other EA datasets, formulas fitted to FC 24's detailed attributes reproduce those ratings. Their average error is 0.27 to 0.47 points per position, with R² at least 0.9976. Here R² describes how closely the formulas reproduce the source ratings; it does not measure real football performance.

CM position values are fitted from attributes and position proficiency using the same 2020-21 and 2021-22 overlap. Their average error against EA position ratings is 2.8 to 4.9 points, compared with 4.1 to 10.2 for an average position offset. Position ratings are scaled to the card's overall and capped there. A CM card's best outfield position is anchored to that overall.

For a card with position ratings:

```text
position loss = 1 - position rating / overall rating
```

The loss is kept between zero and 90%. For example, the Napoli 1980s Maradona card has an overall of 91.2, an attacking-midfield rating of 91 and a right-back rating of 71. Before era and teammate adjustments, those placements contribute 91 and 71 respectively.

Icon cards and estimates without position ratings use a graph of neighbouring football positions. A listed natural position has no loss. One step away costs 10%, two steps 22%, and a greater distance 35%. A goalkeeper playing outfield, or an outfield player in goal, loses 75%. Bench places have no position loss.

Natural positions come first from game data. Cards without a direct game profile use the nearest EA or CM season for that person, then Transfermarkt's more specific position, then Wikidata labels. The coarse Wikidata label "wing half" is read as a winger if the player was born in 1950 or later, also has a forward or winger label, or scored at least 0.15 league goals per appearance. Otherwise it maps to defensive or central midfield. That fallback is a mapping rule, not an individual scouting assessment.

## Moving between eras costs rating

The season decade is the environment in which every card plays. Moving a card away from its own decade multiplies its rating by the following factor:

| Decades apart | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Older player moved forward | 1 | 0.97 | 0.94 | 0.91 | 0.88 | 0.85 | 0.82 | 0.79 |
| Newer player moved backward | 1 | 0.985 | 0.97 | 0.955 | 0.94 | 0.925 | 0.91 | 0.895 |

Timeless I applies one quarter of the ordinary loss, and Timeless II applies half. In the current rules, I therefore protects more than II. A 1980s card in a 2010s season has an ordinary multiplier of 0.91, or 0.9775 with Timeless I and 0.955 with Timeless II. These factors are choices for game balance. They do not measure how a footballer would perform under another era's training or tactics.

## Teammates, formation and the manager

Each starter's contribution begins with:

```text
adjusted rating = overall rating × (1 - position loss) × era factor + teammate points
```

A starter earns 3 points for each listed partner who also starts. He earns 1 point for each teammate from the same club and decade within 34 pitch-coordinate units, up to 2 such points. The total teammate bonus per starter stops at 5. The partnership list is curated; the proximity threshold is a game rule.

Every outfield position allocates its adjusted rating between attack, midfield and defence. A centre back contributes 2%, 8% and 90% to those lines; a striker contributes 90%, 8% and 2%. The full allocation table is `W` in [rate.js](../app/engine/rate.js). A line's average player quality is then adjusted for the number of players the formation commits to it, relative to a 4-4-2:

```text
line strength = sum(position weight × adjusted rating) / sum(position weights)
                + 6 × log(sum(position weights) / reference weight)
```

`log` is the natural logarithm. The reference weights for attack, midfield and defence are 3.24, 2.86 and 3.90. More weight committed to a line adds strength; less weight subtracts it. The defence that an opponent faces combines 70% outfield defence with 30% goalkeeper strength.

Talisman, Rock and Maestro tags raise attack, defence and midfield, capped at 4%, 4% and 5% respectively. Each starting Poacher also adds 0.5% to attack. Manager grades adjust the corresponding attacking and defensive lines:

| Grade | Change |
| --- | ---: |
| S | +4% |
| A | +3% |
| B | +1.5% |
| C | 0 |
| D | -1.5% |
| F | -3% |

Midfield receives the average of the manager's attacking and defensive bonuses. Selecting a signature player anywhere in the fifteen raises both grades one step. The squad overall shown on screen combines 85% of the starters' average and 15% of the bench's, then applies that average manager bonus. Matches use the individual lines, so two squads with the same displayed overall can have different strengths.

The notebook's `best` placement helper assigns players to maximize position- and era-adjusted base ratings, then selects the remaining bench. It does not optimize teammate points or the chance of winning the season. Browser placement is always manual.

## Drawing the match score

For each side, the engine first calculates an expected goal total over 90 minutes. This is an average around which scores are drawn, not a promised result:

```text
rating gap = (attack - opponent's keeper-weighted defence) / 10
             + 0.5566 × (midfield - opponent's midfield) / 10

expected goals = decade level × exp(0.4115 × rating gap + home bonus)
home bonus = 0.2621 at home, otherwise 0
```

`exp` raises the mathematical constant e to the given power. Goals are drawn from a Poisson distribution, a probability rule for a whole-number count around an expected total. This allows a weaker team to win a match while favouring the stronger side over repeated matches.

The coefficients were fitted on 6,716 real league fixtures from 2014-15 to 2019-20. Each team used its actual FIFA edition roster, its best eleven in a 4-3-3, EA position ratings, a neutral manager and no tags. On 4,354 separate fixtures from 2020-21 to 2023-24, average Poisson log loss was 1.476 against 1.540 for a simple home/away average; goal-prediction error was 1.188 against 1.265. Lower is better in both comparisons. [VALIDATION.md](VALIDATION.md#the-goal-model-beats-a-home-and-away-average) explains the measures and exclusions. JavaScript reproduces the fitted expected goals within 1e-10.

The scoring level is 1.231 goals per team for the 2010s and 2020s, fixed from the training data. Earlier levels use measured historical scoring ratios: 1.459 for the 1950s, then 1.279, 1.186, 1.176, 1.154 and 1.149 for the 1960s through 2000s. Those ratios adjust how many goals a decade produces. They do not validate historical player ratings.

Each starter has a 5% chance of missing a match. The best-fitting bench player covers him; if no bench player remains, an academy replacement rated 55 fills the position. Starters who stay on tire by 4% late in the match. Up to three useful substitutions occur in two windows at minutes 60 and 75; a substituted player cannot re-enter.

In Cup matches, recorded European Cup experience adds 3%, 4.5% or 6% for one, two, or at least three wins. Level knockout ties add 30 minutes of extra time and then penalties. A penalty scores with probability `0.75 + 0.005 × (taker rating - 75) - 0.006 × (keeper rating - 75)`, kept between 0.55 and 0.92.

## Choosing scorers and assist providers

After drawing a goal, the engine selects its scorer from the outfield players in proportion to their scoring weights. It uses Understat xG per 90 minutes where at least 450 minutes are recorded, otherwise Transfermarkt goals per 90 at the same threshold. Expected goals describe the scoring chances a player received. Understat covers the top five leagues and Russia from 2014 onwards; the Transfermarkt inputs start in 2012.

If those sources do not qualify, Wikidata league goals per appearance are usable after at least fifteen appearances. That fallback treats an appearance as 80 minutes and rescales historical scoring to the 2010s level using the decade ratios above.

The recorded contribution is blended with a position-based starting estimate. That estimate carries the same weight as 900 minutes of play, so a small recorded sample does not decide the entire scoring share:

```text
estimated goals per 90 = 0.6 × position's attack weight × (adjusted rating / 80)^4
scoring weight = (900 × estimate + recorded minutes × real rate × position factor)
                 / (900 + recorded minutes)
```

The position factor is `(current position weight + 0.02) / (first natural position weight + 0.02)`, kept between 0.1 and 1.5. It adjusts a player's historical contribution for the place you gave him in this lineup.

Assists follow the same 450-minute threshold and 900-minute blend, using expected assists (xA) or recorded assists. xA describes the scoring chances a player's passes created. The position factor uses midfield weights. The starting assist estimate is `0.35 × (midfield weight + 0.4 × attack weight) × (adjusted rating / 80)^3`. Both starting estimates use a minimum adjusted rating of 30. Without usable real records, the starting estimate supplies the whole weight.

About 72% of simulated goals receive an assist. Poacher and Maestro tags can multiply scorer and assister weights by up to 1.5 and 1.4. These weights choose who gets a goal or assist after the score is drawn. The team's expected total has already been calculated from its line strengths.

## League, Cup and awards

The league consists of your team and nineteen eligible club squads from the season decade. Domestic and European result ranks select that field. Each opponent fields its best eleven in its manager's formation. A double round robin produces 38 matches for every club and 380 in total. Wins earn 3 points and draws 1. Ranking uses points, goal difference and then goals scored.

The European Cup uses your squad and the fifteen strongest teams by engine rating within that field. The top eight are seeded against the rest. Ties have two legs through the semi-finals and one neutral final, without away goals. Scorer, assist and clean-sheet awards use the recorded simulated events. Player of the season scores `4 × goals + 3 × assists + 3 × clean sheets + 0.1 × appearances`.

## Which squads the spin favours

Each spin draws a decade, then a club squad from that decade. The relative weights are:

```text
decade weight = exp(-|card decade - season decade| / (10 × 1.5))
club weight   = exp(-(strength rank in its decade - 1) / 3)
```

Rank 1 is the strongest club. The denominators are the balance settings `rho=1.5` and `tau=3`: lower values concentrate draws nearer the chosen era and nearer the strongest clubs. Every decade remains eligible. With all eight decades available, about 35% of draws stay in a 1980s or 1990s season's own decade, rising to about 49% at the 1950s and 2020s ends of the range. Restrictions such as having three undrafted people available can change an individual draw's pool.

Only squads with at least fifteen cards and a goalkeeper are eligible. Under the tested automatic selection policy, these settings produced 42 titles in 320 drafts and no unbeaten seasons. The result varies by decade; it does not imply the same title probability in every era. The policy and results are in [VALIDATION.md](VALIDATION.md#draft-difficulty-varies-by-decade).

## Era Gauntlet

The run takes the drafted fifteen through each decade from the 1950s to the 2020s. A decade is an act: two six-match segments against its clubs, then one neutral knockout match against its highest-rated club in the selected nineteen-team field. Extra time and penalties decide a level boss match.

Board patience starts at 8 and is capped at 20. Each six-match segment changes it according to points earned:

| Event | Patience change |
| --- | --- |
| Segment with at least 13 points | +2 |
| Segment with 9 to 12 points | 0 |
| Segment with 5 to 8 points | -2 |
| Segment with at most 4 points | -3 |
| Boss won | +4 |
| First boss loss in a decade | -4 |
| Further boss loss in that decade | -6 |

A lost boss can be retried while patience remains. The run ends at zero patience or after the eighth boss falls. After each segment you choose one of up to three reward offers:

| Reward | What changes | Patience cost or gain |
| --- | --- | --- |
| Prime-card boost | An existing player becomes the same person's highest-rated club-and-decade card. | 1 within the same rating tier; 2 for one tier gained; 3 for two; 4 for three or more. Add 1 when reaching S from a lower tier. |
| Free agent | Choose one of three players from a drawn club squad, and release one of your fifteen. | 2 for D, C or B; 3 for A; 4 for S. A signing must leave at most two S-tier and four A-tier players. |
| Develop | Add or develop a Talisman, Maestro or Rock tag. | 2. |
| Rest | Recover patience. | +2, then +1, then zero for consecutive rests. Spending on another reward resets that sequence. |

The rating tiers are S at 90 or above, A at 85, B at 80, C at 75, and D below 75. A purchase must leave at least 1 patience. This follows Eraball's starting patience, cap, boss consequences, upgrade costs, squad cap and rest rules. The two six-match segments and their point thresholds are this game's football adaptation.

## Circuit, Head to Head and Weekly Challenge

A circuit runs 10 to 20 events, starting in the season decade and cycling through the eras. It rotates an eight-club league, a sixteen-club European Cup, an eight-club knockout, sixteen clubs in groups followed by knockout, and a one-match Super Cup against the decade's strongest club in the selected field. Each event reassesses the squad for its decade. Titles and player awards come from all of the circuit's recorded match events.

Head to Head accepts two team codes containing exact cards and placement. It plays two legs, with each team at home in its own decade. A level aggregate adds extra time and penalties in the second leg. The Weekly Challenge chooses one seed and decade for the whole ISO week, Monday to Sunday in UTC. These modes have no server-held leaderboard or authenticated competition record.

## Notebook settings

Install Node 20 or later and Python 3.11 or later, then follow the commands in the [README](../README.md#project-files-and-running-your-own-copy). Open the notebook from the repository folder and run all cells. Set `NODE` in its setup cell if Node is not on PATH. On the development machine, Python is `C:\Python314\python.exe`.

| Setting | Meaning |
| --- | --- |
| `seed` | A whole number from 0 to 4294967295, fixing the draft and season draws. |
| `decade` | The season decade's start: 1950 through 2020, in steps of ten. |
| `manager` | A name from the printed catalogue, or `None` for the seeded demonstration choice. |
| `formation` | A catalogue formation, or `None` to use the selected manager option's formation. |
| `person_ids` | Fifteen distinct Wikidata person IDs. An empty list requests the automatic demonstration. |
| `source_cards` | Fifteen exact `{k, p}` card records. These take precedence over `person_ids`. |
| `placement` | `best` assigns the starting eleven; `ordered` retains eleven formation slots followed by four substitutes. |

With IDs alone, the bridge prefers a card from the season decade, then the highest overall, then the source-card key to break ties. A key such as `{'k': 'Q2641:1980', 'p': 'Q17515'}` selects Maradona at Napoli in the 1980s. To preserve a browser lineup, use all fifteen exact `source_cards` and `placement='ordered'`.

Manager and formation settings are notebook experiments. With empty player lists, the demonstration uses five real squad draws, selects three players per draw and assigns an eleven. It does not automate choices in the browser.

The outputs show sources, position losses, era multipliers, teammate points, manager grades, line strengths, match parameters, tables, fixtures, Cup ties, player totals and awards. The notebook prints the data hash and both draft and season seeds, and checks repeatability for unchanged settings. It writes no export unless `export_path` names a persistent file.

## What the model leaves out

The model does not simulate pressing, tactical changes during a match or individual defending actions. It applies the same modern league and Cup formats to every era. The match fit covers modern club-season rosters, with random absences, fatigue, substitutions and curated bonuses excluded from that fit. Historical squads, mixed-era lineups, manager effects, links and era penalties remain outside what was validated. A result from the game is a result under these rules.
