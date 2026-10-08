"""Assemble cards, tags, managers and opponents, and write the game data file.

Legend
  Q      squad rows with ratings: qid, D, p, n, g, k, s0, s1, r, src, pos, sr, f6, st (real stats)
  SRC    source codes written to the game: f EA at this club, c Championship Manager at this club,
         i EA Icon/Hero, n EA nearby season, m CM nearby season, e estimated
  n_sq   cards a club-decade needs (with a keeper) to be drafted or to oppose; smaller ones are dropped
  TG     curated tags (timeless, maestro, duos)
  ecw    European Cups won by each person: seasons a stint at a club covers in which that club won
  tags(Q, ...)  per-card tags: tal, rock (rating thresholds by line), mae, tl (curated), poa (goals
                per app), bg (European Cups won)
  grades(m)     manager attack and defence grades from honours: score 4 ec + lt + ct
  managers(...) curated managers; a signature name resolves among the people of the manager's tenure
                club-decades (at), else only by exact name anywhere, so a namesake is never chosen
  DF     default formation by decade for clubs without a curated manager
  K      club kit colours (pipeline/kits.py); a club missing from the table takes the neutral pair N
  out(...)      write data/game.json and data/manifest.json
"""
import datetime as dt
import json

from .config import CUR, DS, N_opp, OUT
from .kits import N, kits
from .names import short, who
from .squads import seasons

SRC = {"fifa": "f", "cm": "c", "icon": "i", "fifa-near": "n", "cm-near": "m", "estimated": "e"}
n_sq = 15
DF = {1950: "WM", 1960: "4-2-4", 1970: "4-3-3", 1980: "4-4-2", 1990: "4-4-2", 2000: "4-4-2", 2010: "4-2-3-1", 2020: "4-3-3"}
LV = ["S", "A", "B", "C", "D"]


def ecw(ST, E):
    won = {(int(r.s), r.id) for r in E.itertuples() if r.e == 6.0}
    W = {}
    for q, S in ST.items():
        for t in S:
            for s in seasons(t["a"], t["b"], t["n"]):
                if (s, q) in won:
                    W.setdefault(t["p"], set()).add(s)
    return {p: len(v) for p, v in W.items()}


def tags(Q, P, TG, ps, ec):
    T1 = {who(n, P, ps) for n in TG["timeless"]["1"]} - {None}
    T2 = {who(n, P, ps) for n in TG["timeless"]["2"]} - {None} - T1
    M1 = {who(n, P, ps) for n in TG["maestro"]["1"]} - {None}
    M2 = {who(n, P, ps) for n in TG["maestro"]["2"]} - {None} - M1
    duo = {}
    miss = []
    for a, b in TG["duos"]:
        x, y = who(a, P, ps), who(b, P, ps)
        if x and y:
            duo.setdefault(x, set()).add(y)
            duo.setdefault(y, set()).add(x)
        else:
            miss.append((a, b))
    out = []
    for r in Q.itertuples():
        p0 = r.pos[0] if r.pos else "CM"
        att = p0 in ("ST", "CF", "LW", "RW", "CAM")
        dfn = p0 in ("GK", "CB", "LB", "RB", "LWB", "RWB", "CDM")
        t = {}
        if att and r.r >= 89: t["tal"] = 1
        elif att and r.r >= 85: t["tal"] = 2
        if dfn and r.r >= 88: t["rock"] = 1
        elif dfn and r.r >= 84: t["rock"] = 2
        if r.p in M1: t["mae"] = 1
        elif r.p in M2: t["mae"] = 2
        if r.p in T1: t["tl"] = 1
        elif r.p in T2: t["tl"] = 2
        if p0 in ("ST", "CF", "LW", "RW") and r.n >= 40:
            gpa = r.g / r.n
            if gpa >= 0.65: t["poa"] = 1
            elif gpa >= 0.5: t["poa"] = 2
        if ec.get(r.p): t["bg"] = ec[r.p]
        out.append(t)
    return out, {p: sorted(v) for p, v in duo.items()}, miss


def grades(m):
    if m.get("g"):
        b = m["g"]
    else:
        s = 4 * m["ec"] + m["lt"] + m["ct"]
        b = "S" if s >= 14 else "A" if s >= 7 else "B" if s >= 3 else "C" if s >= 1 else "D"
    dn = LV[min(4, LV.index(b) + 1)]
    return (b, dn) if m["lean"] == "att" else (dn, b) if m["lean"] == "def" else (b, b)


def managers(P, ps, cm, at=None):
    M = json.loads((CUR / "managers.json").read_text(encoding="utf-8"))["managers"]
    out, miss = [], []
    for m in M:
        ga, gd = grades(m)
        T = sorted({p for c, a, b in m["t"] for D in range(a // 10 * 10, b + 1, 10)
                    for p in (at or {}).get((cm.get(c), D), ())})
        sig = []
        for n in m["sig"]:
            p = who(n, P, T) or who(n, P, ps, tk=False)
            (sig.append(p) if p else miss.append((m["name"], n)))
        t = [[cm.get(c), a, b] for c, a, b in m["t"]]
        out.append(dict(nm=m["name"], f=m["f"], ga=ga, gd=gd, lean=m["lean"], ec=m["ec"], lt=m["lt"], ct=m["ct"],
                        sig=sig, t=t))
    return out, miss


def _card(r):
    c = dict(p=r.p, r=round(float(r.r), 1), s=SRC[r.src], pos=r.pos, n=int(r.n), g=int(r.g), a=int(r.s0),
             b=int(r.s1), tg=r.tg)
    if isinstance(r.sr, list):
        c["sr"] = [int(round(x)) for x in r.sr]
    if isinstance(r.f6, list) and any(x is not None for x in r.f6):
        c["f6"] = r.f6
    if isinstance(r.st, dict):
        c["st"] = r.st
    return c


def opp_mgr(q, D, M):
    best, bs = None, 0
    for m in M:
        for c, a, b in m["t"]:
            if c != q:
                continue
            ov = len(set(range(a, b + 1)) & set(range(D, D + 10)))
            sc = ov * (1 + LV[::-1].index(m["ga"]) + LV[::-1].index(m["gd"]))
            if ov and sc > bs:
                best, bs = m, sc
    if best:
        return dict(nm=best["nm"], f=best["f"][0], ga=best["ga"], gd=best["gd"], sig=best["sig"])
    return dict(nm="Club staff", f=DF[D], ga="C", gd="C", sig=[])


def out(Q, P, Pl, U, M, duo, rep, ccode, labels, miss, frozen_cards=None):
    cards, combos, clubs, people = {}, [], {}, {}
    K = kits()
    for (q, D), g in Q.groupby(["qid", "D"]):
        g = g.sort_values(["r", "p"], ascending=[False, True])
        k = f"{q}:{D}"
        if len(g) < n_sq or not any("GK" in r.pos for r in g.itertuples()):
            continue
        cards[k] = frozen_cards[k] if frozen_cards is not None and k in frozen_cards else [_card(r) for r in g.itertuples()]
    for r in U.itertuples():
        k = f"{r.id}:{r.D}"
        if k not in cards:
            continue
        cs = cards[k]
        gk = sum(1 for c in cs if "GK" in c["pos"])
        combos.append(dict(q=r.id, D=int(r.D), k=int(r.k), x=round(float(r.x), 2), n=len(cs), gk=gk))
        clubs[r.id] = dict(nm=short(labels.get(r.id, r.club)), cc=ccode.get(r.id, r.lg), k=K.get(r.id, N))
    for p in sorted({c["p"] for v in cards.values() for c in v}):
        x = P[p]
        people[p] = dict(nm=x["name"], by=int(x["dob"][:4]) if x.get("dob") and x["dob"][0] != "-" else None,
                         nat=Pl.get(sorted(x["nat"])[0], "") if x["nat"] else "", duo=duo.get(p, []))
    opp = {}
    for D in DS:
        z = sorted((c for c in combos if c["D"] == D and c["n"] >= 15 and c["gk"] >= 1), key=lambda c: c["k"])[:N_opp]
        opp[D] = [dict(q=c["q"], m=opp_mgr(c["q"], D, M)) for c in z]
    F = json.loads((CUR / "formations.json").read_text(encoding="utf-8"))
    F.pop("_note", None)
    meta = dict(v=dt.date.today().isoformat(), DS=list(DS), model=rep,
                counts=dict(clubs=len(clubs), combos=len(combos), cards=sum(len(v) for v in cards.values()), people=len(people),
                            managers=len(M)),
                src={s: sum(c["s"] == SRC[s] for v in cards.values() for c in v) for s in SRC})
    G = dict(meta=meta, clubs=clubs, combos=combos, cards=cards, people=people, managers=M, formations=F, opp=opp)
    cp = OUT / "calibration.json"
    if cp.exists():
        G["params"] = json.loads(cp.read_text(encoding="utf-8"))["params"]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "game.json").write_text(json.dumps(G, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    man = dict(meta=meta, unresolved=miss,
               sources=[
                   dict(name="Wikidata", use="squads (club stints, league apps and goals), birth dates, positions, caps", licence="CC0 1.0"),
                   dict(name="EA Sports FC 24 complete player dataset (Stefano Leone, Kaggle)", use="FIFA 15 - FC 24 ratings, positions, per-position ratings and attributes", licence="CC0 (as declared by the publisher)"),
                   dict(name="European Soccer Database (Hugo Mathien, Kaggle)", use="FIFA attributes 2007-2016 and real lineups 2008-2016 (positions)", licence="ODbL 1.0 (as declared by the publisher)"),
                   dict(name="EA Sports FC 25 database (nyagami, Kaggle)", use="FC 25 ratings, positions and attributes", licence="Apache 2.0 (as declared by the publisher)"),
                   dict(name="EA Sports FC 26 player ratings (justdhia, Kaggle)", use="FC 26 ratings, positions and attributes", licence="CC0 (as declared by the publisher)"),
                   dict(name="Football Data from Transfermarkt (dcaribou, Kaggle)", use="appearances, minutes, goals and assists 2012+; sub-positions", licence="CC0 (as declared by the publisher)"),
                   dict(name="Understat player stats per game (codytipton, Kaggle)", use="xG and xA per player-season, top five leagues and Russia 2014+", licence="MIT (as declared by the publisher)"),
                   dict(name="Championship Manager 01/02 databases (freeware game since 2008; Sports Interactive original data and community seasons)", use="ability, positions and attributes for 1989-90, 1993-94, 1995-96, 1998-99, 2001-02, 2020-21 and 2021-22; read locally, only derived numbers ship", licence="No stated licence; raw files not redistributed"),
                   dict(name="FIFA 23 Ultimate Team players database (Lucas Silva, Kaggle; file of 2024-06-07 holds FC 24 cards)", use="base Icon and Hero ratings for legends (EA reconstructions)", licence="CC0 (as declared by the publisher)"),
                   dict(name="engsoccerdata (James Curley)", use="league and European Cup results: club rankings and decade goal rates (derived aggregates only)", licence="GPL (>= 2)")])
    (OUT / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
    return G
