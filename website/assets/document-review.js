/* Employee workflow additions. The landing page and Clerk code are untouched. */
(function () {
  'use strict';
  const D=window.TraceDocuments;
  let busy=false,controller=null,selectedPayment=null,currentReview=null,previewURL=null;
  const originals=new Map();
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
  function records(){if(!activeCase)return [];activeCase.recognition ||= [];return activeCase.recognition;}
  const keyFor=(name)=>JSON.stringify([activeCase?.packet.case_id,name]);
  function go(id){const target=$(id);if(!target)return;target.scrollIntoView({behavior:reducedMotion.matches?'auto':'smooth',block:'start'});}
  function plain(text){return String(text).replace(/ — /g,': ').replace(/\bEXTRACTION\b/g,'Проверка данных');}
  function showUploadMessage(text){$('uploadState').textContent=text;}
  function setBusy(value){
    busy=value;
    for(const id of ['uploadFiles','addDoc','analyze','importBtn','loadDemo','loadFixed','backToQueue','newCaseButton','resetDemo','prepareRequest','approve','deleteDoc','copyDraft','export','reviewDocument']){
      const n=$(id);if(n){if(value){n.dataset.beforeUploadDisabled=String(n.disabled);n.disabled=true}else if(n.dataset.beforeUploadDisabled!==undefined){n.disabled=n.dataset.beforeUploadDisabled==='true';delete n.dataset.beforeUploadDisabled;}}
    }
    document.querySelectorAll('.shell-side nav button').forEach(b=>b.disabled=value);
    $('cancelUpload').hidden=!value;$('uploadDrop').classList.toggle('processing',value);
    if(!value)refreshGuards();
  }
  function refreshGuards(){
    const pending=records().some(x=>!x.confirmed);const unreviewed=packet?.documents.some(d=>d.review&&!d.review.confirmed);
    if(pending||unreviewed||busy){$('approve').disabled=true;$('prepareRequest').disabled=true;}
    if(pending||unreviewed){$('reviewStatus').textContent='Сначала проверьте поля загруженных документов или уберите ненужные файлы.';}
  }
  function renderRecognitions(){
    $('recognitionList').replaceChildren();
    for(const item of records()){
      const card=node('article',undefined,'recognition-card');const heading=node('div',undefined,'recognition-heading');heading.append(node('strong',item.name));
      const status=item.error?'Не удалось прочитать':item.processing?'Обработка':item.confirmed?'Поля подтверждены':'Нужно проверить поля';heading.append(node('span',status,'recognition-status'+(item.confirmed?' confirmed':'')));card.append(heading);
      if(item.error)card.append(node('p',item.error,'err'));
      else if(!item.processing){
        const missing=Object.keys(D.validate(item.fields||{})).map(k=>D.FIELD_LABELS[k]);const ambiguous=Object.keys(item.states||{}).filter(k=>item.states[k]==='ambiguous').map(k=>D.FIELD_LABELS[k]);
        if(missing.length)card.append(node('p','Не хватает данных для проверки: '+missing.join(', ')+'.','small'));
        if(ambiguous.length)card.append(node('p','В файле несколько вариантов: '+ambiguous.join(', ')+'. Выберите нужный.','small'));
        if(!missing.length&&!item.confirmed)card.append(node('p','Данные извлечены. Сверьте их с файлом и подтвердите.','small'));
        if(item.confidence!==null&&item.confidence!==undefined&&item.confidence<75)card.append(node('p','Текст распознан с низкой уверенностью. Проверьте все значения по оригиналу.','small warning'));
      }
      const actions=node('div',undefined,'recognition-actions');
      if(!item.processing){const edit=node('button',item.confirmed?'Посмотреть поля':'Проверить и дополнить');edit.onclick=()=>openReview(item);actions.append(edit);}
      const remove=node('button','Убрать файл');remove.disabled=busy;remove.onclick=()=>removeRecord(item);actions.append(remove);card.append(actions);$('recognitionList').append(card);
    }
    refreshGuards();
  }
  function removeRecord(item){
    if(busy)return;if(!window.confirm('Убрать '+item.name+' из текущего обращения?'))return;
    const list=records();list.splice(list.indexOf(item),1);packet.documents=packet.documents.filter(d=>d.name!==item.name);originals.delete(keyFor(item.name));docIndex=Math.min(docIndex,Math.max(0,packet.documents.length-1));docs();markDirty();renderRecognitions();saveActiveCase();
  }
  async function upload(files){
    if(busy||!activeCase)return;
    const batch=Array.from(files);if(!batch.length)return;if(batch.length>D.LIMITS.batch){toast('Выберите не больше 10 файлов за один раз.');return;}
    const target=activeCase;controller=new AbortController();setBusy(true);let loaded=0;
    try{
      for(let i=0;i<batch.length;i++){
        if(controller.signal.aborted)break;const file=batch[i];
        const old=records().find(x=>x.name===file.name);const oldDocument=packet.documents.find(d=>d.name===file.name);
        if((old||oldDocument)&&!window.confirm('В обращении уже есть '+file.name+'. Заменить новой версией после распознавания?'))continue;
        if(packet.documents.length>=300&&!oldDocument)throw Error('В обращении может быть не больше 300 документов.');
        const item={name:file.name,processing:true,confirmed:false,fields:{},states:{},candidates:{},sourceText:'',error:'',confidence:null};
        // The previous confirmed document is preserved until reading succeeds.
        showUploadMessage(`Файл ${i+1} из ${batch.length}: ${file.name}.`);
        const progress=text=>showUploadMessage(`${file.name}: ${text}`);
        try{
          const read=await D.read(file,{progress,signal:controller.signal});
          if(activeCase!==target||controller.signal.aborted)break;
          Object.assign(item,read,{processing:false});
          if(read.empty)item.error='Текст не найден. Добавьте более чёткий файл или заполните поля вручную по оригиналу.';
          if(old)records().splice(records().indexOf(old),1);
          records().push(item);originals.set(keyFor(file.name),file);
          const pending={name:file.name,text:'',sourceText:item.sourceText,review:{confirmed:false,method:item.method,pages:item.pages}};
          const at=packet.documents.findIndex(d=>d.name===file.name);if(at>=0)packet.documents[at]=pending;else packet.documents.push(pending);
          docIndex=packet.documents.findIndex(d=>d.name===file.name);docs();markDirty();loaded++;renderRecognitions();saveActiveCase();
        }catch(error){
          if(controller.signal.aborted||error.name==='AbortError')break;
          item.processing=false;item.error=error.message||'Не удалось прочитать файл.';
          // Failed files do not replace previously confirmed versions.
          if(!old&&!oldDocument){records().push(item);saveActiveCase();}
          showUploadMessage(file.name+': '+item.error);renderRecognitions();
        }
      }
      showUploadMessage(controller.signal.aborted?'Обработка отменена. Уже прочитанные документы сохранены.':`Прочитано файлов: ${loaded}. Проверьте поля каждого документа перед анализом.`);
    }catch(error){showUploadMessage(error.message);}finally{await D.stop().catch(()=>{});controller=null;setBusy(false);renderRecognitions();}
  }
  function getFormFields(){const fields={};for(const k of Object.keys(D.FIELD_LABELS))fields[k]=$('field-'+k).value.trim();return fields;}
  function refreshFieldHints(){
    if(!currentReview)return;const fields=getFormFields(),errors=D.validate(fields);
    for(const key of Object.keys(D.FIELD_LABELS)){
      const input=$('field-'+key),hint=$('hint-'+key),choices=currentReview.candidates[key]||[];const match=choices.find(x=>x.value===fields[key]);
      input.setAttribute('aria-invalid',String(!!errors[key]));
      if(errors[key]){hint.textContent=!fields[key]&&choices.length>1?'Найдено несколько вариантов. Выберите значение по документу.':errors[key];hint.className='field-hint err';}
      else if(!fields[key]){hint.textContent='Для этого типа документа поле необязательно.';hint.className='field-hint';}
      else if(match){hint.textContent='Найдено в файле, строка '+match.line+'. Сверьте с оригиналом.';hint.className='field-hint';}
      else{hint.textContent='Введено аналитиком. Это значение не подтверждено распознанным текстом.';hint.className='field-hint manual';}
    }
    $('confirmFields').disabled=!!Object.keys(errors).length;
    const missing=Object.keys(errors).map(k=>D.FIELD_LABELS[k]);$('reviewMissing').textContent=missing.length?'Для анализа заполните: '+missing.join(', ')+'.':'Обязательные поля заполнены. Подтвердите, что сверили их с документом.';
  }
  function openReview(item){
    if(busy)return;currentReview=item;$('recognitionTitle').textContent='Данные документа: '+item.name;$('reviewError').textContent='';$('recognitionSource').textContent=item.sourceText||'Распознанного текста нет. Можно заполнить сведения вручную по оригиналу.';$('recognitionForm').replaceChildren();
    for(const [key,label]of Object.entries(D.FIELD_LABELS)){
      const box=node('div',undefined,'recognition-field');const l=node('label',label);l.htmlFor='field-'+key;
      let input;if(key==='kind'){input=node('select');input.append(new Option('Выберите тип',''));for(const kind of D.TYPES)input.append(new Option(kind,kind));}else{input=node('input');input.type=key==='date'?'date':'text';input.maxLength=key==='inn'?12:160;if(['inn','amount'].includes(key))input.inputMode=key==='inn'?'numeric':'decimal';}
      input.id='field-'+key;input.value=item.fields[key]||'';input.setAttribute('aria-describedby','hint-'+key);input.oninput=refreshFieldHints;const hint=node('p',undefined,'field-hint');hint.id='hint-'+key;box.append(l,input,hint);
      if((item.candidates[key]||[]).length>1){const choices=node('div',undefined,'field-choices');for(const c of item.candidates[key]){const b=node('button',c.value+' (строка '+c.line+')');b.type='button';b.onclick=()=>{input.value=c.value;refreshFieldHints();};choices.append(b);}box.append(choices);}
      $('recognitionForm').append(box);
    }
    if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;const original=originals.get(keyFor(item.name));$('originalPreview').replaceChildren();
    if(original){previewURL=URL.createObjectURL(original);if(/\.(png|jpe?g)$/i.test(item.name)){const img=node('img');img.src=previewURL;img.alt='Оригинал '+item.name;$('originalPreview').append(img);}else if(/\.pdf$/i.test(item.name)){const link=node('a','Открыть исходный PDF в новой вкладке');link.href=previewURL;link.target='_blank';link.rel='noopener';$('originalPreview').append(link);}}
    else $('originalPreview').textContent='Оригинал файла не хранится после обновления страницы. Ниже доступен извлечённый текст.';
    refreshFieldHints();$('recognitionDialog').showModal();
  }
  function openCurrentDocument(){
    const d=packet?.documents[docIndex];if(!d)return;
    let item=records().find(x=>x.name===d.name);
    if(!item){const source=d.sourceText||d.text;const parsed=D.extractFields(source);item={name:d.name,sourceText:source,method:'text',pages:1,confidence:null,confirmed:true,...parsed};records().push(item);}
    openReview(item);
  }
  function makeDialogs(){
    const dialog=node('dialog');dialog.id='recognitionDialog';dialog.setAttribute('aria-labelledby','recognitionTitle');
    dialog.innerHTML='<div class="recognition-heading"><h2 id="recognitionTitle">Данные документа</h2><button id="closeRecognition">Закрыть</button></div><p>Проверьте значения по оригиналу. Неизвестные поля заполните вручную или запросите у клиента.</p><p id="reviewMissing" role="status"></p><div class="recognition-columns"><div><div id="recognitionForm"></div><p id="reviewError" class="err" role="status"></p><button id="confirmFields" class="primary">Подтвердить поля и добавить к проверке</button></div><div><h3>Исходный файл и текст</h3><div id="originalPreview"></div><pre id="recognitionSource"></pre></div></div>';
    document.body.append(dialog);$('closeRecognition').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;currentReview=null;});
    $('confirmFields').onclick=()=>{
      try{if(!currentReview)return;const fields=getFormFields(),d=D.reviewedDocument(currentReview,fields);const index=packet.documents.findIndex(x=>x.name===d.name);if(index>=0)packet.documents[index]=d;else{if(packet.documents.length>=300)throw Error('Достигнут предел в 300 документов.');packet.documents.push(d);}
        currentReview.fields=d.review.fields;currentReview.confirmed=true;currentReview.error='';docIndex=packet.documents.findIndex(x=>x.name===d.name);docs();markDirty();addCaseEvent('Проверены поля документа',d.name+'. Ручной ввод: '+Object.entries(d.review.origins).filter(([,v])=>v==='manual').map(([k])=>D.FIELD_LABELS[k]).join(', '));renderRecognitions();saveActiveCase();dialog.close();toast('Поля сохранены. Запустите проверку документов.');
      }catch(error){$('reviewError').textContent=error.message;}
    };
    const create=node('dialog');create.id='newCaseDialog';create.setAttribute('aria-labelledby','newCaseTitle');create.innerHTML='<h2 id="newCaseTitle">Новое обращение</h2><form id="newCaseForm"><label for="newCustomer">Название клиента</label><input id="newCustomer" required maxlength="200" placeholder="ООО Пример"/><p class="small muted">Начните с документов клиента, затем добавьте платежи для сравнения.</p><p id="newCaseError" class="err" role="status"></p><div class="recognition-actions"><button type="submit" class="primary">Создать обращение</button><button type="button" id="cancelNewCase">Отмена</button></div></form>';document.body.append(create);
    $('newCaseButton').onclick=()=>{$('newCaseError').textContent='';create.showModal();};$('cancelNewCase').onclick=()=>create.close();
    $('newCaseForm').onsubmit=event=>{event.preventDefault();const name=$('newCustomer').value.trim();if(!name)return;if(caseQueue.length>=100){$('newCaseError').textContent='В браузере можно хранить не больше 100 обращений.';return;}saveActiveCase();const p={profile:'supply-v1',case_id:'O-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),customer:name,documents:[],transactions:[]};caseQueue.push({packet:p,status:'new',received:new Date().toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК',owner:'Аналитик',report:null,dirty:true,draft:'',comment:'',events:[],recognition:[]});create.close();$('newCaseForm').reset();openQueueCase(p.case_id);};
  }
  function renderPayments(){
    if(!packet)return;$('paymentSummary').textContent='('+packet.transactions.length+')';$('paymentList').replaceChildren();
    for(const t of packet.transactions){const row=node('div',undefined,'payment-summary-row');row.append(node('span',`${t.id}: ${rub(Number(t.amount))} · ${t.counterparty} · Договор ${t.contract}`));const remove=node('button','Убрать платёж');remove.onclick=()=>{if(busy)return;packet.transactions=packet.transactions.filter(x=>x.id!==t.id);markDirty();renderPayments();};row.append(remove);$('paymentList').append(row);}
    if(!packet.transactions.length)$('paymentList').append(node('p','Платежей пока нет. Вы можете прочитать документы и заполнить их поля. Для сравнения добавьте хотя бы один платёж.','small muted'));
  }
  function renderSelectedIssues(){
    if(!report)return;const row=selectedPayment===null?null:report.rows[selectedPayment];$('selectedPayment').textContent=row?'Платежи '+row.transaction_ids.join(', ')+'. Договор '+row.contract+'. Общие вопросы по документам также показаны.':'Все замечания по всем платежам';
    const items=row?report.issues.filter(i=>i.contract===row.contract||i.contract===null):report.issues;$('issues').replaceChildren();
    if(!items.length){$('issues').append(node('p','По выбранным платежам замечаний нет. Содержание и подлинность документов проверяет сотрудник.','success-message'));return;}
    for(const issue of items){const card=node('article',undefined,'issue');card.append(node('h3',plain(issue.title)),node('p',plain(localizeMoney(issue.detail))));card.append(node('p','Следующий шаг: '+plain(issue.action||issue.detail),'issue-next'));
      for(const e of issue.evidence){const b=node('button','Посмотреть '+e.file+' · строка '+e.line,'evidence');b.onclick=()=>showEvidence(e);card.append(b);}$('issues').append(card);}
  }
  function decorateReport(){
    if(!report)return;document.querySelectorAll('#rows .map-row').forEach((row,i)=>{row.classList.toggle('selected-payment',selectedPayment===i);const b=node('button','Посмотреть замечания','select-payment');b.setAttribute('aria-pressed',String(selectedPayment===i));b.onclick=()=>{selectedPayment=i;decorateReport();renderSelectedIssues();};row.querySelector('.select-payment')?.remove();row.querySelector('.operation-node').append(b);});renderSelectedIssues();
    $('caseState').textContent=dirty?'Нужна повторная проверка':report.issue_count?'Есть вопросы к документам':'По правилам замечаний нет';
    $('completion').title='Платежи сгруппированы по договору и ИНН. У одной причины может быть несколько замечаний.';
  }
  async function initialize(){
    makeDialogs();
    $('uploadFiles').onclick=()=>$('documentFiles').click();$('addDoc').onclick=$('uploadFiles').onclick;
    $('documentFiles').onchange=e=>{const files=Array.from(e.target.files);e.target.value='';upload(files);};
    const drop=$('uploadDrop');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragging');});for(const event of ['dragleave','drop'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('dragging');});drop.addEventListener('drop',e=>upload(e.dataTransfer.files));
    $('cancelUpload').onclick=()=>{controller?.abort();D.stop().catch(()=>{});showUploadMessage('Отменяем обработку...');};
    $('reviewDocument').onclick=openCurrentDocument;$('docText').readOnly=true;$('docText').oninput=null;
    $('allPaymentIssues').onclick=()=>{selectedPayment=null;decorateReport();};
    const originalDocs=docs;docs=()=>{originalDocs();const d=packet?.documents[docIndex];$('docText').value=d?(d.sourceText??d.text):'';$('docText').readOnly=true;$('reviewDocument').disabled=!d;$('saveDoc').hidden=true;};
    const oldRender=render;render=r=>{oldRender(r);decorateReport();refreshGuards();};
    const oldDirty=markDirty;markDirty=()=>{oldDirty();refreshGuards();};
    const oldOpen=openQueueCase;openQueueCase=id=>{if(busy){toast('Дождитесь обработки файлов или отмените её.');return;}selectedPayment=null;oldOpen(id);records().forEach(x=>{x.processing=false;});renderRecognitions();renderPayments();docs();decorateReport();$('docCount').textContent=packet.documents.length;};
    const oldCheck=check;check=async()=>{
      if(busy)return;
      if(records().some(x=>!x.confirmed)||packet?.documents.some(d=>d.review&&!d.review.confirmed)){toast('Сначала проверьте поля загруженных документов.');go('uploadSection');return;}
      if(!packet?.transactions.length){toast('Добавьте хотя бы один платёж для сравнения с документами.');$('paymentSection').open=true;go('paymentSection');return;}
      selectedPayment=null;await oldCheck();decorateReport();refreshGuards();
    };$('analyze').onclick=check;
    const oldEvidence=showEvidence;showEvidence=e=>{const doc=packet?.documents.find(d=>d.name===e.file);if(doc?.review){docIndex=packet.documents.indexOf(doc);openCurrentDocument();}else oldEvidence(e);};
    const oldWorkflow=updateCaseWorkflow;updateCaseWorkflow=()=>{oldWorkflow();refreshGuards();};
    for(const id of ['loadDemo','loadFixed']){const old=$(id).onclick;$(id).onclick=async()=>{if(busy)return;if(records().length&&!window.confirm('Заменить документы, платежи и распознанные поля этого обращения учебным примером?'))return;activeCase.recognition=[];await old();renderRecognitions();renderPayments();};}
    $('deleteDoc').onclick=()=>{if(busy)return;const d=packet?.documents[docIndex];if(!d||!window.confirm('Убрать '+d.name+' из обращения?'))return;const item=records().find(x=>x.name===d.name);if(item)records().splice(records().indexOf(item),1);packet.documents.splice(docIndex,1);docIndex=Math.max(0,docIndex-1);docs();markDirty();renderRecognitions();};
    $('paymentForm').onsubmit=e=>{e.preventDefault();if(busy)return;try{const f=e.target;const t=Object.fromEntries(new FormData(f));t.amount=D.money(t.amount);if(t.amount===null)throw Error('Проверьте сумму платежа.');if(!D.dateValue(t.date))throw Error('Проверьте дату платежа.');if(packet.transactions.some(x=>x.id===t.id))throw Error('Платёж с таким номером уже есть.');if(packet.transactions.length>=300)throw Error('Можно добавить не больше 300 платежей.');packet.transactions.push(t);markDirty();renderPayments();f.reset();$('paymentError').textContent='';}catch(error){$('paymentError').textContent=error.message;}};
    const oldImport=$('importFile').onchange;$('importFile').onchange=async e=>{if(busy)return;const previous=packet;await oldImport(e);if(packet!==previous){activeCase.recognition=packet.documents.filter(d=>d.review).map(d=>({...D.extractFields(d.sourceText||d.text),name:d.name,sourceText:d.sourceText||'',fields:d.review.fields||D.extractFields(d.text).fields,confirmed:!!d.review.confirmed,method:d.review.method||'text',pages:d.review.pages||1,confidence:d.review.confidence??null}));saveActiveCase();}renderRecognitions();renderPayments();};
    // A pending read is never allowed to finish into another account or case.
    window.addEventListener('pagehide',()=>{controller?.abort();D.stop().catch(()=>{});});
  }
  const oldInitialize=initializeQueue;initializeQueue=async()=>{await oldInitialize();await initialize();};
})();
