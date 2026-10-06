// Calibration boundary: P = model parameters; cfg = validated, atomic updates.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../app/engine/index.js';

test('measured parameters change expected goals and carry their supplied provenance', () => {
  assert.equal(typeof E.cfg, 'function');
  const old = { ...E.P, b: { ...E.P.b } };
  try {
    E.cfg({ be: 0.4, ka: 0.2, h: 0.1, b: { 1990: 1.6 }, src: 'Measured fixture for this test' });
    assert.equal(E.lam({ A: 80, M: 80, Dk: 80 }, { A: 80, M: 80, Dk: 80 }, 1990), 1.6);
    assert.equal(E.P.src, 'Measured fixture for this test');
    assert.equal(E.P.b[1950], old.b[1950]);
  } finally { E.cfg(old); }
});

test('invalid calibration is rejected atomically and cannot poison later replay', () => {
  assert.equal(typeof E.cfg, 'function');
  const old = { ...E.P, b: { ...E.P.b } };
  assert.throws(() => E.cfg({ be: 0.3, h: NaN, src: 'bad' }), /finite|valid/i);
  assert.deepEqual(E.P, old);
  assert.throws(() => E.cfg({ b: { 1990: -1 } }), /positive/i);
  assert.deepEqual(E.P, old);
});
