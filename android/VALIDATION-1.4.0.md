# Validation 1.4.0

- 42 tests JavaScript : runtime MV, scènes MV/MZ et combat, traductions, paramètres persistants, suppression du dictionnaire, ressources ennemies et actions rapides.
- 22 assertions d’installation/désinstallation Windows.
- Deux suites Playwright sur sept formats, dont 844×390 et 1280×591 : défilement tactile/souris, manipulation de la barre, clavier, paramètres FR/EN, persistance, interrupteurs, HP ennemis et absence d’actions rapides supplémentaires dans les éditeurs. Contrôles axe sur les vues testées.
- Réseau et scènes de combat simulés dans les tests de navigateur. Aucun jeu réel JoiPlay ni téléphone physique testé.
- APK universel ARM64/ARMv7/x86_64 compilé et signé ; signature et alignement 16 Ko vérifiés. Contenu exact du mod vérifié dans les trois bibliothèques natives.
- Mise à jour 1.3.0 → 1.4.0 réussie sur émulateur Android, versionCode 1004000. Les flux natifs ZIP/SAF n’ont pas été rejoués de bout en bout.
