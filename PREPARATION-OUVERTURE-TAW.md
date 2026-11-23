# TAW.co — dossier de préparation avant ouverture

Dernière mise à jour : 23 novembre 2026

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
- Administration : commandes, chiffre d'affaires, remboursements, expéditions, correspondances CJ, promotions, retours et modération des avis.
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
- Le 23 novembre 2026, le déploiement de production Vercel `2098671934e83ff74e1253220bb73ab206d8b7c3` est READY et les alias `taw.co`, `www.taw.co` et `tawco.vercel.app` lui sont rattachés. La limite Hobby de 12 fonctions a été corrigée en regroupant les API admin ; le déploiement de production a abouti.
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
- Le dernier déploiement de production est désormais READY sur le commit `2098671934e83ff74e1253220bb73ab206d8b7c3`.

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


## Journal de reprise — 23 novembre 2026

### Travaux effectués et vérifiés
- Correction de l'échec Vercel : le déploiement précédent dépassait la limite Hobby de 12 fonctions serverless.
- Regroupement des routes d'administration des avis, retours et promotions dans `api/admin-orders.js`, avec réécritures `vercel.json` qui conservent les URL déjà utilisées par l'interface.
- Retrait de l'export DSers, qui ne correspond plus au flux fournisseur CJ retenu. Les champs de téléphone Stripe et leur enregistrement Supabase sont déjà présents sur `main` ; ne pas refaire cette modification.
- PR GitHub #19 fusionnée. Déploiement de production Vercel READY sur le commit `2098671934e83ff74e1253220bb73ab206d8b7c3`.
- L'écran de maintenance est présent dans `index.html` et `public/index.html`. Le bouton de paiement est désactivé et la variable `TAWCO_CHECKOUT_ENABLED` n'est pas définie en production : le serveur refuse donc les paiements.
- Variables de production présentes : Supabase URL/clé serveur, Stripe secret/webhook, CJ API key, Resend API key et expéditeur `ORDER_FROM_EMAIL`. La vérification effective du domaine Resend et l'envoi réel d'un e-mail restent à confirmer.
- Supabase Security Advisor ne remonte aucun finding de sécurité au contrôle du 23 novembre. Les alertes de performance portent uniquement sur des index non encore utilisés.
- État des données Supabase : 0 commande, 0 correspondance CJ, 0 devis de livraison enregistrés. C'est cohérent avec le paiement fermé ; aucune commande de test ni fausse correspondance n'a été créée.
- Le schéma `orders` comprend déjà `customer_phone`, les champs de suivi, remboursement et état de transmission CJ. Les tables client, avis, retours, promotions et devis fournisseur sont présentes.

### À reprendre sans refaire les travaux déjà validés
1. Compléter les correspondances réelles des 15 produits TAW (produit CJ, variantes, tailles/couleurs, SKU, coût, entrepôt et transporteur). La table étant vide, aucune variante ne peut encore être vendue.
2. Utiliser les devis CJ vers la France pour chaque variante et enregistrer frais, méthode et délais ; calculer ensuite le coût de revient et les marges.
3. Finaliser les réglages Supabase Auth (confirmation d'e-mail, URL de redirection et récupération de mot de passe) seulement après lecture de la configuration actuelle.
4. Vérifier le domaine d'envoi Resend et faire un test contrôlé d'e-mail, sans envoyer de message à un client réel.
5. Terminer les réductions promotionnelles côté serveur/Stripe avec contrôle atomique des limites et dates.
6. Vérifier les remboursements Stripe test et les e-mails transactionnels ; ne pas confondre statut de retour et remboursement financier.
7. Compléter les mentions légales, CGV, confidentialité/cookies, livraison et rétractation avec les véritables informations du vendeur. Ne pas inventer de SIREN/SIRET, adresse, TVA ou médiateur.
8. Préparer les factures PDF après validation des informations légales et fiscales.
9. Faire une seule recette finale ciblée des fonctions qui auront été modifiées ; ne pas répéter les tests déjà confirmés.
10. Garder maintenance et paiements désactivés jusqu'à autorisation explicite d'ouverture.

**Consigne de reprise :** ne pas refaire la vérification du schéma, des tables, de la présence des variables Vercel ni du déploiement READY sans raison. Priorité immédiate : associer les vrais produits/variantes CJ et obtenir les devis France. Ne jamais activer les paiements ou envoyer une commande CJ réelle sans validation explicite.


## Complément de reprise — outils CJ du 23 novembre 2026
- La page `admin-cj.html` dispose maintenant d'une recherche du catalogue CJ par nom et entrepôt, du chargement des variantes et stocks, et d'un calcul de devis de livraison vers la France avec code postal facultatif.
- Les devis sont enregistrés dans `supplier_quote_checks` en USD. La conversion en EUR, le coût de revient et les marges restent à finaliser.
- Aucune correspondance ni aucun devis n'a été créé automatiquement : les tables sont encore vides. Il faut choisir les références CJ réellement conformes aux produits TAW, tailles et couleurs. Ne jamais inventer ces correspondances.
