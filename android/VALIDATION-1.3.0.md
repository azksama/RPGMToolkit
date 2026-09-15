# Validation 1.3.0 — 15 septembre 2026

- 37 tests JavaScript réussis : runtime MV, chargement MV/MZ, variables/alias, queue parallèle et outils de jeu.
- 22 assertions Windows : installation, sauvegardes, réinstallation et désinstallation MV/MZ.
- Deux suites Playwright réussies. Formats : 320×740, 390×844, 844×390, 1280×591, 768×1024, 1024×768 et 1440×900. Vérification d’accessibilité axe sur les vues testées.
- Menu global, sous-menus, icônes, édition groupée, défilement tactile et souris des listes/modales. Un gestionnaire de moteur annule volontairement `touchmove` dans le test.
- Traduction testée avec réponses réseau simulées : trois travailleurs, réponses dans le désordre, dédoublonnage, plus de 80 noms, quota, annulation de toutes les requêtes, reprise et conservation des alias après rechargement.
- TypeScript et Vite compilés. APK universel signé ARM64 / ARMv7 / x86_64, assemblage Gradle réussi.
- `apksigner verify` et alignement 16 Ko vérifiés. Certificat identique aux versions précédentes : `23460078ebf6417f81ca5d1834c42fa4bc1d9df956bd32fad890797f2410d210`.
- Le contenu exact de `plugin/RPGMToolkit.js` est présent dans chacune des trois bibliothèques de l’APK, elles-mêmes identiques aux sorties Rust compilées.
- Mise à jour sur émulateur Android depuis 1.2.0 : `adb install -r` réussi, versionName 1.3.0 / versionCode 1003000. Application ouverte et interface inspectée ; le mod inclus affiche 1.3.0.

Aucun téléphone physique ni jeu réel de l’utilisateur sur JoiPlay testé. Le réseau de traduction est simulé dans les tests ; aucun gain de débit réel du service ni quota disponible n’est garanti. Les opérations Android ZIP/SAF n’ont pas été rejouées de bout en bout dans cette version ; leur moteur n’a pas changé.
