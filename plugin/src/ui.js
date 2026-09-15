/* DOM overlay; no engine assets, dependencies or timers while closed. */
var toolkitParams = g.PluginManager && g.PluginManager.parameters('RPGMToolkit') || {};
var hotkey = /^(F6|F7|F10)$/.test(toolkitParams.Hotkey || '') ? toolkitParams.Hotkey : 'F6';
var pageSize = Math.max(20, Math.min(80, Number(toolkitParams.PageSize) || 60));
var runtime, translator, root, launch, previousFocus, openScene, openVariables, searchTimer;
var opened = false, dirty = false, tab = 'variables', query = '', filter = 'all', page = 0, selected = null, found = [];
var chosenActor = '';
var labels = { favorites: 'Favoris', variables: 'Variables', switches: 'Interrupteurs', selfSwitches: 'Interr. locaux', items: 'Objets', weapons: 'Armes', armors: 'Armures', actors: 'Acteurs', skills: 'Compétences', states: 'États', party: 'Partie', translations: 'Traductions', history: 'Historique' };
var hints = { variables: 'Retrouvez et modifiez les valeurs de votre partie.', switches: 'Contrôlez les interrupteurs globaux du jeu.', selfSwitches: 'Interrupteurs A–D des événements de la carte actuelle.', items: 'Objets usuels, objets clés et objets masqués.', weapons: 'Recherchez une arme et ajustez votre inventaire.', armors: 'Armures, accessoires et équipements.', actors: 'Statistiques, progression et équipement des acteurs.', skills: 'Apprenez ou retirez une compétence à un acteur.', states: 'Ajoutez ou retirez les états d’un acteur.', favorites: 'Vos entrées épinglées, réunies au même endroit.' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(selector) { return root.querySelector(selector); }
function button(text, action, cls) { return '<button type="button" data-action="' + action + '" class="' + (cls || '') + '">' + text + '</button>'; }
function field(label, id, value, type, attrs) { return '<label class="rt-field"><span>' + esc(label) + '</span><input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (attrs || '') + '></label>'; }
function empty(title, description) { return '<div class="rt-empty"><span class="rt-empty-symbol" aria-hidden="true">◇</span><strong>' + esc(title) + '</strong>' + esc(description) + '</div>'; }
function say(message, error) { if (root) { $('.rt-status').textContent = message; $('.rt-status').className = 'rt-status' + (error ? ' rt-error' : ''); } }
function guarded(fn) { try { return fn(); } catch (e) { say(e.message || String(e), true); return undefined; } }
function clearInput() { if (g.Input) g.Input.clear(); if (g.TouchInput) g.TouchInput.clear(); if (g.$gameTemp && g.$gameTemp.clearDestination) g.$gameTemp.clearDestination(); }
function allowed() {
    var manager = g.SceneManager, scene = manager && manager._scene;
    if (!(g.$dataSystem && g.$gameVariables && g.$gameParty && scene && g.Scene_Map && scene instanceof g.Scene_Map)) return false;
    if (manager.isSceneChanging()) return false;
    // MV tracks start on SceneManager; MZ tracks it on Scene_Base. Before start,
    // Scene_Map.isReady still has to create the message window. Calling isBusy
    // here would dereference its missing isClosing method. Do not call isReady:
    // it has engine side effects and must remain owned by the original loop.
    var started = typeof manager.isCurrentSceneStarted === 'function' ? manager.isCurrentSceneStarted() :
        typeof scene.isStarted === 'function' && scene.isStarted();
    if (!started || (typeof scene.isActive === 'function' && !scene.isActive())) return false;
    return !scene.isBusy() && !(g.$gamePlayer && g.$gamePlayer.isTransferring()) &&
        (toolkitParams.PlaytestOnly !== 'true' || g.Utils.isOptionValid('test'));
}
function mobileLayout() { return g.matchMedia && g.matchMedia('(max-width: 800px), (max-width: 950px) and (max-height: 500px)').matches; }
function touchInput() { return g.matchMedia && g.matchMedia('(pointer: coarse)').matches; }
function syncViewport() {
    if (!opened || !root || !g.visualViewport) return;
    var v = g.visualViewport;
    root.style.height = v.height + 'px'; root.style.width = v.width + 'px';
    root.style.top = v.offsetTop + 'px'; root.style.left = v.offsetLeft + 'px';
    root.style.bottom = 'auto'; root.style.right = 'auto';
}
if (g.visualViewport) { g.visualViewport.addEventListener('resize', syncViewport); g.visualViewport.addEventListener('scroll', syncViewport); }
function buildRoot() {
    if (root) return;
    var style = document.createElement('style'); style.id = 'rpgm-toolkit-style'; style.textContent = TOOLKIT_CSS; document.head.appendChild(style);
    root = document.createElement('div'); root.className = 'rt'; root.id = 'rpgm-toolkit'; root.hidden = true;
    root.setAttribute('lang', 'fr');
    root.innerHTML = '<section class="rt-panel" role="dialog" aria-modal="true" aria-labelledby="rt-heading" tabindex="-1"><header class="rt-header"><div class="rt-brand"><span class="rt-logo" aria-hidden="true">R</span><div><div class="rt-eyebrow">RPG MAKER · TOOLKIT</div><h1 id="rt-heading">RPGM Toolkit</h1></div></div><div class="rt-header-actions"><span class="rt-paused">Ⅱ Jeu en pause</span>' + button('↶ Annuler', 'undo') + button('↷ Rétablir', 'redo') + button('Fermer <kbd>' + hotkey + '</kbd>', 'close') + '</div></header><div class="rt-body"><nav class="rt-nav" aria-label="Catégories"></nav><main class="rt-main"></main></div><footer class="rt-footer"><div class="rt-status" role="status" aria-live="polite"></div><span class="rt-footer-hint"><kbd>Ctrl F</kbd> Rechercher · <kbd>Échap</kbd> Fermer</span></footer></section>';
    document.body.appendChild(root);
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
            if (event.target.id === 'rt-filter') { filter = event.target.value; page = 0; renderList(); }
            if (event.target.id === 'rt-english') { runtime.prefs.english = event.target.checked; runtime.savePrefs(); renderList(); renderDetail(); }
            if (event.target.id === 'rt-source') { runtime.prefs.source = event.target.value; runtime.savePrefs(); }
            if (event.target.id === 'rt-import') importFile(event.target.files[0]);
            if (event.target.id === 'rt-actor-target') { chosenActor = event.target.value; renderActorContext(); }
            if (event.target.id === 'rt-stat' && selected) { var a = runtime.actor(selected.id); $('#rt-stat-value').value = event.target.value === 'exp' ? a.currentExp() : a[event.target.value]; }
        });
    });
}
function renderNav() {
    var nav = '<span class="rt-nav-label">Explorer la partie</span>';
    ['favorites', 'variables', 'switches', 'selfSwitches', 'items', 'weapons', 'armors', 'actors', 'skills', 'states'].forEach(function(k) {
        nav += '<button type="button" data-action="tab" data-tab="' + k + '"' + (tab === k ? ' aria-current="page"' : '') + '><span>' + esc(labels[k]) + '</span><span class="rt-nav-count">' + runtime.list(k).length.toLocaleString() + '</span></button>';
    });
    nav += '<div class="rt-nav-sep"></div>';
    ['party', 'translations', 'history'].forEach(function(k) { nav += '<button type="button" data-action="tab" data-tab="' + k + '"' + (tab === k ? ' aria-current="page"' : '') + '>' + esc(labels[k]) + '</button>'; });
    $('.rt-nav').innerHTML = nav;
}
function render() {
    root.classList.remove('rt-detail-open');
    clearTimeout(searchTimer);
    renderNav(); updateHistoryButtons();
    if (tab === 'party') { renderParty(); return; }
    if (tab === 'translations') { renderTranslations(); return; }
    if (tab === 'history') { renderHistory(); return; }
    $('.rt-main').innerHTML = '<div class="rt-toolbar"><div class="rt-title-line"><div><h2>' + esc(labels[tab]) + '</h2><p class="rt-muted rt-small" style="margin:0">' + esc(hints[tab]) + '</p></div></div><div class="rt-controls"><label class="rt-search"><span class="rt-sr">Rechercher par nom, ID ou valeur</span><input id="rt-search" type="search" placeholder="Rechercher un nom, #ID, value:42…" value="' + esc(query) + '"></label><label><span class="rt-sr">Filtrer les entrées</span><select id="rt-filter"><option value="all">Tout afficher</option><option value="named">Avec un nom</option><option value="favorites">Favoris</option><option value="active">Non nul / possédé / ON</option><option value="changed">Changé depuis le repère</option></select></label></div><details class="rt-tools"><summary>Options et traduction</summary><div class="rt-controls" style="margin-top:8px"><label class="rt-checkbox rt-small"><input type="checkbox" id="rt-english"' + (runtime.prefs.english ? ' checked' : '') + '>Noms anglais</label>' + button('Traduire cette page', 'translate-page') + button('Créer un repère', 'baseline') + button('Actualiser', 'refresh') + '</div></details></div><div class="rt-workbench"><section class="rt-results" aria-label="Résultats"><div class="rt-columns"><span>Nom / identifiant</span><span>Valeur</span></div><ul class="rt-list" aria-label="Entrées"></ul><div class="rt-pagination"><span id="rt-count" aria-live="polite"></span><div>' + button('‹', 'prev') + ' ' + button('›', 'next') + '</div></div></section><aside class="rt-detail" aria-label="Détails et édition"></aside></div>';
    $('#rt-filter').value = filter;
    $('[data-action="prev"]').setAttribute('aria-label', 'Page précédente');
    $('[data-action="next"]').setAttribute('aria-label', 'Page suivante');
    renderList(); renderDetail();
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
    page = Math.max(0, Math.min(page, Math.ceil(found.length / pageSize) - 1));
    var start = page * pageSize, rows = found.slice(start, start + pageSize);
    $('.rt-list').innerHTML = rows.length ? rows.map(function(r, index) {
        var sub = '#' + r.id + (tab === 'favorites' ? ' · ' + labels[r.kind] : '') + (runtime.alias(r) && runtime.prefs.english ? ' · ' + r.original : '') + (runtime.changed(r) ? ' · modifié' : '');
        return '<li class="rt-row' + (selected && selected.key === r.key ? ' rt-selected' : '') + '"><button type="button" class="rt-select" data-action="select" data-index="' + (start + index) + '" aria-pressed="' + !!(selected && selected.key === r.key) + '">' + (r.data && typeof r.data.iconIndex === 'number' ? '<canvas class="rt-icon" width="32" height="32" data-icon="' + Number(r.data.iconIndex) + '" aria-hidden="true"></canvas>' : '') + '<span class="rt-row-main"><span class="rt-row-title">' + esc(runtime.title(r)) + '</span><span class="rt-row-sub">' + esc(sub) + '</span></span><span class="rt-row-value">' + esc(rowValue(r)) + '</span></button><button class="rt-star" type="button" data-action="star" data-index="' + (start + index) + '" aria-label="Favori : ' + esc(runtime.title(r)) + '" aria-pressed="' + !!runtime.prefs.favorites[r.key] + '">' + (runtime.prefs.favorites[r.key] ? '★' : '☆') + '</button></li>';
    }).join('') : '<li>' + empty('Aucun résultat', query || filter !== 'all' ? 'Essayez un autre nom, un ID ou le filtre « Tout afficher ».' : 'Aucune entrée dans cette catégorie.') + '</li>';
    $('#rt-count').textContent = found.length ? (start + 1) + '–' + (start + rows.length) + ' sur ' + found.length.toLocaleString() : '0 résultat';
    $('[data-action="prev"]').disabled = page === 0;
    $('[data-action="next"]').disabled = start + pageSize >= found.length;
    paintIcons();
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
    var detail = $('.rt-detail'); if (!detail) return;
    if (!selected) { detail.innerHTML = empty('Choisissez une entrée', 'Consultez son nom d’origine, sa valeur et ses commandes ici.'); return; }
    var r = selected, kind = r.kind, v = runtime.value(r);
    var html = button('‹ Retour aux résultats', 'back-results', 'rt-back') + '<span class="rt-id">' + esc(labels[kind]) + ' · #' + esc(r.id) + '</span><h3>' + esc(runtime.title(r)) + '</h3><p class="rt-muted rt-small">Nom d’origine : ' + esc(r.original || '(sans nom)') + '</p>';
    if (r.data && r.data.description) html += '<p class="rt-small">' + esc(r.data.description) + '</p>';
    html += '<div class="rt-divider"></div>';
    if (kind === 'variables') {
        if (typeof v === 'number' || typeof v === 'string') {
            html += '<form data-form="variable"><label class="rt-field"><span>Type de valeur</span><select id="rt-value-type"><option value="number"' + (typeof v === 'number' ? ' selected' : '') + '>Nombre entier</option><option value="string"' + (typeof v === 'string' ? ' selected' : '') + '>Texte</option></select></label><label class="rt-field"><span>Valeur actuelle → nouvelle valeur</span><textarea id="rt-value" maxlength="10000">' + esc(v) + '</textarea></label><button class="rt-primary rt-full" type="submit">Appliquer la valeur</button></form><p class="rt-muted rt-small" style="margin-top:10px">Les événements peuvent changer cette valeur à la reprise du jeu.</p>';
        } else html += '<p>Type complexe, en lecture seule.</p><pre>' + esc(runtime.printable(v)) + '</pre>';
    } else if (kind === 'switches' || kind === 'selfSwitches') {
        html += '<p>État actuel : <strong>' + (v ? 'ON · activé' : 'OFF · désactivé') + '</strong></p><div class="rt-actions">' + button('Activer ON', 'switch-on', v ? '' : 'rt-primary') + button('Désactiver OFF', 'switch-off', v ? 'rt-primary' : '') + '</div>';
    } else if (/^(items|weapons|armors)$/.test(kind)) {
        html += '<p class="rt-muted rt-small">Prix : ' + esc(r.data.price) + ' ' + esc(g.$dataSystem.currencyUnit) + (r.data.itypeId === 2 ? ' · Objet clé' : '') + '</p>';
        if (r.data.params) html += '<p class="rt-small">' + ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'].map(function(name, i) { return r.data.params[i] ? name + ' ' + (r.data.params[i] > 0 ? '+' : '') + r.data.params[i] : ''; }).filter(Boolean).join(' · ') + '</p>';
        html += '<form data-form="quantity">' + field('Quantité dans le sac / maximum ' + g.$gameParty.maxItems(r.data), 'rt-quantity', v, 'number', 'min="0" max="' + g.$gameParty.maxItems(r.data) + '" step="1" required') + '<button class="rt-primary rt-full" type="submit">Définir la quantité</button></form><div class="rt-actions" style="margin-top:10px">' + button('+1', 'give-one') + button('+10', 'give-ten') + button('−1', 'take-one') + '</div><p class="rt-muted rt-small" style="margin-top:12px">Les équipements portés ne sont pas retirés du personnage.</p>';
        if (kind !== 'items') html += '<div class="rt-divider"></div>' + actorTarget() + field('Emplacement (1 = premier emplacement)', 'rt-equip-slot', 1, 'number', 'min="1" step="1" required') + button('Équiper depuis le sac', 'equip', 'rt-full');
    } else if (kind === 'actors') html += actorEditor(r);
    else if (kind === 'skills' || kind === 'states') html += actorTarget() + '<div class="rt-actions">' + button(kind === 'skills' ? 'Apprendre' : 'Ajouter l’état', kind === 'skills' ? 'learn' : 'add-state', 'rt-primary') + button(kind === 'skills' ? 'Oublier' : 'Retirer l’état', kind === 'skills' ? 'forget' : 'remove-state') + '</div><p class="rt-muted rt-small" style="margin-top:12px">Ces actions respectent les règles du moteur et réinitialisent l’annulation.</p>';
    html += '<div class="rt-divider"></div><form data-form="alias">' + field('Nom anglais · affichage uniquement', 'rt-alias', runtime.alias(r), 'text', 'maxlength="2000" placeholder="Saisir une traduction…"') + '<div class="rt-actions"><button type="submit">Enregistrer le nom</button>' + button('Traduire en ligne', 'translate-one') + '</div></form>';
    detail.innerHTML = html;
    renderActorContext();
}
function actorEditor(r) {
    var a = runtime.actor(r.id), html = '<p class="rt-muted rt-small">Nom en partie : ' + esc(a.name()) + '</p>';
    html += '<form data-form="actor-stat"><label class="rt-field"><span>Statistique à modifier</span><select id="rt-stat"><option value="hp">HP · ' + a.hp + '/' + a.mhp + '</option><option value="mp">MP · ' + a.mp + '/' + a.mmp + '</option><option value="tp">TP · ' + a.tp + '/' + a.maxTp() + '</option><option value="level">Niveau · ' + a.level + '/' + a.maxLevel() + '</option><option value="exp">EXP · ' + a.currentExp() + '</option></select></label>' + field('Nouvelle valeur', 'rt-stat-value', a.hp, 'number', 'min="0" step="1" required') + '<button type="submit" class="rt-primary rt-full">Appliquer à cet acteur</button></form>' + button('Soigner complètement', 'recover', 'rt-full') + '<div class="rt-note">Les commandes d’acteur peuvent affecter plusieurs statistiques. Elles réinitialisent la pile d’annulation.</div><h4>Équipement porté</h4>';
    a.equips().forEach(function(item, i) { html += '<p class="rt-small">' + (i + 1) + '. ' + esc(item && item.name || 'Vide') + (item ? ' <button type="button" data-action="unequip" data-slot="' + i + '">Retirer</button>' : '') + '</p>'; });
    html += '<p class="rt-muted rt-small">Ajoutez ou retirez des compétences et des états depuis leurs catégories.</p>';
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
    $('.rt-main').innerHTML = '<div class="rt-page"><h2>Partie</h2><p class="rt-muted">' + esc(g.$dataSystem.gameTitle) + ' · ' + esc(g.Utils.RPGMAKER_NAME) + ' ' + esc(g.Utils.RPGMAKER_VERSION) + '</p><div class="rt-stats"><div class="rt-stat"><span class="rt-muted rt-small">OR</span><strong>' + g.$gameParty.gold().toLocaleString() + '</strong></div><div class="rt-stat"><span class="rt-muted rt-small">CARTE</span><strong>#' + g.$gameMap.mapId() + '</strong></div><div class="rt-stat"><span class="rt-muted rt-small">POSITION</span><strong>' + g.$gamePlayer.x + ', ' + g.$gamePlayer.y + '</strong></div></div><form data-form="gold"><h3>Argent de la partie</h3>' + field('Nouveau total (' + g.$dataSystem.currencyUnit + ')', 'rt-gold', g.$gameParty.gold(), 'number', 'min="0" max="' + g.$gameParty.maxGold() + '" step="1" required') + '<button class="rt-primary" type="submit">Définir le total</button></form><div class="rt-divider"></div><section><h3>Sauvegarde</h3><p class="rt-muted">Les modifications sont appliquées à la partie en cours. Utilisez la sauvegarde du jeu pour les conserver.</p>' + button('Ouvrir le menu de sauvegarde', 'save-menu') + '<div class="rt-note">Enregistrez dans un emplacement distinct si vous souhaitez garder votre progression précédente.</div></section></div>';
}
function sourceSelector() {
    var languages = { ja: 'Japonais', fr: 'Français', 'zh-CN': 'Chinois simplifié', 'zh-TW': 'Chinois traditionnel', ko: 'Coréen', ru: 'Russe', es: 'Espagnol', de: 'Allemand', it: 'Italien', pt: 'Portugais', en: 'Anglais' };
    return '<label class="rt-field"><span>Langue des noms d’origine</span><select id="rt-source">' + Object.keys(languages).map(function(code) { return '<option value="' + code + '"' + (runtime.prefs.source === code ? ' selected' : '') + '>' + languages[code] + '</option>'; }).join('') + '</select></label>';
}
var pendingTranslations = [];
function renderTranslations() {
    $('.rt-main').innerHTML = '<div class="rt-page"><h2>Traductions anglaises</h2><p class="rt-muted">Un nom plus clair, avec les données d’origine intactes.</p><section><div class="rt-note">Les traductions changent uniquement les noms affichés dans le Toolkit. Elles ne modifient ni les identifiants, ni les valeurs, ni les textes du jeu.</div><h3>Traduction à la demande</h3>' + sourceSelector() + '<p class="rt-small rt-muted">Le bouton ci-dessous envoie les noms sélectionnés à MyMemory (service tiers) pour les traduire en anglais. Les valeurs des variables ne sont pas envoyées. Le service gratuit sans clé est soumis à un quota ; réseau et autorisation CORS nécessaires.</p><p id="rt-translation-count">' + pendingTranslations.length + ' nom(s) sélectionné(s), déjà traduits exclus automatiquement.</p><div class="rt-actions">' + button('Envoyer les noms à MyMemory', 'translate-start', 'rt-primary') + button('Arrêter', 'translate-stop') + '</div><p id="rt-translation-progress" class="rt-small" role="status" style="margin-top:12px"></p><div class="rt-divider"></div><h3>Dictionnaire local</h3><p class="rt-muted">' + Object.keys(runtime.prefs.aliases).length + ' alias enregistré(s) pour ce jeu. Saisissez un nom anglais dans les détails d’une entrée ou importez un dictionnaire JSON.</p><div class="rt-actions">' + button('Exporter les traductions', 'export-aliases') + button('Exporter les noms à traduire', 'export-names') + '</div><label class="rt-field" style="margin-top:16px"><span>Importer un dictionnaire JSON (5 Mo maximum)</span><input id="rt-import" type="file" accept=".json,application/json"></label><p class="rt-small rt-muted">L’import ne retient que les entrées dont la catégorie, l’ID et le nom d’origine correspondent. Les fichiers ne sont pas envoyés à un serveur.</p></section></div>';
    $('[data-action="translate-start"]').disabled = !pendingTranslations.length || translator.busy();
    $('[data-action="translate-stop"]').disabled = !translator.busy();
}
function renderHistory() {
    $('.rt-main').innerHTML = '<div class="rt-page"><h2>Historique de cette session</h2><p class="rt-muted">100 dernières opérations. Annulation et rétablissement limités à 80 modifications simples. Le chargement d’une partie réinitialise cet historique.</p>' + (runtime.log().length ? runtime.log().map(function(entry) { return '<div class="rt-log-entry"><span class="rt-muted rt-small">' + esc(entry.time) + ' · ' + (entry.reversible ? 'Modification simple' : 'Opération') + '</span><strong>' + esc(entry.label) + '</strong><code>' + esc(entry.before) + ' → ' + esc(entry.after) + '</code></div>'; }).join('') : empty('Aucune modification', 'Les opérations effectuées depuis ce panneau apparaîtront ici.')) + '</div>';
}
function updateHistoryButtons() { $('[data-action="undo"]').disabled = !runtime.canUndo(); $('[data-action="redo"]').disabled = !runtime.canRedo(); }
function changed(message, actorChange) {
    dirty = true; updateHistoryButtons(); renderList(); renderDetail(); if (tab === 'party') renderParty();
    say(message + (actorChange ? ' · Pile d’annulation réinitialisée.' : ''));
}
function translateChoice(records) {
    pendingTranslations = records.filter(function(r) { return r.original.trim() && !runtime.alias(r); });
    tab = 'translations'; render();
}
function startTranslation() {
    if (!pendingTranslations.length) { say('Sélectionnez une entrée ou une page à traduire.'); return; }
    var batch = pendingTranslations.slice();
    translator.translate(batch, runtime.prefs.source, function(done, total) {
        if ($('#rt-translation-progress')) $('#rt-translation-progress').textContent = done + ' / ' + total + ' noms traduits';
        say(done + ' / ' + total + ' noms traduits');
    }).then(function(count) {
        pendingTranslations = []; if (opened && tab === 'translations') renderTranslations();
        if (opened) say(count + ' nom(s) traduit(s).' + (runtime.storageWarning() ? ' Stockage local indisponible : exportez le dictionnaire.' : ''));
    }).catch(function(e) { if (opened) { if (tab === 'translations') renderTranslations(); say(e.message, true); } });
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
        if (opened && tab === 'translations') renderTranslations();
        say(result.imported + ' traduction(s) importée(s), ' + result.skipped + ' ignorée(s).' + (runtime.storageWarning() ? ' Exportez le dictionnaire : le stockage local est indisponible.' : ''));
    }); };
    reader.onerror = function() { say('Impossible de lire ce fichier.', true); };
    reader.readAsText(file);
}
function act(action, node) {
    var r, id;
    if (action === 'close') { closeToolkit(); return; }
    if (action === 'tab') { tab = node.getAttribute('data-tab'); page = 0; query = ''; filter = 'all'; selected = null; render(); return; }
    if (action === 'back-results') { root.classList.remove('rt-detail-open'); var row = $('.rt-selected .rt-select'); if (row) row.focus(); return; }
    if (action === 'select') { root.classList.add('rt-detail-open'); selected = found[Number(node.getAttribute('data-index'))]; renderList(); renderDetail(); var chosen = mobileLayout() ? $('.rt-back') : $('.rt-detail input, .rt-detail select, .rt-detail textarea, .rt-detail button'); if (chosen) chosen.focus(); return; }
    if (action === 'star') { r = found[Number(node.getAttribute('data-index'))]; runtime.prefs.favorites[r.key] = !runtime.prefs.favorites[r.key]; runtime.savePrefs(); renderNav(); renderList(); if (runtime.storageWarning()) say('Favori conservé en mémoire seulement : stockage local indisponible.', true); return; }
    if (action === 'prev' || action === 'next') { page += action === 'next' ? 1 : -1; renderList(); $('.rt-list').scrollTop = 0; $('[data-action="' + action + '"]').focus(); return; }
    if (action === 'baseline') { say(runtime.capture() + ' valeurs mémorisées. Reprenez le jeu, puis utilisez le filtre « Changé depuis le repère ».'); renderList(); return; }
    if (action === 'refresh') { var key = selected && selected.key; runtime.refresh(); selected = key ? runtime.list(selected.kind).filter(function(x) { return x.key === key; })[0] || null : null; render(); say('Données actualisées.'); return; }
    if (action === 'undo' || action === 'redo') { runtime[action](); changed(action === 'undo' ? 'Modification annulée.' : 'Modification rétablie.'); if (tab === 'history') renderHistory(); return; }
    if (action === 'translate-page') { translateChoice(found.slice(page * pageSize, (page + 1) * pageSize)); return; }
    if (action === 'translate-one') { translateChoice([selected]); return; }
    if (action === 'translate-start') { startTranslation(); return; }
    if (action === 'translate-stop') { translator.cancel(); renderTranslations(); say('Traduction arrêtée. Les noms déjà traduits sont conservés.'); return; }
    if (action === 'export-aliases') { download('RPGMToolkit-translations-' + runtime.project + '.json', runtime.exportAliases()); say('Dictionnaire exporté.'); return; }
    if (action === 'export-names') {
        var entries = []; runtime.kinds.forEach(function(k) { runtime.list(k).forEach(function(x) { if (x.original) entries.push({ key: x.key, original: x.original, english: runtime.alias(x) }); }); });
        download('RPGMToolkit-names-' + runtime.project + '.json', { format: 'rpgm-toolkit-translations-v1', project: runtime.project, entries: entries }); say('Noms exportés. Renseignez le champ english puis importez le fichier.'); return;
    }
    if (action === 'save-menu') {
        if (g.$gameMap.isEventRunning() || g.$gameMessage.isBusy() || !g.$gameSystem.isSaveEnabled()) throw new Error('La sauvegarde est indisponible pendant cet événement ou désactivée par le jeu.');
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
    if (form === 'variable') {
        var next = $('#rt-value-type').value === 'number' ? runtime.integer($('#rt-value').value, -9007199254740991, 9007199254740991) : $('#rt-value').value;
        runtime.setValue(selected, next); changed('Valeur actuelle : ' + runtime.printable(runtime.value(selected)) + '.');
    }
    if (form === 'quantity') { runtime.setValue(selected, $('#rt-quantity').value); changed('Quantité actuelle : ' + runtime.value(selected) + '.'); }
    if (form === 'gold') { runtime.gold($('#rt-gold').value); changed('Total actuel : ' + g.$gameParty.gold() + ' ' + g.$dataSystem.currencyUnit + '.'); }
    if (form === 'actor-stat') { runtime.actorAction(selected.id, $('#rt-stat').value, $('#rt-stat-value').value); changed('Statistique mise à jour.', true); }
    if (form === 'alias') { runtime.setAlias(selected, $('#rt-alias').value); renderList(); renderDetail(); $('#rt-alias').focus(); say(runtime.storageWarning() ? 'Nom gardé en mémoire. Exportez le dictionnaire pour le conserver.' : 'Nom anglais enregistré. Le nom d’origine est conservé.'); }
}
function openToolkit() {
    if (opened) return true;
    if (!allowed()) return false;
    try {
        if (!runtime) { var storage; try { storage = g.localStorage; } catch (e) { storage = { getItem: function() { return null; }, setItem: function() { throw new Error('Stockage indisponible'); } }; } runtime = createToolkitRuntime(g, storage); translator = createToolkitTranslator(runtime, g); }
        runtime.refresh(); selected = null;
        buildRoot(); previousFocus = document.activeElement; openScene = g.SceneManager._scene;
        openVariables = g.$gameVariables; opened = true; root.hidden = false; if (launch) launch.hidden = true;
        clearInput(); render();
        say(runtime.storageWarning() ? 'Stockage local indisponible : exportez vos traductions pour les conserver.' : 'Prêt · Les modifications s’appliquent à la partie en cours.');
        syncViewport(); var focus = touchInput() ? $('.rt-panel') : ($('#rt-search') || $('.rt-panel')); focus.focus(); return true;
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
    opened = false; clearTimeout(searchTimer); if (translator) translator.cancel(); root.hidden = true;
    clearInput(); refreshSceneWindows();
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
}
function toggleToolkit() { return opened ? closeToolkit() : openToolkit(); }
g.RPGMToolkit = { version: '1.1.0', open: openToolkit, close: closeToolkit, toggle: toggleToolkit, isOpen: function() { return opened; } };
var heldCloseKey = null;
g.addEventListener('keydown', function(event) {
    var key = event.key || ({ 117: 'F6', 118: 'F7', 121: 'F10', 27: 'Escape' }[event.keyCode]);
    if (heldCloseKey === key && event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (key === hotkey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (opened || allowed()) { event.preventDefault(); event.stopImmediatePropagation(); heldCloseKey = key; if (!event.repeat) toggleToolkit(); } return;
    }
    if (!opened) return;
    if (key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); heldCloseKey = key; if (mobileLayout() && root.classList.contains('rt-detail-open')) { root.classList.remove('rt-detail-open'); var row = $('.rt-selected .rt-select'); if (row) row.focus(); } else closeToolkit(); return; }
    if ((event.ctrlKey || event.metaKey) && (key === 'f' || key === 'F')) { event.preventDefault(); event.stopImmediatePropagation(); if ($('#rt-search')) $('#rt-search').focus(); return; }
    if (key === 'Tab') {
        var focusables = Array.prototype.slice.call(root.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')).filter(function(el) { return el.offsetWidth || el.offsetHeight; });
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (event.shiftKey && (document.activeElement === first || focusables.indexOf(document.activeElement) < 0)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || focusables.indexOf(document.activeElement) < 0)) { event.preventDefault(); first.focus(); }
    }
    if (!root.contains(event.target)) { event.stopImmediatePropagation(); event.preventDefault(); $('.rt-panel').focus(); }
}, true);
g.addEventListener('keyup', function(event) {
    if (heldCloseKey && event.key === heldCloseKey) { event.stopImmediatePropagation(); heldCloseKey = null; }
}, true);
g.addEventListener('focus', function() { if (opened) clearInput(); });
function mountLauncher() {
    if (toolkitParams.ShowButton === 'false' || launch) return;
    buildRoot(); launch = document.createElement('button'); launch.className = 'rt-launch'; launch.type = 'button'; launch.textContent = '◇ Toolkit · ' + hotkey; launch.hidden = true;
    launch.setAttribute('aria-label', 'Ouvrir RPGM Toolkit (' + hotkey + ')');
    ['mousedown', 'mouseup', 'touchstart', 'touchend', 'pointerdown', 'pointerup'].forEach(function(type) { launch.addEventListener(type, function(event) { event.stopPropagation(); }, { passive: true }); });
    launch.addEventListener('click', function(event) { event.stopPropagation(); openToolkit(); });
    document.body.appendChild(launch);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLauncher); else mountLauncher();
var originalUpdateScene = g.SceneManager.updateScene;
g.SceneManager.updateScene = function() {
    if (opened && (this._scene !== openScene || g.$gameVariables !== openVariables || this.isSceneChanging())) closeToolkit();
    if (launch) { var hidden = opened || !allowed(); if (launch.hidden !== hidden) launch.hidden = hidden; }
    if (!opened) return originalUpdateScene.apply(this, arguments);
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
