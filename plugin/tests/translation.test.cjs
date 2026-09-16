const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(response={responseStatus:200,responseData:{translatedText:'Progress'}}, mode='success') {
 const requests=[],aliases={},instances=[];let active;
 function Xhr(){active=this;instances.push(this);}
 Xhr.prototype.open=function(method,url){requests.push({method,url});};
 Xhr.prototype.send=function(){if(mode==='pending')return;setTimeout(()=>{
  if(mode==='network'){this.onerror();return;}
  if(mode==='timeout'){this.ontimeout();return;}
  this.status=mode==='http'?429:200;this.responseText=JSON.stringify(response);this.onload();
 },0);};
 Xhr.prototype.abort=function(){this.aborted=true;this.onabort();};
 const runtime={alias:r=>aliases[r.key]||'',setAliases:(records,text)=>{records.forEach(r=>aliases[r.key]=text);}};
 const g={XMLHttpRequest:Xhr,$gameVariables:{},setTimeout:callback=>setTimeout(callback,0)};
 const c=vm.createContext({Promise,Blob});vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/translation.js'),'utf8'),c);
 return {translator:c.createToolkitTranslator(runtime,g),g,requests,aliases,instances};
}
const record=(key='variables:1',original='進行度')=>({key,original});
test('online queue sends only names, caches existing translations and deduplicates names',async()=>{
 const {translator,requests,aliases}=setup();let progress=0;
 assert.equal(await translator.translate([record(),record('variables:2')],'ja',()=>progress++),2);
 assert.equal(requests.length,1);const url=new URL(requests[0].url);assert.equal(url.searchParams.get('q'),'進行度');assert.equal(url.searchParams.get('langpair'),'ja|en');assert.equal(progress,1);
 assert.equal(aliases['variables:1'],'Progress');assert.equal(await translator.translate([record()],'ja',()=>{}),0);assert.equal(requests.length,1);
});
test('quota, HTTP, network and timeout errors never create aliases',async()=>{
 for(const [response,mode] of [[{responseStatus:403,quotaFinished:true},'success'],[{},'http'],[{},'network'],[{},'timeout'],[{responseStatus:200,responseData:{translatedText:7}},'success']]){
  const {translator,aliases}=setup(response,mode);await assert.rejects(translator.translate([record()],'ja',()=>{}));assert.equal(Object.keys(aliases).length,0);assert.equal(translator.busy(),false);
 }
});
test('cancel aborts in-flight request and prevents stale aliases',async()=>{
 const {translator,aliases}=setup({},'pending');const p=translator.translate([record()],'ja',()=>{});await new Promise(setImmediate);translator.cancel();await assert.rejects(p,/arrêtée/);assert.equal(Object.keys(aliases).length,0);assert.equal(translator.busy(),false);
});
test('session replacement rejects translation result',async()=>{
 const {translator,g,aliases}=setup();const p=translator.translate([record()],'ja',()=>{});g.$gameVariables={};await assert.rejects(p,/arrêtée/);assert.equal(Object.keys(aliases).length,0);
});
test('UTF-8 byte limit and explicit source validation',async()=>{
 const {translator,requests}=setup();await assert.rejects(translator.translate([record('variables:1','進'.repeat(167))],'ja',()=>{}),/500/);
 assert.equal(requests.length,0);await assert.rejects(translator.translate([record()],'auto',()=>{}),/langue/);
});
test('English source creates local alias without network',async()=>{
 const {translator,requests,aliases}=setup();await translator.translate([record('variables:1','Coins')],'en',()=>{});assert.equal(requests.length,0);assert.equal(aliases['variables:1'],'Coins');
});
const flush=()=>new Promise(setImmediate);
function deliver(xhr,text='Translated'){xhr.status=200;xhr.responseText=JSON.stringify({responseStatus:200,responseData:{translatedText:text}});xhr.onload();}
test('three simultaneous workers, immediate refill, out-of-order mapping and no 80-name truncation',async()=>{
 const {translator,requests,instances,aliases}=setup({},'pending');
 const records=Array.from({length:125},(_,i)=>record('variables:'+(i+1),'Name '+i));
 const p=translator.translate(records,'ja');await flush();assert.equal(requests.length,3);
 deliver(instances[2],'Third');await flush();assert.equal(requests.length,4);assert.equal(aliases['variables:3'],'Third');
 let answered=new Set([2]);
 while(translator.busy()){
  for(let i=0;i<instances.length;i++){if(!answered.has(i)){answered.add(i);deliver(instances[i]);}}
  await flush();
 }
 assert.equal(await p,125);assert.equal(requests.length,125);assert.equal(Object.keys(aliases).length,125);
});
test('cancel aborts all workers, restart is isolated from late callbacks',async()=>{
 const {translator,instances,aliases}=setup({},'pending');
 const records=Array.from({length:8},(_,i)=>record('variables:'+(i+1),'Name '+i));
 const p=translator.translate(records,'ja');await flush();const rejection=assert.rejects(p,/arrêtée/);translator.cancel();await rejection;
 assert(instances.every(x=>x.aborted));assert.equal(instances.length,3);
 const next=translator.translate([record('variables:9','New')],'ja');await flush();
 instances.slice(0,3).forEach(x=>deliver(x,'Stale'));await flush();assert(translator.busy());assert.equal(Object.keys(aliases).length,0);
 deliver(instances[3],'Fresh');assert.equal(await next,1);assert.deepEqual(aliases,{'variables:9':'Fresh'});
});
test('quota stops the entire queue while preserving received results for resume',async()=>{
 const {translator,instances,aliases,requests}=setup({},'pending');
 const records=Array.from({length:6},(_,i)=>record('variables:'+(i+1),'Name '+i));
 const p=translator.translate(records,'ja');const rejection=assert.rejects(p,/quota/);await flush();
 deliver(instances[0],'Saved');await flush();
 instances[1].status=200;instances[1].responseText=JSON.stringify({responseStatus:403,quotaFinished:true});instances[1].onload();await rejection;
 assert.equal(aliases['variables:1'],'Saved');assert(instances[2].aborted);assert(instances[3].aborted);assert.equal(requests.length,4);
 const resume=translator.translate(records,'ja');await flush();assert(!requests.slice(4).some(x=>new URL(x.url).searchParams.get('q')==='Name 0'));
 translator.cancel();await assert.rejects(resume,/arrêtée/);
});
test('validates all names before requests, ignores blank/already translated and duplicate record keys',async()=>{
 const {translator,requests,aliases}=setup();
 await assert.rejects(translator.translate([record(),record('variables:2','進'.repeat(167))],'ja'),/500/);assert.equal(requests.length,0);
 aliases['variables:2']='Cached';assert.equal(await translator.translate([record(),record(),record('variables:2'),record('variables:3',' ')],'ja'),1);assert.equal(requests.length,1);
});
const {fixture}=require('./runtime-fixture.cjs');
test('pending translations survive catalog refresh and persist against current records',async()=>{
 const {g,r,storage}=fixture();const instances=[];
 g.XMLHttpRequest=function(){instances.push(this);};
 g.XMLHttpRequest.prototype.open=function(){};g.XMLHttpRequest.prototype.send=function(){};g.XMLHttpRequest.prototype.abort=function(){this.onabort();};
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/translation.js'),'utf8'),g);
 const translator=g.createToolkitTranslator(r,g),original=r.list('variables')[0];
 const done=translator.translate([original],'ja');await flush();r.refresh();
 assert.notEqual(r.list('variables')[0],original);deliver(instances[0],'Progress');assert.equal(await done,1);
 assert.equal(r.alias(r.list('variables')[0]),'Progress');
 assert.equal(g.createToolkitRuntime(g,storage).alias(original),'Progress');
});
