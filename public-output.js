/* Stable outer URL; only explicitly published menu settings enter the frame. */
(function(){
 'use strict';
 const id=new URL(location.href).searchParams.get('edu-menu'),status=document.getElementById('status');
 let frame,last='',pending=false;
 async function refresh(){
  if(pending)return;pending=true;
  try{
   if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('Neplatný odkaz jídelníčku.');
   const response=await fetch('https://eduvize-dokumenty-api.onrender.com/api/public/menu-outputs/'+id,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Nastavení jídelníčku nyní není dostupné.');
   const data=await response.json(),config=data.config,url=new URL('index.html',location.href);
   for(const key of ['provider','canteen','name','days','presentation','allergens','showTime','viewMode']){
    const value=config.values[key];if(value!==undefined)url.searchParams.set(key,typeof value==='boolean'?(value?'1':'0'):String(value));
   }
   url.searchParams.set('edu-profile',id);
   for(const key of ['orientation','style','block'])if(config.segment?.[key]!==undefined)url.searchParams.set('segment_'+key,String(config.segment[key]));
   if(config.outputInteraction)url.searchParams.set('interaction',config.outputInteraction);
   if(config.outputKioskLayout)url.searchParams.set('kiosk_layout',config.outputKioskLayout);
   if(url.href!==last){
    if(!frame){frame=document.createElement('iframe');frame.title='Jídelníček';document.body.append(frame);}
    frame.style.height='100%';frame.src=url.href;last=url.href;
   }
   status.hidden=true;
  }catch(error){status.hidden=false;status.textContent=last?'Nastavení se nepodařilo obnovit; zobrazuje se poslední načtený výstup.':error.message;}
  finally{pending=false;}
 }
 // Web frame reports natural content height; fixed NSP/kiosk geometry remains untouched.
 addEventListener('message',event=>{if(event.source!==frame?.contentWindow||event.origin!==location.origin||event.data?.type!=='eduvize-web-content-height')return;const height=Number(event.data.height);if(Number.isFinite(height)&&height>0&&height<100000)frame.style.height=Math.ceil(height)+'px';});
 refresh();setInterval(refresh,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
