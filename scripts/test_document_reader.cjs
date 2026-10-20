// Conservative extraction: no guessed identifiers, source separation and engine interop.
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const {webcrypto}=require('node:crypto');
const D=require('../website/assets/document-reader.js');
const text='УПД № 41 от 20.09.2026\nДоговор № Д-41\nИНН поставщика: 7700000001\nВсего к оплате: 470 000,00 руб.';
const item={name:'УПД.pdf',sourceText:text,method:'pdf-text',pages:1,...D.extractFields(text)};
assert.equal(item.fields.kind,'УПД');assert.equal(item.fields.number,'41');assert.equal(item.fields.contract,'Д-41');assert.equal(item.fields.inn,'7700000001');assert.equal(item.fields.amount,'470000.00');assert.equal(item.fields.date,'2026-09-20');assert.deepEqual(item.errors,{});
const ambiguous=D.extractFields(text+'\nИНН покупателя: 7700000002');assert.equal(ambiguous.fields.inn,'');assert.equal(ambiguous.states.inn,'ambiguous');assert.equal(ambiguous.candidates.inn.length,2);
const netTax=D.extractFields('Тип: УПД\nСумма без НДС: 100000\nНДС: 20000');assert.equal(netTax.fields.amount,'');
const absent=D.extractFields('Неизвестный документ без реквизитов');for(const k of ['kind','number','contract','inn','date'])assert(absent.errors[k]);assert.throws(()=>D.reviewedDocument({name:'empty.png',sourceText:'',candidates:{}},{}));
assert.equal(D.dateValue('31.02.2026'),null);assert.equal(D.dateValue('29.02.2024'),'2024-02-29');assert.equal(D.money('-1'),null);assert.equal(D.money('12 345,67'),'12345.67');assert.equal(D.money('1.123'),null);
const manual=D.reviewedDocument(item,{...item.fields,amount:'480000.00'});assert.equal(manual.sourceText,text);assert.equal(manual.review.origins.amount,'manual');assert.equal(manual.review.origins.inn,'file');assert.match(manual.text,/Сумма: 480000.00/);assert(!manual.sourceText.includes('480000'));
const twoDates=D.extractFields('Акт № А-1 от 20.09.2026\nДоговор № Д-1 от 01.09.2026');assert.equal(twoDates.fields.date,'');assert.equal(twoDates.states.date,'ambiguous');assert.equal(twoDates.fields.number,'А-1');
const html=fs.readFileSync(path.join(__dirname,'../templates/workspace.html'),'utf8');const blocks=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
const ctx=vm.createContext({window:{},crypto:webcrypto,TextEncoder,structuredClone});vm.runInContext(blocks.find(x=>x.startsWith('window.INITIAL_PACKET=')),ctx);vm.runInContext(blocks.find(x=>x.includes('async function localApi(')),ctx);
(async()=>{
 ctx.confirmed=manual;const parsed=vm.runInContext('demoParse(confirmed)',ctx);assert.equal(parsed.errors.length,0);assert.equal(parsed.fields.amount_cents,48000000);
 const file=new File([text],'source.txt',{type:'text/plain'});const read=await D.read(file);assert.equal(read.method,'text');assert.equal(read.fields.contract,'Д-41');
 await assert.rejects(D.read(new File(['bad'],'false.pdf',{type:'application/pdf'})),/не соответствует PDF/);
 await assert.rejects(D.read(new File(['bad'],'false.png',{type:'image/png'})),/не соответствует PNG/);
 await assert.rejects(D.read(new File(['bad'],'unsupported.docx')),/Поддерживаются/);
 const abort=new AbortController();abort.abort();await assert.rejects(D.read(file,{signal:abort.signal}),/отменена/);
 console.log('PASS: labeled and ordinary Russian fields; ambiguous INNs/dates stay blank; tax not mistaken for total; missing fields and invalid dates; exact money; manual origin and immutable source; engine interop; actual TXT; file signatures; cancellation.');
})().catch(e=>{console.error(e);process.exitCode=1});
