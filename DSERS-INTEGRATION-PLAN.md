# TAW.co — préparation intégration DSers (AliExpress uniquement)

## Garde-fous
- Ne jamais désactiver le mode maintenance.
- Ne jamais activer `TAWCO_CHECKOUT_ENABLED`.
- Ne jamais envoyer de commande réelle à un fournisseur pendant les tests.
- Ne pas fusionner cette branche dans `main` avant validation et autorisation explicite.
- Le fournisseur cible est DSers/AliExpress uniquement. CJ Dropshipping est hors périmètre.

## État technique constaté
- Le checkout Stripe actuel utilise un catalogue codé en dur (IDs 101–115).
- Il exige une ligne active dans `supplier_variant_mappings` et vérifie actuellement `cj_variant_id`.
- Le schéma de correspondance fournisseur contient des champs CJ obligatoires (`cj_product_id`, `cj_variant_id`, `logistic_name`).
- Les tables de commandes contiennent plusieurs colonnes CJ.
- Le checkout répond 503 tant que `TAWCO_CHECKOUT_ENABLED` n'est pas explicitement défini à `true`.
- Le site est une application personnalisée Vercel. Le canal DSers actuellement affiché dans le compte est Wix/Chicall, pas TAW.co.

## Étape 3 — checkout et commandes
À implémenter après définition et validation du contrat DSers Channel App :
1. Remplacer le catalogue codé en dur par un catalogue TAW validé avec prix TTC en centimes.
2. Créer une table de correspondances fournisseur neutre (produit TAW, clé variante, SKU AliExpress, identifiant produit/variante fournisseur DSers, coût, devise, disponibilité, méthode et coût de livraison vers FR, date de vérification).
3. Valider côté serveur chaque variante, prix, stock et frais avant création Stripe Checkout.
4. Dans le webhook Stripe, enregistrer la commande payée et une file d'attente de fulfillment idempotente.
5. Ne jamais appeler DSers avant confirmation fiable du paiement Stripe.
6. En cas d'indisponibilité DSers, conserver la commande en attente et alerter l'administrateur; ne pas perdre la commande et ne pas facturer une seconde fois.

## Étape 4 — liaison DSers
La documentation DSers indique que les boutiques personnalisées nécessitent une Channel App : inscription développeur, configuration, API d'autorisation, développement, tests et approbation/publication DSers. Le propriétaire d'une boutique standard peut aussi demander une intégration à DSers Support ou utiliser CSV en attendant.
Aucun jeton, identifiant d'application, secret, endpoint de production ou approbation DSers n'est actuellement enregistré dans ce dépôt. Ne pas inventer ces valeurs et ne pas coder un faux endpoint.

## Étape 5 — synchronisation des commandes
Après approbation et obtention du contrat API DSers :
- Exposer les endpoints Channel App requis par la version de l'API DSers (authentification/statut boutique, liste/détail commandes, mise à jour des statuts).
- Respecter signatures, horodatage, idempotence, retries et limites indiqués par DSers.
- Faire apparaître uniquement les commandes payées et validées.
- Garder la mise en traitement fournisseur sous contrôle administrateur jusqu'à réussite des tests.

## Étape 6 — suivi colis
- Recevoir les événements/updates DSers de fulfillment et tracking.
- Enregistrer transporteur, numéro, URL et dates dans la commande TAW.
- Afficher le suivi dans l'espace client TAW et envoyer un e-mail de confirmation d'expédition.
- Ne pas présenter « expédié » comme « livré »; le statut livré exige une confirmation distincte.

## Tests obligatoires avant ouverture
- Paiement Stripe en mode test uniquement.
- Webhook rejoué plusieurs fois sans doublon.
- Variantes invalides/inactives, stock nul, prix modifié, frais de livraison absents.
- DSers indisponible, délais et retries.
- Commande multi-produits et variantes différentes.
- Retour du numéro de suivi, affichage espace client et e-mail.
- Vérification finale mobile/desktop.
- Vérification que maintenance et checkout bloqué restent actifs.

## Blocages externes à lever
1. DSers doit confirmer l'éligibilité et approuver TAW.co comme Channel App personnalisée, ou proposer une autre intégration officielle.
2. Obtenir la documentation/contrat d'API et les identifiants de test/production fournis par DSers.
3. Confirmer les SKU et variantes exacts des 9 produits depuis l'Import List.
4. Confirmer prix fournisseur, stock et frais/délais de livraison réels vers la France pour chaque variante.

**Cette branche est une préparation documentaire. Elle ne prétend pas qu'une connexion DSers existe déjà et ne modifie pas le site de production.**
