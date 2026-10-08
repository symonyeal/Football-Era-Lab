// G literal rated cards; d complete capped draft; s Gauntlet; j reward index; ref card reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Dr from '../../app/draft.js';
import * as Rn from '../../app/run.js';
import * as E from '../../app/engine/index.js';

const S = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'].map((s, i) => [s, 10 + i * 7, 50]);
const G = { people: {}, cards: {}, combos: [{ q: 'q0', D: 1990, k: 1 }, { q: 'q1', D: 2000, k: 2 }, { q: 'q1', D: 1960, k: 1 }],
  managers: [{ nm: 'Manager', f: ['4-4-2'], ga: 'B', gd: 'B', sig: [] }], formations: { '4-4-2': { slots: S } } };
const rs = [94, 92, 89, 88, 86, 85, 84, 83, 81, 80, 79, 78, 76, 74, 72];
G.cards['q0:1990'] = rs.map((r, i) => { const p = `p${i}`; G.people[p] = { nm: p }; return { p, r, pos: ['ST'], tg: {} }; });
G.cards['q1:2000'] = [{ p: 'p13', r: 95, pos: ['ST'], tg: {} }, ...[91, 87, 82, 77, 71].map((r, i) => {
  const p = `f${i}`; G.people[p] = { nm: p }; return { p, r, pos: ['ST'], tg: {} };
})];
G.cards['q1:1960'] = G.cards['q1:2000'].filter(c => c.p.startsWith('f'));
const d = { manager: { nm: 'Manager', f: '4-4-2' }, cap: true, slots: rs.map((r, i) => ({ k: 'q0:1990', p: `p${i}` })) };
const reward = seed => ({ ...Rn.runNew(seed, d), ph: 'node', rd: 0, pat: 20 });

test('an earned prime boost retains the original tier charge and cannot erase cap mode', () => {
  let s, O, j;
  for (let seed = 0; seed < 40; seed++) {
    s = reward(seed); O = Rn.offers(G, {}, s); j = O.findIndex(o => o.id === 'upg');
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
  H.cards['q1:1960'] = H.cards['q1:2000'];
  return H;
};
const signing = (H, run) => {
  for (let seed = 0; seed < 40; seed++) {
    const s = run(seed), O = Rn.offers(H, {}, s), j = O.findIndex(o => o.kind === 'market');
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

test('capped B and C signings can replace any tier, and a Classic run has no cap', () => {
  for (const r of [82, 77]) for (const slot of [0, 2, 6, 10, 13]) {
    const H = at(r), { s, O, j } = signing(H, reward);
    assert.equal(Rn.take(H, {}, s, j, { pick: 0, slot }).slots[slot].p, O[j].list[0].p, `${r} over slot ${slot}`);
  }
  const H = at(95), { s, O, j } = signing(H, seed => ({ ...Rn.runNew(seed, { ...d, cap: false }), ph: 'node', rd: 0, pat: 20 }));
  assert.equal(Rn.take(H, {}, s, j, { pick: 0, slot: 6 }).slots[6].p, O[j].list[0].p);
});

test('MVP points and signing terms change slot-rated strength while preserving position fit', () => {
  const H = structuredClone(G);
  for (const Q of Object.values(H.cards)) for (const c of Q) c.sr = E.SL.map(s => s === 'CB' ? c.r * 0.65 : c.r);
  const s = Rn.runNew(0, d), p = s.slots[0].p;
  const c = Rn.runTeam(H, { ...s, mv: { [p]: 1 } }).xi[0];
  assert.equal(E.av(c, 'ST', 1990), 95);
  assert.ok(Math.abs(E.av(c, 'CB', 1990) - 61.75) < 1e-9);
  const slots = s.slots.slice(); [slots[0], slots[13]] = [slots[13], slots[0]];
  const T = Rn.runTeam(H, { ...s, slots, neg: { p13: 'C', p0: 'S' } });
  assert.equal(E.av(T.xi[0], 'ST', 1990), 77);
  assert.equal(E.av(T.bn[2], 'ST', 1990), 91);
});

test('full patience still offers two developments when only one is fresh', () => {
  const s = { ...reward(0), cap: false, badge: { glue: 0, mgr: 2 }, last: ['euro'] };
  s.slots[13] = { k: 'q1:2000', p: 'p13' };
  s.tags = Object.fromEntries(s.slots.map(c => [c.p, { bg: 3, tl: 1, vs: 2, ss: 2, tal: 1, rock: 1, mae: 1, poa: 1 }]));
  s.tags.p0.bg = 2;
  const O = Rn.offers(G, {}, s);
  assert.deepEqual(O.filter(o => o.kind === 'dev').map(o => o.id), ['glue', 'euro']);
  assert.ok(O.every(o => o.kind !== 'rest'));
});

test('market negotiation changes signing costs and C starter terms survive a lineup swap', () => {
  const H = at(91), { s, O, j } = signing(H, reward), f = O[j].list[0];
  assert.equal(Rn.price(H, s, f, 0), 2);
  assert.equal(Rn.price(H, s, f, 11), 3);
  const tags = Object.fromEntries(s.slots.slice(0, 5).map(c => [c.p, { bg: 1 }]));
  assert.equal(Rn.price(H, { ...s, tags }, f, 0), 1);
  assert.equal(Rn.price(H, { ...s, tags }, f, 11), 2);
  const C = at(77), c = signing(C, reward), t = Rn.take(C, {}, c.s, c.j, { slot: 0 });
  const p = t.slots[0].p;
  assert.equal(t.pat, 19);
  assert.equal(Rn.runTeam(C, t).xi[0].r, 80);
  const u = Rn.runSwap({ ...t, ph: 'repo' }, 0, 11);
  assert.equal(Rn.runTeam(C, u).bn[0].r, 77);
});

test('a later act adds its surcharge to signings and market re-spins happen only once', () => {
  const H = at(91), { s, O } = signing(H, reward), f = O[0].list[0];
  assert.equal(Rn.price(H, { ...s, act: 1 }, f, 0), 3);
  assert.equal(Rn.price(H, { ...s, map: 'odyssey', act: 1 }, f, 0), 2);
  assert.equal(Rn.price(H, { ...s, map: 'odyssey', act: 2 }, f, 0), 3);
  const t = Rn.respin(H, {}, s);
  assert.equal(t.pat, 19);
  assert.equal(t.ph, 'node');
  assert.ok(Rn.offers(H, {}, t).find(o => o.kind === 'market').re === false);
  assert.throws(() => Rn.respin(H, {}, t), /once/);
  const u = Rn.respin(H, {}, s, true);
  assert.equal(u.pat, 15);
  assert.ok(Rn.offers(H, {}, u).find(o => o.kind === 'market').list.every(c => c.r >= 85));
  assert.throws(() => Rn.respin(H, {}, { ...s, pat: 7 }, true), /8 patience/);
});

test('two purchases develop the stronger Talisman tier and then remove that player from eligibility', () => {
  let s = { ...reward(0), pat: 19 };
  for (const want of [2, 1]) {
    let j = -1;
    for (let seed = 0; seed < 40 && j < 0; seed++) {
      s = { ...s, seed, ph: 'node', last: [] };
      j = Rn.offers(G, {}, s).findIndex(o => o.id === 'tal');
    }
    assert.ok(j >= 0);
    const p = s.slots[0].p, t = Rn.take(G, {}, s, j, { player: 0 });
    assert.equal(t.tags[p].tal, want);
    assert.equal(t.pat, s.pat - 4);
    s = t;
  }
  s = { ...s, ph: 'node', last: [] };
  for (let seed = 0; seed < 40; seed++) {
    const o = Rn.offers(G, {}, { ...s, seed }).find(o => o.id === 'tal');
    if (o) assert.ok(!o.who.includes(0));
  }
});
