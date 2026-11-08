/* App-owned settings/slot adapter. All creation, retry and link actions are shared. */
(function(root){'use strict';
 function payload(config){
  const v=config?.values;if(!v||v.provider!=='strava'||!/^[0-9]{4,6}$/.test(v.canteen||'')||typeof v.name!=='string'||v.name.length>120||/[\x00-\x1f]/.test(v.name)||!['day','overview'].includes(v.presentation)||typeof v.allergens!=='boolean'||typeof v.showTime!=='boolean')throw Error('Neplatné nastavení jídelníčku.');
  const days=v.presentation==='day'?1:Number(v.days);
  if(v.presentation==='overview'&&![3,5,10].includes(days))throw Error('Neplatný počet dnů.');
  return {provider:v.provider,canteen:v.canteen,name:v.name,days,presentation:v.presentation,allergens:v.allergens,showTime:v.showTime};
 }
 function presentation(config,mode,interaction,kioskLayout,viewport){
  if(!['web','nsp','kiosk'].includes(mode)||!['display','interactive'].includes(interaction))throw Error('Neplatný typ výstupu.');
  let geometry=null;
  if(mode==='nsp'){
   const g=config.segment;if(!g||!['landscape','portrait'].includes(g.orientation)||!Number.isInteger(Number(g.style))||!Number.isInteger(Number(g.block)))throw Error('Vyberte segment.');
   const rectangles=root.EduvizeNSPLayouts?.layouts[g.orientation]?.[g.style];
   if(!rectangles?.[Number(g.block)-1])throw Error('Neplatný segment.');
   geometry={registryId:'nsp-4k',registryVersion:1,orientation:g.orientation,layoutId:Number(g.style),segmentId:Number(g.block)};
  }else if(mode==='kiosk'){
   const {width,height}=viewport||{};
   if(!Number.isInteger(width)||!Number.isInteger(height)||width<240||height<240||width>8192||height>8192||!['menu','tiles'].includes(kioskLayout))throw Error('Neplatná velikost kiosku.');
   geometry={registryId:'kiosk-viewport',registryVersion:1,orientation:height>width?'portrait':'landscape',width,height};
  }
  return {mode,geometry,interaction,...(mode==='kiosk'?{kioskLayout}:{} )};
 }
 function slot(p){
  if(p.mode==='web')return 'menu:web';
  const g=p.geometry;
  if(p.mode==='nsp'&&g?.registryId==='nsp-4k')return ['menu','nsp',g.orientation,g.layoutId,g.segmentId].join(':');
  if(p.mode==='kiosk'&&g?.registryId==='kiosk-viewport')return ['menu','kiosk',g.width,g.height,p.kioskLayout].join(':');
  throw Error('Neplatný typ výstupu.');
 }
 root.EduvizeMenuOutputSettings=Object.freeze({payload,presentation,slot,
  draft:(config,p)=>({schemaVersion:1,payloadVersion:1,payload:payload(config),presentation:p}),
  matches:(record,context)=>record.appId==='menu'&&record.profileId===context.profileId&&slot(record.draft.presentation)===context.slotId});
})(typeof window==='undefined'?globalThis:window);
