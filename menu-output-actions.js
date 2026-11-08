/* Thin menu bridge to the single shared output-actions controller; no publication panel. */
(function(root){'use strict';
 async function install(){
  const button=document.getElementById('generate-menu-output'),status=document.getElementById('output-status');
  if(!button)return;
  const auth=root.EduvizeAdminAuth,settings=root.EduvizeMenuOutputSettings;
  if(!auth||!settings||!root.EduvizeOutputActions||!root.EduvizeOutputClient){status.textContent='Vytváření odkazů nyní není dostupné.';return;}
  await auth.ready;
  function current(){
   root.EduvizeProfileAdapter.validate();
   const config=root.EduvizeProfileAdapter.read();
   const mode=document.getElementById('viewMode').value;
   const frame=document.querySelector('#ev-preview iframe');
   const p=settings.presentation(config,mode,root.EduvizeOutputModes.selection(),root.EduvizeOutputModes.layoutSelection?.(),{width:frame?.clientWidth,height:frame?.clientHeight});
   return {config,p};
  }
  function context(){
   const s=auth.status();if(!s.connected||!s.schoolId||!/^[a-f0-9]{32}$/.test(s.profileId||''))throw Error('Vyberte uložený profil své školy.');
   return {schoolId:s.schoolId,profileId:s.profileId,appId:'menu',slotId:settings.slot(current().p)};
  }
  const client=root.EduvizeOutputClient.create({origin:location.origin,getAuthorization:()=>{const token=auth.getToken('configurations');return token?'Bearer '+token:'';}});
  async function draft(){
   const before=context(),{config,p}=current();
   const response=await auth.fetch(auth.DOCS+'/api/admin/configuration-profiles/'+before.profileId,{},auth.getToken('configurations')?'configurations':'documents');
   if(!response.ok)throw Error('Uložené nastavení jídelníčku se nepodařilo ověřit.');
   const stored=(await response.json()).apps?.menu?.config;
   if(JSON.stringify(context())!==JSON.stringify(before)||JSON.stringify(current())!==JSON.stringify({config,p}))throw Error('Nastavení nebo profil se mezitím změnily.');
   if(!stored||stored.values?.viewMode!==p.mode||JSON.stringify(settings.payload(stored))!==JSON.stringify(settings.payload(config))||['orientation','style','block'].some(k=>String(stored.segment?.[k])!==String(config.segment?.[k]))||stored.outputInteraction!==p.interaction||(p.mode==='kiosk'&&stored.outputKioskLayout!==p.kioskLayout))throw Error('Nejprve uložte aktuální nastavení do Eduvize.');
   return settings.draft(config,p);
  }
  const copy=document.getElementById('copy'),open=document.getElementById('open');
  // Remove the legacy handlers before installing exactly one shared controller.
  copy.onclick=null;open.onclick=null;
  root.EduvizeMenuOutputActions=root.EduvizeOutputActions.mount({client,context,draft,
   resolve:root.EduvizeOutputActions.createSlotResolver({client,matches:settings.matches}),
   elements:{generateButton:button,copyButton:copy,openButton:open,status}});
  button.disabled=false;
 }
 install().catch(()=>{const n=document.getElementById('output-status');if(n)n.textContent='Vytváření odkazů nyní není dostupné.';});
})(window);
