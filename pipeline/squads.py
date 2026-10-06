"""Club-decade squads from Wikidata stints: seasons covered, apps and goals apportioned by decade.

Legend
  S      stint: p, a (start year), b (end year), n (league apps), g (league goals)
  ss     season start years covered by a stint: a .. b-1, or [a] for a same-year stint
  n_s    league apps per season ceiling; larger stints are scaled to it (data entry noise)
  n_y    seasons assumed for a stint missing its end year: apps / n_y, at least one
  A_min  apportioned apps in a decade for squad membership
  sl_min sitelinks that admit a player whose stint has no apps recorded
  Q      squad rows: qid, D, p, n (apps in D), g (goals in D), k (seasons in D), s0, s1 (first and
         last season at the club in D), x (1 when apps were missing and admitted by sitelinks)
"""
from collections import defaultdict

from .config import DS, dec, s_last

n_s = 50
n_y = 30
A_min = 10
sl_min = 12


def seasons(a, b, n):
    if a is None and b is None:
        return []
    if a is None:
        a = b - 1
    if b is None:
        b = a + max(1, round((n or n_y * 2) / n_y))
        b = min(b, s_last + 1)
    if b <= a:
        return [a]
    return list(range(a, b))


def squads(qid, S, sl):
    """S: stints at club qid; sl: person -> sitelinks. Returns squad rows across all decades."""
    an: dict = defaultdict(float)
    ag: dict = defaultdict(float)
    ak: dict = defaultdict(set)
    ax: dict = defaultdict(int)
    seen = set()
    for t in S:
        key = tuple(t.get(k) for k in ("p", "a", "b", "n", "g"))
        if key in seen:
            continue
        seen.add(key)
        ss = seasons(t["a"], t["b"], t["n"])
        if not ss:
            continue
        n, g = t["n"], t["g"]
        if n is not None and n > n_s * len(ss):
            f = n_s * len(ss) / n
            n, g = n * f, (g or 0) * f
        for D in DS:
            k = [s for s in ss if dec(s) == D]
            if not k:
                continue
            j = (D, t["p"])
            ak[j].update(k)
            if n is None:
                ax[j] = 1
            else:
                an[j] += n * len(k) / len(ss)
                ag[j] += (g or 0) * len(k) / len(ss)
    Q = []
    for j, k in ak.items():
        D, p = j
        x = int(ax[j] == 1 and an[j] == 0)
        if an[j] >= A_min or (x and sl.get(p, 0) >= sl_min and len(k) >= 2):
            Q.append(dict(qid=qid, D=D, p=p, n=round(an[j]), g=round(ag[j]), k=len(k), s0=min(k), s1=max(k), x=x))
    out = []
    for D in DS:
        z = sorted((q for q in Q if q["D"] == D), key=lambda q: (-q["n"], q["p"]))
        out.extend(z)
    return out
