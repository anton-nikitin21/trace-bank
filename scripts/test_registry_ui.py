import sys, hashlib, threading, tempfile, json
from pathlib import Path
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'app'))
import storage_server as storage
import os
out=Path(os.environ.get('TRACE_REPORT_DIR',root/'browser-report'));out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(dir=out.parent) as tmp:
 storage.DB=Path(tmp)/'test.sqlite'
 storage.IDENTITIES={hashlib.sha256(t.encode()).hexdigest():{'user':t,'organization':org,'role':role} for t,org,role in [('admin','org-a','admin'),('editor','org-a','editor'),('reader','org-a','reader'),('other','org-b','admin')]}
 server=ThreadingHTTPServer(('127.0.0.1',0),storage.Handler)
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script("window.Clerk={user:{id:'admin'},organization:{id:'org-a'},session:{id:'s',getToken:async()=>window.testToken}};window.testToken='admin';")
  page.goto(f'http://127.0.0.1:{server.server_port}/demo.html')
  page.get_by_role('button',name='Редактор требований',exact=True).click()
  page.locator('#req-refresh').click();page.wait_for_function("document.querySelector('#req-status').textContent.includes('Реестр загружен')")
  form=page.locator('#req-form')
  for name,value in [('id','req-test'),('title','Договор поставки'),('condition','При оплате поставки'),('owner','Владелец процесса'),('effective_date','2026-11-11')]:form.locator(f'[name={name}]').fill(value)
  form.locator('[name=draft]').click();page.wait_for_function("document.querySelector('#req-status').textContent==='Черновик сохранён.'")
  assert page.locator('#req-history li').count()==1
  form.locator('[name=title]').fill('Изменённый договор')
  form.locator('[name=approved]').click();assert 'Сначала сохраните' in page.locator('#req-status').inner_text()
  form.locator('[name=draft]').click();page.wait_for_function("document.querySelector('#req-history').textContent.includes('Версия 2')")
  form.locator('[name=approved]').click();page.wait_for_function("document.querySelector('#req-status').textContent.includes('Версия утверждена')")
  assert page.locator('#req-history li').count()==3
  for width in [360,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),width
  page.screenshot(path=str(out/'requirements-desktop.png'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(out/'requirements-mobile.png'),full_page=True)
  page.evaluate("window.Clerk.user.id='other';window.Clerk.organization.id='org-b';window.testToken='other'")
  page.wait_for_function("document.querySelector('#req-form fieldset').disabled")
  assert page.locator('#req-history li').count()==1
  page.locator('#req-refresh').click();page.wait_for_function("document.querySelector('#req-status').textContent.includes('Реестр загружен')")
  assert page.locator('#req-select option').count()==1
  page.evaluate("window.Clerk.user.id='reader';window.Clerk.organization.id='org-a';window.testToken='reader'")
  page.wait_for_function("document.querySelector('#req-status').textContent.includes('текущей организации')")
  page.locator('#req-refresh').click();page.wait_for_function("document.querySelector('#req-status').textContent.includes('доступен просмотр')")
  assert page.locator('#req-form [name=draft]').is_disabled()
  assert page.locator('#req-select option').count()==2
  page.goto('http://127.0.0.1:8766/analytics.html')
  page.wait_for_function("document.querySelector('#custdev-rows').children.length===4")
  assert ['70%','40%','65%','75%']==page.locator('#custdev-rows tr td:nth-child(2)').all_inner_texts()
  for width in [360,390,768,1024,1440]:
   page.set_viewport_size({'width':width,'height':900})
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),('analytics',width)
  page.locator('#custdev').scroll_into_view_if_needed();page.screenshot(path=str(out/'custdev-desktop.png'))
  assert errors==[],errors
  browser.close()
 server.shutdown();server.server_close();thread.join()
(out/'registry-verification.json').write_text(json.dumps({'status':'passed','checks':['draft save','unsaved approval guard','immutable version history','approval','organization switch','reader role','360–1440 responsive layouts','CustDev source percentages','no JS errors'],'limitations':['Clerk identity is simulated only in this test browser; production sign-in is tested separately.']},ensure_ascii=False,indent=2))
print('PASS registry browser workflow, permissions, organization changes, responsive layouts and CustDev')
