/* App-owned saved settings adapter. Slot identity and actions belong to shared V2. */
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
 function native(config){
  const value=config?.data?.values?config.data:config;
  if(!value?.values)throw Error('Nejprve uložte nastavení jídelníčku do Eduvize.');
  return value;
 }
 function storedPresentation(config){
  const value=native(config),p=value.presentation||config.presentation;
  if(!p)throw Error('Nejprve uložte aktuální nastavení výstupu do Eduvize.');
  const g=p.geometry;
  if(p.mode==='web'&&g!==null||p.mode!=='kiosk'&&p.kioskLayout!=null)throw Error('Neplatné uložené zobrazení.');
  if(p.mode!=='web'&&(!g||g.registryVersion!==1||g.registryId!==(p.mode==='nsp'?'nsp-4k':'kiosk-viewport')))throw Error('Neplatná uložená geometrie.');
  if(p.mode==='kiosk'&&(g.orientation!==(g.height>g.width?'portrait':'landscape')||g.layoutId!=null||g.segmentId!=null))throw Error('Neplatná uložená orientace kiosku.');
  if(p.mode==='nsp'&&(!Number.isInteger(g.layoutId)||!Number.isInteger(g.segmentId)||g.width!=null||g.height!=null))throw Error('Neplatný uložený segment.');
  return presentation({...value,segment:p.mode==='nsp'?{orientation:g?.orientation,style:g?.layoutId,block:g?.segmentId}:value.segment},p.mode,p.interaction,p.kioskLayout,{width:g?.width,height:g?.height});
 }
 function capture(config){
  const frame=document.querySelector('#ev-preview iframe'),actual=root.EduvizeSegmentSelection?.kioskGeometry?.();
  const viewport=actual||{width:Number(frame?.getAttribute('data-preview-width')),height:Number(frame?.getAttribute('data-preview-height'))};
  return presentation(config,document.getElementById('viewMode').value,root.EduvizeOutputModes.selection(),root.EduvizeOutputModes.layoutSelection?.(),viewport);
 }
 function save(config,p){
  // Keep the native configuration shape; ordinary Save adds the full Presentation.
  const value=native(config),result={...config,...value,presentation:p};
  if(config.data?.values)result.data={...config.data,presentation:p};
  return result;
 }
 root.EduvizeMenuOutputSettings=Object.freeze({payload,presentation,native,storedPresentation,capture,save,
  draft:(config,p)=>({schemaVersion:1,payloadVersion:1,payload:payload(native(config)),presentation:p})});
})(typeof window==='undefined'?globalThis:window);
