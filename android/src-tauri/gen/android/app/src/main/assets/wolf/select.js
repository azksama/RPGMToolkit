(function (g) {
    'use strict';
    var controls = new WeakMap(), picker = null, source = null, blocked = null;
    function title(select) {
        var label = select.closest('label'), span = label && label.querySelector('span');
        return select.getAttribute('aria-label') || (span && span.textContent) || select.id;
    }
    function sync(select, button) {
        var option = select.options[select.selectedIndex], text = option ? option.textContent : '—';
        if (button.firstChild.textContent !== text) button.firstChild.textContent = text;
        if (button.disabled !== select.disabled) button.disabled = select.disabled;
        button.setAttribute('aria-label', title(select));
    }
    function dismiss() {
        if (!picker) return;
        var select = source, button = controls.get(select);
        picker.remove(); picker = null; source = null;
        if (blocked) {
            blocked.node.inert = blocked.inert;
            if (blocked.hidden === null) blocked.node.removeAttribute('aria-hidden');
            else blocked.node.setAttribute('aria-hidden', blocked.hidden);
            blocked = null;
        }
        if (button) { button.setAttribute('aria-expanded', 'false'); if (button.isConnected) button.focus(); }
    }
    function open(select) {
        if (select.disabled || !select.options.length) return;
        dismiss(); source = select;
        var root = document.getElementById('rpgm-toolkit'), parent = select.closest('[role="dialog"]');
        blocked = parent ? {node:parent, inert:parent.inert, hidden:parent.getAttribute('aria-hidden')} : null;
        if (parent) { parent.inert = true; parent.setAttribute('aria-hidden', 'true'); }
        picker = document.createElement('div'); picker.className = 'wolf-picker'; picker.id = 'wolf-select-picker';
        var panel = document.createElement('section'); panel.className = 'wolf-picker-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title(select));
        var header = document.createElement('header'), close = document.createElement('button'), heading = document.createElement('strong');
        close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', root.lang === 'en' ? 'Close' : 'Fermer la fenêtre'); close.addEventListener('click', dismiss);
        heading.textContent = title(select); header.append(close, heading); panel.appendChild(header);
        var list = document.createElement('div'); list.className = 'wolf-picker-options'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', title(select));
        Array.from(select.options).forEach(function (option, index) {
            var choice = document.createElement('button'); choice.type = 'button'; choice.textContent = option.textContent;
            choice.dataset.value = option.value; choice.setAttribute('role', 'option'); choice.setAttribute('aria-selected', String(index === select.selectedIndex));
            choice.disabled = option.disabled || (option.parentElement.tagName === 'OPTGROUP' && option.parentElement.disabled);
            choice.addEventListener('click', function () {
                select.selectedIndex = index; sync(select, controls.get(select)); dismiss();
                select.dispatchEvent(new Event('input', {bubbles:true})); select.dispatchEvent(new Event('change', {bubbles:true}));
            }); list.appendChild(choice);
        });
        panel.appendChild(list); picker.appendChild(panel); root.appendChild(picker);
        picker.addEventListener('click', function (event) { if (event.target === picker) dismiss(); });
        controls.get(select).setAttribute('aria-expanded', 'true');
        var selected = list.querySelector('[aria-selected="true"]:not(:disabled)') || list.querySelector('button:not(:disabled)') || close;
        selected.focus(); selected.scrollIntoView({block:'nearest'});
    }
    function update() {
        var root = document.getElementById('rpgm-toolkit'); if (!root) return;
        if (picker && (root.hidden || !source.isConnected)) dismiss();
        root.querySelectorAll('select').forEach(function (select) {
            var button = controls.get(select);
            if (!button) {
                button = document.createElement('button'); button.type = 'button'; button.className = 'wolf-select'; button.dataset.wolfSelect = select.id;
                var text = document.createElement('span'), arrow = document.createElement('span'); arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true'); button.append(text, arrow);
                button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'wolf-select-picker'); button.setAttribute('aria-expanded', 'false');
                button.addEventListener('click', function (event) { event.preventDefault(); open(select); });
                select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); select.after(button); controls.set(select, button);
            }
            sync(select, button);
        });
    }
    g.addEventListener('keydown', function (event) {
        if (!picker) return;
        event.stopImmediatePropagation();
        var buttons = Array.from(picker.querySelectorAll('button:not(:disabled)')), index = buttons.indexOf(document.activeElement), next;
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        else if (event.key === 'Tab') next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        else if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, index + 1);
        else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
        else if (event.key === 'Home') next = 1;
        else if (event.key === 'End') next = buttons.length - 1;
        if (next !== undefined) { event.preventDefault(); buttons[next].focus(); buttons[next].scrollIntoView({block:'nearest'}); }
    }, true);
    document.addEventListener('change', function (event) { var button = controls.get(event.target); if (button) sync(event.target, button); });
    new MutationObserver(update).observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['disabled','selected','hidden']});
    g.WolfSelect = {close:dismiss};
})(window);
