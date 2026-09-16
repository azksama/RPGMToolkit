var toolboxHome = true, toolboxMapToken = 0, toolboxMap = null;
function fitToolboxModal() {
    if (!root || !opened || !modalMode) return;
    var modal = $('.rt-modal'), dialog = $('.rt-modal-dialog'), content = $('.rt-modal-content');
    var css = g.getComputedStyle(modal), available = root.clientHeight - parseFloat(css.paddingTop || 0) - parseFloat(css.paddingBottom || 0) - 4;
    dialog.style.maxHeight = Math.max(60, available) + 'px';
    content.style.maxHeight = Math.max(20, available - dialog.querySelector('header').offsetHeight - $('.rt-modal-status').offsetHeight - 2) + 'px';
}
function installToolboxUI() {
    var home = document.createElement('section'); home.className = 'rt-home';
    home.innerHTML = '<header class="rt-home-header">' + button('✕','tool-close','rt-close') + '<h1>Toolbox</h1><span class="rt-muted">Jeu en pause</span></header><nav class="rt-home-content" aria-label="Modes Toolbox"></nav>';
    $('.rt-panel').insertBefore(home, $('.rt-header'));
    home.querySelector('[data-action="tool-close"]').setAttribute('aria-label','Fermer le Toolkit');
    var line = $('.rt-search-line'); line.insertBefore($('[data-action="close"]'),line.firstChild);
    var back = document.createElement('button'); back.type = 'button'; back.textContent = '‹'; back.dataset.action = 'tool-home'; back.setAttribute('aria-label','Retour à Toolbox');
    line.insertBefore(back, $('.rt-search'));
    var header = $('.rt-modal-dialog > header'), modalBack = $('[data-action="modal-close"]');
    modalBack.textContent = '‹'; modalBack.setAttribute('aria-label','Retour au menu précédent');
    header.insertBefore(modalBack,header.firstChild);
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.className = 'rt-close'; close.dataset.action = 'modal-dismiss'; close.setAttribute('aria-label','Fermer la fenêtre'); header.insertBefore(close,header.firstChild);
    root.addEventListener('change', function(event) {
        guarded(function() {
            if (event.target.id === 'rt-tool-actor' || event.target.id === 'rt-tool-param') updateToolValues();
            if (event.target.id === 'rt-tool-map') loadToolMap();
        });
    });
    root.addEventListener('input', function(event) {
        if (event.target.id === 'rt-map-query') { renderToolMaps(event.target.value); loadToolMap(); }
    });
    if (g.MutationObserver) new g.MutationObserver(fitToolboxModal).observe($('.rt-modal'),{childList:true,subtree:true,characterData:true});
}
function showToolboxHome() {
    closeModal(); toolboxHome = true; root.classList.add('rt-home-open');
    var state = gameTools.state();
    var entries = [
        ['editors','Éditeurs','Variables, objets, armes, armures…'],
        ['translations','Traductions','Noms anglais · tout traduire et reprendre'],
        ['god','Godmode','HP au maximum · protection contre K.O.'],
        ['noclip','No Clip','Traverser les obstacles de la carte'],
        ['resources','HP / MP','Alliés et ennemis'],
        ['stats','Stats','Niveau, expérience et bonus permanents'],
        ['teleport','Téléportation','Choisir une carte et une position'],
        ['party','Partie','Argent et sauvegarde'],
        ['history','Historique','Annuler ou rétablir une modification'],
        ['settings','Paramètres','Langue, affichage et raccourcis']
    ];
    $('.rt-home-content').innerHTML = entries.map(function(e) {
        var toggle = e[0] === 'god' || e[0] === 'noclip';
        return '<button type="button" data-action="tool-'+e[0]+'"'+(toggle ? ' role="switch" aria-checked="'+state[e[0]]+'" aria-label="'+e[1]+'"' : '')+'><strong>'+e[1]+'</strong><span>'+e[2]+'</span>'+(toggle ? '<b class="rt-toggle-track" aria-hidden="true"></b>' : '<b aria-hidden="true">›</b>')+'</button>';
    }).join('');
    $('.rt-panel').focus();
}
function toolActorSelector(all) {
    var options = (all ? '<option value="all">Toute l’équipe</option>' : '') + gameTools.members().map(function(a) { return '<option value="'+a.actorId()+'">'+esc(a.name())+'</option>'; }).join('');
    if (all && gameTools.enemies().length) options += '<optgroup label="Ennemis"><option value="enemies">Tous les ennemis</option>'+gameTools.enemies().map(function(a,i){return '<option value="enemy:'+i+'">'+(i+1)+' · '+esc(a.name())+'</option>';}).join('')+'</optgroup>';
    return '<label class="rt-field"><span>Cible</span><select id="rt-tool-actor">'+options+'</select></label>';
}
function quickActions(param) {
    return '<div class="rt-actions rt-stat-quick">'+[['zero','0'],['add','+1000'],['subtract','−1000']].map(function(a){return '<button type="button" data-action="tool-quick" data-param="'+param+'" data-adjust="'+a[0]+'">'+a[1]+'</button>';}).join('')+'</div>';
}
function toolPage(mode) {
    var titles = {resources:'HP / MP',stats:'Stats',teleport:'Téléportation'};
    openModal(mode,titles[mode]); var html = '';
    if (mode === 'resources') html = '<form data-form="tool-resources">'+toolActorSelector(true)+'<p id="rt-tool-summary" class="rt-muted"></p>'+field('HP','rt-tool-hp',0,'number','min="0" step="1" required')+quickActions('hp')+field('MP','rt-tool-mp',0,'number','min="0" step="1" required')+quickActions('mp')+field('TP','rt-tool-tp',0,'number','min="0" step="1" required')+'<div class="rt-actions"><button type="submit" class="rt-primary">Appliquer</button>'+button('Tout restaurer','tool-heal')+'</div></form>';
    if (mode === 'stats') html = '<form data-form="tool-stats">'+toolActorSelector(false)+'<label class="rt-field"><span>Statistique</span><select id="rt-tool-param"><option value="level">Niveau</option><option value="exp">Expérience totale</option>'+['HP max','MP max','Attaque','Défense','Attaque magique','Défense magique','Agilité','Chance'].map(function(n,i){return '<option value="'+i+'">Bonus · '+n+'</option>';}).join('')+'</select></label><p id="rt-tool-summary" class="rt-muted"></p>'+field('Valeur','rt-tool-value',0,'number','step="1" required')+quickActions('stat')+'<button type="submit" class="rt-primary">Appliquer</button></form>';
    if (mode === 'teleport') html = '<form data-form="tool-teleport">'+field('Rechercher une carte · nom ou ID','rt-map-query','','search','autocomplete="off"')+'<label class="rt-field"><span>Carte</span><select id="rt-tool-map"></select></label><p id="rt-map-summary" role="status"></p><div class="rt-coordinate-fields">'+field('X','rt-map-x',0,'number','min="0" step="1" required')+field('Y','rt-map-y',0,'number','min="0" step="1" required')+'</div><label class="rt-field"><span>Direction</span><select id="rt-map-direction"><option value="0">Conserver</option><option value="2">Bas</option><option value="4">Gauche</option><option value="6">Droite</option><option value="8">Haut</option></select></label><button id="rt-map-go" type="submit" class="rt-primary" disabled>Se téléporter</button></form>';
    $('.rt-modal-content').innerHTML = html;
    if (mode === 'resources' || mode === 'stats') updateToolValues();
    if (mode === 'teleport') { renderToolMaps(''); $('#rt-tool-map').value = String(g.$gameMap.mapId()); if (!$('#rt-tool-map').value) $('#rt-tool-map').selectedIndex = 0; loadToolMap(); }
}
function updateToolValues() {
    var id = $('#rt-tool-actor').value, actors = modalMode === 'resources' ? gameTools.resourceTargets(id) : gameTools.members().filter(function(a){return String(a.actorId()) === id;}), a = actors[0];
    if (!a) { $('#rt-tool-summary').textContent = 'Aucun acteur dans l’équipe.'; return; }
    if (modalMode === 'resources') {
        var maxHp = Math.min.apply(null,actors.map(function(a){return a.mhp;})), maxMp = Math.min.apply(null,actors.map(function(a){return a.mmp;})), maxTp = Math.min.apply(null,actors.map(function(a){return a.maxTp();}));
        $('#rt-tool-hp').max = maxHp; $('#rt-tool-mp').max = maxMp; $('#rt-tool-tp').max = maxTp;
        $('#rt-tool-hp').value = Math.min(a.hp,maxHp); $('#rt-tool-mp').value = Math.min(a.mp,maxMp); $('#rt-tool-tp').value = Math.min(a.tp,maxTp);
        $('#rt-tool-summary').textContent = actors.length > 1 ? actors.length+' cibles' : 'HP '+a.hp+'/'+a.mhp+' · MP '+a.mp+'/'+a.mmp;
    } else {
        var param = $('#rt-tool-param').value;
        $('#rt-tool-value').min = param === 'level' ? 1 : param === 'exp' ? 0 : -999999;
        $('#rt-tool-value').max = param === 'level' ? a.maxLevel() : param === 'exp' ? 999999999 : 999999;
        $('#rt-tool-value').value = param === 'level' ? a.level : param === 'exp' ? a.currentExp() : a._paramPlus[Number(param)] || 0;
        $('#rt-tool-summary').textContent = param === 'level' || param === 'exp' ? '' : 'Total : '+a.param(Number(param));
    }
}
function renderToolMaps(query) { $('#rt-tool-map').innerHTML = gameTools.maps(query).map(function(m){return '<option value="'+m.id+'">#'+m.id+' · '+esc(m.name)+'</option>';}).join(''); }
function loadToolMap() {
    var token = ++toolboxMapToken; toolboxMap = null; $('#rt-map-go').disabled = true;
    var id = $('#rt-tool-map').value;
    $('#rt-map-summary').textContent = id ? 'Lecture de la carte…' : 'Aucune carte. Affinez la recherche (200 résultats maximum).';
    if (!id) return;
    gameTools.loadMap(id).then(function(map) {
        if (!opened || modalMode !== 'teleport' || token !== toolboxMapToken) return;
        toolboxMap = map; $('#rt-map-summary').textContent = map.width+' × '+map.height+' cases';
        $('#rt-map-x').max = map.width-1; $('#rt-map-y').max = map.height-1;
        $('#rt-map-x').value = map.id === g.$gameMap.mapId() ? g.$gamePlayer.x : 0;
        $('#rt-map-y').value = map.id === g.$gameMap.mapId() ? g.$gamePlayer.y : 0;
        $('#rt-map-go').disabled = false;
    }).catch(function(e){if (opened && modalMode === 'teleport' && token === toolboxMapToken) say(e.message,true);});
}
function toolboxAction(action, node) {
    if (action.indexOf('tool-') !== 0) return false;
    var mode = action.slice(5);
    if (mode === 'close') closeToolkit();
    else if (mode === 'god' || mode === 'noclip') { if (mode === 'god') gameTools.setGod(!gameTools.state().god); else gameTools.setNoclip(!gameTools.state().noclip); node.setAttribute('aria-checked', String(gameTools.state()[mode])); }
    else if (mode === 'home') showToolboxHome();
    else if (mode === 'editors') { toolboxHome = false; root.classList.remove('rt-home-open'); render(); $('.rt-panel').focus(); }
    else if (mode === 'settings') renderSettings();
    else if (mode === 'quick') { var param=node.getAttribute('data-param'), adjust=node.getAttribute('data-adjust'), target=$('#rt-tool-actor').value; if (param === 'stat') gameTools.adjustStat(target,$('#rt-tool-param').value,adjust); else gameTools.adjustResource(target,param,adjust); dirty=true; updateToolValues(); }
    else if (mode === 'translations') { if (!translator.busy()) { translationScope = 'all'; pendingTranslations = []; } openModal('translations','Traductions'); renderTranslations(); }
    else if (mode === 'party') { openModal('party','Partie'); renderParty(); }
    else if (mode === 'history') { openModal('history','Historique'); renderHistory(); }
    else if (mode === 'heal') { gameTools.resources($('#rt-tool-actor').value,0,0,0,true); dirty=true;updateToolValues();say('HP, MP et TP restaurés.'); }
    else toolPage(mode);
    return true;
}
function toolboxSubmit(form) {
    if (form === 'tool-resources') { gameTools.resources($('#rt-tool-actor').value,$('#rt-tool-hp').value,$('#rt-tool-mp').value,$('#rt-tool-tp').value,false); dirty=true;updateToolValues();say('Ressources mises à jour.');return true; }
    if (form === 'tool-stats') { gameTools.stat($('#rt-tool-actor').value,$('#rt-tool-param').value,$('#rt-tool-value').value);dirty=true;updateToolValues();say('Statistique mise à jour.');return true; }
    if (form === 'tool-teleport') { gameTools.teleport(toolboxMap,$('#rt-map-x').value,$('#rt-map-y').value,$('#rt-map-direction').value);closeToolkit();return true; }
    return false;
}
