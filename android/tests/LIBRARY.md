# Validation de la bibliothèque Android 1.5.0

- `npm run test:library` : sélection multiple, ajout de dossiers, filtrage, résultat partiel, retour au mode ZIP, accessibilité et formats 320×740, 844×390, 768×1024 et 1440×900.
- `cargo test --manifest-path android/src-tauri/Cargo.toml --lib --locked` : neuf tests, dont planification des actions, refus des fichiers modifiés après analyse, jeux à jour laissés intacts et erreurs isolées.
- `gradlew :app:testUniversalDebugUnitTest` depuis le projet Android : trois tests de parcours récursif, exclusions, doublons, dossiers illisibles et limites.

## Essai natif sur émulateur

APK release signé, sélection via le fournisseur de documents Android. Bibliothèque synthétique contenant MV 1.6.2, MZ 1.4.4, un jeu déjà à jour, MV 1.5.2, un index absent, un registre non standard et un jeu RGSS. Le jeu MV est sous `A/Deep/www`. Un autre jeu est ajouté depuis un second dossier.

Huit jeux recensés, quatre incompatibles bloqués. Deux installations et une mise à jour réussies. Réexécution sur quatre jeux à jour : aucun fichier modifié, aucune sauvegarde de secours supplémentaire. Ajouter directement un jeu déjà découvert via son parent ne crée pas de doublon.

Vérification des fichiers extraits de l’émulateur : plugin embarqué exact, registre et paramètres des autres plugins conservés, sauvegardes et ressources intactes, copies de secours séparées, aucun journal incomplet. Jeux incompatibles inchangés. Désinstallation ciblée du jeu ajouté depuis le second dossier : plugin retiré, autres jeux inchangés, copie de secours conservée.

Ces essais valident le stockage Android et des structures de jeux synthétiques ; ils ne constituent pas un test de lancement dans JoiPlay sur un téléphone physique.
