// Match model: Poisson goals from attack against the keeper-weighted defence, midfield control,
// home advantage and the decade's scoring level, played around two substitution windows.
//
// Legend
//   P       parameters: be (goal sensitivity per 10 rating points of gap), ka (midfield weight),
//           h (home advantage, log scale), b (goals per team per match by decade), pa (chance a
//           starter misses a match), fat (late fatigue on starters who stay on), m1 (substitution
//           minute), m2 (second window), ns (total substitutions), src (provenance of the values)
//   lam(X, Y, Ds, h)  expected goals over 90 minutes of rated lines X against rated lines Y
//   ln(R, k, f)       lines of rated team R with knockout boost k and fatigue factor f
//   avail(r, T, Ds, id) team after random absences; id scopes distinct emergency replacements
//   sub(T, R, Ds, n, m) up to n useful replacements at minute m; the keeper stays. A Super Sub
//                     (tg.ss, Gauntlet development) comes on SS[ss] rating points stronger
//   gs(r, R)          scorer and assister ids for one goal of rated team R
//   pens(r, RX, RY)   shootout winner, 0 for X and 1 for Y
//   play(r, X, Y, Ds, o)  one match between teams X and Y; o.h home advantage for X, o.ko knockout
//                     boost, o.et(gx, gy) true when extra time (then penalties) must decide
//   fill(s, Ds)       academy player used when no bench card is left for slot s
//   pick(r, w)        index drawn in proportion to weights w, or -1 when every weight is zero
//   cfg(p)            validate and atomically apply model parameters, merging decade baselines

import { poi } from './rng.js';
import { rate, W, wK } from './rate.js';
import { av } from './xi.js';
import { DS } from './era.js';
import { shift } from './pos.js';

export const P = {
  be: 0.55, ka: 0.25, h: 0.12, pa: 0.05, fat: 0.04, m1: 60, m2: 75, ns: 3,
  b: { 1950: 1.72, 1960: 1.62, 1970: 1.33, 1980: 1.30, 1990: 1.30, 2000: 1.32, 2010: 1.38, 2020: 1.42 },
  src: 'Game design defaults; goal sensitivity, midfield and home advantage are not fitted.',
};

export const cfg = p => {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Parameters must be a valid object.');
  const q = { ...P, b: { ...P.b } };
  for (const k of ['be', 'ka', 'h', 'pa', 'fat', 'm1', 'm2', 'ns']) {
    if (!(k in p)) continue;
    if (!Number.isFinite(p[k]) || (k !== 'h' && p[k] < 0)) throw new Error(`${k} must be a finite valid parameter.`);
    q[k] = p[k];
  }
  if (q.pa > 1 || q.fat > 0.5 || !Number.isInteger(q.ns) || q.ns > 5 || q.m1 <= 0 || q.m2 <= q.m1 || q.m2 >= 90) throw new Error('Invalid absence, fatigue or substitution parameters.');
  if ('b' in p) {
    if (!p.b || typeof p.b !== 'object' || Array.isArray(p.b)) throw new Error('Decade baselines must be positive.');
    for (const [d, v] of Object.entries(p.b)) {
      if (!DS.includes(Number(d)) || !Number.isFinite(v) || v <= 0) throw new Error('Known decades need positive finite baselines.');
      q.b[d] = v;
    }
  }
  if ('src' in p) {
    if (typeof p.src !== 'string' || !p.src.trim()) throw new Error('Parameter provenance must be a valid nonempty string.');
    q.src = p.src;
  }
  Object.assign(P, q);
  return P;
};

export const lam = (X, Y, Ds, h = 0) =>
  P.b[Ds] * Math.exp(P.be * ((X.A - Y.Dk) / 10 + P.ka * (X.M - Y.M) / 10) + h);

export const ln = (R, k = 0, f = 1) => ({
  A: R.A * f * (1 + k), M: R.M * f * (1 + k), Dk: ((1 - wK) * R.Dd * f + wK * R.K) * (1 + k),
});

export const fill = (s, Ds, id = s) => ({ id: `fill-${id}`, nm: 'Academy player', pos: [s], r: 55, D: Ds, src: 'filler', tg: {} });

export const avail = (r, T, Ds, id = 'team') => {
  const xi = T.xi.slice(), bn = T.bn.slice(), out = [];
  for (let i = 0; i < xi.length; i++) {
    if (!xi[i] || r() >= P.pa) continue;
    let bj = -1, bv = -1;
    bn.forEach((c, j) => { if (c) { const v = av(c, T.S[i].s, Ds); if (v > bv) { bv = v; bj = j; } } });
    out.push(xi[i].id);
    if (bj >= 0) { xi[i] = bn[bj]; bn[bj] = null; } else xi[i] = fill(T.S[i].s, Ds, `${id}-${i}`);
  }
  return { ...T, xi, bn, out };
};

export const SS = [0, 3, 5];
const ssOn = c => c?.tg?.ss ? shift(c, SS[c.tg.ss]) : c;

export const sub = (T, R, Ds, n = P.ns, m = P.m1) => {
  const xi = T.xi.slice(), bn = T.bn.slice(), ev = [];
  const tired = R.xi.map(p => (p.c && p.s !== 'GK' ? p.a * (1 - P.fat) : Infinity));
  for (let k = 0; k < n; k++) {
    let g = 0, bi = -1, bj = -1;
    bn.forEach((c, j) => {
      if (!c) return;
      xi.forEach((_, i) => {
        if (tired[i] === Infinity) return;
        const d = av(ssOn(c), T.S[i].s, Ds) - tired[i];
        if (d > g) { g = d; bi = i; bj = j; }
      });
    });
    if (bi < 0) break;
    ev.push({ off: xi[bi].id, on: bn[bj].id, s: T.S[bi].s, m });
    xi[bi] = ssOn(bn[bj]); bn[bj] = null; tired[bi] = Infinity;
  }
  return { T: { ...T, xi, bn }, n: ev.length, ev };
};

const pick = (r, w) => {
  const t = w.reduce((a, b) => a + b, 0);
  if (t <= 0) return -1;
  let u = r() * t;
  for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; }
  return w.length - 1;
};

// Scorer and assister weights: each player's real rate per 90 minutes where the card has one
// (Understat xG / xA, else Transfermarkt goals / assists, else Wikidata league goals per game),
// put on the 2010s scoring level and shrunk toward the rating-and-slot prior by the minutes behind
// it; a player away from his natural slot keeps the slot's share of that rate.
//   pg(p), pa(p)  prior goal / assist rate per 90 of rated slot p (design constants k_g, k_a)
//   rg(c), ra(c)  [rate per 90, minutes behind it] from the card, or null
//   m0  prior weight in minutes;  sf(p, k)  slot factor relative to the card's natural slot
const k_g = 0.6, k_a = 0.35, m0 = 900;
const pg = p => k_g * W[p.s][0] * Math.pow(Math.max(p.a, 30) / 80, 4);
const pa = p => k_a * (W[p.s][1] + 0.4 * W[p.s][0]) * Math.pow(Math.max(p.a, 30) / 80, 3);
const lv = c => (P.b[2010] || 1.3) / (P.b[c.D] || P.b[2010] || 1.3);
const rg = c => {
  const s = c.st;
  if (s?.xmi >= 450 && s.xg != null) return [90 * s.xg / s.xmi, s.xmi];
  if (s?.mi >= 450) return [90 * s.g / s.mi, s.mi];
  if (c.n >= 15 && !c.pos?.includes('GK')) return [c.g / c.n * lv(c), 80 * c.n];
  return null;
};
const ra = c => {
  const s = c.st;
  if (s?.xmi >= 450 && s.xa != null) return [90 * s.xa / s.xmi, s.xmi];
  if (s?.mi >= 450) return [90 * s.a / s.mi, s.mi];
  return null;
};
const sf = (p, k) => {
  const n = p.c.pos?.find(x => W[x]) || p.s;
  return Math.min(1.5, Math.max(0.1, (W[p.s][k] + 0.02) / (W[n][k] + 0.02)));
};
const mix = (prior, x, k, p) => (x ? (m0 * prior + x[1] * x[0] * sf(p, k)) / (m0 + x[1]) : prior);

export const gs = (r, R) => {
  const o = R.xi.filter(p => p.c && p.s !== 'GK');
  const ws = o.map(p => mix(pg(p), rg(p.c), 0, p) * (p.c.tg?.poa === 1 ? 1.5 : p.c.tg?.poa === 2 ? 1.25 : 1));
  const i = pick(r, ws);
  const sc = o[i]?.c.id;
  if (r() > 0.72) return { sc, as: null };
  const wa = o.map((p, j) => (j === i ? 0 : mix(pa(p), ra(p.c), 1, p) * (p.c.tg?.mae === 1 ? 1.4 : p.c.tg?.mae === 2 ? 1.2 : 1)));
  const j = pick(r, wa);
  return { sc, as: j >= 0 && j !== i ? o[j]?.c.id : null };
};

export const pens = (r, RX, RY) => {
  const sh = R => R.xi.filter(p => p.c && p.s !== 'GK').sort((a, b) => b.a - a.a).map(p => p.a);
  const kx = sh(RX), ky = sh(RY);
  const p = (a, k) => Math.min(0.92, Math.max(0.55, 0.75 + 0.005 * (a - 75) - 0.006 * (k - 75)));
  let x = 0, y = 0;
  for (let i = 0; i < 5; i++) {
    if (r() < p(kx[i % kx.length], RY.K)) x++;
    if (r() < p(ky[i % ky.length], RX.K)) y++;
  }
  for (let i = 5; x === y && i < 60; i++) {
    const a = r() < p(kx[i % kx.length], RY.K), b = r() < p(ky[i % ky.length], RX.K);
    x += a; y += b;
  }
  // After an exceptionally long tie, draw the next *deciding* pair conditionally. This avoids
  // an unbounded loop while preserving the two kick probabilities and a decisive score.
  if (x === y) {
    const a = p(kx[60 % kx.length], RY.K), b = p(ky[60 % ky.length], RX.K);
    if (r() < a * (1 - b) / (a * (1 - b) + b * (1 - a))) x++; else y++;
  }
  return { w: x > y ? 0 : 1, x, y };
};

export const play = (r, X, Y, Ds, o = {}) => {
  const TX = avail(r, X.T, Ds, X.id), TY = avail(r, Y.T, Ds, Y.id);
  const RX = rate(TX, Ds), RY = rate(TY, Ds);
  const ev = [], xg = [0, 0];
  let gx = 0, gy = 0;
  const ph = (A, B, m0, m1, fa, fb) => {
    const ka = o.ko ? A.kb : 0, kb = o.ko ? B.kb : 0;
    const LA = ln(A, ka, fa), LB = ln(B, kb, fb);
    const lx = lam(LA, LB, Ds, o.h || 0) * (m1 - m0) / 90, ly = lam(LB, LA, Ds, 0) * (m1 - m0) / 90;
    xg[0] += lx; xg[1] += ly;
    const nx = poi(r, lx), ny = poi(r, ly);
    for (let k = 0; k < nx; k++) ev.push({ m: m0 + 1 + Math.floor(r() * (m1 - m0)), t: 0, ...gs(r, A) });
    for (let k = 0; k < ny; k++) ev.push({ m: m0 + 1 + Math.floor(r() * (m1 - m0)), t: 1, ...gs(r, B) });
    gx += nx; gy += ny;
  };
  ph(RX, RY, 0, P.m1, 1, 1);
  const sX = sub(TX, RX, Ds, Math.ceil(P.ns / 2)), sY = sub(TY, RY, Ds, Math.ceil(P.ns / 2));
  const RX2 = rate(sX.T, Ds), RY2 = rate(sY.T, Ds);
  const fx = 1 - P.fat * (10 - sX.n) / 10, fy = 1 - P.fat * (10 - sY.n) / 10;
  ph(RX2, RY2, P.m1, P.m2, fx, fy);
  const sX2 = sub(sX.T, RX2, Ds, P.ns - sX.n, P.m2), sY2 = sub(sY.T, RY2, Ds, P.ns - sY.n, P.m2);
  const RX3 = rate(sX2.T, Ds), RY3 = rate(sY2.T, Ds);
  const fx2 = 1 - P.fat * (10 - sX.n - sX2.n) / 10, fy2 = 1 - P.fat * (10 - sY.n - sY2.n) / 10;
  ph(RX3, RY3, P.m2, 90, fx2, fy2);
  let et = false, pw = null;
  if (o.et && o.et(gx, gy)) {
    et = true;
    ph(RX3, RY3, 90, 120, fx2 - P.fat, fy2 - P.fat);
    if (o.et(gx, gy)) pw = pens(r, RX3, RY3);
  }
  ev.sort((a, b) => a.m - b.m);
  const on = R => R.xi.filter(p => p.c).map(p => p.c.id);
  const gk = R => R.xi.find(p => p.s === 'GK')?.c?.id || null;
  return {
    gx, gy, xg, ev, et, pw, subs: [[...sX.ev, ...sX2.ev], [...sY.ev, ...sY2.ev]], out: [TX.out, TY.out],
    pl: [[...new Set([...on(RX), ...on(RX2), ...on(RX3)])], [...new Set([...on(RY), ...on(RY2), ...on(RY3)])]],
    gk: [gk(RX3), gk(RY3)],
  };
};
