/* Native opt-in to the shared saved-copy-preview workflow; no app-owned generator. */
(function(root){'use strict';
 function adoptResult(){const node=document.getElementById('output-status'),sink=root.EduvizeProfiles?.statusFor?.('menu');if(node&&sink)sink.useResult(node);return {node,sink};}
 function bootError(error){const {node,sink}=adoptResult();if(!node)return;const message=error?.message||'Ovládání výstupu nyní není dostupné.';if(sink)sink.result(message,'error');else{node.textContent=message;node.dataset.state='error';}}
 async function install(){
  const status=document.getElementById('output-status'),copy=document.getElementById('copy'),open=document.getElementById('open');
  if(!copy||!open)return;
  copy.onclick=null;open.onclick=null;copy.disabled=true;open.disabled=true;
  const auth=root.EduvizeAdminAuth,settings=root.EduvizeMenuOutputSettings,adapter=root.EduvizeProfileAdapter;
  if(!auth||!settings||!adapter||root.EduvizeOutputActions?.schemaVersion!==2||!root.EduvizeOutputClient||!root.EduvizeSavedOutputSettings||!root.EduvizeProfiles){bootError();return;}
  if(root.EduvizeOutputActions.menuPreviewHost!=='menu-native-physical-v1')throw Error('Společný náhled jídelníčku vyžaduje aktualizaci. Obnovte stránku.');
  await auth.ready;adoptResult();
  const saved=root.EduvizeSavedOutputSettings.create({auth,profiles:root.EduvizeProfiles});
  function context(){
   const s=auth.status();if(!s.connected||!s.schoolId||!/^[a-f0-9]{32}$/.test(s.profileId||''))throw Error('Vyberte uložený profil své školy.');
   return {schoolId:s.schoolId,profileId:s.profileId,appId:'menu',presentation:settings.capture({segment:root.EduvizeProfiles.segment()})};
  }
  const client=root.EduvizeOutputClient.create({origin:location.origin,getAuthorization:()=>{const token=auth.getToken('configurations')||auth.getToken('documents');return token?'Bearer '+token:'';}});
  if(typeof client.lookupOutputSlot!=='function')throw Error('Společné ovládání výstupů vyžaduje aktualizaci.');
  async function draft({savedCommit=null,purpose}={}){
   const before=context();let config;
   if(savedCommit){
    if(savedCommit.profileId!==before.profileId||savedCommit.appId!=='menu'||!Number.isSafeInteger(savedCommit.revision)||savedCommit.revision<0||savedCommit.config?.schemaVersion!==1)throw Error('Nelze ověřit potvrzené uložení jídelníčku.');
    // This is the exact successful PUT snapshot, never the form after an await.
    config=JSON.parse(JSON.stringify(savedCommit.config));
   }else config=(await saved.load(before)).config;
   const after=context();if(before.schoolId!==after.schoolId||before.profileId!==after.profileId)throw Error('Účet nebo profil se mezitím změnil.');
   if(purpose==='copy'&&(!config||config.empty===true||!((config.data?.values?config.data:config).presentation||config.presentation)))throw Object.assign(Error('Nejprve uložte nastavení jídelníčku do Eduvize.'),{code:'SETTINGS_REQUIRED'});
   return settings.draft(config,settings.storedPresentation(config));
  }
  const actions=root.EduvizeOutputActions.mount({workflow:'saved-copy-preview',previewHost:'menu-native-physical-v1',client,context,draft,
   previewDraftUrl:()=>adapter.previewDraftUrl(),elements:{copyButton:copy,openButton:open,status}});
  if(actions.workflow!=='saved-copy-preview'||typeof actions.withSavedCommit!=='function')throw Error('Společné ovládání výstupů vyžaduje aktualizaci.');
  adapter.outputActions=actions;root.EduvizeMenuOutputActions=actions;
  const refresh=()=>actions.refresh().catch(()=>{});
  const host=document.querySelector('.edu-output-section');host.addEventListener('change',refresh);
  host.addEventListener('click',event=>{if(event.isTrusted&&event.target.closest?.('#ev-tabs button,#ev-cards button,#ev-blocks button,.edu-web-preview-controls button'))queueMicrotask(()=>document.dispatchEvent(new Event('eduvize-profile-change')));});
  for(const event of ['eduvize-profile-selected','eduvize-admin-auth-change'])root.addEventListener(event,refresh);
  copy.disabled=false;open.disabled=false;
  root.dispatchEvent(new Event('eduvize-profile-adapter-ready'));
  await refresh();
 }
 install().catch(bootError);
})(window);
