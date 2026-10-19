from pathlib import Path
import sys,json,random,time,collections,hashlib
project=Path(__file__).resolve().parents[1];out=project/'sprint-1';(out/'reports').mkdir(parents=True,exist_ok=True);sys.path.insert(0,str(project/'app'))
from engine import analyze
from fixtures import document
rng=random.Random(17102026);cases=[]
# Expected labels are assigned from explicit mutations, before running the engine.
labels={'complete_full':[], 'complete_advance':[], 'complete_partial':[], 'missing_contract':['MISSING_CONTRACT'], 'missing_primary':['MISSING_PRIMARY'], 'amount':['AMOUNT'], 'inn':['INN','MISSING_CONTRACT'], 'duplicate':['DUPLICATE'], 'mixed':['MIXED_SETTLEMENT'], 'unlinked':['UNLINKED']}
for kind in labels:
 for j in range(20):
  c=f'T-{kind}-{j}';inn=str(7700000000+rng.randint(1,99999));amount=rng.randint(10,2000)*1000
  tx={'id':'P1','date':'2026-10-16','counterparty':'Синтетическая компания','inn':inn,'contract':c,'amount':str(amount),'settlement':'full'}
  docs=[document('Договор','D1',c,inn),document('УПД','U1',c,inn,str(amount))];txs=[tx]
  if kind=='complete_advance':tx['settlement']='advance';docs=docs[:1]
  if kind=='complete_partial':tx['amount']=str(amount//2);txs.append({**tx,'id':'P2','amount':str(amount-amount//2)})
  if kind=='missing_contract':docs=docs[1:]
  if kind=='missing_primary':docs=docs[:1]
  if kind=='amount':docs[1]=document('УПД','U1',c,inn,str(amount+100))
  if kind=='inn':docs[0]=document('Договор','D1',c,'7799999999')
  if kind=='duplicate':docs.append({**docs[1],'name':'COPY.txt'})
  if kind=='mixed':txs.append({**tx,'id':'P2','settlement':'advance'})
  if kind=='unlinked':docs.append(document('Договор','D2','UNRELATED',inn))
  packet={'profile':'supply-v1','case_id':c,'customer':'Синтетическая компания','transactions':txs,'documents':docs}
  cases.append({'id':c,'category':kind,'expected_codes':labels[kind],'packet':packet})
results=[];total_tp=total_fp=total_fn=0;false_complete=0
for c in cases:
 t=time.perf_counter();r=analyze(c['packet']);ms=(time.perf_counter()-t)*1000
 actual=collections.Counter(x['code'] for x in r['issues']);expected=collections.Counter(c['expected_codes'])
 tp=sum((actual&expected).values());fp=sum((actual-expected).values());fn=sum((expected-actual).values())
 total_tp+=tp;total_fp+=fp;total_fn+=fn
 if expected and r['state']=='complete':false_complete+=1
 results.append({'id':c['id'],'category':c['category'],'expected_codes':list(expected.elements()),'actual_codes':list(actual.elements()),'elapsed_ms':ms,'exact_match':actual==expected})
lat=sorted(r['elapsed_ms'] for r in results);m=sum(bool(c['expected_codes']) for c in cases)
report={'date':'2026-10-17','seed':17102026,'dataset':'Синтетические учебные комплекты в заданном текстовом формате','cases':len(cases),'categories':len(labels),'complete_cases':len(cases)-m,'incomplete_cases':m,'exact_matches':sum(r['exact_match'] for r in results),'tp':total_tp,'fp':total_fp,'fn':total_fn,'precision':total_tp/(total_tp+total_fp),'recall':total_tp/(total_tp+total_fn),'false_complete':false_complete,'engine_median_ms':lat[len(lat)//2],'engine_p95_ms':lat[int(len(lat)*.95)-1],'engine_sha256':hashlib.sha256((project/'app/engine.py').read_bytes()).hexdigest(),'limitations':['Сценарии сформированы командой, независимая банковская разметка отсутствует.','Проверяется узкий supply-v1 и заданный текстовый формат. OCR, подлинность и банковская достаточность не проверяются.','Повторяемые шаблоны не являются независимой репрезентативной банковской выборкой.','Время вызова правил не является экономией времени сотрудника.']}
(out/'reports/benchmark-cases.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2))
(out/'reports/benchmark-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
(out/'reports/benchmark-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
