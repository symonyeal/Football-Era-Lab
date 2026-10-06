"""Check actual quiz rules and authoritative daily progress."""
import unittest
from era_eleven.service import GameService


class MiniTests(unittest.TestCase):
    def setUp(self):
        self.s=GameService(state_path=':memory:')
        self.p=self.s.call('profile',{})['profile']

    def tearDown(self):self.s.store.close()

    def start(self,kind):return self.s.call('mini/start',dict(profile=self.p,kind=kind,daily=True,day='2026-10-06'))

    def answer(self,game,answer,action='answer-1'):
        return self.s.call('mini/answer',dict(profile=self.p,mini_token=game['mini_token'],answer=answer,action_id=action))

    def test_daily_card_fifteen_attempts_feedback_and_daily_resume(self):
        g=self.start('daily_card')
        self.assertEqual(g['total'],15)
        for i in range(15):g=self.answer(g,'No Such Player',str(i))
        self.assertTrue(g['complete'])
        self.assertEqual(g['attempts'],15)
        resumed=self.start('daily_card')
        self.assertEqual(resumed['mini_token'],g['mini_token'])
        self.assertIn('Target:',resumed['explanation'])
        self.assertEqual(resumed['explanation'],g['explanation'])

    def test_era_quiz_does_not_reveal_answer_until_submission(self):
        g=self.start('guess_era')
        from era_eleven.mini import question
        _,right=question(self.s,self.s.store.get('mini',g['mini_token']))
        self.assertNotIn(': '+right+';',g['explanation'])
        g=self.answer(g,right)
        self.assertIn(': '+right+';',g['feedback'][0]['value'])

    def test_higher_lower_hides_queried_rating_and_stops_after_first_mistake(self):
        g=self.start('higher_lower')
        self.assertEqual(g['total'],15)
        self.assertNotIn('overall',g['card_html'].lower())
        stored=self.s.store.get('mini',g['mini_token'])
        from era_eleven.mini import question
        _,right=question(self.s,stored)
        wrong='higher' if right=='lower' else 'lower'
        g=self.answer(g,wrong)
        self.assertTrue(g['complete'])
        self.assertEqual(g['score'],0)
        self.assertTrue(g['feedback'])

    def test_duplicate_answers_and_other_profiles_cannot_change_game(self):
        g=self.start('daily_card')
        result=self.answer(g,'No Such Player')
        self.assertEqual(result,self.answer(g,'No Such Player'))
        other=self.s.call('profile',{})['profile']
        with self.assertRaises(ValueError):self.s.call('mini/answer',dict(profile=other,mini_token=g['mini_token'],answer='X'))

    def test_country_hunt_uses_current_card_evidence_and_finishes_five_rounds(self):
        g=self.start('country_hunt')
        from era_eleven.mini import question
        for i in range(5):
            _,right=question(self.s,self.s.store.get('mini',g['mini_token']))
            g=self.answer(g,right,str(i))
        self.assertTrue(g['complete'])
        self.assertEqual(g['score'],5)
        self.assertIn('nationality',g['explanation'].lower())

    def test_roster_roulette_credits_each_person_once(self):
        g=self.start('roster_roulette')
        saved=self.s.store.get('mini',g['mini_token'])
        name=next(p['name'] for p in self.s.players if p['id'] in saved['roster'])
        first=self.answer(g,name,'first')
        again=self.answer(g,name,'second')
        self.assertGreater(first['score'],0)
        self.assertEqual(first['score'],again['score'])
        self.assertEqual(first['remaining'],again['remaining'])

    def test_first_answer_after_timer_commits_completion_once(self):
        from unittest.mock import patch
        g=self.start('roster_roulette')
        with patch('era_eleven.mini.time.time',return_value=g['deadline']+1):
            out=self.answer(g,'No Such Player')
            self.assertTrue(out['complete'])
            self.assertEqual(out,self.answer(g,'No Such Player'))
        resumed=self.s.call('mini/state',dict(profile=self.p,mini_token=g['mini_token']))
        self.assertTrue(resumed['complete'])
        self.assertEqual(self.s.call('progress',dict(profile=self.p))['stats']['mini_games'],1)
