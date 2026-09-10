/* sticky nav */
const nav=document.getElementById('nav');
const alwaysSolid=nav.classList.contains('always-solid'); /* inner pages open on a solid nav */
addEventListener('scroll',()=>nav.classList.toggle('solid',alwaysSolid||scrollY>40),{passive:true});

/* mobile menu */
const burger=document.getElementById('burger');
if(burger){
  const shut=()=>{nav.classList.remove('open');burger.setAttribute('aria-expanded','false');};
  burger.addEventListener('click',e=>{e.stopPropagation();
    const open=nav.classList.toggle('open');
    burger.setAttribute('aria-expanded',open?'true':'false');
    burger.setAttribute('aria-label',open?'Close menu':'Open menu');});
  document.querySelectorAll('.links a').forEach(a=>a.addEventListener('click',shut));
  document.addEventListener('click',e=>{if(nav.classList.contains('open')&&!nav.contains(e.target))shut();});
  addEventListener('keydown',e=>{if(e.key==='Escape')shut();});
}

/* scroll reveal */
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:.15});
document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

/* count-up. The clock is anchored to the first frame's own timestamp: anchoring it
   to performance.now() instead made progress go negative, because a frame is stamped
   with the time the frame began, which can be before the observer callback ran. That
   printed negative numbers and left the counters stuck. */
const still=matchMedia('(prefers-reduced-motion: reduce)');
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);
  const el=e.target,end=+el.dataset.count;
  if(still.matches){el.textContent=end;return;}
  let t0=null;
  requestAnimationFrame(function tick(t){
    if(t0===null)t0=t;
    const p=Math.min(1,Math.max(0,(t-t0)/1400));
    el.textContent=p<1?Math.round(end*(1-Math.pow(1-p,3))):end;
    if(p<1)requestAnimationFrame(tick);
  });
}),{threshold:.6});
document.querySelectorAll('[data-count]').forEach(el=>cio.observe(el));

/* faq */
document.querySelectorAll('.q button').forEach(b=>b.addEventListener('click',()=>{
  const q=b.parentElement,a=q.querySelector('.a'),open=q.classList.toggle('open');
  a.style.maxHeight=open?a.scrollHeight+'px':0;
}));

/* magnetic buttons */
document.querySelectorAll('.magnet').forEach(b=>{
  b.addEventListener('mousemove',e=>{const r=b.getBoundingClientRect();
    b.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.18}px,${(e.clientY-r.top-r.height/2)*.28}px)`;});
  b.addEventListener('mouseleave',()=>b.style.transform='');
});

/* ticker: the list is written once in the HTML and cloned here so it can loop
   seamlessly. Speed is fixed in pixels a second, so adding items lengthens the
   ribbon instead of speeding it up. */
(function(){
  const track=document.querySelector('.tk-track');
  if(!track||!track.children.length)return;
  [...track.children].forEach(n=>track.appendChild(n.cloneNode(true)));
  const pace=()=>{const one=track.scrollWidth/2;
    track.style.setProperty('animation-duration',Math.max(12,Math.round(one/58))+'s','important');};
  pace();
  addEventListener('resize',pace,{passive:true});
})();

/* hero board: rotate tickets so it looks alive (home page only) */
(function(){const cols=document.querySelectorAll('.bd .cb');let i=0;if(!cols.length)return;
  setInterval(()=>{const c=cols[i%2];const first=c.firstElementChild;if(!first)return;
    first.style.animation='none';first.offsetHeight;first.style.animation='';c.appendChild(first);i++;},4200);})();
