/* Section tabs for phones (founder, 2026-10-06: the phone site was one long
   scroll). Loaded in <head>, not deferred, so the page never paints the whole
   long scroll first and then snaps shut.

   Markup, on any page:
     <div class="ptabs"><div class="ptabs-in" role="tablist" aria-label="...">
       <button type="button" role="tab" aria-controls="remy">Remy</button> ...
     </div></div>
     <section id="remy" data-panel class="is-on"> ... </section>

   The first panel carries class="is-on" in the HTML. Below 900px only the panel
   that is on shows; at 900px and up every panel shows and the bar is hidden, so
   desktop keeps the flowing page. A link to #anything opens the tab that holds
   it, and choosing a tab writes its id into the address, so a reload or a
   shared link opens the same tab. Arrow keys, Home and End move between tabs.
   Without JavaScript nothing is hidden. */
(function(){
  var root=document.documentElement;
  root.classList.add('tabs-js');
  var phone=matchMedia('(max-width:900px)');

  function init(){
    var bar=document.querySelector('.ptabs');
    if(!bar)return;
    var tabs=[].slice.call(bar.querySelectorAll('[role="tab"]'));
    var panels=tabs.map(function(t){return document.getElementById(t.getAttribute('aria-controls'));});
    if(panels.some(function(p){return !p;}))return;

    tabs.forEach(function(t,i){
      if(!t.id)t.id='tab-'+panels[i].id;
    });

    /* the bar sticks just under whichever header is showing */
    function measure(){
      var navs=[document.getElementById('mnav'),document.getElementById('nav')];
      var h=0;
      navs.forEach(function(n){if(n&&n.offsetHeight&&getComputedStyle(n).position==='fixed')h=Math.max(h,n.offsetHeight);});
      root.style.setProperty('--tabtop',h+'px');
      root.style.setProperty('--tabbar',(bar.offsetHeight||0)+'px');
    }

    function roles(){
      panels.forEach(function(p,i){
        if(phone.matches){p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby',tabs[i].id);p.setAttribute('tabindex','-1');}
        else{p.removeAttribute('role');p.removeAttribute('aria-labelledby');p.removeAttribute('tabindex');}
      });
    }

    function current(){
      for(var i=0;i<panels.length;i++)if(panels[i].classList.contains('is-on'))return i;
      return 0;
    }

    function show(i,opts){
      opts=opts||{};
      panels.forEach(function(p,n){p.classList.toggle('is-on',n===i);});
      tabs.forEach(function(t,n){
        t.setAttribute('aria-selected',n===i?'true':'false');
        t.tabIndex=n===i?0:-1;
      });
      var t=tabs[i];
      /* keep the chosen tab in view inside the bar, without moving the page */
      var strip=t.parentNode;
      if(strip.scrollWidth>strip.clientWidth){
        var want=t.offsetLeft-(strip.clientWidth-t.offsetWidth)/2;
        strip.scrollLeft=Math.max(0,want);
      }
      if(opts.focus)t.focus();
      if(opts.write&&history.replaceState)history.replaceState(null,'','#'+panels[i].id);
      if(opts.scroll&&phone.matches){
        /* only scroll when the reader is already below the top of the panels,
           so the new tab starts right under the bar and nothing jumps */
        var top=panels[i].getBoundingClientRect().top+scrollY-(bar.offsetHeight+parseFloat(getComputedStyle(root).getPropertyValue('--tabtop')||0));
        var barTop=bar.getBoundingClientRect().top;
        var stuck=barTop<=parseFloat(getComputedStyle(root).getPropertyValue('--tabtop')||0)+1;
        if(stuck)scrollTo({top:Math.max(0,top),behavior:'auto'});
      }
    }

    /* open the tab that holds this id, then bring the id into view */
    function follow(id,scroll){
      if(!id)return false;
      var el=document.getElementById(id);
      if(!el)return false;
      var n=-1;
      panels.forEach(function(p,i){if(p===el||p.contains(el))n=i;});
      if(n<0)return false;
      if(!panels[n].classList.contains('is-on'))show(n);
      if(scroll&&phone.matches)requestAnimationFrame(function(){el.scrollIntoView({block:'start'});});
      return true;
    }

    tabs.forEach(function(t,i){
      t.addEventListener('click',function(){show(i,{write:true,scroll:true});});
      t.addEventListener('keydown',function(e){
        var k=e.key,n=null;
        if(k==='ArrowRight')n=(i+1)%tabs.length;
        else if(k==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;
        else if(k==='Home')n=0;
        else if(k==='End')n=tabs.length-1;
        if(n===null)return;
        e.preventDefault();
        show(n,{focus:true,write:true,scroll:true});
      });
    });

    /* a link on this page to something inside a closed tab opens that tab first,
       before the browser scrolls to it */
    document.addEventListener('click',function(e){
      var a=e.target.closest&&e.target.closest('a[href*="#"]');
      if(!a||a.origin!==location.origin||a.pathname!==location.pathname)return;
      follow(decodeURIComponent(a.hash.slice(1)),false);
    },true);
    addEventListener('hashchange',function(){follow(decodeURIComponent(location.hash.slice(1)),true);});

    measure();roles();
    if(!follow(decodeURIComponent(location.hash.slice(1)),true))show(current());
    addEventListener('resize',measure,{passive:true});
    var change=function(){measure();roles();};
    if(phone.addEventListener)phone.addEventListener('change',change);else if(phone.addListener)phone.addListener(change);
    addEventListener('load',measure);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
