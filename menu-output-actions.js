/* Thin menu bridge to frozen shared OutputActions V2; no local slot or resolver. */
(function(root){'use strict';
 async function install(){
  const button=document.getElementById('generate-menu-output'),status=document.getElementById('output-status');
  if(!button)return;
  const copy=document.getElementById('copy'),open=document.getElementById('open');
  // Legacy publication handlers must never run alongside the shared controller.
  copy.onclick=null;open.onclick=null;copy.disabled=true;open.disabled=true;
  const auth=root.EduvizeAdminAuth,settings=root.EduvizeMenuOutputSettings;
  if(!auth||!settings||root.EduvizeOutputActions?.schemaVersion!==2||!root.EduvizeOutputClient||!root.EduvizeSavedOutputSettings){status.textContent='Vytváření odkazů nyní není dostupné.';return;}
  await auth.ready;
  const saved=root.EduvizeSavedOutputSettings.create({auth,profiles:root.EduvizeProfiles});
  function current(){
   root.EduvizeProfileAdapter.validate();
   const config=root.EduvizeProfileAdapter.read();
   return {config,p:settings.capture(config)};
  }
  function context(){
   const s=auth.status();if(!s.connected||!s.schoolId||!/^[a-f0-9]{32}$/.test(s.profileId||''))throw Error('Vyberte uložený profil své školy.');
   return {schoolId:s.schoolId,profileId:s.profileId,appId:'menu',presentation:current().p};
  }
  const client=root.EduvizeOutputClient.create({origin:location.origin,getAuthorization:()=>{const token=auth.getToken('configurations')||auth.getToken('documents');return token?'Bearer '+token:'';}});
  if(typeof client.lookupOutputSlot!=='function')throw Error('Společné ovládání výstupů vyžaduje aktualizaci.');
  async function draft(){
   const before=context(),form=current(),stored=await saved.load(before);
   if(JSON.stringify(context())!==JSON.stringify(before)||JSON.stringify(current())!==JSON.stringify(form))throw Error('Nastavení nebo profil se mezitím změnily.');
   const p=settings.storedPresentation(stored.config);
   if(JSON.stringify(p)!==JSON.stringify(form.p)||JSON.stringify(settings.payload(settings.native(stored.config)))!==JSON.stringify(settings.payload(settings.native(form.config))))throw Error('Nejprve uložte aktuální nastavení do Eduvize.');
   return settings.draft(stored.config,p);
  }
  const actions=root.EduvizeOutputActions.mount({client,context,draft,elements:{generateButton:button,copyButton:copy,openButton:open,status}});
  root.EduvizeMenuOutputActions=actions;
  const refresh=()=>actions.refresh().catch(()=>{});
  document.querySelector('.edu-output-section').addEventListener('change',refresh);
  for(const event of ['eduvize-profile-selected','eduvize-admin-auth-change','eduvize-profile-adapter-ready'])root.addEventListener(event,refresh);
  button.disabled=false;copy.disabled=false;open.disabled=false;
  await refresh(); // GET-only lookup updates Generate/Update after a normal reload.
 }
 install().catch(()=>{const n=document.getElementById('output-status');if(n)n.textContent='Vytváření odkazů nyní není dostupné.';});
})(window);
