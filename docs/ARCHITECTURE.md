# Architecture proposée — Application Desktop "Cave à Vin"

Ce document décrit une proposition d'architecture pour transformer le projet existant (Vite + React) en une application desktop installable, conforme au cahier des charges.

## Objectifs techniques
- Fournir une application desktop (Windows/macOS/Linux) basée sur la base de code React + Vite actuelle.
- Stocker les données localement sur la machine (pas dans le navigateur) dans une base légère, robuste et sauvegardable.
- Séparer clairement la logique UI (Renderer) et l'accès aux données/OS (Main) via IPC sécurisé (preload + contextBridge).
- Générer des factures PDF conformes (numérotation séquentielle, inclusion IFU, TVA, métadonnées légales) et rendre les factures immuables après validation.
- Prévoir sauvegardes automatiques et export/import.

## Stack recommandée
- Electron (main) + Vite (renderer) + React + TypeScript
- Base de données locale: SQLite (via `better-sqlite3` dans le process principal)
- IPC sécurisé: `preload.ts` avec `contextBridge.exposeInMainWorld` + canaux limités et validation d'arguments
- Hash des mots de passe: `bcryptjs` (stocké dans la DB)
- Génération PDF: `jspdf` ou `pdfkit` (côté main ou renderer selon besoins). Pour des factures avancées, `pdfkit` côté main est solide.
- Export Excel/CSV: `exceljs` ou CSV simple côté main
- Packaging: `electron-builder` (recommandé) ou `electron-forge` pour builds multiplateformes

## Schéma de la base de données (proposition)
Tables principales:
- users (id, username, password_hash, role, created_at)
- products (id, name, category, unit_price, stock_quantity, description, created_at, updated_at)
- clients (id, name, contact_info, email, phone, address, created_at)
- sales (id, product_id, client_id, quantity, unit_price, total_price, date, invoice_id?, created_by, created_at)
- invoices (id, invoice_number, sale_id, date, client_snapshot, product_snapshot, total_price, tva, ifu, immutable_flag, created_at)
- invoice_counter (single-row counter for sequential numbering)

Remarques:
- Lorsqu'une vente est validée et qu'une facture est générée, on crée un `invoice` contenant un snapshot des données (client, produits, prix) et on marque `immutable_flag=true` pour empêcher toute modification.
- Les montants devraient être stockés en entier (cents) pour éviter les imprécisions flottantes.

## Numérotation et conformité fiscale
- Numérotation séquentielle: `FAC-<ANNEE>-<00001>` (store counter atomique dans `invoice_counter`)
- Champs obligatoires sur facture: raison sociale, IFU (numéro d'identification fiscale), adresse, TVA appliquée avec base et taux, numéro facture, date, signature/mention de conservation.
- Conserver les factures générées (PDF) dans un dossier `invoices/` de l'app (ou enregistrement binaire dans la base si souhaité).

## Sauvegardes et intégrité
- Sauvegardes automatiques: copie planifiée du fichier SQLite vers `backups/` avec horodatage.
- Export manuel: option d'export/import de la base (dump) en `.zip` protégé par mot de passe (optionnel).
- Verrouillage des factures: une fois `immutable_flag` à `true`, l'UI n'offre plus d'options d'édition; toute correction doit être faite via note/avoir (nouvelle vente inversée) — conserver l'original.

## IPC & sécurité
- Tout accès au système de fichiers, au DB et à l'impression se fait dans le process `main`.
- `preload.ts` expose uniquement des fonctions explicitement typées (ex: `api.getProducts()`, `api.createSale(payload)`, `api.generateInvoice(saleId)`).
- Validation côté main des entrées (types, limites) pour éviter injection SQL et manipulation depuis le renderer.

## Conception UI / UX (desktop)
- Garder la base React + shadcn-ui; adapter la mise en page pour desktop (menu latéral, barre d'actions, dialogs modals).
- Mode fenêtre fixe, responsive pour différentes résolutions (1024–1920+). Animations CSS légères et respectant `prefers-reduced-motion`.
- Clarté: formulaires de vente rapides (recherche produit via autocomplétion), validation immédiate et génération PDF en 1 clic.

## Exports & reporting
- Générer rapports PDF/Excel: endpoints main -> `exceljs` / `pdfkit`.
- Requêtes filtrées côté main (SQL) pour performance sur grandes quantités de données.

## Sauvegardes & déploiement
- DB local stockée dans `app.getPath('userData')/vin-chef/data.sqlite`.
- Backups stockés dans `app.getPath('userData')/vin-chef/backups/`.
- Packaging: `electron-builder` config pour générer un installeur Windows (.exe) et/ou package macOS (.dmg).

## Hypothèses et points à valider
1. L'application est desktop uniquement (pas de synchronisation cloud multi-postes). Si besoin de multi-utilisateurs en réseau, on devra prévoir une API serveur ou une DB partagée.
2. On utilisera SQLite local pour simplicité et robustesse. Si tu préfères Prisma comme ORM, on peut l'utiliser avec SQLite mais cela ajoute une couche.
3. La génération de PDF peut s'effectuer côté `main` pour garantir disponibilité d'imprimantes et accès aux fichiers.

## Prochaines étapes proposées (choix)
- Option A (rapide): Ajouter un `preload.ts`, `main.ts` minimal et scripts `npm run electron:dev` + `electron-builder` config minimal pour démarrer l'app (starter). (requiert modification `package.json`).
- Option B (plus complet): Implémenter le stockage SQLite, le schéma et endpoints IPC basiques (users, products, sales), plus seed initial.
- Option C: Commencer par migrer le stockage actuel (localStorage) vers SQLite via un script de migration pour conserver les données de démo.

Dis-moi quelle option tu veux que je mette en place en premier. Si tu veux que je commence tout de suite, je peux créer le squelette Electron (Option A) et préparer la base pour Option B.
