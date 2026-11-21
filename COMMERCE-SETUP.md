# Activation du commerce TAW.co

Le code est préparé sur la branche `tawco-supabase-orders`. Il n'est pas déployé en production.

## 1. Base Supabase
1. Créer un projet Supabase.
2. Dans SQL Editor, exécuter `supabase/schema.sql`.
3. Dans Project Settings > API, récupérer Project URL et la clé **service_role** (ne jamais la mettre dans le navigateur ni dans GitHub).

## 2. Variables Vercel (Production et Preview)
- `SUPABASE_URL` : URL du projet Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` : clé service_role Supabase.
- `STRIPE_SECRET_KEY` : clé secrète Stripe du même mode que le webhook (test pour les essais).
- `STRIPE_WEBHOOK_SECRET` : secret du webhook Stripe.
- `TAWCO_ADMIN_TOKEN` : jeton aléatoire long, réservé à l'administration.
- `SITE_URL` : URL canonique du site (ex. https://www.taw.co).
- `RESEND_API_KEY` et `ORDER_FROM_EMAIL` : facultatifs, pour les e-mails de suivi.

## 3. Stripe
Créer un endpoint webhook Stripe vers `https://www.taw.co/api/stripe-webhook` et sélectionner :
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`

Copier le secret de signature dans `STRIPE_WEBHOOK_SECRET`.

## 4. Administration
L'endpoint `GET/PATCH /api/admin-orders` est protégé par `Authorization: Bearer TAWCO_ADMIN_TOKEN`.
GET liste les 200 dernières commandes. PATCH met à jour le statut et les informations de suivi; si Resend est configuré, un e-mail de mise à jour est envoyé.

## Important
- Les commandes sont enregistrées uniquement après confirmation du paiement par webhook signé.
- Les remboursements initiés dans Stripe sont signalés par webhook; effectuer le remboursement dans le tableau de bord Stripe, pas depuis cet endpoint.
- Les commandes fournisseurs, stocks, délais et retours doivent être validés avant la vente. Aucun achat fournisseur automatique n'est déclenché.
- Garder le site en mode test jusqu'à validation complète du parcours.
