// Positions: the pitch graph and the fit penalty for playing a player in a slot.
//
// Legend
//   SL     slot codes
//   E      pitch graph edges: positions one step apart
//   dd     shortest step count between two slots (breadth-first search over E)
//   F      penalty by step count: natural 0, one step .10, two steps .22, further .35
//   F_gk   penalty when a goalkeeper plays outfield or an outfielder plays in goal
//   fit(P,s,b)  penalty and label for natural positions P in slot s; b marks a bench slot, which
//               carries no penalty (the reference game's rule)
//   LN     line of each slot: G keeper, D defence, M midfield, A attack (for grouping in the UI)
//   ft(c,s)  fit of card c in slot s: when the card carries slot ratings sr (EA's per-position
//            ratings, or CM attributes put on EA's scale) the loss is 1 - sr[s]/r; otherwise fit().
//            A Versatility tag tg.vs (Gauntlet development) keeps VS[vs] of an outfield loss.
//   lb(f)  label for a loss read from slot ratings

export const SL = ['GK', 'LB', 'CB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST'];

const E = [
  ['CB', 'CDM'], ['CB', 'LB'], ['CB', 'RB'], ['LB', 'LWB'], ['RB', 'RWB'], ['LWB', 'LM'], ['RWB', 'RM'],
  ['CDM', 'CM'], ['CM', 'CAM'], ['CM', 'LM'], ['CM', 'RM'], ['CAM', 'CF'], ['LM', 'LW'], ['RM', 'RW'],
  ['CF', 'ST'], ['LW', 'ST'], ['RW', 'ST'],
];

const N = Object.fromEntries(SL.map(s => [s, []]));
for (const [a, b] of E) { N[a].push(b); N[b].push(a); }

const D = {};
for (const s of SL) {
  const d = { [s]: 0 }, q = [s];
  while (q.length) { const u = q.shift(); for (const v of N[u]) if (!(v in d)) { d[v] = d[u] + 1; q.push(v); } }
  D[s] = d;
}

export const dd = (a, b) => (D[a] && b in D[a] ? D[a][b] : 9);

export const F = [0, 0.10, 0.22, 0.35];
export const F_gk = 0.75;

export const fit = (P, s, b = false) => {
  if (b) return { f: 0, lab: 'Bench' };
  if (!P || !P.length) return s === 'GK' ? { f: F_gk, lab: 'Emergency -75%' } : { f: F[2], lab: 'Out of position -22%' };
  if (P.includes(s)) return { f: 0, lab: 'Natural' };
  const g = P.includes('GK');
  if (s === 'GK' || g) return { f: F_gk, lab: 'Emergency -75%' };
  const k = Math.min(...P.map(p => dd(p, s)));
  if (k === 1) return { f: F[1], lab: 'Adapted -10%' };
  if (k === 2) return { f: F[2], lab: 'Out of position -22%' };
  return { f: F[3], lab: 'Major penalty -35%' };
};

const lb = f => (f <= 0.02 ? 'Natural' : f < 0.075 ? `Adapted -${Math.round(f * 100)}%` :
  f < 0.25 ? `Out of position -${Math.round(f * 100)}%` : `Major penalty -${Math.round(f * 100)}%`);

export const VS = [1, 0.5, 0];

const ft0 = (c, s) => {
  const j = SL.indexOf(s);
  if (c && Array.isArray(c.sr) && c.sr.length === SL.length && j >= 0 && c.r > 0) {
    const f = Math.min(0.9, Math.max(0, 1 - c.sr[j] / c.r));
    return { f, lab: lb(f) };
  }
  return fit(c?.pos, s);
};

export const ft = (c, s) => {
  const o = ft0(c, s), v = c?.tg?.vs;
  if (!v || o.f <= 0 || s === 'GK' || c.pos?.includes('GK')) return o;
  const f = o.f * VS[v];
  return { f, lab: f <= 0.02 ? 'Versatile' : `Versatile -${Math.round(f * 100)}%` };
};

export const LN = { GK: 'G', LB: 'D', CB: 'D', RB: 'D', LWB: 'D', RWB: 'D', CDM: 'M', CM: 'M', CAM: 'M', LM: 'M', RM: 'M', LW: 'A', RW: 'A', CF: 'A', ST: 'A' };
