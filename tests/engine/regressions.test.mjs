// Regression contracts. C = club field; G = gauntlet; M = played match; E = engine exports.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../app/engine/index.js';
import { club, field, cd } from './fixtures.mjs';

test('a league exposes all 380 played fixtures and reconciles the full table', () => {
  const C = field(); C[0].me = true;
  const L = E.league(E.mk(93), C, 1990);
  assert.equal(L.fixtures?.length, 380);
  assert.equal(L.res.length, 38);
  for (const t of L.tab) {
    const F = L.fixtures.filter(f => f.A === t.id || f.B === t.id);
    assert.equal(F.length, 38);
    assert.equal(t.P, t.W + t.D + t.L);
    assert.equal(t.Pts, 3 * t.W + t.D);
    assert.equal(t.GF, F.reduce((s, f) => s + (f.A === t.id ? f.M.gx : f.M.gy), 0));
    assert.equal(t.GA, F.reduce((s, f) => s + (f.A === t.id ? f.M.gy : f.M.gx), 0));
  }
});

test('the same historical person at two clubs has separate club statistics', () => {
  const C = field(2);
  C[0].T.xi[9].id = 'Qhistorical'; C[1].T.xi[9].id = 'Qhistorical';
  const L = E.league(E.mk(19), C, 1990);
  const st = [...L.st.values()].filter(s => s.id === 'Qhistorical');
  assert.equal(st.length, 2);
  assert.deepEqual(st.map(s => s.cl).sort(), C.map(c => c.id).sort());
  assert.ok(st.every(s => s.ap <= 2));
});

test('emergency replacements are distinct people and every goal has a counted scorer', () => {
  const C = field(2);
  for (const c of C) c.T.bn = [null, null, null, null];
  let n = 0;
  const L = E.league(() => n++ < 22 ? 0.001 : 0.5, C, 1990);
  const st = [...L.st.values()];
  assert.equal(st.reduce((s, p) => s + p.g, 0), L.tab.reduce((s, t) => s + t.GF, 0));
  assert.ok(st.length >= 22);
  assert.ok(st.some(p => p.src === 'filler'));
});

test('shootouts always record a deciding score even after a run of equal kicks', () => {
  const A = E.rate(club('a').T, 1990), B = E.rate(club('b').T, 1990);
  const M = E.pens(() => 0.5, A, B);
  assert.notEqual(M.x, M.y);
  assert.equal(M.w, M.x > M.y ? 0 : 1);
});

test('an unclassified player cannot receive a mild penalty in goal', () => {
  assert.equal(E.fit([], 'GK').f, 0.75);
});

test('useful replacements can enter in both substitution windows without re-entering players', () => {
  const A = club('a'), B = club('b');
  A.T.bn = [cd('sub1', 'CM', 99), cd('sub2', 'ST', 99), cd('sub3', 'CB', 99), cd('sub4', 'GK', 75)];
  const M = E.play(E.mk(44), A, B, 1990);
  assert.equal(M.subs[0].length, 3);
  assert.equal(new Set(M.subs[0].map(s => s.m)).size, 2);
  assert.equal(new Set(M.subs[0].map(s => s.on)).size, 3);
  assert.ok(M.ev.every(e => e.sc && e.as !== e.sc));
});

test('invalid fixture fields fail clearly instead of hanging or emitting an incomplete cup', () => {
  assert.throws(() => E.rr(3), /even/i);
  assert.throws(() => E.cup(E.mk(2), field(15), 1990), /16/);
  const C = field(16); C[1].id = C[0].id;
  assert.throws(() => E.cup(E.mk(2), C, 1990), /distinct/i);
});

test('all knockout winners reconcile to aggregate goals or their shootout', () => {
  const K = E.cup(E.mk(232), field(16), 1990);
  assert.deepEqual(K.rounds.map(r => r.length), [8, 4, 2, 1]);
  assert.equal(K.rounds.flat().reduce((n, t) => n + t.legs.length, 0), 29);
  for (const [i, R] of K.rounds.entries()) for (const t of R) {
    assert.equal(t.legs.length, i === 3 ? 1 : 2);
    const a = t.legs[0].gx + (i === 3 ? 0 : t.legs[1].gy);
    const b = t.legs[0].gy + (i === 3 ? 0 : t.legs[1].gx);
    assert.deepEqual(t.agg, [a, b]);
    if (a !== b) assert.equal(t.w, a > b ? t.A : t.B);
    else {
      assert.ok(t.et && t.pw);
      assert.notEqual(t.pw.x, t.pw.y);
      assert.equal(t.w, (i === 3 ? t.pw.w === 0 : t.pw.w === 1) ? t.A : t.B);
    }
  }
});

test('league goals, assists and appearances reconcile with match events', () => {
  const C = field(4); C[0].me = true;
  const L = E.league(E.mk(321), C, 1990);
  const st = [...L.st.values()];
  assert.equal(st.reduce((s, p) => s + p.g, 0), L.tab.reduce((s, t) => s + t.GF, 0));
  assert.ok(st.every(p => p.as <= p.ap * 20 && p.cs <= p.ap));
  assert.ok(L.awards?.scorer?.g > 0);
  assert.ok(L.awards?.player?.ap > 0);
});
