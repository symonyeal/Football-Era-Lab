"""Base ratings per club-decade card, taken from game engines wherever one rates the player, and
estimated only where none does.

Order of evidence for a card: f (EA rows at this club inside the stint) > c (Championship Manager
records at this club inside the stint) > i (EA Icon/Hero card) > n (nearest EA row within d_near
seasons of the full stint interval, any club, age-shifted) > m (nearest CM record, same rule) >
e (model estimate). A card keeps the slot ratings, face stats and natural slots of the snapshot
that rated it.

Legend
  Q      squad rows: qid, D, p, n (apps in D), g (goals), k (seasons in D at club), s0, s1, x
  P      person facts (dob, pos labels, sl sitelinks);  K  caps by person;  Pl  position labels by item
  E      EA season rows (f, s, o, pos, sr, a6, g6, qid);  L  person -> EA id
  R      CM records (p, s, q, r, sr, a6, g6, pos)
  Gs     league games per club-season by (lg, D), from the result tables
  U      universe rows (club strength z, e, t, lg) by (qid, D)
  X      feature table, one row per squad row
  f_*    features: aps apps share of league games, lk log seasons, gpa goals per app, cz caps z-score
         within decade, sz sitelinks z-score within birth decade, z club ppg z, e European score,
         t titles, lw league weight, age, age2, gk/df/mi/fw position group, x apps missing
  y, yc  EA / CM rating inside the stint at this club: mean of the best three snapshots
  yn, ym EA / CM rating of the nearest snapshot within d_near seasons, shifted by the age curve
  pf, pc, pn, pm  profile of the snapshot behind each: o (its rating), sr, a6, g6, pos
  ep     natural slots of the person's nearest engine snapshot of any season (positions only)
  ac(a)  age curve: 0 from 25 to 30, -0.8 per year younger, -1.2 per year older, floor -12
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


def _pf(z, o=None):
    return dict(o=float(z.o if o is None else o), sr=z.sr, a6=z.a6, g6=z.g6, pos=list(z.pos) if z.pos else [])


def _in(g, s0, s1, q, k):
    w = g[(g.s >= s0) & (g.s <= s1) & (g[k] == q)]
    if not len(w):
        return np.nan, None
    t = w.sort_values("o", ascending=False)
    return float(t.o.head(3).mean()), _pf(t.iloc[0])


def _near(g, s0, s1, a_card, b):
    d = (g.s - g.s.clip(s0, s1)).abs()
    i = d.idxmin()
    if d[i] > d_near:
        return np.nan, None
    z = g.loc[i]
    a_s = z.s - b if b else np.nan
    v = float(z.o + ac(a_card) - ac(a_s))
    return v, _pf(z)


def _ep(gs, s):
    best, bd = None, 99
    for g in gs:
        if g is None:
            continue
        for z in g.itertuples():
            if z.pos and abs(z.s - s) < bd:
                best, bd = list(z.pos), abs(z.s - s)
    return best


def engine_y(Q, P, L, E, R):
    """Engine evidence for every squad row; see the module legend for the column meanings."""
    E = E.rename(columns={"qid": "q"}) if "qid" in E else E if "q" in E else E.assign(q=None)
    Ef = {f: g.reset_index(drop=True) for f, g in E.groupby("f")}
    R = R.rename(columns={"r": "o"})
    Rp = {p: g.reset_index(drop=True) for p, g in R.groupby("p")} if len(R) else {}
    cols = {k: [] for k in ("y", "yc", "yn", "ym", "pf", "pc", "pn", "pm", "ep")}
    for r in Q.itertuples():
        b = by(P[r.p].get("dob"))
        a_card = (r.s0 + r.s1) / 2 - b if b else np.nan
        g, c = Ef.get(L.get(r.p)), Rp.get(r.p)
        y, pf = _in(g, r.s0, r.s1, r.qid, "q") if g is not None else (np.nan, None)
        yc, pc = _in(c, r.s0, r.s1, r.qid, "q") if c is not None else (np.nan, None)
        yn, pn = _near(g, r.s0, r.s1, a_card, b) if g is not None else (np.nan, None)
        ym, pm = _near(c, r.s0, r.s1, a_card, b) if c is not None else (np.nan, None)
        for k, v in zip(cols, (y, yc, yn, ym, pf, pc, pn, pm, _ep((g, c), (r.s0 + r.s1) / 2))):
            cols[k].append(v)
    Q = Q.copy()
    for k, v in cols.items():
        Q[k] = v
    return Q


def features(Q, P, K, Pl, U, Gs):
    u = {(r.id, r.D): r for r in U.itertuples()}
    rows = []
    for r in Q.itertuples():
        x = P[r.p]
        b = by(x.get("dob"))
        c = u.get((r.qid, r.D))
        G = Gs.get((c.lg, r.D), 30) if c is not None else 30
        wp = r.wpos if isinstance(r.wpos, list) and r.wpos else slots([Pl.get(i, "") for i in sorted(x["pos"])], b, None)
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
               scope="Cards rated by EA or Championship Manager (1989-2025); earlier decades are extrapolations")
    m.fit(Xk, yk)
    return m, rep
