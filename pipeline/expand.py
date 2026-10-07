"""Expand a cached archive with its original rating fit and cards preserved.

Legend
  B0  persistent baseline folder: original build pickle files and published game.json
  b   normal pipeline build steps; rd reads a baseline artifact
  en  reconstruct original CM transforms, then rate added identities
  md  reconstruct original card estimator and normalizers, then append new squad rows
  out export while preserving every published card dictionary and match parameter
  run execute or resume named phases: sources, facts, engines, stats, model, export
  oq  original rated squad rows; X feature table; P person facts; L EA identity links
  C   fixed CM transforms; R rated CM records; m fixed historical estimator; rep fit evidence
  cm,cs  original caps mean and standard deviation by decade
  sm,ss  original sitelink mean and standard deviation by birth decade
"""
import json
import pickle
import shutil

import numpy as np
import pandas as pd

from . import build as b, engines, fifa, ratings
from .config import CACHE

B0 = CACHE / "expansion-baseline"


def rd(k):
    return pickle.loads((B0 / "build" / f"{k}.pkl").read_bytes())


def en():
    """Rate added identities with transforms reconstructed from the original training input."""
    old = rd("engines")
    cp = B0 / "cm-transforms.pkl"
    if cp.exists():
        C, rep = pickle.loads(cp.read_bytes())
    else:
        raw = engines.records(rd("squads")["P"], b.person_seasons(rd("stints")))
        C, rep = engines.calibrate(raw, old["E"], old["L"])
        cp.write_bytes(pickle.dumps((C, rep)))
    if rep != old["rep"]["cm"]:
        raise ValueError("Original CM calibration could not be reproduced exactly")
    P = b.load("squads")["P"]
    R = engines.rate(engines.records(P, b.person_seasons(b.load("stints"))), C)
    P0 = rd("squads")["P"]
    L = dict(old["L"])
    L.update(fifa.link({p: x for p, x in P.items() if p not in P0}, old["E"]))
    rep = dict(old["rep"], linked_ea=len(L), cm_records=len(R))
    rep["expansion"] = dict(calibration="Original CM fit reconstructed; no expanded-data refit",
                            new_linked_ea=len(L) - len(old["L"]), added_cm_records=len(R) - len(old["R"]))
    b.save("engines", dict(E=old["E"], L=L, R=R, rep=rep))
    print("expanded engines", "EA-linked", len(L), "CM records", len(R), flush=True)


def md():
    """Use the original estimator and feature scale, retaining every original squad row."""
    oq = rd("model")["Q"]
    d, pe, u = rd("squads"), rd("persons"), rd("universe")
    Gs = u["T"].groupby(["lg", "D"])["P"].mean().to_dict()
    X = ratings.features(oq, d["P"], pe["K"], pe["lab"], u["U"], Gs)
    mp = B0 / "card-estimator.pkl"
    if mp.exists():
        m, rep = pickle.loads(mp.read_bytes())
    else:
        m, rep = ratings.fit(X, oq.y.where(oq.y.notna(), oq.yc).values.astype(float), oq.p.values)
        mp.write_bytes(pickle.dumps((m, rep)))
    r0 = rd("model")["rep"]
    if any(r0[k] != v for k, v in rep.items()):
        raise ValueError("Original card estimator could not be reproduced exactly")
    lc, ls = np.log1p(X.caps), np.log1p(X.sl)
    cm, cs = lc.groupby(X.D).mean(), lc.groupby(X.D).std()
    sm, ss = ls.groupby(X.bd).mean(), ls.groupby(X.bd).std()
    b.s_model(frozen_model=(m, rep), normalizers=(cm, cs, sm, ss))
    md = b.load("model")
    keys = set(zip(oq.qid, oq.D))
    new = md["Q"][[(q, D) not in keys for q, D in zip(md["Q"].qid, md["Q"].D)]]
    md["Q"] = pd.concat([oq, new], ignore_index=True)
    md["rep"]["expansion"] = dict(original_cards=len(oq), added_card_rows=len(new),
        estimator="Original fit and feature normalizers reconstructed from unchanged original input",
        calibration_refitted_on_expanded_data=False)
    b.save("model", md)
    print("expanded model", "retained rows", len(oq), "new rows", len(new), flush=True)


def out():
    """Preserve the exact published cards, including their tags and source badges."""
    from . import validate
    from .config import OUT
    old = json.loads((B0 / "game.json").read_text(encoding="utf-8"))
    b.s_export(frozen_cards=old["cards"])
    G = json.loads((OUT / "game.json").read_text(encoding="utf-8"))
    changed = [k for k, Q in old["cards"].items() if G["cards"].get(k) != Q]
    if changed or G.get("params") != old.get("params"):
        raise ValueError(f"Expansion changed original cards or match calibration: {changed[:10]}")
    validate.main()
    print("original shipped cards retained exactly", sum(map(len, old["cards"].values())), flush=True)


def run(phases=()):
    """Expand an existing cached build; optionally resume at named phases after interruption."""
    phases = tuple(phases) or ("sources", "facts", "engines", "stats", "model", "export")
    unknown = set(phases) - {"sources", "facts", "engines", "stats", "model", "export"}
    if unknown:
        raise ValueError(f"Unknown expansion phases: {sorted(unknown)}")
    if not B0.exists():
        from .config import OUT
        shutil.copytree(b.B, B0 / "build")
        shutil.copy2(OUT / "game.json", B0 / "game.json")
    for phase in phases:
        print("expand", phase, flush=True)
        if phase == "sources":
            b.s_clubs()
            b.s_universe()
            b.s_stints()
        elif phase == "facts":
            b.s_squads()
            b.s_persons()
        else:
            {"engines": en, "stats": b.s_stats, "model": md, "export": out}[phase]()
