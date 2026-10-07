"""Wikidata (CC0) reads: club stints, person facts, senior international caps.

Legend
  qid    club item;  p  person item
  S      stint rows: p, a (start year), b (end year), n (league apps), g (league goals)
  P      person facts: p -> name, dob (year-month-day), pos (position item ids), nat (country ids),
         sl (Wikipedia sitelinks), h (height cm)
  K      caps: p -> (caps, goals) summed over senior national teams
  NT     class of senior national association football teams
  LANGS  label languages tried in order when English is missing
  B      batch size of person queries
  _id, _n, _y  item id, integer (None for Wikidata's "unknown value"), year, read from a binding
"""
import hashlib

from .net import sparql

NT = "Q6979593"
LANGS = ("en", "mul", "es", "it", "de", "fr", "pt", "nl", "hu", "sr", "hr", "cs", "ro")
B = 150


def _id(u):
    return u["value"].rsplit("/", 1)[1]


def _n(u):
    try:
        return int(float(u["value"])) if u else None
    except (ValueError, TypeError):
        return None


def _y(u):
    try:
        return int(u["value"][:4]) if u["value"][0] != "-" else None
    except (ValueError, IndexError):
        return None


def stints(qid):
    q = f"""SELECT ?p ?a ?b ?n ?g WHERE {{
      ?p p:P54 ?st . ?st ps:P54 wd:{qid} . ?p wdt:P31 wd:Q5 .
      OPTIONAL{{?st pq:P580 ?a}} OPTIONAL{{?st pq:P582 ?b}}
      OPTIONAL{{?st pq:P1350 ?n}} OPTIONAL{{?st pq:P1351 ?g}} }}"""
    S = []
    for r in sparql(q, k=f"stints_{qid}"):
        S.append(dict(p=_id(r["p"]), a=_y(r["a"]) if "a" in r else None, b=_y(r["b"]) if "b" in r else None,
                      n=_n(r.get("n")), g=_n(r.get("g"))))
    return S


def persons(ps):
    ps = sorted(set(ps))
    P = {}
    for i in range(0, len(ps), B):
        v = " ".join(f"wd:{p}" for p in ps[i:i + B])
        q = f"""SELECT ?p ?dob ?pos ?nat ?sl ?h WHERE {{ VALUES ?p {{ {v} }}
          OPTIONAL{{?p wdt:P569 ?dob}} OPTIONAL{{?p wdt:P413 ?pos}} OPTIONAL{{?p wdt:P1532 ?nat}}
          OPTIONAL{{?p wikibase:sitelinks ?sl}} OPTIONAL{{?p wdt:P2048 ?h}} }}"""
        for r in sparql(q, k=f"persons_{ps[i]}_{len(ps[i:i + B])}"):
            p = _id(r["p"])
            x = P.setdefault(p, dict(name="", dob=None, pos=set(), nat=set(), sl=0, h=None))
            if "dob" in r and not x["dob"]:
                x["dob"] = r["dob"]["value"][:10]
            if "pos" in r:
                x["pos"].add(_id(r["pos"]))
            if "nat" in r:
                x["nat"].add(_id(r["nat"]))
            if "sl" in r:
                x["sl"] = max(x["sl"], int(r["sl"]["value"]))
            if "h" in r and x["h"] is None:
                try:
                    h = float(r["h"]["value"])
                    x["h"] = h * 100 if h < 3 else h
                except ValueError:
                    pass
        q = f"""SELECT ?p ?l ?lang WHERE {{ VALUES ?p {{ {v} }} ?p rdfs:label ?l .
          BIND(LANG(?l) AS ?lang) FILTER(?lang IN ({",".join(f'"{l}"' for l in LANGS)})) }}"""
        L = {}
        for r in sparql(q, k=f"labels_{ps[i]}_{len(ps[i:i + B])}"):
            L.setdefault(_id(r["p"]), {})[r["lang"]["value"]] = r["l"]["value"]
        for p, d in L.items():
            if p in P:
                P[p]["name"] = next((d[l] for l in LANGS if l in d), "")
    for p in ps:
        P.setdefault(p, dict(name="", dob=None, pos=set(), nat=set(), sl=0, h=None))
        if not P[p]["name"]:
            P[p]["name"] = p
    return P


def caps(ps):
    ps = sorted(set(ps))
    K = {}
    for i in range(0, len(ps), B):
        v = " ".join(f"wd:{p}" for p in ps[i:i + B])
        q = f"""SELECT ?p ?t ?n ?g WHERE {{ VALUES ?p {{ {v} }}
          ?p p:P54 ?st . ?st ps:P54 ?t . FILTER EXISTS {{ ?t wdt:P31 wd:{NT} }}
          OPTIONAL{{?st pq:P1350 ?n}} OPTIONAL{{?st pq:P1351 ?g}} }}"""
        seen = set()
        k = hashlib.sha1(" ".join(ps[i:i + B]).encode()).hexdigest()[:16]
        for r in sparql(q, k=f"caps_{k}"):
            p, t = _id(r["p"]), _id(r["t"])
            n = _n(r.get("n")) or 0
            g = _n(r.get("g")) or 0
            if (p, t, n, g) in seen:
                continue
            seen.add((p, t, n, g))
            c = K.setdefault(p, [0, 0])
            c[0] += n
            c[1] += g
        if i % (B * 10) == 0:
            print("caps", i, len(ps), flush=True)
    return {p: tuple(c) for p, c in K.items()}


def sexes(ps):
    """Person -> set of sex-or-gender items (P21). Q6581072 is female; the pool is men's football."""
    ps = sorted(set(ps))
    X = {}
    for i in range(0, len(ps), B):
        b = ps[i:i + B]
        v = " ".join(f"wd:{p}" for p in b)
        for r in sparql(f"SELECT ?p ?x WHERE {{ VALUES ?p {{ {v} }} ?p wdt:P21 ?x }}", k=f"sex_{b[0]}_{len(b)}"):
            X.setdefault(_id(r["p"]), set()).add(_id(r["x"]))
        if i % (B * 20) == 0:
            print("sexes", i, len(ps), flush=True)
    return X


def labels(ids):
    """English (or fallback) labels for arbitrary items, e.g. position items."""
    ids = sorted(set(ids))
    out = {}
    for i in range(0, len(ids), B):
        v = " ".join(f"wd:{x}" for x in ids[i:i + B])
        q = f"""SELECT ?i ?l ?lang WHERE {{ VALUES ?i {{ {v} }} ?i rdfs:label ?l . BIND(LANG(?l) AS ?lang)
          FILTER(?lang IN ("en","mul")) }}"""
        for r in sparql(q, k=f"itemlabels_{ids[i]}_{len(ids[i:i + B])}"):
            out.setdefault(_id(r["i"]), r["l"]["value"])
    return out
