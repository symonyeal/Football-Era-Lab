// Season: a 20-club double round robin against the decade's strongest clubs, then a 16-club
// European Cup of two-legged ties and a one-match final; awards come from the simulated events.
//
// Legend
//   cl      club entry: id, nm, T (team), x (seeding strength), me (true for the user's club)
//   rr(n)   double round robin for n clubs (circle method): rounds of [home, away] index pairs
//   st      player statistics keyed by club + person: id, nm, cl, src, k (keeper), g goals,
//           as assists, cs clean sheets, ap appearances
//   tab     league table rows: id, nm, P W D L GF GA Pts, me
//   tie(r, A, B, Ds, k)  two-legged knockout tie, first leg at A; k labels the round
//   fin(r, A, B, Ds)     one-match final at a neutral ground
//   league(r, C, Ds)     table, every result, player stats
//   cup(r, C, Ds)        rounds of ties, the champion
//   run(seed, me, O, Q, Ds)  season for the user's club me against league clubs O and cup field Q
//   RD      cup round names
//   vt(C,n) validate distinct club entries and optional exact field size n
//   note(st,M,A,B) record a match's appearances and scoring events
//   aw(st)  awards from actual recorded statistics; player score = 4g + 3as + 3cs + .1ap (design)
//   streak(res) maximum unbeaten league run of the user's club

import { mk, sh } from './rng.js';
import { play, P } from './match.js';

export const RD = ['Round of 16', 'Quarter-final', 'Semi-final', 'Final'];

export const vt = (C, n) => {
  if (!Array.isArray(C) || (n !== undefined && C.length !== n)) throw new Error(`This competition needs ${n} clubs.`);
  if (C.some(c => !c?.id || !c.T) || new Set(C.map(c => c.id)).size !== C.length) throw new Error('Clubs need distinct identifiers and teams.');
};

export const rr = n => {
  if (!Number.isInteger(n) || n < 2 || n % 2) throw new Error('A round robin needs an even number of at least two clubs.');
  const a = [...Array(n).keys()], R = [];
  for (let k = 0; k < n - 1; k++) {
    const m = [];
    for (let i = 0; i < n / 2; i++) {
      const x = a[i], y = a[n - 1 - i];
      m.push(k % 2 === 0 ? [x, y] : [y, x]);
    }
    R.push(m);
    a.splice(1, 0, a.pop());
  }
  return [...R, ...R.map(m => m.map(([x, y]) => [y, x]))];
};

export const note = (st, M, A, B) => {
  const add = (id, cl, k) => {
    if (!id) return;
    const key = JSON.stringify([cl.id, id]);
    const c = [...cl.T.xi, ...cl.T.bn].find(c => c?.id === id);
    const s = st.get(key) || st.set(key, { id, cl: cl.id, nm: c?.nm || 'Academy player', src: c?.src || (id.startsWith('fill-') ? 'filler' : 'estimated'), k: M.gk[cl.id === A.id ? 0 : 1] === id, g: 0, as: 0, cs: 0, ap: 0 }).get(key);
    s[k]++;
    if (M.gk[cl.id === A.id ? 0 : 1] === id) s.k = true;
    if (k === 'cs') s.k = true;
  };
  M.pl[0].forEach(id => add(id, A, 'ap'));
  M.pl[1].forEach(id => add(id, B, 'ap'));
  for (const e of M.ev) {
    const c = e.t === 0 ? A : B;
    add(e.sc, c, 'g');
    if (e.as) add(e.as, c, 'as');
  }
  if (M.gy === 0) add(M.gk[0], A, 'cs');
  if (M.gx === 0) add(M.gk[1], B, 'cs');
};

export const aw = st => {
  const a = [...st.values()].filter(p => p.src !== 'filler');
  const win = (Q, f) => Q.slice().sort((x, y) => f(y) - f(x) || y.ap - x.ap || x.cl.localeCompare(y.cl) || x.id.localeCompare(y.id))[0] || null;
  return {
    scorer: win(a.filter(p => p.g > 0), p => p.g), assists: win(a.filter(p => p.as > 0), p => p.as),
    keeper: win(a.filter(p => p.k), p => p.cs), player: win(a, p => 4 * p.g + 3 * p.as + 3 * p.cs + 0.1 * p.ap),
  };
};

export const streak = res => {
  let n = 0, b = 0;
  for (const m of res) { n = m.gf >= m.ga ? n + 1 : 0; b = Math.max(b, n); }
  return b;
};

export const league = (r, C, Ds) => {
  vt(C);
  const tab = C.map(c => ({ id: c.id, nm: c.nm, me: !!c.me, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }));
  const st = new Map(), res = [], fixtures = [];
  rr(C.length).forEach((m, k) => {
    for (const [i, j] of m) {
      const M = play(r, C[i], C[j], Ds, { h: P.h });
      fixtures.push({ rd: k + 1, A: C[i].id, B: C[j].id, an: C[i].nm, bn: C[j].nm, M });
      note(st, M, C[i], C[j]);
      const a = tab[i], b = tab[j];
      a.P++; b.P++; a.GF += M.gx; a.GA += M.gy; b.GF += M.gy; b.GA += M.gx;
      if (M.gx > M.gy) { a.W++; b.L++; a.Pts += 3; } else if (M.gx < M.gy) { b.W++; a.L++; b.Pts += 3; } else { a.D++; b.D++; a.Pts++; b.Pts++; }
      if (C[i].me || C[j].me) res.push({ rd: k + 1, h: C[i].me, op: C[i].me ? C[j].nm : C[i].nm, gf: C[i].me ? M.gx : M.gy, ga: C[i].me ? M.gy : M.gx, M });
    }
  });
  tab.sort((a, b) => b.Pts - a.Pts || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF || a.id.localeCompare(b.id));
  return { tab, res, fixtures, st, awards: aw(st), unbeaten: streak(res) };
};

export const tie = (r, A, B, Ds, k, st) => {
  const l1 = play(r, A, B, Ds, { h: P.h, ko: true });
  const l2 = play(r, B, A, Ds, { h: P.h, ko: true, et: (gb, ga) => l1.gx + ga === l1.gy + gb });
  if (st) { note(st, l1, A, B); note(st, l2, B, A); }
  const a = l1.gx + l2.gy, b = l1.gy + l2.gx;
  const w = a > b ? A : b > a ? B : l2.pw.w === 1 ? A : B;
  return { k, A: A.id, B: B.id, an: A.nm, bn: B.nm, legs: [l1, l2], agg: [a, b], w: w.id, wn: w.nm, et: l2.et, pw: l2.pw };
};

export const fin = (r, A, B, Ds, st) => {
  const M = play(r, A, B, Ds, { h: 0, ko: true, et: (x, y) => x === y });
  if (st) note(st, M, A, B);
  const w = M.gx > M.gy ? A : M.gy > M.gx ? B : M.pw.w === 0 ? A : B;
  return { k: RD[3], A: A.id, B: B.id, an: A.nm, bn: B.nm, legs: [M], agg: [M.gx, M.gy], w: w.id, wn: w.nm, et: M.et, pw: M.pw };
};

export const cup = (r, C, Ds, st = new Map()) => {
  vt(C, 16);
  const s = C.slice().sort((a, b) => b.x - a.x);
  const top = sh(r, s.slice(0, 8)), low = sh(r, s.slice(8, 16));
  let pairs = top.map((t, i) => [low[i], t]);
  const rounds = [];
  for (let k = 0; k < 3; k++) {
    const ties = pairs.map(([a, b]) => tie(r, a, b, Ds, RD[k], st));
    rounds.push(ties);
    const win = sh(r, ties.map(t => C.find(c => c.id === t.w)));
    pairs = [];
    for (let i = 0; i < win.length; i += 2) pairs.push([win[i], win[i + 1]]);
  }
  const f = fin(r, pairs[0][0], pairs[0][1], Ds, st);
  rounds.push([f]);
  return { rounds, champ: f.w, champN: f.wn, st, awards: aw(st) };
};

export const run = (seed, me, O, Q, Ds) => {
  if (O.length !== 19 || Q.length !== 15) throw new Error('A season needs 19 league opponents and 15 cup opponents.');
  me = { ...me, me: true };
  const r = mk(seed);
  const L = league(r, [me, ...O], Ds);
  const st2 = new Map();
  const K = cup(r, [me, ...Q], Ds, st2);
  const honours = [];
  if (L.tab[0].id === me.id) honours.push('League champions');
  if (K.champ === me.id) honours.push('European Cup winners');
  if (L.tab.find(t => t.id === me.id).L === 0) honours.push('Invincibles');
  if (L.tab[0].id === me.id && K.champ === me.id) honours.push('Double');
  return { seed, Ds, params: { ...P, b: { ...P.b } }, L, K, st2, honours };
};
