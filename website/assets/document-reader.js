/* File text extraction and conservative field proposals. No document upload API. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({bytes:20*1024*1024,pages:20,text:100000,pixels:12000000,batch:10});
  const VERSIONS = Object.freeze({pdf:'6.4.299',tesseract:'7.0.0'});
  const FIELD_LABELS = Object.freeze({kind:'Тип документа',number:'Номер документа',contract:'Номер договора',inn:'ИНН контрагента',date:'Дата документа',amount:'Итоговая сумма, ₽'});
  const TYPES = ['Договор','Акт','УПД','Пояснение'];
  const unique = values => [...new Set(values)];
  function clean(text) { return String(text).normalize('NFC').replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n'); }
  function money(value) {
    const s=String(value).replace(/[\s₽]/g,'').replace(/руб\.?/gi,'');
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
    const [r,k='']=s.replace(',','.').split('.');const cents=Number(r)*100+Number(k.padEnd(2,'0'));
    return Number.isSafeInteger(cents)?`${Number(r)}.${k.padEnd(2,'0')}`:null;
  }
  function dateValue(value) {
    const s=String(value).trim();let match=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match){const m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(!m)return null;match=[s,m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')];}
    const iso=`${match[1]}-${match[2]}-${match[3]}`;const d=new Date(iso+'T00:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;
  }
  function required(kind){return ['kind','number','contract','inn','date',...(['Акт','УПД'].includes(kind)?['amount']:[])];}
  function validate(fields){
    const errors={};for(const key of required(fields.kind))if(!String(fields[key]||'').trim())errors[key]='Не найдено в файле. Заполните по документу или запросите уточнение.';
    if(fields.kind&&!TYPES.includes(fields.kind))errors.kind='Выберите тип документа.';
    if(fields.inn&&!/^(\d{10}|\d{12})$/.test(fields.inn))errors.inn='ИНН должен содержать 10 или 12 цифр.';
    if(fields.date&&!dateValue(fields.date))errors.date='Проверьте дату документа.';
    if(fields.amount&&money(fields.amount)===null)errors.amount='Введите сумму цифрами, например 470000,00.';
    for(const key of ['number','contract'])if(fields[key]&&(fields[key].length>160||/[\r\n]/.test(fields[key])))errors[key]='Укажите один номер длиной до 160 символов.';
    return errors;
  }
  function extractFields(raw) {
    const text=clean(raw);if(text.length>LIMITS.text)throw Error('Текст документа превышает 100 000 символов. Разделите файл.');
    const lines=text.split('\n');const candidates=Object.fromEntries(Object.keys(FIELD_LABELS).map(k=>[k,[]]));
    function add(key,value,line,quote){if(value)candidates[key].push({value:String(value).trim(),line:line+1,quote:String(quote).trim()});}
    const aliases={'тип':'kind','тип документа':'kind','номер':'number','номер документа':'number','договор':'contract','номер договора':'contract','инн контрагента':'inn','дата':'date','дата документа':'date','сумма':'amount','итоговая сумма':'amount'};
    lines.forEach((line,i)=>{const m=line.match(/^\s*([^:]{2,30})\s*:\s*(.+)$/);if(m&&aliases[m[1].trim().toLowerCase()]){const key=aliases[m[1].trim().toLowerCase()];let v=m[2].trim();if(key==='kind')v=TYPES.find(t=>t.toLowerCase()===v.toLowerCase())||v;if(key==='date')v=dateValue(v)||v;if(key==='amount')v=money(v)||v;add(key,v,i,line);}});
    lines.forEach((line,i)=>{
      const type=line.match(/(?:^|\s)(Договор|Акт|УПД|Универсальный\s+передаточный\s+документ|Пояснение)(?=\s|$|[:№])/i);
      // A contract reference in a primary document is not a second document type.
      if(type&&i<12){const t=/универсальн|упд/i.test(type[1])?'УПД':TYPES.find(t=>t.toLowerCase()===type[1].toLowerCase());if(t&&(!candidates.kind.length||candidates.kind.some(x=>x.value===t)))add('kind',t,i,line);}
      for(const m of line.matchAll(/(?:^|[^\p{L}])ИНН(?:\s*\/\s*КПП)?(?:\s+(?:контрагента|поставщика|продавца|покупателя|заказчика|исполнителя))?\s*[:№]?\s*(\d{10}(?:\d{2})?)(?!\d)/giu))add('inn',m[1],i,line);
      for(const m of line.matchAll(/договор(?:а|у|ом)?\s*(?:поставки\s*)?(?:№|N\b|номер\s*[:]?|:)\s*([\p{L}\d][\p{L}\d/_.-]{0,100})/giu))add('contract',m[1],i,line);
      const n=line.match(/(?:^|\s)(Договор|Акт|УПД|Счет[- ]фактура|Универсальный передаточный документ)\s*(?:поставки\s*)?(?:№|N\b)\s*([\p{L}\d][\p{L}\d/_.-]{0,100})/iu);
      if(n){const headerKind=/счет|универсальн/i.test(n[1])?'УПД':TYPES.find(t=>t.toLowerCase()===n[1].toLowerCase());if(!candidates.kind.length||candidates.kind.some(c=>c.value===headerKind))add('number',n[2],i,line);}
      const dates=[...line.matchAll(/(?:от\s+|дата\s*:?\s*)(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})/gi)];
      if(dates.length&&(/^(?:\s*)(?:дата|договор|акт|упд|счет[- ]фактура|универсальный)/i.test(line)))for(const m of dates)add('date',dateValue(m[1])||m[1],i,line);
      const sum=line.match(/(?:всего\s+к\s+оплате|итого\s+к\s+оплате|итоговая\s+сумма|сумма\s+к\s+оплате|всего\s+с\s+НДС|общая\s+стоимость|итого\s+с\s+НДС)\s*[:=]?\s*([\d][\d\s]*(?:[.,]\d{1,2})?)(?:\s*(?:руб|₽)|\s*$)/i);
      if(sum)add('amount',money(sum[1])||sum[1].trim(),i,line);
    });
    const fields={},evidence={},states={};
    for(const key of Object.keys(FIELD_LABELS)){
      const all=candidates[key];const values=unique(all.map(x=>x.value));candidates[key]=values.map(value=>all.find(x=>x.value===value));
      fields[key]=values.length===1?values[0]:'';states[key]=values.length===1?'found':values.length?'ambiguous':'missing';
      if(values.length===1)evidence[key]=all.find(x=>x.value===values[0]);
    }
    const errors=validate(fields);for(const key of Object.keys(errors))if(fields[key])states[key]='invalid';
    return {fields,candidates,evidence,states,errors};
  }
  function canonical(fields){return [['Тип',fields.kind],['Номер',fields.number],['Договор',fields.contract],['ИНН контрагента',fields.inn],['Дата',dateValue(fields.date)||fields.date],...((fields.amount)?[['Сумма',money(fields.amount)||fields.amount]]:[])].map(([key,value])=>`${key}: ${value||''}`).join('\n');}
  function reviewedDocument(item,fields){
    const errors=validate(fields);if(Object.keys(errors).length)throw Error('Заполните обязательные поля документа.');
    const normalized={...fields,date:dateValue(fields.date),amount:fields.amount?money(fields.amount):''};const origins={};const evidence={};
    for(const key of Object.keys(FIELD_LABELS)){
      const choice=(item.candidates[key]||[]).find(x=>x.value===normalized[key]);
      origins[key]=!normalized[key]?'not_required':choice?'file':'manual';if(choice)evidence[key]=choice;
    }
    return {name:item.name,text:canonical(normalized),sourceText:item.sourceText,review:{version:1,confirmed:true,method:item.method,confidence:item.confidence??null,pages:item.pages,fields:normalized,origins,evidence,confirmedAt:new Date().toISOString()}};
  }
  let pdfPromise=null,scriptPromise=null,worker=null,creatingWorker=null,workerGeneration=0,currentProgress=()=>{};
  // Override paths with same-origin URLs for an isolated installation.
  const defaults={pdf:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdf}/build/pdf.mjs`,pdfWorker:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdf}/build/pdf.worker.mjs`,pdfFonts:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdf}/standard_fonts/`,pdfCmaps:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdf}/cmaps/`,pdfWasm:`https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSIONS.pdf}/wasm/`,tesseract:`https://cdn.jsdelivr.net/npm/tesseract.js@${VERSIONS.tesseract}/dist/tesseract.min.js`,worker:`https://cdn.jsdelivr.net/npm/tesseract.js@${VERSIONS.tesseract}/dist/worker.min.js`,core:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',lang:'https://tessdata.projectnaptha.com/4.0.0'};
  const config=()=>({...defaults,...root.TRACE_DOCUMENT_PATHS});
  function loadScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');const timer=setTimeout(()=>{s.remove();reject(Error('Модуль распознавания не загрузился за 60 секунд. Повторите попытку.'));},60000);s.src=url;s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('Не удалось загрузить модуль распознавания. Проверьте соединение и повторите.'))};document.head.append(s);});}
  async function getPDF(){if(!pdfPromise)pdfPromise=import(config().pdf).then(lib=>{lib.GlobalWorkerOptions.workerSrc=config().pdfWorker;return lib}).catch(error=>{pdfPromise=null;throw Error('Не удалось загрузить модуль PDF. Проверьте соединение и повторите.');});return pdfPromise;}
  async function getOCR(progress,signal){
    if(!scriptPromise)scriptPromise=loadScript(config().tesseract).catch(e=>{scriptPromise=null;throw e});await scriptPromise;abortCheck(signal);
    currentProgress=progress;
    if(!worker){progress('Загружаем языки распознавания. При первом запуске это может занять несколько минут.');const generation=workerGeneration;creatingWorker=root.Tesseract.createWorker('rus+eng',1,{workerPath:config().worker,corePath:config().core,langPath:config().lang,logger:m=>{if(m.status==='recognizing text')currentProgress('Распознаём текст: '+Math.round((m.progress||0)*100)+'%');}});let timer;const pending=creatingWorker;try{const result=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{workerGeneration++;pending.then(w=>w.terminate()).catch(()=>{});reject(Error('Распознавание не запустилось за 90 секунд. Проверьте соединение и повторите.'));},90000);})]);if(generation!==workerGeneration){await result.terminate();throw new DOMException('Обработка отменена.','AbortError');}worker=result;}finally{clearTimeout(timer);if(creatingWorker===pending)creatingWorker=null;}}
    return worker;
  }
  function abortable(promise,signal,onAbort=()=>{}){
    if(!signal)return promise;
    return new Promise((resolve,reject)=>{const cancel=()=>{onAbort();reject(new DOMException('Обработка отменена.','AbortError'));};if(signal.aborted){cancel();Promise.resolve(promise).catch(()=>{});return;}signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});});
  }
  async function ocr(image,progress,signal){
    const w=await abortable(getOCR(progress,signal),signal,()=>{stop().catch(()=>{});});abortCheck(signal);
    const cancel=()=>{if(worker===w)worker=null;w.terminate().catch(()=>{});};
    const result=await abortable(w.recognize(image),signal,cancel);abortCheck(signal);return {text:result.data.text,confidence:result.data.confidence};
  }
  async function stop(){workerGeneration++;const pending=creatingWorker;creatingWorker=null;if(pending)pending.then(w=>w.terminate()).catch(()=>{});if(worker){const w=worker;worker=null;await w.terminate();}}
  function abortCheck(signal){if(signal?.aborted)throw new DOMException('Обработка отменена.','AbortError');}
  async function fileKind(file){
    if(file.size>LIMITS.bytes)throw Error('Файл больше 20 МБ. Разделите его перед загрузкой.');
    const extension=file.name.split('.').pop().toLowerCase();if(!['pdf','png','jpg','jpeg','txt'].includes(extension))throw Error('Поддерживаются PDF, PNG, JPG, JPEG и TXT.');
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    const isPDF=String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
    if(extension==='pdf'&&!isPDF)throw Error('Содержимое файла не соответствует PDF.');
    if(['jpg','jpeg'].includes(extension)&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('Содержимое файла не соответствует JPEG.');
    if(extension==='png'&&!(bytes[0]===137&&String.fromCharCode(...bytes.slice(1,4))==='PNG'))throw Error('Содержимое файла не соответствует PNG.');
    return extension;
  }
  async function read(file,{progress=()=>{},signal}={}){
    abortCheck(signal);const kind=await fileKind(file);let text='',pages=1,method='text',confidence=null;
    if(kind==='txt')text=await file.text();
    else if(kind==='pdf'){
      const lib=await abortable(getPDF(),signal);abortCheck(signal);
      const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,standardFontDataUrl:config().pdfFonts,cMapUrl:config().pdfCmaps,cMapPacked:true,wasmUrl:config().pdfWasm});let pdf=null;const cancelPDF=()=>{task.destroy().catch(()=>{});};signal?.addEventListener('abort',cancelPDF,{once:true});
      try{
        pdf=await abortable(task.promise,signal,cancelPDF);pages=pdf.numPages;if(pages>LIMITS.pages)throw Error('В PDF больше 20 страниц. Разделите файл.');const chunks=[];let scanned=0;
        for(let n=1;n<=pages;n++){
          abortCheck(signal);progress(`Читаем PDF: страница ${n} из ${pages}.`);const page=await pdf.getPage(n);const content=await page.getTextContent();
          let part='';let lastY=null;for(const item of content.items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(lastY!==null&&Math.abs(y-lastY)>3)part+='\n';part+=item.str+(item.hasEOL?'\n':' ');lastY=y;}
          if(part.replace(/\s/g,'').length<30){
            const base=page.getViewport({scale:1});const scale=Math.min(2,Math.sqrt(LIMITS.pixels/(base.width*base.height)));const viewport=page.getViewport({scale});
            const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;abortCheck(signal);const result=await ocr(canvas,msg=>progress(`Страница ${n}/${pages}. ${msg}`),signal);part=result.text;confidence=confidence===null?result.confidence:Math.min(confidence,result.confidence);scanned++;}finally{canvas.width=1;canvas.height=1;}
          }
          chunks.push(`Страница ${n}\n${part}`);if(chunks.join('\n').length>LIMITS.text)throw Error('Слишком большой объём текста. Разделите PDF.');page.cleanup();
        }
        text=chunks.join('\n\n');method=scanned?'pdf-ocr':'pdf-text';
      }finally{signal?.removeEventListener('abort',cancelPDF);await task.destroy();}
    }else{
      const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>LIMITS.pixels)throw Error('Изображение больше 12 мегапикселей. Уменьшите размер.');abortCheck(signal);const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;try{canvas.getContext('2d').drawImage(bitmap,0,0);const result=await ocr(canvas,progress,signal);text=result.text;confidence=result.confidence;}finally{canvas.width=1;canvas.height=1;}}finally{bitmap.close();}method='image-ocr';
    }
    abortCheck(signal);text=clean(text);const parsed=extractFields(text);
    return {name:file.name,sourceText:text,pages,method,confidence,...parsed,empty:!text.trim()};
  }
  const api={LIMITS,VERSIONS,FIELD_LABELS,TYPES,extractFields,validate,canonical,reviewedDocument,dateValue,money,read,stop};
  root.TraceDocuments=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
