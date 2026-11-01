'use strict';
const p=new URLSearchParams(location.search),$=id=>document.getElementById(id),mode=EduvizeOutputModes.mode();
document.documentElement.dataset.outputMode=mode;
const canteen=p.get('canteen')||'11592',provider=p.get('provider')||'strava',days=Math.max(1,Math.min(10,Number(p.get('days'))||5)),showAllergens=p.get('allergens')!=='0';
let data=null;
const make=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
function geometry(){const g=EduvizeSegmentProfile.resolve(innerWidth,innerHeight),text=EduvizeSegmentProfile.text(g,mode);for(const k of ['body','title','label','caption','footnote'])document.documentElement.style.setProperty('--menu-'+k,text[k]+'px');EduvizeOutputHeader.update();}
function render(){if(!data)return;const records=[];for(const day of data.days.slice(0,days)){const date=new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date(day.date+'T12:00:00'));for(const meal of day.meals)records.push({...meal,date});}
const host=$('menu-content');if(!records.length){host.replaceChildren(make('p','Jídelna zatím nezveřejnila jídelníček pro následující dny.','menu-empty'));return;}
EduvizePagedPanel.mountFlow(host,records,{key:provider+':'+canteen+':'+days,fit:false,preferWhole:true,render:(sheet,meals)=>{const grid=make('div','','menu-grid');for(const meal of meals){const card=make('article','','menu-card');card.append(make('p',meal.date,'menu-date'),make('h2',meal.group,'menu-group'),make('p',meal.name,'menu-name'));if(showAllergens)card.append(make('p',meal.allergens?'Alergeny: '+meal.allergens:'Alergeny neuvedeny dodavatelem','menu-allergens'));grid.append(card);}sheet.append(grid);}});
}
async function load(){try{const response=await fetch('/api/menu?'+new URLSearchParams({provider,canteen}),{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.detail||'Jídelníček se nepodařilo načíst.');data=result;$('menu-subtitle').textContent=(p.get('name')||'Jídelna '+canteen)+' · Strava.cz';$('message').textContent=data.stale?data.warning:'';$('message').hidden=!data.stale;const link=make('a','Zdroj: Strava.cz · jídelna '+canteen);link.href=data.source;link.target='_blank';link.rel='noopener noreferrer';$('menu-source').replaceChildren(link,make('span',' · Načteno '+new Intl.DateTimeFormat('cs-CZ',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Prague'}).format(new Date(data.updated*1000))));render();}catch(error){$('message').hidden=false;$('message').textContent=error.message;}}
geometry();addEventListener('resize',()=>{geometry();render()});load();setInterval(load,300000);
if(mode==='nsp')setInterval(()=>{const buttons=$('menu-content').querySelectorAll('.edu-pagination button');if(buttons.length===2){if(buttons[1].disabled){while(!buttons[0].disabled)buttons[0].click();}else buttons[1].click();}},10000);

