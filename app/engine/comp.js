// Club-season competitions, played round by round so a season can stop at the winter break and resume with
// a changed squad: a league by matchday (a bye when the field is odd; two or three points for a win),
// knockout rounds with byes for the top seeds, groups of four, single matches and two-legged ties, neutral
// finals. Each round draws from its own seeded stream, so its result depends only on the seed, the round
// and the teams that play it.
//
// Legend
//   C       entrants {id, nm, T, x, cc?} in a fixed order; I(C) map id -> entrant
//   rr2(n)  matchdays of a double round robin for n clubs (circle method); an odd field adds a bye (-1)
//   row     table row {id, P, W, D, L, GF, GA, Pts};  w  points for a win (2 or 3)
//   lmd(r, C, rows, k, Ds, w, st)  play matchday k (0-based) of rr2(C.length); returns that matchday's
//           results [{A, B, M}] and updates rows (keyed by id) and statistics st (season.note)
//   order(rows)  finishing order: points, goal difference, goals scored, then id
//   bye(n)  round one of a bracket of n seeded entrants: {by: seed indices that skip it, pl: those that play}
//   pair(r, Q, X)  random pairs from Q, avoiding pairs for which X(a, b) is true where a retry finds such an order
//   ko(r, A, B, Ds, o, st)  one tie. o.legs 1 (home side A unless o.neutral) or 2 (first leg at A); extra time
//           and penalties settle a level tie (no away-goals rule). Returns {A, B, g: legs [[gx, gy]...], agg, w,
//           et, pw, M: match records}; g and agg are from A's side
//   groups(r, C, g, X)  g groups of four: pots of g by strength (x), each pot shuffled into the groups,
//           avoiding X(a, b) inside a group where it can
//   gmd(r, Q, rows, k, Ds, w, st)  matchday k (0..5) of a group of four Q

import { play, P } from './match.js';
import { note } from './season.js';
import { sh } from './rng.js';

export const I = C => new Map(C.map(c => [c.id, c]));

export const rr2 = n => {
  if (!Number.isInteger(n) || n < 2) throw new Error('A league needs at least two clubs.');
  const m = n % 2 ? n + 1 : n, a = [...Array(m).keys()], R = [];
  for (let k = 0; k < m - 1; k++) {
    const x = [];
    for (let i = 0; i < m / 2; i++) {
      const p = a[i] >= n ? -1 : a[i], q = a[m - 1 - i] >= n ? -1 : a[m - 1 - i];
      if (p >= 0 && q >= 0) x.push(k % 2 === 0 ? [p, q] : [q, p]);
    }
    R.push(x);
    a.splice(1, 0, a.pop());
  }
  return [...R, ...R.map(x => x.map(([p, q]) => [q, p]))];
};

export const row0 = id => ({ id, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 });

const up = (a, b, x, y, w) => {
  a.P++; b.P++; a.GF += x; a.GA += y; b.GF += y; b.GA += x;
  if (x > y) { a.W++; b.L++; a.Pts += w; } else if (x < y) { b.W++; a.L++; b.Pts += w; } else { a.D++; b.D++; a.Pts++; b.Pts++; }
};

export const order = rows => rows.slice().sort((a, b) => b.Pts - a.Pts || (b.GF - b.GA) - (a.GF - a.GA) || b.GF - a.GF || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export const lmd = (r, C, rows, k, Ds, w, st) => {
  const R = rr2(C.length)[k];
  if (!R) throw new Error(`Matchday ${k + 1} is outside this league's ${2 * (C.length % 2 ? C.length : C.length - 1)} matchdays.`);
  return R.map(([i, j]) => {
    const A = C[i], B = C[j], M = play(r, A, B, Ds, { h: P.h });
    if (st) note(st, M, A, B);
    up(rows.get(A.id), rows.get(B.id), M.gx, M.gy, w);
    return { A: A.id, B: B.id, M };
  });
};

export const bye = n => {
  if (!Number.isInteger(n) || n < 2) throw new Error('A bracket needs at least two clubs.');
  let B = 1;
  while (B < n) B *= 2;
  const k = B - n;
  return { by: [...Array(k).keys()], pl: [...Array(n - k).keys()].map(i => i + k) };
};

export const pair = (r, Q, X = () => false) => {
  if (Q.length % 2) throw new Error('A draw needs an even number of clubs after byes.');
  let best = null, bad = Infinity;
  for (let t = 0; t < 12 && bad > 0; t++) {
    const S = sh(r, Q), p = [];
    for (let i = 0; i + 1 < S.length; i += 2) p.push([S[i], S[i + 1]]);
    const n = p.filter(([a, b]) => X(a, b)).length;
    if (n < bad) { bad = n; best = p; }
  }
  return best || [];
};

export const ko = (r, A, B, Ds, o = {}, st) => {
  if (o.legs === 2) {
    const l1 = play(r, A, B, Ds, { h: P.h, ko: true });
    const l2 = play(r, B, A, Ds, { h: P.h, ko: true, et: (gb, ga) => l1.gx + ga === l1.gy + gb });
    if (st) { note(st, l1, A, B); note(st, l2, B, A); }
    const a = l1.gx + l2.gy, b = l1.gy + l2.gx, w = a > b ? A : b > a ? B : l2.pw.w === 1 ? A : B;
    return { A: A.id, B: B.id, g: [[l1.gx, l1.gy], [l2.gy, l2.gx]], agg: [a, b], w: w.id, et: l2.et, pw: l2.pw, M: [l1, l2] };
  }
  const M = play(r, A, B, Ds, { h: o.neutral ? 0 : P.h, ko: true, et: (x, y) => x === y });
  if (st) note(st, M, A, B);
  const w = M.gx > M.gy ? A : M.gy > M.gx ? B : M.pw.w === 0 ? A : B;
  return { A: A.id, B: B.id, g: [[M.gx, M.gy]], agg: [M.gx, M.gy], w: w.id, et: M.et, pw: M.pw, M: [M] };
};

export const groups = (r, C, g, X = () => false) => {
  if (!Number.isInteger(g) || g < 1 || C.length !== 4 * g || new Set(C.map(c => c.id)).size !== C.length) throw new Error('Groups need four distinct clubs in every group.');
  const S = C.slice().sort((a, b) => b.x - a.x || (a.id < b.id ? -1 : 1)), G = Array.from({ length: g }, () => []);
  for (let p = 0; p < 4; p++) {
    const pot = sh(r, S.slice(p * g, p * g + g));
    for (const c of pot) {
      const free = G.filter(q => q.length === p), ok = free.filter(q => q.every(d => !X(c, d)));
      (ok[0] || free[0]).push(c);
    }
  }
  return G;
};

export const gmd = (r, Q, rows, k, Ds, w, st) => lmd(r, Q, rows, k, Ds, w, st);
