import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {FolderOpen,FileZip,ArrowUpRight,DownloadSimple,Check,CaretRight,Package,ArrowCounterClockwise,Trash,Info,CircleNotch,X,ClockCounterClockwise,ArrowLeft,SlidersHorizontal,GameController} from '@phosphor-icons/react';
import '@fontsource-variable/inter';
import {UpdatePanel} from './UpdatePanel';
import './style.css';
import {version} from '../package.json';

import type {State} from './types';
import {FolderLibrary} from './FolderLibrary';
type Entry={game:string;action:string;date:string};
const initial:State={game:null,folderMode:false,games:[],scanWarnings:[],modName:`Toolkit ${version} · inclus`,modSha256:'',modBytes:71032,canExport:false,resultName:'',action:''};
const labels={absent:'Prêt à installer',installed:'Mod installé',disabled:'Mod présent, désactivé',incomplete:'Installation à réparer'};
function bytes(n:number){return n>1024*1024*1024?(n/(1024*1024*1024)).toFixed(1)+' Go':n>1024*1024?(n/(1024*1024)).toFixed(1)+' Mo':Math.round(n/1024)+' Ko';}
function App(){
 const [updateReady,setUpdateReady]=useState<string|null>(null);
 const [state,setState]=useState<State>(initial),[busy,setBusy]=useState(false),[stage,setStage]=useState(''),[percent,setPercent]=useState(0),[notice,setNotice]=useState(''),[error,setError]=useState(false),[confirm,setConfirm]=useState<'install'|'uninstall'|null>(null),[closed,setClosed]=useState(false),[section,setSection]=useState<'install'|'settings'|'history'>('install');
 const [history,setHistory]=useState<Entry[]>(()=>{try{return JSON.parse(localStorage.getItem('rpgm-installer-history')||'[]').slice(0,30);}catch{return [];}});
 useEffect(()=>{window.scrollTo(0,0);},[section]);
 useEffect(()=>{
  if(!isTauri()||section!=='install')return;
  let active=true,polling=false;
  const refresh=async()=>{if(document.hidden||polling)return;polling=true;try{const result=await invoke<{phase:string;version:string|null}>('app_update',{action:'status'});if(active)setUpdateReady(result.phase==='ready'?result.version:null);}catch{}finally{polling=false;}};
  void refresh();const timer=setInterval(refresh,10000);document.addEventListener('visibilitychange',refresh);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[section]);
 const dialog=useRef<HTMLDialogElement>(null),working=useRef(false);
 useEffect(()=>{if(isTauri()){invoke<State>('get_state').then(setState).catch(()=>{});const cleanup=listen<{stage:string;percent:number}>('operation-progress',e=>{setStage(e.payload.stage);setPercent(e.payload.percent);});return()=>{cleanup.then(fn=>fn()).catch(()=>{});};}},[]);
 useEffect(()=>{if(confirm){setClosed(false);dialog.current?.showModal();}else dialog.current?.close();},[confirm]);
 const logEntry=(game:string,action:string)=>{const entry={game,action,date:new Date().toLocaleString('fr-FR')};setHistory(old=>{const h=[entry,...old].slice(0,30);try{localStorage.setItem('rpgm-installer-history',JSON.stringify(h));}catch{}return h;});};
 const log=(next:State,action:string)=>logEntry(next.game?.title||'Jeu',action);
 const run=async(command:string,args?:Record<string,unknown>,message?:string)=>{
  if(working.current)return null;
  if(!isTauri()){setError(true);setNotice('Le choix des fichiers est disponible dans l’APK Android. Cette page présente son interface.');return null;}
  working.current=true;setBusy(true);setNotice('');setError(false);setPercent(0);setStage(command==='select_game'||command==='scan_folders'||command==='select_mod'?'Ouverture du sélecteur…':'Traitement en cours…');
  try{
   const requestId=crypto.randomUUID();
   // A document picker can suspend the WebView. Reconcile the native result by
   // operation ID if its immediate IPC response is lost during activity resume.
   const next=await new Promise<State>((resolve,reject)=>{
    let finished=false,polling=false;
    const finish=(value:State|null,e?:unknown)=>{if(finished)return;finished=true;clearInterval(timer);if(e!==undefined)reject(e);else resolve(value!);};
    const timer=setInterval(async()=>{if(polling||finished)return;polling=true;try{const value=await invoke<State>('get_state');if(value.lastOperation===requestId){if(value.lastError)finish(null,value.lastError);else finish(value);}}catch{/* The native operation still owns the session. */}finally{polling=false;}},1500);
    invoke<State>(command,{...args,requestId}).then(value=>finish(value),e=>finish(null,e));
   });
   setState(next);if(command==='scan_folders'||command==='select_game')window.scrollTo(0,0);if(message)setNotice(message);return next;
  }
  catch(e){const text=String(e);setError(!text.includes('CANCELLED'));setNotice(text.includes('CANCELLED')?'Sélection annulée. Vous pouvez réessayer.':text);return null;}
  finally{working.current=false;setBusy(false);}
 };
 const exportZip=async()=>{const next=await run('export_result',{},'ZIP enregistré.');if(next)log(next,next.action==='uninstall'?'ZIP sans mod exporté':'ZIP avec mod exporté');};
 const apply=async()=>{const action=confirm;setConfirm(null);const next=await run('apply_mod',{uninstall:action==='uninstall'});if(next){if(next.canExport){setNotice('ZIP prêt à enregistrer.');await exportZip();}else{setNotice(action==='uninstall'?'Mod désinstallé.':'Mod installé et vérifié.');log(next,action==='uninstall'?'Mod désinstallé du dossier':'Mod installé dans le dossier');}}};
 const openWolf=async(token:string)=>{
  if(working.current)return;working.current=true;setBusy(true);setError(false);setNotice('');
  try{const result=await invoke<{permission?:boolean}>('open_wolf',{token});setNotice(result.permission?'Autorisez l’affichage par-dessus les applications.':'Ouverture de Toolbox…');}
  catch(e){setError(true);setNotice(String(e));}finally{working.current=false;setBusy(false);}
 };
 const game=state.folderMode?null:state.game;
 const rgss=!!game&&['XP','VX','VX Ace'].includes(game.engine);


 const games=state.folderMode?state.games.length:game?1:0;
 const current=state.folderMode?state.games.filter(g=>g.plan==='current').length:game?.status==='installed'?1:0;
 const pending=state.folderMode?state.games.filter(g=>['install','update','repair'].includes(g.plan)).length:game&&game.status!=='installed'?1:0;

 return <div className={"shell"+(state.folderMode&&state.games.length?" has-library":"")}>
  <header className="app-header">
   <div className="app-title"><img src="/toolkit.png" alt=""/><h1>{section==='install'?'Toolkit':section==='history'?'Activité':'Réglages'}</h1></div>
   <button className="icon-button" aria-label={section==='settings'?'Revenir aux jeux':'Réglages'} disabled={busy} onClick={()=>setSection(section==='settings'?'install':'settings')}><SlidersHorizontal size={23}/></button>
  </header>
  <main>
   {section==='install'&&<>
    {updateReady&&<button className="update-banner" disabled={busy} onClick={()=>setSection('settings')}><DownloadSimple size={21}/><span>Toolkit {updateReady} prêt à installer</span><CaretRight size={19}/></button>}
    <section className="metrics" aria-label="Bibliothèque">
     <div><span>Jeux</span><strong>{games.toLocaleString('fr-FR')}</strong></div>
     <div><span>À installer</span><strong>{pending.toLocaleString('fr-FR')}</strong></div>
     <div className="metric-current"><span>À jour</span><strong>{current.toLocaleString('fr-FR')}</strong></div>
    </section>
    <section className="panel source-section" aria-labelledby="source-title">
     <div className="section-head"><h2 id="source-title">Ajouter un jeu</h2></div>
     <div className="source-options">
      <button aria-label="Dossiers de jeux" disabled={busy} onClick={()=>run('scan_folders')}><span className="round-icon lavender"><FolderOpen size={23}/></span><span><strong>Dossiers de jeux</strong><small>Un jeu ou toute une collection</small></span><ArrowUpRight size={20}/></button>
      <button aria-label="Archive ZIP" disabled={busy} onClick={()=>run('select_game',{kind:'zip'})}><span className="round-icon peach"><FileZip size={23}/></span><span><strong>Archive ZIP</strong><small>Importer un jeu</small></span><ArrowUpRight size={20}/></button>
     </div>
    </section>
    <div className="included-mod"><span className="round-icon"><Package size={23}/></span><div><strong>{state.modName.replace(' · inclus','')}</strong><small>{state.modName.includes('· inclus')?'Mod inclus':'Mod importé'} · {bytes(state.modBytes)}</small></div><button className="icon-button" aria-label="Changer le mod" disabled={busy} onClick={()=>setSection('settings')}><CaretRight size={20}/></button></div>
    {state.folderMode?<FolderLibrary state={state} busy={busy} run={run} onComplete={logEntry} onOpenWolf={openWolf}/>:game?<>
     <section className="game-card panel" aria-label="Jeu détecté"><div className="game-top"><span className="round-icon"><GameController size={24}/></span><div><span className="badge">{game.engine}</span><h2>{game.title}</h2><p>{game.sourceName}</p></div></div><div className="game-facts"><span>{game.kind==='zip'?`ZIP · ${bytes(game.size)}`:'Dossier'}</span><span>{game.pluginCount} plugins</span><span>{labels[game.status]}</span></div></section>
     {game.recoveryNeeded?<section className="panel recovery"><h2>Restauration nécessaire</h2><button className="primary" disabled={busy} onClick={async()=>{const next=await run('recover_game',{},'Fichiers restaurés.');if(next)log(next,'Restauration après interruption');}}><ArrowCounterClockwise size={19}/>Restaurer le jeu</button></section>:<section className="operation">
      <button className="primary" disabled={busy} onClick={()=>setConfirm('install')}><DownloadSimple size={19}/>{game.status==='installed'?'Réinstaller / mettre à jour':'Installer le mod'}<ArrowUpRight size={19}/></button>
      {game.status!=='absent'&&<button className="uninstall" disabled={busy} onClick={()=>setConfirm('uninstall')}><Trash size={18}/>Désinstaller le mod</button>}
      {state.canExport&&<button className="secondary" disabled={busy} onClick={exportZip}><FileZip size={18}/>Enregistrer le ZIP prêt</button>}
     </section>}
    </>:!busy&&<section className="empty"><GameController size={32} weight="light"/><h2>Votre bibliothèque</h2><p>Ajoutez un dossier ou un ZIP pour commencer.</p><span className="engine-caption">XP · VX · VX Ace · MV · MZ · WOLF</span></section>}
   </>}
   {section==='history'&&<section className="history">
    <div className="section-head"><h2>Dernières opérations</h2><span className="badge">{history.length}</span></div>
    {history.length?<ul className="history-list">{history.map((entry,i)=><li className="panel history-entry" key={i}><span className="round-icon"><Check size={20}/></span><div><strong>{entry.game}</strong><p>{entry.action}</p><time>{entry.date}</time></div></li>)}</ul>:<div className="empty"><ClockCounterClockwise size={34} weight="light"/><h2>Aucune opération</h2><p>Vos installations apparaîtront ici.</p></div>}
   </section>}
   {section==='settings'&&<>
    <UpdatePanel disabled={busy}/>
    <section className="panel mod-section"><div className="section-head"><h2>Mod embarqué</h2><span className="badge">{state.modName.includes('· inclus')?'Inclus':'Importé'}</span></div><div className="mod-row"><span className="round-icon lavender"><Package size={22}/></span><div><strong>{state.modName.replace(' · inclus','')}</strong><small>{bytes(state.modBytes)}</small></div></div><button className="secondary" disabled={busy} onClick={()=>run('select_mod',{},'Mod importé.')}><FileZip size={18}/>Importer un ZIP du mod</button>{!state.modName.includes('· inclus')&&<button className="text-button" disabled={busy} onClick={()=>run('reset_mod',{},'Mod embarqué sélectionné.')}><ArrowCounterClockwise size={17}/>Utiliser le mod inclus</button>}</section>
    <section className="panel guide"><h2>Aide</h2>
     <details><summary>Installer et retirer le mod<CaretRight size={17}/></summary><p>Fermez le jeu, sélectionnez son dossier et confirmez l’installation. Les fichiers précédents sont conservés dans .rpgm-toolkit-backups. Un ZIP produit une nouvelle archive à extraire.</p><p>Pour actualiser le mod après une mise à jour de l’application, sélectionnez à nouveau vos jeux. Désinstaller le mod conserve vos sauvegardes et leurs modifications.</p></details>
     <details><summary>Jeux compatibles<CaretRight size={17}/></summary><p>RPG Maker XP, VX, VX Ace, MV 1.x, MZ 1.x et WOLF 2/3 avec BasicData accessible. Les archives RGSS standard sont prises en charge. Les archives WOLF protégées ne le sont pas.</p><p>ZIP : 8 Go, 100 000 fichiers et 16 Go décompressés. plugins.js : 64 Mio maximum.</p></details>
     <details><summary>JoiPlay et Winlator<CaretRight size={17}/></summary><p>Pour RPG Maker, lancez votre jeu dans JoiPlay. Ouvrez Toolbox avec le bouton du jeu ou F6. Pour WOLF, touchez Toolbox dans la bibliothèque, autorisez le menu flottant et lancez Game.exe dans Winlator.</p></details>
     <details><summary>Une installation interrompue<CaretRight size={17}/></summary><p>Sélectionnez le même dossier puis Restaurer. Conservez le dossier .rpgm-toolkit-backups jusqu’à la fin de la restauration.</p></details>
    </section><p className="app-credit">RPGM Toolkit {version} · Rust + Tauri</p>
   </>}
   {busy&&<section className="progress panel" role="status" aria-live="polite"><div><CircleNotch className="spin" size={20}/><strong>{stage}</strong>{percent>0&&<span>{Math.round(percent)} %</span>}</div><progress max={100} value={percent||undefined}/></section>}
   {notice&&<div className={'notice '+(error?'error':'')} role={error?'alert':'status'}><Info size={19}/><span>{notice}</span><button className="icon-button" aria-label="Fermer le message" onClick={()=>setNotice('')}><X size={18}/></button></div>}
  </main>
  <nav className="bottom-nav" aria-label="Navigation">
   <button aria-current={section==='install'?'page':undefined} onClick={()=>setSection('install')}><GameController size={23}/><span>Jeux</span></button>
   <button aria-current={section==='history'?'page':undefined} disabled={busy} onClick={()=>setSection('history')}><ClockCounterClockwise size={23}/><span>Activité</span></button>
   <button aria-current={section==='settings'?'page':undefined} disabled={busy} onClick={()=>setSection('settings')}><SlidersHorizontal size={23}/><span>Réglages</span></button>
  </nav>
  <dialog ref={dialog} onCancel={()=>setConfirm(null)} aria-labelledby="confirm-title"><header><button className="icon-button" aria-label="Retour" onClick={()=>setConfirm(null)}><ArrowLeft size={21}/></button><span>{game?.engine}</span></header><h2 id="confirm-title">{confirm==='uninstall'?'Retirer le Toolkit':'Installer le Toolkit'}</h2><p className="confirm-game">{game?.title}</p><div className="change-list"><div><Package size={20}/><span>{rgss?'Scripts RGSS':'RPGMToolkit.js'}</span></div><div><Check size={20}/><span>Copie de secours conservée</span></div></div>{game?.kind==='folder'&&<label className="closed-check"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/> Le jeu est fermé</label>}<button className={'primary '+(confirm==='uninstall'?'remove-primary':'')} disabled={game?.kind==='folder'&&!closed} onClick={apply}>{confirm==='uninstall'?'Désinstaller le mod':'Installer le mod'}<CaretRight size={19}/></button><button className="cancel" onClick={()=>setConfirm(null)}>Annuler</button></dialog>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
