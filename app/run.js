import { mk, hs, sh, wp, fin, play, P } from './engine/index.js';
import { hydrate, shape, draw, DECADES } from './draft.js';
import { TI, GCAP, fits, ck } from './cap.js';
export { TI, CAP, GCAP } from './cap.js';

// Era Gauntlet run: Eraball's gauntlet (acts, segments, a boss, owner patience, rewards between
// segments) played with the drafted fifteen. Decades are acts, in order from the 1950s. Each act is
// N_SEG segments of N_M matches against that decade's clubs, then its boss, the decade's strongest
// club, in one neutral knockout match. A boss loss costs patience and the boss can be retried while
// patience lasts; the run ends when patience reaches zero or the eighth boss falls.
//
// Legend
//   G dataset; F decade fields (strongest clubs, from data.fields); s run state; T hydrated team
//   N_SEG, N_M      segments per act, matches per segment (football scaling of Eraball's 4 x 14)
//   PAT0, PAT_MAX   starting and maximum patience (Eraball 8, 20)
//   dP(pts)         patience after a segment by points: >= 13 +2, 9..12 0, 5..8 -2, else -3
//                   (Eraball: 9+ wins of 14 pays, 7-8 is safe, fewer costs)
//   B_WIN, B_LOSS   boss win +4; boss loss -4 the first time in an act, -6 after (Eraball)
//   TI(r)           tier of a base rating: S >= 90, A >= 85, B >= 80, C >= 75, else D
//   upC(a, b)       boost cost by tiers climbed: 1 same tier, 2 one, 3 two, 4 three or more, +1 to
//                   reach S (Eraball UPGRADE_COST_*)
//   faC(t)          free agent cost by tier: 2 for D/C/B, 3 for A, 4 for S
//   GCAP            a capped run holds at most 2 S and 4 A charges (Eraball's gauntlet cap); a boost
//                   keeps the charge of the card it replaced, so earned upgrades are never blocked
//   REST            rest pays +2, then +1, then 0 when taken back to back (Eraball)
//   TAG             tag developed by line: attack Talisman, midfield Maestro, defence Rock (tier 2, or
//                   tier 1 when the player already has tier 2); cost 2
//   p_boost         chance a reward phase deals the boost card when someone can be upgraded
//   offers(G, s)    the three reward cards of the current reward phase, from the run seed
//   state: v, seed, m (manager option), slots (15 refs {k, p}), act, seg, ph (seg | reward | boss |
//          done | fired), pat, rest, tries (boss attempts per act), tags (person -> {tal|mae|rock}),
//          up (person -> earlier ref, for display), log (one entry per segment, boss or reward)

export const N_SEG = 2, N_M = 6, PAT0 = 8, PAT_MAX = 20, B_WIN = 4;
export const B_LOSS = n => (n <= 1 ? 4 : 6);
export const dP = p => (p >= 13 ? 2 : p >= 9 ? 0 : p >= 5 ? -2 : -3);
const TO = ['D', 'C', 'B', 'A', 'S'];
export const upC = (a, b) => {
  const d = TO.indexOf(b) - TO.indexOf(a);
  return (d <= 0 ? 1 : d === 1 ? 2 : d === 2 ? 3 : 4) + (b === 'S' && a !== 'S' ? 1 : 0);
};
export const faC = t => (t === 'S' ? 4 : t === 'A' ? 3 : 2);
export const REST = [2, 1, 0];
const p_boost = 0.6, TAG_C = 2;
const clamp = x => Math.max(0, Math.min(PAT_MAX, x));

export function runNew(seed, draft) {
  if (!draft?.manager || draft.slots?.filter(Boolean).length !== 15) throw new Error('The run needs a finished fifteen-player draft.');
  return { v: 1, seed, cap: !!draft.cap, m: draft.manager, slots: draft.slots.map(c => ({ k: c.k, p: c.p })), act: 0, seg: 0, ph: 'seg',
    pat: PAT0, rest: 0, tries: DECADES.map(() => 0), tags: {}, up: {}, log: [] };
}

export const D_of = s => DECADES[Math.min(s.act, DECADES.length - 1)];

export function runTeam(G, s) {
  const m = G.managers.find(m => m.nm === s.m.nm);
  const Q = s.slots.map(r => {
    const c = hydrate(G, r);
    const t = s.tags[r.p];
    return t ? { ...c, tg: { ...c.tg, ...t } } : c;
  });
  return { m, S: shape(G, s.m.f), xi: Q.slice(0, 11), bn: Q.slice(11) };
}

const me = (G, s) => ({ id: 'your-club', nm: 'Your Era XI', T: runTeam(G, s), me: true });
const boss = (F, s) => F[D_of(s)][0];

export function runBoss(F, s) {
  return s.ph === 'done' || s.ph === 'fired' ? null : boss(F, s);
}

export function runSegment(G, F, s) {
  if (s.ph !== 'seg') throw new Error('Play the reward or the boss first.');
  const D = D_of(s), r = mk(hs(`${s.seed}:run:${s.act}:${s.seg}:${s.tries[s.act]}`));
  const O = sh(r, F[D].slice(1)).slice(0, N_M), X = me(G, s), res = [];
  let pts = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
  O.forEach((o, i) => {
    const h = i % 2 === 0, M = h ? play(r, X, o, D, { h: P.h }) : play(r, o, X, D, { h: P.h });
    const a = h ? M.gx : M.gy, b = h ? M.gy : M.gx;
    gf += a; ga += b;
    if (a > b) { w++; pts += 3; } else if (a === b) { d++; pts++; } else l++;
    res.push({ op: o.nm, h, gf: a, ga: b });
  });
  const dp = dP(pts), pat = clamp(s.pat + dp);
  const e = { t: 'seg', D, act: s.act, seg: s.seg, w, d, l, pts, gf, ga, dp, res };
  return { ...s, pat, ph: pat <= 0 ? 'fired' : 'reward', seg: s.seg + 1, log: [...s.log, e] };
}

export function runPlayBoss(G, F, s) {
  if (s.ph !== 'boss') throw new Error('The boss is not ready yet.');
  const D = D_of(s), tries = s.tries.slice(), n = ++tries[s.act];
  const r = mk(hs(`${s.seed}:runboss:${s.act}:${n}`));
  const B = boss(F, s), f = fin(r, me(G, s), B, D), won = f.w === 'your-club';
  const dp = won ? B_WIN : -B_LOSS(n), pat = clamp(s.pat + dp);
  const e = { t: 'boss', D, act: s.act, op: B.nm, n, won, gx: f.legs[0].gx, gy: f.legs[0].gy, et: f.et, pw: f.pw, dp };
  const act = s.act + Number(won), done = won && act >= DECADES.length;
  return { ...s, tries, pat, act: done ? s.act : act, seg: won ? 0 : s.seg, log: [...s.log, e],
    ph: done ? 'done' : pat <= 0 ? 'fired' : won ? 'seg' : 'boss' };
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

export function offers(G, F, s) {
  if (s.ph !== 'reward') return [];
  const r = mk(hs(`${s.seed}:offer:${s.act}:${s.seg}:${s.tries[s.act]}`));
  const out = [], alt = [];
  const up = s.slots.map((ref, i) => {
    const c = hydrate(G, ref), v = versions(G, ref.p)[0];
    return v && v.k !== ref.k && v.r > c.r + 0.5 ? { i, from: { ...ref, r: c.r }, to: v } : null;
  }).filter(Boolean);
  if (up.length && r() < p_boost) {
    const o = up[wp(r, up.map(u => u.to.r - u.from.r))];
    out.push({ kind: 'boost', i: o.i, from: o.from, to: o.to, cost: upC(TI(o.from.r), TI(o.to.r)) });
  }
  const I = new Set(s.slots.map(c => c.p));
  const X = bill(G, s);
  const eligible = (k, x) => !I.has(x.p) && (!s.cap || s.slots.some((ref, i) => fits(G, X, i, { k, p: x.p }, GCAP)));
  const z = draw(G, r, c => G.cards[`${c.q}:${c.D}`].some(x => eligible(`${c.q}:${c.D}`, x)));
  const k = z ? `${z.q}:${z.D}` : null;
  const fa = k ? G.cards[k].filter(x => eligible(k, x)).slice(0, 3).map(x => ({ k, p: x.p, r: x.r, cost: faC(TI(x.r)) })) : [];
  if (fa.length) alt.push({ kind: 'sign', k, list: fa });
  const ti = Math.floor(r() * 15), c = hydrate(G, s.slots[ti]), L = c.pos?.[0] || 'CM';
  const tag = ['ST', 'CF', 'LW', 'RW', 'CAM'].includes(L) ? 'tal' : ['CM', 'CDM', 'LM', 'RM'].includes(L) ? 'mae' : 'rock';
  const cur = s.tags[c.p]?.[tag] ?? c.tg?.[tag];
  if (cur !== 1) alt.push({ kind: 'tag', i: ti, p: c.p, tag, lv: cur === 2 ? 1 : 2, cost: TAG_C });
  for (const x of sh(r, alt)) if (out.length < 2) out.push(x);
  out.push({ kind: 'rest', gain: REST[Math.min(2, s.rest)], cost: 0 });
  return out;
}

const spend = (s, cost) => {
  if (cost > 0 && s.pat - cost < 1) throw new Error(`Needs ${cost + 1} patience; the board keeps at least 1.`);
  return s.pat - cost;
};

export function take(G, F, s, j, o = {}) {
  const O = offers(G, F, s), c = O[j];
  if (!c) throw new Error('Choose one of the reward cards.');
  const next = { ...s, ph: s.seg >= N_SEG ? 'boss' : 'seg' };
  if (c.kind === 'rest') return { ...next, pat: clamp(s.pat + c.gain), rest: s.rest + 1, log: [...s.log, { t: 'rest', gain: c.gain }] };
  if (c.kind === 'boost') {
    const slots = s.slots.slice(); slots[c.i] = { k: c.to.k, p: c.to.p };
    return { ...next, pat: spend(s, c.cost), rest: 0, slots, up: { ...s.up, [c.to.p]: s.up[c.to.p] || c.from.k },
      log: [...s.log, { t: 'boost', p: c.to.p, from: c.from.k, to: c.to.k, cost: c.cost }] };
  }
  if (c.kind === 'sign') {
    const f = c.list[o.pick ?? 0], i = o.slot;
    if (!f || !Number.isInteger(i) || i < 0 || i > 14) throw new Error('Choose a signing and the squad place he takes.');
    const ref = { k: f.k, p: f.p };
    if (s.cap) { const Q = bill(G, s); Q[i] = ref; ck(G, Q, GCAP); }
    const slots = s.slots.slice(), out = slots[i]; slots[i] = ref;
    const up = { ...s.up }; delete up[out.p]; delete up[f.p];
    return { ...next, pat: spend(s, f.cost), rest: 0, slots, up, log: [...s.log, { t: 'sign', p: f.p, k: f.k, out: out.p, cost: f.cost }] };
  }
  const tags = { ...s.tags, [c.p]: { ...(s.tags[c.p] || {}), [c.tag]: c.lv } };
  return { ...next, pat: spend(s, c.cost), rest: 0, tags, log: [...s.log, { t: 'tag', p: c.p, tag: c.tag, lv: c.lv, cost: c.cost }] };
}

export function score(s) {
  const b = s.log.filter(e => e.t === 'boss'), sg = s.log.filter(e => e.t === 'seg');
  return { acts: b.filter(e => e.won).length, attempts: b.length, w: sg.reduce((x, e) => x + e.w, 0),
    d: sg.reduce((x, e) => x + e.d, 0), l: sg.reduce((x, e) => x + e.l, 0), pat: s.pat };
}
