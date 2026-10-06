"""Check the exported archive and write coverage evidence.

Legend: G exported game, D decade, C coverage rows, Q player cards, E defects.
"""
import json
import math
from pathlib import Path

from .config import DS, OUT
from .positions import R


def check(G):
    C, E = {}, []
    pos = {s for _, z in R for s in z}
    for k, Q in G["cards"].items():
        ids = [c["p"] for c in Q]
        if len(ids) != len(set(ids)):
            E.append(f"Duplicate person in {k}")
        for c in Q:
            if c["p"] not in G["people"] or not math.isfinite(c["r"]) or not 45 <= c["r"] <= 95:
                E.append(f"Invalid card {k}/{c['p']}")
            if not c["pos"] or not set(c["pos"]) <= pos:
                E.append(f"Invalid positions {k}/{c['p']}")
    for D in DS:
        Q = [c for c in G["combos"] if c["D"] == D]
        O = G["opp"].get(str(D), G["opp"].get(D, []))
        if len(O) != 19 or len({o["q"] for o in O}) != 19:
            E.append(f"{D} needs 19 distinct opponents")
        for o in O:
            cs = G["cards"].get(f"{o['q']}:{D}", [])
            if len(cs) < 15 or not any("GK" in c["pos"] for c in cs):
                E.append(f"Opponent lacks a full squad or keeper: {o['q']}:{D}")
        C[D] = dict(clubs=len(Q), cards=sum(c["n"] for c in Q),
                    playable=sum(c["n"] >= 15 and c["gk"] >= 1 for c in Q),
                    opponents=[G["clubs"][o["q"]]["nm"] for o in O],
                    leagues=sorted({G["clubs"][o["q"]]["cc"] for o in O}))
    for m in G["managers"]:
        if not m["f"] or any(f not in G["formations"] for f in m["f"]):
            E.append(f"Invalid formation for {m['nm']}")
    for f, v in G["formations"].items():
        if len(v["slots"]) != 11 or sum(s[0] == "GK" for s in v["slots"]) != 1:
            E.append(f"Invalid formation {f}")
    stars = {}
    for nm, D, club in [("Lionel Messi", 2010, "Barcelona"), ("Johan Cruyff", 1970, "Ajax"),
                       ("Diego Maradona", 1980, "Napoli"), ("Alfredo Di Stéfano", 1950, "Real Madrid")]:
        z = [(k, c) for k, Q in G["cards"].items() if k.endswith(f":{D}") and
             club.casefold() in G["clubs"][k.split(":")[0]]["nm"].casefold()
             for c in Q if G["people"][c["p"]]["nm"] == nm]
        stars[nm] = [dict(club=G["clubs"][k.split(":")[0]]["nm"], decade=D, rating=c["r"],
                          source=c["s"], positions=c["pos"]) for k, c in z]
        if not z:
            E.append(f"Famous-squad spot check missing: {nm}, {club}, {D}")
    return dict(passed=not E, counts=G["meta"]["counts"], coverage=C, stars=stars, defects=E,
                limitations=["Dated Wikidata records form a partial historical archive, not a census of every registered player.",
                             "Membership needs 10 apportioned league appearances, or a notable player with missing appearances and at least two seasons.",
                             "Appearances and goals are apportioned across stint years, not measured separately by decade.",
                             "Estimated older ratings extrapolate a modern rating model."])


def main():
    G = json.loads((OUT / "game.json").read_text(encoding="utf-8"))
    V = check(G)
    (OUT / "validation.json").write_text(json.dumps(V, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(V, ensure_ascii=False, indent=2))
    if not V["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
