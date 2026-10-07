import { mk, hs, sh, ft, em } from './engine/index.js';

// G archive; s serializable run; T hydrated team; c card; p person id; D decade;
// k club-decade key; S formation slots; xi starting eleven; bn four bench cards.

export const VERSION = 2;
export const STORE = 'football-era-lab-v2';
export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export function seed(x) {
  if (!/^\d{1,10}$/.test(String(x).trim())) throw new Error('Use a whole seed from 0 to 4294967295.');
  const n = Number(x);
  if (!Number.isSafeInteger(n) || n < 0 || n > 4294967295) throw new Error('Use a whole seed from 0 to 4294967295.');
  return n;
}

export function start(s, d) {
  s = seed(s);
  const D = d === 'random' ? DECADES[Math.floor(mk(hs(`${s}:era`))() * 8)] : Number(d);
  if (!DECADES.includes(D)) throw new Error('Choose a decade from the eight available eras.');
  return { v: VERSION, seed: s, D, phase: 'manager', managerRoll: 0, manager: null, spin: 0, picked: 0,
    squadReroll: 0, combo: null, slots: Array(15).fill(null), history: [], season: false };
}

export function opts(G, s) {
  const Q = G.managers.flatMap(m => m.f.filter(f => G.formations[f]).map(f => ({ nm: m.nm, f })));
  const r = mk(hs(`${s.seed}:manager:${s.managerRoll}`));
  const U = sh(r, Q), I = new Set(), O = [];
  for (const o of U) {
    if (I.has(o.nm)) continue;
    I.add(o.nm); O.push(o);
    if (O.length === 5) break;
  }
  if (O.length < 5) throw new Error('The manager pool needs at least five eligible managers.');
  return O;
}

export function choose(G, s, i) {
  if (s.phase !== 'manager') throw new Error('The manager is already chosen.');
  const m = opts(G, s)[i];
  if (!m) throw new Error('Choose one of the five manager options.');
  return { ...s, phase: 'draft', manager: m };
}

export function reroll(s) {
  if (s.phase !== 'manager' || s.managerRoll >= 2) throw new Error('Both manager re-spins have been used.');
  return { ...s, managerRoll: s.managerRoll + 1 };
}

export const used = s => new Set(s.slots.filter(Boolean).map(c => c.p));
export const key = c => `${c.q}:${c.D}`;

// Spin draw: a decade with weight exp(-|D - Ds| / (10 rho)) around the simulation decade Ds, then a
// club-decade of that decade with weight exp(-(k - 1) / tau), k its strength rank in the decade
// (1 = strongest). DW holds the two declared balance settings: smaller tau lands on the great
// squads more often; smaller rho keeps more spins near the season's decade (Infinity = uniform).
// Selected by the 2026-10-07 balance sweep. Current measurements and their policy/seed scope live
// in docs/VALIDATION.md and can be regenerated with tests/balance.mjs.
export const DW = { tau: 3, rho: 1.5 };

export function draw(G, r, ok, Ds) {
  const Q = G.combos.filter(ok);
  if (!Q.length) return null;
  const L = [...new Set(Q.map(c => c.D))];
  const wd = L.map(D => (Ds && Number.isFinite(DW.rho) ? Math.exp(-Math.abs(D - Ds) / (10 * DW.rho)) : 1));
  let v = r() * wd.reduce((a, b) => a + b, 0), D = L[L.length - 1];
  for (let i = 0; i < L.length; i++) { v -= wd[i]; if (v <= 0) { D = L[i]; break; } }
  const Z = Q.filter(c => c.D === D), w = Z.map(c => Math.exp(-((Number.isFinite(c.k) ? c.k : 1) - 1) / DW.tau));
  let u = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < Z.length; i++) { u -= w[i]; if (u <= 0) return Z[i]; }
  return Z[Z.length - 1];
}

export function spin(G, s, reroll = false) {
  if (s.phase !== 'draft' || s.picked !== 0) throw new Error('Finish the three picks from this squad first.');
  if (reroll && (!s.combo || s.squadReroll >= 1)) throw new Error('Your squad re-spin has been used.');
  if (!reroll && s.combo) throw new Error('This squad is already revealed.');
  const I = used(s);
  const n = s.squadReroll + Number(reroll);
  const r = mk(hs(`${s.seed}:squad:${s.spin}:${n}`));
  const c = draw(G, r, c => (G.cards[key(c)] || []).filter(p => !I.has(p.p)).length >= 3 && (!reroll || key(c) !== s.combo), s.D);
  if (!c) throw new Error('No squad has three undrafted players available.');
  return { ...s, combo: key(c), squadReroll: n };
}

export function place(G, s, p, i) {
  if (s.phase !== 'draft' || !s.combo || s.picked >= 3) throw new Error('Reveal the next squad before picking.');
  if (!Number.isInteger(i) || i < 0 || i >= 15 || s.slots[i]) throw new Error('Choose an empty pitch or bench slot.');
  if (used(s).has(p)) throw new Error('This person is already in your squad, even in a different decade.');
  if (!G.cards[s.combo].some(c => c.p === p)) throw new Error('Choose a player from the revealed squad.');
  const slots = s.slots.slice();
  slots[i] = { k: s.combo, p: p };
  const picked = s.picked + 1;
  if (picked < 3) return { ...s, slots, picked };
  const history = [...s.history, s.combo];
  const spin = s.spin + 1;
  return { ...s, slots, history, spin, picked: 0, combo: null, phase: spin === 5 ? 'review' : 'draft' };
}

export function swap(s, a, b) {
  if (!['draft', 'review'].includes(s.phase)) throw new Error('The lineup is locked after kick-off.');
  if (![a, b].every(i => Number.isInteger(i) && i >= 0 && i < 15)) throw new Error('Choose two squad slots.');
  const slots = s.slots.slice(); [slots[a], slots[b]] = [slots[b], slots[a]];
  return { ...s, slots };
}

export function hydrate(G, r) {
  if (!r) return null;
  const c = G.cards[r.k]?.find(c => c.p === r.p);
  if (!c || !G.people[c.p]) throw new Error('A saved player is no longer in the dataset.');
  const [cq, D] = r.k.split(':');
  return { ...c, id: c.p, nm: G.people[c.p].nm, D: Number(D), cq, src: c.s, duo: G.people[c.p].duo || [] };
}

export function shape(G, n) {
  const f = G.formations[n];
  const a = Array.isArray(f) ? f : f?.slots;
  if (!a || a.length !== 11) throw new Error('This formation needs eleven pitch slots.');
  return a.map(s => Array.isArray(s) ? { s: s[0], x: s[1], y: s[2] } : s);
}

export function team(G, s) {
  if (!s.manager) return null;
  const m = G.managers.find(m => m.nm === s.manager.nm);
  const Q = s.slots.map(c => hydrate(G, c));
  return { m, S: shape(G, s.manager.f), xi: Q.slice(0, 11), bn: Q.slice(11) };
}

export function preview(G, s, p, i) {
  const c = hydrate(G, { k: s.combo, p: p });
  const u = i < 11 ? shape(G, s.manager.f)[i].s : 'BENCH';
  const f = i < 11 ? ft(c, u) : { f: 0, lab: 'Bench' };
  const e = em(c.D, s.D, c.tg?.tl || 0);
  return { c, slot: u, ...f, e, a: c.r * (1 - f.f) * e };
}

// Replays are editable files. Check the fields used by the run and its views before storing one.
function validRun(G, r, manager) {
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const int = (x, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= lo && x <= hi;
  const person = p => typeof p === 'string' && Object.hasOwn(G.people, p);
  const ref = (k, p) => typeof k === 'string' && person(p) && G.cards[k]?.some(c => c.p === p);
  const act = e => obj(e) && int(e.act, 0, 7) && e.D === DECADES[e.act];
  const tag = x => ['tal', 'mae', 'rock'].includes(x);
  const log = e => {
    if (!obj(e)) return false;
    if (e.t === 'seg') return act(e) && int(e.seg, 0, 1) && [e.w, e.d, e.l, e.gf, e.ga].every(x => int(x)) &&
      e.w + e.d + e.l === 6 && e.pts === 3 * e.w + e.d && [-3, -2, 0, 2].includes(e.dp) &&
      Array.isArray(e.res) && e.res.length === 6 && e.res.every(f => obj(f) && typeof f.op === 'string' &&
        typeof f.h === 'boolean' && int(f.gf) && int(f.ga));
    if (e.t === 'boss') return act(e) && typeof e.op === 'string' && int(e.n, 1) && typeof e.won === 'boolean' &&
      int(e.gx) && int(e.gy) && typeof e.et === 'boolean' && [4, -4, -6].includes(e.dp) &&
      (!e.pw || (obj(e.pw) && int(e.pw.w, 0, 1) && int(e.pw.x) && int(e.pw.y)));
    if (e.t === 'rest') return int(e.gain, 0, 2);
    if (e.t === 'boost') return ref(e.from, e.p) && ref(e.to, e.p) && int(e.cost, 1, 5);
    if (e.t === 'sign') return ref(e.k, e.p) && person(e.out) && int(e.cost, 2, 4);
    if (e.t === 'tag') return person(e.p) && tag(e.tag) && int(e.lv, 1, 2) && e.cost === 2;
    return false;
  };
  const ok = obj(r) && r.v === 1 && int(r.seed, 0, 4294967295) && obj(r.m) && obj(manager) &&
    r.m.nm === manager.nm && r.m.f === manager.f &&
    Array.isArray(r.slots) && r.slots.length === 15 && r.slots.every(c => obj(c) && ref(c.k, c.p)) &&
    new Set(r.slots.map(c => c.p)).size === 15 && int(r.act, 0, 7) && int(r.seg, 0, 2) &&
    int(r.pat, 0, 20) && int(r.rest) && Array.isArray(r.tries) && r.tries.length === 8 && r.tries.every(x => int(x)) &&
    obj(r.tags) && Object.entries(r.tags).every(([p, t]) => person(p) && obj(t) &&
      Object.entries(t).every(([k, v]) => tag(k) && int(v, 1, 2))) &&
    obj(r.up) && Object.entries(r.up).every(([p, k]) => ref(k, p)) &&
    Array.isArray(r.log) && r.log.every(log) &&
    ['seg', 'reward', 'boss', 'done', 'fired'].includes(r.ph) &&
    (r.ph === 'fired' ? r.pat === 0 : r.pat > 0) &&
    (r.ph !== 'seg' || r.seg < 2) && (r.ph !== 'reward' || r.seg > 0) &&
    (r.ph !== 'boss' || r.seg === 2) && (r.ph !== 'done' || (r.act === 7 && r.seg === 0));
  if (!ok) throw new Error('The saved Gauntlet run is invalid.');
}

export function valid(G, s) {
  if (!s || s.v !== VERSION) throw new Error('This saved run uses a different game version.');
  const n = seed(s.seed);
  if (!DECADES.includes(s.D) || !['manager', 'draft', 'review', 'results'].includes(s.phase)) throw new Error('The saved run has an invalid stage or decade.');
  if (![s.managerRoll, s.squadReroll, s.spin, s.picked].every(Number.isInteger) ||
    s.managerRoll < 0 || s.managerRoll > 2 || s.squadReroll < 0 || s.squadReroll > 1 ||
    s.spin < 0 || s.spin > 5 || s.picked < 0 || s.picked > 2) throw new Error('The saved draft counters are invalid.');
  if (!Array.isArray(s.slots) || s.slots.length !== 15 || !Array.isArray(s.history) || s.history.length !== s.spin) throw new Error('The saved squad is incomplete.');
  const ids = new Set();
  for (const c of s.slots) {
    if (!c) continue;
    hydrate(G, c);
    if (ids.has(c.p)) throw new Error('The saved squad contains a duplicate person.');
    ids.add(c.p);
  }
  if (ids.size !== s.spin * 3 + s.picked) throw new Error('The saved squad does not match its draft progress.');
  if (s.phase === 'manager') {
    if (s.manager || ids.size || s.combo || s.spin) throw new Error('The saved manager stage is invalid.');
  } else {
    const m = G.managers.find(m => m.nm === s.manager?.nm);
    if (!m || !m.f.includes(s.manager.f) || !G.formations[s.manager.f]) throw new Error('The saved manager or formation is unavailable.');
    if (!opts(G, s).some(o => o.nm === s.manager.nm && o.f === s.manager.f)) throw new Error('The saved manager was not in this spin.');
  }
  if (s.combo && !G.cards[s.combo]) throw new Error('The saved club squad is unavailable.');
  if (s.phase === 'draft' && (s.spin >= 5 || (!s.combo && s.picked))) throw new Error('The saved squad stage is invalid.');
  if (['review', 'results'].includes(s.phase) && (ids.size !== 15 || s.spin !== 5 || s.combo || s.picked)) throw new Error('The saved final squad is incomplete.');
  for (const k of s.history) if (!G.cards[k]) throw new Error('A drafted club squad is unavailable.');
  const E = new Map(), A = new Map();
  for (const k of s.history) E.set(k, (E.get(k) || 0) + 3);
  if (s.combo) E.set(s.combo, (E.get(s.combo) || 0) + s.picked);
  for (const c of s.slots.filter(Boolean)) A.set(c.k, (A.get(c.k) || 0) + 1);
  for (const [k, n] of A) if (E.get(k) !== n) throw new Error('The saved players do not match their club spins.');
  for (const [k, n] of E) if ((A.get(k) || 0) !== n) throw new Error('The saved club picks are incomplete.');
  const md = s.mode || {}, rn = md.run;
  if (md.ci !== undefined && (!Number.isInteger(md.ci) || md.ci < 10 || md.ci > 20)) throw new Error('The saved circuit length is invalid.');
  if (rn !== undefined) {
    validRun(G, rn, s.manager);
  }
  if ((md.ci !== undefined || rn !== undefined) && s.phase !== 'results') throw new Error('Challenge modes need a finished squad.');
  if (s.wk !== undefined && !/^\d{4}-W\d{2}$/.test(s.wk)) throw new Error('The saved weekly challenge is invalid.');
  return { v: VERSION, seed: n, D: s.D, phase: s.phase, managerRoll: s.managerRoll, manager: s.manager,
    spin: s.spin, picked: s.picked, squadReroll: s.squadReroll, combo: s.combo,
    slots: s.slots.map(c => c ? { k: c.k, p: c.p } : null), history: s.history.slice(),
    ...(s.wk ? { wk: s.wk } : {}),
    mode: { ...(md.ci !== undefined ? { ci: md.ci } : {}), ...(rn !== undefined ? { run: rn } : {}) } };
}
