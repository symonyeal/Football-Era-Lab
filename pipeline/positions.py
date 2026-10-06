"""Natural positions: Wikidata position labels mapped to slot codes; FIFA and legend cards win.

Legend
  R      ordered rules: label fragment -> slots; the first matching rule of each label applies
  GEN    generic labels (defender, midfielder, forward), dropped when a specific label exists
  n_max  most natural positions kept per player
  slots(L)  natural slots for the list of position labels L
  group(P)  line of a natural-position list: GK, DEF, MID or FWD (the rating model's position group)
"""
R = [
    ("goalkeeper", ["GK"]), ("sweeper", ["CB"]), ("libero", ["CB"]), ("stopper", ["CB"]), ("centre-back", ["CB"]),
    ("center-back", ["CB"]), ("centre back", ["CB"]), ("center back", ["CB"]), ("central defender", ["CB"]),
    ("centre half", ["CB"]), ("center half", ["CB"]), ("centre-half", ["CB"]),
    ("left wing-back", ["LWB", "LB"]), ("right wing-back", ["RWB", "RB"]), ("wing-back", ["LWB", "RWB"]),
    ("wingback", ["LWB", "RWB"]), ("wing back", ["LWB", "RWB"]),
    ("left-back", ["LB"]), ("left back", ["LB"]), ("right-back", ["RB"]), ("right back", ["RB"]),
    ("full-back", ["LB", "RB"]), ("fullback", ["LB", "RB"]), ("full back", ["LB", "RB"]),
    ("defensive midfielder", ["CDM"]), ("holding midfielder", ["CDM"]), ("anchor", ["CDM"]),
    ("wing half", ["CDM", "CM"]), ("half-back", ["CDM", "CM"]), ("halfback", ["CDM", "CM"]), ("half back", ["CDM", "CM"]),
    ("attacking midfielder", ["CAM"]), ("playmaker", ["CAM"]), ("trequartista", ["CAM"]), ("number 10", ["CAM"]),
    ("inside forward", ["CAM", "CF"]), ("inside left", ["CAM", "CF"]), ("inside right", ["CAM", "CF"]),
    ("left midfielder", ["LM"]), ("right midfielder", ["RM"]), ("wide midfielder", ["LM", "RM"]),
    ("left winger", ["LW", "LM"]), ("outside left", ["LW", "LM"]), ("right winger", ["RW", "RM"]),
    ("outside right", ["RW", "RM"]), ("winger", ["LW", "RW"]),
    ("box-to-box", ["CM"]), ("central midfielder", ["CM"]), ("centre midfielder", ["CM"]), ("mezzala", ["CM"]),
    ("second striker", ["CF"]), ("deep-lying forward", ["CF"]), ("false nine", ["CF"]), ("support striker", ["CF"]),
    ("centre-forward", ["ST"]), ("center forward", ["ST"]), ("centre forward", ["ST"]), ("striker", ["ST"]),
    ("target man", ["ST"]), ("poacher", ["ST"]),
    ("defender", ["CB"]), ("midfielder", ["CM"]), ("forward", ["ST", "CF"]),
]
GEN = {"defender", "midfielder", "forward"}
n_max = 3


def _one(l):
    l = l.lower()
    for k, s in R:
        if k in l:
            return k, s
    return None, []


def slots(L):
    hits = [(k, s) for k, s in (_one(l) for l in L) if k]
    if any(k not in GEN for k, _ in hits):
        hits = [(k, s) for k, s in hits if k not in GEN]
    out = []
    for _, s in hits:
        for x in s:
            if x not in out:
                out.append(x)
    return out[:n_max]


def group(P):
    if not P:
        return "MID"
    p = P[0]
    return "GK" if p == "GK" else "DEF" if p in ("CB", "LB", "RB", "LWB", "RWB") else \
        "FWD" if p in ("ST", "CF", "LW", "RW") else "MID"
