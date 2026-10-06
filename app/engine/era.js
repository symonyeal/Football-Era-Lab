// Era modifier: a player performs best in his own decade; moving him across decades costs rating.
//
// Legend
//   DS      supported decades (start years)
//   fw      multiplier by decade distance for a player moved forward in time (older player, later decade)
//   bw      multiplier by decade distance for a player moved back in time (newer player, earlier decade)
//   kt      share of the loss kept by Timeless tags: tier 1 keeps a quarter, tier 2 half
//   em(Dp, Ds, tl)  multiplier for a player of decade Dp in simulation decade Ds with Timeless tier tl
//
// Shape follows the reference game (eraball-8.js eI): asymmetric, monotone in distance, softer for
// players moved back in time. The steps are gentler because football ratings sit on a 40-99 scale
// where a few points already change a match.

export const DS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
export const fw = [1, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79];
export const bw = [1, 0.985, 0.97, 0.955, 0.94, 0.925, 0.91, 0.895];
const kt = { 1: 0.25, 2: 0.5 };

export const em = (Dp, Ds, tl = 0) => {
  const k = Math.round(Math.abs(Dp - Ds) / 10);
  const m = (Dp <= Ds ? fw : bw)[Math.min(k, 7)];
  return tl && kt[tl] ? 1 - (1 - m) * kt[tl] : m;
};
