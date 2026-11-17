# Validation 1.10.0

Vérifications du 17 novembre 2026.

- Nouvelle interface et nouvelle icône contrôlées dans l’APK sur Android Emulator, avec ADB/UI Automator, en portrait 720 × 1280 et paysage 1280 × 720. Captures et comparaison avec la référence dans [design-qa.md](../design-qa.md).
- 63 tests JavaScript du mod, 33 cas Rust de l’installateur, 24 assertions de l’installateur PowerShell, 10 tests Rust WOLF et deux tests de l’hôte WOLF réussis.
- 12 tests d’instrumentation Android réussis : grands registres, échanges WOLF, sérialisation, restauration, validation des releases et refus des APK altérés, index SAF et invalidation après modification.
- Installation, répétition et désinstallation de six jeux de test via le sélecteur Android : MV avec `plugins.js` de 5 Mio, MZ sans `index.html`, racine `Jeu/Data`, XP/VX/VX Ace avec identifiants de scripts Marshal supérieurs à 2³¹ − 1. Les fixtures Ruby sont produites par `Marshal.dump`.
- Après installation, les autres paramètres et scripts restent identiques. Après désinstallation, les sauvegardes, scripts d’origine et `Game.ini` sont conservés octet pour octet. La seconde installation de la même version ne réécrit aucun jeu et ne crée pas de sauvegarde supplémentaire.
- Test SAF ciblé sur 60 fichiers et huit recherches : une seule requête de répertoire avec index, contre au moins 488 appels auparavant ; un relevé mesure 58 ms contre 1968 ms. Cette mesure ne représente pas le temps complet d’installation d’un jeu.
- Les catalogues WOLF 2/3 de 200 032 champs passent l’installation, la mise à jour et la désinstallation avec le nouvel index. Le transport invalide les métadonnées à chaque attente de réponse pour voir les fichiers créés par le jeu.
- APK release ARM64, ARMv7 et x86_64, certificat identique aux versions précédentes, alignements ZIP/ELF de 16 Ko et modules embarqués vérifiés. Aucun fichier de test ni secret de signature dans l’APK ou les sources distribuées.

Les essais utilisent des fixtures sur émulateur. Les erreurs signalées ont des cas de régression, mais les jeux concernés n’ont pas été fournis et ne sont pas déclarés testés. Aucun essai sur téléphone physique, JoiPlay ou Winlator réel n’est revendiqué pour cette version. L’updater prépare le téléchargement automatiquement ; Android demande toujours la confirmation de l’installation.

---

# Validation 1.9.4

Vérifications du 17 novembre 2026.

- Le journal JoiPlay fourni signale quatre plantages MZ dans `createToolkitPortrait.safe`, appelé par `tick` pendant un changement de scène : `Cannot read properties of undefined (reading 'isClosing')`.
- Reproduction avec le plugin complet 1.9.3 : les deux parcours MZ, portrait désactivé et activé, échouent dans `safe` et `tick` aux mêmes lignes que le journal. Les deux parcours MV passent.
- Le contrôle portrait attend désormais le démarrage MV/MZ et l’activation de la scène ; les fenêtres ne sont pas consultées lorsque le portrait est désactivé ou sans redimensionnement en attente.
- 63 tests JavaScript réussis, dont les changements de carte après initialisation du Toolkit, le chargement différé des fenêtres et le contrôleur portrait. La fixture MZ utilise maintenant son API de démarrage propre et expose `Graphics`, absent des anciens tests du cycle de vie.
- 5 parcours Chromium réussis : portrait et restauration sur deux viewports, téléportation, interface WOLF et catalogue de 200 032 champs.
- 24 assertions de l’installateur PowerShell réussies : installation, répétition, désinstallation et conservation des plugins existants.
- APK release ARM64, ARMv7 et x86_64 signé avec le certificat existant ; signature, alignement ZIP/ELF de 16 Ko et identité des modules embarqués avec les sources vérifiés.
- Mise à jour APK 1.9.3 vers 1.9.4 sur un émulateur Android Studio API 36.1 : installation sans désinstallation préalable, démarrage et affichage « Toolkit 1.9.4 · inclus » contrôlés par ADB/UI Automator. Aucun plantage dans le journal Android de ce parcours.

Les cycles MV/MZ sont simulés. Aucun test sur le jeu du signalement, dans JoiPlay réel ou sur un téléphone physique n’est revendiqué.

---

# Validation 1.9.3

Vérifications du 9 octobre 2026.

- Refus de réouverture reproduit dans la 1.9.2. Le test du nouveau parcours a également reproduit une exception mémoire dans `inspectFolder` sur un catalogue WOLF de 200 032 champs, alors que le service flottant était actif.
- Réouverture via une commande native légère, limitée au même dossier déjà validé. Le premier lancement conserve la vérification du mod installé. Le service conserve un tableau de types, sans garder les objets JSON du catalogue pour le transport.
- 29 tests Rust de l’installateur, dont quatre régressions du lancement WOLF ; 48 tests JavaScript, deux parcours WOLF Chromium, un parcours de bibliothèque sur quatre formats d’écran et 11 tests Kotlin réussis.
- Un nouveau test instrumenté sur l’émulateur Android Studio API 36.1 vérifie les indices 200 030/200 031, les types numériques/textuels, les échanges Unicode et le refus des écritures invalides avant création des commandes. Les réponses du jeu sont simulées pour ce test de transport.
- APK release R8 vérifié sur la fixture de 200 032 champs : ouverture directe, autorisation de superposition Android, fermeture et réouverture avec bouton masqué, actualisation de la bibliothèque, ouverture depuis la notification sur l’écran d’accueil, recherche du dernier champ et bouton flottant hors de l’installateur. Le parcours final ne contient ni exception fatale ni exception mémoire dans Logcat.
- APK ARM64, ARMv7 et x86_64 signé avec le certificat existant ; alignements ZIP et ELF de 16 Ko vérifiés, modules et ressources comparés aux sources.

Aucun test sur téléphone physique ni dans Winlator réel n’est revendiqué. Les essais Android utilisent des fixtures ; la validation WOLF Windows des versions précédentes reste distincte.

---

# Validation 1.9.2

Vérifications du 9 octobre 2026.

- Erreur de limite de chaîne reproduite dans l’APK 1.9.1 avec un jeu WOLF de 200 032 champs, puis dans le véritable `Invoke.parseArgs` de Tauri/Jackson. Les fixtures WOLF 2/3 dépassent 20 millions de caractères, entre 21,5 et 23,6 Mo par registre installé.
- Transferts Rust/Android par fichiers du cache privé : lecture UTF-8 bornée, refus des chemins externes et liens symboliques, suppression après lecture ou erreur. Les arguments d’installation restent inférieurs à 256 caractères pour les grands jeux testés.
- Sérialisation JSON et copies de secours par flux, avec relecture SHA-256. La sérialisation conserve les octets du JSON Android, y compris slashs, échappements et Unicode à la frontière des blocs. La taille du heap Android n’a pas été augmentée.
- 25 tests Rust de l’installateur, 10 tests Rust WOLF, 48 tests JavaScript, 2 parcours Chromium et 11 tests Kotlin réussis.
- 6 tests d’instrumentation sur l’émulateur Android Studio API 36.1 : installation, mise à jour et désinstallation WOLF 2/3 avec 200 032 champs ; restauration d’une interruption avec 100 032 champs ; originaux et sauvegardes conservés ; transfert réel via `Invoke.parseArgs`, chemins et Unicode contrôlés.
- APK release R8 : installation et désinstallation groupées de 12 fixtures, dont XP/VX/VX Ace libres et archivés, MV 1.0/1.5, MZ et trois jeux WOLF. Fichiers, archives et sauvegardes comparés octet par octet après restauration ; entrées et paramètres MV/MZ comparés après normalisation JSON. La mise à jour du véritable pont 1.9.1 vers 1.9.2 passe sur le catalogue WOLF de 200 032 champs : un jeu mis à jour, onze inchangés, aucune erreur ni exception de mémoire dans Logcat.
- Signature identique aux versions précédentes, alignements ZIP et ELF de 16 Ko sur ARM64, ARMv7 et x86_64. Modules et ressources WebView comparés aux sources ; fixtures exclues de l’APK release.

Les grands catalogues utilisent des fixtures. Aucun essai sur le jeu du signalement, téléphone physique ou Winlator réel n’est revendiqué. Les plafonds de 64 Mo par fichier/catalogue et de 256 Mo par registre restent en place.

---

# Validation 1.9.1

Vérifications du 9 octobre 2026.

- 48 tests JavaScript du Toolkit, 20 tests Rust de l’installateur et 10 tests Rust WOLF réussis ; Clippy WOLF sans avertissement. Les formats WOLF 2/3 passent installation, mise à jour et restauration exacte avec 100 032 champs et un catalogue dépassant 8 Mo.
- L’adressage est vérifié en simulation jusqu’à 1 110 000 champs, dont les indices supérieurs à un million. Le code de dispatch et les événements de gel restent indépendants du nombre de lignes de la base variable.
- Sur les moteurs Windows WOLF 2.2961 et 3.729, catalogue de 118 885 champs : 37 échanges par moteur, nombres et textes Unicode, premiers/derniers champs, collisions et réutilisation des gels, plafond de 500 gels, refus des types/indices invalides et sauvegarde native. Les gels numériques et textuels résistent à un événement natif écrivant simultanément ; le dégel laisse ses écritures s’appliquer.
- Deux parcours Chromium réussis : catalogue de 100 000 champs et profil de 20 001 associations, lecture des seules lignes visibles, édition du dernier champ et gel ; menu partagé en portrait/paysage. Les nouveaux sélecteurs internes sont utilisés par les tests, y compris l’annulation au clavier dans une fenêtre d’édition.
- 8 tests Kotlin et 3 tests d’instrumentation réussis sur l’émulateur Android Studio API 36.1. Le véritable DocumentsProvider est utilisé pour installer, mettre à jour, récupérer une interruption simulée et désinstaller un catalogue de 100 032 champs, ainsi que les petits catalogues WOLF 2/3.
- APK release R8 installé sur l’émulateur SDK : grand catalogue ouvert dans le service flottant, changement de catégorie, défilement vertical, recherche du dernier champ et clavier Android. Le retour ferme le clavier et conserve le panneau. Les sélecteurs internes défilent aussi en paysage ; leur fermeture conserve le Toolkit. Ils utilisent le panneau WebView, sans dialogue Android nécessitant une Activity.
- Signature identique aux versions précédentes ; alignements ZIP et ELF de 16 Ko vérifiés sur ARM64, ARMv7 et x86_64. Modules JavaScript/Ruby et fichiers WebView comparés aux sources, avec exclusion des fixtures de l’APK release.

Les tests Windows et Android sont distincts. Aucun essai sur téléphone physique ou dans Winlator réel n’est revendiqué. Le plafond de 64 Mo pour les fichiers/catalogues reste en place ; les essais complets d’installation portent sur 100 032 champs, l’adressage maximal sur une simulation. Après mise à jour depuis la 1.9.0, les gels des anciennes sauvegardes doivent être réactivés.

---

# Validation 1.9.0

Vérifications du 9 octobre 2026.

- 47 tests JavaScript du Toolkit, 24 assertions PowerShell, 20 tests Rust de l’installateur et 6 tests Rust des formats WOLF réussis. Les tests ZIP couvrent installation, mise à jour, désinstallation, conservation des originaux et refus des archives WOLF protégées.
- Parcours Chromium du menu WOLF en portrait et paysage : recherche, édition, profils d’inventaire et de ressources, booléens, actions groupées, gel, historique, traductions persistantes, pagination et fermeture des fenêtres. Une lecture en échec conserve les lignes et permet le défilement vertical sans boucle de requêtes. Le pont natif est simulé dans ces parcours.
- 8 tests Kotlin unitaires et 2 tests d’instrumentation Android réussis. L’instrumentation utilise une compilation debug signée et le véritable DocumentsProvider sur l’émulateur Android Studio API 36.1 : installation/mise à jour/désinstallation WOLF 2/3, récupération d’une interruption simulée, refus de fichiers modifiés et conservation des sauvegardes.
- Exécution sur les moteurs Windows WOLF 2.2961 et 3.729 avec des copies des projets de démonstration officiels : lecture/écriture de nombres et chaînes Unicode, base variable, gel et dégel malgré des écritures concurrentes, sauvegarde native et chargement. Le chargement a été vérifié sur une carte de test sans événement bloquant ; un chargement bloqué a été annulé sans exécution ultérieure.
- Le routage No Clip est accepté par les deux moteurs et son état est relu. Le déplacement à travers une collision réelle n’a pas été vérifié.
- APK release universel recompilé avec R8, installé sur l’émulateur SDK ; installation groupée des deux fixtures WOLF, autorisations du menu flottant et des notifications, menu partagé, défilement et clavier Android contrôlés. Les marges système et le retour depuis le clavier ont été corrigés pendant ce contrôle.
- Signature identique aux versions précédentes, alignements ZIP et ELF de 16 Ko vérifiés sur ARM64, ARMv7 et x86_64. Modules JavaScript/Ruby et fichiers WebView WOLF comparés aux sources ; aucun moteur ou jeu WOLF n’est redistribué.

Les essais natifs Windows et Android sont distincts. Aucun téléphone physique, jeu commercial ou fonctionnement réel dans Winlator n’est revendiqué. Les profils associent les champs du jeu aux objets, HP et stats ; ils doivent être vérifiés pour chaque système personnalisé. Les archives WOLF protégées, la téléportation WOLF et la modification de résolution du jeu WOLF ne sont pas prises en charge. Les fonctions RPG Maker correspondantes restent disponibles.

---

# Validation 1.8.1

10 tests portrait passent, dont une page mobile simulée avec un viewport de largeur 1280, restauration, images verticales, exclusion des icônes et fonds. Tests Chromium de bureau avec émulation mobile ; aucun test téléphone/JoiPlay réel.

# Validation 1.8.0

- 7 tests unitaires du contrôleur portrait : API MV/MZ, dimensions et caméra, restauration exacte, événements, menus, échec de rendu, fenêtres, retours à la ligne et placements de combat.
- Un test du canvas simulé dans Chromium vérifie le remplissage 360×640 et 390×844, la conversion des coordonnées tactiles, la persistance et la désactivation. Ce banc n’est pas un jeu RPG Maker complet.
- Suites existantes du mod, téléportation, interface mobile et installateur exécutées avant publication.
- APK signé recompilé ; JS/Ruby embarqués comparés aux sources sur les trois architectures.

Aucun test Android/ARTEMIS, téléphone physique ou jeu réel JoiPlay n’est revendiqué pour cette version. Les API MV ont été vérifiées dans le [corescript officiel](https://github.com/rpgtkoolmv/corescript). Les adaptations MZ sont testées sur des doubles d’API, pas dans un jeu MZ complet. Les interfaces personnalisées, images de cinématique et overlays du lecteur nécessitent leur propre validation.

---

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
