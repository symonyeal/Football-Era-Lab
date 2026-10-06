# V2 replaces the active Python game

The active browser loads static files and bundled JSON. `app/engine/` is the single football simulator. The active notebook calls that engine through Node, and Python's active game work is data building, calibration and notebook presentation.

The v1 Python engine, server, peripheral modes, old browser and their tests are preserved in `_archive/20261006-v1/`. The archive's main README inventories the code and data. [DOCUMENTATION.md](../_archive/20261006-v1/DOCUMENTATION.md) covers the preserved README, notebook, requirements, workflow and documentation. Their evidence and example commands refer to v1 and do not apply to v2.

V1 saves and profiles use a different implementation and data scheme. V2 browser progress uses its own format; there is no automatic migration of a v1 profile, competitive result or old card album. Do not use the archive's server command to start the static v2 game.

Era Gauntlet and the tournament circuit now use the completed draft and the shared match engine. Their football rules are described in [MODES.md](MODES.md). Head to Head and Weekly Challenge remain future work. Publishing or enabling a hosted site is a separate deployment step.
