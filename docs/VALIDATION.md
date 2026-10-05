# Validation on 5 October 2026

The demo was tested locally with the system Python 3.14 on Windows. The checks below were run against the delivered source and bundled player file.

| Check | Result |
| --- | --- |
| `python -m unittest discover -s tests -v` | 16 tests passed |
| Notebook execution | All 12 delivered code cells executed in a fresh Python kernel; no cell errors |
| Widget controls | New draft, five spin callbacks, match callback, and repeated-trial callback completed |
| Browser game | Five spins awarded three cards apiece; 15 roster rows, 11 pitch players, and 4 reserves were present |
| Browser match modes | Single match, 2,000-trial test, and 38-match gauntlet completed |
| Mobile layout | Completed squad checked at a 390 by 844 viewport without horizontal overflow |
| JavaScript | No browser page errors during the checked flow |
| Real-event analysis | Final's six shot goals reproduced; Messi two and Mbappé three; shootout excluded |
| Expected-threat example | 16 by 12 field converged at update tolerance `1e-10`; sparse, one-match illustration |
| Ratings provenance | Player-file SHA-256 matched the manifest; source publishers declare CC0 |

The notebook and browser checks used the actual Python engine. The browser check drove the visible buttons using Playwright and Microsoft Edge. This required no additional browser dependency in the public project. The game runs with the packages in `requirements.txt`.

The first mobile check exposed an intrinsic-width problem: the pitch's minimum height and aspect ratio widened its grid column. The pitch now has an explicit width constraint; the same completed-squad check passed after the change.

The initial Windows notebook runner emitted a pyzmq event-loop warning and, on one repeated run, a socket exception during kernel shutdown after its cells had completed. The verification driver now uses a selector event loop and explicit kernel cleanup. Python 3.14 reports that selector-loop policy APIs are deprecated for removal in Python 3.16. Local notebook execution was verified through nbclient and its Python kernel. The GitHub workflow defines an offline notebook check; the first remote CI result is reported separately from these local checks.

A source-identity audit also found four people whose historical cards and career snapshots had different IDs: Mario Gomez, Vincent Kompany, Wesley Sneijder, and Claudio Marchisio. Their cards now share person identities. A regression test checks those joins, in addition to the draft's identity-count checks. Shared surnames alone are never merged: Peter and Kasper Schmeichel, and Gerd and Thomas Müller, remain different people.

These checks establish the tested demo behavior. They do not measure football predictive accuracy, historical calibration, cross-era fairness, or model uncertainty. The public example's player-to-goal settings remain untrained game coefficients.
