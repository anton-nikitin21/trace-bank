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
    await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor},
      localization:{...window.TRACE_CLERK_RU,
        organizationSwitcher:{...window.TRACE_CLERK_RU?.organizationSwitcher,action__openOrganizationSwitcher:'Выбрать организацию',action__closeOrganizationSwitcher:'Закрыть выбор организации'},
        formFieldAction__showPassword:'Показать пароль',formFieldAction__hidePassword:'Скрыть пароль',
        formFieldInputPlaceholder__signUpPassword:'Придумайте пароль',
        formFieldInputPlaceholder__password:'Введите пароль',
        formFieldInputPlaceholder__emailAddress:'Введите почту',
 socialButtonsBlockButton:"Войти через {{provider|titleize}}",socialButtonsBlockButtonManyProviders:"Войти через {{provider|titleize}}",
        signIn:{...window.TRACE_CLERK_RU?.signIn,start:{...window.TRACE_CLERK_RU?.signIn?.start,title:'Вход в Trace',subtitle:'',actionText:'Нет аккаунта?',actionLink:'Создать',actionLink__use_phone:'По телефону',actionLink__use_email:'По почте'}},
        signUp:{...window.TRACE_CLERK_RU?.signUp,start:{...window.TRACE_CLERK_RU?.signUp?.start,title:'Регистрация в Trace',subtitle:''}}},
      appearance:{variables:{fontFamily:'Arial, Helvetica, sans-serif',colorPrimary:'#8bd8ff',colorBackground:'#0a182a',colorText:'#f4f8ff',colorTextSecondary:'#94a8c3',colorInputBackground:'#071222',colorInputText:'#f4f8ff',colorNeutral:'#d0e5fa',borderRadius:'8px'},elements:{headerTitle:{fontSize:'24px',lineHeight:'1.3',letterSpacing:'-.5px'}}}
    });
    const pageUrl=location.origin+location.pathname;
    const isSignUp=new URLSearchParams(location.search || '').get('auth')==='signup';
    gate.classList?.toggle('auth-register',isSignUp);
    let mode='',activeIdentity='',signingOut=false,formObserver=null,formTimer=null;
    function stopFormWatch(){
      formObserver?.disconnect();formObserver=null;clearTimeout(formTimer);
      gate.classList?.remove('auth-loading');
      byId('auth-sign-in').removeAttribute?.('aria-busy');
    }
    function watchForm(){
      // Clerk may mount its root before its asynchronously loaded form is ready.
      if(typeof MutationObserver==='undefined')return;
      const form=byId('auth-sign-in');
      const ready=()=>!!form.querySelector('input,button,iframe');
      if(ready())return;
      gate.classList.add('auth-loading');form.setAttribute('aria-busy','true');
      status.textContent='Загружаем форму входа…';
      formObserver=new MutationObserver(()=>{
        if(ready()){
          stopFormWatch();retry.hidden=true;
          status.textContent='Войдите в Trace, чтобы открыть рабочее место сотрудника.';
        }
      });
      formObserver.observe(form,{childList:true,subtree:true});
      formTimer=setTimeout(()=>{
        if(mode==='signed-out'&&!ready()){
          gate.classList.remove('auth-loading');retry.hidden=false;
          status.textContent='Форма входа загружается дольше обычного. Проверьте соединение или повторите подключение.';
        }
      },15000);
    }
    window.addEventListener?.('pagehide',stopFormWatch,{once:true});
    function render(state) {
      if(signingOut) return;
      const {user,organization}=state;
      const next=!user?'signed-out':!organization?'organization':'workspace';
      const identity=JSON.stringify([user?.id,organization?.id]);
      if (mode==='workspace' && identity!==activeIdentity) {
        lock();window.TRACE_SESSION=null;status.textContent='Сессия изменилась. Обновляем рабочее пространство…';location.reload();return;
      }
      if (mode===next) return;
      stopFormWatch();
      lock();
      if (mode==='signed-out') {if(isSignUp) clerk.unmountSignUp(byId('auth-sign-in')); else clerk.unmountSignIn(byId('auth-sign-in'));}
      if (mode==='organization') {clerk.unmountOrganizationList(byId('auth-organizations'));clerk.unmountUserButton(byId('auth-gate-profile'));}
      mode=next;signOut.hidden=!user;
      if (!user) {
        status.textContent='Войдите в Trace, чтобы открыть рабочее место сотрудника.';
        const options={routing:'hash',oauthFlow:'redirect',appearance:{options:{socialButtonsPlacement:'bottom'},
          variables:{fontFamily:'Arial, Helvetica, sans-serif'},
          elements:{rootBox:{width:'100%'},cardBox:{width:'100%',boxShadow:'none',border:'none',borderRadius:'0'},card:{width:'100%',padding:'20px 0 12px',boxShadow:'none',border:'none',background:'transparent'},headerTitle:{fontFamily:'Arial, Helvetica, sans-serif',fontSize:'22px'},lastAuthenticationStrategyBadge:{display:'none'}}
        },forceRedirectUrl:pageUrl,signInForceRedirectUrl:pageUrl,signUpForceRedirectUrl:pageUrl,signInUrl:pageUrl,signUpUrl:pageUrl+'?auth=signup'};
        if(isSignUp) clerk.mountSignUp(byId('auth-sign-in'),options);
        else clerk.mountSignIn(byId('auth-sign-in'),options);
        watchForm();
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
    const workspaceSignOut=byId('auth-workspace-sign-out');
    const exit=async()=>{
      if(signingOut) return;
      signingOut=true;
      stopFormWatch();
      lock();window.TRACE_SESSION=null;
      gate.classList?.add('auth-exiting');
      status.textContent='Выходим из аккаунта…';
      signOut.disabled=true;workspaceSignOut.disabled=true;
      try {
        // Wait for Clerk to finish revoking sessions before navigating.
        // Its listener can fire before this promise resolves.
        await clerk.signOut();
        location.replace(pageUrl);
      } catch(error) {
        signingOut=false;
        status.textContent='Не удалось выйти. Проверьте соединение и повторите.';
        signOut.hidden=false;signOut.textContent='Повторить выход';
        signOut.disabled=false;workspaceSignOut.disabled=false;
      }
    };
    signOut.onclick=exit;workspaceSignOut.onclick=exit;
    render(clerk);
    clerk.addListener(state=>{try {render(state);} catch(error) {lock();status.textContent='Не удалось открыть кабинет. Повторите вход.';}});
  } catch(error) {lock();status.textContent=error.message;retry.hidden=false;}
})();
