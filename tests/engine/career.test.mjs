import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../app/engine/index.js';
import * as Dr from '../../app/draft.js';
import * as C from '../../app/career.js';
import * as R from '../../app/run.js';
import * as Club from '../../app/club.js';
import { S } from './fixtures.mjs';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
if (G.params) E.cfg(G.params);
function draft(seed = 17, D = 1990, cap = false) {
  let s = Dr.choose(G, Dr.start(seed, D, cap), 0);
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    for (let j = 0; j < 3; j++) {
      const p = G.cards[s.combo].find(c => Dr.can(G, s, c.p)).p;
      s = Dr.place(G, s, p, s.slots.findIndex(c => !c));
    }
  }
  return s;
}
const d = draft(), newCareer = () => C.careerStart(G, d);
const rest = s => C.careerTake(G, s, C.careerOffers(G, s).findIndex(o => o.kind === 'rest'));

test('the career requires fifteen cards and covers the club league for the available decade', () => {
  assert.throws(() => C.careerStart(G, { ...d, slots: d.slots.slice(1) }), /fifteen|finished/i);
  const s = newCareer();
  assert.deepEqual(s.years, Club.years(G, s.lg, d.D));
  assert.equal(s.years.length, 10);
  assert.equal(s.S.s, s.years[0]);
  assert.ok(s.S.ord.includes(d.manager.q));
  assert.equal(s.pat, 8);
  assert.equal(s.ph, 'half');
  assert.deepEqual(C.validCareer(G, s, d.manager, d.cap), s);
});

test('the expectation scale pays the eight Eraball patience steps including par and both extremes', () => {
  const X = [0, 2, 4, 7, 10.5, 12, 13, 18];
  const actual = x => x <= 10.5 ? x * 18 / 10.5 : 18 + (x - 10.5) * 12 / 7.5;
  assert.deepEqual(X.map(x => C.careerDelta(actual(x), 18, 30)), [-5, -4, -3, -2, 0, 1, 2, 3]);
  assert.equal(C.careerDelta(18, 18, 30), 0);
});

test('a winter save resumes deterministically and playing a half leaves the prior state untouched', () => {
  const s = newCareer(), saved = JSON.stringify(s), t = C.careerPlayHalf(G, s);
  assert.equal(JSON.stringify(s), saved);
  assert.equal(t.half, 1);
  assert.ok(['node', 'fired'].includes(t.ph));
  assert.deepEqual(C.careerPlayHalf(G, s), t);
  if (t.ph === 'fired') return;
  const a = rest(t), b = rest(C.validCareer(G, JSON.parse(JSON.stringify(t)), d.manager, d.cap));
  assert.equal(a.ph, 'repo');
  const resumed = C.careerNext(G, b), ready = C.careerNext(G, a);
  assert.equal(ready.y, 0);
  assert.equal(ready.ph, 'half');
  assert.deepEqual(C.careerPlayHalf(G, ready), C.careerPlayHalf(G, resumed));
  assert.throws(() => C.careerPlayHalf(G, t), /window|reward/i);
});

test('the season objective, cabinet and season history are resolved after the run-in', () => {
  let s = C.careerPlayHalf(G, { ...newCareer(), pat: 20 });
  const j = C.careerOffers(G, s).findIndex(o => o.kind === 'dev' && o.cost < s.pat && o.id !== 'upg');
  s = C.careerNext(G, C.careerTake(G, s, j));
  s = C.careerPlayHalf(G, s);
  assert.equal(s.half, 2);
  assert.equal(s.history.length, 1);
  const h = s.history[0], boss = s.log.find(e => e.t === 'boss');
  assert.equal(boss.won, h.pos <= s.S.obj.t);
  assert.equal(boss.dp, boss.won ? 4 : -4);
  const p = boss.mvp || boss.lvp;
  if (p) assert.equal(s.mv[p], boss.won ? 1 : -1);
  assert.equal(h.real.n, s.S.ord.length);
  assert.equal(h.w + h.d + h.l, 2 * (s.S.ord.length - 1));
  assert.deepEqual(s.trophies.map(t => t.k), h.trophies);
  assert.ok(s.node.free >= 0);
  assert.deepEqual(C.validCareer(G, s, d.manager, d.cap), s);
});

test('desperation signings at two patience are free but paid rewards preserve the last point', () => {
  let s = C.careerPlayHalf(G, { ...newCareer(), pat: 20 });
  s = { ...s, pat: 2 };
  const O = C.careerOffers(G, s), j = O.findIndex(o => o.kind === 'desp');
  assert.ok(j >= 0);
  const t = C.careerTake(G, s, j, { pick: 0, slot: 14 });
  assert.equal(t.pat, 2);
  assert.equal(t.slots[14].p, O[j].list[0].p);
  const k = O.findIndex(o => o.kind === 'dev' && o.cost >= 2);
  assert.ok(k >= 0);
  assert.throws(() => C.careerTake(G, s, k), /patience/i);
});

test('each trophy grants an extra free reward without consuming patience', () => {
  const base = C.careerPlayHalf(G, { ...newCareer(), pat: 20 });
  const s = { ...base, pat: 8, node: { ...base.node, left: 2, free: 1 } };
  const O = C.careerOffers(G, s), j = O.findIndex(o => o.kind === 'dev' && o.id !== 'upg');
  assert.ok(j >= 0);
  const t = C.careerTake(G, s, j);
  assert.equal(t.pat, s.pat);
  assert.equal(t.node.left, 1);
  assert.equal(t.node.free, 0);
  assert.equal(t.ph, 'node');
});

test('a summer window swaps two distinct people, keeps tiers and repositions before the next season', () => {
  const initial = newCareer();
  const s = { ...initial, ph: 'hop', half: 2, S: { ...initial.S, h: 2 }, pat: 12 };
  const H = C.careerHopPools(G, s);
  assert.equal(H.old.length, 3);
  assert.equal(H.neu.length, 3);
  assert.equal(new Set([...H.old, ...H.neu].map(c => c.p)).size, 6);
  assert.throws(() => C.careerHop(G, s, { old: [0], neu: [0], out: [14, 14] }), /different|distinct/i);
  const t = C.careerHop(G, s, { old: [0], neu: [0], out: [13, 14] });
  assert.equal(t.ph, 'repo');
  assert.equal(t.pat, 12);
  assert.equal(new Set(t.slots.map(c => c.p)).size, 15);
  const u = C.careerNext(G, C.careerSwap(t, 0, 11));
  assert.equal(u.y, 1);
  assert.equal(u.S.s, initial.years[1]);
  assert.equal(u.ph, 'half');
  assert.equal(u.slots[11].p, t.slots[0].p);
});

test('career save validation rejects malformed state, fixture scores and player references', () => {
  const s = newCareer();
  const bad = [{ v: 99 }, { lg: 'missing' }, { q: 'missing' }, { y: 99 }, { years: [] },
    { half: 2 }, { pat: -1 }, { tags: null }, { mv: { missing: 1 } }, { log: [null] },
    { node: null }, { ph: 'done' }, { slots: [...s.slots.slice(0, 14), s.slots[0]] },
    { S: { ...s.S, L: { ...s.S.L, rows: [[s.q, -1, 0, 0, 0, 0, 0, 0]] } } },
    { S: { ...s.S, me: [{ k: 'L', gf: '<img>', ga: 0 }] } }];
  for (const patch of bad) assert.throws(() => C.validCareer(G, { ...s, ...patch }, d.manager, d.cap));
  assert.throws(() => C.validCareer(G, s, d.manager, !d.cap), /cap/i);
});

test('a trophy pick reserves no paid signing fee when scouting but keeps the last patience point', () => {
  const earned = C.careerPlayHalf(G, newCareer());
  const s = { ...earned, pat: 2, node: { ...earned.node, left: 2, free: 1 } };
  const scout = C.careerRespin(G, s);
  assert.equal(scout.pat, 1); assert.equal(scout.fa, 1); assert.equal(scout.node.free, 1);
  assert.equal(C.careerRespin(G, { ...s, pat: 6 }, true).pat, 1);
  assert.throws(() => C.careerRespin(G, { ...s, pat: 1 }), /Needs 2/);
  assert.throws(() => C.careerRespin(G, { ...s, node: { left: 1, free: 0, window: 'winter' } }), /Needs 3/);
});

test('career price uses the same negotiation and every-second-season surcharge as Gauntlet', () => {
  const s = { ...newCareer(), y: 4, ph: 'node', node: { window: 'winter', left: 1, free: 0 } };
  const f = { ...s.slots[0], r: Dr.hydrate(G, s.slots[0]).r };
  assert.equal(C.careerPrice(G, s, f, 0), R.price(G, { ...s, act: 4, map: 'odyssey' }, f, 0));
  assert.deepEqual(C.careerBill(G, s), R.bill(G, s));
});

test('prime upgrades keep the same person and retain the original tier charge on capped careers', () => {
  const capped = draft(31, 1990, true);
  const base = C.careerPlayHalf(G, { ...C.careerStart(G, capped), pat: 20 });
  let dealt = null;
  for (let seed = 0; seed < 100 && !dealt; seed++) {
    const s = { ...base, seed }, O = C.careerOffers(G, s), j = O.findIndex(o => o.id === 'upg');
    if (j >= 0) dealt = { s, O, j };
  }
  assert.ok(dealt);
  const u = dealt.O[dealt.j].list[0], t = C.careerTake(G, dealt.s, dealt.j);
  assert.equal(t.slots[u.i].p, u.from.p);
  assert.equal(t.slots[u.i].k, R.versions(G, u.from.p)[0].k);
  assert.equal(C.careerBill(G, t)[u.i].k, u.from.k);
  assert.equal(t.pat, dealt.s.pat - u.cost);
  assert.deepEqual(C.validCareer(G, t, capped.manager, true), t);
});

test('a one-season archive completes after the summer rewards and grants no nonexistent transfer window', () => {
  const s0 = newCareer(), year = s0.years[0], archive = { ...G, ec: { ...G.ec, [year]: [[s0.q, s0.lg, 0.5]] },
    lg: { ...G.lg, [s0.lg]: { ...G.lg[s0.lg], S: { [year]: G.lg[s0.lg].S[year] } } } };
  let s = C.careerStart(archive, d);
  s = C.careerPlayHalf(archive, { ...s, pat: 20 });
  const choose = s => {
    const O = C.careerOffers(archive, s), j = O.findIndex(o => o.kind === 'rest');
    return C.careerTake(archive, s, j >= 0 ? j : O.findIndex(o => o.kind === 'dev' && o.id !== 'upg' && o.cost < s.pat));
  };
  while (s.ph === 'node') s = choose(s);
  s = C.careerPlayHalf(archive, C.careerNext(archive, s));
  while (s.ph === 'node') s = choose(s);
  assert.equal(s.ph, 'done');
  assert.equal(s.history.length, 1);
  assert.equal(C.careerHopPools(archive, s), null);
  assert.equal(C.careerScore(s).seasons, 1);
  assert.equal(s.history[0].real.ec, 0.5, 'the real archive uses half-stage values for early European exits');
  assert.deepEqual(C.validCareer(archive, s, d.manager, d.cap), s);
});

test('malformed competition groups and altered real league membership cannot be resumed', () => {
  const s = newCareer(), K = Object.values(s.S.K).find(k => k.f === 'g');
  if (K) assert.throws(() => C.validCareer(G, { ...s, S: { ...s.S, K: { ...s.S.K, [K.k]: { ...K, n: 'bad' } } } }, d.manager, d.cap));
  const outside = Object.keys(G.clubs).find(id => !s.S.ord.includes(id));
  const ord = s.S.ord.slice(), idx = ord.findIndex(id => id !== s.q), old = ord[idx]; ord[idx] = outside;
  const rows = s.S.L.rows.map(r => r[0] === old ? [outside, ...r.slice(1)] : r);
  const seed = s.S.seed.map(id => id === old ? outside : id);
  assert.throws(() => C.validCareer(G, { ...s, S: { ...s.S, ord, seed, L: { ...s.S.L, rows } } }, d.manager, d.cap));
});

test('opponent provenance exposes season players or explicitly labelled stand-ins and removes drafted people', () => {
  const s = newCareer(), source = C.careerSource(G, s), mine = new Set(s.slots.map(c => c.p));
  assert.ok(source.some(c => c.id === s.q));
  for (const c of source.filter(c => c.id !== s.q)) {
    assert.equal(c.roster.length, 15);
    assert.ok(c.roster.every(p => !mine.has(p.id)));
    if (c.si) assert.match(c.source, /Stand-in/);
    else assert.ok(['season', 'nearby'].includes(c.src));
  }
});

test('a save cannot fabricate completed matchdays, pending rewards or a different season result', () => {
  const s = newCareer(), bad = [
    { S: { ...s.S, L: { ...s.S.L, md: 1 } } },
    { node: { ...s.node, left: 1 } },
    { fa: 1 },
  ];
  for (const patch of bad) assert.throws(() => C.validCareer(G, { ...s, ...patch }, d.manager, d.cap));
  let t = C.careerPlayHalf(G, { ...s, pat: 20 });
  const O = C.careerOffers(G, t), j = O.findIndex(o => o.kind === 'dev' && o.id !== 'upg' && o.cost < t.pat);
  t = C.careerPlayHalf(G, C.careerNext(G, C.careerTake(G, t, j)));
  assert.throws(() => C.validCareer(G, { ...t, history: [{ ...t.history[0], pts: t.history[0].pts + 1 }] }, d.manager, d.cap));
  const rows = t.S.L.rows.map((r, i) => i === 0 ? [r[0], ...r.slice(1, 5), r[5] + 1, ...r.slice(6)] : r);
  assert.throws(() => C.validCareer(G, { ...t, S: { ...t.S, L: { ...t.S.L, rows } } }, d.manager, d.cap));
  assert.throws(() => C.validCareer(G, { ...t, lost: t.lost + 1 }, d.manager, d.cap));
  const log = t.log.map(e => e.t === 'seg' ? { ...e, w: e.w + 1 } : e);
  assert.throws(() => C.validCareer(G, { ...t, log }, d.manager, d.cap));
});

// Four clubs and ten seasons make all career phases and save boundaries cheap to exercise. The
// controlled favourite keeps the test about progression and tier charges rather than balance.
function smallArchive(cap) {
  const Q = ['q0', 'q1', 'q2', 'q3'], years = Array.from({ length: 10 }, (_, i) => 1990 + i);
  const people = {}, cards = {}, tiers = [92, 87, 87, 82, 82, 87, 82, 82, 77, 92, 87, 77, 77, 72, 72];
  const positions = [...S.map(s => s.s), 'GK', 'CB', 'CM', 'ST'];
  Q.forEach((q, k) => {
    cards[`${q}:1990`] = positions.map((pos, i) => {
      const p = `${q}-${i}`; people[p] = { nm: p };
      return { p, r: k === 0 ? (cap ? tiers[i] : 92) : 48, pos: [pos], a: 1990, b: 1999, n: 20, tg: {}, s: 'fixture' };
    });
  });
  const manager = { nm: 'Fixture manager', f: ['4-4-2'], ga: 'C', gd: 'C', sig: [], t: [['q0', 1990, 1999]] };
  const A = { managers: [manager], people, cards, formations: { '4-4-2': S },
    clubs: Object.fromEntries(Q.map(q => [q, { nm: q, cc: 'ENG' }])),
    combos: Q.map((q, k) => ({ q, D: 1990, k: k + 1 })), ec: {}, xn: {},
    lg: { ENG: { s3: 1995, S: Object.fromEntries(years.map(y => [y, Q.map((q, k) => [q, (y >= 1995 ? 3 : 2) * (6 - 2 * k), 6, 6 - 2 * k, 0, 2 * k])])) } } };
  const draft = { seed: 41, D: 1990, cap, manager: { nm: manager.nm, q: 'q0', a: 1990 }, f: '4-4-2',
    slots: cards['q0:1990'].map(c => ({ k: 'q0:1990', p: c.p })) };
  return { A, draft };
}
test('Classic and capped careers finish all ten seasons and every intermediate save resumes', () => {
  for (const cap of [false, true]) {
    const { A, draft } = smallArchive(cap);
    let s = C.careerStart(A, draft), steps = 0;
    while (!['done', 'fired'].includes(s.ph) && steps++ < 180) {
      assert.deepEqual(C.validCareer(A, JSON.parse(JSON.stringify(s)), draft.manager, cap), s);
      if (s.ph === 'half') s = C.careerPlayHalf(A, s);
      else if (s.ph === 'node') {
        const O = C.careerOffers(A, s), rest = O.findIndex(o => o.kind === 'rest');
        const dev = O.findIndex(o => o.kind === 'dev' && o.cost < s.pat);
        s = C.careerTake(A, s, rest >= 0 ? rest : dev);
      } else if (s.ph === 'hop') s = C.careerHop(A, s, { old: [], neu: [], out: [] });
      else s = C.careerNext(A, s);
    }
    assert.equal(s.ph, 'done');
    assert.equal(s.history.length, 10);
    assert.equal(s.log.filter(e => e.t === 'seg').length, 20);
    assert.equal(s.log.filter(e => e.t === 'boss').length, 10);
    assert.deepEqual(C.validCareer(A, s, draft.manager, cap), s);
    assert.ok(C.careerScore(s).score > 0);
  }
});
