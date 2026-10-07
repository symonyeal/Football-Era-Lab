// Export-to-engine integration. G = bundled archive; F = real opponents; R = complete season.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as E from '../../app/engine/index.js';
import { fields } from '../../app/data.js';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
if (G.params) E.cfg(G.params);
const F = fields(G);

test('the decade field puts its strongest squad first for the boss and Cup selection', () => {
  for (const D of E.DS) {
    for (let i = 1; i < F[D].length; i++) assert.ok(F[D][i - 1].x >= F[D][i].x,
      `${D}s: ${F[D][i - 1].nm} (${F[D][i - 1].x}) precedes stronger ${F[D][i].nm} (${F[D][i].x})`);
  }
});

test('the coverage, manifest and calibration reports describe the exact shipped bundle', () => {
  const raw = readFileSync(new URL('../../data/game.json', import.meta.url));
  const V = JSON.parse(readFileSync(new URL('../../data/validation.json', import.meta.url), 'utf8'));
  const M = JSON.parse(readFileSync(new URL('../../data/manifest.json', import.meta.url), 'utf8'));
  const C = JSON.parse(readFileSync(new URL('../../data/calibration.json', import.meta.url), 'utf8'));
  assert.equal(V.passed, true);
  assert.deepEqual(V.defects, []);
  assert.equal(V.data_sha256, createHash('sha256').update(raw).digest('hex'), 'rebuild the coverage report after changing game.json');
  assert.deepEqual(V.counts, G.meta.counts);
  assert.deepEqual(M.meta, G.meta);
  assert.deepEqual(G.params, C.params, 'embedded match parameters must match the calibration artifact');
  assert.equal(Object.values(G.cards).reduce((n, q) => n + q.length, 0), G.meta.counts.cards);
  assert.equal(Object.keys(G.people).length, G.meta.counts.people);
  for (const D of E.DS) {
    const cards = Object.entries(G.cards).filter(([k]) => k.endsWith(`:${D}`)).flatMap(([, q]) => q);
    assert.equal(V.coverage[D].cards, cards.length);
    for (const [s, n] of Object.entries(V.coverage[D].src)) assert.equal(n, cards.filter(c => c.s === s).length);
  }
});

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
