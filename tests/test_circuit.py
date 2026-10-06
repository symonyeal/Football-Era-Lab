import unittest
from era_eleven.service import GameService
from era_eleven.data import load_players


class CircuitTests(unittest.TestCase):
    def test_league_sprint_has_full_four_club_table(self):
        s=GameService(state_path=':memory:')
        try:
            state=s.call('new',dict(mode='circuit',seed=9,tournaments=10))
            for _ in range(5):state=s.call('spin',dict(token=state['token']))
            out=s.call('advance',dict(token=state['token']))
            table=out['progress']['history'][0]['standings']
            self.assertEqual(len(table),4)
            self.assertEqual([r['played'] for r in table],[6,6,6,6])
            self.assertEqual(sum(r['won'] for r in table),sum(r['lost'] for r in table))
            self.assertEqual(sum(r['goals_for'] for r in table),sum(r['goals_against'] for r in table))
            self.assertTrue(all(r['points']==3*r['won']+r['drawn'] for r in table))
        finally:s.store.close()

    def test_ten_tournaments_earn_results_and_awards_without_changing_fifteen_people(self):
        s=GameService(load_players(),':memory:')
        try:
            p=s.call('profile',{})['profile']
            g=s.call('new',dict(profile=p,mode='circuit',era='2020s',seed=9,tournaments=10))
            for _ in range(5):g=s.call('spin',dict(token=g['token']))
            squad=g['squad'];formats=set()
            for i in range(10):
                out=s.call('advance',dict(token=g['token'],action_id=f'event-{i}'))
                formats.add(out['progress']['format'])
                self.assertEqual(out['state']['squad'],squad)
                self.assertEqual(len(out['progress']['history']),i+1)
            self.assertGreaterEqual(len(formats),4)
            self.assertTrue(out['progress']['complete'])
            self.assertTrue(out['progress']['awards'])
            self.assertTrue(all(a['evidence']=='simulated match events' for a in out['progress']['awards']))
            with self.assertRaises(ValueError):s.call('advance',dict(token=g['token']))
        finally:s.store.close()

    def test_circuit_rejects_lengths_outside_ten_to_twenty(self):
        s=GameService(load_players(),':memory:')
        try:
            for length in [9,21,10.5,True]:
                with self.assertRaises(ValueError):s.call('new',dict(mode='circuit',tournaments=length))
        finally:s.store.close()
