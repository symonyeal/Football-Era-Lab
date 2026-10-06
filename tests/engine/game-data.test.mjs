// Export-to-engine integration. G = bundled archive; F = real opponents; R = complete season.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../app/engine/index.js';
import { fields } from '../../app/data.js';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
if (G.params) E.cfg(G.params);
const F = fields(G);

test('the bundled real data plays complete seasons in every supported decade', () => {
  for (const D of [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]) {
    assert.equal(F[D].length, 19, `${D}s opponents`);
    const me = { ...F[D][0], id: 'you', nm: 'Your Era XI', me: true };
    const R = E.run(811, me, F[D], F[D].slice(0, 15), D);
    assert.equal(R.L.fixtures.length, 380);
    assert.equal(R.L.res.length, 38);
    assert.ok(R.L.tab.every(t => t.P === 38));
    assert.equal([...R.L.st.values()].reduce((s, p) => s + p.g, 0), R.L.tab.reduce((s, t) => s + t.GF, 0));
    assert.equal(R.K.rounds.flat().reduce((s, t) => s + t.legs.length, 0), 29);
    if (D === 1990) assert.deepEqual(R, E.run(811, me, F[D], F[D].slice(0, 15), D));
  }
});

test('the bundled real data circuit reconciles every goal and honours its requested length', () => {
  const me = { ...F[1990][0], id: 'you', nm: 'Your Era XI', me: true };
  const C = E.circuit(813, me, F, { events: 20, Ds: 1990 });
  assert.equal(C.events.length, 20);
  const M = C.events.flatMap(e => e.matches);
  assert.equal(C.st.reduce((s, p) => s + p.g, 0), M.reduce((s, f) => s + f.M.gx + f.M.gy, 0));
  assert.equal(C.totals.titles, C.events.filter(e => e.won).length);
});
