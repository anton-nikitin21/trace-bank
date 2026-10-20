/** Relay light transport, drawn only in the viewport. One page RAF coordinator
 * drives both continuous travel and reversible scroll composition. */
export function mountLightFlow({host,hero,scope,reduced,requestFrame}) {
  const field=document.createElement('div');field.className='light-field';field.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.className='flow-canvas';field.append(canvas);host.prepend(field);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx){field.remove();return {measure(){},update(){return false;},setPaused(){},destroy(){}};}
  const clamp=n=>Math.min(1,Math.max(0,n));
  const colors=Array.from({length:32},(_,i)=>{const v=i/31;return `rgba(${Math.round(29+v*174)},${Math.round(119+v*120)},${Math.round(224+v*31)},${(.05+v*.90).toFixed(3)})`;});
  let width=0,height=0,dpr=1,start=0,end=0,range=1,heroHeight=0,threads=[];
  let progress=0,seconds=0,paused=false,visible=true,destroyed=false,dirty=true,canObserve=false;
  let heroVisible=true,scopeVisible=false;
  function syncPlayback(){
    field.dataset.motion=reduced.matches?'static':'flow';
    field.classList.toggle('is-paused',paused||!visible||reduced.matches);
  }
  const observer=new IntersectionObserver(entries=>{
    if(destroyed)return;
    for(const entry of entries){if(entry.target===hero){heroVisible=entry.isIntersecting;hero.classList.toggle('is-offscreen',!entry.isIntersecting);}else scopeVisible=entry.isIntersecting;}
    canObserve=true;visible=heroVisible||scopeVisible;syncPlayback();dirty=true;requestFrame();
  });
  observer.observe(hero);observer.observe(scope);
  function sampleCurve(points,a,b,c,d,n=128){
    for(let j=points.length?1:0;j<=n;j++){
      const t=j/n,u=1-t;
      points.push([u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]]);
    }
  }
  function measure(){
    if(destroyed)return;
    const hostBox=host.getBoundingClientRect(),heroBox=hero.getBoundingClientRect(),scopeBox=scope.getBoundingClientRect();
    width=hostBox.width;height=innerHeight;heroHeight=heroBox.height;start=hostBox.top+scrollY;end=scopeBox.bottom+scrollY;range=Math.max(1,end-start-height);
    const mobile=width<=600,n=mobile?6:12,bodyHeight=Math.max(600,end-start-heroHeight);
    dpr=Math.min(devicePixelRatio||1,mobile?1.5:1.25);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;field.style.height=`${height}px`;
    threads=[];
    for(let i=0;i<n;i++){
      const shift=(i-(n-1)/2)*(mobile?21:12),x=v=>(v+shift)*width/1600,y=v=>heroHeight*v,b=v=>heroHeight+bodyHeight*v;
      const points=[];
      sampleCurve(points,[x(1320),y(-.18)],[x(680),y(-.02)],[x(560),y(.23)],[x(1060),y(.40)]);
      sampleCurve(points,[x(1060),y(.40)],[x(1560),y(.57)],[x(1100),y(.67)],[x(580),y(.82)]);
      sampleCurve(points,[x(580),y(.82)],[x(60),y(.97)],[x(120),b(.23)],[x(930),b(.42)]);
      sampleCurve(points,[x(930),b(.42)],[x(1740),b(.61)],[x(1480),b(.78)],[x(700),b(.95)]);
      sampleCurve(points,[x(700),b(.95)],[x(-80),b(1.12)],[x(430),b(1.05)],[x(360),b(1.10)]);
      const distances=[0];let length=0;
      for(let j=1;j<points.length;j++){length+=Math.hypot(points[j][0]-points[j-1][0],points[j][1]-points[j-1][1]);distances.push(length);}
      const samples=points.map((p,j)=>[p[0],p[1],distances[j]/length*1000]);
      threads.push({samples,duration:11.6+(i%5)*.72,phase:20+(i%6)*36+Math.floor(i/6)*7,tail:104+(i%3)*15});
    }
    canvas.dataset.geometry=[width,height,heroHeight,end-start].map(n=>n.toFixed(2)).join('/');
    field.dataset.threads=String(n);dirty=true;syncPlayback();
  }
  function draw(scroll){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const inside=scroll+height>start&&scroll<end;
    field.style.visibility=inside?'visible':'hidden';
    if(!inside)return;
    const still=reduced.matches,p=still?0:progress;
    const shiftX=(Math.sin(p*Math.PI*2)*36-p*24)*(width<=600?.4:1),shiftY=-p*84;
    const angle=Math.sin(p*Math.PI)*.85*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    const anchorX=width*.65,anchorY=heroHeight*.25,worldY=start-scroll+shiftY;
    const foundation=new Path2D(),halo=new Path2D(),buckets=Array.from({length:32},()=>new Path2D());
    const worldHeight=end-start;
    for(const thread of threads){
      const head=(thread.phase+260*seconds/thread.duration)%260;
      const samples=thread.samples;let px=0,py=0,s=0,hasPrevious=false,previousLevel=-1;
      for(const point of samples){
        const dx=point[0]-anchorX,dy=point[1]-anchorY;
        const x=dx*cos-dy*sin+anchorX+shiftX,y=dx*sin+dy*cos+anchorY+worldY;
        if(hasPrevious){
          if(!((y<-35&&py<-35)||(y>height+35&&py>height+35)||(x<-35&&px<-35)||(x>width+35&&px>width+35))){
            const edge=clamp((worldHeight-point[1])/360)*clamp((point[1]+70)/140);
            if(edge>0){
              foundation.moveTo(px,py);foundation.lineTo(x,y);
              if(!still){
                const at=(s+point[2])*.5,lag=(head-at%260+260)%260;
                if(lag<thread.tail){
                  // A short eased leading ramp and long nonlinear trailing decay.
                  const front=clamp(lag/4),strength=Math.pow(1-lag/thread.tail,1.7)*front*edge;
                  const level=Math.min(31,Math.floor(strength*31));
                  if(level>0){const bucket=buckets[level];if(previousLevel!==level)bucket.moveTo(px,py);bucket.lineTo(x,y);previousLevel=level;if(level>18){halo.moveTo(px,py);halo.lineTo(x,y);}}
                  else previousLevel=-1;
                }else previousLevel=-1;
              }
            }else previousLevel=-1;
          }else previousLevel=-1;
        }
        px=x;py=y;s=point[2];hasPrevious=true;
      }
    }
    ctx.save();ctx.beginPath();ctx.rect(0,Math.max(0,start-scroll),width,Math.min(height,end-scroll)-Math.max(0,start-scroll));ctx.clip();
    ctx.lineCap='round';ctx.lineJoin='round';const foundationColor=still?'rgba(88,161,218,.29)':'rgba(48,123,188,.15)';
    const fade=ctx.createLinearGradient(0,start-scroll,0,end-scroll);fade.addColorStop(0,'rgba(48,123,188,0)');fade.addColorStop(.045,foundationColor);fade.addColorStop(.86,foundationColor);fade.addColorStop(1,'rgba(48,123,188,0)');ctx.strokeStyle=fade;ctx.lineWidth=.7;ctx.stroke(foundation);
    if(!still){
      // A single narrow halo pass, no shadowBlur, filters or full-page bitmaps.
      ctx.strokeStyle='rgba(64,175,255,.08)';ctx.lineWidth=7;ctx.stroke(halo);ctx.strokeStyle='rgba(114,205,255,.06)';ctx.lineWidth=3.5;ctx.stroke(halo);
      for(let i=1;i<32;i++){ctx.strokeStyle=colors[i];ctx.lineWidth=1.05+i/31*.85;ctx.stroke(buckets[i]);}
    }
    ctx.restore();
    field.dataset.composition=[shiftX,shiftY,angle].map(n=>n.toFixed(5)).join('/');
    field.dataset.time=seconds.toFixed(4);field.dataset.head=((threads[0].phase+260*seconds/threads[0].duration)%260).toFixed(4);
  }
  function update(scroll,dt){
    if(destroyed)return false;
    const target=clamp((scroll-start)/range),gap=target-progress;
    if(!paused&&!reduced.matches)progress=Math.abs(gap)<.00008?target:progress+gap*(1-Math.exp(-Math.min(dt,100)/145));
    const inside=scroll+height>start&&scroll<end;
    if(!canObserve)visible=inside;
    const running=!paused&&!reduced.matches&&visible&&inside;
    if(running)seconds+=Math.min(dt,48)/1000;
    if(running||dirty||Math.abs(gap)>.00008)draw(scroll);
    dirty=false;field.dataset.progress=progress.toFixed(5);syncPlayback();
    return running||(!paused&&!reduced.matches&&visible&&Math.abs(target-progress)>.00008);
  }
  function setPaused(value){paused=value;dirty=true;syncPlayback();}
  function destroy(){destroyed=true;observer.disconnect();field.remove();threads=[];}
  measure();return {measure,update,setPaused,destroy,element:field};
}
