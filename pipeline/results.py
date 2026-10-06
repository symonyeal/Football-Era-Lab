"""League tables, European Cup runs and decade club rankings from engsoccerdata (GPL >= 2).

Only derived aggregates leave this module; the raw files stay in CACHE.

Legend
  lg      league code;  s  season start year;  D  decade start year
  R       match results of one league, top tier only: s, h (home), v (visitor), hg, vg
  T       club-season table: lg, s, club, P W Dr L GF GA, pts (season's points rule), p3 (three
          points for a win), pos (finishing position), t (title, 1/0)
  E       European Cup club-season stages: s, club, cc (country code), e (stage score)
  st      stage score by round label; the furthest stage reached counts
  C       club-decade table: lg, D, club, n (top-tier seasons), ppg (p3 per game), t (titles),
          e (summed European Cup stage score), z (ppg standardised within lg-D), q (rank score)
  w_t,w_e weights of titles and European score in q
"""
import pandas as pd

from .config import CACHE, CUR, DS, LG, URL_es, dec, n_min

s_ec = 2017  # first season taken from curated/ec_late.csv instead of champs.csv (which holds only its final)
from .net import fetch

st = {"final": 4.0, "SF": 3.0, "QF": 2.0, "R16": 1.0, "Round2": 1.0, "Round1": 0.5}
w_t, w_e = 0.45, 0.35


def raw(f):
    p = CACHE / "engsoccerdata" / f"{f}.csv"
    if not p.exists():
        fetch(URL_es.format(f), p)
    return pd.read_csv(p, low_memory=False)


def load(lg):
    x = raw(LG[lg]["f"])
    x = x[x["tier"] == 1] if "tier" in x else x
    R = pd.DataFrame(dict(s=x["Season"].astype(int), h=x["home"].str.strip(), v=x["visitor"].str.strip(),
                          hg=x["hgoal"].astype(int), vg=x["vgoal"].astype(int)))
    return R


def tab(lg):
    R = load(lg)
    s3 = LG[lg]["s3"]
    rows = []
    for side, gf, ga in (("h", "hg", "vg"), ("v", "vg", "hg")):
        y = pd.DataFrame(dict(s=R["s"], club=R[side], GF=R[gf], GA=R[ga]))
        y["W"] = (y.GF > y.GA).astype(int)
        y["Dr"] = (y.GF == y.GA).astype(int)
        y["L"] = (y.GF < y.GA).astype(int)
        rows.append(y)
    y = pd.concat(rows)
    T = y.groupby(["s", "club"], as_index=False)[["W", "Dr", "L", "GF", "GA"]].sum()
    T["P"] = T["W"] + T["Dr"] + T["L"]
    T["p3"] = 3 * T["W"] + T["Dr"]
    T["pts"] = T["p3"].where(T["s"] >= s3, 2 * T["W"] + T["Dr"])
    T["gd"] = T["GF"] - T["GA"]
    T = T.sort_values(["s", "pts", "gd", "GF"], ascending=[True, False, False, False])
    T["pos"] = T.groupby("s").cumcount() + 1
    T["t"] = (T["pos"] == 1).astype(int)
    T.insert(0, "lg", lg)
    return T.drop(columns="gd")


def ecup():
    x = raw("champs")
    rows = []
    for _, r in x.iterrows():
        k = str(r["round"])
        g = st.get(k, 2.0 if k in ("GroupA", "GroupB") and int(r["Season"]) in (1991, 1992) else
                   1.5 if k.endswith("-inter") else 0.5 if k.startswith("Group") and "prelim" not in k else 0.0)
        for c, cc in ((r["home"], r["hcountry"]), (r["visitor"], r["vcountry"])):
            rows.append((int(r["Season"]), str(c).strip(), cc, g))
        if k == "final" and isinstance(r["tiewinner"], str):
            rows.append((int(r["Season"]), r["tiewinner"].strip(), r["hcountry"] if r["tiewinner"] == r["home"] else r["vcountry"], 6.0))
    E = pd.DataFrame(rows, columns=["s", "club", "cc", "e"]).groupby(["s", "club", "cc"], as_index=False)["e"].max()
    return E


def decades(M=None):
    """M: (nm, cc) -> qid. Clubs are keyed by qid where resolved, else by 'nm:' + name."""
    M = M or {}
    T = pd.concat([tab(lg) for lg in LG])
    T["D"] = T.s.map(dec)
    T["id"] = [M.get((c, lg)) or f"nm:{c}" for c, lg in zip(T.club, T.lg)]
    C = T.groupby(["lg", "D", "id"], as_index=False).agg(n=("s", "nunique"), P=("P", "sum"), p3=("p3", "sum"),
                                                          t=("t", "sum"), club=("club", "last"))
    C["ppg"] = C.p3 / C.P
    E = ecup()
    E = E[E["s"] < s_ec]
    E["id"] = [M.get((c, cc)) or f"nm:{c}" for c, cc in zip(E["club"], E["cc"])]
    X = pd.read_csv(CUR / "ec_late.csv").rename(columns={"qid": "id"})[["s", "club", "cc", "e", "id"]]
    E = pd.concat([E, X], ignore_index=True)
    E["D"] = E["s"].map(dec)
    Ed = E.groupby(["D", "id", "cc"], as_index=False)["e"].sum()
    C = C.merge(Ed.rename(columns={"cc": "lg"}), on=["lg", "D", "id"], how="left").fillna({"e": 0.0})
    k = C.n >= n_min
    g = C[k].groupby(["lg", "D"])["ppg"]
    C["z"] = ((C.ppg - g.transform("mean")) / g.transform("std")).where(k)
    C["q"] = C.z.fillna(-9) + w_t * C.t + w_e * C.e
    C = C[C["D"].isin(DS)]
    E = E[E["D"].isin(DS)]
    return T, C.sort_values(["D", "lg", "q"], ascending=[True, True, False]), E
