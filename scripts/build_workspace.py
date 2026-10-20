"""Generate the employee page from the current public demo and Clerk shell."""
from pathlib import Path
import hashlib
import re
import sys

root=Path(__file__).resolve().parents[1]
source=(root/'templates/workspace.html').read_text(encoding='utf-8')
gate='''<section id="auth-gate" class="auth-gate" aria-label="Вход в приложение Trace">
<a href="index.html" class="auth-home" aria-label="Trace — главная"><span class="trace-wordmark"><img src="assets/trace-logo.png" alt="Trace" width="1280" height="853"></span><span>На главную ↗</span></a>
<div class="auth-scene" aria-hidden="true"><div class="auth-orbit"></div><div class="auth-core"><span>trace.</span></div><span class="auth-scene-label">ОПЕРАЦИЯ → ОСНОВАНИЕ → УТОЧНЕНИЕ</span></div>
<p class="auth-eyebrow">РАБОЧЕЕ МЕСТО СОТРУДНИКА БАНКА</p><h1 id="auth-title">Всё начинается<br><em>со связи.</em></h1>
<p id="auth-status" role="status">Подключаем вход…</p>
<div id="auth-gate-profile"></div><div id="auth-sign-in"></div><div id="auth-organizations"></div>
<p class="auth-context">Проверка комплектности документов<br>и подготовка адресных уточнений.</p>
<div class="auth-actions"><button id="auth-retry" hidden>Повторить подключение</button><button id="auth-sign-out" hidden>Выйти из аккаунта</button></div>
<p class="auth-note">Доступ по аккаунту и организации.<br>Рабочий прототип · данные примеров вымышлены.</p>
</section>
<div id="trace-workspace" hidden inert><div class="auth-toolbar"><span id="auth-organization-name"></span><div class="auth-control"><span class="auth-control-label" id="auth-org-label">Организация</span><div id="auth-switcher" aria-labelledby="auth-org-label"></div></div><div class="auth-control"><span class="auth-control-label" id="auth-profile-label">Мой профиль</span><div id="auth-user" aria-labelledby="auth-profile-label"></div></div><button id="auth-workspace-sign-out" type="button">Выйти</button></div>'''
source=source.replace('<title>Trace — демонстрация проверки комплекта</title>','<title>Trace — кабинет сотрудника</title>')
source=source.replace('<body><div id="trace-workspace">','<body data-auth-required="true">'+gate)
source=source.replace('</head>','<link rel="stylesheet" href="assets/auth.css"></head>')
source=source.replace('<script src="assets/queue.js"></script>','<script src="assets/queue.js"></script><script src="assets/auth-config.js"></script><script src="assets/clerk-ru.js"></script><script src="assets/auth.js"></script>')
for asset in ('auth-config.js','clerk-ru.js','auth.js','auth.css'):
    version=hashlib.sha256((root/'website/assets'/asset).read_bytes()).hexdigest()[:12]
    source=source.replace(f'assets/{asset}"',f'assets/{asset}?v={version}"')
source=re.sub(r'<script>if\(document\.modelContext\?\.registerTool\).*?</script>','',source,flags=re.S)
target=root/'website/workspace.html'
if '--check' in sys.argv:
    if target.read_text(encoding='utf-8')!=source:
        raise SystemExit('Run python scripts/build_workspace.py to update the employee page.')
    print('PASS: employee page matches current demo and auth shell')
else:
    target.write_text(source,encoding='utf-8')
    print('Generated website/workspace.html')
