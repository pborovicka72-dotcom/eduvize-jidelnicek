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
let menuRequest=0,menuTimer,menuController;
async function loadMenu(){
 const request=++menuRequest;
 clearTimeout(menuTimer);menuController?.abort();
 $('retry-menu').hidden=true;
 try{
  validate();
  menuController=new AbortController();
  $('status').textContent='Načítám jídelníček…';
  const response=await fetch('/api/menu?'+new URLSearchParams({provider:$('provider').value,canteen:$('canteen').value.trim()}),{signal:menuController.signal});
  const data=await response.json();
  if(request!==menuRequest)return;
  if(!response.ok)throw Error(data.detail||'Jídelníček se nepodařilo načíst.');
  $('status').textContent=data.days.length?'Načteno '+data.days.length+' dnů. Nejbližší jídelníček: '+new Date(data.days[0].date+'T12:00:00').toLocaleDateString('cs-CZ')+'.'+(data.stale?' '+data.warning:''):'Jídelna zatím nezveřejnila jídelníček pro následující dny.';
  preview.refresh();
 }catch(error){
  if(request!==menuRequest||error.name==='AbortError')return;
  $('status').textContent=error.message;
  $('retry-menu').hidden=!/^\d{4,6}$/.test($('canteen').value.trim());
 }
}
function scheduleMenu(){
 ++menuRequest;menuController?.abort();clearTimeout(menuTimer);
 $('retry-menu').hidden=true;
 $('status').textContent='';
 menuTimer=setTimeout(loadMenu,500);
}
$('retry-menu').onclick=loadMenu;
$('canteen').addEventListener('input',scheduleMenu);
$('provider').addEventListener('change',scheduleMenu);
loadMenu();
$('saveLocal').onclick=()=>{try{validate();localStorage.setItem(key,JSON.stringify(values()));$('output-status').textContent='Uloženo v tomto prohlížeči.'}catch(error){$('output-status').textContent=error.message}};
async function publishedOutput(){
 if(window.EduvizeMenuStableLinksEnabled!==true)throw Error('Generování nových odkazů čeká na centrální sjednocení Eduvize. Pro kontrolu nastavení použijte náhled.');
 const auth=window.EduvizeAdminAuth;await auth?.ready;
 if(!auth?.status().connected)throw Error('Pro stálý odkaz se přihlaste a uložte jídelníček do Eduvize. Staré odkazy zůstávají funkční.');
 const id=auth.status().profileId;
 if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('Vyberte profil a uložte jídelníček do Eduvize.');
 const response=await auth.fetch(auth.DOCS+'/api/admin/configuration-profiles/'+id,{},auth.getToken('configurations')?'configurations':'documents');
 const profile=await response.json();if(!response.ok)throw Error(profile.detail||'Uložení nelze ověřit.');
 const stored=profile.apps?.menu?.config,current=window.EduvizeProfileAdapter.read();
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(!stored?.publicOutput||!ids.every(key=>equal(stored.values?.[key],current.values[key]))||!['orientation','style','block'].every(key=>equal(stored.segment?.[key],current.segment?.[key]))||stored.outputInteraction!==window.EduvizeOutputModes.selection()||stored.outputKioskLayout!==window.EduvizeOutputModes.layoutSelection?.())throw Error('Nejprve uložte změny tlačítkem Uložit do Eduvize.');
 const url=new URL('output.html',location.href);url.searchParams.set('edu-menu',id);url.searchParams.set('edu-profile',id);url.searchParams.set('edu-link','1');return url.href;
}
$('open').onclick=async()=>{try{validate();window.EduvizeAdminNavigation.openOutput(await publishedOutput())}catch(error){$('output-status').textContent=error.message}};
$('copy').onclick=async()=>{try{validate();await navigator.clipboard.writeText(await publishedOutput());$('output-status').textContent='Stálý odkaz zkopírován. Další uložení aktualizuje tentýž výstup.'}catch(error){$('output-status').textContent=error.message}};

// Persist the same public menu settings in the shared school/screen profile.
window.EduvizeProfileAdapter={
 app:'menu',
 validate,
 read:()=>({schemaVersion:1,publicOutput:true,values:values(),segment:window.EduvizeProfiles.segment()}),
 apply:async config=>{
  if(config?.schemaVersion!==1||!config.values||!/^\d{4,6}$/.test(String(config.values.canteen||'')))throw Error('Neplatné nastavení jídelníčku.');
  window.EduvizeProfiles.fields(ids).apply({showTime:false,...config.values});
  syncPresentation();window.EduvizeProfiles.applySegment(config.segment);
  localStorage.setItem(key,JSON.stringify(values()));preview.refresh();loadMenu();
 }
};
window.dispatchEvent(new Event('eduvize-profile-adapter-ready'));
