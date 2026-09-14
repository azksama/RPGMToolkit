# Tests du correctif 1.0.1

Depuis la racine du projet, avec Node.js et Chromium pour Playwright :

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node --test tests/scene-lifecycle.test.cjs
```

Le premier test vérifie que l’ancienne version reproduit le plantage `isClosing`. Les quatre suivants exécutent le nouveau plugin complet dans Chromium, avec un cycle de chargement simulé MV ou MZ. Ils vérifient le refus d’ouverture avant démarrage, la poursuite du chargement natif, les fenêtres créées avant le chargement complet des ressources, l’ouverture après démarrage, la pause/reprise, le refus pendant la fermeture et F6 sans bouton flottant.

La fixture historique `RPGMToolkit-1.0.0.js` sert exclusivement à la reproduction de la régression. Le mod embarqué par l’APK est `src-tauri/resources/RPGMToolkit.js` en version 1.0.1.
