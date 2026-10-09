# WOLF Toolkit 1.9.2

Éditeur mobile flottant pour WOLF RPG Editor 2 et 3 sous Winlator. L’interface réutilise le Toolkit MV/MZ : recherche, favoris, sélection multiple, édition en fenêtre, gel, historique, alias anglais et traductions persistantes.

## Installation

1. Fermer le jeu et sélectionner son dossier, ou un dossier parent, dans **Dossiers de jeux**.
2. Installer le mod inclus, puis choisir **Ouvrir l’éditeur** et autoriser l’affichage par-dessus les applications.
3. Lancer `Game.exe` dans Winlator depuis ce même dossier partagé. Le bouton **Toolbox** ouvre le menu et peut être déplacé.

Un ZIP contenant un seul jeu peut également être installé ou désinstallé. Extraire le ZIP produit, puis sélectionner son dossier dans l’application pour ouvrir le menu flottant.

## Profils

WOLF permet à chaque jeu de définir son système. Le catalogue contient les variables numériques, les chaînes et les champs de la base variable. Depuis l’édition d’un champ, **Profil** lui associe un rôle : objet, arme, armure, interrupteur, HP, MP, TP, statistique ou argent. Les ressources peuvent être associées à un allié ou un ennemi et à un champ de maximum.

Les catégories d’inventaire et les menus HP/MP et Stats utilisent ces associations. Godmode fige les HP des alliés du profil et les remplit lorsqu’un maximum est associé. No Clip utilise la commande de déplacement native. Les profils s’importent et s’exportent en JSON.

La langue, les favoris, les profils et les traductions restent dans les données privées de l’application après fermeture du jeu. Un export permet de les conserver avant de désinstaller l’application.

## Sauvegardes et restauration

**Enregistrer** crée une sauvegarde native distincte dans `Data/RPGMToolkit/toolkit-save-<numéro>.sav`. **Charger** restaure une sauvegarde Toolkit ; si un événement empêche son exécution, la demande est annulée. Les sauvegardes ordinaires du jeu restent utilisables.

L’installation conserve `CommonEvent.dat` et `Game.dat`, avec un journal et une copie de secours sous `.rpgm-toolkit-backups`. Seuls des common events dédiés sont ajoutés ; les événements existants sont conservés. L’exécution en arrière-plan est activée dans `Game.dat` pour que WOLF réponde au menu flottant. La désinstallation restaure les deux fichiers et conserve les sauvegardes Toolkit.

## Compatibilité

- Fichiers `Data/BasicData/CommonEvent.dat`, `SysDatabase.dat`, `CDataBase.dat` et `Game.dat` accessibles. Les fichiers `.project` sont facultatifs et améliorent les noms.
- Formats WOLF 2 Shift-JIS et WOLF 3 UTF-8, y compris les blocs LZ4 reconnus. Une structure inconnue est refusée avant écriture.
- Android 8 ou supérieur, dossier partagé accessible à l’application et à Winlator, autorisation du menu flottant.
- Les catalogues de plus de 20 000 champs sont acceptés. La taille des fichiers et du catalogue reste bornée à 64 Mo ; 128 opérations par échange et 500 valeurs figées simultanément.
- Les archives protégées `Data.wolf`, `Data.wolfx` et `BasicData.wolf[x]` ne sont pas prises en charge.
- La téléportation sûre et le changement de résolution du jeu en portrait restent réservés au module RPG Maker. L’interface WOLF fonctionne en portrait et paysage.
- Les associations d’inventaire modifient les champs définis dans le profil. Certains jeux imposent une commande spécifique ou recalculent ces champs : leur profil doit être vérifié en jeu.

Après mise à jour depuis la 1.9.0, réactiver les gels d’une ancienne sauvegarde. Les favoris, alias et profils conservent leurs identifiants.

## Développement

```sh
npm run test:wolf
cargo run --manifest-path wolf/Cargo.toml --example inspect -- <dossier-BasicData-original>
cargo run --manifest-path wolf/Cargo.toml --example fixture -- <nouveau-dossier> 10000 10
```

`inspect` valide l’installation et la restauration en mémoire sans modifier le dossier. `fixture` génère uniquement des données synthétiques dans un nouveau dossier pour les tests Rust et Android. Aucun jeu ni moteur WOLF n’est redistribué.
