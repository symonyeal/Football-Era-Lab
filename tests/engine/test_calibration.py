"""Calibration contracts. X = independent goal-model features; y = observed counts."""
import importlib
import importlib.util

import numpy as np
import pytest


def mod():
    assert importlib.util.find_spec("pipeline.calibrate") is not None
    return importlib.import_module("pipeline.calibrate")


def test_fit_recovers_an_attack_midfield_and_home_effect_from_independent_counts():
    c = mod()
    r = np.random.default_rng(17)
    X = np.column_stack([r.normal(size=20000), r.normal(size=20000), r.integers(0, 2, size=20000)])
    y = r.poisson(np.exp(-0.2 + 0.5 * X[:, 0] + 0.125 * X[:, 1] + 0.2 * X[:, 2]))
    p = c.fit(X, y)
    assert abs(p["c"] + 0.2) < 0.04
    assert abs(p["be"] - 0.5) < 0.04
    assert abs(p["ka"] - 0.25) < 0.05
    assert abs(p["h"] - 0.2) < 0.04
    mu = c.pred(X, p)
    b = np.where(X[:, 2] == 1, y[X[:, 2] == 1].mean(), y[X[:, 2] == 0].mean())
    assert c.score(y, mu)["nll"] < c.score(y, b)["nll"]


def test_invalid_or_empty_fit_inputs_fail_before_optimization():
    c = mod()
    with pytest.raises(ValueError, match="finite|nonempty"):
        c.fit(np.empty((0, 3)), np.empty(0))
    with pytest.raises(ValueError, match="finite"):
        c.fit(np.array([[np.nan, 0, 1]]), np.array([1]))


def test_goal_likelihood_includes_factorials_and_reports_reproducible_rmse():
    c = mod()
    s = c.score(np.array([0, 1, 2]), np.array([1, 1, 1]))
    assert s["nll"] == pytest.approx(1 + np.log(2) / 3)
    assert s["rmse"] == pytest.approx(np.sqrt(2 / 3))


def test_deployed_heldout_baseline_is_frozen_from_training_with_historical_ratios():
    c = mod()
    B = {D: {"goalsPerTeam": 3.0 if D == 2020 else 0.75} for D in [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]}
    p = c.params(dict(c=np.log(1.2), be=0.5, ka=0.25, h=0.1), B, 1.5, "measured test")
    assert p["b"][2020] == pytest.approx(1.2)
    assert p["b"][2010] == pytest.approx(1.2)
    assert p["b"][1950] == pytest.approx(0.6)
