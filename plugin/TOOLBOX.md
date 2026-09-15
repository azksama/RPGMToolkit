# Toolbox 1.4.0

Sur une carte ou un combat chargé, **Toolbox** (en haut à gauche) ou F6 ouvre le menu global. Chaque bouton ouvre un sous-menu. **‹** revient au menu précédent, **✕** ferme le panneau et reprend le jeu.

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

Chaque groupe traduit est immédiatement enregistré dans le stockage local du jeu. Fermer le panneau annule les requêtes en cours ; **Arrêter** les annule aussi. Les résultats déjà reçus sont conservés. Relancer **Tout traduire** reprend uniquement les noms manquants, y compris après fermeture du jeu. Le téléchargement ne reprend pas automatiquement sans clic.

Les alias sont indépendants de la sauvegarde de partie et ne changent que l’affichage du Toolkit. Ils restent disponibles après fermeture tant que le jeu utilise le même stockage navigateur (origine, chemin et titre). Effacer les données de JoiPlay, changer d’origine/port de lancement ou déplacer le jeu peut rendre ce stockage indisponible. **Exporter les traductions** permet d’en garder une copie et **Importer un dictionnaire JSON** de les restaurer. Si le stockage est plein ou bloqué, l’interface le signale : exportez les résultats encore en mémoire.

MyMemory n’est pas obligatoire pour les dictionnaires : **Exporter les noms à traduire** puis importer le JSON complété permet de traduire ailleurs. Cette version ne fournit pas encore de connexion directe à DeepL ou LibreTranslate.

## Mise à jour

Fermez le jeu, installez l’APK 1.4.0, puis **Mod inclus → jeu → Réinstaller / mettre à jour**. Mettre à jour l’application seule ne remplace pas le plugin déjà installé dans le jeu. Alternative : remplacer `js/plugins/RPGMToolkit.js` (ou `www/js/plugins/RPGMToolkit.js`) par le fichier de la nouvelle archive du mod.

## Validation

Les tests couvrent les comportements MV avec les classes officielles, le cycle de chargement MV/MZ, la file de traduction avec réseau simulé, la conservation des alias après rechargement et les formats mobiles. Le défilement est testé avec un gestionnaire moteur qui annule les gestes tactiles, ainsi qu’avec des glissements souris. Les commandes et icônes de la démo sont simulées. Cela ne remplace pas un essai dans le jeu réel de l’utilisateur sur JoiPlay.

## Paramètres et combat

Paramètres conserve par jeu la langue de l’interface (français/anglais), la taille du texte, la largeur des barres (18/24/32 px), la pagination, le raccourci et la visibilité du bouton Toolbox. Les barres se déplacent au doigt ou à la souris ; clavier : flèches, Page précédente/suivante, Début/Fin.

En combat, HP/MP propose les ennemis du groupe actuel. Les actions rapides 0, +1000 et −1000 modifient immédiatement le paramètre sélectionné, avec bornes du moteur. Le niveau minimum reste 1. Les bonus de statistiques peuvent être négatifs. Godmode continue de protéger uniquement l’équipe. Téléportation et sauvegarde restent indisponibles pendant un combat.

Dans Traductions, Supprimer efface le dictionnaire local de ce jeu et arrête la traduction en cours. Les favoris, paramètres et fichiers JSON exportés restent conservés.
