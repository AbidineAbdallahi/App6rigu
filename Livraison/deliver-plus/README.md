# 🚀 Deliver+ — Application de livraison multi-services

Plateforme complète de livraison (nourriture, courses, colis, pharmacie)
composée de 3 projets :

```
deliver-plus/
├── backend/       → API Node.js + Express + Socket.io + MongoDB
├── web-admin/     → Panneau admin React JS (Vite)
└── mobile/        → Application React Native (Expo)
```

---

## ⚙️ PRÉREQUIS

| Outil         | Version minimale | Installation                     |
|---------------|-----------------|----------------------------------|
| Node.js       | 18+             | https://nodejs.org               |
| MongoDB       | 6+              | https://www.mongodb.com          |
| Expo CLI      | latest          | `npm install -g expo-cli`        |
| Git           | any             | https://git-scm.com              |

---

## 1️⃣  BACKEND (Node.js + Express)

### Installation

```bash
cd deliver-plus/backend

# Installer les dépendances
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env
```

### Configuration `.env`

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/deliver_plus
JWT_SECRET=deliver_plus_jwt_secret_changez_en_production
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

### Démarrage

```bash
# Seed : créer l'admin + tarifs par défaut + livreur test
npm run seed

# Développement (avec rechargement automatique)
npm run dev

# Production
npm start
```

### Comptes créés par le seed

| Rôle    | Email                  | Mot de passe |
|---------|------------------------|-------------|
| Admin   | admin@deliver.mr       | admin123    |
| Livreur | khalil@deliver.mr      | driver123   |

### Endpoints principaux

```
POST   /api/auth/register        → Inscription
POST   /api/auth/login           → Connexion
GET    /api/auth/me              → Profil connecté

GET    /api/orders               → Liste des commandes
POST   /api/orders               → Créer une commande
PATCH  /api/orders/:id/status    → Changer le statut
PATCH  /api/orders/:id/assign    → Assigner un livreur (admin)

GET    /api/drivers              → Liste des livreurs (admin)
GET    /api/drivers/active       → Livreurs actifs sur la carte
PATCH  /api/drivers/:id/location → Mettre à jour la position GPS

GET    /api/admin/dashboard      → Statistiques du tableau de bord
POST   /api/admin/drivers        → Créer un compte livreur
GET    /api/admin/stats/drivers  → Stats par livreur

GET    /api/tarifs               → Lire les tarifs
PATCH  /api/tarifs/:id           → Modifier un tarif (admin)
```

### Événements Socket.io

```
# Client → Serveur
join_admin              → Rejoindre la room admin
join_driver(driverId)   → Livreur s'identifie
track_order(orderId)    → Client suit une commande
update_location({driverId, lat, lng})  → Envoyer sa position GPS
update_driver_status({driverId, status}) → Changer son statut

# Serveur → Client
new_order               → Nouvelle commande créée
order_assigned(order)   → Commande assignée au livreur
order_status_update     → Statut d'une commande mis à jour
driver_location         → Position GPS du livreur
driver_status_update    → Statut du livreur mis à jour
```

---

## 2️⃣  WEB ADMIN (React JS + Vite)

### Installation

```bash
cd deliver-plus/web-admin

# Installer les dépendances
npm install

# Copier et configurer les variables d'environnement
cp .env.example .env
```

### Configuration `.env`

```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

### Démarrage

```bash
# Développement
npm run dev
# → Ouvre sur http://localhost:5173

# Build production
npm run build
npm run preview
```

### Pages disponibles

| Route                  | Description                          |
|------------------------|--------------------------------------|
| `/login`               | Connexion administrateur             |
| `/`                    | Vue générale (stats + commandes live)|
| `/drivers`             | Liste et gestion des livreurs        |
| `/drivers/create`      | Créer un compte livreur              |
| `/orders`              | Toutes les commandes avec filtres    |
| `/orders/:id/track`    | Suivi en temps réel sur carte        |
| `/tarifs`              | Configuration des frais              |
| `/stats`               | Statistiques et graphiques           |

---

## 3️⃣  MOBILE (React Native + Expo)

### Installation

```bash
cd deliver-plus/mobile

# Installer les dépendances
npm install

# ⚠️ Important : remplacez l'IP dans src/constants.js
# Remplacez 192.168.1.100 par l'IP de votre machine sur le réseau local
```

### Configuration `src/constants.js`

```js
// Trouvez votre IP avec : ipconfig (Windows) ou ifconfig (Mac/Linux)
export const API_URL    = 'http://VOTRE_IP:5000/api';
export const SOCKET_URL = 'http://VOTRE_IP:5000';
```

### Démarrage

```bash
# Installer Expo CLI si pas encore fait
npm install -g expo-cli

# Démarrer l'application
npm start
# ou
expo start

# Android
npm run android
# → Nécessite Android Studio + émulateur, OU l'app Expo Go sur votre téléphone

# iOS (Mac uniquement)
npm run ios
```

### Tester sur téléphone physique

1. Installer **Expo Go** depuis l'App Store ou Google Play
2. Scanner le QR code affiché dans le terminal
3. S'assurer que le téléphone et le PC sont sur le **même réseau Wi-Fi**

### Fonctionnalités par rôle

**Client :**
- Écran d'accueil avec les 4 services (nourriture, courses, colis, pharmacie)
- Suivi de commande en temps réel sur carte (avec trajet du livreur)
- Historique des commandes

**Livreur :**
- Toggle en ligne / hors ligne
- Réception des commandes assignées par l'admin
- Mise à jour du statut de livraison (préparation → en route → livré)
- Carte avec envoi de position GPS en temps réel
- Historique des gains et statistiques

---

## 🗂️ STRUCTURE COMPLÈTE DES FICHIERS

```
deliver-plus/
│
├── backend/
│   ├── src/
│   │   ├── server.js               → Point d'entrée
│   │   ├── seed.js                 → Données initiales
│   │   ├── models/
│   │   │   ├── User.js             → Modèle utilisateur
│   │   │   ├── Driver.js           → Modèle livreur
│   │   │   ├── Order.js            → Modèle commande
│   │   │   └── Tarif.js            → Modèle tarif
│   │   ├── routes/
│   │   │   ├── auth.js             → Authentification
│   │   │   ├── users.js            → Utilisateurs
│   │   │   ├── drivers.js          → Livreurs
│   │   │   ├── orders.js           → Commandes
│   │   │   ├── admin.js            → Dashboard admin
│   │   │   └── tarifs.js           → Tarifs
│   │   ├── middleware/
│   │   │   └── auth.js             → Vérification JWT
│   │   └── sockets/
│   │       └── trackingSocket.js   → Suivi temps réel
│   ├── package.json
│   └── .env.example
│
├── web-admin/
│   ├── src/
│   │   ├── main.jsx                → Point d'entrée
│   │   ├── App.jsx                 → Routeur principal
│   │   ├── index.css               → Styles globaux
│   │   ├── services/
│   │   │   └── api.js              → Client Axios
│   │   ├── stores/
│   │   │   └── authStore.js        → État auth (Zustand)
│   │   ├── components/
│   │   │   └── Layout.jsx          → Sidebar + structure
│   │   └── pages/
│   │       ├── LoginPage.jsx       → Connexion
│   │       ├── DashboardPage.jsx   → Vue générale
│   │       ├── DriversPage.jsx     → Liste livreurs
│   │       ├── CreateDriverPage.jsx→ Créer livreur
│   │       ├── OrdersPage.jsx      → Liste commandes
│   │       ├── TrackingPage.jsx    → Carte suivi live
│   │       ├── TarifsPage.jsx      → Gestion tarifs
│   │       └── StatsPage.jsx       → Statistiques
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
│
└── mobile/
    ├── App.js                      → Point d'entrée + navigation
    ├── app.json                    → Config Expo
    ├── package.json
    └── src/
        ├── constants.js            → ⚠️ Configurer l'IP ici
        ├── services/
        │   └── api.js              → Client Axios mobile
        ├── stores/
        │   └── authStore.js        → État auth + AsyncStorage
        ├── navigation/
        │   ├── ClientTabs.js       → Onglets client
        │   └── DriverTabs.js       → Onglets livreur
        └── screens/
            ├── auth/
            │   ├── LoginScreen.js  → Connexion
            │   └── RegisterScreen.js → Inscription
            ├── client/
            │   ├── HomeScreen.js   → Accueil services
            │   ├── OrdersScreen.js → Historique commandes
            │   ├── OrderTrackScreen.js → Suivi carte live
            │   └── ProfileScreen.js → Profil utilisateur
            └── driver/
                ├── DriverHomeScreen.js    → Tableau de bord livreur
                ├── DriverMapScreen.js     → Carte GPS live
                └── DriverEarningsScreen.js → Revenus & stats
```

---

## 🔧 COMMANDES RÉSUMÉ

```bash
# ── BACKEND ──────────────────────────────────
cd deliver-plus/backend
npm install
cp .env.example .env        # puis éditez .env
npm run seed                 # initialiser la BD
npm run dev                  # démarrer en dev

# ── WEB ADMIN ────────────────────────────────
cd deliver-plus/web-admin
npm install
cp .env.example .env        # puis éditez .env
npm run dev                  # ouvre sur localhost:5173

# ── MOBILE ───────────────────────────────────
cd deliver-plus/mobile
npm install
# éditez src/constants.js → mettez votre IP
expo start                   # scanner avec Expo Go
```

---

## 🌐 Technologies utilisées

| Couche      | Technologies                                      |
|-------------|--------------------------------------------------|
| Backend     | Node.js, Express, MongoDB, Mongoose, Socket.io, JWT |
| Web Admin   | React 18, Vite, React Router, Zustand, Leaflet, Recharts |
| Mobile      | React Native, Expo, React Navigation, Maps, Socket.io |
