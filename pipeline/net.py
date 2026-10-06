"""Polite HTTP: cached downloads and Wikidata SPARQL with retries.

Legend
  UA     user agent sent to every source
  fetch  download url u to path p
  sparql run query q against query.wikidata.org, cache the JSON under key k
"""
import hashlib
import json
import time
import urllib.parse
import urllib.request

from .config import CACHE

UA = "FootballEraLab/0.2 (https://github.com/symonyeal/Football-Era-Lab)"


def fetch(u, p, n=4):
    p.parent.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=120) as r:
                p.write_bytes(r.read())
            return p
        except Exception:
            if i == n - 1:
                raise
            time.sleep(3 * (i + 1))


def sparql(q, k=None, n=5):
    k = k or hashlib.sha1(q.encode()).hexdigest()[:16]
    p = CACHE / "wikidata" / f"{k}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    u = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"format": "json", "query": q})
    for i in range(n):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=180) as r:
                b = json.load(r)["results"]["bindings"]
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(b, ensure_ascii=False), encoding="utf-8")
            time.sleep(1.0)
            return b
        except Exception:
            if i == n - 1:
                raise
            time.sleep(5 * (i + 1))
