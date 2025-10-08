# Electron starter

 Pour démarrer l'application en mode développement (renderer Vite + Electron) :

 1. Installer les dépendances de dev :

    ```cmd
    npm install -D electron concurrently wait-on electron-builder
    ```

 2. Lancer en mode développement :

    ```cmd
    npm run electron:dev
    ```

Notes :

- Le script `electron:dev` démarre Vite (port 5173 par défaut) et attend que le serveur soit prêt avant de lancer Electron.
- Pour builder une application, utiliser `npm run electron:build` qui exécute `vite build` puis `electron-builder`.
- Adapter `electron-builder` dans `package.json` (configuration `build`) selon tes besoins (icone, nom de l'app, certificats).
