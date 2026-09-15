# Versions

## 1.3.0 — Toolbox et traductions en parallèle

- Menu global Toolbox et sous-menus distincts : Éditeurs, Traductions, Godmode, No Clip, HP/MP, Stats, Téléportation, Partie et Historique. Bouton d’ouverture et fermeture à gauche.
- Icônes de la base du jeu de nouveau visibles dans les listes.
- Défilement manuel au doigt et à la souris, même si le moteur annule les gestes natifs. Hauteur des modales bornée à la zone visible.
- Traduire la sélection, toute une catégorie ou tout le jeu, au-delà de la page affichée. Suppression de la limite silencieuse de 80 noms.
- Trois requêtes simultanées, sans attente artificielle de 400 ms. Un même nom est envoyé une seule fois par opération ; réponses associées aux bons identifiants même dans le désordre.
- Sauvegarde locale de chaque groupe reçu. Annulation de toutes les requêtes en cours et reprise sur les noms manquants ; arrêt de la file en cas de quota ou d’erreur.

Voir [le guide Toolbox](plugin/TOOLBOX.md). Mettre à jour l’APK puis réinstaller le mod dans chaque jeu. Les essais utilisent les classes MV officielles et des fixtures de navigateur ; validation dans le jeu réel sur JoiPlay encore nécessaire.

## 1.2.0 — Liste compacte et édition groupée

Recherche en haut, liste pleine largeur et défilement vertical au doigt, actions compactes sur chaque ligne, édition du type et de la valeur en modale. Sélection entre plusieurs pages, valeur commune et gel des variables, interrupteurs et quantités d’inventaire. Traduction et accès à la sauvegarde dans le footer.

Voir [le guide du panneau compact](plugin/INTERFACE-COMPACTE.md) pour le fonctionnement des gels et la validation.

## 1.1.0 — Interface mobile

- Palette anthracite et bleue dans le mod, l’installateur et l’icône Android.
- Sur téléphone, sélection d’une entrée dans une vue détail dédiée ; retour aux résultats en conservant la recherche et la sélection.
- Même navigation sur les fenêtres larges mais peu hautes en paysage.
- Champs et boutons adaptés au toucher, sans ouverture automatique du clavier à l’ouverture du panneau.
- Le panneau suit la zone visible du navigateur quand le clavier apparaît ; ses formulaires restent défilables.
- Options et traduction regroupées dans une section repliable.
- Choix ZIP/dossier plus lisible, navigation latérale en paysage, confirmation en bas de l’écran sur téléphone.

Mettre à jour l’APK, fermer le jeu puis sélectionner **Mod inclus → jeu → Réinstaller / mettre à jour**. L’installation de l’APK seule ne met pas à jour les jeux déjà modifiés.

Validation : 23 tests JavaScript, 22 assertions de l’installateur Windows, compilation TypeScript/Vite et tests Playwright à 320×740, 390×844, 844×390, 768×1024, 1024×768 et 1440×900. Vérification des dialogues, retour liste/détail, rotation, réduction de hauteur et règles axe WCAG A/AA sans violation détectée dans les vues testées. Les commandes natives sont simulées dans ces tests de navigateur ; ce résultat ne remplace pas un essai du mod dans un jeu réel sur JoiPlay.

APK universel ARM64, ARMv7 et x86_64 compilé et signé. Signature et alignement 16 Ko vérifiés ; mise à jour vers 1.1.0 (code 1001000) et ouverture visuelle validées sur émulateur Android. Présence du mod exact et des nouveaux assets frontend vérifiée dans les trois bibliothèques natives. Aucun essai sur un téléphone physique ou un jeu réel JoiPlay pendant cette validation.

## 1.0.1

Correction du plantage `isClosing` pendant le chargement d’une carte MZ.
