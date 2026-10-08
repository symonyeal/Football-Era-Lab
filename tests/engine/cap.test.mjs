// G six clubs with literal tier boundaries; s draft; p person; i slot; Q archive cards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Dr from '../../app/draft.js';
import * as E from '../../app/engine/index.js';
import * as Pl from '../../app/play.js';
import * as Rn from '../../app/run.js';

const S = ['GK', 'LB', 'CB', 'CB', 'RB', 'LM', 'CM', 'CM', 'RM', 'ST', 'ST'].map((s, i) => [s, 10 + i * 7, 50]);
const G = { meta: { v: 'cap-test' }, clubs: {}, people: {}, cards: {}, combos: [],
  managers: Array.from({ length: 6 }, (_, i) => ({ nm: `Manager ${i}`, f: ['4-4-2'], ga: 'B', gd: 'B', sig: [], t: [[`q${i}`, 1990, 1993]] })),
  formations: { '4-4-2': { slots: S } } };
for (let q = 0; q < 6; q++) {
  const k = `q${q}:1990`;
  G.clubs[`q${q}`] = { nm: `Club ${q}`, cc: 'ENG' };
  G.combos.push({ q: `q${q}`, D: 1990, k: q + 1 });
  G.cards[k] = [94, 92, 90, 89.9, 88, 86, 85, 84.9, 83, 81, 80, 79.9, 78, 76, 75, 74.9, 72, 68, 60].map((r, j) => {
    const p = `p${q}_${j}`; G.people[p] = { nm: p };
    return { p, r, pos: ['ST'], tg: {}, s: 'f' };
  });
}
G.lg = { ENG: { nm: 'England', S: { 1990: Object.keys(G.clubs).map(q => [q]) } } };
const open = () => Dr.spin(G, Dr.choose(G, Dr.start(25, 1990, true), 0));
const bundle = () => (bundle.G ||= JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8')));

test('a third S card cannot be drafted even to the bench or outside its era', () => {
  let s = open();
  s = Dr.place(G, s, G.cards[s.combo][0].p, 11);
  s = Dr.place(G, s, G.cards[s.combo][1].p, 12);
  const before = JSON.stringify(s);
  assert.throws(() => Dr.place(G, s, G.cards[s.combo][2].p, 13), /S.*tier|S.*cap/i);
  assert.equal(JSON.stringify(s), before);
});

test('base rating sets tier at the exact boundary; cap counts survive swaps and reloads', () => {
  let s = open();
  const Q = G.cards[s.combo];
  s = Dr.place(G, s, Q[2].p, 0); // 90 is S even with the large goalkeeper fit loss.
  s = Dr.place(G, s, Q[3].p, 1); // 89.9 is A.
  s = Dr.place(G, s, Q[7].p, 2); // 84.9 is B.
  assert.equal(s.cap, true);
  assert.deepEqual(Dr.room(G, s), { S: 1, A: 3, B: 3, C: 3, D: 2 });
  const t = Dr.valid(G, JSON.parse(JSON.stringify(Dr.swap(s, 0, 14))));
  assert.equal(t.cap, true);
  assert.deepEqual(Dr.room(G, t), { S: 1, A: 3, B: 3, C: 3, D: 2 });
});

test('a capped draw and each allowed pick leave enough legal players to finish its batch', () => {
  const H = structuredClone(G);
  H.cards['q0:1990'] = H.cards['q0:1990'].filter(c => c.r < 75); // four D cards, but only two D places.
  let s = Dr.spin(H, Dr.choose(H, Dr.start(7, 1990, true), 0));
  assert.notEqual(s.combo, 'q0:1990');
  for (let j = 0; j < 3; j++) {
    const Q = H.cards[s.combo].filter(c => Dr.can(H, s, c.p));
    assert.ok(Q.length, `no legal pick at ${j}`);
    s = Dr.place(H, s, Q.at(-1).p, j);
  }
  assert.equal(s.spin, 1);
});

test('a draw follows the declared decade and strength weights, and a weaker club still appears', () => {
  const H = { ...G, combos: [{ q: 'strong', D: 1990, k: 1 }, { q: 'other', D: 1990, k: 21 }, { q: 'strong', D: 1980, k: 1 }] };
  const w = (D, k) => Math.exp(-Math.abs(D - 1990) / (10 * Dr.DW.rho)) * Math.exp(-(k - 1) / Dr.DW.tau);
  const p = w(1990, 21) / (w(1990, 1) + w(1990, 21) + w(1980, 1));
  const r = E.mk(731), N = 6000;
  let n = 0;
  for (let i = 0; i < N; i++) if (Dr.draw(H, r, () => true, 1990).q === 'other') n++;
  assert.ok(Math.abs(n / N - p) < 0.025, `other drawn ${n / N}, declared ${p}`);
});

test('a club cannot recur in another decade or be the target of its own re-spin', () => {
  let s = Dr.choose(G, Dr.start(888, 1990), 0);
  const Q = new Set();
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    const q = s.combo.split(':')[0];
    assert.ok(!Q.has(q), `${q} repeated`); Q.add(q);
    for (let j = 0; j < 3; j++) s = Dr.place(G, s, G.cards[s.combo].find(c => !Dr.used(s).has(c.p)).p, n * 3 + j);
  }
  assert.equal(Q.size, 5);
});

test('a discarded club stays out of later spins after a save and reload', () => {
  for (let seed = 0; seed < 12; seed++) {
    let s = Dr.spin(G, Dr.choose(G, Dr.start(seed, 1990), 0));
    const q = s.combo.split(':')[0];
    s = Dr.valid(G, Dr.spin(G, s, true));
    for (let n = 0; n < 5; n++) {
      if (!s.combo) s = Dr.spin(G, s);
      assert.notEqual(s.combo.split(':')[0], q, `discarded ${q} returned for seed ${seed}`);
      for (let j = 0; j < 3; j++) s = Dr.place(G, s, G.cards[s.combo][j].p, n * 3 + j);
      s = Dr.valid(G, JSON.parse(JSON.stringify(s)));
    }
  }
});

test('import cannot mark an over-cap classic roster as salary cap', () => {
  let s = Dr.choose(G, Dr.start(88, 1990), 0);
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    for (let j = 0; j < 3; j++) s = Dr.place(G, s, G.cards[s.combo][j].p, n * 3 + j);
  }
  assert.throws(() => Dr.valid(G, { ...s, cap: true }), /cap|tier/i);
  assert.throws(() => Dr.valid(G, { ...s, cap: 'yes' }), /cap/i);
  assert.equal(Dr.valid(G, s).phase, 'review');
});

test('placement preview includes actual teammate links and a signature manager upgrade', () => {
  const H = structuredClone(G);
  let s = Dr.spin(H, Dr.choose(H, Dr.start(25, 1990, true), 0));
  const Q = H.cards[s.combo];
  H.people[Q[1].p].duo = [Q[0].p];
  H.managers.find(m => m.nm === s.manager.nm).sig = [Q[1].p];
  s = Dr.place(H, s, Q[0].p, 9);
  const v = Dr.preview(H, s, Q[1].p, 10);
  assert.equal(v.b, 4); // 3 for the listed partner, 1 for a nearby club-decade teammate.
  assert.equal(v.a, 96); // 92 base + 4 links in a natural ST slot, at home in 1990.
  assert.equal(v.gA, 'A');
  assert.equal(v.up, true);
  const n = Dr.place(H, s, Q[1].p, 10), R = E.rate(Dr.team(H, n), n.D);
  assert.equal(R.xi[10].a, v.a);
});

test('bundled capped drafts finish with all fifteen allowances and five different clubs', () => {
  const H = bundle();
  for (const D of Dr.DECADES) for (let n = 0; n < 5; n++) {
    let s = Dr.choose(H, Dr.start(100 + n, D, true), 0);
    for (let b = 0; b < 5; b++) {
      s = Dr.spin(H, s);
      for (let j = 0; j < 3; j++) {
        const p = H.cards[s.combo].filter(c => Dr.can(H, s, c.p)).at(n % 2 ? -1 : 0)?.p;
        assert.ok(p, `no choice for ${D}, seed ${100 + n}, spin ${b}`);
        s = Dr.place(H, s, p, b * 3 + j);
      }
    }
    assert.equal(s.phase, 'review');
    assert.equal(new Set(s.history.map(k => k.split(':')[0])).size, 5);
    assert.deepEqual(Dr.room(H, s), { S: 0, A: 0, B: 0, C: 0, D: 0 });
    assert.equal(Dr.valid(H, s).cap, true);
    const t = Pl.uncode(H, Pl.code(H, s));
    assert.equal(t.cap, true);
    assert.deepEqual(t.slots, s.slots);
  }
});

test('a released and re-signed player retains the latest signing charge when boosted again', () => {
  const H = bundle();
  let s = Dr.choose(H, Dr.start(100, 1990, true), 0);
  for (let b = 0; b < 5; b++) {
    s = Dr.spin(H, s);
    for (let j = 0; j < 3; j++) s = Dr.place(H, s, H.cards[s.combo].find(c => Dr.can(H, s, c.p)).p, b * 3 + j);
  }
  s.phase = 'results';
  const i = s.slots.findIndex(ref => Rn.versions(H, ref.p).some(v => v.k !== ref.k));
  assert.ok(i >= 0);
  const ref = s.slots[i], old = Rn.versions(H, ref.p).find(v => v.k !== ref.k), prime = Rn.versions(H, ref.p)[0];
  const r = Rn.runNew(s.seed, s);
  r.slots[i] = { k: prime.k, p: ref.p }; r.up[ref.p] = ref.k;
  r.log = [
    { t: 'boost', p: ref.p, from: old.k, to: prime.k, cost: 1 },
    { t: 'sign', p: ref.p, k: ref.k, out: s.slots[(i + 1) % 15].p, cost: 2 },
    { t: 'boost', p: ref.p, from: ref.k, to: prime.k, cost: 1 },
  ];
  const n = Dr.valid(H, { ...s, mode: { run: r } });
  assert.equal(n.mode.run.up[ref.p], ref.k);
});

test('a club ruled out by one player leaves every other draw on the same seed unchanged', () => {
  const H = bundle(), Q = [...new Set(H.combos.map(c => c.q))];
  for (let seed = 0; seed < 300; seed++) {
    const c = Dr.draw(H, E.mk(seed), () => true, 1990);
    const y = Q.filter(q => q !== c.q)[(seed * 7919) % (Q.length - 1)];
    assert.equal(Dr.draw(H, E.mk(seed), x => x.q !== y, 1990), c, `seed ${seed}, without ${y}`);
  }
});

test('every need at the last two spins has more supplier clubs than a draft can rule out', () => {
  // A draft rules out at most five clubs: four already drafted and one re-spun.
  const H = bundle(), T = ['S', 'A', 'B', 'C', 'D'], V = new Map();
  for (const c of H.combos) {
    const n = [0, 0, 0, 0, 0];
    for (const x of H.cards[`${c.q}:${c.D}`]) n[T.indexOf(Rn.TI(x.r))]++;
    V.set(c.q, [...(V.get(c.q) || []), n]);
  }
  const sup = n => [...V].filter(([, L]) => L.some(v => v.every((x, i) => x >= n[i]))).length;
  const needs = k => {
    const out = [], go = (i, left, v) => {
      if (i === 5) { if (!left) out.push(v.slice()); return; }
      for (let x = 0; x <= Math.min(left, Rn.CAP[T[i]]); x++) { v[i] = x; go(i + 1, left - x, v); }
    };
    go(0, k, [0, 0, 0, 0, 0]);
    return out;
  };
  for (const n of needs(3)) assert.ok(sup(n) > 5, `final spin need ${n} has ${sup(n)} clubs`);
  for (const n of needs(6)) {
    const ok = needs(3).some(a => a.every((x, i) => x <= n[i]) && Math.min(sup(a), sup(n.map((x, i) => x - a[i]))) > 5);
    assert.ok(ok, `last two spins need ${n} has no split with enough clubs`);
  }
});

test('each spin offers a player from the best tier still needed, under both rule sets', () => {
  const H = structuredClone(G);
  for (let q = 1; q < 6; q++) H.cards[`q${q}:1990`] = H.cards[`q${q}:1990`].filter(c => c.r < 90);
  for (const cap of [true, false]) for (let seed = 0; seed < 20; seed++) {
    const s = Dr.spin(H, Dr.choose(H, Dr.start(seed, 1990, cap), 0));
    assert.equal(s.combo, 'q0:1990', `seed ${seed}, ${cap ? 'Salary cap' : 'Classic'}`);
  }
});

test('with no club holding the tier still needed, a spin still finds a club that fills three places', () => {
  const H = structuredClone(G);
  for (let q = 0; q < 6; q++) H.cards[`q${q}:1990`] = H.cards[`q${q}:1990`].filter(c => c.r < 90);
  const s = Dr.spin(H, Dr.choose(H, Dr.start(3, 1990, true), 0));
  assert.ok(H.cards[s.combo].filter(c => Dr.can(H, s, c.p)).length >= 3);
});
