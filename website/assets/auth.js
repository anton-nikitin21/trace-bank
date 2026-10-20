/* Clerk authenticates this synthetic UI. Server APIs require separate JWT verification. */
(async () => {
  const byId=id=>document.getElementById(id);
  const app=byId('trace-workspace'),gate=byId('auth-gate'),status=byId('auth-status');
  const retry=byId('auth-retry'),signOut=byId('auth-sign-out');
  const lock=()=>{app.hidden=true;app.inert=true;gate.hidden=false;};
  lock(); retry.onclick=()=>location.reload();
  const key=window.TRACE_AUTH?.publishableKey || '';
  if (!key) {status.textContent='Вход сотрудников пока не активирован. Для подключения нужен публичный ключ приложения Clerk.';retry.hidden=true;return;}
  function loadScript(url,attributes={}) {
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const timeout=setTimeout(()=>{script.remove();reject(Error('Сервис входа не ответил. Повторите подключение.'));},20000);
      script.src=url;script.crossOrigin='anonymous';script.async=true;
      Object.entries(attributes).forEach(([name,value])=>script.setAttribute(name,value));
      script.onload=()=>{clearTimeout(timeout);resolve();};
      script.onerror=()=>{clearTimeout(timeout);script.remove();reject(Error('Не удалось подключиться к Clerk. Проверьте соединение и повторите.'));};
      document.head.append(script);
    });
  }
  try {
    if (!/^pk_(test|live)_[A-Za-z0-9+/=]+$/.test(key)) throw Error('Укажите корректный Publishable Key Clerk.');
    const decoded=atob(key.split('_')[2]),domain=decoded.slice(0,-1);
    if (!decoded.endsWith('$') || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domain)) throw Error('В ключе указан некорректный домен Clerk.');
    status.textContent='Подключаем вход…';
    await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
    await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,{'data-clerk-publishable-key':key});
    const clerk=window.Clerk;
    await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
    let mode='',activeIdentity='';
    function render(state) {
      const {user,organization}=state;
      const next=!user?'signed-out':!organization?'organization':'workspace';
      const identity=JSON.stringify([user?.id,organization?.id]);
      if (mode==='workspace' && identity!==activeIdentity) {
        lock();window.TRACE_SESSION=null;status.textContent='Сессия изменилась. Обновляем рабочее пространство…';location.reload();return;
      }
      if (mode===next) return;
      lock();
      if (mode==='signed-out') clerk.unmountSignIn(byId('auth-sign-in'));
      if (mode==='organization') {clerk.unmountOrganizationList(byId('auth-organizations'));clerk.unmountUserButton(byId('auth-gate-profile'));}
      mode=next;signOut.hidden=!user;
      if (!user) {
        status.textContent='Войдите в Trace, чтобы открыть рабочее место сотрудника.';
        clerk.mountSignIn(byId('auth-sign-in'),{routing:'hash',forceRedirectUrl:location.origin+location.pathname,signUpForceRedirectUrl:location.origin+location.pathname});
      } else if (!organization) {
        status.textContent='Выберите организацию. Если список пуст, администратор приложения должен пригласить вас в организацию.';
        clerk.mountUserButton(byId('auth-gate-profile'));
        clerk.mountOrganizationList(byId('auth-organizations'),{hidePersonal:true,hideCreateOrganization:true});
      } else {
        activeIdentity=identity;
        window.TRACE_SESSION=Object.freeze({userId:user.id,organizationId:organization.id});
        byId('auth-organization-name').textContent=organization.name || 'Организация';
        clerk.mountUserButton(byId('auth-user'));
        clerk.mountOrganizationSwitcher(byId('auth-switcher'),{hidePersonal:true});
        gate.hidden=true;app.hidden=false;app.inert=false;
        document.dispatchEvent(new CustomEvent('trace:authenticated'));
      }
    }
    signOut.onclick=async()=>{
      signOut.disabled=true;
      try {await clerk.signOut();} catch(error) {status.textContent='Не удалось завершить сеанс. Повторите выход.';} finally {signOut.disabled=false;}
    };
    render(clerk);
    clerk.addListener(state=>{try {render(state);} catch(error) {lock();status.textContent='Не удалось открыть кабинет. Повторите вход.';}});
  } catch(error) {lock();status.textContent=error.message;retry.hidden=false;}
})();
