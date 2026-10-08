"""Real top-flight seasons and European Cup clubs for the club career (derived facts only).

python -m pipeline.leagues   adds the records to an existing data/game.json; the full build calls add().

Legend
  lg     league code (ENG, ESP, ...);  s  season start year (1998 = 1998-99)
  T      club-season table from results.tab: lg, s, club, W, Dr, L, GF, GA, P, pts, pos
  M      club name map (nm, cc) -> qid
  GAP    curated league-seasons missing from the result files (curated/league_gaps.csv, sourced rows)
  f_P    share of the season's most matches a club needs to count as a member; promotion and relegation
         play-off clubs recorded at tier 1 fall below it
  s_min  first season kept
  row    [id, pts, P, W, Dr, L, GF, GA] in finishing order; id = qid, else 'nm:' + name
  L      {lg: {nm, s3, S: {s: [row, ...]}}}; s3 first season with three points for a win
  X      names of league clubs outside the archive, by qid ('nm:' ids carry their name)
  EC     {s: [[id, cc, e], ...]} European Cup clubs by stage score e (results.st; 6 won the final);
         complete fields to 2015-16, the final only for 2016-17, the last eight from 2017-18 (ec_late)
"""
import json

import pandas as pd

from .config import CUR, LG, OUT

f_P = 0.75
s_min = 1950


def gaps():
    p = CUR / "league_gaps.csv"
    if not p.exists():
        return pd.DataFrame(columns=["lg", "s", "club", "W", "Dr", "L", "GF", "GA"])
    return pd.read_csv(p)


def table(T, M, G0=None, A=None):
    """T: results.tab rows of every league; M: (nm, cc) -> qid; G0: curated gap rows; A: (folded name, lg)
    -> qid of archive clubs, for result-file names the map lacks. One club renamed during a season (Stade
    Brest / Brest Armorique 1981-82) is two names with one qid: its records are summed. Returns L."""
    T = T[["lg", "s", "club", "W", "Dr", "L", "GF", "GA"]].copy()
    if G0 is not None and len(G0):
        T = pd.concat([T, G0[["lg", "s", "club", "W", "Dr", "L", "GF", "GA"]]], ignore_index=True)
    T = T[T["s"] >= s_min].copy()
    A = A or {}
    T["id"] = [M.get((c, lg)) or A.get((c.casefold(), lg)) or f"nm:{c}" for c, lg in zip(T["club"], T["lg"])]
    T = T.groupby(["lg", "s", "id"], as_index=False)[["W", "Dr", "L", "GF", "GA"]].sum()
    T["P"] = T["W"] + T["Dr"] + T["L"]
    T["pts"] = [3 * w + d if s >= LG[lg]["s3"] else 2 * w + d for lg, s, w, d in zip(T["lg"], T["s"], T["W"], T["Dr"])]
    T["gd"] = T["GF"] - T["GA"]
    L = {}
    for (lg, s), g in T.groupby(["lg", "s"]):
        g = g[g["P"] >= f_P * g["P"].max()].sort_values(["pts", "gd", "GF", "id"], ascending=[False, False, False, True])
        rows = [[q, int(p), int(n), int(w), int(d), int(l), int(f), int(a)] for q, p, n, w, d, l, f, a in
                zip(g["id"], g["pts"], g["P"], g["W"], g["Dr"], g["L"], g["GF"], g["GA"])]
        L.setdefault(lg, dict(nm=LG[lg]["name"], s3=LG[lg]["s3"], S={}))["S"][str(int(s))] = rows
    return L


def cups(E, M, late):
    """E: results.ecup rows (s, club, cc, e) before the curated seasons; late: curated/ec_late.csv rows."""
    s_ec = int(late.s.min()) if len(late) else 10 ** 4
    E = E[(E.s >= s_min) & (E.s < s_ec)]
    out = {}
    for s, c, cc, e in zip(E.s, E.club, E.cc, E.e):
        out.setdefault(str(int(s)), []).append([M.get((c, cc)) or f"nm:{c}", cc, float(e)])
    for s, q, cc, e in zip(late.s, late.qid, late.cc, late.e):
        out.setdefault(str(int(s)), []).append([q, cc, float(e)])
    return {s: sorted(v, key=lambda x: (-x[2], x[0])) for s, v in sorted(out.items())}


def names(L, EC, clubs, M):
    """Names for league and cup clubs the archive lacks, from the result files' own spelling."""
    N = {q: nm for (nm, _), q in sorted(M.items(), key=lambda x: (x[0][1], x[0][0]))}
    ids = {r[0] for v in L.values() for S in v["S"].values() for r in S} | {r[0] for S in EC.values() for r in S}
    return {q: N.get(q, q) for q in sorted(ids) if not q.startswith("nm:") and q not in clubs}


def add(G, M, T, E, late):
    A = {(c["nm"].casefold(), c["cc"]): q for q, c in G["clubs"].items()}
    G["lg"] = table(T, M, gaps(), A)
    G["ec"] = cups(E, M, late)
    G["xn"] = names(G["lg"], G["ec"], G["clubs"], M)
    return G


def main():
    from . import results
    from .build import load
    M = load("clubs")
    T = pd.concat([results.tab(lg) for lg in LG])
    late = pd.read_csv(CUR / "ec_late.csv")
    p = OUT / "game.json"
    G = json.loads(p.read_text(encoding="utf-8"))
    add(G, M, T, results.ecup(), late)
    p.write_text(json.dumps(G, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = {lg: (min(v["S"]), max(v["S"]), len(v["S"])) for lg, v in G["lg"].items()}
    print("leagues", n, "European Cup seasons", len(G["ec"]), "names outside the archive", len(G["xn"]))


if __name__ == "__main__":
    main()
