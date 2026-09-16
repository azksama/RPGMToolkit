const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const pluginRoot=path.resolve(__dirname,'../../plugin');
async function swipe(page,selector){
 const box=await page.locator(selector).boundingBox(),cdp=await page.context().newCDPSession(page),x=Math.round(box.x+4),y=Math.round(box.y+box.height*.8),distance=Math.min(150,box.height*.65);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.round(y-distance*i/8)}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
test('Toolbox submenus, hostile touch cancellation, clipped modal panning, icons and full-game translation persistence',async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(pluginRoot,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(pluginRoot+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  for(const [width,height] of [[320,740],[844,390],[1280,591]]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true}),errors=[],requests=[];let releaseTranslations;const translationGate=new Promise(resolve=>releaseTranslations=resolve);page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.addEventListener('touchmove',e=>e.preventDefault(),{capture:true,passive:false});});
   await page.route('https://api.mymemory.translated.net/**',async route=>{const name=new URL(route.request().url()).searchParams.get('q');requests.push(name);await translationGate;await route.fulfill({json:{responseStatus:200,responseData:{translatedText:'EN '+name}}});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/demo/index.html?count=120');
   assert((await page.locator('.rt-launch').boundingBox()).x<25);
   await page.locator('.rt-launch').click();assert(await page.locator('.rt-home').isVisible());assert(await page.locator('.rt-main').isHidden());
   for(const mode of ['god','noclip']){
    const toggle=page.locator('[data-action="tool-'+mode+'"]');assert.equal(await toggle.getAttribute('role'),'switch');
    await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'true');assert(await page.locator('.rt-modal').isHidden());
    assert(await page.evaluate(()=>RPGMToolkit.isOpen()));await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');
   }
   for(const mode of ['resources','stats','teleport','party','translations']){
    await page.locator('[data-action="tool-'+mode+'"]').click();assert(await page.locator('.rt-modal').isVisible());
    const dialog=await page.locator('.rt-modal-dialog').boundingBox();assert(dialog.y>=0&&dialog.y+dialog.height<=height+1);
    if(mode==='resources'){await page.locator('[data-action="tool-heal"]').click();assert.equal(await page.evaluate(()=>$gameActors.actor(1).hp),500);}
    if(mode==='stats'){await page.locator('#rt-tool-param').selectOption('2');await page.locator('#rt-tool-value').fill('25');await page.locator('[data-form="tool-stats"] button[type="submit"]').click();assert.equal(await page.evaluate(()=>$gameActors.actor(1)._paramPlus[2]),25);}
    if(mode==='teleport')assert(await page.locator('#rt-map-go').isEnabled());
    if(mode==='translations'){
     assert.equal(await page.locator('#rt-translation-scope').inputValue(),'all');
     await swipe(page,'.rt-modal-content');assert(await page.locator('.rt-modal-content').evaluate(e=>e.scrollHeight<=e.clientHeight || e.scrollTop>10),'modal touch pan despite prevented default');
     await page.locator('.rt-modal-content').evaluate(e=>e.scrollTop=0);
     const box=await page.locator('.rt-modal-content').boundingBox();await page.mouse.move(box.x+4,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+4,box.y+box.height*.2,{steps:8});await page.mouse.up();
     assert(await page.locator('.rt-modal-content').evaluate(e=>e.scrollHeight<=e.clientHeight || e.scrollTop>10),'mouse pan');
     await page.getByRole('button',{name:'Tout traduire',exact:true}).click();
     await page.waitForFunction(()=>!document.querySelector('[data-action="translate-stop"]').disabled);
     await page.locator('[data-action="modal-dismiss"]').click();await page.locator('.rt-home [data-action="tool-close"]').click();
     assert.equal(await page.evaluate(()=>RPGMToolkit.isOpen()),false);
     releaseTranslations();await page.waitForFunction(()=>Object.keys((JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('rpgm-toolkit-v1:'))))||{aliases:{}}).aliases).length>0);
     await page.locator('.rt-launch').click();await page.locator('[data-action="tool-translations"]').click();
     await page.waitForFunction(()=>document.querySelector('[data-action="translate-stop"]').disabled);
     assert(requests.length>80,'all pages translated');assert.equal(new Set(requests).size,requests.length,'deduplicated requests');
     assert.match(await page.locator('#rt-translation-count').textContent(),/^0 nom/);
    }
    await page.getByRole('button',{name:'Retour au menu précédent'}).click();assert(await page.locator('.rt-home').isVisible());
   }
   await page.locator('[data-action="tool-editors"]').click();assert(await page.locator('.rt-main').isVisible());assert((await page.locator('[data-action="close"]').boundingBox()).x<15);
   await swipe(page,'.rt-list');assert(await page.locator('.rt-list').evaluate(e=>e.scrollTop>10));
   assert.equal(await page.locator('#rt-category option[value="translations"]').count(),0);await page.locator('#rt-category').selectOption('items');assert.equal(await page.locator('.rt-icon').count(),4);assert(await page.locator('.rt-icon').first().evaluate(e=>e.getContext('2d').getImageData(10,10,1,1).data[3]>0));
   await page.getByRole('button',{name:'Retour à Toolbox'}).click();assert(await page.locator('.rt-home').isVisible());
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id)),[]);
   if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'toolbox-'+width+'.png')});}
   const before=requests.length;await page.reload();await page.locator('.rt-launch').click();await page.locator('[data-action="tool-translations"]').click();assert.match(await page.locator('#rt-translation-count').textContent(),/^0 nom/);assert.equal(requests.length,before);assert(await page.getByRole('button',{name:'Tout traduire',exact:true}).isDisabled());
   await page.getByRole('button',{name:'Supprimer',exact:true}).click();
   assert(!await page.getByRole('button',{name:'Tout traduire',exact:true}).isDisabled());
   await page.reload();await page.locator('.rt-launch').click();await page.locator('[data-action="tool-settings"]').click();
   const rail=page.locator('.rt-modal-dialog > .rt-scrollbar');assert.equal((await rail.boundingBox()).width,24);
   const rect=await rail.boundingBox();await page.mouse.click(rect.x+12,rect.y+rect.height-10);
   assert(await page.locator('.rt-modal-content').evaluate(e=>e.scrollHeight<=e.clientHeight || e.scrollTop>0));
   if(process.env.RPGM_SCREENSHOTS){await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'settings-fr-'+width+'.png')});}
   await page.locator('[data-setting="language"]').selectOption('en');await page.waitForFunction(()=>document.querySelector('#rt-modal-title').textContent==='Settings');
   await page.locator('[data-setting="scrollbarWidth"]').selectOption('32');assert.equal((await rail.boundingBox()).width,32);
   await page.locator('[data-setting="pageSize"]').selectOption('40');await page.locator('[data-setting="fontSize"]').selectOption('15');
   await page.reload();await page.locator('.rt-launch').click();assert.equal(await page.locator('[data-action="tool-editors"] strong').textContent(),'Editors');
   await page.locator('[data-action="tool-settings"]').click();assert.equal(await page.locator('[data-setting="language"]').inputValue(),'en');assert.equal(await page.locator('[data-setting="scrollbarWidth"]').inputValue(),'32');if(process.env.RPGM_SCREENSHOTS){await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'settings-en-'+width+'.png')});}
   await page.locator('[data-setting="hotkey"]').selectOption('F7');await page.locator('[data-setting="showButton"]').uncheck();await page.evaluate(()=>RPGMToolkit.close());
   await page.reload();await page.waitForFunction(()=>window._ticks>2);assert(await page.locator('.rt-launch').isHidden());await page.keyboard.press('F7');assert(await page.evaluate(()=>RPGMToolkit.isOpen()));
   await page.locator('[data-action="tool-settings"]').click();assert.equal(await page.locator('[data-setting="hotkey"]').inputValue(),'F7');await page.locator('[data-setting="showButton"]').check();
   await page.getByRole('button',{name:'Back to previous menu'}).click();await page.locator('[data-action="tool-editors"]').click();assert.equal(await page.locator('.rt-row').count(),40);assert.equal(await page.locator('[data-action="tool-quick"]').count(),0);
   const listRail=page.locator('.rt-main > .rt-scrollbar');await listRail.focus();await page.keyboard.press('End');assert(await page.locator('.rt-list').evaluate(e=>Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight))<2));
   await page.keyboard.press('Home');const thumb=await listRail.locator('.rt-scroll-thumb').boundingBox();
   await page.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2);await page.mouse.down();await page.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2+70,{steps:6});await page.mouse.up();assert(await page.locator('.rt-list').evaluate(e=>e.scrollTop>20));
   await page.locator('.rt-list').evaluate(e=>e.scrollTop=0);await page.waitForTimeout(30);const touchThumb=await listRail.locator('.rt-scroll-thumb').boundingBox(),touchCdp=await page.context().newCDPSession(page),tx=Math.round(touchThumb.x+touchThumb.width/2),ty=Math.round(touchThumb.y+touchThumb.height/2);
   await touchCdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});await touchCdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty+60}]});await touchCdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touchCdp.detach();assert(await page.locator('.rt-list').evaluate(e=>e.scrollTop>20));

   await page.evaluate(()=>{RPGMToolkit.close();Scene_Battle=function(){};Scene_Battle.prototype.isBusy=()=>false;SceneManager._scene=new Scene_Battle();$gameParty.inBattle=()=>true;window.testEnemy={hp:2500,mhp:4000,mp:50,mmp:100,tp:0,name:()=> 'Slime',maxTp:()=>100,setHp(v){this.hp=v;},setMp(v){this.mp=v;},setTp(v){this.tp=v;}};$gameTroop={members:()=>[testEnemy]};RPGMToolkit.open();});
   await page.locator('[data-action="tool-resources"]').click();await page.locator('#rt-tool-actor').selectOption('enemy:0');
   await page.locator('[data-param="hp"][data-adjust="subtract"]').click();assert.equal(await page.evaluate(()=>testEnemy.hp),1500);
   await page.locator('[data-param="hp"][data-adjust="add"]').click();assert.equal(await page.evaluate(()=>testEnemy.hp),2500);
   await page.locator('[data-param="hp"][data-adjust="zero"]').click();assert.equal(await page.evaluate(()=>testEnemy.hp),0);
   await page.getByRole('button',{name:'Back to previous menu'}).click();await page.locator('[data-action="tool-stats"]').click();await page.locator('#rt-tool-param').selectOption('2');await page.locator('[data-param="stat"][data-adjust="zero"]').click();assert.equal(await page.evaluate(()=>$gameActors.actor(1)._paramPlus[2]),0);
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id)),[]);
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
