/* Local depth layers: React Bits TiltedCard principles + Scroll World section progress.
 * Existing scene elements and their animation transforms are left intact. */
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(hover:hover) and (pointer:fine)');
const scenes=[...document.querySelectorAll('.chapter-art')].map((scene,i)=>{
 const shell=document.createElement('div');shell.className=`depth-shell depth-scene-${i+1}`;
 scene.before(shell);shell.append(scene);
 for(let j=0;j<2;j++){const layer=document.createElement('i');layer.className=`depth-plate depth-plate-${j+1}`;layer.setAttribute('aria-hidden','true');shell.prepend(layer);}
 const item={shell,scene,p:.5,target:.5,x:0,y:0,tx:0,ty:0,active:false};
 shell.addEventListener('pointermove',event=>{if(!fine.matches||reduced.matches)return;const box=shell.getBoundingClientRect();item.tx=((event.clientX-box.left)/box.width-.5)*5;item.ty=-((event.clientY-box.top)/box.height-.5)*4;request();},{passive:true});
 shell.addEventListener('pointerleave',()=>{item.tx=item.ty=0;request();});
 return item;
});
let frame=0;
const disabled=()=>reduced.matches||document.body.classList.contains('motion-paused');
function request(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
function draw(){
 frame=0;let settling=false;
 for(const item of scenes){
  if(!item.active)continue;
  const rect=item.shell.getBoundingClientRect();
  item.target=disabled()?.5:Math.max(0,Math.min(1,(innerHeight*.9-rect.top)/(innerHeight*.75+rect.height*.25)));
  if(disabled())item.tx=item.ty=0;
  item.p+=(item.target-item.p)*.12;item.x+=(item.tx-item.x)*.12;item.y+=(item.ty-item.y)*.12;
  item.shell.style.setProperty('--depth-progress',item.p.toFixed(4));
  item.shell.style.setProperty('--depth-turn',`${item.x.toFixed(3)}deg`);item.shell.style.setProperty('--depth-lean',`${item.y.toFixed(3)}deg`);
  if(Math.abs(item.target-item.p)>.001||Math.abs(item.tx-item.x)>.01||Math.abs(item.ty-item.y)>.01)settling=true;
 }
 if(settling)request();
}
const observer=new IntersectionObserver(entries=>{for(const entry of entries){const item=scenes.find(s=>s.shell===entry.target);item.active=entry.isIntersecting;}request();},{rootMargin:'100px'});
scenes.forEach(item=>observer.observe(item.shell));
addEventListener('scroll',request,{passive:true});addEventListener('resize',request,{passive:true});
reduced.addEventListener('change',request);
new MutationObserver(request).observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else request();});
