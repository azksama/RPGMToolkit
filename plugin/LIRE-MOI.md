# RPGM Toolkit 1.9.4

Un panneau intégré à RPG Maker **MV 1.x et MZ**, pour explorer et modifier votre partie. Un seul fichier JavaScript, sans dépendance à installer dans le jeu.

La 1.9.4 corrige le plantage `isClosing` pendant les changements de carte. Sur Android, fermez le jeu, installez le nouvel APK puis utilisez **Installer / mettre à jour** sur le dossier du jeu. La mise à jour de l’application seule ne remplace pas un mod déjà installé.

Pour essayer l’interface avant de l’installer, ouvrez `demo/index.html` dans un navigateur puis cliquez sur **Ouvrir le panneau**. Cette démonstration utilise des données simulées.

## Installation rapide sous Windows

1. Extrayez **tout le ZIP** dans un dossier.
2. Fermez le jeu et l’éditeur RPG Maker.
3. Double-cliquez sur **Installer.cmd**.
4. Sélectionnez le dossier du jeu. L’installateur reconnaît également le sous-dossier `www` des jeux MV.
5. Lisez les changements annoncés, puis tapez **OUI** pour les appliquer.
6. Lancez ou chargez une partie et rejoignez la carte. Appuyez sur **F6**, ou cliquez sur **Toolbox** en haut à gauche par défaut.

L’installateur copie `RPGMToolkit.js` dans `js/plugins/`, puis l’active en fin de liste dans `js/plugins.js`. Il sauvegarde les fichiers touchés dans `RPGMToolkit-backups/<date-identifiant>/` et vérifie les fichiers écrits. Les autres plugins conservent leurs paramètres et leur ordre relatif. La liste JSON est reformattée. Aucun fichier de données ni de sauvegarde du jeu n’est modifié pendant l’installation.

Si Windows bloque le script ou si votre jeu utilise une liste de plugins non standard, utilisez l’installation manuelle ci-dessous. Aucun droit administrateur n’est nécessaire si le dossier est accessible en écriture.

## Installation dans un projet MV/MZ

1. Copiez `RPGMToolkit.js` dans le dossier `js/plugins/` du projet.
2. Dans RPG Maker, ouvrez **Outils → Gestionnaire de plugins**.
3. Ajoutez **RPGMToolkit**, activez-le et placez-le en dernier.
4. Lancez le test du jeu, puis ouvrez le panneau avec **F6** sur la carte.

Cette procédure suit le [fonctionnement officiel du gestionnaire de plugins](https://www.rpgmakerweb.com/blog/using-plugins-in-mz). Sur macOS/Linux, utilisez cette installation manuelle.

## Fonctions

| Catégorie | Commandes |
|---|---|
| Variables | Recherche, nombres entiers, texte, nom original, alias anglais |
| Interrupteurs | Activation/désactivation des interrupteurs globaux |
| Interrupteurs locaux | A/B/C/D des événements de la carte courante |
| Objets | Objets usuels, objets clés et masqués ; quantité exacte, +1, +10, −1 |
| Armes et armures | Quantités du sac, prix, comparaison des paramètres, ajout et retrait par emplacement |
| Acteurs | HP, MP, TP, niveau, EXP, soins complets, retrait d’équipement |
| Compétences | Recherche, apprentissage, oubli pour l’acteur sélectionné |
| États | Recherche, ajout, retrait pour l’acteur sélectionné |
| Partie | Or, carte et position ; accès au menu de sauvegarde autorisé par le jeu |
| Favoris | Entrées de toutes les catégories regroupées et conservées localement |
| Historique | Journal des 100 dernières opérations ; annulation/rétablissement de 80 modifications simples |
| Traductions | Alias manuels, MyMemory à la demande, cache, import/export JSON |

### Recherche et comparaison

- `temple` : nom original **ou** nom anglais, sans distinction de casse ou d’accent.
- `#42` ou `id:42` : identifiant exact.
- `id:100-150` : intervalle d’identifiants numériques.
- `value:0`, `value:42`, `value:on`, `value:off` : valeur actuelle exacte.
- Plusieurs mots : tous doivent correspondre au nom/ID.
- Filtres : tout, entrées nommées, favoris, non nul/possédé/ON, changé depuis le repère.

**Créer un repère** mémorise les variables et interrupteurs. Fermez le panneau, jouez, rouvrez-le et choisissez **Changé depuis le repère** pour repérer les valeurs modifiées. Le repère ne remplace pas une sauvegarde et disparaît au chargement d’une partie ou au redémarrage.

Les listes contiennent 60 entrées par page par défaut, avec une limite de 80. La recherche attend 120 ms après la dernière saisie. Les noms sont indexés à la demande ; aucune recherche ni actualisation de liste ne tourne en continu lorsque le panneau est fermé. Le bouton de lancement est vérifié via la boucle du moteur.

### Traduction des noms en anglais

La case **Noms anglais** change uniquement les noms affichés **dans le Toolkit**. Les IDs, les noms dans `$dataSystem` et les valeurs des variables restent inchangés. Les textes du jeu et les valeurs textuelles ne sont pas traduits.

Deux possibilités :

- **Hors ligne** : sélectionnez une entrée, renseignez **Nom anglais**, puis **Enregistrer le nom**. Un champ vide supprime son alias.
- **En ligne** : cliquez sur **Traduire en ligne** pour une entrée ou **Traduire cette page**. Choisissez la langue d’origine, puis **Envoyer les noms à MyMemory**. Le plugin envoie uniquement les noms sélectionnés à ce service tiers, jamais les valeurs des variables. Il ne contacte aucun service avant ce clic.

Les demandes partent par trois au maximum, sans délai artificiel, avec déduplication des noms identiques et arrêt manuel. Choisissez la sélection, toute la catégorie ou tout le jeu. Chaque groupe reçu est enregistré immédiatement. La fermeture du panneau annule toutes les requêtes en cours. Les noms déjà traduits restent disponibles hors ligne. Pour remplacer une traduction existante, effacez d’abord son alias ou saisissez une correction.

MyMemory est disponible sans clé, sous réserve de son service et de ses quotas. La limite par nom est de **500 octets** ; le quota de caractères est imposé par le service. Les erreurs réseau, délais et quotas sont affichés ; aucun contournement de quota n’est effectué. Voir les [spécifications](https://mymemory.translated.net/doc/spec.php) et les [limites du service](https://mymemory.translated.net/doc/usagelimits.php). Une traduction automatique de noms internes peut être approximative ; corrigez l’alias si nécessaire.

Le cache est conservé dans le stockage local du navigateur/NW.js, séparément pour chaque chemin de jeu et titre. Il ne s’ajoute pas à la sauvegarde du jeu. Un renommage du jeu ou son déplacement peut changer la clé de stockage ; exportez votre dictionnaire pour le transférer. Si le stockage est interdit ou saturé, les traductions restent en mémoire pendant la session et un message invite à les exporter.

### Dictionnaires JSON

Dans **Traductions** :

1. **Exporter les noms à traduire** crée un fichier contenant les noms du jeu.
2. Remplissez les champs `english` dans ce fichier, sans changer `key` ni `original`.
3. **Importer un dictionnaire JSON** charge les traductions localement.

Format :

```json
{
  "format": "rpgm-toolkit-translations-v1",
  "entries": [
    { "key": "variables:1", "original": "進行度", "english": "Progress" },
    { "key": "items:4", "original": "回復薬", "english": "Healing potion" }
  ]
}
```

Le plugin ignore les traductions vides et les entrées dont la catégorie, l’ID ou le nom original ne correspondent pas au jeu. Un fichier mal formé est rejeté avant tout import. Limite : 5 Mo et 50 000 entrées par fichier. Divisez les très gros dictionnaires en plusieurs fichiers si nécessaire. Les noms locaux d’événements utilisent une clé telle que `selfSwitches:7.3.A` (carte 7, événement 3, interrupteur A).

### Annulation et sauvegarde

- **Annuler/Rétablir** couvre les variables, interrupteurs, quantités dans le sac et l’or.
- Si le jeu a modifié la valeur depuis l’action, l’annulation est refusée pour préserver son état actuel.
- Les commandes d’acteur, de compétence, d’état et d’équipement ont des effets liés : elles réinitialisent la pile d’annulation et restent dans le journal.
- Rien ne force de sauvegarde automatique. Pour conserver vos changements, sauvegardez normalement dans le jeu, idéalement dans un emplacement distinct.
- Le menu de sauvegarde reste soumis à l’autorisation du jeu et à l’absence d’événement/message en cours.

## Raccourcis et paramètres

**F6** ouvre ou ferme. **Échap** ferme. **Ctrl+F** place le curseur dans la recherche. **Tab/Maj+Tab** restent dans le panneau. Les flèches haut/bas et Début/Fin parcourent les boutons de résultats ; Entrée ouvre les champs d’édition. Le jeu se met en pause pendant l’édition et les touches du panneau ne lui sont pas transmises.

Dans le gestionnaire de plugins :

| Paramètre | Valeur par défaut | Fonction |
|---|---|---|
| Hotkey | F6 | F6, F7 ou F10 |
| ShowButton | true | Affiche le bouton tactile/souris sur la carte |
| PlaytestOnly | false | Si true, n’autorise le panneau qu’en test RPG Maker |
| PageSize | 60 | Nombre de résultats affichés, entre 20 et 80 |

Commandes MV : `RPGMToolkit Open`, `RPGMToolkit Close`.
Commandes MZ : **Ouvrir le Toolkit**, **Fermer le Toolkit**.
Appels de script : `RPGMToolkit.open()`, `RPGMToolkit.close()`, `RPGMToolkit.toggle()`, `RPGMToolkit.isOpen()`.
Une commande d’ouverture depuis un événement suspend cet interpréteur jusqu’à la fermeture.

## Désinstallation

Fermez le jeu et l’éditeur, lancez **Desinstaller.cmd**, sélectionnez le jeu et confirmez. L’installateur retire seulement l’entrée `RPGMToolkit` et son fichier JS, avec copie de secours. Les plugins ajoutés depuis l’installation sont conservés. Les modifications déjà sauvegardées dans votre partie ne sont pas annulées par la désinstallation.

Manuellement : désactivez/supprimez l’entrée dans le gestionnaire de plugins, puis retirez `js/plugins/RPGMToolkit.js`.

En cas de restauration manuelle depuis `RPGMToolkit-backups`, comparez d’abord le `plugins.js` sauvegardé à la liste actuelle : restaurer la liste entière peut perdre des plugins ajoutés depuis. Le manifeste précise si un ancien fichier `RPGMToolkit.js` existait avant l’opération.

Mode terminal :

```powershell
# Aperçu seulement
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-RPGMToolkit.ps1 -GamePath "C:\Jeux\Mon RPG" -Preview
# Installation interactive
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-RPGMToolkit.ps1 -GamePath "C:\Jeux\Mon RPG"
# Désinstallation interactive
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-RPGMToolkit.ps1 -GamePath "C:\Jeux\Mon RPG" -Uninstall
```

`-Yes` permet d’appliquer sans la question finale, pour un lancement volontairement automatisé. L’installateur refuse les liens/jonctions et les formats non standard plutôt que de modifier un autre chemin ou d’exécuter du JavaScript.

## Compatibilité et limites

- Cible : **MV 1.x / MZ**, rendu HTML/NW.js standard. Pas de dépendance au gestionnaire de fenêtres de l’un des deux moteurs.
- Le panneau s’ouvre sur la carte ou pendant un combat, après démarrage de la scène. Il ne s’ouvre pas au titre ou dans les menus du jeu.
- Les valeurs de variables structurées (objets/tableaux) sont en lecture seule. Les nombres modifiés doivent être entiers. Le moteur MV/MZ restitue certaines valeurs falsy, dont une chaîne vide, comme `0` : le panneau affiche la valeur effectivement retournée par le moteur.
- Les quantités respectent `maxItems` et l’or respecte `maxGold`. La diminution du sac ne retire pas l’équipement porté. Les emplacements verrouillés et restrictions d’équipement du moteur sont respectés.
- Aucun contournement de chiffrement/protection, modification d’archive ou injection mémoire. Le jeu doit exposer son dossier `js/plugins` standard et permettre les plugins.
- Les extensions de moteur (inventaires personnalisés, scènes de carte remplacées, contrôles ou règles modifiées) peuvent nécessiter une adaptation. Un événement peut réécrire une valeur dès que le jeu reprend.
- Tests réussis sur les classes officielles MV, sur des scénarios d’interface simulés MV/MZ et sur l’installateur Windows. **Aucun jeu réel de l’utilisateur ni runtime MZ complet n’a été fourni pour une validation de bout en bout.** Voir `VALIDATION.md`.

Le plugin est un outil indépendant ; il n’est pas édité ni approuvé par l’éditeur de RPG Maker.

## Toolbox 1.3.0

Le bouton **Toolbox** en haut à gauche ouvre désormais le menu global. Choisissez **Éditeurs** pour retrouver les listes, ou un sous-menu dédié. Voir [le guide Toolbox](TOOLBOX.md) pour les traductions en parallèle, Godmode, No Clip, HP/MP, Stats et Téléportation.
