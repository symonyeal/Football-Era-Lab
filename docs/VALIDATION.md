# What the checks and results establish

The checks answer several different questions: whether the game follows its rules, whether its goal model improves on a simple average, and how difficult it is under one automatic drafting policy. Passing the first set does not prove that the historical ratings are correct. The measured results below refer to the 2026-10-07 data bundle and shared engine.

## The rules are checked automatically

The release passed 53 Node tests, 14 Python pipeline tests and 4 calibration tests. The JavaScript tests cover the draft limits, one-person rule, position assignment, rating adjustments, complete leagues and Cups in all eight decades, substitutions and the agreement between match events and reported totals. They also cover repeatable results, the circuit, weekly seeds, team codes, Gauntlet rewards, same-person boosts, boss retries and valid or malformed saved runs.

Checks on the supplied data require the strongest rated squad to lead each selected opposition field. They also require the coverage report, manifest counts and embedded calibration settings to describe the exact bundle. A stale data hash fails that check.

The pipeline tests exercise source selection, age adjustments, CM record layouts, attribute and position rules, allocation of club spells, statistic date boundaries and legend identity. They use small fixtures rather than downloading sources. The calibration tests use independently generated goal counts to check parameter recovery, probability calculations, rejected inputs and the training-only average used for comparison.

Run these commands from the repository root with Node 20 or later and the Python analytics dependencies installed:

```text
node --test tests/engine/*.test.mjs
python -m unittest discover -s tests -p test_pipeline.py -v
python -m pytest tests/test_calibration.py -q -p no:cacheprovider
```

GitHub's `Game checks` workflow also executes the notebook through Node. Gameplay has no frontend build or npm dependency installation. The notebook completed seven code cells without error outputs and checked repeatability for its selected settings and current data. That establishes the same result for those inputs, not a historically valid outcome. Windows can emit a Jupyter/ZeroMQ selector-thread warning during this successful execution.

The data validator reported zero failures for its structural rules. The export has at least fifteen cards and a goalkeeper in every eligible club-and-decade squad, no person with Wikidata's cached explicit female label, and eight winger spot checks in wide positions. Those checks cannot identify every wrong or missing source record.

## The browser checks cover a complete playthrough

Desktop at 1440 × 900 and mobile at 390 × 844 passed 28 checks with animations enabled. Neither run reported a page or console error, failed HTTP response or horizontal page overflow.

Each completed manager selection, all five squad draws and fifteen placements, a swap, reload, the 38-match season, European Cup, Gauntlet segments, a reward and a boss. Each also played a ten-event circuit with all four player awards, a team-code Head to Head tie and a Weekly Challenge draft.

Both runs rejected corrupt saves and invalid replay files. They rejected a malformed Gauntlet import without replacing browser storage, downloaded the replay and result PNG, and restored the downloaded replay with exactly the same placements. The report records the data hash. These runs cover Chromium at two screen sizes, not every browser or every possible sequence of choices.

To reproduce them, serve the repository root, install Playwright and Chromium, and run:

```text
node tests/browser/acceptance.cjs --output /path/to/persistent/results --url http://127.0.0.1:8765/
```

If Playwright is installed elsewhere, add `--playwright /path/to/playwright`. The chosen output folder receives `acceptance.json`, screenshots, replays and result images. The same harness can test the public site by changing `--url` to `https://symonyeal.github.io/Football-Era-Lab/`.

On the Windows development machine, output and browser scratch belong in `Claude Func Folder\football-v2\`. Set `TEMP` and `TMP` to a persistent subfolder there before launching the browser.

## The goal model beats a home-and-away average

The goal model was fitted on 6,716 matched real fixtures from seasons starting in 2014 through 2019. It was checked on 4,354 different fixtures from 2020 through 2023, comprising 8,708 team goal counts. These later fixtures were held out: they did not determine the fitted coefficients.

Each club was represented by its actual FIFA edition roster, its best eleven in a 4-3-3, EA position ratings, a neutral manager and no curated tags. This asks whether the model can relate ordinary club strengths to goals. It does not test the mixed-era draft rules.

The comparison predicts every home side using the training period's average of 1.58815 goals and every away side using 1.22186. Both the model and that simple baseline are evaluated on the same later fixtures.

| Held-out measure | Model | Home/away average baseline |
| --- | ---: | ---: |
| Mean Poisson negative log likelihood | 1.47598 | 1.54001 |
| Root mean squared error in goals | 1.18792 | 1.26474 |

Both measures are better when lower. Poisson negative log likelihood, also called log loss here, penalizes the model when it assigns a low probability to the score that actually occurred. Root mean squared error measures the size of the difference between expected and observed goals, giving larger mistakes more weight. They assess goal predictions in different ways; neither is a percentage of correctly predicted winners.

The full fitted coefficients are `be=0.411503` for the attack/defence gap, `ka=0.556609` for midfield weight, and `h=0.262093` for home advantage on the logarithmic scale. [MODEL.md](MODEL.md#drawing-the-match-score) shows how they enter the calculation. The report records agreement between Python's fitted expectations and JavaScript's deployed `lam` within 1e-10.

The 2010s and 2020s scoring level is the training neutral intercept, 1.231344 goals per team. The later test period's scoring average does not tune that deployed value. Earlier levels use measured historical scoring ratios.

Club-name matches restrict fixture coverage. Unmatched fixtures are excluded from both comparisons; [calibration.json](../data/calibration.json) records coverage, unmapped clubs and league-seasons with missing results. The fit excludes random absences, fatigue and substitutions. It does not validate historical squads, mixed-era teams, formations, links, tags or manager grades. Predicting game ratings, transferring those ratings across generations and predicting modern club goals are separate questions.

## Draft difficulty varies by decade

One automatic drafting policy played forty seeds per decade, 1000 through 1039, with `tau=3` and `rho=1.5`. It kept the best-graded manager among the five offered. At each pick it selected the highest position- and era-adjusted value in an open place, adding the nearby same-club points it would gain; bench candidates received a 0.92 weight.

This is a declared computer policy, not a measurement of human players. It does not optimize manager re-spins, squad re-spins or duo partnerships. Reproduce it with:

```text
node tests/balance.mjs season 40
```

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

The policy won 42 of 320 titles, or 13.1%, and produced no unbeaten seasons. That aggregate is within the chosen 5% to 15% title target, while individual decades differ substantially. Its typical finish was second to third in the earliest decades, and fifth to ninth later. For forty runs, the harness reports the lower of the two middle observations in the sorted list as its median.

Zero titles in forty 2000s or 2010s drafts does not establish that those eras cannot be won. The experiment also does not establish the target title probability in each individual decade. Better selections, deliberate partnerships or use of re-spins remain outside what this policy measures.

## Gauntlet survival depends on reward choices

The same drafting policy played forty Gauntlets using seeds 500 through 539, cycling the draft decades. It took a prime-card boost only when at least five patience would remain after payment; otherwise it rested. This is one conservative reward policy, not a test of every signing, development or boost strategy.

```text
node tests/balance.mjs gauntlet 40 5
```

Nine runs ended before clearing the first decade. One cleared all eight. The median run cleared three decades, earned thirteen points per six-match segment and played eight boss matches.

| Decades cleared | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Runs | 9 | 4 | 3 | 5 | 8 | 3 | 4 | 3 | 1 |

The results describe this policy under the current patience and opposition rules. They do not measure the success rate of a player who builds the team around future boss matches or chooses different rewards.

## Identifying the evidence and its limits

[validation.json](../data/validation.json) names the exact bundle by its SHA-256 file fingerprint. [manifest.json](../data/manifest.json) records attribution and unresolved links, and [calibration.json](../data/calibration.json) records the goal fit and fixture coverage. The notebook calculates its counts and hash from the file it loads.

Development browser evidence is kept in `Claude Func Folder\football-v2\review-20261007\review-browser-after\`; the balance outputs are `review-20261007\release-*-balance.txt`. Those local artifacts are not supplied with the repository. The portable commands above generate fresh records in the output folder you choose.

Early-era estimates extend a model fitted to engine-rated cards from 1989 to 2025. Their errors measure resemblance to those games' ratings, not real historical ability. Missing squad members, incorrect club-name joins, decade-wide membership and estimated positions can affect results. The nearby-source date-window limitation is documented in [DATA.md](DATA.md#the-source-label-explains-what-rated-a-card). Additional unmeasured effects are listed in [MODEL.md](MODEL.md#what-the-model-leaves-out).

The tests and reports under the [v1 tag](https://github.com/symonyeal/Football-Era-Lab/tree/v1) concern that earlier implementation. They do not establish the behavior of this engine.
