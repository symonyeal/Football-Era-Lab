import { mk, hs, play, P } from './engine/index.js';
import { hydrate, shape, DECADES } from './draft.js';

// Weekly Challenge and Head to Head. Both need no server: the week fixes the seed for everyone, and
// a team travels between friends as a code.
//
// Legend
//   wk(t)       ISO week of date t (UTC): id 'YYYY-Www', the shared seed, and the week's decade
//   code(G, s)  team code of a finished draft s: base64url of {v, b (data build), D, m, x (refs)}
//   uncode(G,c) the team behind a code, checked against the bundled data
//   h2h(seed, A, B)  two legs, each club at home in its own decade; a level aggregate goes to extra
//               time and penalties in the second leg. A, B = {id, nm, T, D}

export function wk(t = new Date()) {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const n = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - n);
  const y = d.getUTCFullYear(), w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  const id = `${y}-W${String(w).padStart(2, '0')}`, seed = hs(`weekly:${id}`);
  return { id, seed, D: DECADES[seed % DECADES.length] };
}
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function code(G, s) {
  if (!['review', 'results'].includes(s?.phase)) throw new Error('Finish the draft to get a team code.');
  return b64(JSON.stringify({ v: 1, b: G.meta.v, D: s.D, m: s.manager, x: s.slots.map(c => [c.k, c.p]) }));
}

export function uncode(G, c) {
  let z;
  try { z = JSON.parse(unb64(String(c).trim())); } catch { throw new Error('That is not a Football Era Lab team code.'); }
  if (z?.v !== 1 || !Array.isArray(z.x) || z.x.length !== 15 || !DECADES.includes(z.D)) throw new Error('That team code is incomplete.');
  const slots = z.x.map(([k, p]) => ({ k, p }));
  if (new Set(slots.map(c => c.p)).size !== 15) throw new Error('A team code needs fifteen different people.');
  slots.forEach(r => hydrate(G, r));
  const m = G.managers.find(m => m.nm === z.m?.nm);
  if (!m || !m.f.includes(z.m.f) || !G.formations[z.m.f]) throw new Error('That team code names a manager or formation this game does not have.');
  const Q = slots.map(r => hydrate(G, r));
  return { b: z.b, D: z.D, m: z.m, slots, T: { m, S: shape(G, z.m.f), xi: Q.slice(0, 11), bn: Q.slice(11) } };
}

export function h2h(seed, A, B) {
  const r = mk(hs(`${seed}:h2h:${A.id}:${B.id}`));
  const l1 = play(r, A, B, A.D, { h: P.h, ko: true });
  const l2 = play(r, B, A, B.D, { h: P.h, ko: true, et: (gb, ga) => l1.gx + ga === l1.gy + gb });
  const a = l1.gx + l2.gy, b = l1.gy + l2.gx;
  const w = a > b ? A : b > a ? B : l2.pw?.w === 1 ? A : B;
  return { legs: [{ h: A.nm, a: B.nm, D: A.D, M: l1 }, { h: B.nm, a: A.nm, D: B.D, M: l2 }], agg: [a, b], w: w.id, wn: w.nm, et: l2.et, pw: l2.pw };
}
