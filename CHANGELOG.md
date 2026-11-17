# Versions

## 1.9.4 — Stabilité des changements de carte

- Correction du plantage MZ `Cannot read properties of undefined (reading 'isClosing')` après un changement de carte.
- Le module portrait attend le démarrage et l’activation de la scène avant de consulter ses fenêtres, sur MV comme sur MZ.
- Aucun contrôle des fenêtres par le module portrait lorsqu’il est désactivé ou qu’aucun redimensionnement n’est nécessaire.
- Tests de régression sur le plugin complet avec chargement différé des cartes, portrait activé et désactivé ; tests du contrôleur portrait inclus dans la suite principale.

## 1.9.3 — Accès au menu WOLF

- Le bouton Toolbox de la bibliothèque ouvre directement le menu flottant, y compris après autorisation Android.
- Réouverture d’un menu déjà lancé, même si le bouton flottant est masqué ; récupération via la notification.
- Réouverture sans seconde lecture du registre, évitant une saturation mémoire sur les gros catalogues WOLF.
- Réduction de la mémoire conservée par le service après chargement du catalogue.
- Demandes d’ouverture conservées pendant le chargement et refus du changement de jeu tant que le menu actuel est actif.
- Contrôle du chargement du panneau et bouton flottant accessible au clic.

## 1.9.2 — Transfert des grands jeux

- Correction de l’échec Android « String length exceeds the maximum length » pendant l’installation WOLF.
- Les registres volumineux WOLF et RGSS passent par un fichier temporaire du cache privé, supprimé après lecture ou échec.
- Validation des chemins, du format UTF-8 et de la taille avant toute modification du jeu.
- Sérialisation des réponses et copies de secours par flux ; vérification SHA-256 sans recopier les grands fichiers en mémoire.

## 1.9.1 — Gros catalogues WOLF

- Suppression du refus des jeux dépassant 20 000 champs et de la limite Android de 8 Mo pour le catalogue.
- Adressage des champs par plages et matrice ; stockage de gel partagé, indépendant du nombre de champs.
- Chargement du menu WOLF hors du thread principal et accès indexé aux entrées de l’éditeur.
- Validation du catalogue sans seconde copie complète ; copies de secours adaptées aux grands dossiers.
- Profils pouvant dépasser 20 000 associations, dans la limite du catalogue du jeu.
- Menus de sélection internes au panneau WOLF pour fonctionner dans la fenêtre flottante Android.

## 1.9.0 — WOLF / Winlator

- Éditeur WOLF 2/3 flottant : recherche, édition, favoris, sélection multiple, gel et traductions persistantes.
- Marges Android et clavier adaptés au menu flottant ; les lectures sans réponse ne bloquent pas le défilement.
- Profils configurables pour objets, armes, armures, HP alliés/ennemis, MP, stats et argent ; Godmode et No Clip.
- Sauvegardes natives Toolkit et chargement confirmé, avec annulation si un événement bloque le chargement.
- Installation, mise à jour, désinstallation et récupération en dossier partagé ou ZIP ; conservation des fichiers et sauvegardes d’origine.
- Détection des dossiers RPG Maker sans `www`, des sous-dossiers `Data/` et des variations de casse.
- Formats WOLF non protégés uniquement ; téléportation sûre et résolution portrait du jeu conservées sur RPG Maker.

## 1.8.1



- Portraits illustrés verticaux ancrés en bas en mode portrait, option désactivable.

- Viewport mobile normalisé en mode portrait et restauré à la désactivation.

- Menus, fenêtres et listes du Toolkit adaptés aux écrans étroits.



# Versions



## 1.8.0 — Portrait plein écran MV/MZ



- Option Portrait plein écran, persistante par jeu et désactivée par défaut.

- Résolution de rendu verticale réelle : 720×1280 en 9:16, hauteur adaptée aux écrans portrait plus allongés, sans étirement du canvas.

- Recentrage de la caméra, menu des acteurs sur une colonne, fenêtres bornées à la surface de jeu et retour à la ligne des messages.

- Positions de combat adaptées et retour aux dimensions originales à la désactivation.

- Activation depuis la carte hors événement ; changements de dimensions différés pendant les dialogues et menus.

- Module RGSS XP/VX/VX Ace conservé en 1.7.0 : le mode portrait concerne MV/MZ.



## 1.7.0 — Safe Teleport et emplacements



- Safe Teleport activé par défaut : recherche de la case accessible la plus proche avec une sortie praticable dans les deux sens ; refus si aucune case sûre n’est trouvée.

- Évite les événements, véhicules et sols dommageables reconnus par le moteur ; ne se fie pas à No Clip.

- Jusqu’à 100 emplacements nommés persistants par jeu et retour au dernier emplacement après un transfert réussi.

- Position horizontale/verticale du bouton Toolbox et bouton de fermeture facultatif en bas à gauche.

- Fonctionnalités disponibles dans les variantes MV/MZ et XP/VX/VX Ace.



## 1.6.0 — Compatibilité des moteurs



- Détection et installation XP, VX, VX Ace, MV 1.x et MZ 1.x, en ZIP ou en bibliothèque de dossiers Android.

- Module Ruby RGSS : éditeurs, sélection multiple, favoris, valeurs figées, outils de combat, téléportation, paramètres et alias anglais persistants.

- Scripts RGSS standards et archives RGSSAD v1/v3 ; installation réversible sans modifier les archives originales.

- Lecture de `plugins.js` avec clés non citées, chaînes simples, commentaires et virgules finales, sans exécution du fichier.

- Interface MV/MZ conservée depuis la 1.5.

- RPG Maker 2000/2003 exclus. Compatibilité avec les moteurs standards ; les jeux personnalisés et le tactile JoiPlay demandent une validation sur appareil.



## 1.5.0 — Installation de bibliothèques Android



- Ajout de plusieurs dossiers et recherche récursive des jeux MV/MZ.

- Liste sélectionnable avec compatibilité, état du mod et action prévue.

- Installation, mise à jour et désinstallation groupées, résultats séparés par jeu.

- Déduplication des dossiers, jeux déjà à jour ignorés, vérification avant écriture et sauvegarde de secours par jeu.

- Mod embarqué inchangé : 1.4.1.





## 1.4.1 — Navigation et traduction en arrière-plan



- La croix d’une fenêtre revient au Toolkit sans fermer le mod.

- Godmode et No Clip s’activent directement dans Toolbox.

- Traductions retiré du sélecteur de catégories des éditeurs.

- La traduction continue panneau fermé et après sa réouverture ; les résultats restent enregistrés.





## 1.4.0 — Paramètres et commandes de combat



Interface allégée, descriptions du menu conservées. Barres de défilement visibles et déplaçables, interrupteurs Godmode/No Clip, suppression du dictionnaire local. Paramètres par jeu : langue français/anglais, taille du texte, largeur du défilement, pagination, raccourci et bouton Toolbox. Accès en combat et modification des HP/MP ennemis. Actions 0, +1000 et −1000 dans HP/MP et Stats, sans ajout dans les éditeurs.



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
