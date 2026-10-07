"""Which club-decades enter the draft pool, and the strongest of each decade as opponents.

Legend
  C      club-decade table from results.decades (lg, D, id, club, n, ppg, t, e, z, q)
  E      European Cup club-season stages (s, D, id, cc, e)
  U      universe rows: id, D, lg, club, n, ppg, t, e, z, q, x (cross-league strength), src
         (league | europe), pool (in the draft pool), k (opponent rank in D, 1 = strongest)
  w_lg   league weight in x: the four largest leagues, the other three, everyone else
  e_sf   European stage score of a semi-final; clubs from other countries enter at or above it
  e_gap  stage needed by clubs of a covered country in a decade its league results do not cover
"""
import pandas as pd

from .config import DS, K_lg, LG

w_lg = {"ENG": 0.6, "ESP": 0.6, "ITA": 0.6, "GER": 0.6, "FRA": 0.2, "NED": 0.2, "POR": 0.2}
e_sf = 3.0
e_gap = 1.0


def pick(C, E):
    C = C.copy()
    C["src"] = "league"
    rows = []
    for (lg, D), g in C.groupby(["lg", "D"]):
        rows.append(g.sort_values("q", ascending=False).head(K_lg))
    U = pd.concat(rows)
    U = U[~U.id.str.startswith("nm:")].copy()
    have = set(zip(U.lg, U.D))
    Em = E[~E.id.str.startswith("nm:")]
    best = Em.groupby(["D", "id", "cc"], as_index=False).agg(e=("e", "sum"), emax=("e", "max"), club=("club", "last"))
    extra = []
    for D in DS:
        b = best[best.D == D]
        for r in b.itertuples():
            if r.id in set(U.id[U.D == D]):
                continue
            covered = r.cc in LG
            if (not covered and r.emax >= e_sf) or (covered and (r.cc, D) not in have and r.emax >= e_gap):
                extra.append(dict(lg=r.cc, D=D, id=r.id, club=r.club, n=0, P=0, p3=0, t=0, ppg=float("nan"),
                                  e=r.e, z=float("nan"), q=r.e, src="europe"))
    if extra:
        X = pd.DataFrame(extra)
        X = X.sort_values("e", ascending=False).groupby(["lg", "D"]).head(K_lg)
        U = pd.concat([U, X], ignore_index=True)
    U["x"] = U.e + 0.9 * U.t + U.z.fillna(0.5) + U.lg.map(w_lg).fillna(0.0)
    U["pool"] = True
    U["k"] = U.groupby("D")["x"].rank(ascending=False, method="first").astype(int)
    return U.sort_values(["D", "k"]).reset_index(drop=True)
