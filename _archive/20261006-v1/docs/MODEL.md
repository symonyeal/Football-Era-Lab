# Attributes, expected goals and uncertainty

## Inputs and role assignment

Cards retain explicit person identity, edition, source, season, licence and lineage. ICON/HERO attributes are reconstructions; modern attributes are published snapshots; PES grouped attributes are mapping proxies. Missing attributes remain missing. The game names any stamina fallback and exposes its editable default. Similar names are not identity evidence.

Native position fit is 1.00, listed adjacency 0.88; broader families fall below the default 0.85 threshold. Goalkeepers cannot fill outfield roles. Six weighted outfield groups and five keeper groups define role scores. SciPy assignment maximizes starter quality while retaining four distinct reserves usable in the formation. Tier/budget variants add binary constraints. The manager draw depends on pool feasibility; the sampler is not uniform over every legal squad.

Separate attack, control, defence and keeper units combine role suitability with small editable chemistry/tactical proxies. Country/club continuity and formation distances describe game-design complementarity. Manager possession/pressing constants are not estimated coaching effects. Custom role weights persist through substitutions.

## Shared scoring path

For a segment's home and away units, the fixed log-rate contrasts are:

```text
home = (home.attack − away.defence)/role_scale
       + 0.25 × (home.control − away.control)/role_scale + home_advantage
away = (away.attack − home.defence)/role_scale
       + 0.25 × (away.control − home.control)/role_scale
rate = base_goals × exp(clip(contrast, −1.5, 1.5)) × segment_minutes/90
```

The adapter maps these contrasts into the pinned `fas.performance.team_scoring.TeamScoringModel`, whose `expected_goals` method supplies the rates. The upstream call actually affects simulation. Its parameters are fixed, with `rho=0`; gameplay does not fit historical results. The labelled offline fallback preserves the arithmetic and operation order.

Segments cover minutes 0–60 and 60–90. At sixty, compatible fresh substitutes can replace starters; a player taken off cannot return. Fatigue uses stamina and fresh-substitute count, with its declared lower bound. Opponent difficulty multiplies the actual opposing side's rate at either venue. Peer fixtures use no user-opponent boost. Development changes fatigue/difficulty settings, not published attributes.

The showcase samples Poisson shots and Bernoulli goals; goal events equal the reported score. Shot xG is the sampled chance sum; expected goals are the model's pre-simulation rates. Separate seeded shootouts settle decisive drawn ties and do not change match goals. Career decisions add/prevent explicitly labelled chances around the shared surrounding simulation; their interactive effects have no fitted xG estimate.

Repeated trials and analytic matchup probabilities use the same fatigue/substitution-adjusted rates. Approximate sampling intervals quantify Monte Carlo error, not rating or model uncertainty. Analytic scores 0–16 are renormalized and omitted tail mass is reported. Historical-era normalization and drafted-squad calibration remain unmeasured.

| Output | Affects gameplay? | Evidence |
| --- | --- | --- |
| fas fixed expected-goal rates | Yes | Adapter patch-sensitivity and binary rate tests. |
| Role fit, weights, tactical/chemistry settings, fatigue, difficulty | Yes | Declared game coefficients and constraints. |
| fas entity mapping and cosine attribute similarity | No | Descriptive provenance/attribute diagnostics. |
| fas xT, passing networks, progression, event NMF roles | No | Supplied real events; same-match fits are descriptive. |
| Historical fitted team Poisson assessment | No | Separate earlier training/later evaluation, compared with baseline. |

## Real-event tools and fitting

Measured events use numeric provider identities, canonical actions and explicit attribution. The adapter preserves possessions/periods and excludes shootouts from match-play analysis. Passing receivers use the next same-team action heuristic; incomplete possession evidence is disclosed. Latent NMF roles are event profiles, not eligibility for named formation slots.

The active local event module retains explicit assisted-shot xA and turnover absorption in its xT estimator. Upstream xT excludes failed moves from its transition denominator. On the narrow tested example they return 0.5 and 1.0 respectively, so upstream is an additional option, not an exact replacement. Simulated shot logs lack spatial actions and cannot yield measured networks or xT.

The separate [2022 World Cup assessment](evaluation.json) fitted 48 group matches before 2022-12-03 and held out 16 knockout matches. Mean Poisson negative log likelihood was 3.876149 for fas versus 3.231891 for the training-mean baseline; outcome Brier 0.628856 versus 0.627384; home-win calibration error 0.314364 versus 0.219779. Lower is better: the fit did not beat the baseline. This small tournament/team-ID assessment does not validate cross-era cards; record scores can include extra time and upstream does not expose optimizer convergence. It is excluded from gameplay.

Data: [StatsBomb Open Data](https://github.com/statsbomb/open-data), under its separate data agreement. Raw event/results files remain outside the public repository.

![StatsBomb](https://raw.githubusercontent.com/statsbomb/open-data/master/img/SB%20-%20Icon%20Lockup%20-%20Colour%20positive.png)

See [INTEGRATION.md](INTEGRATION.md) for module-by-module audit, entity mapping, optimizer incompatibilities and supported event/evaluation inputs.
