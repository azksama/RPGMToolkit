/* Session-scoped game tools. Wrappers are removed when disabled or on save load. */
function createToolkitTools(g, runtime) {
    'use strict';
    var travel = createToolkitTravel(g, runtime);
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
        if (session !== g.$gameVariables) { god = false; noclip = false; remove(); session = g.$gameVariables; epoch++; travel.reset(); }
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
        sync(); travel.tick();
        if (god) members().forEach(function(a) { if (a.hp < a.mhp || a.isStateAffected(a.deathStateId())) { a.setHp(a.mhp); a.removeState(a.deathStateId()); } });
    }
    function enemies() { return g.$gameParty.inBattle() && g.$gameTroop ? g.$gameTroop.members() : []; }
    function resourceTargets(id) {
        sync();
        if (String(id).indexOf('enemy:') !== 0 && id !== 'enemies') return targets(id);
        var list = enemies();
        if (!list.length) throw new Error('Aucun ennemi en combat.');
        if (id === 'enemies') return list;
        var index = integer(String(id).slice(6), 0, list.length - 1);
        return [list[index]];
    }
    function ensureResources() {
        sync();
        if (g.$gamePlayer.isTransferring() || g.$gameMessage.isBusy() || (!g.$gameParty.inBattle() && g.$gameMap.isEventRunning())) throw new Error('Action indisponible.');
    }
    function adjustResource(id, param, action) {
        ensureResources();
        if (['hp','mp','tp'].indexOf(param) < 0 || ['zero','add','subtract'].indexOf(action) < 0) throw new Error('Action invalide.');
        resourceTargets(id).forEach(function(a) {
            var max = param === 'hp' ? a.mhp : param === 'mp' ? a.mmp : a.maxTp();
            var next = action === 'zero' ? 0 : a[param] + (action === 'add' ? 1000 : -1000);
            a[param === 'hp' ? 'setHp' : param === 'mp' ? 'setMp' : 'setTp'](Math.max(0,Math.min(max,next)));
        });
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
        ensureResources();
        var list = resourceTargets(id);
        list.forEach(function(a) { if (!full) { integer(hp, 0, a.mhp); integer(mp, 0, a.mmp); integer(tp, 0, a.maxTp()); } });
        list.forEach(function(a) { a.setHp(full ? a.mhp : Number(hp)); a.setMp(full ? a.mmp : Number(mp)); a.setTp(full ? a.maxTp() : Number(tp)); });
        return list.length;
    }
    function stat(id, param, next) {
        ensureResources(); var a = targets(id)[0];
        if (param === 'level') a.changeLevel(integer(next, 1, a.maxLevel()), false);
        else if (param === 'exp') a.changeExp(integer(next, 0, 999999999), false);
        else { param = integer(param, 0, 7); next = integer(next, -999999, 999999); a.addParam(param, next - (a._paramPlus[param] || 0)); }
        return a;
    }
    function adjustStat(id, param, action) {
        if (['zero','add','subtract'].indexOf(action) < 0) throw new Error('Action invalide.');
        var a = targets(id)[0], current, min, max;
        if (param === 'level') { current = a.level; min = 1; max = a.maxLevel(); }
        else if (param === 'exp') { current = a.currentExp(); min = 0; max = 999999999; }
        else { param = integer(param,0,7); current = a._paramPlus[param] || 0; min = -999999; max = 999999; }
        var next = action === 'zero' ? 0 : current + (action === 'add' ? 1000 : -1000);
        return stat(id,param,Math.max(min,Math.min(max,next)));
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
            return { id:id, width:integer(data.width,1,10000), height:integer(data.height,1,10000), epoch:token, data:data };
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
        return travel.teleport(map,x,y,direction);
    }
    return { travel:travel, sync:sync, tick:tick, setGod:setGod, setNoclip:setNoclip, members:members, enemies:enemies, resourceTargets:resourceTargets, resources:resources, adjustResource:adjustResource, stat:stat, adjustStat:adjustStat, maps:maps, loadMap:loadMap, teleport:teleport,
        state:function() { sync(); return { god:god, noclip:noclip }; } };
}
