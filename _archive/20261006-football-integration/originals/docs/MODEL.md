# The model you can change

## Draft

The game filters the era pool, groups cards by person, and chooses one available card for each person. It considers manager/formation combinations in seeded random order and uses the first feasible one. The eleven formation roles and four reserve groups must all have distinct eligible people. This can make the manager draw depend on which roles exist in the selected pool.

For each role/person edge, its random selection score is `overall + temperature * Gumbel(0,1)`. Edges below `min_fit` are forbidden. SciPy's rectangular assignment solver maximizes the score and selects fifteen people. A seeded shuffle orders the awards into five batches of three. This is a randomized feasible assignment, not a uniform draw from every possible squad.

## Starting eleven

Native position fit is 1.00; a listed adjacent role is 0.88. Wider positional families receive lower fit and are rejected under the default threshold of 0.85. Goalkeepers have zero fit in outfield positions and vice versa. The adjacent-role graph and attribute weights are editable in `era_eleven/engine.py`.

Each outfield role score is the weighted mean of six published attribute groups, multiplied by position fit. Keeper scores combine diving, handling, kicking, reflexes, and positioning. The starting assignment maximizes the sum of role scores within the drawn formation. Four people remain on the bench.

Custom role weights are retained with the team and used when swapping substitutes. The optimizer is an exact linear assignment solver for the supplied scores, following the [SciPy documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html). The score definition is a game-design rule.

## Team units

The model computes separate attacking, midfield-control, defensive, and goalkeeper attributes. It blends nearby creator/finisher complementarity with small country and club continuity terms. The distance weights come from formation-slot locations. They are proxies for combinations, not learned effects of real players sharing a pitch. Manager possession and pressing settings are also design assumptions.

Missing historical-card stamina uses the configurable value `default_stamina`, initially 78. The source card remains unchanged, and the rating result lists each affected player. Stamina influences the fatigue scenario; it does not change published ratings.

## Goal rates

Let `A`, `C`, and `D` denote the adjusted attack, control, and defence scores. Let `k` be `role_scale`, `b` be `base_goals`, and `h` be home advantage. The rate structure is:

```text
home goals = b * exp((A_home - D_away)/k + 0.25*(C_home - C_away)/k + h)
away goals = b * exp((A_away - D_home)/k + 0.25*(C_away - C_home)/k)
```

The exponent is clipped to the interval `[-1.5, 1.5]`. Rates are computed for the first sixty minutes and the final thirty, weighted by segment duration. At minute 60, up to three compatible fresh substitutes replace incumbents if their role score exceeds the fatigued incumbent score. Players taken off cannot return. A fatigue factor applies to the final segment.

This is the standard independent-Poisson structure documented in [penaltyblog](https://penaltyblog.readthedocs.io/en/latest/models/overview.html). The attribute-to-rate mapping, clipping, and fatigue rule are demo restrictions and additions. They have not been fitted or validated on real results. Dixon-Coles low-score dependence, disciplinary events, injuries, extra time, and penalties are not implemented in the game match engine.

## Displayed matches and repeated trials

For a segment goal rate `lambda`, the showcase game draws a Poisson number of shots with mean `lambda / 0.12`. Each shot's goal probability is drawn from a beta distribution with mean 0.12; an independent Bernoulli trial marks the shot as a goal. Poisson marking therefore gives the same Poisson goal marginal used by the repeated-trial mode. Player attribution favours shooting ratings, without changing the team's expected goal rate.

The displayed shot xG is the sum of the sampled probabilities. It differs from the pre-match rate and should not be substituted for it in a model comparison. Possession is a logistic transform of the control-score difference, labelled as a proxy. The score equals its goal-event count.

Repeated trials draw independent Poisson scores at the same integrated rates. They report wins, draws, losses, sample means, and approximate 95% binomial sampling intervals. These intervals omit model uncertainty. The gauntlet repeats the showcase engine against seeded generated squads, counting wins as three points and draws as one. Its unbeaten run includes draws.

## Real-event laboratory

`events.py` consumes local [StatsBomb event files](https://github.com/statsbomb/open-data), under the provider's separate agreement. It excludes shootouts, aggregates measured shot xG, subtracts penalty xG for npxG, and links assisting passes to recorded shots for xA. Scheduled minutes use starting lineups and substitutions, with extra time included and stoppage excluded.

The expected-threat calculation solves [Karun Singh's fixed point](https://karun.in/blog/expected-threat.html), `V = shoot * goal + move * T @ V`. Failed moves absorb possession; transition rows therefore need not sum to one. The single-final example uses empirical goal frequencies, no smoothing, and zero values for unobserved cells. Those restrictions are stated with each result. The field is a demonstration, separate from the game's rate model.

No fitted adjusted plus-minus, VAEP, or hypergraph coefficients are claimed. Those layers require a larger, resolved lineup/event history and held-out validation before they can replace the current demo settings.
