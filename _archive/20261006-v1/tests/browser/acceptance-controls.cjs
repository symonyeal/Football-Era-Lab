/* Additional real-browser checks for draft constraints, rejected actions, and clocks. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.ERA_ELEVEN_PLAYWRIGHT || 'playwright');
if (!process.env.ERA_ELEVEN_TEST_OUTPUT) throw new Error('Set ERA_ELEVEN_TEST_OUTPUT to your project work folder.');
const output=path.resolve(process.env.ERA_ELEVEN_TEST_OUTPUT);fs.mkdirSync(output,{recursive:true});
const base = process.env.ERA_ELEVEN_URL || 'http://127.0.0.1:8765';
const checks = [], errors = [];
let browser;
const check = (name, details) => { checks.push({name, details, passed:true}); process.stdout.write(name + '\n'); };
async function settle(page) { await page.waitForFunction(() => document.body.getAttribute('aria-busy') !== 'true', undefined, {timeout:90000}); }
async function click(page, selector, rejected = false) {
  await page.locator(selector).click(); await settle(page);
  assert.equal(await page.locator('#error').isVisible(), rejected, await page.locator('#error').textContent());
}
async function boot(context) {
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, {waitUntil:'domcontentloaded'}); await settle(page);
  assert.equal(await page.locator('#connection').textContent(), 'SERVER CONNECTED'); return page;
}
async function state(page, route = 'state') {
  return page.evaluate(async route => {
    const saved = JSON.parse(localStorage.getItem('era-eleven-v2'));
    const body = route === 'room/state' ? {room:saved.room.room,credential:saved.room.credential} : route === 'mini/state' ? {profile:saved.profile,mini_token:saved.miniToken} : route === 'league/state' ? {profile:saved.profile,career_token:saved.careerToken} : {token:saved.token};
    return (await fetch('/api/' + route, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
  }, route);
}
async function draft(page) { for(let spin=0;spin<5;spin++) await click(page,'#spin'); }
async function width(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),true); }
async function run() {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({acceptDownloads:true,timezoneId:'America/Whitehorse'});
  const page = await boot(context);
  await page.locator('#draft-seed').fill('-1'); await click(page,'#new-game',true);
  assert.match(await page.locator('#error').textContent(),/whole seed/); check('Invalid seed has a visible error and creates no draft');
  await page.locator('#draft-seed').fill('42'); await page.locator('#draft-variant').selectOption('salary-cap'); await click(page,'#new-game'); await draft(page);
  let current = await state(page); assert.equal(current.variant,'salary-cap'); assert.equal(current.count,15);
  const tiers = current.squad.reduce((counts,player) => {counts[player.overall >= 90 ? 'S' : player.overall >= 87 ? 'A' : 'B']++;return counts;},{S:0,A:0,B:0});
  assert.deepEqual(tiers,{S:2,A:4,B:9}); assert.ok(current.salary.spent <= current.salary.cap); assert.equal(await page.locator('#salary-budget').isVisible(),true);
  check('Salary Cap enforces two S, four A, nine B and the visible game-coin budget',{tiers,budget:current.salary});
  const beforeNames = current.starters.map(player=>player.name);
  const keeper = current.starters.find(player=>player.slot==='GK'), forward = current.bench.find(player=>!player.positions.includes('GK'));
  await page.locator('#slot').selectOption(String(keeper.index)); await page.locator('#bench').selectOption(forward.id); await click(page,'#swap',true);
  assert.deepEqual((await state(page)).starters.map(player=>player.name),beforeNames); check('Invalid goalkeeper swap is rejected without changing the lineup');
  if(current.formations.length > 1) {
    const next = current.formations.find(formation=>formation!==current.formation); await page.locator('#formation-choice').selectOption(next); await settle(page);
    current = await state(page); assert.equal(current.formation,next); assert.equal(new Set(current.squad.map(player=>player.identity || player.id)).size,15); check('Manager-compatible formation change retains the fifteen people',next);
  }
  await click(page,'#respin'); current = await state(page); assert.equal(current.count,0); assert.equal(current.respin_used,true); assert.equal(await page.locator('#respin').isVisible(),false); await draft(page);
  check('One complete practice retry resets awards and still requires five spins');
  const downloadPromise=page.waitForEvent('download');await click(page,'#export');const download=await downloadPromise;const recipePath=path.join(output,'controls-replay.json');await download.saveAs(recipePath);
  const recipe=JSON.parse(fs.readFileSync(recipePath,'utf8'));recipe.version='unrecognized-rules';const invalidPath=path.join(output,'rejected-replay.json');fs.writeFileSync(invalidPath,JSON.stringify(recipe,null,2));
  const retainedToken=current.token;await click(page,'[data-page="settings"]');await page.locator('#import-file').setInputFiles(invalidPath);await click(page,'#import-run',true);assert.equal((await state(page)).token,retainedToken);check('Invalid replay is rejected and the current draft remains accessible');
  await page.locator('#reduce-motion').check();await page.locator('#era-fx').uncheck();await page.locator('#screen-fx').uncheck();await page.locator('#appearance').selectOption('dark');await page.locator('#lineup-view').selectOption('pitch');await page.locator('#speed').selectOption('instant');await click(page,'#preferences button');
  await page.setViewportSize({width:390,height:844});await click(page,'[data-page="play"]');await width(page);await page.locator('#lineup-section').screenshot({path:path.join(output,'mobile-lineup.png')});
  await click(page,'[data-career="true"]');await click(page,'#career-create button');await width(page);await page.locator('#career-development button:not(:disabled)').first().click();await settle(page);assert.equal(await page.locator('#error').isVisible(),false);check('Career office controls resolve a server-priced decision');
  await page.setViewportSize({width:390,height:844});await width(page);await page.screenshot({path:path.join(output,'mobile-career.png'),fullPage:true});check('Mobile career page and scrollable standings stay within the viewport');
  const careerBefore=await state(page,'league/state');await click(page,'[data-career-retire]');const retired=await state(page,'league/state');assert.equal(retired.ending,'retired');assert.equal(retired.complete,true);assert.equal(retired.xp,careerBefore.xp);assert.equal(await page.locator('#career-actions button').count(),0);check('Career retirement records actual progress and removes match controls');
  await click(page,'[data-page="clubhouse"]');await width(page);check('Mobile collection and ranking tables stay within the viewport');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(output,'clubhouse.png'),fullPage:true});
  await timedGames();
  assert.deepEqual(errors,[]);check('Additional controls produce no browser JavaScript errors');
}
async function timedGames() {
  const hostContext=await browser.newContext(),guestContext=await browser.newContext(),miniContext=await browser.newContext();
  const host=await boot(hostContext),guest=await boot(guestContext),mini=await boot(miniContext);
  await click(mini,'[data-page="challenges"]');await mini.locator('#mini-schedule').selectOption('unlimited');await click(mini,'[data-mini-kind="roster_roulette"]');
  const beforeMini=await state(mini,'mini/state');assert.ok(beforeMini.deadline);assert.equal(beforeMini.complete,false);
  for(const page of [host,guest])await click(page,'[data-mode="head-to-head"]');await click(host,'#room-create');const room=await host.locator('#room-title').textContent();await guest.locator('#room-code').fill(room);await click(guest,'#room-join');await host.waitForFunction(()=>!document.querySelector('#room-start').disabled);await click(host,'#room-start');
  process.stdout.write('Waiting for real room and mini-game clocks…\n');
  const roomFinished=(async()=>{await host.waitForFunction(()=>!document.querySelector('#room-result').hidden,undefined,{timeout:100000});await guest.waitForFunction(()=>!document.querySelector('#room-result').hidden,undefined,{timeout:100000});const view=await state(host,'room/state');assert.equal(view.phase,'finished');assert.ok(view.seats.every(seat=>seat.count===15&&seat.ready));assert.equal(await host.locator('#room-result').textContent(),await guest.locator('#room-result').textContent());check('Real room deadline completes both remaining drafts and records one shared match');})();
  const miniFinished=(async()=>{await mini.waitForFunction(()=>document.querySelector('.mini-question')?.textContent==='Challenge complete.',undefined,{timeout:150000});const view=await state(mini,'mini/state');assert.equal(view.complete,true);assert.equal(view.score,0);await mini.reload();await settle(mini);assert.match(await mini.locator('#mini-game').textContent(),/Challenge complete/);check('Real 120-second Roster Roulette deadline finalizes and survives reload');})();
  await Promise.all([roomFinished,miniFinished]);await hostContext.close();await guestContext.close();await miniContext.close();
}
run().then(async()=>{fs.writeFileSync(path.join(output,'acceptance-controls-results.json'),JSON.stringify({base,checks,errors,passed:true},null,2));await browser.close();}).catch(async error=>{fs.writeFileSync(path.join(output,'acceptance-controls-results.json'),JSON.stringify({base,checks,errors,passed:false,failure:error.stack},null,2));process.stderr.write(error.stack+'\n');if(browser)await browser.close();process.exitCode=1;});
