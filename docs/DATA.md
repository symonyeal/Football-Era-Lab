# Data, sources and rebuilding

The browser and notebook load `data/game.json`. The bundle contains 28,773 player cards, 16,470 people, 505 club-decades and 96 managers. `data/manifest.json` records source attribution, model evaluation and unresolved curated links; `data/validation.json` records coverage and the exact bundle's SHA-256 hash. Match calibration is a separate report in `data/calibration.json`.

## What a squad represents

Club selection combines top-tier domestic results and European Cup progress. Domestic results cover England, Spain, Italy, Germany, France, Netherlands and Portugal, with different historical coverage. European entrants add clubs beyond those leagues. A season belongs to the decade of its start year; a 2020s card represents available years, not a completed decade. Opponent selection starts with the top nineteen eligible club-decades by these result ranks. The game rates their best elevens to order the competition field and choose each decade's boss.

Dated Wikidata club stints supply membership and, where recorded, league appearances and goals. A card needs ten apportioned appearances, or the declared notability rule when appearances are missing: at least two covered seasons and twelve Wikipedia language links. Whole-stint totals are spread over years rather than measured separately by decade. A qualifying squad can combine players who never shared a season, omit others and inherit errors in dates, names or totals. The spin lists every qualifying supplied card. This is a partial archive of club records, not a census of every registered player.

Only club-decades with at least fifteen cards and a goalkeeper can be drafted or oppose you. The pipeline excludes people explicitly marked female by Wikidata's P21 field and records age conflicts. That check establishes the absence of that label in this export; it cannot establish complete or correct gender metadata upstream.

Wikidata person IDs distinguish people from their many club-decade cards. The same person can be drafted only once. EA and Championship Manager links use names, birth dates and season club evidence; Understat uses name and club-season evidence because its source lacks birth dates. External club IDs are mapped through linked players' clubs. These links remain fallible. EA legend links use explicit aliases and available nationality evidence. Unresolved curated signature players and duos remain listed in the manifest.

## Rating badges and attributes

| Badge | Meaning |
| --- | --- |
| `f` | EA FIFA/FC at this club in a season inside the stint, from FIFA 07 to FC 26. |
| `c` | Championship Manager at this club in a season inside the stint, converted to the EA rating scale. |
| `i` | EA Icon/Hero reconstruction, with the age adjustment. |
| `n` | Nearby EA season, within two seasons of the stint, adjusted for age. |
| `m` | Nearby Championship Manager season, within two seasons, adjusted for age. |
| `e` | Fitted estimate when none of those sources supplies a rating. |

Priority follows the table order. Same-club EA and CM ratings average the best three available season ratings, or fewer when fewer exist. Slot ratings come from the best snapshot used for that source and are scaled to the card's overall; face stats keep that snapshot's values. Nearby ratings and Icon reconstructions retain their different evidence labels. See [MODEL.md](MODEL.md) for the conversion fit and age curve.

EA and CM cards carry fifteen position ratings and six face stats where available. Natural positions first use game databases, then EA legends or the nearest available engine season, then Transfermarkt and finally Wikidata's declared mapping. Position labels that fall back to Wikidata are coarse; the "wing half" rule is documented in the model. Formations, manager club associations, signature players, Timeless/Maestro tags and duo lists are curated under `pipeline/curated/`. European Cup experience inferred from a club stint does not show that the player appeared in every winning tie.

This build has 5,910 cards with recorded real statistics. Transfermarkt supplies minutes, goals and assists from available competitions; Understat supplies minutes, xG and xA for its covered leagues. The two sources have separate minute denominators and incomplete club-season coverage. Stats are summed only within the card's stint years. They influence simulated scorer and assister selection; simulated events remain separate from historical totals.

## Coverage in the shipped build

| Decade | Clubs | Cards | `f` | `c` | `i` | `n` | `m` | `e` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1950s | 43 | 1,587 | 0 | 0 | 2 | 0 | 0 | 1,585 |
| 1960s | 59 | 2,245 | 0 | 0 | 7 | 0 | 0 | 2,238 |
| 1970s | 67 | 2,721 | 0 | 0 | 11 | 0 | 0 | 2,710 |
| 1980s | 72 | 3,548 | 0 | 1,089 | 30 | 0 | 562 | 1,867 |
| 1990s | 73 | 4,884 | 0 | 2,578 | 68 | 0 | 1,842 | 396 |
| 2000s | 70 | 6,196 | 1,126 | 1,273 | 73 | 1,668 | 898 | 1,158 |
| 2010s | 70 | 5,697 | 3,686 | 0 | 10 | 1,556 | 46 | 399 |
| 2020s | 51 | 1,895 | 1,369 | 203 | 0 | 270 | 23 | 30 |

The 1950s to 1970s remain almost entirely estimates. The integrated CM seasons are 1989-90, 1993-94, 1995-96, 1998-99, 2001-02, 2020-21 and 2021-22. Earlier community databases can be added when supplied and linked; they are not included in this release. A curated career-era label on an Icon card does not make its reconstructed rating a contemporaneous measurement.

## Sources and their published terms

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
| [James Curley, engsoccerdata](https://github.com/jalapic/engsoccerdata) | Derived club rankings and scoring baselines; local real-result calibration inputs. | GPL (>= 2). |

Code is MIT licensed; data retains its source terms. Raw results, rating archives and CM databases stay in the persistent local work folder. Omitting raw files does not resolve every obligation for derived or redistributed material. Publisher declarations do not establish an EA licence for artwork or every underlying right. No portraits, badges or card artwork are shipped. Keep source attribution and the manifest with a redistributed bundle and review the original source terms.

## Rebuild from local inputs

Install the pipeline dependencies from the repository root:

```text
python -m pip install -r requirements-analytics.txt
```

Set `FEL_INPUTS` to the persistent raw-input folder and `FEL_CACHE` to the persistent source/build cache. On the development machine these are `Claude Func Folder\football-v2\inputs` and `Claude Func Folder\football-v2\cache` under the shared workspace. Elsewhere, the default is the repository's ignored `work/pipeline/` folder. Do not commit raw archives, cache pickles or secrets. Read only pickle caches you trust.

| Input under `FEL_INPUTS` | Contents |
| --- | --- |
| `fc24.zip` | Stefano Leone's complete male edition CSV. |
| `fut23.zip` | Lucas Silva's downloaded Icon/Hero CSV. |
| `esdb.sqlite` | `database.sqlite` extracted from Hugo Mathien's dataset and renamed. |
| `nyagami_ea-sports-fc-25-database-ratings-and-stats.zip` | `male_players.csv`. |
| `justdhia_ea-sports-fc-26-player-ratings.zip` | `ea_fc26_players.csv`. |
| `davidcariboo_player-scores.zip` | Transfermarkt `players.csv` and `appearances.csv`. |
| `codytipton_player-stats-per-game-understat.zip` | Understat `general_game_stats.csv` and `lineup_stats.csv`. |
| `cm0102/<manifest folder>/` | Original `.dat` files for each configured CM season. |

`pipeline/curated/cm0102.json` names each CM folder, its real season and its stored-to-real year shift. The reader follows [CM0102Patcher record layouts](https://github.com/nckstwrt/CM0102Patcher) and [CM0102 attribute conversion](https://github.com/agevak/CM0102). Validate record sizes and birth-year shifts before adding a database; the game stores many retro seasons relative to its original 2001 start year.

The ordered build steps are `clubs`, `universe`, `stints`, `squads`, `persons`, `engines`, `stats`, `model`, `export`:

```text
python -m pipeline.build
python -m pipeline.calibrate
python -m pipeline.build export
python -m pipeline.validate
```

The first build downloads/caches result and Wikidata records and reads the local engine inputs. Calibration fits the match model from edition-specific squads and stores its report. The final export embeds those match parameters, and validation records the hash of that export. To resume existing inputs and caches, name the needed steps, for example `python -m pipeline.build model export`. Rebuild all affected downstream steps after changing an upstream source or rule; otherwise the pipeline uses cached values. Run calibration again when its engine rating rules change. Gameplay never rebuilds or downloads data.
