const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
test('library selection, adding folders, batch results, ZIP switching and mobile layouts',async()=>{
 const root=path.resolve(__dirname,'../dist');
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
 try{for(const [width,height] of [[320,740],[844,390],[768,1024],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const game=(title,status='absent')=>({title,engine:'MV',sourceName:title,kind:'folder',status,pluginCount:2,recoveryNeeded:false});
   const entry=(token,plan,status)=>({token,title:'Jeu '+token,path:'Bibliothèque/Collection avec un long nom/'+token+'/www',plan,error:plan==='blocked'?'Version MV 1.5 non prise en charge.':null,result:'',game:game('Jeu '+token,status)});
   const state={game:null,folderMode:false,games:[],scanWarnings:[],modName:'Toolkit 1.4.1 · inclus',modSha256:'a',modBytes:132512,canExport:false,resultName:'',action:''};
   let scans=0;window._calls=[];window.isTauri=true;
   window.__TAURI_INTERNALS__={transformCallback:()=>1,unregisterCallback:()=>{},invoke:async(cmd,args)=>{
    window._calls.push({cmd,args});if(cmd==='plugin:event|listen')return 1;if(cmd==='plugin:event|unlisten')return null;
    if(cmd==='scan_folders'){
     state.folderMode=true;if(!scans++)state.games=[entry('A','install','absent'),entry('B','update','installed'),entry('C','current','installed'),entry('D','blocked','absent')];
     else if(!state.games.some(g=>g.token==='E'))state.games.push(entry('E','install','absent'));
    }
    if(cmd==='remove_folder')state.games=state.games.filter(g=>g.token!==args.token);
    if(cmd==='apply_folders')state.games.forEach(g=>{if(!args.tokens.includes(g.token))return;g.result=g.token==='B'?'failed':args.uninstall?'removed':'installed';g.error=g.result==='failed'?'Écriture refusée.':null;g.plan=g.error?'blocked':args.uninstall?'install':'current';g.game.status=args.uninstall?'absent':'installed';});
    if(cmd==='select_game'){state.folderMode=false;state.game={...game('ZIP'),kind:'zip',size:1024};}
    if(args?.requestId){state.lastOperation=args.requestId;state.lastError=null;}
    return JSON.parse(JSON.stringify(state));
   }};
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Dossiers de jeux'}).click();await page.waitForFunction(()=>document.querySelectorAll('.library-list li').length===4);
  assert(await page.getByLabel('Sélectionner Jeu A',{exact:true}).isChecked());assert(await page.getByLabel('Sélectionner Jeu B',{exact:true}).isChecked());
  assert(!await page.getByLabel('Sélectionner Jeu C',{exact:true}).isChecked());assert(await page.getByLabel('Sélectionner Jeu D',{exact:true}).isDisabled());
  await page.getByRole('button',{name:'Ajouter un dossier',exact:true}).click();await page.getByRole('button',{name:'Ajouter un dossier',exact:true}).click();assert.equal(await page.locator('.library-list li').count(),5);
  await page.getByLabel('Sélectionner Jeu E',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Installer / mettre à jour (2)',exact:true}).click();
  assert.equal(await page.locator('dialog[open] .batch-review li').count(),2);assert(await page.locator('dialog[open] .primary').isDisabled());
  await page.getByLabel('Les jeux sélectionnés sont fermés').check();await page.getByRole('button',{name:'Confirmer (2)',exact:true}).click();
  await page.locator('.library-summary').waitFor();assert.match(await page.locator('.library-summary').textContent(),/1 jeu\(x\) modifié\(s\).*1 échec/);
  assert.deepEqual(await page.evaluate(()=>_calls.find(c=>c.cmd==='apply_folders').args.tokens),['A','B']);
  await page.getByLabel('Rechercher un jeu').fill('Jeu E');assert.equal(await page.locator('.library-list li').count(),1);await page.getByLabel('Rechercher un jeu').fill('');
  await page.getByRole('button',{name:'Retirer Jeu D de la liste'}).click();assert.equal(await page.locator('.library-list li').count(),4);
  await page.getByRole('button',{name:'Archive ZIP'}).click();assert(await page.locator('.folder-library').isHidden());assert(await page.locator('.game-card').isVisible());
  await page.getByRole('button',{name:'Dossiers de jeux'}).click();assert.equal(await page.locator('.library-list li').count(),4);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}})).violations.map(v=>v.id)),[]);
  if(process.env.RPGM_SCREENSHOTS){fs.mkdirSync(process.env.RPGM_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.RPGM_SCREENSHOTS,'library-'+width+'.png'),fullPage:true});}
  assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
