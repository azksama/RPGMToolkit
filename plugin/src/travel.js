function createToolkitTravel(g, runtime) {
    'use strict';
    var prefs = runtime ? runtime.prefs : { settings:{ safeTeleport:true }, travel:{ places:[], last:null } }, pending = null;
    function save() { if (runtime) runtime.savePrefs(); }
    function position(name) {
        var p = g.$gamePlayer, direction = p.direction ? p.direction() : 2;
        return { name:String(name || '').trim().slice(0,80), mapId:g.$gameMap.mapId(), x:p.x, y:p.y, direction:direction };
    }
    function remember(name) {
        if (!String(name || '').trim()) throw new Error('Nom requis.');
        if (prefs.travel.places.length >= 100) throw new Error('100 emplacements maximum.');
        var p = position(name);
        if (!isFinite(p.x) || !isFinite(p.y) || p.mapId <= 0) throw new Error('Position indisponible.');
        prefs.travel.places.push(p); save(); return p;
    }
    function activePage(event, mapId) {
        var pages = event.pages || [];
        for (var i = pages.length - 1; i >= 0; i--) {
            var page = pages[i], c = page.conditions || {};
            if (c.switch1Valid && !g.$gameSwitches.value(c.switch1Id)) continue;
            if (c.switch2Valid && !g.$gameSwitches.value(c.switch2Id)) continue;
            if (c.variableValid && g.$gameVariables.value(c.variableId) < c.variableValue) continue;
            if (c.selfSwitchValid && !g.$gameSelfSwitches.value([mapId,event.id,c.selfSwitchCh])) continue;
            if (c.itemValid && !g.$gameParty.hasItem(g.$dataItems[c.itemId])) continue;
            if (c.actorValid && g.$gameParty.members().indexOf(g.$gameActors.actor(c.actorId)) < 0) continue;
            return page;
        }
        return null;
    }
    function nearest(map, x, y) {
        var data = map.data, live = map.id === g.$gameMap.mapId(), flags = g.$dataTilesets && data && g.$dataTilesets[data.tilesetId], blocked = {};
        flags = flags && flags.flags;
        if (!live && (!data || !Array.isArray(data.data) || !flags)) throw new Error('Passages de la carte indisponibles.');
        if (live && typeof g.$gameMap.isPassable !== 'function') throw new Error('Passages de la carte indisponibles.');
        if (live && g.$gameMap.events) {
            g.$gameMap.events().forEach(function(e) { if (!e._erased && (!e.page || e.page())) blocked[e.x+','+e.y] = true; });
            ['boat','ship','airship'].forEach(function(k) { var v = g.$gameMap[k] && g.$gameMap[k](); if (v && v._mapId === map.id) blocked[v.x+','+v.y] = true; });
        } else (data.events || []).forEach(function(e) { if (e && activePage(e,map.id)) blocked[e.x+','+e.y] = true; });
        function valid(a,b) { return a>=0 && b>=0 && a<map.width && b<map.height; }
        function tileFlag(a,b,z) { return flags[data.data[(z*map.height+b)*map.width+a]]; }
        function free(a,b) {
            if (!valid(a,b) || blocked[a+','+b]) return false;
            if (live) return !g.$gameMap.isDamageFloor || !g.$gameMap.isDamageFloor(a,b);
            for (var z=0;z<4;z++) { var f=tileFlag(a,b,z); if (typeof f !== 'number' || (f & 256)) return false; }
            return true;
        }
        function pass(a,b,d) {
            if (live) return g.$gameMap.isPassable(a,b,d);
            var bit = 1 << (d/2-1);
            for (var z=3;z>=0;z--) { var f=tileFlag(a,b,z); if (f & 16) continue; return (f & bit) === 0; }
            return false;
        }
        function safe(a,b) {
            if (!free(a,b)) return false;
            var directions = [[0,1,2],[-1,0,4],[1,0,6],[0,-1,8]];
            return directions.some(function(step) {
                var nx=a+step[0], ny=b+step[1], d=step[2];
                if (data && (data.scrollType===2 || data.scrollType===3)) nx=(nx+map.width)%map.width;
                if (data && (data.scrollType===1 || data.scrollType===3)) ny=(ny+map.height)%map.height;
                return (nx!==a || ny!==b) && free(nx,ny) && pass(a,b,d) && pass(nx,ny,10-d);
            });
        }
        var count=0;
        for (var radius=0;radius<=map.width+map.height;radius++) {
            for (var b=Math.max(0,y-radius);b<=Math.min(map.height-1,y+radius);b++) {
                var dy=radius-Math.max(x,map.width-1-x);
                if (dy>0 && b>y-dy && b<y+dy) { b=y+dy-1; continue; }
                var dx=radius-Math.abs(b-y), candidates=dx ? [x-dx,x+dx] : [x];
                for (var i=0;i<candidates.length;i++) {
                    var a=candidates[i]; if (!valid(a,b)) continue;
                    if (++count>250000) throw new Error('Recherche sûre trop étendue. Choisissez une autre position.');
                    if (safe(a,b)) return { x:a, y:b };
                }
            }
        }
        throw new Error('Aucune position sûre sur cette carte.');
    }
    function teleport(map,x,y,direction) {
        if (pending) throw new Error('Téléportation en cours.');
        if (g.$gamePlayer.isInVehicle && g.$gamePlayer.isInVehicle()) throw new Error('Descendez du véhicule avant de vous téléporter.');
        var target = prefs.settings.safeTeleport ? nearest(map,x,y) : { x:x, y:y }, from=position('Dernier emplacement');
        g.$gamePlayer.reserveTransfer(map.id,target.x,target.y,direction,0);
        pending = { from:from, mapId:map.id, x:target.x, y:target.y, session:g.$gameVariables };
        return target;
    }
    function tick() {
        if (!pending) return;
        if (pending.session !== g.$gameVariables) { pending=null; return; }
        if (g.$gamePlayer.isTransferring()) return;
        var p=pending; pending=null;
        if (g.$gameMap.mapId()===p.mapId && g.$gamePlayer.x===p.x && g.$gamePlayer.y===p.y) { prefs.travel.last=p.from; save(); }
    }
    return { nearest:nearest, teleport:teleport, tick:tick, remember:remember, position:position,
        places:function() { return prefs.travel.places; }, last:function() { return prefs.travel.last; },
        forget:function(index) { if (index>=0 && index<prefs.travel.places.length) { prefs.travel.places.splice(index,1); save(); } },
        reset:function() { pending=null; } };
}
