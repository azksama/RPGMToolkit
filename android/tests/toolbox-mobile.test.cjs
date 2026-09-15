const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const pluginRoot=path.resolve(__dirname,'../../plugin');
async function swipe(page,selector){
 const box=await page.locator(selector).boundingBox(),cdp=await page.context().newCDPSession(page),x=Math.round(box.x+box.width-4),y=Math.round(box.y+box.height*.8),distance=Math.min(150,box.height*.65);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:Math.round(y-distance*i/8)}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
test('Toolbox submenus, hostile touch cancellation, clipped modal panning, icons and full-game translation persistence',async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(pluginRoot,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(pluginRoot+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{
  for(const [width,height] of [[320,740],[844,390],[1280,591]]){
   const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.addEventListener('touchmove',e=>e.preventDefault(),{capture:true,passive:false});});
   await page.route('https://api.mymemory.translated.net/**',async route=>{const name=new URL(route.request().url()).searchParams.get('q');requests.push(name);await route.fulfill({json:{responseStatus:200,responseData:{translatedText:'EN '+name}}});});
   await page.goto('http://127.0.0.1:'+server.address().port+'/demo/index.html?count=120');
   assert((await page.locator('.rt-launch').boundingBox()).x<25);
   await page.locator('.rt-launch').click();assert(await page.locator('.rt-home').isVisible());assert(await page.locator('.rt-main').isHidden());
   for(const mode of ['god','noclip','resources','stats','teleport','party','translations']){
    await page.locator('[data-action="tool-'+mode+'"]').click();assert(await page.locator('.rt-modal').isVisible());
    const dialog=await page.locator('.rt-modal-dialog').boundingBox();assert(dialog.y>=0&&dialog.y+dialog.height<=height+1);
    if(mode==='god'||mode==='noclip'){
     await page.locator('[data-action="tool-toggle-'+mode+'"]').click();assert.equal(await page.locator('[data-action="tool-toggle-'+mode+'"]').getAttribute('aria-pressed'),'true');
     await page.locator('[data-action="tool-toggle-'+mode+'"]').click();
    }
    if(mode==='resources'){await page.locator('[data-action="tool-heal"]').click();assert.equal(await page.evaluate(()=>$gameActors.actor(1).hp),500);}
    if(mode==='stats'){await page.locator('#rt-tool-param').selectOption('2');await page.locator('#rt-tool-value').fill('25');await page.locator('[data-form="tool-stats"] button[type="submit"]').click();assert.equal(await page.evaluate(()=>$gameActors.actor(1)._paramPlus[2]),25);}
    if(mode==='teleport')assert(await page.locator('#rt-map-go').isEnabled());
    if(mode==='translations'){
     assert.equal(await page.locator('#rt-translation-scope').inputValue(),'all');
     await swipe(page,'.rt-modal-content');assert(await page.locator('.rt-modal-content').evaluate(e=>e.scrollTop>10),'modal touch pan despite prevented default');
     await page.locator('.rt-modal-content').evaluate(e=>e.scrollTop=0);
     const box=await page.locator('.rt-modal-content').boundingBox();await page.mouse.move(box.x+box.width-4,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width-4,box.y+box.height*.2,{steps:8});await page.mouse.up();
     assert(await page.locator('.rt-modal-content').evaluate(e=>e.scrollTop>10),'mouse pan');
     await page.getByRole('button',{name:'Tout traduire',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-action="translate-stop"]').disabled);
     assert(requests.length>80,'all pages translated');assert.equal(new Set(requests).size,requests.length,'deduplicated requests');
     assert.match(await page.locator('#rt-translation-count').textContent(),/^0 nom/);
    }
    await page.getByRole('button',{name:'Retour au menu précédent'}).click();assert(await page.locator('.rt-home').isVisible());
   }
   await page.locator('[data-action="tool-editors"]').click();assert(await page.locator('.rt-main').isVisible());assert((await page.locator('[data-action="close"]').boundingBox()).x<15);
   await swipe(page,'.rt-list');assert(await page.locator('.rt-list').evaluate(e=>e.scrollTop>10));
   await page.locator('#rt-category').selectOption('items');assert.equal(await page.locator('.rt-icon').count(),4);assert(await page.locator('.rt-icon').first().evaluate(e=>e.getContext('2d').getImageData(10,10,1,1).data[3]>0));
   await page.getByRole('button',{name:'Retour à Toolbox'}).click();assert(await page.locator('.rt-home').isVisible());
   await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id)),[]);
   if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'toolbox-'+width+'.png')});}
   const before=requests.length;await page.reload();await page.locator('.rt-launch').click();await page.locator('[data-action="tool-translations"]').click();assert.match(await page.locator('#rt-translation-count').textContent(),/^0 nom/);assert.equal(requests.length,before);assert(await page.getByRole('button',{name:'Tout traduire',exact:true}).isDisabled());
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
