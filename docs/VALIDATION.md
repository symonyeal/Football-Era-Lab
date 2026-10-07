# Checks and measured results

The release checks below were run on 2026-10-07 against the bundled data and current shared engine. They test implementation behavior and quantify specific models. Historical completeness and true player quality remain outside these checks.

## Run the automated checks

From the repository root, with Node 20 or later and the Python analytics dependencies installed:

```text
node --test tests/engine/*.test.mjs
python -m unittest discover -s tests -p test_pipeline.py -v
python -m pytest tests/test_calibration.py -q -p no:cacheprovider
```

All 53 Node tests, 14 pipeline tests and 4 calibration tests passed. The JavaScript suite covers draft limits, distinct identities, slot assignment, rating adjustments, complete leagues and Cups in all eight decades, substitutions, goal/stat reconciliation, deterministic replay, the tournament circuit, weekly seeds, team codes and Gauntlet rewards, boosts and boss retries. It also checks Gauntlet save validation and restoration, that the strongest rated squad leads each opponent field, and that coverage, manifest and embedded calibration parameters describe the exact shipped bundle. The latter check rejects a coverage report with a stale data hash.

Pipeline tests check source selection, age adjustment, CM record layouts, attribute/position rules, stint allocation, stats boundaries and legend identity without source downloads. Calibration tests use independently generated counts to check parameter recovery, likelihood calculations, invalid inputs and the training-only baseline. GitHub's `Game checks` workflow runs these checks and executes the active notebook through Node. There is no frontend build or npm dependency installation for gameplay.

The notebook was executed with seven code cells and no error outputs. It checks deterministic replay for its selected settings and current data. That check establishes replay for those inputs, not the validity of historical outcomes. Windows execution can emit the Jupyter/ZeroMQ selector-thread warning; it completed successfully. Local data validation reports zero defects, no exported people carrying Wikidata's explicit female label, fifteen or more cards and a keeper in every club-decade, and eight winger spot checks in wide slots. Missing or wrong upstream metadata remains possible.

## Browser acceptance

Serve the repository root, then run the portable harness with an installed Playwright module and Chromium:

```text
node tests/browser/acceptance.cjs --output /path/to/persistent/results --url http://127.0.0.1:8765/
```

If Playwright is installed elsewhere, add `--playwright /path/to/playwright`. Screenshots, downloaded replays, result images and `acceptance.json` go to the selected output folder. On the development machine all output and browser scratch files belong in `Claude Func Folder\football-v2\`. Set `TEMP` and `TMP` to a persistent subfolder there before launching the browser.

Desktop (1440 × 900) and mobile (390 × 844) passed 28 checks, with animations enabled, no page or console errors, no failed HTTP responses and no horizontal page overflow. Both completed manager choice, five squad draws and fifteen placements, swaps, reload, the 38-match season, Cup, Gauntlet segments/reward/boss, a ten-event circuit with its four player awards, team-code Head to Head and Weekly Challenge. Both also rejected corrupt saves and invalid replays, rejected malformed Gauntlet imports without changing browser storage, downloaded the replay and result PNG, and imported the replay with exact placements. The result report includes the data hash. These checks cover Chromium at those two sizes; other browsers and every possible user choice are not exhaustively tested.

## Match calibration on modern seasons

The deployed expected-goal model was fitted on 6,716 matched real fixtures from seasons starting in 2014 to 2019. The holdout contains 4,354 matched fixtures from 2020 to 2023, or 8,708 team goal counts. Each club uses its actual FIFA edition roster, the engine's best eleven in 4-3-3, EA position ratings, a neutral manager and no curated tags.

| Held-out measure | Model | Home/away average baseline |
| --- | ---: | ---: |
| Mean Poisson negative log likelihood | 1.47598 | 1.54001 |
| Root mean squared error in goals | 1.18792 | 1.26474 |

Lower is better for both measures. The baseline's home mean (1.58815) and away mean (1.22186) are fitted only on matched training fixtures. Both comparisons use the same matched holdout fixtures. Club-name mappings exclude unmatched fixtures; `data/calibration.json` records league-season coverage and unmapped names, including seasons with missing source results.

The selected coefficients are attack/defence `be=0.411503`, midfield weight `ka=0.556609` and log home advantage `h=0.262093`. The report records agreement between Python's fitted goal expectations and JavaScript's deployed `lam` within 1e-10. The 2010s and 2020s use the training neutral intercept, 1.231344 goals per team, so the holdout's measured scoring rate does not tune deployment. Earlier decade intercepts scale that level by measured historical scoring ratios. Rating prediction, historical transfer and the stochastic match simulation are different questions: this fit excludes random absences, fatigue and substitutions, and does not validate mixed-era drafts, historical squads, formations, links, tags or manager grades.

## Draft balance across eight decades

Reproduce the measurement with:

```text
node tests/balance.mjs season 40
```

The declared policy takes the best-graded of the five managers. Each pick maximizes slot-rated, era-adjusted value in an open slot, with the nearby club links it would earn; a bench pick gets a 0.92 weight. It uses seeds 1000 through 1039 in every decade, with spin settings `tau=3` and `rho=1.5`. This is an automatic drafting policy, not measured human performance.

| Decade | Median finish | Titles / 40 | Top four / 40 | Median points | Unbeaten / 40 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1950s | 2 | 11 | 36 | 86 | 0 |
| 1960s | 3 | 11 | 30 | 81 | 0 |
| 1970s | 3 | 12 | 23 | 75 | 0 |
| 1980s | 5 | 3 | 15 | 70 | 0 |
| 1990s | 5 | 1 | 10 | 70 | 0 |
| 2000s | 9 | 0 | 6 | 60 | 0 |
| 2010s | 5 | 0 | 16 | 68 | 0 |
| 2020s | 5 | 4 | 15 | 74 | 0 |

The policy won 42 titles in 320 drafts (13.1%), with no unbeaten seasons. The aggregate meets the chosen 5% to 15% title target; individual decades differ substantially. Zero titles in forty 2000s or 2010s drafts does not establish impossibility, and this sample does not demonstrate the target within every decade. The policy tends to finish near the top in early eras and around fifth to ninth later. More sophisticated picks, manager re-spins, squad re-spins and deliberate duo choices are not optimized by this policy.

## Gauntlet survival

```text
node tests/balance.mjs gauntlet 40 5
```

The same draft policy uses seeds 500 through 539, cycling draft decades. It takes a boost only when at least five patience will remain after paying; otherwise it rests. Of forty runs, nine ended before clearing the first decade and one cleared all eight. The median was three decades cleared, thirteen points per six-match segment and eight boss matches per run. This measures that conservative reward policy, not every free-agent, badge or boost strategy.

| Decades cleared | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Runs | 9 | 4 | 3 | 5 | 8 | 3 | 4 | 3 | 1 |

## Evidence files and limits

`data/validation.json` describes the exact bundle by its SHA-256, `data/manifest.json` records attribution and unresolved links, and `data/calibration.json` records the match fit and coverage. The notebook derives counts and hash from the loaded file. The development release evidence is kept in `Claude Func Folder\football-v2\review-20261007\review-browser-after\` and `review-20261007\release-*-balance.txt`; the portable commands above regenerate it elsewhere.

Early-decade rating estimates extrapolate from engine-rated cards of 1989 to 2025. Their prediction errors measure resemblance to game ratings, not historical ability. Squad incompleteness, club-name joins, decade aggregation and estimated positions affect results. Unmeasured model effects are identified in [MODEL.md](MODEL.md), and source coverage and terms in [DATA.md](DATA.md). Reports in the [v1 tag](https://github.com/symonyeal/Football-Era-Lab/tree/v1) apply only to that implementation.
