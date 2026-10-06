# Checks and their evidence

Run the checks from the repository root:

```text
node --test tests/engine/*.test.mjs
python -m unittest discover -s tests -p test_pipeline_v2.py -v
python -m pytest tests/engine/test_calibration.py -q -p no:cacheprovider
```

The Node suite exercises the shared engine and draft rules. The Python pipeline suite checks rules without downloading sources or fitting the full production model. The calibration tests use independently generated counts to check parameter recovery, likelihood calculations, invalid inputs and the frozen held-out baseline. CI installs the notebook and pipeline packages, runs these suites and executes the active notebook through Node. There is no frontend build or npm dependency install.

`data/validation.json` is the generated coverage and data-check artifact. `data/calibration.json` records the real-match calibration scope, selected parameters, held-out metrics and constant-baseline comparison. `data/manifest.json` records source attribution, counts and unresolved curated links. Inspect those artifacts directly; a green test suite does not establish that a historical squad is complete or that ratings are accurate.

The notebook reports data counts and the loaded data hash at execution time. It can run the same selected season twice to check deterministic replay. That proves replay for the tested inputs, not validity of historical outcomes. Old v1 reports live in `_archive/20261006-v1/docs/` and certify only that implementation.

Browser acceptance requires a complete manager choice, five actual squad selections with placement, lineup changes and a season on desktop and mobile. Reload, source labels, incomplete inputs and invalid saves require separate checks. Automated model tests alone cannot establish that these interaction paths work. Any unrun or failing browser check must be reported as such in the release evidence.
