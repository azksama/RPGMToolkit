const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');

test('browser overlay: saved travel, safe landing, persistent controls and optional close button',async()=>{
 const base=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const file=path.resolve(base,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch();
 try{
  for(const [width,height] of [[844,390],[360,740]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/demo/index.html?count=120');
   await page.locator('.rt-launch').click();
   await page.locator('[data-action="tool-teleport"]').click();
   assert(await page.locator('[data-setting="safeTeleport"]').isChecked());
   await page.locator('#rt-place-name').fill('Temple <home>');
   await page.locator('[data-form="tool-save-place"] button').click();
   assert.match(await page.locator('#rt-places').textContent(),/Temple <home>/);
   await page.locator('#rt-map-x').fill('0');await page.locator('#rt-map-y').fill('0');
   await page.locator('#rt-map-go').click();
   await page.waitForFunction(()=>!RPGMToolkit.isOpen()&&!window._transferPending&&$gamePlayer.x===1&&$gamePlayer.y===1);
   const landing=await page.evaluate(()=>[$gamePlayer.x,$gamePlayer.y]);
   await page.locator('.rt-launch').click();await page.locator('[data-action="tool-teleport"]').click();
   assert.match(await page.locator('[data-place="last"]').textContent(),/Dernier emplacement/);
   await page.locator('[data-place="last"]').click();
   await page.waitForFunction(()=>!RPGMToolkit.isOpen()&&$gamePlayer.x===12&&$gamePlayer.y===8);
   await page.locator('.rt-launch').click();await page.locator('[data-action="tool-teleport"]').click();
   assert.match(await page.locator('[data-place="last"]').textContent(),new RegExp(landing.join(', ')));
   await page.locator('[data-action="modal-dismiss"]').click();await page.locator('[data-action="tool-settings"]').click();
   await page.locator('[data-setting="buttonX"]').fill('100');await page.locator('[data-setting="buttonY"]').fill('100');
   await page.locator('[data-setting="bottomClose"]').check();
   await page.locator('.rt-bottom-close').click();await page.waitForFunction(()=>!RPGMToolkit.isOpen());
   await page.locator('.rt-launch').waitFor({state:'visible'}); const launcher=await page.locator('.rt-launch').boundingBox();
   assert(launcher.x>width/2&&launcher.y>height/2&&launcher.x+launcher.width<=width&&launcher.y+launcher.height<=height);
   await page.reload();await page.locator('.rt-launch').click();await page.locator('[data-action="tool-teleport"]').click();
   assert.match(await page.locator('#rt-places').textContent(),/Temple <home>/);
   await page.locator('[data-action="tool-place-delete"]').click();assert.equal(await page.locator('[data-action="tool-place-delete"]').count(),0);
   await page.locator('[data-action="modal-dismiss"]').click();await page.locator('[data-action="tool-settings"]').click();
   await page.locator('[data-setting="language"]').selectOption('en');
   assert(await page.getByText('Close button at bottom left',{exact:true}).isVisible());
   await page.locator('[data-setting="bottomClose"]').uncheck();assert(await page.locator('.rt-bottom-close').isHidden());
   await page.locator('[data-setting="bottomClose"]').check();
   if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'travel-settings-'+width+'.png')});}
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
