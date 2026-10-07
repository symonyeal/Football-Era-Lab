// Mode contracts: F = all-decade club fields; C = tournament circuit.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../app/engine/index.js';
import { club, eras } from './fixtures.mjs';

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
