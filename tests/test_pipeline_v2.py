"""Regression checks for historical squad membership and rating provenance.

Legend: Q squad rows, P person facts, E FIFA edition rows, L person-to-FIFA links.
"""
import unittest

import pandas as pd

from pipeline import ratings, squads, legends


class Pipeline(unittest.TestCase):
    def test_legend_identity(self):
        I = [dict(name="Diego Milito", o=88, pos=["ST"], kind="hero", nat="Argentina")]
        P = {"Q1": dict(name="Diego Maradona", nat={"AR"}, sl=200),
             "Q2": dict(name="Diego Milito", nat=set(), sl=50)}
        L = legends.match(I, P, {"AR": "Argentina"}, list(P))
        self.assertNotIn("Q1", L)
        self.assertIn("Q2", L)

    def test_shared_first_name_is_not_a_legend_link(self):
        I = [dict(name="Diego Milito", o=88, pos=["ST"], kind="hero", nat="Argentina")]
        P = {"Q1": dict(name="Diego Maradona", nat={"AR"}, sl=200)}
        self.assertEqual(legends.match(I, P, {"AR": "Argentina"}, list(P)), {})

    def test_full_squad(self):
        S = [dict(p=f"Q{i}", a=1991, b=1994, n=80, g=2) for i in range(65)]
        self.assertEqual(len(squads.squads("club", S, {})), 65)

    def test_duplicate_stint(self):
        s = dict(p="Q1", a=1991, b=1994, n=80, g=2)
        q = squads.squads("club", [s, s.copy()], {})
        self.assertEqual(q[0]["n"], 80)
        self.assertEqual(q[0]["g"], 2)

    def test_era_allocation(self):
        s = dict(p="Q1", a=1940, b=1960, n=400, g=100)
        q = squads.squads("club", [s], {})
        self.assertEqual(q[0]["n"], 200)
        self.assertEqual(q[0]["g"], 50)

    def test_club_snapshot(self):
        Q = pd.DataFrame([dict(p="Q1", qid="old", D=2010, s0=2014, s1=2015)])
        E = pd.DataFrame([dict(f=1, s=2014, o=78, pos=["CM"], qid="old"),
                          dict(f=1, s=2015, o=91, pos=["CAM"], qid="new")])
        q = ratings.fifa_y(Q, {"Q1": {"dob": "1988-01-01"}}, {"Q1": 1}, E)
        self.assertEqual(q.iloc[0].y, 78)

    def test_other_club_has_no_measured_rating(self):
        Q = pd.DataFrame([dict(p="Q1", qid="old", D=2010, s0=2014, s1=2015)])
        E = pd.DataFrame([dict(f=1, s=2014, o=91, pos=["CM"], qid="new")])
        q = ratings.fifa_y(Q, {"Q1": {"dob": "1988-01-01"}}, {"Q1": 1}, E)
        self.assertTrue(pd.isna(q.iloc[0].y))


if __name__ == "__main__":
    unittest.main()
