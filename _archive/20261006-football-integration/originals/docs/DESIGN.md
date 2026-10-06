# Era Eleven demo

Era Eleven follows Eraball's visible era-selection, random draft, lineup, and simulation loop for association football. Five spins award three players apiece. A draw supplies a manager and one of that manager's supported formations. The final squad has eleven starters and four substitutes.

The primary deliverable is `Football Era Lab.ipynb`. It runs offline with bundled ratings and exposes the underlying Python objects. A small local browser interface calls the same engine for a more direct game experience. The notebook adds data inspection, substitutions, repeated simulation, sensitivity analysis, and an optional real-match event laboratory.

## Player pool

The bundled pool uses attributed community datasets whose publishers declare CC0. It includes FC 24 base ICON and HERO cards plus FIFA 18 and FC 24 career snapshots. Era labels on ICONs and HEROes identify a broad career period; these are reconstructed game ratings, not attributes measured in the 1990s. Modern means the 2020s snapshot, not the current game edition. No player portraits, game artwork, club badges, or Eraball code are copied.

The pool supports Legends, 1990s, 2000s, 2010s, 2020s, and All eras. Earlier classics join the Legends pool because the available pre-1990 subset cannot cover a full formation by itself. Player identity is distinct from card identity, so different editions of one player cannot occupy two places in the same draft.

## Draft and assignment

The manager draw fixes a formation for the run. Eleven role slots and four reserve groups (keeper, defence, midfield, attack) define the squad's needs. A randomized assignment selects fifteen distinct people before the first reveal. Each spin reveals the next three. This prevents a late dead end without quietly adding players or rerolling the squad. SciPy's linear assignment solver then selects the best feasible eleven from the fifteen.

## Team and match model

Role scores use published attributes with editable position-specific weights. Tactical fit and pair complementarity affect attack, midfield control, and defence separately. Country and club continuity supply a small, explicitly heuristic chemistry term. Manager tactical settings are game-design assumptions. They are not fitted coaching effects.

The goal model uses the standard independent Poisson score model with log-linear attack, defence, and home effects. Player-to-goal coefficients are demo settings and are not trained on historical results. A showcase match emits sampled shots whose Bernoulli outcomes yield exactly its reported score. Four substitutes matter through pre-match swaps and optional automatic substitutions, which change the second-half rates. The repeated-trial mode reports win/draw/loss probabilities and Monte Carlo sampling error. It does not claim historical realism or calibrated cross-era predictions.

Real-event analysis is separate from simulated match statistics. It reads StatsBomb events on demand to compute measured xG, shot-linked xA, progression, pressures, and a Singh-style expected-threat field. Raw StatsBomb data stays in an ignored local cache. Any saved analysis carries the source logo and attribution. A single-match demonstration is explicitly too small for a reliable player ranking or a calibrated xT field.

## Validation

Check exact draft counts, identity uniqueness, role coverage in every playable era, deterministic replays, invalid pools, substitutions, equal-team symmetry, and goal/event agreement. Execute the notebook from a clean kernel and test the browser's draft and match buttons. Inspect the repository allowlist and public visibility before handing it over.
