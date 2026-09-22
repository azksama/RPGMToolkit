# RPGM Toolkit RGSS — 1.7.0

| Moteur | Scripts | Archive standard |
| --- | --- | --- |
| XP / RGSS1 | Scripts.rxdata | .rgssad |
| VX / RGSS2 | Scripts.rvdata | .rgss2a |
| VX Ace / RGSS3 | Scripts.rvdata2 | .rgss3a |

## Installation

Dans l’APK, choisir le ZIP du jeu ou son dossier. Un dossier parent permet de sélectionner plusieurs jeux. L’installateur détecte le moteur, conserve les originaux et insère le module dans une copie des scripts. `Game.ini` est redirigé vers cette copie. La désinstallation restaure le fichier original ; les sauvegardes de partie et archives restent intactes.

Pour un projet éditable sur ordinateur, ajouter le contenu de `RPGMToolkit.rb` dans une entrée de scripts avant `Main`. Ne pas cumuler cette méthode avec l’installation automatique.

## Commandes

F6 ouvre Toolbox. Les flèches et Entrée naviguent ; Échap revient au menu parent. L/R font défiler. Le bouton supérieur gauche, le glissement et la barre de défilement utilisent les extensions souris du runtime lorsqu’elles existent. Un runtime sans ces extensions nécessite les commandes clavier, notamment via les boutons virtuels de JoiPlay.

Variables, interrupteurs, interrupteurs locaux, objets, armes, armures, acteurs, compétences et états sont disponibles. Les outils incluent Godmode, No Clip, HP/MP, statistiques, ennemis en combat, téléportation, or et sauvegarde. Les limites de valeurs du jeu restent applicables.

## Traductions

Les alias anglais et préférences sont enregistrés dans `RPGMToolkit-settings.dat` dans le dossier du jeu. Les noms originaux ne changent pas. L’import/export TSV utilise `RPGMToolkit-translations.tsv` ; les alias peuvent aussi être saisis dans le menu Traductions.

MyMemory nécessite un runtime disposant de `net/http`, `json`, `openssl` et des certificats HTTPS. Les runtimes RGSS sans ces bibliothèques utilisent l’import TSV ou la saisie manuelle. Une traduction lancée continue panneau fermé ; quitter le jeu interrompt les requêtes restantes. Les résultats déjà enregistrés sont conservés.

## Limites

Les cinq familles XP/VX/VX Ace/MV/MZ sont ciblées ; aucune garantie universelle sur les scripts tiers ou runtimes modifiés. Les scripts RGSS standards sont lus comme données Marshal, sans exécuter le code lors de l’installation. Les formats non reconnus sont refusés. 2000/2003 ne sont pas pris en charge.

Les tests automatisés du module Ruby simulent les API des trois RGSS sous Ruby moderne. Ils ne remplacent pas un test du jeu réel sous RGSS1/2/3 ou JoiPlay. La syntaxe du module évite les fonctionnalités Ruby modernes.

Tests : `ruby plugin/rgss/runtime_test.rb 1` (puis 2 et 3). Des dimensions peuvent suivre : `ruby plugin/rgss/runtime_test.rb 3 640 360`.


## Téléportation — 1.7

Safe Teleport est activé par défaut. Le module utilise les passages du moteur et recherche une sortie praticable sans No Clip. Les positions bloquées ou isolées sont refusées ; les événements et véhicules sont évités. Les sols dangereux sont exclus lorsque le moteur expose `damage_floor?`.

**Enregistrer ici** conserve un emplacement nommé. **Dernier emplacement** est mis à jour après l’arrivée ; sélectionner son entrée permet de revenir en arrière. Jusqu’à 100 emplacements par jeu sont conservés dans le fichier des préférences.

Paramètres propose les positions horizontale et verticale de Toolbox (0–100 %) et la fermeture supplémentaire en bas à gauche. Les contrôles sont accessibles au clavier ou via les extensions tactiles du runtime.
