# Where the squads and ratings come from

The pipeline writes `data/game.json` for the browser and notebook, plus a readable `data/manifest.json`. Data builds happen separately from gameplay. Raw source downloads and intermediate build files stay in a persistent local work folder and are excluded from the public repository.

## Rebuild

Install the pipeline packages from the repository folder:

```text
python -m pip install -r requirements-analytics.txt
```

`FEL_CACHE` selects the persistent source and build cache. `FEL_INPUTS` selects the folder containing the permitted local `fc24.zip` and `fut23.zip` archives. On the development machine, these folders are `Claude Func Folder\football-v2\cache` and `Claude Func Folder\football-v2\inputs` in the shared project. Set these environment variables in your shell before building; do not put secrets or raw archives into git.

```text
python -m pipeline.build
```

The ordered steps are `clubs`, `universe`, `stints`, `squads`, `persons`, `model` and `export`. You can name steps to resume a cached build, for example `python -m pipeline.build model export`. Rebuild an upstream step when its source or rules change; a downstream-only run otherwise uses its existing cache. Cached pickle files are local build state; read only caches you trust.

## Inclusion and identity

Club selection uses top-tier domestic results and European Cup progress. The domestic sources cover England, Spain, Italy, Germany, France, Netherlands and Portugal, with different historical coverage. European entrants add clubs outside those domestic sources. A season belongs to the decade containing its start year. A 2020s card reflects the available source years, not a finished decade.

Wikidata club membership statements provide dated stints and, where available, league appearances and goals. The pipeline apportions whole-stint totals across the covered years. A decade card qualifies with at least ten apportioned appearances, or through the declared notability rule when appearances are missing. The game lists all qualifying records for the club-decade. This can omit players, combine teammates from different years, and inherit errors in dates, totals or labels. "Full available squad" therefore means the complete supplied qualifying pool, not a complete historical roster.

Wikidata person IDs are the identity keys. A person can have many cards but can be drafted only once. Linking FIFA records uses birth date and name evidence. Legend cards also use explicit name aliases and available nationality evidence. Check the manifest's unresolved links and the coverage report; spelling similarity alone does not establish an identity. The source-card reference `{ "k": "clubQID:decade", "p": "personQID" }` preserves which club-decade a drafted card came from.

Historical position labels are mapped to modern slot codes in `pipeline/positions.py`. Broad or missing labels can produce coarse roles. Formations, manager associations, signature players, Timeless/Maestro tags and duo lists are curated in `pipeline/curated/`; tags describe game rules, not measured skills. European Cup experience inferred from club stints does not establish that a player appeared in every winning tie.

## Ratings and reports

| Badge | Meaning |
| --- | --- |
| `f` | Average of the highest three available FIFA/FC edition ratings matching the player, club and covered stint, or fewer when fewer exist. |
| `n` | Nearby FIFA/FC edition or club extrapolation, with the pipeline's age adjustment. |
| `i` | EA Icon/Hero reconstruction, with the pipeline's age adjustment. |
| `e` | Estimate from the fitted model. |

The fitted model's held-out report belongs to rating prediction. `data/calibration.json` records a separate real-match calibration and its baseline comparison. `data/validation.json` records pool coverage and checks. The notebook computes counts from the loaded JSON and displays these reports so documentation does not require a second copied set of totals.

Recreate match calibration separately, with the source cache and ratings inputs configured:

```text
python -m pipeline.calibrate
```

This fits on matched seasons starting in 2014 through 2019 and holds out 2020 through 2023. It rates actual edition club rosters through the JavaScript engine and checks its deployed expected-goal function. It does not fit the complete stochastic season simulation or validate historical cross-era effects.

Derived club rankings and decade scoring baselines use engsoccerdata, whose published licence is GPL (>= 2). Raw match files are kept outside the public bundle. Omitting raw files does not, by itself, resolve every obligation for derived or redistributed material. Review the source terms for your own redistribution. Numeric FIFA/FC datasets carry their publishers' CC0 declarations; those declarations do not establish an independent EA licence for all underlying rights. See [data attribution](../data/README.md) for source links.
