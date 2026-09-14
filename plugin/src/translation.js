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
