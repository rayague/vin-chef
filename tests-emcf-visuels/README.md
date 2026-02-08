# Tests e-MECeF visuels (SyGMEF) - Playwright

## Objectif
Automatiser des scénarios SyGMEF / e-MECeF avec **captures d’écran PNG** à chaque étape importante.

## Prérequis
- Node.js 18+ recommandé

## Installation
Dans ce dossier :

```bash
npm install
npx playwright install
```

## Configuration
Édite `config.js` et remplace :
- `TON_IFU`
- `TON_MOT_DE_PASSE`

Tu peux aussi basculer entre environnement `test` et `production` directement dans chaque script de test.

## Lancer le TEST 01 (Connexion)

```bash
npm run test:01
```

## Lancer tous les tests (batch)

```bash
npm run test:all
```

## Voir les rapports

```bash
npm run open-reports
```

## Sorties
- `screenshots/<testId>/...png`
- `reports/<testId>.json`
- `reports/<testId>.html`

## Notes sur les sélecteurs
SyGMEF peut changer ses sélecteurs. Les scripts utilisent une stratégie robuste :
- plusieurs candidats de sélecteurs (input username/password, bouton se connecter)
- attentes intelligentes avec timeout configurable
- screenshot automatique en cas d’erreur
