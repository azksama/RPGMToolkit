const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(response={responseStatus:200,responseData:{translatedText:'Progress'}}, mode='success') {
 const requests=[],aliases={};let active;
 function Xhr(){active=this;}
 Xhr.prototype.open=function(method,url){requests.push({method,url});};
 Xhr.prototype.send=function(){if(mode==='pending')return;setTimeout(()=>{
  if(mode==='network'){this.onerror();return;}
  if(mode==='timeout'){this.ontimeout();return;}
  this.status=mode==='http'?429:200;this.responseText=JSON.stringify(response);this.onload();
 },0);};
 Xhr.prototype.abort=function(){this.onabort();};
 const runtime={alias:r=>aliases[r.key]||'',setAlias:(r,text)=>{aliases[r.key]=text;}};
 const g={XMLHttpRequest:Xhr,$gameVariables:{},setTimeout:callback=>setTimeout(callback,0)};
 const c=vm.createContext({Promise,Blob});vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/translation.js'),'utf8'),c);
 return {translator:c.createToolkitTranslator(runtime,g),g,requests,aliases};
}
const record=(key='variables:1',original='進行度')=>({key,original});
test('online queue sends only names, caches existing translations and deduplicates names',async()=>{
 const {translator,requests,aliases}=setup();let progress=0;
 assert.equal(await translator.translate([record(),record('variables:2')],'ja',()=>progress++),2);
 assert.equal(requests.length,1);const url=new URL(requests[0].url);assert.equal(url.searchParams.get('q'),'進行度');assert.equal(url.searchParams.get('langpair'),'ja|en');assert.equal(progress,2);
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
