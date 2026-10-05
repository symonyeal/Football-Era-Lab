'use strict';
const $ = id => document.getElementById(id);
const STORAGE = 'era-eleven-v2';
const MAX_SEED = 2147483647;
let meta = {}, profile = null, profileData = {}, token = null, game = null;
let era = 'All eras', mode = 'solo', busy = false, roomSession = null, roomView = null, mini = null;
let result = null, page = 'play', pollTimer = null, pendingHandover = null, audioContext = null;
let preferences = {era_fx: true, reduce_motion: false, sound: false};
let career = null, careerToken = null, savedCareers = [];
const modeNames = {solo: 'Classic match', 'head-to-head': 'Head to Head', gauntlet: 'Era Gauntlet', weekly: 'Weekly Challenge', league: 'Season laboratory'};
const descriptions = {'All eras': 'All generations share one pitch. This is a mixed-era pool.', Legends: 'Base ICONs and HEROes, including pre-1990 classics.', '1990s': 'A career-era pool using reconstructed ICON and HERO ratings.', '2000s': 'A career-era pool using reconstructed ICON and HERO ratings.', '2010s': 'Published FIFA 18 ratings, from the 2017 snapshot.', '2020s': 'Published FC 24 ratings, from the 2023 snapshot.', 'Randomize Era': 'The server chooses one eligible historical era using the draft seed. This does not mix eras.'};
const hints = {'All eras': 'THE FULL POOL', Legends: 'CLASSICS & ICONS', '1990s': 'THE ARTISTS', '2000s': 'THE GOLDEN YEARS', '2010s': 'THE RIVALRY', '2020s': 'THE NEW GUARD'};
const modeNotes = {solo: 'Build a squad and face a generated opponent from your chosen era.', 'head-to-head': 'Two humans each draft fifteen distinct people. Online drafts are simultaneous; local players pass the device. Both confirm readiness before a direct football match. This adapts the reference season-finals format.', gauntlet: 'Progress through era opponents. Your owner patience, opponents, and completion conditions appear below your squad.', weekly: 'A fixed weekly draft and fixed match conditions keep results comparable. Your chosen seed and lab weights do not alter this challenge.', league: 'Play a scheduled competition one fixture at a time. The server updates the complete standings after every round.'};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const label = value => String(value).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE) || '{}'); }
  catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({profile, token, era, mode, room: roomSession, preferences, careerToken, savedCareers})); }
  catch { $('status').textContent = 'Browser storage is unavailable. Keep a profile backup to recover your progress.'; }
}
async function api(path, data = {}, method = 'POST') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const sessionRoute = !/^(room\/|mini\/|league\/|profile$|progress$|settings$|leaderboard$|meta$)/.test(path);
    const response = await fetch('/api/' + path, {method, signal: controller.signal, cache: 'no-store', headers: {'Content-Type': 'application/json'}, ...(method === 'GET' ? {} : {body: JSON.stringify({profile, ...(sessionRoute ? {token} : {}), ...data})})});
    let out;
    try { out = await response.json(); } catch { throw new Error('The server did not return a game response. Start the local server and try again.'); }
    if (!response.ok) throw new Error(out.error || 'The server rejected this action.');
    $('connection').textContent = 'SERVER CONNECTED';
    return out;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Refresh the saved state before trying the action again.');
    if (error instanceof TypeError) { $('connection').textContent = 'CONNECTION LOST'; throw new Error('Cannot reach the server. Your saved draft and room access remain in this browser. Use reconnect when the server returns.'); }
    throw error;
  } finally { clearTimeout(timer); }
}
function errorNotice(error) {
  $('error').textContent = error.message || String(error);
  $('error').hidden = false;
}
async function action(message, fn) {
  if (busy) return;
  busy = true;
  $('error').hidden = true;
  $('status').textContent = message;
  document.body.setAttribute('aria-busy', 'true');
  updateButtons();
  try { await fn(); if ($('status').textContent === message) $('status').textContent = ''; }
  catch (error) { errorNotice(error); $('status').textContent = ''; }
  finally { busy = false; document.body.removeAttribute('aria-busy'); updateButtons(); }
}
function seedValue(id) {
  const raw = $(id).value.trim();
  const seed = Number(raw);
  if (!raw || !Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) throw new Error('Choose a whole seed from 0 to 2147483647.');
  return seed;
}
function randomSeed() { return crypto.getRandomValues(new Uint32Array(1))[0] % MAX_SEED; }
function roomCredential() { return roomSession?.local_credentials?.[roomSession.seat] || roomSession?.credential; }
function roomPayload(extra = {}) { return {room: roomSession.room, credential: roomCredential(), ...(roomSession.local_credentials ? {revision: roomView?.revision} : {}), action_id: crypto.randomUUID(), ...extra}; }
function setPage(next) {
  page = next;
  document.querySelectorAll('.page').forEach(element => { element.hidden = element.id !== 'page-' + next; });
  document.querySelectorAll('.nav-btn').forEach(button => { const active = button.dataset.page === next; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  if (next === 'clubhouse') action('Loading your clubhouse…', refreshProfile);
}
function setMode(next) {
  mode = next;
  document.querySelectorAll('.mode-btn').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('mode-note').textContent = modeNotes[mode] || '';
  $('room-lobby').hidden = mode !== 'head-to-head' || !!roomSession;
  $('room-panel').hidden = mode !== 'head-to-head' || !roomSession;
  $('draft-seed').disabled = mode === 'weekly';
  $('random-seed').disabled = mode === 'weekly';
  $('new-game').hidden = mode === 'head-to-head';
  if (mode === 'head-to-head') {
    if (roomView) renderRoom(roomView);
    else clearDraft();
  } else if (game?.mode === mode) render(game);
  else clearDraft();
  $('variant-control').hidden = mode !== 'solo';
  updateButtons();
}
function selectEra(next) {
  era = next;
  $('era-note').textContent = descriptions[next] || 'Player cards from the selected era.';
  document.querySelectorAll('.era-btn').forEach(button => { const active = button.dataset.era === era; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  $('random-era').classList.toggle('active', era === 'Randomize Era');
  $('random-era').setAttribute('aria-pressed', String(era === 'Randomize Era'));
}
function updateButtons() {
  document.querySelectorAll('[data-mutation],#spin,#new-game,#swap,#play,#series,#season,#advance,#random-seed,#random-era,#room-local,#room-create,#room-join,#room-start,#room-ready,#room-rematch,#room-switch,#room-refresh,#import-run,#profile-import,#respin').forEach(button => { button.disabled = busy || button.dataset.disabledByRule === 'true'; });
  document.querySelectorAll('.era-btn,.mode-btn,[data-start-mode]').forEach(button => { button.disabled = busy || !!(button.dataset.era && mode === 'weekly') || !!button.dataset.ineligible; });
  $('random-era').disabled = busy || mode === 'weekly';
  $('random-seed').disabled = busy || mode === 'weekly';
  $('new-game').disabled = busy || !profile;
  const seat = roomView?.seats?.[roomSession?.seat];
  const activeRoom = mode === 'head-to-head' && !!roomSession;
  $('spin').disabled = busy || (activeRoom ? !seat?.joined || seat.count >= 15 || roomView.phase !== 'drafting' || (roomView.turn !== null && roomView.turn !== roomSession.seat) : !game || game.complete || game.mode !== mode);
  const complete = activeRoom ? seat?.count === 15 : game?.complete && game.mode === mode;
  ['play', 'series', 'season', 'export', 'share'].forEach(id => { $(id).disabled = busy || !complete; });
  $('swap').disabled = busy || !complete || !!seat?.ready || (activeRoom && roomView.phase === 'finished');
  $('advance').disabled = busy || !complete || !!(game?.progress?.complete || game?.progress?.finished || game?.progress?.eliminated);
  $('room-ready').disabled = busy || seat?.count !== 15 || seat.ready || !roomView?.seats?.every(player => player.joined);
  $('room-rematch').disabled = busy || !!roomView?.rematch_votes?.[roomSession?.seat];
  $('room-start').disabled = busy || roomSession?.seat !== 0 || !roomView?.seats?.every(player => player.joined);
  $('respin').disabled = busy || mode !== 'solo' || !game || !!game.respin_used || game.respins_remaining === 0;
  $('formation-choice').disabled = busy || activeRoom || !game;
  $('chemistry').disabled = mode !== 'solo';
  $('tactics').disabled = mode !== 'solo';
  $('auto-subs').disabled = mode !== 'solo';
}
function clearDraft() {
  $('manager-name').textContent = 'Your next manager'; $('formation-label').textContent = '—'; $('manager-style').textContent = '';
  $('count').innerHTML = '00 <span>/ 15</span>'; $('progress').replaceChildren();
  $('cards').innerHTML = '<div class="cards">' + Array.from({length: 3}, () => '<div class="empty-card"><span>?</span><small>THE NEXT LEGEND</small></div>').join('') + '</div>';
  $('squad-list').replaceChildren(); $('lineup-section').hidden = true; $('match-section').hidden = true;
  $('spin').innerHTML = 'SPIN · 3 PLAYERS <span>↻</span>'; $('spin-hint').textContent = mode === 'head-to-head' ? 'Create or join a room to begin.' : 'Draw a manager to begin.';
  $('formation-control').hidden = true; $('era-selected').hidden = true;
  $('salary-budget').hidden = true; $('respin').hidden = true;
}
function render(g, isRoom = false) {
  if (!isRoom) { game = g; token = g.token || token; mode = g.mode || mode; save(); }
  $('manager-name').textContent = g.manager?.name || 'Waiting for player';
  $('manager-style').textContent = g.manager?.style || '';
  $('formation-label').textContent = g.formation || '—';
  $('count').innerHTML = String(g.count || 0).padStart(2, '0') + ' <span>/ 15</span>';
  $('progress').innerHTML = Array.from({length: 5}, (_, index) => '<span class="' + (index < g.spins ? 'filled' : '') + '"></span>').join('');
  $('progress').setAttribute('aria-label', `${g.spins || 0} of 5 spins complete`);
  $('spin-hint').textContent = g.complete ? 'Squad complete · Pick your eleven' : `Spin ${(g.spins || 0) + 1} of 5 · Every card joins your squad`;
  $('spin').innerHTML = g.complete ? 'SQUAD COMPLETE ✓' : 'SPIN · 3 PLAYERS <span>↻</span>';
  if (g.cards?.length) $('cards').innerHTML = '<div class="cards">' + g.cards.join('') + '</div>';
  else $('cards').innerHTML = '<div class="cards">' + Array.from({length: 3}, () => '<div class="empty-card"><span>?</span><small>THE NEXT LEGEND</small></div>').join('') + '</div>';
  $('squad-list').innerHTML = (g.squad || []).map(player => `<div class="squad-row"><span>${esc(player.name)}</span><span>${esc(player.overall)} ${esc((player.positions || []).join('/'))}</span></div>`).join('');
  $('lineup-section').hidden = !g.complete;
  $('match-section').hidden = !g.complete || isRoom;
  if (g.complete) {
    $('lineup').innerHTML = g.team_html || '';
    $('slot').replaceChildren(...(g.starters || []).map(starter => new Option(starter.slot + ' · ' + starter.name, starter.index)));
    $('bench').replaceChildren(...(g.bench || []).map(player => new Option(player.name + ' · ' + player.positions.join('/'), player.id)));
    renderAnalytics(g.analytics || {});
  }
  const formations = g.formations || g.manager?.formations || g.compatible_formations || [];
  $('formation-control').hidden = isRoom || !formations.length;
  $('formation-choice').replaceChildren(...formations.map(formation => new Option(formation, formation)));
  $('formation-choice').value = g.formation;
  $('era-selected').hidden = !g.era;
  $('era-selected').textContent = `${g.requested_era === 'Randomize Era' ? 'Random draw' : 'Draft era'}: ${g.era}`;
  document.body.dataset.era = g.era || era;
  $('respin').hidden = isRoom || mode !== 'solo' || !!g.respin_used || g.respins_remaining === 0;
  const budget = g.variant === 'salary-cap' ? g.salary || g.salary_cap || g.budget : null;
  $('salary-budget').hidden = !budget;
  $('salary-budget').textContent = budget && typeof budget === 'object' ? Object.entries(budget).map(([key, value]) => `${label(key)}: ${value && typeof value === 'object' ? Object.entries(value).map(([tier, number]) => `${tier} ${number}`).join(' · ') : value}`).join(' · ') : budget || '';
  if (!isRoom) {
    $('competition-label').textContent = (modeNames[mode] || mode).toUpperCase();
    ['play', 'series', 'season', 'match-seed-label'].forEach(id => { $(id).hidden = mode !== 'solo' && !(id === 'play' && mode === 'weekly'); });
    $('advance').hidden = !['gauntlet', 'league'].includes(mode);
    $('match-note').textContent = modeNotes[mode] || modeNotes.solo;
    $('play').textContent = mode === 'weekly' ? 'PLAY WEEKLY CHALLENGE →' : 'PLAY MATCH →';
    renderProgress(g.progress);
    if (g.result_html) { $('match-result').innerHTML = g.result_html; $('match-result').hidden = false; }
    else if (g.last_result?.html) { $('match-result').innerHTML = g.last_result.html; $('match-result').hidden = false; }
    else if (g.result) showResult(g.result);
  }
  updateButtons();
}
function renderAnalytics(analytics) {
  const captions = {formation_fit: 'Formation fit', role_fit: 'Role suitability', chemistry: 'Chemistry', tactical_fit: 'Tactical fit', attack: 'Attacking strength', defence: 'Defensive strength', defense: 'Defensive strength', midfield: 'Midfield strength', fatigue: 'Fatigue', squad_strength: 'Squad strength', model: 'Analytics model', source: 'Evidence', uncertainty: 'Uncertainty'};
  const measured = {...analytics, ...(analytics.rating || {}), ...(analytics.backend || {})};
  const rows = Object.entries(measured).filter(([, value]) => value !== null && typeof value !== 'object').map(([key, value]) => `<div class="analytic-row"><span>${esc(captions[key] || label(key))}</span><span>${esc(typeof value === 'number' ? Number(value.toFixed(3)) : value)}</span></div>`);
  $('analytics').innerHTML = rows.join('') + '<p class="note">Published game attributes and reconstructed historical ratings feed the model. Match statistics are simulated. Repeating a match measures sampling variation; uncertainty about historical ability is not measured by that repetition.</p>';
}
function renderProgress(progress) {
  $('competition-progress').hidden = !progress || !Object.keys(progress).length;
  if (!progress) return;
  const fields = ['week', 'round', 'stage', 'era', 'opponent', 'difficulty', 'patience', 'owner_patience', 'points', 'score', 'wins', 'draws', 'losses', 'played', 'total', 'complete', 'eliminated'];
  let html = '<div class="competition-summary">' + fields.filter(key => progress[key] !== undefined).map(key => `<span>${esc(label(key))}: ${esc(progress[key])}</span>`).join('') + '</div>';
  if (progress.label || progress.description) html += `<p class="note">${esc(progress.label || progress.description)}</p>`;
  if (progress.standings?.length) html += table(progress.standings, ['name', 'played', 'wins', 'draws', 'losses', 'points', 'goal_difference']);
  const fixtures = progress.fixtures || progress.matches || progress.history;
  if (fixtures?.length) html += '<div class="fixture-list">' + fixtures.map((fixture, index) => `<div class="fixture-row"><span>${esc(fixture.round || fixture.match || index + 1)} · ${esc(fixture.opponent || fixture.name || fixture.era || 'Fixture')}</span><span>${esc(fixture.outcome || fixture.result || '')} ${esc(fixture.goals_for ?? '')}${fixture.goals_for !== undefined ? ' : ' : ''}${esc(fixture.goals_against ?? '')}</span></div>`).join('') + '</div>';
  $('competition-progress').innerHTML = html;
  const actions = progress.actions || [];
  $('management-actions').hidden = !actions.length;
  $('management-actions').replaceChildren(...actions.map(entry => {
    const id = typeof entry === 'string' ? entry : entry.id || entry.action;
    const button = document.createElement('button'); button.className = 'button outline'; button.dataset.mutation = '';
    button.textContent = entry.label || label(id);
    button.addEventListener('click', () => action('Applying your management decision…', async () => { const response = await api('manage', {action: id}); render(response.state || response); await refreshProfile(); })); return button;
  }));
  const complete = progress.complete || progress.finished || progress.eliminated;
  $('advance').textContent = complete ? (progress.eliminated ? 'RUN ENDED' : 'COMPETITION COMPLETE ✓') : mode === 'gauntlet' ? 'PLAY NEXT ERA MATCH →' : 'PLAY NEXT FIXTURE →';
}
function table(rows, columns) {
  if (!rows?.length) return '<p class="note">No recorded results yet. Complete a competition to appear here.</p>';
  const selected = columns.filter(column => rows.some(row => row[column] !== undefined));
  if (!selected.length) return '<p class="note">No recorded results in this competition.</p>';
  return '<table class="competition-table"><thead><tr>' + selected.map(column => `<th scope="col">${esc(label(column))}</th>`).join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + selected.map(column => `<td>${esc(row[column] ?? '—')}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
}
async function newGame() {
  await action('Drawing manager and formation…', async () => {
    const g = await api('new', {era, mode, variant: $('draft-variant').value, seed: seedValue('draft-seed'), config: {chemistry_weight: Number($('chemistry').value), tactical_weight: Number($('tactics').value), auto_subs: $('auto-subs').checked}});
    roomView = null; result = null; render(g); setMode(g.mode || mode); selectEra(g.requested_era || g.era || era);
    $('draft-seed').value = g.seed; $('match-result').hidden = true; $('share-label').hidden = true;
    $('status').textContent = g.requested_era === 'Randomize Era' ? `Randomize Era chose ${g.era}. This run keeps that era.` : `${modeNames[mode]} ready. Spin to receive your first three players.`;
  });
}
function revealTone() {
  if (!preferences.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.frequency.value = 440; gain.gain.setValueAtTime(.025, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .16);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .17);
  } catch { $('status').textContent = 'Your browser cannot play the reveal sound. The draft is saved.'; }
}
async function spin() {
  await action('Drawing three players…', async () => {
    $('cards').classList.add('spinning');
    try {
      const roomActive = mode === 'head-to-head' && roomSession;
      const response = await api(roomActive ? 'room/spin' : 'spin', roomActive ? roomPayload() : {});
      if (preferences.era_fx && preferences.speed !== 'instant' && !preferences.reduce_motion && !matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 240));
      if (roomActive) { renderRoom(response); if (roomSession.local_credentials && response.turn !== roomSession.seat && response.phase === 'drafting') requestHandover(response.turn); }
      else render(response);
      revealTone();
    } finally { $('cards').classList.remove('spinning'); }
  });
}
async function swap() {
  await action('Checking role suitability…', async () => {
    const data = {slot: Number($('slot').value), bench_id: $('bench').value};
    if (mode === 'head-to-head' && roomSession) renderRoom(await api('room/swap', roomPayload(data)));
    else { render(await api('swap', data)); result = null; $('match-result').hidden = true; }
  });
}
function showResult(response) {
  result = response.result || response;
  $('match-result').innerHTML = response.html || response.result_html || `<h2>MATCH RESULT</h2><div class="score">${esc(result.home_goals ?? result.goals_for ?? '?')} : ${esc(result.away_goals ?? result.goals_against ?? '?')}</div>`;
  if (response.opponent) $('match-result').insertAdjacentHTML('afterbegin', `<p class="caps small muted">Your XI vs ${esc(response.opponent)}</p>`);
  $('match-result').hidden = false;
}
async function playMatch() {
  await action(mode === 'weekly' ? 'Playing the fixed weekly challenge…' : 'Playing the match…', async () => {
    const response = await api('match', {seed: seedValue('match-seed')});
    showResult(response);
    if (response.state) render(response.state);
    if (response.progress) { game.progress = response.progress; renderProgress(response.progress); }
    await refreshProfile();
  });
}
async function advance() {
  await action('Playing the next scheduled fixture…', async () => {
    const response = await api('advance');
    if (response.state) render(response.state);
    if (response.progress) { game.progress = response.progress; renderProgress(response.progress); }
    showResult(response); await refreshProfile();
  });
}
async function refreshProfile() {
  const response = await api('profile', {profile});
  profile = typeof response.profile === 'string' ? response.profile : response.profile?.credential || response.profile?.id || profile;
  profileData = {...response, ...(typeof response.profile === 'object' ? response.profile : {})};
  preferences = {...preferences, ...(profileData.settings || {})};
  applyPreferences(); renderProfile(); save();
}
function applyPreferences() {
  document.body.classList.toggle('era-fx', !!preferences.era_fx);
  document.body.classList.toggle('reduce-motion', !!preferences.reduce_motion);
  document.body.dataset.theme = preferences.theme || 'stadium';
  $('era-fx').checked = !!preferences.era_fx; $('reduce-motion').checked = !!preferences.reduce_motion; $('sound').checked = !!preferences.sound;
  $('theme').value = preferences.theme || 'stadium'; $('speed').value = preferences.speed || 'normal';
  $('display-name').value = preferences.display_name || profileData.display_name || profileData.name || '';
}
function renderProfile() {
  const stats = profileData.stats || {};
  $('lifetime-stats').innerHTML = Object.entries(stats).filter(([, value]) => typeof value === 'number').map(([key, value]) => `<div class="stat-tile"><strong>${esc(value)}</strong><span>${esc(label(key))}</span></div>`).join('') || '<p class="note">Your lifetime totals begin with your first draft.</p>';
  const achievements = profileData.achievements || [];
  const earned = Array.isArray(achievements) ? achievements.filter(achievement => achievement.earned !== false) : Object.entries(achievements).filter(([, value]) => value).map(([name, details]) => ({name, ...(typeof details === 'object' ? details : {})}));
  $('achievements').innerHTML = earned.map(achievement => `<div class="achievement"><strong>✦ ${esc(typeof achievement === 'string' ? label(achievement) : achievement.name || label(achievement.id || 'Achievement'))}</strong><small>${esc(achievement.description || achievement.condition || achievement.earned_at || 'Earned through play')}</small></div>`).join('') || '<p class="note">Achievements are earned through play. Complete a draft, win a match, and test the eras.</p>';
  renderCollection();
  if (profileData.leaderboard) renderLeaderboard(profileData.leaderboard);
  $('profile-scope').textContent = `Progress and rankings: ${profileData.scope || 'this server only'}. This browser keeps your private profile access.`;
}
function renderCollection() {
  const collection = profileData.collection || [];
  const cards = Array.isArray(collection) ? collection : Object.values(collection);
  const query = $('collection-search').value.trim().toLowerCase();
  const filtered = cards.filter(card => [card.name, card.era, card.season, card.edition].join(' ').toLowerCase().includes(query));
  $('collection-count').textContent = `${cards.length} collected cards${query ? ` · ${filtered.length} matching your search` : ''}. Cards come from your completed spins.`;
  $('collection').innerHTML = filtered.map(card => `<article class="collection-card"><strong>${esc(card.overall ?? card.rating ?? '')}</strong><h3>${esc(card.name || card.player || 'Collected player')}</h3><p>${esc((card.positions || []).join('/'))} · ${esc(card.era || card.season || '')}</p><p>${esc(card.edition || card.source || card.card_id || card.id || '')}</p>${card.count ? `<p>Drawn ${esc(card.count)} times</p>` : ''}</article>`).join('') || `<p class="note">${query ? 'No collected players match this search.' : 'Spin to begin your collection.'}</p>`;
}
function renderLeaderboard(response) {
  const rows = Array.isArray(response) ? response : response.rows || response.entries || response.leaderboard || [];
  $('leaderboard').innerHTML = table(rows, ['rank', 'name', 'display_name', 'mode', 'week', 'score', 'points', 'wins', 'era', 'seed']);
}
async function createRoom(local) {
  await action(local ? 'Preparing a two-player draft…' : 'Creating a private room…', async () => {
    const view = await api('room/create', {era, seed: seedValue('draft-seed'), local});
    roomSession = {room: view.room, seat: view.seat, credential: view.credential, local_credentials: view.local_credentials};
    save(); renderRoom(view); startPolling();
  });
}
async function joinRoom() {
  await action('Joining the room…', async () => {
    const code = $('room-code').value.trim();
    if (!code) throw new Error('Enter a room code to join.');
    const view = await api('room/join', {room: code});
    roomSession = {room: view.room, seat: view.seat, credential: view.credential};
    save(); renderRoom(view); startPolling();
  });
}
function renderRoom(view) {
  roomView = view;
  if (mode !== 'head-to-head') return;
  $('room-lobby').hidden = true; $('room-panel').hidden = false;
  $('room-title').textContent = view.room;
  const seats = view.seats || [];
  $('room-summary').innerHTML = '<div class="room-seats">' + seats.map((seat, index) => `<div class="room-seat ${index === roomSession.seat ? 'mine' : ''}"><strong>Player ${index + 1}${index === roomSession.seat ? ' · You' : ''}</strong><span>${seat.joined ? `${esc(seat.count || 0)}/15 players · ${seat.ready ? 'Ready' : seat.count === 15 ? 'Choose your XI' : 'Drafting'}` : 'Waiting for a human player'}</span></div>`).join('') + '</div>';
  const mine = seats[roomSession.seat];
  if (mine?.joined) render({...mine, complete: mine.count === 15, era: view.era, mode: 'head-to-head'}, true);
  else clearDraft();
  $('room-switch').hidden = !roomSession.local_credentials;
  $('room-ready').hidden = !mine || mine.count !== 15 || view.phase === 'finished';
  $('room-ready').textContent = mine?.ready ? 'WAITING FOR OTHER PLAYER' : 'READY TO PLAY';
  $('room-rematch').hidden = view.phase !== 'finished';
  $('room-rematch').textContent = view.rematch_votes?.[roomSession.seat] ? 'REMATCH REQUESTED' : 'REQUEST REMATCH';
  $('room-copy').hidden = !!roomSession.local_credentials;
  $('room-start').hidden = view.phase !== 'waiting' || roomSession.seat !== 0;
  $('room-status').textContent = view.phase === 'waiting' ? roomSession.seat === 0 ? 'Share the room code. When both human seats are filled, start both drafts.' : 'Waiting for the host to start both drafts.' : view.phase === 'drafting' ? view.turn === null ? 'Both players can spin now. Opponent players are revealed when both drafts finish. At the deadline, the server awards any remaining three-player spins and validates the match.' : `Player ${view.turn + 1} has the next spin. ${view.turn === roomSession.seat ? 'Your turn.' : 'Pass the device to the other player.'}` : view.phase === 'finished' ? 'Match validated by the server. Both players must request a rematch to start again.' : 'Both squads are drafted. Pick your eleven, then confirm readiness.';
  renderRoomClock();
  if (view.result) { $('room-result').innerHTML = view.result_html || `<h2>HEAD TO HEAD RESULT</h2><div class="score">${esc(view.result.home_goals ?? '?')} : ${esc(view.result.away_goals ?? '?')}</div>`; $('room-result').hidden = false; result = view.result; }
  else $('room-result').hidden = true;
  updateButtons();
}
function renderRoomClock() {
  const deadline = roomView?.deadline;
  $('room-clock').hidden = !deadline || !['drafting', 'ready'].includes(roomView?.phase);
  if (!$('room-clock').hidden) $('room-clock').textContent = `Draft clock: ${Math.max(0, Math.ceil(deadline - Date.now() / 1000))} seconds remaining. Timeout completes outstanding spins automatically.`;
}
async function refreshRoom() {
  if (!roomSession) throw new Error('Create or join a room first.');
  renderRoom(await api('room/state', roomPayload()));
}
function startPolling() {
  clearInterval(pollTimer);
  if (!roomSession || roomSession.local_credentials) return;
  pollTimer = setInterval(async () => {
    if (busy || page !== 'play' || mode !== 'head-to-head' || document.hidden) return;
    try { const view = await api('room/state', roomPayload()); if (view.revision !== roomView?.revision || !roomView) renderRoom(view); }
    catch (error) { $('room-status').textContent = error.message + ' Polling will retry.'; }
  }, 1500);
}
function requestHandover(seat) {
  if (!roomSession?.local_credentials || ![0, 1].includes(seat)) return;
  pendingHandover = seat;
  $('handover-title').textContent = `Pass to Player ${seat + 1}.`;
  $('handover-note').textContent = 'The next player can choose their lineup and take their own spins. Confirm when the device is in their hands.';
  if (!$('handover').open) $('handover').showModal();
}
async function roomAction(path) {
  await action(path === 'ready' ? 'Confirming your lineup…' : 'Requesting a rematch…', async () => {
    const view = await api('room/' + path, roomPayload());
    renderRoom(view); await refreshProfile();
    if (roomSession.local_credentials && path === 'ready' && view.phase !== 'finished') requestHandover(1 - roomSession.seat);
  });
}
async function copyText(text, fallbackId = 'share-text') {
  try { await navigator.clipboard.writeText(text); $('status').textContent = 'Copied. Your profile and room credentials are excluded.'; }
  catch { $(fallbackId).value = text; $('share-label').hidden = false; $(fallbackId).focus(); $(fallbackId).select(); $('status').textContent = 'Copy the selected text to share it.'; }
}
function download(payload, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readFile(id) {
  const file = $(id).files[0];
  if (!file) throw new Error('Choose an Era Eleven JSON file first.');
  if (file.size > 2 * 1024 * 1024) throw new Error('The file exceeds the 2 MB saved-run limit.');
  try { return JSON.parse(await file.text()); } catch { throw new Error('This file is not valid JSON. Choose the exported Era Eleven file.'); }
}
async function startMini(kind) {
  await action('Preparing your mini game…', async () => { mini = await api('mini/start', {kind, seed: randomSeed()}); renderMini(mini); });
}
async function openCareer() {
  setPage('career');
  renderCareerList();
  if (careerToken) await action('Loading your football career…', async () => renderCareer(await api('league/state', {career_token: careerToken})));
}
function renderCareerList() {
  $('career-list').replaceChildren(...savedCareers.map(entry => {
    const button = document.createElement('button'); button.className = 'button outline'; button.textContent = `Resume ${entry.name}`;
    button.addEventListener('click', () => action('Resuming your career…', async () => { careerToken = entry.token; renderCareer(await api('league/state', {career_token: careerToken})); save(); })); return button;
  }));
}
function careerOptionGroup(title, options, path) {
  if (!options?.length) return null;
  const group = document.createElement('div'); group.className = 'career-action-group';
  const caption = document.createElement('p'); caption.textContent = title; group.append(caption);
  const controls = document.createElement('div');
  options.forEach(option => {
    const button = document.createElement('button'); button.className = 'button outline'; button.dataset.mutation = '';
    button.textContent = `${option.label || label(option.value)}${option.cost ? ` · ${option.cost} credits` : ''}`;
    button.dataset.disabledByRule = option.enabled === false ? 'true' : '';
    button.disabled = busy || option.enabled === false;
    button.addEventListener('click', () => action('Resolving your career decision…', async () => {
      renderCareer(await api('league/' + path, {career_token: careerToken, choice: option.value, action_id: crypto.randomUUID()}));
      if (career.phase === 'office' || career.complete) await refreshProfile();
    }));
    controls.append(button);
  }); group.append(controls); return group;
}
function renderCareer(response) {
  career = response.state || response;
  careerToken = career.career_token || careerToken;
  if (careerToken && !savedCareers.some(entry => entry.token === careerToken)) savedCareers.push({token: careerToken, name: career.name});
  save(); renderCareerList(); $('career-state').hidden = false;
  $('career-player').textContent = `${career.name} · ${career.position}`;
  const metrics = {Level: `${career.level} / 20`, XP: career.xp, Credits: career.credits, Legs: career.legs, Control: career.control, Momentum: career.momentum};
  $('career-meters').innerHTML = Object.entries(metrics).map(([name, value]) => `<div class="stat-tile"><strong>${esc(value ?? 0)}</strong><span>${esc(name)}</span></div>`).join('');
  $('career-skills').innerHTML = Object.entries(career.skills || {}).map(([name, value]) => `<div class="analytic-row"><span>${esc(label(name))}</span><span>${esc(value)}</span></div>`).join('');
  const opponent = career.opponent?.name || career.opponent || career.fixture?.opponent || 'Your next opponent';
  $('career-match').innerHTML = `<h2 class="display-heading">${esc(career.phase === 'match' ? opponent : career.complete ? 'Career complete' : 'Club office')}</h2><p class="note">Season ${esc(career.season)} · Round ${esc(career.round)}${career.phase === 'match' ? ` · Stretch ${esc(career.stretch)} of 4` : ''}</p>${career.adaptation ? `<p class="note">${esc(career.adaptation)}</p>` : ''}${career.basis ? `<p class="note">${esc(typeof career.basis === 'string' ? career.basis : Object.values(career.basis).filter(value => typeof value !== 'object').join(' · '))}</p>` : ''}`;
  if (career.result) {
    const match = career.result;
    $('career-match').insertAdjacentHTML('beforeend', match.html || `<div class="career-roll">Last match: ${esc(match.home_goals ?? match.goals_for ?? '?')} : ${esc(match.away_goals ?? match.goals_against ?? '?')} · ${esc(match.outcome || '')}</div>`);
  }
  $('career-actions').replaceChildren();
  if (career.phase === 'match') {
    const actions = careerOptionGroup('Choose your action. The server rolls the die.', career.choices, 'action');
    if (actions) $('career-actions').append(actions);
  } else if (!career.complete && career.phase === 'office') {
    const next = document.createElement('button'); next.className = 'button gold'; next.dataset.mutation = ''; next.textContent = 'Play next career fixture →';
    next.addEventListener('click', () => action('Entering the next career fixture…', async () => renderCareer(await api('league/next', {career_token: careerToken}))));
    $('career-actions').append(next);
  }
  $('career-development').replaceChildren(...[careerOptionGroup('Train a skill', career.train_options, 'train'), careerOptionGroup('Buy equipment and recovery', career.buy_options, 'buy'), careerOptionGroup('Club conversations and playbook', career.talk_options, 'talk')].filter(Boolean));
  const inventory = Array.isArray(career.inventory) ? career.inventory : Object.keys(career.inventory || {});
  const habits = Array.isArray(career.habits) ? career.habits : Object.entries(career.habits || {}).map(([key, value]) => `${label(key)} ${value}`);
  $('career-inventory').innerHTML = [...inventory, ...habits].map(item => `<span class="career-inventory-item">${esc(typeof item === 'string' ? label(item) : item.name || item.id)}</span>`).join('');
  $('career-standings').innerHTML = table(career.standings || [], ['name', 'team', 'played', 'wins', 'draws', 'losses', 'points', 'goal_difference']);
  $('career-log').innerHTML = (career.log || []).slice().reverse().map(entry => `<div class="fixture-row"><span>${esc(typeof entry === 'string' ? entry : entry.text || entry.message || entry.description || Object.entries(entry).filter(([, value]) => typeof value !== 'object').map(([key, value]) => `${label(key)}: ${value}`).join(' · '))}</span></div>`).join('');
  updateButtons();
}
function renderMini(response) {
  mini = response;
  $('mini-game').hidden = false;
  $('mini-game').innerHTML = `<div class="mini-round"><p class="eyebrow">${esc(label(response.kind))} / ROUND ${esc(response.round)} OF ${esc(response.total)}</p><p class="mini-question">${esc(response.complete ? 'Challenge complete.' : response.question)}</p>${response.card_html ? `<div class="ee">${response.card_html}</div>` : ''}${response.explanation ? `<p class="mini-feedback">${response.correct === undefined ? '' : response.correct ? 'Correct. ' : 'Try the next one. '}${esc(response.explanation)}</p>` : ''}<p class="note">Score: ${esc(response.score)}${response.complete ? ' · Saved to your profile.' : ''}</p><div class="mini-choices">${response.complete ? `<button class="button gold" data-mini-replay="${esc(response.kind)}">Play again</button>` : (response.choices || []).map(choice => `<button class="button outline" data-mutation data-mini-answer="${esc(choice.value)}">${esc(choice.label)}</button>`).join('')}</div></div>`;
  $('mini-game').querySelectorAll('[data-mini-answer]').forEach(button => button.addEventListener('click', () => action('Checking your answer…', async () => { renderMini(await api('mini/answer', {mini_token: mini.mini_token, answer: button.dataset.miniAnswer, action_id: crypto.randomUUID()})); if (mini.complete) await refreshProfile(); })));
  $('mini-game').querySelector('[data-mini-replay]')?.addEventListener('click', () => startMini(response.kind));
}
function renderMeta() {
  const eras = meta.eras || Object.keys(hints);
  $('pool-size').textContent = `${meta.players || '?'} published player cards`;
  const version = typeof meta.version === 'object' ? meta.version.rules || meta.version.engine || 'versioned rules' : meta.version || meta.rules_version || 'Shared engine';
  $('version-label').textContent = String(version).toUpperCase();
  $('settings-version').textContent = `Rules and data versions: ${typeof meta.version === 'object' ? Object.entries(meta.version).map(([key, value]) => `${label(key)} ${value}`).join(' · ') : version}. Notebook and browser use this engine.`;
  $('eras').replaceChildren(...eras.filter(name => name !== 'Randomize Era').map(entry => {
    const name = typeof entry === 'string' ? entry : entry.name;
    const button = document.createElement('button'); button.className = 'era-btn'; button.dataset.era = name;
    button.innerHTML = `${esc(name.toUpperCase())}<small>${esc(hints[name] || 'FOOTBALL GENERATION')}</small>`;
    const eligibility = meta.era_eligibility?.[name] || meta.eligibility?.[name];
    if (eligibility?.eligible === false || entry.eligible === false) { button.disabled = true; button.dataset.ineligible = 'true'; button.title = eligibility?.reason || entry.reason || 'This era cannot supply a valid squad.'; }
    button.addEventListener('click', () => { if (busy) return; selectEra(name); }); return button;
  }));
  const rules = meta.rules || meta.mode_rules || {};
  const ruleText = Object.entries(rules).filter(([, value]) => value).map(([key, value]) => `<div class="challenge-description"><h3>${esc(modeNames[key] || label(key))}</h3><p>${esc(typeof value === 'string' ? value : value.description || value.label || value.rules || '')}</p></div>`).join('');
  $('help-modes').innerHTML = ruleText;
  $('challenge-info').innerHTML = ruleText || ['weekly', 'gauntlet', 'league'].map(key => `<div class="challenge-description"><h3>${esc(modeNames[key])}</h3><p>${esc(modeNotes[key])}</p></div>`).join('');
  const weekly = meta.weekly || meta.weekly_challenge;
  if (weekly) $('challenge-info').insertAdjacentHTML('afterbegin', `<div class="challenge-description"><h3>This week's conditions</h3><p>${esc(weekly.week || weekly.id || '')} · ${esc(weekly.era || '')} · Seed ${esc(weekly.seed ?? '')}${weekly.description ? ' · ' + esc(weekly.description) : ''}</p></div>`);
  const kinds = meta.mini_games || [{kind: 'higher_lower', name: 'Higher or Lower'}, {kind: 'guess_era', name: 'Name the Era'}, {kind: 'penalties', name: 'Penalty Shootout'}];
  $('mini-modes').replaceChildren(...kinds.map(entry => { const kind = typeof entry === 'string' ? entry : entry.kind || entry.id; const button = document.createElement('button'); button.className = 'button outline'; button.dataset.mutation = ''; button.textContent = entry.name || label(kind); button.addEventListener('click', () => startMini(kind)); return button; }));
  selectEra(era);
}

document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => setPage(button.dataset.page)));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { if (button.dataset.career) { openCareer(); return; } setMode(button.dataset.mode); save(); if (mode === 'head-to-head' && roomSession) action('Reconnecting to your room…', async () => { await refreshRoom(); startPolling(); }); }));
document.querySelectorAll('[data-start-mode]').forEach(button => button.addEventListener('click', async () => { if (button.dataset.startMode === 'league') { await openCareer(); return; } setPage('play'); setMode(button.dataset.startMode); await newGame(); }));
$('career-back').addEventListener('click', () => setPage('play'));
$('career-create').addEventListener('submit', event => { event.preventDefault(); action('Starting your football career…', async () => { renderCareer(await api('league/create', {name: $('career-name').value.trim(), position: $('career-position').value, era: era === 'Randomize Era' ? 'All eras' : era, seed: seedValue('career-seed'), habit: 'teamwork', playbook: 'possession'})); $('status').textContent = 'Career saved. Train or enter your first fixture.'; }); });
$('new-game').addEventListener('click', newGame);
$('random-seed').addEventListener('click', () => { $('draft-seed').value = randomSeed(); });
$('random-era').addEventListener('click', () => { selectEra('Randomize Era'); if (mode !== 'head-to-head') newGame(); });
$('spin').addEventListener('click', spin); $('swap').addEventListener('click', swap); $('play').addEventListener('click', playMatch); $('advance').addEventListener('click', advance);
$('respin').addEventListener('click', () => action('Using your one practice draft retry…', async () => { render(await api('respin')); $('match-result').hidden = true; $('status').textContent = 'One new practice draft used. All player awards still require five three-player spins.'; }));
$('formation-choice').addEventListener('change', () => action('Checking the manager formation…', async () => { render(await api('formation', {formation: $('formation-choice').value})); result = null; $('match-result').hidden = true; }));
for (const id of ['chemistry', 'tactics']) $(id).addEventListener('input', () => { $(id + '-value').textContent = $(id).value; });
$('series').addEventListener('click', () => action('Sampling 2,000 matches with the same teams…', async () => { const response = await api('series', {seed: seedValue('match-seed'), n: 2000}); $('match-result').innerHTML = '<h2>2,000 MATCHES</h2>' + Object.entries(response.probabilities).map(([key, probability]) => `<div class="metric"><span>${esc(key.toUpperCase())}</span><b>${(probability * 100).toFixed(1)}%</b></div><div class="bar"><i style="width:${Number(probability) * 100}%"></i></div>`).join('') + '<p class="small muted">Same teams and model. These frequencies measure sampling variation, not model uncertainty. Inspect sensitivity in the notebook.</p>'; $('match-result').hidden = false; }));
$('season').addEventListener('click', () => action('Running the season experiment…', async () => { const response = await api('season', {seed: seedValue('match-seed')}); $('match-result').innerHTML = `<h2>38-MATCH EXPERIMENT</h2><div class="score">${esc(response.wins)}–${esc(response.draws)}–${esc(response.losses)}</div><div class="metric"><span>Points</span><b>${esc(response.points)}</b></div><p class="small muted">${esc(response.label)}</p><p class="small muted">This generated-opponent experiment is separate from Era Gauntlet and The League.</p>`; $('match-result').hidden = false; }));
$('export').addEventListener('click', () => action('Preparing your saved run…', async () => { const payload = await api('export'); download(payload, `Era Eleven ${payload.era || game.era} seed ${payload.seed ?? game.seed}.json`); }));
$('share').addEventListener('click', () => action('Preparing share text…', async () => { const score = result ? `${result.home_goals ?? result.goals_for ?? '?'}:${result.away_goals ?? result.goals_against ?? '?'}` : 'Squad drafted'; const text = `Era Eleven · ${modeNames[mode]} · ${game.era} · seed ${game.seed}\n${game.manager.name} · ${game.formation} · ${score}\n${game.progress?.score !== undefined ? `Competition score: ${game.progress.score}\n` : ''}Simulated match, published game attributes. Rules ${typeof meta.version === 'string' ? meta.version : meta.rules_version || 'versioned'}.\nhttps://github.com/symonyeal/Football-Era-Lab`; await copyText(text); }));
$('room-local').addEventListener('click', () => createRoom(true)); $('room-create').addEventListener('click', () => createRoom(false)); $('room-join').addEventListener('click', joinRoom);
$('room-code').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); joinRoom(); } });
$('room-ready').addEventListener('click', () => roomAction('ready')); $('room-rematch').addEventListener('click', () => roomAction('rematch'));
$('room-start').addEventListener('click', () => action('Starting both human drafts…', async () => renderRoom(await api('room/start', roomPayload()))));
$('room-refresh').addEventListener('click', () => action('Reconnecting to your room…', refreshRoom));
$('room-switch').addEventListener('click', () => requestHandover(1 - roomSession.seat));
$('handover-confirm').addEventListener('click', () => { $('handover').close(); action('Switching player…', async () => { roomSession.seat = pendingHandover; roomSession.credential = roomCredential(); save(); await refreshRoom(); }); });
$('room-copy').addEventListener('click', () => action('Preparing room invitation…', () => copyText(`Era Eleven Head to Head\nJoin room ${roomSession.room}\n${location.origin}/?room=${encodeURIComponent(roomSession.room)}\nThe invitation works on devices that can reach this server.`)));
$('room-leave').addEventListener('click', () => { clearInterval(pollTimer); roomSession = null; roomView = null; save(); setMode('head-to-head'); $('status').textContent = 'Room access cleared from this browser. You can start or join another room.'; });
$('refresh-profile').addEventListener('click', () => action('Refreshing your clubhouse…', refreshProfile));
$('collection-search').addEventListener('input', renderCollection);
$('leaderboard-mode').addEventListener('change', () => action('Loading competition rankings…', async () => renderLeaderboard(await api('leaderboard', {mode: $('leaderboard-mode').value || undefined}))));
$('preferences').addEventListener('submit', event => { event.preventDefault(); action('Saving preferences…', async () => { const settings = {era_fx: $('era-fx').checked, reduce_motion: $('reduce-motion').checked, sound: $('sound').checked, theme: $('theme').value, speed: $('speed').value}; const response = await api('settings', {settings, display_name: $('display-name').value.trim()}); profileData = response; preferences = {...preferences, ...settings, ...(response.settings || {})}; applyPreferences(); save(); $('status').textContent = 'Settings saved to your profile.'; }); });
$('import-run').addEventListener('click', () => action('Validating and replaying your saved run…', async () => { const payload = await readFile('import-file'); const response = await api('import', {payload}); roomView = null; render(response.state || response); setPage('play'); setMode(game.mode || 'solo'); selectEra(game.requested_era || game.era); $('draft-seed').value = game.seed; $('status').textContent = 'Run replayed and validated by the shared engine.'; }));
$('profile-export').addEventListener('click', () => { download({format: 'era-eleven-profile-access-v1', origin: location.origin, profile, preferences}, 'Era Eleven private profile access.json'); });
$('profile-import').addEventListener('click', () => action('Restoring profile access…', async () => { const payload = await readFile('profile-file'); if (payload.format !== 'era-eleven-profile-access-v1' || typeof payload.profile !== 'string') throw new Error('Choose an Era Eleven profile access backup.'); if (payload.origin !== location.origin) throw new Error('This backup belongs to another server address. Open that server to restore it.'); const previous = profile; try { const response = await api('profile', {profile: payload.profile}); profile = payload.profile; profileData = response; preferences = {...preferences, ...(response.settings || {})}; save(); applyPreferences(); renderProfile(); $('status').textContent = 'Profile access restored.'; } catch (error) { profile = previous; throw error; } }));
$('help-btn').addEventListener('click', () => $('help').showModal()); $('close-help').addEventListener('click', () => $('help').close()); $('help-done').addEventListener('click', () => $('help').close());
window.addEventListener('online', () => { if (roomSession) action('Reconnecting to your room…', refreshRoom); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && roomSession && mode === 'head-to-head') action('Refreshing your room…', refreshRoom); });
setInterval(renderRoomClock, 1000);
(async () => {
  const saved = loadSaved(); profile = saved.profile || null; token = saved.token || null; era = saved.era || era; mode = saved.mode || mode; roomSession = saved.room || null; preferences = {...preferences, ...(saved.preferences || {})}; careerToken = saved.careerToken || null; savedCareers = saved.savedCareers || []; applyPreferences();
  await action('Loading Era Eleven…', async () => {
    meta = await api('meta', {}, 'GET'); renderMeta(); await refreshProfile(); setMode(mode);
    if (roomSession && mode === 'head-to-head') { await refreshRoom(); startPolling(); $('status').textContent = 'Your Head to Head room has reconnected.'; }
    else if (token) {
      try { const restored = await api('state'); render(restored); setMode(restored.mode || 'solo'); selectEra(restored.requested_era || restored.era); $('draft-seed').value = restored.seed; $('status').textContent = 'Your saved draft has been restored.'; }
      catch (error) { token = null; game = null; save(); $('status').textContent = `Saved draft could not be resumed: ${error.message} Start a new draft.`; }
    }
    const invited = new URLSearchParams(location.search).get('room');
    if (invited && !roomSession) { setMode('head-to-head'); $('room-code').value = invited; $('status').textContent = 'Room invitation loaded. Join when you are ready.'; }
  });
})();
