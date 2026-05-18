const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const driverRoutes   = require('./routes/drivers');
const orderRoutes    = require('./routes/orders');
const adminRoutes    = require('./routes/admin');
const tarifRoutes    = require('./routes/tarifs');
const paymentRoutes  = require('./routes/payments');
const messageRoutes  = require('./routes/messages');
const Settings       = require('./models/Settings');
const { verifyToken } = require('./middleware/auth');
const socketHandler = require('./sockets/trackingSocket');

const app    = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.set('io', io);

app.use('/api/auth',    authRoutes);
app.use('/api/users',   verifyToken, userRoutes);
app.use('/api/drivers', verifyToken, driverRoutes);
app.use('/api/orders',  verifyToken, orderRoutes);
app.use('/api/admin',   verifyToken, adminRoutes);
app.use('/api/tarifs',   verifyToken, tarifRoutes);
app.use('/api/payments',  paymentRoutes);
app.use('/api/messages',  messageRoutes);
app.get('/api/health',   (_, res) => res.json({ status: 'ok' }));
app.get('/api/settings/public', async (_, res) => {
  try {
    const s = await Settings.get();
    const now = new Date();
    const active = s.referralEnabled
      && (!s.referralStartDate || now >= s.referralStartDate)
      && (!s.referralEndDate   || now <= s.referralEndDate);
    res.json({
      success: true,
      referralEnabled:     active,
      referralClientBonus: s.referralClientBonus,
      referralDriverBonus: s.referralDriverBonus,
      referralEndDate:     s.referralEndDate,
    });
  } catch (err) { res.json({ success: true, referralEnabled: true, referralClientBonus: 500, referralDriverBonus: 500 }); }
});

socketHandler(io);

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connecté');

    // Expirer les vieilles commandes diffuse (> 5 min) laissées par des sessions de test
    try {
      const Order = require('./models/Order');
      const FIVE_MIN_AGO = new Date(Date.now() - 5 * 60 * 1000);
      const expired = await Order.updateMany(
        { status: 'diffuse', createdAt: { $lt: FIVE_MIN_AGO } },
        { $set: { status: 'annule' } }
      );
      if (expired.modifiedCount > 0)
        console.log(`🧹 ${expired.modifiedCount} commande(s) diffuse expirée(s) → annulé`);
    } catch (e) { console.warn('Cleanup diffuse:', e.message); }

    // Tarif course : prise en charge 1000 MRU, commission 10%
    try {
      const Tarif = require('./models/Tarif');
      await Tarif.findOneAndUpdate(
        { serviceType: 'course' },
        { $set: { baseFee: 0, minimumFare: 100, platformCommission: 10, perKmFee: 30, perMinuteFee: 10, isActive: true } },
        { upsert: true }
      );
      console.log('✅ Tarif course : 100 MRU minimum, 30 MRU/km, 10% commission');
    } catch (e) { console.warn('Tarif course:', e.message); }

    // S'assure que l'index email est bien sparse (évite E11000 pour les clients sans email)
    try {
      const User = require('./models/User');
      const indexes = await User.collection.indexes();
      const emailIdx = indexes.find(i => i.key && i.key.email === 1);
      if (emailIdx && !emailIdx.sparse) {
        await User.collection.dropIndex(emailIdx.name);
        await User.syncIndexes();
        console.log('🔧 Index email recréé en mode sparse');
      }
    } catch (e) { /* index n'existait pas encore */ }

    server.listen(process.env.PORT || 5000, () =>
      console.log(`🚀 Serveur sur le port ${process.env.PORT || 5000}`)
    );
  })
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });
