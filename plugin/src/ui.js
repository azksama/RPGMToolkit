/* DOM overlay; no engine assets, dependencies or timers while closed. */
var toolkitParams = g.PluginManager && g.PluginManager.parameters('RPGMToolkit') || {};
var hotkey = /^(F6|F7|F10)$/.test(toolkitParams.Hotkey || '') ? toolkitParams.Hotkey : 'F6';
var pageSize = Math.max(20, Math.min(80, Number(toolkitParams.PageSize) || 60));
var gameTools, runtime, translator, root, launch, previousFocus, openScene, openVariables, searchTimer;
var opened = false, dirty = false, tab = 'variables', query = '', filter = 'all', page = 0, selected = null, found = [];
var chosenActor = '', checked = {}, modalMode = '', modalFocus = null, exactValue = '';
function picked() { return Object.keys(checked).map(function(k) { return checked[k]; }); }
var labels = { favorites: 'Favoris', variables: 'Variables', switches: 'Interrupteurs', selfSwitches: 'Interr. locaux', items: 'Objets', weapons: 'Armes', armors: 'Armures', actors: 'Acteurs', skills: 'Compétences', states: 'États', party: 'Partie', translations: 'Traductions', history: 'Historique' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(selector) { return root.querySelector(selector); }
function button(text, action, cls) { return '<button type="button" data-action="' + action + '" class="' + (cls || '') + '">' + text + '</button>'; }
function field(label, id, value, type, attrs) { return '<label class="rt-field"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (attrs || '') + '></label>'; }
function empty(title, description) { return '<div class="rt-empty"><span class="rt-empty-symbol" aria-hidden="true">◇</span><strong>' + esc(title) + '</strong>' + esc(description) + '</div>'; }
function say(message, error) { if (root) { if (modalMode) { $('.rt-modal-status').textContent = message; $('.rt-modal-status').className = 'rt-modal-status' + (error ? ' rt-error' : ''); } $('.rt-status').textContent = message; $('.rt-status').className = 'rt-status' + (error ? ' rt-error' : ''); } }
function guarded(fn) { try { return fn(); } catch (e) { say(e.message || String(e), true); return undefined; } }
function clearInput() { if (g.Input) g.Input.clear(); if (g.TouchInput) g.TouchInput.clear(); if (g.$gameTemp && g.$gameTemp.clearDestination) g.$gameTemp.clearDestination(); }
function allowed() {
    var manager = g.SceneManager, scene = manager && manager._scene;
    if (!(g.$dataSystem && g.$gameVariables && g.$gameParty && scene && ((g.Scene_Map && scene instanceof g.Scene_Map) || (g.Scene_Battle && scene instanceof g.Scene_Battle)))) return false;
    if (manager.isSceneChanging()) return false;
    // isBusy requires initialized scene windows.
    var started = typeof manager.isCurrentSceneStarted === 'function' ? manager.isCurrentSceneStarted() :
        typeof scene.isStarted === 'function' && scene.isStarted();
    if (!started || (typeof scene.isActive === 'function' && !scene.isActive())) return false;
    return !scene.isBusy() && !(g.$gamePlayer && g.$gamePlayer.isTransferring()) &&
        (toolkitParams.PlaytestOnly !== 'true' || g.Utils.isOptionValid('test'));
}
function mobileLayout() { return g.matchMedia && g.matchMedia('(max-width: 800px), (max-width: 950px) and (max-height: 500px)').matches; }
function touchInput() { return g.matchMedia && g.matchMedia('(pointer: coarse)').matches; }
function syncViewport() {
    if (!opened || !root) return;
    var v = g.visualViewport || { height:g.innerHeight, width:g.innerWidth, offsetTop:0, offsetLeft:0 };
    root.style.height = v.height + 'px'; root.style.width = v.width + 'px';
    root.style.top = v.offsetTop + 'px'; root.style.left = v.offsetLeft + 'px';
    root.style.bottom = 'auto'; root.style.right = 'auto';
    fitToolboxModal(); if (refreshToolkitScroll) refreshToolkitScroll();
}
if (g.visualViewport) { g.visualViewport.addEventListener('resize', syncViewport); g.visualViewport.addEventListener('scroll', syncViewport); }
g.addEventListener('resize', syncViewport);
function buildRoot() {
    if (root) return;
    var style = document.createElement('style'); style.id = 'rpgm-toolkit-style'; style.textContent = TOOLKIT_CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.className = 'rt'; root.id = 'rpgm-toolkit'; root.hidden = true;
    root.setAttribute('lang', 'fr');
    root.innerHTML = '<section class="rt-panel" role="dialog" aria-modal="true" aria-label="RPGM Toolkit" tabindex="-1"><header class="rt-header"><div class="rt-search-line"><label class="rt-search"><span class="rt-sr">Rechercher par nom, ID ou valeur</span><input id="rt-search" type="search" placeholder="Rechercher · nom, #ID, value:42" autocomplete="off"></label>' + button('✕', 'close', 'rt-close') + '</div><div class="rt-filter-line"><label><span class="rt-sr">Catégorie</span><select id="rt-category"></select></label><label><span class="rt-sr">Filtrer les entrées</span><select id="rt-filter"><option value="all">Tous les types</option><option value="int">Int · entiers</option><option value="bool">Bool · true/false</option><option value="text">Texte</option><option value="value">Valeur exacte…</option><option value="favorites">Favoris</option><option value="frozen">Figés</option><option value="named">Avec un nom</option><option value="active">Non nul / possédé</option><option value="changed">Modifiés</option></select></label><label id="rt-exact-wrap" hidden><span class="rt-sr">Valeur exacte</span><input id="rt-exact" placeholder="Valeur" type="text"></label></div></header><main class="rt-main"><div class="rt-bulkbar"><label class="rt-page-check"><input id="rt-select-page" type="checkbox" aria-label="Sélectionner cette page"><span id="rt-selection-count">Sélection</span></label><div id="rt-bulk-actions" hidden>' + button('Valeur', 'bulk-edit') + button('Figer', 'bulk-freeze') + button('Libérer', 'bulk-unfreeze') + button('×', 'clear-selection') + '</div></div><ul class="rt-list" aria-label="Entrées"></ul><div class="rt-pagination"><span id="rt-count" aria-live="polite"></span><div>' + button('‹', 'prev') + '<label><span class="rt-sr">Numéro de page</span><input id="rt-page-number" type="number" min="1" step="1" inputmode="numeric"></label><span id="rt-page-total"></span>' + button('›', 'next') + '</div></div></main><footer class="rt-footer">' + button('Traduction', 'translate-selection') + '<span class="rt-status" role="status" aria-live="polite"></span>' + button('Enregistrer', 'save-menu', 'rt-primary') + '</footer></section><div class="rt-modal" hidden><section class="rt-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="rt-modal-title" tabindex="-1"><header><h2 id="rt-modal-title">Édition</h2>' + button('✕', 'modal-close', 'rt-close') + '</header><div class="rt-modal-content"></div><div class="rt-modal-status" role="status" aria-live="polite"></div></section></div>';
    $('[data-action="close"]').setAttribute('aria-label', 'Fermer le Toolkit');
    $('[data-action="modal-close"]').setAttribute('aria-label', 'Fermer la fenêtre');
    $('[data-action="clear-selection"]').setAttribute('aria-label', 'Effacer la sélection');
    $('[data-action="prev"]').setAttribute('aria-label', 'Page précédente');
    $('[data-action="next"]').setAttribute('aria-label', 'Page suivante');
    document.body.appendChild(root);
    installToolboxUI();
    installToolkitScroll();
    installSettings();
    ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'wheel', 'pointerdown', 'pointerup'].forEach(function(type) {
        root.addEventListener(type, function(event) { event.stopPropagation(); }, { passive: type.indexOf('touch') === 0 || type === 'wheel' });
    });
    root.addEventListener('click', function(event) {
        var node = event.target;
        while (node && node !== root && !node.getAttribute('data-action')) node = node.parentElement;
        if (node && node !== root) guarded(function() { act(node.getAttribute('data-action'), node); });
    });
    root.addEventListener('submit', function(event) { event.preventDefault(); guarded(function() { submit(event.target.getAttribute('data-form')); }); });
    root.addEventListener('input', function(event) {
        if (event.target.id === 'rt-exact') { exactValue = event.target.value; page = 0; clearTimeout(searchTimer); searchTimer = setTimeout(renderList,120); }
        if (event.target.id === 'rt-search') { query = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(function() { page = 0; renderList(); }, 120); }
    });
    root.addEventListener('keydown', function(event) {
        if (!/^(ArrowDown|ArrowUp|Home|End)$/.test(event.key) || !event.target.classList.contains('rt-select')) return;
        var rows = Array.prototype.slice.call(root.querySelectorAll('.rt-select')), index = rows.indexOf(event.target);
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = rows.length - 1;
        else index = Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        event.preventDefault(); rows[index].focus();
    });
    root.addEventListener('change', function(event) {
        guarded(function() {
            if (event.target.id === 'rt-filter') { filter = event.target.value; $('#rt-exact-wrap').hidden = filter !== 'value'; page = 0; renderList(); }
            if (event.target.id === 'rt-category') {
                var category = event.target.value;
                if (/^(party|translations|history)$/.test(category)) { $('#rt-category').value = tab; openModal(category, labels[category]); if (category === 'party') renderParty(); else if (category === 'history') renderHistory(); else { translationScope = 'selection'; pendingTranslations = picked(); renderTranslations(); } }
                else { tab = category; checked = {}; selected = null; page = 0; render(); }
            }
            if (event.target.id === 'rt-page-number') { page = runtime.integer(event.target.value,1,Math.max(1,Math.ceil(found.length/pageSize))) - 1; renderList(); $('.rt-list').scrollTop = 0; }
            if (event.target.id === 'rt-select-page') {
                var rows = found.slice(page*pageSize,(page+1)*pageSize), active = event.target.checked;
                if (active && picked().length + rows.filter(function(r) { return !checked[r.key]; }).length > 500) throw new Error('Maximum : 500 entrées sélectionnées.');
                rows.forEach(function(r) { if (active) checked[r.key] = r; else delete checked[r.key]; }); renderList();
            }
            if (event.target.hasAttribute('data-check-index')) { var record = found[Number(event.target.getAttribute('data-check-index'))]; if (event.target.checked) { if (picked().length >= 500) { event.target.checked = false; throw new Error('Maximum : 500 entrées sélectionnées.'); } checked[record.key] = record; } else delete checked[record.key]; updateSelection(); }
            if (event.target.id === 'rt-value-type') updateValueInput();
            if (event.target.id === 'rt-english') { runtime.prefs.english = event.target.checked; runtime.savePrefs(); renderList(); renderDetail(); }
            if (event.target.id === 'rt-translation-scope') { translationScope = event.target.value; renderTranslations(); $('#rt-translation-scope').focus(); }
            if (event.target.id === 'rt-source') { runtime.prefs.source = event.target.value; runtime.savePrefs(); }
            if (event.target.id === 'rt-import') importFile(event.target.files[0]);
            if (event.target.id === 'rt-actor-target') { chosenActor = event.target.value; renderActorContext(); }
            if (event.target.id === 'rt-stat' && selected) { var a = runtime.actor(selected.id); $('#rt-stat-value').value = event.target.value === 'exp' ? a.currentExp() : a[event.target.value]; }
        });
    });
}
function renderNav() {
    $('#rt-category').innerHTML = Object.keys(labels).map(function(k) { return '<option value="' + k + '">' + esc(labels[k]) + '</option>'; }).join('');
    $('#rt-category').value = tab;
}
function render() {
    clearTimeout(searchTimer); renderNav(); $('#rt-search').value = query; $('#rt-filter').value = filter; renderList();
}
function openModal(mode, title) {
    if (!modalMode) modalFocus = document.activeElement;
    modalMode = mode; $('.rt-modal-content').scrollTop = 0; $('.rt-modal').hidden = false; $('.rt-modal-content').innerHTML = ''; $('.rt-modal-status').textContent = '';
    $('#rt-modal-title').textContent = title; $('.rt-panel').setAttribute('aria-hidden','true'); $('.rt-panel').inert = true;
    $('.rt-modal-dialog').focus(); fitToolboxModal();
}
function closeModal() {
    if (!modalMode) return;
    toolboxMapToken++; modalMode = ''; $('.rt-modal').hidden = true; $('.rt-panel').removeAttribute('aria-hidden'); $('.rt-panel').inert = false;
    if (opened) { if (toolboxHome) showToolboxHome(); else renderList(); }
    if (modalFocus && document.contains(modalFocus)) modalFocus.focus(); else $('.rt-panel').focus();
}
function updateSelection() {
    var n = picked().length, rows = found.slice(page*pageSize,(page+1)*pageSize);
    $('#rt-selection-count').textContent = n ? n + ' sélectionné(s)' : 'Sélection';
    $('#rt-bulk-actions').hidden = !n;
    $('#rt-select-page').checked = !!rows.length && rows.every(function(r) { return !!checked[r.key]; });
    $('#rt-select-page').indeterminate = rows.some(function(r) { return !!checked[r.key]; }) && !$('#rt-select-page').checked;
    $('#rt-select-page').disabled = !rows.length;
}
function rowAction(text, action, index, label, pressed, disabled) {
    return '<button type="button" class="rt-quick" data-action="' + action + '" data-index="' + index + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (typeof pressed === 'boolean' ? ' aria-pressed="' + pressed + '"' : '') + (disabled ? ' disabled' : '') + '>' + text + '</button>';
}
function lockIcon(locked) {
    return '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/>' + (locked ? '<path d="M5 7V5a3 3 0 016 0v2"/>' : '<path d="M5 7V5a3 3 0 015-2"/>') + '<path d="M8 10v2"/></svg>';
}
function rowValue(r) {
    var v = runtime.printable(runtime.value(r));
    if (r.kind === 'actors') return 'Niv. ' + v;
    if (r.kind === 'skills') return v + ' MP';
    if (r.kind === 'states') return 'P. ' + v;
    return v;
}
function renderList() {
    if (!$('.rt-list')) return;
    found = runtime.search(tab, query, filter);
    if (filter === 'value') found = found.filter(function(r) { return String(runtime.value(r)) === exactValue; });
    page = Math.max(0, Math.min(page, Math.ceil(found.length/pageSize)-1));
    var start = page*pageSize, rows = found.slice(start,start+pageSize);
    $('.rt-list').innerHTML = rows.length ? rows.map(function(r,i) {
        var index = start+i, v = runtime.value(r), edit = runtime.editable(r), frozen = runtime.isFrozen(r), name = runtime.title(r), quick = '';
        if (edit && typeof v === 'number') quick = rowAction('−99','minus99',index,'Retirer 99 : '+name) + rowAction('+99','plus99',index,'Ajouter 99 : '+name);
        else if (edit && typeof v === 'boolean') quick = rowAction(v ? 'false' : 'true','toggle-bool',index,'Basculer : '+name);
        return '<li class="rt-row' + (frozen ? ' rt-frozen' : '') + '"><label class="rt-row-check"><input type="checkbox" data-check-index="' + index + '" aria-label="Sélectionner : ' + esc(name) + '"' + (checked[r.key] ? ' checked' : '') + '></label><button type="button" class="rt-select" data-action="select" data-index="' + index + '" title="' + esc(name+' · #'+r.id) + '">' + (r.data && typeof r.data.iconIndex === 'number' ? '<canvas class="rt-icon" width="32" height="32" data-icon="' + r.data.iconIndex + '" aria-hidden="true"></canvas>' : '') + '<span class="rt-row-id">#' + esc(r.id) + '</span><span class="rt-row-title">' + esc(name) + '</span></button><span class="rt-row-value" title="' + esc(String(v)) + '">' + esc(typeof v === 'boolean' ? String(v) : rowValue(r)) + '</span><div class="rt-row-actions">' + quick + rowAction(runtime.prefs.favorites[r.key] ? '★' : '☆','star',index,'Favori : '+name,!!runtime.prefs.favorites[r.key]) + rowAction(lockIcon(frozen),'freeze',index,(frozen?'Libérer : ':'Figer : ')+name,frozen,!edit) + rowAction('✎','select',index,'Éditer : '+name) + '</div></li>';
    }).join('') : '<li class="rt-empty">Aucun résultat. Changez la recherche ou le filtre.</li>';
    $('#rt-count').textContent = found.length ? (start+1)+'–'+(start+rows.length)+' / '+found.length.toLocaleString() : '0 résultat';
    $('#rt-page-number').value = page+1; $('#rt-page-number').max = Math.max(1,Math.ceil(found.length/pageSize));
    $('#rt-page-total').textContent = '/ '+Math.max(1,Math.ceil(found.length/pageSize));
    $('[data-action="prev"]').disabled = page===0; $('[data-action="next"]').disabled = start+pageSize>=found.length;
    updateSelection(); paintIcons();
}
function paintIcons() {
    if (!g.ImageManager || !g.ImageManager.loadSystem) return;
    var bitmap = g.ImageManager.loadSystem('IconSet');
    var canvases = Array.prototype.slice.call(root.querySelectorAll('canvas[data-icon]'));
    bitmap.addLoadListener(function() {
        var size = g.ImageManager.iconWidth || (g.Window_Base && g.Window_Base._iconWidth) || 32;
        canvases.forEach(function(canvas) {
            if (!root.contains(canvas)) return;
            var index = Number(canvas.getAttribute('data-icon'));
            try { canvas.getContext('2d').drawImage(bitmap.canvas || bitmap._canvas || bitmap._image, (index % 16) * size, Math.floor(index / 16) * size, size, size, 0, 0, 32, 32); } catch (e) { /* An unavailable icon must not block editing. */ }
        });
    });
}
function actorOptions() {
    return runtime.list('actors').map(function(r) { return '<option value="' + r.id + '"' + (String(r.id) === chosenActor ? ' selected' : '') + '>#' + r.id + ' · ' + esc(runtime.title(r)) + '</option>'; }).join('');
}
function actorTarget() { return '<label class="rt-field"><span>Acteur</span><select id="rt-actor-target">' + actorOptions() + '</select></label><p class="rt-muted rt-small" id="rt-actor-context"></p>'; }
function renderDetail() {
    var detail = $('.rt-detail'); if (!detail || modalMode !== 'edit') return;
    if (!selected) { detail.innerHTML = empty('Choisissez une entrée', ''); return; }
    var r = selected, kind = r.kind, v = runtime.value(r);
    var html = '<span class="rt-id">' + esc(labels[kind]) + ' · #' + esc(r.id) + '</span><h3>' + esc(runtime.title(r)) + '</h3><p class="rt-muted rt-small">Nom d’origine : ' + esc(r.original || '(sans nom)') + '</p>';
    if (r.data && r.data.description) html += '<p class="rt-small" data-game-text>' + esc(r.data.description) + '</p>';
    html += '<div class="rt-divider"></div>';
    if (kind === 'variables') {
        if (runtime.editable(r)) html += valueForm(v, 'variable');
        else html += '<p>Type complexe, en lecture seule.</p><pre>' + esc(runtime.printable(v)) + '</pre>';
    } else if (kind === 'switches' || kind === 'selfSwitches') {
        html += '<p>État actuel : <strong>' + (v ? 'ON · activé' : 'OFF · désactivé') + '</strong></p><div class="rt-actions">' + button('Activer ON', 'switch-on', v ? '' : 'rt-primary') + button('Désactiver OFF', 'switch-off', v ? 'rt-primary' : '') + '</div>';
    } else if (/^(items|weapons|armors)$/.test(kind)) {
        html += '<p class="rt-muted rt-small">Prix : ' + esc(r.data.price) + ' ' + esc(g.$dataSystem.currencyUnit) + (r.data.itypeId === 2 ? ' · Objet clé' : '') + '</p>';
        if (r.data.params) html += '<p class="rt-small">' + ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'].map(function(name, i) { return r.data.params[i] ? name + ' ' + (r.data.params[i] > 0 ? '+' : '') + r.data.params[i] : ''; }).filter(Boolean).join(' · ') + '</p>';
        html += '<form data-form="quantity">' + field('Quantité dans le sac / maximum ' + g.$gameParty.maxItems(r.data), 'rt-quantity', v, 'number', 'min="0" max="' + g.$gameParty.maxItems(r.data) + '" step="1" required') + '<button class="rt-primary rt-full" type="submit">Définir la quantité</button></form><div class="rt-actions" style="margin-top:10px">' + button('+1', 'give-one') + button('+10', 'give-ten') + button('−1', 'take-one') + '</div>';
        if (kind !== 'items') html += '<div class="rt-divider"></div>' + actorTarget() + field('Emplacement (1 = premier emplacement)', 'rt-equip-slot', 1, 'number', 'min="1" step="1" required') + button('Équiper depuis le sac', 'equip', 'rt-full');
    } else if (kind === 'actors') html += actorEditor(r);
    else if (kind === 'skills' || kind === 'states') html += actorTarget() + '<div class="rt-actions">' + button(kind === 'skills' ? 'Apprendre' : 'Ajouter l’état', kind === 'skills' ? 'learn' : 'add-state', 'rt-primary') + button(kind === 'skills' ? 'Oublier' : 'Retirer l’état', kind === 'skills' ? 'forget' : 'remove-state') + '</div>';
    html += '<div class="rt-divider"></div><form data-form="alias">' + field('Nom anglais · affichage uniquement', 'rt-alias', runtime.alias(r), 'text', 'maxlength="2000" placeholder="Saisir une traduction…"') + '<div class="rt-actions"><button type="submit">Enregistrer le nom</button>' + button('Traduire en ligne', 'translate-one') + '</div></form>';
    detail.innerHTML = html;
    updateValueInput(); renderActorContext();
}

function valueForm(value, form) {
    var type = typeof value === 'boolean' ? 'boolean' : typeof value === 'string' && form !== 'bulk' ? 'string' : 'number';
    return '<form data-form="' + form + '"><label class="rt-field"><span>Type</span><select id="rt-value-type"><option value="number"' + (type==='number'?' selected':'') + '>Int · nombre entier</option><option value="boolean"' + (type==='boolean'?' selected':'') + '>Bool · true / false</option><option value="string"' + (type==='string'?' selected':'') + '>Texte</option></select></label><label class="rt-field" id="rt-value-wrap"><span>Nouvelle valeur</span><textarea id="rt-value" maxlength="10000">' + esc(value) + '</textarea></label><label class="rt-field" id="rt-bool-wrap" hidden><span>Nouvelle valeur</span><select id="rt-bool"><option value="true"' + (value===true?' selected':'') + '>true</option><option value="false"' + (value!==true?' selected':'') + '>false</option></select></label><button class="rt-primary rt-full" type="submit">' + (form==='bulk'?'Appliquer à la sélection':'Appliquer la valeur') + '</button></form>';
}
function updateValueInput() {
    if (!$('#rt-value-type')) return;
    var bool = $('#rt-value-type').value === 'boolean'; $('#rt-value-wrap').hidden = bool; $('#rt-bool-wrap').hidden = !bool;
    $('#rt-value').setAttribute('inputmode',$('#rt-value-type').value==='number'?'numeric':'text');
}
function readValueInput() {
    var type = $('#rt-value-type').value;
    return type === 'boolean' ? $('#rt-bool').value === 'true' : type === 'number' ? runtime.integer($('#rt-value').value,-9007199254740991,9007199254740991) : $('#rt-value').value;
}

function actorEditor(r) {
    var a = runtime.actor(r.id), html = '<p class="rt-muted rt-small">Nom en partie : ' + esc(a.name()) + '</p>';
    html += '<form data-form="actor-stat"><label class="rt-field"><span>Statistique à modifier</span><select id="rt-stat"><option value="hp">HP · ' + a.hp + '/' + a.mhp + '</option><option value="mp">MP · ' + a.mp + '/' + a.mmp + '</option><option value="tp">TP · ' + a.tp + '/' + a.maxTp() + '</option><option value="level">Niveau · ' + a.level + '/' + a.maxLevel() + '</option><option value="exp">EXP · ' + a.currentExp() + '</option></select></label>' + field('Nouvelle valeur', 'rt-stat-value', a.hp, 'number', 'min="0" step="1" required') + '<button type="submit" class="rt-primary rt-full">Appliquer à cet acteur</button></form>' + button('Soigner complètement', 'recover', 'rt-full') + '<h4>Équipement porté</h4>';
    a.equips().forEach(function(item, i) { html += '<p class="rt-small">' + (i + 1) + '. ' + esc(item && item.name || 'Vide') + (item ? ' <button type="button" data-action="unequip" data-slot="' + i + '">Retirer</button>' : '') + '</p>'; });
    html += '';
    return html;
}
function renderActorContext() {
    if (!$('#rt-actor-target') || !selected || !$('#rt-actor-target').value) return;
    var a = runtime.actor(Number($('#rt-actor-target').value)), text;
    if (selected.kind === 'skills') text = a.isLearnedSkill(selected.id) ? 'Compétence déjà apprise.' : 'Compétence non apprise.';
    else if (selected.kind === 'states') text = a.isStateAffected(selected.id) ? 'État actuellement actif.' : 'État actuellement absent.';
    else text = a.equipSlots().map(function(type, i) { return (i + 1) + ' : ' + (g.$dataSystem.equipTypes[type] || type); }).join(' · ');
    $('#rt-actor-context').textContent = text;
}
function renderParty() {
    $('.rt-modal-content').innerHTML = '<div class="rt-page"><h2>Partie</h2><p class="rt-muted">' + esc(g.$dataSystem.gameTitle) + ' · ' + esc(g.Utils.RPGMAKER_NAME) + ' ' + esc(g.Utils.RPGMAKER_VERSION) + '</p><div class="rt-stats"><div class="rt-stat"><span class="rt-muted rt-small">OR</span><strong>' + g.$gameParty.gold().toLocaleString() + '</strong></div><div class="rt-stat"><span class="rt-muted rt-small">CARTE</span><strong>#' + g.$gameMap.mapId() + '</strong></div><div class="rt-stat"><span class="rt-muted rt-small">POSITION</span><strong>' + g.$gamePlayer.x + ', ' + g.$gamePlayer.y + '</strong></div></div><form data-form="gold"><h3>Argent de la partie</h3>' + field('Nouveau total (' + g.$dataSystem.currencyUnit + ')', 'rt-gold', g.$gameParty.gold(), 'number', 'min="0" max="' + g.$gameParty.maxGold() + '" step="1" required') + '<button class="rt-primary" type="submit">Définir le total</button></form><div class="rt-divider"></div><section><h3>Sauvegarde</h3>' + button('Ouvrir le menu de sauvegarde', 'save-menu') + '</section></div>';
}
function sourceSelector() {
    var languages = { ja: 'Japonais', fr: 'Français', 'zh-CN': 'Chinois simplifié', 'zh-TW': 'Chinois traditionnel', ko: 'Coréen', ru: 'Russe', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', en: 'Anglais' };
    return '<label class="rt-field"><span>Langue des noms d’origine</span><select id="rt-source">' + Object.keys(languages).map(function(code) { return '<option value="' + code + '"' + (runtime.prefs.source === code ? ' selected' : '') + '>' + languages[code] + '</option>'; }).join('') + '</select></label>';
}
var pendingTranslations = [], translationScope = 'selection', translationRun = 0, translationProgress = '';
function translationRecords() {
    var records = pendingTranslations;
    if (translationScope === 'category') records = runtime.list(tab);
    if (translationScope === 'all') { records = []; runtime.kinds.forEach(function(kind) { records = records.concat(runtime.list(kind)); }); }
    return records.filter(function(r) { return r.original.trim() && !runtime.alias(r); });
}
function renderTranslations() {
    var remaining = translationRecords().length;
    var scope = '<label class="rt-field"><span>Noms à traduire</span><select id="rt-translation-scope"><option value="selection">Sélection / page</option><option value="category">Toute la catégorie · ' + esc(labels[tab]) + '</option><option value="all">Tout le jeu</option></select></label>';
    $('.rt-modal-content').innerHTML = '<div class="rt-page"><label class="rt-checkbox"><input id="rt-english" type="checkbox"' + (runtime.prefs.english ? ' checked' : '') + '>Noms anglais</label>' + scope + sourceSelector() + '<p id="rt-translation-count">' + remaining + ' nom(s) restant(s)</p><div class="rt-actions">' + button(translationScope === 'all' ? 'Tout traduire' : 'Traduire', 'translate-start', 'rt-primary') + button('Arrêter', 'translate-stop') + '</div><p id="rt-translation-progress" role="status">' + esc(translationProgress) + '</p><div class="rt-divider"></div><h3>Dictionnaire · ' + Object.keys(runtime.prefs.aliases).length + '</h3><div class="rt-actions">' + button('Exporter', 'export-aliases') + button('Exporter les noms', 'export-names') + button('Supprimer', 'delete-aliases') + '</div><label class="rt-field rt-import"><span>Importer JSON</span><input id="rt-import" type="file" accept=".json,application/json"></label></div>';
    $('#rt-translation-scope').value = translationScope;
    $('#rt-translation-scope').disabled = translator.busy(); $('#rt-source').disabled = translator.busy();
    $('[data-action="translate-start"]').disabled = !remaining || translator.busy();
    $('[data-action="translate-stop"]').disabled = !translator.busy();
}
function renderHistory() {
    $('.rt-modal-content').innerHTML = '<div class="rt-page">' + button('Annuler', 'undo') + button('Rétablir', 'redo') + button('Créer un repère', 'baseline') + '<h2>Historique de cette session</h2>' + (runtime.log().length ? runtime.log().map(function(entry) { return '<div class="rt-log-entry"><span class="rt-muted rt-small">' + esc(entry.time) + ' · ' + (entry.reversible ? 'Modification simple' : 'Opération') + '</span><strong>' + esc(entry.label) + '</strong><code>' + esc(entry.before) + ' → ' + esc(entry.after) + '</code></div>'; }).join('') : empty('Aucune modification', '')) + '</div>';
}
function updateHistoryButtons() { if ($('[data-action="undo"]')) $('[data-action="undo"]').disabled = !runtime.canUndo(); if ($('[data-action="redo"]')) $('[data-action="redo"]').disabled = !runtime.canRedo(); }
function changed(message, actorChange) {
    dirty = true; updateHistoryButtons(); renderList(); renderDetail(); if (modalMode === 'party') renderParty();
    say(message + (actorChange ? ' · Pile d’annulation réinitialisée.' : ''));
}
function translateChoice(records) {
    translationScope = 'selection'; translationProgress = '';
    pendingTranslations = records.filter(function(r) { return r.original.trim() && !runtime.alias(r); });
    openModal('translations', 'Traduction'); renderTranslations();
}
function startTranslation() {
    var batch = translationRecords();
    if (!batch.length) { say('Aucun nom restant à traduire.'); return; }
    var run = ++translationRun;
    translationProgress = '0 / ' + batch.length + ' noms traduits';
    translator.translate(batch, runtime.prefs.source, function(done, total) {
        if (run !== translationRun) return;
        translationProgress = done + ' / ' + total + ' noms traduits';
        if (opened && modalMode === 'translations') {
            $('#rt-translation-progress').textContent = translationProgress;
            say(translationProgress + (runtime.storageWarning() ? ' · Stockage indisponible : exportez le dictionnaire.' : ' · Enregistrés localement'));
        }
    }).then(function(count) {
        if (run !== translationRun) return;
        if (opened && modalMode === 'translations') { renderTranslations(); say(count + ' nom(s) traduit(s).' + (runtime.storageWarning() ? ' Stockage indisponible : exportez le dictionnaire.' : ' Enregistrés localement.')); }
    }).catch(function(e) {
        if (run !== translationRun) return;
        if (opened && modalMode === 'translations') { renderTranslations(); say(e.message, true); }
    });
    renderTranslations();
}
function download(name, data) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }));
    var link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function() { URL.revokeObjectURL(url); }, 30000);
}
function importFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error('Fichier trop volumineux (5 Mo maximum).');
    var reader = new FileReader(), session = g.$gameVariables;
    reader.onload = function() { guarded(function() {
        if (g.$gameVariables !== session) throw new Error('La partie a changé. Relancez l’import.');
        var result = runtime.importAliases(JSON.parse(reader.result.replace(/^\uFEFF/, '')));
        if (opened && modalMode === 'translations') renderTranslations();
        say(result.imported + ' traduction(s) importée(s), ' + result.skipped + ' ignorée(s).' + (runtime.storageWarning() ? ' Exportez le dictionnaire : le stockage local est indisponible.' : ''));
    }); };
    reader.onerror = function() { say('Impossible de lire ce fichier.', true); };
    reader.readAsText(file);
}
function act(action, node) {
    if (toolboxAction(action, node)) return;
    var r, id;
    if (action === 'modal-close' || action === 'back-results') { closeModal(); return; }
    if (action === 'select') { selected = found[Number(node.getAttribute('data-index'))]; openModal('edit', 'Éditer · #' + selected.id); $('.rt-modal-content').innerHTML = '<div class="rt-detail"></div>'; renderDetail(); return; }
    if (action === 'clear-selection') { checked = {}; renderList(); return; }
    if (action === 'translate-selection') { translateChoice(picked().length ? picked() : found.slice(page*pageSize,(page+1)*pageSize)); return; }
    if (action === 'bulk-edit') { openModal('bulk', 'Modifier ' + picked().length + ' entrées'); $('.rt-modal-content').innerHTML = valueForm('', 'bulk'); updateValueInput(); return; }
    if (action === 'bulk-freeze' || action === 'bulk-unfreeze') { var count = runtime.freezeMany(picked(),action === 'bulk-freeze'); renderList(); say(count + (action === 'bulk-freeze' ? ' valeurs figées pour cette session.' : ' valeurs libérées.')); return; }
    if (/^(minus99|plus99|toggle-bool|freeze)$/.test(action)) {
        r = found[Number(node.getAttribute('data-index'))];
        if (action === 'freeze') { runtime.freezeMany([r],!runtime.isFrozen(r)); renderList(); say(runtime.isFrozen(r) ? 'Valeur figée pendant cette session.' : 'Valeur libérée.'); return; }
        var v = runtime.value(r), next;
        if (action === 'toggle-bool') next = !v;
        else { next = v + (action === 'minus99' ? -99 : 99); if (/^(items|weapons|armors)$/.test(r.kind)) next = Math.max(0,Math.min(g.$gameParty.maxItems(r.data),next)); }
        runtime.setValue(r,next); changed('Valeur : ' + String(runtime.value(r))); return;
    }
    if (action === 'close') { closeToolkit(); return; }
    if (action === 'tab') { tab = node.getAttribute('data-tab'); page = 0; query = ''; filter = 'all'; selected = null; render(); return; }
    if (action === 'star') { r = found[Number(node.getAttribute('data-index'))]; runtime.prefs.favorites[r.key] = !runtime.prefs.favorites[r.key]; runtime.savePrefs(); renderNav(); renderList(); if (runtime.storageWarning()) say('Favori conservé en mémoire seulement : stockage local indisponible.', true); return; }
    if (action === 'prev' || action === 'next') { page += action === 'next' ? 1 : -1; renderList(); $('.rt-list').scrollTop = 0; $('[data-action="' + action + '"]').focus(); return; }
    if (action === 'baseline') { say(runtime.capture() + ' valeurs mémorisées. Reprenez le jeu, puis utilisez le filtre « Changé depuis le repère ».'); renderList(); return; }
    if (action === 'refresh') { var key = selected && selected.key; runtime.refresh(); selected = key ? runtime.list(selected.kind).filter(function(x) { return x.key === key; })[0] || null : null; render(); say('Données actualisées.'); return; }
    if (action === 'undo' || action === 'redo') { runtime[action](); changed(action === 'undo' ? 'Modification annulée.' : 'Modification rétablie.'); if (modalMode === 'history') renderHistory(); return; }
    if (action === 'translate-page') { translateChoice(found.slice(page * pageSize, (page + 1) * pageSize)); return; }
    if (action === 'translate-one') { translateChoice([selected]); return; }
    if (action === 'translate-start') { startTranslation(); return; }
    if (action === 'delete-aliases') { translationRun++; translator.cancel(); translationProgress = ''; var saved = runtime.clearAliases(); renderTranslations(); renderList(); say(saved ? 'Traductions supprimées.' : 'Suppression non enregistrée.', !saved); return; }
    if (action === 'translate-stop') { translationRun++; translator.cancel(); renderTranslations(); say('Traduction arrêtée.'); return; }
    if (action === 'export-aliases') { download('RPGMToolkit-translations-' + runtime.project + '.json', runtime.exportAliases()); say('Exporté.'); return; }
    if (action === 'export-names') {
        var entries = []; runtime.kinds.forEach(function(k) { runtime.list(k).forEach(function(x) { if (x.original) entries.push({ key: x.key, original: x.original, english: runtime.alias(x) }); }); });
        download('RPGMToolkit-names-' + runtime.project + '.json', { format: 'rpgm-toolkit-translations-v1', project: runtime.project, entries: entries }); say('Exporté.'); return;
    }
    if (action === 'save-menu') {
        if (g.$gameParty.inBattle() || g.$gameMap.isEventRunning() || g.$gameMessage.isBusy() || !g.$gameSystem.isSaveEnabled()) throw new Error('La sauvegarde est indisponible pendant cet événement ou désactivée par le jeu.');
        closeToolkit(); g.SceneManager.push(g.Scene_Save); return;
    }
    if (!selected) throw new Error('Sélectionnez une entrée.');
    if (action === 'switch-on' || action === 'switch-off') { runtime.setValue(selected, action === 'switch-on'); changed('Interrupteur : ' + runtime.printable(runtime.value(selected)) + '.'); return; }
    if (/^(give-one|give-ten|take-one)$/.test(action)) { var delta = action === 'give-ten' ? 10 : (action === 'give-one' ? 1 : -1); runtime.setValue(selected, Math.max(0, Math.min(g.$gameParty.maxItems(selected.data), runtime.value(selected) + delta))); changed('Quantité actuelle : ' + runtime.value(selected) + '.'); return; }
    if (action === 'recover') { runtime.actorAction(selected.id, 'recover'); changed('Acteur soigné.', true); return; }
    if (action === 'unequip') { runtime.equip(selected.id, Number(node.getAttribute('data-slot')), null); changed('Équipement retiré.', true); return; }
    if (/^(learn|forget|add-state|remove-state|equip)$/.test(action)) {
        id = Number($('#rt-actor-target').value);
        if (action === 'equip') runtime.equip(id, runtime.integer($('#rt-equip-slot').value, 1, 99) - 1, selected);
        else runtime.actorAction(id, { learn: 'learn', forget: 'forget', 'add-state': 'addState', 'remove-state': 'removeState' }[action], selected.id);
        changed('Commande appliquée. Consultez l’état actuel de l’acteur.', true);
    }
}
function submit(form) {
    if (toolboxSubmit(form)) return;
    if (form === 'bulk') { var count = runtime.setMany(picked(),readValueInput()); changed(count + ' entrées modifiées.'); closeModal(); return; }
    if (form === 'variable') {
        var next = readValueInput();
        runtime.setValue(selected, next); changed('Valeur actuelle : ' + runtime.printable(runtime.value(selected)) + '.');
    }
    if (form === 'quantity') { runtime.setValue(selected, $('#rt-quantity').value); changed('Quantité actuelle : ' + runtime.value(selected) + '.'); }
    if (form === 'gold') { runtime.gold($('#rt-gold').value); changed('Total actuel : ' + g.$gameParty.gold() + ' ' + g.$dataSystem.currencyUnit + '.'); }
    if (form === 'actor-stat') { runtime.actorAction(selected.id, $('#rt-stat').value, $('#rt-stat-value').value); changed('Statistique mise à jour.', true); }
    if (form === 'alias') { runtime.setAlias(selected, $('#rt-alias').value); renderList(); renderDetail(); $('#rt-alias').focus(); say(runtime.storageWarning() ? 'Nom gardé en mémoire. Exportez le dictionnaire pour le conserver.' : 'Nom anglais enregistré. Le nom d’origine est conservé.'); }
}
function initializeRuntime() {
    if (runtime) return;
    var storage;
    try { storage = g.localStorage; }
    catch (e) { storage = { getItem:function(){return null;}, setItem:function(){throw new Error('Stockage indisponible');} }; }
    runtime = createToolkitRuntime(g,storage); translator = createToolkitTranslator(runtime,g);
    hotkey = runtime.prefs.settings.hotkey || hotkey;
    pageSize = runtime.prefs.settings.pageSize || pageSize;
    if (root) applySettings();
}
function openToolkit() {
    if (opened) return true;
    if (!allowed()) return false;
    try {
        initializeRuntime();
        if (!gameTools) gameTools = createToolkitTools(g);
        runtime.refresh(); selected = null; checked = {}; 
        buildRoot(); previousFocus = document.activeElement; openScene = g.SceneManager._scene;
        openVariables = g.$gameVariables; opened = true; root.hidden = false; if (launch) launch.hidden = true;
        clearInput(); applySettings(); render(); showToolboxHome();
        say(runtime.storageWarning() ? 'Stockage local indisponible : exportez vos traductions pour les conserver.' : '');
        syncViewport(); $('.rt-panel').focus(); return true;
    } catch (e) { opened = false; if (root) root.hidden = true; clearInput(); if (g.console) g.console.error('RPGMToolkit: ' + e.message); return false; }
}
function refreshSceneWindows() {
    if (!dirty || !openScene) return;
    if (g.$gameMap) g.$gameMap.requestRefresh();
    if (g.$gamePlayer) g.$gamePlayer.refresh();
    if (g.$gameTemp && g.$gameTemp.requestBattleRefresh) g.$gameTemp.requestBattleRefresh();
    dirty = false;
}
function closeToolkit() {
    if (!opened) return;
    opened = false; closeModal(); translationRun++; clearTimeout(searchTimer); if (translator) translator.cancel(); root.hidden = true;
    clearInput(); refreshSceneWindows();
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
}
function toggleToolkit() { return opened ? closeToolkit() : openToolkit(); }
g.RPGMToolkit = { version: '1.4.0', open: openToolkit, close: closeToolkit, toggle: toggleToolkit, isOpen: function() { return opened; } };
var heldCloseKey = null;
g.addEventListener('keydown', function(event) {
    var key = event.key || ({ 117: 'F6', 118: 'F7', 121: 'F10', 27: 'Escape' }[event.keyCode]);
    if (heldCloseKey === key && event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (key === hotkey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (opened || allowed()) { event.preventDefault(); event.stopImmediatePropagation(); heldCloseKey = key; if (!event.repeat) toggleToolkit(); } return;
    }
    if (!opened) return;
    if (key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); heldCloseKey = key; if (modalMode) closeModal(); else closeToolkit(); return; }
    if ((event.ctrlKey || event.metaKey) && (key === 'f' || key === 'F')) { event.preventDefault(); event.stopImmediatePropagation(); if (!modalMode && $('#rt-search')) $('#rt-search').focus(); return; }
    if (key === 'Tab') {
        var focusables = Array.prototype.slice.call((modalMode ? $('.rt-modal') : $('.rt-panel')).querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[role=scrollbar]')).filter(function(el) { return el.offsetWidth || el.offsetHeight; });
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && (document.activeElement === first || focusables.indexOf(document.activeElement) < 0)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || focusables.indexOf(document.activeElement) < 0)) { event.preventDefault(); first.focus(); }
    }
    if (!root.contains(event.target)) { event.stopImmediatePropagation(); event.preventDefault(); (modalMode ? $('.rt-modal-dialog') : $('.rt-panel')).focus(); }
}, true);
g.addEventListener('keyup', function(event) {
    if (heldCloseKey && event.key === heldCloseKey) { event.stopImmediatePropagation(); heldCloseKey = null; }
}, true);
g.addEventListener('focus', function() { if (opened) clearInput(); });
function mountLauncher(force) {
    if ((force !== true && toolkitParams.ShowButton === 'false') || launch) return;
    buildRoot(); launch = document.createElement('button'); launch.className = 'rt-launch'; launch.type = 'button'; launch.textContent = 'Toolbox · ' + hotkey; launch.hidden = true;
    launch.setAttribute('aria-label', 'Ouvrir RPGM Toolkit (' + hotkey + ')');
    ['mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(function(type) { launch.addEventListener(type, function(event) { event.stopPropagation(); }, { passive: true }); });
    launch.addEventListener('click', function(event) { event.stopPropagation(); openToolkit(); });
    document.body.appendChild(launch);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLauncher); else mountLauncher();
var originalUpdateScene = g.SceneManager.updateScene;
g.SceneManager.updateScene = function() {
    if (!runtime && allowed()) initializeRuntime();
    if (opened && (this._scene !== openScene || g.$gameVariables !== openVariables || this.isSceneChanging())) closeToolkit();
    if (launch) { var hidden = opened || (runtime && !runtime.prefs.settings.showButton) || !allowed(); if (launch.hidden !== hidden) launch.hidden = hidden; }
    if (gameTools) gameTools.tick();
    if (runtime) runtime.enforceFrozen();
    if (!opened) { var result = originalUpdateScene.apply(this, arguments); if (gameTools) gameTools.tick(); if (runtime) runtime.enforceFrozen(); return result; }
};
function openFromInterpreter() { if (openToolkit() && this && this.setWaitMode) this.setWaitMode('rpgmToolkit'); }
if (g.PluginManager.registerCommand) { g.PluginManager.registerCommand('RPGMToolkit', 'Open', openFromInterpreter); g.PluginManager.registerCommand('RPGMToolkit', 'Close', closeToolkit); }
if (g.Game_Interpreter) {
    var previousPluginCommand = g.Game_Interpreter.prototype.pluginCommand;
    var previousUpdateWaitMode = g.Game_Interpreter.prototype.updateWaitMode;
    g.Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === 'rpgmToolkit') { if (opened) return true; this._waitMode = ''; return false; }
        return previousUpdateWaitMode ? previousUpdateWaitMode.apply(this, arguments) : false;
    };
    g.Game_Interpreter.prototype.pluginCommand = function(command, args) {
        if (previousPluginCommand) previousPluginCommand.apply(this, arguments);
        if (String(command).toLowerCase() === 'rpgmtoolkit') { if (String((args || [])[0]).toLowerCase() === 'close') closeToolkit(); else openFromInterpreter.call(this); }
    };
}
