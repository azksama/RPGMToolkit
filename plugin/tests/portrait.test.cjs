const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(engine='MV'){
 const events={},g={innerWidth:360,innerHeight:640,Utils:{RPGMAKER_NAME:engine},addEventListener:(n,f)=>events[n]=f};
 g.Scene_Base=function(){};g.Scene_Base.prototype.start=function(){};
 g.Scene_Map=function(){};g.Scene_Map.prototype=Object.create(g.Scene_Base.prototype);
 g.SceneManager={_scene:new g.Scene_Map(),_screenWidth:816,_screenHeight:624,_boxWidth:800,_boxHeight:600,isSceneChanging:()=>false,isCurrentSceneStarted:()=>true,goto(type){this._scene=new type();g.rebuilt=(g.rebuilt||0)+1;}};
 if(engine==='MZ'){
  delete g.SceneManager.isCurrentSceneStarted;
  g.Scene_Map.prototype.isStarted=function(){return this._started!==false;};
 }
 g.Graphics={width:816,height:624,boxWidth:800,boxHeight:600,_stretchEnabled:false,_updateAllElements(){g.updated=true;}};
 if(engine==='MZ')g.Graphics.resize=function(w,h){this.width=w;this.height=h;};
 g.$gamePlayer={x:8,y:12,isTransferring:()=>false,center(x,y){g.center=[x,y];}};
 g.$gameMap={isEventRunning:()=>false};g.$gameMessage={isBusy:()=>false};
 g.Window_Message=function(){};
 Object.assign(g.Window_Message.prototype,{textWidth:s=>s.length*10,newLineX:()=>0,processCharacter(s){s.x+=10;s.index++;},processNewLine(s){s.index++;s.x=0;s.y+=20;},needsNewPage:s=>s.y>=40});
 g.Window_MenuStatus=function(){};g.Window_MenuStatus.prototype.maxCols=()=>4;g.Window_MenuStatus.prototype.numVisibleRows=()=>1;
 g.Sprite_Actor=function(){};g.Sprite_Actor.prototype.setActorHome=function(i){this.setHome(600+i*32,280+i*48);};g.Sprite_Actor.prototype.setHome=function(x,y){this.home=[x,y];};
 g.Sprite_Enemy=function(){};g.Sprite_Enemy.prototype.setBattler=function(b){this.setHome(b.screenX(),b.screenY());};g.Sprite_Enemy.prototype.setHome=g.Sprite_Actor.prototype.setHome;
 g.Sprite_Picture=function(){this.bitmap={width:240,height:540};this.scale={x:1,y:1};this.anchor={x:0,y:0};this.baseX=650;this.baseY=12;};
 g.Sprite_Picture.prototype.update=function(){this.x=this.baseX;this.y=this.baseY;};
 const runtime={prefs:{settings:{portrait:false}},savePrefs(){this.saved=!!this.prefs.settings.portrait;}};
 vm.createContext(g);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/portrait.js'),'utf8'),g);
 return {g,runtime,events,p:g.createToolkitPortrait(g,runtime)};
}
for(const engine of ['MV','MZ'])test(engine+': true portrait resolution, delayed switch, camera and exact restoration',()=>{
 const {g,runtime,p}=fixture(engine);p.request(true);assert(runtime.saved);assert.equal(p.tick(true),false);assert.equal(g.Graphics.width,816);
 assert(p.tick(false));assert.equal(g.Graphics.width,720);assert.equal(g.Graphics.height,1280);assert.equal(g.Graphics.boxWidth,720);assert.equal(g.Graphics.boxHeight,1280);assert.deepEqual(g.center,[8,12]);
 assert.equal(g.$gamePlayer.x,8);assert.equal(g.$gamePlayer.y,12);assert.equal(p.tick(false),false);assert.equal(g.rebuilt,1);
 p.request(false);assert(p.tick(false));assert.deepEqual([g.Graphics.width,g.Graphics.height,g.Graphics.boxWidth,g.Graphics.boxHeight,g.Graphics._stretchEnabled],[816,624,800,600,false]);assert.equal(g.SceneManager._boxWidth,800);
});

for(const engine of ['MV','MZ'])test(engine+': portrait waits for scene start and activity before reading windows',()=>{
 const {g,p,runtime}=fixture(engine),scene=g.SceneManager._scene;
 let reads=0,busy=0,started=false,active=false;
 scene.isReady=()=>{reads++;return false;};
 scene.isBusy=()=>{busy++;return scene._messageWindow.isClosing();};
 scene.isActive=()=>active;
 if(engine==='MV')g.SceneManager.isCurrentSceneStarted=()=>started;
 else scene.isStarted=()=>started;
 runtime.prefs.settings.portrait=true;
 assert.equal(p.tick(false),false);
 assert.throws(()=>p.request(false),/carte/);
 started=true;
 assert.equal(p.tick(false),false);
 assert.equal(busy,0);assert.equal(reads,0);
 active=true;scene._messageWindow={isClosing:()=>false};
 assert.equal(p.tick(false),true);assert.equal(busy,1);
 assert.equal(g.Graphics.width,720);
});

test('disabled portrait does not inspect scene windows',()=>{
 const {g,p}=fixture('MZ');
 g.SceneManager._scene.isBusy=()=>{throw new Error('Unexpected scene query');};
 assert.equal(p.tick(false),false);
});
test('aspect fills taller portrait screens; resize waits for map and event completion',()=>{
 const {g,p,events}=fixture();p.request(true);p.tick(false);
 g.innerHeight=780;events.resize();g.$gameMessage.isBusy=()=>true;assert.equal(p.tick(false),false);assert.equal(g.Graphics.height,1280);
 g.$gameMessage.isBusy=()=>false;p.tick(false);assert.equal(g.Graphics.height,1560);
 g.innerWidth=900;g.innerHeight=500;events.resize();p.tick(false);assert.equal(g.Graphics.height,1280);
 g.$gameMap.isEventRunning=()=>true;assert.throws(()=>p.request(false),/carte/);
});
test('battle/menu requests rejected; persisted preference applies only when map is ready',()=>{
 const {g,p,runtime}=fixture();g.SceneManager._scene={};assert.throws(()=>p.request(true),/carte/);assert.equal(runtime.prefs.settings.portrait,false);
 runtime.prefs.settings.portrait=true;assert.equal(p.tick(false),false);g.SceneManager._scene=new g.Scene_Map();assert(p.tick(false));
});
test('resize failure restores graphics and disables the saved preference',()=>{
 const {g,p,runtime}=fixture('MZ');const original=g.Graphics.resize;let first=true;
 g.Graphics.resize=function(w,h){if(first){first=false;throw new Error('renderer');}original.call(this,w,h);};
 p.request(true);assert.equal(p.tick(false),false);assert.equal(g.Graphics.width,816);assert.equal(runtime.saved,false);assert.equal(p.error(),'renderer');
});
test('portrait clamps oversized windows and wraps message characters without losing text at page breaks',()=>{
 const {g,p}=fixture();p.request(true);p.tick(false);
 const status=new g.Window_MenuStatus();assert.equal(status.maxCols(),1);assert.equal(status.numVisibleRows(),4);
 const scene=new g.Scene_Base(),w={x:900,y:1600,width:1000,height:1500,move(x,y,width,height){Object.assign(this,{x,y,width,height});},createContents(){this.created=true;},refresh(){this.refreshed=true;}};
 scene._windowLayer={children:[w]};scene.start();assert.deepEqual([w.x,w.y,w.width,w.height],[0,0,720,1280]);assert(w.created&&w.refreshed);
 const message=new g.Window_Message();message.contents={width:50};const s={text:'abcdefghi',index:5,x:50,y:0};message.processCharacter(s);assert.deepEqual([s.index,s.x,s.y],[6,10,20]);
 s.index=7;s.x=50;s.y=20;message.processCharacter(s);assert.equal(s.index,7,'page break retains next character');
 p.request(false);p.tick(false);s.x=50;s.y=0;message.processCharacter(s);assert.equal(s.x,60,'disabled hook delegates unchanged');
});
test('battle home positions fit portrait and standard positions return when disabled',()=>{
 const {g,p}=fixture();p.request(true);p.tick(false);const actor=new g.Sprite_Actor(),enemy=new g.Sprite_Enemy();actor.setActorHome(3);enemy.setBattler({screenX:()=>780,screenY:()=>580});
 for(const sprite of [actor,enemy])assert(sprite.home[0]>=0&&sprite.home[0]<720&&sprite.home[1]>0&&sprite.home[1]<1000);
 p.request(false);p.tick(false);actor.setActorHome(0);assert.deepEqual(actor.home,[600,280]);
});

test('portrait pictures are bottom aligned without accumulating offsets or moving icons and backgrounds',()=>{
 const {g,p,runtime}=fixture();p.request(true);p.tick(false);
 const sprite=new g.Sprite_Picture();sprite.update();assert.equal(sprite.y,740);assert.equal(sprite.x,480);
 sprite.update();assert.equal(sprite.y,740);
 sprite.anchor.y=0.5;sprite.update();assert.equal(sprite.y,1010);
 runtime.prefs.settings.portraitPictures=false;sprite.update();assert.equal(sprite.y,12);
 runtime.prefs.settings.portraitPictures=true;sprite.bitmap={width:816,height:624};sprite.update();assert.equal(sprite.y,12);
 sprite.bitmap={width:32,height:64};sprite.update();assert.equal(sprite.y,12);
 sprite.bitmap={width:240,height:540};p.request(false);p.tick(false);sprite.update();assert.equal(sprite.y,12);
});
