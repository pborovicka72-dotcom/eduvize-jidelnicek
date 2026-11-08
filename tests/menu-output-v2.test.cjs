/* Menu bridge tests. Accept a frozen shared saved-reader path; never copy its controller. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
module.exports=async function(savedReaderCode){
 let count=0;
 const profile='b'.repeat(32),identity={connected:true,schoolId:'school-a',profileId:profile};
 const form={schemaVersion:1,values:{provider:'strava',canteen:'11592',name:'Uložená jídelna',days:'3',presentation:'overview',allergens:false,showTime:false,viewMode:'web'},segment:{orientation:'landscape',style:1,block:1}};
 let captured,reads=[],stored,refreshes=0,afterRead;
 const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{id,value:id==='viewMode'?'web':'',disabled:false,onclick:()=>{throw Error('legacy handler');},addEventListener(){}});return nodes.get(id);}
 const ctx={URL,URLSearchParams,location:{origin:'https://test.skola.eduvize.cz'},document:{getElementById:node,querySelector:s=>s==='.edu-output-section'?node('section'):null},
  EduvizeAdminAuth:{ready:Promise.resolve(),status:()=>({...identity}),getToken:()=> 'existing-test-session'},
  EduvizeOutputModes:{selection:()=> 'display',layoutSelection:()=> 'menu'},
  EduvizeProfiles:{request:async(p,o)=>{reads.push({p,o});const result={id:profile,revision:1,apps:{menu:{config:structuredClone(stored)}}};if(afterRead)afterRead();return result;}},
  EduvizeOutputClient:{create:()=>({lookupOutputSlot(){}})},
  EduvizeOutputActions:{schemaVersion:2,mount:o=>{captured=o;return {refresh:async()=>{refreshes++;}};}},addEventListener(){}};
 ctx.window=ctx;vm.runInNewContext(source('menu-output-settings.js'),ctx);
 const settings=ctx.EduvizeMenuOutputSettings,p={mode:'web',geometry:null,interaction:'display'};
 stored=structuredClone(settings.save(form,p));
 ctx.EduvizeProfileAdapter={validate(){},read:()=>settings.save(structuredClone(form),p)};
 vm.runInNewContext(savedReaderCode,ctx);vm.runInNewContext(source('menu-output-actions.js'),ctx);await new Promise(setImmediate);
 assert.ok(captured);assert.equal(captured.resolve,undefined);assert.equal(captured.context().slotId,undefined);assert.equal(captured.context().presentation.mode,'web');count++;
 assert.equal(node('copy').onclick,null);assert.equal(node('open').onclick,null);assert.equal(node('generate-menu-output').disabled,false);assert.equal(refreshes,1);count++;
 const draft=await captured.draft();assert.equal(draft.payload.canteen,'11592');assert.equal(draft.payload.name,'Uložená jídelna');assert.equal(reads[0].p,'/'+profile);assert.equal(reads[0].o.fresh,true);count++;
 form.values.name='Neuložená změna';await assert.rejects(captured.draft(),/Nejprve uložte/);form.values.name='Uložená jídelna';count++;
 const prev=stored;stored={schemaVersion:1,...form};await assert.rejects(captured.draft(),/Nejprve uložte/);stored=prev;count++;
 afterRead=()=>identity.profileId='c'.repeat(32);await assert.rejects(captured.draft(),/profil|účet/);identity.profileId=profile;afterRead=null;count++;
 afterRead=()=>form.values.canteen='12345';await assert.rejects(captured.draft(),/mezitím/);form.values.canteen='11592';afterRead=null;count++;
 const g={registryId:'nsp-4k',registryVersion:99,orientation:'landscape',layoutId:1,segmentId:1};assert.throws(()=>settings.storedPresentation({values:form.values,presentation:{mode:'nsp',geometry:g,interaction:'display'}}));count++;
 // Execute actual native profile adapter: Save carries Presentation and apply accepts old records.
 let policy='display',applied;
 const fields=Object.fromEntries(['provider','canteen','name','days','presentation','allergens','showTime','viewMode','days-field','retry-menu','status','saveLocal','output-status'].map(id=>[id,{value:form.values[id]??'',checked:form.values[id]===true,addEventListener(){}}]));
 const ctx2={URL,URLSearchParams,AbortController,Event,location:{search:'',href:'https://test.skola.eduvize.cz/jidelnicek/config.html'},
  document:{getElementById:id=>fields[id],querySelector:()=>null},localStorage:{getItem:()=>null,setItem(){}},addEventListener(){},dispatchEvent(){},clearTimeout(){},setTimeout(){},
  EduvizeOutputModes:{selection:()=>policy,layoutSelection:()=> 'menu',setInteraction:v=>policy=v},
  EduvizeEditorialAdmin:{mount:()=>({refresh(){}})},
  EduvizeProfiles:{segment:()=>form.segment,applySegment:v=>applied=v,fields:()=>({apply:values=>{for(const [k,v] of Object.entries(values))if(fields[k]){fields[k].value=String(v);fields[k].checked=v===true;}}})},
  fetch:async()=>({ok:true,json:async()=>({days:[]})})};ctx2.window=ctx2;
 vm.runInNewContext(source('menu-output-settings.js'),ctx2);vm.runInNewContext(source('config.js'),ctx2);await new Promise(setImmediate);
 const read=ctx2.EduvizeProfileAdapter.read();assert.equal(read.schemaVersion,1);assert.equal(read.values.canteen,'11592');assert.equal(read.data,undefined);assert.equal(read.presentation.mode,'web');count++;
 await ctx2.EduvizeProfileAdapter.apply(structuredClone(form));assert.equal(fields.canteen.value,'11592');assert.equal(applied.style,1);count++;
 const next=ctx2.EduvizeMenuOutputSettings.save({...form,values:{...form.values,name:'Nová jídelna'}},{mode:'web',geometry:null,interaction:'interactive'});
 await ctx2.EduvizeProfileAdapter.apply(next);assert.equal(fields.name.value,'Nová jídelna');assert.equal(policy,'interactive');count++;
 console.log(count+' menu V2 bridge checks PASS');return count;
};
