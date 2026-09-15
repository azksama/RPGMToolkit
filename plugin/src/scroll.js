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
