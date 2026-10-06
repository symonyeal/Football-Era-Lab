# Game design and saved authority

Era Eleven translates the audited Eraball loop into association football. The user specifies three people per spin, five spins, fifteen distinct identities and a manager/compatible formation draw. These are football requirements, not the reference's nine-card basketball draft. [FEATURE_MATRIX.md](FEATURE_MATRIX.md) separates observation, adaptation and verification.

## Draft and management

The engine selects the fifteen people before any reveal. An ordinary seeded assignment samples card editions and feasible manager formations, then applies `overall + temperature × Gumbel` selection scores. Starting roles and four distinct reserve groups must be legal in the **actual formation**. An ordinary best eleven is preserved if its reserves satisfy that constraint; otherwise joint assignment protects a keeper, defender, midfielder and attacker. A failed fifteen-person draw is repaired before the first spin, using the original random scores. No hidden player is added later.

Different cards of the same source person cannot coexist. Formation changes use that manager's supported list and reject an incompatible squad; swaps enforce minimum role fit. Salary/tier drafts use binary assignment constraints, not post-draft deletion. Football tiers are S ≥90, A 87–89, B <87. Salary mode requires 2 S / 4 A / 9 B, with default budget 200 and card cost `max(1, (overall−60)/2)` game coins. These are declared game rules, not player wages. The earlier A ≥85 cap was infeasible for the historical pool; raw attributes were preserved while the tier boundary was corrected.

Randomize Era uses editable nonnegative weights, equal by default across eligible single-era pools. It validates the actual seeded edition draw and its constraints before selecting. All eras remains a mixed pool. The chosen era persists. Classics is excluded from independent random selection because its role coverage is insufficient.

## Competitions

Gauntlet maps are Legends→1990s→2010s, its reverse, all five supported eras, and their reverse. Initial recruitment uses Classics/1990s/2000s reconstruction cards, with one S and an optional four-A cap. Every act has four fourteen-match segments and then a best-of-seven boss; drawn boss matches use separate seeded shootouts. Patience starts at 8/20. Nine segment wins adds one, seven or eight is safe, fewer costs one. A first boss-series loss costs four, later losses cost six across the run. A surviving loss restarts the same act; people, signings and development persist and the attempt changes the seeds. Zero patience eliminates; all boss victories complete the route.

One management choice follows a segment: rest gives two, then one, then zero consecutively; spending resets the rest streak. A pressing badge or era-adaptation upgrade costs one patience. Free agency replaces one bench person, costing B one / A two / S three, respecting two-S/four-A active-signing limits when enabled and retaining legal reserves. Keep at least one patience when spending. Pressing development reduces fatigue; era adaptation changes declared opponent difficulty. Source ratings remain unchanged. Cap-on score multiplies match points and boss bonuses by 1.5. Generated opponents are explicit; historical boss rosters are not fabricated.

The 10–20-event Circuit rotates five football formats across the eras. League sprint uses four-team, two-leg standings. Group cup uses a complete four-team table, qualifies its top two, then a semi/final. Knockout stops on a loss. Aggregate cups play both venues against the same rival; aggregate ties use a shootout, without altering either leg's score. Best-of series is first to three wins in five. Event score is football points plus ten for a title. The user's simulated goal events and clean sheets produce squad awards. Titles and boss victories unlock starter trophy cards separately from draft collection.

Weekly Challenge pins UTC week, rules file, seed, pool, quotas, data/model fingerprint, rivals and difficulty. Editable client draft settings cannot override it. Best results are compared under matching conditions. The ordinary eight-club, fourteen-round season remains an additional laboratory with complete home/away schedules and reconciled standings.

The League is a fictional-player d20 career: four decisions surround each engine match, with timed tackles/chances, Control, Legs, Momentum, repeat-play penalties, source-anchored skills, habits, playbooks, kit, relationships, costed transfers and earned XP. Eight milestone chapters span twenty levels. Retirement preserves actual career summaries and escaped SVG output. This finite football design simplifies the reference's basketball dialogue/quest graph and thirty-season ageing; it is not a squad-season substitute masquerading as the career.

Mini Games preserve daily/unlimited pacing: fifteen-guess card feedback, one-life fifteen-comparison Higher or Lower, 120-second attributed club-snapshot recall, and five-round Country Hunt. Nationalities replace career-location geography because that history is unavailable. Local-date daily puzzles are reproducible and excluded from ranked competitions.

## Authority, persistence and interface

`GameService.call` is the common notebook/HTTP authority. SQLite transactions save runs, profiles, careers, puzzles, rooms, achievements and comparable scores. Opaque bearer credentials authorize private state; action IDs deduplicate retries and revisions reject stale edits. Results and player attributes are computed by the authority. Public replay imports validate versions and awards, reject supplied scores/rosters, and enter unranked practice.

Online private rooms have two independent humans, simultaneous independent drafts, host start, hidden opposing cards until both drafts finish, server-enforced deadlines, reconnect and two-vote rematches. A private per-room seed salt prevents forecasting the opposing draft from the host's input seed. Local play has alternating handover; optional shared-exclusive pools use thirty distinct identities. Football neutral-match scoring replaces the observed separate basketball seasons. Account matchmaking and external account synchronization are absent and labelled.

Browser storage remembers credentials; SQLite supplies server-local persistence and rankings. Match W/D/L and goals reconcile with played outcomes, campaign totals include every user fixture, and duplicate completion cannot award again. Mini statistics and trophy evidence are separate. Score comparison keys include era, config, variant, draft rules, Gauntlet map/cap, circuit length, week and release version.

The original browser UI and notebook widgets expose the same engine, progress and explanations. Settings alter appearance, backdrop, sorting, lineup view, sound/volume, motion and effects. Help states rules and data limits. HTML escapes source text; public sharing omits credentials. Original code/assets remain distinct from the audited reference.
