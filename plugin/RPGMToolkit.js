/*:
 * @target MZ
 * @plugindesc v1.1.0 (MV/MZ) — Variables, inventaire, acteurs et traductions anglaises.
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
 * RPGM Toolkit 1.1.0 — RPG Maker MV 1.6+ / MZ
 * Copiez ce fichier dans js/plugins, puis activez RPGMToolkit en dernier
 * dans le gestionnaire de plugins. Chargez une partie et appuyez sur F6.
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
 * seuls les noms choisis sont envoyés. Internet et quota disponible requis.
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
    var storageWarning = false;
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
        Object.keys(saved.aliases || {}).slice(0, 50000).forEach(function(k) { if (/^[a-zA-Z]+:[0-9]+(?:\.[0-9]+\.[A-D])?$/.test(k) && validAlias(saved.aliases[k])) prefs.aliases[k] = saved.aliases[k]; });
    } catch (e) { storageWarning = true; }
    function ensureSession() {
        if (session !== g.$gameVariables) { session = g.$gameVariables; history = []; redo = []; log = []; baseline = {}; cache = {}; }
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
        if (r.kind === 'variables') return g.$gameVariables.value(r.id);
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
    function setValue(r, next) {
        assertRecord(r);
        var v = value(r);
        if (r.kind === 'variables') {
            if (typeof v !== 'number' && typeof v !== 'string') throw new Error('Cette variable contient un type complexe : consultation uniquement.');
            if (typeof next === 'number') next = integer(next, -9007199254740991, 9007199254740991);
            else if (typeof next !== 'string' || next.length > 10000) throw new Error('Texte invalide (10 000 caractères maximum).');
            return commit(title(r), function() { return value(r); }, function(x) { g.$gameVariables.setValue(r.id, x); }, next);
        }
        if (r.kind === 'switches' || r.kind === 'selfSwitches') {
            if (typeof next !== 'boolean') throw new Error('ON ou OFF attendu.');
            return commit(title(r), function() { return value(r); }, function(x) {
                if (r.kind === 'switches') g.$gameSwitches.setValue(r.id, x); else g.$gameSelfSwitches.setValue(r.data, x);
            }, next);
        }
        if (/^(items|weapons|armors)$/.test(r.kind)) {
            next = integer(next, 0, g.$gameParty.maxItems(r.data));
            return commit(title(r), function() { return value(r); }, function(x) { g.$gameParty.gainItem(r.data, x - value(r), false); }, next);
        }
        throw new Error('Utilisez les commandes de cette catégorie.');
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
    function setAlias(r, text) {
        assertRecord(r);
        if (typeof text !== 'string' || text.length > 2000) throw new Error('Traduction invalide.');
        if (text.trim()) prefs.aliases[r.key] = { original: r.original, english: text.trim() };
        else delete prefs.aliases[r.key];
        savePrefs();
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
        search: search, printable: printable, integer: integer, setValue: setValue, gold: gold, actor: actor, actorAction: actorAction, equip: equip,
        undo: function() { undoAction(false); }, redo: function() { undoAction(true); },
        canUndo: function() { ensureSession(); return history.length > 0; }, canRedo: function() { ensureSession(); return redo.length > 0; },
        log: function() { ensureSession(); return log; }, capture: capture, changed: changed,
        refresh: function() { ensureSession(); cache = {}; }, savePrefs: savePrefs, storageWarning: function() { return storageWarning; },
        setAlias: setAlias, importAliases: importAliases,
        exportAliases: function() {
            return { format: 'rpgm-toolkit-translations-v1', project: project, entries: Object.keys(prefs.aliases).map(function(k) { return { key: k, original: prefs.aliases[k].original, english: prefs.aliases[k].english }; }) };
        }
    };
}

/* Online translation is requested explicitly; names only, never variable values. */
function createToolkitTranslator(runtime, g) {
    'use strict';
    var token = 0, current = null, running = false;
    function cancel() {
        token++;
        running = false;
        if (current) { current.abort(); current = null; }
    }
    function request(name, source) {
        return new Promise(function(resolve, reject) {
            var xhr = new g.XMLHttpRequest(); current = xhr;
            xhr.open('GET', 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(name) + '&langpair=' + encodeURIComponent(source + '|en'), true);
            xhr.timeout = 15000;
            xhr.onload = function() {
                if (current === xhr) current = null;
                try {
                    if (xhr.status !== 200) throw new Error('Service indisponible (HTTP ' + xhr.status + ').');
                    var response = JSON.parse(xhr.responseText);
                    if (Number(response.responseStatus) !== 200 || response.quotaFinished) throw new Error('Traduction refusée ou quota MyMemory épuisé. Réessayez plus tard.');
                    var translated = response.responseData && response.responseData.translatedText;
                    if (typeof translated !== 'string' || !translated.trim() || translated.length > 2000) throw new Error('Réponse de traduction invalide.');
                    resolve(translated);
                } catch (e) { reject(e); }
            };
            xhr.onerror = function() { if (current === xhr) current = null; reject(new Error('Connexion impossible. Vérifiez le réseau ou les restrictions CORS du jeu.')); };
            xhr.ontimeout = function() { if (current === xhr) current = null; reject(new Error('Le service met trop de temps à répondre.')); };
            xhr.onabort = function() { reject(new Error('Traduction arrêtée.')); };
            xhr.send();
        });
    }
    function translate(records, source, progress) {
        if (running) return Promise.reject(new Error('Une traduction est déjà en cours.'));
        if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(source)) return Promise.reject(new Error('Choisissez la langue d’origine.'));
        var batch = records.slice(0, 80).filter(function(r) { return r.original.trim() && !runtime.alias(r); });
        var myToken = ++token, session = g.$gameVariables, i = 0, completed = 0, memo = Object.create(null);
        running = true;
        function next() {
            if (myToken !== token || session !== g.$gameVariables) throw new Error('Traduction arrêtée.');
            if (i >= batch.length) return completed;
            var r = batch[i++], original = r.original;
            if (new Blob([original]).size > 500) throw new Error('Un nom dépasse la limite de 500 octets du service. Utilisez un alias manuel.');
            var promise = source === 'en' ? Promise.resolve(original) : (memo[original] ? Promise.resolve(memo[original]) : request(original, source));
            return promise.then(function(english) {
                if (myToken !== token || session !== g.$gameVariables) throw new Error('Traduction arrêtée.');
                memo[original] = english;
                if (!runtime.alias(r)) runtime.setAlias(r, english);
                completed++; progress(completed, batch.length);
                return new Promise(function(resolve) { g.setTimeout(resolve, 400); });
            }).then(next);
        }
        return Promise.resolve().then(next).then(function(n) { if (myToken === token) running = false; return n; }, function(e) { if (myToken === token) running = false; throw e; });
    }
    return { translate: translate, cancel: cancel, busy: function() { return running; } };
}

var TOOLKIT_CSS = ".rt, .rt-launch { box-sizing: border-box; font: 14px/1.5 'Segoe UI', Arial, sans-serif; color: #eff3f5; text-align: left; letter-spacing: normal; }\r\n.rt *, .rt *:before, .rt *:after { box-sizing: border-box; }\r\n.rt header, .rt footer, .rt main, .rt nav, .rt aside, .rt section { position: static; float: none; margin: 0; top: auto; right: auto; bottom: auto; left: auto; }\r\n.rt { position: fixed; z-index: 2147483001; inset: 0; top: 0; left: 0; right: 0; bottom: 0; background: rgba(5,9,13,.78); display: flex; align-items: center; justify-content: center; padding: 24px; user-select: text; }\r\n.rt[hidden], .rt-launch[hidden], .rt [hidden] { display: none !important; }\r\n.rt pre { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 100%; }\r\n.rt button, .rt input, .rt select, .rt textarea { font: inherit; color: inherit; margin: 0; }\r\n.rt button, .rt-launch { cursor: pointer; border: 1px solid #5a606c; background: #30343a; border-radius: 6px; min-height: 36px; padding: 7px 12px; line-height: 1.4; }\r\n.rt button:hover, .rt-launch:hover { background: #40454d; border-color: #91a3ae; }\r\n.rt button:disabled { opacity: .45; cursor: default; }\r\n.rt button:focus-visible, .rt input:focus-visible, .rt select:focus-visible, .rt textarea:focus-visible, .rt-launch:focus-visible { outline: 2px solid #8cb3ea; outline-offset: 3px; }\r\n.rt button:focus, .rt input:focus, .rt select:focus, .rt textarea:focus { outline-color: #8cb3ea; }\r\n.rt input, .rt select, .rt textarea { width: 100%; border: 1px solid #5a606c; background: #181a1d; border-radius: 5px; padding: 9px 10px; min-height: 38px; }\r\n.rt input[type=checkbox] { width: 16px; min-height: 16px; height: 16px; accent-color: #8cb3ea; margin-right: 6px; }\r\n.rt textarea { min-height: 82px; resize: vertical; }\r\n.rt input::placeholder, .rt textarea::placeholder { color: #94a3ae; opacity: 1; }\r\n.rt .rt-primary { background: #8cb3ea; border-color: #8cb3ea; color: #202226; font-weight: 650; }\r\n.rt .rt-primary:hover { background: #b3cef4; border-color: #b3cef4; }\r\n.rt .rt-danger { color: #ffb9ab; }\r\n.rt .rt-panel { width: 1280px; max-width: 100%; height: 820px; max-height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #1e2024; border: 1px solid #5a606c; border-radius: 12px; box-shadow: 0 24px 100px #0008; }\r\n.rt .rt-header { display: flex; align-items: center; flex-wrap: wrap; padding: 16px 20px; border-bottom: 1px solid #4d535d; }\r\n.rt .rt-brand { display: flex; align-items: center; flex: 1; min-width: 180px; }\r\n.rt .rt-logo { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; background: #8cb3ea; color: #202226; border-radius: 8px; margin-right: 12px; font-size: 20px; font-weight: 750; }\r\n.rt h1 { font-size: 17px; margin: 0; line-height: 1.4; font-weight: 650; }\r\n.rt .rt-eyebrow { color: #a8b8c2; font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; }\r\n.rt .rt-header-actions { display: flex; align-items: center; flex-wrap: wrap; }\r\n.rt .rt-header-actions > * { margin-left: 8px; }\r\n.rt .rt-paused { color: #a7c0e4; font-size: 12px; margin-right: 8px; }\r\n.rt .rt-body { display: flex; flex: 1; min-height: 0; }\r\n.rt .rt-nav { width: 190px; flex-shrink: 0; padding: 20px 12px; background: #181a1d; border-right: 1px solid #4d535d; overflow-y: auto; }\r\n.rt .rt-nav-label { display: block; padding: 0 10px 8px; color: #91a4b1; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; }\r\n.rt .rt-nav button { display: flex; width: 100%; justify-content: space-between; align-items: center; background: transparent; border: 1px solid transparent; padding: 9px 10px; margin-bottom: 3px; text-align: left; }\r\n.rt .rt-nav button:hover { background: #2e3238; }\r\n.rt .rt-nav button[aria-current=page] { color: #adc9f1; background: #33363d; border-color: #555b66; }\r\n.rt .rt-nav .rt-nav-sep { border-top: 1px solid #4d535d; margin: 16px 0; }\r\n.rt .rt-nav-count { font-size: 11px; color: #b6c3ca; }\r\n.rt .rt-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }\r\n.rt .rt-toolbar { padding: 20px 24px 16px; border-bottom: 1px solid #4d535d; }\r\n.rt .rt-title-line { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }\r\n.rt h2 { font-size: 23px; line-height: 1.3; font-weight: 600; margin: 0 0 4px; }\r\n.rt h3 { font-size: 17px; font-weight: 600; margin: 0 0 12px; }\r\n.rt p { margin: 0 0 12px; }\r\n.rt .rt-muted { color: #afbec8; }\r\n.rt .rt-small { font-size: 12px; }\r\n.rt .rt-controls { display: flex; align-items: center; flex-wrap: wrap; margin: -4px; }\r\n.rt .rt-controls > * { margin: 4px; }\r\n.rt .rt-controls .rt-search { flex: 1; min-width: 160px; }\r\n.rt .rt-controls select { width: auto; max-width: 100%; }\r\n.rt .rt-checkbox { display: flex; align-items: center; white-space: nowrap; cursor: pointer; }\r\n.rt .rt-workbench { display: flex; flex: 1; min-height: 0; }\r\n.rt .rt-results { display: flex; flex-direction: column; flex: 1; min-width: 0; }\r\n.rt .rt-columns { display: flex; padding: 10px 20px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #9bacb7; border-bottom: 1px solid #4d535d; background: #24262b; }\r\n.rt .rt-columns span:first-child { flex: 1; }\r\n.rt .rt-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0; margin: 0; list-style: none; }\r\n.rt .rt-row { display: flex; align-items: stretch; border-bottom: 1px solid #41464e; min-height: 62px; }\r\n.rt .rt-row:hover { background: #2c2f35; }\r\n.rt .rt-row.rt-selected { background: #31353b; box-shadow: inset 3px 0 #8cb3ea; }\r\n.rt .rt-row .rt-select { min-width: 0; width: 100%; display: flex; align-items: center; text-align: left; border: 0; border-radius: 0; padding: 10px 12px 10px 20px; background: transparent; }\r\n.rt .rt-row .rt-star { flex-shrink: 0; background: transparent; border: 0; width: 38px; border-radius: 0; padding: 0; font-size: 18px; color: #a8b8c2; }\r\n.rt .rt-row .rt-star[aria-pressed=true] { color: #f4d487; }\r\n.rt .rt-row-main { flex: 1; min-width: 0; padding-right: 8px; }\r\n.rt .rt-row-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }\r\n.rt .rt-row-sub { display: block; color: #a4b5c0; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\r\n.rt .rt-row-value { max-width: 100px; font: 13px/1.4 Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 1px solid #5a606c; border-radius: 4px; background: #23252a; padding: 3px 7px; }\r\n.rt .rt-icon { width: 28px; height: 28px; flex-shrink: 0; margin-right: 12px; image-rendering: pixelated; }\r\n.rt .rt-pagination { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-top: 1px solid #4d535d; font-size: 12px; }\r\n.rt .rt-detail { width: 330px; flex-shrink: 0; padding: 20px; overflow-y: auto; border-left: 1px solid #4d535d; background: #24262b; overflow-wrap: anywhere; }\r\n.rt .rt-detail .rt-id { display: inline-block; font: 11px Consolas, monospace; color: #b4c1d4; background: #33363d; border: 1px solid #535964; border-radius: 4px; padding: 3px 7px; margin-bottom: 12px; }\r\n.rt .rt-detail h3 { font-size: 21px; margin-bottom: 4px; }\r\n.rt .rt-divider { height: 1px; background: #4d535d; margin: 20px 0; }\r\n.rt .rt-field { display: block; margin: 0 0 12px; }\r\n.rt .rt-field > span { display: block; color: #bdcbd4; font-size: 12px; margin-bottom: 6px; }\r\n.rt .rt-actions { display: flex; flex-wrap: wrap; margin: -4px; }\r\n.rt .rt-actions > * { margin: 4px; }\r\n.rt .rt-full { width: 100%; }\r\n.rt .rt-note { background: #2a2e33; color: #c4d1e4; border: 1px solid #535964; padding: 12px; border-radius: 6px; font-size: 12px; margin: 12px 0; }\r\n.rt .rt-empty { padding: 48px 24px; text-align: center; color: #afbec8; }\r\n.rt .rt-empty strong { display: block; color: #eff3f5; margin: 8px 0; font-size: 17px; }\r\n.rt .rt-empty-symbol { display: block; font-size: 34px; color: #839bbd; }\r\n.rt .rt-footer { border-top: 1px solid #4d535d; background: #181a1d; padding: 10px 20px; display: flex; align-items: center; min-height: 42px; }\r\n.rt .rt-status { flex: 1; color: #bdc7d4; font-size: 12px; overflow-wrap: anywhere; }\r\n.rt .rt-status.rt-error { color: #ffb9ab; }\r\n.rt .rt-footer-hint { color: #97a9b5; font-size: 11px; margin-left: 12px; }\r\n.rt kbd { font: 11px Consolas, monospace; border: 1px solid #5a606c; border-radius: 3px; padding: 2px 4px; }\r\n.rt .rt-page { padding: 24px; overflow-y: auto; flex: 1; min-height: 0; }\r\n.rt .rt-page form, .rt .rt-page section { max-width: 720px; }\r\n.rt .rt-page .rt-field { max-width: 420px; }\r\n.rt .rt-stats { display: flex; flex-wrap: wrap; border: 1px solid #5a606c; border-radius: 8px; margin: 20px 0; }\r\n.rt .rt-stat { flex: 1; padding: 16px; min-width: 130px; }\r\n.rt .rt-stat strong { display: block; font-size: 25px; }\r\n.rt .rt-log-entry { padding: 14px 0; border-bottom: 1px solid #4d535d; }\r\n.rt .rt-log-entry strong { display: block; }\r\n.rt .rt-log-entry code { color: #b5c9e5; word-break: break-word; }\r\n.rt .rt-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }\r\n.rt-launch { position: fixed; z-index: 2147483000; right: 14px; top: 14px; box-shadow: 0 3px 20px #0007; border-color: #707887; background: #222529; color: #c6d9f4; font-size: 12px; padding: 8px 12px; }\r\n@media (max-width: 1050px) { .rt { padding: 12px; } .rt .rt-nav { width: 155px; padding: 16px 8px; } .rt .rt-detail { width: 290px; padding: 16px; } .rt .rt-toolbar { padding: 16px; } .rt .rt-footer-hint { display: none; } }\r\n@media (max-width: 800px) { .rt .rt-body { flex-direction: column; } .rt .rt-nav { display: flex; width: auto; padding: 8px; overflow-x: auto; flex-shrink: 0; border-right: 0; border-bottom: 1px solid #4d535d; } .rt .rt-nav button { width: auto; flex-shrink: 0; margin: 0 4px 0 0; white-space: nowrap; } .rt .rt-nav-count { margin-left: 8px; } .rt .rt-nav-label, .rt .rt-nav-sep { display: none; } .rt .rt-main { min-height: 0; } .rt .rt-detail { width: 42%; } .rt .rt-header { padding: 12px; } .rt .rt-paused { display: none; } .rt .rt-toolbar { padding: 12px; } }\r\n@media (max-width: 580px) { .rt { padding: 0; } .rt .rt-panel { border-radius: 0; border: 0; height: 100%; } .rt .rt-header-actions { margin-top: 8px; width: 100%; justify-content: flex-end; } .rt .rt-header-actions button { font-size: 12px; } .rt .rt-workbench { display: block; overflow-y: auto; } .rt .rt-results { height: 290px; } .rt .rt-detail { width: auto; border-left: 0; border-top: 1px solid #5a606c; overflow: visible; } .rt .rt-title-line { margin-bottom: 10px; } .rt h2 { font-size: 20px; } .rt .rt-controls .rt-search { min-width: 100%; } .rt .rt-controls select { flex: 1; width: 130px; } .rt .rt-controls button { font-size: 12px; } .rt .rt-footer { padding: 8px 12px; } .rt .rt-page { padding: 16px; } .rt .rt-columns { padding: 7px 14px; } }\r\n@media (prefers-reduced-motion: reduce) { .rt *, .rt-launch { scroll-behavior: auto !important; transition: none !important; } }\r\n\r\n/* Touch layout: keep results and editor as separate screens. */\r\n.rt button, .rt input, .rt select, .rt textarea, .rt-launch { touch-action: manipulation; }\r\n.rt .rt-back { display:none; }\r\n.rt .rt-tools { margin-top:8px; }\r\n.rt .rt-tools summary { cursor:pointer; padding:10px 0; color:#b6c4d7; }\r\n.rt .rt-list, .rt .rt-detail, .rt .rt-page, .rt .rt-nav { overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }\r\n@media (pointer:coarse), (max-width:800px) {\r\n .rt button, .rt input:not([type=checkbox]), .rt select, .rt-launch { min-height:48px; }\r\n .rt input, .rt select, .rt textarea { font-size:16px; }\r\n .rt .rt-checkbox { min-height:48px; }\r\n .rt .rt-row .rt-star { width:48px; }\r\n .rt .rt-pagination button { min-width:48px; }\r\n}\r\n@media (max-width:800px), (max-width:950px) and (max-height:500px) {\r\n .rt { padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px); }\r\n .rt .rt-panel { height:100%; border-radius:0; }\r\n .rt .rt-header { padding:8px 12px; flex-wrap:nowrap; gap:8px; }\r\n .rt .rt-brand { min-width:0; }\r\n .rt .rt-logo, .rt .rt-eyebrow { display:none; }\r\n .rt h1 { font-size:14px; }\r\n .rt .rt-header-actions { width:auto; margin:0; flex-wrap:nowrap; }\r\n .rt .rt-header-actions > * { margin-left:4px; }\r\n .rt .rt-header-actions button { padding:8px; font-size:12px; }\r\n .rt .rt-nav { padding:4px 8px; }\r\n .rt .rt-workbench { display:flex; overflow:hidden; }\r\n .rt .rt-results { height:auto; }\r\n .rt .rt-detail { display:none; width:100%; border:0; overflow-y:auto; padding:12px 16px 24px; }\r\n .rt.rt-detail-open .rt-detail { display:block; }\r\n .rt.rt-detail-open .rt-results, .rt.rt-detail-open .rt-toolbar, .rt.rt-detail-open .rt-nav { display:none; }\r\n .rt .rt-back { display:block; position:sticky; top:-12px; width:100%; text-align:left; margin-bottom:16px; background:#33363d; z-index:1; }\r\n .rt .rt-toolbar { padding:8px 12px; max-height:55%; overflow-y:auto; flex-shrink:0; }\r\n .rt .rt-title-line { margin-bottom:8px; }\r\n .rt .rt-title-line p { display:none; }\r\n .rt .rt-controls .rt-search { min-width:140px; }\r\n .rt .rt-controls select { width:130px; }\r\n .rt .rt-footer { min-height:32px; padding:6px 12px; }\r\n .rt .rt-status { font-size:12px; }\r\n .rt .rt-row-sub { font-size:12px; }\r\n}\r\n@media (max-height:500px) and (max-width:950px) {\r\n .rt .rt-header { padding:4px 8px; }\r\n .rt .rt-title-line, .rt .rt-columns { display:none; }\r\n .rt .rt-tools { margin-top:0; }\r\n .rt .rt-footer { max-height:48px; overflow-y:auto; }\r\n}\r\n";
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

})(window);
