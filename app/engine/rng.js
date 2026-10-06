// Seeded randomness: every draw in a run comes from one generator, so a seed replays the run.
//
// Legend
//   mk(s)     mulberry32 generator from integer seed s; returns r() uniform in [0, 1)
//   nz(r)     standard normal draw (Box-Muller)
//   poi(r,l)  Poisson draw with mean l (multiplication method; l stays below 10 in play)
//   pk(r,a)   uniform pick from array a
//   sh(r,a)   shuffled copy of a (Fisher-Yates)
//   wp(r,w)   index drawn with probability proportional to non-negative weights w
//   hs(x)     32-bit hash of a string, for seeds derived from text

export const mk = s => {
  let t = s >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let e = Math.imul(t ^ (t >>> 15), 1 | t);
    e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e;
    return ((e ^ (e >>> 14)) >>> 0) / 4294967296;
  };
};

export const nz = r => {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const poi = (r, l) => {
  if (l <= 0) return 0;
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
};

export const pk = (r, a) => a[Math.floor(r() * a.length)];

export const sh = (r, a) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

export const wp = (r, w) => {
  const t = w.reduce((a, b) => a + b, 0);
  if (t <= 0) return Math.floor(r() * w.length);
  let u = r() * t;
  for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; }
  return w.length - 1;
};

export const hs = x => {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
