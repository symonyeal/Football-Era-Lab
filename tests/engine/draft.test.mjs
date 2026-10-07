import test from 'node:test';
import assert from 'node:assert/strict';
import { seed, start, opts, choose, reroll, spin, place, swap, valid, used, preview, team, shape } from '../../app/draft.js';
import { rate } from '../../app/engine/index.js';

// G small archive with repeated people across clubs/decades; s draft; Q roster; i slot.
const S = [['GK', 50, 92], ['LB', 15, 72], ['CB', 38, 76], ['CB', 62, 76], ['RB', 85, 72],
  ['LM', 15, 46], ['CM', 38, 50], ['CM', 62, 50], ['RM', 85, 46], ['ST', 38, 19], ['ST', 62, 19]];
const G = { managers: Array.from({ length: 7 }, (_, i) => ({ nm: `Manager ${i}`, f: ['4-4-2'], ga: 'B', gd: 'A', sig: ['p0'] })),
  formations: { '4-4-2': { slots: S } }, combos: [], cards: {}, people: {} };
for (const D of [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]) {
  for (let q = 0; q < 6; q++) {
    const k = `q${q}:${D}`; G.combos.push({ q: `q${q}`, D, n: 18 });
    G.cards[k] = Array.from({ length: 18 }, (_, i) => {
      const p = `p${q * 12 + i}`;
      G.people[p] = { nm: `Player ${q * 12 + i}`, duo: [] };
      return { p, r: 75 + i, s: 'e', pos: [i === 0 ? 'GK' : S[1 + i % 10][0]], n: 80, g: 10, tg: {} };
    });
  }
}
const open = (s = start(42, 1990)) => spin(G, choose(G, s, 0));

test('Seed boundaries and deterministic random decade do not silently coerce invalid input', () => {
  for (const x of ['-1', '1.5', '1e2', '4294967296', '', 'word']) assert.throws(() => seed(x));
  assert.equal(seed('4294967295'), 4294967295);
  assert.deepEqual(start(123, 'random'), start(123, 'random'));
});

test('Manager spin offers five different managers, permits exactly two re-spins, and picks no players', () => {
  let s = start(42, 1990);
  assert.equal(opts(G, s).length, 5);
  assert.equal(new Set(opts(G, s).map(m => m.nm)).size, 5);
  assert.deepEqual(opts(G, s), opts(G, start(42, 1990)));
  s = reroll(reroll(s)); assert.throws(() => reroll(s));
  s = choose(G, s, 4); assert.equal(s.phase, 'draft'); assert.equal(used(s).size, 0);
  assert.throws(() => choose(G, s, 0)); assert.throws(() => choose(G, start(42, 1990), 8));
});

test('Squad revelation exposes the full pool and never fills slots; one re-spin before a pick', () => {
  const s = open(); assert.equal(used(s).size, 0); assert.equal(G.cards[s.combo].length, 18);
  const r = spin(G, s, true); assert.notEqual(r.combo, s.combo); assert.equal(r.squadReroll, 1);
  assert.throws(() => spin(G, r, true)); assert.throws(() => spin(G, r));
  const t = place(G, s, G.cards[s.combo][0].p, 0);
  assert.throws(() => spin(G, t, true)); assert.equal(used(t).size, 1);
});

test('Position previews show goalkeeper/outfield loss and exempt bench; rating uses same math', () => {
  const s = open(), c = G.cards[s.combo][0];
  assert.equal(c.pos[0], 'GK'); assert.equal(preview(G, s, c.p, 1).f, 0.75);
  const b = preview(G, s, c.p, 11); assert.equal(b.f, 0);
  const p = preview(G, s, c.p, 0), t = place(G, s, c.p, 0), r = rate(team(G, t), t.D);
  assert.equal(r.xi[0].a, p.a); assert.equal(shape(G, '4-4-2').length, 11);
});

test('The person identity rule covers different clubs/decades and occupied slots reject placement', () => {
  let s = open(); const p = G.cards[s.combo][0].p;
  s = place(G, s, p, 0); const q = G.cards[s.combo].find(c => c.p !== p).p;
  assert.throws(() => place(G, s, q, 0)); assert.throws(() => place(G, s, p, 1));
  const k = Object.keys(G.cards).find(k => k !== s.combo && G.cards[k].some(c => c.p === p));
  assert.throws(() => place(G, { ...s, combo: k }, p, 1));
  assert.throws(() => place(G, s, 'unknown-person', 1));
});

test('Five spins require fifteen manual placements; free swaps retain all people and saved progress', () => {
  let s = choose(G, start(141, 1990), 2);
  for (let n = 0; n < 5; n++) {
    s = spin(G, s);
    assert.equal(s.spin, n); assert.equal(used(s).size, n * 3);
    for (let j = 0; j < 3; j++) {
      const p = G.cards[s.combo].find(c => !used(s).has(c.p)).p;
      s = place(G, s, p, 14 - (n * 3 + j));
      s = valid(G, JSON.parse(JSON.stringify(s)));
    }
  }
  assert.equal(s.phase, 'review'); assert.equal(s.spin, 5); assert.equal(used(s).size, 15);
  const t = swap(s, 0, 14); assert.equal(t.slots[14].p, s.slots[0].p); assert.deepEqual([...used(t)].sort(), [...used(s)].sort());
  assert.equal(valid(G, t).phase, 'review'); assert.throws(() => spin(G, t));
  assert.throws(() => swap({ ...t, phase: 'results' }, 0, 1));
});

test('Corrupt resume rejects duplicate identities, counters, fake clubs and incompatible managers', () => {
  const s = open();
  let t = place(G, s, G.cards[s.combo][0].p, 0);
  assert.throws(() => valid(G, { ...t, slots: t.slots.map((c, i) => i === 1 ? t.slots[0] : c), picked: 2 }));
  assert.throws(() => valid(G, { ...t, picked: 0 }));
  assert.throws(() => valid(G, { ...t, combo: 'missing:1980' }));
  assert.throws(() => valid(G, { ...t, manager: { nm: 'missing', f: '4-4-2' } }));
  assert.throws(() => valid(G, { ...t, mode: { ci: 21 } }));
  assert.equal(valid(G, t).slots[0].p, t.slots[0].p);
});
