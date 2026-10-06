# Edit a team and run the browser engine

Open `Football Era Lab.ipynb` in JupyterLab and run all cells. Node must be available on PATH, or set `NODE` to its executable path in the setup cell. The bridge in `notebooks/engine_bridge.mjs` imports the same JavaScript rating, lineup and season functions as the browser. Python reads configuration, starts Node and displays its returned JSON.

Change `settings` in the configuration cell, then rerun the following cells:

| Setting | What it does |
| --- | --- |
| `seed` | Integer from 0 through 4294967295 for the demonstration and season. |
| `decade` | Simulation decade start year, 1950 through 2020 in steps of ten. |
| `manager` | Manager name from the printed catalogue; `None` chooses a seeded option for the demonstration. |
| `formation` | Formation name from the catalogue; `None` uses the manager option's formation. |
| `person_ids` | Exactly fifteen distinct Wikidata person IDs. An empty list requests the labelled demonstration. |
| `source_cards` | Fifteen exact `{k, p}` records, including the club and card decade. Takes precedence over `person_ids`. |
| `placement` | `best` calls the engine assignment helper; `ordered` keeps the supplied order as eleven starters then four substitutes. |

When only person IDs are supplied, the bridge selects each person's card from the simulation decade if available, then prefers the highest base rating, then sorts by source-card key to break a tie. This policy can select a different card than a browser draft. Use `source_cards` to retain the browser's exact club-decade choices. With `placement="ordered"`, preserve the eleven pitch slots and four bench slots to reproduce a chosen lineup.

The demonstration uses the actual draft module to make five club-decade draws and choose three people from each. Its automatic choices and best-lineup placement are notebook conveniences. They are labelled in the output and do not replace the browser's human picks. You can edit manager and formation freely for experiments; the notebook does not record an experiment as a ranked browser run.

The notebook shows the selected cards and sources, each starter's position loss, era multiplier, chemistry and adjusted rating, effective manager grades, attack/midfield/defence/keeper strengths, active match parameters, league table, user fixtures, Cup ties and simulated player totals. The exported response also retains match events and parameters for inspection. It writes no file unless you enable the final export cell and choose a persistent location.

The bridge derives the season's random seed from the draft seed exactly as the browser does. Replaying needs the same cards, placement, data, engine parameters and seed. The notebook reports both seeds and the data hash with each response. Historical coverage, estimated ratings and unmeasured game effects limit interpretation; the final cell records these limitations next to the results.
