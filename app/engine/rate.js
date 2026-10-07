// Team rating: each player's base rating, adjusted for slot fit, decade and chemistry, folded into
// attack, midfield and defence strengths that the match model reads.
//
// Legend
//   c       player card: id, nm, pos (natural slots), r (base rating), src, D (card decade), cq (club
//           qid of the card), tg (tags: tal, rock, mae, poa 1|2 tiers; bg European Cups won; tl
//           Timeless tier), duo (ids of partners)
//   T       team: m (manager: nm, ga, gd grades, sig ids), S (11 slots {s, x, y}), xi (11 cards),
//           bn (4 cards); Gauntlet development may add lk (link multiplier) and gs (grade steps)
//   Ds      simulation decade
//   W       slot weights into [attack, midfield, defence]; each row sums to 1
//   W0      the same sums for a reference 4-4-2, so a line's manpower is read relative to it
//   ga      gamma: strength gained per unit log manpower, in rating points / 10
//   G       manager grade bonus on the matching line
//   UP      grade one step up (a signature player is in the squad)
//   b_duo   bonus for each partner of a duo when both start;  b_cl  bonus per club-decade teammate
//           within distance d_cl on the pitch, capped at m_cl; m_b caps all chemistry before lk
//   wK      keeper share of the defence the opposing attack faces
//   V       knockout boost by European Cups won (the reference game's rings rule)
//   fit     slot fit comes from pos.ft: EA-scale slot ratings when the card has them, else the graph
//   rate(T, Ds)  per-slot breakdown, lines A M Dd K Dk, effective grades, knockout boost kb, ovr

import { ft } from './pos.js';
import { em } from './era.js';

export const W = {
  GK: [0, 0, 0], CB: [0.02, 0.08, 0.90], LB: [0.10, 0.20, 0.70], RB: [0.10, 0.20, 0.70],
  LWB: [0.22, 0.30, 0.48], RWB: [0.22, 0.30, 0.48], CDM: [0.05, 0.50, 0.45], CM: [0.20, 0.62, 0.18],
  CAM: [0.50, 0.45, 0.05], LM: [0.40, 0.45, 0.15], RM: [0.40, 0.45, 0.15], LW: [0.70, 0.25, 0.05],
  RW: [0.70, 0.25, 0.05], CF: [0.75, 0.22, 0.03], ST: [0.90, 0.08, 0.02],
};
export const W0 = [3.24, 2.86, 3.90];
export const ga = 0.6;
export const G = { S: 0.04, A: 0.03, B: 0.015, C: 0, D: -0.015, F: -0.03 };
export const UP = { S: 'S', A: 'S', B: 'A', C: 'B', D: 'C', F: 'D' };
export const b_duo = 3, b_cl = 1, d_cl = 34, m_cl = 2;
export const m_b = 5;
export const wK = 0.3;
export const V = [0, 0.03, 0.045, 0.06];

const tagF = { tal: [0, 0.02, 0.01], rock: [0, 0.02, 0.01], mae: [0, 0.03, 0.015] };
const cap = { tal: 0.04, rock: 0.04, mae: 0.05 };

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export const rate = (T, Ds) => {
  const sig = new Set(T.m?.sig || []);
  const all = [...T.xi, ...T.bn].filter(Boolean);
  const up = all.some(c => sig.has(c.id)), lk = T.lk || 1;
  let gA = up ? UP[T.m?.ga || 'C'] : T.m?.ga || 'C';
  let gD = up ? UP[T.m?.gd || 'C'] : T.m?.gd || 'C';
  for (let k = 0; k < (T.gs || 0); k++) { gA = UP[gA]; gD = UP[gD]; }
  const ids = new Set(T.xi.filter(Boolean).map(c => c.id));
  const xi = T.S.map((s, i) => {
    const c = T.xi[i];
    if (!c) return { s: s.s, x: s.x, y: s.y, c: null, f: 0, lab: 'Empty', e: 1, b: 0, a: 0 };
    const { f, lab } = ft(c, s.s);
    const e = em(c.D, Ds, c.tg?.tl || 0);
    let b = 0;
    for (const p of new Set(c.duo || [])) if (p !== c.id && ids.has(p)) b += b_duo;
    let k = 0;
    T.S.forEach((u, j) => {
      const o = T.xi[j];
      if (j !== i && o && c.cq && o.cq === c.cq && o.D === c.D && Math.hypot(u.x - s.x, u.y - s.y) <= d_cl) k++;
    });
    b += Math.min(m_cl, k) * b_cl;
    b = Math.min(m_b, b) * lk;
    return { s: s.s, x: s.x, y: s.y, c, f, lab, e, b, a: c.r * (1 - f) * e + b };
  });
  const bn = T.bn.map(c => (c ? { c, e: em(c.D, Ds, c.tg?.tl || 0), a: c.r * em(c.D, Ds, c.tg?.tl || 0) } : null));
  const L = [0, 0, 0], M = [0, 0, 0];
  let K = 0;
  for (const p of xi) {
    if (!p.c) continue;
    if (p.s === 'GK') { K = p.a; continue; }
    const w = W[p.s];
    for (let k = 0; k < 3; k++) { L[k] += w[k] * p.a; M[k] += w[k]; }
  }
  const S = L.map((l, k) => (M[k] > 0 ? l / M[k] + ga * 10 * Math.log(M[k] / W0[k]) : 40));
  const t = { tal: 0, rock: 0, mae: 0 };
  let po = 0;
  for (const p of xi) {
    const g = p.c?.tg;
    if (!g) continue;
    for (const k of ['tal', 'rock', 'mae']) if (g[k]) t[k] += tagF[k][g[k]];
    if (g.poa) po += 0.005;
  }
  for (const k of Object.keys(t)) t[k] = Math.min(cap[k], t[k]);
  const A = S[0] * (1 + G[gA] + t.tal + po);
  const Mi = S[1] * (1 + (G[gA] + G[gD]) / 2 + t.mae);
  const Dd = S[2] * (1 + G[gD] + t.rock);
  const Dk = (1 - wK) * Dd + wK * K;
  const on = xi.filter(p => p.c);
  const sa = on.reduce((x, p) => x + p.a, 0);
  const kb = sa > 0 ? on.reduce((x, p) => x + V[Math.min(3, p.c.tg?.bg || 0)] * p.a / sa, 0) : 0;
  const ob = bn.filter(Boolean);
  const ovr = (ob.length ? 0.85 * mean(on.map(p => p.a)) + 0.15 * mean(ob.map(p => p.a)) : mean(on.map(p => p.a))) *
    (1 + (G[gA] + G[gD]) / 2);
  return { xi, bn, A, M: Mi, Dd, K, Dk, gA, gD, up, kb, t, ovr };
};
