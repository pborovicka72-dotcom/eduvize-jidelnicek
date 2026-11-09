/* Behavior tests for app settings and the actual menu renderer lifecycle. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
module.exports=async function(){
 let passed=0;
 const settings={URLSearchParams,URL,EduvizeNSPLayouts:{layouts:{landscape:{1:[[3840,2160]]}}}};settings.window=settings;
 vm.runInNewContext(source('menu-output-settings.js'),settings);
 const a=settings.EduvizeMenuOutputSettings;
 const config={values:{provider:'strava',canteen:'11592',name:'Škola A',days:'3',presentation:'overview',allergens:false,showTime:true,token:'private'},segment:{orientation:'landscape',style:1,block:1}};
 const p=a.presentation(config,'web','display','menu');
 assert.equal(a.payload(config).days,3);assert.equal(a.payload(config).token,undefined);passed++;
 assert.equal('slot' in a,false);assert.equal('matches' in a,false);passed++;
 const nsp=a.presentation(config,'nsp','display','menu');assert.equal(nsp.geometry.layoutId,1);
 assert.throws(()=>a.presentation({...config,segment:{orientation:'landscape',style:99,block:1}},'nsp','display','menu'));passed++;
 const kiosk=a.presentation(config,'kiosk','interactive','menu',{width:1080,height:1920});assert.equal(kiosk.geometry.height,1920);
 assert.throws(()=>a.presentation(config,'kiosk','interactive','menu',{}));passed++;
 const saved=a.save({schemaVersion:1,...config},p);assert.equal(a.native(saved).values.canteen,'11592');assert.equal(a.storedPresentation(saved).mode,'web');assert.equal(saved.data,undefined);passed++;
 for(const patch of [{provider:'other'},{canteen:'1&token=bad'},{allergens:'false'},{name:'x'.repeat(121)},{days:'4'}])assert.throws(()=>a.payload({...config,values:{...config.values,...patch}}));passed++;
 class Node{constructor(){this.style={setProperty(){}};this.children=[];this.textContent='';this.hidden=false;this.parentElement={clientWidth:800};this.className='';this.clientHeight=900;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}getBoundingClientRect(){return {height:40};}remove(){}getContext(){return null;}querySelectorAll(){return [];}querySelector(){return null;}}
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 let hooks,failStatus=0,rendered=[],requests=[];
 const id='a'.repeat(32);
 const ctx={URL,URLSearchParams,AbortController,AbortSignal,Intl,Date,innerWidth:1200,innerHeight:900,
  location:{origin:'https://test.skola.eduvize.cz',search:'?edu-output='+id+'&canteen=66666&edu-profile=private&name=forged'},
  document:{documentElement:{dataset:{menuPublished:'true'},style:{setProperty(){}}},body:{style:{}},getElementById:get,createElement:()=>new Node()},
  EduvizeOutputRuntime:{start:o=>{hooks=o;return {stop(){}};}},EduvizeOutputModes:{isInteractive:()=>false},
  EduvizeSegmentProfile:{resolve:(width,height)=>({width,height,ratio:width/height})},EduvizeMealBoard:{profile:()=>({gap:12,body:20,first:3,later:3,horizontal:false}),pages:x=>[x],render:(host,group)=>rendered=group},
  EduvizeOutputHeader:{update(){}},getComputedStyle:()=>({fontSize:'16',fontWeight:'400',fontFamily:'sans-serif',getPropertyValue:()=>''}),
  addEventListener(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame(){},cancelAnimationFrame(){},
  fetch:async(url,options)=>{requests.push({url,options});return {ok:!failStatus,status:failStatus||200,json:async()=>failStatus?{error:{message:'no'}}:{schemaVersion:1,stale:false,complete:true,data:{provider:'strava',canteen:'11592',source:'https://www.strava.cz/',updated:Date.now()/1000,today:'2026-11-08',days:[{date:'2026-11-09',meals:[{name:'Rajčatová polévka',group:'Polévka',allergens:'07'}]}]}}};}
 };ctx.window=ctx;
 vm.runInNewContext(source('meal-model.js'),ctx);vm.runInNewContext(source('menu.js'),ctx);
 assert.equal(requests.length,0);assert.equal(hooks.appId,'menu');passed++;
 const payload=a.payload(config),signal=new AbortController().signal;
 await hooks.render({id,payload,presentation:p},{},{signal});
 assert.equal(requests[0].url,'/api/public/v1/outputs/'+id+'/data');assert.equal(requests[0].options.credentials,'omit');
 assert.equal(get('menu-subtitle').textContent,'Škola A');assert.equal(rendered[0].groups[0].meals[0].name,'Rajčatová polévka');passed++;
 await hooks.render({id,payload:{...payload,name:'Škola B'},presentation:p},{},{signal});
 assert.equal(get('menu-subtitle').textContent,'Škola B');assert.equal(requests[1].url,requests[0].url);passed++;
 failStatus=503;const before=rendered;await hooks.render({id,payload:{...payload,name:'Unavailable'},presentation:p},{},{signal});assert.equal(rendered,before);assert.equal(get('menu-subtitle').textContent,'Škola B');passed++;
 failStatus=410;await hooks.render({id,payload,presentation:p},{},{signal});assert.equal(get('menu-content').children.length,0);assert.equal(get('menu-source').children.length,0);passed++;
 hooks.clear();assert.equal(get('menu-subtitle').textContent,'');passed++;
 console.log(passed+' menu registry JS behavior checks PASS');return passed;
};
