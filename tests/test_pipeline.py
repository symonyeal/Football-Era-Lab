"""Pipeline rules, checked without downloads: squads, legends, evidence order, positions, CM, stats.

Legend: Q squad rows, P person facts, E EA rows, R CM records, L person -> EA id.
"""
import unittest

import numpy as np
import pandas as pd

from pipeline import cm0102, engines, legends, positions, ratings, squads, stats

SR = list(np.full(15, 70.0))


def _E(**k):
    d = dict(f=1, s=2014, o=78.0, pos=["CM"], q="old", sr=SR, a6=None, g6=None)
    d.update(k)
    return d


class Squads(unittest.TestCase):
    def test_full_squad(self):
        S = [dict(p=f"Q{i}", a=1991, b=1994, n=80, g=2) for i in range(65)]
        self.assertEqual(len(squads.squads("club", S, {})), 65)

    def test_duplicate_stint(self):
        s = dict(p="Q1", a=1991, b=1994, n=80, g=2)
        q = squads.squads("club", [s, s.copy()], {})
        self.assertEqual((q[0]["n"], q[0]["g"]), (80, 2))

    def test_era_allocation(self):
        q = squads.squads("club", [dict(p="Q1", a=1940, b=1960, n=400, g=100)], {})
        self.assertEqual((q[0]["n"], q[0]["g"]), (200, 50))


class Legends(unittest.TestCase):
    def test_legend_identity(self):
        I = [dict(name="Diego Milito", o=88, pos=["ST"], kind="hero", nat="Argentina")]
        P = {"Q1": dict(name="Diego Maradona", nat={"AR"}, sl=200), "Q2": dict(name="Diego Milito", nat=set(), sl=50)}
        L = legends.match(I, P, {"AR": "Argentina"}, list(P))
        self.assertNotIn("Q1", L)
        self.assertIn("Q2", L)


class Evidence(unittest.TestCase):
    Q = pd.DataFrame([dict(p="Q1", qid="old", D=2010, s0=2014, s1=2015)])
    P = {"Q1": {"dob": "1988-01-01"}}

    def run_(self, E, R):
        return ratings.engine_y(self.Q, self.P, {"Q1": 1}, pd.DataFrame(E), pd.DataFrame(R)).iloc[0]

    def test_same_club_snapshot_rates_the_card(self):
        q = self.run_([_E(), _E(s=2015, o=91.0, q="new")], [])
        self.assertEqual(q.y, 78)

    def test_other_club_is_only_nearby(self):
        q = self.run_([_E(o=91.0, q="new")], [])
        self.assertTrue(pd.isna(q.y))
        self.assertEqual(q.yn, 91.0)

    def test_cm_same_club_rates_when_ea_is_absent(self):
        R = [dict(p="Q1", s=2014, q="old", o=84.0, sr=SR, a6=None, g6=None, pos=["ST"], gk=False)]
        q = self.run_([_E(o=80.0, q="new", s=2010)], [dict(r, r=r.pop("o")) for r in R])
        self.assertEqual(q.yc, 84.0)
        self.assertEqual(q.pc["pos"], ["ST"])

    def test_nearby_rating_moves_with_age(self):
        q = self.run_([_E(s=2016, o=80.0, q="new")], [])
        self.assertAlmostEqual(q.yn, 80.0)
        Q = pd.DataFrame([dict(p="Q1", qid="old", D=2000, s0=2005, s1=2006)])
        z = ratings.engine_y(Q, self.P, {"Q1": 1}, pd.DataFrame([_E(s=2008, o=80.0, q="new")]), pd.DataFrame()).iloc[0]
        self.assertLess(z.yn, 80.0)


class Positions(unittest.TestCase):
    def test_wing_half_reads_as_winger_for_scorers_and_modern_players(self):
        self.assertEqual(positions.slots(["wing half"], 1922, 0.43), ["LW", "RW"])
        self.assertEqual(positions.slots(["wing half"], 1985, None), ["LW", "RW"])
        self.assertEqual(positions.slots(["forward", "wing half"], 1915, 0.05), ["LW", "RW"])

    def test_wing_half_stays_a_half_back_for_a_rare_scorer_of_the_old_game(self):
        self.assertEqual(positions.slots(["wing half"], 1926, 0.045), ["CDM", "CM"])


class CM(unittest.TestCase):
    def test_record_sizes_follow_the_published_layouts(self):
        self.assertEqual((cm0102.S_ST.size, cm0102.S_PL.size, cm0102.S_SH.size, cm0102.S_NM.size), (110, 70, 17, 60))

    def test_displayed_value_rises_with_ability_for_skill_attributes(self):
        self.assertGreater(cm0102.dv("fin", 15, 180), cm0102.dv("fin", 15, 100))
        self.assertEqual(cm0102.dv("fla", 14, 50), cm0102.dv("fla", 14, 190))

    def test_slot_proficiency_is_capped_by_side(self):
        po = dict(gk=1, sw=1, d=1, dm=1, m=20, am=20, f=10, wb=1)
        ps = engines.pslot(po, dict(l=20, r=5, c=8, fr=1))
        self.assertEqual((ps["LM"], ps["RM"], ps["CM"], ps["LW"]), (20, 5, 8, 20))
        self.assertEqual(engines._nat(ps), ["LM", "LW"])


class Stats(unittest.TestCase):
    def test_card_stats_sum_inside_the_card_seasons_only(self):
        T = pd.DataFrame([dict(p="Q1", q="c", s=2013, ap=30, mi=2500, g=10, a=5),
                          dict(p="Q1", q="c", s=2016, ap=30, mi=2600, g=12, a=4),
                          dict(p="Q1", q="c", s=2021, ap=10, mi=900, g=1, a=0)])
        U = pd.DataFrame([dict(p="Q1", q="c", s=2016, mi=2400, g=12, a=4, xg=10.5, xa=3.2)])
        D = stats.card(T, U)
        self.assertEqual(stats.agg(D, "Q1", "c", 2010, 2019), dict(mi=5100, g=22, a=9, xmi=2400, xg=10.5, xa=3.2))
        self.assertIsNone(stats.agg(D, "Q1", "other", 2010, 2019))


if __name__ == "__main__":
    unittest.main()
