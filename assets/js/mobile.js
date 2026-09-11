(function(){
const $=s=>document.querySelector(s);
/* nav */
addEventListener('scroll',()=>{
  $('#mnav').classList.toggle('msolid',scrollY>30);
  $('#mdock').classList.toggle('mup',scrollY>420);
},{passive:true});
/* menu */
$('#mburger').onclick=()=>document.body.classList.toggle('mnavopen');
$('#mmclose').onclick=()=>document.body.classList.remove('mnavopen');
addEventListener('keydown',e=>{if(e.key==='Escape')document.body.classList.remove('mnavopen');});
document.querySelectorAll('.mmenu a').forEach(a=>a.onclick=()=>document.body.classList.remove('mnavopen'));
/* reveal */
const io=new IntersectionObserver(e=>e.forEach(x=>{if(x.isIntersecting){x.target.classList.add('min');io.unobserve(x.target);}}),
  {threshold:0,rootMargin:'0px 0px -12% 0px'});
document.querySelectorAll('.mrv').forEach(el=>io.observe(el));
/* count-up */
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);
  const el=e.target,end=+el.dataset.count;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=end;return;}
  let t0=null;
  requestAnimationFrame(function t(n){if(t0===null)t0=n;
    const p=Math.min(1,Math.max(0,(n-t0)/1300));
    el.textContent=p<1?Math.round(end*(1-Math.pow(1-p,3))):end;
    if(p<1)requestAnimationFrame(t);});
}),{threshold:.6});
document.querySelectorAll('[data-count]').forEach(el=>cio.observe(el));
/* accordion */
document.querySelectorAll('.macc button').forEach(b=>b.onclick=()=>{
  const a=b.parentElement,body=a.querySelector('.mbody'),open=a.classList.toggle('mopen');
  body.style.maxHeight=open?body.scrollHeight+'px':0;
});
/* the phone in the hero alternates between the two people who sign a handover.
   Copy is taken from the chef and storekeeper screen spec, not invented. */
const APPS=[
{role:'Store · Intake',who:'Just say what came in',
 say:'"From Mile 12 Market: 5 crates tomatoes 24k each"',
 rows:[['5 × Crate of tomatoes','₦24,000 each']],
 tot:['Delivery total','₦120,000'], act:'Sign and record'},
{role:'Kitchen · Asked for',who:'Awaiting signature',
 rows:[['2 × Crate tomatoes','Received'],['1 × Bag rice','Received']],
 good:'Everything matched.<br>The kitchen reconciles clean.', act:'Sign for delivery'}
];
let ai=0;
function drawApp(){
  const a=APPS[ai],el=document.querySelector('#mapp');
  if(!el)return;
  el.innerHTML=
   '<div class="mtop"><div class="mrole">'+a.role+'</div><div class="mwho">'+a.who+'</div></div>'+
   '<div class="mbodyx">'+
     (a.say?'<div class="msay">'+a.say+'</div>':'')+
     a.rows.map(r=>'<div class="mrow"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>').join('')+
     (a.tot?'<div class="mrow tot"><span>'+a.tot[0]+'</span><span>'+a.tot[1]+'</span></div>':'')+
     (a.good?'<div class="mgood">'+a.good+'</div>':'')+
     '<div class="mact">'+a.act+'</div>'+
   '</div>';
  document.querySelectorAll('#mswap i').forEach((d,n)=>d.classList.toggle('on',n===ai));
}
drawApp();
setInterval(()=>{ai=(ai+1)%APPS.length;drawApp();},3400);
})();
