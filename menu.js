'use strict';
const p=new URLSearchParams(location.search),$=id=>document.getElementById(id),mode=EduvizeOutputModes.mode();
document.documentElement.dataset.outputMode=mode;
const canteen=p.get('canteen')||'11592',provider=p.get('provider')||'strava',presentation=p.get('presentation')||(p.get('days')==='1'?'day':'overview'),days=presentation==='day'?1:Math.max(2,Math.min(10,Number(p.get('days'))||5)),showAllergens=p.get('allergens')!=='0';
document.documentElement.dataset.menuPresentation=presentation==='day'?'day':'overview';
let data=null,compact=false;
const mainIcon=document.querySelector('.edu-header-icon').innerHTML;
const make=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
function icon(type,variant){const host=make('span','','edu-app-icon meal-icon'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);svg.innerHTML=EduvizeMeals.paths[type]||EduvizeMeals.paths.other;host.append(svg);if(variant)host.append(make('span',variant,'meal-variant'));return host;}
function dateLabel(date){return new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00'));}
function geometry(){const g=EduvizeSegmentProfile.resolve(innerWidth,innerHeight);compact=mode!=='web'&&(g.kind==='panoramic'||g.width<=1200&&g.height<=720);document.documentElement.dataset.menuCompact=String(compact);const text=EduvizeSegmentProfile.text(g,mode);for(const k of ['body','title','label','caption','footnote'])document.documentElement.style.setProperty('--menu-'+k,text[k]+'px');document.documentElement.style.setProperty('--menu-gap',Math.max(12,Math.min(40,g.short*.018))+'px');EduvizeOutputHeader.update();}
function renderMeals(sheet,records){
 const groups=new Map();for(const meal of records){if(!groups.has(meal.date))groups.set(meal.date,[]);groups.get(meal.date).push(meal);}
 const list=make('div','','menu-days');
 for(const [date,meals]of groups){const section=make('section','','menu-day');section.setAttribute('aria-label',dateLabel(date));if(presentation!=='day'&&!compact){const heading=make('h2',dateLabel(date),'menu-day-heading');section.append(heading);}
 const grid=make('div','','menu-grid');for(const meal of meals){const card=make('article','','menu-card'),head=make('div','','meal-heading');head.append(icon(meal.type,meal.variant),make('h3',meal.label,'menu-group'));card.dataset.date=meal.date;card.dataset.label=meal.label+(meal.part?' · pokračování':'');card.dataset.mealType=meal.type;card.append(head,make('p',meal.name,'menu-name'));
 if(showAllergens){const note=meal.allergens?(meal.sharedAllergens?'Alergeny celého doplňku: ':'Alergeny: ')+meal.allergens.replace(/,\s*/g,', '):'Alergeny dodavatel neuvedl.';const caption=make('p',compact&&meal.allergens?(meal.sharedAllergens?'Doplněk · alergeny: ':'Alergeny: ')+(meal.allergens.match(/\b\d{2}(?=\s*-)/g)||[]).join(', '):note,'menu-allergens');caption.title=note;card.append(caption);}grid.append(card);}section.append(grid);list.append(section);}
 sheet.append(list);
}
function render(){if(!data)return;if(!compact)document.querySelector('.edu-header-icon').innerHTML=mainIcon;const selected=data.days.slice(0,days),records=selected.flatMap(day=>day.meals.flatMap(meal=>EduvizeMeals.expand(meal).map(m=>({...m,date:day.date}))));
 $('menu-title').textContent=presentation==='day'&&selected.length?dateLabel(selected[0].date):'Jídelníček';$('menu-subtitle').textContent=(p.get('name')||'Jídelna '+canteen)+(presentation==='day'?' · Denní nabídka':' · Přehled '+selected.length+' dnů');
 const host=$('menu-content');if(!records.length){host.replaceChildren(make('p','Jídelna zatím nezveřejnila jídelníček pro následující dny.','menu-empty'));return;}
 EduvizePagedPanel.mountFlow(host,fitRecords(host,records),{key:provider+':'+canteen+':'+presentation+':'+days,fit:false,preferWhole:true,render:renderMeals,onPageChange:()=>{if(!compact)return;const first=host.querySelector('.menu-card');if(!first)return;$('menu-title').textContent=first.dataset.label;$('menu-subtitle').textContent=dateLabel(first.dataset.date)+' · '+(p.get('name')||'Jídelna '+canteen);const svg=icon(first.dataset.mealType).querySelector('svg');document.querySelector('.edu-header-icon').replaceChildren(svg);EduvizeOutputHeader.update();}});
}
// Divide an oversized meal at word boundaries; never shrink its reading scale or crop it.
function fitRecords(host,records){
 if(mode==='web'||!host.clientHeight)return records;
 const probe=make('div','','edu-flow-measure');probe.style.width=host.clientWidth+'px';host.append(probe);
 const height=host.clientHeight-Math.max(54,host.querySelector('.edu-pagination')?.getBoundingClientRect().height||0)-12;
 const fits=meal=>{probe.replaceChildren();renderMeals(probe,[meal]);return probe.scrollHeight<=height;};
 const result=[];
 for(const record of records){if(fits(record)){result.push(record);continue;}let words=[],part=0;
  for(const word of record.name.split(/ +/)){const candidate=[...words,word];if(words.length&&!fits({...record,name:candidate.join(' ')})){result.push({...record,name:words.join(' '),part:part++});words=[];}words.push(word);}
  if(words.length)result.push({...record,name:words.join(' '),part});
 }
 probe.remove();return result;
}
async function load(){try{const response=await fetch('/api/menu?'+new URLSearchParams({provider,canteen}),{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.detail||'Jídelníček se nepodařilo načíst.');data=result;$('message').textContent=data.stale?data.warning:'';$('message').hidden=!data.stale;const link=make('a','Zdroj: Strava.cz · jídelna '+canteen);link.href=data.source;link.target='_self';$('menu-source').replaceChildren(link,make('span',' · Aktualizováno '+new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Prague'}).format(new Date(data.updated*1000))));render();}catch(error){$('message').hidden=false;$('message').textContent=error.message;}}
geometry();addEventListener('resize',()=>{geometry();render()});load();setInterval(load,300000);
if(mode==='nsp')setInterval(()=>{const buttons=$('menu-content').querySelectorAll('.edu-pagination button');if(buttons.length===2){if(buttons[1].disabled){while(!buttons[0].disabled)buttons[0].click();}else buttons[1].click();}},12000);
