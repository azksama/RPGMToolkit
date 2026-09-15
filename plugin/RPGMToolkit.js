/*:
 * @target MZ
 * @plugindesc v1.3.0 (MV/MZ) — Variables, inventaire, acteurs et traductions anglaises.
 * @author RPGM Toolkit
 *
 * @param Hotkey
 * @text Touche d'ouverture
 * @type select
 * @option F6
 * @option F7
 * @option F10
 * @default F6
 *
 * @param ShowButton
 * @text Afficher le bouton Toolkit
 * @type boolean
 * @default true
 *
 * @param PlaytestOnly
 * @text Uniquement en test
 * @type boolean
 * @default false
 *
 * @param PageSize
 * @text Entrées par page (20–80)
 * @type number
 * @min 20
 * @max 80
 * @default 60
 *
 * @command Open
 * @text Ouvrir le Toolkit
 * @command Close
 * @text Fermer le Toolkit
 *
 * @help
 * RPGM Toolkit 1.3.0 — RPG Maker MV 1.6+ / MZ
 * Copiez ce fichier dans js/plugins, puis activez RPGMToolkit en dernier
 * dans le gestionnaire de plugins. Chargez une partie et appuyez sur F6.
 * Toolbox ouvre le menu global. Choisissez Éditeurs ou un outil de jeu.
 * Disponible sur la carte ; le jeu est mis en pause pendant l'édition.
 *
 * Variables : noms, ID, value:42, id:10-50, favoris, repère de comparaison.
 * Interrupteurs globaux et locaux de la carte courante.
 * Objets / armes / armures : recherche, quantité, ajout, retrait.
 * Acteurs : HP, MP, TP, niveau, EXP, compétences, états, équipement.
 * Annuler/rétablir : variables, interrupteurs, inventaire et or (80 actions).
 * Les actions acteurs vident la pile d'annulation ; elles restent au journal.
 *
 * Les noms anglais sont des alias d'affichage stockés localement par jeu.
 * Les données d'origine ne sont jamais renommées. Les alias peuvent être
 * saisis ou importés hors ligne. MyMemory traduit sur clic explicite ;
 * seuls les noms choisis sont envoyés, avec trois requêtes simultanées.
 * Tout traduire couvre les noms du catalogue, déjà traduits exclus.
 * Internet et quota disponible requis. Résultats conservés localement.
 *
 * MV : commande de plugin RPGMToolkit Open / RPGMToolkit Close
 * MZ : commandes Ouvrir / Fermer le Toolkit
 * Script : RPGMToolkit.open() / close() / toggle()
 * Les changements de partie deviennent permanents via la sauvegarde du jeu.
 * Aucun autosave ajouté. Voir LIRE-MOI.md pour les limites et l'installation.
 */

(function(g) {
"use strict";
if (g.RPGMToolkit) return;
/* Runtime adapter. ES5 syntax for RPG Maker MV and MZ. */
function createToolkitRuntime(g, storage) {
    'use strict';
    var kinds = ['variables', 'switches', 'items', 'weapons', 'armors', 'actors', 'skills', 'states', 'selfSwitches'];
    var cache = {}, history = [], redo = [], log = [], baseline = {}, session = null;
    var prefs = { english: true, source: 'ja', favorites: {}, aliases: {} };
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
    var project = hash(String(g.location && g.location.pathname || '') + '|' + (g.$dataSystem && g.$dataSystem.gameTitle || ''));
    var storageKey = 'rpgm-toolkit-v1:' + project;
    function savePrefs() {
        try { storage.setItem(storageKey, JSON.stringify(prefs)); storageWarning = false; }
        catch (e) { storageWarning = true; }
    }
    function validAlias(a) { return a && typeof a.original === 'string' && typeof a.english === 'string' && a.original.length <= 2000 && a.english.length <= 2000; }
    try {
        var saved = JSON.parse(storage.getItem(storageKey) || '{}');
        if (typeof saved.english === 'boolean') prefs.english = saved.english;
        if (/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(saved.source || '')) prefs.source = saved.source;
        Object.keys(saved.favorites || {}).slice(0, 50000).forEach(function(k) { if (/^[a-zA-Z]+:[0-9]+(?:\.[0-9]+\.[A-D])?$/.test(k)) prefs.favorites[k] = !!saved.favorites[k]; });
        Object.keys(saved.aliases || {}).forEach(function(k) { if (/^[a-zA-Z]+:[0-9]+(?:\.[0-9]+\.[A-D])?$/.test(k) && validAlias(saved.aliases[k])) prefs.aliases[k] = saved.aliases[k]; });
    } catch (e) { storageWarning = true; }
    function ensureSession() {
        if (session !== g.$gameVariables) { removeHooks(); frozen = {}; session = g.$gameVariables; history = []; redo = []; log = []; baseline = {}; cache = {}; }
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
        if (kind === 'variables' || kind === 'switches') {
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
        ['variables', 'switches', 'selfSwitches'].forEach(function(kind) { list(kind).forEach(function(r) { baseline[r.key] = printable(value(r)); }); });
        return Object.keys(baseline).length;
    }
    function changed(r) { return own(baseline, r.key) && baseline[r.key] !== printable(value(r)); }
    function search(kind, query, filter) {
        var tokens = normal(query).trim().split(/\s+/).filter(Boolean);
        return list(kind).filter(function(r) {
            if (filter === 'int' && (typeof value(r) !== 'number' || !isFinite(value(r)) || Math.floor(value(r)) !== value(r))) return false;
            if (filter === 'bool' && typeof value(r) !== 'boolean') return false;
            if (filter === 'text' && typeof value(r) !== 'string') return false;
            if (filter === 'frozen' && !frozen[r.key]) return false;
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
    function editable(r) { return /^(variables|switches|selfSwitches|items|weapons|armors)$/.test(r.kind) && /^(number|string|boolean)$/.test(typeof value(r)); }
    function validateValue(r, next) {
        assertRecord(r);
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
            if (r.kind === 'variables') g.$gameVariables.setValue(r.id, next);
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
        var added = records.filter(function(r) { return !frozen[r.key]; }).length;
        if (active && Object.keys(frozen).length + added > 500) throw new Error('Maximum : 500 valeurs figées simultanément.');
        records.forEach(function(r) { if (active) frozen[r.key] = { record:r, value:value(r) }; else delete frozen[r.key]; });
        if (Object.keys(frozen).length) installHooks(); else removeHooks();
        return records.length;
    }
    function enforceFrozen() {
        ensureSession();
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
        isFrozen: function(r) { ensureSession(); return !!frozen[r.key]; }, frozenCount: function() { ensureSession(); return Object.keys(frozen).length; },
        search: search, printable: printable, integer: integer, setValue: setValue, gold: gold, actor: actor, actorAction: actorAction, equip: equip,
        undo: function() { undoAction(false); }, redo: function() { undoAction(true); },
        canUndo: function() { ensureSession(); return history.length > 0; }, canRedo: function() { ensureSession(); return redo.length > 0; },
        log: function() { ensureSession(); return log; }, capture: capture, changed: changed,
        refresh: function() { ensureSession(); cache = {}; }, savePrefs: savePrefs, storageWarning: function() { return storageWarning; },
        setAlias: setAlias, setAliases: setAliases, importAliases: importAliases,
        exportAliases: function() {
            return { format: 'rpgm-toolkit-translations-v1', project: project, entries: Object.keys(prefs.aliases).map(function(k) { return { key: k, original: prefs.aliases[k].original, english: prefs.aliases[k].english }; }) };
        }
    };
}

/* Session-scoped game tools. Wrappers are removed when disabled or on save load. */
function createToolkitTools(g) {
    'use strict';
    var session = g.$gameVariables, god = false, noclip = false, hooks = [], epoch = 0;
    function integer(n, min, max) {
        if (!/^-?\d+$/.test(String(n).trim()) || !isFinite(Number(n)) || Number(n) < min || Number(n) > max) throw new Error('Entier attendu entre ' + min + ' et ' + max + '.');
        return Number(n);
    }
    function members() { return g.$gameParty.allMembers ? g.$gameParty.allMembers() : g.$gameParty.members(); }
    function partyActor(a) { return typeof a.actorId === 'function' && (g.$gameParty._actors ? g.$gameParty._actors.indexOf(a.actorId()) >= 0 : members().indexOf(a) >= 0); }
    function wrap(object, name, group, factory) {
        if (!object || typeof object[name] !== 'function') return;
        var descriptor = Object.getOwnPropertyDescriptor(object, name), original = object[name], wrapped = factory(original);
        Object.defineProperty(object, name, { configurable: true, writable: true, enumerable: false, value: wrapped });
        hooks.push({ object: object, name: name, descriptor: descriptor, original: original, wrapped: wrapped, group: group });
    }
    function remove(group) {
        hooks = hooks.filter(function(h) {
            if (group && h.group !== group) return true;
            if (h.object[h.name] === h.wrapped) {
                if (h.descriptor) Object.defineProperty(h.object, h.name, h.descriptor); else delete h.object[h.name];
            }
            return false;
        });
    }
    function sync() {
        if (session !== g.$gameVariables) { god = false; noclip = false; remove(); session = g.$gameVariables; epoch++; }
    }
    function ensureMap() {
        sync();
        if (g.$gameParty.inBattle() || g.$gamePlayer.isTransferring() || g.$gameMap.isEventRunning() || g.$gameMessage.isBusy()) throw new Error('Attendez la fin du combat, du dialogue ou de l’événement.');
    }
    function setGod(active) {
        sync(); if (god === active) return;
        if (!active) { god = false; remove('god'); return; }
        if (!g.Game_BattlerBase || !g.Game_Battler) throw new Error('API des combattants indisponible dans ce jeu.');
        god = true;
        try {
            wrap(g.Game_BattlerBase.prototype, 'setHp', 'god', function(original) { return function(value) { return original.call(this, god && partyActor(this) ? this.mhp : value); }; });
            wrap(g.Game_Battler.prototype, 'addState', 'god', function(original) { return function(id) { if (god && partyActor(this) && id === this.deathStateId()) return; return original.apply(this, arguments); }; });
            wrap(g.Game_BattlerBase.prototype, 'refresh', 'god', function(original) { return function() {
                if (god && partyActor(this)) { this._hp = this.mhp; this.eraseState(this.deathStateId()); }
                var result = original.apply(this, arguments);
                if (god && partyActor(this)) { this._hp = this.mhp; this.eraseState(this.deathStateId()); }
                return result;
            }; });
            members().forEach(function(a) { a.setHp(a.mhp); a.removeState(a.deathStateId()); });
        } catch (e) { god = false; remove('god'); throw e; }
    }
    function setNoclip(active) {
        sync(); if (noclip === active) return;
        if (!active) { noclip = false; remove('noclip'); return; }
        if (typeof g.$gamePlayer.isThrough !== 'function') throw new Error('API de déplacement indisponible.');
        noclip = true;
        try { wrap(g.$gamePlayer, 'isThrough', 'noclip', function(original) { return function() { return noclip || original.apply(this, arguments); }; }); }
        catch (e) { noclip = false; remove('noclip'); throw e; }
    }
    function tick() {
        sync();
        if (god) members().forEach(function(a) { if (a.hp < a.mhp || a.isStateAffected(a.deathStateId())) { a.setHp(a.mhp); a.removeState(a.deathStateId()); } });
    }
    function targets(id) {
        var list = members();
        if (String(id) === 'all') return list;
        id = integer(id, 1, 999999);
        list = list.filter(function(a) { return a.actorId() === id; });
        if (!list.length) throw new Error('Acteur absent de l’équipe.');
        return list;
    }
    function resources(id, hp, mp, tp, full) {
        ensureMap();
        var list = targets(id);
        list.forEach(function(a) { if (!full) { integer(hp, 0, a.mhp); integer(mp, 0, a.mmp); integer(tp, 0, a.maxTp()); } });
        list.forEach(function(a) { a.setHp(full ? a.mhp : Number(hp)); a.setMp(full ? a.mmp : Number(mp)); a.setTp(full ? a.maxTp() : Number(tp)); });
        return list.length;
    }
    function stat(id, param, next) {
        ensureMap(); var a = targets(id)[0];
        if (param === 'level') a.changeLevel(integer(next, 1, a.maxLevel()), false);
        else if (param === 'exp') a.changeExp(integer(next, 0, 999999999), false);
        else { param = integer(param, 0, 7); next = integer(next, -999999, 999999); a.addParam(param, next - (a._paramPlus[param] || 0)); }
        return a;
    }
    function maps(query) {
        query = String(query || '').toLowerCase();
        return (g.$dataMapInfos || []).filter(function(m) { return m && (String(m.id) + ' ' + m.name).toLowerCase().indexOf(query) >= 0; }).slice(0, 200);
    }
    function loadMap(id) {
        sync(); id = integer(id, 1, 999999);
        if (!g.$dataMapInfos || !g.$dataMapInfos[id]) return Promise.reject(new Error('Carte inconnue.'));
        var token = epoch;
        function metadata(data) {
            sync(); if (token !== epoch) throw new Error('La partie a changé.');
            return { id:id, width:integer(data.width,1,10000), height:integer(data.height,1,10000), epoch:token };
        }
        if (id === g.$gameMap.mapId() && g.$dataMap && g.$dataMap.width) return Promise.resolve(metadata(g.$dataMap));
        return new Promise(function(resolve,reject) {
            var xhr = new g.XMLHttpRequest();
            xhr.open('GET', 'data/Map' + ('000' + id).slice(-Math.max(3,String(id).length)) + '.json'); xhr.timeout = 15000;
            xhr.onload = function() { try { if (xhr.status !== 200 && !(xhr.status === 0 && xhr.responseText)) throw new Error('Impossible de lire la carte.'); resolve(metadata(JSON.parse(xhr.responseText))); } catch(e) { reject(e); } };
            xhr.onerror = function() { reject(new Error('La carte est inaccessible.')); };
            xhr.ontimeout = function() { reject(new Error('Le chargement de la carte a expiré.')); };
            xhr.send();
        });
    }
    function teleport(map, x, y, direction) {
        ensureMap();
        if (!map || map.epoch !== epoch || !g.$dataMapInfos[map.id]) throw new Error('Chargez d’abord la carte de destination.');
        x = integer(x,0,map.width-1); y = integer(y,0,map.height-1); direction = integer(direction,0,8);
        if ([0,2,4,6,8].indexOf(direction) < 0) throw new Error('Direction invalide.');
        g.$gamePlayer.reserveTransfer(map.id,x,y,direction,0);
    }
    return { sync:sync, tick:tick, setGod:setGod, setNoclip:setNoclip, members:members, resources:resources, stat:stat, maps:maps, loadMap:loadMap, teleport:teleport,
        state:function() { sync(); return { god:god, noclip:noclip }; } };
}

/* Explicit translation of names only. Three bounded workers, no artificial delay. */
function createToolkitTranslator(runtime, g) {
    'use strict';
    var active = null;
    function stopped() { return new Error('Traduction arrêtée.'); }
    function finish(run, error) {
        if (run.finished) return;
        run.finished = true;
        if (active === run) active = null;
        run.requests.slice().forEach(function(xhr) { xhr.abort(); });
        run.requests = [];
        if (error) run.reject(error); else run.resolve(run.completed);
    }
    function cancel() { if (active) finish(active, stopped()); }
    function check(run) {
        if (run.finished || active !== run || run.session !== g.$gameVariables) throw stopped();
    }
    function request(run, name, source) {
        return new Promise(function(resolve, reject) {
            var xhr = new g.XMLHttpRequest(); run.requests.push(xhr);
            function release() { var i = run.requests.indexOf(xhr); if (i >= 0) run.requests.splice(i, 1); }
            xhr.open('GET', 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(name) + '&langpair=' + encodeURIComponent(source + '|en'), true);
            xhr.timeout = 15000;
            xhr.onload = function() {
                release();
                try {
                    if (xhr.status !== 200) throw new Error('Service indisponible (HTTP ' + xhr.status + ').');
                    var response = JSON.parse(xhr.responseText);
                    if (Number(response.responseStatus) !== 200 || response.quotaFinished) throw new Error('Traduction refusée ou quota MyMemory épuisé. Réessayez plus tard.');
                    var translated = response.responseData && response.responseData.translatedText;
                    if (typeof translated !== 'string' || !translated.trim() || translated.length > 2000) throw new Error('Réponse de traduction invalide.');
                    resolve(translated);
                } catch (e) { reject(e); }
            };
            xhr.onerror = function() { release(); reject(new Error('Connexion impossible. Vérifiez le réseau ou les restrictions CORS du jeu.')); };
            xhr.ontimeout = function() { release(); reject(new Error('Le service met trop de temps à répondre.')); };
            xhr.onabort = function() { release(); reject(stopped()); };
            xhr.send();
        });
    }
    function translate(records, source, progress) {
        if (active) return Promise.reject(new Error('Une traduction est déjà en cours.'));
        if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(source)) return Promise.reject(new Error('Choisissez la langue d’origine.'));
        var run = { session: g.$gameVariables, requests: [], finished: false, completed: 0 };
        active = run;
        return new Promise(function(resolve, reject) {
            run.resolve = resolve; run.reject = reject;
            Promise.resolve().then(function() {
                check(run);
                var groups = [], byName = Object.create(null), seen = Object.create(null), total = 0, index = 0, workers = 0;
                records.forEach(function(r) {
                    if (seen[r.key] || !r.original.trim() || runtime.alias(r)) return;
                    seen[r.key] = true;
                    if (source !== 'en' && new Blob([r.original]).size > 500) throw new Error('Un nom dépasse la limite de 500 octets du service. Utilisez un alias manuel.');
                    if (!byName[r.original]) { byName[r.original] = []; groups.push(byName[r.original]); }
                    byName[r.original].push(r); total++;
                });
                function worker() {
                    try {
                        check(run);
                        if (index >= groups.length) { if (--workers === 0) finish(run); return; }
                        var group = groups[index++], original = group[0].original;
                        var result = source === 'en' ? Promise.resolve(original) : request(run, original, source);
                        result.then(function(english) {
                            check(run);
                            var missing = group.filter(function(r) { return !runtime.alias(r); });
                            if (missing.length) runtime.setAliases(missing, english);
                            run.completed += group.length;
                            if (progress) progress(run.completed, total);
                            worker();
                        }).catch(function(e) { finish(run, e); });
                    } catch (e) { finish(run, e); }
                }
                if (!groups.length) { finish(run); return; }
                workers = Math.min(3, groups.length);
                var count = workers;
                for (var i = 0; i < count; i++) worker();
            }).catch(function(e) { finish(run, e); });
        });
    }
    return { translate: translate, cancel: cancel, busy: function() { return !!active; } };
}

var TOOLKIT_CSS = "/* Compact full-screen editor. No width-dependent sidebar or oversized touch theme. */\n.rt,.rt-launch { box-sizing:border-box; font:13px/1.4 system-ui,'Segoe UI',Arial,sans-serif; color:#eef0f4; text-align:left; letter-spacing:normal; }\n.rt *,.rt *::before,.rt *::after { box-sizing:border-box; }\n.rt { position:fixed; z-index:2147483001; inset:0; display:flex; padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px); background:#181a1f; user-select:text; }\n.rt[hidden],.rt [hidden],.rt-launch[hidden] { display:none !important; }\n.rt header,.rt main,.rt footer,.rt section,.rt aside,.rt nav { position:static; top:auto; right:auto; bottom:auto; left:auto; float:none; margin:0; }\n.rt button,.rt input,.rt select,.rt textarea { font:inherit; color:inherit; margin:0; touch-action:manipulation; }\n.rt button { cursor:pointer; border:1px solid #4f5663; border-radius:4px; background:#292d35; padding:4px 8px; min-height:30px; line-height:1.2; white-space:nowrap; }\n.rt button:hover { background:#363d49; }\n.rt button:disabled { opacity:.38; cursor:default; }\n.rt button:focus-visible,.rt input:focus-visible,.rt select:focus-visible,.rt textarea:focus-visible,.rt-launch:focus-visible { outline:2px solid #a9cafa; outline-offset:-2px; }\n.rt button[aria-pressed=true] { color:#b7d3fb; border-color:#799dcd; background:#2a3b53; }\n.rt .rt-primary { background:#91b8ee; color:#10223a; border-color:#91b8ee; font-weight:600; }\n.rt .rt-primary:hover { background:#b2cff7; color:#10223a; }\n.rt input:not([type=checkbox]),.rt select,.rt textarea { width:100%; min-width:0; border:1px solid #535c6c; border-radius:4px; background:#15171c; padding:4px 7px; min-height:30px; }\n.rt input::placeholder { color:#a9b2c1; opacity:1; }\n.rt input[type=checkbox] { width:16px; height:16px; accent-color:#91b8ee; flex-shrink:0; cursor:pointer; }\n.rt .rt-panel { display:flex; flex-direction:column; width:100%; height:100%; min-height:0; min-width:0; overflow:hidden; background:#1e2127; }\n.rt .rt-header { flex-shrink:0; padding:5px 8px; border-bottom:1px solid #505764; background:#191c22; }\n.rt .rt-search-line { display:flex; gap:6px; align-items:center; }\n.rt .rt-search { flex:1; min-width:0; }\n.rt .rt-close { min-width:32px; width:32px; padding:0; flex-shrink:0; }\n.rt .rt-filter-line { display:flex; gap:6px; margin-top:5px; }\n.rt .rt-filter-line label { flex:1; min-width:0; }\n.rt .rt-filter-line select { padding-right:2px; }\n.rt .rt-main { display:flex; flex-direction:column; min-height:0; min-width:0; flex:1; overflow:hidden; }\n.rt .rt-bulkbar { display:flex; justify-content:space-between; gap:6px; align-items:center; min-height:30px; padding:0 6px; border-bottom:1px solid #444c59; background:#252932; font-size:11px; flex-shrink:0; }\n.rt .rt-page-check { display:flex; align-items:center; gap:6px; min-height:30px; cursor:pointer; }\n.rt #rt-bulk-actions { display:flex; gap:3px; }\n.rt #rt-bulk-actions button { min-height:26px; padding:3px 6px; font-size:11px; }\n.rt .rt-list { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; touch-action:pan-y; list-style:none; margin:0; padding:0; scrollbar-width:thin; }\n.rt .rt-row { display:flex; align-items:center; gap:4px; height:36px; min-height:36px; padding:2px 6px; border-bottom:1px solid #383f4b; }\n.rt .rt-row:nth-child(even) { background:#23272f; }\n.rt .rt-row.rt-frozen { box-shadow:inset 2px 0 #91b8ee; }\n.rt .rt-row-check { display:flex; align-items:center; justify-content:center; width:24px; height:32px; flex-shrink:0; cursor:pointer; }\n.rt .rt-select { display:flex; align-items:center; gap:6px; flex:1; min-width:0; text-align:left; border:0; background:transparent; padding:0 3px; height:30px; }\n.rt .rt-select:hover { background:transparent; }\n.rt .rt-row-id { color:#a8b3c4; font-size:10px; flex-shrink:0; max-width:64px; overflow:hidden; text-overflow:ellipsis; }\n.rt .rt-row-title { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }\n.rt .rt-row-value { font:12px/1.4 Consolas,monospace; flex-shrink:0; width:72px; padding:2px 4px; border:1px solid #4b5565; border-radius:3px; background:#161b23; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right; }\n.rt .rt-row-actions { display:flex; align-items:center; gap:3px; flex-shrink:0; }\n.rt .rt-quick { min-width:28px; min-height:28px; height:28px; padding:2px 4px; font-size:12px; }\n.rt .rt-pagination { display:flex; align-items:center; justify-content:space-between; gap:8px; height:30px; padding:2px 8px; border-top:1px solid #4c5462; background:#191d24; font-size:11px; flex-shrink:0; }\n.rt .rt-pagination > div { display:flex; align-items:center; gap:4px; }\n.rt .rt-pagination button { min-height:24px; height:24px; min-width:28px; padding:0 5px; font-size:17px; }\n.rt .rt-pagination input { width:42px; min-height:24px; height:24px; padding:1px 2px; text-align:center; font-size:11px; -moz-appearance:textfield; }\n.rt .rt-pagination input::-webkit-inner-spin-button { -webkit-appearance:none; }\n.rt .rt-footer { display:flex; align-items:center; gap:8px; padding:4px 8px; min-height:38px; background:#16191f; border-top:1px solid #505867; flex-shrink:0; }\n.rt .rt-footer button { font-size:12px; }\n.rt .rt-status { flex:1; min-width:0; font-size:11px; color:#bdcce1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n.rt .rt-error { color:#ffbda9; }\n.rt .rt-modal { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; padding:12px; background:#080b10c9; }\n.rt .rt-modal-dialog { width:480px; max-width:100%; max-height:100%; min-height:0; display:flex; flex-direction:column; border:1px solid #73839d; border-radius:8px; background:#242932; box-shadow:0 16px 48px #0009; overflow:hidden; }\n.rt .rt-modal-dialog > header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 12px; border-bottom:1px solid #505c70; background:#1b2029; }\n.rt .rt-modal-dialog > header h2 { margin:0; font-size:15px; font-weight:600; }\n.rt .rt-modal-content { overflow-y:auto; min-height:0; padding:12px; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; overflow-wrap:anywhere; }\n.rt .rt-modal-status { padding:0 12px 8px; font-size:12px; color:#bad4f9; }\n.rt .rt-modal-status:empty { display:none; }\n.rt .rt-modal-content p { margin:0 0 10px; }\n.rt h2 { font-size:18px; margin:0 0 12px; }\n.rt h3 { font-size:17px; margin:0 0 8px; }\n.rt h4 { margin:12px 0 6px; }\n.rt .rt-id { display:block; color:#b1c9eb; font:11px Consolas,monospace; margin-bottom:8px; }\n.rt .rt-field { display:block; margin:0 0 12px; }\n.rt .rt-field > span { display:block; color:#becada; margin-bottom:4px; font-size:12px; }\n.rt .rt-modal-content input:not([type=checkbox]),.rt .rt-modal-content select,.rt .rt-modal-content textarea { font-size:16px; min-height:34px; }\n.rt textarea { min-height:64px; resize:vertical; }\n.rt .rt-full { width:100%; }\n.rt .rt-actions { display:flex; flex-wrap:wrap; gap:6px; }\n.rt .rt-divider { height:1px; background:#4b5566; margin:14px 0; }\n.rt .rt-muted { color:#b7c2d2; }\n.rt .rt-small { font-size:12px; }\n.rt .rt-note { background:#222f42; color:#c4d8f5; border:1px solid #576c8b; border-radius:4px; padding:8px; margin:10px 0; font-size:12px; }\n.rt .rt-empty { padding:24px 12px; text-align:center; color:#b9c4d4; }\n.rt pre { white-space:pre-wrap; overflow-wrap:anywhere; }\n.rt .rt-checkbox { display:flex; align-items:center; gap:8px; padding:6px 0; }\n.rt .rt-stats { display:flex; flex-wrap:wrap; gap:12px; margin:12px 0; }\n.rt .rt-stat strong { display:block; font-size:20px; }\n.rt .rt-log-entry { border-bottom:1px solid #505867; padding:10px 0; }\n.rt .rt-log-entry strong { display:block; }\n.rt code { word-break:break-word; }\n.rt .rt-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }\n.rt-launch { position:fixed; top:12px; right:12px; z-index:2147483000; background:#26374e; border:1px solid #8daedb; border-radius:5px; padding:6px 10px; cursor:pointer; }\n@media(max-width:500px) {\n .rt .rt-row { gap:2px; padding:2px 3px; }\n .rt .rt-row-check { width:20px; }\n .rt .rt-row-id { display:none; }\n .rt .rt-row-value { width:48px; }\n .rt .rt-row-actions { gap:2px; }\n .rt .rt-quick { min-width:24px; padding:2px 3px; font-size:11px; }\n .rt .rt-select { font-size:12px; }\n .rt .rt-footer { gap:4px; }\n .rt .rt-status { font-size:10px; }\n .rt .rt-modal { padding:8px; }\n}\n@media(prefers-reduced-motion:reduce) { .rt * { scroll-behavior:auto !important; transition:none !important; } }\n/* Toolbox navigation and reliable constrained scroll areas, including old WebViews. */\n.rt .rt-home { display:none; flex-direction:column; min-height:0; height:100%; }\n.rt.rt-home-open .rt-home { display:flex; }\n.rt.rt-home-open .rt-panel > .rt-header,.rt.rt-home-open .rt-main,.rt.rt-home-open .rt-footer { display:none; }\n.rt .rt-home-header { display:flex; align-items:center; gap:10px; padding:6px 8px; border-bottom:1px solid #505764; flex-shrink:0; }\n.rt .rt-home-header h1 { font-size:16px; margin:0; }\n.rt .rt-home-header > span { margin-left:auto; font-size:11px; }\n.rt .rt-home-content { display:block; flex:1 1 auto; min-height:0; overflow-y:auto; padding:8px; }\n.rt .rt-home-content button { display:block; position:relative; width:100%; padding:9px 34px 9px 10px; text-align:left; margin-bottom:6px; white-space:normal; }\n.rt .rt-home-content strong { display:block; font-size:14px; font-weight:600; }\n.rt .rt-home-content span { display:block; font-size:12px; color:#bdc8d9; margin-top:2px; }\n.rt .rt-home-content b { position:absolute; right:12px; top:14px; font-size:18px; }\n.rt .rt-icon { width:20px; height:20px; flex:none; image-rendering:pixelated; }\n.rt .rt-modal-dialog > header,.rt .rt-modal-status { flex-shrink:0; }\n.rt .rt-modal-dialog > header { justify-content:flex-start; gap:6px; }\n.rt .rt-modal-content { flex:1 1 auto; }\n.rt .rt-list,.rt .rt-modal-content,.rt .rt-home-content { touch-action:none; overscroll-behavior:contain; }\n.rt .rt-list { user-select:none; }\n.rt .rt-coordinate-fields { display:flex; gap:8px; }\n.rt .rt-coordinate-fields > label { flex:1; min-width:0; }\n.rt-launch { right:auto; left:12px; left:max(12px,env(safe-area-inset-left,0px)); top:max(12px,env(safe-area-inset-top,0px)); }\n";
/* Manual pan survives RPG Maker/JoiPlay cancelling the browser's native gesture. */
function installToolkitScroll() {
    var gesture = null, suppressClickUntil = 0, ignoreMouseUntil = 0;
    function area(node) {
        while (node && node !== root) {
            if (node.matches && node.matches('.rt-list,.rt-modal-content,.rt-home-content')) return node;
            node = node.parentElement;
        }
        return null;
    }
    function start(event, touch) {
        if (!opened || (!touch && event.button !== 0)) return;
        var realMouse = !touch && event.sourceCapabilities && !event.sourceCapabilities.firesTouchEvents;
        if (touch || realMouse) suppressClickUntil = 0;
        if (!touch && !realMouse && Date.now() < ignoreMouseUntil) return;
        if (touch) ignoreMouseUntil = Date.now() + 1000;
        if (event.touches && event.touches.length !== 1) { gesture = null; return; }
        var target = area(event.target), point = touch ? event.touches[0] : event;
        if (!target || target.scrollHeight <= target.clientHeight) return;
        gesture = { node:target, touch:touch, x:point.clientX, y:point.clientY, top:target.scrollTop, dragged:false };
    }
    function move(event, touch) {
        if (!gesture || gesture.touch !== touch || !opened) return;
        var point = touch ? event.touches[0] : event;
        if (!point || (touch && event.touches.length !== 1)) { gesture = null; return; }
        var dy = point.clientY - gesture.y;
        if (!gesture.dragged && Math.abs(dy) > 6 && Math.abs(dy) >= Math.abs(point.clientX-gesture.x)) gesture.dragged = true;
        if (!gesture.dragged) return;
        gesture.node.scrollTop = gesture.top - dy;
        if (event.cancelable) event.preventDefault(); event.stopPropagation();
    }
    function end(event, touch) {
        if (!gesture || gesture.touch !== touch) return;
        if (gesture.dragged) { suppressClickUntil = Date.now()+450; if (event.cancelable) event.preventDefault(); event.stopPropagation(); }
        gesture = null;
    }
    root.addEventListener('touchstart',function(e){start(e,true);},{capture:true,passive:true});
    root.addEventListener('mousedown',function(e){start(e,false);},true);
    g.addEventListener('touchmove',function(e){move(e,true);},{capture:true,passive:false});
    g.addEventListener('mousemove',function(e){move(e,false);},true);
    g.addEventListener('touchend',function(e){end(e,true);},{capture:true,passive:false});
    g.addEventListener('mouseup',function(e){end(e,false);},true);
    g.addEventListener('touchcancel',function(){gesture=null;},true);
    g.addEventListener('blur',function(){gesture=null;});
    root.addEventListener('click',function(e){if(Date.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    root.addEventListener('wheel',function(e){
        var target = area(e.target); if (!target || !opened) return;
        target.scrollTop += e.deltaY * (e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? target.clientHeight : 1);
        if(e.cancelable)e.preventDefault();e.stopPropagation();
    },{capture:true,passive:false});
}

/* DOM overlay; no engine assets, dependencies or timers while closed. */
var toolkitParams = g.PluginManager && g.PluginManager.parameters('RPGMToolkit') || {};
var hotkey = /^(F6|F7|F10)$/.test(toolkitParams.Hotkey || '') ? toolkitParams.Hotkey : 'F6';
var pageSize = Math.max(20, Math.min(80, Number(toolkitParams.PageSize) || 60));
var gameTools, runtime, translator, root, launch, previousFocus, openScene, openVariables, searchTimer;
var opened = false, dirty = false, tab = 'variables', query = '', filter = 'all', page = 0, selected = null, found = [];
var chosenActor = '', checked = {}, modalMode = '', modalFocus = null, exactValue = '';
function picked() { return Object.keys(checked).map(function(k) { return checked[k]; }); }
var labels = { favorites: 'Favoris', variables: 'Variables', switches: 'Interrupteurs', selfSwitches: 'Interr. locaux', items: 'Objets', weapons: 'Armes', armors: 'Armures', actors: 'Acteurs', skills: 'Compétences', states: 'États', party: 'Partie', translations: 'Traductions', history: 'Historique' };
var hints = { variables: 'Retrouvez et modifiez les valeurs de votre partie.', switches: 'Contrôlez les interrupteurs globaux du jeu.', selfSwitches: 'Interrupteurs A–D des événements de la carte actuelle.', items: 'Objets usuels, objets clés et objets masqués.', weapons: 'Recherchez une arme et ajustez votre inventaire.', armors: 'Armures, accessoires et équipements.', actors: 'Statistiques, progression et équipement des acteurs.', skills: 'Apprenez ou retirez une compétence à un acteur.', states: 'Ajoutez ou retirez les états d’un acteur.', favorites: 'Vos entrées épinglées, réunies au même endroit.' };
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
    if (!opened || !root) return;
    var v = g.visualViewport || { height:g.innerHeight, width:g.innerWidth, offsetTop:0, offsetLeft:0 };
    root.style.height = v.height + 'px'; root.style.width = v.width + 'px';
    root.style.top = v.offsetTop + 'px'; root.style.left = v.offsetLeft + 'px';
    root.style.bottom = 'auto'; root.style.right = 'auto';
    fitToolboxModal();
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
    if (!selected) { detail.innerHTML = empty('Choisissez une entrée', 'Consultez son nom d’origine, sa valeur et ses commandes ici.'); return; }
    var r = selected, kind = r.kind, v = runtime.value(r);
    var html = '<span class="rt-id">' + esc(labels[kind]) + ' · #' + esc(r.id) + '</span><h3>' + esc(runtime.title(r)) + '</h3><p class="rt-muted rt-small">Nom d’origine : ' + esc(r.original || '(sans nom)') + '</p>';
    if (r.data && r.data.description) html += '<p class="rt-small">' + esc(r.data.description) + '</p>';
    html += '<div class="rt-divider"></div>';
    if (kind === 'variables') {
        if (runtime.editable(r)) html += valueForm(v, 'variable');
        else html += '<p>Type complexe, en lecture seule.</p><pre>' + esc(runtime.printable(v)) + '</pre>';
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
    $('.rt-modal-content').innerHTML = '<div class="rt-page"><h2>Partie</h2><p class="rt-muted">' + esc(g.$dataSystem.gameTitle) + ' · ' + esc(g.Utils.RPGMAKER_NAME) + ' ' + esc(g.Utils.RPGMAKER_VERSION) + '</p><div class="rt-stats"><div class="rt-stat"><span class="rt-muted rt-small">OR</span><strong>' + g.$gameParty.gold().toLocaleString() + '</strong></div><div class="rt-stat"><span class="rt-muted rt-small">CARTE</span><strong>#' + g.$gameMap.mapId() + '</strong></div><div class="rt-stat"><span class="rt-muted rt-small">POSITION</span><strong>' + g.$gamePlayer.x + ', ' + g.$gamePlayer.y + '</strong></div></div><form data-form="gold"><h3>Argent de la partie</h3>' + field('Nouveau total (' + g.$dataSystem.currencyUnit + ')', 'rt-gold', g.$gameParty.gold(), 'number', 'min="0" max="' + g.$gameParty.maxGold() + '" step="1" required') + '<button class="rt-primary" type="submit">Définir le total</button></form><div class="rt-divider"></div><section><h3>Sauvegarde</h3><p class="rt-muted">Les modifications sont appliquées à la partie en cours. Utilisez la sauvegarde du jeu pour les conserver.</p>' + button('Ouvrir le menu de sauvegarde', 'save-menu') + '<div class="rt-note">Enregistrez dans un emplacement distinct si vous souhaitez garder votre progression précédente.</div></section></div>';
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
    $('.rt-modal-content').innerHTML = '<div class="rt-page"><h2>Traductions anglaises</h2><label class="rt-checkbox"><input id="rt-english" type="checkbox"' + (runtime.prefs.english ? ' checked' : '') + '>Afficher les noms anglais</label><p class="rt-muted">Un nom plus clair, avec les données d’origine intactes.</p><section><div class="rt-note">Les traductions changent uniquement les noms affichés dans le Toolkit. Elles ne modifient ni les identifiants, ni les valeurs, ni les textes du jeu.</div><h3>Traduction à la demande</h3>' + scope + sourceSelector() + '<p class="rt-small rt-muted">Les noms choisis sont envoyés à MyMemory : trois requêtes simultanées, noms identiques regroupés. Chaque résultat est enregistré localement. Les valeurs des variables ne sont pas envoyées. Le service gratuit sans clé est soumis à un quota ; réseau et autorisation CORS nécessaires.</p><p id="rt-translation-count">' + remaining + ' nom(s) restant(s). Les noms déjà traduits sont exclus. Les interrupteurs locaux concernent la carte actuelle.</p><div class="rt-actions">' + button(translationScope === 'all' ? 'Tout traduire' : 'Traduire les noms', 'translate-start', 'rt-primary') + button('Arrêter', 'translate-stop') + '</div><p id="rt-translation-progress" class="rt-small" role="status" style="margin-top:12px">' + esc(translationProgress) + '</p><div class="rt-divider"></div><h3>Dictionnaire local</h3><p class="rt-muted">' + Object.keys(runtime.prefs.aliases).length + ' alias enregistré(s) pour ce jeu. Saisissez un nom anglais dans les détails d’une entrée ou importez un dictionnaire JSON.</p><div class="rt-actions">' + button('Exporter les traductions', 'export-aliases') + button('Exporter les noms à traduire', 'export-names') + '</div><label class="rt-field" style="margin-top:16px"><span>Importer un dictionnaire JSON (5 Mo maximum)</span><input id="rt-import" type="file" accept=".json,application/json"></label><p class="rt-small rt-muted">L’import ne retient que les entrées dont la catégorie, l’ID et le nom d’origine correspondent. Les fichiers ne sont pas envoyés à un serveur.</p></section></div>';
    $('#rt-translation-scope').value = translationScope;
    $('#rt-translation-scope').disabled = translator.busy(); $('#rt-source').disabled = translator.busy();
    $('[data-action="translate-start"]').disabled = !remaining || translator.busy();
    $('[data-action="translate-stop"]').disabled = !translator.busy();
}
function renderHistory() {
    $('.rt-modal-content').innerHTML = '<div class="rt-page">' + button('Annuler', 'undo') + button('Rétablir', 'redo') + button('Créer un repère', 'baseline') + '<h2>Historique de cette session</h2><p class="rt-muted">100 dernières opérations. Annulation et rétablissement limités à 80 modifications simples. Le chargement d’une partie réinitialise cet historique.</p>' + (runtime.log().length ? runtime.log().map(function(entry) { return '<div class="rt-log-entry"><span class="rt-muted rt-small">' + esc(entry.time) + ' · ' + (entry.reversible ? 'Modification simple' : 'Opération') + '</span><strong>' + esc(entry.label) + '</strong><code>' + esc(entry.before) + ' → ' + esc(entry.after) + '</code></div>'; }).join('') : empty('Aucune modification', 'Les opérations effectuées depuis ce panneau apparaîtront ici.')) + '</div>';
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
        if (opened && modalMode === 'translations') { renderTranslations(); say(e.message + ' Les résultats reçus sont conservés. Relancez pour reprendre les noms manquants.', true); }
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
    if (action === 'bulk-edit') { openModal('bulk', 'Modifier ' + picked().length + ' entrées'); $('.rt-modal-content').innerHTML = '<p>La valeur sera appliquée à toute la sélection, y compris sur les autres pages. Un type incompatible annule le groupe entier.</p>' + valueForm('', 'bulk') + '<p class="rt-small rt-muted">Maximum : 500 entrées. Les gels existants suivront la nouvelle valeur.</p>'; updateValueInput(); return; }
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
    if (action === 'translate-stop') { translationRun++; translator.cancel(); renderTranslations(); say('Traduction arrêtée. Les noms déjà traduits sont conservés.'); return; }
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
function openToolkit() {
    if (opened) return true;
    if (!allowed()) return false;
    try {
        if (!runtime) { var storage; try { storage = g.localStorage; } catch (e) { storage = { getItem: function() { return null; }, setItem: function() { throw new Error('Stockage indisponible'); } }; } runtime = createToolkitRuntime(g, storage); translator = createToolkitTranslator(runtime, g); }
        if (!gameTools) gameTools = createToolkitTools(g);
        runtime.refresh(); selected = null; checked = {}; 
        buildRoot(); previousFocus = document.activeElement; openScene = g.SceneManager._scene;
        openVariables = g.$gameVariables; opened = true; root.hidden = false; if (launch) launch.hidden = true;
        clearInput(); render(); showToolboxHome();
        say(runtime.storageWarning() ? 'Stockage local indisponible : exportez vos traductions pour les conserver.' : 'Prêt · Les modifications s’appliquent à la partie en cours.');
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
g.RPGMToolkit = { version: '1.3.0', open: openToolkit, close: closeToolkit, toggle: toggleToolkit, isOpen: function() { return opened; } };
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
        var focusables = Array.prototype.slice.call((modalMode ? $('.rt-modal') : $('.rt-panel')).querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')).filter(function(el) { return el.offsetWidth || el.offsetHeight; });
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
function mountLauncher() {
    if (toolkitParams.ShowButton === 'false' || launch) return;
    buildRoot(); launch = document.createElement('button'); launch.className = 'rt-launch'; launch.type = 'button'; launch.textContent = 'Toolbox · ' + hotkey; launch.hidden = true;
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

/* Global navigation and separate tool pages. Engine logic lives in tools.js. */
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
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.className = 'rt-close'; close.dataset.action = 'tool-close'; close.setAttribute('aria-label','Fermer le Toolkit'); header.insertBefore(close,header.firstChild);
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
        ['god','Godmode',state.god ? 'Activé · équipe protégée' : 'HP au maximum · protection contre K.O.'],
        ['noclip','No Clip',state.noclip ? 'Activé · obstacles traversables' : 'Traverser les obstacles de la carte'],
        ['resources','HP / MP','PV, PM et TP · acteur ou équipe'],
        ['stats','Stats','Niveau, expérience et bonus permanents'],
        ['teleport','Téléportation','Choisir une carte et une position'],
        ['party','Partie','Argent et sauvegarde'],
        ['history','Historique','Annuler ou rétablir une modification']
    ];
    $('.rt-home-content').innerHTML = entries.map(function(e) { return '<button type="button" data-action="tool-'+e[0]+'"><strong>'+e[1]+'</strong><span>'+e[2]+'</span><b aria-hidden="true">›</b></button>'; }).join('');
    $('.rt-panel').focus();
}
function toolActorSelector(all) {
    return '<label class="rt-field"><span>Acteur</span><select id="rt-tool-actor">' + (all ? '<option value="all">Toute l’équipe</option>' : '') + gameTools.members().map(function(a) { return '<option value="'+a.actorId()+'">'+esc(a.name())+'</option>'; }).join('') + '</select></label>';
}
function toolPage(mode) {
    var titles = {god:'Godmode',noclip:'No Clip',resources:'HP / MP',stats:'Stats',teleport:'Téléportation'};
    openModal(mode,titles[mode]); var html = '';
    if (mode === 'god' || mode === 'noclip') {
        var active = gameTools.state()[mode];
        html = '<p>' + (mode === 'god' ? 'Maintient les HP de l’équipe au maximum et bloque l’état K.O. Les ennemis restent inchangés.' : 'Traverse les obstacles de la carte. Les bords de carte et les règles spéciales des autres plugins restent applicables.') + '</p><p class="rt-note">Mode de session : reste actif après fermeture du panneau, puis se désactive au chargement d’une partie.</p><button type="button" class="rt-primary" data-action="tool-toggle-'+mode+'" aria-pressed="'+active+'">'+(active ? 'Désactiver' : 'Activer')+'</button>';
    }
    if (mode === 'resources') html = '<form data-form="tool-resources">'+toolActorSelector(true)+'<p id="rt-tool-summary" class="rt-muted"></p>'+field('HP · points de vie','rt-tool-hp',0,'number','min="0" step="1" required')+field('MP · points de magie','rt-tool-mp',0,'number','min="0" step="1" required')+field('TP','rt-tool-tp',0,'number','min="0" step="1" required')+'<div class="rt-actions"><button type="submit" class="rt-primary">Appliquer</button>'+button('Tout restaurer','tool-heal')+'</div></form>';
    if (mode === 'stats') html = '<form data-form="tool-stats">'+toolActorSelector(false)+'<label class="rt-field"><span>Statistique</span><select id="rt-tool-param"><option value="level">Niveau</option><option value="exp">Expérience totale</option>'+['HP max','MP max','Attaque','Défense','Attaque magique','Défense magique','Agilité','Chance'].map(function(n,i){return '<option value="'+i+'">Bonus · '+n+'</option>';}).join('')+'</select></label><p id="rt-tool-summary" class="rt-muted"></p>'+field('Nouvelle valeur','rt-tool-value',0,'number','step="1" required')+'<button type="submit" class="rt-primary">Appliquer</button><p class="rt-note">Les bonus s’ajoutent aux statistiques de base et d’équipement. Les changements sont conservés avec la sauvegarde du jeu.</p></form>';
    if (mode === 'teleport') html = '<form data-form="tool-teleport">'+field('Rechercher une carte · nom ou ID','rt-map-query','','search','autocomplete="off"')+'<label class="rt-field"><span>Carte</span><select id="rt-tool-map"></select></label><p id="rt-map-summary" role="status"></p><div class="rt-coordinate-fields">'+field('X','rt-map-x',0,'number','min="0" step="1" required')+field('Y','rt-map-y',0,'number','min="0" step="1" required')+'</div><label class="rt-field"><span>Direction</span><select id="rt-map-direction"><option value="0">Conserver</option><option value="2">Bas</option><option value="4">Gauche</option><option value="6">Droite</option><option value="8">Haut</option></select></label><button id="rt-map-go" type="submit" class="rt-primary" disabled>Se téléporter</button><p class="rt-note">Coordonnées en cases, à partir de 0. Choisissez une case praticable. Le panneau se ferme pour effectuer le transfert.</p></form>';
    $('.rt-modal-content').innerHTML = html;
    if (mode === 'resources' || mode === 'stats') updateToolValues();
    if (mode === 'teleport') { renderToolMaps(''); $('#rt-tool-map').value = String(g.$gameMap.mapId()); if (!$('#rt-tool-map').value) $('#rt-tool-map').selectedIndex = 0; loadToolMap(); }
}
function updateToolValues() {
    var id = $('#rt-tool-actor').value, actors = gameTools.members().filter(function(a){return id === 'all' || String(a.actorId()) === id;}), a = actors[0];
    if (!a) { $('#rt-tool-summary').textContent = 'Aucun acteur dans l’équipe.'; return; }
    if (modalMode === 'resources') {
        var maxHp = Math.min.apply(null,actors.map(function(a){return a.mhp;})), maxMp = Math.min.apply(null,actors.map(function(a){return a.mmp;})), maxTp = Math.min.apply(null,actors.map(function(a){return a.maxTp();}));
        $('#rt-tool-hp').max = maxHp; $('#rt-tool-mp').max = maxMp; $('#rt-tool-tp').max = maxTp;
        $('#rt-tool-hp').value = Math.min(a.hp,maxHp); $('#rt-tool-mp').value = Math.min(a.mp,maxMp); $('#rt-tool-tp').value = Math.min(a.tp,maxTp);
        $('#rt-tool-summary').textContent = id === 'all' ? 'Valeurs communes à toute l’équipe. « Tout restaurer » utilise les maxima propres à chaque acteur.' : a.name()+' · HP '+a.hp+'/'+a.mhp+' · MP '+a.mp+'/'+a.mmp;
    } else {
        var param = $('#rt-tool-param').value;
        $('#rt-tool-value').min = param === 'level' ? 1 : param === 'exp' ? 0 : -999999;
        $('#rt-tool-value').max = param === 'level' ? a.maxLevel() : param === 'exp' ? 999999999 : 999999;
        $('#rt-tool-value').value = param === 'level' ? a.level : param === 'exp' ? a.currentExp() : a._paramPlus[Number(param)] || 0;
        $('#rt-tool-summary').textContent = param === 'level' || param === 'exp' ? 'Progression de '+a.name() : 'Statistique effective : '+a.param(Number(param))+' · modifier ici le bonus permanent.';
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
function toolboxAction(action) {
    if (action.indexOf('tool-') !== 0) return false;
    var mode = action.slice(5);
    if (mode === 'close') closeToolkit();
    else if (mode === 'home') showToolboxHome();
    else if (mode === 'editors') { toolboxHome = false; root.classList.remove('rt-home-open'); render(); $('.rt-panel').focus(); }
    else if (mode === 'translations') { translationScope = 'all'; pendingTranslations = []; openModal('translations','Traductions'); renderTranslations(); }
    else if (mode === 'party') { openModal('party','Partie'); renderParty(); }
    else if (mode === 'history') { openModal('history','Historique'); renderHistory(); }
    else if (mode === 'toggle-god' || mode === 'toggle-noclip') { var key=mode.slice(7); if(key==='god')gameTools.setGod(!gameTools.state().god);else gameTools.setNoclip(!gameTools.state().noclip); toolPage(key); }
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

})(window);
