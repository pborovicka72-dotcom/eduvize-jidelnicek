'use strict';
const published=document.documentElement.dataset.menuPublished==='true';
const p=published?new URLSearchParams():new URLSearchParams(location.search),$=id=>document.getElementById(id);
const nativePreviewHost=!published&&p.has('edu-menu-preview-viewport');
if(published)document.documentElement.dataset.menuPublicBooted='true';
let mode=published?'web':EduvizeOutputModes.mode();
let publication=null,publicationSignal=null,publicationRun=0,outputRuntime=null;
const ownedViewport=published&&window.frameElement?.dataset.eduMenuViewport==='1';
let viewportFrame=null,viewportHost=null;
document.documentElement.dataset.outputMode=mode;
let canteen=p.get('canteen')||'11592',provider=p.get('provider')||'strava',presentation=p.get('presentation')||(p.get('days')==='1'?'day':'overview'),days=presentation==='day'?1:Math.max(2,Math.min(10,Number(p.get('days'))||5)),showAllergens=p.get('allergens')!=='0';
let data=null,signature='',pending=false,anchor='',timer=null;
// The public template is inert until verified content and presentation can be committed together.
let publicationStyles=null;
function publicationState(state,message='Načítám jídelníček…'){
 if(!published)return;
 document.documentElement.dataset.menuPublicPhase=state;
 const status=$('menu-public-status');
 if(state==='ready'||state==='viewport')document.documentElement.dataset.menuPublicReady=state;
 else delete document.documentElement.dataset.menuPublicReady;
 if(status){status.hidden=state==='ready'||state==='viewport';status.textContent=message;}
}
function removePublicationMarkup(){
 $('menu-app')?.remove();document.querySelector('.edu-web-header')?.remove();
}
function mountPublicationMarkup(){
 if(document.documentElement.dataset.menuPublicBootError==='true')throw Error('Výstup jídelníčku se nepodařilo spustit. Obnovte stránku.');
 if(!$('menu-app')){
  const template=$('menu-public-template');
  if(!template?.content)throw Error('Šablona jídelníčku není dostupná. Obnovte stránku.');
  document.body.insertBefore(template.content.cloneNode(true),$('menu-public-status'));
 }
 window.EduvizeOutputIntegrity.applyMenuPublication();
}
function waitForPublicationStyles(){
 if(!publicationStyles){
  publicationStyles=Promise.all([...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>{
   if(link.sheet)return Promise.resolve();
   return new Promise((resolve,reject)=>{
    let timer;
    const done=error=>{clearTimeout(timer);link.removeEventListener('load',loaded);link.removeEventListener('error',failed);error?reject(error):resolve();};
    const loaded=()=>done(),failed=()=>done(Error('Vzhled jídelníčku se nepodařilo načíst. Obnovte stránku.'));
    link.addEventListener('load',loaded,{once:true});link.addEventListener('error',failed,{once:true});timer=setTimeout(failed,8000);
    if(link.sheet)loaded();
   });
  })).then(()=>document.fonts?.ready).catch(error=>{publicationStyles=null;throw error;});
 }
 return publicationStyles;
}
const make=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
const dateLabel=date=>new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00'));
function title(date,index){
 const today=data.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
 const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 return date===today?'Dnes na talíři':date===tomorrow.toISOString().slice(0,10)?'Zítra na talíři':index===0?'Nejbližší nabídka':dateLabel(date).split(' ')[0];
}
function mealChoiceKey(meal){return meal.type+'\u0000'+(['breakfast','snack','dinner'].includes(meal.type)?(meal.sourceGroup||meal.group)+'\u0000':'')+meal.name.normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase('cs');}
function mealVariantLabel(value){return value?(/^[0-9]+$/.test(value)?'menu '+value:value):'bez označení menu';}
function mergeIdenticalMeals(meals){
 const buckets=new Map();
 for(const meal of meals){const key=mealChoiceKey(meal);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(meal);}
 return [...buckets.values()].map(rows=>{
  if(rows.length===1)return rows[0];
  const variants=[...new Set(rows.map(m=>m.variant||''))],notes=new Map();
  for(const row of rows){
   const key=JSON.stringify([row.allergenText,row.allergenTitle,row.allergenScope||'',!!row.sharedAllergens]);
   if(!notes.has(key))notes.set(key,{text:row.allergenText,title:row.allergenTitle,variants:new Set()});
   notes.get(key).variants.add(row.variant||'');
  }
  const list=[...notes.values()],label=note=>[...note.variants].map(mealVariantLabel).join(', ');
  return {...rows[0],variant:variants.length===1?variants[0]:'',
   name:rows[0].name+(variants.length>1?' ('+variants.map(mealVariantLabel).join(', ')+')':''),
   allergenText:list.length===1?list[0].text:list.map(n=>label(n)+': '+n.text).join(' · '),
   allergenTitle:list.length===1?list[0].title:list.map(n=>label(n)+': '+(n.title||'neuvedeny')).join(' · '),
   variantDetails:rows.map(m=>({variant:m.variant||'',sourceGroup:m.sourceGroup||m.group,allergenScope:m.allergenScope,allergens:m.allergens}))};
 });
}
function allDays(){return data.days.slice(0,days).map((day,index)=>{
 const records=day.meals.flatMap(meal=>EduvizeMeals.expand(meal)),groups=[];
 // Keep every distinct dish; merge repeated labels only within this day and course.
 for(const kind of ['breakfast','soup','lunch','snack','dinner','other','drinks']){
  let meals=records.filter(m=>kind==='other'?['fruit','vegetables','dessert','other'].includes(m.type):m.type===kind);
  if(!meals.length)continue;
  const choices=new Set(meals.map(m=>m.variant?'variant:'+m.variant:mealChoiceKey(m))).size;
  meals=mergeIdenticalMeals(meals.map(m=>{
   const codes=[...new Set((m.allergens||'').match(/\b\d{1,2}(?=\s*(?:-|,|$))/g)||[])].map(Number).join(', ');
   const scope=m.allergenScope==='menu'?'celého menu':m.allergenScope==='section'?'hlavního chodu a doplňků':m.sharedAllergens?'celého doplňku':'';
   return {...m,allergenText:codes?'Alergeny'+(scope?' '+scope:'')+': '+codes:'Alergeny'+(scope?' '+scope:'')+' neuvedeny',allergenTitle:m.allergens};
  }));
  if(kind==='other'&&meals.every(m=>!m.variantDetails&&m.sharedAllergens&&m.allergenText===meals[0].allergenText&&m.allergenTitle===meals[0].allergenTitle&&m.variant===meals[0].variant&&m.sourceGroup===meals[0].sourceGroup))meals=[{...meals[0],name:meals.map(m=>m.name).join(', ')}];
  groups.push({kind,label:kind==='lunch'?'Hlavní jídla'+(choices>1?' · výběr z '+choices+' menu':''):kind==='other'?'Doplněk':EduvizeMeals.labels[kind],meals});
 }
 return {date:day.date,title:title(day.date,index),dateLabel:dateLabel(day.date),groups};
});}
function geometry(){
 const fixed=published&&window.EduvizePublishedOutput?.metrics.geometry;
 const width=fixed?.width||innerWidth,height=fixed?.height||innerHeight;
 if(published){const app=$('menu-app'),fixedMode=mode!=='web';
  app.style.width=fixedMode?width+'px':'';app.style.height=fixedMode?height+'px':'';
  app.style.transformOrigin='top left';app.style.transform=fixedMode?'scale('+Math.min(innerWidth/width,innerHeight/height)+')':'';
  document.body.style.overflow=fixedMode?'hidden':'';
 }
 const g=EduvizeSegmentProfile.resolve(width,height),profile=EduvizeMealBoard.profile(width,height,mode);
 document.documentElement.style.setProperty('--menu-gap',profile.gap+'px');
 document.documentElement.style.setProperty('--meal-gap',profile.gap+'px');
 document.documentElement.style.setProperty('--meal-body',profile.body+'px');
 document.documentElement.dataset.mealHorizontal=String(profile.horizontal);
 document.documentElement.dataset.mealWide=String(profile.horizontal&&g.width>=1500);
 document.documentElement.dataset.mealCompact=String(mode!=='web'&&(g.ratio>=2.7||g.width<=1200&&g.height<=720));
 EduvizeOutputHeader.update();return profile;
}
function render(){
 if(viewportFrame||published&&!$('menu-app'))return;
 if(!data)return;clearInterval(timer);const profile=geometry(),selected=allDays(),host=$('menu-content');
 $('menu-title').textContent='Jídelníček';$('menu-subtitle').textContent=p.get('name')||(provider==='icanteen'&&canteen.startsWith('https://')?'Jídelna iCanteen':'Jídelna '+canteen);

 if(!selected.length){host.replaceChildren(make('p','Jídelna zatím nezveřejnila jídelníček pro následující dny.','menu-empty'));return;}
 const options={paths:EduvizeMeals.paths,allergens:showAllergens,horizontal:profile.horizontal};
 if(mode==='web'){
  host.replaceChildren();host.className='';
  for(const group of EduvizeMealBoard.pages(selected,profile.first,profile.later))EduvizeMealBoard.render(host,group,options);
  return;
 }
 // Reserve a real pager row before testing full-day cards at their actual dimensions.
 const readOnly=published&&!EduvizeOutputModes.isInteractive();
 const navProbe=make('nav','','edu-pagination'),navButton=make('button','← Předchozí','edu-pagination-button');navButton.hidden=readOnly;navProbe.append(navButton);host.append(navProbe);const navHeight=navProbe.getBoundingClientRect().height;navProbe.remove();
 const available=Math.max(70,host.clientHeight-navHeight-20);
 const probe=make('div','','menu-measure');probe.style.height=available+'px';host.append(probe);
 function fits(group,size){probe.replaceChildren();probe.style.setProperty('--meal-body',size+'px');EduvizeMealBoard.render(probe,group,options);return [...probe.querySelectorAll('.edu-meal-day-body')].every(n=>n.scrollHeight<=n.clientHeight+1)&&[...probe.querySelectorAll('.edu-meal-day')].every(n=>n.scrollHeight<=n.clientHeight+1);}
 const spreads=[];let start=0;const savedAnchor=anchor;let currentPage=0;
 while(start<selected.length){
  let count=Math.min(start===0?profile.first:profile.later,selected.length-start);
  while(count>1&&!fits(selected.slice(start,start+count),profile.body*(count>=3?.86:1)))count--;
  const group=selected.slice(start,start+count);let size=profile.body*(count>=3?.86:1);
  while(size>14&&!fits(group,size))size=Math.max(14,size-1);
  spreads.push({days:group,size});start+=count;
 }
 probe.remove();
 // Shared pager preserves manual interaction; restore the day anchor after reflow.
 EduvizePagedPanel.mount(host,spreads,{key:provider+':'+canteen+':'+presentation+':'+days,fit:false,render:(sheet,page)=>{sheet.style.setProperty('--meal-body',page.size+'px');EduvizeMealBoard.render(sheet,page.days,options);},onPageChange:i=>{currentPage=i;anchor=spreads[i]?.days[0].date||'';}});
 const nav=host.querySelector('.edu-pagination');
 if(readOnly)for(const button of nav.querySelectorAll('button'))button.hidden=true;
 const target=spreads.findIndex(page=>page.days.some(day=>day.date===savedAnchor));
 if(target>=0){const controls=nav.querySelectorAll('button');while(currentPage>target)controls[0].click();while(currentPage<target)controls[1].click();}
 // Published mode uses the registry presentation, never browser preferences.
 if(readOnly&&spreads.length>1){
  timer=setInterval(()=>{const controls=nav.querySelectorAll('button');if(controls.length<2)return;if(!controls[controls.length-1].disabled)controls[controls.length-1].click();else while(!controls[0].disabled)controls[0].click();},12000);
 }

}
async function load(){
 if(nativePreviewHost||pending||viewportFrame||published&&(!publication||publicationSignal?.aborted))return;pending=true;
 const run=publicationRun;
 try{let envelope;
  if(published){const client=EduvizeOutputClient.create({origin:location.origin,signal:publicationSignal,fetch:(url,options)=>fetch(url,{...options,credentials:'omit'})});envelope=await client.getPublicData(publication.id);}
  else{const response=await fetch('/jidelnicek/api/menu?'+new URLSearchParams({provider,canteen}),{cache:'no-store',signal:AbortSignal.timeout(15000)});envelope=await response.json();if(!response.ok)throw Error(envelope.detail||'Jídelníček se nepodařilo načíst.');}
  if(published&&(run!==publicationRun||publicationSignal?.aborted))return;
  const result=published?envelope.data:envelope;
  if(published&&(envelope.schemaVersion!==1||typeof envelope.stale!=='boolean'||envelope.complete!==true||result?.provider!==provider||result?.canteen!==canteen||!Array.isArray(result.days)))throw Error('Neplatná data jídelníčku.');
  if(published){await waitForPublicationStyles();await new Promise(resolve=>requestAnimationFrame(resolve));if(run!==publicationRun||publicationSignal?.aborted)return;mountPublicationMarkup();}
  $('message').textContent=result.stale?result.warning:'';$('message').hidden=!result.stale;
  const next=JSON.stringify([result.days,result.today]);data=result;
  const changed=next!==signature;signature=next;
  const sourceLabel=provider==='icanteen'&&canteen.startsWith('https://')?'iCanteen':(provider==='strava'?'Strava.cz':'iCanteen')+' · jídelna '+canteen;
  const link=make('a','Zdroj: '+sourceLabel);if(!published||EduvizeOutputModes.isInteractive()){link.href=data.source;link.target='_self';}else{link.setAttribute('aria-disabled','true');link.tabIndex=-1;}$('menu-source').replaceChildren(link,make('span',' · Aktualizováno '+new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Prague'}).format(new Date(data.updated*1000))));
  if(changed||published&&!document.documentElement.dataset.menuPublicReady)render();
  if(published){updateHeaderDate();EduvizeOutputHeader.update();publicationState('ready');}
 }catch(error){if(published&&(run!==publicationRun||publicationSignal?.aborted))return;if(published&&[401,403,404,410].includes(error.status)){clearPublication(error);return;}if(published&&!document.documentElement.dataset.menuPublicReady){removePublicationMarkup();publicationState('error',error.message);}else{$('message').hidden=false;$('message').textContent=error.message;}}finally{if(!published||run===publicationRun)pending=false;}
}
let resizeFrame;addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(render);});
document.fonts?.ready.then(()=>{if(data)render();});
function removeViewport(){
 if(viewportFrame){window.EduvizePreviewViewport?.unmount(viewportFrame);viewportHost.remove();viewportFrame=null;viewportHost=null;}
 const app=$('menu-app');if(app)app.style.display='';
}
function mountViewport(url,width,height){
 if(!window.EduvizePreviewViewport)throw Error('Výstupní viewport není dostupný.');
 if(!viewportFrame){viewportHost=document.createElement('div');viewportHost.style.cssText='position:fixed;inset:0;overflow:hidden;visibility:hidden';
  viewportFrame=document.createElement('iframe');viewportFrame.title='Jídelníček';viewportFrame.dataset.eduMenuViewport='1';viewportFrame.src=url;
  const frame=viewportFrame;frame.addEventListener('load',()=>{if(!frame.isConnected)return;let html,doc;try{doc=frame.contentDocument;html=doc?.documentElement}catch{}if(!html){publicationState('error','Jídelníček se nepodařilo načíst.');return}const ready=()=>{if(!frame.isConnected||frame.contentDocument!==doc)return;const phase=html.dataset.menuPublicPhase;if(phase==='ready'){observer.disconnect();viewportHost.style.visibility='visible';publicationState('viewport')}else if(phase==='error'){observer.disconnect();publicationState('error',doc.getElementById('menu-public-status')?.textContent||'Jídelníček se nepodařilo načíst.')}};const observer=new MutationObserver(ready);observer.observe(html,{attributes:true,attributeFilter:['data-menu-public-phase']});ready()});
  viewportHost.append(viewportFrame);document.body.append(viewportHost);
 }
 const app=$('menu-app');if(app)app.style.display='none';document.body.style.overflow='hidden';
 window.EduvizePreviewViewport.mount(viewportFrame,{host:viewportHost,width,height,aspect:false});
}
function fixedViewport(snapshot,metrics){
 const url=new URL('published.html',location.href);url.search='';url.hash='';url.searchParams.set('edu-output',snapshot.id);
 mountViewport(url.href,metrics.geometry.width,metrics.geometry.height);if(viewportHost.style.visibility==='visible')publicationState('viewport');
}
function nativePreviewViewport(){
 const keys=['edu-menu-preview-viewport','edu-menu-preview-width','edu-menu-preview-height'];
 if(p.get(keys[0])!=='1'||p.get('preview')!=='1'||p.get('ev_inner')!=='1'||p.has('edu-output')||!['nsp','kiosk'].includes(mode))throw Error('Neplatná adresa náhledu jídelníčku. Otevřete náhled z konfigurace.');
 const width=Number(p.get(keys[1])),height=Number(p.get(keys[2]));
 if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=8192))throw Error('Neplatné rozměry náhledu jídelníčku.');
 if(mode==='nsp'){
  const orientation=p.get('segment_orientation')||p.get('orientation')||'landscape',style=Number(p.get('segment_style')||p.get('style')||1),block=Number(p.get('segment_block')||p.get('block')||1);
  const rect=window.EduvizeNSPLayouts?.layouts?.[orientation]?.[style]?.[block-1];
  if(!rect||rect[0]!==width||rect[1]!==height)throw Error('Náhled neodpovídá vybranému segmentu.');
 }else if(width<240||height<240)throw Error('Neplatné rozměry kiosku.');
 const url=new URL(location.href);for(const key of keys)url.searchParams.delete(key);url.searchParams.set('ev_inner','1');
 document.title='Náhled Jídelníčku';mountViewport(url.href,width,height);
}
function clearPublication(){
 removeViewport();publicationRun++;publication=null;data=null;signature='';clearInterval(timer);
 removePublicationMarkup();publicationState('error','Tento výstup není dostupný.');
}
function validPublishedMenuSource(provider,source){
 if(!['strava','icanteen'].includes(provider)||typeof source!=='string')return false;
 if(/^[0-9]{4,6}$/.test(source))return true;
 if(provider!=='icanteen'||source.length>250)return false;
 try{const u=new URL(source);return u.protocol==='https:'&&!!u.hostname&&u.hostname.includes('.')&&!u.username&&!u.password&&!u.search&&!u.hash&&(!u.port||u.port==='443')}catch{return false}
}
if(nativePreviewHost){
 try{nativePreviewViewport();}catch(error){$('message').hidden=false;$('message').textContent=error.message;}
}else if(published){
 try{outputRuntime=EduvizeOutputRuntime.start({appId:'menu',clear:clearPublication,
  render:async(snapshot,metrics,context)=>{
   const v=snapshot.payload;
   if(!validPublishedMenuSource(v?.provider,v?.canteen)||typeof v.name!=='string'||v.name.length>120||/[\x00-\x1f]/.test(v.name)||!['day','overview'].includes(v.presentation)||!Number.isInteger(v.days)||(v.presentation==='day'?v.days!==1:![3,5,10].includes(v.days))||typeof v.allergens!=='boolean'||typeof v.showTime!=='boolean')throw Error('Neplatné nastavení jídelníčku.');
   removePublicationMarkup();publicationState('loading');
   publicationRun++;publication=snapshot;publicationSignal=context.signal;
   mode=snapshot.presentation.mode;provider=v.provider;canteen=v.canteen;presentation=v.presentation;days=v.days;showAllergens=v.allergens;
   p.set('name',v.name);p.set('showTime',v.showTime?'1':'0');signature='';pending=false;
   document.documentElement.dataset.outputMode=mode;
   if(window.EduvizeOutputIntegrity?.menuPublication!=='verified-snapshot-v1'||typeof window.EduvizeOutputIntegrity.applyMenuPublication!=='function')throw Error('Společný vzhled výstupu není připravený. Obnovte stránku.');
   if(mode!=='web'&&!ownedViewport){fixedViewport(snapshot,metrics);return;}
   removeViewport();await load();
  },onError:()=>{if(!document.documentElement.dataset.menuPublicReady){removePublicationMarkup();publicationState('error','Jídelníček nyní není dostupný.');}}
 });}catch{clearPublication();}
}else{geometry();load();}
setInterval(load,300000);

// Prefer the complete date; use its numeric form when the shared title scale cannot fit.
const dateMeasure=document.createElement('canvas').getContext('2d');
function updateHeaderDate(now=new Date()){
 const node=$('menu-period');if(!node)return;
 const options={day:'numeric',month:'long',timeZone:'Europe/Prague'};
 const full=new Intl.DateTimeFormat('cs-CZ',options).format(now);
 if(!node.textContent)node.textContent=full;
 const style=getComputedStyle(node),size=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edu-header-title'))||parseFloat(style.fontSize);
 const width=node.parentElement.clientWidth;
 if(dateMeasure)dateMeasure.font=style.fontWeight+' '+size+'px '+style.fontFamily;
 const compact=width>0&&dateMeasure&&dateMeasure.measureText(full).width>width-2;
 const text=compact?new Intl.DateTimeFormat('cs-CZ',{...options,month:'numeric'}).format(now):full;
 if(node.textContent!==text)node.textContent=text;
 node.title=full;node.setAttribute('aria-label',full);
}
(function(){function clock(){const now=new Date();updateHeaderDate(now);const node=$('menu-clock');if(node){node.hidden=p.get('showTime')!=='1';node.style.display=node.hidden?'none':'';if(!node.hidden)node.textContent=new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Prague'}).format(now);}}clock();setInterval(clock,1000);addEventListener('resize',()=>requestAnimationFrame(()=>{updateHeaderDate();EduvizeOutputHeader.update();}));document.fonts?.ready.then(()=>{updateHeaderDate();EduvizeOutputHeader.update();});})();
