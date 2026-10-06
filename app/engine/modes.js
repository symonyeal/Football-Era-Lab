// Era Gauntlet and tournament circuit. Every result uses the same match engine as the season.
//
// Legend
//   F          real club fields keyed by decade; me = drafted club, {id,nm,T,x,me:true}
//   G          serializable Gauntlet state: seed, me, F, order, i, Ds, attempts, history, done
//   gaunt(s,me,F,o) new state, starting at o.Ds and cycling through every supported decade
//   boss(G)    strongest club in the current decade, or null after all eight wins
//   retry(G)   one seeded encounter; loss keeps the roster and decade; returns a new state
//   circuit(s,me,F,o) ten to twenty events, rotating decades and five tournament formats
//   VF(F,n)    check all decades and at least n distinct clubs per field
//   top(C,n)   strongest n clubs; cp(x) = JSON copy; snap() = current parameter snapshot
//   ko(r,C,D)  single-match knockout with a neutral final and extra time/penalties
//   legs(K)    flatten a cup's ties into correctly oriented individual fixtures
//   stat(M,C)  club-person statistics from the recorded match events, including emergency cover
//   merge(Q)   merge statistic arrays; row(A,B,M) = fixture, with home/away orientation
//   totals(M,id) user match totals; CF = circuit formats; awards follow season.aw

import { mk, hs, sh } from './rng.js';
import { DS } from './era.js';
import { P, cfg } from './match.js';
import { vt, league, cup, fin, note, aw } from './season.js';

const cp = x => JSON.parse(JSON.stringify(x));
const snap = () => ({ ...P, b: { ...P.b } });
const top = (C, n) => C.slice().sort((a, b) => b.x - a.x || a.id.localeCompare(b.id)).slice(0, n);
const VF = (F, n) => {
  for (const D of DS) {
    if (!F?.[D] || F[D].length < n) throw new Error(`${D}s needs at least ${n} real clubs.`);
    vt(F[D]);
  }
};
const row = (A, B, M) => ({ A: A.id, B: B.id, an: A.nm, bn: B.nm, M });

const stat = (M, C) => {
  const st = new Map(), ids = new Map(C.map(c => [c.id, c]));
  for (const f of M) note(st, f.M, ids.get(f.A), ids.get(f.B));
  return st;
};

const merge = Q => {
  const st = new Map();
  for (const q of Q) for (const p of q) {
    const k = JSON.stringify([p.cl, p.id]);
    if (!st.has(k)) st.set(k, { ...p });
    else {
      const a = st.get(k);
      for (const v of ['g', 'as', 'cs', 'ap']) a[v] += p[v];
      a.k ||= p.k;
    }
  }
  return st;
};

const totals = (M, id) => {
  const t = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0 };
  for (const f of M) {
    if (f.A !== id && f.B !== id) continue;
    const h = f.A === id, a = h ? f.M.gx : f.M.gy, b = h ? f.M.gy : f.M.gx;
    t.played++; t.gf += a; t.ga += b;
    if (a > b || (a === b && f.M.pw?.w === (h ? 0 : 1))) t.won++;
    else if (a < b || (a === b && f.M.pw)) t.lost++;
    else t.drawn++;
  }
  return t;
};

export const gaunt = (seed, me, F, o = {}) => {
  VF(F, 1);
  const Ds = o.Ds ?? 1950, j = DS.indexOf(Ds);
  if (j < 0) throw new Error('Choose a supported simulation decade.');
  const order = [...DS.slice(j), ...DS.slice(0, j)];
  return { seed, me: cp({ ...me, me: true }), F: cp(F), params: snap(), order, i: 0, Ds,
    attempts: DS.map(() => 0), history: [], done: false, st: [], awards: aw(new Map()), honours: [] };
};

export const boss = G => G.done ? null : top(G.F[G.Ds].filter(c => c.id !== G.me.id), 1)[0];

export const retry = G => {
  if (G.done) return G;
  const B = boss(G);
  if (!B) throw new Error(`${G.Ds}s has no eligible boss.`);
  const attempts = G.attempts.slice(), j = DS.indexOf(G.Ds), n = ++attempts[j];
  const r = mk(hs(`${G.seed}:gauntlet:${G.Ds}:${n}`)), old = snap();
  let f;
  try { cfg(G.params); f = fin(r, G.me, B, G.Ds); } finally { cfg(old); }
  const M = f.legs[0], won = f.w === G.me.id;
  const history = [...G.history, { Ds: G.Ds, attempt: n, op: B.id, opn: B.nm, won, M }];
  const i = G.i + Number(won), done = i === G.order.length, Ds = done ? G.Ds : G.order[i];
  const st = merge([G.st, [...stat([row(G.me, B, M)], [G.me, B]).values()]]);
  return { ...G, i, Ds, done, attempts, history, st: [...st.values()], awards: aw(st),
    honours: done ? ['Gauntlet champion'] : [] };
};

const legs = K => K.rounds.flatMap(R => R.flatMap(t => t.legs.map((M, i) => ({
  A: i === 0 ? t.A : t.B, B: i === 0 ? t.B : t.A,
  an: i === 0 ? t.an : t.bn, bn: i === 0 ? t.bn : t.an, k: t.k, M,
}))));

const ko = (r, C, D) => {
  let Q = sh(r, C), rounds = [];
  while (Q.length > 1) {
    const k = Q.length === 2 ? 'Final' : Q.length === 4 ? 'Semi-final' : 'Quarter-final';
    const R = [];
    for (let i = 0; i < Q.length; i += 2) R.push({ ...fin(r, Q[i], Q[i + 1], D), k });
    rounds.push(R);
    Q = R.map(t => C.find(c => c.id === t.w));
  }
  return { rounds, champ: Q[0].id, champN: Q[0].nm };
};

const CF = ['league', 'two-leg', 'knockout', 'groups', 'supercup'];
const labels = { league: 'Eight-club league', 'two-leg': 'European Cup', knockout: 'Eight-club knockout', groups: 'Champions groups', supercup: 'Era Super Cup' };

export const circuit = (seed, me, F, o = {}) => {
  const n = o.events ?? 12, Ds = o.Ds ?? 1990, j = DS.indexOf(Ds);
  if (!Number.isInteger(n) || n < 10 || n > 20) throw new Error('A circuit needs 10 to 20 events.');
  if (j < 0) throw new Error('Choose a supported simulation decade.');
  VF(F, 16);
  me = { ...me, me: true };
  const events = [];
  for (let i = 0; i < n; i++) {
    const D = DS[(j + i) % DS.length], format = CF[i % CF.length];
    const r = mk(hs(`${seed}:circuit:${i}:${D}:${format}`));
    const nc = format === 'supercup' ? 2 : ['league', 'knockout'].includes(format) ? 8 : 16;
    const C = [me, ...top(F[D].filter(c => c.id !== me.id), nc - 1)];
    vt(C, nc);
    let matches = [], tab, rounds, groups, champ, position;
    if (format === 'league') {
      const L = league(r, C, D);
      matches = L.fixtures; tab = L.tab; champ = tab[0].id;
      position = tab.findIndex(t => t.id === me.id) + 1;
    } else if (format === 'groups') {
      const Q = sh(r, C), win = []; groups = [];
      for (let k = 0; k < 4; k++) {
        const A = Q.slice(k * 4, k * 4 + 4), L = league(r, A, D);
        groups.push({ label: String.fromCharCode(65 + k), tab: L.tab });
        matches.push(...L.fixtures);
        win.push(...L.tab.slice(0, 2).map(t => C.find(c => c.id === t.id)));
      }
      const K = ko(r, win, D); rounds = K.rounds; champ = K.champ;
      matches.push(...legs(K));
    } else {
      const K = format === 'two-leg' ? cup(r, C, D) : ko(r, C, D);
      matches = legs(K); rounds = K.rounds; champ = K.champ;
    }
    const st = stat(matches, C);
    events.push({ i: i + 1, Ds: D, format, label: labels[format], won: champ === me.id,
      champ, champN: C.find(c => c.id === champ).nm, position, tab, rounds, groups, matches,
      totals: totals(matches, me.id), st: [...st.values()], awards: aw(st) });
  }
  const st = merge(events.map(e => e.st)), t = totals(events.flatMap(e => e.matches), me.id);
  t.titles = events.filter(e => e.won).length;
  const honours = [];
  if (t.titles) honours.push(`${t.titles} circuit title${t.titles === 1 ? '' : 's'}`);
  if (t.titles === n) honours.push('Circuit clean sweep');
  if (!t.lost) honours.push('Unbeaten circuit');
  return { seed, Ds, params: snap(), events, totals: t, st: [...st.values()], awards: aw(st), honours };
};
