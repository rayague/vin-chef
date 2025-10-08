# Electron & animations

Ce document explique les choix faits pour les animations et la compatibilité avec Electron.

## Principes appliqués

- Toutes les animations sont implémentées en CSS (dans `src/index.css`).
- Les animations utilisent une règle `prefers-reduced-motion` pour respecter les préférences utilisateurs.
- Les animations sont légères (fade/translate) et n'utilisent pas d'API Web avancées (pas de WebGL, pas d'API non standard), donc elles fonctionneront correctement dans un WebView d'Electron.

## Fichiers modifiés

- `src/index.css` : ajout d'utilitaires `motion-safe-animate`, `motion-safe-slide-up`, etc. Les animations sont activées uniquement quand l'utilisateur n'a pas demandé la réduction du mouvement.
- `src/pages/Login.tsx` : refonte visuelle de la page de login, micro-animations respectueuses de `prefers-reduced-motion`, meilleure accessibilité.

## Vérifications recommandées avant packaging

1. Faire tourner l'application en mode développement :

   ```cmd
   npm install
   npm run dev
   ```

2. Vérifier la page `Login` : animations, contrastes, focus keyboard.
3. Vérifier `prefers-reduced-motion` : sur Windows il est réglé via les paramètres d'accessibilité; dans le navigateur tu peux simuler dans les DevTools.

## Packaging Electron (raccourci)

- Ce dépôt n'inclut pas encore une configuration Electron. Pour packager, utiliser `electron-forge`, `electron-builder` ou `electron-packager` :

  1. Installer les dépendances de dev : `npm i -D electron electron-builder` (ou l'outil de ton choix).
  2. Ajouter un `main` script (ex: `electron/main.js`) qui charge le `dist/index.html` produit par `vite build`.
  3. Construire l'application web : `npm run build`.
  4. Packager l'app Electron selon la doc de l'outil choisi.

- Les animations CSS fonctionneront dans la fenêtre Electron car elles sont basées sur des propriétés CSS standards. Si tu souhaites limiter les animations pour les builds desktop, on peut ajouter une variable CSS (ex: `--enable-animations`) et la désactiver lors du packaging.

## Notes supplémentaires

- Pour des animations plus avancées (ex. physique, motion complex), préférer des librairies JS/wasm bien testées ou l'usage de la propriété `will-change` avec précautions pour éviter consommation mémoire excessive.
- Si tu veux, je peux ajouter une configuration minimale `electron` (starter) et des scripts d'exemple pour builder l'app; dis-moi quelle solution de packaging tu préfères.
