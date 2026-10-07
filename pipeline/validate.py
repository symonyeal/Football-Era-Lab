"""Check the exported archive and write coverage evidence, tied to the exact file by its hash.

Legend: G exported game, D decade, C coverage rows, Q player cards, E defects, H sha-256 of game.json,
  SC source codes a card may carry, ST star spot checks, WG winger spot checks (wide slot expected).
"""
import hashlib
import json
import math

from .config import DS, OUT
from .positions import R

SC = set("fcinme")
ST = [("Lionel Messi", 2010, "Barcelona"), ("Johan Cruyff", 1970, "Ajax"), ("Diego Maradona", 1980, "Napoli"),
      ("Alfredo Di Stéfano", 1950, "Real Madrid"), ("Marco van Basten", 1990, "AC Milan"),
      ("Zinedine Zidane", 2000, "Real Madrid")]
WG = [("Stanley Matthews", 1950, "Blackpool"), ("Tom Finney", 1950, "Preston North End"),
      ("Paco Gento", 1950, "Real Madrid"), ("George Best", 1960, "Manchester United"),
      ("Ryan Giggs", 1990, "Manchester United"), ("Luís Figo", 1990, "Barcelona"),
      ("Cristiano Ronaldo", 2000, "Manchester United"), ("Arjen Robben", 2010, "Bayern Munich")]
WIDE = {"LW", "RW", "LM", "RM", "LWB", "RWB"}


def find(G, nm, D, club):
    return [(k, c) for k, Q in G["cards"].items() if k.endswith(f":{D}") and
            club.casefold() in G["clubs"][k.split(":")[0]]["nm"].casefold()
            for c in Q if G["people"][c["p"]]["nm"] == nm]


def check(G, H=None):
    C, E = {}, []
    pos = {s for _, z in R for s in z}
    for k, Q in G["cards"].items():
        ids = [c["p"] for c in Q]
        if len(ids) != len(set(ids)):
            E.append(f"Duplicate person in {k}")
        if len(Q) < 15 or not any("GK" in c["pos"] for c in Q):
            E.append(f"Undersized club-decade in the pool: {k}")
        for c in Q:
            if c["p"] not in G["people"] or not math.isfinite(c["r"]) or not 45 <= c["r"] <= 95:
                E.append(f"Invalid card {k}/{c['p']}")
            if not c["pos"] or not set(c["pos"]) <= pos:
                E.append(f"Invalid positions {k}/{c['p']}")
            if c["s"] not in SC:
                E.append(f"Unknown source {c['s']} {k}/{c['p']}")
            if "sr" in c and (len(c["sr"]) != 15 or max(c["sr"]) > c["r"] + 1):
                E.append(f"Invalid slot ratings {k}/{c['p']}")
            if "f6" in c and len(c["f6"]) != 6:
                E.append(f"Invalid face stats {k}/{c['p']}")
    for D in DS:
        Q = [c for c in G["combos"] if c["D"] == D]
        O = G["opp"].get(str(D), G["opp"].get(D, []))
        if len(O) != 19 or len({o["q"] for o in O}) != 19:
            E.append(f"{D} needs 19 distinct opponents")
        cs = [c for k, v in G["cards"].items() if k.endswith(f":{D}") for c in v]
        C[D] = dict(clubs=len(Q), cards=len(cs), src={s: sum(c["s"] == s for c in cs) for s in sorted(SC)},
                    opponents=[G["clubs"][o["q"]]["nm"] for o in O],
                    leagues=sorted({G["clubs"][o["q"]]["cc"] for o in O}))
    for m in G["managers"]:
        if not m["f"] or any(f not in G["formations"] for f in m["f"]):
            E.append(f"Invalid formation for {m['nm']}")
    for f, v in G["formations"].items():
        if len(v["slots"]) != 11 or sum(s[0] == "GK" for s in v["slots"]) != 1:
            E.append(f"Invalid formation {f}")
    stars, wing = {}, {}
    for nm, D, club in ST:
        z = find(G, nm, D, club)
        stars[nm] = [dict(club=G["clubs"][k.split(":")[0]]["nm"], decade=D, rating=c["r"], source=c["s"],
                          positions=c["pos"]) for k, c in z]
        if not z:
            E.append(f"Famous-squad spot check missing: {nm}, {club}, {D}")
    for nm, D, club in WG:
        z = find(G, nm, D, club)
        wing[nm] = [dict(club=G["clubs"][k.split(":")[0]]["nm"], decade=D, source=c["s"], positions=c["pos"]) for k, c in z]
        if z and not any(set(c["pos"]) & WIDE for _, c in z):
            E.append(f"Winger not in a wide slot: {nm}, {club}, {D}: {[c['pos'] for _, c in z]}")
    return dict(passed=not E, data_sha256=H, data_build=G["meta"]["v"], counts=G["meta"]["counts"], coverage=C,
                stars=stars, wingers=wing, defects=E,
                limitations=["Dated Wikidata records form a partial historical archive, not a census of every registered player.",
                             "Membership needs 10 apportioned league appearances, or a notable player with missing appearances and at least two seasons.",
                             "Appearances and goals are apportioned across stint years, not measured separately by decade.",
                             "Cards without an EA or Championship Manager snapshot carry an estimate from a model fitted on rated cards of 1989-2025."])


def main():
    b = (OUT / "game.json").read_bytes()
    G = json.loads(b.decode("utf-8"))
    V = check(G, hashlib.sha256(b).hexdigest())
    (OUT / "validation.json").write_text(json.dumps(V, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in V.items() if k not in ("coverage", "limitations")}, ensure_ascii=False, indent=1))
    if not V["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
