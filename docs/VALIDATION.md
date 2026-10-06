# Validation, 2026-10-06

The shipped Python service, notebook and original browser interface were exercised with the system Python 3.14. The [machine-readable summary](validation-summary.json) records scoped checks. Maintainer commands, raw audit observations, captured outputs and isolated test databases remain in the maintainer's project work folder, not the public checkout.

## Commands and outcomes

`python -m pytest tests -q`: **92 tests passed**, plus ten successful subtests. `python -m unittest discover -s tests -v` is the dependency-free test-runner equivalent after installing both requirements files. Dedicated adapter tests passed nineteen cases, including 2,187 binary floating-point rate comparisons and tests proving upstream method output affects game rates.

The core suite with all `fas` imports intentionally denied passed **73 tests**. It excludes the nineteen optional adapter/entity/event/evaluation cases; it does not uninstall or modify the user's environment. CI has installed-analytics and offline jobs.

Fresh-kernel notebook execution passed all 37 cells/eighteen code cells with optional downloads off. A separate absent-fas kernel passed the same notebook plus its import-denial setup cell. The optional real-event execution also passed all 37 cells, including the actual 2022 World Cup final's event metrics, retained local xT and fas event diagnostics. Runtime files/cache/exports were directed into the work folder. Windows emitted the documented zmq Proactor selector-thread warning; execution had no error outputs.

## Actual user workflows

The full browser suite passed 30 checks: keyboard five-spin draft; fifteen people and keeper swap; match, reload and versioned recipe replay; settings/collection; fixed weekly completion; fourteen-game Gauntlet segments and a lost boss restarting its act; complete ten-event/five-format Circuit with event-derived awards; four career decisions, saved log and SVG; all four completed minis; mobile layout; two independent humans, opponent reveal, shared authoritative result, reconnect, isolated second room, public export, two-vote rematch and local handover.

The extra-control suite passed 12 checks, including salary quotas/budget, rejected seed/substitution/import retaining state, one-use respin, career office/retirement, mobile career/clubhouse widths, real 60-second room expiry and real 120-second mini expiry/reload. Presentation checks passed 8 workflows: menu/help, actual persisted presentation fields, audio-gain/volume and auto-substitution effects, share fallback without credentials, two-browser profile/career restore, and preserved previous-profile draft access. Four additional management/room checks cover pressing/era development costs, one-for-one signing, legal fifteen-person count, reload, and a complete local two-human salary draft with both budgets and quotas. These suites recorded no JavaScript exceptions.

Hard-to-trigger rules have controlled service checks: boss losses restart all five eras without dropping people/development; first late-ready and late-mini answers commit timed completion exactly once; altered roster/result submissions and cross-room credentials are rejected; cap-on/off rankings are separated; opponent difficulty follows the actual rival at both venues. Career tests cover causal tackle timing, paid training/equipment/transfers, table totals, durable reopen, twenty-level progression and escaped retirement SVG.

## Coverage and replacement evidence

An independent 600-draft probe across six pools and seeds 0–99 found zero unusable reserves and zero failures of distinct GK/defence/midfield/attack assignment in the actual formation. The bundled 625-card attribute file retains SHA-256 `4dac2fa5887eea643b77548c5a2810790068400bd82087bcdddea6e2d52dcd9c`; imports require explicit identities/reviewed overrides and disclose missingness.

The pre-integration 60-draft baseline comparison is exact in 28 cases after excluding two explicit config schema extensions. Every other changed case had invalid actual-formation reserve coverage and is deliberately corrected; a known-different score control was detected. Exactness is claimed for the fixed rate mapping and unaffected predicate, not the whole corrected engine.

Upstream fas ran 45 tests with 1,285 warnings; nineteen selected installed-upstream tests passed. All 79 upstream Python files matched the installed copy by hash at the audited pin. These synthetic/property checks do not prove forecasting accuracy. The real 48-training/16-evaluation World Cup assessment failed to beat its simple baseline and remains outside gameplay.

## Reproduction and limits

Install `requirements.txt` and `requirements-analytics.txt`, run the unit command above, and execute the notebook with `nbclient` from the repository folder. The [portable browser scripts](../tests/browser/README.md) require Playwright/Chromium and two contexts reaching the Python server. Repeat every row of [FEATURE_MATRIX.md](FEATURE_MATRIX.md), including real clocks, reloads and invalid actions; screenshots and counts alone are insufficient.

This record validates the stated football workflows, not unplayed reference branches, global hosting, historical boss rosters or calibrated cross-era predictions. See the reference/integration/data audits. No restricted raw downloads, audit profiles, database state or credentials are public. The superseded-doc archive and restoration manifest follow the main development publication, with post-archive tests recorded in the cleanup commit.
