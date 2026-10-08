// Weekly Challenge, team codes and Head to Head on the bundled data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../app/engine/index.js';
import * as Dr from '../../app/draft.js';
import { wk, code, uncode, h2h } from '../../app/play.js';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
if (G.params) E.cfg(G.params);

function done(seed, D) {
  let s = Dr.choose(G, Dr.start(seed, D), 0);
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    for (let j = 0; j < 3; j++) {
      const I = Dr.used(s), c = G.cards[s.combo].find(c => !I.has(c.p));
      s = Dr.place(G, s, c.p, s.slots.findIndex(x => !x));
    }
  }
  return s;
}

test('the weekly challenge is one seed and decade for the whole ISO week', () => {
  const a = wk(new Date(Date.UTC(2026, 9, 5))), b = wk(new Date(Date.UTC(2026, 9, 11))), c = wk(new Date(Date.UTC(2026, 9, 12)));
  assert.equal(a.id, '2026-W41');
  assert.deepEqual(a, b);
  assert.equal(c.id, '2026-W42');
  assert.notEqual(a.seed, c.seed);
  assert.ok(Dr.DECADES.includes(a.D));
  assert.equal(wk(new Date(Date.UTC(2027, 0, 1))).id, '2026-W53');
});

test('a team code carries the exact cards, manager and decade, and rejects anything else', () => {
  const s = done(21, 1990), t = uncode(G, code(G, s));
  assert.equal(t.D, 1990);
  assert.deepEqual(t.slots, s.slots.map(c => ({ k: c.k, p: c.p })));
  assert.equal(t.m.nm, s.manager.nm);
  assert.throws(() => uncode(G, 'not-a-code'), /team code/);
  assert.throws(() => code(G, { ...s, phase: 'draft' }), /Finish the draft/);
});

test('head to head plays one leg in each decade and its winner matches the aggregate', () => {
  const A = uncode(G, code(G, done(4, 1970))), B = uncode(G, code(G, done(8, 2010)));
  const a = { id: 'a', nm: 'A', T: A.T, D: A.D }, b = { id: 'b', nm: 'B', T: B.T, D: B.D };
  const x = h2h(99, a, b), y = h2h(99, a, b);
  assert.deepEqual(x.agg, y.agg);
  assert.deepEqual(x.legs.map(l => l.D), [1970, 2010]);
  const [p, q] = x.agg;
  if (p !== q) assert.equal(x.w, p > q ? 'a' : 'b');
  else assert.ok(x.pw, 'a level tie needs penalties');
});

const v1 = (s, f) => Buffer.from(JSON.stringify({ v: 1, b: G.meta.v, D: s.D, cap: !!s.cap, m: { nm: s.manager.nm, f }, x: s.slots.map(c => [c.k, c.p]) })).toString('base64url');

test('a team code carries the club spell and the formation in use, which need not be one he recorded', () => {
  const s = Dr.form(G, done(21, 1990), '2-3-5'), t = uncode(G, code(G, s));
  assert.deepEqual(t.m, s.manager);
  assert.equal(t.f, '2-3-5');
  assert.deepEqual(t.T.S.map(x => x.s), ['GK', 'CB', 'CB', 'LM', 'CDM', 'RM', 'LW', 'CF', 'ST', 'CF', 'RW']);
  assert.deepEqual(t.slots, s.slots);
});

test('a version 1 team code still plays in the formation it names, and only a recorded one', () => {
  const s = done(21, 1990), m = G.managers.find(m => m.nm === s.manager.nm), t = uncode(G, v1(s, m.f[0]));
  assert.equal(t.f, m.f[0]);
  assert.deepEqual(t.T.S.map(x => x.s), G.formations[m.f[0]].slots.map(x => x[0]));
  const other = Object.keys(G.formations).find(f => !m.f.includes(f));
  assert.throws(() => uncode(G, v1(s, other)), /manager or formation/);
  const z = JSON.parse(Buffer.from(code(G, s), 'base64url').toString());
  assert.throws(() => uncode(G, Buffer.from(JSON.stringify({ ...z, f: 'missing' })).toString('base64url')), /manager or formation/);
});
