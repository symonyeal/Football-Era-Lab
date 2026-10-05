from pathlib import Path
import hashlib
import json
import unittest
from era_eleven.data import load_players,import_ea_csv,import_pes_csv,ROOT

FIXTURES=Path(__file__).parent/'fixtures'

class DataTests(unittest.TestCase):
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

if __name__=='__main__':unittest.main()
