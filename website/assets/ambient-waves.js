/* Gradient Waves concept from React Bits, adapted to a lightweight local 2D field.
 * Complementary to the existing light-flow renderer, not a replacement. */
const main=document.querySelector('.page-home main');
if(main){
 const canvas=document.createElement('canvas');canvas.className='ambient-waves';canvas.setAttribute('aria-hidden','true');main.prepend(canvas);
 const ctx=canvas.getContext('2d');
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 let w=1,h=1,frame=0,last=0,clock=0,dirty=true;
 function size(){w=innerWidth;h=innerHeight;const d=Math.min(devicePixelRatio||1,1.5);canvas.width=w*d;canvas.height=h*d;ctx.setTransform(d,0,0,d,0,0);dirty=true;wake();}
 function stopped(){return media.matches||document.hidden||document.body.classList.contains('motion-paused');}
 function wake(){if(!frame&&!document.hidden)frame=requestAnimationFrame(draw);}
 function draw(now){
  frame=0;if(document.hidden)return;
  const still=stopped();
  if(!still&&last&&now-last<32){wake();return;}
  if(!still)clock+=last?Math.min(now-last,80)*.00012:0;
  last=now;
  if(!still||dirty){
   dirty=false;ctx.clearRect(0,0,w,h);
   const scroll=scrollY/Math.max(1,document.documentElement.scrollHeight-h);
   const halo=ctx.createRadialGradient(w*.78,h*.55,0,w*.78,h*.55,w*.65);
   halo.addColorStop(0,'rgba(20,91,255,.18)');halo.addColorStop(.55,'rgba(0,175,255,.025)');halo.addColorStop(1,'rgba(5,11,24,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
   for(let i=0;i<7;i++){
    const base=h*(.7+i*.035),phase=clock+i*.32+scroll*1.8;
    const points=[];
    for(let x=-30;x<=w+30;x+=24){const y=base+Math.sin(x/w*4.8+phase)*h*.13+Math.sin(x/w*2.4-phase*.6)*h*.1;points.push([x,y]);}
    ctx.beginPath();points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.lineTo(w+30,h+30);ctx.lineTo(-30,h+30);ctx.closePath();
    const fill=ctx.createLinearGradient(0,base-h*.2,0,h);fill.addColorStop(0,`rgba(25,110,185,${.07+i*.003})`);fill.addColorStop(1,'rgba(5,11,24,0)');ctx.fillStyle=fill;ctx.fill();
    ctx.beginPath();points.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=`rgba(139,216,255,${.07-i*.005})`;ctx.lineWidth=1;ctx.stroke();
   }
  }
  if(!still)wake();
 }
 addEventListener('resize',size,{passive:true});addEventListener('scroll',()=>{dirty=true;wake();},{passive:true});
 document.addEventListener('visibilitychange',()=>{last=0;dirty=true;if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();});
 media.addEventListener('change',()=>{dirty=true;last=0;wake();});
 new MutationObserver(()=>{dirty=true;last=0;wake();}).observe(document.body,{attributes:true,attributeFilter:['class']});
 size();
}
