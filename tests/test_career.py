"""Exercise career outcomes, account isolation, spending and durable progression."""
import unittest
from copy import deepcopy
from era_eleven.data import load_players
from era_eleven.service import GameService
try:
    from era_eleven.career import career_call
except ImportError:
    career_call = None


class CareerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.players = load_players()

    def setUp(self):
        self.assertIsNotNone(career_call, 'The single-player career mode is missing')
        self.service = GameService(self.players, ':memory:')
        self.profile = self.service.call('profile')['profile']

    def tearDown(self):
        if hasattr(self, 'service'):
            self.service.store.close()

    def call(self, path, **body):
        body.setdefault('profile', self.profile)
        with self.service.lock, self.service.store.connection:
            return deepcopy(career_call(self.service, 'league/'+path, body))

    def create(self, **kw):
        return self.call('create', name='Test Player', position='CM', era='2020s', seed=19, **kw)

    def test_token_is_bound_to_profile_and_persistence_is_authoritative(self):
        a = self.create()
        self.assertEqual(a['phase'], 'office')
        token = a['career_token']
        self.assertEqual(a, self.call('state', career_token=token))
        other = self.service.call('profile')['profile']
        with self.assertRaises(ValueError):
            self.call('state', career_token=token, profile=other)
        with self.assertRaises(ValueError):
            self.call('next', career_token=token, result={'home_goals':100})

    def test_four_decisions_resolve_one_real_fixture_and_duplicate_is_idempotent(self):
        a = self.create()
        token = a['career_token']
        a = self.call('next', career_token=token, action_id='kickoff')
        self.assertEqual(a['phase'], 'match')
        first = self.call('action', career_token=token, choice='pass', action_id='one')
        self.assertEqual(first, self.call('action', career_token=token, choice='pass', action_id='one'))
        with self.assertRaises(ValueError):
            self.call('action', career_token=token, choice='shoot', action_id='one')
        for i, choice in enumerate(['dribble', 'tackle', 'shoot']):
            a = self.call('action', career_token=token, choice=choice, action_id=f'play-{i}')
        self.assertEqual(a['phase'], 'office')
        self.assertEqual(a['round'], 1)
        self.assertGreater(a['xp'], 0)
        self.assertEqual(sum(x['played'] for x in a['standings']), 8)
        self.assertIn('Simulated match', a['result']['surrounding']['label'])
        self.assertEqual(a['result']['seed'], a['result']['surrounding']['seed'])
        self.assertEqual(len(a['result']['career_actions']), 4)
        self.assertEqual(a['result']['home_goals'], a['result']['surrounding']['home_goals']+a['result']['interactive_goals'])

    def test_training_kit_conversations_and_rest_have_costs_and_effects(self):
        a = self.create()
        token = a['career_token']
        start = a['credits']
        a = self.call('train', career_token=token, choice='pass', action_id='training')
        self.assertEqual(a['skills']['pass'], 1)
        self.assertLess(a['credits'], start)
        after = a['credits']
        a = self.call('buy', career_token=token, choice='boots')
        self.assertIn('boots', a['inventory'])
        self.assertLess(a['credits'], after)
        with self.assertRaises(ValueError):
            self.call('buy', career_token=token, choice='boots')
        a = self.call('next', career_token=token)
        with self.assertRaises(ValueError):
            self.call('train', career_token=token, choice='pass')
        for choice in ['pass']*4:
            a = self.call('action', career_token=token, choice=choice)
        self.assertLess(a['legs'], a['max_legs'])
        a = self.call('talk', career_token=token, choice='rest')
        self.assertEqual(a['legs'], a['max_legs'])
        self.assertTrue(a['log'][-1]['message'])
        a = self.call('talk', career_token=token, choice='press')
        self.assertEqual(a['playbook'], 'press')

    def test_action_policy_changes_outcomes_under_identical_seed(self):
        a = self.create()
        b = self.create()
        results = []
        for state, choice in [(a,'shoot'),(b,'tackle')]:
            token = state['career_token']
            self.call('next', career_token=token)
            for _ in range(4):
                out = self.call('action', career_token=token, choice=choice)
            results.append(out)
        self.assertEqual(results[0]['result']['surrounding'], results[1]['result']['surrounding'])
        self.assertNotEqual(results[0]['result']['career_actions'], results[1]['result']['career_actions'])
        self.assertNotEqual(results[0]['legs'], results[1]['legs'])

    def test_invalid_action_is_rejected_before_state_changes(self):
        a = self.create()
        token = a['career_token']
        before = self.call('next', career_token=token)
        with self.assertRaises(ValueError):
            self.call('action', career_token=token, choice='invented')
        self.assertEqual(before, self.call('state', career_token=token))

    def test_career_reaches_level_twenty_without_unbounded_progression(self):
        a = self.create()
        token = a['career_token']
        seasons_seen = set()
        for fixture in range(60):
            if a['complete']:
                break
            if a['legs'] < 35:
                a = self.call('talk', career_token=token, choice='rest')
            seasons_seen.add(a['season'])
            a = self.call('next', career_token=token)
            for _ in range(4):
                a = self.call('action', career_token=token, choice='pass')
            table = a['standings']
            self.assertEqual(sum(x['won'] for x in table), sum(x['lost'] for x in table))
            self.assertEqual(sum(x['goals_for'] for x in table), sum(x['goals_against'] for x in table))
            self.assertTrue(all(x['points']==3*x['won']+x['drawn'] for x in table))
        self.assertTrue(a['complete'])
        self.assertEqual(a['level'], 20)
        self.assertGreater(len(seasons_seen), 1)
        with self.assertRaises(ValueError):
            self.call('next', career_token=token)


if __name__ == '__main__':
    unittest.main()
