"""Generate the employee page from the current public demo and Clerk shell."""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parents[1]
source=(root/'website/demo.html').read_text(encoding='utf-8')
gate='''<section id="auth-gate" class="auth-gate" aria-labelledby="auth-title">
<a href="index.html" class="auth-brand">trace.</a><p class="chip">Рабочее место сотрудника банка</p>
<h1 id="auth-title">Вход в Trace</h1><p id="auth-status" role="status">Подключаем вход…</p>
<div id="auth-gate-profile"></div><div id="auth-sign-in"></div><div id="auth-organizations"></div>
<div class="auth-actions"><button id="auth-retry" hidden>Повторить подключение</button><button id="auth-sign-out" hidden>Выйти из аккаунта</button></div>
<p class="auth-demo-note">Демонстрационный кабинет работает с вымышленными комплектами документов.</p>
<a href="demo.html">Посмотреть публичное демо без регистрации →</a></section>
<div id="trace-workspace" hidden inert><div class="auth-toolbar"><span id="auth-organization-name"></span><div id="auth-switcher"></div><div id="auth-user"></div></div>'''
source=source.replace('<title>Trace — демонстрация проверки комплекта</title>','<title>Trace — кабинет сотрудника</title>')
source=source.replace('<body><div id="trace-workspace">','<body data-auth-required="true">'+gate)
source=source.replace('</head>','<link rel="stylesheet" href="assets/auth.css"></head>')
source=source.replace('<script src="assets/queue.js"></script>','<script src="assets/queue.js"></script><script src="assets/auth-config.js"></script><script src="assets/auth.js"></script>')
source=re.sub(r'<script>if\(document\.modelContext\?\.registerTool\).*?</script>','',source,flags=re.S)
target=root/'website/workspace.html'
if '--check' in sys.argv:
    if target.read_text(encoding='utf-8')!=source:
        raise SystemExit('Run python scripts/build_workspace.py to update the employee page.')
    print('PASS: employee page matches current demo and auth shell')
else:
    target.write_text(source,encoding='utf-8')
    print('Generated website/workspace.html')
