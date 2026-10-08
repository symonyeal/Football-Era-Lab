# How the game turns a squad into results

A player's card supplies his starting rating. Your placement, the season decade, his teammates and the manager change what he contributes. The match engine combines those contributions into attack, midfield, defence and goalkeeper strength, then uses the difference between two teams to draw a score.

This document gives the rules behind those steps. [DATA.md](DATA.md) explains where the cards come from; [VALIDATION.md](VALIDATION.md) records the checks and measurements. The browser, notebook and command-line bridge share the JavaScript rating and match engine in [app/engine/](../app/engine/index.js). The browser adds the real-league club career; the existing notebook retains its fictional single-season experiment. Python prepares the data and fits the models. Each source file includes a key to its abbreviated names.

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

The shipped bundle compares nearby editions with the two ends of a recorded spell. This can miss an edition inside a long spell. The pipeline now measures distance from the full interval: an interior edition has distance zero, and the two-season cutoff applies outside it. Regression tests cover EA and CM interior editions and selection precedence. The bundled cards have not been rebuilt; incorrect upstream club dates also need checking before another build.

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

The manager draw offers five managers, each paired with a recorded spell at a club. For new version 4 drafts, that spell must overlap the chosen decade and include a year in which the club appears in its real top-flight records. Version 3 saves keep the earlier all-era manager pool; version 2 saves retain their original manager and formation pair. Both older draft versions continue the fictional season and their saved extra modes. New drafts enter the career. Choose any catalogue formation independently; the default is the manager's first available recorded formation. The lobby previews the selected formation even when the manager never recorded it, and recorded chips can be clicked.

During the draft and lineup review, a formation change previews the new placement before applying it. Applying keeps every card, the four bench places, the cap charges and the seeded draws. Undo and redo restore the formation and placement together. Kick-off requires applying or cancelling the preview and locks the formation during play. The career opens further lineup changes in its transfer windows.

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

## Club career

The drafted fifteen take the manager's club into its domestic top flight for every available season of the selected decade. [app/club.js](../app/club.js) supplies the league and competitions; [app/career.js](../app/career.js) carries the squad, patience, rewards and season history. The club keeps its place where the real league table contains it. In a year outside that top flight it replaces the last club in the derived historical order. The career stays in that league and does not simulate promotion or relegation through lower divisions.

Each year's field and size come from the bundled real league membership. Every club plays home and away against every other club; odd-sized leagues have byes. Wins earn two points until the league's recorded transition to three, with one point for a draw. The transition season starts are England 1981, France and Italy 1994, and Germany, Spain, Netherlands and Portugal 1995. Simulated ranking uses points, goal difference, goals scored and club ID. Historical administrative deductions and league-specific tie-breaks are outside the model.

Rival squads first use people whose club spell covers the season, adding same-club players from spell years within three years when needed for fifteen players and a goalkeeper. Your current people are excluded. A club the archive cannot field receives a labelled fifteen-player stand-in rated from its real win-and-draw record; an outside European club with no league record uses a declared rating of 74. [DATA.md](DATA.md#real-league-seasons-and-the-squads-they-can-supply) gives the fallback and coverage limits. A curated manager is used when his spell covers the season, except that your chosen manager cannot also manage a rival; otherwise the club uses neutral staff and a period formation.

### Competition formats and qualification

Domestic cups include only the clubs in that season's top flight. They use single ties, byes for the strongest seeds based on the previous season and a neutral final. The English League Cup has two-legged semi-finals. Italy's domestic cup starts in the model in 1958/59. League cups appear in England from 1960/61, Spain from 1982/83 to 1985/86, Germany from 1997/98 to 2007/08, France from 1994/95 to 2019/20 and Portugal from 2007/08. Domestic super cups appear only during the periods declared in the competition catalogue.

European places use the previous season's finishing order and known simulated cup winners. The opening season uses the real previous league table and available European Cup records. The European Cup holder also receives a place. Historical cup holders are missing, so an unfilled Cup Winners' Cup place goes to the highest-placed club not already qualified. The first season omits domestic and UEFA super cups; later seasons use the simulated holders. The UEFA Super Cup pairs the European Cup winner with the Cup Winners' Cup winner through the 1999/2000 edition, then the UEFA Cup/Europa League winner.

These are declared qualification shortcuts: one European Cup place per league through 1996/97, two through 1998/99, then four for England, Spain and Italy, three for France, two for Netherlands and Portugal, and three for Germany until four from 2009/10. The next three league places enter the UEFA competition for England, Spain, Italy and Germany; the other leagues receive two. Cup holders can alter which teams fill those places. The English League Cup winner receives a UEFA place from 1975/76. The Heysel ban excludes English clubs from 1985/86 through 1989/90, with Liverpool also excluded in 1990/91; a barred club's place is lost rather than passed down.

| European competition | Seasons and declared format |
| --- | --- |
| European Cup / Champions League | Starts 1955/56; sixteen-club two-legged knockout through 1990/91. Groups of four start in 1991/92 with sixteen entrants, expanding to thirty-two from 1999/2000; the top two in each group advance. A neutral final decides the title. The Champions League name starts in 1992/93. |
| Cup Winners' Cup | 1960/61–1998/99; sixteen-club two-legged knockout, neutral final. |
| Fairs Cup / UEFA Cup / Europa League | Starts with the model's 1960/61 Fairs Cup; UEFA Cup name from 1971/72 and Europa League from 2009/10. Sixteen entrants through 1965/66, then up to thirty-two, all in two-legged knockout. Finals have two legs through 1996/97, then one neutral match. |
| UEFA Super Cup | From 1973/74 where both simulated holders exist; two legs through 1997/98, then one neutral match. |

Fields use the real European Cup entrants where the records are complete, previous table places where they are partial, and available archive clubs from other countries to fill gaps. They are reduced to the strongest available entrants while retaining your club when it qualifies. A club cannot enter two European tournaments in the same season. Draws try to avoid same-country ties in the early rounds and same-group rematches in the first knockout round. Every level tie uses extra time and penalties; away goals are never applied. There are no Intercontinental or Club World Cup tournaments. These competitions reproduce broad era differences, not every historical entry list, preliminary round, regulation or calendar.

Scorer, assist and clean-sheet awards use the simulated match events. The ordinary player award scores `4 × goals + 3 × assists + 3 × clean sheets + 0.1 × appearances`; career objective rewards use the season records described below.

### Board expectations, rewards and transfers

Patience starts at 8 and is capped at 20. Zero ends the career. Each season has two playable halves. The board's league objective is set at the start from the squad's projected rank against that year's rivals: win the league, top two, top four, top six, top half, or avoid the bottom two in leagues of sixteen or fewer and bottom three in larger leagues. This is a game objective based on the match model, not the real club's historical board policy.

Before each half, the model calculates expected points for your current squad against the scheduled rivals, using independent Poisson goals with no random absences. Let `p` be points earned, `e` expected points and `m` the maximum available. The declared scale maps zero to zero, expectation to 10.5 and a perfect half to 18:

```text
At or below expectation: scaled points = 10.5 × p / e
Above expectation:       scaled points = 10.5 + 7.5 × (p - e) / (m - e)
```

The scaled value stays between zero and eighteen. A zero-point expectation uses the neutral value at zero points. The eight steps adapted from Eraball are applied to this expectation scale, so a strong squad needs more actual points than a weaker squad to earn the same response.

| Scaled points | Patience change |
| --- | ---: |
| 18 | +3 |
| 13 to below 18 | +2 |
| 12 to below 13 | +1 |
| 9 to below 12 | 0 |
| 7 to below 9 | -2 |
| 4 to below 7 | -3 |
| 2 to below 4 | -4 |
| Below 2 | -5 |

At season end, reaching the objective earns another 4 patience and gives the current squad's best player by season award score a persistent +1 rating. Missing the objective costs 4 on the first failed season and 6 on every later failure. The highest-rated current outfielder with neither a recorded season goal nor assist receives −1 where such a player exists. An objective reward cannot rescue patience that has already fallen to zero. A surviving missed objective advances to the next season; seasons are not replayed as Gauntlet boss acts are.

Each half opens one ordinary reward pick. Every trophy won in that half adds a free pick taken before the ordinary reward; a league title is awarded in summer. The menu offers up to three free agents at C tier or better, one development, and rest. At 20 patience, a second development replaces rest. Rest recovers 2, then 1, then zero when repeated; another reward resets the rest sequence. Free trophy picks omit rest. The final season still resolves its rewards before the career ends.

The base free-agent prices are 1 patience for C or B, 2 for A and 3 for S. Sign one player and release one. An S signing costs 1 less when placed in the starting eleven; an A or S player without European Cup experience costs 1 less when five squad players have it. The negotiated base price stays at least 1. An S market signing loses 3 rating points on the bench, while a C signing gains 3 when starting. One scouting re-spin per pick costs 1, or 5 for an A/S-only premium market. Ordinary prices add `floor(completed seasons / 2)`, so the third season adds 1, the fifth adds 2 and so on. A purchase must leave at least 1 patience.

Same-player upgrades offer the highest-rated available card, priced at 1 within a tier, 2 for one tier gained, 3 for two and 4 for more; add 1 when entering S and cap the base price at 4. The upgrade keeps the player's original cap charge. In a capped career, the squad allows at most two S-tier and four A-tier charges across starters and substitutes; lower tiers become unrestricted after the initial draft. Releasing and signing a player again establishes a fresh charge. Classic stays uncapped.

The career uses the ten Gauntlet developments listed [below](#era-gauntlet), plus four:

| Additional development | Levels | Base price | Effect |
| --- | ---: | ---: | --- |
| First-touch Training | 2 | 3 | Add 1 rating point per level to a midfield, wide or attacking player. |
| Composure Training | 2 | 3 | Add 1 rating point per level to any player. |
| Team First | 1 | 3 | Multiply the squad's partnership and teammate links by a further 1.2. |
| Player Buy-In | 1 | 2 | Add 1 rating point and clear that player's desperation disruption. |

Below 5 patience, desperation offers include cut-price A or S players. They cost 1 at 3 or 4 patience, and are free at 1 or 2. While any such disruptive signing remains without Player Buy-In, squad link points are multiplied by 0.75. Release the player or apply Buy-In to remove his disruption.

After winter rewards, rearrange the lineup or formation before the run-in. After summer rewards, two free pools offer up to three players each: one from next season's real league rivals whose spell covers that year, and one from the career decade. Take one from each available pool and release a different squad member for each signing; an empty pool is optional. Stand-in players never enter the market. Check the cap, then set the next season's lineup and formation. The final year has no further summer transfer pool.

The career score uses the Gauntlet calculation with each met season objective as a cleared act. It sums `10 + 5 × zero-based season index` over those seasons, multiplies by `0.5 + league win rate` with draws counting as half wins, by 1.5 under the cap, and by `1 + 0.2 × patience / 20`, adding 0.15 to the last factor if every attempted objective was met. Missed seasons score no cleared-act points. Trophies are counted separately and supply free rewards; they do not directly add score points. Scores and saved games are local and unauthenticated.

## The notebook's fictional season

The existing notebook uses your team and nineteen eligible decade-wide club squads selected by domestic and European result ranks. Each rival fields its best eleven in its manager's formation. A double round robin produces 38 matches for each club and 380 in total, with three points for a win. The European Cup takes your squad and the fifteen strongest rivals in that field, with two legs through the semi-finals and one neutral final. There are no away goals. This experiment also supports the legacy benchmark measurements; its fixed field does not reproduce the browser career's league membership or economy.

## The salary cap limits stars across the whole squad

A new draft uses the salary cap unless you choose Classic. Each card has a tier set by its base rating, before position, era, link and manager adjustments, and the fifteen must fill these places:

| Tier | Base rating | Places |
| --- | --- | ---: |
| S | 90 or above | 2 |
| A | 85 to 89.9 | 4 |
| B | 80 to 84.9 | 4 |
| C | 75 to 79.9 | 3 |
| D | below 75 | 2 |

The places add up to fifteen, so a finished squad holds exactly these numbers, substitutes included. A card is blocked when its tier is full. It is also blocked when taking it would leave the club without enough undrafted players in open tiers to complete that club's three picks. Swapping two of your players changes nothing, because tiers belong to cards rather than positions.

Eraball's Salary Cap Draft fills nine places with 2 S, 2 A, 2 B, 2 C and 1 D, its D place covering every lower tier. The fifteen-place allowances are this game's adaptation. Eraball also promises that every spin includes a player from a tier you still need. This game applies that promise to each squad draw: the squad must offer an undrafted player from the best tier you still need, S while an S place is open, then A, B, C and D, whenever a club you have not drafted from can supply one. In 6,400 test spins one always could. Classic drafts block nothing but receive the same help, measured against the same allowances. The help matters most for the top tiers: S-tier cards sit in 52 of the 910 club squads, belonging to 28 clubs, A-tier cards in 245, B-tier in 588, C-tier in 864 and D-tier in all 910.

A capped draft cannot get stuck while the archive keeps enough clubs for its scarcest needs. The hardest final draw, two S-tier players and one more, can be supplied by 10 different clubs, and a draft rules out at most 5: the four already drafted and one re-spun. The hardest need over the last two draws can be supplied by 20. An automated test fails if a rebuilt archive leaves any such need with five clubs or fewer.

Saved drafts, replays, team codes, the Weekly Challenge and Head to Head carry the rules. A team code records whether it was capped, and Head to Head requires both teams to use the same rules. Drafts saved before the cap existed resume as Classic.

## Which squads the spin favours

Each spin draws one club squad. Its relative weight is the product of two factors:

```text
decade weight   = exp(-|squad decade - season decade| / (10 × 1.5))
strength weight = exp(-(strength rank in its decade - 1) / 20)
```

Rank 1 is the decade's strongest club. The denominators are the balance settings `rho=1.5` and `tau=20`: lower values concentrate draws nearer the chosen era and nearer the strongest clubs. Every club and every decade keeps a chance. Without other restrictions, 35.1% of draws stay in a 1990s season's own decade and 35.3% in a 1980s one, rising to 44.5% for the 1950s and 46.7% for the 2020s.

The seed puts every squad in a random order in which a squad's chance of coming first is proportional to its weight. The draw takes the first squad in that order that meets the rules: at least fifteen cards with a goalkeeper, a club not already drafted or re-spun away, three picks possible within your remaining places, and, where possible, a player from your best open tier. Two players on the same seed therefore meet the same squad unless their own earlier picks rule it out.

The earlier release used `tau=3`, concentrating more draws on the strongest squads. [VALIDATION.md](VALIDATION.md#draft-difficulty-varies-by-decade) retains its measured comparisons against the fictional twenty-club league. Those figures concern the version 3 manager pool and earlier single-season experiment; they do not establish career title rates under the new manager rule.

## Era Gauntlet

More modes keeps the Gauntlet's own rules and takes the drafted fifteen through a selected map. Original Gauntlet, the default, visits the 1960s, 1990s and 2010s; Back in Time reverses that route. The Full Odyssey visits all eight decades in order; Odyssey in Reverse starts in the 2020s and ends in the 1950s.

A decade is an act with four six-match rounds. The rounds draw from progressively stronger bands of the sixteen clubs below the field's three bosses. After each round, choose one reward. Then play home and away against a seeded boss from the strongest three clubs. There is no away-goals rule; extra time and penalties decide a level aggregate. A loss restarts all four rounds against a different boss. A non-final win opens the transfer window; beating the map's last boss ends the run.

Board patience starts at 8 and is capped at 20. Each six-match round changes it according to points earned:

| Event | Patience change |
| --- | --- |
| 18 points | +3 |
| 13 to 17 points | +2 |
| 12 points | +1 |
| 9 to 11 points | 0 |
| 7 to 8 points | -2 |
| 4 to 6 points | -3 |
| 2 to 3 points | -4 |
| 0 to 1 point | -5 |
| Boss tie won | +4 |
| First boss tie lost in the run | -4 |
| Every later boss tie lost | -6 |

The run ends at zero patience. Reward prices add an act surcharge: +1 per completed act on three-decade maps, or +1 per two completed acts on eight-decade maps. Purchases must leave at least 1 patience. Each round offers a transfer market, one development and rest. At maximum patience, a second development replaces rest. Developments avoid repeating the previous offer where another is eligible. Below 5 patience, desperation signings also appear.

| Reward | What changes | Patience cost or gain |
| --- | --- | --- |
| Prime-card boost | Upgrade an existing player to that person's highest-rated card; retain his original cap charge. | 1 within a tier, 2 for one tier gained, 3 for two, 4 for more; add 1 for entering S, then cap the base price at 4. |
| Transfer market | Choose one of up to three C-tier-or-better players from different clubs in this decade, and release one of your fifteen. | Base price 1 for C/B, 2 for A, 3 for S, with negotiation below. |
| Development | Upgrade a player or the squad using the catalogue below. | Base price 2 to 4. |
| Rest | Recover patience. | +2, then +1, then zero for consecutive rests; another reward resets the sequence. |
| Desperation | Sign an offered A- or S-tier player, replacing one squad player. | 1 at 3 or 4 patience, free at 1 or 2; no act surcharge. |

The salary cap continues as at most two S-tier and four A-tier charges among all fifteen; B, C and D are unrestricted. Classic remains uncapped. A boost keeps the drafted or signed charge; releasing and re-signing that person establishes a new charge.

An S market signing costs 1 less if he starts. An A or S signing without European Cups costs 1 less when at least five squad players have one. The negotiated base price is at least 1, before the surcharge. An S market signing plays 3 rating points below his card on the bench; a C signing plays 3 above when starting. Swapping places changes these terms. One market re-spin per reward costs 1 for scouting, or 5 for an A/S-only premium market, plus the surcharge. A re-spin requires enough patience for it and a subsequent signing.

| Development | Levels | Base price | Effect |
| --- | ---: | ---: | --- |
| Dressing Room Glue | 1 | 2 | Multiply squad link points by 1.5. |
| Manager Development | 2 | 4 | Raise both manager grades one step per level. |
| European Pedigree | 3 | 2 | Add one European Cup per level for knockout strength. |
| Timeless Training | 2 | 3 | Retain one-half, then one-quarter, of era loss. |
| Versatility | 2 | 2 | Halve, then remove, outfield position loss; keeper penalties remain. |
| Super Sub | 2 | 3 | Add 3, then 5, rating points when substituted on. |
| Finishing Training | 2 | 4 | Develop Talisman for attackers and wide players. |
| Defending Training | 2 | 4 | Develop Rock for defenders and keepers. |
| Playmaking Training | 2 | 2 | Develop Maestro for midfield and wide players. |
| Poacher Training | 2 | 2 | Develop Poacher for attackers and wide players. |

A won boss tie gives its recorded MVP a persistent +1 rating; a lost tie gives the highest-rated outfielder with neither a goal nor an assist −1. These changes and signing terms preserve each card's relative position ratings.

The transfer window offers five players from the departing decade and five from the next, one per position line and club where available. Sign two from each pool for free, releasing four distinct players. If a pool has fewer than two, take all its available offers. The new squad must satisfy its cap. Change formation or rearrange any two squad places before entering the next decade. Formation changes at this stage retain every card, the bench and cap charges; they are unavailable during rounds or boss ties.

Run score sums `(10 + 5 × act index) / (1 + lost ties in that act)` over cleared acts. Multiply by `0.5 + round win rate`, counting draws as half wins; by 1.5 under the salary cap; and by `1 + 0.2 × patience / 20 + 0.15` when no boss tie was lost, omitting the last bonus otherwise. Scores are local, unauthenticated game results.

These rules adapt Eraball's maps, board patience, rewards and squad cap to football; the four six-match rounds are this game's scaling. Legacy Gauntlet saves migrate to the eight-decade Full Odyssey, retaining the squad, upgrades, patience and history. A partial old act restarts at its first round; an old boss stage resumes at the boss. Invalid legacy fields are rejected before migration.

## Circuit, Head to Head and Weekly Challenge

A circuit runs 10 to 20 events, starting in the season decade and cycling through the eras. It rotates an eight-club league, a sixteen-club European Cup, an eight-club knockout, sixteen clubs in groups followed by knockout, and a one-match Super Cup against the decade's strongest club in the selected field. Each event reassesses the squad for its decade. Titles and player awards come from all of the circuit's recorded match events.

Head to Head accepts two team codes containing exact cards and placement. Both codes must use the same rules, salary cap or Classic. It plays two legs, with each team at home in its own decade. A level aggregate adds extra time and penalties in the second leg.

The Weekly Challenge chooses one seed and decade for the whole ISO week, Monday to Sunday in UTC, and always uses the salary cap. Everyone sees the same manager options and the same first squad. Later squads come from the same seeded order, but each must suit the tiers that player still needs, so different picks lead to different clubs. Over 320 test seeds, pairs of drafts following different strategies met the same club on 71% of second draws, 18% of third draws and 8% of fifth draws. These modes have no server-held leaderboard or authenticated competition record.

## Notebook settings

Install Node 20 or later and Python 3.11 or later, then follow the commands in the [README](../README.md#project-files-and-running-your-own-copy). Open the notebook from the repository folder and run all cells. Set `NODE` in its setup cell if Node is not on PATH. On the Windows development machine, use the system Python with `py -3.14`. The current notebook runs the fictional single-season experiment described above; importing an exact browser lineup preserves its players and placement, not its career opponents, qualification or board state.

| Setting | Meaning |
| --- | --- |
| `seed` | A whole number from 0 to 4294967295, fixing the draft and season draws. |
| `decade` | The season decade's start: 1950 through 2020, in steps of ten. |
| `cap` | `True` drafts under the salary cap, as the notebook's settings and the browser do, and checks fifteen supplied players against it; `False`, or leaving it out, is Classic. |
| `manager` | A name from the printed catalogue, or `None` for the seeded demonstration choice. |
| `formation` | Any catalogue formation, independently of the manager, or `None` for the manager's first recorded formation. |
| `person_ids` | Fifteen distinct Wikidata person IDs. An empty list requests the automatic demonstration. |
| `source_cards` | Fifteen exact `{k, p}` card records. These take precedence over `person_ids`. |
| `placement` | `best` assigns the starting eleven; `ordered` retains eleven formation slots followed by four substitutes. |

With IDs alone, the bridge prefers a card from the season decade, then the highest overall, then the source-card key to break ties. A key such as `{'k': 'Q2641:1980', 'p': 'Q17515'}` selects Maradona at Napoli in the 1980s. To preserve a browser lineup, use all fifteen exact `source_cards` and `placement='ordered'`.

Manager and formation settings are notebook experiments. With empty player lists, the demonstration uses five real squad draws, selects three players per draw and assigns an eleven. It does not automate choices in the browser.

The outputs show sources, position losses, era multipliers, teammate points, manager grades, line strengths, match parameters, tables, fixtures, Cup ties, player totals and awards. The notebook prints the data hash and both draft and season seeds, and checks repeatability for unchanged settings. It writes no export unless `export_path` names a persistent file.

## What the model leaves out

The model does not simulate pressing, tactical changes during a match or individual defending actions. The career uses real league fields and broad era differences in its cups, with declared shortcuts for qualification, tournament size and missing squads. It does not reproduce every historical squad or competition rule. The notebook and extra modes retain their fictional formats. The match fit covers modern club-season rosters, with random absences, fatigue, substitutions and curated bonuses excluded from that fit. Historical squads, mixed-era lineups, manager effects, links and era penalties remain outside what was validated. A result from the game is a result under these rules.
