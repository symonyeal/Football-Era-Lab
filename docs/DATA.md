# Where the players and squads come from

The archive combines club records with ratings from football games. Club records determine which version of a player belongs in a squad. EA and Championship Manager supply ratings and attributes where they exist; estimates fill the remaining gaps. Recorded scoring statistics have a separate role in choosing the scorers and assist providers of simulated goals.

The shipped bundle contains 52,976 cards for 25,382 people at 910 club-and-decade squads belonging to 268 clubs, plus 96 managers. A person can have several cards, but the draft permits that person only once. The evidence is much stronger for later decades than for the 1950s to 1970s.

## A decade squad covers a period at a club

Domestic league results and European Cup progress select the clubs. Each domestic league contributes its twenty best-ranked clubs in every decade, counting clubs with at least three top-flight seasons in that decade. The domestic inputs cover England, Spain, Italy, Germany, France, Netherlands and Portugal, with different historical coverage in each. European entrants add clubs from outside those leagues. A season belongs to the decade in which it starts. A 2020s card covers the available years, not a completed decade.

The five major leagues supply 185 of the 268 clubs: 45 English, 35 Spanish, 38 Italian, 35 German and 32 French. The results rule selects twenty clubs from each of those leagues in every decade except the German 1950s: the German league results begin with the Bundesliga in 1963, so three German clubs of that decade come from European results instead. A selected club-decade then needs fifteen qualifying cards including a goalkeeper, described below, or it is left out. The table counts the clubs each league has in the game:

| Decade | England | Spain | Italy | Germany | France |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1950s | 20 | 10 | 20 | 1 | 13 |
| 1960s | 20 | 14 | 20 | 18 | 11 |
| 1970s | 20 | 14 | 20 | 20 | 18 |
| 1980s | 20 | 19 | 20 | 19 | 19 |
| 1990s | 20 | 20 | 20 | 20 | 20 |
| 2000s | 20 | 20 | 20 | 20 | 20 |
| 2010s | 20 | 20 | 20 | 20 | 20 |
| 2020s | 19 | 16 | 15 | 13 | 10 |

Every shortfall below twenty comes from those two steps. The largest are in the early Spanish and French decades and in the 2020s, which the sources cover only to 2024. Missing club-decades stay out of the player draft. The career can field a labelled stand-in for a real rival missing from that archive, as described below.

Wikidata's dated club records supply the players. A qualifying card needs at least ten appearances allocated to that decade. When appearance totals are missing, it can qualify through the declared notability rule: at least two covered seasons and twelve Wikipedia language links. Whole-spell appearances and league goals are spread across the covered years. They are not separately observed totals for every decade.

These records can put players in the same decade squad even when they never shared one season. Missing names, wrong dates and incomplete totals can also affect membership. The roster shows every qualifying supplied card for a draw; the archive does not contain every player ever registered at the club.

A squad needs at least fifteen cards and a goalkeeper to be eligible for the draft. The nineteen highest-ranked eligible club squads by domestic and European results still supply the fictional opposition field used by the notebook, Gauntlet and circuit. Their best elevens are rated by the engine to order that field. The browser career uses the real league membership of each individual season.

The pipeline excludes people explicitly labelled female by Wikidata's sex-or-gender field, P21, and records age conflicts. The exported people have no cached explicit female label. That check cannot establish complete or correct gender information in the source.

## Real league seasons and the squads they can supply

The career's league tables are bundled in `game.json` under `lg`, European Cup entrants under `ec`, and names of clubs outside the card archive under `xn`. A season is labelled by its start year, so `2024` means 2024/25. Every covered league has a continuous series from its first available season through 2024/25.

| League | Available seasons | Season tables | Real club-season rows | Rows with a club in the card archive |
| --- | --- | ---: | ---: | ---: |
| England | 1950/51–2024/25 | 75 | 1,583 | 97.5% |
| Spain | 1950/51–2024/25 | 75 | 1,388 | 90.1% |
| France | 1950/51–2024/25 | 75 | 1,462 | 88.2% |
| Germany | 1963/64–2024/25 | 62 | 1,114 | 94.0% |
| Italy | 1950/51–2024/25 | 75 | 1,354 | 91.7% |
| Netherlands | 1956/57–2024/25 | 69 | 1,234 | 87.6% |
| Portugal | 1994/95–2024/25 | 31 | 542 | 91.7% |

These percentages count whether the real club has any cards in the archive. They do not establish that it has fifteen usable players for the particular season. The tables come from engsoccerdata result aggregates. The two missing seasons, England 2022/23 and France 1994/95, use sourced final-table facts in [league_gaps.csv](../pipeline/curated/league_gaps.csv). Names for the same club within a season are merged by club ID. Partial promotion and relegation play-off records are excluded when their match count is below three quarters of the league maximum.

The stored order uses wins and draws to recompute period-rule points, then goal difference and goals scored. Historical point deductions, administrative title awards and every league's particular tie-break rules are outside that calculation. The career's history comparison uses those derived records.

For each rival, [app/club.js](../app/club.js) first takes cards whose dated spell covers the season. If the squad is short or has no goalkeeper, it adds players from the same club's nearest spell years, at most three years away, checking adjacent decades where needed. Person IDs are deduplicated, and your current players are removed from every rival.

If fewer than fifteen players or no goalkeeper remain, the rival uses fifteen generated players labelled as a stand-in. Its strength is estimated from the real win-and-draw record, normalized to three points per win, using the relation between points per game and rated squads in that league-season. A sparse fit uses a declared slope of six rating points per point per game, and the result stays between 55 and 90. An outside European entrant with no usable league record receives the declared default of 74. Generated players are excluded from the draft and transfer market.

European Cup records cover complete entrant fields through 2015/16; 2016/17 records only the final, and the later curated seasons record the last eight. Qualification fills those incomplete fields using previous league finishes and available archive clubs. Domestic cup holders and complete worldwide tournament fields are not supplied. The [competition rules](MODEL.md#club-career) explain how these gaps affect the career.

## The source label explains what rated a card

| Badge | Browser label | Evidence |
| --- | --- | --- |
| `f` | EA FC | The same person at the same club, in an edition inside his recorded spell, from FIFA 07 to FC 26. |
| `c` | CM 01/02 | The same person at the same club in a CM database season inside that spell, converted to the EA scale. |
| `i` | Icon / Hero | An EA legend-card reconstruction matched to the person and adjusted for age. |
| `n` | EA near | An EA edition within two seasons of either recorded spell boundary, at any club, adjusted for age. |
| `m` | CM near | A CM database within two seasons of either boundary, at any club, adjusted for age. |
| `e` | Estimated | A prediction fitted on engine-rated cards when the preceding sources supply no rating. |

The table gives the source priority. Direct same-club EA or CM evidence averages the best three season ratings, or fewer if fewer exist. Position ratings come from the best snapshot used for that source and are scaled to the overall. The six displayed attributes keep that snapshot's values. A nearby or reconstructed card retains its own label, so it remains distinguishable from an in-period same-club rating.

The shipped bundle's nearby fallback compares with spell boundaries and can miss an interior snapshot from another club during a long recorded spell. The pipeline now measures distance from the full interval for future rebuilds; bundled cards remain unchanged. Unreliable source dates still need checking. [MODEL.md](MODEL.md#which-version-of-the-player-gets-rated) describes the rules and conversion fits.

EA and CM profiles provide fifteen position ratings and six attributes where available. Natural positions use game profiles first, then EA legend data or the nearest available engine season, then Transfermarkt's specific position and finally a mapping of Wikidata labels. The last fallback is coarse; the model document explains the "wing half" rule.

Manager club associations, signature players, formations, duo partnerships and Timeless/Maestro tags are curated in [pipeline/curated/](../pipeline/curated/tags.json). European Cup experience inferred from a club spell does not establish that the player appeared in every winning tie.

## Joining records can introduce mistakes

Wikidata person IDs keep one person distinct from his club-and-decade cards. EA and CM records are matched by names, birth dates and season club evidence. Understat lacks birth dates in the supplied source, so its joins use names and club-season evidence. External club IDs are mapped using linked players' clubs. Each of these matches can be wrong.

EA legend records use explicit aliases and available nationality evidence. A manager's signature player is matched first among the cards of the clubs and decades he managed, then only by an exact full name anywhere. Matching by any shared name had linked short names to better-known namesakes: Javier Clemente's "Dani" at Athletic Bilbao to Dani Carvajal, and Helenio Herrera's "Luis Suárez" to the Uruguayan rather than his Barcelona and Inter player. Two names ambiguous even within a manager's own squad are curated in full: "Fernando Reges" and "João Domingos Pinto". The 14 signature names and one duo still unmatched are listed in the manifest rather than guessed. The notebook and each card's source label let you inspect the results of the joins.

## Historical statistics and simulated statistics have different meanings

This build has 9,254 cards with recorded real statistics. Transfermarkt supplies minutes, goals and assists from its available competitions; Understat supplies minutes, expected goals (xG) and expected assists (xA) from its covered leagues. xG measures scoring chances, while xA measures chances created by a player's passes.

The two sources have separate minute totals and incomplete club-season coverage. Their records are summed only within the card's spell years. They influence which player receives a simulated goal or assist. The totals and awards produced by a game run belong to that simulation and remain separate from the historical records.

## Coverage by decade

The six badge columns below use the labels defined above. A nearby rating remains separate from a direct same-club rating, and an Icon reconstruction remains separate from a contemporary edition.

| Decade | Clubs | Cards | `f` | `c` | `i` | `n` | `m` | `e` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1950s | 70 | 2,861 | 0 | 0 | 2 | 0 | 0 | 2,859 |
| 1960s | 98 | 3,876 | 0 | 0 | 8 | 0 | 0 | 3,868 |
| 1970s | 114 | 4,808 | 0 | 0 | 13 | 0 | 0 | 4,795 |
| 1980s | 126 | 6,219 | 0 | 1,723 | 37 | 0 | 1,035 | 3,424 |
| 1990s | 143 | 9,188 | 0 | 4,629 | 83 | 0 | 3,716 | 760 |
| 2000s | 140 | 12,463 | 2,120 | 2,251 | 94 | 3,053 | 1,940 | 3,005 |
| 2010s | 139 | 10,970 | 6,585 | 0 | 12 | 3,213 | 76 | 1,084 |
| 2020s | 80 | 2,591 | 1,845 | 273 | 0 | 401 | 36 | 36 |

The 1950s, 1960s and 1970s are almost entirely estimates. The integrated CM seasons are 1989-90, 1993-94, 1995-96, 1998-99, 2001-02, 2020-21 and 2021-22. Earlier community databases can be added when supplied and linked; they are not included in this release. Giving an Icon card a career-era label does not turn its reconstructed rating into a contemporary measurement.

## Source attribution and terms

These are the dataset declarations recorded for the release. They describe different sources; the repository's code licence does not replace them.

| Source | Used for | Publisher's stated terms |
| --- | --- | --- |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) | Stints, dates, league appearances/goals, birth dates, nationality, caps, language coverage and last-resort positions. | Structured data CC0 1.0. |
| [Stefano Leone, EA Sports FC 24 complete player dataset](https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset) | FIFA 15 through FC 24 ratings, positions, position ratings and attributes. | CC0 declaration. |
| [Hugo Mathien, European Soccer Database](https://www.kaggle.com/datasets/hugomathien/soccer) | FIFA attributes from 2007 to 2016; pitch coordinates from real lineups, 2008 to 2016. | ODbL 1.0 declaration. |
| [nyagami, EA Sports FC 25 database](https://www.kaggle.com/datasets/nyagami/ea-sports-fc-25-database-ratings-and-stats) | FC 25 ratings, positions and attributes. | Apache 2.0 declaration. |
| [justdhia, EA Sports FC 26 player ratings](https://www.kaggle.com/datasets/justdhia/ea-sports-fc-26-player-ratings) | FC 26 ratings, positions and attributes. | CC0 declaration. |
| [David Caribou, Football Data from Transfermarkt](https://www.kaggle.com/datasets/davidcariboo/player-scores) | Minutes, goals, assists and sub-positions, 2012 onwards. | CC0 declaration. |
| [Cody Tipton, Understat player stats per game](https://www.kaggle.com/datasets/codytipton/player-stats-per-game-understat) | xG, xA and minutes, top five leagues and Russia, 2014 onwards. | MIT declaration. |
| [Championship Manager 01/02 Starter Kit](https://github.com/JonBetts/CM0102-Starter-Kit) | Sports Interactive's original and community season databases: ability, positions and attributes. | No stated database licence; raw files are not redistributed. |
| [Lucas Silva, FIFA 23 Ultimate Team players database](https://www.kaggle.com/datasets/lucas142129silva/fifa-23-ultimate-team-players-database) | Base Icon/Hero reconstructions. The downloaded file dated 2024-06-07 contains FC 24 cards despite the page title. | CC0 declaration. |
| [James Curley, engsoccerdata](https://github.com/jalapic/engsoccerdata) | Derived club rankings, scoring baselines, league-season tables and European Cup stages; local real-result calibration inputs. | GPL (>= 2). |
| Wikipedia final tables: [2022/23 Premier League](https://en.wikipedia.org/wiki/2022%E2%80%9323_Premier_League) and [1994/95 French Division 1](https://en.wikipedia.org/wiki/1994%E2%80%9395_French_Division_1) | Final-table facts for the two league-seasons missing from the results source. | Facts extracted from CC BY-SA pages; only derived table records ship. |

The code is MIT licensed and the data retains its source terms. Raw results, rating archives and CM databases stay in the persistent local work folder. Leaving raw files out of the repository does not resolve every obligation for derived or redistributed data. Publisher declarations do not establish rights to EA artwork or every underlying asset. No portraits, badges or card artwork are supplied. Retain the source attribution and manifest with a redistributed bundle, and consult the original terms.

## Rebuilding the bundle

The published browser game uses the supplied data. Rebuilding requires the Python dependencies and local source files:

```text
python -m pip install -r requirements-analytics.txt
```

The default raw-input and cache folders are `work/pipeline/inputs/` and `work/pipeline/cache/`, both ignored by Git. Set `FEL_INPUTS` or `FEL_CACHE` to use an existing persistent folder elsewhere. Keep raw archives, cached pickle files and secrets out of commits. Read only pickle caches you trust.

| File under `FEL_INPUTS` | Required contents |
| --- | --- |
| `fc24.zip` | Stefano Leone's complete male edition CSV. |
| `fut23.zip` | Lucas Silva's downloaded Icon/Hero CSV. |
| `esdb.sqlite` | `database.sqlite` extracted from Hugo Mathien's dataset and renamed. |
| `nyagami_ea-sports-fc-25-database-ratings-and-stats.zip` | `male_players.csv`. |
| `justdhia_ea-sports-fc-26-player-ratings.zip` | `ea_fc26_players.csv`. |
| `davidcariboo_player-scores.zip` | Transfermarkt `players.csv` and `appearances.csv`. |
| `codytipton_player-stats-per-game-understat.zip` | Understat `general_game_stats.csv` and `lineup_stats.csv`. |
| `cm0102/<manifest folder>/` | Original `.dat` files for each configured CM season. |

[pipeline/curated/cm0102.json](../pipeline/curated/cm0102.json) names each CM folder, its real season and the shift between stored and real years. The reader follows [CM0102Patcher's record layouts](https://github.com/nckstwrt/CM0102Patcher) and the [CM0102 attribute conversion](https://github.com/agevak/CM0102). Check record sizes and birth-year shifts before adding a database; many retro databases store dates relative to the game's original 2001 start year.

The build runs in this order: `clubs`, `universe`, `stints`, `squads`, `persons`, `engines`, `stats`, `model`, `export`.

```text
python -m pipeline.build
python -m pipeline.calibrate
python -m pipeline.build export
python -m pipeline.validate
```

The first command downloads and caches result and Wikidata records, then reads the local game-engine inputs. Calibration fits the match model using edition-specific squads and saves its report. The next export embeds those parameters; validation records the hash of that export.

The full export includes the real league and European records through [pipeline/leagues.py](../pipeline/leagues.py). To add or refresh those records in an existing `game.json` from persistent caches, run `python -m pipeline.leagues`, then `python -m pipeline.validate`. The league step keeps the existing cards and other game keys; validation updates the fingerprint for the changed bundle.

To resume from existing inputs and caches, name the required steps, for example `python -m pipeline.build model export`. After changing a source or rule, rebuild every affected downstream step; otherwise saved intermediate values remain in use. Run calibration again when its engine-rating rules change. Gameplay does not run this pipeline or download the raw sources.

### Widening the club pool without changing existing cards

`python -m pipeline.build expand` adds clubs to an existing cached build while keeping every published card. On first use it copies the cached build and the published `game.json` to `expansion-baseline` under `FEL_CACHE`. It then runs six phases: `sources`, `facts`, `engines`, `stats`, `model` and `export`. New players are rated with the original Championship Manager conversion and the original estimate model, both rebuilt from the unchanged original inputs and checked against their recorded reports; neither is refitted on the larger archive. The export stops with an error if any original card or the match calibration changes.

The 2026-10-07 expansion, which raised the league selection from ten to twenty clubs per league and decade, kept all 28,773 earlier cards unchanged and added 24,203. To resume an interrupted expansion, name the remaining phases, for example `python -m pipeline.build expand model export`.

## Files that describe a build

| File | Contents |
| --- | --- |
| [game.json](../data/game.json) | Cards, people, clubs, managers, match settings, real league tables and European Cup stages loaded by the browser and notebook. |
| [manifest.json](../data/manifest.json) | Source attribution, model evaluation and unresolved curated links. |
| [validation.json](../data/validation.json) | Coverage and the SHA-256 hash identifying the exact bundle. |
| [calibration.json](../data/calibration.json) | The separate match-fit report, fixture coverage and parameters. |

A SHA-256 hash is a file fingerprint. Matching hashes identify the same bytes, allowing the notebook, tests and coverage report to refer to one particular export. The [validation document](VALIDATION.md) explains the results without treating a clean structural check as proof that all upstream football records are correct.
