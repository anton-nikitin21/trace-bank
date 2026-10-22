/* Short, staged text entrances; no character splitting or altered semantics. */
const media=matchMedia('(prefers-reduced-motion: reduce)');
const text=[...document.querySelectorAll('.page-home main h2,.page-home main h3,.page-home main p,.team-footer h2,.team-footer p,.team-footer strong,.material-list>a>span,.material-list>a>small,.metric-strip strong')].filter(el=>!el.closest('.hero,.preview-panel,.chapter-art,.connection-sticky')&&!el.matches('.display'));
text.push(...document.querySelectorAll('.hero-copy .title-line,.hero-description,.hero-caption'));
let observer;
function setup(){
 observer?.disconnect();
 text.forEach(el=>{el.classList.remove('copy-arrival');el.style.removeProperty('--copy-delay');});
 if(media.matches)return;
 observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)entry.target.classList.add('copy-arrived');else if(entry.intersectionRatio===0)entry.target.classList.remove('copy-arrived');}},{threshold:[0,.15],rootMargin:'0px'});
 text.forEach(el=>{el.classList.add('copy-arrival');el.style.setProperty('--copy-delay',el.tagName==='P'?'100ms':'0ms');observer.observe(el);});
}
setup();media.addEventListener('change',setup);
