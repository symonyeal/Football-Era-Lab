"""EA player data from four published sources, joined on EA player id into one table of season rows.

Sources: FIFA 15 - FC 24 editions (Stefano Leone, CC0), the European Soccer Database (Hugo Mathien,
ODbL; FIFA attributes dated 2007-02 .. 2016-07 and real lineups), FC 25 (nyagami, Apache 2.0) and
FC 26 (justdhia, CC0). Only FC 24's file carries EA's per-position ratings; for the others they are
computed from detailed attributes with linear formulas fitted on the FC 24 rows (EA's position
ratings are weighted sums of attributes). Face stats for the European Soccer Database are computed
the same way.

Legend
  E      season rows: f (EA id), s (season start year), o (overall), pos (natural slots), dob, club,
         sn, ln (names), nat, a6 (pace, shooting, passing, dribbling, defending, physical), g6 (keeper
         diving, handling, kicking, reflexes, speed, positioning), sr (15 slot ratings, SL order), src
  SL     slot codes in the order the game stores slot ratings
  SLc    FC 24 column read for each slot
  AD     detailed attributes shared by every source (EA names);  A6c, G6c  face-stat columns
  fit_sr(X)  slot-rating formulas: least squares of each FC 24 slot rating on AD, with fit report
  fit_f6(X)  face-stat formulas for sources without face stats
  lu(c)  natural slots per (EA id, season) from the European Soccer Database lineup coordinates:
         X 1..9 runs right to left, Y 1..11 keeper to attack; a slot counts at >= 25% of appearances
  s_of(d)  season start of a date: July onwards belongs to that year's season
"""
import sqlite3
import zipfile

import numpy as np
import pandas as pd

from .config import INP

SL = ["GK", "LB", "CB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "ST"]
SLc = ["gk", "lb", "cb", "rb", "lwb", "rwb", "cdm", "cm", "cam", "lm", "rm", "lw", "rw", "cf", "st"]
AD = ["attacking_crossing", "attacking_finishing", "attacking_heading_accuracy", "attacking_short_passing",
      "attacking_volleys", "skill_dribbling", "skill_curve", "skill_fk_accuracy", "skill_long_passing",
      "skill_ball_control", "movement_acceleration", "movement_sprint_speed", "movement_agility",
      "movement_reactions", "movement_balance", "power_shot_power", "power_jumping", "power_stamina",
      "power_strength", "power_long_shots", "mentality_aggression", "mentality_interceptions",
      "mentality_positioning", "mentality_vision", "mentality_penalties", "defending_marking_awareness",
      "defending_standing_tackle", "defending_sliding_tackle", "goalkeeping_diving", "goalkeeping_handling",
      "goalkeeping_kicking", "goalkeeping_positioning", "goalkeeping_reflexes"]
A6c = ["pace", "shooting", "passing", "dribbling", "defending", "physic"]
G6c = ["goalkeeping_diving", "goalkeeping_handling", "goalkeeping_kicking", "goalkeeping_reflexes",
       "goalkeeping_speed", "goalkeeping_positioning"]
EAP = {"GK": "GK", "LB": "LB", "CB": "CB", "RB": "RB", "LWB": "LWB", "RWB": "RWB", "CDM": "CDM", "CM": "CM",
       "CAM": "CAM", "LM": "LM", "RM": "RM", "LW": "LW", "RW": "RW", "CF": "CF", "ST": "ST", "LF": "CF", "RF": "CF"}
ESDB_AD = dict(zip(AD, ["crossing", "finishing", "heading_accuracy", "short_passing", "volleys", "dribbling", "curve",
                        "free_kick_accuracy", "long_passing", "ball_control", "acceleration", "sprint_speed", "agility",
                        "reactions", "balance", "shot_power", "jumping", "stamina", "strength", "long_shots",
                        "aggression", "interceptions", "positioning", "vision", "penalties", "marking",
                        "standing_tackle", "sliding_tackle", "gk_diving", "gk_handling", "gk_kicking",
                        "gk_positioning", "gk_reflexes"]))
FC25_AD = dict(zip(AD, ["Crossing", "Finishing", "Heading Accuracy", "Short Passing", "Volleys", "Dribbling", "Curve",
                        "Free Kick Accuracy", "Long Passing", "Ball Control", "Acceleration", "Sprint Speed", "Agility",
                        "Reactions", "Balance", "Shot Power", "Jumping", "Stamina", "Strength", "Long Shots",
                        "Aggression", "Interceptions", "Positioning", "Vision", "Penalties", "Def Awareness",
                        "Standing Tackle", "Sliding Tackle", "GK Diving", "GK Handling", "GK Kicking",
                        "GK Positioning", "GK Reflexes"]))
FC26_AD = dict(zip(AD, ["crossing", "finishing", "headingAccuracy", "shortPassing", "volleys", "dribbling", "curve",
                        "freeKickAccuracy", "longPassing", "ballControl", "acceleration", "sprintSpeed", "agility",
                        "reactions", "balance", "shotPower", "jumping", "stamina", "strength", "longShots",
                        "aggression", "interceptions", "positioning", "vision", "penalties", "defensiveAwareness",
                        "standingTackle", "slidingTackle", "gkDiving", "gkHandling", "gkKicking", "gkPositioning",
                        "gkReflexes"]))


def _base(v):
    try:
        return float(str(v).split("+")[0].split("-")[0])
    except ValueError:
        return np.nan


def s_of(d):
    d = pd.to_datetime(d)
    return d.dt.year - (d.dt.month < 7).astype(int)


def fc24():
    z = zipfile.ZipFile(INP / "fc24.zip")
    c = ["player_id", "fifa_version", "short_name", "long_name", "player_positions", "overall", "dob", "club_name",
         "nationality_name"] + A6c + AD + ["goalkeeping_speed"] + SLc
    x = pd.read_csv(z.open("male_players.csv"), usecols=c, low_memory=False)
    x = x.sort_values(["player_id", "fifa_version"]).drop_duplicates(["player_id", "fifa_version"], keep="last")
    E = pd.DataFrame(dict(f=x.player_id.astype(int), s=1999 + x.fifa_version.astype(int), o=x.overall.astype(float),
                          pos=x.player_positions.fillna("").map(_pos), dob=x.dob.astype(str).str[:10], club=x.club_name,
                          sn=x.short_name, ln=x.long_name, nat=x.nationality_name, src="fc24"))
    E["a6"] = list(x[A6c].to_numpy(dtype=float))
    E["g6"] = list(x[G6c].to_numpy(dtype=float))
    E["sr"] = list(np.column_stack([x[c].map(_base).to_numpy(dtype=float) for c in SLc]))
    return E.reset_index(drop=True), x[AD].to_numpy(dtype=float), np.column_stack([x[c].map(_base) for c in SLc]), \
        x[A6c + G6c].to_numpy(dtype=float)


def _pos(t):
    out = []
    for p in str(t).replace(";", ",").split(","):
        q = EAP.get(p.strip().upper())
        if q and q not in out:
            out.append(q)
    return out[:3]


def fit_lin(X, Y):
    """Least squares with intercept per output column; rows with any missing value are skipped."""
    k = ~(np.isnan(X).any(1) | np.isnan(Y).any(1))
    A = np.column_stack([np.ones(k.sum()), X[k]])
    W, *_ = np.linalg.lstsq(A, Y[k], rcond=None)
    P = A @ W
    rep = dict(n=int(k.sum()), mae=[float(v) for v in np.abs(P - Y[k]).mean(0)],
               r2=[float(v) for v in 1 - ((P - Y[k]) ** 2).sum(0) / ((Y[k] - Y[k].mean(0)) ** 2).sum(0)])
    return W, rep


def apply_lin(W, X):
    return np.column_stack([np.ones(len(X)), X]) @ W


def lu(c):
    """Natural slots per (EA id, season) from real lineups, plus the most frequent team per (id, season)."""
    m = pd.read_sql("select season, home_team_api_id h, away_team_api_id a, " +
                    ", ".join(f"{s}_player_{i}, {s}_player_X{i}, {s}_player_Y{i}" for s in ("home", "away") for i in range(1, 12)) +
                    " from Match where home_player_X1 is not null", c)
    pl = pd.read_sql("select player_api_id a, player_fifa_api_id f from Player", c).set_index("a").f
    tm = pd.read_sql("select team_api_id t, team_long_name n from Team", c).set_index("t").n
    R = []
    for s, side in (("home", "h"), ("away", "a")):
        for i in range(1, 12):
            d = m[["season", side, f"{s}_player_{i}", f"{s}_player_X{i}", f"{s}_player_Y{i}"]].dropna()
            d.columns = ["season", "t", "p", "x", "y"]
            R.append(d)
    R = pd.concat(R)
    R["f"] = R.p.map(pl)
    R["s"] = R.season.str[:4].astype(int)
    R["slot"] = [_xy(int(x), int(y)) for x, y in zip(R.x, R.y)]
    R["club"] = R.t.map(tm)
    n = R.groupby(["f", "s"]).size()
    sl = R.groupby(["f", "s", "slot"]).size().div(n).reset_index(name="w")
    P = (sl[sl.w >= 0.25].sort_values("w", ascending=False).groupby(["f", "s"]).slot.apply(lambda v: list(v)[:3]))
    C = R.groupby(["f", "s"]).club.agg(lambda v: v.value_counts().index[0])
    return P, C, n


def _xy(x, y):
    if y == 1:
        return "GK"
    side = "R" if x <= 2 else "L" if x >= 8 else "C"
    if y <= 4:
        return {"R": "RB", "L": "LB", "C": "CB"}[side] if not (x in (1, 9) and y >= 4) else ("RWB" if x == 1 else "LWB")
    if y <= 6:
        return {"R": "RM", "L": "LM", "C": "CDM"}[side]
    if y == 7:
        return {"R": "RM", "L": "LM", "C": "CM"}[side]
    side = "R" if x <= 3 else "L" if x >= 7 else "C"
    if y <= 9:
        return {"R": "RW", "L": "LW", "C": "CAM"}[side]
    return {"R": "RW", "L": "LW", "C": "ST"}[side]


def esdb():
    c = sqlite3.connect(INP / "esdb.sqlite")
    a = pd.read_sql("select player_fifa_api_id f, date, overall_rating o, " + ", ".join(ESDB_AD.values()) +
                    " from Player_Attributes where overall_rating is not null", c)
    a["s"] = s_of(a.date)
    a = a.sort_values("date").groupby(["f", "s"]).tail(1)
    p = pd.read_sql("select player_fifa_api_id f, player_name n, birthday b from Player", c).drop_duplicates("f").set_index("f")
    P, C, n = lu(c)
    E = pd.DataFrame(dict(f=a.f.astype(int).values, s=a.s.astype(int).values, o=a.o.astype(float).values))
    E["pos"] = [P.get((f, s), []) for f, s in zip(E.f, E.s)]
    E["club"] = [C.get((f, s)) for f, s in zip(E.f, E.s)]
    E["dob"] = E.f.map(p.b).astype(str).str[:10]
    E["sn"] = E["ln"] = E.f.map(p.n)
    E["nat"] = None
    E["src"] = "esdb"
    return E, a[list(ESDB_AD.values())].to_numpy(dtype=float)


def fc25():
    x = pd.read_csv(zipfile.ZipFile(INP / "nyagami_ea-sports-fc-25-database-ratings-and-stats.zip").open("male_players.csv"),
                    low_memory=False)
    E = pd.DataFrame(dict(f=x.url.str.rsplit("/", n=1).str[1].astype(int), s=2024, o=x.OVR.astype(float),
                          pos=(x.Position.fillna("") + "," + x["Alternative positions"].fillna("")).map(_pos),
                          dob=None, club=x.Team, sn=x.Name, ln=x.Name, nat=x.Nation, src="fc25"))
    E["a6"] = list(x[["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"]].to_numpy(dtype=float))
    E["g6"] = list(np.column_stack([x["GK Diving"], x["GK Handling"], x["GK Kicking"], x["GK Reflexes"],
                                    x["Acceleration"] * 0 + np.nan, x["GK Positioning"]]).astype(float))
    return E, x[list(FC25_AD.values())].to_numpy(dtype=float)


def fc26():
    x = pd.read_csv(zipfile.ZipFile(INP / "justdhia_ea-sports-fc-26-player-ratings.zip").open("ea_fc26_players.csv"),
                    low_memory=False)
    nm = x.commonName.fillna((x.firstName.fillna("") + " " + x.lastName.fillna("")).str.strip())
    E = pd.DataFrame(dict(f=x.id.astype(int), s=2025, o=x.overallRating.astype(float),
                          pos=(x.position.fillna("") + "," + x.alternatePositions.fillna("")).map(_pos),
                          dob=pd.to_datetime(x.birthdate, errors="coerce").dt.strftime("%Y-%m-%d"), club=x.team,
                          sn=nm, ln=(x.firstName.fillna("") + " " + x.lastName.fillna("")).str.strip(), nat=x.nationality,
                          src="fc26"))
    E["a6"] = list(x[["pac", "sho", "pas", "dri", "def", "phy"]].to_numpy(dtype=float))
    E["g6"] = list(np.column_stack([x.gkDiving, x.gkHandling, x.gkKicking, x.gkReflexes, x.gkDiving * np.nan,
                                    x.gkPositioning]).astype(float))
    return E, x[list(FC26_AD.values())].to_numpy(dtype=float)


def table():
    """All sources in one frame; FC 24 wins a season it shares with the European Soccer Database."""
    E0, X0, S0, F0 = fc24()
    Wsr, rs = fit_lin(X0, S0)
    Wf6, rf = fit_lin(X0[:, :28], F0[:, :6])
    parts = [E0]
    E1, X1 = esdb()
    E1["sr"] = list(apply_lin(Wsr, X1))
    E1["a6"] = list(apply_lin(Wf6, X1[:, :28]))
    E1["g6"] = list(np.column_stack([X1[:, 28], X1[:, 29], X1[:, 30], X1[:, 32], np.full(len(X1), np.nan), X1[:, 31]]))
    parts.append(E1[~E1.set_index(["f", "s"]).index.isin(E0.set_index(["f", "s"]).index)])
    for g in (fc25, fc26):
        Eg, Xg = g()
        Eg["sr"] = list(apply_lin(Wsr, Xg))
        parts.append(Eg)
    E = pd.concat(parts, ignore_index=True)
    db = E.dropna(subset=["dob"]).loc[lambda d: d.dob.str.match(r"^\d{4}-\d\d-\d\d$")].groupby("f").dob.first()
    E["dob"] = E.f.map(db)
    nm = E.groupby("f").ln.first()
    E["ln"] = E.ln.fillna(E.f.map(nm))
    for k in ("sr", "a6", "g6"):
        E[k] = [np.round(np.clip(np.asarray(v, dtype=float), 1, 99), 1) for v in E[k]]
    E["sr"] = [np.minimum(v, o) if np.isfinite(o) else v for v, o in zip(E.sr, E.o)]
    return E, dict(slot_formula=rs, face_formula=rf, rows={k: int(v) for k, v in E.src.value_counts().items()})
