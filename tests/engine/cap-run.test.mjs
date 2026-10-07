// G literal rated cards; d complete capped draft; s Gauntlet; j reward index; ref card reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Dr from '../../app/draft.js';
import * as Rn from '../../app/run.js';

const S = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'].map((s, i) => [s, 10 + i * 7, 50]);
const G = { people: {}, cards: {}, combos: [{ q: 'q0', D: 1990, k: 1 }, { q: 'q1', D: 2000, k: 2 }],
  managers: [{ nm: 'Manager', f: ['4-4-2'], ga: 'B', gd: 'B', sig: [] }], formations: { '4-4-2': { slots: S } } };
const rs = [94, 92, 89, 88, 86, 85, 84, 83, 81, 80, 79, 78, 76, 74, 72];
G.cards['q0:1990'] = rs.map((r, i) => { const p = `p${i}`; G.people[p] = { nm: p }; return { p, r, pos: ['ST'], tg: {} }; });
G.cards['q1:2000'] = [{ p: 'p13', r: 95, pos: ['ST'], tg: {} }, ...[91, 87, 82, 77, 71].map((r, i) => {
  const p = `f${i}`; G.people[p] = { nm: p }; return { p, r, pos: ['ST'], tg: {} };
})];
const d = { manager: { nm: 'Manager', f: '4-4-2' }, cap: true, slots: rs.map((r, i) => ({ k: 'q0:1990', p: `p${i}` })) };
const reward = seed => ({ ...Rn.runNew(seed, d), ph: 'reward', seg: 1, pat: 20 });

test('an earned prime boost retains the original tier charge and cannot erase cap mode', () => {
  let s, O, j;
  for (let seed = 0; seed < 40; seed++) {
    s = reward(seed); O = Rn.offers(G, {}, s); j = O.findIndex(o => o.kind === 'boost');
    if (j >= 0) break;
  }
  assert.ok(j >= 0, 'boost never offered');
  const t = Rn.take(G, {}, s, j);
  assert.equal(t.cap, true);
  assert.equal(Dr.hydrate(G, t.slots[13]).r, 95);
  assert.deepEqual(Dr.room(G, { slots: Rn.bill(G, t) }), { S: 0, A: 0, B: 0, C: 0, D: 0 });
  assert.equal(t.up.p13, 'q0:1990');
});

// at(r): the free-agent club holds only the five f cards, all rated r; signing(H, run): the first sign offer.
const at = r => {
  const H = structuredClone(G);
  H.cards['q1:2000'] = H.cards['q1:2000'].filter(c => c.p.startsWith('f')).map(c => ({ ...c, r }));
  return H;
};
const signing = (H, run) => {
  for (let seed = 0; seed < 40; seed++) {
    const s = run(seed), O = Rn.offers(H, {}, s), j = O.findIndex(o => o.kind === 'sign');
    if (j >= 0) return { s, O, j };
  }
  throw new Error('signing never offered');
};

test('a capped S or A signing must keep the fifteen within 2 S-tier and 4 A-tier players', () => {
  for (const [r, bad, good] of [[91, 2, 0], [87, 6, 2], [87, 0, 3]]) {
    const H = at(r), { s, O, j } = signing(H, reward);
    assert.throws(() => Rn.take(H, {}, s, j, { pick: 0, slot: bad }), /tier|cap/i, `${r} over slot ${bad}`);
    const n = Rn.take(H, {}, s, j, { pick: 0, slot: good });
    assert.equal(n.cap, true);
    assert.equal(n.slots[good].p, O[j].list[0].p);
  }
});

test('capped B, C and D signings can replace any tier, and a Classic run has no cap', () => {
  for (const r of [82, 77, 71]) for (const slot of [0, 2, 6, 10, 13]) {
    const H = at(r), { s, O, j } = signing(H, reward);
    assert.equal(Rn.take(H, {}, s, j, { pick: 0, slot }).slots[slot].p, O[j].list[0].p, `${r} over slot ${slot}`);
  }
  const H = at(95), { s, O, j } = signing(H, seed => ({ ...Rn.runNew(seed, { ...d, cap: false }), ph: 'reward', seg: 1, pat: 20 }));
  assert.equal(Rn.take(H, {}, s, j, { pick: 0, slot: 6 }).slots[6].p, O[j].list[0].p);
});
