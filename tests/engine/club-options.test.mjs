// The career's club and decade must agree; legacy drafts keep their original seeded manager pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VERSION, DECADES, start, opts, opts3, opts2, choose, spin, place, used, valid, shape } from '../../app/draft.js';
import { mk, hs, sh } from '../../app/engine/index.js';
import { code, uncode } from '../../app/play.js';
import { intro, teams } from '../../app/ui/lobby.js';
import { U, esc, pitch } from '../../app/ui/kit.js';

const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
const oldOptions = s => sh(mk(hs(`${s.seed}:team:${s.managerRoll}`)), G.managers.filter(m => m.t?.some(([q]) => G.clubs[q])))
  .slice(0, 5).map(m => {
    const T = m.t.filter(([q]) => G.clubs[q]), [q, a, b] = T[Math.floor(mk(hs(`${s.seed}:team:${s.managerRoll}:${m.nm}`))() * T.length)];
    return { nm: m.nm, q, a, b };
  });

test('new drafts offer five distinct, reproducible managers whose club spell overlaps real league records in the decade', () => {
  assert.equal(VERSION, 4);
  for (const D of DECADES) for (const seed of [0, 42, 4294967295]) for (const managerRoll of [0, 1, 2]) {
    const s = { ...start(seed, D), managerRoll }, O = opts(G, s);
    assert.equal(O.length, 5);
    assert.equal(new Set(O.map(o => o.nm)).size, 5);
    assert.deepEqual(opts(G, JSON.parse(JSON.stringify(s))), O);
    for (const o of O) {
      assert.equal(o.lg, G.clubs[o.q].cc);
      assert.ok(o.a <= D + 9 && o.b >= D, `${o.nm} at ${o.q} is outside the ${D}s`);
      assert.deepEqual(o.ys, Object.keys(G.lg[o.lg].S).map(Number).filter(y => y >= D && y < D + 10));
      assert.ok(o.ys.some(y => y >= o.a && y <= o.b && G.lg[o.lg].S[y].some(r => r[0] === o.q)), `${o.q} lacks a league record in the spell`);
      assert.deepEqual(valid(G, choose(G, s, O.indexOf(o))).manager, { nm: o.nm, q: o.q, a: o.a });
    }
  }
});

test('options require club membership during the intersecting spell, including the last year of a decade', () => {
  const H = { clubs: { q: { nm: 'Club', cc: 'ENG' }, x: { nm: 'Missing club', cc: 'ENG' } },
    managers: Array.from({ length: 6 }, (_, i) => ({ nm: `M${i}`, t: [['q', 1999, 2001], ['x', 1990, 1998], ['q', 1980, 1989]] })),
    lg: { ENG: { nm: 'England', S: { 1980: [['q']], 1999: [['q']], 2000: [['q']] } } } };
  for (const o of opts(H, start(1, 1990))) { assert.equal(o.a, 1999); assert.equal(o.q, 'q'); assert.deepEqual(o.ys, [1999]); }
  for (const o of opts(H, start(1, 2000))) assert.equal(o.a, 1999);
  assert.throws(() => opts({ ...H, lg: {} }, start(1, 1990)), /league records/);
  const noOverlap = structuredClone(H); noOverlap.lg.ENG.S = { 1990: [['q']] };
  assert.throws(() => opts(noOverlap, start(1, 1990)), /league records/);
});

test('v3 manager-stage saves and chosen spells use exactly the original all-era seeded pool after repeated saves', () => {
  let legacy;
  for (let seed = 0; seed < 30; seed++) {
    const s = { ...start(seed, 1980), v: 3 }, expected = oldOptions(s);
    assert.deepEqual(opts3(G, s), expected);
    assert.deepEqual(opts(G, valid(G, s)), expected);
    const i = expected.findIndex(o => o.a > 1989 || o.b < 1980);
    if (i >= 0 && !legacy) legacy = choose(G, s, i, '3-4-3 diamond');
  }
  assert.ok(legacy, 'the regression needs an original option outside the decade');
  const restored = valid(G, JSON.parse(JSON.stringify(legacy)));
  assert.equal(restored.v, 3);
  assert.deepEqual(restored.manager, legacy.manager);
  assert.equal(restored.f, legacy.f);
  assert.deepEqual(valid(G, JSON.parse(JSON.stringify(restored))), restored);
  assert.throws(() => valid(G, { ...legacy, v: VERSION }), /spin/);
});

test('v2 drafts still retain their legacy manager and formation through repeated validation', () => {
  const s = { ...start(42, 1980), v: 2 }, o = opts2(G, s)[0];
  const restored = valid(G, { ...s, phase: 'draft', manager: { nm: o.nm, f: o.f } });
  assert.equal(restored.v, 3);
  assert.deepEqual(restored.manager, { nm: o.nm, q: null, a: null, f0: o.f });
  assert.deepEqual(valid(G, JSON.parse(JSON.stringify(restored))), restored);
});

test('v3 completed squads and both legacy team-code formats keep every player and formation', () => {
  let s = choose(G, { ...start(111, 1980), v: 3 }, 0, '3-4-3 diamond');
  for (let n = 0; n < 5; n++) {
    s = spin(G, s);
    for (let j = 0; j < 3; j++) s = place(G, s, G.cards[s.combo].find(c => !used(s).has(c.p)).p, n * 3 + j);
  }
  const restored = valid(G, JSON.parse(JSON.stringify(s)));
  assert.equal(restored.v, 3); assert.deepEqual(restored.slots, s.slots);
  const t = uncode(G, code(G, restored));
  assert.deepEqual(t.slots, s.slots); assert.deepEqual(t.m, s.manager); assert.equal(t.f, s.f);
  const m = G.managers.find(m => m.nm === s.manager.nm), f = m.f[0];
  const v1 = Buffer.from(JSON.stringify({ v: 1, b: G.meta.v, D: s.D, cap: false, m: { nm: m.nm, f }, x: s.slots.map(c => [c.k, c.p]) })).toString('base64url');
  const old = uncode(G, v1);
  assert.deepEqual(old.slots, s.slots); assert.equal(old.f, f);
});

test('the inspected preview renders the selected unrecorded formation and recorded chips are buttons', () => {
  const before = { ...U }, S = start(44, 1980), o = opts(G, S)[0], m = G.managers.find(m => m.nm === o.nm);
  const f = Object.keys(G.formations).find(f => !m.f.includes(f));
  try {
    Object.assign(U, { G, S, insp: 0, f0: f });
    const html = teams();
    assert.ok(html.includes(`id="start-shape" data-formation="${esc(f)}"`));
    assert.ok(html.includes(pitch(shape(G, f), [], { mode: 'view', sm: true })));
    assert.ok(html.includes('Your formation'));
    for (const r of m.f.filter(r => G.formations[r])) assert.match(html, new RegExp(`<button[^>]+data-start-form="${esc(r)}"`));
    U.f0 = m.f[0];
    const recorded = teams();
    assert.ok(recorded.includes(`data-start-form="${esc(U.f0)}" data-key="sf:${esc(U.f0)}" aria-pressed="true"`));
  } finally { Object.assign(U, before); }
});

test('intro exposes compact random-decade and seed re-roll controls with seed-driven random mode', () => {
  const before = { ...U };
  try {
    Object.assign(U, { G, S: null, D: 'random', seed: '42' });
    const html = intro();
    assert.ok(html.includes('id="random-decade" type="button" class="btn q sm" data-era="random" aria-pressed="true"'));
    assert.ok(html.includes('id="seed-reroll" class="btn q sm" type="button"'));
    assert.ok(html.includes('Your seed chooses the decade.'));
  } finally { Object.assign(U, before); }
});
