"""Championship Manager 01/02 database reader: people, player attributes, positions, clubs, history.

Record layouts follow nckstwrt/CM0102Patcher (SaveChanger/Structures.cs, History Editor/
HistoryLoader.cs); displayed attribute values follow agevak/CM0102 (CM0102Core/Model/
PlayerAttribute.cs). CM 01/02 has been freeware since 2008; its databases (official and community)
are read locally and never shipped.

Legend
  IX     index.dat entry: name, file type t, count n, offset o, version v (after an 8-byte header)
  T_ST   staff.dat block type of people (6);  T_PL  of player records (10)
  S_ST   TStaff (110 bytes);  S_PL  TPlayer (70);  S_SH  TStaffHistory (17);  S_NM  TNames (60)
  S_CL   leading TClub fields read (id, name, short name, nation, division, reputation, squad)
  AT     the 42 player attributes in record order;  PO  the 8 position proficiencies, SD sides
  CAD    attributes whose displayed value depends on current ability (CA)
  ca     current ability, 1..200;  iv  stored intrinsic value;  dv  displayed value (0..20+)
  dv(a, iv, ca)  displayed value of attribute a
  rd(d)  database at folder d -> dict(P people, C clubs, H history, y season start year)
  y      season of a database: the latest year in staff history (the season just completed)
"""
import math
import struct
from pathlib import Path

IX = struct.Struct("<51siiii")
T_ST, T_PL = 6, 10
S_ST = struct.Struct("<4ihhiH2i2Bi" + "B" + "hhi" * 2 + "i" + "B" + "hhi" * 2 + "2i" + "8B" + "3B" + "3i" + "B")
S_PL = struct.Struct("<iBHhHHH12b42bB")
S_SH = struct.Struct("<iihibbb")
S_NM = struct.Struct("<51siib")
S_CL = struct.Struct("<i51sB26sBiiiBiBiiBiBiiiBHB")  # through PLC; the squad array follows the 24 ints after
AT = ["acc", "agg", "agi", "ant", "bal", "bra", "con", "cor", "cro", "dec", "dir", "dri", "fin", "fla", "fk",
      "han", "hea", "imp", "inj", "jum", "lea", "lf", "lon", "mar", "mov", "nat", "one", "pac", "pas", "pen",
      "pos", "ref", "rf", "sta", "str", "tac", "tea", "tec", "thr", "ver", "vis", "wor"]
PO = ["gk", "sw", "d", "dm", "m", "am", "f", "wb"]
SD = ["r", "l", "c", "fr"]
CAD = {"ant", "cro", "dec", "dri", "fin", "han", "hea", "lon", "mar", "mov", "one", "pas", "pen", "pos", "ref",
       "tac", "thr", "vis"}
assert S_ST.size == 110 and S_PL.size == 70 and S_SH.size == 17 and S_NM.size == 60


def _s(b):
    return b.split(b"\0", 1)[0].decode("latin-1").strip()


def _xb(dv, th, pw):
    return th + (dv - th) ** pw if dv > th else dv


def dv(a, iv, ca):
    """Displayed attribute value from the stored intrinsic value (agevak GetInMatchValue)."""
    if a in CAD:
        ab = (ca // 2 + 80) & 0xFF
        v = (2 * iv + ab) * 0.1
        bo = ab > 150
        if a == "ant":
            v = max(0.0, v + 0.23) / 2 + 5
        elif a in ("cro", "fin"):
            v = _xb(v, 16, 1.25) if bo else v
        elif a in ("hea", "pas"):
            v = _xb(v, 18, 1.2 if a == "hea" else 1.25) if bo else v
        elif a in ("mar", "pos"):
            v = _xb(v, 16, 1.2) if bo else v
        elif a == "mov":
            v = (v + 0.13) * 0.65 + 7
        elif a == "vis":
            f = iv
            if iv > 10:
                f = 10 + (iv - 10) * (0.75 if ca < 80 else 0.85 if ca < 125 else 1.0)
            v = (2 * f + ab) * 0.1
            v = _xb(v, 17, 1.2) if bo else v
        return max(0.0, v)
    k = {"acc": (2 / 3, 0.2), "pac": (2 / 3, 0.2), "agi": (0.5, 0.2), "agg": (0.5, 0.0), "bal": (0.5, 0.2),
         "bra": (0.5, 0.2), "cor": (0.5, 0.2), "fk": (0.57, 0.2), "str": (0.5, 0.2), "sta": (0.65, 7.25)}
    if a in k:
        m, c = k[a]
        v = iv * m + c
        if a in ("acc", "pac"):
            v = _xb(v, 12, 1.25)
        return max(0.0, v)
    return max(0.0, float(iv))


def _index(d):
    b = (d / "index.dat").read_bytes()
    out = []
    for i in range(8, len(b) - IX.size + 1, IX.size):
        nm, t, n, o, v = IX.unpack_from(b, i)
        out.append(dict(nm=_s(nm), t=t, n=n, o=o, v=v))
    return out


def _names(p):
    b = p.read_bytes()
    return [_s(S_NM.unpack_from(b, i)[0]) for i in range(0, len(b) - S_NM.size + 1, S_NM.size)]


def _clubs(p, ix):
    b = p.read_bytes()
    e = next((x for x in ix if x["nm"] == p.name), None)
    w = len(b) // e["n"] if e and e["n"] else 581
    C = {}
    for i in range(0, len(b) - w + 1, w):
        r = S_CL.unpack_from(b, i)
        cid, nm, sn, nat, div, rep = r[0], _s(r[1]), _s(r[3]), r[5], r[6], r[20]
        q = i + S_CL.size + 4 * (6 + 6 + 3 + 1 + 3 + 1 + 1)  # colours, fav/dislike staff, rivals, chairman, directors, manager, assistant
        sq = [x for x in struct.unpack_from("<50i", b, q) if x >= 0]
        C[cid] = dict(nm=nm, sn=sn, nat=nat, div=div, rep=rep, sq=sq)
    return C


def rd(d):
    d = Path(d)
    ix = _index(d)
    st = next(x for x in ix if x["nm"] == "staff.dat" and x["t"] == T_ST)
    pl = next(x for x in ix if x["nm"] == "staff.dat" and x["t"] == T_PL)
    b = (d / "staff.dat").read_bytes()
    F, S, K = _names(d / "first_names.dat"), _names(d / "second_names.dat"), _names(d / "common_names.dat")
    N = {}
    nb = (d / "nation.dat").read_bytes()
    ne = next((x for x in ix if x["nm"] == "nation.dat"), None)
    nw = len(nb) // ne["n"] if ne and ne["n"] else 290
    for i in range(0, len(nb) - nw + 1, nw):
        N[struct.unpack_from("<i", nb, i)[0]] = _s(nb[i + 4 + 51 + 1:i + 4 + 51 + 1 + 26])
    PL = {}
    for k in range(pl["n"]):
        r = S_PL.unpack_from(b, pl["o"] + k * S_PL.size)
        PL[r[0]] = r
    P = {}
    for k in range(st["n"]):
        r = S_ST.unpack_from(b, st["o"] + k * S_ST.size)
        sid, fn, sn, cn, dd, dy, _, yb, nat = r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]
        club, pid = r[20], r[41]
        if pid < 0 or pid not in PL:
            continue
        p = PL[pid]
        ca = p[2]
        nm_f = F[fn] if 0 <= fn < len(F) else ""
        nm_s = S[sn] if 0 <= sn < len(S) else ""
        nm_c = K[cn] if 0 <= cn < len(K) else ""
        dob = None
        if dy > 1800 and 0 <= dd < 367:
            m = _doy(dy, dd)
            dob = f"{dy:04d}-{m[0]:02d}-{m[1]:02d}"
        P[sid] = dict(fn=nm_f, sn=nm_s, cn=nm_c, dob=dob, yb=dy if dy > 1800 else (yb if yb > 1800 else None),
                      nat=N.get(nat, ""), club=club, ca=ca, pa=p[3], rep=p[6], caps=r[10], ig=r[11],
                      po=dict(zip(PO, p[7:15])), sd=dict(zip(SD, p[15:19])),
                      at={a: iv for a, iv in zip(AT, p[19:61])})
    C = _clubs(d / "club.dat", ix)
    hb = (d / "staff_history.dat").read_bytes()
    H = []
    for i in range(0, len(hb) - S_SH.size + 1, S_SH.size):
        _, sid, y, cid, ln, ap, gl = S_SH.unpack_from(hb, i)
        if sid in P:
            H.append(dict(s=sid, y=y, c=cid, ln=ln, ap=ap, g=gl))
    ys = [h["y"] for h in H if 1900 < h["y"] < 2100]
    return dict(P=P, C=C, H=H, y=max(ys) if ys else None, v=st["v"])


def _doy(y, d):
    L = 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28
    ml = [31, L, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    m = 0
    while m < 12 and d >= ml[m]:
        d -= ml[m]
        m += 1
    return (m + 1, d + 1) if m < 12 else (12, 31)


def disp(p):
    """Displayed 1..20-style values for every attribute of person record p."""
    return {a: dv(a, iv, p["ca"]) for a, iv in p["at"].items()}


# Linking to Wikidata people
#   MF     manifest: folder -> s (real season), dy (stored minus real year)
#   W      pool index: real birth year -> [(person, name tokens, day of year)]
#   d_tol  birth-date tolerance in days (stored dates drift by a day or two between databases)
#   lk(X, s, dy, W)  linked records of one database: person -> best record, with club and season
#   vote(L, PS)      CM club id -> Wikidata club, by the stints of the linked players that season;
#                    PS = person -> {season: set of club ids}; needs >= 2 votes and a majority
d_tol = 3


def MF():
    import json
    from .config import CUR
    return {k: v for k, v in json.loads((CUR / "cm0102.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}


def _yd(dob):
    import datetime as dt
    y, m, d = (int(x) for x in dob[:10].split("-"))
    return dt.date(y, m, d).timetuple().tm_yday


def pool_index(P):
    from .fifa import tok
    W = {}
    for p, x in P.items():
        d = x.get("dob")
        if d and d[0] != "-" and len(d) >= 10:
            try:
                W.setdefault(int(d[:4]), []).append((p, tok(x["name"]), _yd(d)))
            except ValueError:
                pass
    return W


def lk(X, dy, W):
    from .fifa import tok
    out = {}
    for sid, r in X["P"].items():
        if not (1 <= r["ca"] <= 200) or not r["dob"]:
            continue
        by = int(r["dob"][:4]) - dy
        try:
            dd = _yd(f"{by:04d}{r['dob'][4:]}")
        except ValueError:
            continue
        t = tok(r["fn"]) | tok(r["sn"]) | tok(r["cn"])
        if not t:
            continue
        best, bs, tie = None, 0.0, False
        for p, u, du in W.get(by, ()):
            if abs(du - dd) > d_tol or not (t & u):
                continue
            sc = len(t & u) / len(u) + (0.25 if du == dd else 0)
            if sc > bs:
                best, bs, tie = p, sc, False
            elif sc == bs:
                tie = True
        if best and not tie and (best not in out or out[best]["ca"] < r["ca"]):
            out[best] = dict(r, sid=sid, by=by)
    return out


def vote(L, s, PS):
    V = {}
    for p, r in L.items():
        Q = PS.get(p, {}).get(s, set())
        for q in Q:
            V.setdefault(r["club"], {}).setdefault(q, 0.0)
            V[r["club"]][q] += 1 / len(Q)
    M = {}
    for c, v in V.items():
        q, n = max(v.items(), key=lambda kv: kv[1])
        if n >= 2 and n >= 0.5 * sum(v.values()):
            M[c] = q
    return M


if __name__ == "__main__":
    import sys
    for d in sys.argv[1:]:
        X = rd(d)
        P = X["P"]
        top = sorted(P.values(), key=lambda p: -p["ca"])[:8]
        print(Path(d).name, "season", X["y"], "version", X["v"], "players", len(P), "clubs", len(X["C"]),
              "history rows", len(X["H"]))
        for p in top:
            nm = p["cn"] or f"{p['fn']} {p['sn']}"
            c = X["C"].get(p["club"], {}).get("nm", "")
            print(f"   ca{p['ca']:4d} {nm[:24]:24s} {p['dob']} {c[:22]:22s} po={p['po']} sd={p['sd']}")
        if top:
            print("   displayed:", {k: round(v, 1) for k, v in disp(top[0]).items()})
        print("  ", math.nan if not P else sum(p["ca"] for p in P.values()) / len(P), "mean CA")
