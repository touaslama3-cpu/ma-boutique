# TAW.co — dossier de préparation avant ouverture

Dernière mise à jour : 22 novembre 2026

## Règle impérative
- La page publique reste en mode maintenance.
- Ne pas activer `TAWCO_CHECKOUT_ENABLED` et ne pas publier l'ouverture tant que les tests ci-dessous ne sont pas terminés.
- Aucun paiement réel, aucune commande fournisseur réelle et aucun faux avis/facture ne doivent être déclenchés pendant les tests.

## Éléments déjà enregistrés
- Boutique et dépôt GitHub : `touaslama3-cpu/ma-boutique`.
- Hébergement Vercel : projet `tawco`, domaine `tawco.vercel.app`.
- Supabase : projet `hqoamjohnqwzcugvfrbw`.
- Espace client : création de compte, connexion, récupération/changement de mot de passe, profil, adresses multiples, adresse principale, historique des commandes et suivi.
- Favoris : ajout depuis les fiches catalogue et gestion dans le compte client.
- Avis : formulaire réservé aux commandes payées et livrées, avis en attente de modération et interface d'administration pour publier/refuser.
- Retours : demande depuis une commande expédiée/livrée, historique client et interface d'administration de suivi. Le statut « remboursé » du retour ne déclenche pas un remboursement Stripe.
- Promotions : table sécurisée et interface admin de création/désactivation. L'application effective du code dans Stripe Checkout reste à faire avant ouverture.
- Factures : table prête, mais génération PDF volontairement en attente des mentions légales et fiscales du vendeur.
- Administration : commandes, chiffre d'affaires, remboursements, expéditions, export CSV DSers, correspondances CJ, promotions, retours et modération des avis.
- Les pages sont synchronisées dans les chemins de compte et dans le dossier public utilisé par le site.

## Sécurité et données
- Tables de profils, adresses, commandes, favoris, avis, retours, factures, promotions et correspondances fournisseurs avec RLS.
- Les correspondances fournisseurs et codes promotionnels sont réservés au serveur.
- Les avis publics ne deviennent visibles qu'après modération.
- Les avis clients sont vérifiés contre une commande payée et livrée.
- Les demandes de retour sont limitées aux commandes personnelles payées et expédiées/livrées.
- Vérifier à chaque changement les alertes Supabase Security Advisor.

## À terminer avant ouverture
1. Vérifier la configuration Supabase Auth : URL du site, URL de redirection `/compte/`, confirmation d'e-mail, récupération de mot de passe et modèles d'e-mails.
2. Corriger et tester le parcours Stripe : liaison du compte client, adresse e-mail, session, webhook, commandes et remboursements.
3. Compléter le sélecteur de variantes TAW et enregistrer les 15 correspondances CJ réelles (produit, variante, SKU, coût, pays d'origine, transporteur).
4. Vérifier les tarifs d'expédition vers la France pour chaque variante et le calcul des prix/marges.
5. Terminer l'application des codes promotionnels au panier et au montant Stripe, avec limite d'utilisation atomique.
6. Ajouter les coordonnées légales du vendeur, SIREN/SIRET, adresse, TVA applicable, contact et médiateur avant génération de factures et ouverture commerciale.
7. Finaliser les pages CGV, mentions légales, confidentialité/cookies, livraison, retours/rétractation et remboursements avec les informations réelles.
8. Tester les retours et remboursements dans Stripe test, puis les cas de commande partielle/complète et les notifications e-mail.
9. Tester sur mobile et ordinateur : création de compte, connexion, favoris, adresse, panier, commandes, suivi, avis, retours et administration.
10. Faire une répétition complète en environnement Stripe test et CJ sans soumettre de commande fournisseur réelle.
11. Vérifier les variables Vercel : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `TAWCO_ADMIN_TOKEN`, `RESEND_API_KEY`, `ORDER_FROM_EMAIL`, `CJ_API_KEY`. Garder le paiement désactivé.
12. Faire une sauvegarde Supabase, vérifier le domaine et le HTTPS, puis seulement après validation programmer l'ouverture.

## Éléments non activés volontairement
- Paiement et ventes réelles : restent fermés.
- Envoi automatique de commandes CJ : ne pas activer sans validation des variantes, coûts, stocks et livraison.
- Codes promo au checkout : interface d'administration prête, logique de réduction Stripe à terminer.
- Factures PDF : pas de génération avant validation des informations légales et fiscales du vendeur.
- Les commits GitHub déclenchent potentiellement des déploiements automatiques Vercel. Le dernier déploiement de production observé est READY sur le commit `3db9859045fef0dec94fbb1233cd1c0a7d9fcb35`, antérieur aux derniers ajouts favoris/avis/retours/promotions. Vérifier un nouveau déploiement avant de considérer ces derniers changements comme publiés.
- La page publique et la page publiée dans `public/` conservent le verrou de maintenance.
