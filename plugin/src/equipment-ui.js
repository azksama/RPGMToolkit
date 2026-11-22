var gearView = null, gearTimer = null;

function gearItemName(item) {
    var record = runtime.gearRecord(item);
    return record ? runtime.title(record) : item ? item.name : '';
}

function openGear(actorId, preferred) {
    var fromEditor = modalMode === 'edit';
    var members = gameTools.members().slice();
    if (actorId && !members.some(function(a) { return a.actorId() === actorId; })) members.push(runtime.actor(actorId));
    openModal('equipment', 'Équipements');
    gearView = { fromEditor:fromEditor, page:0, rows:[] };
    if (!members.length) {
        $('.rt-modal-content').innerHTML = empty('Aucun acteur dans l’équipe.', '');
        return;
    }
    $('.rt-modal-content').innerHTML =
        '<div class="rt-gear-fields"><label class="rt-field"><span>Acteur</span><select id="rt-gear-actor" data-game-text></select></label>' +
        '<label class="rt-field"><span>Emplacement</span><select id="rt-gear-slot" data-game-text></select></label></div>' +
        '<div class="rt-gear-worn"><div><small>Équipement porté</small><strong id="rt-gear-current"></strong></div>' +
        button('Déséquiper','gear-remove') + '</div>' +
        field('Rechercher un équipement','rt-gear-query','','search','autocomplete="off" placeholder="Nom ou #ID"') +
        '<label class="rt-gear-owned"><input type="checkbox" id="rt-gear-owned"> <span>En stock uniquement</span></label>' +
        '<ul class="rt-gear-list" id="rt-gear-list"></ul><div class="rt-actions rt-gear-pages" id="rt-gear-pages"></div>';
    var actors = $('#rt-gear-actor');
    actors.innerHTML = members.map(function(a) {
        return '<option value="' + a.actorId() + '">' + esc(a.name()) + '</option>';
    }).join('');
    if (actorId) actors.value = String(actorId);
    renderGearSlots(preferred);
    if (preferred) $('#rt-gear-query').value = '#' + preferred.id;
    renderGearList();
}

function renderGearSlots(preferred) {
    var a = runtime.actor(Number($('#rt-gear-actor').value)), slots = a.equipSlots(), worn = a.equips();
    var select = $('#rt-gear-slot'), previous = select.selectedIndex;
    select.innerHTML = slots.map(function(type, i) {
        var name = (g.$dataSystem.equipTypes || [])[type] || '#' + type;
        return '<option value="' + i + '">' + (i+1) + ' · ' + esc(name) + '</option>';
    }).join('');
    if (!slots.length) return;
    var index = Math.max(0, Math.min(previous, slots.length - 1));
    if (preferred) {
        var best = -1, score = -1;
        slots.forEach(function(type, i) {
            if (!runtime.gearFits(a, type, preferred)) return;
            var rank = (a.isEquipChangeOk(i) ? 4 : 0) + (worn[i] === preferred.data ? 2 : !worn[i] ? 1 : 0);
            if (rank > score) { best = i; score = rank; }
        });
        if (best >= 0) index = best;
    }
    select.selectedIndex = index;
}

function gearDifference(item, worn) {
    var labels = ['HP','MP','ATK','DEF','MAT','MDF','AGI','LUK'];
    return (item.params || []).map(function(value, i) {
        var delta = value - (worn && worn.params && worn.params[i] || 0);
        return delta ? labels[i] + ' ' + (delta > 0 ? '+' : '') + delta : '';
    }).filter(Boolean).join(' · ');
}

function renderGearList() {
    if (modalMode !== 'equipment' || !$('#rt-gear-slot')) return;
    var a = runtime.actor(Number($('#rt-gear-actor').value)), slot = $('#rt-gear-slot').selectedIndex;
    var type = a.equipSlots()[slot], worn = a.equips()[slot], current = $('#rt-gear-current');
    var unlocked = slot >= 0 && !g.$gameParty.inBattle() && a.isEquipChangeOk(slot);
    var old = runtime.gearRecord(worn);
    var canReturn = !worn || ((!old || !runtime.isFrozen(old)) && g.$gameParty.numItems(worn) < g.$gameParty.maxItems(worn));
    current.textContent = worn ? gearItemName(worn) : 'Vide';
    if (worn) current.setAttribute('data-game-text',''); else current.removeAttribute('data-game-text');
    $('[data-action="gear-remove"]').disabled = !worn || !unlocked || !canReturn;
    var query = $('#rt-gear-query').value, owned = $('#rt-gear-owned').checked;
    var candidates = [];
    if (slot >= 0) ['weapons','armors'].forEach(function(kind) {
        runtime.search(kind, query, owned ? 'active' : 'all').forEach(function(r) {
            if (runtime.gearFits(a, type, r)) candidates.push(r);
        });
    });
    var perPage = 20, pages = Math.max(1, Math.ceil(candidates.length / perPage));
    gearView.page = Math.min(Math.max(gearView.page, 0), pages - 1);
    gearView.rows = candidates.slice(gearView.page * perPage, (gearView.page + 1) * perPage);
    var list = $('#rt-gear-list');
    list.innerHTML = gearView.rows.map(function(r, i) {
        var count = runtime.value(r), max = g.$gameParty.maxItems(r.data), same = r.data === worn;
        var diff = gearDifference(r.data, worn);
        var canWear = unlocked && canReturn && !same && !runtime.isFrozen(r) && (count > 0 || max > 0);
        function action(label, command, disabled, accessible) {
            return '<button type="button" data-action="gear-' + command + '" data-index="' + i + '"' +
                (disabled ? ' disabled' : '') + (accessible ? ' aria-label="' + accessible + '"' : '') + '>' + label + '</button>';
        }
        var icon = typeof r.data.iconIndex === 'number' ? '<canvas class="rt-icon" width="32" height="32" data-icon="'+Number(r.data.iconIndex)+'" aria-hidden="true"></canvas>' : '';
        return '<li><div class="rt-gear-name">' + icon + '<div><strong data-game-text>' + esc(runtime.title(r)) +
            '</strong><small>#' + r.id + (diff ? ' · ' + esc(diff) : '') + '</small></div></div><div class="rt-gear-controls">' +
            '<span class="rt-gear-count"><span>Sac</span> ×' + count + '</span>' +
            action('−1','take',count <= 0,'Retirer un exemplaire du sac') + action('+1','give',count >= max,'Ajouter un exemplaire au sac') +
            action(same ? 'Équipé' : count ? 'Équiper' : 'Créer et équiper', count ? 'wear' : 'create', !canWear) + '</div></li>';
    }).join('') || '<li class="rt-muted">Aucun équipement compatible.</li>';
    var pager = $('#rt-gear-pages');
    pager.innerHTML = pages <= 1 ? '' : '<button type="button" data-action="gear-prev" aria-label="Page précédente"' +
        (!gearView.page ? ' disabled' : '') + '>‹</button><span>' + (gearView.page+1) + ' / ' + pages +
        '</span><button type="button" data-action="gear-next" aria-label="Page suivante"' + (gearView.page+1 === pages ? ' disabled' : '') + '>›</button>';
    var reason = g.$gameParty.inBattle() ? 'Équipement disponible hors combat.' : slot < 0 ? 'Aucun emplacement.' :
        !unlocked ? 'Cet emplacement est verrouillé par le jeu.' : !canReturn ? (old && runtime.isFrozen(old) ? 'Libérez la quantité figée avant cet échange.' : 'Le sac est plein pour l’équipement à retirer.') : '';
    if (reason) say(reason);
    paintIcons(list);
}

function gearAction(action, node) {
    if (modalMode !== 'equipment' || !gearView) return;
    var actorId = Number($('#rt-gear-actor').value), slot = $('#rt-gear-slot').selectedIndex;
    var r = gearView.rows[Number(node.getAttribute('data-index'))];
    if (action === 'prev' || action === 'next') {
        gearView.page += action === 'next' ? 1 : -1;
        renderGearList();
        $('#rt-gear-list').scrollIntoView({block:'start'});
        return;
    }
    if (action === 'give' || action === 'take') {
        runtime.setValue(r, runtime.value(r) + (action === 'give' ? 1 : -1));
        say('Quantité mise à jour.');
    } else {
        runtime.equip(actorId, slot, action === 'remove' ? null : r, action === 'create');
        renderGearSlots();
        say(action === 'remove' ? 'Équipement remis dans le sac.' : 'Équipement appliqué.');
    }
    dirty = true;
    renderGearList();
}

function gearInput(event) {
    if (modalMode !== 'equipment') return;
    var id = event.target.id;
    if (['rt-gear-actor','rt-gear-slot','rt-gear-owned','rt-gear-query'].indexOf(id) < 0) return;
    if (event.type !== (id === 'rt-gear-query' ? 'input' : 'change')) return;
    if (id === 'rt-gear-actor') renderGearSlots();
    gearView.page = 0;
    say('');
    clearTimeout(gearTimer);
    if (id === 'rt-gear-query') gearTimer = setTimeout(function() { guarded(renderGearList); }, 100);
    else renderGearList();
}
