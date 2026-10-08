# What the checks and results establish

The checks answer several different questions: whether the game follows its rules, whether its goal model improves on a simple average, and how difficult it is under one automatic drafting policy. Passing the first set does not prove that the historical ratings are correct. The career release adds real league and European records while retaining the 2026-10-07 cards and match fit. The old fictional-season and Gauntlet measurements below remain labelled as version 3 benchmarks; they do not measure the new career or its decade-restricted manager pool.

## The rules are checked automatically

The JavaScript suite checks draft limits, one-person identity, position assignment, rating adjustments, leagues and cups, substitutions and agreement between match events and reported totals. It also covers repeatable results, the circuit, weekly seeds, team codes, Gauntlet maps, four-round acts, rewards, same-person boosts, two-legged boss ties, retries, transfers, development and valid or malformed saves. Formation tests require changes to preserve cards, the bench and future draws; manager tests retain exact club spells and accept legacy saves and team codes. Interface tests check surname particles and text and focus contrast against the declared surfaces.

Career checks cover real league membership, season-specific and nearby squads, labelled stand-ins, two-point seasons, odd-sized fields, competition availability and qualification, partial-season continuation and the expectation-based patience scale. Save validation checks the career independently of its original draft and Gauntlet. The lobby regression renders an unrecorded selected formation and requires that formation's actual pitch, rather than only the manager's recorded miniatures. Version 4 options are checked across every decade and both manager re-spins; version 2 and version 3 choices and both older team-code formats retain their original validation rules.

The salary-cap tests check the exact tier boundaries, that a third S-tier card is refused even on the bench, that every allowed pick leaves the club's three picks completable, and that saves, replays, team codes and Gauntlet signings keep the rule. Drafts on the bundled data finish with exactly 2 S, 4 A, 4 B, 3 C and 2 D players from five different clubs in every decade. Other tests require draws to follow the declared weights, every club to remain drawable, a squad to offer the best tier still needed, a ruled-out club to leave every other draw on the same seed unchanged, and each hard end-of-draft need to have more supplier clubs than a draft can rule out.

Checks on the supplied data require the strongest rated squad to lead each selected opposition field. They also require the coverage report, manifest counts and embedded calibration settings to describe the exact bundle. A stale data hash fails that check.

A local legacy Gauntlet comparison against commit `27d0647` returned identical hashes for four map inputs. All four ended with dismissal in the opening act, so that comparison covers those early-failure paths. It does not prove identical later-act play; the separate regression suite exercises rewards, transfers, retries and saved later stages.

The pipeline tests exercise source selection, age adjustments, CM record layouts, attribute and position rules, allocation of club spells, statistic date boundaries and legend identity. Nearby-source regressions cover EA and CM snapshots inside long club spells, their precedence over snapshots outside the spell, and the two-season cutoff outside the interval. They use small fixtures rather than downloading sources. The calibration tests use independently generated goal counts to check parameter recovery, probability calculations, rejected inputs and the training-only average used for comparison.

Run these commands from the repository root with Node 20 or later and the Python analytics dependencies installed:

```text
node --test tests/engine/*.test.mjs
py -3.14 -m unittest discover -s tests -p test_pipeline.py -v
py -3.14 -m unittest discover -s tests -p test_wikidata.py -v
py -3.14 -m pytest tests/test_calibration.py -q -p no:cacheprovider
```

GitHub's `Game checks` workflow also executes the notebook through Node. Gameplay has no frontend build or npm dependency installation. The refreshed notebook completed seven code cells without error outputs and checked repeatability for its selected settings and loaded data in the fictional single-season experiment. That establishes the same result for those inputs, not a historically valid outcome or equivalence with the browser career. Windows can emit a Jupyter/ZeroMQ selector-thread warning during execution.

The data validator reported zero failures for its structural rules. The export has at least fifteen cards and a goalkeeper in every eligible club-and-decade squad, no person with Wikidata's cached explicit female label, and eight winger spot checks in wide positions. Those checks cannot identify every wrong or missing source record.

## The browser checks cover the career and extra modes

The final 2026-10-08 local acceptance record passed 60 checks in bundled Chromium: desktop at 1440 × 900, mobile at 390 × 844, tablet at 768 × 1024 and reduced motion. An earlier Microsoft Edge run passed 59 checks. Neither report recorded a page or console error, failed HTTP response or horizontal page overflow, and both fingerprints match the current league-enabled bundle.

Desktop and mobile completed manager selection, five squad draws, fifteen placements, a swap and reload under the default salary cap. The finished draft held 2 S, 4 A, 4 B, 3 C and 2 D players from five clubs, with visible reasons for blocked cards. Each played a real club season to winter, took a reward, resumed with the exact saved state, changed the lineup, played the run-in and inspected tables, fixtures, cups and season history. Whole-decade continuation is also exercised by the engine and balance harness.

Three further checks exercised the new controls and summer flow. Random decade and seed re-roll changed the actual draft settings. A career prime upgrade kept the player and original tier charge, and scouting plus a quoted signing applied to the chosen squad place. Two summer transfers, a formation change and a lineup swap then advanced to the next real league season and survived a reload with the same state.

More modes played four Gauntlet rounds, rewards and a two-legged boss, including quoted market signings, prime-card upgrades, four transfers and formation changes between decades. Both screen sizes also completed a ten-event circuit with player awards, a team-code Head to Head tie and a Weekly Challenge draft. Head to Head rejected mismatched cap rules, a Classic replay link started a Classic draft, and the Weekly Challenge used the cap even after Classic was chosen.

Both playthroughs selected an unrecorded starting formation, changed formation mid-batch, applied the preview, undid and redid it, then resumed with the same cards, bench and counters. Separate regressions require resolving a preview before kick-off and allow a phone keyboard to select and place a substitute when all eleven starting places are filled. Tablet checks placed a card through its sheet without covering the pitch or bench. Reduced motion revealed a squad immediately and removed its animation.

The added tablet regression forces fallback fonts, checks the header width and places a player. It addresses the first CI run's header overflow: a 768-pixel viewport produced an 817-pixel page. After the header sizing fix, targeted probes in Chromium and Edge both measured 768 pixels with no overflowing elements. The final Chromium playthrough includes this fallback-font case.

Both playthroughs rejected corrupt saves and invalid replay files. They rejected a malformed Gauntlet import without replacing browser storage, downloaded the replay and result PNG, and restored the downloaded replay with exactly the same placements. The reports record the data hash. These local runs cover bundled Chromium and Microsoft Edge at three screen sizes, plus the targeted Edge header check after the fix. They do not cover every browser or every possible sequence of choices.

To reproduce them, serve the repository root, install Playwright and Chromium, and run:

```text
node tests/browser/acceptance.cjs --output /path/to/persistent/results --url http://127.0.0.1:8765/
```

If Playwright is installed elsewhere, add `--playwright /path/to/playwright`. To use installed Microsoft Edge, add `--channel msedge`. The chosen output folder receives `acceptance.json`, screenshots, replays and result images. GitHub's workflow runs the same checks in Chromium and preserves those outputs as the `browser-checks` artifact. The harness can test the public site by changing `--url` to `https://symonyeal.github.io/Football-Era-Lab/`.

Choose an output folder outside the tracked source tree, or inside the ignored `work/` folder.

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

## The measured career policy found the league easy

The first career measurement played four seeds per decade, 1000 through 1003, under both Salary cap and Classic: thirty-two careers per rule set. It chose the best manager grades, drafted the best legal fit- and era-adjusted value with nearby club links, and kept the initial formation. Rewards preferred a prime-card upgrade only when at least five patience remained, otherwise rest and then development. Summer transfers minimized lost starter strength before improving the bench within the cap, with the lower-rated offer breaking ties. After summer the policy reassigned the eleven within the current formation. It did not use market signings, scouting re-spins or deliberate formation searches.

```text
node tests/career-balance.mjs 4 both 5 --output "/path/to/persistent/results/career balance.json"
```

| Rules | Careers completed / attempted | Dismissed | Seasons played | Board objectives met | League titles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Salary cap | 32 / 32 | 0 | 300 | 279 / 300 | 269 / 300 |
| Classic | 32 / 32 | 0 | 300 | 292 / 300 | 291 / 300 |

All sixty-four careers reached their available final season. League results were much easier for this policy than the older fictional-season benchmark. Only eighteen capped halves and seven Classic halves lost patience, out of six hundred halves per rule set. The capped 2020s were less forgiving: twelve of twenty objectives and eleven league titles, against seventeen objectives and seventeen titles under Classic. Rewards and same-player upgrades can strengthen a squad as the career advances.

This small sample uses the strongest offered manager grades and covers six leagues, with no Portuguese club drawn. Four seeds per decade do not establish results for every club, league, formation, reward strategy or human player. The experiment measured continuation and difficulty; no difficulty tuning was applied, and these high completion and title rates do not establish a balanced challenge. The report records every career, settings, season finishes and the current bundle's SHA-256 fingerprint.

## Draft difficulty varies by decade

This is the retained version 3 fictional twenty-club Era League benchmark, measured before the club career. It keeps the original all-era manager options and cannot be read as a career title rate. Add `legacy` to reproduce that manager pool with the current harness.

One automatic drafting policy played one hundred seeds per decade, 1000 through 1099, under each set of rules, with `tau=20` and `rho=1.5`. It kept the best-graded manager among the five offered and his first recorded formation. At each pick it selected, among the cards the rules allowed, the highest position- and era-adjusted value in an open place, adding the nearby same-club points it would gain; bench candidates received a 0.92 weight.

This is a declared computer policy, not a measurement of human players. It does not plan ahead for the cap, optimize manager re-spins, squad re-spins or duo partnerships. Reproduce it with:

```text
node tests/balance.mjs season 100 cap legacy
node tests/balance.mjs season 100 classic legacy
```

Under the salary cap:

| Decade | Median finish | Titles / 100 | Top four / 100 | Median points | Unbeaten / 100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1950s | 2 | 32 | 87 | 87 | 0 |
| 1960s | 4 | 9 | 54 | 74 | 0 |
| 1970s | 5 | 12 | 44 | 70 | 0 |
| 1980s | 7 | 1 | 17 | 63 | 0 |
| 1990s | 9 | 0 | 2 | 58 | 0 |
| 2000s | 14 | 0 | 0 | 44 | 0 |
| 2010s | 11 | 0 | 1 | 52 | 0 |
| 2020s | 9 | 0 | 0 | 54 | 0 |

Under Classic:

| Decade | Median finish | Titles / 100 | Top four / 100 | Median points | Unbeaten / 100 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1950s | 2 | 45 | 94 | 91 | 2 |
| 1960s | 3 | 26 | 74 | 79 | 0 |
| 1970s | 3 | 26 | 66 | 78 | 0 |
| 1980s | 5 | 5 | 45 | 71 | 0 |
| 1990s | 6 | 1 | 21 | 68 | 0 |
| 2000s | 12 | 1 | 5 | 52 | 0 |
| 2010s | 9 | 0 | 18 | 59 | 0 |
| 2020s | 7 | 1 | 12 | 64 | 0 |

The policy won 54 of 800 capped seasons, or 6.8%, and 105 of 800 Classic seasons, or 13.1%. Both aggregates are within the chosen 5% to 15% title target. Classic produced two unbeaten seasons in the 1950s; the capped policy produced none. With an even sample size, the harness reports the lower of the two middle observations in the sorted list as its median.

All but one capped title came in the 1950s to 1970s; the remaining title came in the 1980s. The capped squad's median rating stayed between 84.8 and 85.9 in every decade, while the median of the nineteen opponents rose from 79.7 in the 1950s to 85.5 to 90.6 from the 1980s onwards. Classic squads reached 86.7 to 88.2. Zero titles in one hundred drafts of a decade does not establish that the decade cannot be won. Better selections, deliberate partnerships or use of re-spins remain outside what this policy measures.

Repeating the same seeds with `free` chooses the highest-overall formation after drafting. Every candidate is applied through the game's formation function, which keeps all fifteen cards and the bench. It does not optimize picks for a future formation or choose by season outcome.

```text
node tests/balance.mjs season 100 cap free legacy
node tests/balance.mjs season 100 classic free legacy
```

| Rules | Initial formation, titles / 800 | Free formation, titles / 800 |
| --- | ---: | ---: |
| Salary cap | 54 (6.8%) | 60 (7.5%) |
| Classic | 105 (13.1%) | 119 (14.9%) |

Free formation raised median squad overall by 0.0 to 0.3 points across the decades. The title rates stayed within the chosen target without changing engine parameters. This comparison measures this policy on these seeds, not the best possible play.

## The spin settings trade variety against strength

Lower `tau` sends more spins to the strongest squads, which makes a team stronger and the draws more repetitive. The tier guarantee keeps stars within reach when the weighting is flatter. The following earlier experiment used the manager-and-formation draw before club spells became the manager choices. Each row below is the same policy over 160 drafts, twenty seeds per decade:

| Draw rule | Capped titles | Classic titles | Clubs seen, capped | Most frequent club, capped |
| --- | ---: | ---: | ---: | --- |
| Previous release: `tau=3`, decade then club, no tier guarantee | 7 | 22 | 40 | Real Madrid, 14.1% of spins |
| `tau=20`, decade then club, no tier guarantee | 3 | 3 | 90 | Real Madrid, 9.5% |
| `tau=20`, one combined draw, tier guarantee (adopted) | 11 | 20 | 71 | Barcelona, 8.3% |
| `tau=40`, one combined draw, tier guarantee | 6 | 17 | 83 | Barcelona, 7.5% |

`tau=20` is the flattest tested setting that kept both rule sets inside the title target. Over the full 320 drafts at that setting, 94 different clubs appeared under the cap and 91 under Classic, Barcelona was the most frequent at 8.6% of spins, and 57% of capped spins came from a club ranked in its decade's top ten, against 95% under the previous weighting. Barcelona and Real Madrid remain the most frequent because they hold 22 of the archive's 82 S-tier cards, and every capped squad needs two.

## Capped drafts always finished

Four pick policies each completed 320 capped drafts, one per seed and decade: the highest-rated legal card, the lowest-rated, the lowest tier first, which saves the S places for last, and a random legal card. None of the 1,280 drafts got stuck, and in all 6,400 spins the squad offered a player from the best tier still needed. On the same seed, each of the other three policies met the same club as the highest-rated policy on every first draw, 71% of second draws, 18% of third draws and 8% of fifth draws. The [salary cap rules](MODEL.md#the-salary-cap-limits-stars-across-the-whole-squad) give the supplier-club margin behind this result.

## Gauntlet survival depends on reward choices

This retained version 3 measurement uses the original all-era manager pool; the Gauntlet's rules remain available under More modes. The same drafting policy played forty Gauntlets under each set of rules, using seeds 500 through 539 and cycling the draft decades. Every run used Original Gauntlet, the default and shortest map: the 1960s, 1990s and 2010s. It took a prime-card boost only when at least five patience would remain after payment; otherwise it rested, or took an affordable development at full patience. After a won boss tie, it chose the two lowest-rated transfer offers from each decade. It released players as needed to free cap charges, then the lowest-rated remaining players, and never rearranged the lineup. It did not use free-agent rewards or market re-spins.

```text
node tests/balance.mjs gauntlet 40 5 cap original legacy
node tests/balance.mjs gauntlet 40 5 classic original legacy
```

The final argument selects the map; `back`, `odyssey` and `reverse` are also supported. The measurements below concern only `original`.

| Decades cleared | 0 | 1 | 2 | 3 |
| --- | ---: | ---: | ---: | ---: |
| Salary cap runs | 16 | 22 | 1 | 1 |
| Classic runs | 6 | 32 | 1 | 1 |

Both rule sets cleared a median of one decade and played a median of three boss ties. Median points per six-match round were ten under the salary cap and eleven under Classic. One run under each rule set cleared all three decades.

Capped runs earn 1.5 times the score, as in Eraball. The opening capped draft carries three C-tier and two D-tier players; later signings can change those counts within the S- and A-tier limits. Fatigue and absences bring substitutes into matches. These results describe one reward and transfer policy on the shortest three-decade map under the current patience and opposition rules. They do not establish human success rates, the difficulty of the other maps, or the results of planning transfers, rearranging the lineup or choosing different rewards.

## Identifying the evidence and its limits

[validation.json](../data/validation.json) names the exact bundle by its SHA-256 file fingerprint. [manifest.json](../data/manifest.json) records attribution and unresolved links, and [calibration.json](../data/calibration.json) records the goal fit and fixture coverage. The notebook calculates its counts and hash from the file it loads.

The browser workflow preserves fresh records in its `browser-checks` artifact. The portable commands above generate local records in the output folder you choose; machine-specific development artifacts are not part of the repository.

Early-era estimates extend a model fitted to engine-rated cards from 1989 to 2025. Their errors measure resemblance to those games' ratings, not real historical ability. Missing squad members, incorrect club-name joins, decade-wide membership and estimated positions can affect results. The shipped bundle retains the nearby-source boundary rule described in [DATA.md](DATA.md#the-source-label-explains-what-rated-a-card); the pipeline now measures distance from the full spell interval for future rebuilds. The regressions establish that selection rule, not a change to the bundled cards. Additional unmeasured effects are listed in [MODEL.md](MODEL.md#what-the-model-leaves-out).

The tests and reports under the [v1 tag](https://github.com/symonyeal/Football-Era-Lab/tree/v1) concern that earlier implementation. They do not establish the behavior of this engine.
