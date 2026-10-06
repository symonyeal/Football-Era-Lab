# Migration and archive inventory

The game baseline is `6eb513c00e4368ce6787294fd9b29bbee14945de`. The user's later checkpoint `93623e0ec3ae79cc8ccc76191ad1756aa2a16eb1` is preserved as the parent of this development. The analytics audit uses `a83c577a1d6b81da3a25a41f03c8e4096ecc4764`, installed as `fas`; upstream source is not copied into the game.

## Inventory and decision

| Material | Replacement / coverage | Decision |
| --- | --- | --- |
| Earlier README, DESIGN, MODEL, VALIDATION, INTEGRATION | Current mode/rule/model/validation documents; checked links and actual workflows | Move originals to `_archive/20261006-football-integration/`, preserving relative paths and hashes. |
| Earlier browser preview | Screenshot of the checked current original interface | Archive original image; active preview depicts this release. |
| Inline expected-goal arithmetic | `analytics.expected_rates` → pinned fas scoring; 2,187 binary rate comparisons | Replaced three active formula lines. Keep engine and labelled fallback; no wholly redundant module exists to move. Original source remains in Git. |
| Formation/role assignment, swaps and fatigue | Upstream MILP formations/roles and substitution coupling fail game-specific requirements | Retain active engine. Coverage correction is a declared behavior fix, not exact whole-engine refactoring. |
| `events.py` | Upstream xT has different failed-move semantics and lacks the same assisted-shot scope | Retain unique xA, shootout handling and turnover-aware xT; upstream tools are additional diagnostics. |
| `Football Era Lab.ipynb`, widgets | New saved modes supplement editable draft, sensitivity, event and export experiments | Enhance in place; no notebook or unique experiment archived. |
| Player subset, manifest, data attribution/importers | Identified permitted cards remain needed; import boundaries hardened | Retain unchanged bundled raw attribute subset and provenance. Large raw/restricted inputs remain outside public release. |
| Scripts/probes and audit artifacts | Reproducible maintainer work in the machine's `Claude Func Folder/football-integration` | Keep working evidence there, outside repository; never publish private profiles, databases or reference assets. |
| Other football prototypes/research, including Invincible | No demonstrated complete replacement | Out of scope and preserved. No entire repository or unrelated project is archived. |
| fas research/entity/optimizer modules | Installed upstream remains the analytics foundation | Preserve upstream. Stubs and incompatible solvers are documented, not claimed as game implementations. |

The originals are preserved byte-for-byte in the maintainer work folder before replacement. Following main publication, `_archive/20261006-football-integration/manifest.json` will record each original/replacement path, original SHA-256, reason, source commit, validation evidence and restoration instructions, with its README giving the restoration procedure. Archived documents contain historical claims and are not runtime dependencies.

## Compatibility boundaries

The fixed rate adapter matches the old arithmetic over the tested 2,187 parameter pairs. The default 60-case engine baseline comparison preserves all fields in 28 cases after excluding the two explicit config schema extensions. The other 32 cases had invalid actual-formation reserve coverage and are deliberately corrected; every changed case was checked against that predicate. A known-different score control confirmed the comparison detects changes. Whole-engine identity is not claimed.

Rules version `football-4` prevents old saved recipes silently acquiring changed awards. Saved runs, rooms and puzzles reject a different data/model/rules release. Imported campaign recipes become unranked practice rather than trusted client results. The private database and browser/profile credentials are not migrated into public artifacts.

Ranked comparison partitions include source/model/rules version, era, configuration, draft constraints, variant, map, roster cap, circuit length and week. An operator changing weekly rules creates a new comparison version. The completed deployment is a Python service/repository, not a hosted global account/matchmaking system.
