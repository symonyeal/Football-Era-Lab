"""Club kit colours for the interface: two per archive club, primary first.

Legend
  K       curated/kits.csv rows: qid, nm, k1, k2, src. src wikidata: Wikidata's official colours
          (P6364) in the tones clubs wear, primary first; curated: set by hand where Wikidata has none
          or orders them wrongly; neutral: N, declared for a club whose colours are not established here
  N       neutral pair
  kits()  {qid: [k1, k2]} for the export step
  main()  write k into an existing data/game.json without rebuilding cards; run pipeline.validate after
"""
import csv
import json

from .config import CUR, OUT

N = ["#C9D2E3", "#55627D"]


def kits():
    with open(CUR / "kits.csv", encoding="utf-8", newline="") as f:
        return {r["qid"]: [r["k1"], r["k2"]] for r in csv.DictReader(f)}


def main():
    p = OUT / "game.json"
    G = json.loads(p.read_text(encoding="utf-8"))
    K = kits()
    for q, c in G["clubs"].items():
        c["k"] = K.get(q, N)
    p.write_text(json.dumps(G, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"kits for {len(G['clubs'])} clubs, {sum(q not in K for q in G['clubs'])} neutral by default")


if __name__ == "__main__":
    main()
