# Football Era Lab

Draft a football team across eight decades, from the 1950s to the 2020s. Choose one of five manager and formation combinations, then make five club-and-decade spins. Each spin shows every available player in that squad. Choose three people and place them among eleven starting positions and four bench places. Your finished team plays a 38-match league and a 16-club European Cup against squads from the simulation decade.

## Play locally

The browser game is static and has no build step. From this repository folder:

```text
python -m http.server 8765 --bind 127.0.0.1
```

Open [127.0.0.1:8765](http://127.0.0.1:8765/). Python only serves the files. The JavaScript in `app/engine/` runs matches in the browser, with the bundled `data/game.json`; gameplay needs no Python packages, account, API key or new data downloads. A static host can serve the same files.

Choose the simulation decade before the draft. Player cards keep the decade of the club squad you selected them from. Moving a player between decades changes his effective rating. Position fit, manager grades, formation shape, chemistry and bench depth also affect the team. You can swap slots before kick-off and inspect the rating breakdown.

The league contains your team and nineteen ranked club squads. All fixtures are simulated, including games between other clubs. The Cup has two legs in its first three rounds and a neutral final. Tied aggregates or finals go to extra time and penalties. These are fictional competitions using historical club-decade pools, not reconstructions of a specific season's fixtures.

After the season, take the same fifteen people into Era Gauntlet or a tournament circuit. The Gauntlet starts in the 1950s and advances when you beat the strongest available club of the decade. A loss keeps you in that decade for another attempt. The circuit rotates through eight decades and five competition formats over your choice of 10 to 20 events. Era adjustments are recalculated for each encounter. See [the challenge rules](docs/MODES.md).

## Inspect the same engine in the notebook

Use Node 20 or later and Python 3.11 or later:

```text
python -m pip install -r requirements.txt
python -m jupyterlab "Football Era Lab.ipynb"
```

On the development machine, use `C:\Python314\python.exe` in place of `python`. The notebook calls [the JavaScript engine](app/engine/index.js) through Node. Its editable settings select a seed, simulation decade, manager, formation and fifteen person IDs. You can instead preserve exact club-decade cards with fifteen source-card records. A labelled notebook demonstration makes a seeded draft and places the best starting eleven; the browser lets you choose and place every person yourself. GitHub's notebook preview cannot execute cells.

## Data and limits

Squads come from dated Wikidata club stints. "Available squad" means all records that meet the pipeline's inclusion rules, not a complete census of everyone who played for a club. Apps and goals are apportioned across decades from whole-stint totals. Missing records and coarse historical position labels affect coverage. The pool covers male football and selected European clubs; the 2020s contain only the source seasons available when the data was built.

Each rating shows its source: a published FIFA/FC edition (`f`), a nearby edition extrapolation (`n`), an EA Icon/Hero reconstruction (`i`), or a fitted estimate (`e`). Earlier decades rely heavily on reconstructions and estimates. The rating model's held-out errors concern resemblance to FIFA ratings, not proof of historical player quality. Match calibration and design assumptions are recorded separately. See [data and attribution](data/README.md), [the data pipeline](docs/DATA_PIPELINE.md), [the model](docs/MODEL.md) and [checks and evidence](docs/VALIDATION.md).

V2 supplies the draft, season, Era Gauntlet and tournament circuit through the same engine. Head to Head and Weekly Challenge remain future work. The previous Python server and its peripheral modes are preserved in [the v1 archive](_archive/20261006-v1/README.md). They are outside the active v2 browser loop.

## Check and rebuild

```text
node --test tests/engine/*.test.mjs
python -m pip install -r requirements-analytics.txt
python -m unittest discover -s tests -p test_pipeline_v2.py -v
python -m pytest tests/engine/test_calibration.py -q -p no:cacheprovider
```

The [rebuild guide](docs/DATA_PIPELINE.md) explains the licensed local inputs and persistent source cache. The game does not run the pipeline when opened.

The project's code is MIT licensed. Third-party data keeps its own terms, including the GPL terms of the results source used for derived rankings and scoring rates. Publisher declarations of CC0 for ratings datasets do not establish an EA licence for artwork or every underlying right. No player portraits, card artwork or club badges are bundled. This independent football game is unaffiliated with Eraball, EA, FIFA, Konami, Wikidata or the data publishers.
