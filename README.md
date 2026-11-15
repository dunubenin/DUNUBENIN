# DUNU BENIN — lot de finalisation des modules

Cette version conserve l'architecture et les modules existants. Elle ajoute le paramétrage des commissions, les notifications persistantes, la remontée GPS du livreur pendant une livraison active et les premiers écrans de communication.

## Paramètres financiers nationaux

Dans l'espace **Administration nationale**, le bloc « Paramétrage national des commissions » permet de régler :
- la commission plateforme (0 à 50 %) ;
- les frais de livraison fixes (0 à 100 000 FCFA) ;
- le solde minimum restaurant requis pour accepter le paiement à la livraison.

Seul le rôle `admin` peut enregistrer ces paramètres. Le rôle `finance` peut les consulter. Les valeurs sont enregistrées dans MongoDB et utilisées côté serveur pour les nouvelles commandes. Les commandes existantes gardent leur taux et leurs montants d'origine.

Au premier démarrage, les valeurs par défaut proviennent de `DEFAULT_COMMISSION_RATE`, `DEFAULT_DELIVERY_FEE` et `COD_MINIMUM_BALANCE`. Après la première création de la configuration globale, utilisez l'écran d'administration pour les changements ultérieurs.

## Notifications

API protégée par authentification :
- `GET /api/notifications` : 100 dernières notifications de l'utilisateur connecté ;
- `GET /api/notifications/unread-count` : nombre de notifications non lues ;
- `PATCH /api/notifications/:id/read` : marquer une notification comme lue ;
- `PATCH /api/notifications/read-all` : tout marquer comme lu.

Les notifications sont créées lors de la création d'une commande, d'un changement de statut et de l'attribution d'une livraison. Elles sont également diffusées en temps réel via Socket.IO lorsque l'utilisateur est connecté.

## Suivi GPS

Le navigateur du livreur demande l'autorisation de géolocalisation uniquement lorsqu'il est connecté à son espace et qu'une commande est `picked_up` ou `on_the_way`. Les coordonnées sont transmises via Socket.IO, enregistrées dans le profil du livreur, puis diffusées aux membres autorisés de la salle de commande.

- `GET /api/orders/track/:code/location` retourne la dernière position au client, au livreur assigné ou à l'administrateur national.
- La page « Suivre ma commande » affiche les coordonnées et l'heure de la dernière mise à jour.
- Le navigateur doit autoriser la géolocalisation et le site doit être servi en HTTPS (Render fournit HTTPS).

Il s'agit d'une position GPS textuelle en direct, pas encore d'une carte interactive avec itinéraire/ETA. Le livreur peut désactiver l'autorisation de localisation dans son navigateur.

## Communication

La messagerie texte permet l'envoi et la lecture d'une conversation entre personnes liées à une même commande. Les accès sont vérifiés côté serveur. Les appels audio/vidéo et la signalisation WebRTC déjà présents dans le serveur ne constituent pas encore une expérience d'appel complète : il reste à intégrer la gestion des médias, des permissions micro/caméra, du cycle de vie des appels et un service STUN/TURN adapté à la production.

## Tests exécutés dans ce lot

- `node --check` sur les fichiers JavaScript du serveur : réussi.
- `node --test server/test/roles.test.js` : 7 tests réussis, couvrant la reconnaissance des six rôles et le refus d'un utilisateur absent.
- Analyse syntaxique JSX de `client/src/App.jsx` avec TypeScript : réussie.

La compilation Vite complète et les tests d'intégration avec MongoDB, Socket.IO, les navigateurs, les comptes réels et les six espaces n'ont pas été exécutés dans cet environnement. Ils doivent être réalisés sur un environnement de test avant déploiement en production.

## Parcours de recette manuelle des six espaces

1. **Client** : créer un compte, consulter un restaurant, ajouter un plat au panier, passer une commande, recevoir la notification et suivre le statut/la position.
2. **Restaurant** : soumettre la boutique, attendre l'approbation, créer/activer un plat, recevoir une commande et faire évoluer son statut.
3. **Livreur** : passer en ligne, recevoir une livraison attribuée, faire passer la commande à « récupérée » puis « en route », autoriser le GPS et confirmer la livraison avec le code client.
4. **Master de ville** : vérifier que les statistiques, commandes et comptes visibles restent limités à sa ville ; vérifier qu'il ne peut pas modifier les paramètres financiers nationaux.
5. **Administration nationale** : valider les restaurants/comptes, gérer les responsables, modifier les trois paramètres financiers et vérifier qu'un nouveau test de commande applique les nouvelles valeurs.
6. **Finance** : consulter le journal financier, les demandes d'abonnement et les paramètres financiers ; vérifier qu'une tentative de modification des commissions est refusée.

## Déploiement prudent

1. Déployer d'abord sur un service Render de préproduction avec une base MongoDB de test.
2. Exécuter `npm install`, `npm test --workspace server` et `npm run build`.
3. Réaliser les six parcours ci-dessus avec des comptes de test.
4. Vérifier les journaux Render, les notifications et les écritures comptables.
5. Ne déployer en production qu'après validation.

**pawaPay : aucune modification volontaire de l'intégration, des identifiants ou des paramètres pawaPay n'a été apportée dans ce lot.** Ne pas copier de secrets dans le code ni dans le dépôt Git.


## GPS sur téléphone, appels audio/vidéo et itinéraire (lot 3)

### GPS livreur
- Le site doit être servi en HTTPS (Render le fait normalement sur le domaine public).
- Le livreur doit autoriser la localisation précise dans le navigateur du téléphone.
- La position est envoyée uniquement lorsqu'une commande attribuée au livreur est `picked_up` ou `on_the_way`.
- Le partage s'arrête quand le composant est quitté ou qu'il n'y a plus de livraison active. Les navigateurs mobiles peuvent suspendre le GPS lorsque l'écran est verrouillé ou que l'application passe en arrière-plan : une application mobile native reste préférable pour un suivi permanent.

### Position du client et itinéraire
- À la commande, le client peut utiliser le bouton « Utiliser ma position GPS » pour enregistrer les coordonnées de livraison.
- Pendant le suivi, la carte de directions s'affiche lorsque les coordonnées du client et du livreur sont disponibles.
- L'itinéraire est ouvert via Google Maps et l'estimation de durée est calculée via le service public OSRM. Cette estimation est indicative et ne tient pas compte de la circulation en temps réel. Les coordonnées sont transmises à ces fournisseurs cartographiques pour afficher l'itinéraire et calculer la durée.
- Sans coordonnées GPS du client, l'adresse textuelle seule ne permet pas de tracer un itinéraire précis dans cette version.

### Appels audio et vidéo
- Les appels nécessitent HTTPS, une autorisation micro/caméra et un navigateur récent compatible WebRTC.
- STUN public est activé par défaut. Pour améliorer la connexion sur les réseaux mobiles et les NAT restrictifs, déployer un serveur TURN (par exemple coturn avec TURN REST API).
- Ajouter dans les variables d'environnement Render :
  - `TURN_URLS` : URLs séparées par des virgules, par exemple `turn:turn.votre-domaine.com:3478,turns:turn.votre-domaine.com:5349`.
  - `TURN_SHARED_SECRET` : secret REST partagé avec coturn. Utiliser un secret long et aléatoire, identique côté serveur coturn et DUNU.
- Le serveur génère des identifiants TURN temporaires d'une heure par utilisateur. Ne jamais utiliser un mot de passe TURN permanent dans le navigateur.
- Sans serveur TURN, les appels peuvent fonctionner entre certains réseaux, mais pas tous.

### Tests physiques à réaliser avant production
1. Tester le GPS avec un vrai téléphone Android et un iPhone, dehors puis à l'intérieur.
2. Vérifier les autorisations de localisation, le refus, la perte du signal et la reprise du suivi.
3. Tester deux comptes autorisés sur deux réseaux différents (Wi-Fi et données mobiles).
4. Tester audio seul, vidéo, micro coupé, caméra coupée, refus d'appel et fin d'appel.
5. Vérifier les appels avec TURN actif, puis temporairement avec TURN désactivé pour comparer.
6. Tester la carte avec et sans coordonnées client et vérifier le temps estimé.
7. Effectuer ces essais sur un environnement de préproduction avant tout déploiement.

**Limite connue :** ce lot ajoute l'interface WebRTC et la signalisation ainsi que le partage GPS navigateur. Il ne remplace pas des tests sur appareils physiques, la mise en place d'un serveur TURN, ni une application mobile native pour le suivi GPS en arrière-plan.


## Intégration FeexPay (lot en préparation)

- Le formulaire client propose MTN Bénin, Moov Bénin et Celtiis Bénin.
- L'API serveur utilise `FEEXPAY_API_KEY` et `FEEXPAY_SHOP_ID`; les secrets ne sont jamais envoyés au navigateur.
- Le webhook public est `POST https://dunubenin.com/webhooks/feexpay`. Il doit être configuré dans FeexPay avec la signature HMAC activée.
- `FEEXPAY_WEBHOOK_SECRET` sert à vérifier la signature sur le corps brut, avec une tolérance de 5 minutes. Les identifiants de livraison et les références métier sont dédupliqués.
- Une commande Mobile Money n'est confirmée qu'après un statut final `SUCCESSFUL` et vérification du montant. `PENDING` ne vaut jamais paiement.
- La route client de vérification est `GET /api/payments/feexpay/:reference/status`.
- B-MO, Coris et la carte bancaire ne sont pas activés dans ce lot. Le paiement à la livraison et les règles interurbaines existantes sont conservés.

**Important :** cette modification n'a pas été déployée sur Render et aucun paiement réel n'a été effectué. Tester d'abord en environnement de préproduction avec les identifiants FeexPay du marchand.

## DUNU V3 — refonte de l'interface

La version V3 introduit une identité bordeaux/noir/or/ivoire, une page d'accueil réorganisée, une navigation mobile dédiée et des ajustements responsive pour téléphones, tablettes et ordinateurs. Voir `V3_INTERFACE_REDESIGN.md` pour le détail des changements, les fonctionnalités existantes et les chantiers encore à réaliser.

Le paiement configuré dans cette version est FeexPay (`FEEXPAY_API_KEY`, `FEEXPAY_SHOP_ID`, `FEEXPAY_WEBHOOK_SECRET`). Les anciennes variables pawaPay ne sont plus déclarées dans `render.yaml`.

## DUNU V5
Voir `V5_LIVRAISON.md` pour les changements du catalogue centralisé des plats, de la découverte par proximité, de l'administration compacte et de la PWA.


## DUNU V6 — navigation et expérience mobile
Voir `V6_LIVRAISON.md` pour le détail des changements, contrôles et limites de cette livraison.
**Source de vérité paiement :** le code actif de l'archive utilise FeexPay (`server/src/routes/payments.js`, `server/src/services/feexpay.js`). Les mentions pawaPay dans les notes historiques décrivent des lots antérieurs et ne doivent pas être interprétées comme une instruction de supprimer ou remplacer les paramètres de production sans vérification.

## Version V22 — Référentiel national des communes

- Préchargement idempotent des 77 communes du Bénin dans la collection `City`, avec leur département.
- Les communes ajoutées automatiquement sont disponibles à l'inscription ; seules les cinq communes initiales (Porto-Novo, Cotonou, Abomey-Calavi, Bohicon et Akpro-Missérété) sont activées par défaut pour le catalogue. Les 72 autres restent inactives pour le catalogue/livraison.
- Nouveau endpoint public `GET /api/catalog/registration-cities` pour alimenter les formulaires d'inscription.
- L'inscription et la création de fiche restaurant proposent les communes nationales.
- L'administration peut choisir le rôle public et la commune d'affectation lors de la validation d'un compte ; la validation d'un restaurant permet aussi de confirmer sa commune.
- Le catalogue opérationnel continue d'utiliser `GET /api/catalog/cities` et conserve son filtre sur les villes actives et les restaurants approuvés.

Le référentiel est basé sur la liste des communes publiée par le Ministère de la Décentralisation et de la Gouvernance Locale et les informations administratives de l'IGN-Bénin.
