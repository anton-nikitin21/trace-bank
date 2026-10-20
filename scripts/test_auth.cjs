// State-machine tests use a stub SDK. Real Clerk sign-in still needs a real application key.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../website/assets/auth.js'),'utf8');
const key='pk_test_'+Buffer.from('trace-example.clerk.accounts.dev$').toString('base64');
async function harness({publishableKey=key,user=null,organization=null,networkError=false,search=""}={}) {
  const nodes=new Map(),calls=[],events=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:true,inert:true,textContent:''});return nodes.get(id);};
  let listener,reloads=0;const redirects=[];
  const clerk={user,organization,load:async()=>{},addListener:callback=>{listener=callback;},signOut:async()=>listener({user:null,organization:null})};
  for(const name of ['mountSignUp','unmountSignUp','mountSignIn','unmountSignIn','mountOrganizationList','unmountOrganizationList','mountUserButton','unmountUserButton','mountOrganizationSwitcher']) clerk[name]=element=>calls.push([name,element.id]);
  const context={URLSearchParams,window:{TRACE_AUTH:{publishableKey},Clerk:clerk},document:{getElementById:node,createElement:()=>({setAttribute(){},remove(){}}),head:{append:script=>queueMicrotask(()=>networkError?script.onerror():script.onload())},dispatchEvent:event=>events.push(event.type)},location:{replace:url=>redirects.push(url),search,origin:'https://example.test',pathname:'/trace-bank/workspace.html',reload:()=>{reloads++;assert.equal(node('trace-workspace').hidden,true);assert.equal(node('trace-workspace').inert,true);}},setTimeout,clearTimeout,atob:value=>Buffer.from(value,'base64').toString('binary'),CustomEvent:class{constructor(type){this.type=type;}}};
  await vm.runInNewContext(code,context);
  return {node,calls,events,context,redirects,emit:state=>listener(state),reloads:()=>reloads};
}
(async()=>{
  let h=await harness({publishableKey:''});assert.equal(h.node('trace-workspace').hidden,true);assert.equal(h.events.length,0);assert.match(h.node('auth-status').textContent,/ключ/);
  h=await harness({publishableKey:'sk_test_not_a_public_key'});assert.equal(h.node('trace-workspace').hidden,true);assert.match(h.node('auth-status').textContent,/Publishable/);
  h=await harness({networkError:true});assert.equal(h.node('trace-workspace').hidden,true);assert.equal(h.node('auth-retry').hidden,false);
  h=await harness({search:'?auth=signup'});assert.ok(h.calls.some(([name])=>name==='mountSignUp'));
  h=await harness();assert.ok(h.calls.some(([name])=>name==='mountSignIn'));assert.equal(h.node('trace-workspace').hidden,true);
  h.emit({user:{id:'user_1'},organization:null});assert.ok(h.calls.some(([name])=>name==='mountOrganizationList'));assert.equal(h.node('trace-workspace').hidden,true);assert.equal(h.node('auth-sign-out').hidden,false);
  h.emit({user:{id:'user_1'},organization:{id:'org_1',name:'Учебный банк'}});assert.equal(h.node('trace-workspace').hidden,false);assert.equal(h.node('trace-workspace').inert,false);assert.equal(h.context.window.TRACE_SESSION.organizationId,'org_1');assert.deepEqual(h.events,['trace:authenticated']);
  h.emit({user:{id:'user_1'},organization:{id:'org_1'}});assert.equal(h.events.length,1);
  h.emit({user:{id:'user_1'},organization:{id:'org_2'}});assert.equal(h.reloads(),1);assert.equal(h.context.window.TRACE_SESSION,null);
  h=await harness({user:{id:'user_1'},organization:{id:'org_1'}});h.emit({user:null,organization:null});assert.equal(h.reloads(),1);assert.equal(h.node('trace-workspace').hidden,true);
  h=await harness({user:{id:'user_1'},organization:null});await h.node('auth-sign-out').onclick();assert.equal(h.redirects.length,1);
  h=await harness({user:{id:'user_1'},organization:{id:'org_1'}});await h.node('auth-workspace-sign-out').onclick();assert.equal(h.reloads(),0);assert.equal(h.redirects.length,1);assert.equal(h.node('trace-workspace').hidden,true);assert.equal(h.context.window.TRACE_SESSION,null);
  // A listener update must not reload while session revocation is pending.
  h=await harness({user:{id:'user_1'},organization:{id:'org_1'}});
  let finish,requests=0;
  h.context.window.Clerk.signOut=()=>{requests++;h.emit({user:null,organization:null});return new Promise(resolve=>finish=resolve);};
  const pending=h.node('auth-workspace-sign-out').onclick();
  await h.node('auth-workspace-sign-out').onclick();
  assert.equal(requests,1);assert.equal(h.reloads(),0);assert.equal(h.redirects.length,0);assert.equal(h.node('trace-workspace').hidden,true);
  finish();await pending;assert.equal(h.redirects.length,1);
  // A failed request keeps the cabinet locked and permits a successful retry.
  h=await harness({user:{id:'user_1'},organization:{id:'org_1'}});
  h.context.window.Clerk.signOut=async()=>{throw Error('offline');};
  await h.node('auth-workspace-sign-out').onclick();assert.equal(h.redirects.length,0);assert.equal(h.node('trace-workspace').hidden,true);assert.equal(h.node('auth-sign-out').disabled,false);
  h.context.window.Clerk.signOut=async()=>{};await h.node('auth-sign-out').onclick();assert.equal(h.redirects.length,1);
  console.log('PASS: missing/invalid key, network failure, sign-in, organization requirement, one-time bootstrap, organization change and sign-out');
})().catch(error=>{console.error(error);process.exitCode=1;});
