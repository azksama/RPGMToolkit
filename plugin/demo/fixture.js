/* Demonstration fixture, not a complete RPG Maker game. */
(function(g) {
    'use strict';
    g.Utils = { RPGMAKER_NAME: new URLSearchParams(location.search).get('engine') || 'MV', RPGMAKER_VERSION: 'demo', isOptionValid: function() { return true; } };
    g.PluginManager = { parameters: function() { return {}; }, registerCommand: function(plugin, command, callback) { g._commands[command] = callback; } };
    g._commands = {};
    g.$dataSystem = { gameTitle: 'Les Archives d’Aster', currencyUnit: 'G', variables: ['', '進行度', '所持金', '好感度', 'Quêtes accomplies', 'Temps de jeu', 'Clé du temple', 'Chapter name', '<img src=x onerror=alert(1)>'], switches: ['', 'Porte du temple ouverte', 'ボス撃破', 'Tutoriel terminé'], equipTypes: ['', 'Arme', 'Bouclier', 'Casque', 'Armure', 'Accessoire'] };
    if (!new URLSearchParams(location.search).has('hostile')) g.$dataSystem.variables[8] = 'Exploration du temple';
    var count = Number(new URLSearchParams(location.search).get('count') || 5000);
    for (var i = 9; i <= count; i++) g.$dataSystem.variables[i] = i % 9 ? 'Quest progress ' + i : '';
    function item(id, name, extra) { var out = { id:id, name:name, description:'Une entrée de démonstration du catalogue.', iconIndex:0, price:100, itypeId:1 }; Object.keys(extra || {}).forEach(function(k) { out[k] = extra[k]; }); return out; }
    g.$dataItems = [null, item(1,'回復薬'),item(2,'Grande potion'),item(3,'Clé ancienne',{itypeId:2}),item(4,'Cristal de mana')];
    g.$dataWeapons = [null,item(1,'鉄の剣',{etypeId:1,params:[0,0,12,0,0,0,2,0]}),item(2,'Arc du voyageur',{etypeId:1,params:[0,0,8,0,0,0,5,0]})];
    g.$dataArmors = [null,item(1,'Bouclier de bronze',{etypeId:2,params:[0,0,0,8,0,0,0,0]}),item(2,'Robe lunaire',{etypeId:4,params:[0,20,0,4,6,6,0,0]})];
    g.$dataActors = [null,{id:1,name:'Aria',initialLevel:12},{id:2,name:'Léo',initialLevel:8}];
    g.$dataSkills = [null,item(1,'Fire',{mpCost:5}),item(2,'Heal',{mpCost:3})];
    g.$dataStates = [null,item(1,'Knockout',{priority:100}),item(2,'Poison',{priority:50})];
    g.$dataMap = { events:[null,{id:1,name:'Coffre du temple'},{id:2,name:'Porte secrète'}] };
    g.$gameMap = { mapId:function(){return 7;},requestRefresh:function(){g._refreshes++;},isEventRunning:function(){return false;} };
    g._refreshes = 0;
    g.$gamePlayer = {x:12,y:8,refresh:function(){},isTransferring:function(){return false;}};
    g.$gameTemp = {clearDestination:function(){g._destination = false;}};
    g.$gameMessage = {isBusy:function(){return false;}};
    g.$gameSystem = {isSaveEnabled:function(){return true;}};
    g.Input = {clear:function(){g._inputClears++;}};g.TouchInput={clear:function(){}};g._inputClears=0;
    function Values(names) {this._data=[];this.names=names;}
    Values.prototype.value=function(id){return this._data[id] || 0;};
    Values.prototype.setValue=function(id,v){if(id>0 && id<this.names.length){this._data[id]=typeof v==='number'?Math.floor(v):v;g.$gameMap.requestRefresh();}};
    g.$gameVariables = new Values(g.$dataSystem.variables);g.$gameVariables.setValue(1,42);g.$gameVariables.setValue(2,1250);g.$gameVariables.setValue(3,75);g.$gameVariables.setValue(4,8);g.$gameVariables.setValue(7,'Le temple oublié');
    g.$gameSwitches = { _data:[],value:function(id){return !!this._data[id];},setValue:function(id,v){this._data[id]=!!v;g.$gameMap.requestRefresh();}};
    g.$gameSelfSwitches = { _data:{},value:function(id){return !!this._data[id];},setValue:function(id,v){if(v)this._data[id]=true;else delete this._data[id];g.$gameMap.requestRefresh();}};
    function kindOf(it){return g.$dataItems.indexOf(it)>=0?'items':g.$dataWeapons.indexOf(it)>=0?'weapons':'armors';}
    g.$gameParty = { _inventory:{items:{1:8,2:3},weapons:{1:1},armors:{}},_gold:1250,gold:function(){return this._gold;},maxGold:function(){return 99999999;},gainGold:function(n){this._gold=Math.max(0,Math.min(this.maxGold(),this._gold+n));},numItems:function(it){return this._inventory[kindOf(it)][it.id]||0;},maxItems:function(){return 99;},gainItem:function(it,n){this._inventory[kindOf(it)][it.id]=Math.max(0,Math.min(this.maxItems(it),this.numItems(it)+n));g.$gameMap.requestRefresh();},hasItem:function(it){return this.numItems(it)>0;},inBattle:function(){return false;}};
    function Actor(id){this.id=id;this.level=g.$dataActors[id].initialLevel;this.hp=380;this.mhp=500;this.mp=45;this.mmp=80;this.tp=0;this.exp=1000;this._paramPlus=[0,0,0,0,0,0,0,0];this._skills=[];this._states=[];this._equips=[null,null,null,null,null];}
    Actor.prototype.name=function(){return g.$dataActors[this.id].name;};Actor.prototype.maxTp=function(){return 100;};Actor.prototype.maxLevel=function(){return 99;};Actor.prototype.currentExp=function(){return this.exp;};
    Actor.prototype.setHp=function(n){this.hp=n;};Actor.prototype.setMp=function(n){this.mp=n;};Actor.prototype.setTp=function(n){this.tp=n;};Actor.prototype.changeLevel=function(n){this.level=n;};Actor.prototype.changeExp=function(n){this.exp=n;};Actor.prototype.recoverAll=function(){this.hp=this.mhp;this.mp=this.mmp;this._states=[];};
    Actor.prototype.isLearnedSkill=function(id){return this._skills.indexOf(id)>=0;};Actor.prototype.learnSkill=function(id){if(!this.isLearnedSkill(id))this._skills.push(id);};Actor.prototype.forgetSkill=function(id){this._skills=this._skills.filter(function(v){return v!==id;});};
    Actor.prototype.isStateAffected=function(id){return this._states.indexOf(id)>=0;};Actor.prototype.addState=function(id){if(!this.isStateAffected(id))this._states.push(id);};Actor.prototype.removeState=function(id){this._states=this._states.filter(function(v){return v!==id;});};
    Actor.prototype.equipSlots=function(){return [1,2,3,4,5];};Actor.prototype.isEquipChangeOk=function(){return true;};Actor.prototype.canEquip=function(){return true;};Actor.prototype.equips=function(){return this._equips;};Actor.prototype.changeEquip=function(slot,it){if(it)g.$gameParty.gainItem(it,-1);if(this._equips[slot])g.$gameParty.gainItem(this._equips[slot],1);this._equips[slot]=it;};
    g.$gameActors = {_data:[],actor:function(id){return this._data[id]||(this._data[id]=new Actor(id));}};
    // Minimal tool APIs for UI demonstrations; official MV behavior is tested separately.
    Actor.prototype.actorId=function(){return this.id;};Actor.prototype.deathStateId=function(){return 1;};Actor.prototype.eraseState=Actor.prototype.removeState;Actor.prototype.refresh=function(){};
    Actor.prototype.param=function(i){return (i===0?this.mhp:i===1?this.mmp:30)+(this._paramPlus[i]||0);};Actor.prototype.addParam=function(i,n){this._paramPlus[i]+=n;};
    g.Game_BattlerBase=Actor;g.Game_Battler=Actor;
    g.$gameParty._actors=[1,2];g.$gameParty.allMembers=function(){return this._actors.map(function(id){return g.$gameActors.actor(id);});};
    g.$gamePlayer.isThrough=function(){return false;};g.$gamePlayer.reserveTransfer=function(id,x,y,direction){g._transfer=[id,x,y,direction];};
    g.$dataMap.width=30;g.$dataMap.height=20;g.$dataMapInfos=[];g.$dataMapInfos[7]={id:7,name:'Temple'};g.$dataMapInfos[8]={id:8,name:'Village'};
    var iconCanvas=document.createElement('canvas');iconCanvas.width=32;iconCanvas.height=32;var iconContext=iconCanvas.getContext('2d');iconContext.fillStyle='#91b8ee';iconContext.fillRect(6,8,20,20);iconContext.fillStyle='#eff4ff';iconContext.fillRect(12,3,8,5);
    g.ImageManager={loadSystem:function(){return {canvas:iconCanvas,addLoadListener:function(fn){fn();}};}};
    g.Scene_Map=function(){};g.Scene_Map.prototype.isBusy=function(){return false;};g.Scene_Save=function(){};
    g._ticks=0;g._gameKeys=0;g.SceneManager={_scene:new g.Scene_Map(),_sceneStarted:true,isCurrentSceneStarted:function(){return this._scene && this._sceneStarted;},isSceneChanging:function(){return !!this._nextScene;},updateScene:function(){g._ticks++;},push:function(scene){this._nextScene=new scene();}};
    g.Game_Interpreter=function(){};g.Game_Interpreter.prototype.pluginCommand=function(){};g.Game_Interpreter.prototype.setWaitMode=function(mode){this._waitMode=mode;};g.Game_Interpreter.prototype.updateWaitMode=function(){return false;};
    document.addEventListener('keydown',function(){g._gameKeys++;});
    setInterval(function(){g.SceneManager.updateScene();document.getElementById('ticks').textContent=g._ticks;},16);
})(window);
