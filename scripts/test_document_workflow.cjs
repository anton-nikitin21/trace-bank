// DOM integration test; set TRACE_DOM_MODULE to an installed linkedom package.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');const {webcrypto}=require('node:crypto');
const {parseHTML}=require(process.env.TRACE_DOM_MODULE||'linkedom');const root=path.resolve(__dirname,'..');const html=fs.readFileSync(path.join(root,'templates/workspace.html'),'utf8');const {document,window:dom}=parseHTML(html);const store=new Map();
Object.assign(dom.HTMLElement.prototype,{showModal(){this.open=true;},close(){this.open=false;this.dispatchEvent(new dom.Event('close'));},scrollIntoView(){},focus(){},getBoundingClientRect(){return {top:0,left:0,right:900,bottom:900,width:900,height:500};},reset(){for(const i of this.querySelectorAll('input,textarea'))i.value='';}});
Object.defineProperty(dom.HTMLSelectElement.prototype,'value',{get(){return this.getAttribute('data-test-value')??this.querySelector('option')?.value??''},set(v){this.setAttribute('data-test-value',v)},configurable:true});
function Option(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o;}
const win={INITIAL_PACKET:null,scrollTo(){},addEventListener(){},confirm:()=>true,matchMedia:()=>({matches:true,addEventListener(){}})};
const formData=class {constructor(form){this.items=Array.from(form.querySelectorAll('input[name],select[name]')).map(i=>[i.name,i.value]);}[Symbol.iterator](){return this.items[Symbol.iterator]();}};
const ctx=vm.createContext({window:win,document,crypto:webcrypto,TextEncoder,TextDecoder,structuredClone,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},requestAnimationFrame:()=>0,cancelAnimationFrame(){},matchMedia:win.matchMedia,navigator:{clipboard:{writeText:async()=>{}}},URL,Blob,File,AbortController,DOMException,FormData:formData,Option,location:{reload(){}},setTimeout:()=>1,clearTimeout(){},console});
for(const [,code]of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(code.trim()&&!code.includes('document.modelContext'))vm.runInContext(code,ctx);}
for(const name of ['queue.js','document-reader.js','document-review.js'])vm.runInContext(fs.readFileSync(path.join(root,'website/assets',name),'utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);const el=id=>document.getElementById(id);
(async()=>{
 await run('startWorkspace()');assert.equal(el('learn').hidden,false);assert.equal(document.querySelector('[data-tab="learn"]').getAttribute('aria-current'),'page');el('tutorialQueue').onclick();assert.equal(el('queue').hidden,false);el('tutorialExample').onclick();assert.equal(el('case').hidden,false);assert.equal(run('caseQueue.length'),3);run("openQueueCase('O-2026-0042')");assert.equal(el('docText').readOnly,true);await run('check()');assert.equal(run('report.issue_count'),4);
 document.querySelector('[data-tab="model"]').onclick();assert.equal(el('model').hidden,false);el('economicsHelp').onclick();assert.equal(el('economicsExplanation').hidden,false);assert.equal(el('economicsHelp').getAttribute('aria-expanded'),'true');el('economicsHelp').onclick();assert.equal(el('economicsExplanation').hidden,true);el('m-cases').value='120000';await run('calculate()');assert.match(el('modelResult').textContent.replace(/[\s\u00a0]/g,''),/1068000/);
 document.querySelector('[data-tab="research"]').onclick();assert.equal(el('research').hidden,false);assert.equal(el('hypotheses').children.length,6);
 document.querySelector('[data-tab="case"]').onclick();assert.equal(el('case').hidden,false);
 const uploadText='Тип: УПД\nНомер: УПД-44\nДоговор: Д-44\nИНН контрагента: 7700000004\nДата: 2026-09-20\nСумма: 1000';
 // Real upload entry point and real TXT extraction, no mocked success report.
 el('documentFiles').onchange({target:{files:[new File([uploadText],'new.txt',{type:'text/plain'})],value:''}});
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(run('activeCase.recognition.length'),1);assert.equal(run('packet.documents.length'),6);assert.equal(run('dirty'),true);
 await run('check()');assert.equal(run('dirty'),true);assert.match(el('toast').textContent,/поля/);
 const review=el('recognitionList').querySelector('button');review.onclick();assert.equal(el('recognitionDialog').open,true);assert.equal(el('field-contract').value,'Д-44');assert.equal(el('confirmFields').disabled,false);
 el('field-amount').value='2000';el('field-amount').oninput();el('confirmFields').onclick();assert.equal(run('packet.documents.at(-1).review.origins.amount'), 'manual');assert.equal(run('activeCase.recognition[0].confirmed'),true);assert.equal(run('packet.documents.at(-1).sourceText'),uploadText);assert.equal(el('recognitionDialog').open,false);await run('check()');assert.equal(run('dirty'),false);
 // Opening and cancelling the editor must not change confirmed fields.
 el('recognitionList').querySelector('button').onclick();el('field-amount').value='9999';el('field-amount').oninput();el('closeRecognition').onclick();assert.equal(run('activeCase.recognition[0].fields.amount'),'2000.00');
 // Persisted queue supports new cases, not only the initial three fixtures.
 el('newCustomer').value='ООО Свой клиент';el('newCaseForm').onsubmit({preventDefault(){}});assert.equal(run('caseQueue.length'),4);assert.equal(run('packet.documents.length'),0);assert.equal(run('packet.transactions.length'),0);await run('check()');assert.match(el('toast').textContent,/платёж/);
 const form=el('paymentForm');const values={id:'П-1',counterparty:'ООО Поставщик',inn:'7700000004',contract:'Д-44',amount:'2000',date:'2026-09-20',settlement:'full'};for(const [k,v]of Object.entries(values))form.querySelector(`[name="${k}"]`).value=v;
 form.onsubmit({preventDefault(){},target:form});assert.equal(run('packet.transactions.length'),1);assert.equal(run('packet.transactions[0].amount'),'2000.00');assert.equal(JSON.parse([...store.values()][0]).cases.length,4);
 console.log('PASS: real template/queue bootstrap; initial checks; file input to TXT extraction; pending-field guard; manual confirmation and source provenance; cancelling edits; new case; payment entry; four-case persistence.');
})().catch(error=>{console.error(error);process.exitCode=1});
