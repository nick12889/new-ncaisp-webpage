(()=>{
 const holder=document.querySelector('#cal-inline');if(!holder)return;
 let started=false;
 function start(){if(started)return;started=true;
  // Cal.com's queued embed loader; scoped to this appointment type.
  window.Cal=window.Cal||function(){const cal=window.Cal,args=arguments;if(!cal.loaded){cal.ns={};cal.q=cal.q||[];const script=document.createElement('script');script.src='https://app.cal.com/embed/embed.js';script.onerror=()=>{holder.querySelector('.calendar-status')?.replaceChildren(document.createTextNode('The calendar could not load. Please use the direct calendar link below.'))};document.head.appendChild(script);cal.loaded=true}if(args[0]==='init'){const api=function(){api.q.push(arguments)};api.q=[];const ns=args[1];if(typeof ns==='string'){cal.ns[ns]=cal.ns[ns]||api;cal.ns[ns].q.push(args);cal.q.push(['initNamespace',ns])}else cal.q.push(args);return}cal.q.push(args)};
  Cal('init','ncai-session',{origin:'https://app.cal.com'});
  const api=Cal.ns['ncai-session'];
  api('inline',{elementOrSelector:'#cal-inline',calLink:'nishant-chaudhary-ai-strategy-partners/ai-strategy-session',config:{layout:'month_view'}});
  const theme=()=>api('ui',{theme:document.documentElement.dataset.theme==='night'?'dark':'light',hideEventTypeDetails:false,layout:'month_view'});
  theme();new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  new MutationObserver(()=>{const f=holder.querySelector('iframe');if(f){f.title='Book an AI Strategy Session with NCAI Strategy Partners';holder.querySelector('.calendar-status')?.remove()}}).observe(holder,{childList:true,subtree:true});
 }
 if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){start();observer.disconnect()}},{rootMargin:'250px'});observer.observe(holder)}else start();
})();
