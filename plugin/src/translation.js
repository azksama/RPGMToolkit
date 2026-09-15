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
