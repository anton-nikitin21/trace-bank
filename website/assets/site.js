import {mountLightFlow} from './light-flow.js?v=9';

const root=document.documentElement;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const controller=new AbortController(),{signal}=controller;
const clamp=n=>Math.min(1,Math.max(0,n));
const home=document.querySelector('.page-home main');
const header=document.querySelector('.header');
const orbit=document.querySelector('.connection-story');
const chapters=[...document.querySelectorAll('.scenario-row')];
let frame=0,observer=null,resizeObserver=null,paused=false,needsMeasure=true,lastFrame=0,previousScroll=NaN;
let geometry={height:innerHeight,orbit:null,chapters:[]};
const lightFlow=home?mountLightFlow({host:home,hero:document.querySelector('.hero'),scope:document.getElementById('scenario'),reduced,requestFrame:request}):null;

function measure(){
  const pageTop=scrollY;
  const orbitBox=orbit?.getBoundingClientRect();
  geometry={height:innerHeight,orbit:orbitBox?{top:orbitBox.top+pageTop,range:Math.max(1,orbitBox.height-innerHeight)}:null,chapters:chapters.map(el=>{const box=el.getBoundingClientRect();return {el,top:box.top+pageTop,height:box.height};})};
  lightFlow?.measure();needsMeasure=false;
}
function refresh(now=performance.now()){
  frame=0;
  const dt=lastFrame?Math.min(100,now-lastFrame):16.67;lastFrame=now;
  const changedGeometry=needsMeasure;
  if(needsMeasure)measure();
  const scroll=scrollY,height=geometry.height;
  if(scroll!==previousScroll||changedGeometry){
  header?.classList.toggle('is-scrolled',scroll>20);
  if(!reduced.matches&&!paused){
    root.style.setProperty('--hero-shift',clamp(scroll/height).toFixed(4));
    if(geometry.orbit)root.style.setProperty('--orbit-progress',clamp((scroll-geometry.orbit.top)/geometry.orbit.range).toFixed(4));
    for(const item of geometry.chapters){const top=item.top-scroll;if(top+item.height>0&&top<height)item.el.style.setProperty('--chapter-parallax',clamp((height-top)/(height+item.height)).toFixed(4));}
  }
  previousScroll=scroll;
  }
  const settling=lightFlow?.update(scroll,dt);
  if(settling)request();
}
function request(){if(!signal.aborted&&!frame)frame=requestAnimationFrame(refresh);}
function requestMeasure(){needsMeasure=true;request();}
addEventListener('scroll',request,{passive:true,signal});
addEventListener('resize',requestMeasure,{passive:true,signal});
if(home){resizeObserver=new ResizeObserver(requestMeasure);resizeObserver.observe(document.querySelector('.hero'));resizeObserver.observe(document.getElementById('scenario'));}
document.fonts?.ready.then(()=>{if(!signal.aborted)requestMeasure();});
function setupReveals(){
  observer?.disconnect();
  if(reduced.matches){document.body.classList.remove('motion-ready');document.querySelectorAll('.reveal').forEach(el=>el.classList.add('is-visible'));return;}
  document.body.classList.add('motion-ready');
  // Observe the unmasked heading box. Clipping that box to zero would prevent
  // IntersectionObserver from ever reporting its entry.
  document.querySelectorAll('.display.reveal').forEach(title=>{
    if(title.firstElementChild?.classList.contains('heading-mask-content'))return;
    const content=document.createElement('span');content.className='heading-mask-content';
    while(title.firstChild)content.append(title.firstChild);
    title.append(content);
  });
  observer=new IntersectionObserver(items=>{for(const item of items)if(item.isIntersecting){item.target.classList.add('is-visible');observer.unobserve(item.target);}},{threshold:.07,rootMargin:'0px 0px -25px 0px'});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
  document.querySelectorAll('.proof-lines,.metric-strip,.comparison,.build-results').forEach(group=>[...group.children].forEach((el,i)=>el.style.setProperty('--reveal-delay',`${i*85}ms`)));
}
setupReveals();
reduced.addEventListener('change',()=>{setupReveals();document.querySelector('.intro-overlay')?.remove();if(reduced.matches)document.querySelector('main')?.getAnimations({subtree:true}).forEach(a=>a.cancel());lightFlow?.setPaused(paused||document.hidden);requestMeasure();},{signal});

// Relay 0.17–0.67 s shows the panel morph; the selected duration is an adaptation.
if(home&&!reduced.matches){
  let seen=true;try{seen=sessionStorage.getItem('trace.intro.v1')==='seen';sessionStorage.setItem('trace.intro.v1','seen');}catch{seen=false;}
  if(!seen){
    root.style.setProperty('--intro-delay','500ms');
    const overlay=document.createElement('div');overlay.className='intro-overlay';overlay.setAttribute('aria-hidden','true');overlay.innerHTML='<div class="intro-panel"><i class="trace-symbol"></i></div>';document.body.append(overlay);
    const morph=overlay.firstElementChild.animate([{transform:'scale(.04)',borderRadius:'80px',opacity:0,offset:0},{transform:'scale(1)',borderRadius:'12px',opacity:1,offset:.32},{transform:'scale(1)',borderRadius:'12px',opacity:1,offset:.43},{transform:'scale(.025)',borderRadius:'45%',opacity:1,offset:1}],{duration:1050,easing:'cubic-bezier(.65,0,.2,1)',fill:'forwards'});
    overlay.animate([{background:'#050b18'},{background:'transparent',offset:.5},{background:'transparent'}],{duration:1050,fill:'forwards'});
    morph.finished.catch(()=>{}).finally(()=>overlay.remove());setTimeout(()=>overlay.remove(),1600);
  }
}
const toggle=document.querySelector('.motion-toggle');
function syncPlayback(){previousScroll=NaN;lastFrame=0;document.body.classList.toggle('motion-paused',paused||document.hidden);lightFlow?.setPaused(paused||document.hidden);if(!document.hidden)request();}
toggle?.addEventListener('click',()=>{paused=!paused;toggle.setAttribute('aria-pressed',String(paused));toggle.setAttribute('aria-label',paused?'Продолжить фоновые анимации':'Приостановить фоновые анимации');toggle.innerHTML=paused?'Продолжить <span aria-hidden="true">▷</span>':'Пауза анимации <span aria-hidden="true">Ⅱ</span>';syncPlayback();},{signal});
document.addEventListener('visibilitychange',syncPlayback,{signal});

// This is a view of actual fixture reports generated by app/engine.py, never invented metrics.
const previewData=document.getElementById('previewData');
if(previewData){
  const reports=JSON.parse(previewData.textContent);
  let previewAnimation=null;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';
  function renderPreview(key){
    const report=reports[key];const flow=document.getElementById('previewFlow');
    const complete=report.issue_count===0;
    flow.innerHTML=`<div class="workflow-graph ${complete?'graph-complete':'graph-review'}">
      <svg class="workflow-wires" viewBox="0 0 480 190" preserveAspectRatio="none" aria-hidden="true"><path class="wire-base" d="M110 100 C150 100 140 52 180 52 M290 52 H340 M290 52 C320 52 312 145 340 145"/><path class="wire-signal" d="${complete?'M110 100 C150 100 140 52 180 52 H290 C320 52 312 145 340 145':'M110 100 C150 100 140 52 180 52 H340'}"/></svg>
      <div class="graph-node graph-input"><span>КОМПЛЕКТ</span><strong>${report.document_count} документов</strong><small>${report.transaction_count} операции</small></div>
      <div class="graph-node graph-check"><span>ПРОВЕРКА СВЯЗЕЙ</span><strong>Договор + ИНН</strong><small>Профиль supply-v1</small></div>
      <div class="graph-node graph-clarify ${complete?'graph-muted':'graph-active'}"><span>ЕСТЬ ПРОБЕЛЫ</span><strong>Уточнить</strong><small>${complete?'Нет замечаний':`${report.issue_count} замечания`}</small></div>
      <div class="graph-node graph-done ${complete?'graph-active':'graph-muted'}"><span>КОМПЛЕКТ СОБРАН</span><strong>Проверить</strong><small>Решение сотрудника</small></div>
    </div><div class="preview-log"><span class="micro-label">ОПЕРАЦИИ В КОМПЛЕКТЕ</span>${report.rows.map(row=>`<div class="preview-log-row"><span>${escape(row.transaction_ids.join(', '))}</span><span>${escape(row.contract)}</span><strong>${money(row.amount)}</strong><span class="log-state ${row.status==='complete'?'log-complete':''}">${row.status==='complete'?'Связи найдены':`${row.issue_count} замеч.`}</span></div>`).join('')}</div>`;
    document.getElementById('previewSummary').textContent=`${report.transaction_count} операции · ${report.document_count} документов`;
    document.getElementById('previewIssues').textContent=report.issue_count?`${report.issue_count} замечания`:'Без замечаний';
    document.getElementById('previewIssues').style.color=report.issue_count?'#dec18d':'#8bd8ff';
    document.querySelectorAll('[data-preview]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preview===key)));
    previewAnimation?.cancel();
    if(!reduced.matches)previewAnimation=flow.animate([{opacity:.25,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>renderPreview(button.dataset.preview),{signal}));renderPreview('initial');
}
// Native details semantics, with reversible open AND close motion.
const menu=document.querySelector('.site-mobile-menu');
let menuAnimation=null,menuIntent=!!menu?.open,menuVersion=0;
async function setMenu(expanded){
  if(!menu)return;
  const version=++menuVersion,nav=menu.querySelector('nav'),summary=menu.querySelector('summary');
  const wasOpen=menu.open;
  const current=wasOpen?getComputedStyle(nav):null;
  const from=current?{opacity:current.opacity,transform:current.transform,clipPath:current.clipPath}:{opacity:0,transform:'translateY(-12px)',clipPath:'inset(0 0 100% 0)'};
  menuAnimation?.cancel();menuIntent=expanded;summary.setAttribute('aria-expanded',String(expanded));nav.inert=!expanded;
  if(reduced.matches){menu.open=expanded;return;}
  if(!wasOpen&&!expanded)return;
  menu.open=true;
  menuAnimation=nav.animate([from,expanded?{opacity:1,transform:'translateY(0)',clipPath:'inset(0)'}:{opacity:0,transform:'translateY(-8px)',clipPath:'inset(0 0 100% 0)'}],{duration:expanded?420:240,easing:expanded?'cubic-bezier(.16,1,.3,1)':'cubic-bezier(.4,0,1,1)'});
  try{await menuAnimation.finished;}catch{}
  if(version===menuVersion){menu.open=expanded;menuAnimation=null;}
}
menu?.querySelector('summary').addEventListener('click',event=>{event.preventDefault();setMenu(!menuIntent);},{signal});
menu?.addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false);},{signal});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu?.open){setMenu(false);menu.querySelector('summary').focus();}},{signal});
document.addEventListener('click',event=>{if(menu?.open&&!menu.contains(event.target))setMenu(false);},{signal});
// Relay does not show route transitions. Keep real URL navigation native.
addEventListener('pageshow',event=>{if(event.persisted){syncPlayback();requestMeasure();}},{signal});
addEventListener('pagehide',event=>{
  lightFlow?.setPaused(true);menuAnimation?.cancel();
  if(frame){cancelAnimationFrame(frame);frame=0;}
  if(!event.persisted){controller.abort();observer?.disconnect();resizeObserver?.disconnect();lightFlow?.destroy();}
},{signal});
request();
