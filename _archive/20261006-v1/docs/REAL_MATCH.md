# A real match, separate from the game

Data: StatsBomb Open Data. Argentina v France, World Cup final, 18 December 2022. Match ID `3869685`. Analysis run on 5 October 2026.

![StatsBomb](https://raw.githubusercontent.com/hudl/open-data/master/img/SB%20-%20Icon%20Lockup%20-%20Colour%20positive.png)

The notebook can reproduce this table by setting `RUN_REAL_EVENTS=True`. It downloads events into `data/local/`, which is ignored. No raw event data is published here.

| Player | Team | xG | Non-penalty xG | Shot-linked xA | Goals |
| --- | --- | --- | --- | --- | --- |
| Kylian Mbappé Lottin | France | 1.783 | 0.216 | 0.000 | 3 |
| Lionel Andrés Messi Cuccittini | Argentina | 1.455 | 0.672 | 0.274 | 2 |
| Lautaro Javier Martínez | Argentina | 0.584 | 0.584 | 0.000 | 0 |
| Ángel Fabián Di María Hernández | Argentina | 0.410 | 0.410 | 0.278 | 1 |
| Randal Kolo Muani | France | 0.374 | 0.374 | 0.000 | 0 |

The recorded shot goals sum to six, including two by Messi and three by Mbappé. Periods 1 through 4 include extra time; period 5, the shootout, is excluded. Penalties contribute to xG but not to non-penalty xG. Shot-linked xA credits the recorded assisting pass with the linked shot's xG.

Per-90 values use scheduled playing minutes, including extra time and excluding stoppage. The progression count is a completed pass or carry with at least ten metres of forward displacement. It is not FBref's progressive-pass definition. A single match is too small for a dependable ranking.

The illustrative 16 by 12 expected-threat field converged in 123 iterations at an infinity-norm update tolerance of `1e-10`. It uses empirical shot goal frequencies, successful-move transitions, and absorbing failed moves. Empty cells remain zero. This demonstrates the fixed point; it does not establish an era-level threat model.

Sources: [StatsBomb Open Data](https://github.com/statsbomb/open-data), its [data agreement](https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf), and [Karun Singh's expected-threat article](https://karun.in/blog/expected-threat.html). The separate game model does not use this one match to infer historical player strength.
