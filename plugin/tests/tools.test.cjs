const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./runtime-fixture.cjs');
function setup(){
 const {g,r,...rest}=fixture();
 g.$gamePlayer.isThrough=()=>false;g.$gamePlayer.isTransferring=()=>false;g.$gamePlayer.reserveTransfer=(...args)=>{g.transfer=args;};
 g.$gameMap.isEventRunning=()=>false;g.$gameMessage.isBusy=()=>false;
 g.$dataMap.width=20;g.$dataMap.height=12;g.$dataMapInfos=[null,null,null,{id:3,name:'Temple'},{id:4,name:'Village'}];
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/tools.js'),'utf8'),g);
 return {g,r,...rest,tools:g.createToolkitTools(g)};
}
test('Godmode protects party HP and KO, disables cleanly and does not protect outsiders',()=>{
 const {g,r,tools}=setup();const a=r.actor(1),original=g.Game_BattlerBase.prototype.setHp;
 tools.setGod(true);assert.equal(a.hp,a.mhp);a.gainHp(-9999);assert.equal(a.hp,a.mhp);a.addState(1);assert.equal(a.isStateAffected(1),false);
 g.$dataActors[2]={...g.$dataActors[1],id:2,name:'Outside'};const outsider=r.actor(2);outsider.setHp(0);assert.equal(outsider.hp,0);assert(outsider.isStateAffected(1));
 a._hp=0;tools.tick();assert.equal(a.hp,a.mhp);
 tools.setGod(false);assert.equal(g.Game_BattlerBase.prototype.setHp,original);a.setHp(0);assert(a.isStateAffected(1));
});
test('NoClip never overwrites through state, disabling and session load restore hooks',()=>{
 const {g,tools}=setup();const original=g.$gamePlayer.isThrough;
 tools.setNoclip(true);assert(g.$gamePlayer.isThrough());assert.equal(g.$gamePlayer._through,undefined);
 assert.equal(Object.keys(g.$gamePlayer).includes('isThrough'),false);
 tools.setNoclip(false);assert.equal(g.$gamePlayer.isThrough,original);assert(!g.$gamePlayer.isThrough());
 tools.setGod(true);tools.setNoclip(true);g.$gameVariables=new g.Game_Variables();tools.tick();assert.equal(tools.state().god,false);assert.equal(tools.state().noclip,false);assert.equal(g.$gamePlayer.isThrough,original);
});
test('HP/MP/TP and stats validate before writes and use native actor methods',()=>{
 const {g,r,tools}=setup(),a=r.actor(1);
 tools.resources('all',5,6,7,false);assert.deepEqual([a.hp,a.mp,a.tp],[5,6,7]);
 assert.throws(()=>tools.resources('all',5,99999,7,false));assert.deepEqual([a.hp,a.mp,a.tp],[5,6,7]);
 tools.resources('all',0,0,0,true);assert.deepEqual([a.hp,a.mp,a.tp],[a.mhp,a.mmp,a.maxTp()]);
 tools.stat(1,'level',5);assert.equal(a.level,5);tools.stat(1,'2',10);assert.equal(a._paramPlus[2],10);tools.stat(1,'2',20);assert.equal(a._paramPlus[2],20);
 g.$gameMap.isEventRunning=()=>true;assert.throws(()=>tools.stat(1,'level',6));assert.equal(a.level,5);
});
test('teleport uses catalog and map bounds without replacing current data, rejects stale sessions',async()=>{
 const {g,tools}=setup(),data=g.$dataMap;let xhr;
 g.XMLHttpRequest=function(){xhr=this;};g.XMLHttpRequest.prototype.open=function(method,url){this.url=url;};g.XMLHttpRequest.prototype.send=function(){};
 const p=tools.loadMap(4);assert.equal(xhr.url,'data/Map004.json');xhr.status=200;xhr.responseText='{"width":40,"height":30}';xhr.onload();
 const map=await p;assert.equal(g.$dataMap,data);assert.throws(()=>tools.teleport(map,40,0,2));assert.throws(()=>tools.teleport(map,0,-1,2));assert.throws(()=>tools.teleport(map,0,0,3));assert.equal(g.transfer,undefined);
 tools.teleport(map,12,15,2);assert.deepEqual(g.transfer,[4,12,15,2,0]);
 g.$gameVariables=new g.Game_Variables();assert.throws(()=>tools.teleport(map,12,15,2),/carte/);
 await assert.rejects(tools.loadMap(99),/inconnue/);
 const current=await tools.loadMap(3);assert.equal(current.width,20);
 const pending=tools.loadMap(4);g.$gameVariables=new g.Game_Variables();xhr.status=200;xhr.responseText='{"width":40,"height":30}';xhr.onload();await assert.rejects(pending,/partie/);
});
