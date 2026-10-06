# Era Eleven

Draft football across generations: five spins award three players each, then fifteen players become eleven starters and four substitutes under a drawn manager and formation. Play a match, test the same squads thousands of times, or run a 38-match gauntlet.

The main demo is **[Football Era Lab.ipynb](Football%20Era%20Lab.ipynb)**. It gives you an interactive game and editable Python cells for checking ratings, changing role weights, swapping substitutes, and testing model assumptions. The browser interface uses the same engine.

![Era Eleven draft screen](docs/game-preview.png)

## Run the notebook

Python 3.11 or later is recommended. This project was tested with Python 3.14. From the repository folder:

```text
python -m pip install -r requirements.txt
python -m jupyterlab "Football Era Lab.ipynb"
```

Choose **Run All**, then use the draft buttons. VS Code with the Jupyter extension also works. GitHub shows the saved notebook outputs; its preview cannot run interactive controls.

## Play in your browser

```text
python -m era_eleven.server
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765). The server binds to your computer's loopback address and needs no account or API key. Change the port with `--port 8766` if necessary.

1. Choose All eras, Legends, 1990s, 2000s, 2010s, or 2020s.
2. Draw a manager and a compatible formation together.
3. Spin five times. Each spin adds all three revealed cards.
4. Inspect the eleven and four substitutes. Swap a compatible substitute if you prefer.
5. Play a match, repeat 2,000 trials, or try the gauntlet. Save your squad and result as JSON.

Seeds reproduce the manager, formation, draft, and matches. A new seed gives a new draw. The sampler selects one card per person and reserves enough roles for a feasible eleven and reserve groups. It does not wait until the last spin to fix a broken squad.

## Data you can inspect

The offline pool contains **625 player cards** from two community datasets whose publishers declare CC0:

| Pool | Attributes | Historical meaning |
| --- | --- | --- |
| Legends, 1990s, 2000s | FC 24 base ICON and HERO cards | Game reconstructions, with curated broad career-era tags |
| 2010s | FIFA 18 career snapshot | Published edition ratings from 2017 |
| 2020s | FC 24 career snapshot | Published edition ratings from 2023 |

Earlier classics, including Pelé, Cruyff, and Yashin, join the Legends pool. The limited pre-1990 subset cannot cover a complete formation independently. This initial subset uses male-player data. It does not claim to contain all historical players or the latest FC ratings.

The [manifest](data/manifest.json) records the sources, retrieved date, subset choices, and player-file SHA-256. The Ultimate Team dataset's page title says FIFA 23, but the downloaded file is an FC 24 snapshot dated 7 June 2024. Missing detailed historical-card attributes remain missing. If the match model uses its stamina fallback, the notebook names every affected player.

EA/FIFA and PES/eFootball CSV adapters are in [data.py](era_eleven/data.py). PES groups are explicitly labelled aggregation proxies, with the field mapping retained. Place your exports in `data/local/`, which Git ignores. Imported EA and PES scales still require calibration before a serious comparison.

## What the analytics mean

The engine assigns players to formation slots with SciPy's exact linear assignment solver. Attack, control, defence, and goalkeeper scores use different role/attribute weights. Tactical fit and nearby player complementarity add small heuristic effects. Country and club continuity contribute to the chemistry proxy.

Goals use a standard independent Poisson structure with log-linear attack, defence, and home effects. The showcase match samples shots and goal outcomes, so its score reconciles exactly with its goal events. Suitable fresh substitutes can change the lineup at minute 60. Repeated trials and the showcase match use the same expected rates.

**The player-to-goal coefficients and chemistry weights are game settings, not fitted estimates.** Cross-era calibration, historical predictive accuracy, and fitted adjusted plus-minus have not been established. The notebook includes sensitivity analysis and separates Monte Carlo sampling error from unmeasured model uncertainty. Gauntlet opponents are generated drafts, not historical club-season teams.

An optional notebook section fetches the 2022 World Cup final from StatsBomb Open Data. It computes measured xG, non-penalty xG, shot-linked xA, pass completion, pressures, forward moves, and an illustrative expected-threat grid. These quantities are kept separate from the game's simulated statistics. Raw events stay in an ignored local cache under StatsBomb's separate data agreement. The [worked real-match example](docs/REAL_MATCH.md) documents the measured scope and limitations.

## Check the demo

```text
python -m unittest discover -s tests -v
```

Tests cover draft counts, identity uniqueness, era/role feasibility, deterministic replay, substitutions, invalid inputs, goal/event reconciliation, equal-team symmetry, imported attribute mappings, and event analytics. The notebook was executed from a fresh kernel, including its widget callbacks. The local browser was checked through five spins, match and repeated-trial controls, the gauntlet, and a mobile viewport. Details are in [VALIDATION.md](docs/VALIDATION.md).

## Sources and permissions

- [Eraball](https://eraball.com/) inspired the visible era/draft/lineup/simulation loop. This project uses original code and artwork.
- [Stefano Leone's EA Sports FC 24 dataset](https://www.kaggle.com/datasets/stefanoleone992/ea-sports-fc-24-complete-player-dataset) supplies career snapshots.
- [Lucas Silva's Ultimate Team database](https://www.kaggle.com/datasets/lucas142129silva/fifa-23-ultimate-team-players-database) supplies base historical cards.
- [SciPy linear_sum_assignment](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html) documents the assignment algorithm.
- [penaltyblog's model documentation](https://penaltyblog.readthedocs.io/en/latest/models/overview.html) describes the standard Poisson score model.
- [Karun Singh's expected-threat article](https://karun.in/blog/expected-threat.html) supplies the xT fixed point; this implementation makes failed-move absorption explicit.
- [StatsBomb Open Data](https://github.com/statsbomb/open-data) supplies optional real events, subject to its [data agreement](https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf).

Code is MIT licensed. The dataset publishers' CC0 declarations are recorded separately; the MIT licence does not relicense third-party data or trademarks. No player portraits, game card artwork, club badges, proprietary EA/PES engine code, or raw StatsBomb events are bundled. This is an independent fan and research demo, with no affiliation to Eraball, EA, FIFA, Konami, or StatsBomb.
