const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const assets=path.resolve(__dirname,'../../android/src-tauri/gen/android/app/src/main/assets/wolf');

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
     bootstrap:()=>JSON.stringify({catalog,project:'fixture',title:'Test WOLF',version:'1.9.0'}),
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
   await page.locator('#rt-category').selectOption('items');await page.waitForTimeout(50);
   assert.equal(await page.locator('.rt-icon').count(),1);
   await page.locator('.rt-row [data-action="plus99"]').click();await page.waitForFunction(()=>wolfValues[4]===99);
   await page.locator('.rt-row [data-action="freeze"]').click();await page.waitForFunction(()=>wolfLocks[4]);
   await page.locator('.rt-row [data-action="freeze"]').click();await page.waitForFunction(()=>!wolfLocks[4]);
   await page.locator('#rt-category').selectOption('switches');await page.waitForTimeout(50);
   await page.locator('.rt-row [data-action="toggle-bool"]').click();await page.waitForFunction(()=>wolfValues[5]===1);
   await page.locator('#rt-category').selectOption('variables');
   await page.waitForFunction(()=>document.querySelector('.rt-row-actions .rt-quick:not([disabled])'));
   const checks=page.locator('.rt-list input[type="checkbox"]');await checks.nth(7).check();await checks.nth(8).check();
   await page.locator('[data-action="bulk-edit"]').click();await page.locator('#rt-value').fill('99');await page.locator('form[data-form="bulk"] button[type="submit"]').click();
   await page.waitForFunction(()=>wolfValues[7]===99 && wolfValues[8]===99);
   assert(await page.locator('.rt-modal').isHidden());assert.equal(await page.evaluate(()=>wolfClosed),0);
   await page.locator('#rt-category').selectOption('strings');await page.waitForTimeout(40);
   await page.locator('.rt-row [data-action="select"]').last().click();
   await page.locator('#rt-value').fill('日本語\n"text"\\literal');await page.locator('form[data-form="variable"] button[type="submit"]').click();
   await page.waitForFunction(()=>wolfValues[300]==='日本語\n"text"\\literal');
   await page.locator('#rt-alias').fill('English name');await page.locator('form[data-form="alias"] button[type="submit"]').click();
   await page.locator('[data-action="modal-dismiss"]').click();
   await page.reload();await page.evaluate(()=>ToolkitHost.show());await page.locator('[data-action="tool-editors"]').click();await page.locator('#rt-category').selectOption('strings');
   assert.match(await page.locator('.rt-row-title').textContent(),/English name/);
   await page.locator('#rt-category').selectOption('variables');
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
