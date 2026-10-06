// Roster boundaries: A = available team; R = rated lineup; natural keeper cover and real chemistry.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../app/engine/index.js';
import { club, cd } from './fixtures.mjs';

test('a missing keeper is covered by the reserve keeper before a higher-rated outfielder', () => {
  const T = club('a').T;
  T.bn = [cd('outfield', 'ST', 99), cd('reserve', 'GK', 60), null, null];
  let n = 0;
  const A = E.avail(() => n++ === 0 ? 0 : 0.99, T, 1990, 'a');
  assert.equal(A.xi[0].id, 'reserve');
  assert.equal(A.bn[0].id, 'outfield');
  assert.deepEqual(A.out, ['a-0']);
  assert.equal(T.xi[0].id, 'a-0');
});

test('a keeper absence without keeper depth imposes the emergency outfield penalty', () => {
  const T = club('a').T;
  T.bn = [cd('outfield', 'ST', 99), null, null, null];
  T.bn[0].cq = 'Qother-club';
  let n = 0;
  const A = E.avail(() => n++ === 0 ? 0 : 0.99, T, 1990, 'a');
  const R = E.rate(A, 1990);
  assert.equal(A.xi[0].id, 'outfield');
  assert.equal(R.xi[0].f, 0.75);
  assert.equal(R.K, 24.75);
});

test('missing club identifiers never create teammate chemistry', () => {
  const T = club('a').T;
  for (const c of T.xi) delete c.cq;
  const R = E.rate(T, 1990);
  assert.ok(R.xi.every(p => p.b === 0));
});

test('duo links cannot stack duplicates or self-links and chemistry stays capped', () => {
  const T = club('a').T;
  T.xi[9].duo = ['a-9', 'a-10', 'a-10', 'a-8', 'a-7'];
  const R = E.rate(T, 1990);
  assert.equal(R.xi[9].b, 5);
});

test('assignment rejects impossible or non-finite matrices and duplicate squad people', () => {
  assert.throws(() => E.hun([[NaN]]), /finite/i);
  assert.throws(() => E.hun([[1, 2], [3]]), /rectangular/i);
  const T = club('a').T, Q = [...T.xi, ...T.bn];
  Q[11] = { ...Q[11], id: Q[0].id };
  assert.throws(() => E.best(Q, T.S, 1990), /distinct/i);
});
