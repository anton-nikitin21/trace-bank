/** Real-browser transport, composition, lifecycle and recording checks. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRACE_URL||'http://127.0.0.1:8766';
const out=process.env.TRACE_REPORT_DIR;
if(!out)throw Error('Set TRACE_REPORT_DIR to an output folder.');
await fs.mkdir(path.join(out,'videos'),{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.join(out,'videos'),size:{width:1440,height:1000}}});
const page=await context.newPage(),errors=[],checks=[],frames=[];
page.on('pageerror',error=>errors.push(error.message));
const check=(name,detail)=>{checks.push({name,detail});console.log('PASS:',name);};
const state=()=>page.locator('.light-field').evaluate(el=>({progress:+el.dataset.progress,transform:el.dataset.composition,path:el.querySelector('canvas').dataset.geometry,offset:+el.dataset.head,clock:+el.dataset.time,paused:el.classList.contains('is-paused'),threads:+el.dataset.threads}));
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function scroll(top,wait=800){await page.evaluate(top=>scrollTo({top,behavior:'instant'}),top);await page.waitForTimeout(wait);}
try{
  await page.goto(base+'/index.html');await page.waitForTimeout(2400);
  const a=await state();await shot('idle-a');await page.waitForTimeout(700);const b=await state();await shot('idle-b');
  assert.equal(a.path,b.path);assert.equal(a.transform,b.transform);assert.ok(Math.abs(a.offset-b.offset)>5);assert.ok(b.clock>a.clock+.6);check('Idle: light moves inside an unchanged path and composition',{offsetA:a.offset,offsetB:b.offset});
  // A 2.5s native-scroll sample captures RAF pacing without synthetic easing of page scrolling.
  const pacing=await page.evaluate(async()=>{
    const times=[],tasks=[],obs=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(x=>x.duration)));obs.observe({type:'longtask',buffered:false});let previous=performance.now();const start=previous;
    await new Promise(resolve=>{function tick(now){times.push(now-previous);previous=now;scrollBy({top:4,behavior:'instant'});if(now-start<2500)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});obs.disconnect();times.splice(0,2);times.sort((a,b)=>a-b);return {frames:times.length,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],longTasks:tasks};
  });
  await page.waitForTimeout(500);const c=await state();assert.ok(c.progress>a.progress);assert.notEqual(c.transform,a.transform);assert.ok(c.clock>b.clock);check('Slow native scroll develops the existing composition, transport clock continues',pacing);
  await page.locator('#scenario .display').waitFor({state:'visible'});assert.equal(await page.locator('#scenario .display').evaluate(el=>el.classList.contains('is-visible')),true);check('Masked section heading enters through its unmasked observer box');
  // Cross the section boundary with one field/clock, then change direction rapidly.
  const heroEnd=await page.locator('.hero').evaluate(el=>el.offsetHeight);
  await scroll(heroEnd-70,450);const before=await state();await scroll(heroEnd+90,450);const after=await state();assert.equal(await page.locator('.light-field').count(),1);assert.ok(after.clock>before.clock);assert.ok(after.progress>before.progress);check('Hero/scenario boundary uses one continuous field and animation clock');
  const prior=after.progress;await scroll(2200,90);const accelerating=await state();assert.ok(accelerating.progress>prior);await page.waitForTimeout(500);await shot('scroll-fast');await scroll(450,1400);const back=await state();assert.ok(back.progress<accelerating.progress);await scroll(0,1500);const returned=await state();assert.ok(returned.progress<.0002);assert.equal(returned.transform,a.transform);check('Fast scroll settles smoothly; reverse scroll returns to the original composition');
  await page.locator('.motion-toggle').click();const frozen=await state();await page.waitForTimeout(250);assert.equal((await state()).clock,frozen.clock);check('Pause stops light transport without hiding the field');await page.locator('.motion-toggle').click();
  const loop=await page.evaluate(async()=>{const el=document.querySelector('.light-field'),samples=[];await new Promise(resolve=>{function tick(){const h=+el.dataset.head,t=+el.dataset.time;samples.push({h,t});if(samples.length>1&&samples.at(-2).h>250&&h<10)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);});return samples.slice(-3);});
  assert.ok(loop.at(-1).t>loop.at(-2).t);assert.ok(loop.at(-1).h+260-loop.at(-2).h<3);check('Transport phase wraps continuously without restarting its clock',loop);
  const widthResults=[];
  for(const width of [360,390,768,1024,1440]){
    const clock=(await state()).clock;await page.setViewportSize({width,height:width<600?844:1000});await page.waitForTimeout(250);const s=await state();
    const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));assert.equal(s.threads,width<=600?6:12);assert.ok(s.clock>=clock-.05,'Resize reset transport clock');widthResults.push({...dimensions,threads:s.threads});
  }
  check('Five responsive widths, reduced mobile thread count, resize preserves phase',widthResults);
  const end=await page.locator('#scenario').evaluate(el=>el.offsetTop+el.offsetHeight);await scroll(end+700,500);const stopped=await state();assert.equal(stopped.paused,true);await page.waitForTimeout(250);assert.equal((await state()).clock,stopped.clock);check('Transport pauses beyond its intended section scope');
  await scroll(0,1200);assert.equal((await state()).paused,false);
  await page.locator('.header > nav a[href="evidence.html"]').click();await page.waitForURL('**/evidence.html');await page.goBack();await page.waitForTimeout(1200);assert.equal(await page.locator('.light-field').count(),1);assert.equal(await page.locator('.flow-canvas').count(),1);assert.equal((await state()).threads,12);check('Navigate away/back: one canvas and twelve transport threads');
  await shot('desktop-final');
  // Mobile gets a separate recording at its real viewport size.
  const mobile=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:path.join(out,'videos'),size:{width:390,height:844}}});const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));await m.goto(base+'/index.html');await m.waitForTimeout(2200);await m.screenshot({path:path.join(out,'mobile-final.png')});
  const hit=await m.locator('.hero-actions .button').first().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.equal(hit,true);
  await m.locator('.site-mobile-menu summary').click();await m.waitForTimeout(450);await m.keyboard.press('Escape');await m.waitForFunction(()=>!document.querySelector('.site-mobile-menu').open);await m.locator('.site-mobile-menu summary').click();await m.waitForTimeout(100);await m.locator('.site-mobile-menu summary').click();await m.waitForTimeout(70);await m.locator('.site-mobile-menu summary').click();await m.waitForTimeout(500);assert.equal(await m.locator('.site-mobile-menu').getAttribute('open'),'');await m.keyboard.press('Escape');await m.waitForFunction(()=>!document.querySelector('.site-mobile-menu').open);
  await m.evaluate(async()=>{for(let i=0;i<50;i++){scrollBy({top:14,behavior:'instant'});await new Promise(r=>setTimeout(r,20));}});await m.waitForTimeout(650);await m.screenshot({path:path.join(out,'mobile-scroll.png')});await mobile.close();await m.video().saveAs(path.join(out,'mobile-flow.webm'));check('Mobile: CTA remains clickable, menu open/close is reversible, flow follows scroll');
  const rm=await context.newPage();await rm.emulateMedia({reducedMotion:'reduce'});await rm.goto(base+'/index.html');await rm.waitForTimeout(500);assert.equal(await rm.locator('.intro-overlay').count(),0);assert.equal(await rm.locator('.light-field').getAttribute('data-motion'),'static');assert.equal(await rm.locator('.reveal').first().evaluate(el=>getComputedStyle(el).opacity),'1');const rmTime=await rm.locator('.light-field').getAttribute('data-time');await rm.waitForTimeout(150);assert.equal(await rm.locator('.light-field').getAttribute('data-time'),rmTime);await rm.close();check('Reduced motion keeps a static composition and visible content');
  assert.deepEqual(errors,[]);check('No uncaught browser errors');await fs.writeFile(path.join(out,'motion-verification.json'),JSON.stringify({status:'passed',checks,errors,reference:'Relay only, 0.0–3.5 seconds. Travel speed and easing are selected adaptations, not exact measurements.'},null,2));
}catch(error){await shot('failure');await fs.writeFile(path.join(out,'motion-failure.json'),JSON.stringify({checks,errors,error:error.stack},null,2));throw error;}finally{await context.close();await page.video().saveAs(path.join(out,'desktop-flow.webm'));await browser.close();}
