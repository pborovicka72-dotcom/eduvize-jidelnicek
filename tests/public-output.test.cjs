const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../public-output.js'),'utf8');
test('same outer address updates settings anonymously, preserves last good frame on failure',async()=>{
 const id='a'.repeat(32),href='https://test.skola.eduvize.cz/jidelnicek/output.html?edu-menu='+id;
 let tick,config={values:{provider:'strava',canteen:'11592',name:'Škola A',viewMode:'web',allergens:false},segment:{}},fail=false,calls=[],frame;
 const status={hidden:false},document={getElementById:()=>status,createElement:()=>({style:{}}),body:{append:f=>frame=f},addEventListener(){}};
 const ctx={URL,document,location:{href,origin:'https://test.skola.eduvize.cz'},AbortSignal,setInterval:fn=>tick=fn,addEventListener(){},fetch:async(url,options)=>{calls.push(options);return {ok:!fail,json:async()=>({config})}}};
 vm.runInNewContext(code,ctx);await new Promise(setImmediate);
 assert.equal(new URL(frame.src).searchParams.get('name'),'Škola A');assert.equal(ctx.location.href,href);assert.equal(calls[0].credentials,'omit');
 config={values:{...config.values,name:'Nový název',canteen:'12345',viewMode:'nsp'},segment:{orientation:'portrait',style:2,block:1}};
 await tick();assert.equal(new URL(frame.src).searchParams.get('canteen'),'12345');assert.equal(new URL(frame.src).searchParams.get('name'),'Nový název');assert.equal(ctx.location.href,href);
 const last=frame.src;fail=true;await tick();assert.equal(frame.src,last);assert.equal(status.hidden,false);
});
