# TAW.co — préparation du commerce en ligne

Ce document décrit la suite technique sans modifier le site en production.

## État vérifié sur la branche main

- Site statique : `index.html`.
- Catalogue : 13 produits définis dans le tableau JavaScript `products`.
- Photos locales : `product-01.jpg` à `product-13.jpg`.
- Panier : stockage navigateur via `localStorage` (`taw-cart`).
- Commande : formulaire de test uniquement.
- Les fiches produits contiennent encore des liens affiliés AliExpress.
- Aucun traitement de paiement réel, aucune transmission de commande fournisseur et aucun suivi colis automatisé ne sont actuellement implémentés.

## Architecture cible

1. **Catalogue** — conserver les 13 produits, leurs photos, descriptions et prix tant que chaque fiche n'a pas été validée.
2. **Commande** — créer une commande côté serveur à partir des identifiants produits et quantités; ne jamais faire confiance aux prix envoyés par le navigateur.
3. **Paiement** — créer une session chez un prestataire de paiement depuis une fonction serveur; confirmer le paiement uniquement via webhook signé.
4. **Fournisseur** — après paiement confirmé, transmettre la commande via une intégration fournisseur autorisée. Ne pas automatiser des achats via des liens affiliés.
5. **Suivi** — enregistrer le numéro de suivi fourni par le transporteur et l'afficher au client.
6. **Sécurité** — conserver les clés secrètes uniquement dans les variables d'environnement du serveur; ne jamais les placer dans `index.html`.

## Conditions avant toute mise en vente réelle

- Vérifier l'éligibilité du vendeur et du compte marchand auprès du prestataire de paiement.
- Définir les informations légales et commerciales obligatoires du vendeur, les conditions de vente, livraison, retours et confidentialité.
- Confirmer les fournisseurs, les prix d'achat, les stocks, les délais et les règles de retour pour chaque produit.
- Tester le parcours complet en environnement de test avant toute activation réelle.

## Règle de protection

Aucune modification de ce plan ne doit supprimer ou remplacer le catalogue existant. Les changements de code doivent d'abord être réalisés sur une branche séparée et prévisualisés avant fusion dans `main`.
