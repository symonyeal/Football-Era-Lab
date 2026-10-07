// Slot-rating fit, the weighted spin and the Era Gauntlet run, on the bundled data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../../app/engine/index.js';
import * as Dr from '../../app/draft.js';
import * as Rn from '../../app/run.js';
import { fields } from '../../app/data.js';

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

test('spins favour strong club-decades and stay near the season decade without excluding others', () => {
  const r = E.mk(7), K = {}, Dn = {};
  for (let i = 0; i < 6000; i++) {
    const c = Dr.draw(G, r, () => true, 1980);
    K[c.k <= 10 ? 'top' : 'rest'] = (K[c.k <= 10 ? 'top' : 'rest'] || 0) + 1;
    Dn[c.D] = (Dn[c.D] || 0) + 1;
  }
  assert.ok(K.top > K.rest, 'top-ten squads should outnumber the rest');
  assert.ok(Dn[1980] > Dn[1950] && Dn[1980] > Dn[2020]);
  assert.equal(Object.keys(Dn).length, 8, 'every decade can still be drawn');
});

test('the run plays segments, deals rewards, then the boss, and replays identically', () => {
  const d = draft(11, 1970);
  const go = () => {
    let s = Rn.runNew(11, d);
    const out = [];
    for (let k = 0; k < 12 && !['done', 'fired'].includes(s.ph); k++) {
      if (s.ph === 'seg') s = Rn.runSegment(G, F, s);
      else if (s.ph === 'reward') {
        const O = Rn.offers(G, F, s);
        assert.ok(O.length >= 2 && O.length <= 3);
        assert.equal(O.at(-1).kind, 'rest', 'rest is always on offer');
        s = Rn.take(G, F, s, O.length - 1);
      } else s = Rn.runPlayBoss(G, F, s);
      out.push([s.ph, s.act, s.pat]);
      assert.ok(s.pat >= 0 && s.pat <= Rn.PAT_MAX);
    }
    return [s, out];
  };
  const [a, ta] = go(), [b, tb] = go();
  assert.deepEqual(ta, tb);
  assert.deepEqual(a.slots, b.slots);
  assert.ok(a.log.some(e => e.t === 'seg') && a.log.some(e => e.t === 'boss'));
});

test('a boss loss costs patience and keeps the act; a win moves to the next decade', () => {
  const d = draft(5, 1990);
  let s = { ...Rn.runNew(5, d), ph: 'boss' };
  for (let i = 0; i < 30 && s.act === 0 && s.ph === 'boss'; i++) {
    const p = s.pat, t = Rn.runPlayBoss(G, F, s), e = t.log.at(-1);
    if (e.won) { assert.equal(t.act, 1); assert.equal(t.ph, 'seg'); assert.equal(t.pat, Math.min(Rn.PAT_MAX, p + Rn.B_WIN)); }
    else { assert.equal(t.act, 0); assert.equal(t.pat, Math.max(0, p - Rn.B_LOSS(e.n))); assert.ok(['boss', 'fired'].includes(t.ph)); }
    s = t.ph === 'fired' ? { ...t, pat: 8, ph: 'boss' } : t;
  }
});

test('a boost card upgrades the same person to his best version and charges the tier cost', () => {
  const d = draft(3, 2010);
  let s = { ...Rn.runNew(3, d), ph: 'reward', pat: 20, seg: 1 };
  let found = null;
  for (let t = 0; t < 40 && !found; t++) {
    const O = Rn.offers(G, F, { ...s, tries: s.tries.map((x, i) => (i === 0 ? t : x)) });
    const j = O.findIndex(o => o.kind === 'boost');
    if (j >= 0) found = { O, j, s: { ...s, tries: s.tries.map((x, i) => (i === 0 ? t : x)) } };
  }
  assert.ok(found, 'no boost card was dealt in forty reward phases');
  const o = found.O[found.j], t = Rn.take(G, F, found.s, found.j);
  assert.equal(t.slots[o.i].p, o.from.p);
  assert.equal(t.slots[o.i].k, Rn.versions(G, o.from.p)[0].k);
  assert.equal(t.pat, 20 - o.cost);
  assert.ok(o.to.r > o.from.r);
  assert.deepEqual(Dr.valid(G, { ...d, phase: 'results', mode: { run: t } }).mode.run, t);
});

test('rewards never spend the last point of patience', () => {
  const d = draft(9, 1980);
  const s = { ...Rn.runNew(9, d), ph: 'reward', pat: 2, seg: 1 };
  const O = Rn.offers(G, F, s);
  O.forEach((o, j) => {
    if (o.cost >= 2) assert.throws(() => Rn.take(G, F, s, j, { pick: 0, slot: 14 }), /patience/);
  });
});

test('saved Gauntlets reject malformed fields before a mode can use them', () => {
  const d = { ...draft(21, 1990), phase: 'results' }, r = Rn.runNew(21, d);
  const bad = [
    { m: null }, { m: { ...r.m, f: 'missing' } }, { v: 99 }, { seed: -1 },
    { tags: null }, { tags: [] }, { tags: { [r.slots[0].p]: { tal: '<img>' } } },
    { up: null }, { up: { [r.slots[0].p]: 'missing' } }, { tries: [] }, { tries: [-1, ...r.tries.slice(1)] },
    { seg: 99 }, { rest: -1 }, { ph: 'boss', seg: 0 }, { log: [null] },
    { log: [{ t: 'seg', pts: '<img>', res: [] }] }, { log: [{ t: 'unknown' }] },
  ];
  assert.deepEqual(Dr.valid(G, { ...d, mode: { run: r } }).mode.run, r);
  for (const patch of bad) assert.throws(() => Dr.valid(G, { ...d, mode: { run: { ...r, ...patch } } }),
    /saved Gauntlet/i, `accepted malformed fields ${JSON.stringify(patch)}`);
});

test('saved Gauntlets resume actual segments, rewards, boss attempts and the final state', () => {
  const d = { ...draft(11, 1970), phase: 'results' };
  let s = Rn.runNew(11, d);
  for (let k = 0; k < 80; k++) {
    const restored = Dr.valid(G, { ...d, mode: { run: JSON.parse(JSON.stringify(s)) } }).mode.run;
    assert.deepEqual(restored, s);
    assert.deepEqual(Rn.runTeam(G, restored), Rn.runTeam(G, s));
    if (['done', 'fired'].includes(s.ph)) return;
    s = s.ph === 'seg' ? Rn.runSegment(G, F, s) : s.ph === 'boss' ? Rn.runPlayBoss(G, F, s)
      : Rn.take(G, F, s, Rn.offers(G, F, s).length - 1);
  }
  assert.fail('the run never reached a final state');
});
