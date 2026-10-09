import {useEffect,useRef,useState} from 'react';
import {FolderPlus,RefreshCw,Trash2,X} from 'lucide-react';
import type {FolderGame,Run,State} from './types';

const plans = {install:'À installer',update:'À mettre à jour',repair:'À réparer',current:'Déjà à jour',recover:'À restaurer',blocked:'Incompatible / inaccessible'};
const results:Record<string,string> = {installed:'Installé',updated:'Mis à jour',removed:'Désinstallé',current:'Déjà à jour',absent:'Mod absent',failed:'Échec',restored:'Restauré'};
const eligible = (game:FolderGame) => !['blocked','recover'].includes(game.plan);

export function FolderLibrary({state,busy,run,onComplete,onOpenWolf}:{state:State;busy:boolean;run:Run;onOpenWolf:(token:string)=>void;onComplete:(game:string,action:string)=>void}) {
 const [selected,setSelected]=useState<Set<string>>(new Set()),[query,setQuery]=useState(''),[confirmation,setConfirmation]=useState<{tokens:string[];uninstall:boolean}|null>(null),[closed,setClosed]=useState(false),[summary,setSummary]=useState('');
 const known=useRef(new Set<string>()),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const previousKnown=known.current;
  setSelected(previous=>new Set(state.games.filter(g=>eligible(g)&&(previous.has(g.token)||(!previousKnown.has(g.token)&&g.plan!=='current'))).map(g=>g.token)));
  known.current=new Set(state.games.map(g=>g.token));
 },[state.games]);
 useEffect(()=>{if(confirmation){setClosed(false);dialog.current?.showModal();}else dialog.current?.close();},[confirmation]);
 const shown=state.games.filter(g=>(g.title+' '+g.path).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 const available=shown.filter(eligible),picked=state.games.filter(g=>selected.has(g.token)&&eligible(g));
 const toggle=(token:string)=>setSelected(old=>{const next=new Set(old);next.has(token)?next.delete(token):next.add(token);return next;});
 const all=available.length>0&&available.every(g=>selected.has(g.token));
 const confirm=(uninstall:boolean)=>setConfirmation({tokens:picked.filter(g=>!uninstall||g.game?.status!=='absent').map(g=>g.token),uninstall});
 const apply=async()=>{
  if(!confirmation)return;
  const request=confirmation;setConfirmation(null);setSummary('');
  const next=await run('apply_folders',request);
  if(!next)return;
  const processed=next.games.filter(g=>request.tokens.includes(g.token));
  const failed=processed.filter(g=>g.result==='failed').length,changed=processed.filter(g=>['installed','updated','removed'].includes(g.result));
  changed.forEach(g=>onComplete(g.title,results[g.result]));
  setSummary(`${changed.length} jeu(x) modifié(s) · ${processed.length-changed.length-failed} inchangé(s) · ${failed} échec(s)`);
 };
 return <section className="folder-library" aria-labelledby="library-title">
  <div className="library-heading"><h2 id="library-title">Jeux détectés <span>{state.games.length}</span></h2><button disabled={busy} onClick={()=>run('scan_folders')}><FolderPlus size={17}/> Ajouter un dossier</button></div>
  <div className="library-tools"><input aria-label="Rechercher un jeu" type="search" placeholder="Rechercher un jeu…" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Actualiser les jeux" disabled={busy||!state.games.length} onClick={()=>run('refresh_folders')}><RefreshCw size={18}/></button></div>
  <label className="library-select"><input type="checkbox" disabled={busy||!available.length} checked={all} onChange={()=>setSelected(old=>{const next=new Set(old);available.forEach(g=>all?next.delete(g.token):next.add(g.token));return next;})}/> Tout sélectionner <span>{picked.length} sélectionné(s)</span></label>
  <ul className="library-list" aria-label="Jeux trouvés">
   {shown.map(g=><li key={g.token} className={g.error?'library-error':''}>
    <label><input type="checkbox" checked={selected.has(g.token)} disabled={busy||!eligible(g)} onChange={()=>toggle(g.token)} aria-label={'Sélectionner '+g.title}/><span><strong>{g.title}</strong><small>{g.path}</small><span className="library-state">{g.game?.engine&&<b>{g.game.engine}</b>}{plans[g.plan]}{g.result&&<span> · {results[g.result]}</span>}</span>{g.error&&<small className="library-reason">{g.error}</small>}</span></label>
    <div>{g.game?.engine==='WOLF'&&g.plan==='current'&&<button disabled={busy} onClick={()=>onOpenWolf(g.token)}>Ouvrir l’éditeur</button>}{g.game?.recoveryNeeded&&<button disabled={busy} onClick={()=>run('recover_folder',{token:g.token})}>Restaurer</button>}<button aria-label={'Retirer '+g.title+' de la liste'} disabled={busy} onClick={()=>run('remove_folder',{token:g.token})}><X size={17}/></button></div>
   </li>)}
  </ul>
  {!shown.length&&<p className="library-empty">{query?'Aucun résultat.':'Aucun jeu détecté.'}</p>}
  {state.scanWarnings.map((warning,i)=><p className="library-warning" role="status" key={i}>{warning}</p>)}
  <button className="primary" disabled={busy||!picked.length} onClick={()=>confirm(false)}>Installer / mettre à jour ({picked.length})</button>
  <button className="uninstall" disabled={busy||!picked.some(g=>g.game?.status!=='absent')} onClick={()=>confirm(true)}><Trash2 size={17}/> Désinstaller la sélection</button>
  {summary&&<p className="library-summary" role="status">{summary}</p>}
  <dialog ref={dialog} aria-labelledby="batch-title" onCancel={()=>setConfirmation(null)}>
   <header><button aria-label="Fermer la confirmation" onClick={()=>setConfirmation(null)}><X size={18}/></button></header>
   <h2 id="batch-title">{confirmation?.uninstall?'Désinstaller':'Installer / mettre à jour'}</h2>
   <ul className="batch-review">{state.games.filter(g=>confirmation?.tokens.includes(g.token)).map(g=><li key={g.token}><strong>{g.title}</strong><small>{g.path}</small><span>{confirmation?.uninstall?'Désinstaller':plans[g.plan]}</span></li>)}</ul>
   <label className="closed-check"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/> Les jeux sélectionnés sont fermés</label>
   <button className="primary" disabled={!closed||busy} onClick={apply}>Confirmer ({confirmation?.tokens.length||0})</button>
   <button className="cancel" onClick={()=>setConfirmation(null)}>Annuler</button>
  </dialog>
 </section>;
}
