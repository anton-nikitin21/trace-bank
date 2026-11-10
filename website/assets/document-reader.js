/* File text extraction and conservative field proposals. No document upload API. */
(function (root) {
  'use strict';
  const LIMITS = Object.freeze({bytes:20*1024*1024,pages:20,text:100000,pixels:12000000,batch:10});
  const VERSIONS = Object.freeze({pdf:'6.4.299',tesseract:'7.0.0'});
  const FIELD_LABELS = Object.freeze({kind:'Тип документа',number:'Номер документа',contract:'Номер договора',inn:'ИНН контрагента',date:'Дата документа',amount:'Итоговая сумма, ₽'});
  const TYPES = ['Договор','Акт','УПД','Пояснение'];
  function clean(text) { return String(text).normalize('NFC').replace(/[\u00a0\u202f]/g,' ').replace(/\r\n?/g,'\n'); }
  function money(value) {
    const s=String(value).replace(/[\s₽]/g,'').replace(/руб\.?/gi,'').replace(/^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/,(_,group,cents)=>group.replace(/\./g,'')+','+cents);
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(s)) return null;
    const [r,k='']=s.replace(',','.').split('.');const cents=Number(r)*100+Number(k.padEnd(2,'0'));
    return Number.isSafeInteger(cents)?`${Number(r)}.${k.padEnd(2,'0')}`:null;
  }
  function dateValue(value) {
    const s=String(value).trim();let match=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!match){const m=s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);if(m)match=[s,m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')];
      else {
        const written=s.toLowerCase().match(/^[«„"]?(\d{1,2})[»“"]?\s+([а-яё]+)\s+(\d{4})$/u);
        if(!written)return null;
        const months=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
        const month=months.indexOf(written[2])+1;
        if(!month)return null;
        match=[s,written[3],String(month).padStart(2,'0'),written[1].padStart(2,'0')];
      }}
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
    const text=clean(raw);
    if(text.length>LIMITS.text)throw Error('Текст документа превышает 100 000 символов. Разделите файл.');
    const lines=text.split('\n');
    const candidates=Object.fromEntries(Object.keys(FIELD_LABELS).map(key=>[key,[]]));
    const aliases={'тип':'kind','тип документа':'kind','номер':'number','номер документа':'number','договор':'contract','номер договора':'contract','инн контрагента':'inn','дата':'date','дата документа':'date','сумма':'amount','итоговая сумма':'amount'};
    const typeOf=value=>/^(?:упд|универсальный\s+передаточный\s+документ)$/iu.test(value)?'УПД':TYPES.find(type=>type.toLowerCase()===value.toLowerCase());
    const title=/^\s*(Договор|Акт|УПД|Универсальный\s+передаточный\s+документ|Пояснение)(?=\s|$|[:№])/iu;
    const numberMarker='(?:№|N(?:[oо]|[°º])?\\.?\\s+|номер\\s*:?\\s*)';
    const number='([\\p{L}\\d][\\p{L}\\d/_.–-]{0,100})';
    const contractRef=new RegExp('договор(?:а|у|ом)?(?:\\s+[\\p{L}-]+){0,3}\\s*'+numberMarker+'\\s*'+number,'giu');
    const numberedTitle=new RegExp('^\\s*(Договор|Акт|УПД|Универсальный\\s+передаточный\\s+документ|Пояснение|Сч[её]т[- ]фактура)(?=\\s|№)(?:\\s+[\\p{L}-]+){0,7}\\s*'+numberMarker+'\\s*'+number,'iu');
    const datePattern='(\\d{1,2}[./]\\d{1,2}[./]\\d{4}|\\d{4}-\\d{2}-\\d{2}|[«„"«]?\\d{1,2}[»“"]?\\s+[а-яё]+\\s+\\d{4})';
    const dates=new RegExp('(?:\\b|[^\\p{L}])(?:от\\s+|дата\\s*:?\\s*)'+datePattern,'giu');
    let page=null;
    const pageAt=lines.map(line=>{const marker=/^Страница (\d+)(?: · .+)?$/.exec(line);if(marker)page=Number(marker[1]);return page;});
    function add(key,value,index,quote,rank=1){
      if(!value)return;
      candidates[key].push({value:String(value).trim(),line:index+1,quote:String(quote).trim(),page:pageAt[index],rank});
    }
    const labeled=lines.map(line=>line.match(/^\s*([^:]{2,30})\s*:\s*(.+)$/u));
    labeled.forEach((match,i)=>{
      if(!match)return;
      const key=aliases[match[1].trim().toLowerCase()];
      if(!key)return;
      const value=match[2].trim();
      const normalized={kind:typeOf,amount:money,date:dateValue}[key]?.(value);
      add(key,normalized||value,i,lines[i],3);
    });
    lines.forEach((line,i)=>{
      const heading=title.exec(line);
      const numbered=numberedTitle.exec(line);
      if(heading&&(numbered||i<12&&!/^\s*(?:договор|акт)\s*:/iu.test(line))){
        const kind=typeOf(heading[1]);
        const explicit=candidates.kind.some(item=>item.rank===3);
        const firstHeading=candidates.kind.find(item=>item.rank===2);
        if(!explicit&&(!firstHeading||firstHeading.value===kind||numbered&&kind!=='Договор'))add('kind',kind,i,line,2);
      }
    });
    const kind=candidates.kind.reduce((best,item)=>!best||item.rank>best.rank?item:best,null)?.value;
    lines.forEach((line,i)=>{
      const numbered=numberedTitle.exec(line);
      const heading=title.exec(line);
      const headingKind=numbered&&(/^сч[её]т/iu.test(numbered[1])?(kind==='УПД'?'УПД':null):typeOf(numbered[1]));
      if(numbered&&headingKind&&(!kind||headingKind===kind))add('number',numbered[2],i,line,2);
      if(numbered&&headingKind==='Договор')add('contract',numbered[2],i,line,2);
      for(const m of line.matchAll(contractRef))add('contract',m[1],i,line,2);
      const innPattern=/(?:^|[^\p{L}])ИНН(?:\s*\/\s*КПП)?(?:\s+(?:контрагента|поставщика|продавца|покупателя|заказчика|исполнителя))?\s*(?:\(\d+[а-яё]?\))?\s*[:№]?\s*(\d{10}(?:\d{2})?)(?!\d)/giu;
      for(const match of line.matchAll(innPattern))add('inn',match[1],i,line);
      if(/(?:^|[^\p{L}])ИНН(?:\s*\/\s*КПП)?\s*[:№]?\s*$/iu.test(line)&&i+1<lines.length){
        const next=lines[i+1].match(/^\s*(\d{10}(?:\d{2})?)(?!\d)/u);
        if(next&&pageAt[i]===pageAt[i+1])add('inn',next[1],i+1,line+' '+lines[i+1]);
      }
      for(const match of line.matchAll(dates)){
        if(heading||numbered||/^\s*дата/iu.test(line)){
          const rank=headingKind===kind&&!!headingKind||/^\s*дата/iu.test(line)?2:1;
          add('date',dateValue(match[1])||match[1],i,line,rank);
        }
      }
      const total=line.match(/^\s*(?:всего\s+к\s+оплате|итого\s+к\s+оплате|итоговая\s+сумма|сумма\s+к\s+оплате|всего\s+с\s+НДС|общая\s+стоимость|итого\s+с\s+НДС)\s*[:=]?\s*(.*)$/iu);
      if(total){
        const amounts=[...total[1].matchAll(/(?<![\d.,])\d{1,3}(?:[ .]\d{3})+(?:[.,]\d{2})?(?![\d.,])|(?<![\d.,])\d+(?:[.,]\d{1,2})?(?![\d.,])/gu)];
        const values=amounts.map(match=>money(match[0])).filter(Boolean);
        if(values.length){
          // The approved totals row lists net, tax and gross from left to right.
          if(values.length===1||kind==='УПД'&&values.length===3&&/\||(?:^|\s)[xх](?:\s|$)|\s{2,}/iu.test(total[1]))add('amount',values.at(-1),i,line,2);
          else for(const value of values)add('amount',value,i,line,2);
        }else if(i+1<lines.length&&pageAt[i]===pageAt[i+1]){
          const next=money(lines[i+1]);
          if(next)add('amount',next,i+1,line+' '+lines[i+1],2);
        }
      }
    });
    const fields={},evidence={},states={};
    for(const key of Object.keys(FIELD_LABELS)){
      const byValue=new Map();
      for(const item of candidates[key]){
        if(!byValue.has(item.value)||byValue.get(item.value).rank<item.rank)byValue.set(item.value,item);
      }
      const choices=[...byValue.values()].sort((a,b)=>b.rank-a.rank);
      const top=choices.filter(item=>key==='inn'||key==='contract'||item.rank===choices[0].rank);
      candidates[key]=choices.map(({rank,...item})=>item);
      fields[key]=top.length===1?top[0].value:'';
      states[key]=top.length===1?'found':top.length?'ambiguous':'missing';
      if(top.length===1)evidence[key]=candidates[key][0];
    }
    const errors=validate(fields);
    for(const key of Object.keys(errors))if(fields[key])states[key]='invalid';
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
    const recognize=async(mode,rotateAuto=false)=>{
      await abortable(w.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:'1'}),signal,cancel);
      const {data}=await abortable(w.recognize(image,{rotateAuto}),signal,cancel);
      abortCheck(signal);
      return {text:data.text,confidence:data.confidence};
    };
    const first=await recognize('3',true);
    if(first.confidence>=65&&readableText(first.text))return first;
    progress('Пробуем разреженную разметку текста…');
    const retry=await recognize('11');
    return readableText(retry.text)&&(!readableText(first.text)||retry.confidence>first.confidence)?retry:first;
  }
  async function stop(){workerGeneration++;const pending=creatingWorker;creatingWorker=null;if(pending)pending.then(w=>w.terminate()).catch(()=>{});if(worker){const w=worker;worker=null;await w.terminate();}}
  function abortCheck(signal){if(signal?.aborted)throw new DOMException('Обработка отменена.','AbortError');}
  async function fileKind(file,fromCamera=false){
    if(file.size>LIMITS.bytes)throw Error('Файл больше 20 МБ. Разделите его перед загрузкой.');
    const extension=file.name.split('.').pop().toLowerCase();
    if(fromCamera&&['image/heic','image/heif','image/webp'].includes(file.type))return 'image';
    if(fromCamera&&!['png','jpg','jpeg'].includes(extension))throw Error('Сделайте новый снимок или загрузите JPEG либо PNG.');
    if(!['pdf','png','jpg','jpeg','txt'].includes(extension))throw Error('Поддерживаются PDF, PNG, JPG, JPEG и TXT.');
    const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    const isPDF=String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
    if(extension==='pdf'&&!isPDF)throw Error('Содержимое файла не соответствует PDF.');
    if(['jpg','jpeg'].includes(extension)&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('Содержимое файла не соответствует JPEG.');
    if(extension==='png'&&!(bytes[0]===137&&String.fromCharCode(...bytes.slice(1,4))==='PNG'))throw Error('Содержимое файла не соответствует PNG.');
    return extension;
  }
  async function decodeImage(file){
    try{
      if(typeof createImageBitmap==='function')return await createImageBitmap(file);
    }catch{}
    const url=URL.createObjectURL(file);
    const image=new Image();
    image.src=url;
    try{
      await image.decode();
      return image;
    }catch{
      throw Error('Не удалось открыть изображение. Сделайте снимок заново или загрузите JPEG либо PNG.');
    }finally{
      URL.revokeObjectURL(url);
    }
  }
  function textRows(items,viewport){
    const points=items.filter(item=>typeof item.str==='string'&&item.str.trim()).map(item=>{
      const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
      return {x,y,width:item.width,height:item.height,text:item.str.trim()};
    }).sort((a,b)=>a.y-b.y||a.x-b.x);
    const rows=[];
    for(const point of points){
      const row=rows.at(-1);
      if(row&&Math.abs(row.y-point.y)<=Math.max(2,Math.min(5,point.height*.28)))row.items.push(point);
      else rows.push({y:point.y,items:[point]});
    }
    return rows.map(row=>{
      let right=null;
      return row.items.sort((a,b)=>a.x-b.x).map(item=>{
        const separator=right===null?'':item.x-right>Math.max(16,item.height*2)?' | ':' ';
        right=item.x+item.width;
        return separator+item.text;
      }).join('');
    }).join('\n');
  }
  function readableText(text){
    const visible=text.replace(/\s/gu,'');
    return (visible.match(/[\p{L}\d]/gu)||[]).length>=30&&!/[\u0000-\u0008\ufffd]{3}/u.test(visible);
  }
  async function hasLargeImage(page,ops){
    const {fnArray,argsArray}=await page.getOperatorList();
    return fnArray.some((op,i)=>{
      const args=argsArray[i];
      if(op===ops.paintImageXObject)return args?.[1]*args?.[2]>=250000;
      if(op===ops.paintInlineImageXObject)return args?.[0]?.width*args?.[0]?.height>=250000;
      return false;
    });
  }
  async function readTextFile(file){
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes);
    if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes);
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
    catch{return new TextDecoder('windows-1251').decode(bytes);}
  }
  async function readPaymentsCSV(file){
    if(file.size>256*1024)throw Error('CSV должен быть меньше 256 КБ.');
    const text=clean(await readTextFile(file)).trim();
    const rows=[];
    let row=[],value='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(quoted){
        if(char==='"'&&text[i+1]==='"'){value+='"';i++;}
        else if(char==='"'){quoted=false;closed=true;}
        else value+=char;
      }else if(char===';'||char==='\n'){
        row.push(value.trim());value='';closed=false;
        if(char==='\n'){rows.push(row);row=[];}
      }else if(char==='"'&&!value&&!closed)quoted=true;
      else if(char==='"'||closed&&char!==' ')throw Error('Проверьте кавычки в CSV.');
      else value+=char;
    }
    if(quoted)throw Error('В CSV не закрыты кавычки.');
    rows.push([...row,value.trim()]);
    const header=['id','counterparty','inn','contract','date','amount','settlement'];
    const keys=rows.shift();
    if(keys.length!==header.length||header.some(key=>!keys.includes(key)))throw Error('Столбцы CSV: '+header.join('; ')+'.');
    if(rows.length<1||rows.length>300)throw Error('Добавьте от 1 до 300 платежей.');
    return rows.map((fields,index)=>{
      if(fields.length!==keys.length)throw Error('Проверьте количество столбцов в строке '+(index+2)+'.');
      return Object.fromEntries(keys.map((key,i)=>[key,fields[i]]));
    });
  }
  async function read(file,{progress=()=>{},signal,fromCamera=false,forceOCR=false}={}){
    abortCheck(signal);const kind=await fileKind(file,fromCamera);let text='',pages=1,method='text',confidence=null;const warnings=[];
    if(kind==='txt')text=await readTextFile(file);
    else if(kind==='pdf'){
      const lib=await abortable(getPDF(),signal);abortCheck(signal);
      const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,standardFontDataUrl:config().pdfFonts,cMapUrl:config().pdfCmaps,cMapPacked:true,wasmUrl:config().pdfWasm});let pdf=null;const cancelPDF=()=>{task.destroy().catch(()=>{});};signal?.addEventListener('abort',cancelPDF,{once:true});
      try{
        pdf=await abortable(task.promise,signal,cancelPDF);
        pages=pdf.numPages;
        if(pages>LIMITS.pages)throw Error('В PDF больше 20 страниц. Разделите файл.');
        const chunks=[];let scanned=0,textPages=0,totalLength=0;
        for(let n=1;n<=pages;n++){
          abortCheck(signal);
          progress(`Читаем PDF: страница ${n} из ${pages}.`);
          const page=await pdf.getPage(n);
          const base=page.getViewport({scale:1});
          const content=await page.getTextContent();
          let part=textRows(content.items,base);
          const usable=readableText(part);
          const hasKeyFields=/(?:инн|(?:всего|итого)\s+к\s+оплате)/iu.test(part);
          const hasImage=usable&&!hasKeyFields&&!forceOCR&&await hasLargeImage(page,lib.OPS);
          let pageMethod='текст';
          if(forceOCR||!usable||hasImage&&!hasKeyFields){
            const scale=Math.min(3,Math.sqrt(LIMITS.pixels/(base.width*base.height)));
            const viewport=page.getViewport({scale});
            const canvas=document.createElement('canvas');
            canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
            try{
              const render=page.render({canvasContext:canvas.getContext('2d'),viewport});
              await abortable(render.promise,signal,()=>render.cancel());
              const result=await ocr(canvas,msg=>progress(`Страница ${n}/${pages}. ${msg}`),signal);
              if(result.text.trim()&&(forceOCR||!usable||hasImage)){
                scanned++;
                pageMethod='распознавание';
                confidence=confidence===null?result.confidence:Math.min(confidence,result.confidence);
                if(usable&&!forceOCR){
                  part+='\n'+result.text;
                  textPages++;
                  pageMethod='текст и распознавание';
                }else part=result.text;
              }
            }catch(error){
              abortCheck(signal);
              warnings.push(`Страница ${n}: ${error.message||'не удалось распознать скан'}`);
            }finally{canvas.width=1;canvas.height=1;}
          }
          if(pageMethod==='текст'&&part.trim())textPages++;
          chunks.push(`Страница ${n} · ${pageMethod}\n${part}`);
          totalLength+=chunks.at(-1).length+2;
          if(totalLength>LIMITS.text)throw Error('Слишком большой объём текста. Разделите PDF.');
          page.cleanup();
        }
        if(warnings.length&&!textPages&&!scanned)throw Error(warnings[0]);
        text=chunks.join('\n\n');method=scanned?(textPages?'pdf-mixed':'pdf-ocr'):'pdf-text';
      }catch(error){
        if(signal?.aborted)abortCheck(signal);
        if(error.name==='PasswordException')throw Error('PDF защищён паролем. Загрузите доступную для чтения копию.');
        if(error.name==='InvalidPDFException'||error.name==='FormatError')throw Error('PDF повреждён или имеет неподдерживаемую структуру.');
        throw error;
      }finally{signal?.removeEventListener('abort',cancelPDF);await task.destroy().catch(()=>{});}
    }else{
      const image=await decodeImage(file);
      try{
        abortCheck(signal);
        const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
        const scale=Math.min(1,Math.sqrt(LIMITS.pixels/(width*height)));
        const upscale=Math.min(scale===1?2:scale,Math.sqrt(LIMITS.pixels/(width*height)),Math.max(scale,1600/Math.max(width,height)));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.floor(width*upscale));
        canvas.height=Math.max(1,Math.floor(height*upscale));
        try{
          const ctx=canvas.getContext('2d');
          ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          const result=await ocr(canvas,progress,signal);
          text=result.text;confidence=result.confidence;
        }finally{canvas.width=1;canvas.height=1;}
      }finally{image.close?.();}
      method='image-ocr';
    }
    abortCheck(signal);text=clean(text);const parsed=extractFields(text);
    if(parsed.states.kind==='ambiguous'||parsed.states.number==='ambiguous'){
      warnings.push('В файле найдено несколько заголовков или номеров. Если это комплект, загрузите каждый документ отдельным файлом.');
    }
    return {name:file.name,sourceText:text,pages,method,kind,confidence,warnings,...parsed,empty:!text.split('\n').some(line=>line.trim()&&!/^Страница \d+ · /u.test(line))};
  }
  const api={LIMITS,VERSIONS,FIELD_LABELS,TYPES,extractFields,validate,canonical,reviewedDocument,dateValue,money,read,readPaymentsCSV,stop};
  root.TraceDocuments=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
