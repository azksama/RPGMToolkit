# Correctif 1.0.1 — plantage MZ au chargement

Corrige `Cannot read properties of undefined (reading 'isClosing')` déclenché par RPGMToolkit pendant le chargement d’une carte.

Le bouton Toolkit testait `Scene_Map.isBusy()` avant le démarrage de la scène. Sur MZ, ce test accède à une fenêtre de messages qui n’est pas encore créée lorsque les données de la carte chargent. Le plugin attend maintenant que le moteur confirme le démarrage de la scène et qu’elle soit active, puis vérifie si elle est occupée. Le moteur conserve la gestion du chargement et de la création des fenêtres.

## Mettre le jeu à jour sur Android

1. Fermez complètement le jeu dans JoiPlay.
2. Installez l’APK **1.0.1** par-dessus l’application actuelle, puis sélectionnez **Mod inclus** si un autre ZIP était sélectionné. Vous pouvez aussi garder l’APK actuel et y importer **RPGMToolkit-Mod-1.0.1.zip** avec **Choisir un autre ZIP du mod**.
3. Sélectionnez le dossier du jeu et choisissez **Réinstaller / mettre à jour**. Il n’est pas nécessaire de désinstaller le mod d’abord.
4. Relancez le jeu. Le bouton Toolkit apparaît lorsque la carte est prête.

Si vous utilisez un ZIP de jeu, enregistrez et extrayez le nouveau ZIP produit, puis lancez cette copie dans JoiPlay. Mettre uniquement l’application Android à jour ne remplace pas le plugin déjà copié dans un jeu.

Les sauvegardes de partie sont conservées. En remplacement manuel, copiez uniquement le nouveau `RPGMToolkit.js` dans `js/plugins/`, ou `www/js/plugins/` selon le jeu, en gardant son entrée activée dans `js/plugins.js`.

## Vérification du correctif

Le plugin 1.0.0 reproduit la même exception dans un scénario de chargement différé : `isMessageWindowClosing` → `isBusy` → `allowed` → `updateScene`. Le plugin 1.0.1 passe ce scénario, l’ouverture F6/script pendant le chargement, le démarrage de scène, la pause/reprise du panneau et les fenêtres en fermeture. Les scénarios couvrent les interfaces de cycle de vie MV et MZ avec un banc de simulation, pas le jeu complet de la capture.

23 tests JavaScript réussis au total, syntaxe ECMAScript 5 vérifiée et 22 assertions de l’installateur Windows réussies. Le jeu personnel de la capture et l’exécution réelle dans JoiPlay restent à confirmer sur l’appareil de l’utilisateur.
