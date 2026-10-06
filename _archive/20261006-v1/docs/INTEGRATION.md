# Football analytics integration

Era Eleven uses the installable `fas` package through [analytics.py](../era_eleven/analytics.py).
The dependency is pinned in [requirements-analytics.txt](../requirements-analytics.txt) to
[`a83c577a1d6b81da3a25a41f03c8e4096ecc4764`](https://github.com/symonyeal/football_analytics_system/tree/a83c577a1d6b81da3a25a41f03c8e4096ecc4764).
The game baseline inspected for this integration was `6eb513c00e4368ce6787294fd9b29bbee14945de`.
No upstream analytics source is maintained in this repository.

## Install and inspect

Install the base game first, then the shared analytics dependency with the same interpreter:

```text
python -m pip install -r requirements.txt
python -m pip install -r requirements-analytics.txt
python -c "from era_eleven.analytics import backend_status; print(backend_status())"
```

On the development machine, use `C:\Python314\python.exe`. Build prerequisites are `setuptools`
and `wheel`; the local audited clone was installed with `--no-build-isolation` and `--no-deps`
after those prerequisites were installed. Pip working files and caches belong in the machine's
project work folder. Installation from the pinned Git URL requires Git and network access.
Once installed, drafting, simulation, predictions and analysis of supplied files work offline.

`backend_status()` reports the installed package version, audited commit, fixed model version,
and whether the installed scoring module's SHA-256 matches the audited module. A version number
alone does not establish that the package contains the audited code. The offline fallback keeps
the same fixed rate formula; optional event/entity tools require the installed dependency.

## The supported gameplay path

Attributed cards pass through the game's data validation, person identity rules, five-spin draft,
role assignment and team rating. The adapter converts the resulting attack, defence and control
contrasts into `fas.performance.team_scoring.TeamScoringModel` parameters. Its `expected_goals`
method supplies the per-side Poisson rates used by simulation. The game retains its configured
goal base, home advantage, clipping range, segment durations, substitutions and fatigue.

The model version is `era-attributes-v1`. Parameters are supplied from game attributes and fixed
rules, with `rho=0`; no result fitting occurs during gameplay. The mapping performs the same
arithmetic in the same order as the original rate formula. Integration tests compare binary
floating-point representations over a representative grid and check the offline fallback.
Changing the upstream `expected_goals` output changes gameplay rates: the dependency is used in
the simulation path. This test establishes dependency use, not historical predictive accuracy.

`matchup_analysis(home, away)` uses the same fatigue/substitution-adjusted match rates to compute
win, draw and loss probabilities and likely scores with the upstream score distribution. It
returns formation/team ratings, attack/control/defence differences and the omitted score tail.
The distribution covers scores 0 through 16 and reports its renormalization. Its uncertainty is
simulation randomness; uncertainty in reconstructed ratings and fixed rules remains outside it.

The goalkeeper model, role suitability, formation assignment, chemistry proxies, manager fit,
bench eligibility and draft orchestration remain game rules. Attributes, chemistry and tactical
fit do not become observed performance merely because they are stored in a `fas` entity.

## Record mapping

| Game record | fas record | Mapping and limitations |
| --- | --- | --- |
| Person | `PlayerSeason.player_uid` | Deterministic integer derived from the explicit source identity. Different editions preserve the same person. Name similarity does not create identities. |
| Card and player edition/season | `PlayerSeason` | Source, lineage, card ID, season, era, missing attributes and mapping metadata are stored in `performance`. `minutes=0` and empty per-90 features preserve the absence of measured events. |
| Squad and formation | `TeamSeason` | Fifteen person IDs plus actual starters, roles, fit, bench, formation and manager in game context. |
| Manager | Team context | The entity spine has no manager record. The manager is preserved with the chosen formation; no learned manager effect is claimed. |
| Real/user-supplied event match | `MatchObject` and canonical actions | Numeric match/player/team IDs, period, time, action type, boolean success, and StatsBomb 120 by 80 coordinates. |
| Matchup | `Matchup` and matchup analysis | Fixed game rates, complete score distribution and explanations; independent Poisson outcomes with no fitted cross-era strength estimates. |
| Simulated match and shot log | `MatchObject` / `MatchMeta` | The result and explicit simulated evidence label are preserved in metadata, with empty spatial actions. The game does not observe spatial coordinates, so a measured passing network or xT surface is never fabricated from the shot log. |

`player_record(card)` and `team_record(team)` expose the entity mapping in the notebook.
`matchup_record(home, away)` and `simulated_match_record(result, home, away)` preserve the
prediction and simulated match in the upstream entity spine.
`attribute_compatibility(team)` reuses upstream cosine compatibility for an attribute similarity
diagnostic. It does not affect team chemistry or simulation. Explicitly sourced ratings,
historical reconstructions, PES grouping proxies, missing values and simulated results remain
separate evidence categories.

## Event analysis and evaluation

`canonical_actions` accepts canonical tables or StatsBomb events with numeric IDs. It reuses
the upstream converter, flattens nested outcomes first, preserves possession IDs where supplied,
and adds checks for missing start coordinates, invalid end coordinates and string booleans.
The upstream validator alone does not reject every one of these invalid inputs. Provider player
and team IDs are required; category codes invented from a match's names are unsuitable identities.
Match-play analytics excludes period-five shootouts and reports the excluded event count.

`analyse_events(events, training_events=...)` exposes upstream xT, per-action progression values,
passing entropy, passing centralities, zone graphs and latent NMF action roles. Passing networks
use the next same-team actor heuristic, grouped within periods and within possessions if those
IDs exist. Without possession IDs, receiver inference can cross turnovers and is labelled as
such. Latent NMF components are event profiles, not the game's named positional eligibility.
An xT fit on the same analysed match is descriptive. Separate training events allow applying an
earlier fitted surface, but a held-out prediction assessment still needs suitable labelled data.

```python
from era_eleven.analytics import analyse_events, evaluate_results

# Explicit input data; this call downloads nothing.
analysis = analyse_events(events, training_events=earlier_events,
                          evidence="User-supplied StatsBomb event export")
display(analysis["summary"])

# Actual dated team results with numeric team IDs and observed goals.
assessment = evaluate_results(results, split_date="2024-01-01")
display(assessment["metrics"])
```

`evaluate_results` fits the upstream team scoring model on dates strictly before the split and
evaluates later dates against the earlier-period mean-goals baseline. It reports Poisson negative
log likelihood, outcome Brier score and home-win calibration error, with the dates and sample
sizes. It rejects unseen evaluation teams. `rho=0` is explicit because upstream fits a Poisson
likelihood and supplies a correction parameter rather than estimating it in that likelihood.
The upstream return object does not expose optimizer convergence. The evaluation helper tests
the supplied historical teams and cannot validate arbitrary cross-era drafted squads.

The shipped cards lack observed match/stint evidence linking those attributes to drafted-squad
performance. Unit fixtures test execution and split isolation, not historical calibration.
A separate StatsBomb World Cup 2022 assessment trained on 48 group matches and evaluated 16 later
knockout matches. The fitted team-ID model did not beat the training-mean baseline; it does not
affect gameplay. See [MODEL.md](MODEL.md) and [evaluation metadata](evaluation.json).

The optional notebook also executes on the actual World Cup final event export. Genuine provider
event IDs and retained converter row indices preserve simultaneous same-clock actions and their
possessions; repeated provider IDs are rejected. Raw data stays outside the public repository.

## Upstream audit and retained capabilities

The audited upstream suite ran with the system Python on 2026-10-05: 45 tests passed with 1,285
warnings. Warnings included PuLP deprecations, constant-data precision warnings, synthetic curve
fit covariance warnings and a Windows physical-core discovery warning. Upstream tests exercise
synthetic fixtures and algorithm properties. Passing them does not prove football forecasting
accuracy or compatibility with this game's rules.

| Upstream area | Decision | Reason |
| --- | --- | --- |
| Entities, canonical schema, StatsBomb loading | Reuse through the adapter | Fits attributed events and explicit source identities; add boundary checks and nested-outcome handling. |
| xT, passing networks, centralities, progression | Keep available in the notebook | Useful on supplied event data; labels distinguish descriptive fits and receiver inference. |
| Fixed team rate and score distribution | Use in gameplay | The supported fixed-parameter mapping keeps existing game behavior. |
| Fitted team scoring and evaluation metrics | Expose for separate dated results | Time split and simple baseline are explicit; no transfer to invented cross-era teams. |
| Role NMF, RAPM, Bayesian skill, IRT, form | Preserve upstream capabilities | Require event, stint, response or chronological evidence absent from card ratings. Event NMF is exposed; other estimators are not treated as fitted. |
| Squad MILP | Keep upstream; retain game assignment | Its three built-in formations use different roles/counts and cannot replace the game's complete formation catalogue and role-dependent objective. |
| Substitution MILP | Keep upstream; retain legal game substitutions | Its all-pairs indicator coupling can return more moves than the substitution cap; use the game's one-player-off/one-player-on path. |
| Cross-source name matcher | Review candidates only | Actual implementation matches names and nationality greedily, permits repeated right IDs, and does not implement the DOB condition stated in its module header. |
| EPV U-Net and GAT | Preserve as upstream research interfaces | They raise `NotImplementedError`; they are stubs, not trained predictors. |
| Copula, Hawkes, tensors, inference and valuation | Preserve upstream | Their data requirements and target quantities do not match a fifteen-card draft without separate evidence. |
| Product ingest/build and UI | Preserve upstream product | Its optional synthetic event fallback is labelled. Auto-build/download is not invoked by gameplay, and event summaries do not become card ratings. |

## Replacement and archive boundary

The game keeps one adapter and one installable dependency. No upstream repository, unique
research or attribution is archived. The game engine remains responsible for football game rules.

`era_eleven/events.py` must remain active: its xA links to explicit assisted-shot IDs, excludes
shootouts, and its local xT estimator counts unsuccessful moves as turnover probability. The
upstream xT estimator excludes failed moves from its transition denominator. For the test fixture
with one goal and one successful plus one failed pass from the same cell, the local estimator
returns 0.5 at the passing cell while upstream returns 1.0. These are different estimators, so
upstream xT is an additional analysis option rather than an exact replacement.

An archive candidate needs a named replacement and a passing behavior comparison. Role scores,
assignment, substitution/fatigue logic and the event module have not met that replacement test.
Keep those fallbacks active. Any other proven archive items and restoration instructions are
recorded in the project's archive manifest.

## Reproduce the checks

```text
python -m pytest tests/test_analytics.py -p no:cacheprovider --basetemp "<project work folder>/analytics-tests"
python -m unittest discover -s tests
```

The adapter checks actual upstream method use, binary rate equality, the labelled fallback,
identity/card separation, missing event measurements, canonical-event failures, nested goal
outcomes, possession/period isolation, prediction normalization and training/evaluation isolation.
The machine's work folder stores the installation hashes, solver defect probe and raw test logs;
these machine-specific artifacts are excluded from the public project.
The installation check compared all 79 upstream Python files with the installed files and found
no hash differences. The final adapter suite passed 19 tests, including 2,187 binary rate
comparisons. The installed upstream selection passed 19 tests. Full application performance has not been benchmarked.
