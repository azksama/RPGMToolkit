# RPGM Toolkit

Mod intégré pour RPG Maker MV/MZ et installateur Android **Rust + Tauri 2**, version **1.2.0**.

Recherche et édition de variables, alias anglais pour l’affichage, recherche et ajout d’objets, armes et armures. L’application Android détecte un jeu fourni en ZIP ou en dossier, installe le mod embarqué, permet sa mise à jour et sa désinstallation, avec sauvegardes et restauration.

## Organisation

- `plugin/src/` : sources du mod JavaScript compatible MV/MZ.
- `plugin/RPGMToolkit.js` : mod compilé et prêt à installer.
- `plugin/` : installateur Windows, démonstration et documentation d’utilisation.
- `android/` : application React/TypeScript, moteur Rust et accès Android SAF en Kotlin.
- `plugin/tests/` et `android/tests/` : tests du mod, installateur et régression du chargement MV/MZ.

## Développement

```sh
npm ci
npx playwright install chromium
npm run build:mod
npm test
```

`build:mod` reconstruit le plugin et synchronise sa copie embarquée dans l’application Android. Sous Windows avec PowerShell 7, `npm run test:installer` vérifie l’installation et la désinstallation sur des jeux factices.

```sh
cd android
npm ci
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
```

La compilation de l’APK est décrite dans [android/README.md](android/README.md). Le keystore de signature et son mot de passe sont conservés hors du dépôt. Les archives, APK et caches de compilation sont également exclus.

## Utilisation et validation

Voir [le guide du mod](plugin/LIRE-MOI.md), [le guide Android](android/README.md), [le correctif 1.0.1](plugin/CORRECTIF-1.0.1.md) et [le rapport de validation](android/VALIDATION.md).

Après une mise à jour de l’APK, sélectionner **Mod inclus**, puis le jeu et **Réinstaller / mettre à jour** pour actualiser le mod déjà installé. Fermer le jeu avant toute modification.

Les essais du chargement MV/MZ utilisent des fixtures ; l’installation Android a été vérifiée sur émulateur. La validation dans chaque jeu réel et dans JoiPlay reste distincte.

Licence MIT. Application indépendante de RPG Maker et de JoiPlay.

Après compilation du frontend Android, `npm run test:mobile` à la racine vérifie les formats mobiles et l’accessibilité. Voir [les nouveautés 1.1.0](CHANGELOG.md).

Le [guide 1.2.0](plugin/INTERFACE-COMPACTE.md) décrit la liste compacte, l’édition modale et les gels de session.
