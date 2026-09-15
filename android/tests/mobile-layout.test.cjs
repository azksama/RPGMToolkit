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
test('mobile layouts: installer, confirmation, mod list/detail and rotation',async()=>{
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
  for(const [width,height] of [[320,740],[390,844],[844,390],[768,1024],[1024,768],[1440,900]]){
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
   assert.notEqual(await page.evaluate(()=>document.activeElement.id),'rt-search','touch open must not summon keyboard');
   await page.locator('.rt-select').first().click();
   assert(await page.locator('.rt-detail').isVisible());
   if(width<=800 || (width<=950 && height<=500)){
    assert.equal(await page.locator('.rt-results').isVisible(),false);
    await page.getByRole('button',{name:'‹ Retour aux résultats'}).click();
    assert(await page.locator('.rt-results').isVisible());
    await page.locator('.rt-select').first().click();
    await page.setViewportSize({width:390,height:360});
    await page.waitForTimeout(80);
    const panel=await page.locator('.rt-panel').boundingBox();assert(panel.height<=361,'keyboard viewport must fit');
    await page.setViewportSize({width,height});await page.waitForTimeout(80);
   }
   assert(await page.evaluate(()=>document.querySelector('.rt-panel').scrollWidth<=innerWidth+1),'mod overflow '+width);
   await accessible(page);
   assert.deepEqual(errors,[]);
   if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,`mod-${width}.png`)});await page.goto(base);await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,`installer-${width}.png`),fullPage:true});}
   await page.close();
  }
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
