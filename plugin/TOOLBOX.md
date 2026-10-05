# Toolbox 1.8.0

Sur une carte ou un combat chargé, **Toolbox** (en haut à gauche) ou F6 ouvre le menu global. Godmode et No Clip se basculent directement dans ce menu ; les autres boutons ouvrent un sous-menu. **‹** et la croix d’une fenêtre reviennent au menu précédent. La croix du panneau principal ferme le Toolkit et reprend le jeu.

- **Éditeurs** : variables, interrupteurs, objets, armes, armures, acteurs, compétences et états. Recherche, actions rapides, favoris, gel et édition groupée. Les icônes sont celles de l’IconSet du jeu.
- **Traductions** : sélectionner la page/sélection, toute la catégorie ou **Tout le jeu**, puis lancer la traduction. Cette dernière option couvre tous les noms chargés du catalogue ; les interrupteurs locaux concernent la carte actuelle.
- **Godmode** : maintient les HP de l’équipe au maximum et protège contre l’état K.O. standard. Aucun effet sur les ennemis. Une règle de mort propre à un autre plugin peut demander une adaptation.
- **No Clip** : permet de traverser les obstacles ; les limites de carte restent applicables. Désactivez-le après avoir rejoint une case praticable.
- **HP / MP** : valeurs communes à un acteur ou à l’équipe, ou restauration aux maxima individuels des HP, MP et TP.
- **Stats** : niveau, expérience et bonus permanents des huit paramètres. Un bonus s’ajoute à la base et à l’équipement ; ce n’est pas la valeur totale du paramètre.
- **Téléportation** : rechercher une carte par ID ou nom, puis choisir X/Y (cases à partir de 0). Le mod vérifie les dimensions du fichier de carte avant le transfert. Choisissez une case praticable. Les événements, dialogues, combats et transferts en cours bloquent l’opération.
- **Partie / Historique** : argent, sauvegarde et historique existants.

Godmode et No Clip restent actifs quand on ferme le panneau, mais se désactivent au chargement d’une partie. HP/MP, statistiques et déplacement sont conservés par la sauvegarde normale du jeu. Ces nouvelles commandes ne font pas partie de la pile d’annulation des éditeurs.

## Traduction et conservation

MyMemory reçoit uniquement les noms, jamais les valeurs des variables. Les demandes sont explicites, avec trois requêtes simultanées au maximum. Les noms identiques sont regroupés dans une opération, et les alias existants sont ignorés. La limite du service reste de 500 octets par nom ; un nom trop long doit recevoir un alias manuel avant de relancer l’opération. Le quota et la vitesse du service restent indépendants du Toolkit.

Chaque groupe traduit est immédiatement enregistré dans le stockage local du jeu. Fermer le panneau laisse la traduction continuer pendant le jeu. **Arrêter** annule les requêtes en cours. Fermer le jeu ou charger une autre partie interrompt le traitement. Les résultats déjà reçus sont conservés. Relancer **Tout traduire** reprend uniquement les noms manquants, y compris après fermeture du jeu. Le téléchargement ne reprend pas automatiquement sans clic.

Les alias sont indépendants de la sauvegarde de partie et ne changent que l’affichage du Toolkit. Ils restent disponibles après fermeture tant que le jeu utilise le même stockage navigateur (origine, chemin et titre). Effacer les données de JoiPlay, changer d’origine/port de lancement ou déplacer le jeu peut rendre ce stockage indisponible. **Exporter les traductions** permet d’en garder une copie et **Importer un dictionnaire JSON** de les restaurer. Si le stockage est plein ou bloqué, l’interface le signale : exportez les résultats encore en mémoire.

MyMemory n’est pas obligatoire pour les dictionnaires : **Exporter les noms à traduire** puis importer le JSON complété permet de traduire ailleurs. Cette version ne fournit pas encore de connexion directe à DeepL ou LibreTranslate.

## Mise à jour

Fermez le jeu, installez l’APK 1.8.0, puis **Mod inclus → jeu → Réinstaller / mettre à jour**. Mettre à jour l’application seule ne remplace pas le plugin déjà installé dans le jeu. Alternative : remplacer `js/plugins/RPGMToolkit.js` (ou `www/js/plugins/RPGMToolkit.js`) par le fichier de la nouvelle archive du mod.

## Validation

Les tests couvrent les comportements MV avec les classes officielles, le cycle de chargement MV/MZ, la file de traduction avec réseau simulé, la conservation des alias après rechargement et les formats mobiles. Le défilement est testé avec un gestionnaire moteur qui annule les gestes tactiles, ainsi qu’avec des glissements souris. Les commandes et icônes de la démo sont simulées. Cela ne remplace pas un essai dans le jeu réel de l’utilisateur sur JoiPlay.

## Paramètres et combat

Paramètres conserve par jeu la langue de l’interface (français/anglais), la taille du texte, la largeur des barres (18/24/32 px), la pagination, le raccourci et la visibilité du bouton Toolbox. Les barres se déplacent au doigt ou à la souris ; clavier : flèches, Page précédente/suivante, Début/Fin.

En combat, HP/MP propose les ennemis du groupe actuel. Les actions rapides 0, +1000 et −1000 modifient immédiatement le paramètre sélectionné, avec bornes du moteur. Le niveau minimum reste 1. Les bonus de statistiques peuvent être négatifs. Godmode continue de protéger uniquement l’équipe. Téléportation et sauvegarde restent indisponibles pendant un combat.

Dans Traductions, Supprimer efface le dictionnaire local de ce jeu et arrête la traduction en cours. Les favoris, paramètres et fichiers JSON exportés restent conservés.


## Téléportation et emplacements — 1.7

**Safe Teleport**, activé par défaut, conserve les coordonnées demandées si une sortie praticable existe, ou choisit la case sûre la plus proche. Les collisions des tuiles et événements sont contrôlées ; le mode No Clip ne contourne pas ce contrôle. Si la carte est entièrement bloquée, illisible, ou dépasse la limite de recherche, le transfert est refusé. Les transferts en véhicule sont refusés.

Dans Téléportation, saisir un nom et choisir **Enregistrer l’emplacement actuel**. Un clic sur un emplacement enregistré lance le transfert vers ses coordonnées et sa direction. **Dernier emplacement** conserve la position de départ du dernier transfert réussi du Toolkit. Un retour remplace ce dernier emplacement par le point que l’on vient de quitter. Les emplacements restent enregistrés après fermeture du jeu, séparément des sauvegardes de partie.

Dans Paramètres, **Position horizontale** et **Position verticale** déplacent Toolbox dans la fenêtre du jeu. **Fermeture en bas à gauche** ajoute un second bouton de fermeture, y compris dans les sous-menus. Ces réglages sont persistants.

Le mode sûr vérifie les règles de passage standard. Les obstacles mobiles, événements qui modifient la carte après l’arrivée ou extensions de collision propres à un jeu ne permettent pas de garantir tous les comportements futurs. Il ne vérifie pas qu’une zone mène au reste du scénario.


## Portrait plein écran — MV/MZ

Depuis une carte sans dialogue ni événement en cours : **Toolbox → Paramètres → Portrait plein écran**. Le Toolkit se ferme et la scène est reconstruite aux nouvelles dimensions. Les coordonnées, variables et inventaire ne changent pas. Désactiver l’option restaure les dimensions d’origine. Le réglage est conservé par jeu et s’applique au chargement d’une partie.

La résolution est 720×1280 pour un écran 9:16. Sur un écran vertical plus allongé, la hauteur suit le rapport de la fenêtre du jeu. La surface de rendu grandit réellement ; les pixels ne sont pas déformés pour remplir l’écran. Sur une fenêtre encore horizontale, le rendu reste vertical avec des marges : il faut tourner l’appareil et autoriser le portrait dans le lecteur, notamment JoiPlay. Le verrouillage d’orientation est demandé si l’environnement le permet, sans modifier les préférences du lecteur.

Le module recadre les fonds standards, recentre la caméra, adapte les fenêtres qui dépassent, affiche les acteurs du menu sur une colonne et ajoute un retour à la ligne aux messages. Les positions standards des combattants sont adaptées au portrait.

Cette option est expérimentale sur les jeux comportant des interfaces personnalisées. Les images de cinématique et menus réalisés par événements gardent leurs coordonnées propres ; une petite carte peut laisser apparaître de l’espace vide. Les contrôles virtuels de JoiPlay appartiennent au lecteur et ne peuvent pas être déplacés par ce plugin. XP/VX/VX Ace ne proposent pas ce mode.

### Portraits et interface mobile (1.8.1)

Le mode portrait normalise le viewport mobile pour conserver une interface lisible. « Portraits en bas » repositionne les grandes images verticales standard (Sprite_Picture) en bas et les garde dans la largeur de l’écran. Désactivez cette option si un jeu utilise ces images autrement. Les sprites créés par des plugins spécifiques ne sont pas détectés automatiquement.
