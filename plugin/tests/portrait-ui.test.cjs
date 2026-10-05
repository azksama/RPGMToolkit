const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const renderer=`
window.Graphics={width:816,height:624,boxWidth:816,boxHeight:624,_stretchEnabled:false,
 resize:function(w,h){this.width=w;this.height=h;this._updateAllElements();},
 _updateAllElements:function(){var c=document.getElementById('game');c.width=this.width;c.height=this.height;var scale=Math.min(innerWidth/this.width,innerHeight/this.height);this._realScale=scale;c.style.width=this.width*scale+'px';c.style.height=this.height*scale+'px';c.style.left=(innerWidth-this.width*scale)/2+'px';c.style.top=(innerHeight-this.height*scale)/2+'px';var ctx=c.getContext('2d');ctx.fillStyle='#202c43';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#46607c';for(var x=0;x<c.width;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke();}for(var y=0;y<c.height;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke();}ctx.fillStyle='#efb569';ctx.fillRect(c.width/2-12,c.height/2-18,24,36);},
 pageToCanvasX:function(x){return (x-document.getElementById('game').offsetLeft)/this._realScale;}};
SceneManager.goto=function(type){this._scene=new type();this._sceneStarted=true;};
$gamePlayer.center=function(x,y){window.centered=[x,y];};
Graphics._updateAllElements();
`;
for(const legacy of [false,true])test((legacy?'legacy mobile viewport: ':'')+'portrait control resizes the rendered game, persists, follows tall screens and restores landscape',async()=>{
 const base=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  if(req.url==='/portrait'){
   res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="'+(legacy?'width=1280':'width=device-width,initial-scale=1')+'"><title>Portrait fixture</title><style>body{margin:0;background:#000}canvas{position:fixed}</style><canvas id="game"></canvas><span id="ticks" hidden></span><script src="/demo/fixture.js"></script><script>'+renderer+'</script><script src="/RPGMToolkit.js"></script></html>');return;
  }
  const file=path.resolve(base,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:360,height:640},isMobile:legacy,hasTouch:legacy}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/portrait');
  await page.locator('.rt-launch').click();await page.locator('[data-action="tool-settings"]').click();
  await page.locator('[data-setting="portrait"]').check();
  await page.waitForFunction(()=>Graphics.width===720&&Graphics.height===1280&&!RPGMToolkit.isOpen());
  let box=await page.locator('#game').boundingBox();assert.deepEqual(box,{x:0,y:0,width:360,height:640});
  assert.equal(await page.evaluate(()=>Graphics.pageToCanvasX(180)),360);assert.deepEqual(await page.evaluate(()=>[$gamePlayer.x,$gamePlayer.y]),[12,8]);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>Graphics.height===1558);
  box=await page.locator('#game').boundingBox();assert(box.width>389&&box.height>843);
  await page.reload();await page.waitForFunction(()=>Graphics.width===720&&Graphics.height===1558);
  if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'portrait-canvas.png')});}
  await page.locator('.rt-launch').click();
  assert(await page.locator('.rt-home-content strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=14));
  if(process.env.RPGM_SCREENSHOTS)await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,legacy?'portrait-home-legacy.png':'portrait-home.png')});
  await page.locator('[data-action="tool-editors"]').click();
  assert(await page.locator('.rt-row-title').first().evaluate(el=>el.getBoundingClientRect().width>15));
  if(process.env.RPGM_SCREENSHOTS)await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,legacy?'portrait-editor-legacy.png':'portrait-editor.png')});
  await page.locator('[data-action="tool-home"]').click();
  await page.locator('[data-action="tool-settings"]').click();
  assert(await page.locator('[data-setting="portrait"]').isChecked());
  assert.equal(await page.evaluate(()=>Math.round(visualViewport.width)),390);
  assert(await page.locator('.rt-modal-dialog').evaluate(el=>el.getBoundingClientRect().width<=390));
  assert(await page.locator('[data-setting="portraitPictures"]').isChecked());await page.locator('[data-setting="portrait"]').uncheck();
  await page.waitForFunction(()=>Graphics.width===816&&Graphics.height===624&&!RPGMToolkit.isOpen());
  assert.equal(await page.locator('meta[name=viewport]').getAttribute('content'),legacy?'width=1280':'width=device-width,initial-scale=1');
  await page.reload();await page.waitForFunction(()=>window._ticks>2);assert.equal(await page.evaluate(()=>Graphics.width),816);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
