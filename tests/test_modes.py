"""Exercise durable game rules through the same service used by HTTP."""
import unittest
from era_eleven.data import load_players
try:
    from era_eleven.service import GameService
except ImportError:
    GameService = None


class ModeTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(GameService, 'Persistent modes are missing')
        self.s = GameService(load_players(), ':memory:')
        self.profile = self.s.call('profile', {})['profile']

    def tearDown(self):
        if hasattr(self, 's'):
            self.s.store.close()

    def new(self, mode='solo', **kw):
        return self.s.call('new', dict(profile=self.profile, mode=mode, era='2020s', seed=17, **kw))

    def finish(self, state):
        for _ in range(5):
            state = self.s.call('spin', dict(token=state['token']))
        self.assertEqual(state['count'], 15)
        return state

    def test_random_era_is_saved_and_is_not_a_mixed_pool(self):
        a = self.s.call('new', dict(profile=self.profile, era='Randomize Era', seed=18))
        self.assertNotEqual(a['era'], 'All eras')
        self.assertEqual(a['requested_era'], 'Randomize Era')
        self.assertEqual(a['era'], self.s.call('state', dict(token=a['token']))['era'])
        for _ in range(5):
            a = self.s.call('spin', dict(token=a['token']))
        if a['era'] != 'Legends':
            self.assertTrue(all(p['era'] == a['era'] for p in a['squad']))

    def test_duplicate_spin_does_not_award_six_players(self):
        a = self.new()
        request = dict(token=a['token'], action_id='spin-one')
        first = self.s.call('spin', request)
        retry = self.s.call('spin', request)
        self.assertEqual(first['squad'], retry['squad'])
        self.assertEqual(retry['count'], 3)

    def test_profile_counts_one_run_and_retains_collected_cards(self):
        a = self.finish(self.new())
        req = dict(token=a['token'], seed=2026)
        r = self.s.call('match', req)
        self.assertEqual(r['result'], self.s.call('match', req)['result'])
        p = self.s.call('progress', dict(profile=self.profile))
        self.assertEqual(p['stats']['runs'], 1)
        self.assertEqual(len(p['collection']), 15)
        self.assertTrue(any(x['earned'] for x in p['achievements']))

    def test_import_replays_draft_and_rejects_forged_cards(self):
        a = self.finish(self.new())
        payload = self.s.call('export', dict(token=a['token']))
        b = self.s.call('import', dict(profile=self.profile, payload=payload))
        self.assertEqual(a['squad'], b['squad'])
        payload['awards'][0] = 'nonexistent-card'
        with self.assertRaises(ValueError):
            self.s.call('import', dict(profile=self.profile, payload=payload))

    def test_weekly_conditions_ignore_client_seed_and_configuration(self):
        a = self.new('weekly')
        b = self.s.call('new', dict(profile=self.profile, mode='weekly', seed=999, config={'base_goals':9}))
        self.assertEqual(a['seed'], b['seed'])
        self.assertEqual(a['era'], b['era'])
        self.assertEqual(a['version'], b['version'])
        self.assertEqual(self.finish(a)['squad'], self.finish(b)['squad'])

    def test_gauntlet_is_progression_and_stops_on_elimination_or_completion(self):
        a = self.finish(self.new('gauntlet'))
        for _ in range(100):
            out = self.s.call('advance', dict(token=a['token']))
            if out['progress']['complete']:
                break
            if out['progress'].get('needs_management'):
                self.s.call('manage', dict(token=a['token'],action='rest'))
        else:
            self.fail('Gauntlet has no finite completion condition')
        with self.assertRaises(ValueError):
            self.s.call('advance', dict(token=a['token']))
        self.assertIn(out['progress']['status'], ['eliminated', 'champion'])

    def test_league_has_schedule_and_reconciled_standings(self):
        a = self.finish(self.new('league'))
        while True:
            out = self.s.call('advance', dict(token=a['token']))
            if out['progress']['complete']:
                break
        table = out['progress']['standings']
        self.assertTrue(all(x['played'] > 0 for x in table))
        self.assertEqual(sum(x['won'] for x in table), sum(x['lost'] for x in table))
        self.assertEqual(sum(x['goals_for'] for x in table), sum(x['goals_against'] for x in table))
        self.assertTrue(all(x['points'] == 3*x['won']+x['drawn'] for x in table))


class RoomTests(unittest.TestCase):
    setUp = ModeTests.setUp
    tearDown = ModeTests.tearDown
    def test_two_humans_shared_pool_turns_reconnect_and_authoritative_result(self):
        host = self.s.call('room/create', dict(profile=self.profile, era='2020s', seed=12, pool_policy='shared-exclusive'))
        guest_profile = self.s.call('profile', {})['profile']
        guest = self.s.call('room/join', dict(room=host['room'], profile=guest_profile))
        creds = [host['credential'], guest['credential']]
        with self.assertRaises(ValueError):
            self.s.call('room/spin', dict(room=host['room'], credential=creds[1], action_id='wrong-turn'))
        view = self.s.call('room/start', dict(room=host['room'], credential=creds[0], action_id='start'))
        for i in range(10):
            seat = i % 2
            request = dict(room=host['room'], credential=creds[seat], action_id=f'spin-{i}', revision=view['revision'])
            view = self.s.call('room/spin', request)
            self.assertEqual(view['revision'], self.s.call('room/spin', request)['revision'])
        self.assertEqual([x['count'] for x in view['seats']], [15, 15])
        self.assertEqual(len({p['identity'] for x in view['seats'] for p in x['squad']}), 30)
        for seat in range(2):
            view = self.s.call('room/ready', dict(room=host['room'], credential=creds[seat], action_id=f'ready-{seat}'))
        self.assertIsNotNone(view['result'])
        self.assertEqual(view['result'], self.s.call('room/state', dict(room=host['room'], credential=creds[0]))['result'])
        with self.assertRaises(ValueError):
            self.s.call('room/ready', dict(room=host['room'], credential=creds[0], roster=['fake']))

    def test_room_credentials_cannot_mutate_other_room(self):
        a = self.s.call('room/create', dict(profile=self.profile, era='2020s', seed=3))
        b = self.s.call('room/create', dict(profile=self.profile, era='2020s', seed=3))
        with self.assertRaises(ValueError):
            self.s.call('room/spin', dict(room=b['room'], credential=a['credential'], action_id='intrusion'))
        self.assertEqual(self.s.call('room/state', dict(room=b['room'], credential=b['credential']))['seats'][0]['count'], 0)
