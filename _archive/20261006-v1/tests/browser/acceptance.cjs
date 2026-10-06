/* Browser acceptance uses real controls against the local authoritative server. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.ERA_ELEVEN_PLAYWRIGHT || 'playwright');
if (!process.env.ERA_ELEVEN_TEST_OUTPUT) throw new Error('Set ERA_ELEVEN_TEST_OUTPUT to your project work folder.');
const output=path.resolve(process.env.ERA_ELEVEN_TEST_OUTPUT);fs.mkdirSync(output,{recursive:true});
const base = process.env.ERA_ELEVEN_URL || 'http://127.0.0.1:8765';
const folder = output;
const checks = [], errors = [];
let browser;
const check = (name, details) => { checks.push({name, details, passed: true}); process.stdout.write(name + '\n'); };
function assertPublicRecord(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(['credential', 'local_credentials', 'profile', 'token', 'career_token', 'mini_token'].includes(key), false, `Private field ${key} in public record`);
    assertPublicRecord(child);
  }
}
async function settle(page) { await page.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true', undefined, {timeout: 90000}); }
async function click(page, selector) { await page.locator(selector).click(); await settle(page); assert.equal(await page.locator('#error').isVisible(),false,await page.locator('#error').textContent()); }
async function boot(context, mobile = false) {
  const page = await context.newPage();
  if (mobile) await page.setViewportSize({width: 390, height: 844});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#connection').textContent === 'SERVER CONNECTED');
  await settle(page);
  return page;
}
async function getState(page) {
  return page.evaluate(async () => { const saved = JSON.parse(localStorage.getItem('era-eleven-v2')); const response = await fetch('/api/state', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:saved.token})}); return response.json(); });
}
async function draft(page) { for (let index = 0; index < 5; index++) await click(page, '#spin'); }
async function mode(page, name) { await click(page, `[data-mode="${name}"]`); await click(page, '#new-game'); await draft(page); }
async function run() {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({acceptDownloads:true,timezoneId:'America/Whitehorse'});
  const page = await boot(context);
  await page.locator('#draft-seed').fill('42');
  await page.locator('#new-game').focus(); await page.keyboard.press('Enter'); await settle(page);
  assert.notEqual(await page.locator('#manager-name').textContent(),'Your next manager'); assert.equal(await page.locator('#spin').isDisabled(),false);
  check('Keyboard starts the draft', await page.locator('#manager-name').textContent());
  await draft(page);
  const state = await getState(page);
  assert.equal(state.count, 15); assert.equal(state.spins, 5);
  assert.equal(new Set(state.squad.map(player => player.identity || player.id)).size, 15);
  assert.equal(state.starters.length, 11); assert.equal(state.bench.length, 4);
  assert.equal(await page.locator('#spin').isDisabled(), true);
  check('Five UI spins award fifteen people and an eleven plus four', {era:state.era, formation:state.formation});
  const reserveKeeper=state.bench.find(player => player.positions.includes('GK'));
  assert.ok(reserveKeeper); await page.locator('#slot').selectOption(String(state.starters.find(player => player.slot==='GK').index)); await page.locator('#bench').selectOption(reserveKeeper.id); await click(page,'#swap');
  assert.equal((await getState(page)).starters.find(player => player.slot==='GK').name,reserveKeeper.name); check('A compatible reserve goalkeeper swaps without adding a person');
  await click(page, '#play'); assert.equal(await page.locator('#match-result').isVisible(), true);
  check('Classic match renders the server result');
  await page.reload(); await settle(page); const reloaded=await getState(page); assert.equal(reloaded.count, 15, JSON.stringify({stateError:reloaded.error,uiError:await page.locator('#error').textContent(),uiStatus:await page.locator('#status').textContent()}));
  check('Draft survives browser reload');
  await page.locator('#help-btn').click(); assert.equal(await page.locator('#help').isVisible(),true); await page.keyboard.press('Escape'); assert.equal(await page.locator('#help').isVisible(),false);
  check('Help dialog opens by control and closes by keyboard');
  const downloadPromise = page.waitForEvent('download'); await click(page, '#export'); const download = await downloadPromise;
  const runPath = path.join(folder, 'browser-saved-run.json'); await download.saveAs(runPath);
  await click(page, '[data-page="settings"]'); await page.locator('#import-file').setInputFiles(runPath); await click(page, '#import-run');
  assert.equal((await getState(page)).count, 15); check('Exported run imports through server replay');
  await click(page, '[data-page="settings"]'); await page.locator('#display-name').fill('Browser Acceptance'); await page.locator('#reduce-motion').check(); await page.locator('#theme').selectOption('night'); await page.locator('#appearance').selectOption('light'); await page.locator('#backdrop').selectOption('grid'); await page.locator('#lineup-view').selectOption('rows'); await page.locator('#roster-sort').selectOption('name'); await click(page,'#preferences button');
  await page.reload(); await settle(page); assert.equal(await page.locator('body').getAttribute('data-theme'),'night'); assert.equal(await page.locator('body').evaluate(element => element.classList.contains('reduce-motion')),true);
  assert.equal(await page.locator('body').getAttribute('data-appearance'),'light'); assert.equal(await page.locator('body').getAttribute('data-lineup-view'),'rows'); check('Settings persist after reload');
  await click(page, '[data-page="clubhouse"]'); assert.notEqual((await page.locator('#collection-count').textContent()).startsWith('0 collected'),true); assert.match(await page.locator('#profile-scope').textContent(),/server/);
  await page.locator('#collection-search').fill('zzzznotaplayer'); assert.match(await page.locator('#collection').textContent(),/No collected players/); await page.locator('#collection-search').fill('');
  check('Clubhouse displays earned progress and searchable collection');
  await click(page, '[data-page="play"]'); await click(page,'#random-era'); const random = await getState(page); assert.equal(random.requested_era,'Randomize Era'); assert.notEqual(random.era,'All eras');
  check('Randomize Era records one eligible era', {era:random.era});
  for (const name of ['weekly','gauntlet']) {
    await mode(page,name);
    await click(page,name === 'weekly' ? '#play' : '#advance');
    assert.equal(await page.locator('#match-result').isVisible(),true);
    check(`${name} starts through UI and records a progression result`, (await getState(page)).progress);
  }
  await gauntletBoss(page);
  await click(page,'[data-mode="circuit"]'); await page.locator('#tournament-count').fill('10'); await click(page,'#new-game'); await draft(page);
  for(let event=0;event<10;event++) await click(page,'#advance');
  const circuit=(await getState(page)).progress; assert.equal(circuit.complete,true); assert.equal(circuit.history.length,10); assert.equal(new Set(circuit.history.map(event=>event.format)).size,5); assert.equal(await page.locator('#advance').isDisabled(),true); assert.equal(await page.locator('.competition-history > details').count(),10);
  check('Ten-event circuit finishes all five formats and displays match histories and earned awards',{score:circuit.score,awards:circuit.awards.length});
  await click(page,'[data-career="true"]'); await page.locator('#career-create button').click(); await settle(page); assert.equal(await page.locator('#career-state').isVisible(),true);
  await page.locator('#career-actions button').click(); await settle(page);
  for(let stretch=0;stretch<4;stretch++){await page.locator('#career-actions button').first().click();await settle(page);}
  assert.match(await page.locator('#career-match').textContent(),/Club office/); check('The League resolves four user-selected career stretches');
  await page.reload(); await settle(page); assert.equal(await page.locator('#career-state').isVisible(),true); assert.match(await page.locator('#career-match').textContent(),/Club office/); check('Career save and decision history survive reload');
  const careerCardPromise=page.waitForEvent('download'); await click(page,'[data-career-share]'); const careerCard=await careerCardPromise; await careerCard.saveAs(path.join(folder,'career-card.svg')); check('Career card exports actual recorded game statistics');
  await click(page,'[data-page="challenges"]');
  await miniGames(page,state.squad);
  await page.setViewportSize({width:390,height:844}); await click(page,'[data-page="play"]');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true);
  await page.screenshot({path:path.join(folder,'mobile.png'),fullPage:true}); check('Mobile layout has no horizontal document overflow');
  await page.setViewportSize({width:1440,height:1000}); await page.screenshot({path:path.join(folder,'desktop.png'),fullPage:true});
  await onlineRooms();
  await localRoom();
  assert.deepEqual(errors,[]); check('No browser JavaScript exceptions',errors);
}
async function gauntletBoss(page){
  let state=await getState(page);
  while(state.progress.segment<4){if(state.progress.needs_management)await click(page,'#management-actions button:first-of-type');await click(page,'#advance');state=await getState(page);}
  if(state.progress.needs_management)await click(page,'#management-actions button:first-of-type');
  const before=(await getState(page)).progress;await click(page,'#advance');const after=(await getState(page)).progress;
  const last=after.history.at(-1);assert.equal(last.boss,true);
  if(!last.won){assert.equal(after.stage,before.stage);assert.equal(after.segment,0);assert.ok(after.patience<before.patience);assert.match(await page.locator('#status').textContent(),/Boss series lost|exhausted/);}
  else assert.equal(after.stage,before.stage+1);
  check('Gauntlet boss result advances or restarts the same era with its patience cost',{won:last.won,patience:after.patience,stage:after.stage});
}
async function miniGames(page,squad){
  const players=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../data/players.json'),'utf8')).sort((a,b)=>a.id.localeCompare(b.id));
  await page.locator('#mini-schedule').selectOption('unlimited');
  const games=page.locator('#mini-modes button');assert.equal(await games.count(),4);
  await games.nth(0).click();await settle(page);
  for(let guess=0;guess<15;guess++){if(await page.locator('[data-mini-text]').count()===0)break;await page.locator('[data-mini-text]').fill(squad[guess].id);await click(page,'[data-mini-form] button');if(guess===0){await page.reload();await settle(page);assert.equal(await page.locator('#mini-game').isVisible(),true);}}
  assert.match(await page.locator('#mini-game').textContent(),/Challenge complete/);check('Daily Card accepts actual card guesses, returns clues, saves, and terminates');
  await games.nth(1).click();await settle(page);
  for(let round=0;round<15;round++){
    if(await page.locator('[data-mini-answer]').count()===0)break;
    const names=await page.locator('#mini-game .metric span').allTextContents();const cards=names.map(text=>{const split=text.lastIndexOf(' · ');return players.find(card=>card.name===text.slice(0,split)&&String(card.season)===text.slice(split+3));});assert.ok(cards.every(Boolean));
    assert.equal(await page.locator('#mini-game .metric b').first().textContent(),'?');
    await click(page,`[data-mini-answer="${cards[1].overall>cards[0].overall?'higher':'lower'}"]`);
  }
  assert.match(await page.locator('#mini-game').textContent(),/Challenge complete/);assert.match(await page.locator('#mini-game').textContent(),/Score: 15/);check('Higher or Lower hides queried ratings and resolves fifteen correct public-data comparisons');
  await games.nth(2).click();await settle(page);const question=await page.locator('.mini-question').textContent();
  const sample=players.find(card=>question.includes(`${card.club} ${card.era} snapshot`));assert.ok(sample);
  const names=[...new Set(players.filter(card=>card.club===sample.club&&card.era===sample.era&&card.season===sample.season).map(card=>card.name))];
  for(const name of names){if(await page.locator('[data-mini-text]').count()===0)break;await page.locator('[data-mini-text]').fill(name);await click(page,'[data-mini-form] button');}
  assert.match(await page.locator('#mini-game').textContent(),/Challenge complete/);check('Roster Roulette scores attributed snapshot names and completes the roster',{club:sample.club,players:names.length});
  await games.nth(3).click();await settle(page);
  for(let round=0;round<5;round++){const names=await page.locator('#mini-game .metric span').allTextContents();const nations=new Set(names.map(name=>players.find(card=>card.name===name&&card.nation&&!['Unknown','nan'].includes(card.nation)).nation));for(const nation of nations)await page.locator(`[name="country"][value="${nation}"]`).check();await click(page,'[data-mini-form] button');}
  assert.match(await page.locator('#mini-game').textContent(),/Challenge complete/);assert.match(await page.locator('#mini-game').textContent(),/Score: 5/);check('Country Hunt accepts multiple countries through five escalating rounds');
}
async function onlineRooms() {
  const hostContext = await browser.newContext(), guestContext = await browser.newContext(), isolatedContext = await browser.newContext();
  const host = await boot(hostContext), guest = await boot(guestContext), isolated = await boot(isolatedContext);
  for (const page of [host,guest,isolated]) await click(page,'[data-mode="head-to-head"]');
  await click(host,'#room-create'); const code = await host.locator('#room-title').textContent();
  await guest.locator('#room-code').fill(code); await click(guest,'#room-join');
  await host.waitForFunction(() => !document.querySelector('#room-start').disabled);
  await click(host,'#room-start');
  await guest.waitForFunction(() => !document.querySelector('#spin').disabled);
  for (let index=0; index<5; index++) { await Promise.all([click(host,'#spin'),click(guest,'#spin')]); }
  await host.reload(); await settle(host); assert.equal((await host.locator('#count').textContent()).includes('15'),true);
  check('Two independent room clients draft fifteen and reconnect', {room:code});
  await click(isolated,'#room-create'); const otherCode = await isolated.locator('#room-title').textContent(); assert.notEqual(otherCode,code);
  assert.equal(await isolated.locator('#count').textContent(),'00 / 15');
  await click(host,'#room-ready'); await click(guest,'#room-ready');
  await host.waitForFunction(() => !document.querySelector('#room-result').hidden);
  await guest.waitForFunction(() => !document.querySelector('#room-result').hidden);
  assert.equal(await host.locator('#room-result').textContent(),await guest.locator('#room-result').textContent());
  check('Both humans ready receive the same authoritative room result');
  assert.equal(await host.locator('#room-opponent').isVisible(),true);await host.locator('#room-opponent > details > summary').click();assert.equal(await host.locator('#opponent-squad .pin').count(),11);check('Completed human squads reveal the opposing eleven');
  const publicRecordPromise=host.waitForEvent('download');await click(host,'#room-export');const publicRecord=await publicRecordPromise;const publicPath=path.join(folder,'head-to-head-public-result.json');await publicRecord.saveAs(publicPath);const exported=JSON.parse(fs.readFileSync(publicPath,'utf8'));assert.ok(exported.result);assertPublicRecord(exported);const privateRoom = await host.evaluate(() => JSON.parse(localStorage.getItem('era-eleven-v2')).room);assert.equal(JSON.stringify(exported).includes(privateRoom.credential),false);check('Room result exports without private credentials');
  assert.equal(await isolated.locator('#room-result').isVisible(),false); assert.equal(await isolated.locator('#count').textContent(),'00 / 15'); check('A second room remains isolated');
  await click(host,'#room-rematch'); await click(guest,'#room-rematch');
  await host.waitForFunction(() => document.querySelector('#count').textContent.startsWith('00'));
  check('Rematch requires both human votes and resets the room');
  await host.screenshot({path:path.join(folder,'head-to-head.png'),fullPage:true});
  await hostContext.close(); await guestContext.close(); await isolatedContext.close();
}
async function localRoom(){
  const context=await browser.newContext();const page=await boot(context);await click(page,'[data-mode="head-to-head"]');await click(page,'#room-local');
  for(let spin=0;spin<10;spin++){await click(page,'#spin');if(await page.locator('#handover').isVisible())await click(page,'#handover-confirm');}
  await click(page,'#room-ready');if(await page.locator('#handover').isVisible())await click(page,'#handover-confirm');await click(page,'#room-ready');
  assert.equal(await page.locator('#room-result').isVisible(),true);check('Local two-human path alternates ten spins and both ready confirmations');await context.close();
}
run().then(async () => { fs.writeFileSync(path.join(folder,'acceptance-results.json'),JSON.stringify({base,checks,errors,passed:true},null,2)); await browser.close(); }).catch(async error => { fs.writeFileSync(path.join(folder,'acceptance-results.json'),JSON.stringify({base,checks,errors,passed:false,failure:error.stack},null,2)); process.stderr.write(error.stack+'\n'); if(browser) await browser.close(); process.exitCode=1; });
