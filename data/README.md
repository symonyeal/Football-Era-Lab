# Data attribution and limits

`game.json` contains person facts, club-decade squads, source-labelled ratings, curated managers and formations, and ranked opponents. `manifest.json` describes the generated data and unresolved links. `validation.json` and `calibration.json` hold the current coverage and model reports. Counts are generated from the bundle; the notebook reads and displays them directly.

| Source | Used for | Published terms |
| --- | --- | --- |
| [Wikidata](https://www.wikidata.org/wiki/Wikidata:Licensing) | Club stints, dates, appearances/goals where present, positions, birth dates, nationality, caps and Wikipedia coverage. | Structured data: CC0 1.0. |
| [EA Sports FC 24 complete player dataset, Stefano Leone](https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset) | FIFA 15 through FC 24 edition ratings and positions. | CC0, as declared by the dataset publisher. |
| [FIFA 23 Ultimate Team players database, Lucas Silva](https://www.kaggle.com/datasets/lucas142129silva/fifa-23-ultimate-team-players-database) | FC 24 base Icon/Hero reconstruction ratings from the downloaded file. | CC0, as declared by the dataset publisher. |
| [engsoccerdata, James Curley](https://github.com/jalapic/engsoccerdata) | Derived domestic/European club rankings and decade scoring baselines; local real-result calibration inputs. | GPL (>= 2), as declared by the source package. |

The raw results files and ratings archives stay in the persistent local work folder and are not bundled here. Derived results remain attributed to engsoccerdata; raw-file omission alone does not settle all redistribution obligations. Publisher CC0 declarations for FIFA/FC datasets do not establish independent permission from EA for every underlying right. No game artwork, portraits, badges or account data are included.

Club-decade squads combine qualifying dated records over the decade. They can be incomplete and contain errors; decade appearances and goals are apportioned whole-stint totals, not independently measured seasonal totals. `f` identifies a matching edition rating, `n` a nearby edition/club extrapolation, `i` an EA legend reconstruction and `e` a fitted estimate. Tags and manager grades are game rules. Historical positions use declared mappings to modern roles. Early decades rely on estimates and reconstructions; the 2020s reflect only available source years.

Code is MIT licensed. Data keeps its own terms. For a new distribution, read the original source terms and keep the manifest and source attributions with the derived bundle.
