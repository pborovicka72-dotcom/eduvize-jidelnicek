'use strict';
const published=document.documentElement.dataset.menuPublished==='true';
const p=published?new URLSearchParams():new URLSearchParams(location.search),$=id=>document.getElementById(id);
let mode=published?'web':EduvizeOutputModes.mode();
let publication=null,publicationSignal=null,publicationRun=0,outputRuntime=null;
document.documentElement.dataset.outputMode=mode;
let canteen=p.get('canteen')||'11592',provider=p.get('provider')||'strava',presentation=p.get('presentation')||(p.get('days')==='1'?'day':'overview'),days=presentation==='day'?1:Math.max(2,Math.min(10,Number(p.get('days'))||5)),showAllergens=p.get('allergens')!=='0';
let data=null,signature='',pending=false,anchor='',timer=null;
const make=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
const dateLabel=date=>new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00'));
function title(date,index){
 const today=data.today||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Prague'}).format(new Date());
 const tomorrow=new Date(today+'T12:00:00Z');tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
 return date===today?'Dnes na talíři':date===tomorrow.toISOString().slice(0,10)?'Zítra na talíři':index===0?'Nejbližší nabídka':dateLabel(date).split(' ')[0];
}
function allDays(){return data.days.slice(0,days).map((day,index)=>{
 const records=day.meals.flatMap(meal=>EduvizeMeals.expand(meal)),groups=[];
 // Keep every provider record, including breakfast, dinner and supplements.
 for(const kind of ['breakfast','soup','lunch','snack','dinner','other','drinks']){
  let meals=records.filter(m=>kind==='other'?['fruit','vegetables','dessert','other'].includes(m.type):m.type===kind);
  if(!meals.length)continue;
  if(kind==='other'&&meals.every(m=>m.sharedAllergens&&m.allergens===meals[0].allergens))meals=[{...meals[0],name:meals.map(m=>m.name).join(', ')}];
  groups.push({kind,label:kind==='lunch'?'Hlavní jídla'+(meals.length>1?' · výběr z '+meals.length+' menu':''):kind==='other'?'Doplněk':EduvizeMeals.labels[kind],meals:meals.map(m=>{
   const codes=[...new Set((m.allergens||'').match(/\b\d{1,2}(?=\s*(?:-|,|$))/g)||[])].map(Number).join(', ');
   return {...m,allergenText:m.sharedAllergens?(codes?'Alergeny celého doplňku: '+codes:'Alergeny doplňku neuvedeny'):(codes?'Alergeny: '+codes:'Alergeny neuvedeny'),allergenTitle:m.allergens};
  })});
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
 if(!data)return;clearInterval(timer);const profile=geometry(),selected=allDays(),host=$('menu-content');
 $('menu-title').textContent='Jídelníček';$('menu-subtitle').textContent=p.get('name')||'Jídelna '+canteen;

 if(!selected.length){host.replaceChildren(make('p','Jídelna zatím nezveřejnila jídelníček pro následující dny.','menu-empty'));return;}
 const options={paths:EduvizeMeals.paths,allergens:showAllergens,horizontal:profile.horizontal};
 if(mode==='web'){
  host.replaceChildren();host.className='';
  for(const group of EduvizeMealBoard.pages(selected,profile.first,profile.later))EduvizeMealBoard.render(host,group,options);
  return;
 }
 // Reserve a real pager row before testing full-day cards at their actual dimensions.
 const navProbe=make('nav','','edu-pagination'),navButton=make('button','← Předchozí','edu-pagination-button');navProbe.append(navButton);host.append(navProbe);const navHeight=navProbe.getBoundingClientRect().height;navProbe.remove();
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
 const target=spreads.findIndex(page=>page.days.some(day=>day.date===savedAnchor));
 if(target>=0){const controls=nav.querySelectorAll('button');while(currentPage>target)controls[0].click();while(currentPage<target)controls[1].click();}
 // Published mode uses the registry presentation, never browser preferences.
 if(published&&!EduvizeOutputModes.isInteractive()&&spreads.length>1){
  timer=setInterval(()=>{const controls=nav.querySelectorAll('button');if(controls.length<2)return;if(!controls[controls.length-1].disabled)controls[controls.length-1].click();else while(!controls[0].disabled)controls[0].click();},12000);
 }

}
async function load(){
 if(pending||published&&(!publication||publicationSignal?.aborted))return;pending=true;
 const run=publicationRun;
 try{const url=published?'/api/public/v1/outputs/'+publication.id+'/data':'/api/menu?'+new URLSearchParams({provider,canteen});
  const response=await fetch(url,{cache:'no-store',credentials:published?'omit':'same-origin',signal:publicationSignal||AbortSignal.timeout(15000)}),envelope=await response.json();
  if(published&&(run!==publicationRun||publicationSignal?.aborted))return;
  if(!response.ok){const error=Error('Jídelníček se nepodařilo načíst.');error.status=response.status;throw error;}
  const result=published?envelope.data:envelope;
  if(published&&(envelope.schemaVersion!==1||typeof envelope.stale!=='boolean'||envelope.complete!==true||result?.provider!==provider||result?.canteen!==canteen||!Array.isArray(result.days)))throw Error('Neplatná data jídelníčku.');
  $('message').textContent=result.stale?result.warning:'';$('message').hidden=!result.stale;
  const next=JSON.stringify([result.days,result.today]);data=result;
  const changed=next!==signature;signature=next;
  const link=make('a','Zdroj: '+(provider==='strava'?'Strava.cz':provider)+' · jídelna '+canteen);link.href=data.source;link.target='_self';$('menu-source').replaceChildren(link,make('span',' · Aktualizováno '+new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Prague'}).format(new Date(data.updated*1000))));
  if(changed)render();
 }catch(error){if(published&&(run!==publicationRun||publicationSignal?.aborted))return;if(published&&[401,403,404,410].includes(error.status)){clearPublication(error);return;}$('message').hidden=false;$('message').textContent=error.message;}finally{if(!published||run===publicationRun)pending=false;}
}
let resizeFrame;addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(render);});
document.fonts?.ready.then(()=>{if(data)render();});
function clearPublication(){
 publicationRun++;publication=null;data=null;signature='';clearInterval(timer);
 $('menu-content').replaceChildren();$('menu-source').replaceChildren();$('menu-subtitle').textContent='';
 $('message').hidden=false;$('message').textContent='Tento výstup není dostupný.';
}
if(published){
 try{outputRuntime=EduvizeOutputRuntime.start({appId:'menu',clear:clearPublication,
  render:async(snapshot,metrics,context)=>{
   const v=snapshot.payload;
   if(v?.provider!=='strava'||!/^\d{4,6}$/.test(v.canteen||'')||typeof v.name!=='string'||!['day','overview'].includes(v.presentation)||!Number.isInteger(v.days)||v.days<1||v.days>10||typeof v.allergens!=='boolean'||typeof v.showTime!=='boolean')throw Error('Neplatné nastavení jídelníčku.');
   publicationRun++;publication=snapshot;publicationSignal=context.signal;
   mode=snapshot.presentation.mode;provider=v.provider;canteen=v.canteen;presentation=v.presentation;days=v.days;showAllergens=v.allergens;
   p.set('name',v.name);p.set('showTime',v.showTime?'1':'0');signature='';pending=false;
   document.documentElement.dataset.outputMode=mode;
   geometry();await load();
  },onError:()=>{if(!data){$('message').hidden=false;$('message').textContent='Jídelníček nyní není dostupný.';}}
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
