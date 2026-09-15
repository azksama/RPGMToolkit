const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture(count = 50) {
    const sandbox = {console, Blob, Promise, setTimeout, location:{pathname:'/game/index.html'}};
    vm.createContext(sandbox);
    vm.runInContext(`
    Number.prototype.clamp=function(min,max){return Math.min(Math.max(this,min),max);};
    Array.prototype.contains=function(v){return this.indexOf(v)>=0;};
    Math.randomInt=function(n){return Math.floor(Math.random()*n);};
    function Game_ActionResult() {this.clear();}
    Game_ActionResult.prototype.clear=function(){this.addedStates=[];this.removedStates=[];};
    Game_ActionResult.prototype.pushAddedState=function(id){this.addedStates.push(id);};
    Game_ActionResult.prototype.pushRemovedState=function(id){this.removedStates.push(id);};
    Game_ActionResult.prototype.isStateRemoved=function(id){return this.removedStates.indexOf(id)>=0;};
    var $dataSystem={gameTitle:'Test',variables:['','進行度','Pièces',''],switches:['','Door','Boss'],equipTypes:['','Weapon','Shield','Head','Body','Accessory'],optSlipDeath:false};
    var $gameMap={mapId:function(){return 3;},requestRefresh:function(){this.refreshes++;},refreshes:0};
    var $dataMap={events:[null,{id:1,name:'Door'}]};
    var $gamePlayer={refresh:function(){}};
    var $dataItems=[null,{id:1,name:'Potion',itypeId:1,price:30}];
    var $dataWeapons=[null,{id:1,name:'Sword',wtypeId:1,etypeId:1,params:[0,0,10,0,0,0,0,0],traits:[]}];
    var $dataArmors=[null,{id:1,name:'Shield',atypeId:1,etypeId:2,params:[0,0,0,5,0,0,0,0],traits:[]}];
    var $dataSkills=[null,{id:1,name:'Fire',mpCost:3},{id:2,name:'Heal',mpCost:2}];
    var $dataStates=[null,{id:1,name:'KO',priority:100,restriction:4,traits:[],minTurns:1,maxTurns:1,removeByRestriction:false},{id:2,name:'Poison',priority:50,restriction:0,traits:[],minTurns:2,maxTurns:3,removeByRestriction:false}];
    var $dataActors=[null,{id:1,name:'Aria',nickname:'',profile:'',initialLevel:1,maxLevel:99,classId:1,equips:[0,0,0,0,0],traits:[{code:51,dataId:1,value:1},{code:52,dataId:1,value:1}]}];
    var $dataClasses=[null,{id:1,name:'Hero',expParams:[30,20,30,30],learnings:[{level:2,skillId:1}],params:Array.from({length:8},function(_,param){return Array.from({length:100},function(_,level){return param===0?100+level*10:30+level;});}),traits:[]}];
    var DataManager={isItem:function(x){return $dataItems.indexOf(x)>=0;},isWeapon:function(x){return $dataWeapons.indexOf(x)>=0;},isArmor:function(x){return $dataArmors.indexOf(x)>=0;},isSkill:function(x){return $dataSkills.indexOf(x)>=0;}};
    var $gameMessage={add:function(){throw new Error('Unexpected game message');}};
    `, sandbox);
    for (const name of ['Game_Unit','Game_Item','Game_BattlerBase','Game_Battler','Game_Actor','Game_Actors','Game_Variables','Game_Switches','Game_SelfSwitches','Game_Party']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../vendor',name+'.js'),'utf8'),sandbox,{filename:name+'.js'});
    }
    vm.runInContext(`var $gameActors=new Game_Actors();var $gameVariables=new Game_Variables();var $gameSwitches=new Game_Switches();var $gameSelfSwitches=new Game_SelfSwitches();var $gameParty=new Game_Party();$gameParty._actors=[1];`,sandbox);
    while (sandbox.$dataSystem.variables.length <= count) sandbox.$dataSystem.variables.push('Quest '+sandbox.$dataSystem.variables.length);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8'),sandbox);
    const disk = new Map();
    const storage={getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)};
    const r=sandbox.createToolkitRuntime(sandbox,storage);
    return {g:sandbox,r,storage,disk};
}
test('official MV variable setter: search, editing, zero and negative integers, map refresh',()=>{
    const {g,r}=fixture(); const v=r.list('variables')[0];
    assert.equal(r.setValue(v,42),42);assert.equal(g.$gameVariables.value(1),42);assert.ok(g.$gameMap.refreshes>0);
    assert.equal(r.search('variables','value:42','all')[0].id,1);
    assert.equal(r.search('variables','#1','all').length,1);
    assert.equal(r.search('variables','id:10-15','all').length,6);
    assert.equal(r.search('variables','pieces','all')[0].id,2);
    assert.equal(r.setValue(v,-10),-10);assert.equal(r.setValue(v,0),0);
    r.setValue(v,'Chapter 3');assert.equal(g.$gameVariables.value(1),'Chapter 3');
});
test('reject invalid numbers and complex values without writes',()=>{
    const {g,r}=fixture();const v=r.list('variables')[0];
    for(const n of [NaN,Infinity,1.5,1e30])assert.throws(()=>r.setValue(v,n));
    for(const n of ['', '1e4', '2.5', '  ', 'no', null, true])assert.throws(()=>r.integer(n,0,99));
    g.$gameVariables.setValue(1,{nested:true});assert.throws(()=>r.setValue(v,50));
    assert.equal(g.$gameVariables.value(1).nested,true);
});
test('English aliases are display only, searchable, persistent and invalidated by original-name changes',()=>{
    const {g,r,storage}=fixture();const before=JSON.stringify(g.$dataSystem), v=r.list('variables')[0];
    r.setAlias(v,'Progress');assert.equal(r.title(v),'Progress');assert.equal(r.search('variables','progress','all').length,1);
    assert.equal(JSON.stringify(g.$dataSystem),before);assert.equal(g.$gameVariables.value(1),0);
    const restored=g.createToolkitRuntime(g,storage);assert.equal(restored.title(restored.list('variables')[0]),'Progress');
    g.$dataSystem.variables[1]='New name';r.refresh();assert.equal(r.alias(r.list('variables')[0]),'');
});
test('dictionary import is atomic, validates original names and rejects unsafe keys',()=>{
    const {r}=fixture();const p={format:'rpgm-toolkit-translations-v1',entries:[{key:'variables:1',original:'進行度',english:'Progress'},{key:'variables:2',original:'wrong',english:'Coins'},{key:'__proto__',original:'',english:'bad'}]};
    assert.equal(r.importAliases(p).imported,1);assert.equal(r.importAliases(p).skipped,2);
    const before=JSON.stringify(r.exportAliases());p.entries.push({key:'variables:3',english:23});assert.throws(()=>r.importAliases(p));assert.equal(JSON.stringify(r.exportAliases()),before);
});
test('undo and redo reject concurrent writes and clear across loaded sessions',()=>{
    const {g,r}=fixture();const v=r.list('variables')[0];r.setValue(v,42);r.undo();assert.equal(r.value(v),0);r.redo();assert.equal(r.value(v),42);
    g.$gameVariables.setValue(1,33);assert.throws(()=>r.undo(),/changé/);assert.equal(r.value(v),33);
    g.$gameVariables=new g.Game_Variables();assert.equal(r.canUndo(),false);assert.equal(r.canRedo(),false);
});
test('history bounded to 80 edits, new edits discard redo',()=>{
    const {r}=fixture();const v=r.list('variables')[0];for(let n=1;n<=100;n++)r.setValue(v,n);
    for(let n=0;n<80;n++)r.undo();assert.equal(r.value(v),20);assert.equal(r.canUndo(),false);
    r.setValue(v,200);assert.equal(r.canRedo(),false);
});
test('official MV inventory setters respect capacities and never discard worn equipment',()=>{
    const {g,r}=fixture();const item=r.list('weapons')[0];
    g.$gameParty.discardMembersEquip=()=>{throw new Error('Must not strip equipped items');};
    r.setValue(item,50);assert.equal(g.$gameParty.numItems(g.$dataWeapons[1]),50);r.setValue(item,0);assert.equal(r.value(item),0);
    assert.throws(()=>r.setValue(item,-1));assert.throws(()=>r.setValue(item,100));
    g.$gameParty.maxItems=()=>250;r.setValue(item,200);assert.equal(r.value(item),200);r.undo();assert.equal(r.value(item),0);
});
test('official MV gold and global / self switches, baseline survives refresh',()=>{
    const {g,r}=fixture();r.gold(4500);assert.equal(g.$gameParty.gold(),4500);r.undo();assert.equal(g.$gameParty.gold(),0);
    assert.throws(()=>r.gold(-1));r.capture();const s=r.list('switches')[0],local=r.list('selfSwitches')[0];r.setValue(s,true);r.setValue(local,true);
    assert.equal(g.$gameSelfSwitches.value([3,1,'A']),true);assert.equal(r.search('switches','','changed').length,1);
    r.refresh();assert.equal(r.search('switches','','changed').length,1);r.undo();assert.equal(g.$gameSelfSwitches.value([3,1,'A']),false);
});
test('official MV actor APIs: HP, MP, TP, levels, skills, states, recovery',()=>{
    const {r,g}=fixture();const a=r.actor(1);r.setValue(r.list('variables')[0],12);r.actorAction(1,'hp','50');assert.equal(a.hp,50);assert.equal(r.canUndo(),false);
    r.actorAction(1,'mp',5);assert.equal(a.mp,5);r.actorAction(1,'tp',10);assert.equal(a.tp,10);
    r.actorAction(1,'level',2);assert.equal(a.level,2);assert.ok(a.isLearnedSkill(1));
    r.actorAction(1,'learn',2);assert.ok(a.isLearnedSkill(2));r.actorAction(1,'forget',2);assert.equal(a.isLearnedSkill(2),false);
    r.actorAction(1,'addState',2);assert.ok(a.isStateAffected(2));r.actorAction(1,'removeState',2);assert.equal(a.isStateAffected(2),false);
    r.actorAction(1,'recover');assert.equal(a.hp,a.mhp);assert.equal(a.mp,a.mmp);
    g.$gameParty.inBattle=()=>true;assert.throws(()=>r.actorAction(1,'hp',0));
});
test('official MV equipment trades inventory and enforces slot compatibility',()=>{
    const {r,g}=fixture();const weapon=r.list('weapons')[0],armor=r.list('armors')[0],a=r.actor(1);
    assert.throws(()=>r.equip(1,0,weapon),/inventaire/);r.setValue(weapon,1);r.equip(1,0,weapon);assert.equal(a.equips()[0],g.$dataWeapons[1]);assert.equal(r.value(weapon),0);
    assert.throws(()=>r.equip(1,0,armor),/convient/);r.equip(1,0,null);assert.equal(r.value(weapon),1);assert.equal(a.equips()[0],null);
});
test('50,000 variable search and bounded result rendering contract',()=>{
    const {r}=fixture(50000);const t=performance.now();assert.equal(r.search('variables','id:49900-50000','all').length,101);
    const ms=performance.now()-t;console.log('50k variable indexing + search: '+ms.toFixed(1)+' ms');assert.ok(ms<1500,'Search exceeded generous 1.5 second regression threshold');
});
test('storage failures keep in-memory aliases available',()=>{
    const {g}=fixture();const r=g.createToolkitRuntime(g,{getItem(){throw Error('Denied');},setItem(){throw Error('Quota');}});
    const v=r.list('variables')[0];r.setAlias(v,'Progress');assert.equal(r.title(v),'Progress');assert.equal(r.storageWarning(),true);
});
module.exports={fixture};

test('boolean variable values retain false and support typed search',()=>{
 const {r,g}=fixture();const a=r.list('variables')[0],b=r.list('variables')[1];
 r.setValue(a,false);r.setValue(b,true);
 assert.equal(r.value(a),false);assert.equal(g.$gameVariables._data[a.id],false);
 assert.equal(r.search('variables','','bool').length,2);
 assert.equal(r.search('variables','','int').some(x=>x.key===a.key),false);
 r.setValue(a,42);assert.equal(r.value(a),42);r.undo();assert.equal(r.value(a),false);
});

test('freeze guards game writes, updates its target on edits and undo, then releases',()=>{
 const {r,g}=fixture();const a=r.list('variables')[0],item=r.list('items')[0],sw=r.list('switches')[0];
 r.setValue(a,42);r.setValue(item,8);r.freezeMany([a,item,sw],true);
 g.$gameVariables.setValue(a.id,900);g.$gameParty.gainItem(item.data,-8,false);g.$gameSwitches.setValue(sw.id,true);
 assert.equal(r.value(a),42);assert.equal(r.value(item),8);assert.equal(r.value(sw),false);
 assert.equal(Object.keys(g.$gameVariables).includes('setValue'),false);
 r.setValue(a,70);g.$gameVariables.setValue(a.id,12);assert.equal(r.value(a),70);
 r.undo();g.$gameVariables.setValue(a.id,12);assert.equal(r.value(a),42);
 g.$gameVariables._data[a.id]=30;r.enforceFrozen();assert.equal(r.value(a),42);
 r.freezeMany([a,item,sw],false);g.$gameVariables.setValue(a.id,90);assert.equal(r.value(a),90);
 assert.equal(Object.hasOwn(g.$gameVariables,'setValue'),false);
});

test('batch edits validate all entries first and undo as one operation',()=>{
 const {r}=fixture();const a=r.list('variables')[0],b=r.list('variables')[1],sw=r.list('switches')[0];
 r.setValue(a,4);r.setValue(b,6);
 assert.throws(()=>r.setMany([a,sw],99));assert.equal(r.value(a),4);
 r.setMany([a,b],15);assert.equal(r.value(a),15);assert.equal(r.value(b),15);
 r.undo();assert.equal(r.value(a),4);assert.equal(r.value(b),6);
 r.redo();assert.equal(r.value(a),15);assert.equal(r.value(b),15);
 r.setMany([a,sw],false);assert.equal(r.value(a),false);assert.equal(r.value(sw),false);
});

test('batch failure rolls earlier writes back and restores frozen targets',()=>{
 const {r,g}=fixture();const a=r.list('variables')[0],b=r.list('variables')[1];
 r.setValue(a,3);r.setValue(b,7);
 const original=g.$gameVariables.setValue;
 g.$gameVariables.setValue=function(id,value){if(id===b.id&&value===90)throw Error('Rejected');return original.call(this,id,value);};
 r.freezeMany([a,b],true);
 assert.throws(()=>r.setMany([a,b],90),/Rejected/);
 assert.equal(r.value(a),3);assert.equal(r.value(b),7);
 g.$gameVariables._data[a.id]=99;r.enforceFrozen();assert.equal(r.value(a),3);
});

test('new save session releases old guards and does not inherit freezes',()=>{
 const {r,g}=fixture();const a=r.list('variables')[0],old=g.$gameVariables;
 r.freezeMany([a],true);g.$gameVariables=new g.Game_Variables();r.enforceFrozen();
 assert.equal(r.frozenCount(),0);assert.equal(Object.hasOwn(old,'setValue'),false);
 g.$gameVariables.setValue(1,77);assert.equal(r.value(r.list('variables')[0]),77);
});
