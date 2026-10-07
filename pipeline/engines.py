"""Game-engine data for the pool: EA season rows and Championship Manager records, put on one scale.

EA rows come from pipeline.ea. CM records come from every database in curated/cm0102.json. CM values
are mapped to EA's scales with models fitted where both engines rate the same player in the same
season (CM 2020-21 and 2021-22 community data against EA's 2020 and 2021 rows); each fit is checked
on people held out of it.

Legend
  P      Wikidata person facts;  PS  person -> {season: set of Wikidata club ids} from stints
  E      EA season rows;  L  person -> EA id
  R      CM records: p, s (real season), db, q (Wikidata club, or None when unmapped), ca, av (displayed
         attributes, dropped after rating), r (FIFA
         scale), sr (15 slot ratings), a6 / g6 (face stats), pos (natural slots), gk
  K      calibration overlap: CM record joined to the EA row of the same person and season
  pslot(po, sd)  CM proficiency in each game slot: position strength capped by side strength
  m_r    ability -> overall, isotonic, separate for keepers;  m_s  slot offsets (slot rating minus
         overall) from CM attributes + slot proficiency, ridge per slot;  m_a  face stats from CM
         attributes;  q_gk  keepers' outfield-slot ratios (median EA ratio)
  rep    held-out errors of each model next to a mean-only baseline
  n_nat  proficiency that makes a slot natural (CM's "accomplished")
"""
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import GroupKFold

from . import cm0102 as cm
from . import ea, fifa
from .config import INP

SL = ea.SL
n_nat = 15
CAL = (2020, 2021)


def pslot(po, sd):
    sL, sR, sC = sd["l"], sd["r"], sd["c"]
    return {"GK": po["gk"], "CB": min(max(po["sw"], po["d"]), sC), "LB": min(max(po["d"], po["wb"]), sL),
            "RB": min(max(po["d"], po["wb"]), sR), "LWB": min(po["wb"], sL), "RWB": min(po["wb"], sR),
            "CDM": min(po["dm"], sC), "CM": min(po["m"], sC), "CAM": min(po["am"], sC), "LM": min(po["m"], sL),
            "RM": min(po["m"], sR), "LW": min(max(po["am"], po["f"]), sL), "RW": min(max(po["am"], po["f"]), sR),
            "CF": min(max(po["f"], po["am"]), sC), "ST": min(po["f"], sC)}


def _nat(ps):
    z = sorted(((v, -SL.index(s), s) for s, v in ps.items() if v >= n_nat), reverse=True)
    return [s for _, _, s in z][:3]


def _held(X, y, g, mk):
    pr = np.full(len(y), np.nan)
    for tr, te in GroupKFold(5).split(X, y, g):
        pr[te] = mk().fit(X[tr], y[tr]).predict(X[te])
    return float(np.mean(np.abs(pr - y))), float(np.mean(np.abs(y - y.mean())))


def records(P, PS):
    W = cm.pool_index(P)
    out = []
    for k, c in cm.MF().items():
        d = INP / "cm0102" / k
        if not (d / "index.dat").exists():
            print("cm0102: missing", k)
            continue
        X = cm.rd(d)
        Lk = cm.lk(X, c["dy"], W)
        M = cm.vote(Lk, c["s"], PS)
        for p, r in Lk.items():
            ps = pslot(r["po"], r["sd"])
            out.append(dict(p=p, s=c["s"], db=k, q=M.get(r["club"]), ca=r["ca"], gk=r["po"]["gk"] >= n_nat,
                            ps=ps, av=cm.disp(r), pos=_nat(ps) or None))
        print(f"cm0102 {k}: linked {len(Lk)}, clubs mapped {len(M)}", flush=True)
    return pd.DataFrame(out)


def calibrate(R, E, L):
    Ei = E.drop_duplicates(["f", "s"]).set_index(["f", "s"])
    K = []
    for i, r in R[R.s.isin(CAL)].iterrows():
        f = L.get(r.p)
        if f is not None and (f, r.s) in Ei.index:
            e = Ei.loc[(f, r.s)]
            K.append((i, r, e))
    rep: dict = {"overlap": len(K)}
    g = np.array([r.p for _, r, _ in K])
    ca = np.array([r.ca for _, r, _ in K], float)
    o = np.array([e.o for _, _, e in K], float)
    gk = np.array([r.gk for _, r, _ in K])
    m_r = {}
    for nm, k in (("out", ~gk), ("gk", gk)):
        mae, base = _held(ca[k].reshape(-1, 1), o[k], g[k], lambda: _Iso())
        m_r[nm] = IsotonicRegression(out_of_bounds="clip").fit(ca[k], o[k])
        rep[f"ability_{nm}"] = dict(n=int(k.sum()), mae=mae, mae_mean_only=base)
    AT = cm.AT
    Xa = np.array([[r["av"][a] for a in AT] for _, r, _ in K], float)
    m_s, rs = {}, {}
    for j, s in enumerate(SL):
        k = ~gk
        y = np.array([float(e.sr[j]) - e.o for _, _, e in K], float)[k]
        X = np.column_stack([Xa[k], [r.ps[s] for (_, r, _), z in zip(K, k) if z]])
        mae, base = _held(X, y, g[k], lambda: RidgeCV(alphas=[0.1, 1, 10, 100]))
        m_s[s] = RidgeCV(alphas=[0.1, 1, 10, 100]).fit(X, y)
        rs[s] = dict(mae=mae, mae_mean_only=base)
    rep["slot_offset"] = rs
    q_gk = {s: float(np.median([float(e.sr[j]) / max(1.0, e.o) for (_, _r, e), z in zip(K, gk) if z]))
            for j, s in enumerate(SL)}
    A6 = np.array([e.a6 for _, _, e in K], float)
    k = ~gk & ~np.isnan(A6).any(1)
    m_a, ra = [], {}
    for j, nm in enumerate(["pac", "sho", "pas", "dri", "def", "phy"]):
        mae, base = _held(Xa[k], A6[k, j], g[k], lambda: RidgeCV(alphas=[0.1, 1, 10, 100]))
        m_a.append(RidgeCV(alphas=[0.1, 1, 10, 100]).fit(Xa[k], A6[k, j]))
        ra[nm] = dict(mae=mae, mae_mean_only=base)
    rep["face"] = ra
    G6 = np.array([e.g6 for _, _, e in K], float)
    kg = gk & ~np.isnan(G6[:, [0, 1, 2, 3, 5]]).any(1)
    m_g = [RidgeCV(alphas=[0.1, 1, 10, 100]).fit(Xa[kg], G6[kg, j]) if j != 4 else None for j in range(6)]
    return dict(m_r=m_r, m_s=m_s, q_gk=q_gk, m_a=m_a, m_g=m_g), rep


class _Iso:
    def fit(self, X, y):
        self.m = IsotonicRegression(out_of_bounds="clip").fit(X[:, 0], y)
        return self

    def predict(self, X):
        return self.m.predict(X[:, 0])


def rate(R, C):
    """FIFA-scale overall, slot ratings, face stats and natural slots for every CM record."""
    AT = cm.AT
    Xa = np.array([[a[k] for k in AT] for a in R["av"]], float)
    gk = R.gk.values
    r = np.where(gk, C["m_r"]["gk"].predict(R.ca.values), C["m_r"]["out"].predict(R.ca.values))
    sr = np.zeros((len(R), len(SL)))
    for j, s in enumerate(SL):
        off = C["m_s"][s].predict(np.column_stack([Xa, [ps[s] for ps in R.ps]]))
        sr[:, j] = np.where(gk, r * C["q_gk"][s], r + off)
    # Anchor the best CM outfield slot to overall so fitted offset bias does not penalize that slot.
    sr[~gk, 1:] += (r[~gk] - sr[~gk, 1:].max(1))[:, None]
    sr = np.minimum(sr, r[:, None])
    sr[gk, 0] = r[gk]
    a6 = np.column_stack([m.predict(Xa) for m in C["m_a"]])
    g6 = np.column_stack([m.predict(Xa) if m is not None else np.full(len(R), np.nan) for m in C["m_g"]])
    R = R.copy()
    R["r"] = np.round(r, 1)
    R["sr"] = list(np.round(np.clip(sr, 1, 99), 1))
    R["a6"] = [np.round(np.clip(v, 1, 99), 1) if not g else None for v, g in zip(a6, gk)]
    R["g6"] = [np.round(np.clip(v, 1, 99), 1) if g else None for v, g in zip(g6, gk)]
    R["pos"] = [p if p else (["GK"] if g else None) for p, g in zip(R.pos, gk)]
    return R.drop(columns=["ps", "av"])


def build(P, PS):
    E, rep_e = ea.table()
    L = fifa.link({p: x for p, x in P.items() if x.get("dob")}, E)
    R = records(P, PS)
    C, rep_c = calibrate(R, E, L)
    R = rate(R, C)
    return dict(E=E, L=L, R=R, rep=dict(ea=rep_e, cm=rep_c, linked_ea=len(L), cm_records=len(R)))
