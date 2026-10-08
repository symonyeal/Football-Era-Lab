import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../app/engine/index.js';
import * as D from '../../app/draft.js';
import * as C from '../../app/career.js';
import { U } from '../../app/ui/kit.js';
import { hub, careerShareText } from '../../app/ui/career.js';
import { restore } from '../../app/save.js';
import { named } from '../../app/club.js';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url)));
E.cfg(G.params);
function draft() {
  let s = D.choose(G, D.start(851, 2000, true), 0);
  for (let j = 0; j < 5; j++) {
    s = D.spin(G, s);
    for (let k = 0; k < 3; k++) {
      const c = G.cards[s.combo].find(c => D.can(G, s, c.p));
      s = D.place(G, s, c.p, j * 3 + k);
    }
  }
  return { ...s, phase: 'results' };
}
test('the career opens with the actual league size, season objective and winter action', () => {
  U.G = G; U.S = draft(); U.S.mode = { career: C.careerStart(G, U.S) }; U.tab = 'league';
  const s = U.S.mode.career, html = hub();
  assert.match(html, /Play to winter/);
  assert.match(html, /Board objective/);
  assert.match(html, new RegExp(`${s.years[0]}/${String(s.years[0] + 1).slice(-2)}`));
  assert.equal((html.match(/data-club=/g) || []).length, s.S.L.rows.length);
  assert.match(html, /More modes/);
  assert.ok(html.includes(named('L', s.lg, s.S.s)), 'the league is named for its historical era');
  assert.doesNotMatch(html, /undefined|NaN/);
});
test('career share text reports the current club season and full league denominator', () => {
  U.G = G; U.S = draft(); U.S.mode = { career: C.careerStart(G, U.S) };
  const s = U.S.mode.career, tx = careerShareText();
  assert.ok(tx.includes(G.clubs[s.q].nm));
  assert.ok(tx.includes(`Season 1 / ${s.years.length}`));
  assert.ok(tx.includes(` / ${s.S.L.rows.length}`));
  assert.ok(tx.includes(`Seed ${s.seed}`));
  assert.match(tx, /Pre-season/);
});
test('browser restoration keeps an advanced career and rejects another draft’s career', () => {
  const raw = draft(); raw.mode = { career: C.careerPlayHalf(G, C.careerStart(G, raw)) };
  const restored = restore(G, JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(restored.mode.career, raw.mode.career);
  assert.deepEqual(restored.slots, raw.slots);
  const altered = structuredClone(raw); altered.mode.career.seed++;
  assert.throws(() => restore(G, altered), /does not belong/);
  const broken = structuredClone(raw); broken.mode.career.S.me[0].gf = -1;
  assert.throws(() => restore(G, broken), /invalid/);
});
