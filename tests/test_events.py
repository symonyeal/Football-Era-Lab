import unittest
try:
    from era_eleven.events import event_metrics, fit_expected_threat
except ImportError:
    event_metrics=None

class EventTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(event_metrics,'Real-event analytics has not been implemented')
    def test_xa_links_to_shot_and_shootout_is_excluded(self):
        events=[
            dict(id='pass',period=1,minute=5,type={'name':'Pass'},player={'id':1,'name':'Creator'},team={'name':'A'},location=[60,40],pass_=dict(end_location=[100,40],assisted_shot_id='shot')),
            dict(id='shot',period=1,minute=5,type={'name':'Shot'},player={'id':2,'name':'Finisher'},team={'name':'A'},location=[105,40],shot=dict(statsbomb_xg=.4,outcome={'name':'Goal'},type={'name':'Open Play'})),
            dict(id='shootout',period=5,minute=121,type={'name':'Shot'},player={'id':2,'name':'Finisher'},team={'name':'A'},location=[108,40],shot=dict(statsbomb_xg=.78,outcome={'name':'Goal'},type={'name':'Penalty'})),
        ]
        events[0]['pass']=events[0].pop('pass_')
        table=event_metrics(events).set_index('player')
        self.assertAlmostEqual(table.loc['Creator','xa'],.4)
        self.assertAlmostEqual(table.loc['Finisher','xg'],.4)
        self.assertEqual(table.loc['Finisher','goals'],1)
        self.assertEqual(table.loc['Creator','forward_moves_10m'],1)
    def test_xt_absorbs_failed_moves(self):
        events=[dict(period=1,type={'name':'Shot'},location=[105,40],shot={'outcome':{'name':'Goal'}}),dict(period=1,type={'name':'Pass'},location=[20,40],**{'pass':{'end_location':[105,40]}}),dict(period=1,type={'name':'Pass'},location=[20,40],**{'pass':{'end_location':[105,40],'outcome':{'name':'Incomplete'}}})]
        result=fit_expected_threat(events,nx=4,ny=1)
        self.assertAlmostEqual(result['grid'][0][3],1)
        self.assertAlmostEqual(result['grid'][0][0],.5)
        self.assertTrue(result['converged'])

if __name__=='__main__':unittest.main()
