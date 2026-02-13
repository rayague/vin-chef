# 📄 Factures Normalisées - Conformité OHADA (Bénin)

## Vue d'ensemble

Ce document décrit les exigences légales pour l'émission de factures conformes au système OHADA (Organisation pour l'Harmonisation en Afrique du Droit des Affaires) applicable au Bénin.

---

## ✅ Mentions obligatoires implémentées

### 1. **Informations du fournisseur (émetteur)**

- ✅ **Raison sociale** : Business Center Fifa
- ✅ **Adresse complète** : Avenue de la République, Cotonou, Bénin
- ✅ **Téléphone** : +229 21 00 00 00
- ✅ **Email** : contact@cavepremium.bj
- ✅ **IFU (Identifiant Fiscal Unique)** : 0123456789012 (13 chiffres)
- ✅ **Numéro de TVA** : 0123456789012 (identique à l'IFU au Bénin)
- ✅ **RCS (Registre du Commerce)** : RC/ESE/2025/0001

### 2. **Informations du client**

- ✅ **Nom/Raison sociale**
- ✅ **Adresse** (optionnelle mais recommandée)
- ✅ **Téléphone**
- ✅ **IFU du client** (si assujetti à la TVA)
- ✅ **Mention "Client assujetti à la TVA"** quand applicable

### 3. **Numérotation de la facture**

- ✅ **Format** : FAC-YYYY-XXXXX
  - `FAC` : Préfixe identifiant une facture
  - `YYYY` : Année d'émission (ex: 2025)
  - `XXXXX` : Numéro séquentiel sur 5 chiffres (00001, 00002, etc.)
- ✅ **Unicité** : Chaque facture a un numéro unique et séquentiel
- ✅ **Continuité** : Pas de rupture dans la séquence

### 4. **Dates**

- ✅ **Date d'émission** : Format DD/MM/YYYY
- ✅ **Date d'échéance** : Calculée automatiquement (émission + 30 jours)
- ✅ **Conditions de paiement** : "Paiement: 30 jours" (par défaut)

### 5. **Détail des produits/services**

| Colonne | Description | Statut |
|---------|-------------|--------|
| Désignation | Nom du produit | ✅ |
| Quantité | Nombre d'unités | ✅ |
| P.U. HT | Prix unitaire hors taxe | ✅ |
| Total HT | Montant hors taxe | ✅ |
| TVA % | Taux de TVA (18%) | ✅ |
| Montant TVA | Montant de la TVA | ✅ |

### 6. **Calculs financiers**

- ✅ **Total HT** : Somme des montants hors taxe
- ✅ **Remise** : Affichée si applicable (montant ou %)
- ✅ **Total HT après remise** : HT - Remise
- ✅ **TVA (18%)** : Calculée sur le total après remise
- ✅ **Total TTC** : Total toutes taxes comprises

### 7. **Mentions légales obligatoires**

- ✅ **TVA** : "TVA comprise au taux de 18% conformément à la législation fiscale en vigueur au Bénin"
- ✅ **Conformité OHADA** : Mention explicite du système OHADA
- ✅ **Modes de paiement** : Liste des modes acceptés (Espèces, Chèque, Virement, Mobile Money)
- ✅ **Pénalités de retard** : "En cas de retard de paiement, des pénalités au taux de 10% par mois seront appliquées"
- ✅ **Conservation** : "Document à conserver pour preuve fiscale et comptable pendant 10 ans"

### 8. **Informations de paiement**

Section dédiée avec :
- ✅ Modes de règlement acceptés (détaillés)
- ✅ Espaces pour signature et cachet du fournisseur
- ✅ Lieu et date d'émission

---

## 📋 Conformité légale

### Législation applicable

1. **Acte uniforme OHADA** relatif au droit comptable et à l'information financière
2. **Code général des impôts du Bénin** (CGI)
3. **Loi n°2010-06** portant taxe sur la valeur ajoutée (TVA) au Bénin
4. **Arrêtés ministériels** relatifs à la facturation électronique

### Taux de TVA au Bénin

- **Taux normal** : 18% (appliqué par défaut)
- **Taux réduit** : 0% (produits de première nécessité - non applicable aux vins)

### Conservation des factures

- **Durée légale** : 10 ans minimum
- **Format** : Papier ou électronique (PDF accepté)
- **Numérotation** : Aucun trou dans la séquence n'est autorisé

---

## 🔐 Sécurité et traçabilité

### Numérotation automatique

```typescript
// Fonction: getNextInvoiceNumber()
// Format: FAC-2025-00001, FAC-2025-00002, etc.
// Stockage: Compteur persistant en base de données
```

### Audit trail

Chaque facture enregistre :
- ✅ Identifiant de l'opérateur qui a créé la vente
- ✅ Date et heure exacte de création
- ✅ Lien avec la vente (saleId)
- ✅ Données client et produit au moment de la vente (snapshot)

---

## 📊 Format du PDF généré

### Structure

1. **En-tête** (Haut de page)
   - Logo et informations entreprise (gauche)
   - Encadré FACTURE avec n°, dates (droite)

2. **Corps** (Milieu)
   - Informations client
   - Tableau des produits/services
   - Détail des calculs (HT, Remise, TVA, TTC)

3. **Pied de page** (Bas)
   - Encadré informations de paiement
   - Zone signature et cachet
   - Mentions légales complètes

### Mise en page

- Format : **A4 portrait** (210 x 297 mm)
- Police : Helvetica (standard PDF)
- Couleurs : Noir (#282828) et Bordeaux (#801818)
- Marges : 15mm de chaque côté

---

## 🚀 Utilisation dans l'application

### Génération automatique

Lors de l'enregistrement d'une vente :

1. ✅ Vérification du stock disponible
2. ✅ Attribution d'un numéro de facture unique
3. ✅ Calcul automatique TVA et totaux
4. ✅ Application des remises si spécifiées
5. ✅ Génération du PDF conforme
6. ✅ Téléchargement automatique du fichier
7. ✅ Enregistrement en base de données

### Nom du fichier

Format : `Facture_FAC-2025-00001_20251020.pdf`

---

## ✨ Améliorations futures possibles

### Court terme
- [ ] Ajout d'un logo d'entreprise personnalisé
- [ ] Signature électronique du PDF
- [ ] Envoi automatique par email au client
- [ ] Export en format FEB (Fichier des Écritures Bancaires)

### Moyen terme
- [ ] Intégration avec MECef (Système de certification électronique des factures)
- [ ] QR Code de vérification sur chaque facture
- [ ] Archivage automatique dans le cloud
- [ ] Statistiques de facturation par période

### Long terme
- [ ] Intégration API bancaire pour suivi des paiements
- [ ] Relances automatiques avant échéance
- [ ] Tableau de bord des impayés
- [ ] Export comptable vers logiciels tiers (Sage, Ciel, etc.)

---

## 📞 Support et mises à jour

Pour toute question sur la conformité légale des factures, consulter :
- **Direction Générale des Impôts (DGI)** : www.impots.finances.bj
- **Chambre de Commerce et d'Industrie du Bénin** : www.ccib.bj
- **OHADA** : www.ohada.org

---

**Document mis à jour le** : 20 octobre 2025  
**Version** : 1.0  
**Application** : Business Center Fifa - Système de gestion de stock et facturation
