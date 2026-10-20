/** Optional real-browser acceptance suite. Requires Playwright + installed Chrome.
 * Authenticated UI is exercised with the unchanged non-auth template in a test-only
 * intercepted response. Production workspace.html and Clerk are tested separately.
 * No bypass or test route is written into the published website.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRACE_URL||'http://127.0.0.1:8766';
const out=path.resolve(process.env.TRACE_REPORT_DIR||path.join(root,'browser-report'));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.CHROME_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
const errors=[],failedLocal=[],checks=[],widths=[360,390,768,1024,1440];
context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failedLocal.push([r.status(),r.url()]);});});
const page=await context.newPage();
const check=(name,detail)=>{checks.push({name,detail});console.log('PASS:',name);};
const text=id=>page.locator(id).textContent();
const waitText=async(id,value)=>{await page.waitForFunction(([id,value])=>document.querySelector(id)?.textContent.trim()===value,[id,value]);};
async function noOverflow(label){const dimensions=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.viewport+1,`${label}: ${JSON.stringify(dimensions)}`);}
async function sweep(){await page.evaluate(async()=>{const old=document.documentElement.style.scrollBehavior;document.documentElement.style.scrollBehavior='auto';for(let y=0;y<document.documentElement.scrollHeight;y+=550){scrollTo(0,y);await new Promise(resolve=>setTimeout(resolve,45));}scrollTo(0,0);document.documentElement.style.scrollBehavior=old;});await page.waitForTimeout(1100);}
async function shot(name,fullPage=false){await page.waitForTimeout(200);await page.screenshot({path:path.join(out,name+'.png'),fullPage});}
try{
  await page.goto(base+'/index.html');await page.waitForTimeout(1600);
  assert.match(await text('#previewIssues'),/4/);
  await page.locator('[data-preview="corrected"]').click();assert.match(await text('#previewIssues'),/Без замечаний/);assert.equal(await page.locator('.log-complete').count(),3);assert.equal(await page.locator('[data-preview="corrected"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-preview="initial"]').click();await page.waitForTimeout(450);await shot('home-desktop');
  check('Home preview switches actual fixture reports, 4 → 0 → 4');
  for(const width of widths){await page.setViewportSize({width,height:1000});await noOverflow('home '+width);await page.locator('.hero h1').scrollIntoViewIfNeeded();const clip=await page.locator('.hero h1').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(clip.scroll<=clip.width+2,`heading clips at ${width}`);}
  check('Home layout and heading at 360/390/768/1024/1440');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  await page.locator('.site-mobile-menu summary').click();assert.equal(await page.locator('.site-mobile-menu').getAttribute('open'),'');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.site-mobile-menu').open);assert.equal(await page.locator('.site-mobile-menu').getAttribute('open'),null);
  await page.locator('.site-mobile-menu summary').click();await page.locator('.site-mobile-menu a[href="evidence.html"]').click();await page.waitForURL('**/evidence.html');check('Mobile menu: keyboard Escape and route navigation');
  await page.goto(base+'/index.html');await page.waitForTimeout(500);await sweep();await shot('home-mobile-full',true);await shot('home-mobile');
  await page.locator('.motion-toggle').click();assert.equal(await page.locator('.motion-toggle').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.light-field').evaluate(el=>el.classList.contains('is-paused')),true);await page.locator('.motion-toggle').click();
  check('Background pause/resume control');
  await page.setViewportSize({width:1440,height:1000});await page.locator('.connection-story').evaluate(el=>scrollTo({top:el.offsetTop,behavior:'instant'}));await page.waitForTimeout(500);const before=await page.locator('.orbit-scene').evaluate(el=>getComputedStyle(el).transform);await page.evaluate(()=>scrollBy({top:500,behavior:'instant'}));await page.waitForTimeout(400);const after=await page.locator('.orbit-scene').evaluate(el=>getComputedStyle(el).transform);assert.notEqual(before,after);await shot('connection-scroll');
  await page.locator('#materials').scrollIntoViewIfNeeded();await page.waitForTimeout(1200);await shot('materials-desktop');check('Central scene follows native scroll and all material destinations remain');
  await page.goto(base+'/evidence.html');await sweep();await shot('evidence-desktop');
  await page.locator('#caseFlow').fill('120000');await page.locator('#caseFlow').dispatchEvent('input');assert.match((await text('#net')).replace(/[\s\u00a0]/g,''),/1068000/);assert.match(await text('#payback'),/2,25/);await page.goto(base+'/evidence.html#economics');await page.waitForTimeout(1200);await shot('economics-desktop');
  for(const width of widths){await page.setViewportSize({width,height:1000});await noOverflow('evidence '+width);}
  check('Evidence calculator, download links and five responsive widths');
  // Real production gate, no fixture interception here.
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/workspace.html');await page.locator('#auth-sign-in input').first().waitFor({timeout:30000}).catch(()=>{});
  assert.equal(await page.locator('#trace-workspace').isVisible(),false);assert.equal(await page.locator('#trace-workspace').getAttribute('inert'),'');assert.equal(await page.locator('#auth-gate').isVisible(),true);await shot('auth-desktop');
  const liveClerk=await page.locator('#auth-sign-in input').count();
  for(const width of widths){await page.setViewportSize({width,height:1000});await noOverflow('auth '+width);}
  await page.setViewportSize({width:390,height:844});await shot('auth-mobile');check('Production Clerk gate stays locked without identity + organization',{liveClerkForm:liveClerk>0});
  // Test-only response override, using the project's own current template and assets.
  const template=await fs.readFile(path.join(root,'templates/workspace.html'),'utf8');
  await page.route('**/workspace.html',route=>route.fulfill({status:200,contentType:'text/html',body:template}));
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/workspace.html');await page.waitForFunction(()=>document.querySelectorAll('#queueRows tr').length===3);await shot('queue-desktop');
  await page.locator('#queueSearch').fill('Вектор');assert.equal(await page.locator('#queueRows button').count(),1);await page.locator('#queueSearch').fill('no-such-case');assert.match(await text('#queueRows'),/не найдены/);await page.locator('#queueSearch').fill('');await page.locator('#queueFilter').selectOption('waiting');assert.equal(await page.locator('#queueRows button').count(),1);await page.locator('#queueFilter').selectOption('');
  await page.locator('#queueRows button').first().click();await page.locator('#analyze').click();await waitText('#issueCount','4');assert.equal(await page.locator('#approve').isDisabled(),true);assert.equal(await page.locator('.map-row').count(),3);await page.waitForTimeout(600);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await shot('case-initial-desktop');
  await page.locator('.issue .evidence').first().click();assert.equal(await page.locator('#evidenceDialog').isVisible(),true);assert.equal(await page.locator('.selectedline').count(),1);await page.keyboard.press('Escape');assert.equal(await page.locator('#evidenceDialog').isVisible(),false);
  await page.locator('#copyDraft').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await page.locator('#draft').inputValue());
  await page.locator('#prepareRequest').click();assert.match(await text('#workflowStatus'),/Ожидает уточнения/);
  await page.locator('#docText').fill((await page.locator('#docText').inputValue())+'\nПроверено в браузерном тесте.');await page.locator('#saveDoc').click();assert.equal(await page.locator('#staleNotice').isVisible(),true);assert.equal(await page.locator('#approve').isDisabled(),true);
  await page.locator('#loadFixed').click();await waitText('#issueCount','0');await waitText('#completion','3 / 3');await page.locator('#reviewComment').fill('Связи, реквизиты и суммы проверены в учебном примере.');await page.locator('#approve').click();await page.waitForFunction(()=>document.getElementById('workflowStatus').textContent==='Проверка завершена');assert.match(await text('#caseTimeline'),/Проверка сотрудником завершена/);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(500);await shot('case-corrected-desktop');
  const download=page.waitForEvent('download');await page.locator('#export').click();const file=await download;assert.match(file.suggestedFilename(),/\.json$/);const report=JSON.parse(await fs.readFile(await file.path(),'utf8'));assert.equal(report.issue_count,0);
  check('Queue search/filter; analysis; source dialog; copy; edit; clarification; correction; approval; export');
  await page.reload();await page.locator('#queueRows button').first().click();assert.match(await text('#workflowStatus'),/Проверка завершена/);assert.equal(await page.locator('#issueCount').textContent(),'0');check('Local state, result and workflow survive reload');
  for(const width of widths){await page.setViewportSize({width,height:1000});await noOverflow('workspace-case '+width);}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await shot('case-mobile');await page.locator('.map-box').scrollIntoViewIfNeeded();await shot('case-map-mobile');
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-tab="model"]').click();await page.locator('#m-cases').fill('120000');await page.locator('#calc').click();assert.match((await text('#modelResult')).replace(/[\s\u00a0]/g,''),/1068000/);await page.locator('#m-eligible').fill('2');await page.locator('#calc').click();assert.ok((await text('#modelError')).length>0);await page.locator('#m-eligible').fill('0.6');await page.locator('#calc').click();await shot('workspace-economics');
  await page.locator('[data-tab="research"]').click();assert.equal(await page.locator('#research').isVisible(),true);await page.locator('[data-tab="history"]').click();await page.waitForFunction(()=>document.querySelectorAll('#historyRows tr').length>0);check('Workspace economics validation, research and revision history');
  // Invalid import must leave the current packet intact.
  await page.locator('[data-tab="case"]').click();await page.locator('#importFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await page.waitForTimeout(100);assert.equal(await text('#issueCount'),'0');
  const correctedPacket=JSON.parse(template.match(/window.CORRECTED_PACKET=(.*?);<\/script>/s)[1]);await page.locator('#importFile').setInputFiles({name:'packet.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(correctedPacket))});await waitText('#issueCount','0');
  const doc='Тип: Пояснение\nНомер: П-TEST\nДоговор: Д-41\nИНН контрагента: 7700000001\nКомментарий: учебная проверка';await page.locator('#txtFile').setInputFiles({name:'browser-test.txt',mimeType:'text/plain',buffer:Buffer.from(doc)});await waitText('#docCount','7');await page.locator('#deleteDoc').click();await waitText('#docCount','6');check('JSON import errors preserve state; valid JSON and TXT add/delete work');
  const rm=await context.newPage();await rm.emulateMedia({reducedMotion:'reduce'});await rm.goto(base+'/index.html');await rm.waitForTimeout(500);assert.equal(await rm.locator('.intro-overlay').count(),0);assert.equal(await rm.locator('.reveal').first().evaluate(el=>getComputedStyle(el).opacity),'1');assert.equal(await rm.locator('.light-field').getAttribute('data-motion'),'static');await rm.setViewportSize({width:360,height:800});assert.equal(await rm.evaluate(()=>document.documentElement.scrollWidth),360);await rm.screenshot({path:path.join(out,'reduced-motion-mobile.png')});await rm.close();check('Reduced motion: no intro, no looping field, content visible');
  assert.deepEqual(errors,[]);assert.deepEqual(failedLocal,[]);check('No uncaught JavaScript errors or failed local resources');
  await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({date:new Date().toISOString(),status:'passed',checks,errors,failedLocal,limitations:['Real account sign-in and organization membership are not exercised; authenticated UI uses a test-only template response.','The video does not reveal mobile, hover or menu states; these are adaptations.']},null,2));
}catch(error){await shot('failure');await fs.writeFile(path.join(out,'verification-failure.json'),JSON.stringify({checks,errors,failedLocal,error:error.stack},null,2));throw error;}finally{await browser.close();}
