import { mk, hs, sh, ft, em, rate, move } from './engine/index.js';
import { TI, CAP, ck, left } from './cap.js';
import { validRun } from './run.js';

// G archive; s serializable run; T hydrated team; c card; p person id; D decade;
// k club-decade key; S formation slots; xi starting eleven; bn four bench cards;
// s.manager the seeded team {nm, q, a}: manager, club QID, first season of the spell; s.f formation in use.

export const VERSION = 4;
export const STORE = 'football-era-lab-v2';
export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

export function seed(x) {
  if (!/^\d{1,10}$/.test(String(x).trim())) throw new Error('Use a whole seed from 0 to 4294967295.');
  const n = Number(x);
  if (!Number.isSafeInteger(n) || n < 0 || n > 4294967295) throw new Error('Use a whole seed from 0 to 4294967295.');
  return n;
}

export function start(s, d, cap = false) {
  s = seed(s);
  if (typeof cap !== 'boolean') throw new Error('Choose Salary cap or Classic draft.');
  const D = d === 'random' ? DECADES[Math.floor(mk(hs(`${s}:era`))() * 8)] : Number(d);
  if (!DECADES.includes(D)) throw new Error('Choose a decade from the eight available eras.');
  return { v: VERSION, seed: s, D, cap, phase: 'manager', managerRoll: 0, manager: null, f: null, spin: 0, picked: 0,
    squadReroll: 0, combo: null, slots: Array(15).fill(null), history: [], season: false };
}

// Version 3 drew from every archive spell, independently of the chosen decade. Keep the old seeded
// pool for saved drafts, including one saved before its manager was chosen.
export function opts3(G, s) {
  const M = sh(mk(hs(`${s.seed}:team:${s.managerRoll}`)), G.managers.filter(m => m.t?.some(([q]) => G.clubs[q])));
  if (M.length < 5) throw new Error('The manager pool needs at least five managers with a club in the archive.');
  return M.slice(0, 5).map(m => {
    const T = m.t.filter(([q]) => G.clubs[q]), [q, a, b] = T[Math.floor(mk(hs(`${s.seed}:team:${s.managerRoll}:${m.nm}`))() * T.length)];
    return { nm: m.nm, q, a, b };
  });
}

// Career options: a manager's spell must overlap the decade at a club present in that season's real
// top flight. ys spans the league's whole available decade; the club can take a replacement place in
// years it was absent. The seeded manager and spell draws remain separate from every squad draw.
export function opts(G, s) {
  if (s.v === 2 || s.v === 3) return opts3(G, s);
  const Y = Object.fromEntries(Object.entries(G.lg || {}).map(([lg, L]) => [lg,
    Object.keys(L.S).map(Number).filter(y => y >= s.D && y < s.D + 10).sort((a, b) => a - b)]));
  const spells = m => (m.t || []).filter(([q, a, b]) => {
    const lg = G.clubs[q]?.cc, ys = Y[lg];
    return ys?.some(y => y >= a && y <= b && G.lg[lg].S[y].some(r => r[0] === q));
  });
  const Q = G.managers.map(m => ({ m, T: spells(m) })).filter(x => x.T.length);
  const M = sh(mk(hs(`${s.seed}:team:${s.managerRoll}`)), Q);
  if (M.length < 5) throw new Error('The decade needs at least five managers with a club in its league records.');
  return M.slice(0, 5).map(({ m, T }) => {
    const [q, a, b] = T[Math.floor(mk(hs(`${s.seed}:team:${s.managerRoll}:${m.nm}`))() * T.length)], lg = G.clubs[q].cc;
    return { nm: m.nm, q, a, b, lg, ys: Y[lg] };
  });
}

// Version 2 options, (manager, formation) pairs: they validate saves made before club spells.
export function opts2(G, s) {
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

// The team sets grades and signature players; f, his first recorded formation unless named, is free later.
export function choose(G, s, i, f) {
  if (s.phase !== 'manager') throw new Error('The manager is already chosen.');
  const o = opts(G, s)[i];
  if (!o) throw new Error('Choose one of the five manager options.');
  const F = f ?? G.managers.find(m => m.nm === o.nm).f.find(f => G.formations[f]);
  shape(G, F);
  return { ...s, phase: 'draft', manager: { nm: o.nm, q: o.q, a: o.a }, f: F };
}

// Formation change before kick-off: the same fifteen cards and counters; starters move by move(), the
// bench stays. Draws never read s.f, so later spins are unchanged.
export function form(G, s, f) {
  if (!['draft', 'review'].includes(s.phase)) throw new Error(s.phase === 'manager' ? 'Choose a manager first.' : 'The formation is locked after kick-off.');
  const B = shape(G, f), o = move(s.slots.slice(0, 11).map(c => hydrate(G, c)), shape(G, s.f), B, s.D);
  const slots = [...Array(11).fill(null), ...s.slots.slice(11)];
  o.forEach((j, i) => { if (j >= 0) slots[j] = s.slots[i]; });
  return { ...s, f, slots };
}

export function reroll(s) {
  if (s.phase !== 'manager' || s.managerRoll >= 2) throw new Error('Both manager re-spins have been used.');
  return { ...s, managerRoll: s.managerRoll + 1 };
}

export const used = s => new Set(s.slots.filter(Boolean).map(c => c.p));
export const key = c => `${c.q}:${c.D}`;

// Spin draw: one club-decade, weighted exp(-|D - Ds| / (10 rho)) for its distance from the season
// decade Ds times exp(-(k - 1) / tau) for k, its strength rank in its decade (1 = strongest). All
// club-decades run a seeded race (key = Exp(1) / weight) and the first eligible one wins, so each is
// drawn with probability weight / (sum of eligible weights), and a club ruled out by one player's
// picks leaves every other draw on that seed unchanged. DW holds the two declared settings: larger
// tau spreads spins across more clubs; smaller rho keeps more spins near the season's decade
// (Infinity = uniform). Current measurements live in docs/VALIDATION.md (tests/balance.mjs).
export const DW = { tau: 20, rho: 1.5 };

export function draw(G, r, ok, Ds) {
  const wd = D => (Ds && Number.isFinite(DW.rho) ? Math.exp(-Math.abs(D - Ds) / (10 * DW.rho)) : 1);
  const wk = c => (Number.isFinite(DW.tau) ? Math.exp(-((Number.isFinite(c.k) ? c.k : 1) - 1) / DW.tau) : 1);
  const Q = G.combos.map(c => [c, -Math.log(1 - r()) / (wd(c.D) * wk(c))]).sort((a, b) => a[1] - b[1]);
  for (const [c] of Q) if (ok(c)) return c;
  return null;
}

export const room = (G, s) => left(G, s.slots);

// Enough distinct, affordable people must remain for the rest of this three-pick batch.
function batch(G, s, k, p = null) {
  const I = used(s); if (p) I.add(p);
  const Q = G.cards[k].filter(c => !I.has(c.p));
  const need = 3 - s.picked - Number(p !== null);
  if (!s.cap) return Q.length >= need;
  const R = room(G, s), n = { S: 0, A: 0, B: 0, C: 0, D: 0 };
  if (p) R[TI(G.cards[k].find(c => c.p === p).r)]--;
  if (Object.values(R).some(v => v < 0)) return false;
  for (const c of Q) n[TI(c.r)]++;
  return Object.keys(CAP).reduce((a, t) => a + Math.min(R[t], n[t]), 0) >= need;
}

export function can(G, s, p) {
  return s.phase === 'draft' && !!s.combo && !used(s).has(p) &&
    !!G.cards[s.combo]?.some(c => c.p === p) && batch(G, s, s.combo, p);
}

export function spin(G, s, reroll = false) {
  if (s.phase !== 'draft' || s.picked !== 0) throw new Error('Finish the three picks from this squad first.');
  if (reroll && (!s.combo || s.squadReroll >= 1)) throw new Error('Your squad re-spin has been used.');
  if (!reroll && s.combo) throw new Error('This squad is already revealed.');
  const I = used(s);
  const H = new Set(s.history.map(k => k.split(':')[0]));
  if (s.skip) H.add(s.skip.split(':')[0]);
  if (reroll) H.add(s.combo.split(':')[0]);
  const n = s.squadReroll + Number(reroll);
  const r = mk(hs(`${s.seed}:squad:${s.spin}:${n}`));
  // Eraball's guarantee: the squad offers a player from the highest tier the fifteen have not yet
  // filled (Classic counts against the same allowances but blocks nothing), when any new club can;
  // otherwise any new club that can fill three remaining places.
  const R = room(G, s), t = Object.keys(CAP).find(t => R[t] > 0);
  const ok = c => !H.has(c.q) && (G.cards[key(c)] || []).filter(p => !I.has(p.p)).length >= 3 && batch(G, s, key(c));
  const c = (t && draw(G, r, c => ok(c) && G.cards[key(c)].some(x => !I.has(x.p) && TI(x.r) === t), s.D)) || draw(G, r, ok, s.D);
  if (!c) throw new Error('No new club can fill three of your remaining tier places.');
  return { ...s, combo: key(c), squadReroll: n, ...(reroll ? { skip: s.combo } : {}) };
}

export function place(G, s, p, i) {
  if (s.phase !== 'draft' || !s.combo || s.picked >= 3) throw new Error('Reveal the next squad before picking.');
  if (!Number.isInteger(i) || i < 0 || i >= 15 || s.slots[i]) throw new Error('Choose an empty pitch or bench slot.');
  if (used(s).has(p)) throw new Error('This person is already in your squad, even in a different decade.');
  if (!G.cards[s.combo].some(c => c.p === p)) throw new Error('Choose a player from the revealed squad.');
  if (s.cap) {
    ck(G, [...s.slots.filter(Boolean), { k: s.combo, p }]);
    if (!can(G, s, p)) throw new Error('This pick would leave too few affordable players to finish the three picks.');
  }
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
  return { m, S: shape(G, s.f), xi: Q.slice(0, 11), bn: Q.slice(11) };
}

export function preview(G, s, p, i) {
  const c = hydrate(G, { k: s.combo, p: p });
  const u = i < 11 ? shape(G, s.f)[i].s : 'BENCH';
  const f = i < 11 ? ft(c, u) : { f: 0, lab: 'Bench' };
  const e = em(c.D, s.D, c.tg?.tl || 0);
  const slots = s.slots.slice(); slots[i] = { k: s.combo, p };
  const Q = rate(team(G, { ...s, slots }), s.D), R = rate(team(G, s), s.D);
  const v = i < 11 ? Q.xi[i] : Q.bn[i - 11];
  return { c, slot: u, ...f, e, a: v.a, b: v.b || 0, up: Q.up, gA: Q.gA, gD: Q.gD, ovr: Q.ovr, da: Q.ovr - R.ovr };
}

// A version 2 save chose a (manager, formation) pair: it keeps the pair as a legacy team
// {nm, q: null, a: null, f0} and plays f0.
const up = s => (s?.v === 2 ? { ...s, v: 3, manager: s.manager && { nm: s.manager.nm, q: null, a: null, f0: s.manager.f }, f: s.manager?.f ?? null } : s);

export function valid(G, s0) {
  const s = up(s0);
  if (!s || ![3, VERSION].includes(s.v)) throw new Error('This saved run uses a different game version.');
  const n = seed(s.seed);
  if (s.cap !== undefined && typeof s.cap !== 'boolean') throw new Error('The saved draft cap is invalid.');
  if (!DECADES.includes(s.D) || !['manager', 'draft', 'review', 'results'].includes(s.phase)) throw new Error('The saved run has an invalid stage or decade.');
  if (![s.managerRoll, s.squadReroll, s.spin, s.picked].every(Number.isInteger) ||
    s.managerRoll < 0 || s.managerRoll > 2 || s.squadReroll < 0 || s.squadReroll > 1 ||
    s.spin < 0 || s.spin > 5 || s.picked < 0 || s.picked > 2) throw new Error('The saved draft counters are invalid.');
  if (!Array.isArray(s.slots) || s.slots.length !== 15 || !Array.isArray(s.history) || s.history.length !== s.spin) throw new Error('The saved squad is incomplete.');
  if (s.cap) ck(G, s.slots);
  const ids = new Set();
  for (const c of s.slots) {
    if (!c) continue;
    hydrate(G, c);
    if (ids.has(c.p)) throw new Error('The saved squad contains a duplicate person.');
    ids.add(c.p);
  }
  if (ids.size !== s.spin * 3 + s.picked) throw new Error('The saved squad does not match its draft progress.');
  let t = null;
  if (s.phase === 'manager') {
    if (s.manager || s.f || ids.size || s.combo || s.spin) throw new Error('The saved manager stage is invalid.');
  } else {
    const x = s.manager, m = G.managers.find(m => m.nm === x?.nm);
    if (!m) throw new Error('The saved manager is unavailable.');
    t = x.f0 !== undefined ? { nm: m.nm, q: null, a: null, f0: x.f0 } : { nm: m.nm, q: x.q, a: x.a };
    if (t.f0 !== undefined ? !opts2(G, s).some(o => o.nm === m.nm && o.f === t.f0) : !opts(G, s).some(o => o.nm === m.nm && o.q === t.q && o.a === t.a)) throw new Error('The saved manager was not in this spin.');
    if (typeof s.f !== 'string' || !Object.hasOwn(G.formations, s.f)) throw new Error('The saved formation is unavailable.');
    shape(G, s.f);
  }
  if (s.combo && !G.cards[s.combo]) throw new Error('The saved club squad is unavailable.');
  if (s.skip !== undefined && (typeof s.skip !== 'string' || !G.cards[s.skip] || s.squadReroll !== 1)) throw new Error('The saved discarded club is invalid.');
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
  const run = rn !== undefined ? validRun(G, rn, t, !!s.cap) : undefined;
  if ((md.ci !== undefined || rn !== undefined) && s.phase !== 'results') throw new Error('Challenge modes need a finished squad.');
  if (s.wk !== undefined && !/^\d{4}-W\d{2}$/.test(s.wk)) throw new Error('The saved weekly challenge is invalid.');
  return { v: s.v, seed: n, D: s.D, cap: !!s.cap, phase: s.phase, managerRoll: s.managerRoll, manager: t, f: t ? s.f : null,
    spin: s.spin, picked: s.picked, squadReroll: s.squadReroll, combo: s.combo,
    slots: s.slots.map(c => c ? { k: c.k, p: c.p } : null), history: s.history.slice(),
    ...(s.skip ? { skip: s.skip } : {}),
    ...(s.wk ? { wk: s.wk } : {}),
    mode: { ...(md.ci !== undefined ? { ci: md.ci } : {}), ...(run !== undefined ? { run } : {}) } };
}
