const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./runtime-fixture.cjs');
function setup(){
 const {g,r,...rest}=fixture();
 g.$gamePlayer.isThrough=()=>false;g.$gamePlayer.isTransferring=()=>false;g.$gamePlayer.reserveTransfer=(...args)=>{g.transfer=args;};
 g.$gameMap.isPassable=()=>true;g.$gamePlayer.x=1;g.$gamePlayer.y=2;g.$gamePlayer.direction=()=>6;g.$gameMap.events=()=>[];g.$gameMap.isEventRunning=()=>false;g.$gameMessage.isBusy=()=>false;
 g.$dataMap.width=20;g.$dataMap.height=12;g.$dataMapInfos=[null,null,null,{id:3,name:'Temple'},{id:4,name:'Village'}];
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/travel.js'),'utf8'),g);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/tools.js'),'utf8'),g);
 return {g,r,...rest,tools:g.createToolkitTools(g,r)};
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
 const {g,r,tools}=setup(),data=g.$dataMap; r.prefs.settings.safeTeleport=false;let xhr;
 g.XMLHttpRequest=function(){xhr=this;};g.XMLHttpRequest.prototype.open=function(method,url){this.url=url;};g.XMLHttpRequest.prototype.send=function(){};
 const p=tools.loadMap(4);assert.equal(xhr.url,'data/Map004.json');xhr.status=200;xhr.responseText='{"width":40,"height":30}';xhr.onload();
 const map=await p;assert.equal(g.$dataMap,data);assert.throws(()=>tools.teleport(map,40,0,2));assert.throws(()=>tools.teleport(map,0,-1,2));assert.throws(()=>tools.teleport(map,0,0,3));assert.equal(g.transfer,undefined);
 tools.teleport(map,12,15,2);assert.deepEqual(g.transfer,[4,12,15,2,0]);
 g.$gameVariables=new g.Game_Variables();assert.throws(()=>tools.teleport(map,12,15,2),/carte/);
 await assert.rejects(tools.loadMap(99),/inconnue/);
 const current=await tools.loadMap(3);assert.equal(current.width,20);
 const pending=tools.loadMap(4);g.$gameVariables=new g.Game_Variables();xhr.status=200;xhr.responseText='{"width":40,"height":30}';xhr.onload();await assert.rejects(pending,/partie/);
});

test('enemy resources use troop instances only during battle; quick actions clamp independently',()=>{
 const {g,r,tools}=setup();let battle=true;g.$gameParty.inBattle=()=>battle;
 const make=(hp,max)=>({hp,mhp:max,mp:20,mmp:50,tp:5,maxTp:()=>100,setHp(v){this.hp=v;},setMp(v){this.mp=v;},setTp(v){this.tp=v;}});
 const first=make(2500,4000),second=make(100,800);g.$gameTroop={members:()=>[first,second]};const player=r.actor(1),hp=player.hp;
 tools.adjustResource('enemies','hp','subtract');assert.deepEqual([first.hp,second.hp],[1500,0]);assert.equal(player.hp,hp);
 tools.adjustResource('enemy:0','hp','add');assert.equal(first.hp,2500);tools.adjustResource('enemy:0','hp','zero');assert.equal(first.hp,0);
 tools.resources('enemy:1',400,30,10,false);assert.deepEqual([second.hp,second.mp,second.tp],[400,30,10]);
 tools.adjustResource('enemies','mp','add');assert.deepEqual([first.mp,second.mp],[50,50]);
 battle=false;assert.throws(()=>tools.resources('enemy:0',100,0,0,false),/ennemi/);assert.equal(first.hp,0);
});
test('stat quick actions reset bonuses, clamp level and reject invalid actions',()=>{
 const {r,tools}=setup(),a=r.actor(1);tools.stat(1,'2',50);tools.adjustStat(1,'2','add');assert.equal(a._paramPlus[2],1050);
 tools.adjustStat(1,'2','subtract');assert.equal(a._paramPlus[2],50);tools.adjustStat(1,'2','zero');assert.equal(a._paramPlus[2],0);
 tools.adjustStat(1,'level','zero');assert.equal(a.level,1);tools.adjustStat(1,'level','add');assert.equal(a.level,99);assert.throws(()=>tools.adjustStat(1,'2','bad'));
});

function offline(g,width,height) {
 g.$dataTilesets=[null,{flags:[16,0,15,256,1,8]}];
 const data={width,height,tilesetId:1,scrollType:0,events:[],data:Array(width*height*4).fill(0)};
 data.data.fill(1,0,width*height);
 return {id:4,width,height,data};
}
test('safe teleport rejects walls, isolated cells, one-way exits, hazards and event tiles',()=>{
 const {g,tools}=setup(), map=offline(g,5,5), travel=tools.travel;
 const wall=(x,y)=>{map.data.data[y*5+x]=2;};
 wall(2,2); const target=travel.nearest(map,2,2);assert.notDeepEqual({...target},{x:2,y:2});
 map.data.data.fill(2,0,25);map.data.data[12]=1;assert.throws(()=>travel.nearest(map,2,2),/Aucune/);
 map.data.data[17]=5;assert.throws(()=>travel.nearest(map,2,2),/Aucune/,'destination blocks reciprocal exit');
 map.data.data[17]=3;assert.throws(()=>travel.nearest(map,2,2),/Aucune/,'damage floor excluded');
 map.data.data[17]=1;assert.deepEqual({...travel.nearest(map,2,2)},{x:2,y:2});
 map.data.events=[null,{id:1,x:2,y:3,pages:[{conditions:{}}]}];assert.throws(()=>travel.nearest(map,2,2),/Aucune/);
 map.data.events[1].pages[0].conditions={switch1Valid:true,switch1Id:1};assert.deepEqual({...travel.nearest(map,2,2)},{x:2,y:2});
 g.$gameSwitches.setValue(1,true);assert.throws(()=>travel.nearest(map,2,2),/Aucune/);
});
test('safe teleport wraps looping maps, ignores noclip and fails closed without passage data',()=>{
 const {g,tools}=setup(),map=offline(g,4,1);
 map.data.data[1]=2;map.data.data[2]=2;assert.throws(()=>tools.travel.nearest(map,0,0),/Aucune/);
 map.data.scrollType=2;assert.deepEqual({...tools.travel.nearest(map,0,0)},{x:0,y:0});
 delete map.data.tilesetId;assert.throws(()=>tools.travel.nearest(map,0,0),/indisponibles/);
 g.$gameMap.isPassable=()=>false;tools.setNoclip(true);assert.throws(()=>tools.travel.nearest({id:3,width:3,height:3,data:{}},1,1),/Aucune/);
});
test('locations persist, last location changes only after completion and return stores the reverse trip',async()=>{
 const {g,r,storage,tools}=setup();let transferring=false,mapId=3;
 g.$gameMap.mapId=()=>mapId;g.$gamePlayer.isTransferring=()=>transferring;
 g.$gamePlayer.reserveTransfer=(...args)=>{transferring=true;g.transfer=args;};
 tools.travel.remember('Temple');assert.equal(tools.travel.places()[0].direction,6);
 const map=await tools.loadMap(3);tools.teleport(map,4,5,2);assert.equal(tools.travel.last(),null);
 tools.tick();assert.equal(tools.travel.last(),null);
 g.$gamePlayer.x=4;g.$gamePlayer.y=5;transferring=false;tools.tick();
 assert.deepEqual({...tools.travel.last()},{name:'Dernier emplacement',mapId:3,x:1,y:2,direction:6});
 tools.teleport(map,1,2,6);g.$gamePlayer.x=1;g.$gamePlayer.y=2;transferring=false;tools.tick();assert.equal(tools.travel.last().x,4);
 const restored=g.createToolkitRuntime(g,storage);assert.equal(restored.prefs.travel.places[0].name,'Temple');assert.equal(restored.prefs.travel.last.x,4);
 tools.teleport(map,8,8,2);g.$gameVariables=new g.Game_Variables();transferring=false;tools.tick();assert.equal(tools.travel.last().x,4,'load invalidates pending history');
 tools.travel.forget(0);assert.equal(tools.travel.places().length,0);
});
test('blocked and vehicle transfers preserve history and do not reserve a transfer',async()=>{
 const {g,r,tools}=setup();const map=await tools.loadMap(3);g.$gameMap.isPassable=()=>false;
 assert.throws(()=>tools.teleport(map,0,0,2),/Aucune/);assert.equal(g.transfer,undefined);assert.equal(tools.travel.last(),null);
 g.$gameMap.isPassable=()=>true;g.$gamePlayer.isInVehicle=()=>true;assert.throws(()=>tools.teleport(map,0,0,2),/véhicule/);
 g.$gamePlayer.isInVehicle=()=>false;r.prefs.settings.safeTeleport=false;g.$gameMap.isPassable=()=>false;tools.teleport(map,0,0,2);assert.deepEqual(g.transfer,[3,0,0,2,0]);
});
