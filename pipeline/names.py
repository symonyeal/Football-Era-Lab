"""Short display names for clubs, and name-to-person resolution for curated lists.

Legend
  SO     club display overrides by Wikidata label
  PRE    prefixes dropped from a club label;  SUF  suffixes dropped
  short(l)        display name of club label l
  who(nm, P, ps)  person id among ps for curated name nm: exact folded label first, then every name
                  token contained in the label; ties go to the most widely covered (sitelinks)
"""
from .fifa import fold, tok

SO = {"FK Crvena zvezda": "Red Star Belgrade", "FCSB": "Steaua Bucharest", "Athletic Club": "Athletic Bilbao",
      "Deportivo de A Coruña": "Deportivo La Coruña", "Olympique de Marseille": "Marseille", "Olympique Lyonnais": "Lyon",
      "Inter Milan": "Inter", "AC Milan": "AC Milan", "Feyenoord Rotterdam": "Feyenoord", "Real Madrid Club de Fútbol": "Real Madrid",
      "FC Girondins de Bordeaux": "Bordeaux", "Stade de Reims": "Stade de Reims", "1. FC Köln": "1. FC Köln",
      "1. FC Kaiserslautern": "Kaiserslautern", "1. FC Nürnberg": "Nürnberg", "RC Strasbourg Alsace": "Strasbourg",
      "Montpellier Hérault Sport Club": "Montpellier", "Stade Rennais F.C.": "Rennes", "FC Sochaux-Montbéliard": "Sochaux",
      "Stade Malherbe Caen": "Caen", "SBV Vitesse": "Vitesse", "N.E.C.": "NEC Nijmegen", "TSV 1860 München": "1860 Munich",
      "Bayer 04 Leverkusen": "Bayer Leverkusen", "TSG 1899 Hoffenheim": "Hoffenheim", "SS Lazio": "Lazio",
      "U.C. Sampdoria": "Sampdoria", "Parma Calcio 1913": "Parma", "Bologna F.C. 1909": "Bologna", "Hellas Verona FC": "Verona",
      "Wolverhampton Wanderers F.C.": "Wolves", "Brighton & Hove Albion F.C.": "Brighton", "Queens Park Rangers F.C.": "QPR",
      "West Bromwich Albion F.C.": "West Brom", "PFC CSKA Moscow": "CSKA Moscow", "FC Dynamo Kyiv": "Dynamo Kyiv",
      "Club Brugge K.V.": "Club Brugge", "Paris Saint-Germain FC": "Paris Saint-Germain", "RB Leipzig": "RB Leipzig"}
PRE = ("FC ", "AFC ", "SSC ", "S.L. ", "R.S.C. ", "PFC ", "FK ", "HNK ", "SK ", "AS ", "SV ", "VfL ", "VfB ", "RCD ",
       "RC ", "CF ", "C.D. ", "C.F. ", "S.C. ", "G.D. ", "U.D. ", "F.C. ", "SC ", "ACF ", "US ", "U.S. ", "R.C. ")
SUF = (" Club de Fútbol", " F.C.", " FC", " A.F.C.", " AFC", " C.F.", " CF", " Calcio", " S.K.", " K.V.", " SC",
       " Balompié", " Fotboll", " J.K.", " FC II")


def short(l):
    if l in SO:
        return SO[l]
    s = l
    for p in PRE:
        if s.startswith(p) and len(s) > len(p) + 3:
            s = s[len(p):]
            break
    for x in SUF:
        if s.endswith(x) and len(s) > len(x) + 3:
            s = s[: -len(x)]
            break
    return s


def who(nm, P, ps):
    f, t = fold(nm), tok(nm)
    ex = [p for p in ps if fold(P[p]["name"]) == f]
    if ex:
        return max(ex, key=lambda p: P[p].get("sl", 0))
    if not t:
        return None
    cn = [p for p in ps if t <= tok(P[p]["name"])]
    return max(cn, key=lambda p: P[p].get("sl", 0)) if cn else None
