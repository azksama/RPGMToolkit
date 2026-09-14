# Validation du correctif 1.0.1

Le plantage MZ `isClosing` signalé est reproduit avec le plugin 1.0.0 puis absent avec le plugin 1.0.1 sur un banc de cycle de scène différé MV/MZ. Les 23 tests JavaScript, la syntaxe ES5, les 22 assertions de l’installateur Windows et les 6 tests Rust passent.

L’APK release 1.0.1 (code 1000001) a été compilé pour les trois architectures, signé avec le même certificat que 1.0.0, vérifié par apksigner et zipalign 16 Ko, puis installé par-dessus 1.0.0 sur l’émulateur Android 16. Le mod inclus y apparaît en version 1.0.1.

Une mise à jour d’un dossier MZ de test contenant le plugin 1.0.0 a été effectuée avec cet APK via le sélecteur Android. Le plugin installé est identique au correctif ; le registre et les paramètres sont conservés, ainsi que le moteur, System.json, la ressource et la sauvegarde sentinelles. Les fichiers précédents sont présents dans la copie de secours et le journal temporaire a été supprimé. Le plugin exact est également présent dans les trois bibliothèques de l’APK livré. Les sources incluent les tests de régression et les empreintes sont actualisées dans SHA256SUMS.txt.

Le jeu complet de la capture n’a pas été fourni. La disparition du plantage sur ce jeu dans JoiPlay reste à confirmer sur le téléphone. Mettre uniquement l’APK à jour ne remplace pas le plugin du jeu : suivre CORRECTIF-1.0.1.md.

## Historique de validation de la version précédente
# Validation — RPGM Toolkit Android 1.0.0

Vérifications terminées le 13 septembre 2026.

## APK livré

- Application `fr.azk.rpgmtoolkit`, version `1.0.0`, code `1000000`.
- APK release signé avec une clé RSA 3072 bits ; `apksigner verify` réussi, signature APK v2 valide. Clé privée et mot de passe exclus des livrables.
- `minSdkVersion=26`, `targetSdkVersion=36`. Bibliothèques ARM64, ARMv7 et x86_64 incluses.
- Alignement ZIP 16 Ko vérifié par `zipalign -c -P 16 4`. Tous les segments LOAD des trois bibliothèques Rust sont alignés sur `0x4000`, vérifiés avec `llvm-readelf`.
- Build TypeScript/Vite et assemblage Gradle release/R8/lint vital terminés avec succès. Script de compilation Windows fourni utilisé pour construire le dernier APK.
- Bibliothèques extraites de l’APK comparées octet par octet aux trois bibliothèques finales compilées. Fichier du mod embarqué identique au plugin MV/MZ livré séparément.
- Empreintes des livrables dans `SHA256SUMS.txt`.

## Essais Android natifs

Émulateur Android 16, image API 36.1, x86_64, DocumentsProvider Android et WebView 134. L’APK release a été installé avec succès et lancé depuis un processus arrêté. Les jeux utilisés sont des structures MV/MZ synthétiques avec un autre plugin, un fichier de sauvegarde et une ressource sentinelle ; ils ne constituent pas des jeux jouables.

| Parcours | Résultat vérifié |
| --- | --- |
| Sélection du dossier MV par le sélecteur système | Titre, moteur et absence du mod détectés |
| Installation dans le dossier | Plugin identique au mod embarqué, activation en fin de registre, copie de secours créée |
| Désinstallation dans le dossier | Fichier et entrée du Toolkit retirés ; autre plugin et ses paramètres, sauvegarde, ressource, moteur et System.json conservés |
| Sélection et transformation d’un ZIP MZ | Jeu détecté, copie modifiée créée avec le mod et les sauvegardes des fichiers précédents |
| Export du ZIP par le sélecteur système | ZIP exporté relu et vérifié ; ZIP source strictement identique à l’original ; CRC intégral du résultat valide |
| Annulation puis reprise de l’export | Résultat conservé dans la session, bouton Enregistrer le ZIP prêt fonctionnel |
| Réouverture du ZIP modifié après redémarrage | Mod détecté comme installé dans le dernier APK |
| Désinstallation et nouvel export du ZIP | Mod absent du résultat, autres entrées conservées, sauvegardes de secours conservées ; deux exports distincts vérifiés |
| Import du ZIP du mod puis retour au mod inclus | Import détecté, indicateur IMPORTÉ, retour au plugin embarqué fonctionnel |
| Restauration d’une transaction interrompue simulée | Journal et sauvegarde injectés avec un registre partiellement écrit ; récupération de l’original exact, retrait du plugin partiel, suppression du journal |

L’installation et la désinstallation en dossier ont été rejouées sur le dernier APK. Le dernier APK a également servi aux essais de réouverture du ZIP, d’import du mod et de désinstallation/export ZIP. Aucune exception fatale de l’application n’a été observée pendant ces parcours. Les barres système et la navigation ont été contrôlées visuellement après correction des marges Android.

## Vérifications automatisées

- **6 tests Rust réussis** : installation/désinstallation ZIP avec conservation des autres fichiers et de l’original ; chemin dangereux ; noms de fichiers ; registre non standard et doublons ; idempotence ; détection des changements de contenu.
- **Interface Playwright** : choix ZIP/dossier, installation, désinstallation, export, confirmation de fermeture du jeu, traitement d’une réponse IPC de succès ou d’erreur perdue au retour du sélecteur.
- **Affichage** : largeurs de 320, 412, 768 et 1200 px, aucun débordement horizontal détecté. Audit axe sur l’écran d’installation testé : aucune violation des règles WCAG A/AA exécutées. Cela ne remplace pas un audit complet d’accessibilité.
- **Archive de sources** : test CRC réussi, dépendances compilées/caches exclus, absence de clés privées, mot de passe de signature et chemins de compilation personnels.

## Limites de validation

Aucun téléphone physique ni jeu personnel de l’utilisateur n’a été fourni. Le lancement d’un jeu réel dans JoiPlay et les conflits possibles avec ses autres plugins restent à vérifier sur ce jeu. Les tests du plugin en simulation MV/MZ sont détaillés dans le paquet du mod séparé.

Les limites de 8 Go/100 000 entrées sont des limites imposées par le programme ; aucun benchmark sur une archive de cette taille n’a été effectué. Les performances et possibilités d’écriture d’un fournisseur SAF distant ou d’une carte SD dépendent du téléphone. La restauration a été testée avec une interruption simulée par ses fichiers, sans coupure physique du stockage.

La désinstallation du plugin conserve les copies de secours et ne remet pas à zéro les variables ou objets déjà enregistrés dans une sauvegarde de partie.
