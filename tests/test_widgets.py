"""Notebook controls must use the same saved game authority as browser routes."""
import json
import unittest
from dataclasses import asdict
from era_eleven.engine import Config
from era_eleven.service import GameService
try:
    from era_eleven.widgets import NotebookModes
except ImportError:
    NotebookModes = None


class WidgetModeTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(NotebookModes, 'Notebook mode controls are missing')
        self.service = GameService(state_path=':memory:')
        self.lab = NotebookModes(service=self.service, seed=17)

    def tearDown(self):
        if hasattr(self, 'service'):
            self.service.store.close()

    def test_draft_controls_match_direct_api_cards_rates_and_results(self):
        self.lab.era.value = '2020s'
        self.lab.config_editor.value = json.dumps(asdict(Config(chemistry_weight=3.5, auto_subs=False)))
        self.lab.start('solo')
        state = self.lab.finish()
        direct = self.service.call('new', dict(era='2020s', mode='solo', seed=17,
                                             config=json.loads(self.lab.config_editor.value)))
        for _ in range(5):
            direct = self.service.call('spin', {'token':direct['token']})
        self.assertEqual(state['squad'], direct['squad'])
        self.assertEqual(state['analytics']['rating'], direct['analytics']['rating'])
        state = self.lab.set_formation(state['formation'])
        direct = self.service.call('formation', {'token':direct['token'], 'formation':direct['formation']})
        keeper = next(p for p in state['bench'] if 'GK' in p['positions'])
        index = next(s['index'] for s in state['starters'] if s['slot']=='GK')
        state = self.lab.swap(index, keeper['id'])
        direct = self.service.call('swap', {'token':direct['token'], 'slot':index, 'bench_id':keeper['id']})
        self.assertEqual(state['analytics']['rating'], direct['analytics']['rating'])
        self.assertEqual(state['starters'], direct['starters'])
        result = self.lab.play()['result']
        expected = self.service.call('match', {'token':direct['token'], 'seed':self.lab.match_seed.value})['result']
        self.assertEqual(result, expected)
        self.assertIn('probabilities', self.lab.repeated())

    def test_buttons_invoke_real_state_and_render_without_credentials(self):
        self.lab.era.value = 'Randomize Era'
        self.lab.new_button.click()
        self.assertNotEqual(self.lab.state['era'], 'Randomize Era')
        self.lab.spin_button.click()
        self.assertEqual(self.lab.state['count'], 3)
        self.lab.fill_button.click()
        self.assertEqual(self.lab.state['count'], 15)
        visible = json.dumps(self.lab.state)+self.lab.status.value+self.lab.board.value+self.lab.progress.value
        self.assertNotIn(self.lab._profile_credential, visible)
        self.assertNotIn(self.lab._run_token, visible)

    def test_campaign_controls_use_authoritative_rules_and_management(self):
        self.lab.era.value = '2020s'
        self.lab.circuit_length.value = 10
        self.lab.start('circuit')
        self.lab.finish()
        circuit = self.lab.advance()
        self.assertEqual(circuit['progress']['event_count'], 10)
        self.assertEqual(circuit['progress']['event'], 1)
        self.lab.start('league')
        self.lab.finish()
        league = self.lab.advance()
        self.assertEqual(league['progress']['round'], 1)
        self.assertEqual(len(league['progress']['standings']), 8)
        self.lab.start('gauntlet')
        self.lab.finish()
        gauntlet = self.lab.advance()
        self.assertTrue(gauntlet['progress']['needs_management'])
        after = self.lab.manage('rest')
        self.assertFalse(after['progress']['needs_management'])

    def test_career_and_two_humans_complete_actual_shared_api_workflows(self):
        state = self.lab.career_create(name='Notebook Player')
        self.assertEqual(state['phase'], 'office')
        self.lab.career_train('pass')
        self.lab.career_next()
        for choice in ('pass','dribble','tackle','shoot'):
            state = self.lab.career_action(choice)
        self.assertEqual(state['phase'], 'office')
        self.assertEqual(state['summary']['matches'], 1)
        self.assertEqual(self.lab.career_retire()['ending'], 'retired')
        room = self.lab.local_create()
        for i in range(10):
            room = self.lab.local_spin(i%2)
        self.assertEqual([s['count'] for s in room['seats']], [15,15])
        self.lab.local_ready(0)
        room = self.lab.local_ready(1)
        self.assertIsNotNone(room['result'])
        visible = json.dumps(room)+self.lab.room_board.value+self.lab.career_board.value
        self.assertNotIn(self.lab._profile_credential, visible)
        for credential in self.lab._room_credentials:
            self.assertNotIn(credential, visible)

    def test_reopening_notebook_controls_resumes_private_session_in_same_store(self):
        self.lab.start('solo')
        self.lab.spin()
        resumed = NotebookModes(service=self.service)
        self.assertEqual(self.lab.state, resumed.state)
        self.assertEqual(self.lab._profile_credential, resumed._profile_credential)
        self.assertNotIn('profile', resumed.state)
        self.assertNotIn('token', resumed.state)

    def test_weekly_controls_show_fixed_server_seed_and_configuration(self):
        self.lab.seed.value = 919
        self.lab.config_editor.value = json.dumps(asdict(Config(base_goals=9)))
        state = self.lab.start('weekly')
        challenge = self.service.weekly()
        self.assertEqual(state['seed'], challenge['seed'])
        self.assertEqual(state['config'], challenge['config'])
        self.assertIn(str(challenge['seed']), self.lab.status.value)
        self.lab.finish()
        result = self.lab.play()
        self.assertTrue(result['progress']['complete'])
        self.assertIn('challenge', result['result'])


if __name__ == '__main__':
    unittest.main()
