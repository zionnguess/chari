# Un Cartable, Un Avenir — PayTech

Projet Node.js + Express pour la campagne de solidarité **Charité Pour Tous — Un Cartable, Un Avenir**.

## Fonctionnalités

- Site responsive mobile/desktop.
- Modale de don avec montants rapides.
- Création de paiement PayTech côté serveur.
- Redirection vers le checkout PayTech.
- IPN PayTech sécurisé par HMAC-SHA256, avec fallback SHA256.
- Enregistrement local des dons dans `data/donations.json`.
- Endpoint de vérification de statut PayTech.
- Pages succès / annulation / 404.
- Rate limiting sur les endpoints de paiement.
- Helmet et secrets dans `.env`.

## Installation

```bash
npm install
```

Copier `.env.example` vers `.env`, puis renseigner :

```env
PAYTECH_API_KEY=
PAYTECH_API_SECRET=
PAYTECH_ENV=test
BASE_URL=http://localhost:3007
PORT=3007
```

Lancer :

```bash
npm start
```

Puis ouvrir `http://localhost:3007`.

## Docker

```bash
npm install
docker build -t chari .
docker run --env-file .env -p 3007:3007 chari
```

Puis ouvrir `http://localhost:3007`. Le port à droite de `-p` doit correspondre à `PORT` dans `.env` ; avec votre configuration actuelle (`PORT=3000`), utilisez `docker run --env-file .env -p 3007:3000 chari`. En production, définir `BASE_URL` sur le domaine public HTTPS et fournir les identifiants PayTech via l'environnement de l'hébergeur. Le fichier `.env` n'est pas intégré à l'image.

## Passage en production

1. Faire valider/activer le compte PayTech pour la production.
2. Mettre `PAYTECH_ENV=prod`.
3. Mettre `BASE_URL` sur le domaine public HTTPS réel (jamais `localhost`).
4. Vérifier que `BASE_URL/api/paytech/ipn` est publiquement accessible en HTTPS.
5. Ne jamais publier `.env` ou les clés API.

## Important

En mode `test`, PayTech indique que le montant réellement débité est un montant de test compris entre 100 et 150 FCFA. Le mode production doit être activé par PayTech avant les vrais paiements.

## Architecture

- `server.js` : serveur Express + API PayTech + IPN.
- `public/index.html` : site et formulaire.
- `public/styles.css` : design.
- `public/script.js` : interface et appel backend.
- `data/donations.json` : stockage local de démonstration.

Le fichier `data/donations.json` est local au conteneur : configurer un volume persistant chez l'hébergeur pour conserver les dons après remplacement du conteneur. Pour un vrai volume de dons, remplacer le JSON par PostgreSQL/MySQL et conserver la validation IPN côté serveur.
