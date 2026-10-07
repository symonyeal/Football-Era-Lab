// Best eleven for a squad in a formation: an assignment problem solved exactly (Hungarian method).
//
// Legend
//   hun(a)        minimum-cost assignment of rows to distinct columns of cost matrix a (rows <= columns);
//                 returns the column of each row (e-maxx potentials formulation, O(n^2 m))
//   av(c, s, Ds)  adjusted rating of card c in slot s in decade Ds (fit and era, no chemistry)
//   best(Q, S, Ds) eleven for slots S from cards Q, then a bench of four: the best remaining keeper
//                 and the three best remaining outfield players

import { ft } from './pos.js';
import { em } from './era.js';

export const hun = a => {
  if (!Array.isArray(a) || !a.length || !Array.isArray(a[0]) || a[0].length < a.length || a.some(r => !Array.isArray(r) || r.length !== a[0].length)) throw new Error('Assignment needs a rectangular matrix with at least as many columns as rows.');
  if (a.some(r => r.some(c => !Number.isFinite(c)))) throw new Error('Assignment costs must be finite.');
  const n = a.length, m = a[0].length;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), w = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const mv = new Array(m + 1).fill(Infinity), us = new Array(m + 1).fill(false);
    do {
      us[j0] = true;
      const i0 = p[j0];
      let d = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (us[j]) continue;
        const c = a[i0 - 1][j - 1] - u[i0] - v[j];
        if (c < mv[j]) { mv[j] = c; w[j] = j0; }
        if (mv[j] < d) { d = mv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (us[j]) { u[p[j]] += d; v[j] -= d; } else mv[j] -= d;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = w[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const o = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) o[p[j] - 1] = j - 1;
  return o;
};

export const av = (c, s, Ds) => c.r * (1 - ft(c, s).f) * em(c.D, Ds, c.tg?.tl || 0);

export const best = (Q, S, Ds) => {
  if (Q.length < S.length) throw new Error('A squad needs at least eleven players.');
  if (new Set(Q.map(c => c.id)).size !== Q.length) throw new Error('A squad needs distinct people.');
  const a = S.map(s => Q.map(c => -av(c, s.s, Ds)));
  const o = hun(a);
  const xi = o.map(j => Q[j]);
  const used = new Set(o);
  const rest = Q.filter((_, j) => !used.has(j));
  const g = rest.filter(c => c.pos.includes('GK')).sort((x, y) => y.r - x.r)[0];
  const bn = [];
  if (g) bn.push(g);
  for (const c of rest.filter(c => c !== g).sort((x, y) => y.r - x.r)) { if (bn.length >= 4) break; bn.push(c); }
  while (bn.length < 4) bn.push(null);
  return { xi, bn };
};
