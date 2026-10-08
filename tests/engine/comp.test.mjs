// Competition regressions: C entrants; R matchdays; M table rows; st player totals; g group count.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cmp from '../../app/engine/comp.js';
import * as E from '../../app/engine/index.js';
import { field } from './fixtures.mjs';

test('the shared engine exposes the career competition primitives alongside legacy seasons', () => {
  for (const k of ['I', 'rr2', 'row0', 'order', 'lmd', 'bye', 'pair', 'ko', 'groups', 'gmd', 'run', 'league', 'cup']) assert.equal(typeof E[k], 'function', k);
});

test('even and odd leagues give every pair one home and one away match, with no double bookings', () => {
  for (const n of [2, 3, 5, 16, 20, 21, 22]) {
    const R = Cmp.rr2(n), seen = new Set();
    assert.equal(R.length, 2 * (n % 2 ? n : n - 1));
    for (const md of R) {
      const used = new Set();
      for (const [a, b] of md) {
        assert.ok(a >= 0 && b >= 0 && a < n && b < n && a !== b);
        assert.ok(!used.has(a) && !used.has(b)); used.add(a); used.add(b);
        assert.ok(!seen.has(`${a}:${b}`)); seen.add(`${a}:${b}`);
      }
      assert.equal(used.size, n - n % 2);
    }
    assert.equal(seen.size, n * (n - 1));
  }
});

test('first-round byes protect the highest seeds and leave an even playing field', () => {
  for (const n of [2, 3, 5, 16, 20, 21, 22, 32]) {
    const b = Cmp.bye(n);
    assert.deepEqual([...b.by, ...b.pl], [...Array(n).keys()]);
    assert.equal(b.pl.length % 2, 0);
    assert.equal(b.by.length + b.pl.length / 2, 2 ** (Math.ceil(Math.log2(n)) - 1));
  }
  for (const n of [0, 1, -1, 2.5]) assert.throws(() => Cmp.bye(n), /at least two/);
  assert.throws(() => Cmp.pair(E.mk(1), ['a', 'b', 'c']), /even/);
});

test('two-point and three-point league tables and player totals reconcile with the matches', () => {
  for (const w of [2, 3]) {
    const C = field(5), M = new Map(C.map(c => [c.id, Cmp.row0(c.id)])), st = new Map(), R = [];
    for (let k = 0; k < Cmp.rr2(C.length).length; k++) R.push(...Cmp.lmd(E.mk(k + 7), C, M, k, 1990, w, st));
    assert.equal(R.length, 20);
    for (const row of M.values()) {
      assert.equal(row.P, 8); assert.equal(row.W + row.D + row.L, row.P); assert.equal(row.Pts, w * row.W + row.D);
    }
    assert.equal([...M.values()].reduce((n, x) => n + x.GF, 0), [...M.values()].reduce((n, x) => n + x.GA, 0));
    assert.equal([...st.values()].reduce((n, x) => n + x.g, 0), R.reduce((n, x) => n + x.M.gx + x.M.gy, 0));
    assert.equal([...st.values()].reduce((n, x) => n + x.as, 0), R.reduce((n, x) => n + x.M.ev.filter(e => e.as).length, 0));
  }
});

test('knockout aggregates and penalties always name the correct winner from either leg', () => {
  const [A, B] = field(2);
  let pens = 0;
  for (let s = 1; s <= 60; s++) for (const legs of [1, 2]) {
    const t = Cmp.ko(E.mk(s), A, B, 1990, { legs, neutral: legs === 1 });
    assert.equal(t.g.length, legs);
    assert.deepEqual(t.agg, [t.g.reduce((n, g) => n + g[0], 0), t.g.reduce((n, g) => n + g[1], 0)]);
    const [a, b] = t.agg;
    if (a !== b) assert.equal(t.w, a > b ? A.id : B.id);
    else { assert.ok(t.et && t.pw); assert.equal(t.w, t.pw.w === (legs === 2 ? 1 : 0) ? A.id : B.id); pens++; }
  }
  assert.ok(pens > 0);
});

test('groups retain all entrants and reject incomplete groups instead of dropping clubs', () => {
  const C = field(16), G = Cmp.groups(E.mk(1), C, 4);
  assert.ok(G.every(g => g.length === 4));
  assert.deepEqual(G.flat().map(c => c.id).sort(), C.map(c => c.id).sort());
  assert.throws(() => Cmp.groups(E.mk(1), C.slice(0, 15), 4), /four/);
  assert.throws(() => Cmp.groups(E.mk(1), C, 0), /four/);
});
