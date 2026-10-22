/* Browser-local workflow on synthetic documents. No requests are sent to a bank. */
const caseQueue = [];
let activeCase = null;
let openingCase = false;
let resettingDemo = false;
let DEMO_STORAGE_KEY = document.body.dataset.authRequired === 'true'
  ? 'trace.synthetic-workspace.v2:' + JSON.stringify([window.TRACE_SESSION?.userId, window.TRACE_SESSION?.organizationId])
  : 'trace.synthetic-workspace.v2';
const workflowNames = {new:'Новый',review:'На проверке',waiting:'Ожидает уточнения',done:'Проверка завершена'};
const clonePacket = value => JSON.parse(JSON.stringify(value));

function persistDemo() {
  if (resettingDemo) return;
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({version:2,cases:caseQueue,revisions:[...localRevisions],counter:localCounter}));
    $('storageStatus').textContent='Изменения сохранены в этом браузере';
  } catch(error) {
    $('storageStatus').textContent='Браузер не сохранил изменения. Изменения доступны до перезагрузки.';
  }
}

function addCaseEvent(title, detail='') {
  if (!activeCase) return;
  activeCase.events ||= [];
  activeCase.events.push({at:new Date().toISOString(),title,detail});
  activeCase.events = activeCase.events.slice(-100);
  renderCaseTimeline();
}

function renderCaseTimeline() {
  if (!activeCase) return;
  $('caseTimeline').innerHTML=(activeCase.events || []).slice().reverse().map(event => `<li><time>${escape(new Date(event.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))} МСК</time><strong>${escape(event.title)}</strong><p>${escape(event.detail)}</p></li>`).join('') || '<li>Действий пока нет. Выполните проверку комплекта.</li>';
}

function describeChanges(before, after) {
  const changes=[];
  for (const doc of after.documents) {
    const previous=before.documents.find(item=>item.name===doc.name);
    if (!previous) changes.push(`Добавлен ${doc.name}`);
    else if (previous.text !== doc.text) changes.push(`Обновлён ${doc.name}`);
  }
  for (const doc of before.documents) if (!after.documents.some(item=>item.name===doc.name)) changes.push(`Удалён ${doc.name}`);
  if (JSON.stringify(before.transactions)!==JSON.stringify(after.transactions)) changes.push('Изменены операции');
  if (before.profile!==after.profile) changes.push('Изменён профиль проверки');
  return changes.join('; ') || 'Состав и содержание комплекта не изменились';
}

function showQueueView(id) {
  if (id === 'queue') saveActiveCase();
  document.querySelectorAll('.panel').forEach(panel => panel.hidden = panel.id !== id);
  document.querySelectorAll('nav button[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === id);
    button.setAttribute('aria-current', button.dataset.tab === id ? 'page' : 'false');
  });
  $('currentView').textContent = ({learn:'Как пользоваться',queue:'Обращения клиентов',case:'Проверка документов'})[id] || 'Рабочее пространство';
  document.querySelector('.demo-guide').hidden = id !== 'queue';
  if (id === 'queue') renderQueue();
  const title=({learn:'Как пользоваться',queue:'Обращения клиентов',case:'Проверка документов'})[id];
  if(title) document.title=title+' — Trace';
  const heading=document.querySelector('#'+id+' h1');
  if(heading && document.activeElement?.closest('button,a')){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  window.scrollTo({top:0,behavior:'auto'});
}

function saveActiveCase() {
  if (!activeCase || !packet) return;
  activeCase.packet = clonePacket(packet);
  activeCase.report = report;
  activeCase.dirty = dirty;
  activeCase.draft = $('draft').value;
  activeCase.comment = $('reviewComment').value;
  persistDemo();
}

const queuePluralRules=new Intl.PluralRules('ru');
function formatQueueCount(count,one,few,many){return new Intl.NumberFormat('ru-RU').format(count)+' '+({one,few,many,other:many})[queuePluralRules.select(count)];}
function renderQueue() {
  const query = $('queueSearch').value.toLocaleLowerCase('ru');
  const filter = $('queueFilter').value;
  const filtered = caseQueue.filter(item => (!filter || item.status === filter) &&
    `${item.packet.case_id} ${item.packet.customer}`.toLocaleLowerCase('ru').includes(query));
  const counters=[['','Все обращения',caseQueue.length],['new','Новые',caseQueue.filter(x=>x.status==='new').length],['review','На проверке',caseQueue.filter(x=>x.status==='review').length],['waiting','Ждут уточнения',caseQueue.filter(x=>x.status==='waiting').length],['done','Завершены',caseQueue.filter(x=>x.status==='done').length]];
  if(!$('queueCounts').children.length) $('queueCounts').innerHTML=counters.map(([value,label])=>`<button type="button" class="queue-metric" data-queue-status="${value}"><span>${label}</span><strong></strong></button>`).join('');
  document.querySelectorAll('[data-queue-status]').forEach((button,index)=>{
    button.setAttribute('aria-pressed',String(filter===button.dataset.queueStatus));
    button.querySelector('strong').textContent=counters[index][2];
    button.onclick=()=>{$('queueFilter').value=button.dataset.queueStatus;renderQueue();};
  });
  $('queueResultCount').textContent=`Показано ${filtered.length} из ${caseQueue.length}`;
  $('clearQueueFilters').hidden=!query && !filter;
  $('clearQueueFilters').onclick=()=>{$('queueSearch').value='';$('queueFilter').value='';renderQueue();$('queueSearch').focus();};
  $('queueRows').innerHTML = filtered.map(item => `<tr><td data-label="Обращение"><strong>${escape(item.packet.case_id)}</strong><br><span class="small muted">${escape(item.received)}</span></td><td data-label="Клиент"><strong>${escape(item.packet.customer)}</strong><br><span class="small muted">Поставка товаров</span></td><td data-label="Комплект">${formatQueueCount(item.packet.transactions.length,'платёж','платежа','платежей')}<br><span class="small muted">${formatQueueCount(item.packet.documents.length,'документ','документа','документов')}</span></td><td data-label="Статус"><span class="queue-status ${item.status}">${workflowNames[item.status]}</span></td><td class="queue-row-action"><button aria-label="Открыть обращение ${escape(item.packet.case_id)}" data-open-case="${escape(item.packet.case_id)}">Открыть обращение</button></td></tr>`).join('') || '<tr><td colspan="5"><div class="queue-empty"><strong>Обращения не найдены</strong><p>Измените запрос или нажмите «Сбросить фильтры» над списком.</p></div></td></tr>';
  document.querySelectorAll('[data-open-case]').forEach(button => button.onclick = () => openQueueCase(button.dataset.openCase));
}

function updateCaseWorkflow() {
  if (!activeCase) return;
  $('workflowStatus').textContent = workflowNames[activeCase.status];
  $('workflowStatus').className = `queue-status ${activeCase.status}`;
  $('caseOwner').textContent = activeCase.owner;
  $('caseReceived').textContent = activeCase.received;
  renderCaseTimeline();
  $('prepareRequest').disabled = dirty || !report?.issue_count || activeCase.status === 'waiting';
  $('prepareRequest').textContent = activeCase.status === 'waiting' ? 'Ожидает дополнения' : 'Зафиксировать запрос уточнения';
  $('approve').disabled = dirty || !report || !!report.issue_count || activeCase.status === 'done';
}

function openQueueCase(id) {
  saveActiveCase();
  activeCase = caseQueue.find(item => item.packet.case_id === id);
  if (!activeCase) return;
  if (activeCase.status === 'new') {activeCase.status = 'review'; addCaseEvent('Начата работа с обращением',activeCase.owner);}
  const savedStatus = activeCase.status;
  openingCase=true;
  install(clonePacket(activeCase.packet));
  if (activeCase.report) {
    render(activeCase.report);
    if (activeCase.dirty) markDirty();
  }
  $('draft').value = activeCase.draft || $('draft').value;
  $('reviewComment').value = activeCase.comment || '';
  activeCase.status = savedStatus;
  openingCase=false;
  if (activeCase.status === 'done') $('reviewStatus').textContent = 'Проверка сотрудником зафиксирована в этой демо-сессии.';
  updateCaseWorkflow(); showQueueView('case'); persistDemo();
}

async function initializeQueue() {
  if (document.body.dataset.authRequired === 'true') {
    if (!window.TRACE_SESSION?.userId || !window.TRACE_SESSION?.organizationId) throw Error('Нужны вход и организация.');
    DEMO_STORAGE_KEY = 'trace.synthetic-workspace.v2:' + JSON.stringify([window.TRACE_SESSION.userId,window.TRACE_SESSION.organizationId]);
  }
  const base = clonePacket(window.INITIAL_PACKET);
  for (const [id,customer,status,received,owner] of [
    ['O-2026-0042','ООО Ритм (синтетический пример)','new','19 октября · 10:20','Анна · специалист проверки'],
    ['O-2026-0043','ООО Вектор (синтетический пример)','review','19 октября · 09:45','Иван · специалист проверки'],
    ['O-2026-0044','ООО Контур (синтетический пример)','waiting','18 октября · 16:30','Анна · специалист проверки']
  ]) {
    const sample = clonePacket(base); sample.case_id = id; sample.customer = customer;
    caseQueue.push({packet:sample,status,received,owner,report:null,dirty:true,draft:'',comment:'',events:[]});
  }
  try {
    const raw=localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) {
      const saved=JSON.parse(raw);
      if (saved.version!==2 || !Array.isArray(saved.cases) || saved.cases.length<3 || saved.cases.length>100 || !Array.isArray(saved.revisions) || !Number.isSafeInteger(saved.counter)) throw Error('Неизвестный формат сохранения');
      for (const [index,item] of saved.cases.entries()) {
        if (!item.packet?.case_id || saved.cases.some((other,j)=>j!==index && other.packet?.case_id===item.packet.case_id) || !Array.isArray(item.packet.documents) || !Array.isArray(item.packet.transactions) || !Object.hasOwn(workflowNames,item.status) || !Array.isArray(item.events)) throw Error('Повреждённое сохранение');
      }
      caseQueue.splice(0,caseQueue.length,...saved.cases);
      for (const entry of saved.revisions) {if (!Array.isArray(entry) || entry.length!==2) throw Error('Повреждённая история');localRevisions.set(...entry);}
      localCounter=saved.counter;
      $('storageStatus').textContent='Восстановлено сохранённое демо в этом браузере';
    }
  } catch(error) { $('storageStatus').textContent='Сохранение не прочитано. Открыта новая демо-сессия.'; }
  $('resetDemo').onclick=()=>{
    if (!window.confirm('Удалить все обращения, документы, правки и историю в этом браузере?')) return;
    try {localStorage.removeItem(DEMO_STORAGE_KEY);} catch(error) {toast('Браузер не разрешил сброс.');return;}
    resettingDemo=true;
    location.reload();
  };
  for (const id of ['draft','reviewComment']) $(id).addEventListener('input',saveActiveCase);
  window.addEventListener('pagehide',saveActiveCase);
  $('queueSearch').oninput = renderQueue; $('queueFilter').onchange = renderQueue;
  const mobileNav=$('workspaceNav'),mobileNavToggle=$('mobileNavToggle');
  const closeMobileNav=()=>{mobileNav.classList.remove('is-open');mobileNavToggle.setAttribute('aria-expanded','false');};
  mobileNavToggle.onclick=()=>{const open=mobileNavToggle.getAttribute('aria-expanded')!=='true';mobileNavToggle.setAttribute('aria-expanded',String(open));mobileNav.classList.toggle('is-open',open);};
  mobileNav.addEventListener('click',event=>{if(event.target.closest('[data-tab]'))closeMobileNav();});
  mobileNav.addEventListener('keydown',event=>{if(event.key==='Escape'&&mobileNav.classList.contains('is-open')){closeMobileNav();mobileNavToggle.focus();}});

  $('backToQueue').onclick = () => showQueueView('queue');
  document.querySelector('[data-tab="queue"]').onclick = () => showQueueView('queue');
  document.querySelector('[data-tab="case"]').onclick = () => {
    if (!activeCase) openQueueCase(caseQueue[0].packet.case_id);
    else showQueueView('case');
  };
  document.querySelector('nav').addEventListener('click', event => {
    if (event.target.closest('[data-tab]')?.dataset.tab !== 'queue') document.querySelector('.demo-guide').hidden=true;
  });
  const originalCheck = check;
  check = async () => { const previous=report; await originalCheck(); if (activeCase && !dirty && report !== previous) {
    if (activeCase.status === 'done') activeCase.status = 'review';
    const baseline=activeCase.lastCheckedIssues;
    addCaseEvent('Выполнена проверка комплекта',`${report.issue_count} замечаний · ${report.rows.filter(x=>x.status==='complete').length}/${report.rows.length} групп без замечаний${Number.isInteger(baseline)?` · предыдущая проверка: ${baseline} замечаний`:''}`);
    activeCase.lastCheckedIssues=report.issue_count;
    saveActiveCase(); updateCaseWorkflow();
  }};
  $('analyze').onclick = check;
  const originalDirty = markDirty;
  markDirty = () => { originalDirty(); if (activeCase && !openingCase) {
    addCaseEvent('Комплект изменён',describeChanges(activeCase.packet,packet));
    activeCase.status='review'; updateCaseWorkflow(); saveActiveCase();
  } };
  async function loadVersion(corrected) {
    if (!activeCase) return;
    const sample = clonePacket(corrected ? window.CORRECTED_PACKET : window.INITIAL_PACKET);
    sample.case_id = activeCase.packet.case_id; sample.customer = activeCase.packet.customer;
    activeCase.status='review'; install(sample); setExample(corrected?'loadFixed':'loadDemo'); await check();
  }
  $('loadDemo').onclick = () => loadVersion(false);
  $('loadFixed').onclick = () => loadVersion(true);
  const originalInstall = install;
  install = value => {
    if (activeCase && value.case_id !== activeCase.packet.case_id) {
      throw Error('Идентификатор импорта не совпадает с открытым обращением.');
    }
    if (activeCase && !openingCase) addCaseEvent('Загружена версия комплекта',describeChanges(packet || activeCase.packet,value));
    originalInstall(value);
    if (activeCase) { activeCase.status='review'; updateCaseWorkflow(); }
  };
  $('prepareRequest').onclick = () => {
    if (!activeCase || dirty || !report?.issue_count) return;
    if ($('draft').value.trim().length < 10) {toast('Добавьте текст уточнения.'); return;}
    activeCase.status='waiting'; addCaseEvent('Зафиксирован запрос уточнения',$('draft').value); saveActiveCase(); updateCaseWorkflow();
    toast('Запрос зафиксирован в демо. Сообщение клиенту не отправлялось.');
  };
  $('approve').onclick = async () => {
    try {
      if (dirty || !report || report.issue_count) throw Error('Сначала проверьте актуальный комплект.');
      const result = await api('/api/approve',{revision:report.revision,comment:$('reviewComment').value});
      activeCase.status='done'; addCaseEvent('Проверка сотрудником завершена',$('reviewComment').value); saveActiveCase(); updateCaseWorkflow();
      $('reviewStatus').textContent=result.message; toast('Проверка сотрудника записана');
    } catch(error) {toast(error.message);}
  };
  showQueueView('queue');
}
