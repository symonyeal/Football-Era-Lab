"""Run the pipeline: python -m pipeline.build [step ...]; steps cache their output under CACHE/build.

Legend
  B      build cache folder
  M      club name map (nm, cc) -> qid
  U      universe rows (club-decades in the pool, opponent rank k)
  ST     stints by club qid
  Q      squad rows (qid, D, p, n, g, k, s0, s1, x)
  P      person facts;  K  caps;  sx  sex-or-gender items (P21);  FEM  female (excluded: men's pool)
  PS     person -> {season: set of Wikidata club ids}
  EN     engine evidence: EA rows E, person -> EA id L, Championship Manager records R
  steps  ordered step names
  y_min  earliest birth year linked to EA rows (kept for the legacy FIFA-only link)
  pick   order of evidence for a card: f, c, i, n, m, then e (see pipeline.ratings)
"""
import json
import pickle
import sys

import numpy as np
import pandas as pd

from . import clubs, engines, export, fifa, legends, ratings, results, squads, stats, universe, wikidata
from .config import CACHE, CUR, K_lg
from .positions import slots

B = CACHE / "build"
steps = ("clubs", "universe", "stints", "squads", "persons", "engines", "stats", "model", "export")
FEM = "Q6581072"


def save(k, x):
    B.mkdir(parents=True, exist_ok=True)
    (B / f"{k}.pkl").write_bytes(pickle.dumps(x))


def load(k):
    return pickle.loads((B / f"{k}.pkl").read_bytes())


def ex(existing, wanted, query):
    """Reuse checked facts while querying identities newly added to the pool."""
    merged = dict(existing)
    missing = set(wanted) - set(merged)
    if missing:
        merged.update(query(missing))
    return merged


def pp(ST, want):
    """People who could meet membership before their notability facts are fetched."""
    possible = {t["p"]: squads.sl_min for S in ST.values() for t in S}
    return {r["p"] for q, S in ST.items() for r in squads.squads(q, S, possible)
            if (q, r["D"]) in want}


def s_clubs():
    M = load("clubs") if (B / "clubs.pkl").exists() else {}
    T, C, E = results.decades(M)
    N = set()
    for (lg, D), g in C.groupby(["lg", "D"]):
        for c in g.head(K_lg + 4)["club"]:
            N.add((c, lg))
    for r in E[E["e"] >= 2.0].itertuples():
        N.add((r.club, r.cc))
    M.update({(r["nm"], r["cc"]): r["qid"] for r in clubs.resolve(N - set(M)) if r["qid"]})
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
    ST = load("stints") if (B / "stints.pkl").exists() else {}
    Q = sorted(set(U["id"]))
    for i, q in enumerate(Q):
        if q not in ST:
            ST[q] = wikidata.stints(q)
        if i % 20 == 0:
            print("stints", i, len(Q), flush=True)
    save("stints", ST)
    print("stints done", sum(len(v) for v in ST.values()))


def s_squads():
    U = load("universe")["U"]
    ST = load("stints")
    want = {(r.id, r.D) for r in U.itertuples()}
    ps = pp(ST, want)
    print("persons in pool stints", len(ps), flush=True)
    previous = load("squads") if (B / "squads.pkl").exists() else {}
    P = ex(previous.get("P", {}), ps, wikidata.persons)
    sl = {p: x["sl"] for p, x in P.items()}
    Q = []
    for q, S in ST.items():
        Q.extend(r for r in squads.squads(q, S, sl) if (q, r["D"]) in want)
    previous_players = set(previous["Q"].p) if "Q" in previous else set()
    save("squads", dict(Q=pd.DataFrame(Q), P=P, previous_players=previous_players))
    print("squad rows", len(Q))


def s_persons():
    d = load("squads")
    ps = sorted(set(d["Q"]["p"]))
    previous = load("persons") if (B / "persons.pkl").exists() else {}
    known = set(previous.get("known", d.get("previous_players", set())))
    missing = set(ps) - known
    K = dict(previous.get("K", {}))
    sx = dict(previous.get("sx", {}))
    if missing:
        K.update(wikidata.caps(missing))
        sx.update(wikidata.sexes(missing))
    wanted_labels = {x for p in ps for x in d["P"][p]["pos"]} | {x for p in ps for x in d["P"][p]["nat"]}
    pos = ex(previous.get("lab", {}), wanted_labels, wikidata.labels)
    save("persons", dict(K=K, lab=pos, sx=sx, known=known | set(ps)))
    print("caps for", len(K), "labels", len(pos), "female", sum(FEM in v for v in sx.values()))


def person_seasons(ST):
    PS = {}
    for q, S in ST.items():
        for s_ in S:
            for s in squads.seasons(s_["a"], s_["b"], s_["n"]):
                PS.setdefault(s_["p"], {}).setdefault(s, set()).add(q)
    return PS


def s_engines():
    P = load("squads")["P"]
    EN = engines.build(P, person_seasons(load("stints")))
    save("engines", EN)
    print("engines", EN["rep"]["ea"]["rows"], "EA-linked", EN["rep"]["linked_ea"], "CM records", EN["rep"]["cm_records"])



def s_stats():
    P = load("squads")["P"]
    PS = person_seasons(load("stints"))
    T, pos, rt = stats.tm(P, PS)
    U, ru = stats.us(P, PS)
    save("stats", dict(T=T, U=U, pos=pos, rep=dict(tm=rt, us=ru)))
    print("stats", rt, ru)


y_min = 1965


def _pos(q, P, Pl, Lg, TP, GA):
    b = ratings.by(P[q.p].get("dob"))
    for x in (q.pf, q.pc):
        if x and x["pos"]:
            return list(x["pos"])
    if q.p in Lg and Lg[q.p][1]:
        return list(Lg[q.p][1])
    for x in (q.pn, q.pm):
        if x and x["pos"]:
            return list(x["pos"])
    if q.ep:
        return list(q.ep)
    if q.p in TP:
        return list(TP[q.p])
    return slots([Pl.get(i, "") for i in sorted(P[q.p]["pos"])], b, GA.get(q.p)) or ["CM"]


def _f6(z):
    return [None if x is None or x != x else round(float(x)) for x in z] if z is not None else None


def s_model(frozen_model=None, normalizers=None):
    d, pe, u, EN, SX = load("squads"), load("persons"), load("universe"), load("engines"), load("stats")
    Q, P, K, Pl, U, T = d["Q"].reset_index(drop=True), d["P"], pe["K"], pe["lab"], u["U"], u["T"]
    fem = {p for p, v in pe.get("sx", {}).items() if FEM in v}
    nf = int(Q.p.isin(fem).sum())
    Q = Q[~Q.p.isin(fem)].reset_index(drop=True)
    ok = Q.apply(lambda r: not ratings.by(P[r.p].get("dob")) or
                 (r.s1 - ratings.by(P[r.p]["dob"]) >= 14 and r.s0 - ratings.by(P[r.p]["dob"]) <= 47), axis=1)
    bad = int((~ok).sum())
    Q = Q.loc[ok].reset_index(drop=True)
    Gs = T.groupby(["lg", "D"])["P"].mean().to_dict()
    E = fifa.club_ids(EN["E"], load("clubs"))
    Q = ratings.engine_y(Q, P, EN["L"], E, EN["R"])
    Lg = legends.match(fifa.legends(), P, Pl, sorted(set(Q.p)))
    ga = Q.groupby("p")[["n", "g"]].sum()
    GA = {p: g / n for p, n, g in zip(ga.index, ga.n, ga.g) if n >= 30}
    Q["wpos"] = [_pos(q, P, Pl, Lg, SX["pos"], GA) for q in Q.itertuples()]
    X = ratings.features(Q, P, K, Pl, U, Gs)
    if normalizers is not None:
        cm, cs, sm, ss = normalizers
        X["f_cz"] = (np.log1p(X.caps) - X.D.map(cm)) / X.D.map(cs)
        X["f_sz"] = (np.log1p(X.sl) - X.bd.map(sm)) / X.bd.map(ss)
    yt = Q.y.where(Q.y.notna(), Q.yc).values.astype(float)
    m, rep_ = (frozen_model[0], dict(frozen_model[1])) if frozen_model is not None else ratings.fit(X, yt, Q["p"].values)
    yh = m.predict(X[ratings.F].values)
    r, src, pos, sr, f6 = [], [], [], [], []
    for i, q in enumerate(Q.itertuples()):
        b = ratings.by(P[q.p].get("dob"))
        age = (q.s0 + q.s1) / 2 - b if b else float("nan")
        pr = None
        if q.y == q.y:
            v, s, pr = q.y, "fifa", q.pf
        elif q.yc == q.yc:
            v, s, pr = q.yc, "cm", q.pc
        elif q.p in Lg:
            v, s = Lg[q.p][0] + ratings.ac(age), "icon"
        elif q.yn == q.yn:
            v, s, pr = q.yn, "fifa-near", q.pn
        elif q.ym == q.ym:
            v, s, pr = q.ym, "cm-near", q.pm
        else:
            v, s = yh[i], "estimated"
        v = min(ratings.hi, max(ratings.lo, float(v)))
        z = list(pr["pos"]) if pr and pr["pos"] else q.wpos
        r.append(v)
        src.append(s)
        pos.append(z)
        if pr is not None and pr["sr"] is not None:
            sr.append([round(min(v, float(x) * v / max(1.0, pr["o"])), 1) for x in pr["sr"]])
            f6.append(_f6(pr["g6"] if z[0] == "GK" else pr["a6"]))
        else:
            sr.append(None)
            f6.append(_f6(Lg[q.p][4]) if s == "icon" else None)
    Q["r"], Q["src"], Q["pos"], Q["sr"], Q["f6"] = r, src, pos, sr, f6
    D = stats.card(SX["T"], SX["U"])
    Q["st"] = [stats.agg(D, q.p, q.qid, q.s0, q.s1) for q in Q.itertuples()]
    rep_.update(legends=len(Lg), ea_linked=len(EN["L"]), cm_records=int(len(EN["R"])), excluded_age_conflicts=bad,
                excluded_women_cards=nf, stats=SX["rep"], cards_with_stats=int(Q.st.notna().sum()))
    Q = Q.drop(columns=["pf", "pc", "pn", "pm", "ep"])
    save("model", dict(Q=Q, rep=rep_, Lg=Lg, L=EN["L"], en_rep=EN["rep"]))
    print("model", rep_)
    print(Q.groupby(["D", "src"]).size().unstack(fill_value=0))


def s_export(frozen_cards=None):
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
    at = Q.groupby(["qid", "D"])["p"].agg(set).to_dict()
    M, miss_sig = export.managers(P, ps, cm, at)
    miss_t = sorted({(m["nm"], i) for m in M for i, t in enumerate(m["t"]) if not t[0]})
    G = export.out(Q, P, Pl, U, M, duo, md["rep"], {r.id: r.lg for r in U.itertuples()}, labels,
                   dict(duo=miss_duo, sig=miss_sig, tenure=miss_t), frozen_cards=frozen_cards)
    print("export", G["meta"]["counts"], "unresolved duos", len(miss_duo), "sig", len(miss_sig), "tenures", len(miss_t))


def main(a):
    if a and a[0] == "expand":
        from . import expand
        expand.run(a[1:])
        return
    run = [s for s in steps if not a or s in a]
    for s in run:
        globals()[f"s_{s}"]()


if __name__ == "__main__":
    main(sys.argv[1:])
