/* React Bits FadeContent / SpotlightCard concepts, adapted to native HTML.
 * Source reference: DavidHDev/react-bits e12c221. License: react-bits.LICENSE.md.
 * No continuous render loop, scroll hijacking, or React runtime. */
const media=matchMedia('(prefers-reduced-motion: reduce)');
const targets=[...document.querySelectorAll('.material-list>a')];
let observer;
function setup(){
 observer?.disconnect();
 targets.forEach(el=>el.classList.remove('rb-enter'));
 if(media.matches||!('IntersectionObserver' in window))return;
 observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)entry.target.classList.add('rb-visible');else if(entry.intersectionRatio===0)entry.target.classList.remove('rb-visible');}},{threshold:[0,.08]});
 targets.forEach(el=>{el.classList.add('rb-enter');observer.observe(el);});
}
setup();media.addEventListener('change',setup);
const pointer=matchMedia('(pointer:fine) and (hover:hover)');
document.querySelectorAll('.material-list>a').forEach(card=>{
 card.classList.add('rb-card');
 card.addEventListener('pointermove',event=>{
  if(media.matches||!pointer.matches)return;
  const rect=card.getBoundingClientRect();card.style.setProperty('--pointer-x',`${event.clientX-rect.left}px`);card.style.setProperty('--pointer-y',`${event.clientY-rect.top}px`);
 },{passive:true});
});
