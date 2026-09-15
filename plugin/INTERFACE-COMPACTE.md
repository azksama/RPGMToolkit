# Panneau compact — 1.2.0

La liste occupe toute la largeur, quelle que soit la résolution annoncée par JoiPlay. Le panneau n’utilise plus de barre latérale ni de volet d’édition permanent.

- **En haut** : recherche, fermeture, catégorie et filtre (Int, Bool, Texte, valeur exacte, favoris, figés…). La recherche reconnaît aussi `#12`, `id:10-20` et `value:42`.
- **Liste** : défilement vertical au doigt, une entrée par ligne, cases de sélection, valeur actuelle, actions `−99` / `+99` ou bascule booléenne, favori, cadenas et édition.
- **Pagination** : précédente/suivante et numéro de page saisissable. La sélection est conservée entre les pages et les recherches, mais effacée au changement de catégorie.
- **Édition** : une modale permet de changer le type et la valeur. Les objets, armes et armures respectent la capacité du sac ; les équipements portés ne sont pas retirés par une modification de quantité.
- **Sélection multiple** : valeur commune, gel ou libération pour un maximum de 500 entrées. Toutes les valeurs sont validées avant l’application. Un groupe incompatible est refusé et une erreur d’écriture déclenche la restauration des valeurs précédentes. L’édition groupée peut être annulée en une seule opération depuis Historique.
- **Gel** : le cadenas bloque les écritures normales du moteur et restaure les modifications directes détectées entre deux mises à jour. Seules les entrées figées sont parcourues. Modifier une valeur figée depuis le Toolkit met à jour sa cible. Les gels durent pendant la session, y compris quand le panneau est fermé ; charger une autre partie les retire. Les cibles de gel et leurs gardes temporaires ne sont pas enregistrées dans les sauvegardes.
- **Traduction** : sélection courante, ou page courante en l’absence de sélection. L’envoi des noms au service de traduction reste une action explicite dans la modale ; les valeurs ne sont pas envoyées.
- **Enregistrer** : ouvre les emplacements de sauvegarde du jeu, sans écraser automatiquement un emplacement. Le bouton respecte les interdictions de sauvegarde du moteur.

Pour installer cette version dans un jeu déjà modifié : fermer le jeu, mettre à jour l’APK, puis **Mod inclus → jeu → Réinstaller / mettre à jour**. Vous pouvez aussi importer le ZIP du mod 1.2.0 dans l’APK précédent. Un jeu fourni en ZIP doit être réexporté et extrait après modification.

## Vérifications

28 tests JavaScript, dont les booléens, gels, restauration de groupe et changement de session. 22 assertions de l’installateur Windows. Tests Playwright sur sept formats, de 320×740 à 1440×900, dont 1280×591 comme la capture signalée : geste tactile de défilement vertical, limites du header/footer, lignes de 36 px, édition modale, recherche, filtres, sélection entre plusieurs pages, gel, édition d’inventaire, clavier simulé par réduction du viewport et menu de sauvegarde. Aucune violation axe WCAG A/AA détectée dans les vues contrôlées ; syntaxe ES5 vérifiée.

Ces essais du mod utilisent des fixtures moteur dans Chromium et des classes officielles MV dans les tests unitaires. Ils ne constituent pas une validation dans votre jeu réel sur JoiPlay.

APK 1.2.0 (code 1002000) compilé pour ARM64, ARMv7 et x86_64, signé avec la même clé que les versions précédentes. Signature et alignement 16 Ko vérifiés. Mise à jour et lancement réussis sur émulateur Android. Le mod exact et les assets frontend sont présents dans chacune des trois bibliothèques natives.
