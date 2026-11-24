# Audit technique TAW.co — transition CJ vers DSers
Date : 24 novembre 2026
Branche : `dsers-integration-preparation`
Portée : lecture du dépôt uniquement ; aucune modification de production, aucun appel fournisseur, aucun déploiement.

## 1. Résultats vérifiés dans le code

| Zone | État constaté | Conséquence |
|---|---|---|
| Stripe Checkout | `api/stripe-checkout.js` utilise encore un catalogue fixe de 15 IDs (101–115) et des montants en dur. | Ne correspond pas encore aux 9 références AliExpress de l'Import List. |
| Validation de variante | Le checkout lit `supplier_variant_mappings` et exige `cj_variant_id`. | Une variante DSers/AliExpress ne peut pas être validée par ce code actuel. |
| Webhook Stripe | `api/stripe-webhook.js` enregistre les paiements confirmés et vérifie le total à partir du même catalogue fixe. | Le webhook doit évoluer avec le catalogue validé, sans jamais faire confiance au prix envoyé par le navigateur. |
| Schéma Supabase | `orders` comporte des champs CJ et `supplier_variant_mappings` impose `cj_product_id`, `cj_variant_id`, `logistic_name`. | Il faut une migration additive neutre fournisseur ; ne pas supprimer les colonnes CJ historiques. |
| Catalogue public | `api/catalog.js` appelle `./_cj` et construit les fiches depuis les variantes CJ. | Le catalogue public reste dépendant de CJ. |
| Administration | Les routes `api/admin-cj-*` et les pages associées pilotent CJ. | Elles ne doivent pas être réutilisées comme si elles pilotaient DSers. |
| Frontend | Le code de `index.html` charge `/api/catalog`, maintient des variables et libellés CJ et ne transmet pas de clé de variante sélectionnée au checkout dans le flux observé. | Le choix couleur/taille visible n'est pas encore raccordé de bout en bout au paiement. |
| Maintenance | Le HTML contient un écran de maintenance et un mécanisme d'aperçu privé. | Ne pas retirer ce verrou pendant l'intégration. |
| Déploiement | Ce travail reste sur la branche de préparation et le PR brouillon #23. | Aucun changement public n'est publié par cette étape. |

## 2. Architecture cible proposée (sans supposer l'API DSers)

- Conserver Stripe comme moyen de paiement TAW.co.
- Conserver les commandes payées dans `orders`, avec une file de traitement fournisseur distincte et idempotente.
- Créer une table neutre `supplier_variant_mappings_v2` : produit TAW, clé de variante, fournisseur, identifiant produit/variante externe, SKU, coût et devise, stock/état, destination et frais/délai de livraison, date de vérification et état actif.
- Ajouter une table `fulfillment_jobs` avec une contrainte d'unicité par commande et action afin d'empêcher les doublons.
- Ajouter les champs de suivi fournisseur de façon additive (fournisseur, identifiant de commande fournisseur, statut, transporteur, numéro et URL de suivi, horodatages).
- Faire passer les mises à jour de statut et le suivi dans l'espace client TAW.co.
- Garder tout en mode test, sans transmission réelle au fournisseur, jusqu'à validation humaine.

## 3. Sécurité et ordre de traitement

1. Le navigateur envoie seulement IDs TAW, variantes et quantités ; les prix sont relus côté serveur.
2. Le serveur vérifie variante active, stock, coût, livraison France et prix public validé avant de créer la session Stripe.
3. Le webhook Stripe signé et idempotent enregistre la commande après paiement confirmé.
4. Une tâche de fulfillment n'est créée qu'après paiement confirmé ; elle reste bloquée tant que l'intégration DSers n'est pas approuvée et configurée.
5. Les appels fournisseur doivent avoir une clé d'idempotence, des retries bornés, une journalisation sans secrets et un état « à vérifier » en cas de résultat ambigu.
6. Un numéro de suivi ne doit jamais être présenté comme preuve de livraison.

## 4. Dépendance officielle DSers

La documentation publique DSers distingue les intégrations standard pré-approuvées et les Channel Apps personnalisées. Pour une boutique TAW.co sur mesure, la voie Channel App nécessite une inscription développeur, la configuration de l'application et de son autorisation, le développement avec le contrat API attribué, puis la revue et la publication DSers. Après approbation, DSers peut synchroniser produits, commandes et informations de suivi via les API Channel App.

À ce stade, le dépôt ne contient aucun identifiant d'application DSers, secret, URL de callback officielle, schéma d'authentification validé ni accès sandbox. Il serait dangereux d'inventer des endpoints, signatures ou formats de payload. Aucun faux connecteur n'a donc été ajouté.

## 5. Actions nécessaires avant le code de connexion réel

- Obtenir l'accord DSers sur l'éligibilité de TAW.co comme Channel App personnalisée, ou leur confirmation écrite d'une autre voie supportée.
- Créer/faire approuver le compte développeur DSers et récupérer la documentation privée, les identifiants sandbox et les règles d'authentification.
- Confirmer les neuf produits et les variantes exactes depuis DSers Import List (photos, couleurs, tailles et SKU).
- Vérifier pour chaque variante le prix fournisseur, le stock et le coût/délai d'expédition vers la France.
- Ensuite seulement, implémenter les routes DSers correspondant exactement au contrat fourni, les tests automatisés et la synchronisation.

## 6. Garde-fous maintenus

- `TAWCO_CHECKOUT_ENABLED` ne doit pas être activé.
- Le mode maintenance reste en place.
- Aucun produit ni commande n'est poussé vers un fournisseur.
- Aucun changement n'est fusionné dans `main`.
- CJ reste dans l'historique technique mais est hors périmètre de la nouvelle intégration ; ne pas mélanger ses identifiants ou API avec DSers.
