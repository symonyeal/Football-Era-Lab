"""Match FC 24 Ultimate Team base Icon and Hero cards to Wikidata people in the squads.

Legend
  I      legend cards (name, o rating, pos, kind, nat), base versions only; the highest card per name
  AL     aliases for cards printed under one name
  NA     card nation -> Wikidata country label, where they differ
  sl_min sitelinks a candidate needs (legends are widely covered)
  tok    folded name tokens
  match(I, P, Pl, ps)  person -> (rating, card positions, kind, card name, face stats) for people ps
"""
from .fifa import fold, tok

AL = {"Müller": "Gerd Müller", "Charlton": "Bobby Charlton", "Ronaldo": "Ronaldo Nazário", "Marcos Cafú": "Cafu",
      "Mané Garrincha": "Garrincha", "Rui Costa": "Rui Costa", "Laudrup": "Michael Laudrup"}
NA = {"Holland": "Netherlands", "Korea Republic": "South Korea", "Republic of Ireland": "Ireland",
      "Côte d'Ivoire": "Ivory Coast", "Czech Republic": "Czechia"}
sl_min = 20


def best_cards(I):
    B = {}
    for c in I:
        k = c["name"]
        if k not in B or c["o"] > B[k]["o"]:
            B[k] = c
    return list(B.values())


def match(I, P, Pl, ps):
    C = [p for p in ps if P[p].get("sl", 0) >= sl_min]
    T = {p: tok(P[p]["name"]) for p in C}
    N = {p: {fold(Pl.get(n, "")) for n in P[p]["nat"]} for p in C}
    out = {}
    for c in best_cards(I):
        nm = AL.get(c["name"], c["name"])
        t = tok(nm)
        if not t:
            continue
        nat = fold(NA.get(c["nat"], c["nat"]))
        best, bs = None, 0.0
        for p in C:
            u = T[p]
            if not (t & u):
                continue
            # All tokens of the shorter label must agree; a shared first name is insufficient.
            if len(t & u) < min(len(t), len(u)):
                continue
            ns = len(t & u) / len(t | u)
            if N[p] and nat not in N[p]:
                continue
            if not N[p] and (len(t) < 2 or ns < 0.8):
                continue
            sc = ns + (0.5 if nat in N[p] else 0) + min(P[p]["sl"], 200) / 2000
            if sc > bs:
                best, bs = p, sc
        if best and bs >= 0.75:
            if best not in out or out[best][0] < c["o"]:
                out[best] = (c["o"], c["pos"], c["kind"], c["name"], c.get("f6"))
    return out
