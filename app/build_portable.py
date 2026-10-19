"""Rebuild standalone browser demo from the shared UI and JS adapter."""
from pathlib import Path
import json
from fixtures import demo

root=Path(__file__).resolve().parent
h=(root/'index.html').read_text()
old="async function api(url,data){const r=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(v.error||'Не удалось выполнить запрос');return v}"
if old not in h:raise RuntimeError('The UI API adapter changed; update the builder explicitly.')
h=h.replace(old,'async function api(url,data){return localApi(url,data)}')
h=h.replace('Локальное демо · синтетические данные','Демо в браузере · синтетические данные')
h=h.replace('Сохранённые снимки входного пакета и отчёта. SHA-256 идентифицирует содержимое; промышленный журнал аудита потребует отдельной защиты.','Версии текущей демонстрационной сессии. Они исчезнут при закрытии или обновлении страницы. Постоянная история реализована в локальной серверной версии.')
h=h.replace('Проверка завершена. Версия сохранена.','Проверка завершена. Версия добавлена в демо-сессию.')
data='<script>window.INITIAL_PACKET='+json.dumps(demo(),ensure_ascii=False)+';window.CORRECTED_PACKET='+json.dumps(demo(True),ensure_ascii=False)+';</script><script>'+(root/'portable.js').read_text()+'</script>'
h=h.replace('<script>\nlet packet',data+'<script>\nlet packet')
if 'name="description"' not in h:
    h=h.replace('</head>','<meta name="description" content="Проверка комплектности банковского запроса. Только синтетические примеры."></head>')
if 'rel="icon"' not in h:
    h=h.replace('</head>','<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%278%27 fill=%27%23191b20%27/%3E%3Ctext x=%276%27 y=%2724%27 fill=%27%23d8ef99%27 font-size=%2724%27 font-family=%27sans-serif%27%3EО%3C/text%3E%3C/svg%3E"></head>')
webmcp="""<script>if(document.modelContext?.registerTool){const lifecycle=new AbortController();Promise.resolve(document.modelContext.registerTool({name:'analyze_demo_packet',title:'Проверить демонстрационный пакет',description:'Проверяет комплект по демо-профилю и обновляет экран. Данные остаются в этой вкладке.',inputSchema:{type:'object',properties:{packet:{type:'object'}},required:['packet'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='packet'))throw Error('Некорректный вход');const r=await localApi('/api/analyze',input.packet);install(input.packet);render(r);return{case_id:r.case_id,issue_count:r.issue_count,state:r.state}}},{signal:lifecycle.signal})).catch(()=>{});window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}</script>"""
h=h.replace('</body>',webmcp+'</body>')
(root.parent/'demo.html').write_text(h)
print('Standalone demo rebuilt; no external runtime or document upload.')
