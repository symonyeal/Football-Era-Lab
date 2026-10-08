// Club career views. s is the saved career, S its current season, K its competitions; refs carry card
// and person ids. All labels are escaped; selectors use offer indices and squad places, not names.
import * as E from '../engine/index.js';
import * as C from '../career.js';
import * as Rn from '../run.js';
import { TI, fits } from '../cap.js';
import { cname, history, named } from '../club.js';
import { U, esc, num, ord, nm, club, kv, rules } from './kit.js';
import { xi, breakdown, gauntlet, more } from './season.js';

const yr = y => `${y}/${String(y + 1).slice(-2)}`;
const name = id => esc(cname(U.G, id));
const compName = (s, k) => k === 'L' ? named('L', s.lg, s.S.s) || U.G.lg[s.lg].nm : s.S.K[k]?.nm || k;
const placeOptions = (s, only) => {
  const T = C.careerTeam(U.G, s);
  return s.slots.map((r, i) => !only || only.includes(i) ? `<option value="${i}">${i < 11 ? T.S[i].s : `Bench ${i - 10}`} · ${esc(nm(r.p))}</option>` : '').join('');
};
const free = s => s.node?.free > 0;
const price = (s, c) => free(s) ? 0 : c;
const affordable = (s, c) => s.pat - price(s, c) >= 1;

export function careerSigning(s, o, pick = 0, slot = 0) {
  const f = o.list[pick], cost = price(s, o.kind === 'desp' ? f.cost : C.careerPrice(U.G, s, f, slot));
  const cap = !s.cap || fits(U.G, C.careerBill(U.G, s), slot, f, Rn.GCAP);
  return { cost, ok: cap && s.pat - cost >= 1, tx: !cap ? 'This replacement exceeds the S or A cap.' : `Costs ${cost} patience; leaves ${s.pat - cost}.` };
}
function offer(o, j, s) {
  const btn = (label, cost) => `<button class="btn" type="button" data-career-take="${j}" ${affordable(s, cost) ? '' : 'disabled'}>${label}</button>`;
  if (o.kind === 'dev' && o.id === 'upg') return `<article class="reward reward--boost"><p class="lbl">Prime-card boost</p><h3>Upgrade the same player</h3>
    <label class="field"><span class="lbl">Player</span><select id="career-up-${j}" data-career-up="${j}">${o.list.map((u, i) => `<option value="${i}">${esc(nm(u.from.p))} · ${Math.round(u.from.r)} → ${Math.round(u.to.r)} · ${esc(club(u.to.k))} · ${price(s, u.cost)} patience</option>`).join('')}</select></label>
    <p class="small">His original tier charge stays. Player development survives the upgrade.</p>${btn('Upgrade him', o.list[0].cost)}</article>`;
  if (o.kind === 'dev') {
    const d = C.CAREER_DEV[o.id];
    return `<article class="reward"><p class="lbl">Development · ${price(s, o.cost)} patience</p><h3>${esc(d.nm)}</h3><p class="small">${esc(d.tx)}</p>
      ${o.team ? '' : `<label class="field"><span class="lbl">Player</span><select id="career-dev-${j}">${placeOptions(s, o.who)}</select></label>`}${btn('Develop', o.cost)}</article>`;
  }
  if (['market', 'desp'].includes(o.kind)) {
    const x = careerSigning(s, o), u = Math.floor(s.y / 2), min = p => (p ? 5 : 1) + u + (free(s) ? 0 : (p ? 2 : 1) + u) + 1;
    return `<article class="reward"><p class="lbl">${o.kind === 'desp' ? 'Desperation offer' : 'Work the phones'}</p><h3>Sign one, release one</h3>
      <label class="field"><span class="lbl">Sign</span><select id="career-fa-${j}" data-career-fa="${j}">${o.list.map((f, i) => `<option value="${i}">${esc(nm(f.p))} · ${esc(club(f.k))} · ${Math.round(f.r)} · ${TI(f.r)} tier</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Release</span><select id="career-out-${j}" data-career-fa="${j}">${placeOptions(s)}</select></label>
      <p class="small" id="career-price-${j}">${esc(x.tx)}</p><button class="btn" type="button" data-career-take="${j}" ${x.ok ? '' : 'disabled'}>Sign him</button>
      <p class="small dim">${o.kind === 'desp' ? 'This bargain reduces squad link bonuses by 25% until he leaves or receives Player Buy-In.' : 'An S signing loses 3 rating points on the bench; a C signing gains 3 when starting.'}</p>
      ${o.re ? `<div class="row wrap"><button class="btn q sm" type="button" data-career-respin="scout" ${s.pat < min(false) ? 'disabled' : ''}>Scout re-spin · ${1 + u}</button><button class="btn q sm" type="button" data-career-respin="premium" ${s.pat < min(true) ? 'disabled' : ''}>A/S re-spin · ${5 + u}</button></div>` : ''}</article>`;
  }
  return `<article class="reward"><p class="lbl">Rest</p><h3>Recover</h3><p class="small">${o.gain ? `+${o.gain} patience.` : 'Consecutive rests are now worth zero.'}</p><button class="btn q" type="button" data-career-take="${j}" data-career-rest>Rest</button></article>`;
}
function transfer(s) {
  const H = C.careerHopPools(U.G, s);
  return `<h3>Summer transfers</h3><p class="small">Take one available rival and one player from the decade. Release two different players. These signings cost no patience and keep the S and A cap.</p>
    <div class="rewards">${[['old', H.old, 'League rivals'], ['neu', H.neu, 'Across the decade']].map(([k, Q, label]) => `<fieldset class="reward"><legend>${label}</legend>${Q.length ? Q.map((f, i) => `<div class="transfer-pick"><label><input type="radio" name="career-hop-${k}" data-career-hop-pick="${k}" value="${i}"> ${esc(nm(f.p))} · ${Math.round(f.r)} · ${TI(f.r)} tier</label><p class="small">${esc(club(f.k))}</p>
      <label class="field"><span class="lbl">Release</span><select id="career-hop-out-${k}-${i}"><option value="">Choose a squad player</option>${placeOptions(s)}</select></label></div>`).join('') : '<p class="small">No eligible arrival in this pool.</p>'}</fieldset>`).join('')}</div>
    <button class="btn" id="career-hop" type="button">Confirm summer transfers</button>`;
}
function preparation(s) {
  return `<h3>Set the lineup</h3><p class="small">Change the formation or swap two squad places before continuing. Boosts and development remain with the player.</p>
    <div class="career-controls"><label class="field"><span class="lbl">Formation</span><select id="career-form">${Object.keys(U.G.formations).map(f => `<option value="${esc(f)}" ${f === s.f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label><button class="btn q" id="career-form-apply" type="button">Apply formation</button>
    <label class="field"><span class="lbl">First place</span><select id="career-swap-a">${placeOptions(s)}</select></label><label class="field"><span class="lbl">Second place</span><select id="career-swap-b">${placeOptions(s)}</select></label><button class="btn q" id="career-swap" type="button">Swap players</button>
    <button class="btn" id="career-next" type="button">${s.half === 1 ? 'Start the run-in' : `Start ${yr(s.years[s.y + 1])}`}</button></div>`;
}
function action(s) {
  if (s.ph === 'half') return `<p class="small">${s.half === 0 ? 'Play the opening half of the league and cup season. The winter window opens next.' : 'The run-in decides the league, cups and the board objective.'}</p><button class="btn" id="career-half" type="button">${s.half === 0 ? 'Play to winter' : 'Play the run-in'}</button>`;
  if (s.ph === 'node') return `<h3>${s.node.window === 'winter' ? 'Winter window' : 'Summer rewards'}</h3><p class="small">${s.node.left} choice${s.node.left === 1 ? '' : 's'} remaining.${free(s) ? ' This trophy reward is free.' : ' Keep at least 1 patience after a purchase.'} ${s.pat === 20 ? 'Full patience offers two development cards.' : ''}</p><div class="rewards">${C.careerOffers(U.G, s).map((o, j) => offer(o, j, s)).join('')}</div>`;
  if (s.ph === 'hop') return transfer(s);
  if (s.ph === 'repo') return preparation(s);
  const sc = C.careerScore(s);
  return `<h3>${s.ph === 'done' ? 'Decade complete' : 'The board has ended your career'}</h3><p class="small">${s.history.length} seasons completed · ${s.trophies.length} trophies · score ${num(sc.score ?? sc)}.</p>`;
}
function table(s, src = []) {
  const sources = new Map(src.map(c => [c.id, c]));
  return `<div class="tw league"><table><caption class="sr-only">${esc(compName(s, 'L'))} · ${yr(s.S.s)}</caption><thead><tr><th>#</th><th>Club</th>${['P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map(k => `<th class="k">${k}</th>`).join('')}</tr></thead><tbody>
    ${s.S.L.rows.map((r, i) => `<tr data-club="${esc(r[0])}" class="${r[0] === s.q ? 'your-row' : ''}"><td>${i + 1}</td><td>${name(r[0])}${r[0] === s.q ? ' · Yours' : sources.get(r[0])?.si ? ' <small>Stand-in squad</small>' : sources.get(r[0])?.src === 'nearby' ? ' <small>Nearby-season fill</small>' : ''}</td>${[...r.slice(1, 7), r[5] - r[6], r[7]].map(x => `<td class="k">${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function rivals(s, sources) {
  return `<details class="breakdown"><summary>Inspect this season's rival squads and sources</summary>${sources.filter(c => c.id !== s.q).map(c => `<details class="career-bracket"><summary>${esc(c.nm)} · ${c.si ? 'Stand-in squad' : `${c.n} players recorded this season`}</summary><p class="small">${esc(c.source)}</p><div class="tw"><table><thead><tr><th>Player</th><th>Positions</th><th>Rating</th><th>Source</th></tr></thead><tbody>${c.roster.map(p => `<tr><td>${esc(p.nm)}</td><td>${esc(p.pos.join(', '))}</td><td>${num(p.r)}</td><td>${esc(p.src)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}</details>`;
}
function fixtures(s) {
  const M = s.S.me;
  return M.length ? `<div class="fixtures">${M.map(m => `<div data-comp="${m.k}" class="fixture ${m.gf > m.ga ? 'W' : m.gf < m.ga ? 'L' : 'D'}"><span>${esc(compName(s, m.k))}<small>${esc(m.rd)} · ${m.h === 'N' ? 'Neutral' : m.h === 'H' ? 'Home' : 'Away'}</small></span><span>${name(m.op)}<small>${m.sc.filter(e => e[1]).map(e => `${esc(nm(e[2]))} ${e[0]}′`).join(', ')}</small></span><b>${m.gf}–${m.ga}${m.pw ? `<small>pens ${m.pw.join('–')}</small>` : m.et ? '<small>extra time</small>' : ''}</b></div>`).join('')}</div>` : '<p class="empty">Your fixtures appear after you play to winter.</p>';
}
function competitions(s) {
  return Object.values(s.S.K).map(K => `<details class="career-bracket"><summary>${esc(K.nm)} · ${K.ch ? `${name(K.ch)} won` : `${K.al.length} clubs remain`}</summary>
    ${K.gt ? `<div class="challenge-grid">${K.gt.map((g, i) => `<div><h3>Group ${String.fromCharCode(65 + i)}</h3><div class="tw"><table><thead><tr><th>Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead><tbody>${g.map(r => `<tr><td>${name(r[0])}</td><td>${r[1]}</td><td>${r[5] - r[6]}</td><td>${r[7]}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>` : ''}
    ${K.R.map(R => `<h3 class="st">${esc(R[0]?.rd || 'Round')}</h3>${R.map(t => `<div class="cup-tie ${t.A === s.q || t.B === s.q ? 'cup-tie--yours' : ''}"><div>${name(t.A)} v ${name(t.B)}<small>Winner: ${name(t.w)}${t.pw ? ' · penalties' : t.et ? ' · extra time' : ''}</small></div><strong>${t.agg.join('–')}</strong></div>`).join('')}`).join('') || '<p class="small">The draw and results appear as the season advances.</p>'}</details>`).join('');
}
function stats(s) {
  return `<h2 class="st">Your players · all competitions</h2><div class="tw"><table><thead><tr><th>Player</th><th>Goals</th><th>Assists</th><th>Clean sheets</th><th>Apps</th></tr></thead><tbody>${s.S.sy.slice().sort((a, b) => b[1] - a[1] || b[2] - a[2]).map(r => `<tr><td>${esc(nm(r[0]))}</td>${r.slice(1, 5).map(n => `<td class="k">${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <h2 class="st">League leaders</h2><div class="mode-log">${s.S.st.slice().sort((a, b) => b[2] - a[2] || b[3] - a[3]).slice(0, 20).map(r => `<div class="mode-event"><div>${esc(U.G.people[r[1]]?.nm || 'Stand-in player')}<small>${name(r[0])}</small></div><b>${r[2]} goals · ${r[3]} assists</b></div>`).join('')}</div>`;
}
function seasonHistory(s) {
  return `<h2 class="st">Trophy cabinet</h2><div class="honours">${s.trophies.map(t => `<span class="honour">${yr(t.s)} · ${esc(t.nm || compName(s, t.k))}</span>`).join('') || '<p class="small">Your first trophy is still ahead.</p>'}</div><h2 class="st">Season history</h2>${s.history.map(h => `<details class="career-bracket"><summary>${yr(h.s)} · ${ord(h.pos)} · ${h.pts} points</summary><p class="small">${h.won ? 'Board objective met' : 'Board objective missed'} · ${h.dp > 0 ? '+' : ''}${h.dp} patience.${h.real.pos ? ` Real club record: ${ord(h.real.pos)}, ${h.real.pts} points.` : ' Club outside the real top flight.'}</p>${table({ ...s, S: h.S })}${competitions({ ...s, S: h.S })}</details>`).join('') || '<p class="empty">Your completed seasons will appear here.</p>'}`;
}
export function hub() {
  const s = U.S.mode.career, S = s.S, r = S.L.rows.find(r => r[0] === s.q), pos = S.L.rows.indexOf(r) + 1;
  const T = C.careerTeam(U.G, s), Q = E.rate(T, s.D), real = history(U.G, s.lg, S.s, s.q);
  const tabs = [['league', 'League table'], ['fixtures', 'Your matches'], ['cup', 'Competitions'], ['stats', 'Player stats'], ['lineup', 'Your squad'], ['history', 'Career history'], ['more', 'More modes']];
  const tab = tabs.some(t => t[0] === U.tab) ? U.tab : 'league';
  const body = { league: () => {
    const sources = C.careerSource(U.G, s);
    return `${table(s, sources)}<p class="small">${S.L.rows.length} clubs · home and away · ${S.w} points for a win. Ranked by points, goal difference, goals scored.</p>${real.pos ? `<p class="small dim">Real ${yr(S.s)} record: ${ord(real.pos)} of ${real.n}, ${real.pts} points. Your career results are simulated.</p>` : '<p class="small dim">Your club takes the lowest-placed top-flight club’s place this season.</p>'}${rivals(s, sources)}`;
  },
    fixtures: () => fixtures(s), cup: () => competitions(s), stats: () => stats(s), lineup: () => `${xi(T, Q, s.D, `Your ${s.f}`)}${breakdown(Q)}<p class="small">${s.cap ? 'At most 2 S-tier and 4 A-tier charges; earned upgrades retain the original charge.' : 'Classic: no tier limits.'}</p>`, history: () => seasonHistory(s), more: () => `${gauntlet()}${more()}` };
  return `<section class="result-hero career-hero" style="${kv(s.q)}"><div class="rh-pos"><p class="lbl">${yr(S.s)} · ${S.h === 0 ? 'Pre-season' : S.h === 1 ? 'Winter' : 'Full time'}</p><p class="big">${S.h ? pos : '–'}${S.h ? `<sup>${ord(pos).slice(-2)}</sup>` : ''}</p><p class="small">${name(s.q)}</p></div>
    <div class="rh-stats"><div><b>${r[7]}</b><span>Points</span></div><div><b>${r[2]}–${r[3]}–${r[4]}</b><span>W–D–L</span></div><div><b>${s.pat} / 20</b><span>Board patience</span></div><div><b>${s.trophies.length}</b><span>Trophies</span></div></div>
    <div class="rh-team"><p class="lbl">${esc(compName(s, 'L'))} · Season ${s.y + 1} / ${s.years.length}</p><h1>${name(s.q)}</h1><p class="small">${esc(s.m.nm)} · ${esc(s.f)} · ${rules(s)}</p><p class="small"><b>Board objective:</b> finish ${S.obj.t === 1 ? 'first' : `in the top ${S.obj.t}`}.</p></div></section>
    <section class="career-board" aria-label="Board and transfer window"><p class="career-owner" role="status">${esc(s.owner)}</p>${action(s)}</section>
    <div class="career-comps">${[{ nm: compName(s, 'L'), ch: S.h === 2 ? S.L.rows[0][0] : null, n: S.ord.length, ent: [s.q], al: [s.q] }, ...Object.values(S.K)].map(K => `<article><p class="lbl">${esc(K.nm)}</p><b>${K.ch ? name(K.ch) : `${K.n} clubs`}</b><span class="small">${K.ch === s.q ? 'Trophy won' : !K.ent.includes(s.q) ? 'Not qualified' : K.ch ? 'Complete' : !K.al.includes(s.q) ? 'Eliminated' : 'In progress'}</span></article>`).join('')}</div>
    <div class="results-tabs" role="tablist" aria-label="Club career">${tabs.map(([v, l]) => `<button type="button" role="tab" data-tab="${v}" aria-selected="${tab === v}" aria-controls="result-panel" id="tab-${v}" tabindex="${tab === v ? 0 : -1}">${l}</button>`).join('')}</div><section id="result-panel" role="tabpanel" aria-labelledby="tab-${tab}">${body[tab]()}</section>
    <div class="share-strip"><p class="small">${rules(s)} · Seed ${s.seed} · career saved in this browser.</p><div class="row wrap"><button class="btn sm" id="share" type="button">Copy career</button><button class="btn q sm" id="result-card" type="button">Result card ↓</button><button class="btn q sm" id="download" type="button">Download replay ↓</button><button class="btn q sm" id="replay" type="button">Replay this seed ↻</button></div></div>`;
}
export function careerShareText() {
  const s = U.S.mode.career, r = s.S.L.rows.find(r => r[0] === s.q), pos = s.S.L.rows.indexOf(r) + 1;
  return `Football Era Lab · ${cname(U.G, s.q)} · ${yr(s.S.s)}\nSeason ${s.y + 1} / ${s.years.length} · ${rules(s)}\n${s.S.h ? ord(pos) : 'Pre-season'} / ${s.S.L.rows.length} · ${r[7]} points · ${r[2]}W ${r[3]}D ${r[4]}L\n${s.trophies.length} trophies · ${s.pat} board patience\n${s.m.nm} · ${s.f}\nSeed ${s.seed}${typeof location === 'undefined' ? '' : `\n${location.href.split('?')[0]}?seed=${s.seed}&era=${s.D}&cap=${s.cap ? 1 : 0}`}`;
}
export async function careerCardImage() {
  const s = U.S.mode.career, Q = E.rate(C.careerTeam(U.G, s), s.D), c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  try { await document.fonts.load('800 48px "Barlow Condensed"'); } catch { /* system font fallback */ }
  const g = c.getContext('2d'); g.fillStyle = '#070B14'; g.fillRect(0, 0, 1200, 900);
  g.fillStyle = U.G.clubs[s.q]?.k?.[0] || '#C9D2E3'; g.fillRect(0, 0, 1200, 12);
  const tx = (text, x, y, size = 26, col = '#F2F5FB') => { g.fillStyle = col; g.font = `800 ${size}px "Barlow Condensed", sans-serif`; g.fillText(text, x, y, 1080); };
  tx('FOOTBALL ERA LAB', 56, 80, 48); tx(`${cname(U.G, s.q)} · ${yr(s.S.s)}`, 56, 155, 56);
  careerShareText().split('\n').slice(1).forEach((line, i) => tx(line, 56, 205 + i * 38, 27, '#B7C2D9'));
  tx('YOUR FIFTEEN', 56, 450, 30);
  [...Q.xi, ...Q.bn.filter(Boolean).map((p, i) => ({ ...p, s: `B${i + 1}` }))].forEach((p, i) => tx(`${p.s}   ${p.c.nm}   ${Math.round(p.a)}`, i < 8 ? 56 : 650, 495 + (i % 8) * 37, 25));
  tx('Simulated career results · ratings retain their source labels', 56, 852, 22, '#B7C2D9');
  const b = await new Promise(r => c.toBlob(r, 'image/png')); if (!b) throw new Error('The browser could not create the result card.'); return b;
}
