/* Manual pan survives RPG Maker/JoiPlay cancelling the browser's native gesture. */
function installToolkitScroll() {
    installToolkitScrollbars();
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
var refreshToolkitScroll;
function installToolkitScrollbars() {
    var bars=[],drag=null,lastTouch=0;
    ['.rt-home-content','.rt-list','.rt-modal-content'].forEach(function(selector,index){
        var target=$(selector),track=document.createElement('div'),thumb=document.createElement('div');
        if(!target.id)target.id='rt-scroll-area-'+index;
        track.className='rt-scrollbar';track.setAttribute('role','scrollbar');track.setAttribute('aria-label','Défilement');track.setAttribute('aria-controls',target.id);track.setAttribute('aria-orientation','vertical');track.tabIndex=0;
        thumb.className='rt-scroll-thumb';thumb.setAttribute('aria-hidden','true');track.appendChild(thumb);target.parentElement.appendChild(track);
        var bar={target:target,track:track,thumb:thumb};track._rtBar=bar;bars.push(bar);
        target.addEventListener('scroll',function(){update(bar);},{passive:true});
    });
    function update(bar) {
        var target=bar.target,rect=target.getBoundingClientRect(),visible=opened&&rect.height>0&&rect.width>0&&(!modalMode||target.classList.contains('rt-modal-content'));
        bar.track.hidden=!visible;if(!visible)return;
        var width=runtime?runtime.prefs.settings.scrollbarWidth:24,max=Math.max(0,target.scrollHeight-target.clientHeight),height=rect.height;
        bar.track.style.top=rect.top+'px';bar.track.style.left=(rect.right-width)+'px';bar.track.style.height=height+'px';bar.track.style.width=width+'px';
        bar.thumbHeight=max?Math.max(32,height*target.clientHeight/target.scrollHeight):height;bar.travel=Math.max(0,height-bar.thumbHeight);bar.max=max;
        bar.thumb.style.height=bar.thumbHeight+'px';bar.thumb.style.transform='translateY('+(max?bar.travel*target.scrollTop/max:0)+'px)';
        bar.track.setAttribute('aria-valuemin','0');bar.track.setAttribute('aria-valuemax',String(max));bar.track.setAttribute('aria-valuenow',String(Math.round(target.scrollTop)));bar.track.setAttribute('aria-disabled',String(!max));bar.track.tabIndex=max?0:-1;
    }
    refreshToolkitScroll=function(){bars.forEach(update);};
    function start(event,touch) {
        var track=event.target.closest&&event.target.closest('.rt-scrollbar');if(!track||!opened||(!touch&&event.button!==0))return;
        if(!touch&&Date.now()<lastTouch&&(!event.sourceCapabilities||event.sourceCapabilities.firesTouchEvents))return;if(touch)lastTouch=Date.now()+800;
        var bar=track._rtBar,p=touch?event.touches[0]:event;update(bar);if(!bar.max)return;
        var rect=track.getBoundingClientRect(),offset=p.clientY-rect.top;
        if(event.target!==bar.thumb){bar.target.scrollTop=Math.max(0,Math.min(bar.travel,offset-bar.thumbHeight/2))*bar.max/bar.travel;update(bar);}
        drag={bar:bar,touch:touch,y:p.clientY,top:bar.target.scrollTop};
        event.preventDefault();event.stopImmediatePropagation();track.focus({preventScroll:true});
    }
    function move(event,touch) {
        if(!drag||drag.touch!==touch||!opened)return;
        var p=touch?event.touches[0]:event;if(!p)return;
        drag.bar.target.scrollTop=drag.top+(p.clientY-drag.y)*drag.bar.max/(drag.bar.travel||1);
        update(drag.bar);event.preventDefault();event.stopImmediatePropagation();
    }
    function end(event,touch){if(drag&&drag.touch===touch){drag=null;event.preventDefault();event.stopImmediatePropagation();}}
    root.addEventListener('mousedown',function(e){start(e,false);},true);
    root.addEventListener('touchstart',function(e){start(e,true);},{capture:true,passive:false});
    g.addEventListener('mousemove',function(e){move(e,false);},true);
    g.addEventListener('touchmove',function(e){move(e,true);},{capture:true,passive:false});
    g.addEventListener('mouseup',function(e){end(e,false);},true);
    g.addEventListener('touchend',function(e){end(e,true);},{capture:true,passive:false});
    g.addEventListener('touchcancel',function(){drag=null;});g.addEventListener('blur',function(){drag=null;});
    root.addEventListener('keydown',function(e){
        var bar=e.target._rtBar;if(!bar)return;
        var delta={ArrowDown:40,ArrowUp:-40,PageDown:bar.target.clientHeight,PageUp:-bar.target.clientHeight};
        if(e.key==='Home')bar.target.scrollTop=0;else if(e.key==='End')bar.target.scrollTop=bar.max;else if(delta[e.key])bar.target.scrollTop+=delta[e.key];else return;
        e.preventDefault();e.stopImmediatePropagation();update(bar);
    },true);
    root.addEventListener('wheel',function(e){var track=e.target.closest&&e.target.closest('.rt-scrollbar');if(!track)return;track._rtBar.target.scrollTop+=e.deltaY*(e.deltaMode===1?20:e.deltaMode===2?track._rtBar.target.clientHeight:1);e.preventDefault();e.stopImmediatePropagation();},{capture:true,passive:false});
    root.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('.rt-scrollbar')){e.preventDefault();e.stopImmediatePropagation();}},true);
    if(g.ResizeObserver){var resize=new g.ResizeObserver(refreshToolkitScroll);bars.forEach(function(bar){resize.observe(bar.target);});}
    if(g.MutationObserver)new g.MutationObserver(refreshToolkitScroll).observe($('.rt-panel'),{childList:true,subtree:true,characterData:true});
    if(g.MutationObserver)new g.MutationObserver(refreshToolkitScroll).observe($('.rt-modal-content'),{childList:true,subtree:true,characterData:true});
    g.addEventListener('resize',refreshToolkitScroll);
}
