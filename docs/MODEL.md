# What changes a team's strength

The browser and notebook use `app/engine/index.js`. Python builds data and fits models; it does not run a second match simulator. Source modules carry a legend for their short variable names, and the notebook prints the active match parameters and data reports.

## Ratings keep their source

Each person has a separate card for each qualifying club and decade. For source `f`, the pipeline averages the highest three available FIFA/FC overall ratings from editions matching the club and covered stint, using fewer if fewer exist. If that overlap is absent, it uses an EA Icon/Hero reconstruction when linked, then a nearby edition extrapolation, then a fitted estimate. The badges `f`, `i`, `n` and `e` make these differences visible. Final base ratings are bounded between 45 and 95.

The estimate uses a histogram gradient boosting model, which combines decision trees, fitted where Wikidata and FIFA overlap. Features include appearances per season, goals per appearance, international caps, Wikipedia coverage, club results, age, position group and a missing-apps indicator. Held-out player groups keep the same person out of both training and validation in a fold. The report compares prediction errors with a position-group mean baseline. Its scope is prediction of published ratings in the observed overlap. Transferring that model to the 1950s remains an assumption; source coverage and the prominence of players in Wikipedia can bias estimates.

The age adjustment is zero from age 25 through 30. Outside that interval it deducts 0.8 points per year younger or 1.2 per year older, capped at a 12-point loss. A nearby edition can be at most two seasons from the card's covered interval and can come from another club; it is therefore labelled an extrapolation. Legend reconstructions are game ratings made long after the player's career. They are not contemporaneous measurements.

## Position and era adjustment

The position graph connects neighbouring football roles. Playing in a natural role costs nothing. One graph step costs 10%, two steps cost 22%, and a larger distance costs 35%. A goalkeeper playing outfield, or an outfielder playing in goal, loses 75%. Bench slots carry no position penalty. See `app/engine/pos.js` for the graph and labels.

Era multipliers are asymmetric. At increasing decade distance, an older card moved forward uses `[1, .97, .94, .91, .88, .85, .82, .79]`; a newer card moved backward uses `[1, .985, .97, .955, .94, .925, .91, .895]`. Timeless tier 1 retains a quarter of the ordinary loss; tier 2 retains half. These are declared game design parameters, not measured effects of time travel.

For a starter, the engine begins with:

```text
adjusted rating = base rating * (1 - position loss) * era multiplier + chemistry points
```

Starting duo partners gain three chemistry points per distinct linked partner. Nearby players from the same club and decade gain one point per link, up to two such points. The total chemistry bonus is capped at five points per starter. Slot coordinates define nearby links. These links approximate familiarity; a decade card does not establish that two players shared a season. Tags such as Talisman, Rock and Maestro change the matching team line, with caps. Timeless and famous partnerships are curated game design.

## Formation and manager

Each outfield slot has weights for attack, midfield and defence. The engine takes a weighted average for each line and adds a formation manpower adjustment relative to a reference 4-4-2. A keeper contributes separately to the defence an opposing attack faces. This lets a formation move strength between lines while position penalties discourage arbitrary placement.

For each outfield line, before manager and tag effects:

```text
line strength = sum(slot weight * adjusted rating) / sum(slot weights)
                + 6 * log(sum(slot weights) / reference weight)
```

The reference attack, midfield and defence weights are 3.24, 2.86 and 3.90. The defence an opposing attack faces combines 70% of the outfield defence with 30% of the keeper rating. The slot weights, reference values and formation adjustment are game design constants in `app/engine/rate.js`.

Manager attack and defence grades scale the corresponding lines. A signature player anywhere in the fifteen-person squad upgrades both grades one step. The notebook shows the effective grades and whether the upgrade was triggered. Manager honours, formation associations and signature lists are curated; grades are not an estimate of a causal coaching effect.

The displayed overall rating combines 85% of the starters' mean adjusted rating and 15% of the bench mean, then applies the average manager-grade bonus. Match results use the attack, midfield, defence and keeper strengths directly; overall is a convenient summary. The assignment helper `best` finds the strongest slot assignment on position-adjusted and era-adjusted base ratings, then selects the remaining bench. It does not optimise chemistry or season win probability. Browser choices stay under the player's control.

## Matches and season

Each team's goals are drawn from a Poisson distribution. The full-match goal rate before phase-specific fatigue, availability and knockout adjustments is:

```text
goals expected = decade rate * exp(
    beta * ((attack - opponent keeper-weighted defence) / 10
            + midfield weight * (midfield - opponent midfield) / 10)
    + home advantage
)
```

Matches include random starter absences, bench cover, fatigue and two substitution windows at minutes 60 and 75, with up to three substitutions in total under the default rules. If no real reserve can cover an absence, a labelled academy filler can appear. Knockout experience adds a small boost in Cup games. Extra time and a simulated penalty shootout resolve tied Cup contests.

The selected match parameter values and their provenance are shown in `data/calibration.json` and the notebook. Calibration uses matching club-season FIFA edition rosters, the engine's best XI in 4-3-3, a neutral manager and no curated tags. Seasons starting in 2014 through 2019 fit the goal-rate parameters; seasons starting in 2020 through 2023 form the holdout. Unmatched clubs and fixtures are excluded from both the model and its training-mean home/away baseline. This is a check of expected goal rates against real results, without the game's random absence and fatigue draws.

The deployed neutral scoring level for both the 2010s and 2020s is frozen from training. Earlier decade rates scale that fitted level by measured historical scoring ratios; the separately measured 2020s scoring level is reported but is not used to tune the holdout. Read the report's actual coverage, errors and baseline comparison before interpreting the fit. Historical club-decade squads and mixed-era drafts are outside this holdout. Formation, chemistry, tags, absence rates, substitutions and cross-era effects remain modelling choices even when the goal-rate fit improves.

The league simulates every fixture and awards three points for a win and one for a draw in every decade. The Cup uses the same format in every decade, with no away-goals rule. Simulated goals, assists, appearances and keeper clean sheets are game events, not historical facts. Player of the season uses the declared score `4 * goals + 3 * assists + 3 * clean sheets + 0.1 * appearances`; it is a game award, not a fitted measure of overall performance. This simplified model does not measure pressing, individual defensive actions, tactics during a match or a player's true ability across eras.
