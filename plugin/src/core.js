/* Runtime adapter. ES5 syntax for RPG Maker MV and MZ. */
function createToolkitRuntime(g, storage) {
    'use strict';
    var host = g.ToolkitHost;
    var kinds = host ? host.kinds : ['variables', 'switches', 'items', 'weapons', 'armors', 'actors', 'skills', 'states', 'selfSwitches'];
    var cache = {}, history = [], redo = [], log = [], baseline = {}, session = null;
    var prefs = { english: true, source: 'ja', favorites: {}, aliases: {}, settings: { language:'fr', fontSize:13, scrollbarWidth:24, pageSize:0, hotkey:'', showButton:true, safeTeleport:true, buttonX:0, buttonY:0, bottomClose:false, portrait:false, portraitPictures:true } };
    prefs.travel = { places:[], last:null };
    var storageWarning = false, frozen = {}, hooks = [], writing = false;
    function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function normal(value) {
        var text = String(value == null ? '' : value).toLowerCase();
        return text.normalize ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : text;
    }
    function hash(text) {
        var h = 2166136261, i;
        for (i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; }
        return h.toString(16);
    }
    var project = hash(host ? host.projectId : String(g.location && g.location.pathname || '') + '|' + (g.$dataSystem && g.$dataSystem.gameTitle || ''));
    var storageKey = 'rpgm-toolkit-v1:' + project;
    function savePrefs() {
        try { storage.setItem(storageKey, JSON.stringify(prefs)); storageWarning = false; }
        catch (e) { storageWarning = true; }
    }
    function validAlias(a) { return a && typeof a.original === 'string' && typeof a.english === 'string' && a.original.length <= 2000 && a.english.length <= 2000; }
    try {
        var saved = JSON.parse(storage.getItem(storageKey) || '{}');
        var settings = saved.settings || {};
        if (['fr','en'].indexOf(settings.language) >= 0) prefs.settings.language = settings.language;
        if ([12,13,15,17].indexOf(settings.fontSize) >= 0) prefs.settings.fontSize = settings.fontSize;
        if ([18,24,32].indexOf(settings.scrollbarWidth) >= 0) prefs.settings.scrollbarWidth = settings.scrollbarWidth;
        if ([20,40,60,80].indexOf(settings.pageSize) >= 0) prefs.settings.pageSize = settings.pageSize;
        if (['F6','F7','F10'].indexOf(settings.hotkey) >= 0) prefs.settings.hotkey = settings.hotkey;
        if (typeof settings.showButton === 'boolean') prefs.settings.showButton = settings.showButton;
        ['safeTeleport','bottomClose','portrait','portraitPictures'].forEach(function(k) { if (typeof settings[k] === 'boolean') prefs.settings[k] = settings[k]; });
        ['buttonX','buttonY'].forEach(function(k) { if (typeof settings[k] === 'number' && isFinite(settings[k])) prefs.settings[k] = Math.max(0, Math.min(100, settings[k])); });
        function place(p) { return p && typeof p.name === 'string' && p.name.length <= 80 && [p.mapId,p.x,p.y,p.direction].every(function(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }) && p.mapId > 0 && p.x >= 0 && p.y >= 0 && [2,4,6,8].indexOf(p.direction) >= 0; }
        if (saved.travel) { prefs.travel.places = (Array.isArray(saved.travel.places) ? saved.travel.places : []).filter(place).slice(0,100); prefs.travel.last = place(saved.travel.last) ? saved.travel.last : null; }
        if (typeof saved.english === 'boolean') prefs.english = saved.english;
        if (/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(saved.source || '')) prefs.source = saved.source;
        Object.keys(saved.favorites || {}).slice(0, 50000).forEach(function(k) { if (/^[a-zA-Z]+:[0-9]+(?:\.[0-9]+\.[A-D])?$/.test(k)) prefs.favorites[k] = !!saved.favorites[k]; });
        Object.keys(saved.aliases || {}).forEach(function(k) { if (/^[a-zA-Z]+:[0-9]+(?:\.[0-9]+\.[A-D])?$/.test(k) && validAlias(saved.aliases[k])) prefs.aliases[k] = saved.aliases[k]; });
    } catch (e) { storageWarning = true; }
    function ensureSession() {
        var current = host ? host.session : g.$gameVariables;
        if (session !== current) { removeHooks(); frozen = {}; session = current; history = []; redo = []; log = []; baseline = {}; cache = {}; }
    }
    function db(kind) {
        return { items: g.$dataItems, weapons: g.$dataWeapons, armors: g.$dataArmors, actors: g.$dataActors, skills: g.$dataSkills, states: g.$dataStates }[kind];
    }
    function makeRecord(kind, id, name, data) {
        return { kind: kind, id: id, key: kind + ':' + id, original: String(name || ''), data: data || null, search: normal(name) };
    }
    function list(kind) {
        ensureSession();
        if (kind === 'favorites') {
            var all = [];
            kinds.forEach(function(k) { all = all.concat(list(k).filter(function(r) { return !!prefs.favorites[r.key]; })); });
            return all;
        }
        if (kind === 'selfSwitches') {
            var mapId = g.$gameMap.mapId();
            if (cache.selfSwitchMap !== mapId) { delete cache.selfSwitches; cache.selfSwitchMap = mapId; }
        }
        if (cache[kind]) return cache[kind];
        var result = [], source, i;
        if (host) {
            (host.entries[kind] || []).forEach(function(entry) { result.push(makeRecord(kind, entry.reference, entry.name, entry)); });
        } else if (kind === 'variables' || kind === 'switches') {
            source = g.$dataSystem[kind] || [];
            for (i = 1; i < source.length; i++) result.push(makeRecord(kind, i, source[i]));
        } else if (kind === 'selfSwitches') {
            (g.$dataMap && g.$dataMap.events || []).forEach(function(event) {
                if (!event) return;
                ['A', 'B', 'C', 'D'].forEach(function(letter) {
                    var key = [g.$gameMap.mapId(), event.id, letter];
                    result.push(makeRecord(kind, key.join('.'), event.name + ' / ' + letter, key));
                });
            });
        } else {
            source = db(kind) || [];
            for (i = 1; i < source.length; i++) if (source[i]) result.push(makeRecord(kind, i, source[i].name, source[i]));
        }
        cache[kind] = result;
        return result;
    }
    function alias(r) { var a = prefs.aliases[r.key]; return a && a.original === r.original ? a.english : ''; }
    function title(r) { return (prefs.english && alias(r)) || r.original || '(sans nom)'; }
    function value(r) {
        if (host) return host.value(r);
        if (r.kind === 'variables') { var raw = g.$gameVariables._data && g.$gameVariables._data[r.id]; return typeof raw === 'boolean' ? raw : g.$gameVariables.value(r.id); }
        if (r.kind === 'switches') return g.$gameSwitches.value(r.id);
        if (r.kind === 'selfSwitches') return g.$gameSelfSwitches.value(r.data);
        if (/^(items|weapons|armors)$/.test(r.kind)) return g.$gameParty.numItems(r.data);
        if (r.kind === 'actors') { var a = g.$gameActors._data[r.id]; return a ? a.level : r.data.initialLevel; }
        return r.kind === 'skills' ? r.data.mpCost : r.data.priority;
    }
    function printable(v) {
        if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
        if (typeof v === 'object') { try { return JSON.stringify(v).slice(0, 300); } catch (e) { return '[Objet complexe]'; } }
        return String(v);
    }
    function capture() {
        baseline = {};
        (host ? kinds : ['variables', 'switches', 'selfSwitches']).forEach(function(kind) { list(kind).forEach(function(r) { if (!host || host.known(r)) baseline[r.key] = printable(value(r)); }); });
        return Object.keys(baseline).length;
    }
    function changed(r) { return own(baseline, r.key) && baseline[r.key] !== printable(value(r)); }
    function search(kind, query, filter) {
        var tokens = normal(query).trim().split(/\s+/).filter(Boolean);
        return list(kind).filter(function(r) {
            if (filter === 'int' && (host ? r.data.string : (typeof value(r) !== 'number' || !isFinite(value(r)) || Math.floor(value(r)) !== value(r)))) return false;
            if (filter === 'bool' && typeof value(r) !== 'boolean') return false;
            if (filter === 'text' && (host ? !r.data.string : typeof value(r) !== 'string')) return false;
            if (filter === 'frozen' && !(host ? host.frozen(r) : frozen[r.key])) return false;
            if (filter === 'favorites' && !prefs.favorites[r.key]) return false;
            if (filter === 'named' && !r.original.trim()) return false;
            if (filter === 'active' && !value(r)) return false;
            if (filter === 'changed' && !changed(r)) return false;
            var text = r.search + ' ' + normal(alias(r)) + ' ' + r.id;
            return tokens.every(function(token) {
                var m = /^(?:id:|#)(\d+)(?:-(\d+))?$/.exec(token);
                if (m) return Number(r.id) >= Number(m[1]) && Number(r.id) <= Number(m[2] || m[1]);
                if (token.indexOf('value:') === 0) return normal(printable(value(r))) === token.slice(6);
                return text.indexOf(token) >= 0;
            });
        });
    }
    function integer(input, min, max) {
        if (typeof input !== 'string' && typeof input !== 'number') throw new Error('Saisissez un nombre entier.');
        if (typeof input === 'string' && !/^-?\d+$/.test(input.trim())) throw new Error('Saisissez un nombre entier.');
        var n = Number(input);
        if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) throw new Error('Valeur attendue entre ' + min + ' et ' + max + '.');
        return n;
    }
    function note(label, before, after, reversible) {
        log.unshift({ label: label, before: printable(before), after: printable(after), reversible: reversible, time: new Date().toLocaleTimeString() });
        if (log.length > 100) log.pop();
    }
    function commit(label, read, write, next) {
        ensureSession();
        var before = read();
        if (before === next) return before;
        write(next);
        var after = read();
        if (after !== before) {
            history.push({ label: label, read: read, write: write, before: before, after: after });
            if (history.length > 80) history.shift();
            redo = [];
            note(label, before, after, true);
        }
        return after;
    }
    function assertRecord(r) {
        if (!r || list(r.kind).indexOf(r) < 0) throw new Error('Entrée périmée. Actualisez la liste.');
    }
    function editable(r) { return host ? host.editable(r) : /^(variables|switches|selfSwitches|items|weapons|armors)$/.test(r.kind) && /^(number|string|boolean)$/.test(typeof value(r)); }
    function validateValue(r, next) {
        assertRecord(r);
        if (host) return host.validate(r, next);
        if (!editable(r)) throw new Error('Cette entrée est en consultation : utilisez ses commandes spécifiques.');
        if (r.kind === 'variables') {
            if (typeof next === 'number') return integer(next, -9007199254740991, 9007199254740991);
            if (typeof next === 'boolean') return next;
            if (typeof next === 'string' && next.length <= 10000) return next;
            throw new Error('Nombre entier, booléen ou texte de 10 000 caractères maximum attendu.');
        }
        if (r.kind === 'switches' || r.kind === 'selfSwitches') {
            if (typeof next !== 'boolean') throw new Error('true ou false attendu pour tous les interrupteurs sélectionnés.');
            return next;
        }
        return integer(next, 0, g.$gameParty.maxItems(r.data));
    }
    function writeValue(r, next) {
        var previous = writing; writing = true;
        try {
            if (host) host.write(r, next);
            else if (r.kind === 'variables') g.$gameVariables.setValue(r.id, next);
            else if (r.kind === 'switches') g.$gameSwitches.setValue(r.id, next);
            else if (r.kind === 'selfSwitches') g.$gameSelfSwitches.setValue(r.data, next);
            else g.$gameParty.gainItem(r.data, next - value(r), false);
            if (frozen[r.key]) frozen[r.key].value = value(r);
        } finally { writing = previous; }
    }
    function setValue(r, next) {
        next = validateValue(r, next);
        return commit(title(r), function() { return value(r); }, function(x) { writeValue(r, x); }, next);
    }
    function uniqueRecords(records) {
        ensureSession();
        if (!records.length || records.length > 500) throw new Error('Sélectionnez entre 1 et 500 entrées.');
        var seen = {};
        return records.filter(function(r) { assertRecord(r); if (seen[r.key]) return false; seen[r.key] = true; return true; });
    }
    function setMany(records, next) {
        records = uniqueRecords(records);
        var target = records.map(function(r) { return validateValue(r, next); });
        function read() { return JSON.stringify(records.map(value)); }
        function write(payload) {
            var values = JSON.parse(payload), before = records.map(value), applied = 0;
            records.forEach(function(r, i) { validateValue(r, values[i]); });
            try {
                records.forEach(function(r, i) { applied = i + 1; writeValue(r, values[i]); if (value(r) !== values[i]) throw new Error('Le moteur a refusé une valeur du groupe.'); });
            } catch (e) {
                var failed = false;
                records.slice(0, applied).forEach(function(r, i) { try { writeValue(r, before[i]); if (value(r) !== before[i]) failed = true; } catch (_) { failed = true; } });
                if (failed) { history = []; redo = []; throw new Error('Restauration incomplète : contrôlez les valeurs du groupe avant de sauvegarder.'); }
                throw e;
            }
        }
        commit(records.length + ' entrées', read, write, JSON.stringify(target));
        return records.length;
    }
    function removeHooks() {
        hooks.forEach(function(h) { if (h.object[h.name] === h.wrapper) { if (h.own) h.object[h.name] = h.original; else delete h.object[h.name]; } });
        hooks = [];
    }
    function hook(object, name, key) {
        if (!object || typeof object[name] !== 'function') return;
        var original = object[name], hadOwn = own(object, name);
        var wrapper = function() { var lock = frozen[key.apply(null, arguments)]; if (!writing && lock) return; return original.apply(this, arguments); };
        // Non-enumerable: temporary guards must not be serialized in a save file.
        Object.defineProperty(object, name, { value: wrapper, configurable: true, writable: true, enumerable: false });
        hooks.push({ object: object, name: name, original: original, wrapper: wrapper, own: hadOwn });
    }
    function installHooks() {
        if (hooks.length) return;
        hook(g.$gameVariables, 'setValue', function(id) { return 'variables:' + id; });
        hook(g.$gameSwitches, 'setValue', function(id) { return 'switches:' + id; });
        hook(g.$gameSelfSwitches, 'setValue', function(key) { return 'selfSwitches:' + key.join('.'); });
        hook(g.$gameParty, 'gainItem', function(item) {
            if (!item) return '';
            var kind = g.$dataItems[item.id] === item ? 'items' : g.$dataWeapons[item.id] === item ? 'weapons' : 'armors';
            return kind + ':' + item.id;
        });
    }
    function freezeMany(records, active) {
        records = uniqueRecords(records);
        if (active) records.forEach(function(r) { validateValue(r, value(r)); });
        var added = records.filter(function(r) { return !(host ? host.frozen(r) : frozen[r.key]); }).length;
        if (active && (host ? host.frozenCount() : Object.keys(frozen).length) + added > 500) throw new Error('Maximum : 500 valeurs figées simultanément.');
        records.forEach(function(r) { if (active) frozen[r.key] = { record:r, value:value(r) }; else delete frozen[r.key]; });
        if (host) host.freeze(records, active);
        else if (Object.keys(frozen).length) installHooks(); else removeHooks();
        return records.length;
    }
    function enforceFrozen() {
        ensureSession();
        if (host) return;
        Object.keys(frozen).forEach(function(key) {
            var lock = frozen[key];
            if (value(lock.record) !== lock.value) {
                var target = lock.value;
                try { writeValue(lock.record, target); if (value(lock.record) !== target) delete frozen[key]; }
                catch (e) { delete frozen[key]; }
            }
        });
        if (hooks.length && !Object.keys(frozen).length) removeHooks();
    }
    function gold(next) {
        next = integer(next, 0, g.$gameParty.maxGold());
        return commit('Or', function() { return g.$gameParty.gold(); }, function(n) { g.$gameParty.gainGold(n - g.$gameParty.gold()); }, next);
    }
    function undoAction(isRedo) {
        ensureSession();
        var from = isRedo ? redo : history, to = isRedo ? history : redo, action = from[from.length - 1];
        if (!action) throw new Error('Aucune modification à ' + (isRedo ? 'rétablir.' : 'annuler.'));
        var expected = isRedo ? action.before : action.after, target = isRedo ? action.after : action.before;
        if (action.read() !== expected) throw new Error('Le jeu a changé cette valeur depuis. Annulation refusée pour préserver son état actuel.');
        action.write(target);
        if (action.read() !== target) { history = []; redo = []; throw new Error('Le moteur a limité la restauration. Historique réinitialisé.'); }
        from.pop(); to.push(action); note((isRedo ? 'Rétablir · ' : 'Annuler · ') + action.label, expected, target, false);
    }
    function actor(id) {
        if (!g.$dataActors[id]) throw new Error('Acteur introuvable.');
        return g.$gameActors.actor(id);
    }
    function actorAction(id, action, input) {
        ensureSession();
        if (g.$gameParty.inBattle()) throw new Error('Les modifications des acteurs sont disponibles hors combat.');
        var a = actor(id), n, old, label;
        if (/^(hp|mp|tp|level|exp)$/.test(action)) {
            var max = { hp: a.mhp, mp: a.mmp, tp: a.maxTp(), level: a.maxLevel(), exp: 999999999 }[action];
            n = integer(input, action === 'level' ? 1 : 0, max);
            old = action === 'exp' ? a.currentExp() : a[action]; label = action;
            if (action === 'hp') a.setHp(n);
            if (action === 'mp') a.setMp(n);
            if (action === 'tp') a.setTp(n);
            if (action === 'level') a.changeLevel(n, false);
            if (action === 'exp') a.changeExp(n, false);
        } else if (action === 'recover') { old = a.hp + ' HP'; a.recoverAll(); n = a.hp + ' HP'; label = 'Soins'; }
        else if (action === 'learn' || action === 'forget') {
            n = integer(input, 1, (g.$dataSkills || []).length - 1);
            if (!g.$dataSkills[n]) throw new Error('Compétence introuvable.');
            old = a.isLearnedSkill(n); a[action === 'learn' ? 'learnSkill' : 'forgetSkill'](n); label = action + ' #' + n; n = a.isLearnedSkill(n);
        } else if (action === 'addState' || action === 'removeState') {
            n = integer(input, 1, (g.$dataStates || []).length - 1);
            if (!g.$dataStates[n]) throw new Error('État introuvable.');
            old = a.isStateAffected(n); a[action](n); label = action + ' #' + n; n = a.isStateAffected(n);
        } else { throw new Error('Commande inconnue.'); }
        history = []; redo = [];
        note(a.name() + ' · ' + label, old, n, false);
        return a;
    }
    function equip(id, slot, record) {
        if (g.$gameParty.inBattle()) throw new Error('Équipement disponible hors combat.');
        var a = actor(id), slots = a.equipSlots();
        slot = integer(slot, 0, slots.length - 1);
        var item = record ? record.data : null;
        if (!a.isEquipChangeOk(slot)) throw new Error('Cet emplacement est verrouillé par le jeu.');
        if (record) {
            assertRecord(record);
            if (!/^(weapons|armors)$/.test(record.kind) || slots[slot] !== item.etypeId || !a.canEquip(item)) throw new Error('Cet équipement ne convient pas à cet acteur ou à cet emplacement.');
            if (!g.$gameParty.hasItem(item, false)) throw new Error('Ajoutez cet équipement à l’inventaire avant de l’équiper.');
        }
        var old = a.equips()[slot]; a.changeEquip(slot, item);
        if (a.equips()[slot] !== item) throw new Error('Le moteur a refusé cet équipement.');
        history = []; redo = []; note(a.name() + ' · équipement', old && old.name || '—', item && item.name || '—', false);
    }
    function setAliases(records, text) {
        records.forEach(assertRecord);
        if (typeof text !== 'string' || text.length > 2000) throw new Error('Traduction invalide.');
        records.forEach(function(r) {
            if (text.trim()) prefs.aliases[r.key] = { original: r.original, english: text.trim() };
            else delete prefs.aliases[r.key];
        });
        savePrefs();
    }
    function setAlias(r, text) { setAliases([r], text); }
    function clearAliases() {
        prefs.aliases = {};
        savePrefs();
        return !storageWarning;
    }
    function importAliases(payload) {
        if (!payload || payload.format !== 'rpgm-toolkit-translations-v1' || !Array.isArray(payload.entries) || payload.entries.length > 50000) throw new Error('Dictionnaire JSON non reconnu.');
        var lookup = {}, staged = [], skipped = 0;
        kinds.forEach(function(kind) { list(kind).forEach(function(r) { lookup[r.key] = r; }); });
        payload.entries.forEach(function(entry) {
            if (!entry || typeof entry.key !== 'string' || !validAlias(entry)) throw new Error('Entrée de traduction invalide. Aucune traduction importée.');
            var r = lookup[entry.key];
            if (!r || r.original !== entry.original || !entry.english.trim()) { skipped++; return; }
            staged.push({ record: r, text: entry.english });
        });
        staged.forEach(function(e) { prefs.aliases[e.record.key] = { original: e.record.original, english: e.text }; });
        savePrefs(); return { imported: staged.length, skipped: skipped };
    }
    return {
        kinds: kinds, prefs: prefs, project: project, list: list, db: db, value: value, title: title, alias: alias,
        editable: editable, setMany: setMany, freezeMany: freezeMany, enforceFrozen: enforceFrozen,
        isFrozen: function(r) { ensureSession(); return host ? host.frozen(r) : !!frozen[r.key]; }, frozenCount: function() { ensureSession(); return host ? host.frozenCount() : Object.keys(frozen).length; },
        search: search, printable: printable, integer: integer, setValue: setValue, gold: gold, actor: actor, actorAction: actorAction, equip: equip,
        undo: function() { undoAction(false); }, redo: function() { undoAction(true); },
        canUndo: function() { ensureSession(); return history.length > 0; }, canRedo: function() { ensureSession(); return redo.length > 0; },
        log: function() { ensureSession(); return log; }, capture: capture, changed: changed,
        refresh: function() { ensureSession(); cache = {}; }, savePrefs: savePrefs, storageWarning: function() { return storageWarning; },
        clearHistory: function() { history = []; redo = []; },
        acceptBaseline: function(records) { records.forEach(function(r) { if (!own(baseline,r.key)) baseline[r.key]=printable(value(r)); }); },
        setAlias: setAlias, setAliases: setAliases, clearAliases: clearAliases, importAliases: importAliases,
        exportAliases: function() {
            return { format: 'rpgm-toolkit-translations-v1', project: project, entries: Object.keys(prefs.aliases).map(function(k) { return { key: k, original: prefs.aliases[k].original, english: prefs.aliases[k].english }; }) };
        }
    };
}
