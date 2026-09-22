# Validation 1.7.0

- 47 tests JavaScript : passages bloqués, cases isolées, sorties à sens unique, dégâts, événements conditionnels, boucles de carte, No Clip, véhicules, sessions périmées et historique de transfert.
- Test navigateur des emplacements, retour, suppression, persistance et réglages Toolbox en 844×390 et 360×740. Deux suites de régression mobile du navigateur ; aucune exécution Android n’est revendiquée pour cette version.
- Simulation Ruby des API XP/VX/VX Ace : cases bloquées et isolées, événements, historique uniquement après arrivée et emplacements persistants.
- APK recompilé avec les modules JS et Ruby de la 1.7, signature et contenu embarqué contrôlés avant publication.

Les contrôles de déplacement portent sur les moteurs standards. Les modifications dynamiques de carte, scripts de collision tiers et téléphones/JoiPlay réels restent hors de la validation automatisée.

---

# Validation 1.6.0

- 43 tests JavaScript : éditeurs, traductions, outils et cycle de vie des scènes.
- 24 assertions de l’installateur PowerShell, dont les littéraux JavaScript avec clés japonaises et échappements.
- 17 tests Rust : parseur, profondeur bornée, Marshal, archives RGSSAD, ZIP et bibliothèques.
- 6 tests Kotlin : scanner, Game.ini et extraction des archives RGSSAD v1/v3.
- Tests navigateur : bibliothèque et deux suites mobiles, sans régression de l’interface 1.5.
- Simulation Ruby des trois API RGSS en 640×480, 544×416 et 640×360 : édition, inventaire, freeze, Godmode, No Clip, HP ennemis, persistance et géométrie.
- Émulateur Android : installation puis désinstallation groupées de neuf fixtures. XP/VX/VX Ace, chacun libre et archivé ; MV 1.0, MV 1.5 et MZ avec registre JavaScript non JSON. Neuf succès, aucune erreur. Game.ini, scripts d’origine, archives et sauvegardes comparés octet par octet ; paramètres des plugins conservés.
- Les scripts réécrits ont été relus avec Ruby Marshal et décompressés avec Zlib : scripts originaux et noms Unicode conservés.
- APK universel signé : ARM64, ARMv7, x86_64. Alignement 16 Ko vérifié, signature identique aux versions précédentes, modules JS et Ruby embarqués vérifiés octet par octet.

Ces essais utilisent des fixtures et des API simulées. Aucun test sur un téléphone physique, un jeu commercial réel ou un runtime RGSS original/JoiPlay n’est revendiqué. La traduction réseau RGSS dépend des bibliothèques du runtime ; l’import TSV et les alias persistants sont testés localement.

---

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
