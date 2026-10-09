(function (g) {
    'use strict';
    var boot = JSON.parse(g.WolfNative.bootstrap());
    var catalogue = boot.catalog, refs = Object.create(null), values = Object.create(null), locks = Object.create(null);
    var api, visible = [], queue = [], flight = null, sequence = 0, flushTimer, active = false, connected = false, profilePageIndex = 0;
    var state = { noclip: false, locks: 0, position: null }, godOwned = [], godActive = false, profileKey = 'wolf-profile-v1:' + boot.project;
    var profile = { format: 'wolf-toolkit-profile-v1', project: boot.project, entries: [], pollMs: 1000 };
    var toolPages = { resources:0, stats:0 };
    var roles = { variable:'Variable', bool:'Interrupteur', item:'Objet', weapon:'Arme', armor:'Armure', hp:'HP', mp:'MP', tp:'TP', stat:'Statistique', gold:'Argent' };
    var roleKinds = { bool:'switches', item:'items', weapon:'weapons', armor:'armors', hp:'resources', mp:'resources', tp:'resources', stat:'stats', gold:'stats' };
    catalogue.forEach(function (entry, i) { entry.index = i; refs[entry.reference] = entry; });
    function own(o, key) { return Object.prototype.hasOwnProperty.call(o, key); }
    function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
    function validateProfile(data) {
        if (!data || data.format !== profile.format || data.project !== boot.project || !Array.isArray(data.entries) || data.entries.length > 20000) throw new Error('Profil WOLF incompatible.');
        var seen = Object.create(null);
        data.entries.forEach(function(p) {
            if (!p || !refs[p.reference] || !own(roles,p.role) || typeof p.label !== 'string' || p.label.length > 2000 || !/^(ally|enemy)$/.test(p.team) || typeof p.target !== 'string' || p.target.length > 100 || seen[p.reference]) throw new Error('Champ du profil invalide.');
            if (refs[p.reference].string && p.role !== 'variable') throw new Error('Un texte ne peut pas devenir un nombre.');
            if (p.maximum && (!refs[p.maximum] || refs[p.maximum].string || p.maximum === p.reference)) throw new Error('Maximum du profil invalide.');
            if (p.icon != null && (!Number.isInteger(p.icon) || p.icon < 0 || p.icon > 9999)) throw new Error('Icône invalide.');
            seen[p.reference] = true;
        });
        return { format:profile.format, project:boot.project, entries:data.entries, pollMs:[250,500,1000,2000].indexOf(data.pollMs)>=0 ? data.pollMs : 1000 };
    }
    try { var saved=g.localStorage.getItem(profileKey);if(saved)profile=validateProfile(JSON.parse(saved)); } catch(e) { /* A rejected profile does not alter game values. */ }
    function saveProfile() { g.localStorage.setItem(profileKey, JSON.stringify(profile)); }
    function rebuild() {
        host.entries = {};
        host.kinds.forEach(function(kind) { host.entries[kind]=[]; });
        catalogue.forEach(function(entry) {
            var kind=entry.reference>=1100000000 ? 'database' : entry.string ? 'strings' : 'variables';
            host.entries[kind].push(entry);
        });
        profile.entries.forEach(function(p) {
            if(p.role==='variable')return;
            var original=refs[p.reference], entry=Object.assign({},original,{name:p.label || original.name,profile:p,boolean:p.role==='bool'});
            host.entries[roleKinds[p.role]].push(entry);
        });
    }
    function record(entry, kind) {
        kind=kind || (entry.reference>=1100000000?'database':entry.string?'strings':'variables');
        if(api && api.runtime()) {
            var current=api.runtime().list(kind).find(function(r){return r.id===entry.reference;});
            if(current)return current;
        }
        return {kind:kind,id:entry.reference,key:kind+':'+entry.reference,original:entry.name,data:entry};
    }
    function dedupe(records) { var result=[],seen=Object.create(null);records.forEach(function(r){var e=refs[r.id];if(e && !seen[e.index]){seen[e.index]=true;result.push(e);}});return result; }
    function refresh(changed) {
        if(!api)return;
        var runtime=api.runtime();
        if(runtime && changed) {
            var records=changed.map(function(e){return record(e);});
            profile.entries.forEach(function(p){if(p.role!=='variable' && changed.indexOf(refs[p.reference])>=0)records.push(record(Object.assign({},refs[p.reference],{profile:p,boolean:p.role==='bool'}),roleKinds[p.role]));});
            runtime.acceptBaseline(records);
        }
        if(!changed || changed.length)api.refresh();
        document.querySelectorAll('[data-wolf-value]').forEach(function(node){var entry=refs[Number(node.getAttribute('data-wolf-value'))];node.textContent=entry&&own(values,entry.index)?String(values[entry.index]):'…';});
        var clip=document.querySelector('[data-action="tool-noclip"]');if(clip)clip.setAttribute('aria-checked',String(state.noclip));
        var god=document.querySelector('[data-action="tool-god"]');if(god)god.setAttribute('aria-checked',String(godActive));
    }
    function message(text,error) { if(api)api.status(text,error); }
    function enqueue(ops) {
        if(queue.length+ops.length>1000)throw new Error('Trop d’opérations en attente.');
        queue=queue.concat(ops);clearTimeout(flushTimer);flushTimer=setTimeout(flush,0);
    }
    function rpc(ops) {
        return new Promise(function(resolve,reject){
            var id='wolf-'+(++sequence);flight={id:id,ops:ops,resolve:resolve,reject:reject};
            g.WolfNative.request(id,JSON.stringify(ops));
        });
    }
    function flush() {
        if(flight || !queue.length)return;
        var load=queue.findIndex(function(op){return op.action===8;});
        var ops=queue.splice(0,load===0?1:load>0?Math.min(128,load):128), changes=ops.some(function(op){return op.action!==0;});
        if(changes)message('En cours…');
        rpc(ops).then(function(result) {
            if(result.saveFile){message(result.saveFile);if(document.getElementById('wolf-saves'))savePage();}
            else if(ops[0].action===8){if(result.loadComplete!==true)throw new Error('Chargement non confirmé.');values=Object.create(null);locks=Object.create(null);godOwned=[];godActive=false;connected=false;host.session={};api.history();refresh();setTimeout(function(){read(visible);},500);message('Sauvegarde chargée.');}
            else if(changes)message('Appliqué.');
        }).catch(function(error) {
            var wasConnected=connected;
            connected=false;
            if(changes){queue=[];values=Object.create(null);locks=Object.create(null);godOwned=[];godActive=false;if(api)api.history();}
            message(error.message,true);if(changes || wasConnected)refresh();
        }).finally(function(){flush();});
    }
    function read(entries) {
        var ids=entries.map(function(e){return e.index;});
        if(!ids.length)ids=[-1];
        var waiting=flight ? flight.ops.map(function(op){return op.index;}) : [];
        ids.filter(function(id){return waiting.indexOf(id)<0 && !queue.some(function(op){return op.index===id;});}).forEach(function(id){enqueue([{index:id,action:0}]);});
    }
    function value(r) {
        var e=refs[r.id];if(!e || !own(values,e.index))return undefined;
        return r.data && r.data.boolean ? !!values[e.index] : values[e.index];
    }
    function validate(r,next) {
        var e=refs[r.id];if(!e || !connected || !own(values,e.index))throw new Error('Attendez la lecture du jeu.');
        if(e.string) { if(typeof next!=='string' || next.length>10000 || next.indexOf('\0')>=0)throw new Error('Texte invalide.');return next; }
        if(typeof next==='boolean')next=next?1:0;
        if(typeof next!=='number' || !Number.isInteger(next) || Math.abs(next)>2000000000)throw new Error('Un entier entre −2 000 000 000 et 2 000 000 000 est requis.');
        if(/^(items|weapons|armors)$/.test(r.kind) && next<0)throw new Error('Quantité négative interdite.');
        if(r.data && r.data.boolean)return !!next;
        return next;
    }
    function write(r,next) {
        var e=refs[r.id], nativeValue=typeof next==='boolean'?(next?1:0):next;
        enqueue([{index:e.index,action:e.string?2:1,value:nativeValue}]);values[e.index]=nativeValue;
    }
    function profilePage(r) {
        var reference=r?r.id:0, existing=profile.entries.find(function(p){return p.reference===reference;});
        api.modal('wolf-profile','Profil');
        if(!reference) {
            profilePageIndex=Math.max(0,Math.min(profilePageIndex,Math.ceil(profile.entries.length/100)-1));
            api.content('<div class="rt-actions"><button data-action="tool-editors">Éditeurs</button><button data-action="wolf-export-profile">Exporter</button></div><label class="rt-field"><span>Importer JSON</span><input id="wolf-import-profile" type="file" accept="application/json,.json"></label><label class="rt-field"><span>Actualisation</span><select id="wolf-poll">'+[250,500,1000,2000].map(function(n){return '<option value="'+n+'"'+(profile.pollMs===n?' selected':'')+'>'+n+' ms</option>';}).join('')+'</select></label><ul class="wolf-profile-list">'+profile.entries.slice(profilePageIndex*100,(profilePageIndex+1)*100).map(function(p){return '<li><span data-game-text>'+escape(p.label || refs[p.reference].name)+' · '+roles[p.role]+'</span><button data-action="wolf-profile-ref" data-ref="'+p.reference+'">✎</button><button data-action="wolf-profile-remove" data-ref="'+p.reference+'">×</button></li>';}).join('')+'</ul><div class="rt-actions"><button data-action="wolf-profile-prev"'+(profilePageIndex===0?' disabled':'')+' aria-label="Page précédente">‹</button><span>'+(profilePageIndex+1)+' / '+Math.max(1,Math.ceil(profile.entries.length/100))+'</span><button data-action="wolf-profile-next"'+((profilePageIndex+1)*100>=profile.entries.length?' disabled':'')+' aria-label="Page suivante">›</button></div>');return;
        }
        var p=existing || {reference:reference,role:'variable',label:refs[reference].name,team:'ally',target:refs[reference].name.split(' / ')[0],maximum:0,icon:null};
        api.content('<form data-form="wolf-profile"><input id="wolf-reference" type="hidden" value="'+reference+'"><label class="rt-field"><span>Rôle</span><select id="wolf-role">'+Object.keys(roles).filter(function(role){return !refs[reference].string || role==='variable';}).map(function(role){return '<option value="'+role+'"'+(p.role===role?' selected':'')+'>'+roles[role]+'</option>';}).join('')+'</select></label><label class="rt-field"><span>Nom</span><input id="wolf-label" maxlength="2000" value="'+escape(p.label)+'"></label><label class="rt-field"><span>Cible</span><input id="wolf-target" maxlength="100" value="'+escape(p.target)+'"></label><label class="rt-field"><span>Équipe</span><select id="wolf-team"><option value="ally">Alliés</option><option value="enemy"'+(p.team==='enemy'?' selected':'')+'>Ennemis</option></select></label><label class="rt-field"><span>ID du maximum</span><input id="wolf-maximum" type="number" inputmode="numeric" value="'+(p.maximum||0)+'" min="0"></label><label class="rt-field"><span>Icône</span><input id="wolf-icon" type="number" inputmode="numeric" min="0" max="9999" value="'+(p.icon==null?'':p.icon)+'"></label><button type="submit" class="rt-primary">Enregistrer</button></form>');
    }
    function toolsPage(mode) {
        var all=profile.entries.filter(function(p){return mode==='resources'?/^(hp|mp|tp)$/.test(p.role):/^(stat|gold)$/.test(p.role);});
        var pages=Math.max(1,Math.ceil(all.length/100));toolPages[mode]=Math.max(0,Math.min(toolPages[mode],pages-1));
        var entries=all.slice(toolPages[mode]*100,(toolPages[mode]+1)*100);
        api.modal('wolf-'+mode,mode==='resources'?'HP / MP':'Stats');
        api.content('<div class="rt-actions"><button data-action="wolf-profile-ref">Profil</button></div>'+(entries.length?'<ul class="wolf-profile-list">'+entries.map(function(p){return '<li><div><strong>'+escape(p.target || p.label)+'</strong><span>'+escape(roles[p.role])+' · '+escape(p.team==='enemy'?'Ennemis':'Alliés')+'</span></div><b data-wolf-value="'+p.reference+'">…</b><div class="rt-actions">'+[['zero','0'],['add','+1000'],['subtract','−1000']].map(function(a){return '<button data-action="wolf-adjust" data-ref="'+p.reference+'" data-adjust="'+a[0]+'">'+a[1]+'</button>';}).join('')+'<button data-action="wolf-edit" data-ref="'+p.reference+'">✎</button></div></li>';}).join('')+'</ul>':'<div class="rt-empty">Aucun champ associé.</div>'));
        if(pages>1)document.querySelector('.rt-modal-content').insertAdjacentHTML('beforeend','<div class="rt-actions"><button data-action="wolf-tool-page" data-mode="'+mode+'" data-step="-1"'+(toolPages[mode]===0?' disabled':'')+' aria-label="Page précédente">‹</button><span>'+(toolPages[mode]+1)+' / '+pages+'</span><button data-action="wolf-tool-page" data-mode="'+mode+'" data-step="1"'+(toolPages[mode]===pages-1?' disabled':'')+' aria-label="Page suivante">›</button></div>');
        visible=entries.map(function(p){return refs[p.reference];});read(visible);refresh();
    }
    function savePage() {
        var saves=JSON.parse(g.WolfNative.saves());
        api.modal('wolf-save','Sauvegarde');
        api.content('<div class="rt-actions"><button class="rt-primary" data-action="wolf-save">Enregistrer</button></div><label class="rt-field"><span>Sauvegardes Toolkit</span><select id="wolf-saves">'+saves.map(function(s){return '<option value="'+escape(s.name)+'">'+escape(s.date?new Date(s.date).toLocaleString()+' · '+s.name:s.name)+'</option>';}).join('')+'</select></label><button data-action="wolf-load"'+(saves.length?'':' disabled')+'>Charger la sauvegarde</button>');
    }
    function god() {
        var runtime=api.runtime();
        if(godActive) {if(godOwned.length)runtime.freezeMany(godOwned,false);godOwned=[];godActive=false;refresh();return;}
        var hp=profile.entries.filter(function(p){return p.role==='hp' && p.team==='ally';});
        if(!hp.length)throw new Error('Associez les HP des alliés dans le profil.');
        if(hp.length>500)throw new Error('Maximum : 500 valeurs figées simultanément.');
        var records=hp.map(function(p){return record(refs[p.reference]);});
        var missing=hp.map(function(p){return refs[p.reference];}).concat(hp.filter(function(p){return p.maximum;}).map(function(p){return refs[p.maximum];})).filter(function(e){return !own(values,e.index);});
        if(missing.length){read(missing);throw new Error('Lecture des HP en cours.');}
        records.forEach(function(r){validate(r,value(r));});
        var owned=records.filter(function(r){return !locks[refs[r.id].index];});
        if(host.frozenCount()+owned.length>500)throw new Error('Maximum : 500 valeurs figées simultanément.');
        if(queue.length+records.length*2>1000)throw new Error('Trop d’opérations en attente.');
        hp.forEach(function(p,i){if(p.maximum)runtime.setValue(records[i],Math.max(0,values[refs[p.maximum].index]));});
        godOwned=owned;runtime.freezeMany(records,true);godActive=true;refresh();
    }
    var host=g.ToolkitHost={
        projectId:boot.project,session:{},kinds:['variables','strings','database','switches','items','weapons','armors','resources','stats'],entries:{},
        isConnected:function(){return true;},known:function(r){return !!refs[r.id] && own(values,refs[r.id].index);},
        value:value,validate:validate,write:write,editable:function(r){return connected && host.known(r);},
        frozen:function(r){return !!(refs[r.id] && locks[refs[r.id].index]);},frozenCount:function(){return Math.max(state.locks,Object.keys(locks).filter(function(k){return locks[k];}).length);},
        freeze:function(records,enabled){var entries=dedupe(records);enqueue(entries.map(function(e){return {index:e.index,action:enabled?3:4};}));entries.forEach(function(e){locks[e.index]=enabled;});},
        visible:function(records){if(document.querySelector('.rt-modal:not([hidden]) .wolf-profile-list'))return;visible=dedupe(records);if(active && !flight && !queue.length)read(visible.filter(function(e){return !own(values,e.index);}));},
        attach:function(value){api=value;},
        close:function(){active=false;visible=[];g.WolfNative.close();},
        show:function(){active=true;api.open();read(visible);},
        back:function(){g.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));g.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',bubbles:true}));},
        answer:function(answer){
            if(!flight || flight.id!==answer.id)return;
            var current=flight;flight=null;
            if(answer.error){current.reject(new Error(answer.error));return;}
            try {
                var result=answer.result;if(!result || !Array.isArray(result.results) || result.results.length!==current.ops.length)throw new Error('Réponse WOLF incorrecte.');
                var failed=false,changed=[];
                if(result.locks===0 && state.locks>0){locks=Object.create(null);godOwned=[];godActive=false;}
                result.results.forEach(function(row,i){
                    if(row.index!==current.ops[i].index)throw new Error('Réponse WOLF périmée.');
                    if(row.error){failed=true;return;}
                    if(row.index>=0){
                        if(!own(values,row.index) || values[row.index]!==row.value || !!locks[row.index]!==!!row.frozen)changed.push(catalogue[row.index]);
                        values[row.index]=row.value;locks[row.index]=!!row.frozen;
                    }
                });
                connected=true;state.noclip=!!result.noclip;state.locks=result.locks;state.position=result.position;
                refresh(changed);if(failed)throw new Error('Une opération a été refusée par WOLF.');current.resolve(result);
            }catch(e){current.reject(e);}
        },
        error:function(text){message(text,true);},
        settings:function(settings){g.WolfNative.settings(JSON.stringify(settings));},
        position:function(x,y){var runtime=api.runtime();if(!runtime)return;runtime.prefs.settings.buttonX=x;runtime.prefs.settings.buttonY=y;runtime.savePrefs();},
        tools:function(){return {state:function(){return {god:godActive,noclip:state.noclip};},tick:function(){}};},
        modes:function(entries){
            return entries.filter(function(e){return e[0]!=='teleport';}).map(function(e){if(e[0]==='god')return ['god','Godmode','HP figés suivant le profil'];if(e[0]==='stats')return ['stats','Stats','Champs associés au profil'];if(e[0]==='party')return ['party','Partie','Sauvegarde Toolkit'];return e;}).concat([['wolf-profile','Profil','Objets, ressources et stats du jeu']]);
        },
        toolAction:function(mode){
            if(mode==='wolf-profile'){profilePage(null);return true;}
            if(mode==='resources'||mode==='stats'){toolsPage(mode);return true;}
            if(mode==='god'){god();return true;}
            if(mode==='noclip'){enqueue([{index:-1,action:5,value:state.noclip?0:1}]);return true;}
            if(mode==='party'){host.action('save-menu');return true;}
            if(mode==='editors'||mode==='home')visible=[];
            return false;
        },
        action:function(action,node){
            if(action==='save-menu'){
                savePage();return true;
            }
            if(action.indexOf('wolf-')!==0)return false;
            var reference=Number(node && node.getAttribute('data-ref'));
            if(action==='wolf-profile')profilePage(api.record());
            else if(action==='wolf-profile-ref')profilePage(refs[reference]?record(refs[reference]):null);
            else if(action==='wolf-profile-prev'){profilePageIndex--;profilePage(null);}
            else if(action==='wolf-profile-next'){profilePageIndex++;profilePage(null);}
            else if(action==='wolf-profile-remove'){profile.entries=profile.entries.filter(function(p){return p.reference!==reference;});saveProfile();rebuild();api.render();profilePage(null);}
            else if(action==='wolf-export-profile')g.WolfNative.exportJson('WOLF-Toolkit-profile.json',JSON.stringify(profile,null,2));
            else if(action==='wolf-edit')api.edit(record(refs[reference]));
            else if(action==='wolf-tool-page'){var mode=node.getAttribute('data-mode');toolPages[mode]+=Number(node.getAttribute('data-step'));toolsPage(mode);}
            else if(action==='wolf-adjust'){
                var r=record(refs[reference]), current=value(r), adjust=node.getAttribute('data-adjust');
                if(!host.editable(r))throw new Error('Attendez la lecture du jeu.');
                api.runtime().setValue(r,Math.max(0,Math.min(2000000000,adjust==='zero'?0:current+(adjust==='add'?1000:-1000))));refresh();
            }
            else if(action==='wolf-save'){if(!connected)throw new Error('WOLF ne répond pas.');enqueue([{index:-1,action:6}]);}
            else if(action==='wolf-load'){if(!connected)throw new Error('WOLF ne répond pas.');enqueue([{index:-1,action:8,value:document.getElementById('wolf-saves').value}]);}
            return true;
        },
        submit:function(form){
            if(form!=='wolf-profile')return false;
            function input(id){return document.getElementById(id).value;}
            var p={reference:Number(input('wolf-reference')),role:input('wolf-role'),label:input('wolf-label'),team:input('wolf-team'),target:input('wolf-target'),maximum:Number(input('wolf-maximum')),icon:input('wolf-icon')===''?null:Number(input('wolf-icon'))};
            var next=Object.assign({},profile,{entries:profile.entries.filter(function(e){return e.reference!==p.reference;}).concat([p])});profile=validateProfile(next);saveProfile();rebuild();api.render();profilePage(null);message('Profil enregistré.');return true;
        },
        exportJson:function(name,data){g.WolfNative.exportJson(name,JSON.stringify(data,null,2));},
        icon:function(r){var p=r.data && r.data.profile;return p && p.icon!=null?'https://appassets.androidplatform.net/icons/'+p.icon+'.png':'';}
    };
    rebuild();
    document.addEventListener('change',function(event){
        if(event.target.id==='wolf-poll'){profile.pollMs=Number(event.target.value);saveProfile();}
        if(event.target.id==='wolf-import-profile'){
            var file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024){message('Profil trop volumineux.',true);return;}
            var reader=new FileReader();reader.onload=function(){try{profile=validateProfile(JSON.parse(String(reader.result).replace(/^\uFEFF/,'')));saveProfile();rebuild();api.render();profilePage(null);message('Profil importé.');}catch(e){message(e.message,true);}};reader.readAsText(file);
        }
    });
    function poll(){if(active && api && !flight && !queue.length)read(visible);setTimeout(poll,profile.pollMs);}
    setTimeout(poll,profile.pollMs);
})(window);
