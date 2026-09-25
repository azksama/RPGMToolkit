function createToolkitPortrait(g, runtime) {
    'use strict';
    var original=null, active=false, dirty=true, locked=false, error='';
    var graphics=g.Graphics, manager=g.SceneManager;
    function supported() {
        return !!(graphics && manager && g.Scene_Map && /^(MV|MZ)$/.test(g.Utils && g.Utils.RPGMAKER_NAME));
    }
    function safe() {
        var scene=manager && manager._scene;
        return supported() && scene instanceof g.Scene_Map && !manager.isSceneChanging() &&
            (!manager.isCurrentSceneStarted || manager.isCurrentSceneStarted()) &&
            (!scene.isBusy || !scene.isBusy()) && (!scene.isActive || scene.isActive()) &&
            g.$gamePlayer && !g.$gamePlayer.isTransferring() &&
            (!g.$gameMap.isEventRunning || !g.$gameMap.isEventRunning()) && !g.$gameMessage.isBusy();
    }
    function desiredSize() {
        var ratio=g.innerWidth>0 && g.innerHeight>g.innerWidth ? g.innerHeight/g.innerWidth : 16/9;
        return { width:720, height:Math.round(720*Math.min(4,ratio)) };
    }
    function resize(w,h,bw,bh,stretch) {
        graphics._stretchEnabled=stretch;
        graphics.boxWidth=bw; graphics.boxHeight=bh;
        if (typeof graphics.resize==='function') graphics.resize(w,h);
        else { graphics.width=w; graphics.height=h; }
        if (graphics._updateAllElements) graphics._updateAllElements();
        manager._screenWidth=w; manager._screenHeight=h; manager._boxWidth=bw; manager._boxHeight=bh;
    }
    function restore() {
        if (!original) return;
        resize(original.width,original.height,original.boxWidth,original.boxHeight,original.stretch);
        ['_screenWidth','_screenHeight','_boxWidth','_boxHeight'].forEach(function(k) {
            if (original.manager[k]===undefined) delete manager[k]; else manager[k]=original.manager[k];
        });
    }
    function request(value) {
        if (!supported()) throw new Error('Mode portrait disponible sur MV/MZ.');
        if (!safe()) throw new Error('Activez ce mode depuis la carte, hors événement.');
        runtime.prefs.settings.portrait=!!value; runtime.savePrefs(); dirty=true; error='';
        var orientation=g.screen && g.screen.orientation;
        if (value && orientation && orientation.lock) {
            try { var promise=orientation.lock('portrait'); if(promise && promise.then)promise.then(function(){if(runtime.prefs.settings.portrait)locked=true;else if(orientation.unlock)orientation.unlock();},function(){}); } catch(e) {}
        } else if (!value && locked && orientation && orientation.unlock) { orientation.unlock(); locked=false; }
    }
    function tick(opened) {
        if (!supported() || opened || !safe()) return false;
        var wanted=!!runtime.prefs.settings.portrait, size=desiredSize();
        if (!wanted && !active) { dirty=false; return false; }
        if (wanted===active && (!dirty || (graphics.width===size.width && graphics.height===size.height))) { dirty=false; return false; }
        if (!original) original={width:graphics.width,height:graphics.height,boxWidth:graphics.boxWidth,boxHeight:graphics.boxHeight,stretch:graphics._stretchEnabled,manager:{
            _screenWidth:manager._screenWidth,_screenHeight:manager._screenHeight,_boxWidth:manager._boxWidth,_boxHeight:manager._boxHeight
        }};
        try {
            if (wanted) resize(size.width,size.height,size.width,size.height,true); else restore();
            active=wanted; dirty=false;
            if (g.$gamePlayer.center) g.$gamePlayer.center(g.$gamePlayer.x,g.$gamePlayer.y);
            manager.goto(g.Scene_Map);
            return true;
        } catch(e) {
            active=false; dirty=false; runtime.prefs.settings.portrait=false; runtime.savePrefs();
            try { restore(); if(locked && g.screen && g.screen.orientation && g.screen.orientation.unlock){g.screen.orientation.unlock();locked=false;} } catch(ignored) {}
            error=e.message || String(e); return false;
        }
    }
    function hook(type,name,callback) {
        var proto=g[type] && g[type].prototype, previous=proto && proto[name];
        if(typeof previous!=='function')return;
        proto[name]=function(){return callback.call(this,previous,arguments);};
    }
    function cover(sprite) {
        if(!sprite || !sprite.bitmap || !sprite.scale)return;
        function fit() {
            if(!active || !sprite.bitmap || !sprite.bitmap.width || sprite.destroyed)return;
            var scale=Math.max(graphics.width/sprite.bitmap.width,graphics.height/sprite.bitmap.height);
            sprite.scale.x=scale;sprite.scale.y=scale;
            var ax=sprite.anchor ? sprite.anchor.x : 0, ay=sprite.anchor ? sprite.anchor.y : 0;
            sprite.x=(graphics.width-sprite.bitmap.width*scale)/2+ax*sprite.bitmap.width*scale;
            sprite.y=(graphics.height-sprite.bitmap.height*scale)/2+ay*sprite.bitmap.height*scale;
        }
        if(sprite.bitmap.addLoadListener)sprite.bitmap.addLoadListener(fit);else fit();
    }
    hook('Scene_Base','start',function(previous,args){
        var result=previous.apply(this,args);if(!active)return result;
        var layer=this._windowLayer, windows=layer && layer.children || [];
        windows.forEach(function(w){
            if(!w.move || !w.createContents || w.width<=0 || w.height<=0)return;
            var width=Math.min(w.width,graphics.boxWidth),height=Math.min(w.height,graphics.boxHeight);
            var x=Math.max(0,Math.min(w.x,graphics.boxWidth-width)),y=Math.max(0,Math.min(w.y,graphics.boxHeight-height));
            if(w.width!==width || w.height!==height){w.move(x,y,width,height);w.createContents();if(w.refresh)w.refresh();}
            else if(w.x!==x || w.y!==y)w.move(x,y,width,height);
        });
        cover(this._backgroundSprite);cover(this._backSprite1);cover(this._backSprite2);
        return result;
    });
    hook('Window_Message','processCharacter',function(previous,args){
        var state=args[0];
        if(active && state && !state.rtl && this.contents && this.textWidth && this.processNewLine){
            var ch=state.text.charAt(state.index), left=typeof this.newLineX==='function'?this.newLineX(state):state.left || 0;
            var buffered=state.buffer?this.textWidth(state.buffer):0;
            if(ch && ch.charCodeAt(0)>=32 && state.x+buffered>left && state.x+buffered+this.textWidth(ch)>this.contents.width){
                if(this.flushTextState)this.flushTextState(state);
                var index=state.index;this.processNewLine(state);state.index=index;
                if(this.needsNewPage && this.needsNewPage(state))return;
            }
        }
        return previous.apply(this,args);
    });
    hook('Window_MenuStatus','maxCols',function(previous,args){return active?1:previous.apply(this,args);});
    hook('Window_MenuStatus','numVisibleRows',function(previous,args){return active?4:previous.apply(this,args);});
    hook('Sprite_Actor','setActorHome',function(previous,args){
        var result=previous.apply(this,args);
        if(active && this.setHome){var i=Number(args[0])||0;this.setHome(graphics.boxWidth*(0.68+Math.min(i,3)*0.045),graphics.boxHeight*0.45+i*48);}
        return result;
    });
    hook('Sprite_Enemy','setBattler',function(previous,args){
        var result=previous.apply(this,args), battler=args[0];
        if(active && original && battler && this.setHome && battler.screenX){
            var x=battler.screenX()/original.boxWidth, y=battler.screenY()/original.boxHeight;
            this.setHome(Math.max(48,Math.min(graphics.boxWidth-80,x*graphics.boxWidth)),graphics.boxHeight*0.10+y*Math.min(original.boxHeight,graphics.boxHeight*0.52));
        }
        return result;
    });
    if(g.addEventListener)g.addEventListener('resize',function(){dirty=true;});
    return {supported:supported,request:request,tick:tick,active:function(){return active;},error:function(){return error;}};
}
