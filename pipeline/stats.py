"""Real match statistics for modern cards: Transfermarkt appearances (2012+) and Understat (2014+).

Transfermarkt (dcaribou/player-scores, CC0) gives every appearance with minutes, goals and assists,
plus each player's sub-position. Understat (codytipton/player-stats-per-game-understat, MIT) gives
per-match minutes, goals, assists, xG and xA for the top five leagues and Russia. Both are joined to
Wikidata people and clubs here; nothing is sent back to either source.

Legend
  P      Wikidata person facts;  PS  person -> {season: set of Wikidata club ids}
  T      Transfermarkt rows aggregated per (p, q, s): ap apps, mi minutes, g goals, a assists
  U      Understat rows aggregated per (p, q, s): mi, g, a, xg, xa
  SUB    Transfermarkt sub-position -> game slot
  vote(X, n)  external club id -> Wikidata club: majority of linked players' clubs that season
  tm(P, PS)   (T, person -> natural slots from the sub-position)
  us(P, PS)   U
  s_of(d)     season start of a date: July onwards belongs to that year's season
"""
import zipfile
from collections import defaultdict

import pandas as pd

from .config import INP
from .fifa import tok

ZIP_T = "davidcariboo_player-scores.zip"
ZIP_U = "codytipton_player-stats-per-game-understat.zip"
SUB = {"Goalkeeper": "GK", "Centre-Back": "CB", "Left-Back": "LB", "Right-Back": "RB", "Defensive Midfield": "CDM",
       "Central Midfield": "CM", "Attacking Midfield": "CAM", "Left Midfield": "LM", "Right Midfield": "RM",
       "Left Winger": "LW", "Right Winger": "RW", "Second Striker": "CF", "Centre-Forward": "ST"}


def s_of(d):
    d = pd.to_datetime(d, errors="coerce")
    return d.dt.year - (d.dt.month < 7).astype(int)


def vote(X, PS, n=3):
    """X: rows (c, p, s) of an external club c, a linked person p, a season s."""
    V = defaultdict(lambda: defaultdict(float))
    for c, p, s in X:
        Q = PS.get(p, {}).get(s, ())
        for q in Q:
            V[c][q] += 1 / len(Q)
    M = {}
    for c, v in V.items():
        q, k = max(v.items(), key=lambda kv: kv[1])
        if k >= n and k >= 0.5 * sum(v.values()):
            M[c] = q
    return M


def tm(P, PS):
    z = zipfile.ZipFile(INP / ZIP_T)
    pl = pd.read_csv(z.open("players.csv"), usecols=["player_id", "name", "date_of_birth", "sub_position"])
    pl["dob"] = pl.date_of_birth.astype(str).str[:10]
    by = {d: g for d, g in pl.groupby("dob")}
    L = {}
    for p, x in P.items():
        d = (x.get("dob") or "")[:10]
        if d not in by:
            continue
        t = tok(x["name"])
        best, bs = None, 0.0
        for r in by[d].itertuples():
            sc = len(t & tok(r.name)) / max(1, len(t))
            if sc > bs:
                best, bs = int(r.player_id), sc
        if best is not None and bs > 0:
            L[best] = p
    a = pd.read_csv(z.open("appearances.csv"), usecols=["player_id", "player_club_id", "date", "goals", "assists",
                                                        "minutes_played"])
    a = a[a.player_id.isin(L)]
    a["p"] = a.player_id.map(L)
    a["s"] = s_of(a.date)
    M = vote(a[["player_club_id", "p", "s"]].drop_duplicates().itertuples(index=False), PS)
    a["q"] = a.player_club_id.map(M)
    T = (a.dropna(subset=["q"]).groupby(["p", "q", "s"])
         .agg(ap=("goals", "size"), mi=("minutes_played", "sum"), g=("goals", "sum"), a=("assists", "sum")).reset_index())
    sp = pl.set_index("player_id").sub_position
    pos = {p: [SUB[sp[f]]] for f, p in L.items() if sp.get(f) in SUB}
    return T, pos, dict(linked=len(L), clubs_mapped=len(M), rows=len(T))


def us(P, PS):
    z = zipfile.ZipFile(INP / ZIP_U)
    g = pd.read_csv(z.open("general_game_stats.csv"), usecols=["id", "season", "h_id", "a_id", "team_h", "team_a"])
    x = pd.read_csv(z.open("lineup_stats.csv"), usecols=["match_id", "player_id", "player", "team_id", "time", "goals",
                                                         "assists", "xG", "xA"])
    x = x.merge(g[["id", "season"]], left_on="match_id", right_on="id")
    S = (x.groupby(["player_id", "player", "team_id", "season"])
         .agg(mi=("time", "sum"), g=("goals", "sum"), a=("assists", "sum"), xg=("xG", "sum"), xa=("xA", "sum"))
         .reset_index())
    tk = {p: tok(P[p]["name"]) for p in PS if p in P}
    I = defaultdict(lambda: defaultdict(set))
    for p, v in PS.items():
        for s in v:
            if s >= 2014:
                for w in tk.get(p, ()):
                    I[s][w].add(p)
    cand = []
    for r in S.itertuples():
        t = tok(r.player)
        C = set().union(*(I[int(r.season)].get(w, set()) for w in t)) if t else set()
        for p in C:
            if len(t & tk[p]) >= min(2, len(t)):
                cand.append((r.team_id, p, int(r.season)))
    M = vote(cand, PS, n=4)
    U = []
    by = defaultdict(list)
    for p, v in PS.items():
        for s, Q in v.items():
            for q in Q:
                by[(q, s)].append(p)
    for r in S.itertuples():
        q = M.get(r.team_id)
        if q is None:
            continue
        t = tok(r.player)
        best, bs, tie = None, 0.0, False
        for p in by.get((q, int(r.season)), ()):
            u = tk.get(p)
            if not u:
                continue
            sc = len(t & u) / len(u)
            if sc > bs:
                best, bs, tie = p, sc, False
            elif sc == bs and sc > 0:
                tie = True
        if best and not tie and bs >= 0.5:
            U.append(dict(p=best, q=q, s=int(r.season), mi=r.mi, g=r.g, a=r.a, xg=r.xg, xa=r.xa))
    U = pd.DataFrame(U).groupby(["p", "q", "s"], as_index=False).sum() if U else pd.DataFrame(
        columns=["p", "q", "s", "mi", "g", "a", "xg", "xa"])
    return U, dict(teams_mapped=len(M), rows=len(U), people=int(U.p.nunique()) if len(U) else 0)


def card(T, U):
    """(p, q) -> season-indexed stats, for summing over a card's seasons."""
    D = defaultdict(dict)
    for r in T.itertuples():
        D[(r.p, r.q)].setdefault(int(r.s), {}).update(ap=int(r.ap), mi=int(r.mi), g=int(r.g), a=int(r.a))
    for r in U.itertuples():
        D[(r.p, r.q)].setdefault(int(r.s), {}).update(umi=int(r.mi), ug=int(r.g), ua=int(r.a), xg=float(r.xg),
                                                       xa=float(r.xa))
    return D


def agg(D, p, q, s0, s1):
    z = D.get((p, q))
    if not z:
        return None
    o = defaultdict(float)
    for s, v in z.items():
        if s0 <= s <= s1:
            for k, x in v.items():
                o[k] += x
    if not o:
        return None
    st = {}
    if o.get("mi"):
        st.update(mi=int(o["mi"]), g=int(o["g"]), a=int(o["a"]))
    if o.get("umi"):
        st.update(xmi=int(o["umi"]), xg=round(o["xg"], 1), xa=round(o["xa"], 1))
    return st or None
