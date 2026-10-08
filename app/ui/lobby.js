// Start screen and the choice of manager and club spell.
//
// Legend
//   intro()   decades, rules, seed, the weekly challenge and three archive cards under the lights
//   teams()   five seeded manager-club options; the inspected one sets the starting formation
//   sq(o)     the spell's club-decade squads: decades from the first to the last season start
//   sig(m, o) his signature players split by whether the spell's squads hold a card of theirs

import { DECADES, opts, hydrate } from '../draft.js';
import { wk } from '../play.js';
import { U, esc, seasons, kv, mini, pitch, vcard, ERA, nm } from './kit.js';

const ART = [['Q17515', 'Q2641:1980', -9], ['Q1835', 'Q8682:2000', 0], ['Q17163', 'Q7156:1970', 9]];

export function intro() {
  const { G, D, cap } = U, w = wk();
  const cards = ART.filter(([p, k]) => G.cards[k]?.some(c => c.p === p))
    .map(([p, k, a], i) => `<div class="fan" style="--a:${a}deg;--i:${i}">${vcard(hydrate(G, { k, p }))}</div>`).join('');
  return `<section class="land">
    <div class="land-copy">
      <p class="eyebrow">A draft through eight decades</p>
      <h1>Build an<br>era XI.</h1>
      <p class="lede">Choose a manager at one of his clubs. Draw five historical squads, take three players from each and set your formation as the draft unfolds. Then play a season against the best clubs of your decade.</p>
      <form id="start-form" class="start" novalidate>
        <fieldset class="eras"><legend class="lbl">Season decade · your opponents come from here</legend>
          <div class="tiles">${DECADES.map(d => `<button type="button" class="tile" data-era="${d}" aria-pressed="${D === d}" style="--era:var(--era-${d})"><b>${d}s</b><small>${ERA[d]}</small></button>`).join('')}</div>
          <button type="button" class="link" data-era="random" aria-pressed="${D === 'random'}">${D === 'random' ? '✓ The seed chooses the decade' : 'Let the seed choose the decade'}</button>
        </fieldset>
        <div class="start-row">
          <fieldset class="rules"><legend class="lbl">Rules</legend>
            <label><input id="draft-cap" type="radio" name="draft-rules" value="cap" ${cap ? 'checked' : ''}><span><b>Salary cap</b><small>2 S · 4 A · 4 B · 3 C · 2 D</small></span></label>
            <label><input id="draft-classic" type="radio" name="draft-rules" value="classic" ${!cap ? 'checked' : ''}><span><b>Classic</b><small>No tier limits</small></span></label>
          </fieldset>
          <label class="seed"><span class="lbl">Replay seed</span><input id="seed" name="seed" inputmode="numeric" autocomplete="off" value="${esc(U.seed)}" aria-describedby="seed-help"><small id="seed-help">Same seed, rules and choices give the same run.</small></label>
          <button class="btn big" type="submit">Enter the draft →</button>
        </div>
      </form>
    </div>
    <div class="land-art" aria-hidden="true"><div class="land-pitch">${pitch(G.formations['4-3-3'].slots.map(([s, x, y]) => ({ s, x, y })), [], { mode: 'view', sm: true })}</div><div class="fans">${cards}</div></div>
  </section>
  <section class="weekly" aria-label="Weekly challenge"><div><p class="lbl">This week · ${esc(w.id)}</p><p class="wk">${w.D}s season · one seed for everyone</p>
    <p class="small">Same managers and first squad for every player this week, under Salary cap. Your picks steer which clubs follow.</p></div>
    <button class="btn q" id="weekly" type="button">Play the weekly challenge</button></section>
  <ol class="how" aria-label="How a draft works"><li><b>Team</b><span>A manager at one of his clubs sets grades and signature players.</span></li>
    <li><b>Five squads</b><span>Three players from each historical club squad, inside the salary cap.</span></li>
    <li><b>Lineup</b><span>Any formation, any placement; ratings follow each player's position fit.</span></li>
    <li><b>Season</b><span>A 38-match league and a 16-club European Cup, then the Era Gauntlet.</span></li></ol>
  <p class="replay"><label>Have a saved replay? <input id="import-replay" type="file" accept="application/json,.json"></label></p>`;
}

const sq = o => { const D = []; for (let d = Math.floor(o.a / 10) * 10; d <= Math.floor(o.b / 10) * 10; d += 10) if (U.G.cards[`${o.q}:${d}`]) D.push(d); return D; };
function sig(m, o) {
  const H = new Set(sq(o).flatMap(d => U.G.cards[`${o.q}:${d}`].map(c => c.p)));
  return { here: m.sig.filter(p => H.has(p)).map(nm), away: m.sig.filter(p => !H.has(p)).map(nm) };
}
const spells = (m, o) => { const T = m.t.filter(([q]) => q === o.q).sort((x, y) => x[1] - y[1]); return [T.findIndex(t => t[1] === o.a) + 1, T.length]; };

export function teams() {
  const { G, S } = U, O = opts(G, S), j = Math.min(U.insp, O.length - 1);
  const card = (o, i) => {
    const m = G.managers.find(m => m.nm === o.nm), c = G.clubs[o.q], [n, of] = spells(m, o), s = sig(m, o), D = sq(o);
    return `<article class="tc ${i === j ? 'on' : ''}" style="${kv(o.q)}" aria-label="${esc(`${m.nm}, ${c.nm} ${seasons(o.a, o.b)}`)}">
      <div class="th"><p class="lbl">Option ${i + 1} · ${esc(c.cc)}</p><p class="cn">${esc(c.nm)}</p><p class="yr">${seasons(o.a, o.b)}</p></div>
      <div class="bd"><div class="row top"><p class="mg">${esc(m.nm)}</p>${of > 1 ? `<span class="tg o">Spell ${n} of ${of}</span>` : ''}</div>
        <div class="gr"><span>Att <b>${m.ga}</b></span><span>Def <b>${m.gd}</b></span></div>
        <div><p class="lbl">Recorded formations</p><p class="fs">${m.f.map(esc).join(' · ')}</p></div>
        <div><p class="lbl">Signature players</p><p class="small"><b>${s.here.length} in this team's squads</b>${s.away.length ? ` · ${s.away.length} elsewhere` : ''}${s.here.length ? `<br>${s.here.slice(0, 3).map(esc).join(' · ')}` : ''}</p></div>
        <p class="small sq">${D.length ? `Archive squads: ${D.map(d => `${d}s (${G.cards[`${o.q}:${d}`].length})`).join(' · ')}` : `No archive squad for ${esc(c.nm)} in the ${Math.floor(o.a / 10) * 10}s`}</p>
        <div class="row"><button class="btn q sm" type="button" data-inspect="${i}" aria-pressed="${i === j}">Inspect</button><button class="btn sm" type="button" data-manager="${i}">Choose</button></div></div></article>`;
  };
  const o = O[j], m = G.managers.find(m => m.nm === o.nm), c = G.clubs[o.q], s = sig(m, o), f0 = U.f0 && G.formations[U.f0] ? U.f0 : m.f[0];
  const rec = m.f.filter(f => G.formations[f]), rest = Object.keys(G.formations).filter(f => !rec.includes(f));
  const D = sq(o);
  return `<section class="teams">
    <div class="head"><div><p class="eyebrow">Step 1 · your managerial context</p><h1>Choose a manager and his club</h1>
      <p class="lede">Five managers, one club spell each. The team sets grades and signature players; the formation stays your choice until kick-off.</p></div>
      <button class="btn q" type="button" id="manager-reroll" ${S.managerRoll >= 2 ? 'disabled' : ''}>Re-spin teams <span>${2 - S.managerRoll} left</span></button></div>
    <div class="tcs">${O.map(card).join('')}</div>
    <section class="insp-team" aria-label="${esc(`${m.nm} at ${c.nm}`)}" style="${kv(o.q)}">
      <div><p class="lbl">Start in · change any time before kick-off</p>
        <div class="row wrap">${rec.map(f => `<span class="fm ${f === f0 ? 'on' : ''}">${mini(G, f)}<span><b>${esc(f)}</b><small>Recorded</small></span></span>`).join('')}</div>
        <label class="sel full"><span class="sr-only">Starting formation</span><select id="start-formation">${rec.map(f => `<option value="${esc(f)}" ${f === f0 ? 'selected' : ''}>${esc(f)} · recorded</option>`).join('')}<optgroup label="Other formations">${rest.map(f => `<option value="${esc(f)}" ${f === f0 ? 'selected' : ''}>${esc(f)}</option>`).join('')}</optgroup></select></label>
        <p class="small">Recorded formations come from his whole career, not only this spell. Any of the ${Object.keys(G.formations).length} catalogue formations can be played.</p></div>
      <div><p class="lbl">Grades</p><div class="gr"><span>Attack <b>${m.ga}</b></span><span>Defence <b>${m.gd}</b></span></div>
        <p class="small">From ${m.ec} European Cup${m.ec === 1 ? '' : 's'}, ${m.lt} league title${m.lt === 1 ? '' : 's'} and ${m.ct} other European troph${m.ct === 1 ? 'y' : 'ies'} over his career. A signature player anywhere in your fifteen raises both grades one step.</p></div>
      <div><p class="lbl">Signature players${D.length ? ` · ${s.here.length} in ${esc(c.nm)}'s ${D.map(d => `${d}s`).join(' and ')} squads` : ''}</p>
        <p class="small cols">${s.here.map(esc).join('<br>') || 'None in this team\'s archive squads.'}</p>
        <p class="small">${s.away.length ? `Elsewhere in his career: ${s.away.map(esc).join(', ')}.` : 'Elsewhere in his career: none.'}</p></div>
      <div class="cta"><button class="btn big" type="button" data-choose="${j}">Choose ${esc(m.nm)} · ${esc(c.nm)}</button><span class="small">${seasons(o.a, o.b)}</span></div>
    </section>
  </section>`;
}
