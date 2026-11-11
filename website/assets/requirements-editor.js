(() => {
  const panel = document.getElementById('requirements');
  if (!panel) return;
  panel.innerHTML = `<div class="top"><div><span class="chip">Версии и утверждение</span><h1 id="requirements-title">Редактор требований</h1><p class="muted">Сохраните профиль, проверьте изменения и утвердите версию.</p></div><button type="button" id="req-refresh">Загрузить реестр</button></div>
    <div class="box req-notice"><h2>Как используется реестр</h2><p>Этот редактор хранит требования отдельно. Проверка документов пока использует учебный профиль supply-v1.1. Утверждение записи не меняет правила проверки.</p><p>Для сохранения нужен сервер Trace и вход в организацию. В публичном демо доступен просмотр формы.</p></div>
    <div class="req-layout"><div class="box"><label for="req-select">Требование</label><select id="req-select"><option value="">Новое требование</option></select>
    <form id="req-form"><fieldset disabled><label>ID<input name="id" required maxlength="200" autocomplete="off"></label><label>Название<input name="title" required maxlength="500"></label><label>Условие применимости<textarea name="condition" required maxlength="10000" rows="4"></textarea></label><label>Владелец<input name="owner" required maxlength="500"></label><label>Дата вступления<input name="effective_date" type="date" required></label><label class="req-checkbox"><input name="mandatory" type="checkbox">Обязательное требование</label><div class="recognition-actions"><button name="draft" type="submit" class="primary">Сохранить черновик</button><button name="approved" type="submit">Утвердить сохранённую версию</button></div></fieldset></form><p id="req-status" role="status" aria-live="polite"></p></div>
    <aside class="box"><h2>История версий</h2><p class="muted">Утверждённые версии сохраняются. Изменения создают новую версию с автором и временем.</p><ol id="req-history"><li>Загрузите реестр и выберите требование.</li></ol></aside></div>`;
  const form = panel.querySelector('form'), select = panel.querySelector('select');
  const status = panel.querySelector('#req-status'), history = panel.querySelector('ol');
  const refreshButton = panel.querySelector('#req-refresh'), fieldset = form.querySelector('fieldset');
  const approveButton = form.elements.approved;
  let records = [], version = 0, actor = null, generation = 0, busy = false;
  const scope = () => [window.Clerk?.user?.id, window.Clerk?.session?.id, window.Clerk?.organization?.id].join(':');
  let currentScope = scope();
  const message = text => { status.textContent = text; };
  function permissions() {
    fieldset.disabled = busy || !actor || !['admin', 'editor'].includes(actor.role);
    select.disabled = busy;
    refreshButton.disabled = busy;
    approveButton.disabled = busy || actor?.role !== 'admin' || !version || records.find(r => r.object_id === select.value && r.version === version)?.body.status !== 'draft';
  }
  function show() {
    const versions = records.filter(r => r.object_id === select.value).sort((a, b) => a.version - b.version);
    const latest = versions.at(-1);
    form.reset();
    version = latest?.version || 0;
    form.elements.id.value = select.value;
    form.elements.id.readOnly = Boolean(latest);
    if (latest) {
      for (const name of ['title', 'condition', 'owner', 'effective_date']) form.elements[name].value = latest.body[name];
      form.elements.mandatory.checked = latest.body.mandatory;
    }
    history.replaceChildren();
    if (!versions.length) {
      const li = document.createElement('li'); li.textContent = 'Сохранённых версий нет.'; history.append(li);
    }
    versions.reverse().forEach(record => {
      const li = document.createElement('li');
      li.textContent = 'Версия ' + record.version + ' · ' + (record.body.status === 'approved' ? 'Утверждена' : 'Черновик') + ' · ' + record.author + ' · ' + new Date(record.created).toLocaleString('ru-RU');
      history.append(li);
    });
    permissions();
  }
  function resetScope() {
    generation++; actor = null; records = []; version = 0; busy = false;
    select.replaceChildren(new Option('Новое требование', '')); show();
    message('Загрузите реестр для текущей организации.');
  }
  async function api(path, data, epoch) {
    const before = scope();
    if (before !== currentScope) { currentScope = before; resetScope(); throw Error('Организация изменилась. Загрузите реестр заново.'); }
    const token = await window.Clerk?.session?.getToken();
    if (!token) throw Error('Войдите в аккаунт и выберите организацию.');
    if (epoch !== generation || before !== scope()) throw Error('Организация изменилась. Загрузите реестр заново.');
    let response;
    try {
      response = await fetch(path, {
        method: data ? 'POST' : 'GET',
        headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(data ? {'Idempotency-Key': crypto.randomUUID()} : {})},
        ...(data ? {body: JSON.stringify(data)} : {})
      });
    } catch { throw Error('Сервер недоступен. Запустите сервер Trace и загрузите реестр заново.'); }
    if (epoch !== generation || before !== scope()) throw Error('Организация изменилась. Загрузите реестр заново.');
    if (!response.ok) throw Error(({401: 'Сессия истекла. Войдите снова.', 403: 'Для этого действия нужна роль редактора или администратора.', 404: 'Реестр доступен в серверной версии Trace. Откройте сайт через сервер.', 409: 'Версия изменилась или черновик не сохранён. Загрузите реестр и повторите.'})[response.status] || 'Не удалось сохранить данные (' + response.status + ').');
    const result = await response.json();
    if (epoch !== generation || before !== scope()) throw Error('Организация изменилась. Загрузите реестр заново.');
    return result;
  }
  async function refresh(epoch, selected = select.value) {
    const identity = await api('/api/session', null, epoch);
    const data = await api('/api/records', null, epoch);
    actor = identity; records = data.filter(r => r.kind === 'requirements');
    select.replaceChildren(new Option('Новое требование', ''));
    [...new Set(records.map(r => r.object_id))].forEach(id => select.add(new Option(id, id)));
    select.value = selected; show();
  }
  refreshButton.onclick = async () => {
    const epoch = ++generation; busy = true; permissions(); message('Загружаем реестр…');
    try { await refresh(epoch); message(actor.role === 'reader' ? 'Реестр загружен. Вам доступен просмотр.' : 'Реестр загружен. Можно сохранять черновики.'); }
    catch (error) { if (epoch === generation) { actor = null; message(error.message); } }
    finally { if (epoch === generation) { busy = false; permissions(); } }
  };
  select.onchange = () => { show(); message(''); };
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || !actor) return;
    const action = event.submitter?.name || 'draft', epoch = generation;
    const id = form.elements.id.value.trim();
    const body = {status: action, mandatory: form.elements.mandatory.checked};
    for (const name of ['title', 'condition', 'owner', 'effective_date']) body[name] = form.elements[name].value.trim();
    if (action === 'approved') {
      const saved = records.find(r => r.object_id === select.value && r.version === version)?.body;
      if (!saved || saved.status !== 'draft' || Object.keys(body).some(k => k !== 'status' && body[k] !== saved[k])) {
        message('Сначала сохраните изменения как черновик, затем утвердите версию.'); return;
      }
    }
    busy = true; permissions(); message('Сохраняем версию…');
    try {
      await api('/api/records', {kind: 'requirements', object_id: id, expected_version: version, body}, epoch);
      await refresh(epoch, id);
      message(action === 'approved' ? 'Версия утверждена. Учебные правила проверки не изменились.' : 'Черновик сохранён.');
    } catch (error) { if (epoch === generation) message(error.message); }
    finally { if (epoch === generation) { busy = false; permissions(); } }
  };
  function observeScope() {
    const next = scope();
    if (next !== currentScope) { currentScope = next; resetScope(); }
  }
  document.addEventListener('trace:authenticated', observeScope);
  const timer = setInterval(observeScope, 500);
  window.addEventListener('pagehide', () => clearInterval(timer), {once: true});
  permissions();
})();
