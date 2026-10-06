from pathlib import Path
import hashlib
import json
import unittest
from unittest.mock import patch
import pandas as pd
from era_eleven import data as data_module
from era_eleven.data import load_players,import_ea_csv,import_pes_csv,ROOT

FIXTURES=Path(__file__).parent/'fixtures'

class DataTests(unittest.TestCase):
    def ea_frame(self):
        return pd.read_csv(FIXTURES/'ea.csv')
    def pes_frame(self):
        return pd.read_csv(FIXTURES/'pes.csv')
    def test_source_manifest_matches_payload(self):
        m=json.loads((ROOT/'data/manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(m['players'],len(load_players()))
        self.assertEqual(m['sha256'],hashlib.sha256((ROOT/'data/players.json').read_bytes()).hexdigest())
        self.assertTrue(all(s['declared_license']=='CC0: Public Domain' for s in m['sources'].values()))
    def test_ea_import_preserves_attributes_and_missing_detail(self):
        p=import_ea_csv(FIXTURES/'ea.csv',edition=24)[0]
        self.assertEqual(p['shooting'],85)
        self.assertEqual(p['physical'],75)
        self.assertEqual(p['stamina'],88)
        self.assertIsNone(p['vision'])
        self.assertIsNone(p['gk_reflexes'])
        self.assertEqual(p['identity'],'ea-1')
    def test_pes_import_records_proxy_mapping(self):
        p=import_pes_csv(FIXTURES/'pes.csv')[0]
        self.assertEqual(p['positions'],['ST'])
        self.assertEqual(p['pace'],84)
        self.assertEqual(p['passing'],67)
        self.assertEqual(p['lineage'],'pes-group-proxy')
        self.assertIn('attribute_mapping',p)
        self.assertIsNone(p['vision'])
    def test_no_such_edition_fails_instead_of_empty_draft(self):
        with self.assertRaises(ValueError):import_ea_csv(FIXTURES/'ea.csv',edition=21)
    def test_retired_card_and_career_snapshot_share_person_identity(self):
        players=load_players()
        for icon_name,career_name in [('Mario Gomez','M. Gómez'),('Vincent Kompany','V. Kompany'),('Wesley Sneijder','W. Sneijder'),('Claudio Marchisio','C. Marchisio')]:
            ids={p['identity'] for p in players if p['name'] in [icon_name,career_name]}
            self.assertEqual(len(ids),1,icon_name+' must have one person identity across cards')

    def test_ea_without_provider_id_cannot_create_a_name_identity(self):
        frame=self.ea_frame().drop(columns=['player_id'])
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            with self.assertRaisesRegex(ValueError,'identity_overrides'):
                import_ea_csv('not-read.csv')

    def test_pes_without_provider_id_cannot_create_a_name_identity(self):
        frame=self.pes_frame().drop(columns=['ID'])
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            with self.assertRaisesRegex(ValueError,'identity_overrides'):
                import_pes_csv('not-read.csv')

    def test_fractional_provider_id_is_rejected_instead_of_truncated(self):
        frame=self.ea_frame().astype({'player_id':float});frame.loc[0,'player_id']=1.5
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            with self.assertRaises(ValueError):import_ea_csv('not-read.csv')

    def test_same_name_with_distinct_provider_ids_stays_distinct(self):
        frame=pd.concat([self.ea_frame(),self.ea_frame()],ignore_index=True)
        frame.loc[1,'player_id']=2
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            players=import_ea_csv('not-read.csv')
        self.assertEqual(len({p['identity'] for p in players}),2)

    def test_same_identity_with_conflicting_birth_dates_is_rejected(self):
        frame=pd.concat([self.ea_frame(),self.ea_frame()],ignore_index=True)
        frame.loc[1,'fifa_version']=23
        frame['dob']=['1990-01-01','1991-01-01']
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            with self.assertRaisesRegex(ValueError,'birth date'):
                import_ea_csv('not-read.csv')

    def test_invalid_source_metadata_cannot_break_engine_text_fields(self):
        with self.assertRaises(ValueError):
            import_ea_csv(FIXTURES/'ea.csv',source_metadata={'lineage':42})

    def test_reviewed_cross_provider_override_preserves_original_ids(self):
        overrides={'ea-1':{'identity':'person-fixture','evidence':'Verified source IDs and birth date'},
                   'pes-1':{'identity':'person-fixture','evidence':'Verified source IDs and birth date'}}
        ea=import_ea_csv(FIXTURES/'ea.csv',identity_overrides=overrides)[0]
        pes=import_pes_csv(FIXTURES/'pes.csv',identity_overrides=overrides)[0]
        self.assertEqual(ea['identity'],pes['identity'])
        self.assertEqual(ea['provider_player_id'],'1')
        self.assertEqual(pes['provider_player_id'],'1')
        self.assertEqual(ea['identity_resolution']['status'],'reviewed override')

    def test_override_requires_evidence_and_checks_known_birth_date(self):
        with self.assertRaises(ValueError):
            import_ea_csv(FIXTURES/'ea.csv',identity_overrides={'ea-1':{'identity':'person-fixture'}})
        frame=self.ea_frame();frame['dob']='1990-01-01'
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            with self.assertRaisesRegex(ValueError,'birth date'):
                import_ea_csv('not-read.csv',identity_overrides={'ea-1':{'identity':'person-fixture','evidence':'Reviewed','dob':'1991-01-01'}})

    def test_no_id_rows_can_use_separately_reviewed_person_mappings(self):
        frame=pd.concat([self.ea_frame(),self.ea_frame()],ignore_index=True).drop(columns=['player_id'])
        overrides={'row:0':{'identity':'person-first','evidence':'Checked full name and birth date'},
                   'row:1':{'identity':'person-second','evidence':'Checked different full name and birth date'}}
        with patch.object(data_module.pd,'read_csv',return_value=frame):
            players=import_ea_csv('not-read.csv',identity_overrides=overrides)
        self.assertEqual({p['identity'] for p in players},{'person-first','person-second'})
        self.assertEqual(len({p['id'] for p in players}),2)
        self.assertTrue(all(p['provider_player_id'] is None for p in players))

    def test_source_licence_mapping_and_missingness_are_preserved(self):
        source={'source':'fixture-private-export','season':'2023-24','license':{'name':'Private use','redistribution':'not permitted'},'source_url':'https://example.invalid/export'}
        p=import_ea_csv(FIXTURES/'ea.csv',source_metadata=source)[0]
        self.assertEqual(p['source'],'fixture-private-export')
        self.assertEqual(p['license'],source['license'])
        self.assertEqual(p['season'],'2023-24')
        self.assertEqual(p['attribute_mapping']['physical'],['physic'])
        self.assertIn('vision',p['missing_attributes'])
        self.assertEqual(p['source_metadata'],source)
        self.assertEqual(p['source_file_sha256'],hashlib.sha256((FIXTURES/'ea.csv').read_bytes()).hexdigest())

    def test_user_attribute_mapping_changes_values_and_records_proxy(self):
        p=import_ea_csv(FIXTURES/'ea.csv',attribute_mapping={'physical':['power_stamina']})[0]
        self.assertEqual(p['physical'],88)
        self.assertEqual(p['attribute_mapping']['physical'],['power_stamina'])
        self.assertIn('proxy',p['lineage'])

    def test_identity_review_requires_full_name_birth_date_and_nation(self):
        left=[{'id':'ea-1','name':'Alex Smith','full_name':'Alex Smith','dob':'1990-01-01','nation':'Fixture Nation'}]
        right=[{'id':'pes-9','name':'Alex Smith','full_name':'Alex Smith','dob':'1991-01-01','nation':'Fixture Nation'},
               {'id':'pes-10','name':'Alex Smith','full_name':'Alex Smith','dob':'1990-01-01','nation':'Fixture Nation'}]
        matches=data_module.identity_review_candidates(left,right)
        self.assertEqual([(r['left_id'],r['right_id']) for r in matches],[('ea-1','pes-10')])
        self.assertTrue(matches[0]['requires_review'])
        self.assertEqual(left[0]['id'],'ea-1')
        self.assertEqual(data_module.identity_review_candidates([dict(left[0],dob=None)],right),[])

    def test_coverage_report_exposes_missing_keeper_and_preserves_pool(self):
        players=load_players();before=[p['id'] for p in players]
        report=data_module.pool_report(players)
        self.assertEqual(report['cards'],625)
        self.assertTrue(report['eras']['2020s']['eligible'])
        no_keeper=[p for p in players if 'GK' not in p['positions']]
        bad=data_module.pool_report(no_keeper)
        self.assertFalse(bad['eras']['All eras']['eligible'])
        self.assertEqual(bad['positions']['GK'],0)
        self.assertEqual(before,[p['id'] for p in players])

if __name__=='__main__':unittest.main()
