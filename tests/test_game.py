import unittest
import numpy as np

try:
    from era_eleven.engine import DraftGame, Config, assign_lineup, rate_team, simulate_match, simulate_series, swap_player, FORMATIONS, MANAGERS
    from era_eleven.data import load_players, validate_players, import_ea_csv, import_pes_csv
except ImportError:
    DraftGame = None


class GameTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(DraftGame, 'The football engine has not been implemented')
        self.players=load_players()

    def test_five_spins_award_three_then_stop(self):
        g=DraftGame(self.players,era='All eras',seed=19)
        for n in range(5):
            self.assertEqual(len(g.spin()),3)
            self.assertEqual(len(g.squad),(n+1)*3)
        self.assertTrue(g.complete)
        self.assertEqual(len({p['identity'] for p in g.squad}),15)
        before=[p['id'] for p in g.squad]
        with self.assertRaises(ValueError):g.spin()
        self.assertEqual(before,[p['id'] for p in g.squad])

    def test_each_playable_era_completes_with_keeper_and_four_subs(self):
        for era in ['Legends','1990s','2000s','2010s','2020s','All eras']:
            for seed in range(10):
                g=DraftGame(self.players,era=era,seed=seed)
                for _ in range(5):g.spin()
                team=g.lineup()
                self.assertEqual(len(team['starters']),11)
                self.assertEqual(len(team['bench']),4)
                self.assertEqual(team['starters'][0]['slot'],'GK')
                self.assertIn('GK',team['starters'][0]['player']['positions'])
                self.assertTrue(all(s['fit']>=.85 for s in team['starters']))
                self.assertIn(team['formation'],g.manager['formations'])

    def test_seed_replays_manager_and_draft(self):
        a=DraftGame(self.players,seed=71)
        b=DraftGame(list(reversed(self.players)),seed=71)
        self.assertEqual(a.manager,b.manager)
        for _ in range(5):self.assertEqual([p['id'] for p in a.spin()],[p['id'] for p in b.spin()])

    def test_bad_pool_is_rejected_before_spin(self):
        with self.assertRaises(ValueError):DraftGame([p for p in self.players if 'GK' not in p['positions']],seed=1)
        with self.assertRaises(ValueError):DraftGame(self.players,era='2030s',seed=1)

    def test_swap_changes_eleven_without_creating_duplicate(self):
        g=DraftGame(self.players,seed=2)
        for _ in range(5):g.spin()
        team=g.lineup()
        sub=next(p for p in team['bench'] if 'GK' in p['positions'])
        out=team['starters'][0]['player']['id']
        changed=swap_player(team,0,sub['id'])
        self.assertEqual(changed['starters'][0]['player']['id'],sub['id'])
        self.assertIn(out,[p['id'] for p in changed['bench']])
        ids=[s['player']['id'] for s in changed['starters']]+[p['id'] for p in changed['bench']]
        self.assertEqual(len(set(ids)),15)
        self.assertEqual(team['starters'][0]['player']['id'],out)

    def test_goalkeeper_cannot_swap_into_striker(self):
        g=DraftGame(self.players,seed=2)
        for _ in range(5):g.spin()
        t=g.lineup()
        gk=next(p for p in t['bench'] if 'GK' in p['positions'])
        slot=next(i for i,s in enumerate(t['starters']) if s['slot']=='ST')
        with self.assertRaises(ValueError):swap_player(t,slot,gk['id'])

    def test_simulation_seed_and_sample_size(self):
        g=DraftGame(self.players,seed=5)
        for _ in range(5):g.spin()
        t=g.lineup()
        a=simulate_match(t,t,seed=99)
        self.assertEqual(a,simulate_match(t,t,seed=99))
        self.assertEqual(a['home_goals'],sum(e['type']=='Goal' and e['side']=='home' for e in a['events']))
        self.assertEqual(a['away_goals'],sum(e['type']=='Goal' and e['side']=='away' for e in a['events']))
        sample=simulate_series(t,t,n=2000,seed=9,home_advantage=0)
        self.assertEqual(sample['wins']+sample['draws']+sample['losses'],2000)
        self.assertAlmostEqual(sum(sample['probabilities'].values()),1)
        self.assertLess(abs(sample['wins']-sample['losses'])/2000,.06)
        self.assertEqual(sample,simulate_series(t,t,n=2000,seed=9,home_advantage=0))

    def test_invalid_config_is_rejected(self):
        for kwargs in [{'base_goals':-1},{'chemistry_weight':-2},{'temperature':float('nan')},{'min_fit':2}]:
            with self.assertRaises(ValueError):Config(**kwargs)

    def test_invalid_ratings_are_rejected(self):
        p=dict(self.players[0])
        p['overall']=float('nan')
        with self.assertRaises(ValueError):validate_players([p])
        p=dict(self.players[0]);p['positions']=['BANANA']
        with self.assertRaises(ValueError):validate_players([p])

if __name__=='__main__':unittest.main()
