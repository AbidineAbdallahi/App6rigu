const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes   = require('./routes/auth');
const userRoutes   = require('./routes/users');
const driverRoutes = require('./routes/drivers');
const orderRoutes  = require('./routes/orders');
const adminRoutes  = require('./routes/admin');
const tarifRoutes  = require('./routes/tarifs');
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
app.use('/api/tarifs',  verifyToken, tarifRoutes);
app.get('/api/health',  (_, res) => res.json({ status: 'ok' }));

socketHandler(io);

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connecté');

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
