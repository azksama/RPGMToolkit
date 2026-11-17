import {useEffect,useState} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {ArrowClockwise,CloudArrowDown,DownloadSimple,CheckCircle,CircleNotch} from '@phosphor-icons/react';
import {version} from '../package.json';

type UpdateState = {automatic:boolean;wifiOnly:boolean;phase:string;version:string|null;size:number;progress:number;checked:number;error:string|null};
const initial:UpdateState = {automatic:true,wifiOnly:true,phase:'idle',version:null,size:0,progress:0,checked:0,error:null};
const phases:Record<string,string> = {idle:'Mises à jour',queued:'En attente du réseau',checking:'Recherche en cours',downloading:'Téléchargement',available:'Nouvelle version',ready:'Prête à installer',current:'Vous êtes à jour',error:'Vérification interrompue'};

export function UpdatePanel({disabled}:{disabled:boolean}) {
  const [state,setState]=useState(initial),[pending,setPending]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!isTauri())return;
    let mounted=true,polling=false;
    const refresh=async()=>{if(polling)return;polling=true;try{const value=await invoke<UpdateState>('app_update',{action:'status'});if(mounted)setState(value);}catch(e){if(mounted)setError(String(e));}finally{polling=false;}};
    void refresh();const timer=setInterval(refresh,2000);
    return()=>{mounted=false;clearInterval(timer);};
  },[]);
  async function action(action:string,options:Record<string,boolean>={}) {
    if(!isTauri()){setError('Disponible dans l’application Android.');return;}
    setPending(true);setError('');
    try{setState(await invoke<UpdateState>('app_update',{action,...options}));}
    catch(e){setError(String(e));}finally{setPending(false);}
  }
  const active=['queued','checking','downloading'].includes(state.phase),blocked=disabled||pending;
  return <section className="update-panel panel" aria-labelledby="update-title">
    <div className="section-head"><h2 id="update-title">Application</h2><span className="badge">v{version}</span></div>
    <div className="update-status"><span className="round-icon lavender">{active?<CircleNotch className="spin" size={23}/>:state.phase==='current'?<CheckCircle size={23}/>:<CloudArrowDown size={23}/>}</span><div><strong>{phases[state.phase]||'Mises à jour'}</strong><small>{state.version?`Toolkit ${state.version} · ${(state.size/1048576).toFixed(1)} Mo`:state.checked?`Vérifié le ${new Date(state.checked).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Releases GitHub officielles'}</small></div></div>
    {active&&<progress aria-label="Téléchargement de la mise à jour" max={100} value={state.phase==='downloading'?state.progress:undefined}/>}
    {(error||state.error)&&<p className="inline-error" role="alert">{error||state.error}</p>}
    <div className="update-actions">
      {state.phase==='ready'?<button className="primary" disabled={blocked} onClick={()=>action('install')}><DownloadSimple size={19}/>Installer {state.version}</button>:state.version&&!active?<button className="primary" disabled={blocked} onClick={()=>action('download')}><CloudArrowDown size={19}/>Télécharger</button>:null}
      <button className="secondary" disabled={blocked||active} onClick={()=>action('check')}><ArrowClockwise size={18}/>Vérifier</button>
    </div>
    <label className="switch-row"><span>Mises à jour automatiques</span><input role="switch" type="checkbox" checked={state.automatic} disabled={blocked} onChange={e=>action('configure',{automatic:e.target.checked})}/></label>
    <label className="switch-row"><span>Wi-Fi uniquement</span><input role="switch" type="checkbox" checked={state.wifiOnly} disabled={blocked||!state.automatic} onChange={e=>action('configure',{wifiOnly:e.target.checked})}/></label>
    <p className="caption">Téléchargement automatique. Installation confirmée par Android.</p>
  </section>;
}
