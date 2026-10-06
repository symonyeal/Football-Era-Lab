// Engine unit tests: node --test tests/engine
//
// Legend
//   cd(id, pos, r, D)  synthetic card
//   tm(f, Q)           team in formation f with its best eleven from cards Q
//   FM                 formation slots read from the curated file

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fit, dd, em, hun, best, rate, play, mk, rr, run, lam, ln, P } from '../../app/engine/index.js';
import { club } from './fixtures.mjs';

const FM = JSON.parse(readFileSync(new URL('../../pipeline/curated/formations.json', import.meta.url)));
const S = f => FM[f].slots.map(([s, x, y]) => ({ s, x, y }));
const cd = (id, pos, r, D = 1990, tg = {}) => ({ id, nm: id, pos, r, D, cq: 'Q1', tg, duo: [] });
const sq = (r, D = 1990) => [
  cd('g', ['GK'], r, D), cd('lb', ['LB'], r, D), cd('cb1', ['CB'], r, D), cd('cb2', ['CB'], r, D), cd('rb', ['RB'], r, D),
  cd('dm', ['CDM'], r, D), cd('cm1', ['CM'], r, D), cd('cm2', ['CM'], r, D), cd('lw', ['LW', 'LM'], r, D),
  cd('st', ['ST'], r, D), cd('rw', ['RW', 'RM'], r, D), cd('g2', ['GK'], r - 5, D), cd('cb3', ['CB'], r - 4, D),
  cd('cm3', ['CM', 'CAM'], r - 4, D), cd('st2', ['ST', 'CF'], r - 4, D),
];
const tm = (f, Q, Ds = 1990, m = { ga: 'C', gd: 'C', sig: [] }) => {
  const b = best(Q, S(f), Ds);
  return { m, S: S(f), xi: b.xi, bn: b.bn };
};

test('fit penalty follows pitch distance', () => {
  assert.equal(fit(['CB'], 'CB').f, 0);
  assert.equal(fit(['CB'], 'CDM').f, 0.10);
  assert.equal(fit(['CB'], 'CM').f, 0.22);
  assert.equal(fit(['CB'], 'ST').f, 0.35);
  assert.equal(fit(['GK'], 'CB').f, 0.75);
  assert.equal(fit(['ST'], 'GK').f, 0.75);
  assert.equal(fit(['ST'], 'CB', true).f, 0);
  assert.equal(dd('LW', 'ST'), 1);
});

test('era modifier is 1 at home, asymmetric away, softened by Timeless', () => {
  assert.equal(em(1990, 1990), 1);
  assert.equal(em(1960, 2020), 0.82);
  assert.equal(em(2020, 1960), 0.91);
  assert.ok(em(1960, 2020, 1) > em(1960, 2020, 2));
  assert.ok(em(1960, 2020, 2) > em(1960, 2020));
});

test('Hungarian assignment matches brute force on small matrices', () => {
  const r = mk(7);
  for (let t = 0; t < 30; t++) {
    const n = 4, m = 6;
    const a = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.round(r() * 100)));
    const o = hun(a);
    const c = o.reduce((x, j, i) => x + a[i][j], 0);
    let b = Infinity;
    const go = (i, used, s) => {
      if (i === n) { b = Math.min(b, s); return; }
      for (let j = 0; j < m; j++) if (!used.has(j)) { used.add(j); go(i + 1, used, s + a[i][j]); used.delete(j); }
    };
    go(0, new Set(), 0);
    assert.equal(c, b);
    assert.equal(new Set(o).size, n);
  }
});

test('best eleven puts each player in his natural slot when possible', () => {
  const T = tm('4-3-3', sq(80));
  const R = rate(T, 1990);
  assert.ok(R.xi.every(p => p.f === 0), R.xi.map(p => `${p.s}:${p.c.id}:${p.lab}`).join(' '));
  assert.ok(T.bn.some(c => c && c.pos.includes('GK')));
});

test('formation shape moves strength between lines', () => {
  const Q = [...sq(80), cd('w2', ['LW'], 80), cd('w3', ['RW'], 80), cd('cb4', ['CB'], 80), cd('cb5', ['CB'], 80),
    cd('lwb', ['LWB', 'LB'], 80), cd('rwb', ['RWB', 'RB'], 80)];
  const a = rate(tm('4-2-4', Q), 1990), b = rate(tm('5-3-2', Q), 1990);
  assert.ok(a.A > b.A, `attack ${a.A} vs ${b.A}`);
  assert.ok(b.Dd > a.Dd, `defence ${a.Dd} vs ${b.Dd}`);
});

test('manager grade and signature player raise the lines', () => {
  const Q = sq(80);
  const c = rate(tm('4-4-2', Q, 1990, { ga: 'C', gd: 'C', sig: [] }), 1990);
  const s = rate(tm('4-4-2', Q, 1990, { ga: 'S', gd: 'S', sig: [] }), 1990);
  const u = rate(tm('4-4-2', Q, 1990, { ga: 'B', gd: 'B', sig: ['st'] }), 1990);
  assert.ok(s.A > c.A && s.Dd > c.Dd);
  assert.equal(u.gA, 'A');
  assert.equal(u.gD, 'A');
});

test('equal teams score near the decade baseline and home side gains', () => {
  // Every starter is a natural 80 in this fixture. The earlier sq helper put a 76-rated
  // striker in one slot, so its attack was below its defence before the match even began.
  const X = club('x'), Y = club('y');
  const r = mk(11);
  let gx = 0, gy = 0, n = 4000;
  for (let i = 0; i < n; i++) { const M = play(r, X, Y, 1990, { h: 0 }); gx += M.gx; gy += M.gy; }
  const b = P.b[1990];
  assert.ok(Math.abs(gx / n - b) < 0.12 && Math.abs(gy / n - b) < 0.12, `${gx / n} ${gy / n} vs ${b}`);
  let hx = 0;
  for (let i = 0; i < n; i++) hx += play(r, X, Y, 1990, { h: P.h }).gx;
  assert.ok(hx / n > gx / n);
});

test('stronger team wins more often, and the gap is not absurd', () => {
  const X = { id: 'x', T: tm('4-4-2', sq(86)) }, Y = { id: 'y', T: tm('4-4-2', sq(78)) };
  const r = mk(5);
  let w = 0, d = 0, n = 3000;
  for (let i = 0; i < n; i++) { const M = play(r, X, Y, 1990, { h: 0 }); w += M.gx > M.gy; d += M.gx === M.gy; }
  assert.ok(w / n > 0.5 && w / n < 0.85, `win share ${w / n}`);
});

test('same seed replays the same season', () => {
  const mkC = (id, rt) => ({ id, nm: id, x: rt, T: tm('4-4-2', sq(rt).map(c => ({ ...c, id: id + c.id }))) });
  const O = Array.from({ length: 19 }, (_, i) => mkC(`o${i}`, 74 + (i % 8)));
  const me = { ...mkC('me', 82), me: true };
  const a = run(99, me, O, O.slice(0, 15), 1990), b = run(99, me, O, O.slice(0, 15), 1990);
  assert.deepEqual(a, b);
  assert.equal(a.L.tab.reduce((x, t) => x + t.W, 0), a.L.tab.reduce((x, t) => x + t.L, 0));
  assert.ok(a.L.tab.every(t => t.P === 38));
  assert.equal(a.K.rounds.length, 4);
});

test('round robin covers every pairing home and away once', () => {
  const R = rr(20);
  assert.equal(R.length, 38);
  const seen = new Set();
  for (const m of R) for (const [i, j] of m) seen.add(`${i}-${j}`);
  assert.equal(seen.size, 380);
});

test('expected goals respond to the attack-defence gap', () => {
  const X = { A: 85, M: 80, Dk: 80 }, Y = { A: 75, M: 80, Dk: 75 };
  assert.ok(lam(X, Y, 1990) > lam(Y, X, 1990));
  assert.ok(ln({ A: 80, M: 80, Dd: 80, K: 80 }, 0.05, 1).A > 80);
});
