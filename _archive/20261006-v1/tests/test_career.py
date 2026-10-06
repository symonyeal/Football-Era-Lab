"""Exercise career outcomes, account isolation, spending and durable progression."""
import unittest
from copy import deepcopy
from pathlib import Path
import secrets
from collections import Counter
from unittest.mock import patch
import xml.etree.ElementTree as ET
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
        return self.service.call('league/'+path, body)

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
        self.assertEqual(a['result']['away_goals'], a['result']['surrounding']['away_goals']-a['result']['prevented_goals'])
        events = a['result']['events']
        for side in ('home', 'away'):
            self.assertEqual(sum(e['side']==side and e['type']=='Goal' for e in events), a['result'][side+'_goals'])
        progress = self.service.call('progress', {'profile': self.profile})
        self.assertEqual(progress['stats']['runs'], 1)
        self.assertEqual(progress['stats']['goals_for'], a['result']['goals_for'])

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
            if a['round'] == 14:
                fixtures = self.service.store.get('career', token)['fixtures']
                pairs = Counter((f['home'], f['away']) for f in fixtures)
                self.assertEqual(len(fixtures), 56)
                self.assertEqual(set(pairs), {(h,w) for h in range(8) for w in range(8) if h!=w})
                self.assertTrue(all(n==1 for n in pairs.values()))
        self.assertTrue(a['complete'])
        self.assertEqual(a['level'], 20)
        self.assertTrue(any(x['id']=='career-complete' for x in a['earned_awards']))
        self.assertEqual(sum(x['id'].startswith('chapter-') for x in a['earned_awards']), 8)
        self.assertEqual(a['summary']['matches'], a['summary']['wins']+a['summary']['draws']+a['summary']['losses'])
        self.assertLessEqual(self.service.call('progress', {'profile':self.profile})['stats']['runs'], 43)
        self.assertGreater(len(seasons_seen), 1)
        self.assertTrue(a['season_history'])
        for season in a['season_history']:
            self.assertTrue(all(row['played']==14 for row in season['standings']))
        with self.assertRaises(ValueError):
            self.call('next', career_token=token)

    def test_reopen_retains_decision_retries_and_counts_final_match_once(self):
        # Keep the durable test database in the contract's work folder, never temp.
        work = Path(__file__).resolve().parents[4]/'Claude Func Folder'/'football-integration'/'reference'/'career-tests'
        work.mkdir(parents=True, exist_ok=True)
        database = work/('reopen-'+secrets.token_hex(6)+'.sqlite')
        self.service.store.close()
        self.service = GameService(self.players, database)
        self.profile = self.service.call('profile')['profile']
        a = self.create(action_id='create')
        token = a['career_token']
        self.assertEqual(a, self.create(action_id='create'))
        self.call('next', career_token=token, action_id='start')
        first = self.call('action', career_token=token, choice='pass', action_id='first')
        self.service.store.close()
        self.service = GameService(self.players, database)
        self.assertEqual(first, self.call('state', career_token=token))
        self.assertEqual(first, self.call('action', career_token=token, choice='pass', action_id='first'))
        self.assertEqual([token], [c['career_token'] for c in self.call('list')['careers']])
        for i, choice in enumerate(('dribble', 'tackle', 'shoot')):
            last = self.call('action', career_token=token, choice=choice, action_id=f'after-reopen-{i}')
        self.assertEqual(last, self.call('action', career_token=token, choice='shoot', action_id='after-reopen-2'))
        self.assertEqual(self.service.call('progress', {'profile':self.profile})['stats']['runs'], 1)
        self.assertTrue(database.exists())

    def test_malformed_creation_inputs_and_revision_fail_as_validation_errors(self):
        for key, invalid in [('era',{}), ('habit',[]), ('profile',{'forged':1}), ('seed',True), ('name',3)]:
            body = dict(profile=self.profile, name='Bad Player', era='2020s', seed=19)
            body[key] = invalid
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.service.call('league/create', body)
        self.assertEqual(self.call('list')['careers'], [])
        a = self.create()
        token = a['career_token']
        for revision in (False, True, -1, '0', []):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                self.call('next', career_token=token, revision=revision)
            self.assertEqual(a, self.call('state', career_token=token))
        b = self.call('next', career_token=token, revision=a['revision'])
        with self.assertRaises(ValueError):
            self.call('action', career_token=token, choice='pass', revision=a['revision'])
        self.assertEqual(b, self.call('state', career_token=token))

    def test_injury_is_an_action_outcome_and_office_rest_heals_it(self):
        a = self.create()
        token = a['career_token']
        self.call('next', career_token=token)
        with patch('era_eleven.career.random.Random') as random_factory:
            random_factory.return_value.randint.side_effect = [1, 1]
            random_factory.return_value.random.return_value = 0
            a = self.call('action', career_token=token, choice='shoot')
        self.assertEqual(a['injury'], 3)
        self.assertFalse(a['log'][-1]['action']['success'])
        self.assertEqual(a['legs'], 68)
        for _ in range(3):
            a = self.call('action', career_token=token, choice='pass')
        self.assertGreater(a['injury'], 0)
        before = a['credits']
        a = self.call('talk', career_token=token, choice='rest')
        self.assertEqual(a['injury'], 0)
        self.assertEqual(a['legs'], a['max_legs'])
        self.assertEqual(a['credits'], before-6)

    def test_training_affects_shared_engine_and_source_card_is_preserved(self):
        plain = self.create()
        trained = self.create()
        trained = self.call('train', career_token=trained['career_token'], choice='pass')
        for state in (plain, trained):
            self.call('next', career_token=state['career_token'])
        results = []
        for state in (plain, trained):
            for _ in range(4):
                out = self.call('action', career_token=state['career_token'], choice='pass')
            results.append(out['result']['surrounding'])
        self.assertNotEqual(results[0]['home_possession'], results[1]['home_possession'])
        source = next(p for p in self.players if p['id']==plain['basis']['id'])
        saved = self.service.store.get('career', trained['career_token'])
        slot = saved['teams'][0]['starters'][saved['slot_index']]
        self.assertEqual(slot['player'], source)

    def test_office_costs_and_options_do_not_allow_unbounded_money_or_training(self):
        a = self.create()
        token = a['career_token']
        for _ in range(3):
            a = self.call('train', career_token=token, choice='pass')
        self.assertTrue(all(not o['enabled'] for o in a['train_options']))
        with self.assertRaises(ValueError):
            self.call('train', career_token=token, choice='pass')
        a = self.call('talk', career_token=token, choice='agent', action_id='contract')
        self.assertEqual(a, self.call('talk', career_token=token, choice='agent', action_id='contract'))
        with self.assertRaises(ValueError):
            self.call('talk', career_token=token, choice='agent')
        self.assertEqual(a['xp'], 0)
        before = deepcopy(a)
        with self.assertRaises(ValueError):
            self.call('buy', career_token=token, choice='forged-item')
        self.assertEqual(before, self.call('state', career_token=token))

    def test_tackle_prevents_a_goal_in_its_stretch_without_rewriting_earlier_play(self):
        from era_eleven.engine import simulate_match
        a = self.create()
        token = a['career_token']
        saved = self.service.store.get('career', token)
        snapshot = simulate_match(saved['teams'][0], saved['teams'][1], seed=11)
        snapshot.update(home_goals=0, away_goals=2, home_shots=0, away_shots=2,
                        events=[dict(minute=m, side='away', type='Goal', player='Generated rival', xg=.12)
                                for m in (10, 70)])
        with patch('era_eleven.career.simulate_match', return_value=snapshot):
            self.call('next', career_token=token)
        # Controlled successful checks separate timing from die variance.
        for choice, rolls in [('tackle',[20,3,20]), ('dribble',[20,3]),
                              ('tackle',[20,3,20]), ('dribble',[20,3])]:
            with patch('era_eleven.career.random.Random') as random_factory:
                random_factory.return_value.randint.side_effect = rolls
                a = self.call('action', career_token=token, choice=choice)
            if a['stretch'] == 1:
                self.assertFalse(a['log'][-1]['action']['prevented_goal'])
        self.assertEqual(a['result']['prevented_goals'], 1)
        self.assertEqual(a['result']['away_goals'], 1)
        self.assertEqual([e['minute'] for e in a['result']['events'] if e['type']=='Goal'], [10])
        self.assertEqual([e['minute'] for e in a['result']['events'] if e.get('career_prevented')], [70])

    def test_retirement_saves_actual_summary_and_escaped_share_card(self):
        a = self.call('create', name='<Team & Hero>', position='CM', era='2020s', seed=19)
        token = a['career_token']
        a = self.call('retire', career_token=token, action_id='retire')
        self.assertTrue(a['complete'])
        self.assertEqual(a['ending'], 'retired')
        self.assertEqual(a['level'], 1)
        self.assertEqual(a['xp'], 0)
        self.assertEqual(a['summary']['matches'], 0)
        self.assertEqual(a, self.call('retire', career_token=token, action_id='retire'))
        card = self.call('share', career_token=token)
        self.assertEqual(card['summary'], a['summary'])
        root = ET.fromstring(card['svg'])
        self.assertIn('<Team & Hero>', ''.join(root.itertext()))
        self.assertFalse(any('script' in node.tag.lower() for node in root.iter()))
        self.assertTrue(a['earned_awards'])
        self.assertTrue(all(not o['enabled'] for o in a['talk_options']))
        with self.assertRaises(ValueError):
            self.call('next', career_token=token)

    def test_transfer_changes_teammates_and_future_scheduled_club_without_free_retry(self):
        a = self.create()
        token = a['career_token']
        transfer = next(o for o in a['talk_options'] if o['value'].startswith('transfer-') and o['enabled'])
        old_teammates = a['teammates']
        old_basis = deepcopy(a['basis'])
        credits = a['credits']
        with patch('era_eleven.career.random.Random') as random_factory:
            random_factory.return_value.randint.return_value = 20
            a = self.call('talk', career_token=token, choice=transfer['value'], action_id='transfer')
        self.assertEqual(a['club'], int(transfer['value'].split('-')[1]))
        self.assertNotEqual(a['teammates'], old_teammates)
        self.assertEqual(a['basis']['id'], old_basis['id'])
        self.assertEqual(a['credits'], credits-transfer['cost'])
        self.assertEqual(a, self.call('talk', career_token=token, choice=transfer['value'], action_id='transfer'))
        with self.assertRaises(ValueError):
            self.call('talk', career_token=token, choice='transfer-0')
        a = self.call('next', career_token=token)
        for _ in range(4):
            a = self.call('action', career_token=token, choice='pass')
        fixture = next(f for f in self.service.store.get('career', token)['fixtures'] if a['club'] in (f['home'],f['away']))
        goals = (fixture['home_goals'],fixture['away_goals']) if fixture['home']==a['club'] else (fixture['away_goals'],fixture['home_goals'])
        self.assertEqual(goals, (a['result']['goals_for'],a['result']['goals_against']))
        self.assertEqual(a['summary']['matches'], 1)
        self.assertTrue(any(x['id']=='first-fixture' for x in a['earned_awards']))


if __name__ == '__main__':
    unittest.main()
