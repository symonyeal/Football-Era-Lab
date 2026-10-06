"""Resolve result-file club names to Wikidata clubs; curated overrides win.

Legend
  cc     country code as used by the European Cup file (ENG, ESP, ..., SCO, UKR)
  CQ     Wikidata QID of each country code, for the P17 (country) check
  nm     club name as written in a result file
  qid    Wikidata item of the club
  M      name map rows: nm, cc, qid, label, how (override | search | missing)
  K_s    candidates read from each Wikidata search
  FC     Wikidata classes accepted as a football club
"""
import csv
import json
import time
import unicodedata
import urllib.parse
import urllib.request

from .config import CACHE, CUR
from .net import UA, sparql

CQ = {"ENG": "Q145", "SCO": "Q145", "WAL": "Q145", "NIR": "Q145", "ESP": "Q29", "ITA": "Q38", "GER": "Q183",
      "FRA": "Q142", "NED": "Q55", "POR": "Q45", "BEL": "Q31", "AUT": "Q40", "SUI": "Q39", "SWE": "Q34",
      "DEN": "Q35", "NOR": "Q20", "HUN": "Q28", "CZE": "Q213", "SVK": "Q214", "POL": "Q36", "ROU": "Q218",
      "BUL": "Q219", "SRB": "Q403", "CRO": "Q224", "GRE": "Q41", "TUR": "Q43", "RUS": "Q159", "UKR": "Q212",
      "IRL": "Q27", "ISR": "Q801", "CYP": "Q229", "FIN": "Q33", "BLR": "Q184", "GEO": "Q230", "SVN": "Q215",
      "BIH": "Q225", "MKD": "Q221", "ALB": "Q222", "LUX": "Q32", "MLT": "Q233", "ISL": "Q189"}
FC = {"Q476028", "Q15944511", "Q1194951", "Q103229495", "Q2367225"}
K_s = 8


def fold(x):
    return "".join(c for c in unicodedata.normalize("NFKD", x) if not unicodedata.combining(c)).lower()


def search(nm):
    p = CACHE / "wdsearch" / (fold(nm).replace(" ", "_").replace("/", "_") + ".json")
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    u = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
        dict(action="wbsearchentities", search=nm, language="en", type="item", limit=K_s, format="json"))
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60) as r:
        b = [dict(id=x["id"], label=x.get("label", ""), d=x.get("description", "")) for x in json.load(r).get("search", [])]
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(b, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.3)
    return b


def facts(Q):
    """Class and country of candidate items, in one query."""
    v = " ".join(f"wd:{q}" for q in Q)
    b = sparql(f"SELECT ?i ?c ?k WHERE {{ VALUES ?i {{ {v} }} OPTIONAL{{?i wdt:P31 ?c}} OPTIONAL{{?i wdt:P17 ?k}} }}")
    F = {}
    for r in b:
        i = r["i"]["value"].rsplit("/", 1)[1]
        f = F.setdefault(i, dict(c=set(), k=set()))
        if "c" in r:
            f["c"].add(r["c"]["value"].rsplit("/", 1)[1])
        if "k" in r:
            f["k"].add(r["k"]["value"].rsplit("/", 1)[1])
    return F


def overrides():
    p = CUR / "clubs.csv"
    if not p.exists():
        return {}
    with p.open(encoding="utf-8") as f:
        return {(r["nm"], r["cc"]): r for r in csv.DictReader(f)}


def resolve(N):
    """N: iterable of (nm, cc). Returns list of map rows."""
    O = overrides()
    M = []
    for nm, cc in sorted(set(N)):
        if (nm, cc) in O:
            o = O[(nm, cc)]
            M.append(dict(nm=nm, cc=cc, qid=o["qid"], label=o["label"], how="override"))
            continue
        c = search(nm) or search(nm.replace("FC ", "").replace(" FC", ""))
        F = facts([x["id"] for x in c]) if c else {}
        hit = next((x for x in c if F.get(x["id"], {}).get("c", set()) & FC and CQ.get(cc) in F[x["id"]]["k"]), None)
        M.append(dict(nm=nm, cc=cc, qid=hit["id"] if hit else "", label=hit["label"] if hit else "", how="search" if hit else "missing"))
    return M
