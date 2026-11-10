import {mountLightFlow} from './light-flow.js?v=perf1';

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
  observer=new IntersectionObserver(items=>{for(const item of items){if(item.isIntersecting)item.target.classList.add('is-visible');else if(item.intersectionRatio===0)item.target.classList.remove('is-visible');}},{threshold:[0,.07],rootMargin:'0px'});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
  document.querySelectorAll('.proof-lines,.metric-strip,.comparison,.build-results').forEach(group=>[...group.children].forEach((el,i)=>el.style.setProperty('--reveal-delay',`${i*85}ms`)));
}
setupReveals();
reduced.addEventListener('change',()=>{setupReveals();document.querySelector('.intro-overlay')?.remove();if(reduced.matches)document.querySelector('main')?.getAnimations({subtree:true}).forEach(a=>a.cancel());lightFlow?.setPaused(paused||document.hidden);requestMeasure();},{signal});

// Relay 0.17–0.67 s shows the panel morph; the selected duration is an adaptation.
if(home&&!reduced.matches&&!matchMedia('(pointer: coarse)').matches){
  let seen=true;try{seen=sessionStorage.getItem('trace.intro.v4')==='seen';sessionStorage.setItem('trace.intro.v4','seen');}catch{seen=false;}
  if(!seen){
    root.style.setProperty('--intro-delay','500ms');
    const overlay=document.createElement('div');overlay.className='intro-overlay';overlay.setAttribute('aria-hidden','true');overlay.innerHTML='<div class="intro-panel"></div>';document.body.append(overlay);
    const sculpture=document.querySelector('.brand-sculpture')?.cloneNode(true);
    if(sculpture){
      sculpture.innerHTML='<img src="assets/trace-workspace-wordmark.svg" width="890" height="245" alt=""/>';
      overlay.firstElementChild.prepend(sculpture);
    }
    const reveal=overlay.animate([
      {clipPath:'inset(0 0 0 0)',opacity:1},
      {clipPath:'inset(0 0 0 0)',opacity:1,offset:.45},
      {clipPath:'inset(0 0 100% 0)',opacity:1}
    ],{duration:1400,easing:'cubic-bezier(.76,0,.24,1)',fill:'forwards'});
    const introEvents=new AbortController();
    const dismiss=()=>{
      introEvents.abort();
      reveal.cancel();
      root.style.removeProperty('--intro-delay');
      overlay.remove();
    };
    document.addEventListener('focusin',dismiss,{signal:introEvents.signal});
    document.addEventListener('pointerdown',dismiss,{signal:introEvents.signal});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')dismiss();},{signal:introEvents.signal});
    reveal.finished.catch(()=>{}).finally(dismiss);
  }
}
const toggle=document.querySelector('.motion-toggle');
function syncPlayback(){previousScroll=NaN;lastFrame=0;document.body.classList.toggle('motion-paused',paused||document.hidden);lightFlow?.setPaused(paused||document.hidden);if(!document.hidden)request();}
toggle?.addEventListener('click',()=>{paused=!paused;toggle.setAttribute('aria-pressed',String(paused));toggle.innerHTML=paused?'Продолжить анимацию <span aria-hidden="true">▷</span>':'Пауза анимации <span aria-hidden="true">Ⅱ</span>';syncPlayback();},{signal});
document.addEventListener('visibilitychange',syncPlayback,{signal});

// This is a view of actual fixture reports generated by app/engine.py, never invented metrics.
const previewData=document.getElementById('previewData');
if(previewData){
  const reports=JSON.parse(previewData.textContent);
  let previewAnimation=null;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';
  function renderPreview(key, scan = false){
    const report=reports[key];const flow=document.getElementById('previewFlow');
    const complete=report.issue_count===0;
    flow.innerHTML=`<div class="workflow-graph ${scan ? 'graph-scan' : ''} ${complete?'graph-complete':'graph-review'}">
      <svg class="workflow-wires" viewBox="0 0 480 190" preserveAspectRatio="none" aria-hidden="true"><path class="wire-base" d="M110 100 C150 100 140 52 180 52 M290 52 H340 M290 52 C320 52 312 145 340 145"/><path class="wire-signal" d="${complete?'M110 100 C150 100 140 52 180 52 H290 C320 52 312 145 340 145':'M110 100 C150 100 140 52 180 52 H340'}"/></svg>
      <button type="button" class="graph-node graph-input" aria-pressed="false"><span>КОМПЛЕКТ</span><strong>${report.document_count} документов</strong><small>${report.transaction_count} операции</small></button>
      <button type="button" class="graph-node graph-check" aria-pressed="false"><span>ПРОВЕРКА СВЯЗЕЙ</span><strong>Договор + ИНН</strong><small>Профиль supply-v1</small></button>
      <button type="button" class="graph-node graph-clarify ${complete?'graph-muted':'graph-active'}" aria-pressed="false"><span>ЕСТЬ ПРОБЕЛЫ</span><strong>Уточнить</strong><small>${complete?'Нет замечаний':`${report.issue_count} замечания`}</small></button>
      <button type="button" class="graph-node graph-done ${complete?'graph-active':'graph-muted'}" aria-pressed="false"><span>КОМПЛЕКТ СОБРАН</span><strong>Проверить</strong><small>Решение сотрудника</small></button>
    </div><div class="preview-log"><span class="micro-label">ОПЕРАЦИИ В КОМПЛЕКТЕ</span>${report.rows.map(row=>`<div class="preview-log-row"><span>${escape(row.transaction_ids.join(', '))}</span><span>${escape(row.contract)}</span><strong>${money(row.amount)}</strong><span class="log-state ${row.status==='complete'?'log-complete':''}">${row.status==='complete'?'Связи найдены':`${row.issue_count} замеч.`}</span></div>`).join('')}</div>`;
    document.getElementById('previewSummary').textContent=`${report.transaction_count} операции · ${report.document_count} документов`;
    document.getElementById('previewIssues').textContent=report.issue_count?`${report.issue_count} замечания`:'Без замечаний';
    document.getElementById('previewIssues').style.color=report.issue_count?'#dec18d':'#8bd8ff';
    document.querySelectorAll('[data-preview]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.preview===key)));
    const explanations=[
      'Комплект объединяет документы и операции учебного обращения. Количество обновляется при смене примера.',
      'Trace сопоставляет документы и платежи по договору и ИНН. Найденные связи показаны в списке операций ниже.',
      complete ? 'В дополненном комплекте замечаний нет. Перед завершением сотрудник проверяет источники.' : 'В комплекте есть замечания. Сверьте исходные документы и подготовьте адресное уточнение клиенту.',
      'Окончательное решение принимает сотрудник банка после проверки документов. Автоматическая сверка помогает найти пробелы.'
    ];
    const detail=document.createElement('p');
    detail.className='graph-detail';
    detail.setAttribute('role','status');
    detail.hidden=true;
    flow.querySelector('.workflow-graph').after(detail);
    const nodes=flow.querySelectorAll('.graph-node');
    nodes.forEach((node,index)=>node.addEventListener('click',()=>{
      nodes.forEach(item=>item.setAttribute('aria-pressed',String(item===node)));
      detail.hidden=false;
      detail.textContent=explanations[index];
    }));
    previewAnimation?.cancel();
    if(!reduced.matches&&!paused)previewAnimation=flow.animate([{opacity:.25,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>renderPreview(button.dataset.preview, true),{signal}));renderPreview('initial');
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
  if(reduced.matches||paused){menu.open=expanded;return;}
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
