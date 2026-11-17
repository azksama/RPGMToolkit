const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const plugin = fs.readFileSync(path.resolve(__dirname, '../src-tauri/resources/RPGMToolkit.js'), 'utf8');
const fixture = fs.readFileSync(path.resolve(__dirname, 'fixtures/engine.js'), 'utf8');

async function run(engine, showButton, check, code=plugin) {
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<html><body><span id="ticks"></span></body></html>');
  await page.evaluate(()=>{window.setInterval=()=>0;});
  await page.addScriptTag({content:fixture});
  await page.evaluate(({engine,showButton})=>{
   Utils.RPGMAKER_NAME=engine;
   window.Graphics={width:816,height:624,boxWidth:816,boxHeight:624,resize(w,h){this.width=w;this.height=h;}};
   PluginManager.parameters=()=>({ShowButton:String(showButton)});
   window.loading={data:false,images:false,reads:0,busy:0,updates:0,ticks:0};
   Scene_Map=function(){this._started=false;this._active=false;};
   Scene_Map.prototype.isActive=function(){return this._active;};
   Scene_Map.prototype.start=function(){this._started=true;this._active=true;};
   // MZ creates the message window only when deferred map loading completes.
   // Calling isBusy beforehand reproduces the user's isClosing stack.
   Scene_Map.prototype.isMessageWindowClosing=function(){return this._messageWindow.isClosing();};
   Scene_Map.prototype.isBusy=function(){loading.busy++;return this.isMessageWindowClosing();};
   Scene_Map.prototype.isReady=function(){
    loading.reads++;
    if(loading.data&&!this._messageWindow)this._messageWindow={closing:false,isClosing(){return this.closing;}};
    return loading.data&&loading.images;
   };
   SceneManager._scene=new Scene_Map();SceneManager._sceneStarted=false;
   if(engine==='MV'){
    SceneManager.isCurrentSceneStarted=function(){return this._scene&&this._sceneStarted;};
    SceneManager.updateScene=function(){
     loading.ticks++;
     if(this._scene){if(!this._sceneStarted&&this._scene.isReady()){this._scene.start();this._sceneStarted=true;}if(this.isCurrentSceneStarted())loading.updates++;}
    };
   }else{
    delete SceneManager.isCurrentSceneStarted;
    Scene_Map.prototype.isStarted=function(){return this._started;};
    SceneManager.updateScene=function(){loading.ticks++;if(this._scene){if(this._scene.isStarted())loading.updates++;else if(this._scene.isReady())this._scene.start();}};
   }
   SceneManager.goto=function(type){this._scene=new type();this._sceneStarted=false;loading.data=false;loading.images=false;};
  },{engine,showButton});
  await page.addScriptTag({content:code});
  await check(page);
 }finally{await browser.close();}
}

test('the original 1.0.0 plugin reproduces the reported MZ isClosing crash',async()=>{
 const original=fs.readFileSync(path.resolve(__dirname,'fixtures/RPGMToolkit-1.0.0.js'),'utf8');
 await run('MZ',true,async page=>{
  await assert.rejects(page.evaluate(()=>SceneManager.updateScene()),/isClosing/);
 },original);
});

for(const engine of ['MV','MZ']){
 for(const portrait of [false,true]){
  test(`${engine}: map transfers after Toolkit initialization, portrait ${portrait?'enabled':'disabled'}`,async()=>{
   await run(engine,true,async page=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    assert.equal(await page.evaluate(()=>{loading.data=true;loading.images=true;SceneManager.updateScene();return RPGMToolkit.open();}),true);
    if(portrait){
     await page.locator('[data-action="tool-settings"]').click();
     await page.locator('[data-setting="portrait"]').check();
    }else await page.evaluate(()=>RPGMToolkit.close());
    const pending=await page.evaluate(()=>{
     SceneManager.goto(Scene_Map);loading.reads=0;loading.busy=0;
     for(let i=0;i<10;i++)SceneManager.updateScene();
     return {reads:loading.reads,busy:loading.busy,width:Graphics.width,opened:RPGMToolkit.open()};
    });
    assert.deepEqual(pending,{reads:10,busy:0,width:816,opened:false});
    assert.deepEqual(await page.evaluate(()=>{
     loading.data=true;SceneManager.updateScene();
     return {window:!!SceneManager._scene._messageWindow,busy:loading.busy,width:Graphics.width};
    }),{window:true,busy:0,width:816});
    await page.evaluate(()=>{loading.images=true;SceneManager.updateScene();SceneManager.updateScene();});
    assert.equal(await page.evaluate(()=>Graphics.width),portrait?720:816);
    // A portrait resize recreates the map scene too; it must finish loading normally.
    const second=await page.evaluate(()=>{
     SceneManager.goto(Scene_Map);loading.reads=0;loading.busy=0;
     dispatchEvent(new Event('resize'));
     for(let i=0;i<5;i++)SceneManager.updateScene();
     return {reads:loading.reads,busy:loading.busy};
    });
    assert.deepEqual(second,{reads:5,busy:0});
    assert.equal(await page.evaluate(()=>{
     loading.data=true;loading.images=true;SceneManager.updateScene();SceneManager.updateScene();
     return RPGMToolkit.open();
    }),true);
    assert.deepEqual(errors,[]);
   });
  });
 }
 test(`${engine}: delayed loading, ready/start, pause/resume and closing window`,async()=>{
  await run(engine,true,async page=>{
   const loading=await page.evaluate(()=>{
    for(let i=0;i<10;i++)SceneManager.updateScene();
    const before=window.loading.reads,opened=RPGMToolkit.open();
    return {...window.loading,opened,extraRead:window.loading.reads-before,hidden:document.querySelector('.rt-launch').hidden};
   });
   assert.equal(loading.ticks,10);assert.equal(loading.reads,10);assert.equal(loading.busy,0);assert.equal(loading.opened,false);assert.equal(loading.extraRead,0);assert.equal(loading.hidden,true);
   const partial=await page.evaluate(()=>{loading.data=true;SceneManager.updateScene();return {hasWindow:!!SceneManager._scene._messageWindow,busy:loading.busy,opened:RPGMToolkit.open()};});
   assert.equal(partial.hasWindow,true);assert.equal(partial.busy,0);assert.equal(partial.opened,false);
   assert.equal(await page.evaluate(()=>{loading.images=true;SceneManager.updateScene();SceneManager.updateScene();return !document.querySelector('.rt-launch').hidden&&RPGMToolkit.open();}),true);
   assert.equal(await page.evaluate(()=>{const before=loading.updates;SceneManager.updateScene();return loading.updates===before&&RPGMToolkit.isOpen();}),true);
   assert.equal(await page.evaluate(()=>{RPGMToolkit.close();const before=loading.updates;SceneManager.updateScene();return loading.updates>before;}),true);
   assert.equal(await page.evaluate(()=>{SceneManager._scene._messageWindow.closing=true;SceneManager.updateScene();return document.querySelector('.rt-launch').hidden&&!RPGMToolkit.open();}),true);
   assert.equal(await page.evaluate(()=>{SceneManager._scene._messageWindow.closing=false;SceneManager._scene._active=false;return !RPGMToolkit.open();}),true);
  });
 });
 test(`${engine}: F6/script opening during load is refused even with launcher disabled`,async()=>{
  await run(engine,false,async page=>{
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.keyboard.press('F6');
   assert.equal(await page.evaluate(()=>RPGMToolkit.open()),false);
   assert.equal(await page.evaluate(()=>loading.busy),0);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>{loading.data=true;loading.images=true;SceneManager.updateScene();return RPGMToolkit.open();}),true);
   assert.equal(await page.evaluate(()=>{SceneManager._nextScene={};SceneManager.updateScene();return !RPGMToolkit.isOpen();}),true);
  });
 });
}

test('battle windows must be started before Toolbox checks busy state',async()=>{
 await run('MZ',true,async page=>{
  const result=await page.evaluate(()=>{
   Scene_Battle=function(){this.started=false;};Scene_Battle.prototype.isStarted=function(){return this.started;};Scene_Battle.prototype.isBusy=function(){if(!this.started)throw Error('Early battle window');return false;};
   SceneManager._scene=new Scene_Battle();const refused=!RPGMToolkit.open();SceneManager._scene.started=true;$gameParty.inBattle=()=>true;
   return {refused,opened:RPGMToolkit.open()};
  });assert.deepEqual(result,{refused:true,opened:true});
 });
});
