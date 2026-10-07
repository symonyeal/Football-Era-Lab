# Football Era Lab

Draft a football team from eight decades, then play the strongest club squads of your chosen decade. Choose one of five manager and formation combinations, spin five club-decade squads, and place three players from each among eleven starting positions and four bench places. Every spin shows the entire available squad. Position fit, players' strengths, era, club links and the manager change how your team performs.

[Play Football Era Lab](https://symonyeal.github.io/Football-Era-Lab/)

The game runs in your browser. It needs no account, API key, package installation or data downloads. The bundled pool contains 28,773 cards for 16,470 people at 505 club-decades, with 96 managers. Each card identifies its rating source. EA FIFA/FC and Championship Manager data supply positions, ratings and attributes where available; real goals, assists, xG and xA influence who scores and assists. The 1950s to 1970s still rely almost entirely on labelled estimates.

## Build your team and keep playing

Choose the simulation decade, or randomize it. Keep a manager and formation from five options, with two re-spins before choosing. Then spin a squad, select a player and click an empty pitch or bench slot to place him. Pick three people per squad for five squads; one squad re-spin is available during the draft, before picking from that spin. A person can appear at several clubs or decades but can be drafted only once. You can swap any two slots before kick-off and inspect every rating adjustment.

Your team plays a 38-match league against nineteen club squads from the simulation decade and a 16-club European Cup. The league simulates all 380 fixtures, including games between the other clubs. Cup ties have two legs through the semi-finals and a neutral final, with extra time and penalties and no away-goals rule. The squads combine qualifying club records over a decade; these competitions are fictional, using one modern format in every era.

After the season, keep the drafted squad in these modes:

| Mode | What happens |
| --- | --- |
| Era Gauntlet | Play two six-match segments and a boss in each decade, from the 1950s to the 2020s. Board patience determines how long the run lasts. Between segments, choose a boost to a player's prime card, a free agent, a badge or rest. A lost boss can be retried while patience remains. |
| Tournament circuit | Choose 10 to 20 events rotating through an eight-club league, European Cup, eight-club knockout, groups plus knockout, and Super Cup across decades. Titles and awards follow simulated match events. |
| Head to Head | Send a team code to a friend, or paste theirs. Play two legs, each team at home in its own decade. A level aggregate goes to extra time and penalties. |
| Weekly Challenge | Everyone gets the same seed and simulation decade for the ISO week, Monday to Sunday in UTC. Choices remain yours; the challenge has no online leaderboard. |

Progress is saved in this browser. Download a replay to preserve all draft choices, import it to resume, or download a result image to share. A seed recreates the draws with unchanged data and engine; it does not capture your picks. Head to Head codes preserve exact cards and placement. Neither codes nor weekly results are authenticated competitive records.

## Run locally

The static game has no build step. From this repository folder:

```text
python -m http.server 8765 --bind 127.0.0.1
```

Open [127.0.0.1:8765](http://127.0.0.1:8765/). Python serves files; the JavaScript in [app/engine](app/engine/index.js) runs matches. A static host can serve the same `index.html`, `app/` and `data/game.json`. For GitHub Pages, select **Deploy from a branch**, **main**, **/ (root)** in the repository's Settings → Pages.

## Experiment in the notebook

Use Node 20 or later and Python 3.11 or later:

```text
python -m pip install -r requirements.txt
python -m jupyterlab "Football Era Lab.ipynb"
```

On the development machine, use `C:\Python314\python.exe` in place of `python`. The [notebook](Football%20Era%20Lab.ipynb) includes executed outputs for GitHub's preview. Run all cells in JupyterLab to change them. Its Node bridge calls the same JavaScript rating, assignment and season functions as the browser; Python reads data and displays the response. Set `NODE` in the setup cell if Node is not on PATH.

| Setting | Meaning |
| --- | --- |
| `seed` | Integer from 0 to 4294967295 for the draft and season. |
| `decade` | Simulation decade start, 1950 to 2020 in steps of ten. |
| `manager` | Name from the printed catalogue, or `None` for the seeded demonstration choice. |
| `formation` | Catalogue name, or `None` to use that manager option's formation. |
| `person_ids` | Fifteen distinct Wikidata person IDs; an empty list requests a seeded draft demonstration. |
| `source_cards` | Fifteen exact `{k, p}` records; takes precedence over `person_ids`. |
| `placement` | `best` assigns the eleven starters; `ordered` keeps eleven formation slots followed by four substitutes. |

With IDs alone, the bridge prefers a card from the simulation decade, then the highest base rating, then the source-card key to break ties. Use `source_cards` and `placement='ordered'` to retain a browser lineup's exact cards and placement. For example, `{'k': 'Q2641:1980', 'p': 'Q17515'}` identifies Maradona's Napoli card. Notebook manager and formation choices are editable experiments. The automatic demonstration uses five actual squad draws, chooses three players from each and finds a starting eleven; browser picks remain manual.

The notebook displays rating sources, each starter's position loss, era multiplier and links, effective manager grades, line strengths, match parameters, tables, fixtures, Cup ties, player totals and awards. It reports the data hash and both draft and season seeds, checks deterministic replay, and writes no export unless you set `export_path` to a persistent file.

## Read the data and model

The documentation has three parts:

- [Data, sources and rebuilding](docs/DATA.md): inclusion rules, source badges, historical coverage, attribution and local input files.
- [Model and mode rules](docs/MODEL.md): how ratings become line strengths, matches, scoring events and Gauntlet rewards.
- [Checks and measured results](docs/VALIDATION.md): test commands, match calibration, draft balance and the limits of each check.

Ratings express a game's assessment of a player. Estimates for earlier decades extrapolate from rated cards of 1989 to 2025. The match model was fitted on modern club seasons; mixed-era drafts, historical squads, chemistry, manager grades and era penalties are outside that validation. The supplied squads can omit players or combine people who never shared a season. Appearances and goals from Wikidata are apportioned whole-stint totals. The 2020s include only available source years.

The earlier Python game, its notebook, career, rooms, mini-games and reports remain in the [v1 tag](https://github.com/symonyeal/Football-Era-Lab/tree/v1). Its saves and competitive profiles use a different scheme and have no automatic migration. That version's tests and commands apply to its implementation.

## Check the game

```text
node --test tests/engine/*.test.mjs
python -m pip install -r requirements-analytics.txt
python -m unittest discover -s tests -p test_pipeline.py -v
python -m pytest tests/test_calibration.py -q -p no:cacheprovider
```

The GitHub workflow also executes the notebook. Browser acceptance and balance measurement commands are in [VALIDATION.md](docs/VALIDATION.md). Data rebuilding is separate from gameplay.

Code is MIT licensed. Source data keeps its own terms, documented in [DATA.md](docs/DATA.md) and `data/manifest.json`. Raw ratings archives, Championship Manager databases and GPL results files remain local. Publisher licence declarations do not establish rights to every underlying game asset. No portraits, card artwork or club badges are bundled. This independent project is unaffiliated with Eraball, EA, FIFA, Konami, Wikidata or the data publishers.
