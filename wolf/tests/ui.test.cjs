const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const assets=path.resolve(__dirname,'../../android/src-tauri/gen/android/app/src/main/assets/wolf');
async function choose(page, id, value) {
 await page.locator('[data-wolf-select="'+id+'"]').click();
 await page.locator('.wolf-picker [data-value="'+value+'"]').click();
 assert.equal(await page.locator('#'+id).inputValue(),value);
 assert.equal(await page.locator('.wolf-picker').count(),0);
}

test('WOLF large catalogue: paged editing, profile beyond 20k and native reads limited to visible rows',async()=>{
 const server=http.createServer((req,res)=>{
  const target=path.resolve(assets,'.'+new URL(req.url,'http://local').pathname);
  if(!target.startsWith(assets+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(target));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try {
  const page=await browser.newPage({viewport:{width:393,height:852},hasTouch:true,isMobile:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const catalog=Array.from({length:100000},(_,i)=>({reference:1100000000+Math.floor(i/10)*100+i%10,name:'row-'+Math.floor(i/10)+' / '+i%10,string:i%2===1,group:'Database',alias:null}));
   localStorage.setItem('wolf-profile-v1:large',JSON.stringify({format:'wolf-toolkit-profile-v1',project:'large',pollMs:2000,entries:catalog.filter(e=>!e.string).slice(0,20001).map(e=>({reference:e.reference,role:'variable',label:'',team:'ally',target:'',maximum:0,icon:null}))}));
   window.wolfValues={};window.wolfLocks={};window.wolfCalls=[];
   window.WolfNative={bootstrap:()=>JSON.stringify({catalog,project:'large',title:'Large WOLF',version:'1.9.1'}),request:(id,text)=>{
    const ops=JSON.parse(text);wolfCalls.push(ops);
    setTimeout(()=>ToolkitHost.answer({id,result:{results:ops.map(op=>{
     if(op.action===1||op.action===2)wolfValues[op.index]=op.value;
     if(op.action===3)wolfLocks[op.index]=true;if(op.action===4)delete wolfLocks[op.index];
     return {index:op.index,error:0,frozen:wolfLocks[op.index]?1:0,value:wolfValues[op.index]??(catalog[op.index]?.string?'row-'+Math.floor(op.index/10):op.index)};
    }),locks:Object.keys(wolfLocks).length,noclip:0,position:{mapId:1,x:0,y:0,direction:2}}}),10);
   },settings:()=>{},close:()=>{},saves:()=>JSON.stringify([]),exportJson:(name,text)=>{window.wolfExport=JSON.parse(text);}};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');await page.evaluate(()=>ToolkitHost.show());
  await page.locator('[data-action="tool-wolf-profile"]').click();
  await page.locator('[data-wolf-select="wolf-poll"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.wolf-picker').count(),0);
  assert(await page.locator('.rt-modal').isVisible());
  assert.equal(await page.locator('.rt-modal-dialog').evaluate(el=>el.inert),false);
  await choose(page,'wolf-poll','500');
  await page.locator('[data-action="wolf-export-profile"]').click();
  assert.equal(await page.evaluate(()=>wolfExport.entries.length),20001);
  assert.equal(await page.evaluate(()=>wolfExport.pollMs),500);
  await page.locator('[data-action="modal-dismiss"]').click();await page.locator('[data-action="tool-editors"]:visible').click();await choose(page,'rt-category','database');
  await page.waitForFunction(()=>wolfCalls.length>0);
  assert(await page.locator('.rt-row').count()<=80);
  await page.locator('#rt-search').fill('id:1100999908');
  await page.waitForFunction(()=>document.querySelectorAll('.rt-row').length===1);
  await page.waitForFunction(()=>document.querySelector('.rt-row [data-action="plus99"]:not([disabled])'));
  await page.locator('.rt-row [data-action="plus99"]').click();await page.waitForFunction(()=>wolfValues[99998]===100097);
  await page.locator('.rt-row [data-action="freeze"]').click();await page.waitForFunction(()=>wolfLocks[99998]);
  assert(await page.evaluate(()=>wolfCalls.every(ops=>ops.length<=128) && wolfCalls.reduce((n,ops)=>n+ops.length,0)<256));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});

test('WOLF shared mobile editor: profiles, native acknowledgements, bulk actions, tools, persistence and modals',async()=>{
 const server=http.createServer((req,res)=>{
  const target=path.resolve(assets,'.'+new URL(req.url,'http://local').pathname);
  if(!target.startsWith(assets+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(target));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try {
  for(const [width,height] of [[393,852],[844,390],[320,740]]) {
   const page=await browser.newPage({viewport:{width,height},hasTouch:true,isMobile:true}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    const catalog=Array.from({length:300},(_,i)=>({reference:2000000+i,name:'Variable '+i,string:false,group:'Variables',alias:null}));
    catalog.push({reference:3000000,name:'日本語',string:true,group:'Strings',alias:null});
    catalog.push({reference:1100000000,name:'Database / HP',string:false,group:'Characters',alias:null});
    const profile={format:'wolf-toolkit-profile-v1',project:'fixture',pollMs:250,entries:[
     {reference:2000001,role:'hp',label:'HP',team:'ally',target:'Hero',maximum:2000002,icon:null},
     {reference:2000003,role:'hp',label:'Enemy HP',team:'enemy',target:'Enemy',maximum:0,icon:null},
     {reference:2000004,role:'item',label:'Potion',team:'ally',target:'Bag',maximum:0,icon:1},
     {reference:2000005,role:'bool',label:'Door',team:'ally',target:'Map',maximum:0,icon:null},
     {reference:2000006,role:'stat',label:'Attack',team:'ally',target:'Hero',maximum:0,icon:null}
    ]};
    if(!localStorage.getItem('wolf-profile-v1:fixture'))localStorage.setItem('wolf-profile-v1:fixture',JSON.stringify(profile));
    window.wolfValues={1:12,2:500,3:100,4:0,5:0,6:10,300:'日本語',301:30};window.wolfLocks={};window.wolfCalls=[];window.wolfClosed=0;window.wolfNoclip=false;
    window.WolfNative={
     bootstrap:()=>JSON.stringify({catalog,project:'fixture',title:'Test WOLF',version:'1.9.1'}),
     request:(id,text)=>{
      const ops=JSON.parse(text);wolfCalls.push(ops);
      if(window.wolfOffline){setTimeout(()=>ToolkitHost.answer({id,error:'Offline fixture'}),10);return;}
      setTimeout(()=>{
       const results=ops.map(op=>{
        if(op.action===1||op.action===2)wolfValues[op.index]=op.value;
        if(op.action===3)wolfLocks[op.index]=true;if(op.action===4)delete wolfLocks[op.index];
        if(op.index===-1 && op.action===5)window.wolfNoclip=!!op.value;
        return {index:op.index,error:0,frozen:wolfLocks[op.index]?1:0,value:op.index<0?(window.wolfNoclip?1:0):wolfValues[op.index]??0};
       });
       ToolkitHost.answer({id,result:{results,noclip:window.wolfNoclip?1:0,locks:Object.keys(wolfLocks).length,position:{mapId:1,x:5,y:5,direction:2},...(ops.some(op=>op.action===6)?{saveFile:'toolkit-save-42.sav'}:{})}});
      },10);
     },saves:()=>JSON.stringify([]),close:()=>{wolfClosed++;},settings:()=>{},exportJson:(name,text)=>{window.wolfExport={name,text};}
    };
   });
   await page.goto('http://127.0.0.1:'+server.address().port+'/index.html');
   await page.evaluate(()=>ToolkitHost.show());
   await page.locator('[data-action="tool-resources"]').click();
   await page.waitForFunction(()=>wolfCalls.some(ops=>ops.some(op=>op.index===1)));
   await page.waitForTimeout(30);
   await page.locator('[data-action="wolf-adjust"][data-ref="2000003"][data-adjust="zero"]').click();
   await page.waitForFunction(()=>wolfValues[3]===0);
   await page.locator('[data-action="wolf-adjust"][data-ref="2000001"][data-adjust="add"]').click();
   await page.waitForFunction(()=>wolfValues[1]===1012);
   await page.locator('[data-action="wolf-edit"][data-ref="2000001"]').click();
   await page.locator('#rt-value').fill('42');await page.locator('form[data-form="variable"] button[type="submit"]').click();
   await page.waitForFunction(()=>wolfValues[1]===42);
   assert.equal(await page.evaluate(()=>wolfClosed),0);
   if(await page.locator('.rt-modal').isVisible())await page.locator('[data-action="modal-dismiss"]').click();
   await page.locator('[data-action="tool-god"]').click();await page.waitForTimeout(40);
   if(await page.locator('[data-action="tool-god"]').getAttribute('aria-checked')!=='true')await page.locator('[data-action="tool-god"]').click();
   await page.waitForFunction(()=>wolfValues[1]===500 && wolfLocks[1]);
   await page.locator('[data-action="tool-god"]').click();await page.waitForFunction(()=>!wolfLocks[1]);
   await page.locator('[data-action="tool-noclip"]').click();await page.waitForFunction(()=>wolfNoclip);
   await page.locator('[data-action="tool-editors"]').click();
   await choose(page,'rt-category','items');await page.waitForTimeout(50);
   assert.equal(await page.locator('.rt-icon').count(),1);
   await page.locator('.rt-row [data-action="plus99"]').click();await page.waitForFunction(()=>wolfValues[4]===99);
   await page.locator('.rt-row [data-action="freeze"]').click();await page.waitForFunction(()=>wolfLocks[4]);
   await page.locator('.rt-row [data-action="freeze"]').click();await page.waitForFunction(()=>!wolfLocks[4]);
   await choose(page,'rt-category','switches');await page.waitForTimeout(50);
   await page.locator('.rt-row [data-action="toggle-bool"]').click();await page.waitForFunction(()=>wolfValues[5]===1);
   await choose(page,'rt-category','variables');
   await page.waitForFunction(()=>document.querySelector('.rt-row-actions .rt-quick:not([disabled])'));
   const checks=page.locator('.rt-list input[type="checkbox"]');await checks.nth(7).check();await checks.nth(8).check();
   await page.locator('[data-action="bulk-edit"]').click();await page.locator('#rt-value').fill('99');await page.locator('form[data-form="bulk"] button[type="submit"]').click();
   await page.waitForFunction(()=>wolfValues[7]===99 && wolfValues[8]===99);
   assert(await page.locator('.rt-modal').isHidden());assert.equal(await page.evaluate(()=>wolfClosed),0);
   await choose(page,'rt-category','strings');await page.waitForTimeout(40);
   await page.locator('.rt-row [data-action="select"]').last().click();
   await page.locator('#rt-value').fill('日本語\n"text"\\literal');await page.locator('form[data-form="variable"] button[type="submit"]').click();
   await page.waitForFunction(()=>wolfValues[300]==='日本語\n"text"\\literal');
   await page.locator('#rt-alias').fill('English name');await page.locator('form[data-form="alias"] button[type="submit"]').click();
   await page.locator('[data-action="modal-dismiss"]').click();
   await page.reload();await page.evaluate(()=>ToolkitHost.show());await page.locator('[data-action="tool-editors"]').click();await choose(page,'rt-category','strings');
   assert.match(await page.locator('.rt-row-title').textContent(),/English name/);
   await choose(page,'rt-category','variables');
   await page.waitForFunction(()=>ToolkitHost.editable(ToolkitHost.entries.variables[0] && {id:ToolkitHost.entries.variables[0].reference}));
   await page.evaluate(()=>{window.wolfOffline=true;});
   await page.waitForTimeout(650);
   await page.evaluate(()=>{window.wolfFirstRow=document.querySelector('.rt-row');window.wolfRequestCount=wolfCalls.length;});
   await page.waitForTimeout(750);
   assert(await page.evaluate(()=>wolfFirstRow===document.querySelector('.rt-row')),'offline reads must preserve the current rows');
   assert(await page.evaluate(()=>wolfCalls.length-wolfRequestCount<=5),'offline reads must wait for the polling interval');
   await page.evaluate(()=>{
    const list=document.querySelector('.rt-list'),rect=list.getBoundingClientRect();list.scrollTop=0;
    const point={identifier:1,target:list,clientX:rect.left+80,clientY:rect.top+150};
    list.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[new Touch(point)]}));
    list.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[new Touch({...point,clientY:rect.top+50})]}));
    list.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[]}));
   });
   assert(await page.locator('.rt-list').evaluate(el=>el.scrollTop)>50,'offline lists must still pan vertically');
   const bounds=await page.locator('.rt-panel').boundingBox();assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=width+1 && bounds.y+bounds.height<=height+1);
   assert.deepEqual(errors,[]);await page.close();
  }
 } finally {await browser.close();await new Promise(r=>server.close(r));}
});
