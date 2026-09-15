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

module.exports={fixture};
