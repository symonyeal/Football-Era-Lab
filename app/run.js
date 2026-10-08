import { mk, hs, sh, play, P, tie, shift, move } from './engine/index.js';
import { hydrate, shape, draw, key } from './draft.js';
import { TI, GCAP, fits, ck } from './cap.js';
export { TI, CAP, GCAP } from './cap.js';

// Era Gauntlet: Eraball's roguelike run with the drafted fifteen, scaled from a nine-man basketball
// roster to a fifteen-man football squad. An act is one decade of the chosen map: N_RD rounds of N_M
// matches against rising opposition, a reward after every round, then a two-legged tie against one
// of the decade's three strongest clubs. A won tie opens the transfer window into the next decade; a
// lost one costs patience and replays the act against another of the three. The run ends at zero
// patience or when the map's last boss falls. Rules and their Eraball sources: docs/MODEL.md.
//
// Legend
//   G dataset; F decade fields (19 selected clubs each, strongest first); s run state; T run team
//   MAPS       Eraball's four maps: name, decades in act order, blurb; 'original' is the default
//   N_RD, N_M  rounds per act, matches per round (Eraball 4 segments x 14 of 82 games -> 4 x 6 of 38)
//   LAD        slice of the 16 clubs below the three bosses that each round draws from, weakest first
//   dP(pts)    patience after a round, Eraball's eight steps on points out of 18: 18 +3, 13+ +2,
//              12 +1, 9+ 0, 7+ -2, 4+ -3, 2+ -4, else -5
//   B_WIN      +4 for a won boss tie;  B_LOSS(n)  -4 for the run's first lost tie, -6 after
//   sur(s)     act surcharge on every price: +1 per act, per second act on maps longer than three
//   FA         free agent base price by tier; price() applies Eraball's negotiation: an S signing who
//              starts costs 1 less, an A or S signing without a European Cup costs 1 less when five of
//              the squad have one; NEG: an S signing on the bench plays 3 below his rating, a C
//              signing who starts plays 3 above
//   DEV        development catalogue: id -> nm, team (squad-wide), mx levels, c base price, k tag key,
//              ln position lines it suits, tx description; lv/val convert tag values and levels
//   upC(a, b)  upgrade price by tiers climbed: 1 same tier, 2 one, 3 two, 4 more, +1 into S, at most 4
//   REST       rest pays +2, then +1, then 0 when taken back to back;  DESP  desperation offer below
//              5 patience: cut-price stars, 1 patience, free at 2 or less
//   LINES      position lines by first position, for the transfer window and development
//   HOP_N      signings from each decade in the transfer window (Eraball 1 of 3 each for 9 places)
//   bossAt     the act's boss from the seed; a retry draws a different one of the three
//   state v 3: seed, cap, map, m (the draft's team), f (formation), slots, act, rd, ph (rd | node | boss | hop | repo | done | fired),
//              pat, rest, tries (ties per act), lost (ties lost in the run), boss, tags (person -> tag
//              overrides), up (person -> card charged for the cap), mv (person -> MVP/LVP points),
//              neg (person -> 'S' | 'C' terms), badge {glue, mgr}, last (development offered at the
//              previous reward), fa (market re-spin used this reward), prem (1 if it was premium), log

export const MAPS = {
  original: { nm: 'Original Gauntlet', D: [1960, 1990, 2010], tx: 'Three decades, the 1960s to the 2010s. The shortest run.' },
  back: { nm: 'Back in Time', D: [2010, 1990, 1960], tx: 'The same three decades backwards. Your squad gets older with every decade.' },
  odyssey: { nm: 'The Full Odyssey', D: [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020], tx: 'All eight decades in order, a boss in every one. The longest run.' },
  reverse: { nm: 'Odyssey in Reverse', D: [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950], tx: 'All eight decades from the 2020s back to the 1950s.' },
};
export const N_RD = 4, N_M = 6, PAT0 = 8, PAT_MAX = 20, B_WIN = 4, DESP = 5, HOP_N = 2;
export const B_LOSS = n => (n === 0 ? 4 : 6);
export const dP = p => (p >= 18 ? 3 : p >= 13 ? 2 : p >= 12 ? 1 : p >= 9 ? 0 : p >= 7 ? -2 : p >= 4 ? -3 : p >= 2 ? -4 : -5);
const LAD = [[10, 16], [6, 12], [3, 9], [0, 6]];
const TO = ['D', 'C', 'B', 'A', 'S'];
export const upC = (a, b) => {
  const d = TO.indexOf(b) - TO.indexOf(a);
  return Math.min(4, (d <= 0 ? 1 : d === 1 ? 2 : d === 2 ? 3 : 4) + (b === 'S' && a !== 'S' ? 1 : 0));
};
export const FA = { D: 1, C: 1, B: 1, A: 2, S: 3 };
export const REST = [2, 1, 0];
export const LINES = { GK: ['GK'], DEF: ['CB', 'LB', 'RB', 'LWB', 'RWB'], MID: ['CDM', 'CM', 'CAM'], WIDE: ['LM', 'RM', 'LW', 'RW'], ATT: ['CF', 'ST'] };
export const line = c => Object.keys(LINES).find(l => LINES[l].includes(c?.pos?.[0])) || 'MID';
export const DEV = {
  glue: { nm: 'Dressing Room Glue', team: 1, mx: 1, c: 2, tx: 'Teammate and partnership link points count 50% more across the squad.' },
  mgr: { nm: 'Manager Development', team: 1, mx: 2, c: 4, tx: 'Your manager improves one grade step in attack and in defence for the rest of the run.' },
  euro: { nm: 'European Pedigree', mx: 3, c: 2, k: 'bg', tx: 'Adds a European Cup to his record. Cups lift a side in every knockout tie, boss ties included.' },
  time: { nm: 'Timeless Training', mx: 2, c: 3, k: 'tl', tx: 'He ages well: moving across decades costs him half, then a quarter, of the usual loss.' },
  vers: { nm: 'Versatility', mx: 2, c: 2, k: 'vs', ln: ['DEF', 'MID', 'WIDE', 'ATT'], tx: 'He plays anywhere outfield: his out-of-position loss halves, then disappears.' },
  sub: { nm: 'Super Sub', mx: 2, c: 3, k: 'ss', tx: 'He comes off the bench flying: 3, then 5, rating points stronger when substituted on.' },
  tal: { nm: 'Finishing Training', mx: 2, c: 4, k: 'tal', ln: ['ATT', 'WIDE'], tx: 'He becomes a Talisman, lifting the whole attack.' },
  rock: { nm: 'Defending Training', mx: 2, c: 4, k: 'rock', ln: ['DEF', 'GK'], tx: 'He becomes a Rock, lifting the whole defence.' },
  mae: { nm: 'Playmaking Training', mx: 2, c: 2, k: 'mae', ln: ['MID', 'WIDE'], tx: 'He becomes a Maestro, lifting midfield and creating more chances.' },
  poa: { nm: 'Poacher Training', mx: 2, c: 2, k: 'poa', ln: ['ATT', 'WIDE'], tx: 'He becomes a Poacher: more of your goals fall to him.' },
};
const TIERED = new Set(['tal', 'rock', 'mae', 'poa', 'tl']);
const lv = (k, v) => (TIERED.has(k) ? (v === 1 ? 2 : v === 2 ? 1 : 0) : v || 0);
const val = (k, l) => (TIERED.has(k) ? (l >= 2 ? 1 : 2) : l);
const clamp = x => Math.max(0, Math.min(PAT_MAX, x));
export const sur = s => Math.floor(s.act / (MAPS[s.map].D.length > 3 ? 2 : 1));
export const bossAt = (seed, act, n, prev) => {
  const o = [0, 1, 2].filter(i => i !== prev);
  return o[hs(`${seed}:boss:${act}:${n}`) % o.length];
};

export function runNew(seed, draft, map = 'original') {
  if (!draft?.manager || !draft.f || draft.slots?.filter(Boolean).length !== 15) throw new Error('The run needs a finished fifteen-player draft.');
  if (!MAPS[map]) throw new Error('Choose one of the four Gauntlet maps.');
  return { v: 3, seed, cap: !!draft.cap, map, m: draft.manager, f: draft.f, slots: draft.slots.map(c => ({ k: c.k, p: c.p })),
    act: 0, rd: 0, ph: 'rd', pat: PAT0, rest: 0, tries: MAPS[map].D.map(() => 0), lost: 0, boss: bossAt(seed, 0, 0, -1),
    tags: {}, up: {}, mv: {}, neg: {}, badge: { glue: 0, mgr: 0 }, last: [], fa: 0, prem: 0, log: [] };
}

// A run saved before v 2 was the eight-decade map from the 1950s; it resumes there at the start of
// its current act (or at its boss), keeping squad, tags, upgrades, patience and history. A v 2 run
// played its manager option's formation, which becomes its formation f.
export function migrate(r) {
  if (r?.v === 1 && Array.isArray(r.log)) r = up1(r);
  return r?.v === 2 ? { ...r, v: 3, f: r.m?.f } : r;
}

function up1(r) {
  if (!Number.isInteger(r.seg) || r.seg < 0 || r.seg > 2 || !['seg', 'reward', 'boss', 'done', 'fired'].includes(r.ph) ||
    (r.cap !== undefined && typeof r.cap !== 'boolean') || (r.ph === 'seg' && r.seg >= 2) ||
    (r.ph === 'reward' && r.seg === 0) || (r.ph === 'boss' && r.seg !== 2) || (r.ph === 'done' && r.seg !== 0)) {
    throw new Error('The saved Gauntlet run is invalid.');
  }
  const ph = r.ph === 'seg' || r.ph === 'reward' ? 'rd' : r.ph;
  return { v: 2, seed: r.seed, cap: !!r.cap, map: 'odyssey', m: r.m, slots: r.slots, act: r.act, rd: ['boss', 'done'].includes(ph) ? N_RD : 0, ph,
    pat: r.pat, rest: r.rest, tries: r.tries, lost: r.log.filter(e => e?.t === 'boss' && !e.won).length,
    boss: bossAt(r.seed, r.act, Array.isArray(r.tries) ? r.tries[r.act] || 0 : 0, -1), tags: r.tags, up: r.up, mv: {}, neg: {},
    badge: { glue: 0, mgr: 0 }, last: [], fa: 0, prem: 0, log: r.log };
}

export const D_of = s => MAPS[s.map].D[Math.min(s.act, MAPS[s.map].D.length - 1)];
const isLast = s => s.act >= MAPS[s.map].D.length - 1;
const term = (s, p, i) => (s.neg?.[p] === 'S' && i >= 11 ? -3 : s.neg?.[p] === 'C' && i < 11 ? 3 : 0);

export function runTeam(G, s) {
  const m = G.managers.find(m => m.nm === s.m.nm);
  const Q = s.slots.map((r, i) => {
    const c = hydrate(G, r), t = s.tags[r.p], d = (s.mv?.[r.p] || 0) + term(s, r.p, i);
    const x = t ? { ...c, tg: { ...c.tg, ...t } } : c;
    return shift(x, d);
  });
  return { m, S: shape(G, s.f), xi: Q.slice(0, 11), bn: Q.slice(11), lk: s.badge?.glue ? 1.5 : 1, gs: s.badge?.mgr || 0 };
}

// Formation change in the lineup stage between decades: the draft's policy on the run's own cards
// (tags, MVP points, signing terms), rated for the decade about to be played. Logged as {t: 'form'}.
export function runForm(G, s, f) {
  if (s.ph !== 'repo') throw new Error('Change formation after the transfer window, before the next decade.');
  const T = runTeam(G, s), o = move(T.xi, T.S, shape(G, f), MAPS[s.map].D[s.act + 1]);
  const slots = [...Array(11).fill(null), ...s.slots.slice(11)];
  o.forEach((j, i) => { slots[j] = s.slots[i]; });
  return { ...s, f, slots, log: [...s.log, { t: 'form', act: s.act, f }] };
}

const me = (G, s) => ({ id: 'your-club', nm: 'Your Era XI', T: runTeam(G, s), me: true });

export function runBoss(F, s) {
  return s.ph === 'done' || s.ph === 'fired' ? null : F[D_of(s)][s.boss];
}

export function roundOps(F, s) {
  const L = F[D_of(s)].slice(3), [a, b] = LAD[Math.min(s.rd, N_RD - 1)];
  return sh(mk(hs(`${s.seed}:ops:${s.act}:${s.rd}:${s.tries[s.act]}`)), L.slice(a, b));
}

export function runRound(G, F, s) {
  if (s.ph !== 'rd') throw new Error('Choose this round’s reward or play the boss tie first.');
  const D = D_of(s), O = roundOps(F, s), r = mk(hs(`${s.seed}:run:${s.act}:${s.rd}:${s.tries[s.act]}`)), X = me(G, s), res = [];
  if (O.length !== N_M) throw new Error(`The ${D}s needs nineteen selected clubs for a Gauntlet round.`);
  let pts = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
  O.forEach((o, i) => {
    const h = i % 2 === 0, M = h ? play(r, X, o, D, { h: P.h }) : play(r, o, X, D, { h: P.h });
    const a = h ? M.gx : M.gy, b = h ? M.gy : M.gx;
    gf += a; ga += b;
    if (a > b) { w++; pts += 3; } else if (a === b) { d++; pts++; } else l++;
    res.push({ op: o.nm, h, gf: a, ga: b });
  });
  const dp = dP(pts), pat = clamp(s.pat + dp);
  const e = { t: 'seg', D, act: s.act, seg: s.rd, w, d, l, pts, gf, ga, dp, res };
  return { ...s, pat, ph: pat <= 0 ? 'fired' : 'node', fa: 0, prem: 0, log: [...s.log, e] };
}

// Boss tie MVP (won) and LVP (lost) from the tie's recorded events: MVP has the best 4 goals + 3
// assists + 3 clean sheets + 0.1 appearances; LVP is the highest-rated outfielder with no goal or
// assist. Each is worth +1 / -1 rating for the rest of the run.
function verdict(st, T, won) {
  const R = new Map([...T.xi, ...T.bn].filter(Boolean).map(c => [c.id, c.r]));
  const Q = [...st.values()].filter(p => p.cl === 'your-club' && R.has(p.id));
  const sc = p => 4 * p.g + 3 * p.as + 3 * p.cs + 0.1 * p.ap;
  if (won) {
    const p = Q.slice().sort((a, b) => sc(b) - sc(a) || R.get(b.id) - R.get(a.id) || a.id.localeCompare(b.id))[0];
    return { mvp: p?.id || null, lvp: null };
  }
  const q = Q.filter(p => !p.k && p.g === 0 && p.as === 0).sort((a, b) => R.get(b.id) - R.get(a.id) || a.id.localeCompare(b.id))[0];
  return { mvp: null, lvp: q?.id || null };
}

export function runPlayBoss(G, F, s) {
  if (s.ph !== 'boss') throw new Error('Finish this act’s rounds before the boss tie.');
  const D = D_of(s), tries = s.tries.slice(), n = ++tries[s.act], B = runBoss(F, s), X = me(G, s), st = new Map();
  const t = tie(mk(hs(`${s.seed}:runboss:${s.act}:${n}`)), X, B, D, 'Boss', st), won = t.w === X.id;
  const { mvp, lvp } = verdict(st, X.T, won), mv = { ...s.mv };
  if (mvp) mv[mvp] = (mv[mvp] || 0) + 1;
  if (lvp) mv[lvp] = (mv[lvp] || 0) - 1;
  const dp = won ? B_WIN : -B_LOSS(s.lost), pat = clamp(s.pat + dp);
  const e = { t: 'boss', D, act: s.act, op: B.nm, n, won, agg: t.agg, legs: t.legs.map(M => [M.gx, M.gy]), et: t.et,
    pw: t.pw ? { w: t.pw.w, x: t.pw.x, y: t.pw.y } : null, dp, mvp, lvp };
  const log = [...s.log, e];
  if (won) return { ...s, tries, mv, pat, ph: isLast(s) ? 'done' : 'hop', log };
  if (pat <= 0) return { ...s, tries, mv, pat: 0, lost: s.lost + 1, ph: 'fired', log };
  return { ...s, tries, mv, pat, lost: s.lost + 1, rd: 0, ph: 'rd', rest: 0, fa: 0, prem: 0, boss: bossAt(s.seed, s.act, n, s.boss), log };
}

// Versions of a person: every card of that person across club-decades, best base rating first.
const VX = new WeakMap();
export function versions(G, p) {
  if (!VX.has(G)) {
    const X = new Map();
    for (const [k, Q] of Object.entries(G.cards)) for (const c of Q) (X.get(c.p) || X.set(c.p, []).get(c.p)).push({ k, p: c.p, r: c.r });
    for (const V of X.values()) V.sort((a, b) => b.r - a.r || a.k.localeCompare(b.k));
    VX.set(G, X);
  }
  return VX.get(G).get(p) || [];
}

export const bill = (G, s) => s.slots.map(ref => ({ k: s.up[ref.p] || ref.k, p: ref.p }));

// n players of tier floor or better from n different clubs of decade D (optionally one position
// line), none already in the squad or in skip, no club in xq, and on a capped run each able to
// replace someone within GCAP.
function market(G, s, D, r, floor, n, ln, skip = new Set(), xq = new Set()) {
  const I = new Set([...s.slots.map(c => c.p), ...skip]), X = bill(G, s), qs = new Set(xq), out = [];
  const ok = (k, x) => !I.has(x.p) && TO.indexOf(TI(x.r)) >= TO.indexOf(floor) && (!ln || line(x) === ln) &&
    (!s.cap || s.slots.some((_, i) => fits(G, X, i, { k, p: x.p }, GCAP)));
  for (let i = 0; i < n; i++) {
    const z = draw(G, r, c => c.D === D && !qs.has(c.q) && G.cards[key(c)].some(x => ok(key(c), x)), D);
    if (!z) break;
    const k = key(z), Q = G.cards[k].filter(x => ok(k, x)), x = Q[Math.floor(r() * Q.length)];
    qs.add(z.q); I.add(x.p);
    out.push({ k, p: x.p, r: x.r, l: line(x) });
  }
  return out;
}

const champs = (G, s) => { const T = runTeam(G, s); return [...T.xi, ...T.bn].filter(c => c.tg?.bg).length; };

// Price of free agent f taking squad place i, after Eraball's negotiation and the act surcharge.
export function price(G, s, f, i) {
  const t = TI(f.r);
  let c = FA[t];
  if (t === 'S' && i < 11) c--;
  if ((t === 'S' || t === 'A') && !hydrate(G, f).tg?.bg && champs(G, s) >= 5) c--;
  return Math.max(1, c) + sur(s);
}

function upgrades(G, s) {
  const u = sur(s);
  return s.slots.map((ref, i) => {
    const c = hydrate(G, ref), v = versions(G, ref.p)[0];
    return v && v.k !== ref.k && v.r > c.r + 0.5 ? { i, from: { k: ref.k, p: ref.p, r: c.r }, to: v, cost: upC(TI(c.r), TI(v.r)) + u } : null;
  }).filter(Boolean);
}

function devs(G, s) {
  const u = sur(s), T = runTeam(G, s), Q = [...T.xi, ...T.bn], out = [];
  for (const [id, d] of Object.entries(DEV)) {
    if (d.team) {
      if ((s.badge[id] || 0) < d.mx) out.push({ kind: 'dev', id, team: true, cost: d.c + u });
      continue;
    }
    const who = Q.map((c, i) => i).filter(i => (!d.ln || d.ln.includes(line(Q[i]))) && lv(d.k, Q[i].tg?.[d.k]) < d.mx);
    if (who.length) out.push({ kind: 'dev', id, team: false, who, cost: d.c + u });
  }
  const up = upgrades(G, s);
  if (up.length) out.push({ kind: 'dev', id: 'upg', team: false, list: up, cost: Math.min(...up.map(x => x.cost)) });
  return out;
}

// The reward after a round: the transfer market, one development (two, instead of rest, at full
// patience, never one offered last time when another exists), rest, and below DESP a desperation offer.
export function offers(G, F, s) {
  if (s.ph !== 'node') return [];
  const D = D_of(s), tag = `${s.seed}:node:${s.act}:${s.rd}:${s.tries[s.act]}`, out = [];
  const fa = market(G, s, D, mk(hs(`${tag}:fa:${s.fa}`)), s.prem ? 'A' : 'C', 3);
  if (fa.length) out.push({ kind: 'market', list: fa, re: !s.fa });
  const L = devs(G, s), r = mk(hs(`${tag}:dev`));
  for (let n = s.pat >= PAT_MAX ? 2 : 1; n > 0 && L.length; n--) {
    const fresh = L.filter(d => !s.last.includes(d.id)), Q = fresh.length ? fresh : L, d = Q[Math.floor(r() * Q.length)];
    out.push(d); L.splice(L.indexOf(d), 1);
  }
  if (s.pat < PAT_MAX) out.push({ kind: 'rest', gain: REST[Math.min(2, s.rest)] });
  if (s.pat < DESP) {
    const z = mk(hs(`${tag}:desp`)), a = market(G, s, D, z, 'S', 1);
    const b = market(G, s, D, z, 'A', a.length ? 1 : 2, null, new Set(a.map(x => x.p)));
    const list = [...a, ...b].map(x => ({ ...x, cost: s.pat >= 3 ? 1 : 0 }));
    if (list.length) out.push({ kind: 'desp', list });
  }
  return out;
}

const spend = (s, cost) => {
  if (cost > 0 && s.pat - cost < 1) throw new Error(`Needs ${cost + 1} patience; the board keeps at least 1.`);
  return s.pat - cost;
};

// Remove a departing person's run records (tags, cap charge, MVP points, signing terms).
const drop = (s, p) => {
  const o = {};
  for (const k of ['tags', 'up', 'mv', 'neg']) { o[k] = { ...s[k] }; delete o[k][p]; }
  return o;
};

export function respin(G, F, s, prem = false) {
  if (s.ph !== 'node' || s.fa) throw new Error('Free agency can be re-spun once per reward.');
  const cost = (prem ? 5 : 1) + sur(s), min = cost + FA[prem ? 'A' : 'C'] + sur(s) + 1;
  if (s.pat < min) throw new Error(`Needs ${min} patience for a ${prem ? 'premium' : 'scout'} re-spin and a signing.`);
  return { ...s, pat: s.pat - cost, fa: 1, prem: prem ? 1 : 0, log: [...s.log, { t: 'respin', prem: !!prem, cost }] };
}

export function take(G, F, s, j, o = {}) {
  const O = offers(G, F, s), c = O[j];
  if (!c) throw new Error('Choose one of the reward cards.');
  const rd = s.rd + 1, nx = { ...s, rd, ph: rd >= N_RD ? 'boss' : 'rd', fa: 0, prem: 0, rest: 0, last: O.filter(x => x.kind === 'dev').map(x => x.id) };
  if (c.kind === 'rest') return { ...nx, pat: clamp(s.pat + c.gain), rest: s.rest + 1, log: [...s.log, { t: 'rest', gain: c.gain }] };
  if (c.kind === 'market' || c.kind === 'desp') {
    const f = c.list[o.pick ?? 0], i = o.slot;
    if (!f || !Number.isInteger(i) || i < 0 || i > 14) throw new Error('Choose a signing and the squad place he takes.');
    const ref = { k: f.k, p: f.p }, cost = c.kind === 'desp' ? f.cost : price(G, s, f, i);
    if (s.cap) { const Q = bill(G, s); Q[i] = ref; ck(G, Q, GCAP); }
    const slots = s.slots.slice(), out = slots[i]; slots[i] = ref;
    const d = drop(s, out.p), t = c.kind === 'market' && ['S', 'C'].includes(TI(f.r)) ? TI(f.r) : null;
    return { ...nx, ...d, pat: spend(s, cost), slots, neg: t ? { ...d.neg, [f.p]: t } : d.neg,
      log: [...s.log, { t: 'sign', p: f.p, k: f.k, out: out.p, cost, ...(c.kind === 'desp' ? { desp: 1 } : {}) }] };
  }
  if (c.id === 'upg') {
    const u = c.list[o.pick ?? 0];
    if (!u) throw new Error('Choose the player to upgrade.');
    const slots = s.slots.slice(); slots[u.i] = { k: u.to.k, p: u.to.p };
    return { ...nx, pat: spend(s, u.cost), slots, up: { ...s.up, [u.to.p]: s.up[u.to.p] || u.from.k },
      log: [...s.log, { t: 'boost', p: u.to.p, from: u.from.k, to: u.to.k, cost: u.cost }] };
  }
  const d = DEV[c.id], pat = spend(s, c.cost);
  if (d.team) return { ...nx, pat, badge: { ...s.badge, [c.id]: (s.badge[c.id] || 0) + 1 }, log: [...s.log, { t: 'dev', id: c.id, cost: c.cost }] };
  const i = o.player ?? c.who[0];
  if (!c.who.includes(i)) throw new Error('Choose a player this development suits.');
  const p = s.slots[i].p, cur = runTeam(G, s), now = [...cur.xi, ...cur.bn][i].tg?.[d.k], l = lv(d.k, now) + 1;
  return { ...nx, pat, tags: { ...s.tags, [p]: { ...(s.tags[p] || {}), [d.k]: val(d.k, l) } },
    log: [...s.log, { t: 'dev', id: c.id, p, lv: l, cost: c.cost }] };
}

// Transfer window after a won boss tie: five players from five clubs of the decade being left and
// five of the decade being entered, one per position line; HOP_N are signed from each.
export function hopPools(G, s) {
  if (s.ph !== 'hop') return null;
  const D0 = D_of(s), D1 = MAPS[s.map].D[s.act + 1], seen = new Set();
  const pool = (D, tag) => {
    const r = mk(hs(`${s.seed}:hop:${s.act}:${tag}`)), out = [], qs = new Set();
    for (const l of Object.keys(LINES)) {
      const x = market(G, { ...s, cap: false }, D, r, 'C', 1, l, new Set([...seen, ...out.map(y => y.p)]), qs)[0];
      if (!x) continue;
      qs.add(x.k.split(':')[0]); out.push(x);
    }
    out.forEach(x => seen.add(x.p));
    return out;
  };
  const old = pool(D0, 'old');
  return { from: D0, to: D1, old, neu: pool(D1, 'new') };
}

export function hop(G, s, sel = {}) {
  const H = hopPools(G, s);
  if (!H) throw new Error('The transfer window opens after a boss tie is won.');
  const a = sel.old || [], b = sel.neu || [], out = sel.out || [], need = [Math.min(HOP_N, H.old.length), Math.min(HOP_N, H.neu.length)];
  const pick = (Q, L, n) => Q.length === n && new Set(Q).size === n && Q.every(i => Number.isInteger(i) && i >= 0 && i < L.length);
  if (!pick(a, H.old, need[0]) || !pick(b, H.neu, need[1])) throw new Error(`Sign ${need[0]} from the ${H.from}s and ${need[1]} from the ${H.to}s.`);
  if (out.length !== a.length + b.length || new Set(out).size !== out.length || out.some(i => !Number.isInteger(i) || i < 0 || i > 14)) throw new Error('Choose a different squad place for each signing.');
  const ins = [...a.map(i => H.old[i]), ...b.map(i => H.neu[i])], slots = s.slots.slice();
  let x = s;
  for (const i of out) x = { ...x, ...drop(x, s.slots[i].p) };
  ins.forEach((f, j) => { slots[out[j]] = { k: f.k, p: f.p }; });
  if (s.cap) ck(G, bill(G, { ...x, slots }), GCAP);
  return { ...x, slots, ph: 'repo', log: [...s.log, { t: 'hop', act: s.act, in: ins.map(f => [f.k, f.p]), out: out.map(i => s.slots[i].p) }] };
}

export function runSwap(s, a, b) {
  if (s.ph !== 'repo') throw new Error('The lineup can be rearranged after the transfer window.');
  if (![a, b].every(i => Number.isInteger(i) && i >= 0 && i < 15)) throw new Error('Choose two squad places.');
  const slots = s.slots.slice(); [slots[a], slots[b]] = [slots[b], slots[a]];
  return { ...s, slots };
}

export function nextAct(s) {
  if (s.ph !== 'repo') throw new Error('Finish the transfer window first.');
  const act = s.act + 1;
  return { ...s, act, rd: 0, ph: 'rd', rest: 0, fa: 0, prem: 0, boss: bossAt(s.seed, act, 0, -1), log: [...s.log, { t: 'act', act }] };
}

// Eraball's run score: every cleared act is worth 10 + 5 x act, divided by 1 + its lost ties; times
// 0.5 + the round win rate (a draw counts half), 1.5 under the salary cap, and 1 + 0.2 x patience/20
// + 0.15 when no tie was ever lost.
export function score(s) {
  const b = s.log.filter(e => e.t === 'boss'), sg = s.log.filter(e => e.t === 'seg'), lost = {};
  for (const e of b) if (!e.won) lost[e.act] = (lost[e.act] || 0) + 1;
  const ap = b.filter(e => e.won).reduce((x, e) => x + (10 + 5 * e.act) / (1 + (lost[e.act] || 0)), 0);
  const w = sg.reduce((x, e) => x + e.w, 0), d = sg.reduce((x, e) => x + e.d, 0), l = sg.reduce((x, e) => x + e.l, 0);
  const wr = w + d + l ? (w + 0.5 * d) / (w + d + l) : 0;
  const bonus = 0.2 * Math.min(1, s.pat / PAT_MAX) + (b.length && b.every(e => e.won) ? 0.15 : 0);
  return { acts: b.filter(e => e.won).length, attempts: b.length, w, d, l, pat: s.pat,
    score: ap > 0 ? Math.round(ap * (0.5 + wr) * (s.cap ? 1.5 : 1) * (1 + bonus) * 100) / 100 : 0 };
}

// Saved and imported runs are editable files: check every field the run and its views read. A v 1
// run is migrated first; its history entries keep their v 1 shapes.
const PH = ['rd', 'node', 'boss', 'hop', 'repo', 'done', 'fired'];
export function validRun(G, r0, manager, cap) {
  const r = migrate(r0);
  const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const int = (x, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= lo && x <= hi;
  const person = p => typeof p === 'string' && Object.hasOwn(G.people, p);
  const ref = (k, p) => typeof k === 'string' && person(p) && !!G.cards[k]?.some(c => c.p === p);
  const M = obj(r) ? MAPS[r.map] : null;
  const act = e => obj(e) && M && int(e.act, 0, M.D.length - 1) && e.D === M.D[e.act];
  const tg = (k, v) => (['tal', 'rock', 'mae', 'poa', 'tl', 'vs', 'ss'].includes(k) && (v === 1 || v === 2)) || (k === 'bg' && int(v, 1, 3));
  const pair = x => Array.isArray(x) && x.length === 2 && x.every(y => int(y));
  const log = e => {
    if (!obj(e)) return false;
    if (e.t === 'seg') return act(e) && int(e.seg, 0, N_RD - 1) && [e.w, e.d, e.l, e.gf, e.ga].every(x => int(x)) &&
      e.w + e.d + e.l === N_M && e.pts === 3 * e.w + e.d && int(e.dp, -5, 3) &&
      Array.isArray(e.res) && e.res.length === N_M && e.res.every(f => obj(f) && typeof f.op === 'string' && typeof f.h === 'boolean' && int(f.gf) && int(f.ga));
    if (e.t === 'boss') {
      const base = act(e) && typeof e.op === 'string' && int(e.n, 1) && typeof e.won === 'boolean' && typeof e.et === 'boolean' && [4, -4, -6].includes(e.dp);
      if (!base) return false;
      if (e.legs === undefined) return int(e.gx) && int(e.gy) && (!e.pw || (obj(e.pw) && int(e.pw.w, 0, 1) && int(e.pw.x) && int(e.pw.y)));
      return pair(e.agg) && Array.isArray(e.legs) && e.legs.length === 2 && e.legs.every(pair) &&
        (e.pw === null || (obj(e.pw) && int(e.pw.w, 0, 1) && int(e.pw.x) && int(e.pw.y))) &&
        (e.mvp === null || person(e.mvp)) && (e.lvp === null || person(e.lvp)) && !(e.mvp && e.lvp);
    }
    if (e.t === 'rest') return int(e.gain, 0, 2);
    if (e.t === 'boost') return ref(e.from, e.p) && ref(e.to, e.p) && int(e.cost, 1, 12);
    if (e.t === 'sign') return ref(e.k, e.p) && person(e.out) && int(e.cost, 0, 12) && (e.desp === undefined || e.desp === 1);
    if (e.t === 'tag') return person(e.p) && ['tal', 'mae', 'rock'].includes(e.tag) && int(e.lv, 1, 2) && e.cost === 2;
    if (e.t === 'dev') return Object.hasOwn(DEV, e.id) && int(e.cost, 1, 12) && (DEV[e.id].team ? e.p === undefined : person(e.p) && int(e.lv, 1, DEV[e.id].mx));
    if (e.t === 'respin') return typeof e.prem === 'boolean' && int(e.cost, 1, 12);
    if (e.t === 'hop') return M && int(e.act, 0, M.D.length - 2) && Array.isArray(e.in) && Array.isArray(e.out) && e.in.length === e.out.length &&
      e.in.length <= 2 * HOP_N && e.in.every(x => Array.isArray(x) && ref(x[0], x[1])) && e.out.every(person);
    if (e.t === 'act') return M && int(e.act, 1, M.D.length - 1);
    if (e.t === 'form') return M && int(e.act, 0, M.D.length - 2) && typeof e.f === 'string' && Object.hasOwn(G.formations, e.f);
    return false;
  };
  // A run made before club spells (m without q) matches its draft by manager name.
  const ok = obj(r) && r.v === 3 && int(r.seed, 0, 4294967295) && typeof r.cap === 'boolean' && !!M && obj(r.m) && obj(manager) &&
    r.m.nm === manager.nm && (r.m.q === undefined || (r.m.q === manager.q && r.m.a === manager.a)) &&
    typeof r.f === 'string' && Object.hasOwn(G.formations, r.f) && Array.isArray(r.slots) && r.slots.length === 15 && r.slots.every(c => obj(c) && ref(c.k, c.p)) &&
    new Set(r.slots.map(c => c.p)).size === 15 && int(r.act, 0, M.D.length - 1) && int(r.rd, 0, N_RD) && PH.includes(r.ph) &&
    int(r.pat, 0, PAT_MAX) && int(r.rest) && Array.isArray(r.tries) && r.tries.length === M.D.length && r.tries.every(x => int(x)) &&
    int(r.lost) && int(r.boss, 0, 2) && obj(r.tags) && Object.entries(r.tags).every(([p, t]) => person(p) && obj(t) && Object.entries(t).every(([k, v]) => tg(k, v))) &&
    obj(r.up) && Object.entries(r.up).every(([p, k]) => ref(k, p)) && obj(r.mv) && Object.entries(r.mv).every(([p, v]) => person(p) && int(v, -Number.MAX_SAFE_INTEGER)) &&
    obj(r.neg) && Object.entries(r.neg).every(([p, v]) => person(p) && ['S', 'C'].includes(v)) &&
    obj(r.badge) && int(r.badge.glue, 0, DEV.glue.mx) && int(r.badge.mgr, 0, DEV.mgr.mx) && Object.keys(r.badge).every(k => ['glue', 'mgr'].includes(k)) &&
    Array.isArray(r.last) && r.last.every(id => id === 'upg' || Object.hasOwn(DEV, id)) && int(r.fa, 0, 1) && int(r.prem, 0, 1) && r.prem <= r.fa &&
    Array.isArray(r.log) && r.log.every(log) &&
    (r.ph === 'fired' ? r.pat === 0 : r.pat > 0) && (!['rd', 'node'].includes(r.ph) || r.rd < N_RD) && (!['boss', 'hop', 'repo', 'done'].includes(r.ph) || r.rd === N_RD) &&
    (!['hop', 'repo'].includes(r.ph) || r.act < M.D.length - 1) && (r.ph !== 'done' || r.act === M.D.length - 1);
  if (!ok) throw new Error('The saved Gauntlet run is invalid.');
  if (r.cap !== cap) throw new Error('The saved Gauntlet cap does not match the draft.');
  if (cap) {
    const U = {};
    for (const e of r.log) {
      if (e.t === 'boost') U[e.p] ||= e.from;
      if (e.t === 'sign') { delete U[e.out]; delete U[e.p]; }
      if (e.t === 'hop') for (const p of e.out) delete U[p];
    }
    for (const [p, k] of Object.entries(r.up)) if (U[p] !== k) throw new Error('The saved Gauntlet boost charge is invalid.');
    ck(G, bill(G, r), GCAP);
  }
  return r;
}
