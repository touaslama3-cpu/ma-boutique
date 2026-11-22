# Activation du commerce TAW.co

Le dépôt contient les fonctions de paiement Stripe, d'enregistrement des commandes, de suivi et d'intégration CJ. Garder le paiement désactivé tant que les références fournisseurs et les frais France ne sont pas vérifiés.

## 1. Base Supabase
Exécuter `supabase/schema.sql` sur un nouveau projet, ou appliquer la migration `supabase/migrations/20261122090000_cj_supplier_workflow.sql` sur le projet existant.
La table `supplier_variant_mappings` relie chaque référence TAW et sa variante à un produit/variant CJ.

## 2. Variables Vercel (Production et Preview)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement, jamais dans le navigateur)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `TAWCO_ADMIN_TOKEN`
- `SITE_URL`
- `CJ_API_KEY`
- `RESEND_API_KEY` et `ORDER_FROM_EMAIL` (facultatifs)

Ne jamais activer `TAWCO_CHECKOUT_ENABLED=true` avant que les produits vendus soient reliés à des variantes CJ réelles et que chaque prix, coût et mode d'expédition soit validé.

## 3. Stripe
Créer un endpoint webhook Stripe vers `https://www.taw.co/api/stripe-webhook` et sélectionner :
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`

Copier le secret de signature dans `STRIPE_WEBHOOK_SECRET`.

## 4. Administration CJ
Toutes les routes `/api/admin-cj-*` exigent `Authorization: Bearer TAWCO_ADMIN_TOKEN`.
- `GET /api/admin-cj-mappings` : lister les liaisons TAW ↔ CJ.
- `POST /api/admin-cj-mappings` : créer/mettre à jour une liaison de variante.
- `PATCH /api/admin-cj-mappings` : activer/désactiver une liaison.
- `GET /api/admin-cj-orders` : commandes et état CJ.
- `POST /api/admin-cj-orders` avec `{ "order_id": "...", "confirm": true }` : créer une commande CJ non payée après vérification humaine.

La création CJ utilise `payType=3` : elle n'effectue aucun paiement sur le solde CJ. Il faut vérifier le coût final, confirmer et payer dans CJ. Si la requête expire, vérifier CJ avec la référence `TAW-<id commande>` avant de réessayer.

## 5. Tests
- `GET /api/cj-product?pid=<CJ_PRODUCT_ID>` : détail et variantes.
- `POST /api/cj-freight` : `{ "origin":"CN", "zip":"75001", "products":[{"vid":"<CJ_VARIANT_ID>","quantity":1}] }`.
- `GET /api/cj-track?number=<TRACKING_NUMBER>` : suivi.

## Important
- Les commandes sont enregistrées uniquement après confirmation du paiement par webhook Stripe signé.
- Aucune commande fournisseur n'est envoyée à CJ tant que les correspondances de variantes ne sont pas configurées et vérifiées.
- Les commandes CJ sont créées sans payer automatiquement le fournisseur. Contrôler les frais et payer dans CJ.
- Les produits de démonstration et les visuels ne constituent pas des références fournisseur confirmées.
- Les remboursements initiés dans Stripe sont signalés par webhook; effectuer le remboursement dans Stripe, pas depuis ces endpoints.
- Garder le paiement du site désactivé jusqu'à la validation complète du parcours.
