// Formation changes. G hand-built archive: one club, literal positions and slot ratings; s draft.
// Expected placements are derived by hand from the slot coordinates below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Dr from '../../app/draft.js';
import * as E from '../../app/engine/index.js';

const F442 = [['GK', 50, 92], ['LB', 15, 72], ['CB', 38, 76], ['CB', 62, 76], ['RB', 85, 72],
  ['LM', 15, 46], ['CM', 38, 50], ['CM', 62, 50], ['RM', 85, 46], ['ST', 38, 19], ['ST', 62, 19]];
// 4-3-3 with its right CM listed first: a side can only follow distance, not list order.
const F433 = [['GK', 50, 92], ['LB', 15, 72], ['CB', 38, 76], ['CB', 62, 76], ['RB', 85, 72],
  ['CDM', 50, 58], ['CM', 69, 46], ['CM', 31, 46], ['LW', 16, 22], ['ST', 50, 16], ['RW', 84, 22]];
const F4231 = [['GK', 50, 92], ['LB', 15, 72], ['CB', 38, 76], ['CB', 62, 76], ['RB', 85, 72],
  ['CDM', 37, 58], ['CDM', 63, 58], ['LW', 17, 33], ['CAM', 50, 36], ['RW', 83, 33], ['ST', 50, 16]];
const sr = o => E.SL.map(s => o[s] ?? 60);
const P = [['k', ['GK'], 80], ['cm1', ['CM'], 80], ['cm2', ['CM'], 80], ['st', ['ST'], 80],
  ['am', ['CM'], 90, sr({ CM: 88, CAM: 90, CDM: 70 })],   // best at CAM; the nearest new slot, CDM, costs 22%
  ['wg', ['CM'], 90, sr({ CM: 80, LW: 90 })],             // better at LW, but a CM slot exists to keep
  ...Array.from({ length: 12 }, (_, i) => [`x${i}`, [['CB', 'LB', 'RB', 'GK'][i % 4]], 70])];
const G = { meta: { v: 'form-test' }, clubs: { q0: { nm: 'Club 0', cc: 'ENG' } }, people: {}, cards: {},
  combos: [{ q: 'q0', D: 1990, k: 1 }],
  managers: Array.from({ length: 5 }, (_, i) => ({ nm: `M${i}`, f: ['4-4-2'], ga: 'B', gd: 'B', sig: [], t: [['q0', 1990, 1992]] })),
  formations: { '4-4-2': { slots: F442 }, '4-3-3': { slots: F433 }, '4-2-3-1': { slots: F4231 } } };
G.cards['q0:1990'] = P.map(([p, pos, r, x]) => { G.people[p] = { nm: p, duo: [] }; return { p, r, pos, s: 'f', tg: {}, ...(x ? { sr: x } : {}) }; });

const open = () => Dr.spin(G, Dr.choose(G, Dr.start(9, 1990), 0));
const at = (s, picks) => picks.reduce((t, [p, i]) => Dr.place(G, t, p, i), s);
const who = s => s.slots.map(c => c?.p ?? null);

test('a partial batch keeps every pick, the bench, counters and draws; starters keep role and side', () => {
  const s = at(open(), [['cm2', 7], ['st', 13]]);
  const t = Dr.form(G, s, '4-3-3');
  assert.equal(t.f, '4-3-3');
  assert.deepEqual(who(t), [null, null, null, null, null, null, 'cm2', null, null, null, null, null, null, 'st', null]);
  for (const k of ['seed', 'D', 'cap', 'manager', 'managerRoll', 'spin', 'picked', 'squadReroll', 'combo', 'history']) assert.deepEqual(t[k], s[k], k);
  assert.equal(t.slots[13], s.slots[13]);
  assert.deepEqual(Dr.room(G, t), Dr.room(G, s));
  assert.deepEqual(Dr.valid(G, JSON.parse(JSON.stringify(t))).slots, t.slots);
});

test('two starters in one role keep their sides when the new shape lists that role in another order', () => {
  const t = Dr.form(G, at(open(), [['k', 0], ['cm1', 6], ['cm2', 7]]), '4-3-3');
  assert.deepEqual(who(t).slice(0, 11), ['k', null, null, null, null, null, 'cm2', 'cm1', null, null, null]);
});

test('a kept role outranks a better rating elsewhere', () => {
  const t = Dr.form(G, at(open(), [['wg', 6]]), '4-3-3');
  assert.equal(who(t).indexOf('wg'), 7);
});

test('without his role, a starter takes his best-rated open slot over the nearest one', () => {
  const t = Dr.form(G, at(open(), [['am', 6]]), '4-2-3-1');
  assert.equal(who(t).indexOf('am'), 8);
  assert.equal(E.rate(Dr.team(G, t), 1990).xi[8].a, 90);
});

test('the formation is free before kick-off and locked after it', () => {
  const s = open();
  assert.deepEqual(who(Dr.form(G, s, '4-2-3-1')), who(s));
  assert.throws(() => Dr.form(G, s, 'missing'), /formation/i);
  assert.throws(() => Dr.form(G, { ...s, phase: 'results' }, '4-3-3'), /locked/i);
  assert.throws(() => Dr.form(G, Dr.start(9, 1990), '4-3-3'), /locked|manager/i);
});

const B = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
if (B.params) E.cfg(B.params);
const delBosque = (seed, D, f) => ({ ...Dr.start(seed, D, true), phase: 'draft', manager: { nm: 'Vicente del Bosque', q: 'Q8682', a: 1999 }, f });

test('Zidane keeps his slot ratings through a change of shape: CAM 90, then a CM slot at 90', () => {
  let s = Dr.spin(B, delBosque(447, 2000, '4-2-3-1'));
  assert.equal(s.combo, 'Q8682:2000');
  const j = Dr.shape(B, s.f).findIndex(x => x.s === 'CAM');
  assert.equal(Math.round(Dr.preview(B, s, 'Q1835', j).a), 90);  // his first listed position alone (CM) would cost 10%: 81
  s = Dr.place(B, s, 'Q1835', j);
  const t = Dr.form(B, s, '4-4-2'), k = who(t).indexOf('Q1835');
  assert.equal(Dr.shape(B, '4-4-2')[k].s, 'CM');
  assert.equal(Math.round(E.rate(Dr.team(B, t), 2000).xi[k].a), 90);
});

test('formation changes between picks leave every later club draw unchanged', () => {
  const run = flip => {
    let s = delBosque(77, 1990, '4-4-2');
    const seq = [];
    for (let n = 0; n < 5; n++) {
      s = Dr.spin(B, s); seq.push(s.combo);
      for (let j = 0; j < 3; j++) {
        const c = B.cards[s.combo].filter(c => Dr.can(B, s, c.p)).sort((a, b) => b.r - a.r)[0];
        s = Dr.place(B, s, c.p, s.slots.findIndex(x => !x));
        if (flip) s = Dr.form(B, s, s.f === '4-4-2' ? '3-5-2' : '4-4-2');
      }
    }
    return seq;
  };
  assert.deepEqual(run(true), run(false));
});
