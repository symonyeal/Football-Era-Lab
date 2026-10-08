// Shared interface state and parts.
//
// Legend
//   U        view state shared by every view: G archive, S draft, F decade fields, R season, C circuit,
//            H head to head, D start decade, cap rules choice, sel selected roster person, sw swap source
//            slot, tgt sheet target slot, q/sort/ln/fit roster search, sort, line filter and fit filter,
//            tab results tab, view phone view (squad | lineup), pv previewed formation, undo/redo lineup
//            snapshots {f, slots}, moved persons moved by the last formation change, insp inspected team,
//            f0 starting formation chosen while inspecting, cmp pinned comparison, ev circuit events,
//            busy work in progress, focus data-key (or #id) to focus after the next render
//   kit(q)   club q's colours [primary, secondary]; N when the archive has none
//   sn(n)    pitch label: the full name when it fits, otherwise first initial and surname with its particles
//            (R. Carlos, M. van Basten)
//   pitch(S, cells, o)  floodlit pitch: S slots, cells[i] {kind: f filled | p preview | e open, ...};
//            o.mode play (buttons data-slot) | sheet (buttons data-target) | view (static)
//   links(S, xi)  starter pairs from one club and decade within d_cl: the teammate links rate() counts
//   row(c, o)     roster row; smap(c, Ds) the card's rating in each of the 15 slots

import { TI, CAP } from '../cap.js';
import { SL, ft, em, W, d_cl } from '../engine/index.js';

export const U = {
  G: null, S: null, F: null, R: null, C: null, H: null, D: 1980, cap: true, seed: '',
  sel: null, sw: null, tgt: null, q: '', sort: 'fit', ln: 'All', fit: false, tab: 'league', view: 'squad',
  pv: null, undo: [], redo: [], moved: new Set(), insp: 0, f0: null, cmp: [], ev: 12, busy: false, focus: null,
};

export const N = ['#C9D2E3', '#55627D'];
export const RANGE = { S: '90+', A: '85–89.9', B: '80–84.9', C: '75–79.9', D: 'below 75' };
export const SRC = { f: 'EA FC', c: 'Champ. Manager 01/02', i: 'EA Icon', n: 'EA, nearby season', m: 'CM, nearby season', e: 'Estimated' };
export const SRT = {
  f: 'EA FIFA / FC rating for this player at this club, from an edition inside the stint (FIFA 07 to FC 26).',
  c: 'Championship Manager 01/02 rating for this player at this club, put on the EA scale.',
  i: 'EA Icon / Hero card, adjusted for age in this decade.',
  n: 'EA rating from a season within two years of the stint, adjusted for age.',
  m: 'Championship Manager rating from a season within two years of the stint, adjusted for age.',
  e: 'Estimated by a model fitted on EA and CM ratings; no game database rates this player here.',
};
export const ERA = { 1950: 'Post-war pioneers', 1960: 'The golden age', 1970: 'Total football', 1980: 'European dynasties',
  1990: 'A global game', 2000: 'The new generation', 2010: 'Modern greats', 2020: 'The next chapter' };
export const LINE = { GK: 'GK', LB: 'DEF', CB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID', LW: 'ATT', RW: 'ATT', CF: 'ATT', ST: 'ATT' };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const num = n => (Number.isFinite(n) ? n.toFixed(1) : '—');
export const ord = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
export const seasons = (a, b) => `${a}/${String(a + 1).slice(2)}–${b}/${String(b + 1).slice(2)}`;
// Particles that open a surname: van Basten, del Bosque, De Bruyne, Ben Arfa, Mac Allister.
const PRT = new Set(['ben', 'da', 'dal', 'das', 'de', 'del', 'della', 'den', 'der', 'di', 'do', 'dos', 'du', 'el', 'la', 'las', 'le', 'los', 'mac', 'te', 'ten', 'ter', 'van', 'von']);
export const sn = n => {
  if (n.length <= 12 || !n.includes(' ')) return n;
  const w = n.split(' ');
  let j = w.length - 1;
  while (j > 1 && PRT.has(w[j - 1].toLowerCase())) j--;
  return `${w[0][0]}. ${w.slice(j).join(' ')}`;
};
export const nm = p => U.G.people[p]?.nm || p;
export const club = k => { const [q, d] = k.split(':'); return `${U.G.clubs[q]?.nm || q} ${d}s`; };
export const kit = q => U.G.clubs[q]?.k || N;
export const kv = q => { const [a, b] = kit(q); return `--k1:${a};--k2:${b}`; };
export const rules = s => (s.cap ? 'Salary cap' : 'Classic');
export const pct = f => Math.round(f * 100);
export const spell = s => {
  const m = U.G.managers.find(m => m.nm === s.manager?.nm), t = s.manager?.q ? m?.t.find(([q, a]) => q === s.manager.q && a === s.manager.a) : null;
  return t ? { q: t[0], club: U.G.clubs[t[0]]?.nm || t[0], a: t[1], b: t[2], yrs: seasons(t[1], t[2]) } : null;
};
export const teamLine = s => { const t = spell(s); return `${s.manager.nm}${t ? ` · ${t.club} ${t.yrs}` : ''} · ${s.f}`; };

export const tier = (t, c = '') => `<span class="ti ${t} ${c}" role="img" aria-label="${t} tier" title="${t} tier: base rating ${RANGE[t]}">${t}</span>`;
export const fitText = f => (f <= 0.02 ? 'Natural' : f < 0.075 ? `−${pct(f)}%` : f < 0.25 ? `⚠ −${pct(f)}%` : `✕ −${pct(f)}%`);
export const fitCls = f => (f < 0.075 ? '' : f < 0.25 ? 'warn' : 'bad');
export const delta = (v, p = 1) => (Math.abs(v) < 0.05 ? '<span class="z">±0.0</span>' : v > 0 ? `<span class="up">▲ ${v.toFixed(p)}</span>` : `<span class="dn">▼ ${(-v).toFixed(p)}</span>`);

export const IC = {
  lock: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 7V5a4 4 0 1 1 8 0v2h1v8H3V7h1zm2 0h4V5a2 2 0 1 0-4 0v2z"/></svg>',
  wait: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 1h8v2c0 2-2 3.5-3 5 1 1.5 3 3 3 5v2H4v-2c0-2 2-3.5 3-5-1-1.5-3-3-3-5V1zm2 2v.1c0 1.2 1 2.2 2 3.3 1-1.1 2-2.1 2-3.3V3H6z"/></svg>',
  search: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M11 11l4 4" stroke="currentColor" stroke-width="1.8"/></svg>',
  undo: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 4L2 7l3 3M2 7h7a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  redo: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 4l3 3-3 3M14 7H7a4 4 0 0 0 0 8h2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  check: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

// Pitch markings: the viewBox matches the pitch box (100 × 135), so circles stay round and slot y% is y·1.35.
const MK = `<g fill="none" stroke="rgba(240,250,240,.5)" stroke-width="1.2" vector-effect="non-scaling-stroke">
  <rect x="4" y="4" width="92" height="127" vector-effect="non-scaling-stroke"/><line x1="4" y1="67.5" x2="96" y2="67.5" vector-effect="non-scaling-stroke"/>
  <circle cx="50" cy="67.5" r="12" vector-effect="non-scaling-stroke"/><rect x="21" y="4" width="58" height="22" vector-effect="non-scaling-stroke"/>
  <rect x="36" y="4" width="28" height="8" vector-effect="non-scaling-stroke"/><rect x="21" y="109" width="58" height="22" vector-effect="non-scaling-stroke"/>
  <rect x="36" y="123" width="28" height="8" vector-effect="non-scaling-stroke"/></g>
  <circle cx="50" cy="67.5" r=".8" fill="rgba(240,250,240,.7)"/><circle cx="50" cy="19" r=".7" fill="rgba(240,250,240,.6)"/><circle cx="50" cy="116" r=".7" fill="rgba(240,250,240,.6)"/>`;

export const links = (S, xi) => {
  const L = [];
  for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) {
    const a = xi[i], b = xi[j];
    if (a && b && a.cq && a.cq === b.cq && a.D === b.D && Math.hypot(S[i].x - S[j].x, S[i].y - S[j].y) <= d_cl) L.push([i, j, a.cq]);
  }
  return L;
};

// Drawn height of a slot: the keeper sits at least 96% down with his labels beside him, clear of a central back's labels.
const yd = x => (x.s === 'GK' ? Math.max(x.y, 96) : x.y);

function token(S, i, c, o) {
  const s = S[i].s, pos = `left:${S[i].x}%;top:${yd(S[i])}%`;
  const tag = o.mode === 'view' ? 'div' : 'button', at = o.mode === 'play' ? `data-slot="${i}" data-key="s:${i}"` : o.mode === 'sheet' ? `data-target="${i}" data-key="t:${i}"` : '';
  const tab = o.mode === 'view' ? '' : ` type="button" tabindex="${o.entry === i ? 0 : -1}" aria-label="${esc(c?.label || s)}"${o.lock ? ' disabled' : ''}`;
  if (!c || c.kind === 'e') return `<${tag} class="tk e ${s === 'GK' ? 'gk ' : ''}${c?.on ? 'on' : ''}" style="${pos}" ${at}${tab}><span class="c">${s}</span>${o.sm ? '' : '<span class="n">Open</span>'}</${tag}>`;
  if (c.kind === 'p') return `<${tag} class="tk p ${s === 'GK' ? 'gk ' : ''}${c.best ? 'best' : ''} ${c.on ? 'on' : ''}" style="${pos}" ${at}${tab}><span class="c">${Math.round(c.v)}</span><span class="n">${s}${c.best ? ' · Best' : ''}</span><span class="s ${fitCls(c.f)}">${fitText(c.f)}${c.b && !o.sm ? ` · +${c.b}` : ''}</span></${tag}>`;
  return `<${tag} class="tk f ${s === 'GK' ? 'gk ' : ''}${c.moved ? 'mvd' : ''} ${c.on ? 'on' : ''}" style="${pos};${kv(c.q)}" ${at}${tab}><span class="c">${Math.round(c.a)}</span><span class="n">${esc(sn(c.nm))}</span><span class="s">${s} ${tier(c.t, 'sm')}${c.f > 0.02 ? ` <b class="${fitCls(c.f) || 'mild'}">−${pct(c.f)}%</b>` : ''}</span></${tag}>`;
}

export function pitch(S, cells, o = {}) {
  const line = ([a, b, q]) => `<line x1="${S[a].x}" y1="${yd(S[a]) * 1.35}" x2="${S[b].x}" y2="${yd(S[b]) * 1.35}" stroke="${kit(q)[0]}" stroke-opacity=".8" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  const arrow = ([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1 * 1.35}" x2="${x2}" y2="${y2 * 1.35}" stroke="#fff" stroke-width="2" stroke-dasharray="5 4" vector-effect="non-scaling-stroke" marker-end="url(#ah)"/>`;
  const defs = o.arrows?.length ? '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker></defs>' : '';
  const ghosts = (o.ghosts || []).map(g => `<div class="tk g" style="left:${g.x}%;top:${g.y}%;${kv(g.q)}" aria-hidden="true"><span class="c">${Math.round(g.a)}</span><span class="n">${esc(sn(g.nm))}</span></div>`).join('');
  return `<div class="pt ${o.sm ? 'sm' : ''} ${o.cls || ''}" ${o.id ? `id="${o.id}"` : ''} role="group" aria-label="${esc(o.label || 'Pitch')}"><svg viewBox="0 0 100 135" preserveAspectRatio="none" aria-hidden="true">${defs}${MK}${(o.links || []).map(line).join('')}${(o.arrows || []).map(arrow).join('')}</svg>${ghosts}${S.map((_, i) => token(S, i, cells[i], o)).join('')}</div>`;
}

export const mini = (G, f) => `<span class="md" aria-hidden="true">${G.formations[f].slots.map(([, x, y]) => `<i style="left:${x}%;top:${y}%"></i>`).join('')}</span>`;

const SMAP = { ST: [50, 8], CF: [50, 21], LW: [15, 14], RW: [85, 14], CAM: [50, 34], LM: [15, 34], RM: [85, 34], CM: [50, 47],
  LWB: [15, 54], RWB: [85, 54], CDM: [50, 60], LB: [15, 74], RB: [85, 74], CB: [50, 73], GK: [50, 90] };
export const rated = (c, Ds) => SL.map(s => [s, Math.round(c.r * (1 - ft(c, s).f) * em(c.D, Ds, c.tg?.tl || 0))]);
export function smap(c, Ds, hi = []) {
  const R = rated(c, Ds), top = Math.max(...R.map(r => r[1]));
  return `<div class="smap" role="img" aria-label="${esc(`${c.nm} by slot: ${R.slice().sort((a, b) => b[1] - a[1]).map(([s, v]) => `${s} ${v}`).join(', ')}`)}">${R.map(([s, v]) =>
    `<span class="${hi.includes(s) ? 'hi' : v >= top - 2 ? 'top' : v < top - 15 ? 'lo' : ''}" style="left:${SMAP[s][0]}%;top:${SMAP[s][1]}%">${s}<b>${v}</b></span>`).join('')}</div>`;
}
export const share = s => W[s].map(x => Math.round(100 * x)).join('/');

// Roster row. c hydrated card with st {ok, why, own}, best [slot, value] in an open slot, sig signature flag.
export function row(c, o = {}) {
  const t = TI(c.r), top = rated(c, o.Ds).sort((a, b) => b[1] - a[1])[0], listed = c.pos;
  const note = !listed.includes(top[0]) ? ` · <em>rated best ${top[0]} ${top[1]}</em>` : '';
  const cls = o.own ? 'own' : !o.ok ? 'player-row--blocked' : '';
  const gk = listed.includes('GK') && o.best && o.best[0] !== 'GK';
  const fit = o.own ? `<span class="st">${IC.check} In squad</span>` : !o.ok ? '' : gk ? '<b>Bench</b><small>reserve keeper</small>' : o.best ? `<b>${o.best[0]} ${o.best[1]}</b><small>best here</small>` : '';
  const why = o.own ? 'In your squad' : o.why;
  return `<button type="button" class="player-row pr ${cls} ${o.sel ? 'sel' : ''}" data-player="${esc(c.id)}" data-tier="${t}" data-key="p:${esc(c.id)}" tabindex="${o.entry ? 0 : -1}" aria-pressed="${o.sel ? 'true' : 'false'}"${o.ok && !o.own ? '' : ` aria-disabled="true" title="${esc(why)}"`} style="${kv(c.cq)}">
    <b class="r">${Math.round(c.r)}</b>
    <span class="mn"><span class="nm"><span>${esc(c.nm)}</span>${o.sig ? '<i class="tg o">Signature</i>' : ''}${c.src === 'e' ? '<i class="tg o" title="Estimated rating">Est.</i>' : ''}</span>
      ${o.ok || o.own ? `<span class="mt">${o.sel ? '<i class="tg w">Selected</i> ' : ''}${listed.join(' · ')}${note}</span>` : `<span class="why">${o.why?.includes('affordable') ? IC.wait : IC.lock}<span>${esc(o.why)}</span></span>`}</span>
    <span class="fit">${fit}</span>${tier(t)}</button>`;
}

// Collectible card: metal frame by tier, kit band, rating, best three slots, name, club and decade, source.
export function vcard(c, o = {}) {
  const t = TI(c.r), top = rated(c, o.Ds || c.D).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, v]) => `${s} ${v}`).join(' · ');
  return `<div class="vc ${o.cls || ''}" style="--tier:var(--t${t});${kv(c.cq)}"><div class="vi"><span class="rt">${Math.round(c.r)}</span><span class="ps">${top}</span>${tier(t)}<span class="vn">${esc(c.nm)}</span><span class="cl">${esc(U.G.clubs[c.cq]?.nm || c.cq)} · ${c.D}s</span><span class="src">${SRC[c.src] || SRC.e}</span></div>${o.ov ? `<div class="ov ${o.ovc || ''}">${o.ov}</div>` : ''}</div>`;
}

export function capTiles(n, lim = CAP) {
  return `<div class="cap">${Object.keys(CAP).map(t => {
    const r = t in lim ? lim[t] - n[t] : null;
    return `<div class="ct ${r === 0 ? 'full' : ''}" data-cap-tier="${t}" ${r === null ? '' : `data-left="${r}"`} aria-label="${t} tier: ${r === null ? `${n[t]} held, no limit` : `${r} of ${lim[t]} places left`}">${tier(t)}<b>${r === null ? n[t] : r}</b><small>${r === null ? 'held' : r === 0 ? 'full' : `of ${lim[t]} free`}</small></div>`;
  }).join('')}</div>`;
}
export const segs = T => `<div class="seg" aria-hidden="true">${Array.from({ length: 15 }, (_, i) => `<i class="${T[i] || ''}"></i>`).join('')}</div>`;
