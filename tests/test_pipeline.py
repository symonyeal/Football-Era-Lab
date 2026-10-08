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

    def test_other_club_ea_snapshot_inside_a_long_spell_is_nearby(self):
        Q = pd.DataFrame([dict(p="Q1", qid="old", D=2010, s0=2010, s1=2019)])
        q = ratings.engine_y(Q, self.P, {"Q1": 1}, pd.DataFrame([_E(o=80.0, q="new")]), pd.DataFrame()).iloc[0]
        self.assertTrue(pd.isna(q.y))
        self.assertEqual(q.yn, 80.0)

    def test_other_club_cm_snapshot_inside_a_long_spell_is_nearby(self):
        Q = pd.DataFrame([dict(p="Q1", qid="old", D=2010, s0=2010, s1=2019)])
        R = pd.DataFrame([dict(p="Q1", s=2014, q="new", r=84.0, sr=SR, a6=None, g6=None, pos=["ST"])])
        q = ratings.engine_y(Q, self.P, {"Q1": 1}, pd.DataFrame([_E(s=2000)]), R).iloc[0]
        self.assertTrue(pd.isna(q.yc))
        self.assertEqual(q.ym, 84.0)

    def test_snapshot_inside_the_spell_precedes_a_nearby_outside_snapshot(self):
        Q = pd.DataFrame([dict(p="Q1", qid="old", D=2010, s0=2010, s1=2019)])
        E = pd.DataFrame([_E(s=2009, o=90.0, q="new"), _E(o=80.0, q="new")])
        q = ratings.engine_y(Q, self.P, {"Q1": 1}, E, pd.DataFrame()).iloc[0]
        self.assertEqual(q.yn, 80.0)
        self.assertEqual(q.pn["o"], 80.0)

    def test_nearby_snapshots_stop_at_two_seasons_outside_the_spell(self):
        for s, want in [(2012, 80.8), (2017, 80.0), (2011, None), (2018, None)]:
            with self.subTest(season=s):
                q = self.run_([_E(s=s, o=80.0, q="new")], [])
                if want is None:
                    self.assertTrue(pd.isna(q.yn))
                    self.assertIsNone(q.pn)
                else:
                    self.assertAlmostEqual(q.yn, want)

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


class ClubSelection(unittest.TestCase):
    def test_each_big_five_league_contributes_its_top_twenty(self):
        from pipeline import universe
        C = pd.DataFrame([
            dict(lg=lg, D=1990, id=f"{lg}{i}", club=f"Club {i}", n=5,
                 ppg=2 - i / 100, t=0, e=0, z=2 - i / 100, q=25 - i)
            for lg in ("ENG", "ESP", "ITA", "GER", "FRA") for i in range(25)
        ])
        E = pd.DataFrame(columns=["D", "id", "cc", "e", "club"])
        U = universe.pick(C, E)
        self.assertEqual(len(U), 100)
        for lg in ("ENG", "ESP", "ITA", "GER", "FRA"):
            self.assertEqual(set(U.loc[U.lg == lg, "id"]), {f"{lg}{i}" for i in range(20)})

    def test_missing_historical_teams_are_not_invented_to_fill_twenty(self):
        from pipeline import universe
        C = pd.DataFrame([
            dict(lg="GER", D=1960, id=f"Q{i}", club=f"Club {i}", n=3,
                 ppg=1.5, t=0, e=0, z=0, q=20 - i) for i in range(18)
        ])
        E = pd.DataFrame(columns=["D", "id", "cc", "e", "club"])
        U = universe.pick(C, E)
        self.assertEqual(set(U.id), {f"Q{i}" for i in range(18)})

    def test_an_unresolved_top_twenty_club_does_not_promote_rank_twenty_one(self):
        from pipeline import universe
        C = pd.DataFrame([
            dict(lg="ENG", D=1990, id="nm:Unresolved" if i == 2 else f"Q{i}",
                 club=f"Club {i}", n=5, ppg=1.5, t=0, e=0, z=0, q=25-i)
            for i in range(25)
        ])
        E = pd.DataFrame(columns=["D", "id", "cc", "e", "club"])
        U = universe.pick(C, E)
        self.assertEqual(set(U.id), {f"Q{i}" for i in range(20) if i != 2})


class CachedFacts(unittest.TestCase):
    def test_person_queries_skip_ineligible_stints_but_keep_possible_notable_players(self):
        from pipeline import build
        ST = {"club": [dict(p="Q1", a=1991, b=1994, n=9, g=0),
                        dict(p="Q2", a=1991, b=1992, n=None, g=None),
                        dict(p="Q3", a=1991, b=1993, n=None, g=None),
                        dict(p="Q4", a=1991, b=1992, n=6, g=0),
                        dict(p="Q4", a=1992, b=1993, n=6, g=0)]}
        self.assertEqual(build.pp(ST, {("club", 1990)}), {"Q3", "Q4"})

    def test_expanding_squads_fetches_only_new_people_and_keeps_known_facts(self):
        from pipeline import build
        requested = []
        def read_people(ids):
            requested.append(set(ids))
            return {"Q2": {"name": "New player"}}
        old = {"Q1": {"name": "Known player", "dob": "1980-01-01"}}
        P = build.ex(old, {"Q1", "Q2"}, read_people)
        self.assertEqual(requested, [{"Q2"}])
        self.assertEqual(P, {"Q1": {"name": "Known player", "dob": "1980-01-01"},
                             "Q2": {"name": "New player"}})
        build.ex(P, {"Q1", "Q2"}, read_people)
        self.assertEqual(requested, [{"Q2"}])


class Leagues(unittest.TestCase):
    """Season tables of the club career, from synthetic result rows (no files read)."""

    @staticmethod
    def T(rows):
        return pd.DataFrame(rows, columns=["lg", "s", "club", "W", "Dr", "L", "GF", "GA"])

    def test_a_club_renamed_during_a_season_is_one_club(self):
        from pipeline import leagues
        T = self.T([("FRA", 1981, "Stade Brest", 8, 8, 6, 30, 28), ("FRA", 1981, "Brest Armorique FC", 6, 2, 8, 20, 25),
                    ("FRA", 1981, "Nantes", 20, 10, 8, 60, 30)])
        S = leagues.table(T, {("Stade Brest", "FRA"): "Q1", ("Brest Armorique FC", "FRA"): "Q1"})["FRA"]["S"]["1981"]
        self.assertEqual([r[0] for r in S], ["nm:Nantes", "Q1"])
        self.assertEqual(S[1][2:], [38, 14, 10, 14, 50, 53])

    def test_points_follow_the_season_rule_and_order_breaks_ties_by_goal_difference(self):
        from pipeline import leagues
        T = self.T([("ENG", 1980, "A", 20, 10, 12, 60, 40), ("ENG", 1980, "B", 20, 10, 12, 70, 40),
                    ("ENG", 1981, "A", 20, 10, 12, 60, 40)])
        L = leagues.table(T, {})["ENG"]
        self.assertEqual([(r[0], r[1]) for r in L["S"]["1980"]], [("nm:B", 50), ("nm:A", 50)])
        self.assertEqual(L["S"]["1981"][0][1], 70)

    def test_curated_gap_rows_fill_a_missing_season_and_archive_names_resolve(self):
        from pipeline import leagues
        G0 = self.T([("ENG", 2022, "Arsenal", 26, 6, 6, 88, 43)])
        L = leagues.table(self.T([]), {}, G0, {("arsenal", "ENG"): "Q9617"})
        self.assertEqual(L["ENG"]["S"]["2022"], [["Q9617", 84, 38, 26, 6, 6, 88, 43]])

    def test_partial_records_below_three_quarters_of_a_season_are_dropped(self):
        from pipeline import leagues
        T = self.T([("ITA", 1950, "A", 20, 10, 8, 60, 30), ("ITA", 1950, "B", 2, 1, 2, 5, 6)])
        self.assertEqual([r[0] for r in leagues.table(T, {})["ITA"]["S"]["1950"]], ["nm:A"])

    def test_european_cup_records_join_curated_late_seasons_and_name_outsiders(self):
        from pipeline import leagues
        E = pd.DataFrame([(1960, "Benfica", "POR", 6.0), (1960, "Barcelona", "ESP", 4.0), (2017, "Old", "ESP", 1.0)],
                         columns=["s", "club", "cc", "e"])
        late = pd.DataFrame([(2017, "Real Madrid", "Q8682", "ESP", 6)], columns=["s", "club", "qid", "cc", "e"])
        M = {("Benfica", "POR"): "Q131499", ("Barcelona", "ESP"): "Q7156"}
        C = leagues.cups(E, M, late)
        self.assertEqual(C["1960"], [["Q131499", "POR", 6.0], ["Q7156", "ESP", 4.0]])
        self.assertEqual(C["2017"], [["Q8682", "ESP", 6.0]])
        X = leagues.names({"ESP": {"S": {"1960": [["Q7156"], ["Q99"], ["nm:Other"]]}}}, C, {"Q7156": {}},
                          {("Rayo", "ESP"): "Q99", **M})
        self.assertEqual(X, {"Q131499": "Benfica", "Q8682": "Q8682", "Q99": "Rayo"})


if __name__ == "__main__":
    unittest.main()
