"""FIFA 15 - FC 24 editions (CC0, Stefano Leone) and FC 24 Ultimate Team legend cards (CC0, Lucas Silva).

Legend
  E      edition rows: f (FIFA player id), v (edition 15..24), s (season start = 1999 + v), sn, ln
         (short and long name), pos (natural positions, list), o (overall), dob, club, nat
  A6     face attributes: pace, shooting, passing, dribbling, defending, physic
  G5     keeper attributes: diving, handling, kicking, reflexes, positioning
  tok    folded name tokens of length >= 3
  L      link: Wikidata person -> FIFA id
  I      legend cards: name, o (base card rating), pos, kind (icon | hero), nat, f6 (six face stats;
         keeper stats for goalkeepers)
  ZIP_E  FC 24 dataset archive name in INP;  CSV_I  Ultimate Team csv name inside its archive
"""
import re
import unicodedata
import zipfile
from functools import lru_cache

import pandas as pd

from .config import INP

ZIP_E = "fc24.zip"
ZIP_I = "fut23.zip"
F6 = ["Pace / Diving", "Shooting / Handling", "Passing / Kicking", "Dribbling / Reflexes", "Defense / Speed",
      "Physical / Positioning"]
CSV_I = "eafc24_players_2024-06-07.csv"
A6 = ["pace", "shooting", "passing", "dribbling", "defending", "physic"]
G5 = ["goalkeeping_diving", "goalkeeping_handling", "goalkeeping_kicking", "goalkeeping_reflexes", "goalkeeping_positioning"]


@lru_cache(maxsize=100000)
def fold(x):
    return "".join(c for c in unicodedata.normalize("NFKD", str(x)) if not unicodedata.combining(c)).lower()


@lru_cache(maxsize=100000)
def tok(x):
    return {t for t in re.split(r"[^a-z]+", fold(x)) if len(t) >= 3}


def club(x):
    """Club label key; distinctive words such as City and United are retained."""
    t = re.findall(r"[a-z0-9]+", fold(x))
    skip = {"fc", "cf", "f", "c", "ac", "afc", "sc", "ssc", "as", "club", "calcio", "futbol", "football", "de"}
    return " ".join(w for w in t if w not in skip)


def club_ids(E, M):
    """Join FIFA club names to historical aliases; ambiguous keys remain unlinked."""
    C = {}
    for (nm, _), q in M.items():
        C.setdefault(club(nm), set()).add(q)
    X = {k: next(iter(v)) for k, v in C.items() if len(v) == 1}
    E = E.copy()
    E["qid"] = E.club.map(lambda x: X.get(club(x)))
    return E


def editions():
    z = zipfile.ZipFile(INP / ZIP_E)
    c = ["player_id", "fifa_version", "short_name", "long_name", "player_positions", "overall", "dob", "club_name",
         "nationality_name", "height_cm", "international_reputation"] + A6 + G5
    x = pd.read_csv(z.open("male_players.csv"), usecols=c, low_memory=False)
    E = pd.DataFrame(dict(f=x.player_id.astype(int), v=x.fifa_version.astype(int), sn=x.short_name, ln=x.long_name,
                          pos=x.player_positions.fillna("").map(lambda t: [p.strip() for p in t.split(",") if p.strip()]),
                          o=x.overall.astype(int), dob=x.dob.astype(str).str[:10], club=x.club_name, nat=x.nationality_name,
                          h=x.height_cm, ir=x.international_reputation))
    for k in A6 + G5:
        E[k] = x[k]
    E["s"] = 1999 + E.v
    return E


def link(P, E):
    """P: person -> facts with name and dob. Same birth date plus a shared name token."""
    by = {d: g for d, g in E.drop_duplicates("f")[["f", "sn", "ln", "dob"]].groupby("dob")}
    L = {}
    for p, x in P.items():
        if not x.get("dob") or x["dob"] not in by:
            continue
        t = tok(x["name"])
        best, bs = None, 0.0
        for r in by[x["dob"]].itertuples():
            u = tok(r.ln) | tok(r.sn)
            sc = len(t & u) / max(1, len(t)) if t else 0.0
            if sc > bs:
                best, bs = int(r.f), sc
        if best is not None and bs > 0:
            L[p] = best
    return L


def legends():
    z = zipfile.ZipFile(INP / ZIP_I)
    x = pd.read_csv(z.open(CSV_I), low_memory=False)
    x = x[x.Card_Version.isin(["Icon", "Hero"])]
    I = []
    for r in x.itertuples():
        alt = [p.strip() for p in str(r.Alternate_Positions).split(",") if p.strip() and p.strip() != "0"]
        f6 = [x.at[r.Index, c] for c in F6]
        I.append(dict(name=r.Name, o=int(r.Rating), pos=[r.Main_Position] + alt, kind=str(r.Card_Version).lower(), nat=r.Nation,
                      f6=[float(v) if pd.notna(v) else None for v in f6]))
    return I
