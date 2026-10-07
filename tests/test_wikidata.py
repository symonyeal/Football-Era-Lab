"""Changed identity batches must not read another batch's cached facts."""
# Q queried identities; C source-response cache; q SPARQL query; k cache key; P person facts.
import re
import unittest
from unittest.mock import patch

from pipeline import wikidata


class IdentityCache(unittest.TestCase):
    def read(self, q, k=None):
        if k not in self.C:
            Q = re.findall(r"wd:(Q\d+)", re.search(r"VALUES\s+\?\w+\s*\{([^}]+)\}", q).group(1))
            self.C[k] = [dict(p={"value": "http://www.wikidata.org/entity/" + p},
                              i={"value": "http://www.wikidata.org/entity/" + p},
                              dob={"value": "1980-01-01"}, l={"value": "Player " + p},
                              lang={"value": "en"}, x={"value": "http://www.wikidata.org/entity/Q6581097"})
                         for p in Q]
        return self.C[k]

    def setUp(self):
        self.C = {}
        self.p = patch.object(wikidata, "sparql", side_effect=self.read)
        self.p.start()
        self.addCleanup(self.p.stop)

    def test_persons_include_changed_ids_with_same_first_id_and_batch_size(self):
        wikidata.persons(["Q100", "Q200"])
        P = wikidata.persons(["Q100", "Q300"])
        self.assertEqual(P["Q300"]["name"], "Player Q300")
        self.assertEqual(P["Q300"]["dob"], "1980-01-01")
        self.assertNotIn("Q200", P)

    def test_sexes_include_changed_ids_with_same_first_id_and_batch_size(self):
        wikidata.sexes(["Q100", "Q200"])
        self.assertEqual(wikidata.sexes(["Q100", "Q300"]), {"Q100": {"Q6581097"}, "Q300": {"Q6581097"}})

    def test_labels_include_changed_ids_with_same_first_id_and_batch_size(self):
        wikidata.labels(["Q100", "Q200"])
        self.assertEqual(wikidata.labels(["Q100", "Q300"]), {"Q100": "Player Q100", "Q300": "Player Q300"})


if __name__ == "__main__":
    unittest.main()
