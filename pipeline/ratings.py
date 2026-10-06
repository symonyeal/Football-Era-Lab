"""Base ratings per club-decade card: FIFA where a published edition covers the stint, a legend
card for icons and heroes, otherwise an estimate from a model fitted where FIFA and Wikidata meet.

Legend
  Q      squad rows: qid, D, p, n (apps in D), g (goals), k (seasons in D at club), s0, s1, x
  P      person facts (dob, pos labels, sl sitelinks);  K  caps by person;  Pl  position labels by item
  E      FIFA editions (f, s, o overall, pos, dob, ...);  L  person -> FIFA id
  Gs     league games per club-season by (lg, D), from the result tables
  U      universe rows (club strength z, e, t, lg) by (qid, D)
  X      feature table, one row per squad row
  f_*    features: aps apps share of league games, lk log seasons, gpa goals per app, cz caps z-score
         within decade, sz sitelinks z-score within birth decade, z club ppg z, e European score,
         t titles, lw league weight, age, age2, gk/df/mi/fw position group, x apps missing
  y      FIFA rating for the card: mean of the best three editions inside the stint and decade
  yn     nearest-edition FIFA rating within d_near seasons, shifted by the age curve
  ac(a)  age curve: 0 from 25 to 30, -0.8 per year younger, -1.2 per year older, floor -12
  r      final base rating; src: fifa | fifa-near | icon | estimated
  lo,hi  rating clamp
"""
import math

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold

from .positions import group, slots

d_near = 2
lo, hi = 45, 95
F = ["f_aps", "f_lk", "f_gpa", "f_cz", "f_sz", "f_z", "f_e", "f_t", "f_lw", "f_age", "f_age2",
     "f_gk", "f_df", "f_mi", "f_fw", "f_x"]
w_lg = {"ENG": 1.0, "ESP": 1.0, "ITA": 1.0, "GER": 1.0, "FRA": 0.6, "NED": 0.5, "POR": 0.5}


def ac(a):
    if a is None or math.isnan(a):
        return 0.0
    if a < 25:
        return max(-12.0, -0.8 * (25 - a))
    if a > 30:
        return max(-12.0, -1.2 * (a - 30))
    return 0.0


def by(d):
    try:
        return int(str(d)[:4])
    except (TypeError, ValueError):
        return None


def fifa_y(Q, P, L, E):
    """FIFA rating inside each card's stint and decade, or the nearest edition within d_near seasons."""
    Ef = {f: g.sort_values("s") for f, g in E.groupby("f")}
    y, yn, pos = [], [], []
    for r in Q.itertuples():
        f = L.get(r.p)
        if f is None or f not in Ef:
            y.append(np.nan); yn.append(np.nan); pos.append(None)
            continue
        g = Ef[f]
        w = g[(g.s >= r.s0) & (g.s <= r.s1) & (g.qid == r.qid)] if "qid" in g else g.iloc[:0]
        if len(w):
            y.append(float(w.o.nlargest(3).mean()))
            yn.append(np.nan)
            pos.append(list(w.sort_values("o").iloc[-1].pos))
            continue
        y.append(np.nan)
        d = np.minimum((g.s - r.s0).abs(), (g.s - r.s1).abs())
        k = d.idxmin()
        if d[k] <= d_near:
            b = by(P[r.p].get("dob"))
            a_card = (r.s0 + r.s1) / 2 - b if b else np.nan
            a_ed = g.s[k] - b if b else np.nan
            yn.append(float(g.o[k] + ac(a_card) - ac(a_ed)))
            pos.append(list(g.pos[k]))
        else:
            yn.append(np.nan)
            pos.append(None)
    Q = Q.copy()
    Q["y"], Q["yn"], Q["fpos"] = y, yn, pos
    return Q


def features(Q, P, K, Pl, U, Gs):
    u = {(r.id, r.D): r for r in U.itertuples()}
    rows = []
    for r in Q.itertuples():
        x = P[r.p]
        b = by(x.get("dob"))
        c = u.get((r.qid, r.D))
        G = Gs.get((c.lg, r.D), 30) if c is not None else 30
        wp = slots([Pl.get(i, "") for i in sorted(x["pos"])])
        gp = group(wp)
        age = (r.s0 + r.s1) / 2 - b if b else np.nan
        rows.append(dict(
            f_aps=min(1.2, r.n / max(1, r.k) / G) if not r.x else np.nan,
            f_lk=math.log1p(r.k), f_gpa=r.g / r.n if r.n >= 10 else np.nan,
            caps=K.get(r.p, (0, 0))[0], sl=x.get("sl", 0), bd=(b // 10) * 10 if b else np.nan,
            f_z=c.z if c is not None and not pd.isna(c.z) else (c.e / 4 - 0.5 if c is not None else 0.0),
            f_e=c.e if c is not None else 0.0, f_t=c.t if c is not None else 0, f_lw=w_lg.get(c.lg, 0.4) if c is not None else 0.4,
            f_age=age, f_age2=(age - 27) ** 2 if not np.isnan(age) else np.nan,
            f_gk=int(gp == "GK"), f_df=int(gp == "DEF"), f_mi=int(gp == "MID"), f_fw=int(gp == "FWD"), f_x=int(r.x),
            wpos=wp))
    X = pd.DataFrame(rows, index=Q.index)
    X["D"] = Q["D"].values
    lc = np.log1p(X.caps)
    X["f_cz"] = (lc - lc.groupby(X.D).transform("mean")) / lc.groupby(X.D).transform("std")
    ls = np.log1p(X.sl)
    X["f_sz"] = (ls - ls.groupby(X.bd).transform("mean")) / ls.groupby(X.bd).transform("std")
    return X


def fit(X, y, groups, seed=0):
    m = HistGradientBoostingRegressor(max_iter=500, learning_rate=0.04, max_leaf_nodes=31, min_samples_leaf=25,
                                      l2_regularization=1.0, random_state=seed)
    k = ~np.isnan(y)
    cv = GroupKFold(n_splits=5)
    pr = np.full(k.sum(), np.nan)
    Xk, yk, gk = X.loc[k, F].values, y[k], groups[k]
    base = np.full(k.sum(), np.nan)
    pk = (X.loc[k, "f_gk"].values + 2 * X.loc[k, "f_df"].values + 3 * X.loc[k, "f_mi"].values)
    for tr, te in cv.split(Xk, yk, gk):
        m.fit(Xk[tr], yk[tr])
        pr[te] = m.predict(Xk[te])
        mu = {p: float(yk[tr][pk[tr] == p].mean()) for p in set(pk[tr])}
        base[te] = [mu.get(p, float(yk[tr].mean())) for p in pk[te]]
    rep = dict(n=int(k.sum()), people=int(len(set(gk))), mae=float(np.mean(np.abs(pr - yk))),
               rmse=float(np.sqrt(np.mean((pr - yk) ** 2))), mae_base=float(np.mean(np.abs(base - yk))),
               rmse_base=float(np.sqrt(np.mean((base - yk) ** 2))), r2=float(1 - np.sum((pr - yk) ** 2) / np.sum((yk - yk.mean()) ** 2)),
               evaluation="5-fold held-out people; positional baseline fitted within each training fold",
               scope="Modern FIFA club-decade ratings; historical predictions are extrapolations")
    m.fit(Xk, yk)
    return m, rep
