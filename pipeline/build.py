"""Run the pipeline: python -m pipeline.build [step ...]; steps cache their output under CACHE/build.

Legend
  B      build cache folder
  M      club name map (nm, cc) -> qid
  U      universe rows (club-decades in the pool, opponent rank k)
  ST     stints by club qid
  Q      squad rows (qid, D, p, n, g, k, s0, s1, x)
  P      person facts;  K  caps
  steps  ordered step names
  y_min  earliest birth year linked to FIFA editions (the editions start in 2014)
"""
import json
import pickle
import sys

import pandas as pd

from . import clubs, export, fifa, legends, ratings, results, squads, universe, wikidata
from .config import CACHE, CUR, K_lg

B = CACHE / "build"
steps = ("clubs", "universe", "stints", "squads", "persons", "model", "export")


def save(k, x):
    B.mkdir(parents=True, exist_ok=True)
    (B / f"{k}.pkl").write_bytes(pickle.dumps(x))


def load(k):
    return pickle.loads((B / f"{k}.pkl").read_bytes())


def s_clubs():
    T, C, E = results.decades()
    N = set()
    for (lg, D), g in C.groupby(["lg", "D"]):
        for c in g.head(K_lg + 4)["club"]:
            N.add((c, lg))
    for r in E[E["e"] >= 2.0].itertuples():
        N.add((r.club, r.cc))
    M = {(r["nm"], r["cc"]): r["qid"] for r in clubs.resolve(N) if r["qid"]}
    save("clubs", M)
    print("clubs", len(N), "resolved", len(M))


def s_universe():
    M = load("clubs")
    T, C, E = results.decades(M)
    U = universe.pick(C, E)
    lab = {}
    for (nm, cc), q in M.items():
        lab.setdefault(q, nm)
    save("universe", dict(U=U, T=T, E=E))
    print("universe", len(U), U.groupby("D").size().to_dict())


def s_stints():
    U = load("universe")["U"]
    ST = {}
    Q = sorted(set(U["id"]))
    for i, q in enumerate(Q):
        ST[q] = wikidata.stints(q)
        if i % 20 == 0:
            print("stints", i, len(Q), flush=True)
    save("stints", ST)
    print("stints done", sum(len(v) for v in ST.values()))


def s_squads():
    U = load("universe")["U"]
    ST = load("stints")
    want = {(r.id, r.D) for r in U.itertuples()}
    ps = set()
    for q, S in ST.items():
        for t in S:
            ss = squads.seasons(t["a"], t["b"], t["n"])
            if any((q, (s // 10) * 10) in want for s in ss):
                ps.add(t["p"])
    print("persons in pool stints", len(ps), flush=True)
    P = wikidata.persons(ps)
    sl = {p: x["sl"] for p, x in P.items()}
    Q = []
    for q, S in ST.items():
        Q.extend(r for r in squads.squads(q, S, sl) if (q, r["D"]) in want)
    save("squads", dict(Q=pd.DataFrame(Q), P=P))
    print("squad rows", len(Q))


def s_persons():
    d = load("squads")
    ps = sorted(set(d["Q"]["p"]))
    K = wikidata.caps(ps)
    pos = wikidata.labels({x for p in ps for x in d["P"][p]["pos"]} | {x for p in ps for x in d["P"][p]["nat"]})
    save("persons", dict(K=K, lab=pos))
    print("caps for", len(K), "labels", len(pos))


y_min = 1965


def s_model():
    d, pe, u = load("squads"), load("persons"), load("universe")
    Q, P, K, Pl, U, T = d["Q"].reset_index(drop=True), d["P"], pe["K"], pe["lab"], u["U"], u["T"]
    ok = Q.apply(lambda r: not ratings.by(P[r.p].get("dob")) or
                 (r.s1 - ratings.by(P[r.p]["dob"]) >= 14 and r.s0 - ratings.by(P[r.p]["dob"]) <= 47), axis=1)
    bad = int((~ok).sum())
    Q = Q.loc[ok].reset_index(drop=True)
    Gs = T.groupby(["lg", "D"])["P"].mean().to_dict()
    E = fifa.club_ids(fifa.editions(), load("clubs"))
    L = fifa.link({p: P[p] for p in set(Q.p) if ratings.by(P[p].get("dob")) and ratings.by(P[p]["dob"]) >= y_min}, E)
    Q = ratings.fifa_y(Q, P, L, E)
    X = ratings.features(Q, P, K, Pl, U, Gs)
    m, rep = ratings.fit(X, Q["y"].values.astype(float), Q["p"].values)
    yh = m.predict(X[ratings.F].values)
    Lg = legends.match(fifa.legends(), P, Pl, sorted(set(Q.p)))
    r, src, pos = [], [], []
    for i, q in enumerate(Q.itertuples()):
        b = ratings.by(P[q.p].get("dob"))
        age = (q.s0 + q.s1) / 2 - b if b else float("nan")
        if q.y == q.y:
            v, s = q.y, "fifa"
        elif q.p in Lg:
            v, s = Lg[q.p][0] + ratings.ac(age), "icon"
        elif q.yn == q.yn:
            v, s = q.yn, "fifa-near"
        else:
            v, s = yh[i], "estimated"
        r.append(min(ratings.hi, max(ratings.lo, float(v))))
        src.append(s)
        pos.append(q.fpos or (Lg[q.p][1] if q.p in Lg else None) or X.at[i, "wpos"] or ["CM"])
    Q["r"], Q["src"], Q["pos"] = r, src, pos
    rep["legends"] = len(Lg)
    rep["fifa_linked"] = len(L)
    rep["excluded_age_conflicts"] = bad
    save("model", dict(Q=Q, rep=rep, Lg=Lg, L=L))
    print("model", rep)
    print(Q.groupby(["D", "src"]).size().unstack(fill_value=0))


def s_export():
    md, d, pe, u = load("model"), load("squads"), load("persons"), load("universe")
    Q, P, Pl, U, E = md["Q"], d["P"], pe["lab"], u["U"], u["E"]
    ST = load("stints")
    ps = sorted(set(Q.p))
    TG = json.loads((CUR / "tags.json").read_text(encoding="utf-8"))
    tg, duo, miss_duo = export.tags(Q, P, TG, ps, export.ecw(ST, E))
    Q = Q.copy()
    Q["tg"] = tg
    labels = wikidata.labels(set(U.id))
    cm = {nm: q for (nm, cc), q in load("clubs").items()}
    for q, l in labels.items():
        cm.setdefault(l, q)
        cm.setdefault(export.short(l), q)
    M, miss_sig = export.managers(P, ps, cm)
    miss_t = sorted({(m["nm"], i) for m in M for i, t in enumerate(m["t"]) if not t[0]})
    G = export.out(Q, P, Pl, U, M, duo, md["rep"], {r.id: r.lg for r in U.itertuples()}, labels,
                   dict(duo=miss_duo, sig=miss_sig, tenure=miss_t))
    print("export", G["meta"]["counts"], "unresolved duos", len(miss_duo), "sig", len(miss_sig), "tenures", len(miss_t))


def main(a):
    run = [s for s in steps if not a or s in a]
    for s in run:
        globals()[f"s_{s}"]()


if __name__ == "__main__":
    main(sys.argv[1:])
