import { mk, hs, rate, shift, move } from './engine/index.js';
import { hydrate, shape, draw, key, DECADES } from './draft.js';
import { TI, GCAP, fits, ck } from './cap.js';
import { DEV, PAT0, PAT_MAX, B_WIN, B_LOSS, dP, REST, DESP, line, versions, upC,
  runTeam, bill, price, respin, score } from './run.js';
import * as Club from './club.js';

// A career is a serializable decade of actual club seasons. Season and reward reducers return new
// state; only halfPlay mutates, so it receives a cloned season. The Gauntlet's rules and saves retain
// their own state. Shared prices, tier charges, training and negotiation come from run.js.
export const CAREER_VERSION = 1;
export const CAREER_DEV = {
  ...DEV,
  touch: { nm: 'First-touch Training', mx: 2, c: 3, boost: 1, ln: ['MID', 'WIDE', 'ATT'], tx: 'Adds one rating point per level to this player.' },
  composure: { nm: 'Composure Training', mx: 2, c: 3, boost: 1, tx: 'Adds one rating point per level for a player the side can trust.' },
  team: { nm: 'Team First', team: 1, mx: 1, c: 3, tx: 'Partnership and teammate links count another 20% more across the squad.' },
  buyin: { nm: 'Player Buy-In', mx: 1, c: 2, boost: 1, tx: 'Adds one rating point and resolves this player’s desperation-signing disruption.' },
};
const TIERS = ['D', 'C', 'B', 'A', 'S'], PH = ['half', 'node', 'hop', 'repo', 'done', 'fired'];
const TIERED = new Set(['tal', 'rock', 'mae', 'poa', 'tl']);
const lv = (k, v) => TIERED.has(k) ? (v === 1 ? 2 : v === 2 ? 1 : 0) : v || 0;
const val = (k, l) => TIERED.has(k) ? (l >= 2 ? 1 : 2) : l;
const clamp = n => Math.max(0, Math.min(PAT_MAX, n));
const clone = s => JSON.parse(JSON.stringify(s));
const charge = s => Math.floor(s.y / 2);
const adapter = s => ({ ...s, act: s.y, map: 'odyssey' });
const seedKey = s => `${s.seed}:career:${s.lg}:${s.q}`;
const lastYear = s => s.y === s.years.length - 1;
export const careerBill = (G, s) => bill(G, s);

export function careerTeam(G, s) {
  const T = runTeam(G, s);
  const extra = c => {
    const v = s.skills[c.id] || {}, bonus = ['touch', 'composure', 'buyin'].reduce((a, k) => a + (v[k] || 0), 0);
    return bonus ? shift(c, bonus) : c;
  };
  // A bargain star disrupts established links until he leaves or receives Player Buy-In.
  return { ...T, xi: T.xi.map(extra), bn: T.bn.map(extra),
    lk: T.lk * (s.badge.team ? 1.2 : 1) * (Object.keys(s.trouble).length ? 0.75 : 1) };
}
const mine = (G, s) => {
  const T = careerTeam(G, s);
  return { id: s.q, nm: Club.cname(G, s.q), T, x: rate(T, s.D).ovr, cc: s.lg, me: true };
};
const ban = s => new Set(s.slots.map(c => c.p));
const previous = s => {
  const S = s.history.at(-1)?.S;
  if (!S) return null;
  return { tab: S.L.rows.map(r => r[0]), C: S.K.C ? { w: S.K.C.ch, r: S.K.C.ru } : null,
    LC: S.K.LC ? { w: S.K.LC.ch, r: S.K.LC.ru } : null,
    EC: S.K.EC?.ch || null, CW: S.K.CW?.ch || null, UC: S.K.UC?.ch || null };
};
const season = (G, s) => Club.season0(G, seedKey(s), s.lg, s.years[s.y], s.q, mine(G, s), ban(s), s.m.nm, previous(s));

export function careerStart(G, draft) {
  if (!draft?.manager || !draft.f || draft.slots?.length !== 15 || draft.slots.some(c => !c) ||
    !DECADES.includes(draft.D)) throw new Error('The career needs a finished fifteen-player draft.');
  if (!Number.isSafeInteger(draft.seed) || draft.seed < 0 || draft.seed > 4294967295) throw new Error('The career seed is invalid.');
  shape(G, draft.f);
  const q = draft.manager.q, lg = Club.leagueOf(G, q, draft.D), years = Club.years(G, lg, draft.D);
  if (!q || !G.clubs[q] || !lg || !years.length) throw new Error('Choose a club with league records in this decade to start a career.');
  const slots = draft.slots.map(c => { hydrate(G, c); return { k: c.k, p: c.p }; });
  if (new Set(slots.map(c => c.p)).size !== 15) throw new Error('The career needs fifteen different people.');
  if (draft.cap) ck(G, slots, GCAP);
  const s = { v: CAREER_VERSION, kind: 'career', seed: draft.seed, cap: !!draft.cap, D: draft.D,
    m: { ...draft.manager }, f: draft.f, slots, lg, q, years, y: 0, ph: 'half', half: 0,
    pat: PAT0, rest: 0, lost: 0, tags: {}, up: {}, mv: {}, neg: {}, skills: {}, trouble: {},
    badge: { glue: 0, mgr: 0, team: 0 }, last: [], fa: 0, prem: 0, history: [], trophies: [], log: [],
    node: { window: 'winter', left: 0, free: 0 }, owner: 'You have a decade to make this club yours. Show me what this squad can do.' };
  return { ...s, S: season(G, s) };
}

// Declared expectation scale: par maps to 10.5 (inside Eraball's neutral band), zero to zero and
// maximum possible points to 18. Above and below par have separate linear slopes.
export function careerDelta(points, expected, maximum) {
  const par = Math.max(0, Math.min(maximum, expected));
  const x = points <= par ? (par ? 10.5 * points / par : 10.5)
    : 10.5 + 7.5 * (points - par) / Math.max(1e-9, maximum - par);
  return dP(Math.max(0, Math.min(18, x)) + 1e-9);
}
const halfLine = dp => dp >= 2 ? 'That is the standard I want. You have given the club room to grow.'
  : dp >= 0 ? 'We are on course. Keep the dressing room together and make the next window count.'
    : 'Results are below what this squad should deliver. I need a response after the break.';
const playerVerdict = (G, s, S, won) => {
  const Q = [...careerTeam(G, s).xi, ...careerTeam(G, s).bn], ids = new Map(Q.map(c => [c.id, c.r]));
  const st = S.sy.filter(r => ids.has(r[0]));
  const points = r => 4 * r[1] + 3 * r[2] + 3 * r[3] + 0.1 * r[4];
  const mvp = won ? st.slice().sort((a, b) => points(b) - points(a) || ids.get(b[0]) - ids.get(a[0]) || a[0].localeCompare(b[0]))[0]?.[0] : null;
  const lvp = !won ? st.filter(r => !r[5] && !r[1] && !r[2]).sort((a, b) => ids.get(b[0]) - ids.get(a[0]) || a[0].localeCompare(b[0]))[0]?.[0] : null;
  return { mvp: mvp || null, lvp: lvp || null };
};

export function careerPlayHalf(G, s) {
  if (s.ph !== 'half') throw new Error('Finish the reward or transfer window before playing another half.');
  const h = s.half + 1;
  if (h !== 1 && h !== 2) throw new Error('This season has already been played.');
  const S = clone(s.S), by = Club.sides(G, S, mine(G, s), ban(s), s.m.nm), [expected, n] = Club.par(S, by, h), before = S.me.length;
  Club.halfPlay(seedKey(s), S, by, h);
  const matches = S.me.slice(before).filter(f => f.k === 'L');
  const w = matches.filter(f => f.gf > f.ga).length, d = matches.filter(f => f.gf === f.ga).length, l = matches.length - w - d;
  const pts = S.w * w + d, dp = careerDelta(pts, expected, S.w * n), pat = clamp(s.pat + dp);
  const e = { t: 'seg', D: s.D, act: s.y, s: S.s, half: h, w, d, l, pts, expected,
    maximum: S.w * n, dp, gf: matches.reduce((x, f) => x + f.gf, 0), ga: matches.reduce((x, f) => x + f.ga, 0) };
  const wonCups = Object.values(S.K).filter(K => K.ch === s.q && !s.trophies.some(t => t.s === S.s && t.k === K.k))
    .map(K => ({ s: S.s, k: K.k, nm: K.nm }));
  let nx = { ...s, S, half: h, pat, fa: 0, prem: 0, owner: halfLine(dp), log: [...s.log, e],
    trophies: [...s.trophies, ...wonCups], node: { window: h === 1 ? 'winter' : 'summer', left: 1 + wonCups.length, free: wonCups.length } };
  if (h === 2) {
    const table = S.L.rows, pos = 1 + table.findIndex(r => r[0] === s.q), won = pos <= S.obj.t;
    const v = playerVerdict(G, nx, S, won), mv = { ...s.mv };
    if (v.mvp) mv[v.mvp] = (mv[v.mvp] || 0) + 1;
    if (v.lvp) mv[v.lvp] = (mv[v.lvp] || 0) - 1;
    const bossDP = won ? B_WIN : -B_LOSS(s.lost), finalPat = pat > 0 ? clamp(pat + bossDP) : 0;
    const leagueWin = pos === 1 ? [{ s: S.s, k: 'L', nm: Club.named('L', s.lg, S.s) }] : [];
    const row = table.find(r => r[0] === s.q), trophies = [...s.trophies, ...wonCups, ...leagueWin];
    const summary = { s: S.s, lg: s.lg, pos, n: table.length, pts: row[7], w: row[2], d: row[3], l: row[4], gf: row[5], ga: row[6],
      obj: { ...S.obj }, won, dp: bossDP, ...v, trophies: trophies.filter(t => t.s === S.s).map(t => t.k),
      real: Club.history(G, s.lg, S.s, s.q), competitions: Object.fromEntries(Object.values(S.K).map(K => [K.k, { nm: K.nm, w: K.ch, r: K.ru }])),
      pat: finalPat, S: clone(S) };
    nx = { ...nx, pat: finalPat, mv, lost: s.lost + Number(!won), trophies, history: [...s.history, summary],
      node: { window: 'summer', left: nx.node.left + leagueWin.length, free: nx.node.free + leagueWin.length },
      owner: finalPat <= 0 ? 'The club needs another direction. Your time in charge ends here.'
        : won ? 'You delivered what the board asked. Build on it in the summer.' : 'The objective was clear and we missed it. The next season must justify our patience.',
      log: [...nx.log, { t: 'boss', D: s.D, act: s.y, s: S.s, won, n: 1, pos, target: S.obj.t, dp: bossDP, ...v }] };
  }
  if (nx.pat <= 0) return { ...nx, pat: 0, ph: 'fired', node: { ...nx.node, left: 0, free: 0 }, owner: 'The club needs another direction. Your time in charge ends here.' };
  return { ...nx, ph: 'node' };
}

export function careerSource(G, s) {
  const by = Club.sides(G, s.S, mine(G, s), ban(s), s.m.nm);
  return [...by.values()].map(c => ({ id: c.id, nm: c.nm, si: !!c.si, n: c.n || 0,
    basis: c.basis || null,
    src: c.id === s.q ? 'draft' : c.src || (c.si ? 'standin' : c.n >= 15 ? 'season' : 'nearby'),
    source: c.id === s.q ? 'Your drafted squad' : c.si ? (c.basis === 'default'
      ? 'Stand-in squad; no league record, default rating 74' : 'Stand-in squad fitted to normalized points per game')
      : c.src === 'season' ? 'Season squad' : `Nearby-season squad: ${c.n || 0} archived players active this year`,
    roster: [...c.T.xi, ...c.T.bn].filter(Boolean).map(p => ({ id: p.id, nm: p.nm, r: p.r, pos: p.pos.slice(),
      src: c.id === s.q ? p.src || 'draft' : c.si ? 'standin' : p.sg > 0 ? 'nearby' : 'season', gap: p.sg || 0 })) }));
}

function market(G, s, r, floor, n, filter = () => true, skip = new Set()) {
  const used = new Set([...s.slots.map(c => c.p), ...skip]), qs = new Set(), out = [], B = careerBill(G, s);
  const ok = (k, x) => !used.has(x.p) && TIERS.indexOf(TI(x.r)) >= TIERS.indexOf(floor) && filter(k, x) &&
    (!s.cap || s.slots.some((_, i) => fits(G, B, i, { k, p: x.p }, GCAP)));
  for (let i = 0; i < n; i++) {
    const c = draw(G, r, c => c.D === s.D && !qs.has(c.q) && G.cards[key(c)].some(x => ok(key(c), x)), s.D);
    if (!c) break;
    const k = key(c), Q = G.cards[k].filter(x => ok(k, x)), x = Q[Math.floor(r() * Q.length)];
    qs.add(c.q); used.add(x.p); out.push({ k, p: x.p, r: x.r, l: line(x) });
  }
  return out;
}
export function careerPrice(G, s, ref, slot) {
  return s.ph === 'node' && s.node.free > 0 ? 0 : price(G, adapter(s), ref, slot);
}
function developments(G, s) {
  const u = charge(s), Q = [...careerTeam(G, s).xi, ...careerTeam(G, s).bn], out = [];
  for (const [id, d] of Object.entries(CAREER_DEV)) {
    if (d.team) { if ((s.badge[id] || 0) < d.mx) out.push({ kind: 'dev', id, team: true, cost: d.c + u }); continue; }
    const who = Q.map((_, i) => i).filter(i => (!d.ln || d.ln.includes(line(Q[i]))) &&
      (d.boost ? s.skills[Q[i].id]?.[id] || 0 : lv(d.k, Q[i].tg?.[d.k])) < d.mx);
    if (who.length) out.push({ kind: 'dev', id, team: false, who, cost: d.c + u });
  }
  const list = s.slots.map((ref, i) => {
    const c = hydrate(G, ref), v = versions(G, ref.p)[0];
    return v && v.k !== ref.k && v.r > c.r + 0.5 ? { i, from: { ...ref, r: c.r }, to: v, cost: upC(TI(c.r), TI(v.r)) + u } : null;
  }).filter(Boolean);
  if (list.length) out.push({ kind: 'dev', id: 'upg', team: false, list, cost: Math.min(...list.map(x => x.cost)) });
  return out;
}

export function careerOffers(G, s) {
  if (s.ph !== 'node') return [];
  const tag = `${seedKey(s)}:node:${s.y}:${s.half}:${s.node.left}`, out = [];
  const list = market(G, s, mk(hs(`${tag}:fa:${s.fa}`)), s.prem ? 'A' : 'C', 3);
  if (list.length) out.push({ kind: 'market', list, re: !s.fa });
  const L = developments(G, s), r = mk(hs(`${tag}:dev`));
  for (let n = s.pat >= PAT_MAX ? 2 : 1; n > 0 && L.length; n--) {
    const fresh = L.filter(o => !s.last.includes(o.id)), Q = fresh.length ? fresh : L, o = Q[Math.floor(r() * Q.length)];
    out.push(o); L.splice(L.indexOf(o), 1);
  }
  if (s.pat < PAT_MAX && !s.node.free) out.push({ kind: 'rest', gain: REST[Math.min(2, s.rest)] });
  if (s.pat < DESP) {
    const r = mk(hs(`${tag}:desp`)), a = market(G, s, r, 'S', 1);
    const b = market(G, s, r, 'A', a.length ? 1 : 2, () => true, new Set(a.map(x => x.p)));
    if (a.length + b.length) out.push({ kind: 'desp', list: [...a, ...b].map(x => ({ ...x, cost: s.pat >= 3 ? 1 : 0 })) });
  }
  return s.node.free ? out.map(o => ({ ...o, free: true, ...(o.cost !== undefined ? { cost: 0 } : {}),
    ...(o.list ? { list: o.list.map(x => ({ ...x, ...(x.cost !== undefined ? { cost: 0 } : {}) })) } : {}) })) : out;
}
export function careerRespin(G, s, premium = false) {
  if (s.ph !== 'node') throw new Error('The market opens in a reward window.');
  if (s.node.free > 0) {
    if (s.fa) throw new Error('Free agency can be re-spun once per reward.');
    const cost = (premium ? 5 : 1) + Math.floor(s.y / 2);
    if (s.pat < cost + 1) throw new Error(`Needs ${cost + 1} patience for this re-spin; the trophy signing is free.`);
    return { ...s, pat: s.pat - cost, fa: 1, prem: premium ? 1 : 0,
      log: [...s.log, { t: 'respin', prem: !!premium, cost }], owner: 'The scouts have fresh names. Choose a deal we can afford.' };
  }
  const a = respin(G, null, adapter(s), premium);
  return { ...s, pat: a.pat, fa: a.fa, prem: a.prem, log: a.log, owner: 'The scouts have fresh names. Choose a deal we can afford.' };
}
const spend = (s, n) => { if (n && s.pat - n < 1) throw new Error(`Needs ${n + 1} patience; the board keeps at least 1.`); return s.pat - n; };
const drop = (s, p) => Object.fromEntries(['tags', 'up', 'mv', 'neg', 'skills', 'trouble'].map(k => {
  const v = { ...s[k] }; delete v[p]; return [k, v];
}));
function afterReward(s, O) {
  const node = { ...s.node, left: s.node.left - 1, free: Math.max(0, s.node.free - 1) };
  const ph = node.left > 0 ? 'node' : s.half === 1 ? 'repo' : lastYear(s) ? 'done' : 'hop';
  return { ...s, node, ph, fa: 0, prem: 0, rest: 0, last: O.filter(o => o.kind === 'dev').map(o => o.id) };
}
export function careerTake(G, s, j, options = {}) {
  const O = careerOffers(G, s), o = O[j];
  if (!o) throw new Error('Choose one of the reward cards.');
  const nx = afterReward(s, O), free = s.node.free > 0;
  if (o.kind === 'rest') return { ...nx, pat: clamp(s.pat + o.gain), rest: s.rest + 1,
    log: [...s.log, { t: 'rest', gain: o.gain }], owner: 'A little breathing room. Make it count when the football resumes.' };
  if (o.kind === 'market' || o.kind === 'desp') {
    const f = o.list[options.pick ?? 0], i = options.slot;
    if (!f || !Number.isInteger(i) || i < 0 || i >= 15) throw new Error('Choose a signing and the squad place he takes.');
    const ref = { k: f.k, p: f.p }, cost = free ? 0 : o.kind === 'desp' ? f.cost : careerPrice(G, s, f, i);
    const B = careerBill(G, s); B[i] = ref; if (s.cap) ck(G, B, GCAP);
    const slots = s.slots.slice(), out = slots[i]; slots[i] = ref;
    const d = drop(s, out.p), term = o.kind === 'market' && ['S', 'C'].includes(TI(f.r)) ? TI(f.r) : null;
    return { ...nx, ...d, pat: spend(s, cost), slots, neg: term ? { ...d.neg, [f.p]: term } : d.neg,
      trouble: o.kind === 'desp' ? { ...d.trouble, [f.p]: 1 } : d.trouble,
      log: [...s.log, { t: 'sign', p: f.p, k: f.k, out: out.p, cost, ...(o.kind === 'desp' ? { desp: 1 } : {}), free }],
      owner: o.kind === 'desp' ? 'A bargain, with a dressing-room cost. Help him settle before it hurts the side.' : 'One player in, one player out. I expect this to make us stronger.' };
  }
  if (o.id === 'upg') {
    const u = o.list[options.pick ?? 0];
    if (!u) throw new Error('Choose the player to upgrade.');
    const slots = s.slots.slice(); slots[u.i] = { k: u.to.k, p: u.to.p };
    return { ...nx, pat: spend(s, u.cost), slots, up: { ...s.up, [u.to.p]: s.up[u.to.p] || u.from.k },
      log: [...s.log, { t: 'boost', p: u.to.p, from: u.from.k, to: u.to.k, cost: u.cost, free }],
      owner: 'There is the best version of a player we already trust. Put him where he can help us.' };
  }
  const dev = CAREER_DEV[o.id], pat = spend(s, o.cost);
  if (dev.team) return { ...nx, pat, badge: { ...s.badge, [o.id]: (s.badge[o.id] || 0) + 1 },
    log: [...s.log, { t: 'dev', id: o.id, cost: o.cost, free }], owner: 'The whole club should feel the benefit of that work.' };
  const i = options.player ?? o.who[0];
  if (!o.who.includes(i)) throw new Error('Choose a player this development suits.');
  const p = s.slots[i].p;
  if (dev.boost) {
    const level = (s.skills[p]?.[o.id] || 0) + 1, trouble = { ...s.trouble };
    if (o.id === 'buyin') delete trouble[p];
    return { ...nx, pat, trouble, skills: { ...s.skills, [p]: { ...s.skills[p], [o.id]: level } },
      log: [...s.log, { t: 'dev', id: o.id, p, lv: level, cost: o.cost, free }], owner: 'Better habits make a better player. Let us see that work on the pitch.' };
  }
  const Q = [...careerTeam(G, s).xi, ...careerTeam(G, s).bn], level = lv(dev.k, Q[i].tg?.[dev.k]) + 1;
  return { ...nx, pat, tags: { ...s.tags, [p]: { ...s.tags[p], [dev.k]: val(dev.k, level) } },
    log: [...s.log, { t: 'dev', id: o.id, p, lv: level, cost: o.cost, free }], owner: 'A specialist gives the manager another way to win. Use him well.' };
}

// Summer offers: three cards from next season's actual rivals and three from the decade. One from
// each pool replaces one squad player for free. Empty archive pools are explicitly optional.
export function careerHopPools(G, s) {
  if (s.ph !== 'hop') return null;
  const next = s.years[s.y + 1], rivals = new Set((Club.rows(G, s.lg, next) || []).map(r => r[0]).filter(q => q !== s.q));
  const old = market(G, s, mk(hs(`${seedKey(s)}:summer:${s.y}:rivals`)), 'C', 3,
    (k, c) => rivals.has(k.split(':')[0]) && c.a <= next && next <= c.b);
  const neu = market(G, s, mk(hs(`${seedKey(s)}:summer:${s.y}:decade`)), 'C', 3, () => true, new Set(old.map(c => c.p)));
  return { from: s.years[s.y], to: next, old, neu };
}
export function careerHop(G, s, selection = {}) {
  const H = careerHopPools(G, s);
  if (!H) throw new Error('The summer transfer window opens after the rewards.');
  const a = selection.old || [], b = selection.neu || [], out = selection.out || [];
  const pick = (ids, pool) => ids.length === Math.min(1, pool.length) && ids.every(i => Number.isInteger(i) && i >= 0 && i < pool.length);
  if (!pick(a, H.old) || !pick(b, H.neu)) throw new Error('Sign one player from each available summer pool.');
  if (out.length !== a.length + b.length || new Set(out).size !== out.length || out.some(i => !Number.isInteger(i) || i < 0 || i >= 15)) throw new Error('Choose a different squad place for each signing.');
  const ins = [...a.map(i => H.old[i]), ...b.map(i => H.neu[i])], slots = s.slots.slice();
  let nx = s;
  out.forEach(i => { nx = { ...nx, ...drop(nx, s.slots[i].p) }; });
  ins.forEach((c, j) => { slots[out[j]] = { k: c.k, p: c.p }; });
  if (s.cap) ck(G, careerBill(G, { ...nx, slots }), GCAP);
  return { ...nx, slots, ph: 'repo', owner: 'The summer business is done. Pick the side that will carry us into next season.',
    log: [...s.log, { t: 'hop', act: s.y, in: ins.map(c => [c.k, c.p]), out: out.map(i => s.slots[i].p) }] };
}
export function careerSwap(s, a, b) {
  if (s.ph !== 'repo') throw new Error('Rearrange the lineup after the transfer window.');
  if (![a, b].every(i => Number.isInteger(i) && i >= 0 && i < 15)) throw new Error('Choose two squad places.');
  const slots = s.slots.slice(); [slots[a], slots[b]] = [slots[b], slots[a]]; return { ...s, slots };
}
export function careerForm(G, s, f) {
  if (s.ph !== 'repo') throw new Error('Change formation after the transfer window.');
  const T = careerTeam(G, s), o = move(T.xi, T.S, shape(G, f), s.D), slots = [...Array(11).fill(null), ...s.slots.slice(11)];
  o.forEach((j, i) => { slots[j] = s.slots[i]; });
  return { ...s, f, slots, log: [...s.log, { t: 'form', act: s.y, f }] };
}
export function careerNext(G, s) {
  if (s.ph !== 'repo') throw new Error('Finish the transfer window and lineup first.');
  if (s.half === 1) return { ...s, ph: 'half', owner: 'The winter business is done. Deliver the objective in the run-in.' };
  if (lastYear(s)) throw new Error('The decade is complete.');
  const nx = { ...s, y: s.y + 1, half: 0, ph: 'half', rest: 0, fa: 0, prem: 0, node: { window: 'winter', left: 0, free: 0 },
    owner: 'A new season, a new objective. Earn the club another year of progress.', log: [...s.log, { t: 'act', act: s.y + 1 }] };
  return { ...nx, S: season(G, nx) };
}
export const careerScore = s => ({ ...score(s), seasons: s.history.length, trophies: s.trophies.length });
export function careerAction(G, s, action) {
  if (!action || typeof action.type !== 'string') throw new Error('Choose a career action.');
  const { type, ...o } = action;
  if (type === 'play') return careerPlayHalf(G, s);
  if (type === 'take') return careerTake(G, s, o.index, o);
  if (type === 'respin') return careerRespin(G, s, !!o.premium);
  if (type === 'hop') return careerHop(G, s, o);
  if (type === 'swap') return careerSwap(s, o.a, o.b);
  if (type === 'form') return careerForm(G, s, o.f);
  if (type === 'next') return careerNext(G, s);
  throw new Error('Unknown career action.');
}

// Saves are user-editable. Validate every field used by simulation, economy or views before resuming.
// Career v1 is separate from the draft and Gauntlet versions; those old saves retain their validators.
export function validCareer(G, s, manager, cap) {
  const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const int = (x, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(x) && x >= min && x <= max;
  const num = (x, min = 0, max = Number.MAX_VALUE) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
  const person = p => typeof p === 'string' && Object.hasOwn(G.people, p);
  const ref = c => obj(c) && person(c.p) && typeof c.k === 'string' && G.cards[c.k]?.some(x => x.p === c.p);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const club = id => typeof id === 'string' && (Object.hasOwn(G.clubs, id) || Object.hasOwn(G.xn || {}, id) || id.startsWith('nm:'));
  const strings = x => Array.isArray(x) && x.every(v => typeof v === 'string');
  const unique = x => new Set(x).size === x.length;
  const dictPeople = (x, value) => obj(x) && Object.entries(x).every(([p, v]) => person(p) && value(v));
  const tags = x => obj(x) && Object.entries(x).every(([k, v]) => (['tal', 'rock', 'mae', 'poa', 'tl', 'vs', 'ss'].includes(k) && int(v, 1, 2)) || (k === 'bg' && int(v, 1, 3)));
  const skills = x => obj(x) && Object.entries(x).every(([k, v]) => CAREER_DEV[k]?.boost && int(v, 1, CAREER_DEV[k].mx));
  const pair = p => Array.isArray(p) && p.length === 2 && p.every(x => int(x));
  const row = r => Array.isArray(r) && r.length === 8 && club(r[0]) && r.slice(1).every(x => int(x)) && r[1] === r[2] + r[3] + r[4];
  const objective = o => obj(o) && int(o.r, 1, 22) && int(o.t, 1, 22) && typeof o.band === 'string';
  const stats = (x, global = false) => Array.isArray(x) && x.every(r => Array.isArray(r) && r.length === (global ? 7 : 6) &&
    (!global || club(r[0])) && typeof r[global ? 1 : 0] === 'string' && r.slice(global ? 2 : 1, global ? 6 : 5).every(v => int(v)) && int(r[global ? 6 : 5], 0, 1));
  const competitions = K => obj(K) && Object.entries(K).every(([k, c]) => ['C', 'LC', 'SC', 'EC', 'CW', 'UC', 'US'].includes(k) && obj(c) && c.k === k &&
    typeof c.nm === 'string' && ['ko1', 'ko2', 'g'].includes(c.f) && int(c.fl, 1, 2) && (c.sl === undefined || int(c.sl, 1, 2)) &&
    (c.n === undefined || int(c.n, 2, 32)) && (c.f !== 'g' || (int(c.n, 4, 32) && c.n % 4 === 0 && c.ent.length === c.n)) &&
    strings(c.ent) && c.ent.length >= 2 && c.ent.every(club) && unique(c.ent) && strings(c.al) && unique(c.al) && c.al.every(id => c.ent.includes(id)) &&
    (c.by === null || (strings(c.by) && c.by.every(id => c.ent.includes(id)))) && (c.ch === null || c.ent.includes(c.ch)) && (c.ru === null || c.ent.includes(c.ru)) &&
    Array.isArray(c.R) && c.R.every(R => Array.isArray(R) && R.every(t => obj(t) && c.ent.includes(t.A) && c.ent.includes(t.B) && t.A !== t.B &&
      [t.A, t.B].includes(t.w) && pair(t.agg) && Array.isArray(t.g) && t.g.length >= 1 && t.g.length <= 2 && t.g.every(pair) &&
      typeof t.et === 'boolean' && (t.pw === null || (obj(t.pw) && int(t.pw.w, 0, 1) && int(t.pw.x) && int(t.pw.y))) && typeof t.rd === 'string')) &&
    (c.gr === undefined || (Array.isArray(c.gr) && c.gr.every(g => strings(g) && g.length === 4 && g.every(id => c.ent.includes(id))))) &&
    (c.gt === undefined || (Array.isArray(c.gt) && c.gt.every(g => Array.isArray(g) && g.length === 4 && g.every(row)))) &&
    (c.gm === undefined || int(c.gm, 0, 6)));
  const realField = year => {
    const ids = (Club.rows(G, s.lg, year) || []).map(r => r[0]);
    if (!ids.includes(s.q) && ids.length) ids[ids.length - 1] = s.q;
    return ids;
  };
  const seasonOK = S => obj(S) && int(S.s, s.D, s.D + 9) && S.lg === s.lg && S.q === s.q && S.D === s.D && S.w === Club.pts3(G, s.lg, S.s) &&
    strings(S.ord) && unique(S.ord) && S.ord.includes(s.q) && S.ord.length === Club.rows(G, s.lg, S.s)?.length && S.ord.every(club) &&
    realField(S.s).every(id => S.ord.includes(id)) &&
    strings(S.seed) && S.seed.length === S.ord.length && unique(S.seed) && S.seed.every(id => S.ord.includes(id)) && objective(S.obj) &&
    obj(S.L) && int(S.L.md, 0, 2 * (S.ord.length % 2 ? S.ord.length : S.ord.length - 1)) && Array.isArray(S.L.rows) && S.L.rows.length === S.ord.length &&
    unique(S.L.rows.map(r => r?.[0])) && S.L.rows.every(r => row(r) && S.ord.includes(r[0]) && r[7] === S.w * r[2] + r[3]) &&
    competitions(S.K) && obj(S.cc) && Object.entries(S.cc).every(([id, cc]) => club(id) && typeof cc === 'string') &&
    stats(S.st, true) && stats(S.sy) && int(S.h, 0, 2) && Array.isArray(S.me) && S.me.every(f => obj(f) &&
      (f.k === 'L' || Object.hasOwn(S.K, f.k)) && typeof f.rd === 'string' && ['H', 'A', 'N'].includes(f.h) && club(f.op) &&
      int(f.gf) && int(f.ga) && typeof f.et === 'boolean' && (f.pw === null || pair(f.pw)) && num(f.wk) &&
      Array.isArray(f.sc) && f.sc.every(e => Array.isArray(e) && e.length === 4 && int(e[0], 0, 150) && int(e[1], 0, 1) &&
        (e[2] === null || typeof e[2] === 'string') && (e[3] === null || typeof e[3] === 'string')));
  const reconciles = S => {
    const n = S.ord.length, days = n % 2 ? n : n - 1, mine = S.L.rows.find(r => r[0] === s.q), league = S.me.filter(f => f.k === 'L');
    const sum = (Q, f) => Q.reduce((x, r) => x + f(r), 0);
    return S.L.md === S.h * days && S.L.rows.every(r => r[1] === S.h * (n - 1)) &&
      sum(S.L.rows, r => r[2]) === sum(S.L.rows, r => r[4]) && sum(S.L.rows, r => r[5]) === sum(S.L.rows, r => r[6]) &&
      league.length === mine[1] && sum(league, f => f.gf) === mine[5] && sum(league, f => f.ga) === mine[6] &&
      league.filter(f => f.gf > f.ga).length === mine[2] && league.filter(f => f.gf === f.ga).length === mine[3] &&
      sum(S.sy, r => r[1]) === sum(S.me, f => f.gf) && sum(S.st, r => r[2]) === sum(S.L.rows, r => r[5]);
  };
  const totals = S => { const r = S.L.rows.find(r => r[0] === s.q); return [r[7], r[2], r[3], r[4], r[5], r[6]]; };
  const logOK = e => {
    if (!obj(e)) return false;
    if (e.t === 'seg') return e.D === s.D && int(e.act, 0, s.years.length - 1) && e.s === s.years[e.act] && int(e.half, 1, 2) &&
      [e.w, e.d, e.l, e.pts, e.maximum, e.gf, e.ga].every(x => int(x)) && num(e.expected, 0, e.maximum) && int(e.dp, -5, 3);
    if (e.t === 'boss') return e.D === s.D && int(e.act, 0, s.years.length - 1) && e.s === s.years[e.act] && typeof e.won === 'boolean' &&
      e.n === 1 && int(e.pos, 1, 22) && int(e.target, 1, 22) && [4, -4, -6].includes(e.dp) &&
      (e.mvp === null || person(e.mvp)) && (e.lvp === null || person(e.lvp)) && !(e.mvp && e.lvp);
    if (e.t === 'rest') return int(e.gain, 0, 2);
    if (e.t === 'respin') return typeof e.prem === 'boolean' && int(e.cost, 1, 12);
    if (e.t === 'boost') return ref({ k: e.from, p: e.p }) && ref({ k: e.to, p: e.p }) && int(e.cost, 0, 12) && typeof e.free === 'boolean';
    if (e.t === 'sign') return ref({ k: e.k, p: e.p }) && person(e.out) && int(e.cost, 0, 12) && typeof e.free === 'boolean' && (e.desp === undefined || e.desp === 1);
    if (e.t === 'dev') return Object.hasOwn(CAREER_DEV, e.id) && int(e.cost, 0, 12) && typeof e.free === 'boolean' &&
      (CAREER_DEV[e.id].team ? e.p === undefined : person(e.p) && int(e.lv, 1, CAREER_DEV[e.id].mx));
    if (e.t === 'hop') return int(e.act, 0, s.years.length - 2) && Array.isArray(e.in) && e.in.length <= 2 &&
      e.in.every(c => Array.isArray(c) && c.length === 2 && ref({ k: c[0], p: c[1] })) && Array.isArray(e.out) && e.out.length === e.in.length && e.out.every(person);
    if (e.t === 'form') return int(e.act, 0, s.years.length - 1) && typeof e.f === 'string' && Object.hasOwn(G.formations, e.f);
    if (e.t === 'act') return int(e.act, 1, s.years.length - 1);
    return false;
  };
  const ok = obj(s) && s.v === CAREER_VERSION && s.kind === 'career' && int(s.seed, 0, 4294967295) && typeof s.cap === 'boolean' &&
    DECADES.includes(s.D) && obj(s.m) && obj(manager) && s.m.nm === manager.nm && s.m.q === manager.q && s.m.a === manager.a &&
    G.managers.some(m => m.nm === s.m.nm) && s.q === s.m.q && Object.hasOwn(G.clubs, s.q) && s.lg === Club.leagueOf(G, s.q, s.D) &&
    eq(s.years, Club.years(G, s.lg, s.D)) && s.years.length > 0 && int(s.y, 0, s.years.length - 1) && PH.includes(s.ph) && int(s.half, 0, 2) &&
    typeof s.f === 'string' && Object.hasOwn(G.formations, s.f) && Array.isArray(s.slots) && s.slots.length === 15 && s.slots.every(ref) && unique(s.slots.map(c => c.p)) &&
    int(s.pat, 0, PAT_MAX) && int(s.rest) && int(s.lost) && dictPeople(s.tags, tags) && dictPeople(s.skills, skills) && dictPeople(s.trouble, v => v === 1) &&
    dictPeople(s.up, k => typeof k === 'string') && Object.entries(s.up).every(([p, k]) => ref({ k, p })) && dictPeople(s.mv, n => int(n, -Number.MAX_SAFE_INTEGER)) &&
    dictPeople(s.neg, x => ['S', 'C'].includes(x)) && obj(s.badge) && int(s.badge.glue, 0, 1) && int(s.badge.mgr, 0, 2) && int(s.badge.team, 0, 1) &&
    Object.keys(s.badge).every(k => ['glue', 'mgr', 'team'].includes(k)) && strings(s.last) && s.last.every(k => k === 'upg' || Object.hasOwn(CAREER_DEV, k)) &&
    int(s.fa, 0, 1) && int(s.prem, 0, s.fa) && typeof s.owner === 'string' && obj(s.node) && ['winter', 'summer'].includes(s.node.window) &&
    int(s.node.left, 0, 9) && int(s.node.free, 0, s.node.left) && seasonOK(s.S) && reconciles(s.S) && s.S.s === s.years[s.y] && s.S.h === s.half &&
    Array.isArray(s.log) && s.log.every(logOK) && Array.isArray(s.trophies) && s.trophies.every(t => obj(t) && s.years.includes(t.s) &&
      ['L', 'C', 'LC', 'SC', 'EC', 'CW', 'UC', 'US'].includes(t.k) && typeof t.nm === 'string') && unique(s.trophies.map(t => `${t.s}:${t.k}`)) &&
    Array.isArray(s.history) && s.history.length === s.y + Number(s.half === 2) && s.history.every((h, i) => obj(h) && h.s === s.years[i] &&
      h.lg === s.lg && int(h.pos, 1, h.n) && int(h.n, 2, 22) && [h.pts, h.w, h.d, h.l, h.gf, h.ga].every(v => int(v)) && objective(h.obj) &&
      typeof h.won === 'boolean' && [4, -4, -6].includes(h.dp) && (h.mvp === null || person(h.mvp)) && (h.lvp === null || person(h.lvp)) &&
      strings(h.trophies) && int(h.pat, 0, PAT_MAX) && obj(h.real) && (h.real.pos === null || int(h.real.pos, 1, 22)) &&
      (h.real.pts === null || int(h.real.pts)) && int(h.real.n, 2, 22) && (h.real.champ === null || club(h.real.champ)) &&
      (h.real.ecw === null || club(h.real.ecw)) && (h.real.ec === null || num(h.real.ec, 0, 6)) && obj(h.competitions) &&
      Object.values(h.competitions).every(c => obj(c) && typeof c.nm === 'string' && (c.w === null || club(c.w)) && (c.r === null || club(c.r))) &&
      seasonOK(h.S) && reconciles(h.S) && h.S.s === h.s && h.S.h === 2 &&
      eq([h.pts, h.w, h.d, h.l, h.gf, h.ga], totals(h.S)) && h.n === h.S.ord.length && h.won === (h.pos <= h.obj.t) && eq(h.obj, h.S.obj) &&
      h.pos === h.S.L.rows.findIndex(r => r[0] === s.q) + 1 && eq(h.real, Club.history(G, s.lg, h.s, s.q))) &&
    (s.ph === 'fired' ? s.pat === 0 : s.pat > 0) && (s.ph !== 'half' || s.half < 2) &&
    (s.ph !== 'node' || (s.half > 0 && s.node.left > 0)) && (!['hop', 'done'].includes(s.ph) || (s.half === 2 && s.node.left === 0)) &&
    (s.ph !== 'repo' || (s.half > 0 && s.node.left === 0 && (s.half === 1 || !lastYear(s)))) &&
    (s.ph !== 'hop' || !lastYear(s)) && (s.ph !== 'done' || lastYear(s)) &&
    (s.ph === 'node' || (s.node.left === 0 && s.node.free === 0 && s.fa === 0 && s.prem === 0));
  if (!ok) throw new Error('The saved club career is invalid.');
  if (s.cap !== cap) throw new Error('The saved career cap does not match the draft.');
  const snapshots = [...s.history.map(h => h.S), ...(s.half === 2 ? [] : [s.S])];
  const segments = s.log.filter(e => e.t === 'seg'), bosses = s.log.filter(e => e.t === 'boss');
  for (const S of snapshots) {
    const Q = segments.filter(e => e.s === S.s), sum = k => Q.reduce((n, e) => n + e[k], 0);
    if (Q.length !== S.h || !Q.every((e, i) => e.half === i + 1 && e.w + e.d + e.l === S.ord.length - 1 &&
      e.maximum === S.w * (S.ord.length - 1) && e.pts === S.w * e.w + e.d && e.dp === careerDelta(e.pts, e.expected, e.maximum)) ||
      !eq([sum('pts'), sum('w'), sum('d'), sum('l'), sum('gf'), sum('ga')], totals(S))) throw new Error('The saved career half results do not reconcile.');
  }
  if (segments.length !== snapshots.reduce((n, S) => n + S.h, 0) || bosses.length !== s.history.length ||
    s.lost !== bosses.filter(e => !e.won).length) throw new Error('The saved career history does not reconcile.');
  let losses = 0;
  for (let i = 0; i < bosses.length; i++) {
    const b = bosses[i], h = s.history[i], dp = b.won ? B_WIN : -B_LOSS(losses);
    if (b.act !== i || b.s !== h.s || b.pos !== h.pos || b.target !== h.obj.t || b.won !== h.won || b.dp !== dp ||
      b.dp !== h.dp || b.mvp !== h.mvp || b.lvp !== h.lvp) throw new Error('The saved career board result is invalid.');
    if (!b.won) losses++;
  }
  if (s.half === 2 && !eq(s.S, s.history.at(-1).S)) throw new Error('The saved career season does not match its history.');
  for (const k of ['tags', 'skills', 'trouble', 'up', 'mv', 'neg']) if (Object.keys(s[k]).some(p => !s.slots.some(c => c.p === p))) throw new Error('The saved career has records for a departed player.');
  const U = {};
  for (const e of s.log) {
    if (e.t === 'boost') U[e.p] ||= e.from;
    if (e.t === 'sign') { delete U[e.out]; delete U[e.p]; }
    if (e.t === 'hop') e.out.forEach(p => { delete U[p]; });
  }
  if (Object.keys(U).length !== Object.keys(s.up).length || Object.entries(U).some(([p, k]) => s.up[p] !== k)) throw new Error('The saved career upgrade charge is invalid.');
  if (cap) ck(G, careerBill(G, s), GCAP);
  return s;
}
