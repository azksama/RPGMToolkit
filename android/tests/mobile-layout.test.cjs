const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const axe=require.resolve('axe-core/axe.min.js');
async function accessible(page) {
 await page.addScriptTag({path:axe});
 const failures=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
 assert.deepEqual(failures,[]);
}
const root=path.resolve(__dirname,'../..');
test('compact mobile layouts: swipe list, inline actions, bulk editing, modals and rotation',async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const rel=url.pathname.startsWith('/plugin/')?url.pathname.slice(1):'android/dist/'+(url.pathname==='/'?'index.html':url.pathname.slice(1));
  const file=path.resolve(root,rel);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch();
 try {
  for(const [width,height] of [[320,740],[390,844],[844,390],[1280,591],[768,1024],[1024,768],[1440,900]]){
   const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    const state={game:{title:'Un très long titre de jeu — aventure et exploration',engine:'MZ',sourceName:'Mon dossier de jeu',kind:'folder',status:'installed',pluginCount:12,size:20,files:10,recoveryNeeded:false},modName:'Toolkit 1.1.0 · inclus',modBytes:76161,canExport:false};
    window.isTauri=true;
    window.__TAURI_INTERNALS__={invoke:async command=>command==='plugin:event|listen'?1:state,transformCallback:()=>1,unregisterCallback:()=>{},metadata:{currentWindow:{label:'main'}}};
   });
   await page.goto(base);await page.waitForTimeout(300);assert.deepEqual(errors,[]);assert(await page.locator('.game-card').count(),await page.locator('body').innerText());await page.locator('.operation .primary').click();
   await page.locator('dialog').waitFor({state:'visible'});
   await page.getByLabel('Le jeu est fermé').check();
   assert.equal(await page.locator('dialog .primary').isEnabled(),true);
   await accessible(page);
   await page.getByRole('button',{name:'Annuler',exact:true}).click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'installer overflow '+width);
   const nav=await page.locator('.bottom-nav').boundingBox();assert(nav.y+nav.height<=height+1);
   await page.getByRole('button',{name:'Guide',exact:true}).click();
   assert(await page.evaluate(()=>scrollY===0));
   await page.goto(base+'/plugin/demo/index.html');
   await page.getByRole('button',{name:'Ouvrir le panneau · F6'}).click();
   await page.locator('[data-action="tool-editors"]').click();
   assert.notEqual(await page.evaluate(()=>document.activeElement.id),'rt-search','touch open must not summon keyboard');
   const row=await page.locator('.rt-row').first().boundingBox();assert(row.height<=38);
   const list=await page.locator('.rt-list').boundingBox();assert(list.width>=width-2);assert(list.height>=height*.50);
   const footer=await page.locator('.rt-footer').boundingBox(),pagination=await page.locator('.rt-pagination').boundingBox();
   assert(footer.width>=width-2);assert(footer.y>=pagination.y+pagination.height-1);assert(footer.y+footer.height<=height+1);
   // A real browser touch gesture must scroll the list without moving the header.
   const cdp=await page.context().newCDPSession(page),x=Math.floor(width*.40),y=Math.floor(list.y+list.height*.8);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
   for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*18}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.waitForTimeout(100);
   assert(await page.locator('.rt-list').evaluate(el=>el.scrollTop>20),'vertical swipe '+width);
   assert((await page.locator('.rt-header').boundingBox()).y===0);
   await page.locator('#rt-search').fill('#1');await page.waitForTimeout(160);
   await page.locator('[data-action="plus99"]').click();
   assert.equal(await page.evaluate(()=>$gameVariables.value(1)),141);
   await page.locator('[data-action="freeze"]').click();
   assert.equal(await page.evaluate(()=>{$gameVariables.setValue(1,999);return $gameVariables.value(1);}),141);
   await page.locator('[data-action="select"]').first().click();
   assert(await page.locator('.rt-modal').isVisible());
   assert.equal(await page.locator('.rt-panel').getAttribute('aria-hidden'),'true');
   await page.locator('#rt-value-type').selectOption('boolean');
   await page.locator('#rt-bool').selectOption('false');
   await page.getByRole('button',{name:'Appliquer la valeur',exact:true}).click();
   assert.equal(await page.evaluate(()=>$gameVariables._data[1]),false);
   await accessible(page);
   await page.keyboard.press('Escape');assert(await page.locator('.rt-modal').isHidden());
   await page.locator('[data-action="toggle-bool"]').click();
   assert.equal(await page.evaluate(()=>$gameVariables._data[1]),true);
   await page.locator('#rt-filter').selectOption('bool');assert.equal(await page.locator('.rt-row').count(),1);
   await page.locator('#rt-filter').selectOption('all');
   await page.locator('#rt-search').fill('id:1-2');await page.waitForTimeout(160);
   await page.locator('#rt-select-page').check();
   await page.getByRole('button',{name:'Valeur',exact:true}).click();
   await page.locator('#rt-value').fill('75');
   await page.getByRole('button',{name:'Appliquer à la sélection'}).click();
   assert.deepEqual(await page.evaluate(()=>[$gameVariables.value(1),$gameVariables.value(2)]),[75,75]);
   await page.getByRole('button',{name:'Figer',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>{$gameVariables.setValue(1,1);$gameVariables.setValue(2,2);return [$gameVariables.value(1),$gameVariables.value(2)];}),[75,75]);
   await page.getByRole('button',{name:'Libérer',exact:true}).click();
   await page.getByRole('button',{name:'Effacer la sélection'}).click();
   await page.locator('#rt-search').fill('');await page.waitForTimeout(160);
   await page.locator('[data-check-index="0"]').check();
   await page.getByRole('button',{name:'Page suivante'}).click();assert.equal(await page.locator('#rt-page-number').inputValue(),'2');
   await page.locator('[data-check-index="60"]').check();
   assert.equal(await page.locator('#rt-selection-count').textContent(),'2 sélectionné(s)');
   await page.getByRole('button',{name:'Valeur',exact:true}).click();await page.locator('#rt-value').fill('18');
   await page.getByRole('button',{name:'Appliquer à la sélection'}).click();
   assert.deepEqual(await page.evaluate(()=>[$gameVariables.value(1),$gameVariables.value(61)]),[18,18]);
   await page.getByRole('button',{name:'Effacer la sélection'}).click();
   await page.locator('#rt-page-number').fill('1');await page.locator('#rt-page-number').press('Enter');await page.locator('#rt-search').focus();
   await page.locator('#rt-category').selectOption('items');
   await page.locator('[data-action="plus99"]').first().click();assert.equal(await page.evaluate(()=>$gameParty.numItems($dataItems[1])),99);
   await page.locator('#rt-category').selectOption('variables');
   await page.locator('[data-action="select"]').first().click();
   await page.setViewportSize({width:390,height:300});await page.waitForTimeout(80);
   assert((await page.locator('.rt-modal-dialog').boundingBox()).height<=300);
   await page.setViewportSize({width,height});await page.waitForTimeout(80);
   await page.getByRole('button',{name:'Retour au menu précédent'}).click();
   assert(await page.evaluate(()=>document.querySelector('.rt-panel').scrollWidth<=innerWidth+1),'mod overflow '+width);
   await accessible(page);
   assert.deepEqual(errors,[]);
   if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,`mod-${width}.png`)});}
   // Translation remains a modal; local alias changes appear on returning to the list.
   await page.locator('#rt-search').fill('#1');await page.waitForTimeout(160);
   await page.locator('[data-action="select"]').first().click();
   await page.locator('#rt-alias').fill('Progress');await page.getByRole('button',{name:'Enregistrer le nom'}).click();
   await page.getByRole('button',{name:'Retour au menu précédent'}).click();assert.equal(await page.locator('.rt-row-title').textContent(),'Progress');
   await page.getByRole('button',{name:'Traduction',exact:true}).click();assert(await page.locator('.rt-modal').isVisible());
   await page.getByRole('button',{name:'Retour au menu précédent'}).click();
   await page.evaluate(()=>{$gameSystem.isSaveEnabled=()=>false;});
   await page.getByRole('button',{name:'Enregistrer',exact:true}).click();assert(await page.evaluate(()=>RPGMToolkit.isOpen()));
   await page.evaluate(()=>{$gameSystem.isSaveEnabled=()=>true;});
   await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
   assert(await page.evaluate(()=>!RPGMToolkit.isOpen() && SceneManager._nextScene instanceof Scene_Save));
   assert.deepEqual(errors,[]);
   if(process.env.RPGM_SCREENSHOTS){await page.goto(base);await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,`installer-${width}.png`),fullPage:true});}
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
