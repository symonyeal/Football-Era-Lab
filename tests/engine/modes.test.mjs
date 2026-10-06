// Mode contracts: G = Gauntlet state; F = all-decade club fields; C = tournament circuit.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../app/engine/index.js';
import { club, eras } from './fixtures.mjs';

test('a lost boss preserves the drafted roster and decade, then increments attempts on retry', () => {
  assert.equal(typeof E.gaunt, 'function');
  const me = { ...club('me', 40), me: true }, F = eras(95);
  const G = E.gaunt(37, me, F, { Ds: 1950 });
  const a = E.retry(G);
  assert.equal(a.history[0].won, false);
  assert.equal(a.i, 0); assert.equal(a.Ds, 1950);
  assert.equal(a.attempts[0], 1); assert.equal(G.attempts[0], 0);
  assert.deepEqual(a.me.T, me.T);
  const b = E.retry(a);
  assert.equal(b.history[1].attempt, 2);
  assert.equal(b.attempts[0], 2);
  assert.deepEqual(b.me.T, me.T);
  assert.deepEqual(E.retry(JSON.parse(JSON.stringify(G))), a);
});

test('winning bosses visits all eight decades and completing stops further matches', () => {
  assert.equal(typeof E.gaunt, 'function');
  const me = { ...club('me', 99, 1990), me: true }, F = eras(40);
  let G = E.gaunt(182, me, F, { Ds: 1990 });
  for (let n = 0; !G.done && n < 60; n++) G = E.retry(G);
  assert.equal(G.done, true);
  assert.deepEqual(G.history.filter(h => h.won).map(h => h.Ds).sort(), [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]);
  assert.equal(G.attempts.reduce((a, b) => a + b, 0), G.history.length);
  assert.ok(G.honours.includes('Gauntlet champion'));
  assert.equal(E.boss(G), null);
  assert.deepEqual(E.retry(G), G);
});

test('the boss is the strongest available real club and unavailable eras fail before play', () => {
  assert.equal(typeof E.gaunt, 'function');
  const F = eras(); F[1950][7].x = 99;
  const G = E.gaunt(9, club('me'), F);
  assert.equal(E.boss(G).id, F[1950][7].id);
  delete F[2020];
  assert.throws(() => E.gaunt(9, club('me'), F), /2020/);
});

test('saved gauntlet retries use their captured model and preserve the ambient configuration', () => {
  const G = E.gaunt(93, club('me'), eras());
  const a = E.retry(G), old = { ...E.P, b: { ...E.P.b } };
  try {
    E.cfg({ be: 0, ka: 0, h: 0, b: { 1950: 3 } });
    const ambient = { ...E.P, b: { ...E.P.b } };
    assert.deepEqual(E.retry(JSON.parse(JSON.stringify(G))), a);
    assert.deepEqual(E.P, ambient);
  } finally { E.cfg(old); }
});

test('the circuit accepts ten to twenty events and plays varied real tournaments', () => {
  assert.equal(typeof E.circuit, 'function');
  const me = { ...club('me'), me: true }, F = eras();
  const C = E.circuit(818, me, F, { events: 10, Ds: 1990 });
  assert.equal(C.events.length, 10);
  assert.ok(new Set(C.events.map(e => e.format)).size >= 4);
  assert.ok(C.events.every(e => e.matches.length > 0 && e.matches.some(m => m.A === me.id || m.B === me.id)));
  assert.equal(C.totals.played, C.events.flatMap(e => e.matches).filter(m => m.A === me.id || m.B === me.id).length);
  assert.equal(C.totals.titles, C.events.filter(e => e.won).length);
  assert.deepEqual(JSON.parse(JSON.stringify(E.circuit(818, me, F, { events: 10, Ds: 1990 }))), JSON.parse(JSON.stringify(C)));
  assert.throws(() => E.circuit(1, me, F, { events: 9 }), /10.*20/);
  assert.throws(() => E.circuit(1, me, F, { events: 21 }), /10.*20/);
});

test('circuit awards and statistics are derived from every simulated scoring event', () => {
  assert.equal(typeof E.circuit, 'function');
  const me = { ...club('me'), me: true };
  const C = E.circuit(153, me, eras(), { events: 20 });
  const M = C.events.flatMap(e => e.matches);
  assert.equal(C.events.length, 20);
  assert.equal(C.st.reduce((n, p) => n + p.g, 0), M.reduce((n, m) => n + m.M.gx + m.M.gy, 0));
  assert.equal(C.st.reduce((n, p) => n + p.as, 0), M.reduce((n, m) => n + m.M.ev.filter(e => e.as).length, 0));
  assert.equal(C.awards.scorer.g, Math.max(...C.st.filter(p => p.src !== 'filler').map(p => p.g)));
  for (const e of C.events) {
    assert.equal(e.st.reduce((n, p) => n + p.g, 0), e.matches.reduce((n, m) => n + m.M.gx + m.M.gy, 0));
    assert.ok(e.awards.player?.ap > 0);
  }
});
