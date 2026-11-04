'use strict';
const $=id=>document.getElementById(id),ids=['provider','canteen','name','days','presentation','allergens','showTime','viewMode'],key='eduvize-menu-settings-v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch{}
const query=new URLSearchParams(location.search);
for(const id of ids){const value=query.has(id)?query.get(id):saved[id];if(value!==undefined){if(['allergens','showTime'].includes(id))$(id).checked=value===true||value==='1';else $(id).value=value;}}
if(!query.has('presentation')&&!saved.presentation&&(query.get('days')==='1'||saved.days==='1'))$('presentation').value='day';
if(!$('days').value)$('days').value='5';
function syncPresentation(){$('days-field').hidden=$('presentation').value==='day';}
$('presentation').addEventListener('change',syncPresentation);syncPresentation();
function values(){return Object.fromEntries(ids.map(id=>[id,['allergens','showTime'].includes(id)?$(id).checked:$(id).value.trim()]));}
function output(){const u=new URL('index.html',location.href);for(const [k,v]of Object.entries(values()))u.searchParams.set(k,typeof v==='boolean'?(v?'1':'0'):v);return EduvizeOutputModes.url(u,$('viewMode').value).href;}
function validate(){if(!/^\d{4,6}$/.test($('canteen').value.trim()))throw Error('Číslo jídelny musí mít 4 až 6 číslic.');}
const preview=EduvizeEditorialAdmin.mount({mode:$('viewMode'),url:output,key:'eduvize-menu-segment',host:document.querySelector('.edu-output-section')});
$('check').onclick=async()=>{const button=$('check');try{validate();button.disabled=true;$('status').textContent='Načítám jídelníček…';const response=await fetch('/api/menu?'+new URLSearchParams({provider:$('provider').value,canteen:$('canteen').value.trim()}));const data=await response.json();if(!response.ok)throw Error(data.detail||'Jídelníček se nepodařilo načíst.');$('status').textContent=data.days.length?'Načteno '+data.days.length+' dnů. Nejbližší jídelníček: '+new Date(data.days[0].date+'T12:00:00').toLocaleDateString('cs-CZ')+'.'+(data.stale?' '+data.warning:''):'Jídelna zatím nezveřejnila jídelníček pro následující dny.';preview.refresh();}catch(error){$('status').textContent=error.message}finally{button.disabled=false}};
$('saveLocal').onclick=()=>{try{validate();localStorage.setItem(key,JSON.stringify(values()));$('output-status').textContent='Uloženo v tomto prohlížeči.'}catch(error){$('output-status').textContent=error.message}};
$('open').onclick=()=>{try{validate();window.EduvizeAdminNavigation.openOutput(EduvizeSegmentSelection.url())}catch(error){$('output-status').textContent=error.message}};
$('copy').onclick=async()=>{try{validate();await navigator.clipboard.writeText(EduvizeSegmentSelection.url());$('output-status').textContent='Odkaz zkopírován.'}catch(error){$('output-status').textContent=error.message}};


// Persist the same public menu settings in the shared school/screen profile.
window.EduvizeProfileAdapter={
 app:'menu',
 validate,
 read:()=>({schemaVersion:1,values:values(),segment:window.EduvizeProfiles.segment()}),
 apply:async config=>{
  if(config?.schemaVersion!==1||!config.values||!/^\d{4,6}$/.test(String(config.values.canteen||'')))throw Error('Neplatné nastavení jídelníčku.');
  window.EduvizeProfiles.fields(ids).apply({showTime:false,...config.values});
  syncPresentation();window.EduvizeProfiles.applySegment(config.segment);
  localStorage.setItem(key,JSON.stringify(values()));preview.refresh();
 }
};
window.dispatchEvent(new Event('eduvize-profile-adapter-ready'));
