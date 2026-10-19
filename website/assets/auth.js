/* Synthetic browser demo only: this gate does not protect server APIs or files. */
(async () => {
  const gate = document.getElementById('auth-gate');
  const status = document.getElementById('auth-status');
  const app = document.getElementById('trace-workspace');
  const key = window.TRACE_AUTH?.publishableKey || '';
  const lock = () => { app.hidden = true; app.inert = true; gate.hidden = false; };
  lock();
  if (!key) {
    status.textContent = 'Вход пока не подключён. Команде нужно добавить публичный ключ Clerk. Публичные материалы доступны на главной странице.';
    return;
  }
  function loadScript(url, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url; script.crossOrigin = 'anonymous';
      for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить сервис входа. Проверьте соединение и повторите.'));
      document.head.append(script);
    });
  }
  try {
    if (!/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key)) throw new Error('Некорректный публичный ключ Clerk.');
    const decoded = atob(key.split('_')[2]);
    if (!decoded.endsWith('$')) throw new Error('Некорректный домен Clerk.');
    const domain = decoded.slice(0, -1);
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domain)) throw new Error('Некорректный домен Clerk.');
    status.textContent = 'Подключаем безопасный вход…';
    await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
    await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { 'data-clerk-publishable-key': key });
    const clerk = window.Clerk;
    await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    let mode = '';
    function render({ user, organization }) {
      const next = !user ? 'signed-out' : !organization ? 'organization' : 'workspace';
      if (mode === next) return;
      if (mode === 'signed-out') clerk.unmountSignIn(document.getElementById('auth-sign-in'));
      if (mode === 'organization') clerk.unmountOrganizationList(document.getElementById('auth-organizations'));
      if (mode === 'workspace') {
        clerk.unmountUserButton(document.getElementById('auth-user'));
        clerk.unmountOrganizationSwitcher(document.getElementById('auth-switcher'));
        // Do not carry an in-memory document packet to another user/organization.
        location.reload(); return;
      }
      mode = next; lock();
      if (!user) {
        status.textContent = 'Войдите в рабочее пространство Trace.';
        clerk.mountSignIn(document.getElementById('auth-sign-in'), { routing: 'hash' });
      } else if (!organization) {
        status.textContent = 'Выберите организацию, в которую вас пригласили.';
        clerk.mountOrganizationList(document.getElementById('auth-organizations'), { hidePersonal: true, hideCreateOrganization: true });
      } else {
        gate.hidden = true; app.hidden = false; app.inert = false;
        clerk.mountUserButton(document.getElementById('auth-user'));
        clerk.mountOrganizationSwitcher(document.getElementById('auth-switcher'), { hidePersonal: true });
      }
    }
    let identity = `${clerk.user?.id || ''}/${clerk.organization?.id || ''}`;
    render(clerk);
    clerk.addListener(state => {
      const next = `${state.user?.id || ''}/${state.organization?.id || ''}`;
      if (next !== identity && mode === 'workspace') { location.reload(); return; }
      identity = next; render(state);
    });
  } catch (error) {
    lock(); status.textContent = error.message;
  }
})();
