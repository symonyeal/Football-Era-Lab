"""Paths, decades, leagues and thresholds shared by every pipeline step.

Legend
  ROOT    repository root
  CACHE   downloaded sources and query results (git-ignored; FEL_CACHE overrides)
  INP     licensed local inputs: FC 24 zip, FUT csv (git-ignored; FEL_INPUTS overrides)
  OUT     game data folder written by the export step
  CUR     curated tables kept in git (managers, formations, tags, club overrides)
  D       decade start year (1950 ... 2020); decade D holds seasons D .. D+9
  s       season start year (1998 = 1998-99), as in engsoccerdata and FIFA editions
  DS      supported decades
  s_last  last season start year present in the result sources
  lg      league code, equal to the European Cup country code (ENG, ESP, ...)
  LG      league table: name, engsoccerdata file stem f, first three-points season s3
  URL_es  engsoccerdata raw file pattern
  K_lg    clubs kept per league per decade for the draft pool
  n_min   minimum top-tier seasons in a decade for a club to rank in its league
  N_opp   league opponents (the user's club is the 20th)
  N_cup   European Cup field
"""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work" / "pipeline"
CACHE = Path(os.environ.get("FEL_CACHE", WORK / "cache"))
INP = Path(os.environ.get("FEL_INPUTS", WORK / "inputs"))
OUT = ROOT / "data"
CUR = Path(__file__).resolve().parent / "curated"

DS = (1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020)
s_last = 2024


def dec(s):
    return (int(s) // 10) * 10


LG = {
    "ENG": dict(name="England", f="england", s3=1981),
    "ESP": dict(name="Spain", f="spain", s3=1995),
    "ITA": dict(name="Italy", f="italy", s3=1994),
    "GER": dict(name="Germany", f="germany", s3=1995),
    "FRA": dict(name="France", f="france", s3=1994),
    "NED": dict(name="Netherlands", f="holland", s3=1995),
    "POR": dict(name="Portugal", f="portugal", s3=1995),
}
URL_es = "https://raw.githubusercontent.com/jalapic/engsoccerdata/master/data-raw/{}.csv"

K_lg = 20
n_min = 3
N_opp = 19
N_cup = 16

