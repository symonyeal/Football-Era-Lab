"""Fit and evaluate the deployed JavaScript goal model on chronological FIFA-era club seasons.

Legend
  X        goal-observation features: attack-minus-opponent-defence / 10, midfield gap / 10, home
  y        observed home and away goals, in that order for each match
  p        c = log neutral baseline, be = attack slope, ka = midfield slope / be, h = home slope
  J        shared Node JSON bridge; R = JS-rated club seasons; G = matched real fixtures
  B        measured raw decade goal baselines; b = deployed neutral baseline by decade
  fit      bounded Poisson maximum likelihood; pred = corresponding expected goals
  score    full Poisson negative log likelihood per goal observation and RMSE
  sample   matched 2014-23 real fixtures with their actual edition's engine-rated best eleven
  run      fit 2014-19, freeze the parameters, score 2020-23, and write the selected model
"""
import argparse
import json
import math
import subprocess

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln

from .config import CUR, DS, LG, OUT, ROOT, WORK, dec


def fit(X, y):
    X, y = np.asarray(X, dtype=float), np.asarray(y, dtype=float)
    if X.ndim != 2 or X.shape[1] != 3 or len(X) == 0 or y.shape != (len(X),) or not np.isfinite(X).all() or not np.isfinite(y).all() or (y < 0).any():
        raise ValueError("Fit needs finite nonempty three-column features and nonnegative goals.")
    Z = np.column_stack([np.ones(len(X)), X])

    def obj(t):
        eta = Z @ t
        mu = np.exp(eta)
        return float(np.mean(mu - y * eta)), Z.T @ (mu - y) / len(y)

    t0 = [math.log(max(float(y.mean()), 0.01)), 0.55, 0.1375, 0.12]
    r = minimize(obj, t0, jac=True, method="L-BFGS-B", bounds=[(-4, 4), (1e-6, 3), (0, 3), (-1, 1)], options={"maxiter": 1000, "ftol": 1e-12, "gtol": 1e-8})
    if not r.success:
        raise RuntimeError(f"Poisson optimization failed: {r.message}")
    c, be, km, h = map(float, r.x)
    return dict(c=c, be=be, ka=km / be, h=h, converged=True)


def pred(X, p):
    X = np.asarray(X, dtype=float)
    return np.exp(p["c"] + p["be"] * X[:, 0] + p["be"] * p["ka"] * X[:, 1] + p["h"] * X[:, 2])


def score(y, mu):
    y, mu = np.asarray(y, dtype=float), np.asarray(mu, dtype=float)
    if y.size == 0 or y.shape != mu.shape or not np.isfinite(y).all() or not np.isfinite(mu).all() or (mu <= 0).any():
        raise ValueError("Score needs nonempty finite observations and positive expected goals.")
    return dict(n=len(y), nll=float(np.mean(mu - y * np.log(mu) + gammaln(y + 1))), rmse=float(np.sqrt(np.mean((mu - y) ** 2))))


def J(q):
    r = subprocess.run(["node", str(ROOT / "app" / "cli.mjs")], input=json.dumps(q, allow_nan=False), capture_output=True, text=True, encoding="utf-8", cwd=ROOT, check=False)
    if r.returncode:
        raise RuntimeError(f"Shared JavaScript engine failed: {r.stderr}")
    return json.loads(r.stdout)


def sample():
    from . import fifa, results
    from .build import load

    M = load("clubs")
    E = fifa.club_ids(fifa.editions(), M)
    S = [dict(s=s, x=x, y=y) for s, x, y in json.loads((CUR / "formations.json").read_text(encoding="utf-8"))["4-3-3"]["slots"]]
    teams, missed = [], []
    for (q, s), A in E.dropna(subset=["qid"]).groupby(["qid", "s"]):
        A = A.drop_duplicates("f")
        if len(A) < 11 or not any("GK" in p for p in A.pos):
            missed.append(dict(qid=q, s=int(s), reason="Fewer than eleven edition players or no goalkeeper"))
            continue
        D = dec(s)
        Q = [dict(id=f"F{a.f}", nm=a.sn, pos=a.pos, r=int(a.o), D=D, cq=q, tg={}, duo=[], src="fifa") for a in A.itertuples()]
        teams.append(dict(id=f"{q}:{s}", Ds=D, Q=Q, S=S))
    R = {r["id"]: r for r in J(dict(op="rate", teams=teams))}
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "calibration club ratings.json").write_text(json.dumps(R, indent=2), encoding="utf-8")
    G, B, coverage = [], {}, []
    for lg in LG:
        A = results.load(lg)
        for D in DS:
            a = A[A.s.between(D, D + 9)]
            b = B.setdefault(D, dict(matches=0, goals=0))
            b["matches"] += len(a)
            b["goals"] += int(a.hg.sum() + a.vg.sum())
        for s in range(2014, 2024):
            A_s = A[A.s == s]
            n = 0
            for a in A_s.itertuples():
                h, v = M.get((a.h, lg)), M.get((a.v, lg))
                X, Y = R.get(f"{h}:{s}"), R.get(f"{v}:{s}")
                if X is None or Y is None:
                    continue
                G.append(dict(s=s, lg=lg, Ds=dec(s), X=X, Y=Y, hg=a.hg, vg=a.vg))
                n += 1
            coverage.append(dict(lg=lg, s=s, available=len(A_s), matched=n))
    for b in B.values():
        b["goalsPerMatch"] = b["goals"] / b["matches"] if b["matches"] else None
        b["goalsPerTeam"] = b["goalsPerMatch"] / 2 if b["matches"] else None
    rep = dict(clubSeasons=len(R), editionRows=len(E), linkedEditionRows=int(E.qid.notna().sum()),
               unmappedEditionClubNames=sorted(set(E[E.qid.isna()].club.dropna())), rejectedClubSeasons=missed, coverage=coverage)
    return G, B, rep


def XY(G):
    X, y = [], []
    for g in G:
        a, b = g["X"], g["Y"]
        X.extend([[(a["A"] - b["Dk"]) / 10, (a["M"] - b["M"]) / 10, 1], [(b["A"] - a["Dk"]) / 10, (b["M"] - a["M"]) / 10, 0]])
        y.extend([g["hg"], g["vg"]])
    return np.asarray(X, dtype=float), np.asarray(y, dtype=float)


def params(p, B, z, src):
    b0 = math.exp(p["c"])
    b = {D: b0 if D >= 2010 else b0 * B[D]["goalsPerTeam"] / z for D in DS}
    return dict(be=p["be"], ka=p["ka"], h=p["h"], b=b, src=src)


def js_mu(G, p):
    q = J(dict(op="lam", params=p, games=[dict(Ds=g["Ds"], X=g["X"], Y=g["Y"]) for g in G]))
    return np.asarray(q["mu"], dtype=float).reshape(-1)


def run():
    G, B, rep = sample()
    train = [g for g in G if 2014 <= g["s"] <= 2019]
    test = [g for g in G if 2020 <= g["s"] <= 2023]
    X, y = XY(train); Xt, yt = XY(test)
    if len(train) < 100 or len(test) < 100:
        raise ValueError("Calibration needs at least 100 matched fixtures in each chronological partition.")
    p = fit(X, y)
    z = float(y.mean())
    fitted = params(p, B, z, "Fitted on 2014-19 real club-season results; held out 2020-23. Neutral 2020s scoring level is frozen from training; historical decade levels are measured ratios.")
    mt = js_mu(train, fitted); mv = js_mu(test, fitted)
    if not np.allclose(mt, pred(X, p), rtol=1e-10, atol=1e-10) or not np.allclose(mv, pred(Xt, p), rtol=1e-10, atol=1e-10):
        raise AssertionError("Deployed JavaScript expectations differ from the fitted model.")
    bh, ba = float(y[X[:, 2] == 1].mean()), float(y[X[:, 2] == 0].mean())
    base_t = np.where(X[:, 2] == 1, bh, ba); base_v = np.where(Xt[:, 2] == 1, bh, ba)
    train_metrics = dict(model=score(y, mt), baseline=score(y, base_t))
    test_metrics = dict(model=score(yt, mv), baseline=score(yt, base_v))
    accepted = test_metrics["model"]["nll"] < test_metrics["baseline"]["nll"]
    if accepted:
        chosen = fitted
    else:
        chosen = dict(be=0.55, ka=0.25, h=0.12, b={D: B[D]["goalsPerTeam"] for D in DS}, src="Calibration did not beat the held-out training-mean baseline. Goal sensitivity, midfield and home advantage remain game design defaults; decade scoring levels are measured raw results.")
    rep.update(dict(trainSeasons=[2014, 2019], testSeasons=[2020, 2023], trainMatches=len(train), testMatches=len(test),
                    features="Neutral manager C; actual FIFA edition roster; engine best XI in 4-3-3; no curated tags or signature boosts",
                    candidate={**p, "params": fitted}, accepted=accepted, train=train_metrics, test=test_metrics,
                    baseline=dict(home=bh, away=ba, scope="2014-19 matched training fixtures"), params=chosen, measuredDecades=B,
                    validation="Full train and held-out goal expectations agree with deployed JS lam to 1e-10 tolerance",
                    limitations=["Club aliases restrict fixture coverage; unmatched fixtures are excluded from both model and baseline.",
                                 "2020s deployment uses the frozen training neutral intercept; measured 2020s scoring is reported separately.",
                                 "Historical scoring uses measured decade ratios, not historical player-rating fit validation.",
                                 "Ratings are edition snapshots, not observed lineups; calibration scores the goal-intensity model without absence or fatigue draws."]))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "calibration.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({k: rep[k] for k in ["trainMatches", "testMatches", "accepted", "train", "test", "params"]}, indent=2))
    return rep


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__)
    a.parse_args()
    run()
