# RPGM Toolkit Android — 1.10.0

Application Android Rust + Tauri 2, interface React/TypeScript, accès aux fichiers par un plugin Kotlin Storage Access Framework. Les modules MV/MZ `RPGMToolkit.js` et XP/VX/VX Ace `RPGMToolkit.rb` sont embarqués dans la bibliothèque Rust.

## Utilisation

1. Installer l’APK et ouvrir **RPGM Toolkit**.
2. Choisir **Archive ZIP** ou **Dossiers de jeux**. Le sélecteur Android donne accès uniquement au fichier ou au dossier choisi.
3. Vérifier le titre, le moteur et l’état du mod détectés.
4. Choisir **Installer le mod**, ou **Désinstaller le mod** si le Toolkit est présent.
5. Pour un ZIP, enregistrer le nouveau fichier, l’extraire, puis sélectionner le jeu extrait dans JoiPlay. Pour un dossier, le jeu est modifié directement et peut être rouvert.

Le mod est déjà inclus. Dans **Réglages**, **Importer un ZIP du mod** accepte une archive contenant exactement un `RPGMToolkit.js`, pour installer une autre version de ce même mod. Cet import concerne MV/MZ ; RGSS et WOLF utilisent leurs modules inclus.

## Sauvegardes et récupération

Fermer le jeu avant une modification de son dossier. L’application copie les fichiers précédents dans `.rpgm-toolkit-backups/<identifiant>/`, puis écrit le plugin et son inscription dans `js/plugins.js`. Le contenu écrit est relu et vérifié. En cas d’erreur, les fichiers précédents sont restaurés. Après une interruption du processus, sélectionner à nouveau le même dossier : le bouton **Restaurer le jeu** reprend la restauration depuis le journal.

Le ZIP original n’est jamais modifié : chaque opération crée un nouveau ZIP, dont l’export est vérifié par SHA-256. Une annulation du sélecteur de destination laisse un bouton pour enregistrer le résultat tant que l’application conserve sa session. Après fermeture de l’application, sélectionner à nouveau l’archive source et refaire l’opération.

La désinstallation retire `RPGMToolkit.js` et son entrée dans la liste des plugins. Elle conserve les copies de secours, les autres plugins et les sauvegardes de partie. Elle n’annule pas les changements de variables ou d’inventaire déjà enregistrés dans les sauvegardes du jeu.

## Périmètre

- Android 8.0+ (API 26), processeurs ARM64, ARMv7 et x86_64.
- Jeux RPG Maker MV 1.x et MZ dans un dossier JavaScript standard : `js/plugins.js`, `js/rpg_core.js` ou `js/rmmz_core.js`. Racine, sous-dossier `www`, ou un dossier enveloppant acceptés. Le ZIP peut contenir une racine plus profonde.
- Un jeu par ZIP ; plusieurs dossiers ou un dossier parent pour les bibliothèques. `plugins.js` accepte JSON et les littéraux JavaScript de données usuels, sans expressions exécutables.
- XP/VX/VX Ace : `Game.ini` et scripts Marshal standards, seuls ou dans une archive RGSSAD v1/v3. La copie modifiée des scripts est écrite dans `RPGMToolkit/`, et `Game.ini` redirige vers cette copie. Les originaux restent intacts. La désinstallation restaure exactement le `Game.ini` original.
- Les scripts RGSS sont limités à 16 Mo. Les runtimes propriétaires, scripts obfusqués ou formats modifiés peuvent être refusés. Voir [le guide RGSS](../plugin/rgss/README.md).
- Jeux ZIP de 8 Go maximum, 100 000 entrées et 16 Go de taille décompressée déclarée. ZIP du mod de 16 Mo maximum ; `plugins.js` jusqu’à 64 Mio, autres fichiers de configuration et plugin limités à 4 Mio. Les ZIP protégés par mot de passe, les chemins dangereux, les doublons et les liens sont refusés.
- Les APK de jeux et les répertoires privés d’autres applications ne sont pas modifiés. Choisir un dossier partagé accessible, par exemple `Documents/Jeux`. La compatibilité du jeu lui-même avec JoiPlay reste nécessaire.
- L’installateur traite les fichiers localement. La traduction des noms dans le mod en jeu utilise un service en ligne uniquement à la demande ; les alias n’altèrent pas les noms internes du jeu.

## Mises à jour de l’application

Dans **Réglages → Application**, les mises à jour automatiques sont activées par défaut, en Wi-Fi. Android WorkManager vérifie les releases publiques de `azksama/RPGMToolkit` toutes les 12 heures, selon les contraintes réseau et batterie du système. Le téléchargement continue lorsque l’application passe en arrière-plan ; Android peut le reporter ou le relancer après une interruption.

**Vérifier** recherche la dernière version stable. **Télécharger** utilise le réseau disponible, même si l’automatisation est limitée au Wi-Fi. Après téléchargement, **Installer** ouvre l’installateur Android ; la première installation demande d’autoriser cette application comme source. La confirmation Android reste nécessaire. L’installation conserve les données de l’application.

L’APK doit correspondre au nom du paquet, au code de version annoncé, à l’empreinte SHA-256 publiée par GitHub et au certificat de signature de l’application déjà installée. Aucun jeton GitHub n’est stocké. Une application recompilée avec une autre clé ne peut pas utiliser les APK officiels pour se mettre à jour.

## Compatibilité et accès aux dossiers

Un dossier MV/MZ complet n’a pas besoin de `index.html` pour recevoir le plugin : le lanceur peut se trouver ailleurs. Les fichiers du moteur, le registre et `data/System.json` restent contrôlés. L’installateur ne crée ni ne remplace le lanceur du jeu.

Les identifiants de scripts RGSS encodés comme grands entiers Marshal et leurs références sont conservés. Aucun script n’est exécuté pendant l’analyse.

Les métadonnées SAF sont chargées en une requête par dossier et réutilisées pendant une opération. Les caches sont bornés et invalidés lors des mutations ; les empreintes sont recalculées après la copie de secours. Le lecteur utilise JSON directement quand c’est possible, puis JSON5 pour les littéraux JavaScript.

## Architecture

- `src/` : interface et commandes Tauri. Aucun chemin arbitraire fourni par le frontend aux fonctions d’écriture.
- `src-tauri/src/engine.rs` : détection, parsing sans exécution JavaScript, transformations ZIP par copie des données compressées inchangées, sauvegardes et contrôles.
- `src-tauri/src/lib.rs` : session native, commandes asynchrones, verrou d’opération, progression et plugin mobile.
- `src-tauri/gen/android/app/src/main/java/fr/azk/rpgmtoolkit/StoragePlugin.kt` : sélection SAF, lecture/écriture sur un exécuteur I/O, journal de restauration, vérification des empreintes.

## Compilation sous Windows

Prérequis : Node.js 22+, Rust stable, Android SDK avec plateforme 36 et build-tools 36, NDK 29, JDK 21 fourni par Android Studio. Aucun changement du registre Windows ni activation des liens symboliques n’est nécessaire avec le script fourni.

```powershell
npm ci
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = 'C:\chemin\Android\Sdk'
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\29.0.14206865"
$env:RPGM_SIGN_STORE = 'C:\chemin-prive\release.jks'
# Définir RPGM_SIGN_PASSWORD dans l’environnement du processus, sans le commiter.
# Le keystore doit contenir une clé nommée rpgm-toolkit.
./scripts/build-apk.ps1
```

Sortie : `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`.

Les fichiers Android générés nécessaires sont inclus dans les sources. Le script recalcule les chemins locaux de Tauri à partir de Cargo et copie explicitement les bibliothèques, puis assemble l’APK avec Gradle. La clé privée ayant signé l’APK livré et son mot de passe sont exclus des sources. Une mise à jour sur un appareil exige la même clé de signature ; une compilation signée avec une autre clé demande de désinstaller l’application précédente.

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
```

## Références techniques

- [Plugins mobiles Tauri](https://v2.tauri.app/develop/plugins/develop-mobile/)
- [Signature Android Tauri](https://v2.tauri.app/distribute/sign/android/)
- [Sélecteur de documents Android](https://developer.android.com/training/data-storage/shared/documents-files)

Application indépendante de RPG Maker et de JoiPlay. Voir le rapport de validation livré pour distinguer les tests automatisés, les essais sur émulateur et la validation sur un jeu réel.

La sélection de dossiers accepte une bibliothèque contenant plusieurs jeux et des ajouts successifs de dossiers. Le mod MV/MZ embarqué est en version 1.10.0. Voir le guide bibliothèque du README principal.


## WOLF / Winlator

Voir [le guide WOLF](../wolf/README.md). Le dossier doit être partagé avec Winlator. Après installation, **Toolbox** lance le menu Android flottant ; autoriser l’affichage par-dessus les applications. Les profils définissent les objets, HP et stats propres au jeu. Les archives WOLF protégées restent refusées.
