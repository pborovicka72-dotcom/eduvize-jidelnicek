const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../menu-output-actions.js'),'utf8');
async function fixture(){
 let identity={connected:true,schoolId:'a'.repeat(32),profileId:'b'.repeat(32)},mount,release;
 const nodes=Object.fromEntries(['output-status','copy','open'].map(id=>[id,{textContent:'',disabled:false}]));
 const config={schemaVersion:1,data:{presentation:{mode:'web'},values:{name:'Synthetic menu'}}};
 const root={
  EduvizeAdminAuth:{ready:Promise.resolve(),status:()=>identity,getToken:()=>null},
  EduvizeMenuOutputSettings:{capture:()=>({mode:'web'}),storedPresentation:x=>x.data.presentation,draft:(x,p)=>({config:x,presentation:p})},
  EduvizeProfileAdapter:{previewDraftUrl:()=>'/synthetic-preview'},
  EduvizeProfiles:{segment:()=>null},
  EduvizeSavedOutputSettings:{create:()=>({load:()=>new Promise(r=>{release=r;})})},
  EduvizeOutputClient:{create:()=>({lookupOutputSlot(){throw Error('No IO allowed');}})},
  EduvizeOutputActions:{schemaVersion:2,mount(options){mount=options;return {workflow:'saved-copy-preview',withSavedCommit(){},refresh:async()=>{}};}},
  addEventListener(){},dispatchEvent(){}
 };
 vm.runInNewContext(source,{window:root,document:{getElementById:id=>nodes[id],querySelector:()=>({addEventListener(){}})},location:{origin:'https://example.invalid'},Event:class{},queueMicrotask});
 await new Promise(r=>setImmediate(r));assert.ok(mount);
 return {mount,config,changeProfile(){identity={...identity,profileId:'c'.repeat(32)};},resolve(){release({config});}};
}
test('Copy uses saved configuration rather than the unsaved form',async()=>{
 const f=await fixture();const pending=f.mount.draft();f.resolve();const result=await pending;
 assert.equal(result.config.data.values.name,'Synthetic menu');assert.equal(result.presentation.mode,'web');
});
test('profile switch while saved configuration loads rejects the output',async()=>{
 const f=await fixture();const pending=f.mount.draft();f.changeProfile();f.resolve();await assert.rejects(pending,/profil/);
});
test('Save uses a detached exact confirmed snapshot and rejects foreign commits',async()=>{
 const f=await fixture();const commit={profileId:'b'.repeat(32),appId:'menu',revision:1,config:f.config};
 const pending=f.mount.draft({savedCommit:commit});commit.config.data.values.name='Later edit';
 assert.equal((await pending).config.data.values.name,'Synthetic menu');
 await assert.rejects(f.mount.draft({savedCommit:{...commit,profileId:'c'.repeat(32)}}),/ověřit/);
});
