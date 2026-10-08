// Slot-rating fit, varied club draws and the Era Gauntlet run, on the bundled data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../app/engine/index.js';
import * as Dr from '../../app/draft.js';
import * as Rn from '../../app/run.js';
import { fields } from '../../app/data.js';
import { club } from './fixtures.mjs';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
if (G.params) E.cfg(G.params);
const F = fields(G);

// a sensible draft: best-graded manager, then the highest slot-rated value for each pick
function draft(seed, D) {
  const s0 = Dr.start(seed, D);
  let s = Dr.choose(G, s0, 0);
  const S = Dr.shape(G, s.manager.f).map(x => x.s);
  for (let n = 0; n < 5; n++) {
    s = Dr.spin(G, s);
    for (let j = 0; j < 3; j++) {
      const I = Dr.used(s), open = s.slots.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
      let b = null;
      for (const c of G.cards[s.combo].filter(c => !I.has(c.p))) {
        const h = Dr.hydrate(G, { k: s.combo, p: c.p });
        for (const i of open) {
          const v = h.r * (i < 11 ? 1 - E.ft(h, S[i]).f : 0.9);
          if (!b || v > b.v) b = { v, p: c.p, i };
        }
      }
      s = Dr.place(G, s, b.p, b.i);
    }
  }
  return s;
}

test('a card with slot ratings takes its fit from them; one without keeps the position graph', () => {
  const sr = E.SL.map(s => (s === 'ST' ? 80 : s === 'CB' ? 52 : 70));
  const c = { r: 80, pos: ['ST'], sr };
  assert.equal(E.ft(c, 'ST').f, 0);
  assert.ok(Math.abs(E.ft(c, 'CB').f - 0.35) < 1e-9);
  assert.deepEqual(E.ft({ r: 80, pos: ['ST'] }, 'CB'), E.fit(['ST'], 'CB'));
});

test('bundled cards carry fifteen slot ratings no higher than the card rating', () => {
  let n = 0;
  for (const Q of Object.values(G.cards)) for (const c of Q) if (c.sr) {
    n++;
    assert.equal(c.sr.length, 15);
    assert.ok(Math.max(...c.sr) <= c.r + 1);
  }
  assert.ok(n > 10000, `only ${n} cards carry slot ratings`);
});

test('every club and decade can be drawn, and ten clubs per decade do not crowd out the rest', () => {
  const r = E.mk(7), K = {}, Dn = {};
  for (let i = 0; i < 6000; i++) {
    const c = Dr.draw(G, r, () => true, 1980);
    K[c.k <= 10 ? 'top' : 'rest'] = (K[c.k <= 10 ? 'top' : 'rest'] || 0) + 1;
    Dn[c.D] = (Dn[c.D] || 0) + 1;
  }
  assert.ok(K.rest > K.top, 'the much larger remaining pool must not be crowded out by ten clubs');
  for (const q of new Set(G.combos.map(c => c.q))) assert.equal(Dr.draw(G, E.mk(1), c => c.q === q, 1980)?.q, q, `${q} cannot be drawn`);
  assert.ok(Dn[1980] > Dn[1950] && Dn[1980] > Dn[2020]);
  assert.equal(Object.keys(Dn).length, 8, 'every decade can still be drawn');
});

function step(s) {
  if (s.ph === 'rd') return Rn.runRound(G, F, s);
  if (s.ph === 'boss') return Rn.runPlayBoss(G, F, s);
  if (s.ph === 'repo') return Rn.nextAct(s);
  if (s.ph === 'hop') return Rn.hop(G, s, { old: [0, 1], neu: [0, 1], out: [11, 12, 13, 14] });
  const O = Rn.offers(G, F, s), rest = O.findIndex(o => o.kind === 'rest');
  const j = rest >= 0 ? rest : O.findIndex(o => o.kind === 'dev' && o.cost < s.pat);
  return Rn.take(G, F, s, j);
}

test('four rounds each require a reward before the boss tie and replay identically', () => {
  const d = draft(11, 1970);
  const go = () => {
    let s = { ...Rn.runNew(11, d), pat: 20 };
    const out = [];
    for (let k = 0; k < 9; k++) {
      s = step(s);
      out.push([s.ph, s.act, s.pat]);
      assert.ok(s.pat >= 0 && s.pat <= Rn.PAT_MAX);
    }
    return [s, out];
  };
  const [a, ta] = go(), [b, tb] = go();
  assert.deepEqual(ta, tb);
  assert.deepEqual(a.slots, b.slots);
  assert.deepEqual(ta.slice(0, 8).map(x => x[0]), ['node', 'rd', 'node', 'rd', 'node', 'rd', 'node', 'boss']);
  assert.equal(a.log.filter(e => e.t === 'seg').length, 4);
  assert.equal(a.log.filter(e => e.t === 'boss').length, 1);
});

test('a lost boss tie restarts the act against another boss and charges run-wide loss costs', () => {
  const s = { ...Rn.runNew(5, draft(5, 1990)), ph: 'boss', rd: 4, pat: 20 };
  const H = { ...F, 1960: F[1960].map((c, i) => i < 3 ? club(`strong${i}`, 150, 1960) : c) };
  const t = Rn.runPlayBoss(G, H, s), e = t.log.at(-1);
  assert.equal(e.won, false);
  assert.equal(t.act, 0);
  assert.equal(t.pat, 16);
  assert.equal(t.ph, 'rd');
  assert.equal(t.rd, 0);
  assert.notEqual(t.boss, s.boss);
  assert.equal(e.legs.length, 2);
  assert.deepEqual(e.agg, [e.legs[0][0] + e.legs[1][1], e.legs[0][1] + e.legs[1][0]]);
  assert.equal(t.mv[e.lvp], -1);
  const u = Rn.runPlayBoss(G, H, { ...t, ph: 'boss', rd: 4 });
  assert.equal(u.log.at(-1).won, false);
  assert.equal(u.pat, 10);
  assert.equal(u.lost, 2);
});

test('a won boss tie opens four free transfers before the next decade and the last boss ends the map', () => {
  const s = { ...Rn.runNew(5, draft(5, 1990)), ph: 'boss', rd: 4, pat: 8 };
  const H = Object.fromEntries(Object.entries(F).map(([D, Q]) => [D, Q.map((c, i) => i < 3 ? club(`weak${i}`, 20, Number(D)) : c)]));
  const t = Rn.runPlayBoss(G, H, s), e = t.log.at(-1);
  assert.equal(e.won, true);
  assert.equal(t.act, 0);
  assert.equal(t.ph, 'hop');
  assert.equal(t.pat, 12);
  assert.equal(t.mv[e.mvp], 1);
  const P = Rn.hopPools(G, t);
  assert.equal(P.old.length, 5);
  assert.equal(P.neu.length, 5);
  assert.equal(new Set([...P.old, ...P.neu].map(c => c.p)).size, 10);
  assert.throws(() => Rn.hop(G, t, { old: [0], neu: [0, 1], out: [11, 12, 13] }), /Sign 2/);
  const u = Rn.hop(G, t, { old: [0, 1], neu: [0, 1], out: [11, 12, 13, 14] });
  assert.equal(u.ph, 'repo');
  assert.equal(u.pat, 12);
  const v = Rn.nextAct(Rn.runSwap(u, 0, 11));
  assert.equal(v.act, 1);
  assert.equal(Rn.D_of(v), 1990);
  assert.equal(v.ph, 'rd');
  assert.equal(v.rd, 0);
  assert.equal(v.slots[0].p, P.old[0].p);
  const done = Rn.runPlayBoss(G, H, { ...v, act: 2, ph: 'boss', rd: 4 });
  assert.equal(done.ph, 'done');
  assert.equal(Rn.runBoss(H, done), null);
});

test('a boost card upgrades the same person to his best version and charges the tier cost', () => {
  const d = draft(3, 2010);
  let s = { ...Rn.runNew(3, d), ph: 'node', pat: 20, rd: 0 };
  let found = null;
  for (let t = 0; t < 40 && !found; t++) {
    const O = Rn.offers(G, F, { ...s, tries: s.tries.map((x, i) => (i === 0 ? t : x)) });
    const j = O.findIndex(o => o.id === 'upg');
    if (j >= 0) found = { O, j, s: { ...s, tries: s.tries.map((x, i) => (i === 0 ? t : x)) } };
  }
  assert.ok(found, 'no boost card was dealt in forty reward phases');
  const o = found.O[found.j].list[0], t = Rn.take(G, F, found.s, found.j);
  assert.equal(t.slots[o.i].p, o.from.p);
  assert.equal(t.slots[o.i].k, Rn.versions(G, o.from.p)[0].k);
  assert.equal(t.pat, 20 - o.cost);
  assert.ok(o.to.r > o.from.r);
  assert.deepEqual(Dr.valid(G, { ...d, phase: 'results', mode: { run: t } }).mode.run, t);
});

test('rewards never spend the last point of patience', () => {
  const d = draft(9, 1980);
  const s = { ...Rn.runNew(9, d), ph: 'node', pat: 2, rd: 0 };
  const O = Rn.offers(G, F, s);
  O.forEach((o, j) => {
    if (o.kind === 'dev' && o.cost >= 2) assert.throws(() => Rn.take(G, F, s, j, { pick: 0, slot: 14 }), /patience/);
  });
  assert.ok(O.some(o => o.kind === 'dev' && o.cost >= 2), 'the unaffordable branch was exercised');
  const j = O.findIndex(o => o.kind === 'desp');
  assert.ok(j >= 0);
  const o = O[j].list[0], slot = s.slots.findIndex((_, i) => !s.cap || Rn.TI(Dr.hydrate(G, s.slots[i]).r) === Rn.TI(o.r));
  const t = Rn.take(G, F, s, j, { slot });
  assert.equal(t.pat, 2);
  assert.equal(t.slots[slot].p, o.p);
});

test('saved Gauntlets reject malformed fields before a mode can use them', () => {
  const d = { ...draft(21, 1990), phase: 'results' }, r = Rn.runNew(21, d);
  const bad = [
    { m: null }, { m: { ...r.m, f: 'missing' } }, { v: 99 }, { seed: -1 },
    { tags: null }, { tags: [] }, { tags: { [r.slots[0].p]: { tal: '<img>' } } },
    { up: null }, { up: { [r.slots[0].p]: 'missing' } }, { tries: [] }, { tries: [-1, ...r.tries.slice(1)] },
    { map: 'missing' }, { rd: 99 }, { rest: -1 }, { ph: 'boss', rd: 0 }, { ph: 'hop', rd: 0 },
    { ph: 'repo', rd: 0 }, { boss: 3 }, { lost: -1 }, { mv: null }, { neg: { [r.slots[0].p]: 'A' } },
    { badge: { glue: 2, mgr: 0 } }, { prem: 1, fa: 0 }, { log: [null] },
    { log: [{ t: 'seg', pts: '<img>', res: [] }] }, { log: [{ t: 'unknown' }] },
  ];
  assert.deepEqual(Dr.valid(G, { ...d, mode: { run: r } }).mode.run, r);
  for (const patch of bad) assert.throws(() => Dr.valid(G, { ...d, mode: { run: { ...r, ...patch } } }),
    /saved Gauntlet/i, `accepted malformed fields ${JSON.stringify(patch)}`);
});

test('saved Gauntlets resume rounds, rewards, transfers and the final state', () => {
  const d = { ...draft(11, 1970), phase: 'results' };
  let s = Rn.runNew(11, d);
  for (let k = 0; k < 300; k++) {
    const restored = Dr.valid(G, { ...d, mode: { run: JSON.parse(JSON.stringify(s)) } }).mode.run;
    assert.deepEqual(restored, s);
    assert.deepEqual(Rn.runTeam(G, restored), Rn.runTeam(G, s));
    if (['done', 'fired'].includes(s.ph)) return;
    s = step(s);
  }
  assert.fail('the run never reached a final state');
});

test('v1 saves migrate to the eight-decade map without accepting malformed legacy fields', () => {
  const d = { ...draft(11, 1970), phase: 'results' }, r = Rn.runNew(11, d);
  const old = { v: 1, seed: 11, cap: false, m: r.m, slots: r.slots, act: 2, seg: 1, ph: 'reward',
    pat: 9, rest: 1, tries: [0, 0, 1, 0, 0, 0, 0, 0], tags: { [r.slots[0].p]: { rock: 2 } }, up: {},
    log: [{ t: 'boss', D: 1970, act: 2, op: 'Legacy boss', n: 1, won: false, gx: 0, gy: 1, et: false, pw: null, dp: -4 }] };
  const t = Dr.valid(G, { ...d, mode: { run: old } }).mode.run;
  assert.equal(t.v, 2);
  assert.equal(t.map, 'odyssey');
  assert.equal(t.act, 2);
  assert.equal(t.rd, 0);
  assert.equal(t.ph, 'rd');
  assert.equal(t.pat, 9);
  assert.equal(t.lost, 1);
  assert.deepEqual(t.tags, old.tags);
  assert.deepEqual(t.log, old.log);
  const b = Dr.valid(G, { ...d, mode: { run: { ...old, seg: 2, ph: 'boss' } } }).mode.run;
  assert.equal(b.ph, 'boss');
  assert.equal(b.rd, 4);
  const done = Dr.valid(G, { ...d, mode: { run: { ...old, act: 7, seg: 0, ph: 'done' } } }).mode.run;
  assert.equal(done.ph, 'done');
  assert.equal(done.rd, 4);
  for (const patch of [{ seg: 99 }, { seg: 0, ph: 'reward' }, { seg: 1, ph: 'boss' }, { ph: 'hop' }, { cap: 'false' }]) {
    assert.throws(() => Dr.valid(G, { ...d, mode: { run: { ...old, ...patch } } }), /saved Gauntlet/i);
  }
});

test('persistent boss points remain loadable beyond twenty attempts', () => {
  const d = { ...draft(11, 1970), phase: 'results' }, r = Rn.runNew(11, d);
  const s = { ...r, mv: { [r.slots[0].p]: -21, [r.slots[1].p]: 21 } };
  assert.deepEqual(Dr.valid(G, { ...d, mode: { run: s } }).mode.run.mv, s.mv);
});

test('successive rounds climb the field and exclude its three bosses', () => {
  const s = Rn.runNew(11, draft(11, 1970));
  for (const [rd, a, b] of [[0, 13, 19], [1, 9, 15], [2, 6, 12], [3, 3, 9]]) {
    const O = Rn.roundOps(F, { ...s, rd });
    assert.equal(O.length, 6);
    assert.deepEqual(O.map(c => c.id).sort(), F[1960].slice(a, b).map(c => c.id).sort());
  }
});

test('round points apply every patience boundary before a purchase', () => {
  for (const [pts, dp] of [[0, -5], [1, -5], [2, -4], [3, -4], [4, -3], [6, -3], [7, -2], [8, -2],
    [9, 0], [11, 0], [12, 1], [13, 2], [17, 2], [18, 3]]) assert.equal(Rn.dP(pts), dp, `${pts} points`);
});

test('run score penalizes act retries and rewards capped clean runs', () => {
  const sg = { t: 'seg', w: 4, d: 1, l: 1 }, a = { t: 'boss', act: 0, won: true }, b = { t: 'boss', act: 1, won: true };
  const s = { cap: true, pat: 10, log: [sg, a, sg, { t: 'boss', act: 1, won: false }, b] };
  assert.equal(Rn.score(s).score, 36.09);
  assert.equal(Rn.score({ ...s, log: [sg, a, sg, b] }).score, 58.59);
  assert.equal(Rn.score({ ...s, log: [sg] }).score, 0);
});
