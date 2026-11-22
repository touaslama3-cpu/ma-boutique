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


## Journal de reprise — 22 novembre 2026 (suite)

### Travail effectué
- Ajout des champs de coût produit, frais de transport, méthode de livraison et délais estimés aux correspondances fournisseurs CJ.
- Création de la table `supplier_quote_checks` pour conserver l'historique des devis CJ vers la France.
- Migration `20261122113000_prepare_cj_france_shipping_quote_tracking.sql` exécutée sur Supabase et enregistrée dans le dépôt.
- Schéma de référence `supabase/schema.sql` mis à jour.
- Contrôle effectué : aucune correspondance CJ vérifiée et active n'était enregistrée pour les 15 produits au moment du contrôle. Ne pas inventer les références, variantes ou frais.
- Les codes promotionnels sont administrables, mais leur application au montant Stripe reste à développer et tester.
- Les premières interfaces/API de retours et de modération des avis sont présentes ; le statut « remboursé » ne déclenche pas un remboursement Stripe.
- Les factures PDF attendent les véritables coordonnées légales et fiscales.
- Le dernier déploiement de production observé était antérieur à plusieurs changements du dépôt ; vérifier le prochain déploiement.

### Suite à réaliser
1. Associer les 15 produits du catalogue à leurs vrais produits, variantes, SKU et identifiants CJ.
2. Obtenir et enregistrer les coûts et devis de livraison CJ vers la France pour chaque variante, puis calculer prix de revient et marges.
3. Terminer le lien sécurisé entre comptes clients, Stripe Checkout, webhooks et commandes.
4. Appliquer les codes promotionnels côté serveur à Stripe avec contrôle fiable des limites et dates.
5. Finaliser les e-mails transactionnels et les redirections/récupération de mot de passe Supabase Auth.
6. Finaliser et tester les retours et remboursements dans Stripe test.
7. Générer les factures PDF après validation des informations légales et fiscales.
8. Effectuer les tests complets mobile/ordinateur, sans commande fournisseur réelle.
9. Vérifier les variables d'environnement et le déploiement Vercel.
10. Garder la maintenance activée et les paiements désactivés jusqu'à validation explicite.

### Informations qui pourront être nécessaires
- Références et variantes CJ exactes si l'API ne permet pas de les retrouver.
- Coordonnées légales/fiscales du vendeur, régime de TVA et informations de facturation.
- Configuration définitive de l'adresse e-mail d'envoi.
- Accord explicite avant l'ouverture commerciale.

**Consigne de reprise :** à la prochaine reprise de TAW.co, consulter ce journal et vérifier l'état réel de GitHub, Supabase et Vercel. Ne pas redemander les décisions déjà enregistrées. Ne jamais désactiver la maintenance ni activer les paiements sans demande explicite.
