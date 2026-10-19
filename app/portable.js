/* Browser demo adapter. The Python server remains the reference implementation.
   No documents leave this page. Session revisions are non-authoritative. */
const localRevisions = new Map();
let localCounter=0;
function demoMoney(v){
  const s=String(v).replace(/[\s\u00a0]/g,'').replace(',','.');
  if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Нужна неотрицательная сумма с точностью до копейки');
  const [r,k='']=s.split('.');const n=Number(r)*100+Number(k.padEnd(2,'0'));
  if(!Number.isSafeInteger(n))throw Error('Слишком большая сумма');return n;
}
function demoParse(d){
  if(typeof d.text!=='string'||d.text.length>100000)throw Error('Документ должен содержать текст до 100 000 символов');
  const keys={'тип':'kind','номер':'number','договор':'contract','инн контрагента':'inn','сумма':'amount','дата':'date'};
  const kinds={'договор':'contract','акт':'primary','упд':'primary','пояснение':'explanation'};
  const fields={},anchors={},errors=[];
  d.text.split(/\r?\n/).forEach((line,i)=>{const at=line.indexOf(':');if(at<0)return;const k=keys[line.slice(0,at).trim().toLowerCase()];if(!k)return;if(k in fields)errors.push('Повторяющееся поле: '+k);fields[k]=line.slice(at+1).trim();anchors[k]={file:d.name,line:i+1,quote:line}});
  fields.kind=kinds[(fields.kind||'').toLowerCase()]||'unknown';
  for(const k of ['number','contract','inn'])if(!fields[k])errors.push('Не удалось извлечь поле: '+k);
  if(fields.kind==='unknown')errors.push('Не удалось определить тип документа');
  if(fields.inn&&!/^(\d{10}|\d{12})$/.test(fields.inn))errors.push('Некорректный формат ИНН');
  if(fields.kind==='primary'){try{fields.amount_cents=demoMoney(fields.amount||'')}catch{errors.push('Не удалось прочитать сумму первичного документа')}}
  return {...d,fields,anchors,errors};
}
function validateDemo(p){
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Пакет должен быть JSON-объектом');
  if(p.profile!=='supply-v1')throw Error('Неизвестный профиль требований');
  if(typeof p.case_id!=='string'||!/^[-\wА-Яа-яЁё]{1,80}$/.test(p.case_id))throw Error('Некорректный идентификатор дела');
  if(typeof p.customer!=='string'||!p.customer||p.customer.length>200)throw Error('Укажите наименование клиента');
  if(!Array.isArray(p.transactions)||p.transactions.length<1||p.transactions.length>300)throw Error('Требуется от 1 до 300 операций');
  if(!Array.isArray(p.documents)||p.documents.length>300)throw Error('Допускается до 300 документов');
  const ids=new Set(),names=new Set();
  for(const t of p.transactions){for(const k of ['id','contract','inn','counterparty','date','settlement'])if(typeof t[k]!=='string'||!t[k]||t[k].length>200)throw Error('Некорректное поле операции: '+k);if(ids.has(t.id))throw Error('Повторяющийся ID операции');ids.add(t.id);if(!/^(\d{10}|\d{12})$/.test(t.inn))throw Error('Некорректный формат ИНН операции');if(!['full','advance'].includes(t.settlement))throw Error('Укажите режим full или advance');demoMoney(t.amount);if(!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||isNaN(Date.parse(t.date))||new Date(t.date).toISOString().slice(0,10)!==t.date)throw Error('Некорректная дата операции')}
  for(const d of p.documents){if(typeof d.name!=='string'||!d.name||d.name.length>200||typeof d.text!=='string')throw Error('Некорректный документ');if(names.has(d.name))throw Error('Имена документов должны быть уникальны');names.add(d.name)}
}
async function hashDemo(s){const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(a),v=>v.toString(16).padStart(2,'0')).join('')}
async function analyzeDemo(p){
  validateDemo(p);const docs=p.documents.map(demoParse),issues=[],groups=new Map(),hashes=new Map(),duplicates=new Set();
  const fmt=n=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
  const add=(code,title,detail,contract=null,evidence=[],action=detail)=>issues.push({code,title,detail,contract,evidence,action});
  for(const d of docs){d.sha256=await hashDemo(d.text);if(d.errors.length)add('EXTRACTION','Нужна проверка реквизитов',d.name+': '+d.errors.join('; '),null,[{file:d.name,line:1,quote:'Проверьте исходный текст'}]);if(hashes.has(d.sha256)){duplicates.add(d.name);add('DUPLICATE','Копия документа',d.name+' повторяет '+hashes.get(d.sha256),null,[{file:d.name,line:1,quote:'Совпадает SHA-256 содержимого'}],'Подтвердите, какой экземпляр документа использовать.')}hashes.set(d.sha256,d.name)}
  for(const t of p.transactions){const key=JSON.stringify([t.contract,t.inn]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)}
  const rows=[];
  for(const [key,txs]of groups){const[contract,inn]=JSON.parse(key),start=issues.length,related=docs.filter(d=>d.fields.contract===contract&&!duplicates.has(d.name)),correct=related.filter(d=>d.fields.inn===inn&&!d.errors.length);
    for(const d of related)if(d.fields.inn!==inn)add('INN','Не совпадает контрагент',`По договору ${contract} ожидается ИНН ${inn}; в ${d.name} указан ${d.fields.inn||'не извлечён'}.`,contract,[d.anchors.inn||{file:d.name,line:1,quote:'ИНН не извлечён'}],`По договору ${contract} уточните контрагента: ИНН операции ${inn} не совпадает с документом ${d.name}.`);
    const contracts=correct.filter(d=>d.fields.kind==='contract'),primary=correct.filter(d=>d.fields.kind==='primary');
    if(!contracts.length)add('MISSING_CONTRACT','Не найден договор',`Нужен договор ${contract} с контрагентом ${txs[0].counterparty} (ИНН ${inn}).`,contract);
    if(contracts.length>1)add('AMBIGUOUS_CONTRACT','Несколько экземпляров договора',`По ${contract} найдено несколько договоров. Выбор требует проверки сотрудника.`,contract,contracts.map(d=>d.anchors.number));
    const schemes=new Set(txs.map(t=>t.settlement)),full=schemes.size===1&&schemes.has('full');
    if(schemes.size>1)add('MIXED_SETTLEMENT','Нужно уточнить схему оплаты',`В группе ${contract} смешаны аванс и окончательный расчёт. Автосверка суммы отключена.`,contract);
    if(full){if(!primary.length)add('MISSING_PRIMARY','Не найден акт или УПД',`По договору ${contract} для заявленного полного расчёта нужен акт или УПД с ИНН ${inn}.`,contract);else{const paid=txs.reduce((s,t)=>s+demoMoney(t.amount),0),total=primary.reduce((s,d)=>s+d.fields.amount_cents,0);if(total!==paid)add('AMOUNT','Нужно пояснить разницу сумм',`По ${contract}: операции ${fmt(paid)} ₽; акты/УПД ${fmt(total)} ₽. Разница ${fmt(Math.abs(total-paid))} ₽. Это запрос пояснения, а не вывод о нарушении.`,contract,primary.map(d=>d.anchors.amount),`По договору ${contract} поясните разницу ${fmt(Math.abs(total-paid))} ₽ между суммой операций и актов/УПД либо дополните комплект.`)}}
    rows.push({contract,inn,counterparty:txs[0].counterparty,transaction_ids:txs.map(t=>t.id),amount:txs.reduce((s,t)=>s+demoMoney(t.amount),0)/100,settlement:full?'full':'advance_or_mixed',documents:related.map(d=>d.name),issue_count:issues.length-start,status:issues.length>start?'needs_review':'complete'});
  }
  const requested=new Set([...groups.keys()].map(k=>JSON.parse(k)[0]));
  for(const d of docs)if(!requested.has(d.fields.contract))add('UNLINKED','Документ не связан с запросом',d.name+' не удалось связать с запрошенными договорами.',null,[{file:d.name,line:1,quote:'Связь с запрошенной операцией не подтверждена'}]);
  const actions=[...new Set(issues.map(i=>i.action))],draft=actions.length?`Коллеги, мы проверили комплект по обращению ${p.case_id}.\n\nДля продолжения рассмотрения просим уточнить:\n${actions.map((a,i)=>`${i+1}. ${a}`).join('\n')}\n\nПросим дополнить текущий комплект. Повторно отправлять остальные документы не требуется. После получения уточнений сотрудник банка продолжит рассмотрение.`:`Комплект по обращению ${p.case_id} соответствует выбранному профилю supply-v1. Сотрудник должен проверить содержание, подлинность и достаточность документов для конкретного процесса.`;
  return {version:'0.1.0-browser',profile:p.profile,case_id:p.case_id,customer:p.customer,rows,issues,documents:docs,draft,state:issues.length?'needs_review':'complete',issue_count:issues.length,transaction_count:p.transactions.length,document_count:docs.length,scope:'Проверка комплектности по демонстрационному профилю. Решение по операции принимает сотрудник банка. Подписи и подлинность не проверены.'};
}
function economicsDemo(data){
  const defaults={cases:60000,eligible:.6,adoption:.7,minutes_saved:6,hour_cost:900,realization:.5,development:1800000,integration:600000,annual_opex:1200000},d={...defaults,...data};
  for(const[k,v]of Object.entries(d)){if(!(k in defaults)||typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('Некорректное допущение: '+k)}for(const k of ['eligible','adoption','realization'])if(d[k]>1)throw Error('Доля должна быть от 0 до 1: '+k);
  const processed=d.cases*d.eligible*d.adoption,hours=processed*d.minutes_saved/60,capacity=hours*d.hour_cost,cash=capacity*d.realization,net=cash-d.annual_opex,unit=d.eligible*d.adoption*d.minutes_saved/60*d.hour_cost*d.realization;
  return {inputs:d,processed,hours,capacity_value:capacity,realized_value:cash,net_annual:net,payback_months:net>0?(d.development+d.integration)/net*12:null,opex_break_even_cases:unit>0?d.annual_opex/unit:null,first_year_break_even_cases:unit>0?(d.annual_opex+d.development+d.integration)/unit:null};
}
async function localApi(path,data){
  if(path==='/api/demo')return structuredClone(window.INITIAL_PACKET);
  if(path==='/api/demo-fixed')return structuredClone(window.CORRECTED_PACKET);
  if(path==='/api/analyze'){const r=await analyzeDemo(data);r.revision='demo-'+(++localCounter);r.packet_sha256=await hashDemo(JSON.stringify(data));localRevisions.set(r.revision,{created:new Date().toISOString(),report:structuredClone(r)});return r}
  if(path==='/api/economics')return economicsDemo(data);
  if(path==='/api/history')return [...localRevisions.entries()].reverse().map(([id,r])=>({id,created:r.created,case_id:r.report.case_id,digest:r.report.packet_sha256}));
  if(path.startsWith('/api/revision/')){const r=localRevisions.get(path.split('/').pop());if(!r)throw Error('Версия не найдена');return structuredClone(r.report)}
  if(path==='/api/approve'){const r=localRevisions.get(data.revision);if(!r)throw Error('Версия не найдена');if(r.report.issue_count)throw Error('Есть неразрешённые замечания');if(typeof data.comment!=='string'||data.comment.trim().length<5||data.comment.length>2000)throw Error('Укажите комментарий сотрудника (5–2000 символов)');return{message:'В демо записана проверка комплектности сотрудником. Банковское решение не принято.'}}
  throw Error('Неизвестное действие');
}
