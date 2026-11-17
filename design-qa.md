# Installer Android 1.10.0

final result: passed

Ce résultat concerne le rendu et les interactions de l’interface. La distribution stable reste bloquée par une alerte Play Protect, documentée dans le [rapport de mise à jour](docs/validation/1.10.0-updater.md).

## Référence et captures

- Référence visuelle : `../../.codex-attachments/44cc7270-6d4e-4216-862b-827ecd366c8b/4c55bbcb-7602-49bb-9984-7b1914b275db/1000458322.jpg` (1280 × 960 px). Direction visuelle fournie : application claire, cartes arrondies et navigation sombre. Le calendrier et les graphiques ne font pas partie du produit.
- Rendu vérifié dans la WebView de l’APK sur Android Emulator, API 36, avec ADB et UI Automator. Aucun outil Android tiers.
- Portrait : 720 × 1280 px à 320 dpi, viewport logique de 360 px ; paysage : 1280 × 720 px, largeur logique de 640 px. Le système Android conserve ses propres barres.
- Captures : [accueil](docs/screenshots/1.10.0/home.png), [bibliothèque](docs/screenshots/1.10.0/library.png), [réglages](docs/screenshots/1.10.0/settings.png), [bas de page en paysage](docs/screenshots/1.10.0/landscape.png), [confirmation](docs/screenshots/1.10.0/confirmation.png), [icône Android](docs/screenshots/1.10.0/launcher.png).
- La référence est une composition avec téléphone photographié, sans viewport CSS connu. La comparaison porte sur le style et la hiérarchie du contenu à largeur mobile, sans superposition pixel à pixel des cadres d’appareil.

## Comparaison

La référence et les captures complètes ont été ouvertes et comparées. Les régions examinées séparément sont l’en-tête, les cartes, la navigation, les interrupteurs et la modale.

| Surface | Résultat |
| --- | --- |
| Typographie | Inter Variable embarquée ; titres noirs, chiffres dominants, libellés secondaires gris. Les noms de jeux et chemins longs reviennent à la ligne. Les champs restent à 16 px minimum. |
| Espacement | Cartes blanches, grands arrondis, marges régulières et navigation en pilule. La bibliothèque passe avant les sources lorsqu’elle contient des jeux. |
| Couleurs | Fond gris clair, texte charbon, accents lavande et pêche. Aucun thème vert par défaut. Les états restent accompagnés de texte. |
| Images et icônes | Nouvelle boîte à outils raster, lisible dans le lanceur et l’en-tête. Icônes Phosphor vectorielles ; aucune image décorative du calendrier reproduite. |
| Contenu | Actions et états de l’installateur, sans texte de prompt. Une phrase précise la confirmation d’installation imposée par Android. |
| Adaptation | Défilement tactile et barre visible ; bas des réglages accessible en paysage au-dessus de la navigation ; confirmation défilante ; onglet actif et contrôles désactivés distincts. |

## Historique des corrections

- P2 : après import, les cartes d’ajout repoussaient les jeux détectés. Correction : ordre de la bibliothèque et retour en haut après import. Vérifié sur six jeux et dans `library.png`.
- P2 : une mise à jour préparée en arrière-plan pouvait rester peu visible sans notifications. Correction : indicateur sur l’accueil et accès aux réglages ; statut natif interrogé lorsque l’application est visible.
- P3 : retrait du bouton décoratif dans l’en-tête. L’action restante ouvre les réglages.

## Parcours vérifiés

- Sélection SAF d’un dossier parent, détection de six jeux, sélection multiple, confirmation, installation, seconde installation sans réécriture, désinstallation.
- Navigation Jeux / Activité / Réglages, défilement portrait et paysage, ouverture de la confirmation et retour.
- Recherche de mise à jour sur GitHub et réglages d’automatisation. Le contrôle d’installation de la release publique est distinct de cette validation visuelle.
- Aucune exception fatale Android pendant les parcours de l’installateur. Tests de fichiers et de transport détaillés dans [VALIDATION.md](android/VALIDATION.md).

Aucun P0/P1/P2 visuel ouvert. Les captures ne prouvent pas le comportement sur téléphone physique, dans JoiPlay ou Winlator.
