// Club-career regressions: G synthetic archive; sq adds a dated squad; S season state; by entrants by id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cl from '../../app/club.js';
import * as E from '../../app/engine/index.js';
import { club, S as slots } from './fixtures.mjs';

const F = JSON.parse(readFileSync(new URL('../../pipeline/curated/formations.json', import.meta.url)));
const row = (id, p = 10) => [id, p, 6, 3, 1, 2, 7, 5];
const g0 = (n = 5, s = 1980) => ({ clubs: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { nm: `Club ${i}`, cc: 'ENG' }])), cards: {}, people: {}, managers: [], formations: F,
  combos: [], lg: { ENG: { nm: 'England', s3: 1981, S: { [s]: Array.from({ length: n }, (_, i) => row(`c${i}`, 20 - i)), [s - 1]: Array.from({ length: n }, (_, i) => row(`c${i}`, 20 - i)) } } }, ec: {}, xn: {} });
function sq(G, q, s, n = 15, a = s, b = s) {
  const D = Cl.dec(s), k = `${q}:${D}`, pos = [...slots.map(x => x.s), 'GK', 'CB', 'CM', 'ST'];
  G.cards[k] = Array.from({ length: n }, (_, i) => ({ p: `${q}-${i}`, pos: [pos[i]], r: 74 + i % 4, s: 'fifa', a, b, n: 40 - i, tg: {} }));
  for (const c of G.cards[k]) G.people[c.p] = { nm: c.p };
  G.combos.push({ q, D, k: 1 });
}
const me0 = s => ({ ...club('c0', 80, Cl.dec(s)), cc: 'ENG' });

test('season squads keep dated players first, fill only within three seasons, and exclude every drafted person', () => {
  const G = g0(); sq(G, 'c1', 1980, 12); sq(G, 'c1', 1990, 15, 1983, 1983);
  G.cards['c1:1990'] = G.cards['c1:1990'].map((c, i) => ({ ...c, p: `near-${i}`, r: 95 }));
  for (const c of G.cards['c1:1990']) G.people[c.p] = { nm: c.p };
  const Q = Cl.squad(G, 'c1', 1980, new Set(['c1-1']));
  assert.equal(Q.n, 11); assert.equal(Q.Q.length, 15); assert.ok(!Q.Q.some(c => c.id === 'c1-1'));
  assert.equal(Q.Q.filter(c => c.sg === 0).length, 11);
  assert.ok(Q.Q.filter(c => c.id.startsWith('near-')).every(c => c.sg === 3 && c.src === 'fifa'));
  assert.equal(Cl.squad(G, 'c1', 1979), null);
  const c = Cl.side(G, 'c1', 1980, new Set(['c1-1'])); assert.equal(c.src, 'nearby');
});

test('a short squad or a squad without a keeper uses a full labelled stand-in instead of empty bench places', () => {
  const G = g0(); sq(G, 'c1', 1980, 14); sq(G, 'c2', 1980);
  G.cards['c2:1980'].forEach(c => { if (c.pos.includes('GK')) c.pos = ['CB']; });
  assert.equal(Cl.squad(G, 'c1', 1980), null); assert.equal(Cl.squad(G, 'c2', 1980), null);
  const C = Cl.field(G, 'ENG', 1980, 'c0', me0(1980), new Set(), 'You');
  assert.equal(C.length, 5); assert.ok(C.slice(1).every(c => c.si && c.src === 'standin'));
  assert.ok(C.slice(1).every(c => c.basis === 'points'));
  assert.ok(C.slice(1).every(c => [...c.T.xi, ...c.T.bn].length === 15 && [...c.T.xi, ...c.T.bn].every(p => p.src === 'standin')));
});

test('real membership stays intact and an absent chosen club replaces only the bottom club', () => {
  const G = g0(), me = { ...me0(1980), id: 'absent' };
  assert.deepEqual(Cl.field(G, 'ENG', 1980, me.id, me).map(c => c.id), ['c0', 'c1', 'c2', 'c3', 'absent']);
  assert.equal(Cl.pts3(G, 'ENG', 1980), 2); assert.equal(Cl.pts3(G, 'ENG', 1981), 3);
  assert.deepEqual(Cl.years(G, 'ENG', 1980), [1980]); assert.equal(Cl.leagueOf(G, 'c1', 1980), 'ENG');
  assert.equal(Cl.history(G, 'ENG', 1980, 'c1').pos, 2);
});

test('odd seasons play two exact halves, reconcile league and all-competition player totals, and resume deterministically', () => {
  const G = g0(), me = me0(1980), key = 'halves', ban = new Set(), S = Cl.season0(G, key, 'ENG', 1980, me.id, me, ban, 'You');
  const by = Cl.sides(G, S, me, ban, 'You'), [p1, n1] = Cl.par(S, by, 1), [p2, n2] = Cl.par(S, by, 2);
  assert.equal(n1, 4); assert.equal(n2, 4); assert.ok(p1 > 0 && p1 < 8 && p2 > 0 && p2 < 8);
  assert.throws(() => Cl.halfPlay(key, S, by, 2), /next half/);
  Cl.halfPlay(key, S, by, 1); assert.equal(S.h, 1); assert.ok(S.L.rows.every(r => r[1] === 4));
  assert.throws(() => Cl.halfPlay(key, S, by, 1), /next half/);
  const copy = JSON.parse(JSON.stringify(S));
  Cl.halfPlay(key, S, by, 2); Cl.halfPlay(key, copy, by, 2); assert.deepEqual(S, copy);
  assert.ok(S.L.rows.every(r => r[1] === 8 && r[1] === r[2] + r[3] + r[4] && r[7] === 2 * r[2] + r[3]));
  assert.equal(S.me.filter(m => m.k === 'L').length, 8);
  assert.equal(S.st.reduce((n, p) => n + p[2], 0), S.L.rows.reduce((n, r) => n + r[5], 0));
  assert.equal(S.sy.reduce((n, p) => n + p[1], 0), S.me.reduce((n, m) => n + m.gf, 0));
  assert.ok(Object.values(S.K).every(k => k.ch && k.ru && k.ch !== k.ru));
  assert.ok(Object.values(S.K).every(k => k.n === k.ent.length));
  assert.ok(Object.values(S.K).flatMap(k => k.R.flat()).every(t => !('M' in t)));
});

test('qualification respects cup priorities, fixed place counts and the English European ban', () => {
  const T = Array.from({ length: 12 }, (_, i) => `c${i}`);
  assert.deepEqual(Cl.places('ENG', 1986, T, 'c5', 'c6', 'c7'), { EC: [], CW: [], UC: [] });
  const p = Cl.places('ENG', 2000, T, 'c7', 'c8', 'c9');
  assert.deepEqual(p.EC, T.slice(0, 4)); assert.equal(p.UC.length, Cl.UCN('ENG', 2000)); assert.ok(p.UC.includes('c7') && p.UC.includes('c9'));
  assert.equal(new Set([...p.EC, ...p.CW, ...p.UC]).size, p.EC.length + p.CW.length + p.UC.length);
});

test('super cups keep a relegated cup winner and honor European bans', () => {
  const G = g0(5, 1985), me = me0(1985), P = { tab: ['c0', 'c1', 'c2', 'c3', 'c4'], C: { w: 'gone', r: 'c1' }, EC: 'c0', CW: 'c2' };
  G.clubs.gone = { nm: 'Relegated cup winner', cc: 'ENG' };
  const S = Cl.season0(G, 'super', 'ENG', 1985, me.id, me, new Set(), 'You', P);
  assert.deepEqual(S.K.SC.ent, ['c0', 'gone']); assert.equal(S.K.US, undefined);
  const by = Cl.sides(G, S, me, new Set(), 'You'); assert.equal(by.get('gone').src, 'standin');
  Cl.halfPlay('super', S, by, 1); assert.ok(S.K.SC.ch && S.K.SC.ru);
});

test('European fields retain real archived foreign participants with labelled missing squads and complete groups', () => {
  const G = g0(5, 1999), me = me0(1999);
  G.ec[1999] = Array.from({ length: 7 }, (_, i) => [`foreign${i}`, 'SCO', 1]);
  G.xn = Object.fromEntries(G.ec[1999].map(r => [r[0], `Foreign ${r[0]}`]));
  const S = Cl.season0(G, 'europe', 'ENG', 1999, me.id, me, new Set(), 'You');
  assert.ok(S.K.EC, 'sparse historical player coverage must not erase an existing European competition');
  assert.equal(S.K.EC.ent.length % 4, 0); assert.equal(S.K.EC.n, S.K.EC.ent.length);
  assert.ok(S.K.EC.ent.some(id => id.startsWith('foreign')));
  const by = Cl.sides(G, S, me, new Set(), 'You');
  for (const id of S.K.EC.ent) if (id !== me.id) assert.equal(by.get(id).src, 'standin');
  for (const id of S.K.EC.ent.filter(id => id.startsWith('foreign'))) assert.equal(by.get(id).basis, 'default');
  Cl.halfPlay('europe', S, by, 1); assert.equal(S.K.EC.gm, 6); assert.ok(S.K.EC.gt.flat().every(r => r[1] === 6));
  Cl.halfPlay('europe', S, by, 2); assert.ok(S.K.EC.ch);
});

test('competition names and formats follow their declared era ranges', () => {
  assert.equal(Cl.named('LC', 'ENG', 1959), null); assert.equal(Cl.named('LC', 'ENG', 1960), 'League Cup');
  assert.equal(Cl.named('LC', 'FRA', 2019), 'Coupe de la Ligue'); assert.equal(Cl.named('LC', 'FRA', 2020), null);
  assert.equal(Cl.EUR.CW(1998), "Cup Winners' Cup"); assert.equal(Cl.EUR.CW(1999), null);
  assert.equal(Cl.fmt('LC', 1980, 'ENG').sl, 2); assert.equal(Cl.fmt('UC', 1996, 'ENG').fl, 2); assert.equal(Cl.fmt('UC', 1997, 'ENG').fl, 1);
});

test('group qualifiers meet another group in their first knockout round whenever multiple groups exist', () => {
  const G = g0(5, 2000), me = me0(2000);
  G.ec[2000] = Array.from({ length: 28 }, (_, i) => [`foreign${i}`, `CC${i}`, 1]);
  for (let n = 1; n <= 30; n++) {
    const key = `draw${n}`, S = Cl.season0(G, key, 'ENG', 2000, me.id, me, new Set(), 'You'), by = Cl.sides(G, S, me, new Set(), 'You');
    Cl.halfPlay(key, S, by, 1);
    const first = JSON.parse(JSON.stringify(S.me));
    Cl.halfPlay(key, S, by, 2);
    assert.deepEqual(S.me.slice(0, first.length), first, 'half reducers must be able to identify newly appended fixtures');
    const K = S.K.EC, gi = id => K.gr.findIndex(g => g.includes(id));
    for (const t of K.R[0]) assert.notEqual(gi(t.A), gi(t.B), key);
  }
});

test('real archive fields, including the 21-club English season, finish with correct games and points', () => {
  const G = JSON.parse(readFileSync(new URL('../../data/game.json', import.meta.url), 'utf8'));
  if (G.params) E.cfg(G.params);
  for (const [lg, s] of [['ENG', 1987], ['ESP', 1950], ['ITA', 1994], ['GER', 1963], ['FRA', 2019], ['NED', 2024], ['POR', 1994]]) {
    const R = Cl.rows(G, lg, s), q = R[0][0], me = { ...club(q, 82, Cl.dec(s)), cc: lg }, key = `${lg}:${s}`;
    const S = Cl.season0(G, key, lg, s, q, me, new Set(), 'You'), by = Cl.sides(G, S, me, new Set(), 'You');
    assert.deepEqual([...S.ord].sort(), R.map(r => r[0]).sort());
    Cl.halfPlay(key, S, by, 1); Cl.halfPlay(key, S, by, 2);
    assert.ok(S.L.rows.every(r => r[1] === 2 * (R.length - 1) && r[7] === S.w * r[2] + r[3]), key);
    assert.equal(S.me.filter(m => m.k === 'L').length, 2 * (R.length - 1), key);
    assert.ok(Object.values(S.K).every(k => k.ch && k.ent.includes(k.ch)), key);
  }
});
