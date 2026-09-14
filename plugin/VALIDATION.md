# Validation de RPGM Toolkit 1.0.1

Correctif de chargement décrit dans CORRECTIF-1.0.1.md : ancien plantage reproduit, 23 tests JavaScript réussis après correction, analyse ES5 réussie et 22 assertions installateur réussies.

## Historique des contrôles 1.0.0


Vérifications effectuées le 13 septembre 2026 sur Windows. Ces résultats concernent le paquet livré, des classes MV officielles et un banc de simulation. Ils ne constituent pas une validation sur un jeu complet MV/MZ de l’utilisateur.

## Résultats

| Vérification | Résultat |
|---|---|
| Syntaxe JavaScript | `node --check` et analyse ECMAScript 5 par Acorn réussis |
| Cœur fonctionnel | 12 tests réussis avec les classes officielles MV |
| Service de traduction | 6 tests réussis avec réponses réseau simulées |
| Parcours navigateur | Scénario intégré réussi pour les modes simulés MV et MZ sous Chromium |
| Responsive | Vérifié à 320, 768, 1024 et 1 440 px, sans débordement horizontal du panneau |
| Accessibilité automatique | 0 violation WCAG A/AA détectée par axe-core sur 7 vues testées |
| Installateur Windows | 22 assertions réussies sous Windows PowerShell 5.1.26100.9444 |
| Service MyMemory réel | Requête d’exemple `進行度`, japonais vers anglais : HTTP 200, réponse `Progress`, CORS `*` |
| Performances | Indexation + recherche de 50 000 variables : environ 90–100 ms sur ce poste ; maximum de 80 lignes rendues |

Les tests automatiques d’accessibilité ne remplacent pas une évaluation humaine avec lecteur d’écran. Le test réseau réussi ne garantit pas la disponibilité future du service ni l’accès depuis tous les jeux.

## Couverture fonctionnelle

- Édition de nombres entiers positifs, négatifs, zéro et textes via `Game_Variables.setValue`, avec rafraîchissement de carte.
- Refus des nombres non finis, décimaux, entrées invalides et variables structurées ; les noms du jeu restent inchangés.
- Recherche accent-insensible par nom original/anglais, ID exact, intervalle et valeur.
- Alias persistants, recherche des traductions, invalidation si le nom original change, import atomique et validation des noms.
- Annulation/rétablissement, conflit si une valeur a changé, pile bornée et réinitialisation lors d’un changement de partie.
- Quantités avec limites standard/personnalisées, or, interrupteurs globaux et locaux, repère de comparaison.
- Commandes d’acteurs sur les classes MV : HP, MP, TP, niveau, apprentissage/oubli, états, soins ; équipement via les échanges d’inventaire du moteur et contrôle des emplacements.
- Traduction : envoi des noms seulement, cache, déduplication, erreurs HTTP/réseau/timeout/quota, annulation, changement de session, limite UTF-8 et absence de réseau pour une source anglaise.
- Interface : saisie et application, annuler/rétablir, favoris, inventaire, acteurs, compétences, états, or, recherche dans 50 000 variables, échappement des noms HTML, conservation de l’acteur sélectionné.
- Ouverture/fermeture effective du panneau, compteur de simulation suspendu/repris, isolation des touches, retour du focus et confinement de Tab/Maj+Tab.
- Commande MV/MZ d’ouverture qui met l’interpréteur d’événement en attente.
- Installateur : projets MZ et jeux MV avec `www`, aperçu sans écriture, copie et activation, paramètres préservés, copie de secours exacte, contrôle du hash, réinstallation sans doublon, désinstallation conservant les plugins ajoutés ensuite, tableau vide et refus des formats non standard.

## Sources de référence

Les tests du cœur utilisent les classes `Game_Variables`, `Game_Switches`, `Game_SelfSwitches`, `Game_Party`, `Game_Actor`, `Game_Actors`, `Game_Battler`, `Game_BattlerBase`, `Game_Unit` et `Game_Item` du [dépôt officiel MV CoreScript](https://github.com/rpgtkoolmv/corescript). Leur environnement minimal est simulé.

Les points d’intégration MZ ont été confrontés à la [référence officielle des objets de jeu](https://rpgmakerofficial.com/product/mz/plugin/javascript/script_reference/gamedate.pdf) et à la [documentation officielle des annotations](https://rpgmakerofficial.com/product/mz/plugin/make/annotation.html). L’annotation `@target MZ` permet la reconnaissance par le gestionnaire MZ ; la compatibilité MV est indiquée dans la description et assurée par le code commun.

La traduction suit l’[API MyMemory](https://mymemory.translated.net/doc/spec.php) et ses [quotas](https://mymemory.translated.net/doc/usagelimits.php).

## Limites restantes

- Aucun jeu complet ni projet utilisateur fourni ; aucune partie utilisateur modifiée.
- Aucun exécutable NW.js MV ancien ni runtime MZ complet lancé.
- Pas de validation de conflits avec Yanfly, VisuStella ou d’autres extensions particulières.
- Pas de validation mobile physique, macOS ou Linux ; seule la disposition mobile est vérifiée dans Chromium.
- Le panneau est volontairement limité à la carte ; les combats et menus ne sont pas des points d’ouverture pris en charge.
- Le banc `demo/index.html` utilise des données et objets simulés ; ce n’est pas un jeu RPG Maker autonome.
