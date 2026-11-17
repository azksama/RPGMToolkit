# Tests du cycle de vie MV/MZ

Depuis la racine du dépôt :

```sh
npm ci
npx playwright install chromium
npm run build:mod
npm test
npm run test:portrait
```

`scene-lifecycle.test.cjs` exécute le plugin embarqué par l’APK dans Chromium avec un cycle de chargement simulé. La fixture distingue les API MV (`SceneManager.isCurrentSceneStarted`) et MZ (`Scene_Base.isStarted`) et inclut `Graphics` pour activer le contrôleur portrait.

Les tests couvrent le chargement initial, la création différée des fenêtres et des ressources, les changements de carte après initialisation du Toolkit, le mode portrait activé ou désactivé, la pause/reprise, la fermeture des dialogues et les fenêtres de combat. Ils vérifient que le chargement natif continue et que le Toolkit ne consulte pas les fenêtres avant le démarrage de la scène.

La fixture historique `RPGMToolkit-1.0.0.js` reproduit le premier plantage `isClosing`. Les tests de changement de carte ajoutés en 1.9.4 reproduisent aussi le plantage de la 1.9.3 avec son plugin complet.

Ces tests JavaScript ne remplacent pas une validation dans JoiPlay ou sur le jeu du signalement. Les tests Android natifs utilisent exclusivement l’émulateur Android Studio et les outils du SDK.
