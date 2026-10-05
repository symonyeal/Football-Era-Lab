"""Check the installed adapter, event semantics and evaluation split."""
from copy import deepcopy
from itertools import product
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from era_eleven import analytics as an
from era_eleven.data import load_players
from era_eleven.engine import Config, DraftGame, match_rates, simulate_match


def team(seed):
    game = DraftGame(load_players(), seed=seed)
    for _ in range(5):
        game.spin()
    return game.lineup()


def actions():
    rows = [
        (1, 1, 1000, 11, 1, 'pass', 20., 40., 80., 40., True, 1),
        (1, 1, 2000, 12, 1, 'carry', 80., 40., 110., 40., True, 1),
        (1, 1, 3000, 12, 1, 'shot', 110., 40., 120., 40., True, 1),
        (1, 1, 4000, 11, 1, 'pass', 20., 40., 80., 40., False, 2),
        (1, 2, 2701000, 21, 2, 'pass', 20., 40., 80., 40., True, 3),
        (1, 2, 2702000, 22, 2, 'shot', 80., 40., 120., 40., False, 3),
    ]
    return pd.DataFrame(rows, columns=['match_id', 'period', 'timestamp_ms', 'player_id', 'team_id',
                                      'action_type', 'x_start', 'y_start', 'x_end', 'y_end', 'outcome', 'possession'])


class RateTests(unittest.TestCase):
    def test_rate_mapping_is_binary_identical_on_representative_grid(self):
        self.assertIsNotNone(an._scoring_class(), 'Install requirements-analytics.txt to check the fas path.')
        cfg = Config()
        for values in product((30., 75., 99.), repeat=6):
            h = dict(zip(('attack', 'control', 'defence'), values[:3]))
            a = dict(zip(('attack', 'control', 'defence'), values[3:]))
            for advantage, duration in ((-.5, 30), (0., 60), (.5, 90)):
                lh = (h['attack']-a['defence'])/cfg.role_scale+.25*(h['control']-a['control'])/cfg.role_scale+advantage
                la = (a['attack']-h['defence'])/cfg.role_scale+.25*(a['control']-h['control'])/cfg.role_scale
                original = tuple(float(cfg.base_goals*np.exp(np.clip(v, -1.5, 1.5))*duration/90) for v in (lh, la))
                actual = an.expected_rates(h, a, cfg, advantage=advantage, duration=duration)
                self.assertEqual([v.hex() for v in original], [v.hex() for v in actual])

    def test_upstream_expected_goals_affects_game_rates(self):
        cls = an._scoring_class()
        self.assertIsNotNone(cls)
        h = dict(attack=80, control=80, defence=80)
        with patch.object(cls, 'expected_goals', return_value=(2., 3.)) as method:
            self.assertEqual(an.expected_rates(h, h, Config(), advantage=0), (2.7, 4.050000000000001))
            method.assert_called_once_with(0, 1)

    def test_offline_rates_keep_formula(self):
        h = dict(attack=90, control=84, defence=80)
        a = dict(attack=72, control=70, defence=75)
        installed = an.expected_rates(h, a, Config())
        with patch.object(an, '_scoring_class', return_value=None):
            self.assertEqual(installed, an.expected_rates(h, a, Config()))
            self.assertFalse(an.backend_status()['available'])
            self.assertEqual(an.backend_status()['backend'], 'offline fallback')

    def test_status_identifies_audited_module_and_unfitted_model(self):
        status = an.backend_status()
        self.assertEqual(status['backend'], 'fas')
        self.assertTrue(status['scoring_module_matches_audit'])
        self.assertFalse(status['trained'])

    def test_invalid_rates_are_rejected(self):
        h = dict(attack=80, control=80, defence=80)
        for kwargs in ({'duration': 100}, {'duration': float('nan')}, {'advantage': 2}):
            with self.assertRaises(ValueError):
                an.expected_rates(h, h, Config(), **kwargs)


class EntityTests(unittest.TestCase):
    def test_cards_share_person_identity_without_invented_statistics(self):
        card = load_players()[0]
        another = dict(card, id=card['id']+'-edition-2', season='Other edition')
        p = an.player_record(card); q = an.player_record(another)
        self.assertEqual(p.player_uid, q.player_uid)
        self.assertEqual(p.minutes, 0)
        self.assertTrue(p.features_90.empty)
        self.assertFalse(p.performance['event_measurements_available'])
        self.assertNotEqual(an.entity_uid('same-name-person-1'), an.entity_uid('same-name-person-2'))

    def test_team_record_preserves_actual_manager_roles_and_bench(self):
        t = team(2)
        record = an.team_record(t)
        self.assertEqual(len(record.squad), 15)
        self.assertEqual(record.performance['game_context']['formation'], t['formation'])
        self.assertEqual(record.performance['game_context']['manager'], t['manager'])
        self.assertEqual(len(record.performance['game_context']['bench_card_ids']), 4)

    def test_matchup_uses_match_engine_rates_and_normalized_probabilities(self):
        h = team(2); a = team(3)
        expected = match_rates(h, a)
        result = an.matchup_analysis(h, a)
        self.assertEqual(result['expected_home_goals'], expected['home_xg'])
        self.assertEqual(result['expected_away_goals'], expected['away_xg'])
        self.assertAlmostEqual(sum(result['probabilities'].values()), 1)
        self.assertGreaterEqual(result['tail_probability'], 0)
        self.assertFalse(result['trained'])

    def test_matchup_and_simulated_match_map_without_spatial_fabrication(self):
        h = team(2); a = team(3)
        matchup = an.matchup_record(h, a)
        self.assertAlmostEqual(matchup.predicted_distribution['prob'].sum(), 1)
        result = simulate_match(h, a, seed=19)
        match = an.simulated_match_record(result, h, a)
        self.assertTrue(match.actions.empty)
        self.assertFalse(match.meta.extra['spatial_actions_available'])
        self.assertEqual(match.meta.home_goals, result['home_goals'])
        self.assertEqual(match.meta.extra['evidence'], 'simulated statistics')


class EventTests(unittest.TestCase):
    def test_goal_conversion_preserves_nested_outcome(self):
        raw = [dict(type={'name': 'Shot'}, location=[110, 40], minute=1, second=0,
                    player={'id': 12}, team={'id': 1}, shot={'outcome': {'name': 'Goal'}, 'end_location': [120, 40]})]
        out = an.canonical_actions(raw, match_id=7)
        self.assertTrue(out.iloc[0]['outcome'])
        self.assertEqual(out.iloc[0]['player_id'], 12)

    def test_strict_schema_rejects_false_strings_missing_start_and_bad_end(self):
        for column, value in (('outcome', 'False'), ('x_start', float('nan')), ('x_end', 140.)):
            frame = actions().astype({'outcome': object})
            frame.loc[0, column] = value
            with self.assertRaises(ValueError):
                an.canonical_actions(frame)

    def test_event_models_measure_supplied_fixture_and_keep_label(self):
        result = an.analyse_events(actions(), evidence='synthetic unit-test fixture', grid=(4, 2))
        self.assertEqual(result['evidence'], 'synthetic unit-test fixture')
        self.assertFalse(result['affects_gameplay'])
        self.assertEqual(result['match'].match_id, 1)
        self.assertGreater(result['xt_model'].grid.max(), 0)
        summary = result['summary'].set_index('team_id')
        self.assertEqual(summary.loc[1, 'progressive_moves'], 2)
        self.assertEqual(summary.loc[1, 'inferred_pass_links'], 1)
        self.assertTrue(np.isfinite(result['role_model'].memberships.to_numpy()).all())

    def test_receiver_inference_never_crosses_possession_or_period(self):
        frame = actions().iloc[:2].copy()
        frame.loc[1, 'possession'] = 2
        result = an.analyse_events(frame, grid=(2, 1))
        self.assertEqual(result['summary'].iloc[0]['inferred_pass_links'], 0)
        frame.loc[1, 'possession'] = 1
        frame.loc[1, 'period'] = 2
        result = an.analyse_events(frame, grid=(2, 1))
        self.assertEqual(result['summary'].iloc[0]['inferred_pass_links'], 0)

    def test_shootout_goals_do_not_enter_match_play_xt(self):
        frame = actions()
        shootout = frame.iloc[[2]].copy()
        shootout['period'] = 5
        result = an.analyse_events(pd.concat([frame, shootout], ignore_index=True), grid=(4, 2))
        self.assertEqual(result['shootout_rows_excluded'], 1)
        self.assertEqual(len(result['match'].actions), len(frame))
        with self.assertRaisesRegex(ValueError, 'Shootout events are excluded'):
            an.analyse_events(shootout, grid=(4, 2))


class EvaluationTests(unittest.TestCase):
    def matches(self):
        return pd.DataFrame([dict(date=f'2020-01-0{i+1}', home_team=1 if i % 2 == 0 else 2,
                                 away_team=2 if i % 2 == 0 else 1, home_goals=i % 3, away_goals=(i+1) % 2)
                             for i in range(8)])

    def test_evaluation_uses_strict_time_split_and_training_only_fit(self):
        matches = self.matches()
        first = an.evaluate_results(matches, split_date='2020-01-05')
        matches.loc[4:, 'home_goals'] = 9
        second = an.evaluate_results(matches, split_date='2020-01-05')
        pd.testing.assert_series_equal(first['model'].attack, second['model'].attack)
        pd.testing.assert_series_equal(first['model'].defense, second['model'].defense)
        self.assertEqual(first['training_matches'], 4)
        self.assertEqual(first['evaluation_matches'], 4)
        self.assertEqual(set(first['metrics']['model']), {'fas time-split Poisson', 'training mean baseline'})
        self.assertFalse(first['affects_gameplay'])

    def test_unseen_evaluation_team_is_rejected(self):
        frame = self.matches()
        frame.loc[7, 'home_team'] = 3
        with self.assertRaisesRegex(ValueError, 'unseen teams'):
            an.evaluate_results(frame, split_date='2020-01-05')


if __name__ == '__main__':
    unittest.main()
